/* FW-BI — pilotage transverse. Lit, sans les copier, les sources autorisées : salariés (FW-RH), journées calculées
   (FW-Time), et selon les modules actifs : compétences, formation, évaluations, santé et sécurité, recrutement.
   Filtres serveur (période, site, service, fonction) appliqués au périmètre de l'utilisateur ; résultats agrégés
   seulement (aucune liste nominative), mis en cache 5 minutes ; aucune donnée médicale. */
"use strict";
const ddl = {pg:[], sqlite:[]}, tables = {};
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D} = o, actif = o.moduleActif || (()=>false), CACHE = new Map();
  const r1 = x => Math.round(x * 10) / 10;
  async function enLots(mats, fn){ let acc = []; for (let i = 0; i < mats.length; i += 500) acc = acc.concat(await fn(mats.slice(i, i+500))); return acc; }
  const ph = l => l.map(()=>"?").join(",");
  async function tableau(C, P, q){
    const au = /^\d{4}-\d{2}-\d{2}$/.test(q.au||"") ? q.au : new Date().toISOString().slice(0, 10), du = /^\d{4}-\d{2}-\d{2}$/.test(q.du||"") && q.du <= au ? q.du : ajoutJours(au, -29);
    const emps = (await D.employes()).filter(e=>(P.set === null || P.set.has(String(e.mat))) && (!q.site || e.siteId === q.site) && (!q.dept || e.deptId === q.dept) && (!q.fonction || String(e.poste||"") === q.fonction));
    const actifs = emps.filter(e=>(!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au)), mats = emps.map(e=>String(e.mat)), set = new Set(mats);
    const out = {du, au, filtres:{site:q.site||"", dept:q.dept||"", fonction:q.fonction||""}, sources:["FW-RH"]};
    out.effectifs = {actifs:actifs.length, entrees:emps.filter(e=>e.entree && e.entree >= du && e.entree <= au).length, sorties:emps.filter(e=>e.sortie && e.sortie >= du && e.sortie <= au).length};
    /* temps (FW-Time) : présence, théorique, heures supplémentaires, jours d'absence, retards */
    if (actif("FW-Time") && mats.length){
      out.sources.push("FW-Time");
      const global = P.set === null && !q.site && !q.dept && !q.fonction;
      /* journées terminées seulement (la journée en cours fausserait la présence) ; heures supplémentaires = écarts
         positifs (la colonne hs est l'écart présence − théorique, en minutes) */
      const hier = ajoutJours(new Date().toISOString().slice(0, 10), -1), auT = au < hier ? au : hier;
      const sel = "SELECT substr(d,1,7) m, COUNT(*) j, SUM(hp) hp, SUM(ht) ht, SUM(CASE WHEN hs > 0 THEN hs ELSE 0 END) / 60.0 hs, SUM(CASE WHEN types LIKE '%absence%' THEN 1 ELSE 0 END) abs, SUM(CASE WHEN ret > 0 THEN 1 ELSE 0 END) ret FROM calc_jour WHERE d>=? AND d<=?";
      const lignes = du > auT ? [] : global ? await B.all(sel+" GROUP BY substr(d,1,7)", du, auT) : await enLots(mats, l=>B.all(sel+" AND mat IN ("+ph(l)+") GROUP BY substr(d,1,7)", du, auT, ...l));
      const mois = {}; lignes.forEach(r=>{ const x = mois[r.m] || (mois[r.m] = {mois:r.m, jours:0, hp:0, ht:0, hs:0, abs:0, ret:0}); x.jours += +r.j||0; x.hp += +r.hp||0; x.ht += +r.ht||0; x.hs += +r.hs||0; x.abs += +r.abs||0; x.ret += +r.ret||0; });
      const t = Object.values(mois).reduce((s, x)=>({jours:s.jours + x.jours, hp:s.hp + x.hp, ht:s.ht + x.ht, hs:s.hs + x.hs, abs:s.abs + x.abs, ret:s.ret + x.ret}), {jours:0, hp:0, ht:0, hs:0, abs:0, ret:0});
      out.temps = {heuresPresence:Math.round(t.hp), heuresTheoriques:Math.round(t.ht), heuresSup:r1(t.hs), tauxPresence:t.ht ? r1(100 * t.hp / t.ht) : null,
        joursAbsence:t.abs, tauxAbsenteisme:t.jours ? r1(100 * t.abs / t.jours) : null, joursRetard:t.ret,
        parMois:Object.values(mois).sort((a, b)=>a.mois.localeCompare(b.mois)).map(x=>({mois:x.mois, tauxPresence:x.ht ? r1(100 * x.hp / x.ht) : null, heuresSup:r1(x.hs), absenteisme:x.jours ? r1(100 * x.abs / x.jours) : null}))};
    }
    /* compétences : salariés en écart / couverts, par rapport aux niveaux requis de leur fonction */
    if (actif("FW-Competences") && actifs.length){
      out.sources.push("FW-Competences");
      const exig = await B.all("SELECT e.fonction, e.competence_id, e.niveau FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE c.actif=1");
      const parF = {}; exig.forEach(x=>{ (parF[x.fonction] = parF[x.fonction] || []).push(x); });
      const concernes = actifs.filter(e=>parF[String(e.poste||"").trim()]);
      const niv = new Map(); (await enLots(concernes.map(e=>String(e.mat)), l=>B.all("SELECT mat, competence_id, niveau FROM comp_niveaux WHERE mat IN ("+ph(l)+")", ...l))).forEach(r=>niv.set(r.mat+"|"+r.competence_id, r.niveau));
      let exigences = 0, atteintes = 0, enEcart = 0;
      concernes.forEach(e=>{ let ec = false; parF[String(e.poste).trim()].forEach(x=>{ exigences++; if ((niv.get(String(e.mat)+"|"+x.competence_id)||0) >= x.niveau) atteintes++; else ec = true; }); if (ec) enEcart++; });
      out.competences = {salariesConcernes:concernes.length, salariesEnEcart:enEcart, couverture:exigences ? r1(100 * atteintes / exigences) : null};
    }
    /* formation et habilitations */
    if (actif("FW-Formation") && mats.length){
      out.sources.push("FW-Formation");
      const ins = await enLots(mats, l=>B.all("SELECT i.mat, i.presence, i.resultat, c.duree_h FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id JOIN frm_catalogue c ON c.id=s.catalogue_id WHERE s.statut='realisee' AND s.fin>=? AND s.fin<=? AND i.mat IN ("+ph(l)+")", du, au, ...l));
      const pres = ins.filter(i=>i.presence === "present");
      const hab = (await enLots(mats, l=>B.all("SELECT expire_le FROM frm_habilitations WHERE mat IN ("+ph(l)+")", ...l)));
      out.formation = {participations:pres.length, heures:r1(pres.reduce((s, i)=>s + (+i.duree_h||0), 0)), tauxReussite:pres.length ? r1(100 * pres.filter(i=>i.resultat === "acquis").length / pres.length) : null,
        besoinsOuverts:(await enLots(mats, l=>B.all("SELECT 1 FROM frm_besoins WHERE statut='ouvert' AND mat IN ("+ph(l)+")", ...l))).length,
        habilitationsValides:hab.filter(h=>!h.expire_le || h.expire_le >= au).length, habilitationsExpirees:hab.filter(h=>h.expire_le && h.expire_le < au).length};
    }
    /* évaluations */
    if (actif("FW-Evaluation") && mats.length){
      out.sources.push("FW-Evaluation");
      const ev = await enLots(mats, l=>B.all("SELECT a.statut, a.note FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE c.debut<=? AND c.fin>=? AND a.mat IN ("+ph(l)+")", au, du, ...l));
      const notes = ev.filter(e=>e.note != null).map(e=>+e.note);
      out.evaluation = {evaluations:ev.length, realisees:ev.filter(e=>e.statut === "terminee" || e.statut === "validee").length, validees:ev.filter(e=>e.statut === "validee").length,
        tauxRealisation:ev.length ? r1(100 * ev.filter(e=>e.statut === "terminee" || e.statut === "validee").length / ev.length) : null, noteMoyenne:notes.length ? r1(notes.reduce((s, n)=>s + n, 0) / notes.length) : null};
    }
    /* santé et sécurité (aucune donnée médicale) */
    if (actif("FW-HSE")){
      out.sources.push("FW-HSE");
      const evs = (await B.all("SELECT type, mat, site_id, arret, jours_arret FROM hse_evenements WHERE d>=? AND d<=?", du, au)).filter(e=>e.mat ? set.has(String(e.mat)) : (P.set === null && !q.dept && !q.fonction && (!q.site || e.site_id === q.site)));
      const aa = evs.filter(e=>e.type === "accident" && e.arret), j = aa.reduce((s, e)=>s + (+e.jours_arret||0), 0), h = out.temps ? out.temps.heuresPresence : 0;
      out.hse = {accidents:evs.filter(e=>e.type === "accident").length, avecArret:aa.length, joursArret:j, presqueAccidents:evs.filter(e=>e.type === "presque_accident").length,
        tf:h ? Math.round(aa.length * 1e6 / h * 100) / 100 : null, tg:h ? Math.round(j * 1e3 / h * 100) / 100 : null};
    }
    /* v56.21 : suivi médical — taux et nombres par service seulement (masqués sous 5 salariés), jamais de détail */
    if (actif("FW-Medicale") && o.service){ const m = o.service("FW-Medicale");
      if (m && m.indicateurs){ out.sources.push("FW-Medicale"); out.medical = await m.indicateurs(emps, du, au); } }
    /* recrutement (postes ouverts : global ; embauches de la période dans le périmètre) */
    if (actif("FW-Recrutement")){
      out.sources.push("FW-Recrutement");
      const emb = (await B.all("SELECT mat FROM rec_embauches WHERE le>=? AND le<=?", du, au+"T23:59:59")).filter(r=>set.has(String(r.mat))).length;
      out.recrutement = {postesOuverts:Number((await B.get("SELECT COUNT(*) n FROM rec_postes WHERE statut='ouvert'")).n), candidaturesPeriode:Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE cree>=? AND cree<=?", du, au+"T23:59:59")).n), embauches:emb};
    }
    return out;
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).ETA] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des états requis.");
    const q = Object.fromEntries(u.searchParams.entries());
    if (p === "/api/v1/bi/tableau" && req.method === "GET"){
      /* 56.32 : cache partagé par périmètre (tous les utilisateurs à périmètre global lisent le même résultat), gardé
         30 min, préchauffé en tâche de fond : premier affichage mesuré à 39 s pour 60 000 salariés, désormais servi du cache */
      const cle = cleCache(P, C, q), c = CACHE.get(cle);
      if (c && Date.now() - c.t < TTL && !q.frais) return json(res, 200, Object.assign({}, c.r, {cache:true}));
      if (c && !q.frais && c.enCours) return json(res, 200, Object.assign({}, c.r, {cache:true, recalcul:true}));
      const t0 = Date.now(), r = await tableau(C, P, q); r.calculeEnMs = Date.now() - t0;
      CACHE.set(cle, {t:Date.now(), r}); if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value);
      return json(res, 200, r);
    }
    if (p === "/api/v1/bi/filtres" && req.method === "GET"){
      const emps = (await D.employes()).filter(e=>P.set === null || P.set.has(String(e.mat)));
      const ref = await (D.referentielLecture || D.referentiel)() || {}, sitesV = new Set(emps.map(e=>e.siteId)), deptsV = new Set(emps.map(e=>e.deptId));
      return json(res, 200, {fonctions:Array.from(new Set(emps.map(e=>String(e.poste||"").trim()).filter(Boolean))).sort().slice(0, 300),
        sites:(ref.sites||[]).filter(x=>P.set === null || sitesV.has(x.id)).map(x=>({id:x.id, nom:x.nom})), depts:(ref.depts||[]).filter(x=>P.set === null || deptsV.has(x.id)).map(x=>({id:x.id, nom:x.nom}))});
    }
    return erreur(res, 404, "Introuvable.");
  }
  const TTL = 30 * 60000;
  const cleCache = (P, C, q) => (P.set === null ? "*" : C.login)+"|"+JSON.stringify({du:q.du, au:q.au, site:q.site||"", dept:q.dept||"", fonction:q.fonction||""});
  /* préchauffage du périmètre global (30, 90 et 365 jours, et la période précédente de 30 jours pour les tendances) :
     1 min après le démarrage, puis toutes les 30 min — les premiers utilisateurs ne paient plus le calcul */
  async function prechauffer(){
    if (!actif("FW-BI")) return;
    const auj = new Date().toISOString().slice(0, 10), C0 = {login:"*"}, P0 = {set:null, profil:null};
    for (const [du, au] of [[ajoutJours(auj, -29), auj], [ajoutJours(auj, -89), auj], [ajoutJours(auj, -364), auj], [ajoutJours(auj, -59), ajoutJours(auj, -30)]]){
      const q = {du, au}, cle = cleCache(P0, C0, q), c = CACHE.get(cle); if (c && Date.now() - c.t < TTL - 60000) continue;
      try { const t0 = Date.now(), r = await tableau(C0, P0, q); r.calculeEnMs = Date.now() - t0; CACHE.set(cle, {t:Date.now(), r}); } catch(e){ (o.journal||console.log)("pilotage : préchauffage : "+e.message); }
      await new Promise(ok=>setTimeout(ok, 500)); }
  }
  if (o.planifier) o.planifier("prechauffage", {intervalle:30 * 60000, premier:90000, delai:15 * 60000, priorite:3, fn:prechauffer});
  function surEvenement(){ CACHE.forEach(c=>{ c.t = 0; }); }
  return {traiter, surEvenement};
}
module.exports = {ddl, tables, creer};
