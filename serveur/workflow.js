/* FIWAKTI — cycle de vie des journées (v52, lot P0-C du cahier des charges v50/v51).
   États : CALCULEE (journée en cours) → APPROUVEE_AUTO (sans anomalie, décision D1)
           ANOMALIE → CORRIGEE (anomalies levées) → APPROUVEE_MANAGER → APPROUVEE_RH ; CLOTUREE au-delà.
   Toute transition est écrite dans day_transitions (ajout seul). Une période clôturée ne se rouvre pas (D6) :
   une correction passe par un ajustement de période antérieure, imputé au premier jour ouvert (D7). */
"use strict";
const crypto = require("crypto");
const GRAVITE = {oubli:"bloquante", absence:"majeure", retard:"mineure", depart:"mineure", hs:"a_valider"};
const ETATS_EN_ATTENTE = ["ANOMALIE", "CORRIGEE", "APPROUVEE_MANAGER"];     /* VALIDEE et APPROUVEE_RH sont finaux */
/* état d'une journée : ligne d'état si elle a connu une anomalie ; sinon déduit de son calcul */
function etatEffectif(ligneEtat, calc, d, clot, aujourdhui){
  if (clot && d <= clot) return "CLOTUREE";
  if (ligneEtat) return ligneEtat;
  if (!calc) return "NON_CALCULEE";
  if (Number(calc.nano) > 0) return "ANOMALIE";
  return d < aujourdhui ? "APPROUVEE_AUTO" : "CALCULEE";
}
function codeAnomalie(a){
  if (a.type === "oubli") return a.sug && a.sug.manque === "S" ? "ERR_SINGLE_BADGE" : a.sug && a.sug.manque === "E" ? "ERR_NO_IN" : "ERR_SEQUENCE";
  return {retard:"LATE_ARRIVAL", depart:"EARLY_DEPARTURE", absence:"ABSENCE_UNJUSTIFIED", hs:"OVERTIME_TO_VALIDATE"}[a.type] || ("ANO_"+String(a.type||"").toUpperCase());
}
function creer(o){
  const {B, D, audit, journal} = o;
  /* v54 : niveau de validation par règle versionnée VALIDATION_JOURNEES (aucune, responsable, responsable_rh) */
  const mode = async (mat, d) => { const v = o.regle ? await o.regle("VALIDATION_JOURNEES", mat, d) : null; return ["aucune","responsable","responsable_rh"].indexOf(v) >= 0 ? v : "responsable"; };
  const final = m => m === "responsable_rh" ? "APPROUVEE_RH" : "VALIDEE";
  async function rangPtg(login){
    const ref = await D.referentielLecture() || {}, u = (ref.users||[]).find(x=>x.login === login);
    if (!u) return 0; const p = (ref.profils||[]).find(x=>x.id === u.profilId) || {};
    if (p.admin || u.admin) return 4;
    return {aucun:0, lecture:1, saisie:2, validation:3, config:4}[(p.droits||{}).PTG] || 0;
  }
  /* auteur de la correction : dernière saisie, correction ou décision sur la journée depuis son passage en anomalie */
  async function correcteur(mat, d, depuis){
    const r = await B.get("SELECT auteur, created_at FROM raw_events WHERE raw_employee_id=? AND ingestion_source IN ('saisie','correction','annulation') AND substr(event_ts_local,1,10) IN (?,?) AND created_at > ? ORDER BY created_at DESC LIMIT 1", String(mat), d, plus1(d), depuis || "");
    let best = r && r.auteur ? {login:r.auteur, le:r.created_at} : null;
    const ref = await D.referentielLecture() || {};
    Object.entries(ref.anoDec||{}).forEach(([id, x])=>{ if (!x || !x.par) return; const p = id.split("|"); if (p[1] !== String(mat) || p[2] !== d) return;
      const le = String(x.le||"").replace(" ", "T"); if (le > String(depuis||"").slice(0, 19) && (!best || le > best.le)) best = {login:x.par, le}; });
    return best;
  }
  const maintenant = () => new Date().toISOString();
  const auj = () => { const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0"); };
  const plus1 = k => { const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)+1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  async function clotureJusqu(){ const ref = await D.referentielLecture() || {}; return (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, ""); }
  async function transition(mat, d, de, vers, auteur, motif){
    const ts = maintenant();
    await B.run("INSERT INTO day_transitions(id,mat,d,de,vers,auteur,motif,ts) VALUES(?,?,?,?,?,?,?,?)", "tr-"+crypto.randomBytes(9).toString("hex"), String(mat), d, de || null, vers, auteur || "systeme", motif || "", ts);
    await B.run("INSERT INTO day_states(mat,d,etat,maj,auteur) VALUES(?,?,?,?,?) ON CONFLICT(mat,d) DO UPDATE SET etat=excluded.etat, maj=excluded.maj, auteur=excluded.auteur", String(mat), d, vers, ts, auteur || "systeme");
  }
  /* responsable d'une anomalie : le compte applicatif du responsable hiérarchique */
  async function responsables(){
    const ref = await D.referentielLecture() || {}, emps = await D.employes();
    const empParId = new Map(emps.map(e=>[e.id, e])), loginParMat = new Map();
    (ref.users||[]).forEach(u=>{ const e = empParId.get(u.empId); if (e) loginParMat.set(String(e.mat), u.login); });
    return {parMat:new Map(emps.map(e=>[String(e.mat), e])), loginParMat};
  }
  /* après un calcul : états et anomalies des journées concernées */
  async function synchroniser(mats, du, au){
    if (!mats || !mats.length) return 0;
    const clot = await clotureJusqu(), aujourdhui = auj(), R = await responsables();
    let n = 0;
    for (let i = 0; i < mats.length; i += 500){
      /* v56.30 : la base intégrée répond de façon synchrone — on rend la main entre deux lots pour que le serveur
         continue de répondre (à 60 000 employés le premier passage bloquait le serveur ~4 min au démarrage) */
      if (i) await new Promise(r=>setImmediate(r));
      const lot = mats.slice(i, i+500), f = D.filtreMat(new Set(lot));
      const fm = f.sql.replace(" AND (mat IS NULL OR mat='' OR ", " AND (");
      const lignes = await B.all("SELECT mat, d, nano, anos, dept, site FROM calc_jour WHERE d>=? AND d<=?"+fm, du, au, ...f.a);
      const lignesEtats = await B.all("SELECT mat, d, etat, maj FROM day_states WHERE d>=? AND d<=?"+fm, du, au, ...f.a);
      const etats = new Map(lignesEtats.map(r=>[r.mat+"|"+r.d, r.etat])), majs = new Map(lignesEtats.map(r=>[r.mat+"|"+r.d, r.maj]));
      /* v56.30 : une seule lecture des anomalies du lot, par l'index (mat, d). L'ancienne requête « statut='ouverte' »
         passait par l'index (statut, d) et parcourait toutes les anomalies ouvertes de l'entreprise à chaque lot :
         2 s par lot à 60 000 employés, soit ~4 min de serveur figé au démarrage. */
      const ouvertes = new Map(), statuts = new Map();
      (await B.all("SELECT id, mat, d, statut FROM anomalies WHERE d>=? AND d<=?"+fm, du, au, ...f.a)).forEach(r=>{
        statuts.set(r.id, r.statut);
        if (r.statut === "ouverte"){ const k = r.mat+"|"+r.d; if (!ouvertes.has(k)) ouvertes.set(k, new Set()); ouvertes.get(k).add(r.id); } });
      await B.transaction(async ()=>{
        for (const r of lignes){
          if (clot && r.d <= clot) continue;                                   /* période clôturée : figée */
          const k = r.mat+"|"+r.d, avant = etats.get(k) || null, nano = Number(r.nano) || 0;
          /* approbation par exception (D1) : une journée sans anomalie n'a pas de ligne d'état (elle est « approuvée
             automatiquement » par construction, au vu de son calcul) ; seules les journées ayant connu une anomalie
             ont un état et un historique — soit quelques pour cent des journées au lieu de toutes */
          let apres = avant;
          if (nano > 0) apres = "ANOMALIE";
          else if (avant === "ANOMALIE") apres = "CORRIGEE";
          if (apres !== avant){
            await transition(r.mat, r.d, avant, apres, "systeme", nano > 0 ? nano+" anomalie(s) détectée(s)" + (avant && (avant.indexOf("APPROUVEE") === 0 || avant === "VALIDEE") ? " après validation" : "")
              : "anomalies levées");
            n++;
            /* v54 : validation allégée — selon la règle, la journée corrigée est validée d'office, ou la correction faite
               par un responsable (droit « saisie ») ou par les RH (droit « validation ») vaut validation de son auteur */
            if (apres === "CORRIGEE"){
              const md = await mode(r.mat, r.d);
              if (md === "aucune") await transition(r.mat, r.d, "CORRIGEE", "VALIDEE", "systeme", "validation non requise (règle VALIDATION_JOURNEES)");
              else { const c0 = await correcteur(r.mat, r.d, majs.get(k));
                /* 56.33.11 : la correction de sa propre journée ne vaut jamais validation */
                const c = c0 && R.loginParMat.get(String(r.mat)) !== c0.login ? c0 : null; const rg = c ? await rangPtg(c.login) : 0;
                if (rg >= 3) await transition(r.mat, r.d, "CORRIGEE", final(md), c.login, "corrigée par "+c.login+" (droit de validation) : la correction vaut validation");
                else if (rg >= 2) await transition(r.mat, r.d, "CORRIGEE", md === "responsable_rh" ? "APPROUVEE_MANAGER" : "VALIDEE", c.login, "corrigée par le responsable "+c.login+" : la correction vaut sa validation"+(md === "responsable_rh" ? " ; validation RH requise" : "")); }
            }
          }
          /* anomalies persistées : ouvertes, puis résolues quand le recalcul ne les trouve plus */
          const anos = JSON.parse(r.anos || "[]"), vues = new Set();
          const e = R.parMat.get(String(r.mat)), resp = e && e.chefMat ? (R.loginParMat.get(String(e.chefMat)) || String(e.chefMat)) : null;
          for (const a of anos){
            let id = a.type+"|"+r.mat+"|"+r.d, x = 1; while (vues.has(id)) id = a.type+"|"+r.mat+"|"+r.d+"|"+(++x);
            vues.add(id);
            /* v56.30 : statut lu dans le lot préchargé (une requête par lot au lieu d'une par anomalie) */
            const ex = statuts.has(id) ? {statut:statuts.get(id)} : null;
            if (!ex) await B.run("INSERT INTO anomalies(id,mat,d,type,code,gravite,statut,responsable,site,dept,motif,action,detail,cree,maj) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              id, String(r.mat), r.d, a.type, codeAnomalie(a), GRAVITE[a.type] || "mineure", "ouverte", resp, r.site || null, r.dept || null, "", "", JSON.stringify({min:a.min, arr:a.arr, deb:a.deb, sug:a.sug}), maintenant(), maintenant());
            else if (ex.statut !== "ouverte") await B.run("UPDATE anomalies SET statut='ouverte', motif='réapparue au recalcul', maj=? WHERE id=?", maintenant(), id);
          }
          for (const id of (ouvertes.get(k) || [])) if (!vues.has(id)) await B.run("UPDATE anomalies SET statut='resolue', action='corrigée (recalcul)', maj=? WHERE id=?", maintenant(), id);
        }
      });
    }
    return n;
  }
  /* validation par le responsable (CORRIGEE → APPROUVEE_MANAGER) puis par les RH (→ APPROUVEE_RH) ; rejet → ANOMALIE */
  /* 56.33.11 : séparation des pouvoirs — personne ne valide ses propres journées, et l'étape RH n'est pas validée par
     l'auteur de l'étape responsable (« moi » = matricule du compte qui valide) */
  async function valider(login, items, niveau, decision, motif, dansPerimetre, moi){
    const clot = await clotureJusqu(), res = {faits:0, refus:[]};
    const attendu = niveau === "rh" ? "APPROUVEE_MANAGER" : "CORRIGEE";
    if (decision === "rejet" && !String(motif||"").trim()) throw Object.assign(new Error("Motif obligatoire pour un rejet."), {code:400});
    for (const it of (items||[]).slice(0, 20000)){
      const mat = String(it.mat), d = String(it.d);
      if (!dansPerimetre(mat)){ res.refus.push(mat+" "+d+" : hors périmètre"); continue; }
      if (moi && mat === String(moi) && decision !== "rejet"){ res.refus.push(mat+" "+d+" : vos propres journées sont validées par un autre responsable"); continue; }
      if (clot && d <= clot){ res.refus.push(mat+" "+d+" : période clôturée"); continue; }
      const s = await B.get("SELECT etat FROM day_states WHERE mat=? AND d=?", mat, d);
      const bloq = await B.get("SELECT COUNT(*) n FROM anomalies WHERE mat=? AND d=? AND statut='ouverte' AND gravite='bloquante'", mat, d);
      if (decision !== "rejet" && Number(bloq.n)){ res.refus.push(mat+" "+d+" : anomalie bloquante non traitée"); continue; }
      /* une journée rejetée repasse en anomalie ; si ses anomalies sont toutes levées, le responsable peut la revalider */
      const ouvertes = Number((await B.get("SELECT COUNT(*) n FROM anomalies WHERE mat=? AND d=? AND statut='ouverte'", mat, d)).n);
      const md = await mode(mat, d);
      const admissible = s && (s.etat === attendu || (niveau === "rh" && s.etat === "CORRIGEE") || (s.etat === "ANOMALIE" && ouvertes === 0 && decision !== "rejet"));
      const cible = niveau === "rh" ? final(md) : (md === "responsable_rh" ? "APPROUVEE_MANAGER" : "VALIDEE");
      if (admissible && niveau === "rh" && decision !== "rejet" && s.etat === "APPROUVEE_MANAGER"){
        const am = await B.get("SELECT auteur FROM day_transitions WHERE mat=? AND d=? AND vers='APPROUVEE_MANAGER' ORDER BY ts DESC LIMIT 1", mat, d);
        if (am && am.auteur === login){ res.refus.push(mat+" "+d+" : l'étape RH doit être validée par une autre personne que le responsable"); continue; } }
      if (!admissible){ res.refus.push(mat+" "+d+" : état « "+(s ? s.etat : "aucun")+" », attendu « "+attendu+" »"+(s && s.etat === "ANOMALIE" && ouvertes ? " ("+ouvertes+" anomalie(s) ouverte(s))" : "")); continue; }
      await transition(mat, d, s.etat, decision === "rejet" ? "ANOMALIE" : cible, login, decision === "rejet" ? "rejet : "+motif : (motif || (niveau === "rh" ? "validation RH" : "validation du responsable")));
      res.faits++;
    }
    await audit(login, "journees."+(decision === "rejet" ? "rejet" : "validation")+"."+niveau, res.faits+" journée(s)"+(res.refus.length ? ", "+res.refus.length+" refus" : ""));
    return res;
  }
  /* une clôture n'est acceptée que si aucune journée de la période n'attend de traitement ou de validation */
  async function bloquantsCloture(du, au){
    const l = await B.all("SELECT etat, COUNT(*) n FROM day_states WHERE d>=? AND d<=? AND etat IN ('ANOMALIE','CORRIGEE','APPROUVEE_MANAGER') GROUP BY etat", du, au);
    const o = {}; l.forEach(r=>{ o[r.etat] = Number(r.n); });
    return o;
  }
  /* ajustement de période antérieure (REC-16) : jamais de modification de la journée clôturée */
  async function ajuster(login, a, dansPerimetre){
    const clot = await clotureJusqu();
    const mat = String(a.mat||""), d = String(a.d_origine||""), comp = String(a.compteur||"").trim(), delta = Number(a.delta);
    if (!dansPerimetre(mat)) throw Object.assign(new Error("Salarié hors périmètre."), {code:404});
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw Object.assign(new Error("Date d'origine invalide."), {code:400});
    if (!clot || d > clot) throw Object.assign(new Error("Cette journée n'est pas clôturée : corrigez-la normalement (l'ajustement est réservé aux périodes clôturées)."), {code:409});
    if (!/^[A-Z0-9_]{1,40}$/.test(comp) || !Number.isFinite(delta) || delta === 0) throw Object.assign(new Error("Compteur et écart (dans l'unité du compteur, non nul) obligatoires."), {code:400});
    if (!String(a.motif||"").trim()) throw Object.assign(new Error("Motif obligatoire."), {code:400});
    /* 56.33.11 : salarié existant et en poste à la date d'origine (un matricule inconnu était accepté) */
    const emp = (await D.employes()).find(e=>String(e.mat) === mat);
    if (!emp) throw Object.assign(new Error("Matricule inconnu : "+mat+"."), {code:400});
    if ((emp.entree && d < emp.entree) || (emp.sortie && d > emp.sortie)) throw Object.assign(new Error("Le salarié "+mat+" n'était pas en poste le "+d.split("-").reverse().join("/")+"."), {code:400});
    const id = "aj-"+crypto.randomBytes(8).toString("hex"), imput = plus1(clot);
    await B.run("INSERT INTO adjustments(id,mat,d_origine,d_imputation,compteur,delta,avant,apres,motif,justificatif,auteur,cree,statut) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id, mat, d, imput, comp, delta, a.avant == null ? null : Number(a.avant), a.apres == null ? null : Number(a.apres), String(a.motif).slice(0, 500), a.justificatif ? String(a.justificatif).slice(0, 500) : null, login, maintenant(), "propose");
    await audit(login, "ajustement.propose", mat+" "+d+" "+comp+" "+(delta > 0 ? "+" : "")+delta+", imputé au "+imput+" — "+a.motif);
    return B.get("SELECT * FROM adjustments WHERE id=?", id);
  }
  async function validerAjustement(login, id, decision, dansPerimetre, moi){
    const x = await B.get("SELECT * FROM adjustments WHERE id=?", id);
    if (!x) throw Object.assign(new Error("Ajustement introuvable."), {code:404});
    /* 56.33.11 : périmètre du valideur et pas d'ajustement de ses propres heures */
    if (dansPerimetre && !dansPerimetre(x.mat)) throw Object.assign(new Error("Ajustement introuvable."), {code:404});
    if (moi && String(x.mat) === String(moi)) throw Object.assign(new Error("Vos propres ajustements sont validés par un autre responsable."), {code:403});
    if (x.statut !== "propose") throw Object.assign(new Error("Ajustement déjà "+x.statut+"."), {code:409});
    if (x.auteur === login) throw Object.assign(new Error("L'auteur d'un ajustement ne peut pas le valider lui-même."), {code:403});
    const st = decision === "refus" ? "refuse" : "valide";
    await B.run("UPDATE adjustments SET statut=?, valide_par=?, valide_le=? WHERE id=?", st, login, maintenant(), id);
    if (st === "valide") await D.ecrire("ajust", {id:x.id, mat:x.mat, d:x.d_imputation, compteur:x.compteur, delta:Number(x.delta), origine:x.d_origine, motif:x.motif});
    await audit(login, "ajustement."+st, x.mat+" "+x.d_origine+" "+x.compteur+" "+x.delta+" (imputé au "+x.d_imputation+")");
    return {ok:true, statut:st, imputation:x.d_imputation, mat:x.mat};
  }
  return {etatEffectif, synchroniser, valider, bloquantsCloture, ajuster, validerAjustement, clotureJusqu, ETATS_EN_ATTENTE};
}
module.exports = {creer, codeAnomalie, etatEffectif};
