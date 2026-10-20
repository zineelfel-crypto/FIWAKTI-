/* FW-HSE — partie serveur. Événements (accidents du travail, accidents de trajet, incidents, presque-accidents) avec
   analyse et clôture, actions correctives à échéance, évaluation des risques (gravité × probabilité), dotations
   d'équipements de protection, registre des accidents, indicateurs (taux de fréquence et de gravité calculés sur les
   heures réellement travaillées, lues dans FW-Time). Aucune donnée médicale : seulement le nombre de jours d'arrêt.
   Correctif 40 : matrice de l'écran « hse » appliquée partout (routes, « À traiter », fiche 360), « À traiter » limité au
   périmètre, victime et faits masqués sans accès aux données sensibles, contrôles stricts (types, dates réelles, entiers,
   heure), verrous et mises à jour conditionnelles (PostgreSQL), heures recalculées quand les journées changent,
   déclaration CNAM (48 h), réouverture motivée, modification d'une déclaration, actions modifiables et annulables,
   risques rattachés à un site et révisés, dotation remplacée soldée, messages trilingues, jour local. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS hse_evenements (id TEXT PRIMARY KEY, type TEXT NOT NULL, d TEXT NOT NULL, heure TEXT, site_id TEXT, lieu TEXT, mat TEXT, gravite INTEGER, arret INTEGER NOT NULL DEFAULT 0, jours_arret INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL, cause TEXT, statut TEXT NOT NULL, declare_par TEXT, cree TEXT NOT NULL, clos_le TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_evenements_d ON hse_evenements(d, type)",
  "CREATE INDEX IF NOT EXISTS hse_evenements_mat ON hse_evenements(mat)",
  "CREATE TABLE IF NOT EXISTS hse_actions (id TEXT PRIMARY KEY, evenement_id TEXT, risque_id TEXT, titre TEXT NOT NULL, responsable TEXT, echeance TEXT NOT NULL, statut TEXT NOT NULL, faite_le TEXT, cree TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_actions_statut ON hse_actions(statut, echeance)",
  "CREATE TABLE IF NOT EXISTS hse_risques (id TEXT PRIMARY KEY, unite TEXT NOT NULL, danger TEXT NOT NULL, gravite INTEGER NOT NULL, probabilite INTEGER NOT NULL, mesures TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS hse_epi (id TEXT PRIMARY KEY, mat TEXT NOT NULL, type TEXT NOT NULL, remis_le TEXT NOT NULL, renouveler_le TEXT, par TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_epi_mat ON hse_epi(mat)",
  "CREATE INDEX IF NOT EXISTS hse_epi_renouv ON hse_epi(renouveler_le)",
  /* correctif 40 : déclaration à la CNAM, site et date de révision des risques, motifs (réouverture, annulation) */
  "CREATE TABLE IF NOT EXISTS hse_declarations (evenement_id TEXT PRIMARY KEY, declaree_le TEXT NOT NULL, reference TEXT, par TEXT, maj TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS hse_risques_sites (risque_id TEXT PRIMARY KEY, site_id TEXT, revise_le TEXT)",
  "CREATE TABLE IF NOT EXISTS hse_journal (id TEXT PRIMARY KEY, objet_id TEXT NOT NULL, nature TEXT NOT NULL, le TEXT NOT NULL, par TEXT, motif TEXT)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS hse_evenements_statut ON hse_evenements(statut, d)","CREATE INDEX IF NOT EXISTS hse_actions_evt ON hse_actions(evenement_id, echeance)",
  "CREATE INDEX IF NOT EXISTS hse_actions_risque ON hse_actions(risque_id)", "CREATE INDEX IF NOT EXISTS hse_epi_mat_type ON hse_epi(mat, type, remis_le)", "CREATE INDEX IF NOT EXISTS hse_journal_objet ON hse_journal(objet_id, le)");
