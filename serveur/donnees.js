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
    case "audit": return String(x.ts||"").slice(0,10) || null;
    /* correctif 13 : les entrées des règles automatiques portent « at » (sans « ts ») : jamais datées, elles étaient
       renvoyées à chaque chargement quelle que soit la fenêtre (volume sans limite à 20 000 salariés) */
    case "journal": return String(x.ts||x.at||"").slice(0,10) || null;
    default: return null;
  }
}
/* jours touchés par un enregistrement (pour invalider les résultats calculés) */
function joursDe(coll, x){
  if (!x || !x.mat) return [];
  if (coll === "dmd" && x.du){ const out = []; let k = x.du; const fin = x.au || x.du; let g = 0; while (k <= fin && g++ < 400){ out.push(k); k = plus1(k); } return out; }
  const d = dateDe(coll, x); return d ? [d] : [];
}
const ETATS_DMD = ["attente","acceptee","refusee","annulee"];
const RANG = {lecture:1, saisie:2, validation:3, config:4};
/* correctif 18 : circuit de validation appliqué par le serveur (même logique que l'écran) — valideur du niveau en cours :
   responsable direct (hier), responsable du responsable (hier2), responsable du service ou du service parent
   (resp, respParent), profil désigné (profil:…, droit Absences ≥ validation, salarié du périmètre) ou compte désigné
   (user:…) ; délégation de périmètre en cours acceptée ; jamais le demandeur lui-même */
const jourLocal = () => { const n = new Date(), z = v => String(v).padStart(2, "0"); return n.getFullYear()+"-"+z(n.getMonth()+1)+"-"+z(n.getDate()); };
function circuitPourSrv(ref, emp, tt){
  if (!emp) return null;
  const arbre = id => { const a = new Set([id]); let aj = true; while (aj){ aj = false; (ref.depts || []).forEach(d=>{ if (d && a.has(d.parent) && !a.has(d.id)){ a.add(d.id); aj = true; } }); } return a; };
  return (ref.circuits || []).find(c=>c && !((c.types || []).length && c.types.indexOf(tt) < 0) && !((c.sites || []).length && c.sites.indexOf(emp.siteId) < 0) && !((c.depts || []).length && !c.depts.some(id=>arbre(id).has(emp.deptId)))) || null;
}
function valideurNiveau(ref, emps, niv, emp){
  if (!niv || !emp) return null;
  const parMat = m => emps.find(e=>String(e.mat) === String(m)), present = e => !!e && !(e.sortie && e.sortie < jourLocal());
  const q = niv.qui || "hier";
  if (q === "hier"){ const c = emp.chefMat ? parMat(emp.chefMat) : null; return present(c) ? {mat:String(c.mat)} : null; }
  if (q === "hier2"){ const c = emp.chefMat ? parMat(emp.chefMat) : null, c2 = c && c.chefMat ? parMat(c.chefMat) : null; return present(c2) ? {mat:String(c2.mat)} : null; }
  if (q === "resp" || q === "respParent"){ let d = (ref.depts || []).find(x=>x.id === emp.deptId), n = 0; if (q === "respParent" && d) d = (ref.depts || []).find(x=>x.id === d.parent);
    while (d && n++ < 12){ if (d.resp){ const e = parMat(d.resp); if (present(e)) return {mat:String(e.mat)}; } d = (ref.depts || []).find(x=>x.id === d.parent); } return null; }
  if (q.indexOf("profil:") === 0) return (ref.profils || []).some(p=>p.id === q.slice(7)) ? {profilId:q.slice(7)} : null;
  if (q.indexOf("user:") === 0){ const u = (ref.users || []).find(x=>x.id === q.slice(5) && x.actif !== false); return u ? {userId:u.id} : null; }
  return null;
}
function estValideur(ref, emps, P, v, emp){
  const u = P.u || {}, d = jourLocal(), moiEmp = u.empId ? emps.find(e=>e.id === u.empId) : null;
  const delegue = vu => !!vu && (vu.delegPerim || []).some(g=>g && g.a === u.id && g.du <= d && d <= g.au);
  if (v.mat){ if (moiEmp && String(moiEmp.mat) === v.mat) return true; const ve = emps.find(e=>String(e.mat) === v.mat); return delegue(ve && (ref.users || []).find(x=>x.empId === ve.id && x.actif !== false)); }
  if (v.userId) return u.id === v.userId || delegue((ref.users || []).find(x=>x.id === v.userId));
  if (v.profilId){ const pr = P.profil || {}; return pr.id === v.profilId && (RANG[(pr.droits || {}).ABS] || 0) >= 3 && (P.set === null || P.set.has(String(emp.mat))); }
  return false;
}
function decisionDmd(avant, x, P, login, admin, ctx){
  const ea = avant ? (avant.etat || "attente") : null, en = x.etat || "attente";
  if (ETATS_DMD.indexOf(en) < 0) return {refus:"état inconnu"};
  const decision = en === "acceptee" || en === "refusee";
  if (!admin && ctx){
    const {ref, emps} = ctx, emp = emps.find(e=>String(e.mat) === String(x.mat)), u = P.u || {};
    const soi = !!(emp && u.empId && emp.id === u.empId), rangAbs = RANG[((P.profil || {}).droits || {}).ABS] || 0;
    /* niveau qui ne peut pas être sauté : un valideur existe, autre que le demandeur, sans seuil de durée */
    const bloquant = n => { if (Number(n && n.min) > 0) return false; const v = valideurNiveau(ref, emps, n, emp); return !!v && !(v.mat && emp && v.mat === String(emp.mat)); };
    if (!avant){
      /* création : circuit et niveau fixés par le serveur ; demande déjà décidée seulement par la RH, pour un tiers */
      if (decision && (soi || rangAbs < 3)) return {refus:"une demande ne peut être créée déjà décidée que par la validation RH, pour un autre salarié"};
      if (!decision && en === "attente"){
        const c = circuitPourSrv(ref, emp, x.tt), id = c ? c.id : null;
        if (String(x.circuitId || "") !== String(id || "")) x = Object.assign({}, x, {circuitId:id});
        /* niveaux sautés seulement s'ils n'ont aucun valideur (ou un seuil de durée) */
        const niv = Math.max(0, Math.min(Number(x.niveau) || 0, c ? (c.niveaux || []).length : 0));
        for (let i = 0; i < niv; i++){ const n = c.niveaux[i]; if (bloquant(n)) return {refus:"niveau de validation sauté"}; }
        x = Object.assign({}, x, {niveau:niv});
      }
    } else if (ea === "attente"){
      if (String(x.circuitId || "") !== String(avant.circuitId || "")) return {refus:"le circuit d'une demande ne se change pas"};
      const c = (ref.circuits || []).find(z=>z && z.id === avant.circuitId), nAv = Number(avant.niveau) || 0, nAp = Number(x.niveau) || 0;
      const avance = (decision || (en === "attente" && nAp !== nAv));
      if (en === "attente" && nAp < nAv) return {refus:"niveau de validation incohérent"};
      if (avance){
        if (soi) return {refus:"le demandeur ne peut pas valider sa propre demande"};
        const v = c ? valideurNiveau(ref, emps, (c.niveaux || [])[nAv], emp) : null;
        const ok = v ? estValideur(ref, emps, P, v, emp) : (rangAbs >= 3 && (P.set === null || P.set.has(String(x.mat))));
        if (!ok) return {refus:"vous n'êtes pas le valideur de ce niveau du circuit"};
        /* niveaux franchis d'un coup : seulement ceux sans valideur (ou à seuil de durée), comme le fait l'écran */
        const L = c ? (c.niveaux || []) : [], jusqu = en === "acceptee" ? L.length : en === "attente" ? nAp : nAv + 1;
        for (let i = nAv + 1; i < Math.min(jusqu, L.length); i++){ const n = L[i]; if (bloquant(n)) return {refus:"des niveaux de validation restent à franchir"}; }
      }
      if (en === "annulee" && !soi && rangAbs < 3) return {refus:"seul le demandeur ou la RH annule une demande"};
    }
  }
  if (ea && ea !== en){
    /* transitions permises : en attente → acceptée / refusée / annulée ; acceptée → annulée (rectification) */
    const ok = (ea === "attente" && en !== "attente") || (ea === "acceptee" && en === "annulee");
    if (!ok && !admin) return {refus:"une demande "+ea+" ne peut pas devenir "+en};
  }
  if (decision && ea !== en){
    /* décision : saisie directe d'une absence acceptée (droit Absences saisie) ou validation (droit Absences validation,
       ou valideur désigné : responsable du salarié, délégation — contrôlés par le circuit dans le navigateur) */
    const rang = admin ? 4 : (RANG[((P.profil || {}).droits || {}).ABS] || 0);
    if (rang < 2 && !admin) return {refus:"droit de décision requis"};
    /* administrateur : reprise de données (historique) — date de décision fournie conservée si elle est valide */
    if (admin && /^\d{4}-\d{2}-\d{2}$/.test(String(x.valideLe || ""))) return {x};
    const u = P.u || {}, n = new Date(), z = v => String(v).padStart(2, "0");
    return {x:Object.assign({}, x, {valideLe:n.getFullYear()+"-"+z(n.getMonth()+1)+"-"+z(n.getDate()), validePar:String(u.nom || login || ""), valideParCompte:login})};
  }
  /* décision déjà prise : date et auteur ne se réécrivent pas */
  if (avant && ea === en && (en === "acceptee" || en === "refusee") && !admin)
    return {x:Object.assign({}, x, {valideLe:avant.valideLe, validePar:avant.validePar, valideParCompte:avant.valideParCompte})};
  return {x};
}
const REGLE_ACTIONS = ["desac_compte","desac_portail","bloquer_badge","retirer_acces","retirer_bio","archiver","notif_rh","maj_workflows"];
const coupe = (v, n) => String(v == null ? "" : v).slice(0, n);
function horodatage(){ const n = new Date(), p = v => String(v).padStart(2, "0"), j = n.getFullYear()+"-"+p(n.getMonth()+1)+"-"+p(n.getDate());
  return {min:j+" "+p(n.getHours())+":"+p(n.getMinutes()), sec:j+" "+p(n.getHours())+":"+p(n.getMinutes())+":"+p(n.getSeconds())}; }
