/* FW-BI — pilotage transverse. Lit, sans les copier, les sources autorisées : salariés (FW-RH), journées calculées
   (FW-Time), et selon les modules actifs : compétences, formation, évaluations, santé et sécurité, recrutement.
   Filtres serveur (période, site, service, fonction) appliqués au périmètre de l'utilisateur ; résultats agrégés
   seulement (aucune liste nominative), mis en cache 30 minutes au plus (invalidé dès que les données changent) ;
   aucune donnée médicale, petits groupes masqués. */
"use strict";
const ddl = {pg:[], sqlite:[]}, tables = {};
/* journée prévue (même définition que le préaudit) */
const PREVU = "(nmv > 0 OR (jid NOT IN ('repos','ferie') AND jid <> '' AND ht > 0))";
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* correctif 17 : date réelle (2026-02-31 refusée), jour local du serveur, période contrôlée (3 ans au plus) */
const dateVraie = k => /^\d{4}-\d{2}-\d{2}$/.test(k || "") && !isNaN(new Date(k+"T00:00:00Z")) && new Date(k+"T00:00:00Z").toISOString().slice(0, 10) === k;
const aujLocal = () => { const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2, "0")+"-"+String(n.getDate()).padStart(2, "0"); };
function periode(q){
  if ((q.du && !dateVraie(q.du)) || (q.au && !dateVraie(q.au))) throw Object.assign(new Error("Date invalide."), {code:400});
  const au = q.au || aujLocal(), du = q.du || ajoutJours(au, -29);
  if (du > au) throw Object.assign(new Error("La date de début est postérieure à la date de fin."), {code:400});
  if (ajoutJours(du, 3*366) < au) throw Object.assign(new Error("Période limitée à 3 ans."), {code:400});
  return {du, au};
}
/* correctif 17 : seuil de masquage des petits groupes (comme le suivi médical) et types d'absence liés à la santé */
const SEUIL = 5, SANTE = /maladie|matern|patern|m[ée]dic|sant[ée]|accident|hospital|grossesse/i;
/* service et ses sous-services (comme les autres écrans) */
function arbreDept(ref, id){ const a = new Set([id]); let aj = true; while (aj){ aj = false; (ref.depts || []).forEach(d=>{ if (d && a.has(d.parent) && !a.has(d.id)){ a.add(d.id); aj = true; } }); } return a; }
function creer(o){
  const {B, D} = o, actif = o.moduleActif || (()=>false), CACHE = new Map();
  const r1 = x => Math.round(x * 10) / 10;
  async function enLots(mats, fn){ let acc = []; for (let i = 0; i < mats.length; i += 500) acc = acc.concat(await fn(mats.slice(i, i+500))); return acc; }
  const ph = l => l.map(()=>"?").join(",");
  async function selectionner(P, q){
    const ref = await (D.referentielLecture || D.referentiel)() || {}, arbre = q.dept ? arbreDept(ref, q.dept) : null;
    return (await D.employes()).filter(e=>(P.set === null || P.set.has(String(e.mat))) && (!q.site || e.siteId === q.site) && (!arbre || arbre.has(e.deptId)) && (!q.fonction || String(e.poste||"").trim() === q.fonction));
  }
  /* correctif 17 : journées calculées avant lecture (les journées absentes donnaient 0 % de présence) */
  async function assurer(mats, du, au){ if (o.assurer && mats.length && du <= au) try { await o.assurer(mats, du, au); } catch(e){ (o.journal||console.log)("pilotage : calcul des journées : "+e.message); } }
  async function tableau(C, P, q){
    const {du, au} = periode(q);
    const emps = await selectionner(P, q);
    const actifs = emps.filter(e=>(!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au)), mats = emps.map(e=>String(e.mat)), set = new Set(mats);
    const out = {du, au, filtres:{site:q.site||"", dept:q.dept||"", fonction:q.fonction||""}, sources:["FW-RH"]};
    out.effectifs = {actifs:actifs.length, entrees:emps.filter(e=>e.entree && e.entree >= du && e.entree <= au).length, sorties:emps.filter(e=>e.sortie && e.sortie >= du && e.sortie <= au).length};
    /* temps (FW-Time) : présence, théorique, heures supplémentaires, jours d'absence, retards */
    if (actif("FW-Time") && mats.length){
      out.sources.push("FW-Time");
      const global = P.set === null && !q.site && !q.dept && !q.fonction;
      /* journées terminées seulement (la journée en cours fausserait la présence) ; heures supplémentaires = écarts
         positifs (la colonne hs est l'écart présence − théorique, en minutes) */
      const hier = ajoutJours(aujLocal(), -1), auT = au < hier ? au : hier;
      await assurer(mats, du, auT);
      /* correctif 17 : définitions — journées PRÉVUES (hors repos et fériés non travaillés) ; présence = heures faites dans
         la limite du théorique / théorique prévu ; heures supplémentaires = celles retenues par les règles (seuil, fériés),
         les dépassements bruts sont comptés à part ; absences = journées prévues en absence non justifiée */
      const sel = "SELECT substr(d,1,7) m, SUM(CASE WHEN "+PREVU+" THEN 1 ELSE 0 END) j, SUM(CASE WHEN "+PREVU+" THEN (CASE WHEN hp < ht THEN hp ELSE ht END) ELSE 0 END) hp, SUM(CASE WHEN "+PREVU+" THEN ht ELSE 0 END) ht, SUM(COALESCE(hsmin, 0)) / 60.0 hs, SUM(CASE WHEN hs > 0 THEN hs ELSE 0 END) / 60.0 dep, SUM(hp) hpt, SUM(CASE WHEN "+PREVU+" AND types LIKE '%absence%' THEN 1 ELSE 0 END) abs, SUM(CASE WHEN ret > 0 THEN 1 ELSE 0 END) ret, "+
        "SUM(CASE WHEN jid='ferie' AND hp > 0 THEN 1 ELSE 0 END) fer, SUM(CASE WHEN jid='ferie' THEN hp ELSE 0 END) hfer, SUM(CASE WHEN jid='repos' AND hp > 0 THEN 1 ELSE 0 END) rep, "+
        "SUM(CASE WHEN jid='repos' THEN hp ELSE 0 END) hrep, SUM(CASE WHEN types LIKE '%oubli%' THEN 1 ELSE 0 END) oub, SUM(CASE WHEN nano > 0 THEN 1 ELSE 0 END) ano FROM calc_jour WHERE d>=? AND d<=?";
      const lignes = du > auT ? [] : global ? await B.all(sel+" GROUP BY substr(d,1,7)", du, auT) : await enLots(mats, l=>B.all(sel+" AND mat IN ("+ph(l)+") GROUP BY substr(d,1,7)", du, auT, ...l));
      const K = ["jours", "hp", "ht", "hs", "dep", "hpt", "abs", "ret", "fer", "hfer", "rep", "hrep", "oub", "ano"], mois = {};
      lignes.forEach(r=>{ const x = mois[r.m] || (mois[r.m] = Object.assign({mois:r.m}, Object.fromEntries(K.map(k=>[k, 0])))); K.forEach(k=>{ x[k] += +(k === "jours" ? r.j : r[k]) || 0; }); });
      const t = Object.fromEntries(K.map(k=>[k, Object.values(mois).reduce((s, x)=>s + x[k], 0)]));
      out.temps = {heuresPresence:Math.round(t.hpt), heuresTheoriques:Math.round(t.ht), heuresSup:r1(t.hs), depassements:r1(t.dep), tauxPresence:t.ht ? r1(100 * t.hp / t.ht) : null,
        joursPrevus:t.jours, joursAbsence:t.abs, tauxAbsenteisme:t.jours ? r1(100 * t.abs / t.jours) : null, joursRetard:t.ret, calculeJusquau:auT,
        joursFeriesTravailles:t.fer, heuresFeriees:Math.round(t.hfer), joursReposTravailles:t.rep, heuresRepos:Math.round(t.hrep), oublisBadgeage:t.oub, journeesAnomalie:t.ano,
        parMois:Object.values(mois).sort((a, b)=>a.mois.localeCompare(b.mois)).map(x=>({mois:x.mois, tauxPresence:x.ht ? r1(100 * x.hp / x.ht) : null, heuresSup:r1(x.hs), absenteisme:x.jours ? r1(100 * x.abs / x.jours) : null}))};
    }
    /* compétences : salariés en écart / couverts, par rapport aux niveaux requis de leur fonction */
    const domaine = async (nom, fn) => { try { await fn(); } catch(e){ (o.journal||console.log)("pilotage : "+nom+" : "+e.message); } };
    if (actif("FW-Competences") && actifs.length) await domaine("compétences", async ()=>{
      out.sources.push("FW-Competences");
      const exig = await B.all("SELECT e.fonction, e.competence_id, e.niveau FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE c.actif=1");
      const parF = {}; exig.forEach(x=>{ (parF[x.fonction] = parF[x.fonction] || []).push(x); });
      const concernes = actifs.filter(e=>parF[String(e.poste||"").trim()]);
      const niv = new Map(); (await enLots(concernes.map(e=>String(e.mat)), l=>B.all("SELECT mat, competence_id, niveau FROM comp_niveaux WHERE mat IN ("+ph(l)+")", ...l))).forEach(r=>niv.set(r.mat+"|"+r.competence_id, r.niveau));
      let exigences = 0, atteintes = 0, enEcart = 0;
      concernes.forEach(e=>{ let ec = false; parF[String(e.poste).trim()].forEach(x=>{ exigences++; if ((niv.get(String(e.mat)+"|"+x.competence_id)||0) >= x.niveau) atteintes++; else ec = true; }); if (ec) enEcart++; });
      out.competences = {salariesConcernes:concernes.length, salariesEnEcart:enEcart, couverture:exigences ? r1(100 * atteintes / exigences) : null};
    });
    /* formation et habilitations */
    if (actif("FW-Formation") && mats.length) await domaine("formation", async ()=>{
      out.sources.push("FW-Formation");
      const ins = await enLots(mats, l=>B.all("SELECT i.mat, i.presence, i.resultat, c.duree_h FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id JOIN frm_catalogue c ON c.id=s.catalogue_id WHERE s.statut='realisee' AND s.fin>=? AND s.fin<=? AND i.mat IN ("+ph(l)+")", du, au, ...l));
      const pres = ins.filter(i=>i.presence === "present");
      /* correctif 17 : habilitations des salariés actifs seulement (celles des salariés sortis étaient comptées expirées) */
      const matsA = actifs.map(e=>String(e.mat)), hab = matsA.length ? (await enLots(matsA, l=>B.all("SELECT expire_le FROM frm_habilitations WHERE mat IN ("+ph(l)+")", ...l))) : [];
      out.formation = {participations:pres.length, heures:r1(pres.reduce((s, i)=>s + (+i.duree_h||0), 0)), tauxReussite:pres.length ? r1(100 * pres.filter(i=>i.resultat === "acquis").length / pres.length) : null,
        besoinsOuverts:(await enLots(mats, l=>B.all("SELECT 1 FROM frm_besoins WHERE statut='ouvert' AND mat IN ("+ph(l)+")", ...l))).length,
        habilitationsValides:hab.filter(h=>!h.expire_le || h.expire_le >= au).length, habilitationsExpirees:hab.filter(h=>h.expire_le && h.expire_le < au).length};
    });
    /* évaluations */
    if (actif("FW-Evaluation") && mats.length) await domaine("évaluations", async ()=>{
      out.sources.push("FW-Evaluation");
      const ev = await enLots(mats, l=>B.all("SELECT a.statut, a.note FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE c.debut<=? AND c.fin>=? AND a.mat IN ("+ph(l)+")", au, du, ...l));
      const notes = ev.filter(e=>e.note != null).map(e=>+e.note);
      out.evaluation = {evaluations:ev.length, realisees:ev.filter(e=>e.statut === "terminee" || e.statut === "validee").length, validees:ev.filter(e=>e.statut === "validee").length,
        tauxRealisation:ev.length ? r1(100 * ev.filter(e=>e.statut === "terminee" || e.statut === "validee").length / ev.length) : null, noteMoyenne:notes.length ? r1(notes.reduce((s, n)=>s + n, 0) / notes.length) : null};
    });
    /* santé et sécurité (aucune donnée médicale) */
    if (actif("FW-HSE")) await domaine("santé et sécurité", async ()=>{
      out.sources.push("FW-HSE");
      const evs = (await B.all("SELECT type, mat, site_id, arret, jours_arret FROM hse_evenements WHERE d>=? AND d<=?", du, au)).filter(e=>e.mat ? set.has(String(e.mat)) : (P.set === null && !q.dept && !q.fonction && (!q.site || e.site_id === q.site)));
      const aa = evs.filter(e=>e.type === "accident" && e.arret), j = aa.reduce((s, e)=>s + (+e.jours_arret||0), 0), h = out.temps ? out.temps.heuresPresence : 0;
      out.hse = {accidents:evs.filter(e=>e.type === "accident").length, avecArret:aa.length, joursArret:j, presqueAccidents:evs.filter(e=>e.type === "presque_accident").length,
        tf:h ? Math.round(aa.length * 1e6 / h * 100) / 100 : null, tg:h ? Math.round(j * 1e3 / h * 100) / 100 : null};
    });
    /* v56.21 : suivi médical — taux et nombres par service seulement (masqués sous 5 salariés), jamais de détail */
    if (actif("FW-Medicale") && o.service){ const m = o.service("FW-Medicale");
      if (m && m.indicateurs){ out.sources.push("FW-Medicale"); out.medical = await m.indicateurs(emps, du, au); } }
    /* recrutement (postes ouverts : global ; embauches de la période dans le périmètre) */
    if (actif("FW-Recrutement")) await domaine("recrutement", async ()=>{
      out.sources.push("FW-Recrutement");
      const emb = (await B.all("SELECT mat FROM rec_embauches WHERE le>=? AND le<=?", du, au+"T23:59:59")).filter(r=>set.has(String(r.mat))).length;
      /* correctif 17 : postes ouverts et candidatures sont comptés pour toute l'entreprise : réservés au périmètre global */
      const glob = P.set === null && !q.site && !q.dept && !q.fonction;
      out.recrutement = {postesOuverts:glob ? Number((await B.get("SELECT COUNT(*) n FROM rec_postes WHERE statut='ouvert'")).n) : null, candidaturesPeriode:glob ? Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE cree>=? AND cree<=?", du, au+"T23:59:59")).n) : null, embauches:emb};
    });
    /* 56.33.11 : absences par type (fiches d'absence de la période, une ligne par jour d'absence) */
    if (mats.length){ try {
      /* correctif 17 : absences seulement (classes 4 et 5 : ni présence, ni mission, ni formation) ; demi-journées = 0,5 j ;
         types saisis en heures comptés en heures ; types liés à la santé regroupés ; rien sous 5 salariés */
      const pg = B.type === "pg", tt = pg ? "data::jsonb->>'tt'" : "json_extract(data, '$.tt')", hh = pg ? "COALESCE((data::jsonb->>'h')::float, 0)" : "COALESCE(json_extract(data, '$.h'), 0)", global = P.set === null && !q.site && !q.dept && !q.fonction;
      const sql = "SELECT "+tt+" tt, COUNT(*) n, SUM(CASE WHEN "+hh+" > 0 AND "+hh+" < 5 THEN 0.5 ELSE 1 END) j, SUM("+hh+") h FROM enreg WHERE coll='abs' AND d>=? AND d<=?";
      const l = global ? await B.all(sql+" GROUP BY "+tt, du, au) : await enLots(mats, x=>B.all(sql+" AND mat IN ("+ph(x)+") GROUP BY "+tt, du, au, ...x));
      const ref = await (D.referentielLecture || D.referentiel)() || {}, noms = new Map((ref.tt||[]).map(t=>[t.id, t])), par = {};
      l.forEach(r=>{ const t = noms.get(String(r.tt||"")) || {}; if (t.cls !== undefined && +t.cls < 4) return;
        const sante = SANTE.test(String(t.nom || "")), horaire = t.saisie === "heure", k = sante ? (horaire ? "__sante_h" : "__sante") : String(r.tt||"");
        const x = par[k] || (par[k] = {code:sante ? k : (t.code || k), nom:sante ? "" : (t.nom || k), sante, unite:horaire ? "h" : "j", jours:0});
        x.jours += horaire ? (+r.h || 0) : (+r.j || 0); });
      const lst = Object.values(par).map(x=>Object.assign(x, {jours:r1(x.jours)})).sort((a, b)=>b.jours - a.jours);
      out.absences = actifs.length < SEUIL && !global ? {masque:true, seuil:SEUIL, total:null, parType:[]} : {total:r1(lst.filter(x=>x.unite === "j").reduce((s, x)=>s + x.jours, 0)), heures:r1(lst.filter(x=>x.unite === "h").reduce((s, x)=>s + x.jours, 0)), parType:lst.slice(0, 20)};
    } catch(e){ (o.journal||console.log)("pilotage : absences par type : "+e.message); } }
    /* 56.33.11 : visiteurs (sites du filtre ; hôtes du périmètre pour un utilisateur limité) */
    if (actif("FW-Visiteurs")){ try {
      const l = (await B.all("SELECT statut, site_id, hote_mat, entreprise_id, arrivee_le FROM vis_visites WHERE d>=? AND d<=?"+(q.site ? " AND site_id=?" : ""), du, au, ...(q.site ? [q.site] : [])))
        .filter(v=>P.set === null && !q.dept && !q.fonction ? true : set.has(String(v.hote_mat)));
      out.sources.push("FW-Visiteurs");
      out.visiteurs = {visites:l.length, realisees:l.filter(v=>v.arrivee_le).length, annulees:l.filter(v=>String(v.statut).toUpperCase() === "ANNULEE").length, entreprises:new Set(l.map(v=>v.entreprise_id)).size};
    } catch(e){ (o.journal||console.log)("pilotage : visiteurs : "+e.message); } }
    /* 56.33.11 : intégration des nouveaux collaborateurs (parcours du périmètre, tâches en retard) */
    if (actif("FW-Onboarding") && mats.length){ try {
      const par = await enLots(mats, x=>B.all("SELECT id, statut, debut FROM onb_parcours WHERE mat IN ("+ph(x)+")", ...x)), ids = par.map(r=>r.id), auj = new Date().toISOString().slice(0, 10);
      const tch = ids.length ? await enLots(ids, x=>B.all("SELECT echeance, faite_le FROM onb_taches WHERE parcours_id IN ("+ph(x)+")", ...x)) : [];
      const faites = tch.filter(t=>t.faite_le), aTemps = faites.filter(t=>!t.echeance || String(t.faite_le).slice(0, 10) <= t.echeance);
      out.sources.push("FW-Onboarding");
      out.integration = {parcoursEnCours:par.filter(r=>r.statut === "en_cours").length, parcoursDemarres:par.filter(r=>r.debut >= du && r.debut <= au).length,
        tachesEnRetard:tch.filter(t=>!t.faite_le && t.echeance && t.echeance < auj).length, tachesATemps:faites.length ? r1(100 * aTemps.length / faites.length) : null};
    } catch(e){ (o.journal||console.log)("pilotage : intégration : "+e.message); } }
    /* 56.33.11 : règles biométriques (salariés bloqués pendant une absence, retraits en attente ou en échec) */
    if ((actif("FW-Time") || actif("FW-Acces")) && mats.length){ try {
      const bl = await enLots(mats, x=>B.all("SELECT mat FROM bio_blocages WHERE statut='actif' AND mat IN ("+ph(x)+")", ...x));
      const fi = await enLots(mats, x=>B.all("SELECT statut FROM bio_sync_queue WHERE action='retrait' AND statut IN ('attente','echec','en_cours') AND mat IN ("+ph(x)+")", ...x));
      out.biometrie = {bloques:bl.length, retraitsEnAttente:fi.filter(r=>r.statut !== "echec").length, retraitsEnEchec:fi.filter(r=>r.statut === "echec").length};
    } catch(e){ /* tables absentes : synchronisation biométrique jamais démarrée */ } }
    return out;
  }
  /* 56.33.11 : ventilation par site, service ou fonction (indicateurs principaux par groupe, triés par effectif) */
  async function ventilation(C, P, q){
    const axe = ["site", "dept", "fonction"].indexOf(q.axe) >= 0 ? q.axe : "site";
    const {du, au} = periode(q);
    const emps = await selectionner(P, q);
    const ref = await (D.referentielLecture || D.referentiel)() || {}, noms = new Map([].concat((ref.sites||[]).map(x=>["site|"+x.id, x.nom]), (ref.depts||[]).map(x=>["dept|"+x.id, x.nom])));
    const cle = e => axe === "site" ? String(e.siteId||"") : axe === "dept" ? String(e.deptId||"") : String(e.poste||"").trim();
    const G = new Map(), grp = k => G.get(k) || G.set(k, {cle:k, nom:k ? (axe === "fonction" ? k : noms.get(axe+"|"+k) || k) : "—", effectif:0, jours:0, hp:0, ht:0, hs:0, abs:0, ret:0, accidents:0}).get(k);
    const parMat = new Map(); emps.forEach(e=>{ parMat.set(String(e.mat), cle(e)); if ((!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au)) grp(cle(e)).effectif++; });
    if (actif("FW-Time") && emps.length){
      const hier = ajoutJours(aujLocal(), -1), auT = au < hier ? au : hier, global = P.set === null && !q.site && !q.dept && !q.fonction;
      await assurer(Array.from(parMat.keys()), du, auT);
      const sel = "SELECT mat, SUM(CASE WHEN "+PREVU+" THEN 1 ELSE 0 END) j, SUM(CASE WHEN "+PREVU+" THEN (CASE WHEN hp < ht THEN hp ELSE ht END) ELSE 0 END) hp, SUM(CASE WHEN "+PREVU+" THEN ht ELSE 0 END) ht, SUM(COALESCE(hsmin, 0)) / 60.0 hs, SUM(CASE WHEN "+PREVU+" AND types LIKE '%absence%' THEN 1 ELSE 0 END) abs, SUM(CASE WHEN ret > 0 THEN 1 ELSE 0 END) ret FROM calc_jour WHERE d>=? AND d<=?";
      const l = du > auT ? [] : global ? await B.all(sel+" GROUP BY mat", du, auT) : await enLots(Array.from(parMat.keys()), x=>B.all(sel+" AND mat IN ("+ph(x)+") GROUP BY mat", du, auT, ...x));
      l.forEach(r=>{ const k = parMat.get(String(r.mat)); if (k === undefined) return; const g = grp(k); g.jours += +r.j||0; g.hp += +r.hp||0; g.ht += +r.ht||0; g.hs += +r.hs||0; g.abs += +r.abs||0; g.ret += +r.ret||0; });
    }
    if (actif("FW-HSE")) (await B.all("SELECT mat FROM hse_evenements WHERE type='accident' AND d>=? AND d<=? AND mat IS NOT NULL", du, au)).forEach(r=>{ const k = parMat.get(String(r.mat)); if (k !== undefined) grp(k).accidents++; });
    /* correctif 17 : groupe de moins de 5 salariés masqué (indicateurs individuels reconnaissables) */
    const lignes = Array.from(G.values()).map(g=>g.effectif < SEUIL ? {cle:g.cle, nom:g.nom, effectif:g.effectif, masque:true} : ({cle:g.cle, nom:g.nom, effectif:g.effectif, tauxPresence:g.ht ? r1(100 * g.hp / g.ht) : null, absenteisme:g.jours ? r1(100 * g.abs / g.jours) : null,
      heuresSup:r1(g.hs), joursRetard:g.ret, accidents:g.accidents})).sort((a, b)=>b.effectif - a.effectif);
    return {axe, du, au, seuil:SEUIL, groupes:lignes.length, lignes:lignes.slice(0, 300)};
  }
  /* 56.33.11 : réglage partagé (objectifs et indicateurs par défaut pour tous) — modifiable avec le droit de paramétrage des états */
  async function configLire(){ try { const r = await B.get("SELECT v FROM meta WHERE k='bi_config'"); return r ? JSON.parse(r.v) : {}; } catch(e){ return {}; } }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur} = x;
    GEN_COURANTE = await genDonnees();
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).ETA] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des états requis.");
    /* correctif 17 : écran masqué pour le profil = aucune donnée (le masquage n'était qu'affiché) */
    if (!admin && ((P.profil || {}).menus || {}).pilotage === "masque") return erreur(res, 403, "Écran Pilotage transverse masqué pour votre profil.");
    const q = Object.fromEntries(u.searchParams.entries());
    /* correctif 17 : recalcul forcé (« Actualiser ») réservé au paramétrage des états ; pour les autres, le cache est déjà
       invalidé dès qu'une donnée change */
    if (q.frais && rang < 4) delete q.frais;
    try { periode(q); } catch(e){ if (p === "/api/v1/bi/tableau" || p === "/api/v1/bi/ventilation" || p === "/api/v1/bi/export") return erreur(res, e.code || 400, e.message); }
    /* correctif 17 : export contrôlé par la matrice des droits et tracé (le fichier était fabriqué dans le navigateur) */
    if (p === "/api/v1/bi/export" && req.method === "POST"){
      if (!admin && (((P.profil || {}).actions || {}).pilotage || {}).exporter === false) return erreur(res, 403, "Droit d'export requis.");
      if (o.audit) await o.audit(C.login, "pilotage.export", "pilotage transverse "+(q.du||"")+" → "+(q.au||"")+(q.site ? " site "+q.site : "")+(q.dept ? " service "+q.dept : "")+(q.fonction ? " fonction "+q.fonction : ""), x.ip);
      return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/bi/tableau" && req.method === "GET"){
      /* 56.32 : cache partagé par périmètre (tous les utilisateurs à périmètre global lisent le même résultat), gardé
         30 min, préchauffé en tâche de fond : premier affichage mesuré à 39 s pour 60 000 salariés, désormais servi du cache */
      const cle = cleCache(P, C, q), c = CACHE.get(cle);
      if (c && Date.now() - c.t < TTL && !q.frais) return json(res, 200, Object.assign({}, c.r, {cache:true}));
      try { const r = await calculUnique(cle, ()=>tableau(C, P, q)); return json(res, 200, r); } catch(e){ return erreur(res, e.code || 500, e.message); }
    }
    if (p === "/api/v1/bi/ventilation" && req.method === "GET"){
      const cle = "V|"+cleCache(P, C, q)+"|"+(q.axe||""), c = CACHE.get(cle);
      if (c && Date.now() - c.t < TTL && !q.frais) return json(res, 200, Object.assign({}, c.r, {cache:true}));
      try { const r = await calculUnique(cle, ()=>ventilation(C, P, q)); return json(res, 200, r); } catch(e){ return erreur(res, e.code || 500, e.message); }
    }
    if (p === "/api/v1/bi/config" && req.method === "GET"){ const cf = await configLire(); delete cf.par; return json(res, 200, Object.assign({objectifs:{}, choix:null}, cf, {modifiable:rang >= 4})); }
    if (p === "/api/v1/bi/config" && (req.method === "PUT" || req.method === "POST")){
      if (rang < 4) return erreur(res, 403, "Réservé au paramétrage des états.");
      const b = await x.corpsJson(req, 64e3), ob = {};
      Object.keys(b.objectifs || {}).slice(0, 100).forEach(k=>{ const v = Number(b.objectifs[k]); if (/^[A-Za-z0-9_]{1,40}$/.test(k) && Number.isFinite(v) && Math.abs(v) <= 1e9) ob[k] = v; });
      const choix = Array.isArray(b.choix) ? b.choix.map(String).filter(k=>/^[A-Za-z0-9_]{1,40}$/.test(k)).slice(0, 100) : null;
      const v = {objectifs:ob, choix, par:C.login, le:new Date().toISOString()};
      await B.run("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", "bi_config", JSON.stringify(v));
      if (o.audit) await o.audit(C.login, "pilotage.config", Object.keys(ob).length+" objectif(s), "+(choix ? choix.length : "tous les")+" indicateur(s) par défaut", x.ip);
      return json(res, 200, Object.assign(v, {modifiable:true}));
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
  /* correctif 17 : la clé du cache contient l'empreinte du périmètre et la génération des données (modification par un
     utilisateur, badgeage reçu, salarié modifié) — l'ancien périmètre ou d'anciennes données ne sont plus servis */
  const empreinteSet = set => { if (set === null) return "*"; let h = 0; Array.from(set).sort().forEach(m=>{ for (let i = 0; i < m.length; i++) h = (Math.imul(h, 31) + m.charCodeAt(i)) | 0; h = (Math.imul(h, 31) + 7) | 0; }); return set.size+":"+(h >>> 0).toString(36); };
  let EMPS_GEN = 0, EMPS_REF = null;
  const genDonnees = async () => { const l = await D.employes(); if (l !== EMPS_REF){ EMPS_REF = l; EMPS_GEN++; } return (o.generation ? o.generation() : "")+"|"+EMPS_GEN; };
  let GEN_COURANTE = "";
  const cleCache = (P, C, q) => empreinteSet(P.set)+"|"+GEN_COURANTE+"|"+JSON.stringify({du:q.du, au:q.au, site:q.site||"", dept:q.dept||"", fonction:q.fonction||""});
  /* un seul calcul à la fois pour une même clé (des « Actualiser » répétés attendaient chacun leur calcul) */
  const EN_COURS = new Map();
  function calculUnique(cle, fn){
    if (EN_COURS.has(cle)) return EN_COURS.get(cle);
    const pr = (async ()=>{ const t0 = Date.now(), r = await fn(); r.calculeEnMs = Date.now() - t0;
      /* le calcul des journées manquantes fait avancer la génération : le résultat est rangé sous la clé à jour */
      const g0 = GEN_COURANTE; GEN_COURANTE = await genDonnees(); const cle2 = g0 === GEN_COURANTE ? cle : cle.split(g0).join(GEN_COURANTE);
      CACHE.set(cle2, {t:Date.now(), r}); if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value); return r; })();
    EN_COURS.set(cle, pr); pr.then(()=>EN_COURS.delete(cle), ()=>EN_COURS.delete(cle));
    return pr;
  }
  /* préchauffage du périmètre global (30, 90 et 365 jours, et la période précédente de 30 jours pour les tendances) :
     1 min après le démarrage, puis toutes les 30 min — les premiers utilisateurs ne paient plus le calcul */
  async function prechauffer(){
    if (!actif("FW-BI")) return;
    const auj = aujLocal(), C0 = {login:"*"}, P0 = {set:null, profil:null}; GEN_COURANTE = await genDonnees();
    for (const [du, au] of [[ajoutJours(auj, -29), auj], [ajoutJours(auj, -89), auj], [ajoutJours(auj, -364), auj], [ajoutJours(auj, -59), ajoutJours(auj, -30)]]){
      const q = {du, au}, cle = cleCache(P0, C0, q), c = CACHE.get(cle); if (c && Date.now() - c.t < TTL - 60000) continue;
      try { await calculUnique(cle, ()=>tableau(C0, P0, q)); } catch(e){ (o.journal||console.log)("pilotage : préchauffage : "+e.message); }
      await new Promise(ok=>setTimeout(ok, 500)); }
    /* 56.33.11 : ventilation par site des 30 derniers jours (vue proposée à l'ouverture) */
    { const q = {du:ajoutJours(auj, -29), au:auj, axe:"site"}, cle = "V|"+cleCache(P0, C0, q)+"|site", c = CACHE.get(cle);
      if (!(c && Date.now() - c.t < TTL - 60000)) try { await calculUnique(cle, ()=>ventilation(C0, P0, q)); } catch(e){ (o.journal||console.log)("pilotage : préchauffage ventilation : "+e.message); } }
  }
  if (o.planifier) o.planifier("prechauffage", {intervalle:30 * 60000, premier:90000, delai:15 * 60000, priorite:3, fn:prechauffer});
  function surEvenement(){ CACHE.forEach(c=>{ c.t = 0; }); }
  return {traiter, surEvenement};
}
module.exports = {ddl, tables, creer};
