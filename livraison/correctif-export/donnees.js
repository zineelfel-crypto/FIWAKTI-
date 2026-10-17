/* FIWAKTI — couche de données structurée (v44, asynchrone : PostgreSQL ou SQLite).
   Référentiel (paramétrage) = un document ; données volumineuses = une ligne par
   enregistrement dans « enreg », indexée par collection, matricule, date et mois. */
"use strict";
const COLLS = ["emps","ptg","abs","dmd","corrections","audit","notifs","bio","msgp","journal","ajust"];
const DATEES = ["ptg","abs","dmd","corrections","audit","notifs","journal","msgp","ajust"];
const CLE_APP = "fiwakti:ref:v1";
function dateDe(coll, x){
  if (!x) return null;
  switch (coll){
    case "ptg": return String(x.ts||"").slice(0,10) || null;
    case "abs": case "corrections": case "notifs": case "ajust": return x.d || null;
    case "dmd": case "msgp": return x.au || x.du || null;
    case "audit": case "journal": return String(x.ts||"").slice(0,10) || null;
    default: return null;
  }
}
/* jours touchés par un enregistrement (pour invalider les résultats calculés) */
function joursDe(coll, x){
  if (!x || !x.mat) return [];
  if (coll === "dmd" && x.du){ const out = []; let k = x.du; const fin = x.au || x.du; let g = 0; while (k <= fin && g++ < 400){ out.push(k); k = plus1(k); } return out; }
  const d = dateDe(coll, x); return d ? [d] : [];
}
function plus1(k){ const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)+1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function creer(B, PERIM){
  function filtreMat(set){
    if (set === null) return {sql:"", a:[]};
    const arr = Array.from(set||[]);
    if (B.type === "pg") return {sql:" AND (mat IS NULL OR mat='' OR mat = ANY(?))", a:[arr]};
    return {sql:" AND (mat IS NULL OR mat='' OR mat IN (SELECT value FROM json_each(?)))", a:[JSON.stringify(arr)]};
  }
  /* v56.24 : changement d'un salarié (site, rattachements, sortie) signalé à la synchronisation biométrique */
  let SUR_EMP = null;
  /* ancien : fiche actuelle déjà lue par l'appelant (évite une seconde lecture) */
  async function ecrire(coll, x, ancien){
    let ancienEmp;
    if (coll === "emps" && SUR_EMP){ if (ancien !== undefined) ancienEmp = ancien; else try { const r = await B.get("SELECT data FROM enreg WHERE coll='emps' AND id=?", String(x.id)); ancienEmp = r ? JSON.parse(r.data) : null; } catch(e){ ancienEmp = undefined; } }
    const d = dateDe(coll, x), texte = JSON.stringify(x);
    await B.run("INSERT INTO enreg(coll,id,mat,d,mois,data) VALUES(?,?,?,?,?,?) ON CONFLICT(coll,id) DO UPDATE SET mat=excluded.mat, d=excluded.d, mois=excluded.mois, data=excluded.data",
      coll, String(x.id), x.mat != null ? String(x.mat) : null, d, d ? d.slice(0,7) : null, texte);
    if (coll === "emps"){ majCacheEmp(String(x.id), texte); if (B.siAnnulation) B.siAnnulation(()=>{ CACHE_EMPS = null; }); }
    if (coll === "emps" && SUR_EMP && ancienEmp !== undefined){ const a = ancienEmp; setImmediate(()=>{ try { SUR_EMP(a, x); } catch(e){} }); }
  }
  /* 56.33.11 : écriture groupée (requêtes multi-lignes) — ingestion des pointeuses et import en masse.
     Hors « emps » (dont chaque changement est signalé un par un à la synchronisation biométrique). Les identifiants
     d'un même appel doivent être distincts. */
  async function ecrireLot(coll, liste){
    if (coll === "emps") throw new Error("ecrireLot : utiliser ecrire() pour les salariés");
    const n = 100;
    for (let i = 0; i < liste.length; i += n){
      const part = liste.slice(i, i + n), vals = [];
      part.forEach(x=>{ const d = dateDe(coll, x); vals.push(coll, String(x.id), x.mat != null ? String(x.mat) : null, d, d ? d.slice(0,7) : null, JSON.stringify(x)); });
      await B.run("INSERT INTO enreg(coll,id,mat,d,mois,data) VALUES"+part.map(()=>"(?,?,?,?,?,?)").join(",")+" ON CONFLICT(coll,id) DO UPDATE SET mat=excluded.mat, d=excluded.d, mois=excluded.mois, data=excluded.data", ...vals);
    }
  }
  async function migrer(sauvegarder){
    const r = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP);
    if (!r) return null;
    const doc = JSON.parse(r.valeur);
    if (!COLLS.some(c=>Array.isArray(doc[c]))) return null;
    if (sauvegarder) await sauvegarder("migration", "avant passage au stockage structuré");
    const n = {};
    await B.transaction(async ()=>{
      for (const c of COLLS){
        if (!Array.isArray(doc[c])) continue;
        n[c] = 0;
        for (const x of doc[c]) if (x && x.id !== undefined){ await ecrire(c, x); n[c]++; }
        delete doc[c];
      }
      await B.run("UPDATE kv SET valeur=?, version=version+1 WHERE cle=?", JSON.stringify(doc), CLE_APP);
    });
    return n;
  }
  async function referentiel(){ const r = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP); return r ? JSON.parse(r.valeur) : null; }
  /* 56.33.11 : paramétrage en lecture seule, partagé et gelé, relu seulement quand sa version change en base (une
     petite requête par appel). Avec un portail de 50 000 comptes le paramétrage pèse ~8 Mo : le relire et le décoder
     (60 à 80 ms) plusieurs fois par requête ralentissait tous les écrans. Gelé : une modification accidentelle lève
     une erreur au lieu de corrompre la copie partagée. Pour modifier le paramétrage : referentiel() (copie neuve). */
  let REF_LECTURE = null;
  function geler(o){ if (o && typeof o === "object" && !Object.isFrozen(o)){ Object.freeze(o); for (const k of Object.keys(o)) geler(o[k]); } return o; }
  async function referentielLecture(){
    const r = await B.get("SELECT version, maj FROM kv WHERE cle=?", CLE_APP);
    if (!r) return null;
    const cle = r.version+"|"+r.maj;
    if (REF_LECTURE && REF_LECTURE.cle === cle) return REF_LECTURE.ref;
    const ref = geler(await referentiel());
    REF_LECTURE = {cle, ref};
    return ref;
  }
  /* v45 : la liste des employés est gardée en mémoire et relue seulement après une modification.
     56.33.11 : une fiche écrite est remplacée dans la liste au lieu de la faire relire en entier (50 000 fiches
     relues et décodées après chaque modification auparavant : ~300 ms par fiche modifiée, 1,5 s par lot d'import).
     La liste change d'identité à chaque modification : les caches dérivés (annuaire, correspondance des pointeuses,
     moteur) se reconstruisent comme avant. */
  let CACHE_EMPS = null, CACHE_POS = null, CACHE_MAJ = null;
  function majCacheEmp(id, texte){
    if (!CACHE_EMPS) return;
    if (!CACHE_MAJ) CACHE_MAJ = new Map();
    CACHE_MAJ.set(id, texte);
  }
  async function employes(){
    if (!CACHE_EMPS){
      const l = (await B.all("SELECT id, data FROM enreg WHERE coll='emps'"));
      CACHE_EMPS = l.map(r=>JSON.parse(r.data)); CACHE_POS = new Map(l.map((r, i)=>[String(r.id), i])); CACHE_MAJ = null;
    } else if (CACHE_MAJ){
      const copie = CACHE_EMPS.slice();
      CACHE_MAJ.forEach((texte, id)=>{ const i = CACHE_POS.get(id), e = JSON.parse(texte); if (i === undefined){ CACHE_POS.set(id, copie.length); copie.push(e); } else copie[i] = e; });
      CACHE_EMPS = copie; CACHE_MAJ = null;
    }
    return CACHE_EMPS;
  }
  /* 56.33.11 : périmètre mémorisé pour un même paramétrage partagé, une même liste de salariés et un même jour */
  const MEMO_PERIM = new WeakMap();
  async function perimetreDe(ref, login){
    const emps = await employes();
    const gele = ref && Object.isFrozen(ref), cle = String(login).toLowerCase()+"|"+new Date().toDateString();
    if (gele){ const m = MEMO_PERIM.get(ref), x = m && m.get(cle); if (x && x.emps === emps) return {P:x.P, emps}; }
    const P = PERIM.perimetre(Object.assign({}, ref, {emps}), login);
    if (gele){ let m = MEMO_PERIM.get(ref); if (!m){ m = new Map(); MEMO_PERIM.set(ref, m); } if (m.size > 2000) m.clear(); m.set(cle, {P, emps}); }
    return {P, emps};
  }
  async function charger(login, depuis, opts){
    opts = opts || {};
    const ref = await referentielLecture() || {};
    const {P, emps} = await perimetreDe(ref, login);
    const vue = PERIM.vue(Object.assign({}, ref, {emps}), login).doc;
    const nb = P.set === null ? emps.length : P.set.size;
    const grand = nb > (opts.seuil || 1000);
    /* grand effectif : le navigateur ne garde que les deux derniers jours ; le reste est calculé par le serveur */
    const du = grand ? opts.hier : depuis;
    const f = filtreMat(P.set);
    const parties = [];
    /* v56.3 : grand effectif → annuaire servi par page ; le navigateur ne reçoit que la fiche de l'utilisateur et de
       son équipe directe (le reste à la demande par /api/v1/employes) */
    const pagine = grand && opts.annuairePagine !== false;
    let empsVue = vue.emps || [];
    if (pagine){ const u = (ref.users||[]).find(x=>x.login === login), moi = u && emps.find(e=>e.id === u.empId);
      empsVue = moi ? empsVue.filter(e=>String(e.mat) === String(moi.mat) || String(e.chefMat||"") === String(moi.mat)) : []; }
    for (const c of COLLS){
      if (c === "emps"){ parties.push('"emps":'+JSON.stringify(empsVue)); continue; }
      let sql = "SELECT data FROM enreg WHERE coll=?", a = [c];
      if (DATEES.indexOf(c) >= 0 && du){
        const d0 = (c === "dmd" || c === "notifs") ? depuis : du;
        sql += " AND (d IS NULL OR d>=?)"; a.push(d0);
      }
      /* v56.14 : annuaire servi par page → les badgeages (et données biométriques) ne sont envoyés que pour l'utilisateur
         et son équipe ; le journal complet est servi par page (/api/v1/pointages). Évite ~4 Mo à l'ouverture à 20 000. */
      if (pagine && (c === "ptg" || c === "bio")){
        const mats = Array.from(new Set(empsVue.map(e=>String(e.mat))));
        if (!mats.length){ parties.push('"'+c+'":[]'); continue; }
        sql += " AND mat IN ("+mats.map(()=>"?").join(",")+")"; a.push(...mats);
      } else { sql += f.sql; a.push(...f.a); }
      const lignes = await B.all(sql, ...a);
      parties.push('"'+c+'":['+lignes.map(l=>l.data).join(",")+']');
    }
    const refVue = Object.assign({}, vue); COLLS.forEach(c=>{ delete refVue[c]; });
    return '{"ref":'+JSON.stringify(refVue)+',"colls":{'+parties.join(",")+'},"fenetre":{"du":'+JSON.stringify(du||null)+'},"mode":'+JSON.stringify(grand ? "grand" : "normal")+',"effectif":'+nb+',"annuaire":'+JSON.stringify(pagine ? "pagine" : "complet")+'}';
  }
  async function chargerPeriode(login, du, au, mats){
    const ref = await referentiel() || {};
    const {P} = await perimetreDe(ref, login);
    let set = P.set;
    if (mats && mats.length){ const m = new Set(mats.map(String)); set = set === null ? m : new Set(Array.from(set).filter(x=>m.has(x))); }
    const f = filtreMat(set);
    const parties = [];
    for (const c of DATEES){
      const lignes = await B.all("SELECT data FROM enreg WHERE coll=? AND d>=? AND d<=?"+f.sql, c, du, au, ...f.a);
      parties.push('"'+c+'":['+lignes.map(l=>l.data).join(",")+']');
    }
    return '{"colls":{'+parties.join(",")+'},"du":'+JSON.stringify(du)+',"au":'+JSON.stringify(au)+'}';
  }
  async function synchroniser(login, paquet, opts){
    /* 56.33.11 : envoi sans paramétrage (salariés, badgeages…) → paramétrage partagé en lecture (copie de surface ; le
       document n'est pas réécrit) au lieu d'une relecture complète (~8 Mo avec 50 000 comptes) */
    const sansRef = !paquet.ref || !Object.keys(paquet.ref).length;
    const refL = sansRef ? await referentielLecture() : null;
    const ref = refL ? Object.assign({}, refL, {__versions:Object.assign({}, refL.__versions || {})}) : await referentiel() || {};
    const {P} = await perimetreDe(refL || ref, login);
    /* 56.33.11 : administrateur = compte administrateur (rôle tenu par le serveur) ou profil de niveau admin existant */
    const admin = !!P.u && ((opts && opts.admin === true) || (!!P.profil && PERIM.niveauProfil(P.profil) === "admin"));
    if (!P.u) return {ok:false, ignores:["compte inconnu"]};
    const dansPerim = m => admin || P.set === null || (P.set && P.set.has(String(m)));
    const ignores = [], touches = new Set(), refCles = [], conflits = [], nouvellesVersions = {ref:{}, colls:{}}, refusEmps = [];
    let nbEcrits = 0;
    await B.transaction(async ()=>{
      const r = paquet.ref || {};
      let refModifie = false;
      const avantDec = ref.anoDec || {};
      /* v49 : verrouillage optimiste — chaque rubrique du référentiel et chaque enregistrement porte une version ;
         une écriture fondée sur une version dépassée est refusée (conflit signalé) au lieu d'écraser en silence */
      const vers = ref.__versions || (ref.__versions = {});
      const basesRef = paquet.basesRef || {};
      for (const k of Object.keys(r)){
        if (COLLS.indexOf(k) >= 0 || k.indexOf("__") === 0) continue;
        const fusion = (k === "users" && !admin) || (k === "anoDec" && !admin);
        if (!fusion && basesRef[k] !== undefined && Number(basesRef[k]) !== Number(vers[k]||0)){ conflits.push({type:"ref", cle:k}); continue; }
        if (k === "users" && !admin){
          const moi = (r.users||[]).find(x=>x && x.id === P.u.id);
          if (moi){ ref.users = (ref.users||[]).map(u=>u.id !== P.u.id ? u : Object.assign({}, u, pick(moi, ["ntfVus","derniereConx","langue","prefs","homeLayout"]))); refModifie = true; }
          continue;
        }
        /* décisions sur les anomalies : droit de correction des pointages (PTG ≥ saisie) sur son périmètre, jamais sur
           ses propres journées (56.33.11 : avant, tout utilisateur — y compris le portail salarié — justifiait ses retards) */
        if (k === "anoDec" && !admin){
          if (!PERIM.peutEcrire(P.profil, "corrections")){ ignores.push("anoDec (droit insuffisant)"); continue; }
          const moi = P.u.empId ? ((await employes()).find(e=>e.id === P.u.empId) || {}).mat : null;
          const n = Object.assign({}, avantDec);
          Object.keys(r.anoDec||{}).forEach(id=>{ const mat = id.split("|")[1]; if (dansPerim(mat) && String(mat) !== String(moi)) n[id] = r.anoDec[id]; });
          ref.anoDec = n; refModifie = true; refCles.push(k); continue;
        }
        if (k === "corbeilleCfg" && !(r.corbeilleCfg && CORB_CHOIX.indexOf(Number(r.corbeilleCfg.jours)) >= 0)){ ignores.push("corbeilleCfg (durée non prévue)"); continue; }
        /* v55 : rubrique d'un module inactif ou non accordé par la licence : refusée par le serveur */
        if (API.moduleRefus){ const mo = API.moduleRefus("ref", k); if (mo){ ignores.push(k+" (module "+mo+" non activé)"); continue; } }
        /* v52 : une clôture ne se modifie ni ne se retire (plus de réouverture) ; une nouvelle clôture est refusée tant que
           des journées de la période attendent un traitement ou une validation */
        if (k === "clotures"){
          const av = ref.clotures || [], ap = Array.isArray(r.clotures) ? r.clotures : [];
          const parId = new Map(ap.map(x=>[x && x.id, x]));
          const retiree = av.find(x=>!parId.has(x.id)), modifiee = av.find(x=>parId.has(x.id) && JSON.stringify(parId.get(x.id)) !== JSON.stringify(x));
          if (retiree || modifiee){ ignores.push("clotures (une clôture ne se modifie ni ne se rouvre : utilisez un ajustement de période antérieure)"); continue; }
          const nouvelles = ap.filter(x=>x && !av.some(y=>y.id === x.id));
          let motifC = "";
          for (const c of nouvelles){ if (API.verifierCloture){ motifC = await API.verifierCloture(c); if (motifC) break; } }
          if (motifC){ ignores.push("clotures ("+motifC+")"); continue; }
        }
        /* v51 : une version de règle publiée est immuable (invariant protégé par le serveur, même pour un administrateur) */
        if (k === "reglesV"){ const motif = controleReglesV(ref.reglesV || [], r.reglesV || [], ref); if (motif){ ignores.push("reglesV ("+motif+")"); continue; } }
        if (admin || (Array.isArray(r[k]) && PERIM.peutEcrire(P.profil, k))){ ref[k] = r[k]; refModifie = true; refCles.push(k); }
        else ignores.push(k);
      }
      refCles.forEach(k=>{ vers[k] = Number(vers[k]||0) + 1; nouvellesVersions.ref[k] = vers[k]; });
      if (refModifie){
        (ref.users||[]).forEach(u=>{ if (u){ delete u.mdp; delete u.mdpHisto; delete u.codeReset; } });
        await B.run("UPDATE kv SET valeur=?, version=version+1, maj=?, par=? WHERE cle=?", JSON.stringify(ref), new Date().toISOString(), login, CLE_APP);
      }
      /* décisions nouvelles ou retirées : jours à recalculer */
      if (refCles.indexOf("anoDec") >= 0){
        const apres = ref.anoDec || {};
        new Set(Object.keys(avantDec).concat(Object.keys(apres))).forEach(id=>{
          if (JSON.stringify(avantDec[id]) !== JSON.stringify(apres[id])){ const p = id.split("|"); if (p[1] && p[2]) touches.add(p[1]+"|"+p[2]); }
        });
      }
      const colls = paquet.colls || {};
      for (const c of Object.keys(colls)){
        if (COLLS.indexOf(c) < 0){ ignores.push(c); continue; }
        if (!admin && !PERIM.peutEcrire(P.profil, c)){ ignores.push(c); continue; }
        if (c === "ajust"){ ignores.push("ajust (ajustements par l'écran dédié uniquement)"); continue; }
        if (API.moduleRefus){ const mo = API.moduleRefus("coll", c); if (mo){ ignores.push(c+" (module "+mo+" non activé)"); continue; } }
        const immuable = c === "audit" || c === "journal";
        const clotC = (ref.clotures||[]).reduce((x, y)=>y.jusqu > x ? y.jusqu : x, "");
        const fermee = o => { if (!clotC || !o) return false; if (c === "dmd") return (o.du || o.d || "9999") <= clotC; if (c === "ptg" || c === "abs" || c === "corrections"){ const dd = dateDe(c, o); return !!dd && dd <= clotC; } return false; };
        const libre = c === "notifs" || c === "audit" || c === "journal";
        let refus = 0, clotRefus = false;
        /* 56.33.11 : unicité du matricule, du badge et du CIN contrôlée sur TOUT le personnel. L'écran ne vérifiait que les
           salariés chargés dans le navigateur : en grand effectif (annuaire paginé), un badge ou un CIN déjà attribué à un
           autre salarié était accepté (badgeages attribués au mauvais salarié). Seule une valeur nouvelle ou modifiée est
           contrôlée : un doublon ancien ne bloque pas l'enregistrement des autres champs. */
        const UNI = c === "emps" ? indexUnicite(await employes()) : null;
        for (const x of (colls[c].put||[])){
          if (!x || x.id === undefined){ refus++; continue; }
          /* 56.33.11 : identifiant et matricule contrôlés (un identifiant contenant « " » injectait des attributs dans les
             écrans des valideurs : zone invisible déclenchant une validation) */
          if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(String(x.id)) || (x.mat != null && /["'<>&`\\]/.test(String(x.mat)))){ refus++; ignores.push(c+" (identifiant invalide)"); continue; }
          const av = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", c, String(x.id));
          const avant = av ? JSON.parse(av.data) : null;
          if (immuable && avant){ if (JSON.stringify(avant) !== JSON.stringify(x)) refus++; continue; }
          if (fermee(x) || fermee(avant)){ refus++; clotRefus = true; continue; }
          /* conflit : l'enregistrement a changé sur le serveur depuis que le client l'a lu */
          if (!immuable && avant && Number(avant.__v||0) !== Number(x.__v||0)){ conflits.push({type:"enreg", coll:c, id:String(x.id), mat:avant.mat||""}); continue; }
          if (UNI){ const d = doublonEmp(UNI, x, avant); if (d){ refus++; refusEmps.push(d); continue; } }
          if (!admin){
            if (avant && avant.mat && !dansPerim(avant.mat)){ refus++; continue; }
            if (x.mat && !dansPerim(x.mat) && !(libre && !avant)){ refus++; continue; }
          }
          let v = immuable ? x : Object.assign({}, x, {__v:Number((avant && avant.__v)||0) + 1});
          if (c === "emps" && avant && P.profil && P.profil.persoMasque){ v = Object.assign({}, v); ["cin","email","tel","adresse","urgenceNom","urgenceLien","urgenceTel","pin","badge","naissance"].forEach(k=>{ if (v[k] === "•••") v[k] = avant[k]; }); }
          await ecrire(c, v, c === "emps" ? avant : undefined); nbEcrits++;
          if (UNI) UNI_CHAMPS.forEach(k=>{ const a = normUni(avant && avant[k]), n = normUni(v[k]); if (a && UNI[k].get(a) === String(v.id)) UNI[k].delete(a); if (n) UNI[k].set(n, String(v.id)); });
          if (c === "ptg" && API.tracerPtg && (!avant || JSON.stringify(Object.assign({}, avant, {__v:0})) !== JSON.stringify(Object.assign({}, v, {__v:0})))) await API.tracerPtg(login, avant, v);
          if (!immuable) (nouvellesVersions.colls[c] = nouvellesVersions.colls[c] || {})[String(x.id)] = v.__v;
          [avant, v].forEach(o=>joursDe(c, o).forEach(d=>touches.add(o.mat+"|"+d)));
          if (c === "emps") touches.add(v.mat+"|*");
        }
        for (const id of (colls[c].del||[])){
          if (immuable){ refus++; continue; }
          const av = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", c, String(id)); if (!av) continue;
          const avant = JSON.parse(av.data);
          if (!admin && avant.mat && !dansPerim(avant.mat)){ refus++; continue; }
          if (fermee(avant)){ refus++; clotRefus = true; continue; }
          const bv = (colls[c].delv || {})[String(id)];
          if (bv !== undefined && Number(bv) !== Number(avant.__v||0)){ conflits.push({type:"enreg", coll:c, id:String(id), mat:avant.mat||"", suppression:true}); continue; }
          await B.run("DELETE FROM enreg WHERE coll=? AND id=?", c, String(id)); nbEcrits++;
          if (c === "ptg" && API.tracerPtg) await API.tracerPtg(login, avant, null);
          if (c === "emps") CACHE_EMPS = null;
          joursDe(c, avant).forEach(d=>touches.add(avant.mat+"|"+d));
        }
        if (refus) ignores.push(c+" ("+refus+" refusé(s)"+(clotRefus ? ", dont période clôturée : ajustement de période antérieure requis" : "")+")");
      }
    });
    return {ok:true, ignores, ecrits:nbEcrits, ref, touches:Array.from(touches), refCles, conflits, versions:nouvellesVersions, refusEmps};
  }
  /* 56.33.11 : index d'unicité des salariés (matricule, badge, CIN), recalculé seulement quand la liste change */
  const UNI_CHAMPS = ["mat", "badge", "cin"], UNI_LIB = {mat:"matricule", badge:"badge", cin:"CIN"};
  const normUni = v => String(v == null ? "" : v).trim().toLowerCase();
  let UNI_CACHE = null;
  function indexUnicite(l){
    if (!UNI_CACHE || UNI_CACHE.l !== l){
      const ix = {l}; UNI_CHAMPS.forEach(k=>{ ix[k] = new Map(); });
      l.forEach(e=>UNI_CHAMPS.forEach(k=>{ const v = normUni(e[k]); if (v && !ix[k].has(v)) ix[k].set(v, String(e.id)); }));
      UNI_CACHE = ix;
    }
    /* copie de travail : les écritures du lot y sont reportées sans toucher au cache partagé */
    const w = {}; UNI_CHAMPS.forEach(k=>{ w[k] = new Map(UNI_CACHE[k]); }); return w;
  }
  function doublonEmp(UNI, x, avant){
    for (const k of UNI_CHAMPS){
      const v = normUni(x[k]); if (!v || v === "•••" || (avant && normUni(avant[k]) === v)) continue;
      const autre = UNI[k].get(v);
      if (autre && autre !== String(x.id)) return {id:String(x.id), mat:String(x.mat||""), champ:k, valeur:String(x[k]).trim(),
        message:"Enregistrement refusé : le "+UNI_LIB[k]+" « "+String(x[k]).trim()+" » est déjà attribué à un autre salarié."};
    }
    return null;
  }
  /* contrôle préalable (écran salarié) : toutes les valeurs déjà attribuées, sans nommer l'autre salarié */
  async function unicite(x){
    const l = await employes(), ix = indexUnicite(l), avant = l.find(e=>String(e.id) === String(x.id)) || null, out = [];
    UNI_CHAMPS.forEach(k=>{ const v = normUni(x[k]); if (!v || v === "•••" || (avant && normUni(avant[k]) === v)) return;
      const autre = ix[k].get(v); if (autre && autre !== String(x.id)) out.push({champ:k, valeur:String(x[k]).trim()}); });
    return out;
  }
  /* 56.33.11 : comptages mémorisés 5 min (écran État du système) : un COUNT(*) sur plusieurs millions de badgeages
     prend plus d'une seconde à chaque ouverture */
  let STATS = null;
  async function statistiques(){
    if (STATS && Date.now() - STATS.t < 300000) return Object.assign({}, STATS.o);
    const o = await statistiquesCalcul(); STATS = {t:Date.now(), o}; return Object.assign({}, o);
  }
  async function statistiquesCalcul(){
    const o = {}; (await B.all("SELECT coll, COUNT(*) n FROM enreg GROUP BY coll")).forEach(r=>{ o[r.coll] = Number(r.n); });
    const m = await B.get("SELECT MIN(d) a, MAX(d) b FROM enreg WHERE coll='ptg'");
    o.ptgDu = m && m.a; o.ptgAu = m && m.b;
    return o;
  }
  /* v56 : purge de la corbeille par le serveur selon la durée fixée par l'administrateur (7 à 365 jours, 30 par défaut),
     même si personne n'ouvre l'écran : les copies d'éléments supprimés (données personnelles comprises) ne dépassent
     jamais la durée annoncée */
  const CORB_CHOIX = [7, 15, 30, 60, 90, 180, 365];
  async function purgerCorbeille(){
    return B.transaction(async ()=>{
      const r = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP); if (!r) return 0;
      const ref = JSON.parse(r.valeur); if (!Array.isArray(ref.corbeille) || !ref.corbeille.length) return 0;
      const j = CORB_CHOIX.indexOf(Number((ref.corbeilleCfg||{}).jours)) >= 0 ? Number(ref.corbeilleCfg.jours) : 30;
      const limite = Date.now() - j*86400000, avant = ref.corbeille.length;
      ref.corbeille = ref.corbeille.filter(c=>!c || !c.ts || c.ts > limite);
      const n = avant - ref.corbeille.length; if (!n) return 0;
      ref.__versions = ref.__versions || {}; ref.__versions.corbeille = Number(ref.__versions.corbeille||0) + 1;
      await B.run("UPDATE kv SET valeur=?, version=version+1, maj=?, par=? WHERE cle=?", JSON.stringify(ref), new Date().toISOString(), "systeme", CLE_APP);
      return n;
    });
  }
  const API = {purgerCorbeille, tracerPtg:null, verifierCloture:null, moduleRefus:null, oublierEmployes(){ CACHE_EMPS = null; }, surEmp(fn){ SUR_EMP = fn; }, COLLS, DATEES, migrer, referentiel, employes, unicite, perimetreDe, charger, chargerPeriode, synchroniser, statistiques, ecrire, ecrireLot, filtreMat, referentielLecture};
  return API;
}
function controleReglesV(avant, apres, ref){
  const auj = new Date().toISOString().slice(0, 10);
  const clot = (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, "");
  const parId = new Map((apres||[]).map(x=>[x && x.id, x]));
  const fige = ["code","niveau","cible","valeur","valid_from","version","priorite"];
  for (const v of avant){
    if (!v || v.statut !== "publiee" && v.statut !== "retiree") continue;
    const n = parId.get(v.id);
    if (!n) return "suppression d'une version publiée";
    for (const f of fige) if (JSON.stringify(n[f]) !== JSON.stringify(v[f])) return "modification de la version publiée "+v.code+" v"+v.version+" ("+f+")";
    if ((v.valid_to || "") !== (n.valid_to || "")){
      if (v.valid_to) return "fin de validité déjà fixée pour "+v.code+" v"+v.version;
      if (!n.valid_to || n.valid_to < v.valid_from) return "fin de validité invalide";
      if (clot && n.valid_to < clot) return "fin de validité dans une période clôturée";
    }
    if (v.statut !== n.statut && !(v.statut === "publiee" && n.statut === "retiree" && v.valid_from > auj)) return "changement de statut interdit pour "+v.code+" v"+v.version;
  }
  const anciens = new Set(avant.map(x=>x && x.id));
  for (const n of (apres||[])) if (n && !anciens.has(n.id) && n.statut === "publiee" && clot && n.valid_from <= clot) return "nouvelle version dans une période clôturée";
  for (const n of (apres||[])) if (n && anciens.has(n.id)){ const v = avant.find(x=>x.id === n.id); if (v.statut === "brouillon" && n.statut === "publiee" && clot && n.valid_from <= clot) return "publication dans une période clôturée"; }
  return "";
}
function pick(o, ks){ const r = {}; ks.forEach(k=>{ if (k in o) r[k] = o[k]; }); return r; }
module.exports = {creer, dateDe, COLLS, CLE_APP};