function plus1(k){ const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)+1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function creer(B, PERIM){
  let MIG_JOURNAL = false;
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
    /* correctif 13 : traces d'audit et du journal sans matricule (sécurité, clôtures, paramétrage, imports) réservées aux
       comptes qui consultent l'administration (droit Système) — auparavant envoyées à tout compte, portail compris */
    const sysLu = !!opts.admin || (!!P.profil && (PERIM.niveauProfil(P.profil) === "admin" || ({lecture:1, saisie:2, validation:3, config:4}[(P.profil.droits || {}).SYS] || 0) >= 1));
    if (!MIG_JOURNAL){ MIG_JOURNAL = true; try {
      /* entrées des règles automatiques sans date (champ « at » seul) : datées une fois pour toutes */
      for (const r of await B.all("SELECT id, data FROM enreg WHERE coll='journal' AND d IS NULL")){ let x = null; try { x = JSON.parse(r.data); } catch(e){} const d = dateDe("journal", x); if (d) await B.run("UPDATE enreg SET d=?, mois=? WHERE coll='journal' AND id=?", d, d.slice(0,7), r.id); }
    } catch(e){} }
    /* v56.3 : grand effectif → annuaire servi par page ; le navigateur ne reçoit que la fiche de l'utilisateur et de
       son équipe directe (le reste à la demande par /api/v1/employes) */
    const pagine = grand && opts.annuairePagine !== false;
    let empsVue = vue.emps || [];
    /* correctif 22 : sans droit sur un module, seules ses propres données de ce module sont envoyées (un profil
       « aucun droit » recevait tous les badgeages, demandes et fiches de son périmètre) */
    const RGm = m => opts.admin || !P.profil || PERIM.niveauProfil(P.profil) === "admin" ? 4 : (RANG[(P.profil.droits || {})[m]] || 0);
    const uMoi = (ref.users || []).find(x=>x && String(x.login).toLowerCase() === String(login).toLowerCase()), eMoi = uMoi && uMoi.empId ? emps.find(e=>e.id === uMoi.empId) : null;
    const fMoi = filtreMat(new Set(eMoi ? [String(eMoi.mat)] : [])), MODC = {ptg:"PTG", corrections:"PTG", ajust:"PTG", bio:"PTG", dmd:"ABS", abs:"ABS"};
    if (RGm("EMP") === 0 && PERIM.niveauProfil(P.profil) !== "simple") empsVue = empsVue.filter(e=>(eMoi && String(e.mat) === String(eMoi.mat)) || (eMoi && String(e.chefMat || "") === String(eMoi.mat)));
    if (pagine){ const u = (ref.users||[]).find(x=>x.login === login), moi = u && emps.find(e=>e.id === u.empId);
      empsVue = moi ? empsVue.filter(e=>String(e.mat) === String(moi.mat) || String(e.chefMat||"") === String(moi.mat)) : []; }
    for (const c of COLLS){
      if (c === "emps"){ parties.push('"emps":'+JSON.stringify(empsVue)); continue; }
      /* correctif 18 : données d'un module désactivé non servies (badgeages, absences, demandes…) */
      if (API.moduleRefus && API.moduleRefus("coll", c)){ parties.push('"'+c+'":[]'); continue; }
      let sql = "SELECT data FROM enreg WHERE coll=?", a = [c];
      if (DATEES.indexOf(c) >= 0 && du){
        const d0 = (c === "dmd" || c === "notifs") ? depuis : du;
        /* 56.33.11 : une demande encore en attente reste chargée quelle que soit sa date (sinon elle disparaissait de
           l'écran des valideurs une fois sortie de la fenêtre de chargement, sans jamais être traitée) */
        if (c === "dmd"){ sql += " AND (d IS NULL OR d>=? OR data LIKE ? OR data NOT LIKE ?)"; a.push(d0, '%"etat":"attente"%', '%"etat":%'); }
        else { sql += " AND (d IS NULL OR d>=?)"; a.push(d0); }
      }
      /* v56.14 : annuaire servi par page → les badgeages (et données biométriques) ne sont envoyés que pour l'utilisateur
         et son équipe ; le journal complet est servi par page (/api/v1/pointages). Évite ~4 Mo à l'ouverture à 20 000. */
      if (pagine && (c === "ptg" || c === "bio")){
        const mats = Array.from(new Set(empsVue.map(e=>String(e.mat))));
        if (!mats.length){ parties.push('"'+c+'":[]'); continue; }
        sql += " AND mat IN ("+mats.map(()=>"?").join(",")+")"; a.push(...mats);
      } else if (MODC[c] && RGm(MODC[c]) === 0){ sql += fMoi.sql.replace("mat IS NULL OR mat='' OR ", ""); a.push(...fMoi.a); }
      else { sql += f.sql; a.push(...f.a); }
      if (c === "audit" && !sysLu) sql += " AND mat IS NOT NULL AND mat<>'' AND mat<>'—'";
      /* correctif 16 : journal des événements (écran réservé au droit Système) non envoyé aux autres comptes */
      if (c === "journal" && !sysLu){ parties.push('"journal":[]'); continue; }
      const lignes = await B.all(sql, ...a);
      parties.push('"'+c+'":['+lignes.map(l=>l.data).join(",")+']');
    }
    const refVue = Object.assign({}, vue); COLLS.forEach(c=>{ delete refVue[c]; });
    /* correctif 18 : copie d'annulation d'import jamais servie ; corbeille (copies complètes d'éléments supprimés, hors
       périmètre compris) réservée au droit Système */
    delete refVue.impLast; if (!sysLu) refVue.corbeille = [];
    return '{"ref":'+JSON.stringify(refVue)+',"colls":{'+parties.join(",")+'},"fenetre":{"du":'+JSON.stringify(du||null)+'},"mode":'+JSON.stringify(grand ? "grand" : "normal")+',"effectif":'+nb+',"annuaire":'+JSON.stringify(pagine ? "pagine" : "complet")+'}';
  }
  async function chargerPeriode(login, du, au, mats, colls, admin){
    const ref = await referentiel() || {};
    const {P} = await perimetreDe(ref, login);
    let set = P.set;
    if (mats && mats.length){ const m = new Set(mats.map(String)); set = set === null ? m : new Set(Array.from(set).filter(x=>m.has(x))); }
    const f = filtreMat(set);
    const parties = [];
    /* correctif 13 : collections demandées seulement (ex. demandes pour le Tableau de bord, sans les badgeages) */
    const sysLu = !!admin || (!!P.profil && (PERIM.niveauProfil(P.profil) === "admin" || ({lecture:1, saisie:2, validation:3, config:4}[(P.profil.droits || {}).SYS] || 0) >= 1));
    for (const c of DATEES.filter(x=>(!colls || colls.indexOf(x) >= 0) && (x !== "journal" || sysLu) && !(API.moduleRefus && API.moduleRefus("coll", x)))){
      const lignes = await B.all("SELECT data FROM enreg WHERE coll=? AND d>=? AND d<=?"+f.sql+((c === "audit" || c === "journal") && !sysLu ? " AND mat IS NOT NULL AND mat<>'' AND mat<>'—'" : ""), c, du, au, ...f.a);
      parties.push('"'+c+'":['+lignes.map(l=>l.data).join(",")+']');
    }
    return '{"colls":{'+parties.join(",")+'},"du":'+JSON.stringify(du)+',"au":'+JSON.stringify(au)+'}';
  }
  const controleCircuits = (ref, apres, profils, users) => controleCircuitsBase(B, ref, apres, profils, users);
  const controleSites = async (ref, apres, convs) => controleSitesBase(ref, apres, convs, await employes());
  async function controleJournal(x, P, ref, admin){
    const rang = m => admin ? 4 : (RANG[((P.profil || {}).droits || {})[m]] || 0);
    const codes = l => (Array.isArray(l) ? l : []).map(String).filter(c=>REGLE_ACTIONS.indexOf(c) >= 0);
    if (x.regleId){
      if (!x.mat) return {refus:"salarié manquant"};
      if (rang("EMP") < 2 && !admin) return {refus:"droit Employés (saisie) requis"};
      const r = (ref.regles || []).find(z=>z && z.id === x.regleId);
      /* correctif 18 : règle supprimée ou désactivée entre-temps (poste avec l'ancienne liste) : les actions ont pu être
         faites — l'entrée est gardée, marquée, au lieu d'être refusée (actions sans trace) */
      const horsRegle = !r || r.actif === false || String(r.declencheur) !== String(x.declencheur);
      if (horsRegle){ const e0 = (await employes()).find(z=>String(z.mat) === String(x.mat)); if (!e0) return {refus:"salarié inconnu"};
        return {x:{id:x.id, regleId:String(x.regleId).slice(0, 80), regleNom:coupe(x.regleNom, 120), regleHors:true, declencheur:coupe(x.declencheur, 60), mat:String(e0.mat), employe:coupe((e0.nom || "")+" "+(e0.prenom || ""), 120),
          codes:codes(x.codes), sansEffet:codes(x.sansEffet), refuses:codes(x.refuses), echecs:codes(x.echecs), detail:coupe(x.detail, 200), par:x.par}}; }
      const e = (await employes()).find(z=>String(z.mat) === String(x.mat)); if (!e) return {refus:"salarié inconnu"};
      const permis = new Set((r.actions || []).map(String)), dans = l => codes(l).filter(c=>permis.has(c));
      const jour = String(x.ts || x.at || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      const deja = await B.get("SELECT 1 x FROM enreg WHERE coll='journal' AND mat=? AND data LIKE ? AND data LIKE ? AND (data LIKE ? OR data LIKE ?) LIMIT 1", String(x.mat), '%"regleId":"'+String(r.id).replace(/[%_"]/g, "")+'"%', '%"declencheur":"'+String(r.declencheur).replace(/[%_"]/g, "")+'"%', '%"ts":"'+horodatage().min.slice(0, 10)+'%', '%"at":"'+horodatage().min.slice(0, 10)+'%');
      if (deja && !admin) return {doublon:true};
      /* une action déclarée faite mais que le compte n'a pas le droit de faire (le serveur la refuse) est classée « non faite » */
      const DROIT_ACT = {desac_compte:["SYS",4], desac_portail:["EMP",2], bloquer_badge:["EMP",2], retirer_acces:["EMP",2], retirer_bio:["TER",2], archiver:["EMP",2]};
      const faites = dans(x.codes), ok = faites.filter(c=>!DROIT_ACT[c] || rang(DROIT_ACT[c][0]) >= DROIT_ACT[c][1]);
      const refuses = Array.from(new Set(dans(x.refuses).concat(faites.filter(c=>ok.indexOf(c) < 0))));
      /* libellés reconstruits à l'affichage à partir des codes (dans la langue de l'écran) : les libellés envoyés ne sont plus gardés */
      return {x:{id:x.id, regleId:r.id, regleNom:coupe(r.nom, 120), declencheur:r.declencheur, mat:String(e.mat), employe:coupe((e.nom || "")+" "+(e.prenom || ""), 120),
        codes:ok, sansEffet:dans(x.sansEffet), refuses, echecs:dans(x.echecs), detail:coupe(x.detail, 200), par:x.par}};
    }
    if (rang("SYS") < 2 && !admin) return {refus:"droit Système requis"};
    if (["import","home"].indexOf(String(x.type)) < 0) return {refus:"type d'événement inconnu"};
    return {x:{id:x.id, type:String(x.type), msg:coupe(x.msg, 300), mat:x.mat ? String(x.mat) : undefined}};
  }
  async function synchroniser(login, paquet, opts){
    /* 56.33.11 : envoi sans paramétrage (salariés, badgeages…) → paramétrage partagé en lecture (copie de surface ; le
       document n'est pas réécrit) au lieu d'une relecture complète (~8 Mo avec 50 000 comptes) */
    const sansRef = !paquet.ref || !Object.keys(paquet.ref).length;
    const refL = sansRef ? await referentielLecture() : null;
    const ref = refL ? Object.assign({}, refL, {__versions:Object.assign({}, refL.__versions || {})}) : await referentiel() || {};
    const {P} = await perimetreDe(refL || ref, login);
    /* 56.33.11 : administrateur = compte administrateur (rôle tenu par le serveur) ou profil de niveau admin existant */
    /* correctif 22 : administrateur = rôle du compte vérifié par le serveur (opts.admin), jamais le profil reçu en
       DÉLÉGATION : un compte délégué « Admin » pour une journée se réécrivait administrateur pour de bon */
    const admin = !!P.u && !!opts && opts.admin === true;
    if (!P.u) return {ok:false, ignores:["compte inconnu"]};
    const dansPerim = m => admin || P.set === null || (P.set && P.set.has(String(m)));
    /* correctif 18 : un nouveau salarié est dans le périmètre si la règle du compte l'y place (site, service, équipe) —
       auparavant tout matricule nouveau était refusé à un compte limité, même sur son propre site */
    let PNOUV = null;
    const creationDansPerim = async x => { if (!PNOUV){ const nouv = (((paquet.colls || {}).emps || {}).put || []).filter(z=>z && z.mat); const l = (await employes()).concat(nouv.filter(z=>!(CACHE_EMPS || []).some(e=>e.id === z.id)));
      PNOUV = PERIM.perimetre(Object.assign({}, refL || ref, {emps:l}), login); } return PNOUV.set === null || PNOUV.set.has(String(x.mat)); };
    const corbSrv = [];
    /* correctif 18 : matrice des droits par écran appliquée par le serveur pour la création et la suppression des
       salariés et des badgeages (auparavant seulement masquée dans le navigateur) */
    const ECRAN_COLL = {emps:"emp", ptg:"ptg", corrections:"ptg", dmd:"dmd", abs:"dmd"};
    const acteEcran = (v, acte) => { const m = (P.profil.menus || {})[v], a = ((P.profil.actions || {})[v] || {})[acte]; return m === "masque" || m === "lecture" || a === false; };
    /* correctif 19 : un envoi de l'écran Import (marqueur paquet.import) respecte AUSSI la matrice de l'écran Import */
    const acteRefuse = (c, acte) => { const v = ECRAN_COLL[c]; if (!v || !P.profil) return false;
      return acteEcran(v, acte) || (!!paquet.import && (c === "emps" || c === "ptg") && acteEcran("import", acte)); };
    const ignores = [], touches = new Set(), refCles = [], conflits = [], nouvellesVersions = {ref:{}, colls:{}}, refusEmps = [], nouvellesNotifs = [];
    let nbEcrits = 0; const parColl = {}, refusPar = {};
    await B.transaction(async ()=>{
      const r = paquet.ref || {};
      let refModifie = false;
      const avantDec = ref.anoDec || {};
      /* v49 : verrouillage optimiste — chaque rubrique du référentiel et chaque enregistrement porte une version ;
         une écriture fondée sur une version dépassée est refusée (conflit signalé) au lieu d'écraser en silence */
      const vers = ref.__versions || (ref.__versions = {});
      const basesRef = paquet.basesRef || {};
      const peutK = k => Array.isArray(r[k]) && (admin || PERIM.peutEcrire(P.profil, k));
      let MOTIF_ETATS;
      const motifEtats = () => MOTIF_ETATS !== undefined ? MOTIF_ETATS : (MOTIF_ETATS = controleEtats(ref.etats || [], r.etats, peutK("arits") ? r.arits : ref.arits, peutK("champs") ? r.champs : ref.champs, peutK("profils") ? r.profils : ref.profils));
      const etatsRetenus = () => (Array.isArray(r.etats) && peutK("etats") && !motifEtats()) ? r.etats : (ref.etats || []);
      /* correctif 21 : sites RETENUS (ceux du paramétrage si l'envoi est refusé) pour contrôler les références des autres
         rubriques — auparavant ceux envoyés, même refusés : une convention pouvait viser un site inexistant ; sites du
         périmètre d'un compte limité */
      let SITESP, MOTIF_S, SITES_RET;
      const sitesP = async () => SITESP !== undefined ? SITESP : (SITESP = admin || P.set === null ? null : new Set((await employes()).filter(e=>P.set.has(String(e.mat))).map(e=>e.siteId).concat(((P.profil || {}).sites) || []).filter(Boolean)));
      const motifSites = async () => MOTIF_S !== undefined ? MOTIF_S : (MOTIF_S = !Array.isArray(r.sites) ? "liste attendue" : ((await controleSites(ref, r.sites, peutK("convs") ? r.convs : ref.convs)) || (admin ? "" : controleSitesDroits(ref.sites || [], r.sites, (v, a)=>!P.profil || acteEcran(v, a), await sitesP()))));
      const sitesRetenus = async () => SITES_RET !== undefined ? SITES_RET : (SITES_RET = (Array.isArray(r.sites) && peutK("sites") && !(await motifSites())) ? r.sites : (ref.sites || []));
      for (const k of Object.keys(r)){
        if (COLLS.indexOf(k) >= 0 || k.indexOf("__") === 0) continue;
        const fusion = (k === "users" && !admin) || (k === "anoDec" && !admin);
        if (!fusion && basesRef[k] !== undefined && Number(basesRef[k]) !== Number(vers[k]||0)){ conflits.push({type:"ref", cle:k}); continue; }
        /* correctif 20 : une décision d'anomalie d'une journée clôturée ne se pose ni ne se retire, même par un
           administrateur (elle changeait le sceau de la clôture : « Vérifier » échouait) */
        if (k === "anoDec" && r.anoDec && typeof r.anoDec === "object" && !Array.isArray(r.anoDec)){ const clA = clotDe(ref); if (clA){ const n0 = Object.assign({}, r.anoDec); let nI = 0;
          new Set(Object.keys(n0).concat(admin ? Object.keys(avantDec) : [])).forEach(id=>{ const d = String(id.split("|")[2] || ""); if (!d || d > clA) return; const a = avantDec[id], b = n0[id]; if (JSON.stringify(a) === JSON.stringify(b)) return; nI++; if (a === undefined) delete n0[id]; else n0[id] = a; });
          if (nI) ignores.push("anoDec ("+nI+" décision(s) en période clôturée ignorée(s) : ajustement de période antérieure requis)"); r.anoDec = n0; } }
        /* correctif 22 : un compte ne peut porter (ni recevoir en délégation) qu'un profil existant — un profil inconnu
           donnait à l'écran tous les menus d'administration */
        /* correctif 23 : identifiants sans espaces (« ␣adm » échappait à la double authentification exigée pour « adm ») ;
           date de dernière connexion jamais reprise du navigateur (elle vient du serveur) */
        if (k === "users" && admin && Array.isArray(r.users)){ const avU = new Map((ref.users || []).filter(u=>u && u.id).map(u=>[u.id, u]));
          r.users = r.users.map(u=>{ if (!u || typeof u !== "object") return u; const c = Object.assign({}, u); if (c.login != null) c.login = String(c.login).trim(); const a = avU.get(c.id);
            if (a && a.derniereConx !== undefined) c.derniereConx = a.derniereConx; else delete c.derniereConx; return c; }); }
        if (k === "users" && admin && Array.isArray(r.users)){ const pids = new Set((Array.isArray(r.profils) && peutK("profils") ? r.profils : (ref.profils || [])).map(p=>p && p.id));
          const x = r.users.find(u=>u && ((u.profilId && !pids.has(u.profilId)) || (u.deleg || []).some(d=>d && d.profilId && !pids.has(d.profilId))));
          if (x){ ignores.push("users (compte "+String(x.login || x.id).slice(0, 40)+" : profil inconnu)"); continue; }
          /* correctif 23 : contenu des comptes contrôlé (identifiants en double, salarié inexistant ou déjà rattaché,
             délégations aux dates impossibles, périmètre sur des sites inexistants… étaient enregistrés) */
          const nouvE = ((((paquet.colls || {}).emps) || {}).put || []).filter(z=>z && z.id);
          const mU = controleUsers(ref.users || [], r.users, (await employes()).concat(nouvE), {sites:[].concat(ref.sites || [], Array.isArray(r.sites) ? r.sites : []), depts:[].concat(ref.depts || [], Array.isArray(r.depts) ? r.depts : []), terms:[].concat(ref.terms || [], Array.isArray(r.terms) ? r.terms : [])});
          if (mU){ ignores.push("users ("+mU+")"); continue; }
          /* correctif 23 : au moins un administrateur actif, jamais son propre compte retiré ou désactivé (l'installation se
             retrouvait sans administrateur) ; aucune délégation d'un profil administrateur ; un compte valideur d'un circuit
             ou destinataire d'une délégation de périmètre ne se supprime pas sans prévenir */
          const prR = Array.isArray(r.profils) && peutK("profils") ? r.profils : (ref.profils || []), nivDe = id=>PERIM.niveauProfil(prR.find(p=>p && p.id === id));
          const moiR = r.users.find(u=>u && u.id === (P.u || {}).id);
          if (P.u && (!moiR || moiR.actif === false || nivDe(moiR.profilId) !== "admin")){ ignores.push("users (vous ne pouvez ni retirer, ni désactiver, ni rétrograder votre propre compte administrateur)"); continue; }
          if ((ref.users || []).some(u=>u && u.actif !== false && nivDe(u.profilId) === "admin") && !r.users.some(u=>u && u.actif !== false && nivDe(u.profilId) === "admin")){ ignores.push("users (au moins un administrateur actif requis)"); continue; }
          const avD = new Map((ref.users || []).filter(u=>u && u.id).map(u=>[u.id, JSON.stringify(u.deleg || [])]));
          const dA = r.users.find(u=>u && avD.get(u.id) !== JSON.stringify(u.deleg || []) && (u.deleg || []).some(x=>x && nivDe(x.profilId) === "admin"));
          if (dA){ ignores.push("users (compte « "+String(dA.login).slice(0, 40)+" » : un profil administrateur ne se délègue pas)"); continue; }
          const actifsAp = new Set(r.users.filter(u=>u && u.actif !== false).map(u=>u.id)), partis = (ref.users || []).filter(u=>u && u.actif !== false && !actifsAp.has(u.id));
          if (partis.length){ const pid = new Set(partis.map(u=>u.id)), circ = Array.isArray(r.circuits) && peutK("circuits") ? r.circuits : (ref.circuits || []);
            const ci = circ.find(c=>c && (c.niveaux || []).some(n=>n && pid.has(String(n.qui || "").slice(5)) && String(n.qui).indexOf("user:") === 0));
            if (ci){ const q = (ci.niveaux.find(n=>n && String(n.qui || "").indexOf("user:") === 0 && pid.has(String(n.qui).slice(5))) || {}).qui; const x = partis.find(u=>"user:"+u.id === q) || {};
              ignores.push("users (compte « "+String(x.login).slice(0, 40)+" » valideur du circuit « "+String(ci.nom || ci.id).slice(0, 60)+" » : changez d'abord le circuit)"); continue; }
            const dg = r.users.find(u=>u && (u.delegPerim || []).some(g=>g && pid.has(g.a)));
            if (dg){ ignores.push("users (compte « "+String(dg.login).slice(0, 40)+" » : sa délégation de périmètre vise un compte retiré ou désactivé)"); continue; } } }
        /* correctif 24 : politique de sécurité contrôlée (bornes de l'écran, types, clés connues, envoi d'e-mails) — tout était
           enregistré : « tentatives -1 », « minLen 10000 », une chaîne à la place de la rubrique, un champ de 3 Mo… */
        if (k === "secu"){ const mS = controleSecu(ref.secu, r.secu); if (mS){ ignores.push("secu ("+mS+")"); continue; } }
        /* correctif 23 : comptes du portail salarié (mot de passe initial = matricule) : profil de niveau « simple » seulement */
        if (k === "secu" && r.secu && r.secu.premiere && r.secu.premiere.profilId){ const pp = (Array.isArray(r.profils) && peutK("profils") ? r.profils : (ref.profils || [])).find(p=>p && p.id === r.secu.premiere.profilId);
          if (!pp || PERIM.niveauProfil(pp) !== "simple"){ ignores.push("secu (profil des comptes du portail : niveau « simple » requis)"); continue; } }
        if (k === "users" && !admin){
          const moi = (r.users||[]).find(x=>x && x.id === P.u.id);
          /* correctif 23 : champs propres bornés (langue connue, préférences ≤ 32 Ko : 20 Mo étaient acceptés et alourdissaient
             l'ouverture de chacun) ; date de dernière connexion jamais reprise du navigateur */
          if (moi){ const p0 = pick(moi, ["ntfVus","langue","prefs","homeLayout"]);
            if ("langue" in p0 && LANGUES_U.indexOf(p0.langue) < 0){ delete p0.langue; ignores.push("users (langue non prévue)"); }
            [["prefs", 32768], ["homeLayout", 32768], ["ntfVus", 262144]].forEach(([c, max])=>{ if (c in p0 && (JSON.stringify(p0[c] === undefined ? null : p0[c]) || "").length > max){ delete p0[c]; ignores.push("users ("+c+" trop volumineux)"); } });
            ref.users = (ref.users||[]).map(u=>u.id !== P.u.id ? u : Object.assign({}, u, p0)); refModifie = true; }
          /* correctif 23 : toute autre modification des comptes est réservée à un administrateur — elle était ignorée sans
             le dire (« ok » affiché, rien d'enregistré) */
          const stU = new Map((ref.users || []).filter(u=>u && u.id).map(u=>[u.id, u])), cleU = u=>JSON.stringify([String(u.login || "").trim(), u.nom || "", u.empId || "", u.profilId || "", u.actif !== false, (u.deleg || []).length ? u.deleg : []]);
          if ((r.users || []).some(u=>u && (!stU.has(u.id) || cleU(stU.get(u.id)) !== cleU(u)))) ignores.push("users (réservé à un administrateur)");
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
          /* correctif 20 : une clôture se crée uniquement par le serveur (POST /api/v1/clotures : bornes, droits, contrôles
             complets, sceau et auteur établis par le serveur) ; auparavant le navigateur fournissait début, fin, auteur
             et empreinte, et une clôture future ou sans contrôle était acceptée */
          const nouvelles = ap.filter(x=>!x || !x.id || !av.some(y=>y.id === x.id));
          if (nouvelles.length){ ignores.push("clotures (une clôture se fait par l'écran Clôture de période)"); continue; }
        }
        /* v51 : une version de règle publiée est immuable (invariant protégé par le serveur, même pour un administrateur) */
        if (k === "reglesV"){ const motif = controleReglesV(ref.reglesV || [], r.reglesV || [], ref); if (motif){ ignores.push("reglesV ("+motif+")"); continue; } }
        /* recette Calendrier : une période clôturée ne change pas (exceptions et trame en vigueur jusqu'à la clôture) */
        /* correctif 7 : zones et portes — pas de zone supprimée encore utilisée, pas de porte retirée avec des lecteurs, identifiants de porte uniques */
        if (k === "zones"){ const motif = controleZones(ref.zones || [], r.zones || [], Array.isArray(r.terms) ? r.terms : (ref.terms || []), await employes()) || siteInconnu(ref.zones, r.zones, await sitesRetenus(), "zone"); if (motif){ ignores.push("zones ("+motif+")"); continue; } }
        /* correctif 8 : plages d'accès — pas de plage supprimée encore utilisée par un planning, intervalles valides */
        /* correctif 9 : plannings d'accès — pas de planning supprimé encore référencé, plages existantes, au moins un jour ouvert */
        /* correctif 10 : terminaux — contrôles côté serveur (adresse, port, n° de série unique, site, usage, bornes), terminaux hors
           périmètre intouchables pour un non-administrateur, dossier du pilote réservé à l'administrateur */
        if (k === "terms"){ const motif = controleTerms(ref.terms || [], r.terms || [], await sitesRetenus(), await sitesP(), admin); if (motif){ ignores.push("terms ("+motif+")"); continue; } }
        if (k === "aplans"){ const motif = controleAplans(ref.aplans || [], r.aplans || [], Array.isArray(r.aplages) ? r.aplages : (ref.aplages || []), await employes()); if (motif){ ignores.push("aplans ("+motif+")"); continue; } }
        if (k === "aplages"){ const motif = controleAplages(ref.aplages || [], r.aplages || [], Array.isArray(r.aplans) ? r.aplans : (ref.aplans || [])); if (motif){ ignores.push("aplages ("+motif+")"); continue; } }
        if (k === "cals"){ const motif = controleCals(ref.cals || [], r.cals || [], ref) || siteInconnu(ref.cals, r.cals, await sitesRetenus(), "calendrier") || controleSupprClos("cals", ref.cals || [], r.cals || [], ref, await employes()); if (motif){ ignores.push("cals ("+motif+")"); continue; } }
        if (k === "jours"){ const motif = controleJours(ref.jours || [], r.jours || [], ref) || controleSupprClos("jours", ref.jours || [], r.jours || [], ref); if (motif){ ignores.push("jours ("+motif+")"); continue; } }
        if (k === "feries"){ const motif = controleFeriesClos(ref.feries || [], r.feries, clotDe(ref)); if (motif){ ignores.push("feries ("+motif+")"); continue; } }
        if (k === "tt"){ const motif = await controleTt(B, ref.tt || [], r.tt || [], ref); if (motif){ ignores.push("tt ("+motif+")"); continue; } }
        /* correctif 14 : les états servant au contrôle des compteurs sont ceux qui seront réellement retenus (ceux du
           paramétrage si l'envoi d'états n'est pas permis ou refusé) — auparavant ceux envoyés par le navigateur, même
           refusés ensuite : un compteur utilisé par un état pouvait être supprimé */
        if (k === "arits"){ const motif = controleArits(ref.arits || [], r.arits || [], ref, etatsRetenus()); if (motif){ ignores.push("arits ("+motif+")"); continue; } }
        /* correctif 14 : contenu des états contrôlé (un élément invalide rendait l'application inutilisable pour tous) */
        if (k === "etats"){ const motif = motifEtats(); if (motif){ ignores.push("etats ("+motif+")"); continue; } }
        /* correctif 14 : un champ personnalisé qui filtre un état ne peut pas être supprimé (filtre devenu invisible) */
        if (k === "champs" && Array.isArray(r.champs)){ const codes = new Set(r.champs.filter(c=>c && typeof c === "object").map(c=>String(c.code))); const et = etatsRetenus().find(e=>e && e.filtres && typeof e.filtres === "object" && Object.keys(e.filtres).some(c=>e.filtres[c] && !codes.has(c)));
          if (et){ ignores.push("champs (champ utilisé comme filtre par l'état « "+et.nom+" »)"); continue; } }
        /* correctif 18 : profils — un compte non administrateur ne peut ni toucher à son propre profil ni à un profil
           administrateur, ni créer un administrateur, ni accorder plus que ses propres droits ; un profil encore porté
           par un compte et le dernier profil administrateur ne se suppriment pas */
        /* correctif 18 : copie d'annulation d'import (toutes les fiches chargées) jamais stockée dans le paramétrage
           partagé (elle était renvoyée à tous les comptes) */
        if (k === "impLast") continue;
        if (k === "circuits"){ const motif = await controleCircuits(ref, r.circuits, peutK("profils") ? r.profils : ref.profils, peutK("users") ? r.users : ref.users); if (motif){ ignores.push("circuits ("+motif+")"); continue; } }
        if (k === "regles"){ const motif = controleRegles(ref.regles || [], r.regles); if (motif){ ignores.push("regles ("+motif+")"); continue; } }
        if (k === "sites"){ const motif = await motifSites(); if (motif){ ignores.push("sites ("+motif+")"); continue; } }
        if (k === "convs"){ const motif = controleConvs(ref.convs || [], r.convs, await sitesRetenus()) || controleConvsClos(ref.convs || [], r.convs, clotDe(ref)) || controleConvsPerim(ref.convs || [], r.convs, await sitesP()); if (motif){ ignores.push("convs ("+motif+")"); continue; } }
        /* correctif 18 : outils de recette (jeu d'essai) réservés à une installation de recette */
        if (!(opts || {}).recette && Array.isArray(r[k]) && r[k].some(z=>z && typeof z === "object" && (z.recette === true || z.src === "recette" || /^rec_/.test(String(z.id || ""))) && !(ref[k] || []).some(y=>y && y.id === z.id))){ ignores.push(k+" (outils de recette réservés à une installation de recette)"); continue; }
        /* correctif 22 : les profils ne se modifient que par un administrateur (comme l'écran) — un compte « Système
           configuration » de niveau RH élargissait par l'API un profil attribué (périmètre, écrans, matrice) */
        if (k === "profils" && !admin){ ignores.push("profils (réservé à un administrateur)"); continue; }
        if (k === "profils"){ const motif = controleProfils(ref.profils || [], r.profils, P, admin, peutK("users") ? r.users : ref.users, PERIM.niveauProfil) || validerProfils(ref.profils || [], r.profils, ref) || (admin ? "" : controleProfilsFins(ref.profils || [], r.profils, P, await sitesP(), ref)); if (motif){ ignores.push("profils ("+motif+")"); continue; } }
        if (admin || (Array.isArray(r[k]) && PERIM.peutEcrire(P.profil, k))){ ref[k] = r[k]; refModifie = true; refCles.push(k); }
        else ignores.push(k);
      }
      refCles.forEach(k=>{ vers[k] = Number(vers[k]||0) + 1; nouvellesVersions.ref[k] = vers[k]; });
      if (refModifie){
        (ref.users||[]).forEach(u=>{ if (u){ delete u.mdp; delete u.mdpHisto; delete u.codeReset; } });
        delete ref.impLast;
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
        let refus = 0, clotRefus = false;
        /* 56.33.11 : unicité du matricule, du badge et du CIN contrôlée sur TOUT le personnel. L'écran ne vérifiait que les
           salariés chargés dans le navigateur : en grand effectif (annuaire paginé), un badge ou un CIN déjà attribué à un
           autre salarié était accepté (badgeages attribués au mauvais salarié). Seule une valeur nouvelle ou modifiée est
           contrôlée : un doublon ancien ne bloque pas l'enregistrement des autres champs. */
        const UNI = c === "emps" ? indexUnicite(await employes()) : null;
        let MATS_C = null; const matsConnus = async () => MATS_C || (MATS_C = new Set((await employes()).map(e=>String(e.mat))));
        let EPM = null; const empsParMat = async () => EPM || (EPM = new Map((await employes()).map(e=>[String(e.mat), e])));
        let MATS_L = null; const matsLot = async () => MATS_L || (MATS_L = new Set(Array.from(await matsConnus()).concat(c === "emps" ? (colls[c].put || []).map(e=>e && String(e.mat)) : [])));
        /* correctif 19 : chaque fiche non écrite est rendue au navigateur avec son motif (auparavant seuls les doublons de
           CIN/badge l'étaient : l'import annonçait « 6 créés » quand le serveur en avait écrit 2) */
        const PUTS = colls[c].put || [], IGN0 = [], ECR = new Set();
        for (let x of PUTS){ IGN0.push(ignores.length);
          if (!x || x.id === undefined){ refus++; continue; }
          /* 56.33.11 : identifiant et matricule contrôlés (un identifiant contenant « " » injectait des attributs dans les
             écrans des valideurs : zone invisible déclenchant une validation) */
          if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(String(x.id)) || (x.mat != null && /["'<>&`\\]/.test(String(x.mat)))){ refus++; ignores.push(c+" (identifiant invalide)"); continue; }
          const av = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", c, String(x.id));
          const avant = av ? JSON.parse(av.data) : null;
          if (immuable && avant){
            /* correctif 13 : trace renvoyée par le navigateur avec SON auteur et SON heure (celles du serveur font foi) */
            const sans = o => { const y = Object.assign({}, o); if (avant.srv){ delete y.user; delete y.par; delete y.ts; delete y.at; delete y.srv; } return JSON.stringify(y); };
            if (sans(avant) !== sans(x)) refus++; continue; }
          if (fermee(x) || fermee(avant)){ refus++; clotRefus = true; continue; }
          /* conflit : l'enregistrement a changé sur le serveur depuis que le client l'a lu */
          if (!immuable && avant && Number(avant.__v||0) !== Number(x.__v||0)){ conflits.push({type:"enreg", coll:c, id:String(x.id), mat:avant.mat||""}); continue; }
          if (UNI){ const d = doublonEmp(UNI, x, avant); if (d){ refus++; refusEmps.push(d); continue; } }
          if (!admin && !avant && acteRefuse(c, "creer")){ refus++; continue; }
          if (!(opts || {}).recette && !avant && (x.recette === true || x.src === "recette" || /^rec_/.test(String(x.id)))){ refus++; ignores.push(c+" (outils de recette réservés à une installation de recette)"); continue; }
          /* correctif 19 : badgeage — salarié existant et horodatage réel exigés (un import pouvait écrire des badgeages
             sans matricule, ou rattachés à « __proto__ » / « constructor », comptés ensuite nulle part) */
          if (c === "ptg" && (!avant || String(avant.mat) !== String(x.mat) || String(avant.ts) !== String(x.ts))){
            const mm = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2})?$/.exec(String(x.ts || ""));
            if (!mm || !jourReel(mm[1]+"-"+mm[2]+"-"+mm[3]) || +mm[1] < 2000 || +mm[4] > 23 || +mm[5] > 59){ refus++; ignores.push("ptg ("+String(x.mat || "?")+" : horodatage invalide)"); continue; }
            if (!x.mat || !(await matsConnus()).has(String(x.mat))){ refus++; ignores.push("ptg ("+(x.mat ? "matricule inconnu : "+String(x.mat).slice(0, 30) : "matricule absent")+")"); continue; }
            const eP = (await empsParMat()).get(String(x.mat)), dP = String(x.ts).slice(0, 10), demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            if (eP && ((eP.entree && dP < eP.entree) || (eP.sortie && dP > eP.sortie))){ refus++; ignores.push("ptg ("+x.mat+" : badgeage hors de la présence du salarié)"); continue; }
            if (dP > demain){ refus++; ignores.push("ptg ("+x.mat+" : badgeage dans le futur)"); continue; }
            if (x.sens != null && x.sens !== "E" && x.sens !== "S"){ refus++; ignores.push("ptg ("+x.mat+" : sens inconnu)"); continue; }
          }
          /* l'origine « badge » (pointeuse) est réservée à la chaîne d'ingestion : un navigateur ne peut pas se faire passer
             pour un terminal */
          if (c === "ptg" && x.src === "badge" && (!avant || avant.src !== "badge") && !(opts || {}).recette){ refus++; ignores.push("ptg (origine « badge » réservée aux pointeuses)"); continue; }
          /* correctif 18 : absence saisie directement — liée à une demande acceptée, ou par la validation RH pour un tiers */
          if (c === "abs" && !admin && !avant){ let okA = false;
            if (x.dmdId){ const dm = await B.get("SELECT data FROM enreg WHERE coll='dmd' AND id=?", String(x.dmdId)); const dd = dm ? JSON.parse(dm.data) : null; okA = !!dd && dd.etat === "acceptee" && String(dd.mat) === String(x.mat); }
            if (!okA){ const ue = (await employes()).find(e=>e.id === (P.u || {}).empId); okA = (RANG[((P.profil || {}).droits || {}).ABS] || 0) >= 3 && !(ue && String(ue.mat) === String(x.mat)); }
            if (!okA){ refus++; ignores.push("abs (absence sans demande acceptée)"); continue; } }
          /* correctif 18 : fiche salarié — dates, adresse électronique et rattachements contrôlés */
          if (c === "emps"){ const m = controleEmp(x, ref, avant, await matsLot()) || controleEmpClos(x, avant, clotC); if (m){ refus++; ignores.push("emps ("+(x.mat || x.id)+" : "+m+")"); continue; } }
          /* modification d'une fiche refusée par la matrice ; les droits d'accès aux zones (écran Droits d'accès) restent
             modifiables par leur propre écran */
          if (!admin && avant && c !== "emps" && ECRAN_COLL[c] && acteRefuse(c, "modifier") && JSON.stringify(Object.assign({}, avant, {__v:0})) !== JSON.stringify(Object.assign({}, x, {__v:0}))){ refus++; ignores.push(c+" (modification non permise par la matrice de l'écran)"); continue; }
          if (!admin && avant && c === "emps" && acteRefuse(c, "modifier")){ const sans = o => { const y = Object.assign({}, o); ["acces", "__v"].forEach(k=>delete y[k]); return JSON.stringify(y); };
            if (sans(avant) !== sans(x)){ refus++; continue; } }
          if (!admin){
            if (avant && avant.mat && !dansPerim(avant.mat)){ refus++; continue; }
            /* correctif 13 : une trace d'audit ou du journal ne peut concerner qu'un salarié du périmètre de son auteur
               (seules les notifications restent permises hors périmètre : avis au valideur) */
            if (x.mat && !dansPerim(x.mat) && !(c === "notifs" && !avant) && !(c === "emps" && !avant && await creationDansPerim(x))){ refus++; continue; }
          }
          /* correctif 15 : décisions sur les demandes — transitions d'état contrôlées, date et auteur de la décision imposés
             par le serveur (auparavant ceux du navigateur : « acceptée le 01/01/2019 par Directeur général » acceptés) */
          if (c === "dmd" && !admin && avant && avant.etat !== x.etat && /^(acceptee|refusee)$/.test(String(x.etat || "")) && acteRefuse(c, "valider")){ refus++; ignores.push("dmd (validation non permise par la matrice de l'écran)"); continue; }
          if (c === "dmd"){ const d = decisionDmd(avant, x, P, login, admin, {ref, emps:await employes()}); if (d.refus){ refus++; ignores.push("dmd ("+d.refus+")"); continue; } x = d.x; }
          /* correctif 16 : journal des événements — contenu reconstruit par le serveur (règle existante et active, codes
             d'action connus, salarié du périmètre, nom et libellés repris du paramétrage) ; une même règle n'est
             journalisée qu'une fois par salarié, déclencheur et jour ; imports et accueil réservés au droit Système */
          if (c === "journal" && !avant){ const j = await controleJournal(x, P, ref, admin);
            if (j.doublon) continue;
            if (j.refus){ refus++; ignores.push("journal ("+j.refus+")"); continue; } x = j.x; }
          /* correctif 13 : auteur et heure d'une trace d'audit ou du journal imposés par le serveur (compte de la session,
             horloge du serveur) — auparavant ceux envoyés par le navigateur, qui pouvait attribuer une trace à un autre compte */
          if (immuable && !avant){ const h = horodatage(); x = Object.assign({}, x, c === "audit" ? {user:login, ts:h.min, srv:1} : {par:login, ts:h.min, at:h.sec, srv:1}); }
          let v = immuable ? x : Object.assign({}, x, {__v:Number((avant && avant.__v)||0) + 1});
          if (c === "emps" && avant && PERIM.masquePerso(P)){ v = Object.assign({}, v); ["cin","email","tel","adresse","urgenceNom","urgenceLien","urgenceTel","pin","badge","naissance"].forEach(k=>{ if (v[k] === "•••") v[k] = avant[k]; }); }
          await ecrire(c, v, c === "emps" ? avant : undefined); nbEcrits++; ECR.add(String(v.id)); { const pc = parColl[c] || (parColl[c] = {crees:0, maj:0, suppr:0, mats:[]}); pc[avant ? "maj" : "crees"]++; if (v.mat && pc.mats.length < 30 && pc.mats.indexOf(String(v.mat)) < 0) pc.mats.push(String(v.mat)); }
          if (c === "notifs" && !avant) nouvellesNotifs.push(v);
          if (UNI) UNI_CHAMPS.forEach(k=>{ const a = normUni(avant && avant[k]), n = normUni(v[k]); if (a && UNI[k].get(a) === String(v.id)) UNI[k].delete(a); if (n) UNI[k].set(n, String(v.id)); });
          if (c === "ptg" && API.tracerPtg && (!avant || JSON.stringify(Object.assign({}, avant, {__v:0})) !== JSON.stringify(Object.assign({}, v, {__v:0})))) await API.tracerPtg(login, avant, v);
          if (!immuable) (nouvellesVersions.colls[c] = nouvellesVersions.colls[c] || {})[String(x.id)] = v.__v;
          [avant, v].forEach(o=>joursDe(c, o).forEach(d=>touches.add(o.mat+"|"+d)));
          if (c === "emps") touches.add(v.mat+"|*");
        }
        if (c === "emps" || c === "ptg"){ IGN0.push(ignores.length); const dejaE = new Set(refusEmps.map(r=>String(r.id))), conf = new Set(conflits.filter(k=>k.coll === c).map(k=>String(k.id)));
          PUTS.forEach((x, i)=>{ if (!x || x.id === undefined) return; const id = String(x.id); if (ECR.has(id) || conf.has(id) || dejaE.has(id)) return;
            const m = ignores.slice(IGN0[i], IGN0[i+1]).join(" ; ") || (c === "emps" ? "hors de votre périmètre ou droit insuffisant" : "refusé (périmètre, droit ou période clôturée)");
            if (c === "emps") refusEmps.push({id, mat:String(x.mat || ""), message:m}); else (refusPar[c] = refusPar[c] || []).push({id, mat:String(x.mat || ""), message:m}); }); }
        for (const id of (colls[c].del||[])){
          if (immuable){ refus++; continue; }
          if (!admin && acteRefuse(c, "supprimer")){ refus++; continue; }
          const av = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", c, String(id)); if (!av) continue;
          const avant = JSON.parse(av.data);
          if (!admin && avant.mat && !dansPerim(avant.mat)){ refus++; continue; }
          if (fermee(avant)){ refus++; clotRefus = true; continue; }
          /* correctif 20 : un salarié présent dans une période clôturée ne se supprime plus (ses journées closes
             disparaissaient des états) : saisir une date de sortie */
          if (c === "emps" && clotC && ((avant.entree && avant.entree <= clotC) || await B.get("SELECT 1 x FROM enreg WHERE coll IN ('ptg','abs') AND mat=? AND d<=? LIMIT 1", String(avant.mat || ""), clotC))){ refus++; ignores.push("emps ("+(avant.mat || id)+" : présent dans une période clôturée — saisissez une date de sortie au lieu de supprimer)"); continue; }
          const bv = (colls[c].delv || {})[String(id)];
          if (bv !== undefined && Number(bv) !== Number(avant.__v||0)){ conflits.push({type:"enreg", coll:c, id:String(id), mat:avant.mat||"", suppression:true}); continue; }
          await B.run("DELETE FROM enreg WHERE coll=? AND id=?", c, String(id)); nbEcrits++; (parColl[c] || (parColl[c] = {crees:0, maj:0, suppr:0, mats:[]})).suppr++;
          corbSrv.push({ent:c, row:avant});
          if (c === "ptg" && API.tracerPtg) await API.tracerPtg(login, avant, null);
          if (c === "emps") CACHE_EMPS = null;
          /* correctif 11 : suppression d'un salarié signalée (retrait des appareils, effacement des données biométriques) */
          if (c === "emps" && SUR_EMP){ const a = avant; setImmediate(()=>{ try { SUR_EMP(a, null); } catch(e){} }); }
          joursDe(c, avant).forEach(d=>touches.add(avant.mat+"|"+d));
        }
        if (refus) ignores.push(c+" ("+refus+" refusé(s)"+(clotRefus ? ", dont période clôturée : ajustement de période antérieure requis" : "")+")");
      }
    });
    /* correctif 18 : corbeille tenue par le serveur pour les suppressions d'un compte qui ne peut pas l'écrire lui-même
       (le navigateur annonçait « part à la corbeille » mais l'entrée était ignorée : suppression définitive) */
    if (corbSrv.length && refCles.indexOf("corbeille") < 0) try {
      const rr = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP), rf = JSON.parse(rr.valeur), z = v => String(v).padStart(2, "0"), n = new Date();
      const quand = n.getFullYear()+"-"+z(n.getMonth()+1)+"-"+z(n.getDate())+" "+z(n.getHours())+":"+z(n.getMinutes());
      rf.corbeille = corbSrv.map(e=>({cid:"cb_"+Date.now().toString(36)+Math.random().toString(36).slice(2, 7), ent:e.ent, row:e.row, nom:String(e.row.nom ? e.row.nom+" "+(e.row.prenom || "") : (e.row.mat || "")+" "+(e.row.ts || e.row.d || e.row.du || "")).trim(), ts:Date.now(), quand, par:(P.u && P.u.nom) || login, srv:1, impacts:[]})).concat(Array.isArray(rf.corbeille) ? rf.corbeille : []).slice(0, 2000);
      rf.__versions = rf.__versions || {}; rf.__versions.corbeille = Number(rf.__versions.corbeille || 0) + 1; nouvellesVersions.ref.corbeille = rf.__versions.corbeille;
      await B.run("UPDATE kv SET valeur=?, version=version+1, maj=? WHERE cle=?", JSON.stringify(rf), new Date().toISOString(), CLE_APP);
    } catch(e){}
    return {ok:true, ignores, ecrits:nbEcrits, parColl, refusPar, ref, touches:Array.from(touches), refCles, conflits, versions:nouvellesVersions, refusEmps, nouvellesNotifs};
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
      /* correctif 18 : entrée sans date ou datée dans le futur traitée comme expirée (jamais purgée auparavant) */
      ref.corbeille = ref.corbeille.filter(c=>c && Number.isFinite(Number(c.ts)) && Number(c.ts) > limite && Number(c.ts) <= Date.now() + 86400000);
      const n = avant - ref.corbeille.length; if (!n) return 0;
      ref.__versions = ref.__versions || {}; ref.__versions.corbeille = Number(ref.__versions.corbeille||0) + 1;
      await B.run("UPDATE kv SET valeur=?, version=version+1, maj=?, par=? WHERE cle=?", JSON.stringify(ref), new Date().toISOString(), "systeme", CLE_APP);
      return n;
    });
  }
  const API = {purgerCorbeille, tracerPtg:null, verifierCloture:null, moduleRefus:null, oublierEmployes(){ CACHE_EMPS = null; }, surEmp(fn){ SUR_EMP = fn; }, COLLS, DATEES, migrer, referentiel, employes, unicite, perimetreDe, charger, chargerPeriode, synchroniser, statistiques, ecrire, ecrireLot, filtreMat, referentielLecture};
  return API;
}
/* recette Arithmétique : code figé ; formule en vigueur jusqu'à la clôture inchangée (formule datée) ; unité, période et
   agrégation figées après une clôture ; suppression refusée si une formule ou un état l'utilise */
