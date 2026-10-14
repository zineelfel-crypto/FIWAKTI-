/* FIWAKTI — ingestion des événements de pointage (v50, lot P0-A).
   Pipeline : connecteur → file persistante (ingestion_queue) → niveau 1 événement brut immuable
   (raw_events) → niveau 2 événement normalisé et idempotent (normalized_events) → projection de
   compatibilité (badgeages lus par le moteur de calcul actuel, inchangé).
   Principes appliqués : aucun événement perdu en silence (toute réception est écrite, doublons
   compris) ; l'événement brut n'est jamais modifié ; aucun calcul ne réécrit un badgeage existant ;
   heure technique en UTC, heure métier dans le fuseau du site ; date de travail déterminée par le planning. */
"use strict";
const crypto = require("crypto"), path = require("path");

/* ---------- fuseaux horaires ---------- */
const FUSEAU_DEFAUT = "Africa/Tunis";
const FMT = new Map();
function partiesDans(tz, ms){
  let f = FMT.get(tz);
  if (!f){ f = new Intl.DateTimeFormat("en-GB", {timeZone:tz, hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"}); FMT.set(tz, f); }
  const o = {}; f.formatToParts(new Date(ms)).forEach(p=>{ o[p.type] = p.value; });
  return Date.UTC(+o.year, +o.month-1, +o.day, +o.hour % 24, +o.minute, +o.second);
}
/* heure locale « AAAA-MM-JJ HH:MM:SS » dans le fuseau tz → instant UTC (ISO).
   Heure inexistante (passage à l'heure d'été) : décalée vers l'avant ; heure ambiguë : première occurrence. */
/* 56.33.11 : décalage mémorisé par fuseau et par minute locale (les changements d'heure tombent sur une minute
   ronde) : 2 à 4 formatages Intl par badgeage auparavant, soit ~10 % du temps d'ingestion */
const DECALAGES = new Map();
function localVersUtc(local, tz){
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(local));
  if (!m) return null;
  const cle = tz+"|"+m[1]+m[2]+m[3]+m[4]+m[5];
  let dec = DECALAGES.get(cle);
  if (dec === undefined){
    const minute = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], 0);
    dec = new Date(localVersUtcCalcule(m, tz, 0)).getTime() - minute;
    if (DECALAGES.size > 200000) DECALAGES.clear();
    DECALAGES.set(cle, dec);
  }
  return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0)) + dec).toISOString();
}
function localVersUtcCalcule(m, tz, sec){
  const naif = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], sec);
  /* décalages en vigueur 12 h avant et 12 h après : couvrent tout changement d'heure */
  const offAvant = partiesDans(tz, naif - 43200000) - (naif - 43200000), offApres = partiesDans(tz, naif + 43200000) - (naif + 43200000);
  const ok = [offAvant, offApres].map(o=>naif - o).filter(t=>partiesDans(tz, t) === naif).sort((x, y)=>x - y);
  /* heure ambiguë (retour à l'heure d'hiver) : première occurrence ; heure inexistante (passage à l'heure d'été) :
     décalage d'avant le changement, ce qui la reporte après le saut (02:30 → 03:30) */
  const t = ok.length ? ok[0] : naif - offAvant;
  return new Date(t).toISOString();
}
function utcVersLocal(iso, tz){
  const ms = partiesDans(tz, new Date(iso).getTime()), d = new Date(ms);
  const p = n => String(n).padStart(2, "0");
  return d.getUTCFullYear()+"-"+p(d.getUTCMonth()+1)+"-"+p(d.getUTCDate())+" "+p(d.getUTCHours())+":"+p(d.getUTCMinutes())+":"+p(d.getUTCSeconds());
}
/* 56.33.11 : résultat mémorisé (21 % du temps d'ingestion : un formateur Intl créé à chaque badgeage) */
const FUSEAUX_OK = new Map();
function fuseauValide(tz){ let v = FUSEAUX_OK.get(tz); if (v === undefined){ try { new Intl.DateTimeFormat("en-GB", {timeZone:tz}); v = true; } catch(e){ v = false; } if (FUSEAUX_OK.size < 1000) FUSEAUX_OK.set(tz, v); } return v; }

