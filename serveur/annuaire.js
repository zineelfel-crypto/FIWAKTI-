/* FIWAKTI v56.3 — annuaire des salariés servi par page (exigence : aucun chargement global de l'annuaire dans le
   navigateur pour un grand effectif). Liste paginée et filtrée côté serveur, fiche complète à la demande, résolution
   d'un lot de matricules, valeurs des filtres avec effectifs. Le périmètre de l'utilisateur est toujours appliqué. */
"use strict";
const LEGER = e => ({id:e.id, mat:String(e.mat), nom:e.nom||"", prenom:e.prenom||"", siteId:e.siteId||"", deptId:e.deptId||"", poste:e.poste||"",
  calId:e.calId||"", chefMat:e.chefMat||"", entree:e.entree||"", sortie:e.sortie||"", photo:undefined, _leger:true});
/* 56.33.11 : ligne de la liste paginée avec les colonnes proposées à l'affichage (CIN, e-mail, téléphone, badge, calendrier,
   portail, nombre d'accès) — auparavant vides en grand effectif ; données personnelles masquées selon le profil */
const LIGNE = (e, masque) => Object.assign(LEGER(e), {cin:e.cin||"", email:e.email||"", tel:e.tel||"", badge:e.badge||"", portail:!!e.portail,
  calHist:Array.isArray(e.calHist) ? e.calHist.slice(-12) : undefined, nbAcc:Array.isArray(e.acces) ? e.acces.length : 0},
  masque ? {cin:e.cin ? "•••" : "", email:e.email ? "•••" : "", tel:e.tel ? "•••" : "", badge:e.badge ? "•••" : ""} : {});