/* correctif 14 : définition des états — seuls les états ajoutés ou modifiés sont contrôlés (un état ancien devenu
   incomplet ne bloque pas l'enregistrement des autres) ; un état cité par un profil ne peut pas être supprimé */
/* correctif 18 : circuits de validation — contenu contrôlé ; un circuit encore utilisé par une demande en attente ne
   se supprime pas (les demandes restaient sans valideur) */
async function controleCircuitsBase(B, ref, apres, profils, users){
  if (!Array.isArray(apres)) return "liste attendue";
  const ID = /^[A-Za-z0-9_.:-]{1,80}$/, ids = new Set(), QUI = ["hier", "hier2", "resp", "respParent"];
  const tts = new Set((ref.tt || []).map(x=>x && x.id)), sites = new Set((ref.sites || []).map(x=>x && x.id)), depts = new Set((ref.depts || []).map(x=>x && x.id));
  const avant = new Map((ref.circuits || []).filter(c=>c && c.id).map(c=>[String(c.id), JSON.stringify(c)]));
  for (const c of apres){
    if (!c || typeof c !== "object" || Array.isArray(c) || !ID.test(String(c.id))) return "circuit invalide";
    if (ids.has(String(c.id))) return "identifiant en double"; ids.add(String(c.id));
    if (avant.get(String(c.id)) === JSON.stringify(c)) continue;
    const l = "circuit « "+(c.nom || c.id)+" » : ";
    if (!String(c.nom || "").trim() || String(c.nom).length > 120) return l+"nom obligatoire (120 caractères au plus)";
    if (!Array.isArray(c.niveaux) || !c.niveaux.length || c.niveaux.length > 10) return l+"de 1 à 10 niveaux de validation";
    for (const n of c.niveaux){
      if (!n || typeof n !== "object") return l+"niveau invalide";
      const q = String(n.qui || "hier");
      if (QUI.indexOf(q) < 0 && !(q.indexOf("profil:") === 0 && (profils || []).some(p=>p && p.id === q.slice(7))) && !(q.indexOf("user:") === 0 && (users || []).some(u=>u && u.id === q.slice(5) && u.actif !== false))) return l+"valideur inconnu ("+q+")";
      for (const k of ["delai", "min"]) if (n[k] !== undefined && n[k] !== null && n[k] !== "" && !(Number(n[k]) >= 0 && Number(n[k]) <= 365)) return l+k+" invalide";
    }
    if ((c.types || []).some(x=>!tts.has(x))) return l+"type d'absence inconnu";
    if ((c.sites || []).some(x=>!sites.has(x))) return l+"site inconnu";
    if ((c.depts || []).some(x=>!depts.has(x))) return l+"service inconnu";
  }
  for (const id of avant.keys()) if (!ids.has(id)){
    const n = await B.get("SELECT COUNT(*) n FROM enreg WHERE coll='dmd' AND data LIKE ? AND (data LIKE ? OR data NOT LIKE ?)", '%"circuitId":"'+id.replace(/[%_"]/g, "")+'"%', '%"etat":"attente"%', '%"etat":%');
    if (Number(n && n.n) > 0) return "le circuit « "+id+" » est utilisé par "+n.n+" demande(s) en attente : traitez-les ou modifiez le circuit au lieu de le supprimer";
  }
  return "";
}
/* correctif 18 : règles automatiques — déclencheur et actions connus, nom, activation */
function controleRegles(avant, apres){
  if (!Array.isArray(apres)) return "liste attendue";
  const ID = /^[A-Za-z0-9_.:-]{1,80}$/, DECL = ["employe.sorti", "employe.mutation", "employe.hors_effectif", "employe.cree"], ids = new Set();
  const av = new Map((avant || []).filter(r=>r && r.id).map(r=>[String(r.id), JSON.stringify(r)]));
  for (const r of apres){
    if (!r || typeof r !== "object" || Array.isArray(r) || !ID.test(String(r.id))) return "règle invalide";
    if (ids.has(String(r.id))) return "identifiant en double"; ids.add(String(r.id));
    if (av.get(String(r.id)) === JSON.stringify(r)) continue;
    const l = "règle « "+String(r.nom || r.id).slice(0, 60)+" » : ";
    if (!String(r.nom || "").trim() || String(r.nom).length > 120) return l+"nom obligatoire (120 caractères au plus)";
    if (DECL.indexOf(r.declencheur) < 0) return l+"déclencheur inconnu";
    if (!Array.isArray(r.actions) || !r.actions.length || r.actions.some(a=>REGLE_ACTIONS.indexOf(a) < 0) || new Set(r.actions).size !== r.actions.length) return l+"actions invalides (au moins une, sans doublon)";
    if (r.actif !== undefined && typeof r.actif !== "boolean") return l+"activation invalide";
  }
  return "";
}
/* correctif 18 : sites — identifiant, code unique, nom, fuseau horaire réel ; un site utilisé ne se supprime pas */
/* correctif 21 : sites — contrôle complet. Le fuseau réellement utilisé (« tz ») n'était pas contrôlé (seul un
   champ « fuseau » inexistant l'était) : un fuseau faux faisait échouer en erreur 500 tout envoi de badgeages et
   classait « invalides » ceux des pointeuses. Champs typés et bornés, code unique après normalisation (casse,
   espaces, pleine chasse, caractères invisibles), et références de toutes les rubriques vérifiées avant suppression. */
const SITE_ID = /^[A-Za-z0-9_.:-]{1,80}$/, CLES_INTERDITES = new Set(["__proto__", "constructor", "prototype"]);
function codeNorm(c){ return String(c == null ? "" : c).normalize("NFKC").replace(/[\s​-‍⁠﻿]/g, "").toLowerCase(); }
function fuseauOk(tz){ if (typeof tz !== "string" || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat("en-GB", {timeZone:tz}); return true; } catch(e){ return false; } }
async function controleSitesBase(ref, apres, convs, emps){
  if (!Array.isArray(apres)) return "liste attendue";
  const ids = new Set(), av = new Map((ref.sites || []).filter(x=>x && x.id).map(x=>[String(x.id), x]));
  const codes = new Map();
  for (const x of apres){
    if (!x || typeof x !== "object" || Array.isArray(x) || !SITE_ID.test(String(x.id)) || CLES_INTERDITES.has(String(x.id))) return "site invalide (identifiant)";
    if (ids.has(String(x.id))) return "identifiant en double"; ids.add(String(x.id));
    const cn = codeNorm(x.code); if (cn) (codes.get(cn) || codes.set(cn, []).get(cn)).push(x);
  }
  for (const x of apres){
    const a = av.get(String(x.id)); if (a && JSON.stringify(a) === JSON.stringify(x)) continue;
    const l = "site « "+String(typeof x.nom === "string" ? x.nom : x.id).slice(0, 60)+" » : ";
    if (Object.keys(x).some(k=>CLES_INTERDITES.has(k))) return l+"champ interdit";
    if (JSON.stringify(x).length > 4000) return l+"fiche trop volumineuse";
    if (typeof x.nom !== "string" || !x.nom.trim() || x.nom.length > 120) return l+"nom obligatoire (120 caractères au plus)";
    if (x.code != null && x.code !== "" && (typeof x.code !== "string" || x.code.length > 20 || !/^[\p{L}\p{N}_.-]+$/u.test(x.code))) return l+"code invalide (20 caractères au plus : lettres, chiffres, « _ », « - », « . »)";
    if (x.ville != null && (typeof x.ville !== "string" || x.ville.length > 120)) return l+"ville invalide (120 caractères au plus)";
    if (x.actif !== undefined && typeof x.actif !== "boolean") return l+"état actif/inactif invalide";
    if (!fuseauOk(x.tz)) return l+"fuseau horaire inconnu ("+String(x.tz == null ? "" : x.tz).slice(0, 40)+") — exemple : Africa/Tunis";
    if (x.fuseau !== undefined && !fuseauOk(x.fuseau)) return l+"fuseau horaire inconnu";
    const cn = codeNorm(x.code); if (cn && (codes.get(cn) || []).length > 1) return "code de site en double ("+x.code+")";
  }
  /* suppression : aucune référence restante, dans aucune rubrique */
  const contient = (l, id) => Array.isArray(l) && l.some(v=>String(v) === id);
  for (const id of av.keys()) if (!ids.has(id)){
    const n = (emps || []).filter(e=>e && e.siteId === id).length, f = (k, test) => (ref[k] || []).filter(z=>z && test(z)).length;
    const parts = [[n, "salarié(s)"], [f("terms", z=>z.siteId === id), "terminal(aux)"], [f("depts", z=>z.siteId === id), "service(s)"], [f("cals", z=>z.siteId === id), "calendrier(s)"],
      [(convs || ref.convs || []).filter(c=>c && contient(c.siteIds, id)).length, "convention(s)"], [f("zones", z=>z.siteId === id), "zone(s) d'accès"],
      [f("profils", z=>contient(z.sites, id) || JSON.stringify(z.filtres || {}).indexOf('"'+id+'"') >= 0), "profil(s)"],
      [f("users", z=>contient((z.perim || {}).sites, id) || JSON.stringify(z.delegPerim || []).indexOf('"'+id+'"') >= 0 || JSON.stringify(z.deleg || []).indexOf('"'+id+'"') >= 0), "compte(s)"],
      [f("circuits", z=>contient(z.sites, id)), "circuit(s)"], [f("feries", z=>z.siteId === id || contient(z.sites, id)), "jour(s) férié(s)"], [f("regles", z=>contient(z.siteIds, id) || contient(z.sites, id)), "règle(s)"]];
    const u = parts.filter(x=>x[0]);
    if (u.length) return "le site « "+((av.get(id) || {}).nom || id)+" » est utilisé ("+u.map(x=>x[0]+" "+x[1]).join(", ")+") : désactivez-le plutôt que de le supprimer";
  }
  return "";
}
/* droits sur les sites : matrice de l'écran Sites (créer, modifier, supprimer) et, pour un compte limité, seulement
   les sites de son périmètre (auparavant un profil Paramétrage limité au site s1 renommait, désactivait ou supprimait
   tous les sites malgré l'écran en lecture seule) */
function controleSitesDroits(avant, apres, acteEcran, sitesP){
  if (!Array.isArray(apres)) return "";
  const av = new Map((avant || []).filter(x=>x && x.id).map(x=>[String(x.id), x])), ap = new Map(apres.filter(x=>x && x.id).map(x=>[String(x.id), x]));
  const crees = [...ap.keys()].filter(id=>!av.has(id)), suppr = [...av.keys()].filter(id=>!ap.has(id)), modif = [...ap.keys()].filter(id=>av.has(id) && JSON.stringify(av.get(id)) !== JSON.stringify(ap.get(id)));
  if (crees.length && acteEcran("sites", "creer")) return "création non permise par la matrice de l'écran Sites";
  if (modif.length && acteEcran("sites", "modifier")) return "modification non permise par la matrice de l'écran Sites";
  if (suppr.length && acteEcran("sites", "supprimer")) return "suppression non permise par la matrice de l'écran Sites";
  if (sitesP){ if (crees.length) return "la création d'un site est réservée à un compte sans limite de périmètre";
    const hors = modif.concat(suppr).find(id=>!sitesP.has(id)); if (hors) return "site « "+((av.get(hors) || {}).nom || hors)+" » hors de votre périmètre"; }
  return "";
}
/* correctif 18 : conventions — valeurs numériques bornées, sites existants */
function controleConvs(avant, apres, sites){
  if (!Array.isArray(apres)) return "liste attendue";
  const ID = /^[A-Za-z0-9_.:-]{1,80}$/, ids = new Set(), sv = new Set((sites || []).map(s=>s && s.id));
  const av = new Map((avant || []).filter(x=>x && x.id).map(x=>[String(x.id), JSON.stringify(x)]));
  const num = (v, min, max) => v === undefined || v === null || v === "" || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max);
  for (const c of apres){
    if (!c || typeof c !== "object" || Array.isArray(c) || !ID.test(String(c.id))) return "convention invalide (identifiant)";
    if (ids.has(String(c.id))) return "identifiant en double"; ids.add(String(c.id));
    if (av.get(String(c.id)) === JSON.stringify(c)) continue;
    const l = "convention « "+String(c.nom || c.id).slice(0, 60)+" » : ";
    if (!String(c.nom || "").trim()) return l+"nom obligatoire";
    if (!num(c.baseJour, 1, 24) || !num(c.hebdo, 1, 80) || !num(c.seuil, 0, 80) || !num(c.h1, 0, 80) || !num(c.r1, 0, 300) || !num(c.r2, 0, 300) || !num(c.evStart, 1, 28) || !num(c.cutThresh, 0, 80)) return l+"valeur hors limites";
    if ((c.siteIds || []).some(s=>!sv.has(s))) return l+"site inconnu";
  }
  return "";
}
/* correctif 18 : fiche salarié — dates réelles, entrée avant sortie, adresse électronique, site et service existants */
/* correctif 19 : date réelle aaaa-mm-jj (« 2026-13-45 » levait une exception : erreur 500 au lieu d'un refus) */
function jourReel(j){ j = String(j == null ? "" : j); if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return false; const d = new Date(j+"T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j; }
/* ===== correctif 20 : période clôturée — les données sources d'une journée close ne changent plus ===== */
/* correctif 23 : contrôle des comptes envoyés par un administrateur — seuls les comptes nouveaux ou modifiés sont
   examinés (un ancien compte imparfait ne bloque pas l'écran) */
const LANGUES_U = ["fr","en","ar"], LOGIN_OK = /^[\p{L}\p{N}._@-]{2,64}$/u;
function controleUsers(avant, apres, emps, refs){
  const av = new Map((avant || []).filter(u=>u && u.id).map(u=>[String(u.id), JSON.stringify(u)]));
  const lib = u => "« "+String((u && (u.login || u.id)) || "").slice(0, 40)+" »";
  const empIds = new Set(emps.map(e=>e && e.id)), mats = new Set(emps.map(e=>e && String(e.mat)));
  const ens = l => new Set((l || []).map(x=>x && x.id).filter(Boolean)), sites = ens(refs.sites), depts = ens(refs.depts), terms = ens(refs.terms);
  const ids = new Map(), logins = new Map(), parEmp = new Map(), uids = new Set(apres.map(u=>u && String(u.id)));
  for (const u of apres){
    if (!u || typeof u !== "object" || Array.isArray(u)) return "entrée invalide";
    const ch = av.get(String(u.id)) !== JSON.stringify(u);
    const id = String(u.id == null ? "" : u.id), lg = String(u.login == null ? "" : u.login), lgM = lg.toLowerCase();
    if (!id || id.length > 64) return "compte sans identifiant interne";
    if (ids.has(id)) return "identifiant interne « "+id.slice(0, 40)+" » en double";
    ids.set(id, ch);
    if (logins.has(lgM) && (ch || logins.get(lgM))) return "identifiant "+lib(u)+" déjà utilisé (majuscules et minuscules ne distinguent pas deux comptes)";
    logins.set(lgM, ch);
    if (u.empId){ const k = String(u.empId); if (parEmp.has(k) && (ch || parEmp.get(k).ch)) return "le salarié de "+lib(u)+" est déjà rattaché au compte "+lib(parEmp.get(k).u); parEmp.set(k, {u, ch}); }
    if (!ch) continue;
    if (!LOGIN_OK.test(lg)) return "identifiant "+lib(u)+" invalide : 2 à 64 caractères, lettres, chiffres, point, tiret, souligné ou @";
    const nom = String(u.nom == null ? "" : u.nom);
    if (nom.length > 120 || /[<>]/.test(nom) || /^[=+@\t\r]/.test(nom)) return "nom de "+lib(u)+" invalide (120 caractères au plus, sans < > ni formule)";
    if (u.empId && !empIds.has(u.empId)) return "compte "+lib(u)+" rattaché à un salarié inexistant";
    if (u.langue !== undefined && u.langue !== "" && LANGUES_U.indexOf(u.langue) < 0) return "langue de "+lib(u)+" non prévue (fr, en, ar)";
    for (const [c, max] of [["prefs", 32768], ["homeLayout", 32768], ["ntfVus", 262144]]) if (u[c] !== undefined && (JSON.stringify(u[c]) || "").length > max) return c+" de "+lib(u)+" trop volumineux";
    if (u.deleg !== undefined && !Array.isArray(u.deleg)) return "délégations de "+lib(u)+" invalides";
    const dl = (u.deleg || []).slice().sort((a, b)=>String((a || {}).du) < String((b || {}).du) ? -1 : 1);
    for (let i = 0; i < dl.length; i++){ const d = dl[i] || {};
      if (!jourReel(d.du) || !jourReel(d.au)) return "délégation de "+lib(u)+" : dates invalides";
      if (d.du > d.au) return "délégation de "+lib(u)+" : la date de début ("+jjD(d.du)+") suit la date de fin ("+jjD(d.au)+")";
      if (!d.profilId) return "délégation de "+lib(u)+" sans profil";
      if (i && d.du <= dl[i-1].au) return "délégations de "+lib(u)+" qui se chevauchent ("+jjD(d.du)+")"; }
    if (u.delegPerim !== undefined && !Array.isArray(u.delegPerim)) return "délégations de périmètre de "+lib(u)+" invalides";
    for (const g of (u.delegPerim || [])){ if (!g || !g.a || !uids.has(String(g.a))) return "délégation de périmètre de "+lib(u)+" vers un compte inexistant";
      if (String(g.a) === id) return "délégation de périmètre de "+lib(u)+" vers lui-même";
      if (!jourReel(g.du) || !jourReel(g.au) || g.du > g.au) return "délégation de périmètre de "+lib(u)+" : dates invalides"; }
    /* périmètre propre : seules les valeurs AJOUTÉES doivent exister (un site supprimé depuis ne bloque pas le compte) */
    const q = u.perim, q0 = (av.has(id) ? (JSON.parse(av.get(id)) || {}).perim : null) || {};
    if (q !== undefined && q !== null){ if (typeof q !== "object" || Array.isArray(q)) return "périmètre de "+lib(u)+" invalide";
      for (const [c, set, n] of [["sites", sites, "site"], ["depts", depts, "service"], ["terms", terms, "terminal"], ["mats", mats, "matricule"], ["exclus", mats, "matricule exclu"]]){ const l = q[c];
        if (l === undefined) continue; if (!Array.isArray(l) || l.length > 50000) return "périmètre de "+lib(u)+" invalide ("+c+")";
        const deja = new Set((Array.isArray(q0[c]) ? q0[c] : []).map(String)), num = c === "mats" || c === "exclus";
        const x = l.find(v=>!deja.has(String(v)) && !set.has(num ? String(v) : v)); if (x !== undefined) return "périmètre de "+lib(u)+" : "+n+" « "+String(x).slice(0, 30)+" » inexistant"; } }
  }
  return "";
}
const SECU_NUM = {minLen:[8, 64], historique:[0, 24], expirationJours:[0, 365], tentatives:[1, 20], verrouillageMin:[1, 1440], sessionInactivite:[1, 480], sessionMax:[1, 72], resetValiditeMin:[5, 1440]};
const SECU_LIB = {minLen:"longueur minimale", historique:"historique", expirationJours:"expiration", tentatives:"tentatives avant verrouillage", verrouillageMin:"durée de verrouillage", sessionInactivite:"inactivité de session", sessionMax:"durée maximale de session", resetValiditeMin:"validité du mot de passe temporaire"};
function controleSecu(avant, apres){
  const obj = o => o && typeof o === "object" && !Array.isArray(o);
  if (!obj(apres)) return "objet attendu";
  if (JSON.stringify(apres).length > 65536) return "trop volumineux";
  const av = obj(avant) ? avant : {}, chg = k => JSON.stringify(av[k]) !== JSON.stringify(apres[k]);
  const entier = (v, a, b) => v === undefined || (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) && Number.isInteger(Number(v)) && Number(v) >= a && Number(v) <= b;
  for (const k of Object.keys(SECU_NUM)) if (chg(k) && !entier(apres[k], SECU_NUM[k][0], SECU_NUM[k][1])) return SECU_LIB[k]+" : entier de "+SECU_NUM[k][0]+" à "+SECU_NUM[k][1];
  for (const k of ["exigerMix", "interdireCourants", "memoriser"]) if (chg(k) && apres[k] !== undefined && typeof apres[k] !== "boolean") return k+" : oui ou non attendu";
  const connues = new Set(Object.keys(SECU_NUM).concat(["exigerMix", "interdireCourants", "memoriser", "smtp", "premiere", "resetValid", "a2f"]));
  const inc = Object.keys(apres).find(k=>!connues.has(k) && chg(k)); if (inc) return "réglage inconnu « "+String(inc).slice(0, 40)+" »";
  if (chg("premiere") && apres.premiere !== undefined){ const p = apres.premiere; if (!obj(p)) return "comptes du portail : objet attendu";
    if (!entier(p.validiteJours, 0, 365)) return "validité du mot de passe initial : entier de 0 à 365";
    for (const b of ["auto", "portailSeul", "exigerMajChiffre", "aideConnexion"]) if (p[b] !== undefined && typeof p[b] !== "boolean") return "comptes du portail : "+b+" oui ou non attendu";
    if (p.profilId !== undefined && typeof p.profilId !== "string") return "comptes du portail : profil invalide"; }
  if (chg("smtp") && apres.smtp !== undefined){ const m = apres.smtp; if (!obj(m)) return "envoi d'e-mails : objet attendu";
    const h = String(m.hote == null ? "" : m.hote).trim();
    if (h && (h.length > 253 || !/^[A-Za-z0-9.:-]+$/.test(h))) return "envoi d'e-mails : nom de serveur invalide";
    if (m.port !== undefined && m.port !== "" && [25, 465, 587, 2525].indexOf(Number(m.port)) < 0) return "envoi d'e-mails : port 25, 465, 587 ou 2525";
    if (m.securite !== undefined && ["aucune", "starttls", "ssl"].indexOf(m.securite) < 0) return "envoi d'e-mails : sécurité aucune, starttls ou ssl";
    if (m.auth === true && m.securite === "aucune" && !/^(localhost|127(\.\d+){3}|::1)$/i.test(h)) return "envoi d'e-mails : authentification sans chiffrement refusée";
    for (const b of ["auth", "notifMail"]) if (m[b] !== undefined && typeof m[b] !== "boolean") return "envoi d'e-mails : "+b+" oui ou non attendu";
    if (String(m.user == null ? "" : m.user).length > 200) return "envoi d'e-mails : identifiant trop long";
    const ex = String(m.expediteur == null ? "" : m.expediteur).trim(); if (ex && (ex.length > 254 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(ex))) return "envoi d'e-mails : adresse d'expédition invalide";
    if (String(m.nomExpediteur == null ? "" : m.nomExpediteur).length > 100 || /[\r\n\u0000-\u001f]/.test(String(m.nomExpediteur || ""))) return "envoi d'e-mails : nom d'expéditeur invalide (100 caractères)";
    if (m.mdp !== undefined && m.mdp !== "") return "envoi d'e-mails : le mot de passe ne s'enregistre pas dans le paramétrage";
    const inc2 = Object.keys(m).find(k=>["hote", "port", "securite", "auth", "user", "expediteur", "nomExpediteur", "notifMail", "mdp"].indexOf(k) < 0); if (inc2) return "envoi d'e-mails : réglage inconnu « "+String(inc2).slice(0, 40)+" »"; }
  return "";
}
function jjD(j){ return String(j || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1"); }
function clotDe(ref){ return ((ref && ref.clotures) || []).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, ""); }
/* fiche salarié : entrée, sortie, historique du calendrier et des champs datés ne se modifient pas avant la clôture */
function controleEmpClos(x, avant, clot){
  if (!clot || !avant) return "";
  const touche = k => { const a = avant[k] || "", n = x[k] || ""; return a !== n && ((a && a <= clot) || (n && n <= clot)); };
  if (touche("entree")) return "date d'entrée en période clôturée (jusqu'au "+jjD(clot)+")";
  if (touche("sortie")) return "date de sortie en période clôturée (jusqu'au "+jjD(clot)+")";
  const dt = h => String(h.from || h.d || h.du || ""), clos = l => JSON.stringify((Array.isArray(l) ? l : []).filter(h=>h && dt(h) <= clot).map(h=>[dt(h), h.calId || h.id || "", h.v === undefined ? "" : h.v]).sort());
  /* fiche ancienne sans historique : l'historique créé ensuite par l'application n'est pas une modification */
  if (Array.isArray(avant.calHist) && avant.calHist.length && clos(avant.calHist) !== clos(x.calHist)) return "calendrier modifié en période clôturée (date d'effet requise après le "+jjD(clot)+")";
  const ha = avant.hist || {}, hx = x.hist || {};
  for (const k of Object.keys(ha)) if (Array.isArray(ha[k]) && ha[k].length && clos(ha[k]) !== clos(hx[k])) return "historique « "+k+" » modifié en période clôturée (date d'effet requise après le "+jjD(clot)+")";
  return "";
}
/* type de journée ou calendrier utilisé, supprimé alors qu'une période est clôturée */
function controleSupprClos(type, avant, apres, ref, emps){
  if (!clotDe(ref) || !Array.isArray(apres)) return "";
  const restent = new Set(apres.map(x=>x && x.id)), partis = avant.filter(x=>x && !restent.has(x.id));
  for (const a of partis){
    const txt = type === "jours" ? JSON.stringify(ref.cals || []) : JSON.stringify((emps || []).map(e=>[e.calId, e.calHist]));
    if (txt.indexOf('"'+a.id+'"') >= 0) return "« "+(a.nom || a.id)+" » est utilisé et une période est clôturée : il ne se supprime plus";
  }
  return "";
}
function controleFeriesClos(avant, apres, clot){
  if (!clot || !Array.isArray(apres)) return "";
  const clos = l => JSON.stringify((l || []).filter(f=>f && String(f.d || "") <= clot).map(f=>JSON.stringify(f)).sort());
  return clos(avant) !== clos(apres) ? "jour férié modifié en période clôturée (jusqu'au "+jjD(clot)+")" : "";
}
/* convention : ses paramètres de calcul (sans date d'effet) s'appliquent à toutes les journées ; une fois une période
   clôturée, ils ne se modifient plus — créer une nouvelle convention ou une version de règle datée (Règles de calcul) */
const CONV_CALC = ["hebdo","seuil","r1","r2","h1","baseJour","evMode","evStart","cutWeek","cutThresh"];
function controleConvsClos(avant, apres, clot){
  if (!clot || !Array.isArray(apres)) return "";
  const parId = new Map(apres.map(c=>[c && c.id, c]));
  for (const a of avant){ if (!a || !(a.siteIds || []).length) continue; const n = parId.get(a.id);
    if (!n) return "convention « "+(a.nom || a.id)+" » utilisée en période clôturée : elle ne se supprime plus";
    if (CONV_CALC.some(k=>JSON.stringify(a[k]) !== JSON.stringify(n[k]))) return "paramètres de calcul de « "+(a.nom || a.id)+" » figés depuis la clôture du "+jjD(clot)+" : créez une version de règle datée (Règles de calcul)"; }
  return "";
}
/* correctif 21 : référence à un site inexistant (calendrier, zone) refusée pour un élément créé ou modifié */
function siteInconnu(avant, apres, sites, lib){
  if (!Array.isArray(apres)) return ""; const ok = new Set((sites || []).map(x=>x && x.id)), av = new Map((avant || []).map(x=>[x && x.id, JSON.stringify(x)]));
  const x = apres.find(z=>z && z.siteId && !ok.has(z.siteId) && av.get(z.id) !== JSON.stringify(z));
  return x ? lib+" « "+String(x.nom || x.id).slice(0, 60)+" » : site inconnu ("+String(x.siteId).slice(0, 40)+")" : "";
}
/* convention partagée avec un site hors du périmètre d'un compte limité : non modifiable par lui */
function controleConvsPerim(avant, apres, sitesP){
  if (!sitesP || !Array.isArray(apres)) return "";
  const av = new Map((avant || []).map(c=>[c && c.id, c])), ap = new Map(apres.map(c=>[c && c.id, c]));
  for (const id of new Set([...av.keys(), ...ap.keys()])){ const a = av.get(id), n = ap.get(id); if (JSON.stringify(a) === JSON.stringify(n)) continue;
    const s2 = ((a && a.siteIds) || []).concat((n && n.siteIds) || []); if (!s2.length || s2.some(x=>!sitesP.has(x))) return "convention « "+String((a || n || {}).nom || id).slice(0, 60)+" » commune à des sites hors de votre périmètre"; }
  return "";
}
function controleEmp(x, ref, avant, mats){
  /* correctif 22 : valeur masquée (« ••• », profil sans accès aux données sensibles) = valeur inchangée */
  if (avant){ const y = Object.assign({}, x); ["cin","email","tel","adresse","urgenceNom","urgenceLien","urgenceTel","pin","badge","naissance"].forEach(k=>{ if (y[k] === "•••") y[k] = avant[k]; }); x = y; }
  /* seuls les champs modifiés sont contrôlés (une fiche ancienne incomplète reste modifiable) */
  const chg = k => !avant || JSON.stringify(avant[k]) !== JSON.stringify(x[k]);
  const dv = k => !chg(k) || !x[k] || jourReel(x[k]);
  for (const k of ["entree", "sortie", "naissance"]) if (!dv(k)) return "date "+k+" invalide";
  if ((chg("entree") || chg("sortie")) && x.entree && x.sortie && x.sortie < x.entree) return "sortie avant l'entrée";
  if (chg("email") && x.email && x.email !== "•••" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email))) return "adresse électronique invalide";
  if (chg("siteId") && x.siteId && !(ref.sites || []).some(s=>s && s.id === x.siteId)) return "site inconnu";
  /* correctif 21 : pas de nouvelle affectation vers un site désactivé */
  if (chg("siteId") && x.siteId && (ref.sites || []).some(s=>s && s.id === x.siteId && s.actif === false)) return "site désactivé";
  if (chg("deptId") && x.deptId && !(ref.depts || []).some(d=>d && d.id === x.deptId)) return "service inconnu";
  /* correctif 19 : nom obligatoire à la création ; responsable existant et différent du salarié */
  if (!avant && !String(x.nom || "").trim()) return "nom obligatoire";
  if (chg("chefMat") && x.chefMat){ if (String(x.chefMat) === String(x.mat)) return "un salarié ne peut pas être son propre responsable";
    if (mats && !mats.has(String(x.chefMat))) return "responsable inconnu ("+String(x.chefMat).slice(0, 30)+")"; }
  return "";
}
/* correctif 22 : contenu d'un profil validé (auparavant seuls l'identifiant et les doublons l'étaient : un droit
   « superuser », un niveau « toString », des services en chaîne faisant échouer en erreur 500 /donnees pour tous les
   comptes du profil, un nom de 300 000 caractères étaient enregistrés) */
const DROITS_OK = new Set(["aucun","lecture","saisie","validation","config"]), NIV_OK = new Set(["simple","avance","rh","admin"]);
const MENU_OK = new Set(["visible","ecriture","lecture","masque"]), ACTES_OK = new Set(["lire","creer","modifier","supprimer","valider","exporter","imprimer"]);
function validerProfils(avant, apres, ref){
  if (!Array.isArray(apres)) return "";
  const av = new Map((avant || []).map(p=>[p && p.id, JSON.stringify(p)])), ID = /^[A-Za-z0-9_.:-]{1,80}$/;
  const sites = new Set((ref.sites || []).map(x=>x && x.id)), depts = new Set((ref.depts || []).map(x=>x && x.id)), champs = new Set((ref.champs || []).map(c=>c && String(c.code)).concat(["STATUT","CATEGORIE","GRADE","CONTRAT"]));
  const obj = v => v && typeof v === "object" && !Array.isArray(v), ids = (l, n) => Array.isArray(l) && l.length <= n && l.every(x=>typeof x === "string" && ID.test(x));
  const interdit = o => obj(o) && Object.keys(o).some(k=>k === "__proto__" || k === "constructor" || k === "prototype");
  for (const p of apres){
    if (av.get(p.id) === JSON.stringify(p)) continue;
    const l = "profil « "+String(typeof p.nom === "string" ? p.nom : p.id).slice(0, 60)+" » : ";
    if (interdit(p) || interdit(p.droits) || interdit(p.menus) || interdit(p.actions) || interdit(p.filtres)) return l+"champ interdit";
    if (JSON.stringify(p).length > 400000) return l+"profil trop volumineux";
    if (typeof p.nom !== "string" || !p.nom.trim() || p.nom.length > 120) return l+"nom obligatoire (120 caractères au plus)";
    if (!obj(p.droits) || Object.keys(p.droits).some(m=>!/^[A-Z]{2,4}$/.test(m) || !DROITS_OK.has(p.droits[m]))) return l+"droits invalides (aucun, lecture, saisie, validation, config)";
    if (p.niveauMenu !== undefined && !NIV_OK.has(p.niveauMenu)) return l+"niveau de menu invalide";
    if (p.menus !== undefined && (!obj(p.menus) || Object.keys(p.menus).some(v=>!/^[A-Za-z0-9_-]{1,40}$/.test(v) || !MENU_OK.has(p.menus[v])))) return l+"visibilité des écrans invalide";
    if (p.actions !== undefined && (!obj(p.actions) || Object.keys(p.actions).some(v=>!/^[A-Za-z0-9_-]{1,40}$/.test(v) || !obj(p.actions[v]) || Object.keys(p.actions[v]).some(a=>!ACTES_OK.has(a) || typeof p.actions[v][a] !== "boolean")))) return l+"matrice des actions invalide";
    if (p.mode !== undefined && p.mode !== "regle" && p.mode !== "liste") return l+"mode de périmètre invalide";
    for (const [k, n] of [["sites", 5000], ["depts", 5000], ["inclus", 50000], ["exclus", 50000]]) if (p[k] !== undefined && !ids(p[k], n)) return l+"liste « "+k+" » invalide";
    if ((p.sites || []).some(x=>!sites.has(x))) return l+"site inconnu dans le périmètre";
    if ((p.depts || []).some(x=>!depts.has(x))) return l+"service inconnu dans le périmètre";
    if (p.filtres !== undefined && (!obj(p.filtres) || Object.keys(p.filtres).some(c=>!champs.has(c) || (p.filtres[c] != null && typeof p.filtres[c] !== "string")))) return l+"filtre sur un champ inconnu";
    for (const f of ["sensibles","cloture","reouverture","a2f","persoMasque"]) if (p[f] !== undefined && typeof p[f] !== "boolean") return l+"« "+f+" » doit valoir oui ou non";
  }
  return "";
}
/* un non-administrateur n'accorde pas plus qu'il n'a : drapeaux (clôture, réouverture, données sensibles), données
   démasquées, périmètre hors de ses propres sites */
function controleProfilsFins(avant, apres, P, sitesP, ref){
  if (!Array.isArray(apres)) return "";
  const av = new Map((avant || []).map(p=>[p && p.id, p])), moi = P.profil || {}, masque = moi.persoMasque === true || moi.sensibles !== true;
  for (const n of apres){ const a = av.get(n.id); if (a && JSON.stringify(a) === JSON.stringify(n)) continue;
    const l = "profil « "+String(n.nom || n.id).slice(0, 60)+" » : ";
    for (const f of ["cloture","reouverture","sensibles"]) if (n[f] === true && !(a && a[f] === true) && moi[f] !== true) return l+"vous ne pouvez pas accorder « "+f+" » que vous n'avez pas";
    if (masque && n.persoMasque !== true && (!a || a.persoMasque === true)) return l+"vous ne pouvez pas démasquer les données personnelles";
    if (sitesP){ const s2 = (n.sites || []).filter(x=>!(a && (a.sites || []).indexOf(x) >= 0)); if (s2.some(x=>!sitesP.has(x)) || (!(n.sites || []).length && !(n.depts || []).length && (n.mode || "regle") === "regle" && a && ((a.sites || []).length || (a.depts || []).length))) return l+"périmètre hors de vos sites"; }
  }
  return "";
}
function controleProfils(avant, apres, P, admin, users, niveau){
  const PERIM = {niveauProfil:niveau};
  if (!Array.isArray(apres)) return "liste attendue";
  const RG = {aucun:0, lecture:1, saisie:2, validation:3, config:4}, ID = /^[A-Za-z0-9_.:-]{1,80}$/;
  const estAdmin = p => !!p && (PERIM.niveauProfil(p) === "admin" || ((p.droits || {}).SYS === "config"));
  const ids = new Set();
  for (const p of apres){ if (!p || typeof p !== "object" || Array.isArray(p) || !ID.test(String(p.id))) return "profil invalide"; if (ids.has(String(p.id))) return "identifiant en double"; ids.add(String(p.id)); }
  const avantId = new Map((avant || []).filter(p=>p && p.id).map(p=>[String(p.id), p])), apresId = new Map(apres.map(p=>[String(p.id), p]));
  /* profil supprimé encore porté par un compte (ou une délégation en cours) */
  for (const [id, p] of avantId) if (!apresId.has(id)){
    const u = (users || []).find(x=>x && (x.profilId === id || (x.deleg || []).some(d=>d && d.profilId === id)));
    if (u) return "le profil « "+(p.nom || id)+" » est attribué au compte "+(u.login || u.id)+" : changez d'abord son profil";
  }
  if (Array.from(avantId.values()).some(estAdmin) && !apres.some(p=>PERIM.niveauProfil(p) === "admin")) return "le dernier profil administrateur ne peut pas être supprimé ni rétrogradé";
  if (admin) return "";
  const moi = P.u || {}, mesProfils = new Set([moi.profilId].concat((moi.deleg || []).map(d=>d && d.profilId)).filter(Boolean).map(String));
  const mesDroits = (P.profil || {}).droits || {};
  for (const id of new Set(Array.from(avantId.keys()).concat(Array.from(apresId.keys())))){
    const a = avantId.get(id), n = apresId.get(id);
    if (a && n && JSON.stringify(a) === JSON.stringify(n)) continue;
    if (mesProfils.has(id)) return "vous ne pouvez pas modifier votre propre profil";
    if (estAdmin(a)) return "seul un administrateur modifie ou supprime un profil administrateur";
    if (n){
      if (estAdmin(n)) return "seul un administrateur crée un profil administrateur (niveau administrateur ou droit Système en paramétrage)";
      const trop = Object.keys(n.droits || {}).find(m=>(RG[(n.droits || {})[m]] || 0) > (RG[mesDroits[m]] || 0));
      if (trop) return "droit "+trop+" supérieur au vôtre";
      if (a && a.a2f === true && n.a2f !== true) return "la double authentification d'un profil ne peut être retirée que par un administrateur";
    }
  }
  return "";
}
function controleEtats(avant, apres, arits, champs, profils){
  if (!Array.isArray(apres)) return "liste attendue";
  const DATE = /^\d{4}-\d{2}-\d{2}$/, ID = /^[A-Za-z0-9_.:-]{1,80}$/;
  const PER = ["jour","semaine","semainep","mois","ev","annee","libre"], MOD = ["jour","cumule"], SCO = ["emp","dept","site"];
  const aIds = new Set((arits || []).filter(a=>a && typeof a === "object").map(a=>String(a.id)));
  const cCodes = new Set((champs || []).filter(c=>c && typeof c === "object").map(c=>String(c.code)));
  const avantId = new Map((avant || []).filter(e=>e && typeof e === "object").map(e=>[String(e.id), JSON.stringify(e)]));
  const ids = new Set(), noms = new Set();
  for (const e of apres){
    if (!e || typeof e !== "object" || Array.isArray(e)) return "élément invalide";
    if (!ID.test(String(e.id))) return "identifiant invalide";
    if (ids.has(String(e.id))) return "identifiant en double ("+e.id+")"; ids.add(String(e.id));
    const nom = typeof e.nom === "string" ? e.nom.trim() : "";
    if (!nom || nom.length > 120) return "nom vide ou trop long";
    if (noms.has(nom.toLowerCase())) return "nom en double (« "+nom+" »)"; noms.add(nom.toLowerCase());
    if (avantId.get(String(e.id)) === JSON.stringify(e)) continue;
    const l = "état « "+nom+" » : ";
    if (!Array.isArray(e.champs) || !e.champs.length) return l+"aucun compteur";
    if (e.champs.length > 200) return l+"trop de compteurs";
    const inconnu = e.champs.find(id=>!aIds.has(String(id))); if (inconnu !== undefined) return l+"compteur inconnu ("+inconnu+")";
    if (PER.indexOf(e.periode) < 0) return l+"période inconnue";
    if (e.modele !== undefined && MOD.indexOf(e.modele) < 0) return l+"modèle inconnu";
    if (e.scope !== undefined && SCO.indexOf(e.scope) < 0) return l+"regroupement inconnu";
    for (const k of ["ref","from","to"]) if (e[k] !== undefined && e[k] !== null && e[k] !== "" && !DATE.test(String(e[k]))) return l+"date invalide";
    if (e.plage || e.periode === "libre"){
      if (!DATE.test(String(e.from||"")) || !DATE.test(String(e.to||""))) return l+"dates de la plage obligatoires";
      if (e.from > e.to) return l+"date de début après la date de fin";
      const max = new Date(+e.from.slice(0,4)+3, +e.from.slice(5,7)-1, +e.from.slice(8,10)-1), au = new Date(+e.to.slice(0,4), +e.to.slice(5,7)-1, +e.to.slice(8,10));
      if (au > max) return l+"plage de plus de 3 ans";
    }
    if (e.filtres !== undefined && (typeof e.filtres !== "object" || e.filtres === null || Array.isArray(e.filtres))) return l+"filtres invalides";
    const fc = Object.keys(e.filtres || {}).find(c=>e.filtres[c] && !cCodes.has(c)); if (fc) return l+"filtre sur un champ inconnu ("+fc+")";
  }
  for (const id of avantId.keys()) if (!ids.has(id)){
    const p = (profils || []).find(x=>x && Array.isArray(x.etats) && x.etats.indexOf(id) >= 0);
    if (p) return "état cité par le profil « "+(p.nom || p.id)+" » : retirez-le du profil avant de le supprimer";
  }
  return "";
}
function controleArits(avant, apres, ref, etats){
  if (!Array.isArray(apres)) return "";
  const clot = (ref.clotures||[]).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
  const fAt = (a, k) => { for (const x of (Array.isArray(a.hist) ? a.hist : [])) if (x && x.f && k <= x.jusqu) return String(x.f); return String(a.f||""); };
  const utilise = code => { const re = new RegExp("(^|[^A-Za-z0-9_])"+String(code).replace(/[^A-Za-z0-9_]/g, "")+"([^A-Za-z0-9_]|$)", "i"); return apres.some(x=>x && x.code !== code && re.test(String(x.f||""))); };
  const parId = new Map(apres.map(x=>[x && x.id, x]));
  for (const a of avant){
    if (!a) continue; const n = parId.get(a.id);
    if (!n){ if (utilise(a.code) || (etats||[]).some(e=>e && (e.champs||[]).indexOf(a.id) >= 0)) return "compteur "+a.code+" utilisé (formule ou état)"; continue; }
    if (String(n.code) !== String(a.code)) return "code du compteur "+a.code+" non modifiable";
    if (clot){
      const bornes = new Set([clot].concat((a.hist||[]).concat(n.hist||[]).map(x=>x && x.jusqu).filter(x=>x && x <= clot)));
      for (const k of bornes) if (fAt(a, k) !== fAt(n, k)) return "formule de "+a.code+" modifiée en période clôturée";
      for (const c of ["unite","period","agg"]) if (String(a[c]||"") !== String(n[c]||"")) return c+" de "+a.code+" non modifiable (période clôturée)";
    }
  }
  return "";
}
/* recette Types de temps : code figé ; mode de saisie figé dès qu'une absence ou demande existe ; classe et « rémunéré »
   figés si le type est utilisé en période clôturée ; suppression refusée pour un type utilisé ou système */
async function controleTt(B, avant, apres, ref){
  if (!Array.isArray(apres)) return "";
  const clot = (ref.clotures||[]).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
  const SYS = ["030","031","034","035","040"];
  const usage = async (id, jusqu) => { const motif = '%"tt":'+JSON.stringify(String(id))+'%';
    const r = await B.get("SELECT COUNT(*) n FROM enreg WHERE coll IN ('abs','dmd') AND data LIKE ?"+(jusqu ? " AND d<=?" : ""), ...(jusqu ? [motif, jusqu] : [motif]));
    return Number(r && r.n) || 0; };
  const parId = new Map(apres.map(x=>[x && x.id, x]));
  for (const a of avant){
    if (!a) continue; const n = parId.get(a.id);
    if (!n){ if (SYS.indexOf(String(a.code)) >= 0) return "type système "+a.code+" non supprimable"; if (await usage(a.id)) return "type « "+(a.nom||a.code)+" » utilisé par des absences ou des demandes"; continue; }
    if (String(n.code) !== String(a.code)) return "code du type « "+(a.nom||a.code)+" » non modifiable";
    if ((n.saisie||"jour") !== (a.saisie||"jour") && await usage(a.id)) return "mode de saisie de « "+(a.nom||a.code)+" » non modifiable (déjà utilisé)";
    if (clot && (Number(n.cls) !== Number(a.cls) || !!n.paye !== !!a.paye) && await usage(a.id, clot)) return "classe ou rémunération de « "+(a.nom||a.code)+" » non modifiable (utilisé en période clôturée)";
  }
  return "";
}
/* recette Journée type : la définition en vigueur jusqu'à la clôture (théorique, plages, tolérances, nuit) ne change pas */
function controleJours(avant, apres, ref){
  const clot = (ref.clotures||[]).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
  if (!clot || !Array.isArray(apres)) return "";
  const CH = ["theo","plages","tolIn","tolOut","nuit"];
  const def = (j, k) => { let o = j; for (const x of (Array.isArray(j.hist) ? j.hist : [])) if (x && x.def && k <= x.jusqu){ o = Object.assign({}, j, x.def); break; }
    const r = {}; CH.forEach(c=>{ r[c] = o[c] === undefined ? null : o[c]; }); return JSON.stringify(r); };
  const parId = new Map(apres.map(j=>[j && j.id, j]));
  for (const a of avant){
    if (!a) continue; const n = parId.get(a.id); if (!n) continue;
    const bornes = new Set([clot].concat((a.hist||[]).concat(n.hist||[]).map(x=>x && x.jusqu).filter(x=>x && x <= clot)));
    for (const k of bornes) if (def(a, k) !== def(n, k)) return "définition de « "+(a.nom||a.id)+" » modifiée en période clôturée";
  }
  return "";
}
function controleCals(avant, apres, ref){
  const clot = (ref.clotures||[]).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
  if (!clot || !Array.isArray(apres)) return "";
  const trame = (c, k) => { const h = Array.isArray(c.hebdoHist) ? c.hebdoHist : []; for (const x of h) if (x && k <= x.jusqu && x.hebdo) return x.hebdo; return c.hebdo || {}; };
  const jour = (c, k) => { const e = (c.exc||{})[k]; return e === undefined ? null : (typeof e === "string" ? {j:e, alt:[]} : {j:e && e.j, alt:(e && e.alt)||[]}); };
  const parId = new Map(apres.map(c=>[c && c.id, c]));
  for (const a of avant){
    if (!a) continue; const n = parId.get(a.id); if (!n) continue;   /* suppression : contrôlée par l'écran (historique d'affectation) */
    const cles = new Set(Object.keys(a.exc||{}).concat(Object.keys(n.exc||{})).filter(k=>k <= clot));
    for (const k of cles) if (JSON.stringify(jour(a, k)) !== JSON.stringify(jour(n, k))) return "exception du "+k+" en période clôturée";
    const bornes = new Set([clot].concat((a.hebdoHist||[]).concat(n.hebdoHist||[]).map(x=>x && x.jusqu).filter(x=>x && x <= clot)));
    for (const k of bornes) if (JSON.stringify(trame(a, k)) !== JSON.stringify(trame(n, k))) return "trame hebdomadaire modifiée en période clôturée (date d'effet requise après le "+jjD(clot)+")";
  }
  return "";
}
const TERM_VOLATILS = ["comEtat","comMs","comAt","comMotif","comSimule","comInfo","derniereActivite","syncAt","syncDelta"];
function controleTerms(avant, apres, sites, sitesP, admin){
  const sansVol = T=>{ const o = Object.assign({}, T); TERM_VOLATILS.forEach(k=>delete o[k]); return JSON.stringify(o); };
  const parId = new Map((avant||[]).map(T=>[T && T.id, T])), ids = new Set(), idSites = new Set((sites||[]).map(x=>x && x.id));
  const hors = T=>sitesP && T && T.siteId && !sitesP.has(T.siteId);
  for (const T of apres||[]){ if (!T || !T.id) return "terminal sans identifiant"; if (ids.has(T.id)) return "identifiant de terminal en double ("+T.id+")"; ids.add(T.id); }
  for (const v of avant||[]) if (v && !ids.has(v.id) && hors(v)) return "suppression du terminal « "+v.nom+" » hors de votre périmètre";
  const changes = (apres||[]).filter(T=>{ const v = parId.get(T.id); return !v || sansVol(v) !== sansVol(T); });
  const cleIp = T=>String(T.ip||"").trim().toLowerCase()+":"+(Number(T.port)||4370), cleSn = T=>String(T.sn||"").trim().toLowerCase();
  for (const T of changes){
    const v = parId.get(T.id), nom = "« "+(T.nom||T.id)+" »";
    if (hors(T) || hors(v)) return "terminal "+nom+" hors de votre périmètre";
    if (!admin && v && String(v.dossier||"") !== String(T.dossier||"")) return "dossier du pilote de "+nom+" : réservé à l'administrateur";
    if (!admin && !v && String(T.dossier||"").trim()) return "dossier du pilote de "+nom+" : réservé à l'administrateur";
    if (!String(T.nom||"").trim()) return "terminal sans nom";
    if (!T.siteId || !idSites.has(T.siteId)) return "site du terminal "+nom+" introuvable";
    if ((sites || []).some(x=>x && x.id === T.siteId && x.actif === false) && !(parId.get(T.id) && parId.get(T.id).siteId === T.siteId)) return "site du terminal "+nom+" désactivé";
    if (T.usage && ["clocking", "door", "both"].indexOf(T.usage) < 0) return "usage du terminal "+nom+" invalide";
    if (T.ip && !/^[A-Za-z0-9.:-]{1,253}$/.test(String(T.ip).trim())) return "adresse du terminal "+nom+" invalide";
    if (T.port !== undefined && T.port !== "" && !(Number.isInteger(Number(T.port)) && Number(T.port) >= 1 && Number(T.port) <= 65535)) return "port du terminal "+nom+" hors de 1-65535";
    if (T.collecteMinutes !== undefined && T.collecteMinutes !== "" && !(Number(T.collecteMinutes) >= 0 && Number(T.collecteMinutes) <= 10080)) return "fréquence de collecte de "+nom+" invalide";
    if (T.joursCollecte !== undefined && T.joursCollecte !== "" && !(Number(T.joursCollecte) >= 1 && Number(T.joursCollecte) <= 366)) return "profondeur de collecte de "+nom+" hors de 1-366 jours";
    if (T.pilote === "zk-push" && !cleSn(T)) return "n° de série obligatoire pour "+nom+" (ZK Push)";
    const neufIp = T.ip && (!v || cleIp(v) !== cleIp(T)), neufSn = cleSn(T) && (!v || cleSn(v) !== cleSn(T) || (v.actif === false && T.actif !== false));
    if (neufIp && (apres||[]).some(x=>x && x.id !== T.id && x.ip && cleIp(x) === cleIp(T))) return "adresse "+T.ip+":"+(Number(T.port)||4370)+" déjà utilisée par un autre terminal";
    if (neufSn && T.actif !== false && (apres||[]).some(x=>x && x.id !== T.id && x.actif !== false && cleSn(x) === cleSn(T))) return "n° de série "+T.sn+" déjà déclaré sur un autre terminal actif";
  }
  return "";
}
function controleAplans(avant, apres, plages, emps){
  const ids = new Set((apres||[]).map(p=>p && p.id));
  for (const p of avant||[]) if (p && !ids.has(p.id)){ const n = (emps||[]).filter(e=>(e.acces||[]).some(a=>a && (a.planId === p.id || (a.hist||[]).some(h=>h && h.planId === p.id)))).length; if (n) return "suppression du planning « "+p.nom+" » encore utilisé par "+n+" salarié(s)"; }
  const parId = new Map((avant||[]).map(p=>[p && p.id, p])), pl = new Map((plages||[]).map(a=>[a && a.id, a]));
  for (const p of apres||[]){ if (!p) continue; const v = parId.get(p.id); if (v && JSON.stringify(v) === JSON.stringify(p)) continue;
    if (!String(p.nom||"").trim()) return "planning sans nom";
    const jours = [0,1,2,3,4,5,6].map(i=>(p.hebdo||{})[i]).concat([p.ferie]);
    if (jours.some(x=>x && x !== "aucun" && !pl.has(x))) return "planning « "+p.nom+" » : plage inexistante";
    if (!jours.some(x=>x && x !== "aucun" && ((pl.get(x)||{}).iv||[]).length)) return "planning « "+p.nom+" » : aucun jour ouvert";
  }
  return "";
}
function controleAplages(avant, apres, plans){
  const ids = new Set((apres||[]).map(a=>a && a.id)), utilise = id => (plans||[]).filter(p=>p && ([0,1,2,3,4,5,6].some(i=>(p.hebdo||{})[i] === id) || p.ferie === id)).length;
  for (const a of avant||[]) if (a && !ids.has(a.id)){ const n = utilise(a.id); if (n) return "suppression de la plage « "+a.nom+" » utilisée par "+n+" planning(s)"; }
  const parId = new Map((avant||[]).map(a=>[a && a.id, a])), H = /^([01]\d|2[0-3]):[0-5]\d$/, HF = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
  for (const a of apres||[]){ if (!a) continue; const v = parId.get(a.id); if (v && JSON.stringify(v) === JSON.stringify(a)) continue;
    if (!String(a.nom||"").trim()) return "plage sans nom";
    const iv = Array.isArray(a.iv) ? a.iv : [];
    if (!iv.length) return "plage « "+a.nom+" » sans intervalle";
    if (iv.some(x=>!x || !H.test(x.a||"") || !HF.test(x.b||""))) return "heure invalide dans « "+a.nom+" »";
    if (iv.some(x=>x.a === x.b && x.a !== "00:00")) return "intervalle de durée nulle dans « "+a.nom+" »";
  }
  return "";
}
function controleZones(avant, apres, terms, emps){
  const ids = new Set((apres||[]).map(z=>z && z.id)), portesApres = new Map();
  for (const z of apres||[]) for (const p of (z && z.portes) || []){ if (!p || !p.id) continue; if (portesApres.has(p.id)) return "porte "+p.id+" présente dans deux zones"; portesApres.set(p.id, z.id); }
  for (const z of avant||[]){
    if (!z) continue;
    if (!ids.has(z.id)){
      const n = (emps||[]).filter(e=>(e.acces||[]).some(a=>a && a.zoneId === z.id)).length;
      if (n) return "suppression de la zone « "+z.nom+" » encore utilisée par "+n+" salarié(s)";
    }
    for (const p of z.portes || []){ if (p && p.id && !portesApres.has(p.id)){ const l = (terms||[]).filter(r=>r && r.porteId === p.id); if (l.length) return "porte « "+p.nom+" » retirée alors que "+l.length+" lecteur(s) la commandent"; } }
  }
  const parId = new Map((avant||[]).map(z=>[z && z.id, z]));
  for (const z of apres||[]){ if (!z) continue; const a = parId.get(z.id); if (a && JSON.stringify(a) === JSON.stringify(z)) continue;
    if (!String(z.nom||"").trim()) return "zone sans nom"; if (!z.siteId) return "zone « "+z.nom+" » sans site"; if ((z.portes||[]).some(p=>!p || !String(p.nom||"").trim())) return "porte sans nom dans « "+z.nom+" »"; }
  return "";
}
function controleReglesV(avant, apres, ref){
  const auj = new Date().toISOString().slice(0, 10);
  const clot = (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, "");
  const parId = new Map((apres||[]).map(x=>[x && x.id, x]));
  const fige = ["code","niveau","cible","valeur","valid_from","version","priorite"];
  const statutAvant = new Map((avant||[]).map(x=>[x && x.id, x && x.statut]));
  /* recette Règles versionnées : une version publiée (nouvelle ou issue d'un brouillon) doit être cohérente, même envoyée directement à l'API */
  const NIVEAUX = ["societe","etablissement","site","departement","service","equipe","planning","categorie","salarie"];
  const dateOk = d=>/^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const incoherente = n=>{
    if (!n.code || NIVEAUX.indexOf(n.niveau) < 0) return "règle ou niveau inconnu";
    if (!dateOk(n.valid_from) || (n.valid_to && !dateOk(n.valid_to))) return "date invalide";
    if (n.valid_to && n.valid_to < n.valid_from) return "fin avant le début";
    if (n.niveau !== "societe" && !String(n.cible == null ? "" : n.cible).trim()) return "cible manquante";
    if (typeof n.valeur === "number" && !(n.valeur >= 0)) return "valeur négative";
    if (n.simulation) return "marque de simulation";
    return "";
  };
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
  for (const n of (apres||[])) if (n && n.statut === "publiee" && statutAvant.get(n.id) !== "publiee" && statutAvant.get(n.id) !== "retiree"){ const m = incoherente(n); if (m) return "version "+(n.code||"?")+" incohérente ("+m+")"; }
  for (const n of (apres||[])) if (n && anciens.has(n.id)){ const v = avant.find(x=>x.id === n.id); if (v.statut === "brouillon" && n.statut === "publiee" && clot && n.valid_from <= clot) return "publication dans une période clôturée"; }
  return "";
}
function pick(o, ks){ const r = {}; ks.forEach(k=>{ if (k in o) r[k] = o[k]; }); return r; }
module.exports = {creer, dateDe, COLLS, CLE_APP};
