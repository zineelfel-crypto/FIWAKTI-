/* FIWAKTI v56.3 — annuaire des salariés servi par page (exigence : aucun chargement global de l'annuaire dans le
   navigateur pour un grand effectif). Liste paginée et filtrée côté serveur, fiche complète à la demande, résolution
   d'un lot de matricules, valeurs des filtres avec effectifs. Le périmètre de l'utilisateur est toujours appliqué. */
"use strict";
const LEGER = e => ({id:e.id, mat:String(e.mat), nom:e.nom||"", prenom:e.prenom||"", siteId:e.siteId||"", deptId:e.deptId||"", poste:e.poste||"",
  calId:e.calId||"", chefMat:e.chefMat||"", entree:e.entree||"", sortie:e.sortie||"", photo:undefined, _leger:true});
function creer(o){
  const {D} = o;
  const auj = () => new Date().toISOString().slice(0, 10);
  async function perimetre(login){ const ref = await D.referentiel() || {}; const {P, emps} = await D.perimetreDe(ref, login); return {P, emps:emps.filter(e=>P.set === null || P.set.has(String(e.mat)))}; }
  function filtrer(l, q){
    if (q.site) l = l.filter(e=>e.siteId === q.site);
    if (q.dept) l = l.filter(e=>e.deptId === q.dept);
    if (q.fonction) l = l.filter(e=>(e.poste||"") === q.fonction);
    if (q.statut === "actifs") l = l.filter(e=>!e.sortie || e.sortie >= auj());
    if (q.statut === "sortis") l = l.filter(e=>e.sortie && e.sortie < auj());
    const s = String(q.q||"").trim().toLowerCase();
    if (s) l = l.filter(e=>((e.nom||"")+" "+(e.prenom||"")+" "+e.mat+" "+(e.cin||"")).toLowerCase().indexOf(s) >= 0);
    const tri = q.tri === "mat" ? (a, b)=>String(a.mat).localeCompare(String(b.mat), "fr", {numeric:true}) : (a, b)=>String(a.nom).localeCompare(String(b.nom), "fr") || String(a.prenom).localeCompare(String(b.prenom), "fr");
    return l.slice().sort(tri);
  }
  async function liste(login, q){
    const off = Math.max(0, +q.offset||0), lim = Math.min(500, Math.max(1, +q.limit||100));
    const {emps} = await perimetre(login), l = filtrer(emps, q);
    return {total:l.length, offset:off, lignes:l.slice(off, off + lim).map(LEGER)};
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