function creer(o){
  const {D} = o;
  const auj = () => new Date().toISOString().slice(0, 10);
  /* 56.33.11 : ordres de tri et texte de recherche préparés une fois par version de la liste des salariés
     (D.employes() renvoie le même tableau tant qu'aucun salarié n'a changé). Auparavant chaque page triait tout
     le périmètre avec localeCompare : 400 à 600 ms par page à 50 000 salariés. Même ordre qu'avant (tri stable). */
  const COLL_NOM = new Intl.Collator("fr"), COLL_MAT = new Intl.Collator("fr", {numeric:true});
  let PREP = null;
  /* 56.33.11 : e-mail, téléphone et badge aussi (recherche et filtres de colonnes de la liste des employés) */
  const texteDe = e => ((e.nom||"")+" "+(e.prenom||"")+" "+e.mat+" "+(e.cin||"")+" "+(e.email||"")+" "+(e.tel||"")+" "+(e.badge||"")).toLowerCase();
  /* mise à jour après quelques fiches modifiées (même position dans la liste, ou ajoutées à la fin) : chaque fiche
     changée est retirée des deux ordres puis réinsérée à sa place (égalité départagée par la position, comme le tri
     stable complet) — quelques millisecondes au lieu d'un tri complet */
  function majIncrementale(tous){
    const anc = PREP.tous, chg = [];
    if (tous.length < anc.length) return false;
    for (let i = 0; i < tous.length; i++) if (anc[i] !== tous[i]){ chg.push(i); if (chg.length > 2000) return false; }
    const pos = PREP.pos;
    const cmpNom = (a, b) => COLL_NOM.compare(String(a.nom), String(b.nom)) || COLL_NOM.compare(String(a.prenom), String(b.prenom)) || pos.get(a) - pos.get(b);
    const cmpMat = (a, b) => COLL_MAT.compare(String(a.mat), String(b.mat)) || pos.get(a) - pos.get(b);
    const inserer = (l, e, cmp) => { let g = 0, d = l.length; while (g < d){ const m = (g + d) >> 1; if (cmp(l[m], e) < 0) g = m + 1; else d = m; } l.splice(g, 0, e); };
    for (const i of chg){
      const v = anc[i], n = tous[i];
      if (v){ for (const l of [PREP.parNom, PREP.parMat]){ const k = l.indexOf(v); if (k >= 0) l.splice(k, 1); } PREP.texte.delete(v); pos.delete(v); }
      pos.set(n, i); PREP.texte.set(n, texteDe(n));
      inserer(PREP.parNom, n, cmpNom); inserer(PREP.parMat, n, cmpMat);
    }
    PREP.tous = tous;
    return true;
  }
  function prepare(tous){
    if (PREP && PREP.tous === tous) return PREP;
    if (PREP && majIncrementale(tous)) return PREP;
    const texte = new Map();
    tous.forEach(e=>texte.set(e, texteDe(e)));
    const parNom = tous.slice().sort((a, b)=>COLL_NOM.compare(String(a.nom), String(b.nom)) || COLL_NOM.compare(String(a.prenom), String(b.prenom)));
    const parMat = tous.slice().sort((a, b)=>COLL_MAT.compare(String(a.mat), String(b.mat)));
    PREP = {tous, texte, parNom, parMat, pos:new Map(tous.map((e, i)=>[e, i]))};
    return PREP;
  }
  /* 56.33.11 : profil « données personnelles masquées » appliqué aussi à l'annuaire paginé (fiche, lot, fiches complètes),
     comme au document filtré (avant : CIN, e-mail, badge… en clair par /api/v1/employes) */
  const PERIM = require("./perimetre.js");
  const masquer = e => { const c = Object.assign({}, e); PERIM.CHAMPS_PERSO.forEach(k=>{ if (c[k]) c[k] = PERIM.MASQUE; }); return c; };
  async function perimetre(login){ const ref = await (D.referentielLecture || D.referentiel)() || {}; const {P, emps} = await D.perimetreDe(ref, login);
    const l = emps.filter(e=>P.set === null || P.set.has(String(e.mat)));
    return {P, emps:P.profil && P.profil.persoMasque ? l.map(masquer) : l}; }
  function filtrer(l, q, tous){
    if (q.site) l = l.filter(e=>e.siteId === q.site);
    if (q.dept) l = l.filter(e=>e.deptId === q.dept);
    if (q.fonction) l = l.filter(e=>(e.poste||"") === q.fonction);
    if (q.statut === "actifs") l = l.filter(e=>!e.sortie || e.sortie >= auj());
    if (q.statut === "sortis") l = l.filter(e=>e.sortie && e.sortie < auj());
    const s = String(q.q||"").trim().toLowerCase();
    const P = tous ? prepare(tous) : null;
    /* 56.33.11 : chaque mot saisi doit figurer, dans n'importe quel ordre (« amine trab » trouve « Trabelsi Amine ») ;
       tout ce que trouvait la recherche d'une seule chaîne est encore trouvé */
    const mots = s ? s.split(/\s+/).filter(Boolean) : [];
    if (mots.length) l = l.filter(e=>{ const t = P && P.texte.get(e) || texteDe(e); return t.indexOf(s) >= 0 || mots.every(m=>t.indexOf(m) >= 0); });
    /* correspondances exactes de la phrase saisie d'abord, puis les correspondances mot à mot (chacune triée) */
    const exacte = e => !s || (P && P.texte.get(e) || texteDe(e)).indexOf(s) >= 0;
    const classer = r => mots.length > 1 ? r.filter(exacte).concat(r.filter(e=>!exacte(e))) : r;
    if (P){ const dans = new Set(l); return classer((q.tri === "mat" ? P.parMat : P.parNom).filter(e=>dans.has(e))); }
    const tri = q.tri === "mat" ? (a, b)=>COLL_MAT.compare(String(a.mat), String(b.mat)) : (a, b)=>COLL_NOM.compare(String(a.nom), String(b.nom)) || COLL_NOM.compare(String(a.prenom), String(b.prenom));
    return classer(l.slice().sort(tri));
  }
  /* 56.33.11 : un seul passage sur l'ordre déjà trié (périmètre, filtres et recherche combinés), sans copie ni
     ensemble de 50 000 éléments par requête ; résultat mémorisé pour feuilleter les pages (même ordre qu'avant) */
  const LISTES = new Map();
  function filtrerRapide(tous, set, q){
    const PR = prepare(tous), a = auj(), s = String(q.q||"").trim().toLowerCase(), mots = s ? s.split(/\s+/).filter(Boolean) : [];
    const sites = q.site ? new Set(String(q.site).split(",")) : null, depts = q.dept ? new Set(String(q.dept).split(",")) : null;
    const ok = e => (set === null || set.has(String(e.mat))) && (!sites || sites.has(e.siteId)) && (!depts || depts.has(e.deptId)) && (!q.fonction || (e.poste||"") === q.fonction)
      && (!q.chef || String(e.chefMat||"") === String(q.chef))
      && (q.statut !== "actifs" || !e.sortie || e.sortie >= a) && (q.statut !== "sortis" || (e.sortie && e.sortie < a))
      && (!mots.length || (t => t.indexOf(s) >= 0 || mots.every(m=>t.indexOf(m) >= 0))(PR.texte.get(e)));
    let l = (q.tri === "mat" ? PR.parMat : PR.parNom).filter(ok);
    /* 56.33.11 : matricule, CIN ou badge saisi exactement : ce salarié en tête de liste */
    if (s && mots.length === 1){ const ex = e => String(e.mat).toLowerCase() === s || String(e.cin||"").toLowerCase() === s || String(e.badge||"").toLowerCase() === s; if (l.some(ex)) l = l.filter(ex).concat(l.filter(e=>!ex(e))); }
    if (mots.length < 2) return l;
    const exacte = e => PR.texte.get(e).indexOf(s) >= 0;
    return l.filter(exacte).concat(l.filter(e=>!exacte(e)));
  }
  async function liste(login, q){
    const off = Math.max(0, +q.offset||0), lim = Math.min(500, Math.max(1, +q.limit||100));
    const ref = await (D.referentielLecture || D.referentiel)() || {}, {P, emps: tous} = await D.perimetreDe(ref, login);
    const cle = JSON.stringify([String(login).toLowerCase(), q.site||"", q.dept||"", q.fonction||"", q.statut||"", String(q.q||""), q.chef||"", q.tri === "mat" ? "mat" : "", auj()]);
    let m = LISTES.get(cle);
    if (!m || m.tous !== tous || m.P !== P){ m = {tous, P, l:filtrerRapide(tous, P.set, q)}; if (LISTES.size > 500) LISTES.clear(); LISTES.set(cle, m); }
    const masque = !!(P.profil && P.profil.persoMasque);
    return {total:m.l.length, offset:off, lignes:m.l.slice(off, off + lim).map(e=>LIGNE(e, masque))};
  }
  async function fiche(login, mat){ const {emps} = await perimetre(login); return emps.find(e=>String(e.mat) === String(mat)) || null; }
  async function lot(login, mats, ids){ const {emps} = await perimetre(login), s = new Set((mats||[]).slice(0, 500).map(String)), si = new Set((ids||[]).slice(0, 500).map(String));
    return emps.filter(e=>s.has(String(e.mat)) || si.has(String(e.id))).map(LEGER); }
  /* v56.30 : fiches complètes pour l'import (grand effectif) — dans le périmètre ; matricules existants hors périmètre signalés */
  async function complets(login, mats){ const {emps} = await perimetre(login), s = new Set((mats||[]).slice(0, 1000).map(String));
    const dans = emps.filter(e=>s.has(String(e.mat))), vus = new Set(dans.map(e=>String(e.mat)));
    const reste = Array.from(s).filter(m=>!vus.has(m)); let hors = [];
    if (reste.length){ const tous = await D.employes(), r = new Set(reste); hors = tous.filter(e=>r.has(String(e.mat))).map(e=>String(e.mat)); }
    return {lignes:dans, hors}; }
  async function valeurs(login){
    const {emps} = await perimetre(login), c = (k)=>{ const o = {}; emps.forEach(e=>{ const v = e[k] || ""; o[v] = (o[v]||0) + 1; }); return o; };
    return {total:emps.length, actifs:emps.filter(e=>!e.sortie || e.sortie >= auj()).length, sites:c("siteId"), depts:c("deptId"), fonctions:c("poste")};
  }
  /* nombre de salariés rattachés à un élément de paramétrage (avant sa suppression) : tous les salariés, seul le
     nombre est renvoyé */
  async function compter(q){
    const emps = await D.employes(), id = String(q.id||""), sub = String(q.depts||"").split(",").filter(Boolean);
    const cal = e => (Array.isArray(e.calHist) ? e.calHist : (e.calId ? [{calId:e.calId}] : [])).some(h=>h.calId === id) || e.calId === id;
    const f = {site:e=>e.siteId === id, depts:e=>sub.indexOf(e.deptId) >= 0, rd:e=>(e.rds||[]).indexOf(id) >= 0, tt:e=>(e.tts||[]).indexOf(id) >= 0, cal,
      zone:e=>(e.acces||[]).some(x=>x.zoneId === id), plan:e=>(e.acces||[]).some(x=>(x.hist||[]).some(h=>h.planId === id) || x.planId === id),
      cf:e=>e.cf && e.cf[id] !== undefined && e.cf[id] !== ""}[q.critere];
    return {n:f ? emps.filter(f).length : 0};
  }
  return {liste, fiche, lot, complets, valeurs, compter, LEGER};
}
module.exports = {creer, LEGER};