/* v56.2 : mois de rangement (clé de partition) : date de travail, sinon heure locale, sinon réception — jamais vide */
function moisDe(d, secours){ const s = String(d || secours || "").slice(0, 7); return /^\d{4}-\d{2}$/.test(s) ? s : "0000-00"; }
function ajoutMois(d, k){ const x = new Date(Date.UTC(+String(d).slice(0,4), +String(d).slice(5,7) - 1 + k, 1)); return x.toISOString().slice(0, 7); }
function creer(o){
  const {B, D, meta, audit, journal, config, invalider} = o;
  const maintenant = () => new Date().toISOString();
  const hex = (s, n) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, n || 32);
  const LAT = [];                                     /* latences réception → normalisé (D8) */
  const CPT = {ACCEPTED:0, DUPLICATE_IGNORED:0, INVALID:0, REJECTED:0, PENDING_REVIEW:0};

  /* ---------- moteur léger (date de travail selon le planning) ---------- */
  let moteur = null, cleMoteur = "";
  async function moteurPret(){
    /* 56.33.11 : paramétrage partagé (lecture) pour la clé et les lectures du lot ; copie neuve pour le moteur, qui peut
       compléter ses objets */
    const ref = await D.referentielLecture() || {}, emps = await D.employes();
    const cle = (ref.__versions ? JSON.stringify(ref.__versions) : "") + "|" + emps.length;
    if (!moteur){ moteur = require("./moteur.js").chargerMoteur(o.appJs); }
    /* 56.33.11 : une seule réinitialisation partagée par les lots qui arrivent ensemble (20 réinitialisations de
       ~8 Mo pour une rafale de 20 pointeuses auparavant), et plus de seconde réinitialisation due à la clé « =/≠ » */
    if (cle !== cleMoteur || emps !== moteur_emps){
      if (!REINIT || REINIT.cle !== cle || REINIT.emps !== emps){
        const r = REINIT = {cle, emps, p:(async ()=>{
          const refM = await D.referentiel() || {};
          moteur.M.db = Object.assign({}, refM, {emps, ptg:[], abs:[], corrections:[], dmd:[], audit:[], notifs:[], journal:[], exemple:false}); moteur.M.reinit();
          cleMoteur = cle; moteur_emps = emps; })()};
        r.p.catch(()=>{}).then(()=>{ if (REINIT === r) REINIT = null; });
      }
      await REINIT.p;
    }
    return {ref, emps};
  }
  let moteur_emps = null, REINIT = null;
  /* la journée de nuit J couvre J à partir de 12:00 et J+1 avant 12:00 (même règle que le moteur de calcul) */
  function dateDeTravail(e, local){
    const d = local.slice(0, 10), mn = (+local.slice(11, 13)) * 60 + (+local.slice(14, 16));
    if (mn >= 720) return {work_date:d, regle:"date civile"};
    const veille = moteur.M.dAjout(d, -1);
    let jr = null; try { jr = moteur.M.jourTypeDe(e, veille); } catch(x){}
    const nuit = jr && (jr.nuit || (jr.plages||[]).some(p=>p.t === "nuit"));
    return nuit ? {work_date:veille, regle:"poste de nuit commencé la veille ("+(jr.nom||jr.id)+")"} : {work_date:d, regle:"date civile"};
  }

  /* ---------- file persistante ---------- */
  const capacite = () => Math.max(1000, Number((config().ingestion||{}).capacite) || 100000);
  async function enAttente(){ const r = await B.get("SELECT COALESCE(SUM(nb),0) n FROM ingestion_queue WHERE statut IN ('attente','erreur','en_cours')"); return Number(r.n); }
  /* 56.33.11 : un lot n'est traité que par celui qui l'a pris (statut « en_cours », heure de prise dans traite_utc).
     Auparavant la reprise automatique (toutes les 30 s) reprenait aussi un lot en cours de traitement par sa
     réception : double traitement, « duplicate key raw_events » et tentatives gaspillées. Un lot « en_cours »
     depuis plus de 10 min (arrêt du serveur pendant le traitement) redevient disponible. */
  const PRISE_MAX_MS = 10 * 60000;
  async function prendre(id){
    const r = await B.run("UPDATE ingestion_queue SET statut='en_cours', traite_utc=? WHERE id=? AND (statut IN ('attente','erreur') OR (statut='en_cours' AND traite_utc < ?))",
      maintenant(), id, new Date(Date.now() - PRISE_MAX_MS).toISOString());
    return r.n > 0;
  }
  /* lot : [{terminal (objet), utilisateur, horodatage (heure locale de l'appareil), sens, payload, source_event_id}] */
  async function recevoir(source, T, lot, auteur){
    const n = lot.length; if (!n) return {ok:true, lus:0, integres:0, doublons:0, inconnus:0, invalides:0, rejetes:0};
    if (await enAttente() + n > capacite()) throw Object.assign(new Error("File d'ingestion pleine ("+capacite()+" événements) : l'appareil conserve ses badgeages et les renverra."), {code:503});
    const id = crypto.randomBytes(12).toString("hex"), correlation = "ing-"+id.slice(0, 12), recu = maintenant();
    await B.run("INSERT INTO ingestion_queue(id,recu_utc,source,terminal_id,nb,payload,statut,tentatives,correlation,traite_utc) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id, recu, source, T ? T.id : null, n, JSON.stringify({terminal:T ? {id:T.id, nom:T.nom, siteId:T.siteId, identifiantAppareil:T.identifiantAppareil, fuseau:T.fuseau} : null, auteur:auteur||"", lot}), "en_cours", 0, correlation, recu);
    /* une fois le lot écrit dans la file, il ne peut plus être perdu : un échec de normalisation est repris
       automatiquement et l'appareil n'a pas à renvoyer (réponse positive) */
    try { return await traiter(id, true); }
    catch(e){ return {ok:true, enFile:true, lus:n, integres:0, doublons:0, inconnus:0, invalides:0, rejetes:0, motif:e.message, correlation}; }
  }
  async function traiter(id, pris){
    if (!pris && !await prendre(id)) return null;
    const q = await B.get("SELECT * FROM ingestion_queue WHERE id=?", id);
    if (!q || q.statut === "traite") return null;
    try {
      const p = JSON.parse(q.payload);
      const r = await normaliserLot(q, p);
      await B.run("UPDATE ingestion_queue SET statut='traite', traite_utc=?, erreur=NULL WHERE id=?", maintenant(), id);
      return r;
    } catch(e){
      await B.run("UPDATE ingestion_queue SET statut='erreur', tentatives=tentatives+1, erreur=? WHERE id=?", String(e.message).slice(0, 500), id);
      journal("ingestion "+q.correlation+" : "+e.message);
      throw e;
    }
  }
  /* reprise automatique des lots en erreur ou restés en attente (redémarrage, base indisponible) */
  let reprise = false;
  async function reprendre(){
    if (reprise || (config().ingestion||{}).pause) return 0; reprise = true; let n = 0;
    try {
      const l = await B.all("SELECT id FROM ingestion_queue WHERE (statut IN ('attente','erreur') OR (statut='en_cours' AND traite_utc < ?)) AND tentatives < 20 ORDER BY recu_utc LIMIT 200", new Date(Date.now() - PRISE_MAX_MS).toISOString());
      for (const x of l){ try { if (await traiter(x.id)) n++; } catch(e){} }
    } finally { reprise = false; }
    return n;
  }

  /* ---------- normalisation ---------- */
  const CORR = new Map();
  async function correspondance(T){
    const emps = await D.employes(), mode = (T && T.identifiantAppareil) || "mat";
    const c = CORR.get(mode); if (c && c.emps === emps) return c.m;          /* 56.33.11 : 50 000 salariés → reconstruite à chaque lot auparavant */
    const m = new Map(); CORR.set(mode, {emps, m});
    emps.forEach(e=>{ const k = String(mode === "badge" ? (e.badge||"") : mode === "pin" ? (e.pin||"") : e.mat).trim(); if (k) m.set(k, e); if (mode !== "mat") m.set("mat:"+e.mat, e); });
    return m;
  }
  /* 56.33.11 : normalisation par lot. Mêmes règles que l'ancienne boucle événement par événement (doublons, clôture,
     alternance, date de travail, projection) mais les doublons sont recherchés en une requête pour tout le lot et les
     écritures partent en requêtes multi-lignes : 7 à 8 allers-retours SQL par badgeage → quelques-uns par centaine.
     Un événement sans sens (alternance) lit l'événement précédent après écriture de ce qui précède dans le lot. */
  const COLS_RAW = "raw_event_id,device_id,terminal_code,raw_badge_code,raw_employee_id,event_ts_utc,event_ts_local,reception_ts_utc,ingestion_source,payload_raw,source_event_id,timezone_source,ingestion_status,auteur,correlation,created_at";
  const COLS_NORM = "id,mois,raw_event_id,idempotency_key,employee_mat,type,methode_type,event_ts_utc,ts_local,work_date,site_id,statut,motif,ptg_id,created_at";
  async function insererLignes(table, cols, lignes){
    if (!lignes.length) return;
    const nc = cols.split(",").length, n = Math.max(1, Math.floor(1600 / nc)), ph = "("+new Array(nc).fill("?").join(",")+")";
    for (let i = 0; i < lignes.length; i += n){
      const part = lignes.slice(i, i + n);
      await B.run("INSERT INTO "+table+"("+cols+") VALUES"+part.map(()=>ph).join(","), ...[].concat(...part));
    }
  }
  async function existants(sql, cles){
    const out = new Set(), l = Array.from(new Set(cles.filter(Boolean)));
    for (let i = 0; i < l.length; i += 500){
      const part = l.slice(i, i + 500);
      (await B.all(sql.replace("(?)", "("+part.map(()=>"?").join(",")+")"), ...part)).forEach(r=>out.add(r.k));
    }
    return out;
  }
  async function normaliserLot(q, p){
    if ((config().ingestion||{}).pause) throw new Error("normalisation suspendue par l'administrateur");
    const {ref} = await moteurPret();
    const T = p.terminal, source = q.source, auteur = p.auteur || "";
    const site = T && T.siteId ? (ref.sites||[]).find(s=>s.id === T.siteId) : null;
    const clot = (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, "");
    const corr = await correspondance(T);
    const res = {ok:true, lus:p.lot.length, integres:0, doublons:0, inconnus:0, invalides:0, rejetes:0, horsPeriode:0, correlation:q.correlation};
    const touches = new Set(), inconnus = new Set();
    const debut = Date.now(), cree = maintenant();
    /* 1. lecture de chaque ligne (sans accès à la base) */
    const evs = p.lot.map((b, i)=>{
      const rawId = q.id+"-"+i;
      const util = String(b.utilisateur == null ? "" : b.utilisateur).trim();
      const e = util ? corr.get(util) : null;
      const tz = (T && T.fuseau) || (site && site.tz) || (e && (ref.sites||[]).find(s=>s.id === e.siteId) || {}).tz || FUSEAU_DEFAUT;
      /* 56.33.11 : instant avec fuseau (« …Z », « +01:00 » : API BioStar 2, pilotes externes) → heure locale du site ;
         sans fuseau : heure locale de l'appareil, comme avant */
      const brut = String(b.horodatage||"").trim(), absM = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})$/i.exec(brut);
      const absMs = absM ? Date.parse(absM[1].replace(" ", "T")+(absM[2].toUpperCase() === "Z" ? "Z" : absM[2].slice(0, 3)+":"+absM[2].slice(-2))) : NaN;
      const local = absM && !isNaN(absMs) && fuseauValide(tz) ? utcVersLocal(new Date(absMs).toISOString(), tz) : brut.replace("T", " ").slice(0, 19);
      const localOk = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(local);
      const tsLocal = localOk ? (local.length === 16 ? local+":00" : local) : null;
      const tsUtc = tsLocal && fuseauValide(tz) ? localVersUtc(tsLocal, tz) : null;
      let statut = "ACCEPTED", motif = "";
      if (!tsUtc){ statut = "INVALID"; motif = "horodatage illisible ou fuseau inconnu"; }
      else if (new Date(tsUtc).getTime() > Date.now() + 5*60000){ statut = "INVALID"; motif = "horodatage dans le futur"; }
      else if (!util){ statut = "INVALID"; motif = "identifiant absent"; }
      else if (!e){ statut = "PENDING_REVIEW"; motif = "identifiant inconnu : « "+util+" »"; inconnus.add(util); }
      const cle = "k-"+hex([T ? T.id : "saisie:"+auteur, util, tsUtc, b.source_event_id||""].join("|"), 40);
      const ptgId = e && T ? "t"+crypto.createHash("sha1").update(T.id+"|"+e.mat+"|"+tsLocal).digest("hex").slice(0, 16) : (b.ptgId || null);
      return {b, rawId, util, e, tz, tsLocal, tsUtc, statut, motif, cle, ptgId};
    });
    /* 2. doublons déjà enregistrés : trois requêtes pour tout le lot */
    const aVerifier = evs.filter(x=>x.statut === "ACCEPTED" || x.statut === "PENDING_REVIEW");
    await B.transaction(async ()=>{
      const clesConnues = await existants("SELECT idempotency_key k FROM event_keys WHERE idempotency_key IN (?)", aVerifier.map(x=>x.cle));
      (await existants("SELECT idempotency_key k FROM normalized_events WHERE idempotency_key IN (?)", aVerifier.map(x=>x.cle).filter(k=>!clesConnues.has(k)))).forEach(k=>clesConnues.add(k));
      const ptgConnus = await existants("SELECT id k FROM enreg WHERE coll='ptg' AND id IN (?)", aVerifier.map(x=>x.ptgId));
      const W = {raw:[], retr:[], cles:[], norm:[], ptg:[]};
      const vider = async () => {
        await insererLignes("raw_events", COLS_RAW, W.raw); await insererLignes("event_retransmissions", "id,idempotency_key,raw_event_id,recu_utc", W.retr);
        await insererLignes("event_keys", "idempotency_key,mois,normalized_id,cree", W.cles); await insererLignes("normalized_events", COLS_NORM, W.norm);
        if (W.ptg.length) await D.ecrireLot("ptg", W.ptg);
        W.raw = []; W.retr = []; W.cles = []; W.norm = []; W.ptg = [];
      };
      for (const x of evs){
        const {b, rawId, util, e, tz, tsLocal, tsUtc, cle, ptgId} = x;
        let {statut, motif} = x;
        if (statut === "ACCEPTED" || statut === "PENDING_REVIEW"){
          /* doublon : déjà en base, ou déjà vu plus haut dans ce lot (mêmes règles que la lecture une à une) */
          const dejaN = clesConnues.has(cle), dejaP = !dejaN && ptgId && ptgConnus.has(ptgId);
          if (dejaN || dejaP){ statut = "DUPLICATE_IGNORED"; motif = "déjà reçu"; }
        }
        if (statut === "ACCEPTED" && e && clot && tsLocal.slice(0, 10) <= clot){ statut = "REJECTED"; motif = "période clôturée jusqu'au "+clot+" : ajustement de période antérieure requis"; res.horsPeriode++; }
        /* niveau 1 : toute réception est conservée, avec le message d'origine */
        W.raw.push([rawId, T ? T.id : null, T ? (T.nom||T.id) : null, b.badge != null ? String(b.badge) : ((T && T.identifiantAppareil === "badge") ? util : null), util || null, tsUtc, tsLocal, q.recu_utc, source,
          typeof b.payload === "string" ? b.payload : JSON.stringify(b.payload != null ? b.payload : {utilisateur:b.utilisateur, horodatage:b.horodatage, sens:b.sens}),
          b.source_event_id || null, tz, statut, auteur || null, q.correlation, cree]);
        CPT[statut] = (CPT[statut]||0) + 1;
        if (statut === "DUPLICATE_IGNORED"){ res.doublons++; W.retr.push(["r-"+rawId, cle, rawId, q.recu_utc]); continue; }
        if (statut === "INVALID"){ res.invalides++; W.norm.push(["n-"+rawId, moisDe(tsLocal, q.recu_utc), rawId, "inv-"+rawId, e ? String(e.mat) : null, "UNKNOWN", "aucune", tsUtc, tsLocal, null, null, statut, motif, null, cree]); continue; }
        if (statut === "REJECTED"){ res.rejetes++; W.norm.push(["n-"+rawId, moisDe(tsLocal, q.recu_utc), rawId, "rej-"+rawId, String(e.mat), "UNKNOWN", "aucune", tsUtc, tsLocal, null, null, statut, motif, null, cree]); continue; }
        /* type : fourni par l'appareil, sinon déterminé par alternance à partir de l'événement précédent
           de la même journée de travail (les événements déjà enregistrés ne sont jamais réécrits) */
        let type = b.sens === "E" ? "IN" : b.sens === "S" ? "OUT" : null, methode = type ? "appareil" : "";
        let wd = {work_date:tsLocal.slice(0, 10), regle:"date civile"};
        if (e) wd = dateDeTravail(e, tsLocal);
        if (!type && e){
          await vider();
          const prec = await B.get("SELECT type FROM normalized_events WHERE employee_mat=? AND work_date=? AND statut='ACCEPTED' AND ts_local < ? ORDER BY ts_local DESC LIMIT 1", String(e.mat), wd.work_date, tsLocal);
          type = prec && (prec.type === "IN" || prec.type === "AUTO_IN") ? "AUTO_OUT" : "AUTO_IN"; methode = "alternance (événement précédent : "+(prec ? prec.type : "aucun")+")";
        }
        W.cles.push([cle, moisDe(e ? wd.work_date : tsLocal, q.recu_utc), "n-"+rawId, cree]); clesConnues.add(cle);
        W.norm.push(["n-"+rawId, moisDe(e ? wd.work_date : tsLocal, q.recu_utc), rawId, cle, e ? String(e.mat) : null, type || "UNKNOWN", methode+" ; date de travail : "+wd.regle, tsUtc, tsLocal, e ? wd.work_date : null, (T && T.siteId) || (e && e.siteId) || null, statut, motif, e ? ptgId : null, cree]);
        if (statut === "PENDING_REVIEW"){ res.inconnus++; continue; }
        /* projection de compatibilité : le moteur de calcul actuel lit ces badgeages (résultats inchangés) */
        const sens = type === "IN" || type === "AUTO_IN" ? "E" : "S";
        const pt = {id:ptgId || ("s"+hex(rawId, 16)), mat:String(e.mat), ts:tsLocal, sens, dev:T ? (T.nom||"") : (b.dev||""), src:T ? "badge" : (b.src||"saisie"), term:T ? T.id : undefined, raw:rawId, sensAuto:methode.indexOf("alternance") === 0 ? true : undefined};
        W.ptg.push(pt); ptgConnus.add(pt.id);
        res.integres++; touches.add(pt.mat+"|"+tsLocal.slice(0, 10)); if (wd.work_date !== tsLocal.slice(0, 10)) touches.add(pt.mat+"|"+wd.work_date);
      }
      await vider();
    });
    const lat = Date.now() - new Date(q.recu_utc).getTime();
    for (let i = 0; i < Math.min(p.lot.length, 50); i++) LAT.push(lat); while (LAT.length > 2000) LAT.shift();
    try { await invalider(Array.from(touches), []); } catch(e){}
    if (inconnus.size && T){ const inc = (await meta("pointeuses_inconnus")) || {}; inc[T.id] = Array.from(new Set([...(inc[T.id]||[]), ...inconnus])).slice(-500); await meta("pointeuses_inconnus", inc); }
    res.dureeMs = Date.now() - debut;
    return res;
  }

  /* ---------- rejeu des événements en attente de revue (ex. badge rattaché ensuite à un employé) ---------- */
  async function rejouer(login){
    const l = await B.all("SELECT n.id, n.raw_event_id, r.payload_raw, r.device_id, r.raw_employee_id, r.event_ts_local, r.ingestion_source FROM normalized_events n JOIN raw_events r ON r.raw_event_id = n.raw_event_id WHERE n.statut='PENDING_REVIEW' LIMIT 5000");
    const ref = await D.referentielLecture() || {}; let n = 0;
    const parTerm = new Map();
    l.forEach(x=>{ const k = x.device_id || ""; if (!parTerm.has(k)) parTerm.set(k, []); parTerm.get(k).push(x); });
    for (const [tid, xs] of parTerm){
      const T = (ref.terms||[]).find(t=>t.id === tid) || null;
      /* le rejeu crée de nouvelles réceptions (source « rejeu ») ; l'ancien événement normalisé reste, marqué remplacé
         (sa clé est libérée pour que la nouvelle réception ne soit pas prise pour un doublon) */
      for (const x of xs){
        const k = await B.get("SELECT idempotency_key FROM normalized_events WHERE id=?", x.id);
        await B.run("UPDATE normalized_events SET statut='REPLAYED', motif=?, idempotency_key=idempotency_key || ? WHERE id=? AND statut='PENDING_REVIEW'", "rejoué par "+login, "#rejoue-"+x.id, x.id);
        if (k) await B.run("DELETE FROM event_keys WHERE idempotency_key=?", k.idempotency_key);
      }
      const r = await recevoir("rejeu", T, xs.map(x=>({utilisateur:x.raw_employee_id, horodatage:x.event_ts_local, sens:(()=>{ try { return JSON.parse(x.payload_raw).sens || ""; } catch(e){ return ""; } })(), payload:x.payload_raw})), login);
      n += r.integres;

    }
    await audit(login, "ingestion.rejeu", l.length+" événement(s) en attente de revue rejoué(s), "+n+" accepté(s)");
    return {rejoues:l.length, acceptes:n};
  }

  /* ---------- migration v49 → v50 : chaque badgeage existant devient un événement brut et normalisé ---------- */
  let MIG = {etat:"inconnu"};
  async function migrer(){
    const deja = await meta("migration_v50");
    if (deja && deja.fin){ MIG = deja; return; }
    const ref = await D.referentielLecture() || {};
    const tzSite = new Map((ref.sites||[]).map(s=>[s.id, s.tz || FUSEAU_DEFAUT])), emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
    MIG = Object.assign({etat:"en_cours", debut:maintenant(), faits:0}, deja || {});
    const total = Number((await B.get("SELECT COUNT(*) n FROM enreg WHERE coll='ptg'")).n); MIG.total = total;
    let dernier = MIG.curseur || "";
    for (;;){
      const l = await B.all("SELECT id, data FROM enreg WHERE coll='ptg' AND id > ? ORDER BY id LIMIT 2000", dernier);
      if (!l.length) break;
      /* insertions groupées (250 lignes par requête) : environ dix fois plus rapide qu'une ligne à la fois */
      const R = [], N = [], cree = maintenant();
      /* badgeages déjà tracés par la v50 (reçus pendant la migration, ou saisis dans l'application) : ignorés */
      const ids = l.map(r=>r.id);
      const deja = new Set((await B.all("SELECT ptg_id FROM normalized_events WHERE ptg_id IN ("+ids.map(()=>"?").join(",")+")", ...ids)).map(x=>x.ptg_id));
      for (const r of l){
        if (deja.has(r.id)) continue;
        const x = JSON.parse(r.data); if (x.raw) continue;
        const e = emps.get(String(x.mat)), tz = (e && tzSite.get(e.siteId)) || FUSEAU_DEFAUT;
        const utc = localVersUtc(x.ts, tz), rawId = "m49-"+r.id;
        R.push([rawId, x.term || null, x.dev || null, String(x.mat), utc, x.ts, "inconnue (migration v49)", "migration_v49", r.data, tz, "ACCEPTED", cree]);
        N.push(["n-"+rawId, moisDe(x.ts, cree), rawId, "m49-"+r.id, String(x.mat), x.sens === "E" ? (x.sensAuto ? "AUTO_IN" : "IN") : (x.sensAuto ? "AUTO_OUT" : "OUT"), x.sensAuto ? "alternance (v49)" : (x.src === "badge" ? "appareil" : "saisie"),
          utc, x.ts, null, (e && e.siteId) || null, "ACCEPTED", "", r.id, cree]);
      }
      await B.transaction(async ()=>{
        for (let k = 0; k < R.length; k += 250){
          const a1 = R.slice(k, k+250), a2 = N.slice(k, k+250);
          await B.run("INSERT INTO raw_events(raw_event_id,device_id,terminal_code,raw_employee_id,event_ts_utc,event_ts_local,reception_ts_utc,ingestion_source,payload_raw,timezone_source,ingestion_status,created_at) VALUES "+a1.map(()=>"(?,?,?,?,?,?,?,?,?,?,?,?)").join(",")+" ON CONFLICT DO NOTHING", ...a1.flat());
          await B.run("INSERT INTO normalized_events(id,mois,raw_event_id,idempotency_key,employee_mat,type,methode_type,event_ts_utc,ts_local,work_date,site_id,statut,motif,ptg_id,created_at) VALUES "+a2.map(()=>"(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")+" ON CONFLICT DO NOTHING", ...a2.flat());
        }
      });
      dernier = l[l.length-1].id; MIG.faits += l.length; MIG.curseur = dernier;
      await meta("migration_v50", MIG);
      await new Promise(r=>setTimeout(r, 40));              /* laisse passer les requêtes et les calculs */
    }
    MIG.etat = "terminee"; MIG.fin = maintenant(); await meta("migration_v50", MIG);
    await audit("systeme", "migration.v50", MIG.faits+" badgeage(s) v49 convertis en événements bruts et normalisés (fuseau du site, "+FUSEAU_DEFAUT+" par défaut)");
  }

  /* v50 : toute saisie, modification ou suppression d'un badgeage dans l'application laisse un événement brut
     (auteur, avant, après) : la preuve de l'état initial n'est jamais perdue */
  async function tracerSaisie(login, avant, apres){
    const x = apres || avant; if (!x) return;
    const nature = !avant ? "saisie" : !apres ? "annulation" : "correction";
    const rawId = "app-"+crypto.randomBytes(10).toString("hex"), recu = maintenant();
    const ref = await D.referentielLecture() || {};
    const e = (await D.employes()).find(y=>String(y.mat) === String(x.mat));
    const tz = ((ref.sites||[]).find(s=>e && s.id === e.siteId) || {}).tz || FUSEAU_DEFAUT;
    const utc = x.ts ? localVersUtc(x.ts, tz) : null;
    await B.run("INSERT INTO raw_events(raw_event_id,device_id,terminal_code,raw_employee_id,event_ts_utc,event_ts_local,reception_ts_utc,ingestion_source,payload_raw,timezone_source,ingestion_status,auteur,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      rawId, x.term || null, x.dev || null, String(x.mat), utc, x.ts || null, recu, nature, JSON.stringify({avant:avant || null, apres:apres || null}), tz, "ACCEPTED", login || null, recu);
    const prec = await B.get("SELECT id FROM normalized_events WHERE ptg_id=? AND statut='ACCEPTED' ORDER BY created_at DESC LIMIT 1", String(x.id));
    await B.run("INSERT INTO normalized_events(id,mois,raw_event_id,idempotency_key,employee_mat,type,methode_type,event_ts_utc,ts_local,site_id,statut,motif,ptg_id,remplace_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "n-"+rawId, moisDe(x.ts, recu), rawId, "app-"+rawId, String(x.mat), nature === "annulation" ? "CANCEL" : (x.sens === "E" ? "IN" : "OUT"), nature+" dans l'application", utc, x.ts || null, e ? e.siteId : null,
      "ACCEPTED", nature+" par "+(login||"?"), String(x.id), prec ? prec.id : null, recu);
    CPT.ACCEPTED++;
  }
  async function etat(){
    const s = {}; (await B.all("SELECT statut, COUNT(*) n FROM normalized_events GROUP BY statut")).forEach(r=>{ s[r.statut] = Number(r.n); });
    const q = {}; (await B.all("SELECT statut, COUNT(*) n, COALESCE(SUM(nb),0) ev FROM ingestion_queue GROUP BY statut")).forEach(r=>{ q[r.statut] = {lots:Number(r.n), evenements:Number(r.ev)}; });
    const pct = (l, x) => { if (!l.length) return 0; const t = l.slice().sort((a,b)=>a-b); return t[Math.min(t.length-1, Math.ceil(x/100*t.length)-1)]; };
    return {capacite:capacite(), enAttente:await enAttente(), file:q, statuts:s, depuisDemarrage:CPT,
      bruts:Number((await B.get("SELECT COUNT(*) n FROM raw_events")).n), retransmissions:Number((await B.get("SELECT COUNT(*) n FROM event_retransmissions")).n),
      latence:{mesure:"réception par le serveur → événement normalisé enregistré", p50:pct(LAT, 50), p95:pct(LAT, 95), p99:pct(LAT, 99), n:LAT.length},
      migration:MIG, pause:!!(config().ingestion||{}).pause};
  }
  async function historique(mat, du, au){
    const n = await B.all("SELECT n.*, r.ingestion_source, r.reception_ts_utc, r.device_id, r.terminal_code, r.payload_raw, r.auteur FROM normalized_events n JOIN raw_events r ON r.raw_event_id = n.raw_event_id WHERE n.employee_mat=? AND n.ts_local>=? AND n.ts_local<=? AND (n.mois IS NULL OR (n.mois>=? AND n.mois<=?)) ORDER BY n.ts_local LIMIT 2000", String(mat), du, au+" 23:59:59", ajoutMois(du, -1), ajoutMois(au, 1));
    return n;
  }
  /* v54 : valeur d'une règle versionnée pour un salarié et un jour (moteur léger du fil principal) */
  async function regle(code, mat, d){
    const {emps} = await moteurPret(); const e = emps.find(x=>String(x.mat) === String(mat));
    try { return e ? moteur.M.regleEff(code, e, d).valeur : null; } catch(x){ return null; }
  }
  return {regle, tracerSaisie, recevoir, reprendre, rejouer, migrer, etat, historique, localVersUtc, utcVersLocal, correspondance};
}
module.exports = {creer, localVersUtc, utcVersLocal, FUSEAU_DEFAUT};