ddl.sqlite = ddl.pg;
const tables = {hse_evenements:"id", hse_actions:"id", hse_risques:"id", hse_epi:"id", hse_declarations:"evenement_id", hse_risques_sites:"risque_id", hse_journal:"id"};
/* l'accident de trajet est un accident du travail au sens de la CNAM, mais il est exclu du taux de fréquence */
const TYPES = ["accident", "accident_trajet", "incident", "presque_accident"], ACC = ["accident", "accident_trajet"];
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const LIB = {
  type:{accident:["Accident du travail","Work accident","حادث شغل"], accident_trajet:["Accident de trajet","Commuting accident","حادث طريق"], incident:["Incident","Incident","حادث عرضي"], presque_accident:["Presque-accident","Near miss","حادث وشيك"]},
  statut:{ouvert:["Ouvert","Open","مفتوح"], en_analyse:["En analyse","Under analysis","قيد التحليل"], clos:["Clos","Closed","مغلق"]},
  oui:["Oui","Yes","نعم"], non:["Non","No","لا"],
  entete:[["Date","Heure","Type","Site","Lieu","Matricule","Salarié","Gravité","Arrêt","Jours d'arrêt","Statut","Déclaration CNAM","Référence CNAM"],
    ["Date","Time","Type","Site","Place","Employee ID","Employee","Severity","Lost time","Days lost","Status","CNAM declaration","CNAM reference"],
    ["التاريخ","الساعة","النوع","الموقع","المكان","المعرف","الأجير","الخطورة","توقف","أيام التوقف","الحالة","التصريح للصندوق","المرجع"]]
};
const MSG = {
  droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
  masque:["Écran Santé et sécurité masqué pour votre profil.", "Health and safety screen hidden for your profile.", "شاشة الصحة والسلامة مخفية لملفك."],
  refuse:["Action non permise par vos droits sur l'écran Santé et sécurité.", "Action not allowed by your rights on the Health and safety screen.", "إجراء غير مسموح بحقوقك على شاشة الصحة والسلامة."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  trop:["Champ « {c} » : {n} caractères au plus.", "Field “{c}”: at most {n} characters.", "الحقل «{c}»: {n} حرفا على الأكثر."],
  declaration:["Type, date réelle et description obligatoires.", "Type, a real date and a description are required.", "النوع والتاريخ والوصف إجبارية."],
  futur:["La date ne peut pas être dans le futur.", "The date cannot be in the future.", "لا يمكن أن يكون التاريخ في المستقبل."],
  heure:["Heure attendue au format hh:mm.", "Time expected as hh:mm.", "الساعة بصيغة سس:دد."],
  gravite:["Gravité : nombre entier de 1 à 4.", "Severity: whole number from 1 to 4.", "الخطورة: عدد صحيح من 1 إلى 4."],
  probabilite:["Probabilité : nombre entier de 1 à 4.", "Likelihood: whole number from 1 to 4.", "الاحتمال: عدد صحيح من 1 إلى 4."],
  jours:["Jours d'arrêt : nombre entier de 0 à 3650.", "Days lost: whole number from 0 to 3650.", "أيام التوقف: عدد صحيح من 0 إلى 3650."],
  arretVictime:["Un arrêt de travail concerne un accident avec un salarié désigné.", "Lost time requires an accident with a named employee.", "التوقف يخص حادثا لأجير محدد."],
  victime:["Un accident désigne le salarié concerné.", "An accident names the employee concerned.", "الحادث يحدد الأجير المعني."],
  salarie:["Salarié introuvable ou hors périmètre.", "Employee not found or outside your scope.", "أجير غير موجود أو خارج نطاقك."],
  sortiLe:["Salarié sorti le {d} : date postérieure à sa sortie.", "Employee left on {d}: date after leaving.", "غادر الأجير في {d}: تاريخ لاحق للمغادرة."],
  avantEntree:["Date antérieure à l'entrée du salarié ({d}).", "Date before the employee's start date ({d}).", "تاريخ سابق لانتداب الأجير ({d})."],
  sorti:["Salarié sorti : aucune dotation possible.", "Employee has left: no issue possible.", "غادر الأجير: لا تسليم ممكن."],
  site:["Site inconnu ou hors périmètre.", "Unknown site or outside your scope.", "موقع غير معروف أو خارج نطاقك."],
  evenement:["Événement introuvable.", "Event not found.", "حدث غير موجود."],
  clos:["Événement clos.", "Event closed.", "الحدث مغلق."],
  pasClos:["Seul un événement clos se rouvre.", "Only a closed event can be reopened.", "يعاد فتح الحدث المغلق فقط."],
  cause:["Renseignez la cause identifiée.", "Enter the root cause.", "أدخل السبب."],
  causeAvant:["Renseignez la cause (analyse) avant de clore.", "Enter the cause (analysis) before closing.", "أدخل السبب قبل الإغلاق."],
  actionsOuvertes:["{n} action(s) corrective(s) encore ouverte(s).", "{n} corrective action(s) still open.", "{n} إجراء تصحيحي ما زال مفتوحا."],
  concurrence:["Élément modifié entre-temps : actualisez.", "Item modified in the meantime: refresh.", "عُدّل العنصر في الأثناء: حدّث."],
  action:["Action et échéance (réelle, à partir d'aujourd'hui) obligatoires.", "Action and a real due date (from today) required.", "الإجراء والأجل إجباريان."],
  echeanceEvt:["Échéance antérieure à l'événement.", "Due date before the event.", "الأجل سابق للحدث."],
  origine:["Rattachez l'action à un événement ou à un risque.", "Link the action to an event or a risk.", "اربط الإجراء بحدث أو بخطر."],
  evtClos:["Événement introuvable ou clos.", "Event not found or closed.", "حدث غير موجود أو مغلق."],
  risque:["Risque introuvable.", "Risk not found.", "خطر غير موجود."],
  actionIntrouvable:["Action introuvable.", "Action not found.", "إجراء غير موجود."],
  actionFaite:["Action déjà faite ou annulée.", "Action already done or cancelled.", "إجراء منجز أو ملغى."],
  motif:["Motif obligatoire.", "Reason required.", "التعليل إجباري."],
  risqueChamps:["Unité de travail et danger obligatoires.", "Work unit and hazard required.", "وحدة العمل والخطر إجباريان."],
  epi:["Salarié, équipement et date de remise (réelle, au plus tard aujourd'hui) obligatoires.", "Employee, equipment and a real issue date (today at the latest) required.", "الأجير والمعدات وتاريخ التسليم إجبارية."],
  renouv:["Date de renouvellement réelle et postérieure à la remise.", "Renewal date must be real and after the issue date.", "تاريخ التجديد لاحق للتسليم."],
  periode:["Période invalide : dates réelles, début ≤ fin, deux ans au plus.", "Invalid period: real dates, start ≤ end, two years at most.", "فترة غير صالحة."],
  cnam:["Date de déclaration réelle, entre la date de l'accident et aujourd'hui.", "Declaration date must be real, between the accident date and today.", "تاريخ التصريح بين تاريخ الحادث واليوم."],
  pasAccident:["Seul un accident se déclare à la CNAM.", "Only an accident is declared to the CNAM.", "يصرح بالحوادث فقط."],
  introuvable:["Introuvable.", "Not found.", "غير موجود."]
};
function creer(o){
  const {B, D, audit} = o, pg = B.type === "pg", actif = o.moduleActif || (()=>true);
  const PERIM = require("../perimetre.js");
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  /* correctif 40 : jour local (entre minuit et 1 h en Tunisie, le jour UTC était la veille) */
  const auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  /* correctif 40 : un mois ou un jour hors limites (2026-13-45) levait une exception (erreur 500) au lieu d'être refusé */
  const dateOk = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0, 4) < 1990 || +s.slice(0, 4) > 2100) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "";
  const entier = v => typeof v === "number" ? (Number.isInteger(v) ? v : NaN) : (typeof v === "string" && /^\d+$/.test(v.trim()) ? +v.trim() : NaN);
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  const n_ = r => !!(r && (r.n || r.changes || r.rowCount));
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* correctif 40 : matrice de l'écran « hse » (menu masqué ou en lecture ; actions lire / créer / modifier / valider / exporter) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).hse, act = (pr.actions || {}).hse || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, sens:!PERIM.masquePerso(P), creer:voir && !ro && rang >= 2 && act.creer !== false, modifier:voir && !ro && rang >= 2 && act.modifier !== false,
      valider:voir && !ro && rang >= 3 && act.valider !== false, exporter:voir && rang >= 2 && act.exporter !== false};
  }
  async function contexte(P){
    const emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    const sites = P.set === null ? null : new Set(emps.filter(e=>P.set.has(String(e.mat))).map(e=>e.siteId).filter(Boolean));
    const nom = m => { const e = parMat.get(String(m)) || {}; return ((e.nom||"")+" "+(e.prenom||"")).trim(); };
    return {parMat, sites, nom};
  }
  /* 56.33.11 : un événement qui nomme un salarié suit uniquement le périmètre de ce salarié (le site ou le déclarant
     ne suffisent plus : ils exposaient la victime hors périmètre) ; sans salarié, site du périmètre ou déclarant */
  const visible = (P, cx, e, login) => P.set === null || (e.mat ? dans(P, e.mat) : ((e.site_id && cx.sites.has(e.site_id)) || e.declare_par === login));
  /* même règle en SQL (préfixe de table « pre », vide ou « e. ») */
  const visibleSql = (P, cx, login, pre) => { if (P.set === null) return {sql:"", a:[]};
    const pm = perimSql(B, P, pre+"mat"), ps = perimSql(B, {set:cx.sites}, pre+"site_id");
    return {sql:" AND (("+pre+"mat IS NOT NULL"+pm.sql+") OR ("+pre+"mat IS NULL AND (("+pre+"site_id IS NOT NULL"+ps.sql+") OR "+pre+"declare_par=?)))", a:[...pm.a, ...ps.a, login]}; };
  /* risque visible : sans site (commun à toute l'entreprise) ou site du périmètre */
  const risqueSql = (P, cx, pre) => { if (P.set === null) return {sql:"", a:[]}; const ps = perimSql(B, {set:cx.sites}, pre+"site_id"); return {sql:" AND ("+pre+"site_id IS NULL OR ("+pre+"site_id IS NOT NULL"+ps.sql+"))", a:ps.a}; };
  /* action visible : celle d'un événement visible ou d'un risque visible */
  const actionSql = (P, cx, login) => { if (P.set === null) return {sql:"", a:[]}; const ve = visibleSql(P, cx, login, "e."), vr = risqueSql(P, cx, "rs.");
    return {sql:" AND ((a.evenement_id IS NOT NULL AND e.id IS NOT NULL"+ve.sql+") OR (a.evenement_id IS NULL AND a.risque_id IS NOT NULL AND r.id IS NOT NULL"+vr.sql+"))", a:[...ve.a, ...vr.a]}; };
  const JOINT_A = " FROM hse_actions a LEFT JOIN hse_evenements e ON e.id=a.evenement_id LEFT JOIN hse_risques r ON r.id=a.risque_id LEFT JOIN hse_risques_sites rs ON rs.risque_id=a.risque_id";
  /* dotation en cours : aucune remise plus récente du même équipement au même salarié (une nouvelle remise solde l'ancienne) */
  const EPI_COURANT = " AND NOT EXISTS (SELECT 1 FROM hse_epi z WHERE z.mat=hse_epi.mat AND z.type=hse_epi.type AND (z.remis_le > hse_epi.remis_le OR (z.remis_le = hse_epi.remis_le AND z.id > hse_epi.id)))";
  /* indicateurs : taux de fréquence (accidents du travail avec arrêt × 1 000 000 / heures travaillées) et taux de
     gravité (jours d'arrêt × 1 000 / heures travaillées) ; heures lues dans les journées calculées par FW-Time.
     Correctif 40 : journées calculées avant lecture, cache invalidé à chaque changement des journées (génération),
     indisponibilité et heures trop faibles signalées */
  const HEURES = new Map();
  async function heuresPeriode(P, du, au){
    if (!actif("FW-Time")) return {h:0, indisponible:true};
    const gen = o.generation ? o.generation() : "";
    const cle = gen+"|"+du+"|"+au+"|"+(P.set === null ? "*" : crypto.createHash("sha1").update(Array.from(P.set).sort().join(",")).digest("hex")), h = HEURES.get(cle);
    if (h && Date.now() - h.t < 15 * 60000) return h.v;
    const hier = ajoutJours(auj(), -1), auT = au < hier ? au : hier;
    const mats = P.set === null ? (await D.employes()).map(e=>String(e.mat)) : Array.from(P.set);
    if (o.assurer && mats.length && du <= auT) await o.assurer(mats, du, auT);
    let heures = 0;
    if (P.set === null) heures = Number((await B.get("SELECT SUM(hp) h FROM calc_jour WHERE d>=? AND d<=?", du, au)).h) || 0;
    else { for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500);
      heures += Number((await B.get("SELECT SUM(hp) h FROM calc_jour WHERE d>=? AND d<=? AND mat IN ("+l.map(()=>"?").join(",")+")", du, au, ...l)).h) || 0; } }
    const v = {h:heures};
    if (HEURES.size > 200) HEURES.clear(); HEURES.set(cle, {t:Date.now(), v}); return v;
  }
  const SEUIL_HEURES = 1000;
  async function indicateurs(P, du, au, login){
    const cx = await contexte(P), vs = visibleSql(P, cx, login, "");
    const ev = await B.all("SELECT type, d, mat, site_id, arret, jours_arret, declare_par FROM hse_evenements WHERE d>=? AND d<=?"+vs.sql, du, au, ...vs.a);
    let hv; try { hv = await heuresPeriode(P, du, au); } catch(e){ (o.journal||console.log)("hse : heures travaillées : "+e.message); hv = {h:0, indisponible:true}; }
    const heures = hv.h, sig = !hv.indisponible && heures >= SEUIL_HEURES;
    const acc = ev.filter(e=>e.type === "accident"), avecArret = acc.filter(e=>Number(e.arret)), jours = avecArret.reduce((s, e)=>s + (Number(e.jours_arret)||0), 0);
    /* correctif 40 : tous les mois de la période (les mois sans événement manquaient : axe et comparaison faussés) */
    const parMois = {}; for (let m = du.slice(0, 7); m <= au.slice(0, 7); ){ parMois[m] = {accident:0, accident_trajet:0, incident:0, presque_accident:0}; const y = +m.slice(0, 4), mo = +m.slice(5, 7); m = mo === 12 ? (y+1)+"-01" : y+"-"+String(mo+1).padStart(2, "0"); }
    ev.forEach(e=>{ const x = parMois[e.d.slice(0, 7)]; if (x && x[e.type] != null) x[e.type]++; });
    const va = actionSql(P, cx, login);
    const actions = await B.all("SELECT a.echeance"+JOINT_A+" WHERE a.statut NOT IN ('faite','annulee')"+va.sql, ...va.a);
    return {du, au, heures:Math.round(heures), heuresIndisponibles:!!hv.indisponible, nonSignificatif:!hv.indisponible && heures < SEUIL_HEURES, seuilHeures:SEUIL_HEURES,
      accidents:acc.length, avecArret:avecArret.length, joursArret:jours, trajets:ev.filter(e=>e.type === "accident_trajet").length, incidents:ev.filter(e=>e.type === "incident").length,
      presqueAccidents:ev.filter(e=>e.type === "presque_accident").length, tf:sig ? Math.round(avecArret.length * 1e6 / heures * 100) / 100 : null,
      tg:sig ? Math.round(jours * 1e3 / heures * 100) / 100 : null, actionsOuvertes:actions.length, actionsRetard:actions.filter(a=>a.echeance < auj()).length,
      parMois:Object.keys(parMois).sort().map(m=>Object.assign({mois:m}, parMois[m]))};
  }
  /* correctif 40 : « À traiter » limité au périmètre et à la matrice de l'écran ; déclarations CNAM (48 h) */
  async function aTraiter(x){
    const dr = droitsEcran(x.admin, x.P), out = [], a = auj(); if (!dr.voir) return out;
    const cx = await contexte(x.P), login = x.C ? x.C.login : "", vs = visibleSql(x.P, cx, login, "");
    if (dr.valider){
      const ev = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE statut='ouvert'"+vs.sql, ...vs.a)).n);
      if (ev) out.push({domaine:"sante", cle:"hse-evenements", nombre:ev, urgence:2, vue:"hse"});
      const va = actionSql(x.P, cx, login);
      const ac = Number((await B.get("SELECT COUNT(*) n"+JOINT_A+" WHERE a.statut NOT IN ('faite','annulee') AND a.echeance < ?"+va.sql, a, ...va.a)).n);
      if (ac) out.push({domaine:"sante", cle:"hse-actions-retard", nombre:ac, urgence:2, vue:"hse"});
    }
    if (dr.modifier){
      const cn = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE type IN ('accident','accident_trajet') AND mat IS NOT NULL AND d>=? AND NOT EXISTS (SELECT 1 FROM hse_declarations c WHERE c.evenement_id=hse_evenements.id)"+vs.sql, ajoutJours(a, -365), ...vs.a)).n);
      if (cn) out.push({domaine:"sante", cle:"hse-cnam", nombre:cn, urgence:3, vue:"hse"});
      const pm = perimSql(B, x.P, "mat"), act = await sortisSql(a);
      const e = Number((await B.get("SELECT COUNT(*) n FROM hse_epi WHERE renouveler_le IS NOT NULL AND renouveler_le <= ?"+EPI_COURANT+act.sql+pm.sql, ajoutJours(a, 30), ...act.a, ...pm.a)).n);
      if (e) out.push({domaine:"sante", cle:"hse-epi", nombre:e, urgence:1, vue:"hse"});
    }
    return out;
  }
  /* salariés sortis exclus des alertes de renouvellement */
  async function sortisSql(a){ const s = (await D.employes()).filter(e=>e.sortie && e.sortie < a).map(e=>String(e.mat)); if (!s.length) return {sql:"", a:[]};
    return pg ? {sql:" AND NOT (mat = ANY(?))", a:[s]} : {sql:" AND mat NOT IN (SELECT value FROM json_each(?))", a:[JSON.stringify(s)]}; }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || !dans(x.P, x.mat)) return null;
    const m = String(x.mat), a = auj();
    const acc = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE mat=? AND type IN ('accident','accident_trajet') AND d>=?", m, ajoutJours(a, -365))).n);
    const epi = await B.all("SELECT type, renouveler_le FROM hse_epi WHERE mat=?"+EPI_COURANT+" ORDER BY remis_le DESC", m);
    if (!acc && !epi.length) return null;
    const ar = epi.filter(e=>e.renouveler_le && e.renouveler_le <= ajoutJours(a, 30)).length;
    return {cle:"hse", vue:"hse", lignes:[{k:"hseAccidents12", v:dr.sens ? String(acc) : "•••", alerte:dr.sens && acc > 0}, {k:"hseEpi", v:epi.length ? Array.from(new Set(epi.map(e=>e.type))).join(", ") : "—"}, {k:"hseEpiRenouv", v:String(ar), alerte:ar > 0}]};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ const l = (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    /* correctif 40 : err renvoie true — « if (e) return e » après tx() arrêtait le traitement seulement en apparence
       (json renvoie undefined : l'audit et une seconde réponse suivaient un refus) */
    const err = (st, k, v) => { json(res, st, {message:m(k, v), code:k}); return true; };
    const lib = (g, k) => ((LIB[g] || {})[k] || [k])[L] || k;
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k});
      const s = String(v).trim(); if (max && s.length > max) throw Object.assign(new Error("trop"), {champ:k, n:max}); return s; };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ});
      if (e && e.message === "trop") return err(400, "trop", {c:e.champ, n:e.n}); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P);
    if (dr.rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const refuse = () => err(403, "refuse");
    const droits = {creer:dr.creer, modifier:dr.modifier, valider:dr.valider, exporter:dr.exporter, sensibles:dr.sens};
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); return null; } catch(e){ if (e && e.st && MSG[e.message]) return err(e.st, e.message, e.v); if (/unique|duplicate|constraint/i.test((e && e.message) || "")) return err(409, "concurrence"); throw e; } };
    const journal = (objet, nature, motif) => B.run("INSERT INTO hse_journal(id,objet_id,nature,le,par,motif) VALUES(?,?,?,?,?,?)", id("hj"), objet, nature, maint(), C.login, motif || null);
    const sitesDe = async cx => { const ref = await (D.referentielLecture || D.referentiel)() || {}; return (ref.sites||[]).filter(s=>s && (cx.sites === null || cx.sites.has(s.id))).map(s=>({id:s.id, nom:s.nom || s.id})); };
    /* victime et faits masqués pour un profil sans accès aux données sensibles */
    const MQ = "•••";
    const presente = (e, cx, decl) => { const o2 = Object.assign({}, e, {victime:e.mat ? cx.nom(e.mat) : "", cnam:decl || null});
      if (!dr.sens){ if (o2.mat){ o2.victime = MQ; o2.mat = MQ; } o2.description = MQ; o2.cause = o2.cause ? MQ : ""; o2.jours_arret = null; o2.masque = true; }
      o2.gravite = e.gravite == null ? null : Number(e.gravite); o2.arret = Number(e.arret) ? 1 : 0; if (o2.jours_arret != null) o2.jours_arret = Number(e.jours_arret) || 0; return o2; };
    /* contrôle d'une déclaration (création ou modification) */
    const lireEvenement = async (b, cx, avant) => {
      const type = TYPES.indexOf(b.type) >= 0 ? b.type : null, desc = txt(b, "description", 4000), d = b.d;
      if (!type || !dateOk(d) || !desc) throw ko(400, "declaration");
      if (d > auj()) throw ko(400, "futur");
      const heure = txt(b, "heure", 5); if (heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) throw ko(400, "heure");
      const g = b.gravite == null || b.gravite === "" ? 1 : entier(b.gravite); if (!(g >= 1 && g <= 4)) throw ko(400, "gravite");
      const mat = txt(b, "mat", 40);
      if (mat){ const e = dans(P, mat) ? cx.parMat.get(mat) : null; if (!e) throw ko(404, "salarie");
        if (e.sortie && d > e.sortie) throw ko(400, "sortiLe", {d:jj(e.sortie)}); if (e.entree && d < e.entree) throw ko(400, "avantEntree", {d:jj(e.entree)}); }
      else if (ACC.indexOf(type) >= 0) throw ko(400, "victime");
      if (b.arret != null && typeof b.arret !== "boolean") throw ko(400, "texte", {c:"arret"});
      const arret = b.arret === true;
      if (arret && (ACC.indexOf(type) < 0 || !mat)) throw ko(400, "arretVictime");
      const j = !arret ? 0 : b.joursArret == null || b.joursArret === "" ? 0 : entier(b.joursArret); if (!(j >= 0 && j <= 3650)) throw ko(400, "jours");
      const siteId = txt(b, "siteId", 60) || (mat ? (cx.parMat.get(mat) || {}).siteId || null : null) || (avant ? avant.site_id : null);
      if (txt(b, "siteId", 60)){ const ref = await (D.referentielLecture || D.referentiel)() || {};
        if (!(ref.sites||[]).some(z=>z.id === siteId) || (cx.sites !== null && !cx.sites.has(siteId))) throw ko(400, "site"); }
      return {type, d, heure, siteId, lieu:txt(b, "lieu", 120), mat:mat || null, g, arret, j, desc};
    };
    if (p === "/api/v1/hse/indicateurs" && req.method === "GET"){
      const au = q.au == null || q.au === "" ? auj() : q.au, du = q.du == null || q.du === "" ? (dateOk(au) ? ajoutJours(au, -364) : "") : q.du;
      if (!dateOk(au) || !dateOk(du) || du > au || ajoutJours(du, 731) < au) return err(400, "periode");
      return json(res, 200, Object.assign(await indicateurs(P, du, au, C.login), {droits}));
    }
    if (p === "/api/v1/hse/evenements" && req.method === "GET"){
      const cx = await contexte(P), st = q.statut === "tous" ? null : (q.statut === "clos" ? "clos" : "ouvert_analyse");
      /* v56.23 : filtres, visibilité (salarié du périmètre, site du périmètre ou déclarant) et pagination en SQL */
      let w = " WHERE 1=1", a = [];
      if (st) w += st === "clos" ? " AND ev.statut='clos'" : " AND ev.statut <> 'clos'";
      if (TYPES.indexOf(q.type) >= 0){ w += " AND ev.type=?"; a.push(q.type); }
      const vs = visibleSql(P, cx, C.login, "ev."); w += vs.sql; a.push(...vs.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements ev"+w, ...a)).n);
      const l = await B.all("SELECT ev.id, ev.type, ev.d, ev.heure, ev.site_id, ev.lieu, ev.mat, ev.gravite, ev.arret, ev.jours_arret, ev.description, ev.cause, ev.statut, ev.declare_par, c.declaree_le cnam_le FROM hse_evenements ev LEFT JOIN hse_declarations c ON c.evenement_id=ev.id"+w+" ORDER BY ev.d DESC, ev.heure DESC, ev.id LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, offset:off, limit:lim, droits, sites:await sitesDe(cx), lignes:l.map(e=>presente(e, cx, e.cnam_le ? {declaree_le:e.cnam_le} : null))});
    }
    if (p === "/api/v1/hse/evenements" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), cx = await contexte(P), i = id("he");
      const r = await tx(async ()=>{ const v = await lireEvenement(b, cx);
        await B.run("INSERT INTO hse_evenements(id,type,d,heure,site_id,lieu,mat,gravite,arret,jours_arret,description,cause,statut,declare_par,cree) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          i, v.type, v.d, v.heure, v.siteId, v.lieu, v.mat, v.g, v.arret ? 1 : 0, v.j, v.desc, "", "ouvert", C.login, maint()); });
      if (r) return r;
      /* journal minimal : ni matricule ni description */
      await audit(C.login, "hse.evenement.declare", i, ip); return json(res, 200, {ok:true, id:i});
    }
    const me = /^\/api\/v1\/hse\/evenements\/([^/]+)(?:\/(analyse|cloturer|rouvrir|cnam))?$/.exec(p);
    if (me){
      const cx = await contexte(P), e = await B.get("SELECT * FROM hse_evenements WHERE id=?", me[1]);
      if (!e || !visible(P, cx, e, C.login)) return err(404, "evenement");
      if (!me[2] && req.method === "GET"){
        const decl = await B.get("SELECT declaree_le, reference FROM hse_declarations WHERE evenement_id=?", e.id);
        const jr = await B.all("SELECT nature, le, par, motif FROM hse_journal WHERE objet_id=? ORDER BY le DESC", e.id);
        return json(res, 200, {evenement:presente(e, cx, decl), droits, sites:await sitesDe(cx), journal:jr.map(j=>Object.assign(j, {motif:dr.sens ? j.motif : (j.motif ? MQ : "")})),
          actions:(await B.all("SELECT * FROM hse_actions WHERE evenement_id=? ORDER BY (statut IN ('faite','annulee')), echeance, id", e.id))});
      }
      if (req.method !== "POST") return err(404, "introuvable");
      const b = await corpsJson(req);
      /* modification d'une déclaration tant qu'elle n'est pas close */
      if (!me[2]){
        if (!dr.modifier) return refuse();
        const r = await tx(async ()=>{ await verrou("hse:"+e.id); const v = await lireEvenement(b, cx, e);
          const n = await B.run("UPDATE hse_evenements SET type=?, d=?, heure=?, site_id=?, lieu=?, mat=?, gravite=?, arret=?, jours_arret=? , description=? WHERE id=? AND statut<>'clos'",
            v.type, v.d, v.heure, v.siteId, v.lieu, v.mat, v.g, v.arret ? 1 : 0, v.j, v.desc, e.id);
          if (!n_(n)) throw ko(409, "clos"); });
        if (r) return r; await audit(C.login, "hse.evenement.modifie", e.id, ip); return json(res, 200, {ok:true});
      }
      if (me[2] === "cnam"){
        if (!dr.modifier) return refuse();
        if (ACC.indexOf(e.type) < 0) return err(400, "pasAccident");
        const le = b.declareeLe, ref = txt(b, "reference", 60); if (!dateOk(le) || le < e.d || le > auj()) return err(400, "cnam");
        await B.run("INSERT INTO hse_declarations(evenement_id,declaree_le,reference,par,maj) VALUES(?,?,?,?,?) ON CONFLICT(evenement_id) DO UPDATE SET declaree_le=excluded.declaree_le, reference=excluded.reference, par=excluded.par, maj=excluded.maj", e.id, le, ref, C.login, maint());
        await audit(C.login, "hse.evenement.cnam", e.id, ip); return json(res, 200, {ok:true});
      }
      if (!dr.valider) return refuse();
      if (me[2] === "rouvrir"){
        const motif = txt(b, "motif", 500); if (!motif) return err(400, "motif");
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const n = await B.run("UPDATE hse_evenements SET statut='en_analyse', clos_le=NULL WHERE id=? AND statut='clos'", e.id); if (!n_(n)) throw ko(409, "pasClos");
          await journal(e.id, "reouverture", motif); });
        if (r) return r; await audit(C.login, "hse.evenement.rouvert", e.id, ip); return json(res, 200, {ok:true});
      }
      if (me[2] === "analyse"){
        const cause = b.cause == null ? String(e.cause||"").trim() : txt(b, "cause", 2000); if (!cause) return err(400, "cause");
        let j = Number(e.jours_arret) || 0;
        if (b.joursArret != null && b.joursArret !== ""){ j = entier(b.joursArret); if (!(j >= 0 && j <= 3650)) return err(400, "jours"); }
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const n = await B.run("UPDATE hse_evenements SET cause=?, statut='en_analyse', jours_arret=CASE WHEN arret=1 THEN ? ELSE 0 END WHERE id=? AND statut<>'clos'", cause, j, e.id);
          if (!n_(n)) throw ko(409, "clos"); });
        if (r) return r; await audit(C.login, "hse.evenement.analyse", e.id, ip); return json(res, 200, {ok:true});
      }
      if (me[2] === "cloturer"){
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const e2 = await B.get("SELECT statut, cause FROM hse_evenements WHERE id=?", e.id); if (!e2 || e2.statut === "clos") throw ko(409, "clos");
          if (!String(e2.cause||"").trim()) throw ko(409, "causeAvant");
          const ouvertes = Number((await B.get("SELECT COUNT(*) n FROM hse_actions WHERE evenement_id=? AND statut NOT IN ('faite','annulee')", e.id)).n);
          if (ouvertes) throw ko(409, "actionsOuvertes", {n:ouvertes});
          const n = await B.run("UPDATE hse_evenements SET statut='clos', clos_le=? WHERE id=? AND statut<>'clos' AND NOT EXISTS (SELECT 1 FROM hse_actions WHERE evenement_id=? AND statut NOT IN ('faite','annulee'))", maint(), e.id, e.id);
          if (!n_(n)) throw ko(409, "concurrence"); });
        if (r) return r; await audit(C.login, "hse.evenement.clos", e.id, ip); return json(res, 200, {ok:true});
      }
    }
    if (p === "/api/v1/hse/actions" && req.method === "GET"){
      const st = q.statut === "faite" ? "a.statut='faite'" : q.statut === "annulee" ? "a.statut='annulee'" : "a.statut NOT IN ('faite','annulee')";
      /* correctif 40 : actions visibles = celles d'un événement visible ou d'un risque visible (plus d'action « commune ») */
      const va = actionSql(P, await contexte(P), C.login), w = " WHERE "+st+va.sql;
      const total = Number((await B.get("SELECT COUNT(*) n"+JOINT_A+w, ...va.a)).n);
      const l = await B.all("SELECT a.id, a.evenement_id, a.risque_id, a.titre, a.responsable, a.echeance, a.statut, a.faite_le, e.type evtype, e.d evd, r.danger"+JOINT_A+w+" ORDER BY a.echeance"+(q.statut === "faite" ? " DESC" : "")+", a.id LIMIT "+lim+" OFFSET "+off, ...va.a);
      return json(res, 200, {total, offset:off, limit:lim, droits, lignes:l});
    }
    if (p === "/api/v1/hse/actions" && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), titre = txt(b, "titre", 200), resp = txt(b, "responsable", 80), ech = b.echeance, evId = txt(b, "evenementId", 40), rqId = txt(b, "risqueId", 40);
      if (!titre || !dateOk(ech) || ech < auj()) return err(400, "action");
      if (!evId && !rqId) return err(400, "origine");
      const cx = await contexte(P), i = id("ha");
      const r = await tx(async ()=>{
        if (evId){ await verrou("hse:"+evId); const e = await B.get("SELECT * FROM hse_evenements WHERE id=? AND statut <> 'clos'", evId);
          if (!e || !visible(P, cx, e, C.login)) throw ko(400, "evtClos"); if (ech < e.d) throw ko(400, "echeanceEvt"); }
        if (rqId){ const rq = await B.get("SELECT r.id, rs.site_id FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE r.id=?", rqId);
          if (!rq || (cx.sites !== null && rq.site_id && !cx.sites.has(rq.site_id))) throw ko(400, "risque"); }
        await B.run("INSERT INTO hse_actions(id,evenement_id,risque_id,titre,responsable,echeance,statut,cree,par) VALUES(?,?,?,?,?,?,?,?,?)", i, evId || null, rqId || null, titre, resp, ech, "a_faire", maint(), C.login); });
      if (r) return r; await audit(C.login, "hse.action", i, ip); return json(res, 200, {ok:true, id:i});
    }
    const ma = /^\/api\/v1\/hse\/actions\/([^/]+)(?:\/(faite|annuler))?$/.exec(p);
    if (ma && req.method === "POST"){
      const op = ma[2] || "modifier";
      if (op === "faite" ? !dr.modifier : !dr.valider) return refuse();
      const cx = await contexte(P), va = actionSql(P, cx, C.login);
      const a = await B.get("SELECT a.*"+JOINT_A+" WHERE a.id=?"+va.sql, ma[1], ...va.a); if (!a) return err(404, "actionIntrouvable");
      const b = await corpsJson(req);
      const r = await tx(async ()=>{ await verrou(a.evenement_id ? "hse:"+a.evenement_id : "hsea:"+a.id);
        if (a.evenement_id){ const e = await B.get("SELECT statut, d FROM hse_evenements WHERE id=?", a.evenement_id); if (e && e.statut === "clos") throw ko(409, "clos"); }
        if (op === "faite"){ const n = await B.run("UPDATE hse_actions SET statut='faite', faite_le=? WHERE id=? AND statut NOT IN ('faite','annulee')", maint(), a.id); if (!n_(n)) throw ko(409, "actionFaite"); return; }
        if (op === "annuler"){ const motif = txt(b, "motif", 500); if (!motif) throw ko(400, "motif");
          const n = await B.run("UPDATE hse_actions SET statut='annulee' WHERE id=? AND statut NOT IN ('faite','annulee')", a.id); if (!n_(n)) throw ko(409, "actionFaite"); await journal(a.id, "annulation", motif); return; }
        const titre = b.titre == null ? a.titre : txt(b, "titre", 200), resp = b.responsable == null ? (a.responsable || "") : txt(b, "responsable", 80), ech = b.echeance == null ? a.echeance : b.echeance;
        if (!titre || !dateOk(ech)) throw ko(400, "action");
        const n = await B.run("UPDATE hse_actions SET titre=?, responsable=?, echeance=? WHERE id=? AND statut NOT IN ('faite','annulee')", titre, resp, ech, a.id); if (!n_(n)) throw ko(409, "actionFaite"); });
      if (r) return r; await audit(C.login, {faite:"hse.action.faite", annuler:"hse.action.annulee", modifier:"hse.action.modifiee"}[op], a.id, ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/hse/risques" && req.method === "GET"){
      const cx = await contexte(P), vr = risqueSql(P, cx, "rs.");
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE 1=1"+vr.sql, ...vr.a)).n);
      const l = await B.all("SELECT r.*, rs.site_id, rs.revise_le, r.gravite * r.probabilite criticite FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE 1=1"+vr.sql+" ORDER BY r.gravite * r.probabilite DESC, r.unite, r.id LIMIT "+lim+" OFFSET "+off, ...vr.a);
      return json(res, 200, {total, offset:off, limit:lim, droits, sites:await sitesDe(cx), lignes:l.map(z=>Object.assign(z, {gravite:Number(z.gravite), probabilite:Number(z.probabilite), criticite:Number(z.criticite)}))});
    }
    const mr = /^\/api\/v1\/hse\/risques(?:\/([^/]+))?$/.exec(p);
    if (mr && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), unite = txt(b, "unite", 120), danger = txt(b, "danger", 200), mesures = txt(b, "mesures", 2000), siteId = txt(b, "siteId", 60) || null;
      if (!unite || !danger) return err(400, "risqueChamps");
      const g = entier(b.gravite), pr = entier(b.probabilite); if (!(g >= 1 && g <= 4)) return err(400, "gravite"); if (!(pr >= 1 && pr <= 4)) return err(400, "probabilite");
      const cx = await contexte(P);
      if (siteId){ const ref = await (D.referentielLecture || D.referentiel)() || {}; if (!(ref.sites||[]).some(z=>z.id === siteId) || (cx.sites !== null && !cx.sites.has(siteId))) return err(400, "site"); }
      else if (cx.sites !== null) return err(400, "site");
      const i = mr[1] || id("hr");
      const r = await tx(async ()=>{
        if (mr[1]){ await verrou("hsr:"+i); const vr = risqueSql(P, cx, "rs."); const ex = await B.get("SELECT r.id FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE r.id=?"+vr.sql, i, ...vr.a); if (!ex) throw ko(404, "risque");
          await B.run("UPDATE hse_risques SET unite=?, danger=?, gravite=?, probabilite=?, mesures=?, maj=?, par=? WHERE id=?", unite, danger, g, pr, mesures, maint(), C.login, i); }
        else await B.run("INSERT INTO hse_risques(id,unite,danger,gravite,probabilite,mesures,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, unite, danger, g, pr, mesures, maint(), C.login);
        await B.run("INSERT INTO hse_risques_sites(risque_id,site_id,revise_le) VALUES(?,?,?) ON CONFLICT(risque_id) DO UPDATE SET site_id=excluded.site_id, revise_le=excluded.revise_le", i, siteId, auj()); });
      if (r) return r; await audit(C.login, mr[1] ? "hse.risque.revise" : "hse.risque", i, ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/hse/epi" && req.method === "GET"){
      const cx = await contexte(P), a = auj();
      /* correctif 40 : dotations en cours seulement (historique sur demande), salariés sortis exclus du filtre « à renouveler » */
      const pm = perimSql(B, P, "mat"), ren = q.filtre === "renouveler", so = ren ? await sortisSql(a) : {sql:"", a:[]};
      const w = " WHERE 1=1"+(q.filtre === "historique" ? "" : EPI_COURANT)+(ren ? " AND renouveler_le IS NOT NULL AND renouveler_le <= ?" : "")+so.sql+pm.sql, aa = (ren ? [ajoutJours(a, 30)] : []).concat(so.a, pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_epi"+w, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, remis_le, renouveler_le FROM hse_epi"+w+" ORDER BY renouveler_le IS NULL, renouveler_le, mat, id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, offset:off, limit:lim, droits, lignes:l.map(r=>{ const e = cx.parMat.get(String(r.mat)) || {}; return Object.assign(r, {nom:cx.nom(r.mat), sorti:!!(e.sortie && e.sortie < a), aRenouveler:!!(r.renouveler_le && r.renouveler_le <= ajoutJours(a, 30))}); })});
    }
    if (p === "/api/v1/hse/epi" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), type = txt(b, "type", 80), rl = b.remisLe;
      if (!mat || !type || !dateOk(rl) || rl > auj()) return err(400, "epi");
      let rn = null; if (b.renouvelerLe != null && b.renouvelerLe !== ""){ if (!dateOk(b.renouvelerLe) || b.renouvelerLe <= rl) return err(400, "renouv"); rn = b.renouvelerLe; }
      const e = dans(P, mat) ? (await contexte(P)).parMat.get(mat) : null; if (!e) return err(404, "salarie");
      if (e.sortie && e.sortie < auj()) return err(409, "sorti");
      const i = id("hp"); await B.run("INSERT INTO hse_epi(id,mat,type,remis_le,renouveler_le,par) VALUES(?,?,?,?,?,?)", i, mat, type, rl, rn, C.login);
      await audit(C.login, "hse.epi", i, ip); return json(res, 200, {ok:true, id:i});
    }
    /* correctif 40 : registre des accidents et événements (CSV, tracé), dates jj/mm/aaaa, libellés traduits */
    if (p === "/api/v1/hse/export" && req.method === "GET"){
      if (!dr.exporter) return refuse();
      const au = q.au || auj(), du = q.du || (dateOk(au) ? ajoutJours(au, -364) : ""); if (!dateOk(au) || !dateOk(du) || du > au) return err(400, "periode");
      const cx = await contexte(P), vs = visibleSql(P, cx, C.login, "ev."), ref = await (D.referentielLecture || D.referentiel)() || {}, nomSite = new Map((ref.sites||[]).map(s=>[s.id, s.nom || s.id]));
      const l = await B.all("SELECT ev.*, c.declaree_le cnam_le, c.reference cnam_ref FROM hse_evenements ev LEFT JOIN hse_declarations c ON c.evenement_id=ev.id WHERE ev.d>=? AND ev.d<=?"+vs.sql+" ORDER BY ev.d, ev.heure, ev.id", du, au, ...vs.a);
      await audit(C.login, "hse.export", l.length+" événement(s)", ip);
      const cel = c => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; };
      const csv = [LIB.entete[L].map(cel).join(";")].concat(l.map(e=>[jj(e.d), e.heure || "", lib("type", e.type), nomSite.get(e.site_id) || "", e.lieu || "", dr.sens ? e.mat || "" : (e.mat ? MQ : ""), dr.sens ? (e.mat ? cx.nom(e.mat) : "") : (e.mat ? MQ : ""),
        e.gravite == null ? "" : Number(e.gravite), Number(e.arret) ? LIB.oui[L] : LIB.non[L], dr.sens ? Number(e.jours_arret) || 0 : "", lib("statut", e.statut), jj(e.cnam_le), e.cnam_ref || ""].map(cel).join(";"))).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-registre-hse.csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); return res.end("﻿"+csv);
    }
    return err(404, "introuvable");
    }
  }
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
