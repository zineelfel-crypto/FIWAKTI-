/* FW-HSE — partie serveur. Événements (accidents du travail, accidents de trajet, incidents, presque-accidents) avec
   analyse et clôture, actions correctives à échéance, évaluation des risques (gravité × probabilité), dotations
   d'équipements de protection, registre des accidents, indicateurs (taux de fréquence et de gravité calculés sur les
   heures réellement travaillées, lues dans FW-Time). Aucune donnée médicale : seulement le nombre de jours d'arrêt.
   Correctif 40 : matrice de l'écran « hse » appliquée partout (routes, « À traiter », fiche 360), « À traiter » limité au
   périmètre, victime et faits masqués sans accès aux données sensibles, contrôles stricts (types, dates réelles, entiers,
   heure), verrous et mises à jour conditionnelles (PostgreSQL), heures recalculées quand les journées changent,
   déclaration CNAM (48 h), réouverture motivée, modification d'une déclaration, actions modifiables et annulables,
   risques rattachés à un site et révisés, dotation remplacée soldée, messages trilingues, jour local.
   Correctif 41 : profil sans données sensibles en lecture seule sur les faits, déclaration CNAM verrouillée (type, date,
   salarié), données validées protégées d'un profil « saisie », versions contre les écrasements, historique complet,
   annulation d'un événement ou d'une dotation, fiche imprimable, recherche du salarié par nom, filtres de liste,
   doublons refusés, CNAM en retard distinguée, registre borné et complet, langue de l'écran, Pilotage aligné. */
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
  "CREATE TABLE IF NOT EXISTS hse_journal (id TEXT PRIMARY KEY, objet_id TEXT NOT NULL, nature TEXT NOT NULL, le TEXT NOT NULL, par TEXT, motif TEXT)",
  /* correctif 41 : dotations annulées (saisie erronée) */
  "CREATE TABLE IF NOT EXISTS hse_epi_annul (epi_id TEXT PRIMARY KEY, le TEXT NOT NULL, par TEXT, motif TEXT)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS hse_evenements_statut ON hse_evenements(statut, d)","CREATE INDEX IF NOT EXISTS hse_actions_evt ON hse_actions(evenement_id, echeance)",
  "CREATE INDEX IF NOT EXISTS hse_actions_risque ON hse_actions(risque_id)", "CREATE INDEX IF NOT EXISTS hse_epi_mat_type ON hse_epi(mat, type, remis_le)", "CREATE INDEX IF NOT EXISTS hse_journal_objet ON hse_journal(objet_id, le)");
ddl.sqlite = ddl.pg;
const tables = {hse_evenements:"id", hse_actions:"id", hse_risques:"id", hse_epi:"id", hse_declarations:"evenement_id", hse_risques_sites:"risque_id", hse_journal:"id", hse_epi_annul:"epi_id"};
/* l'accident de trajet est un accident du travail au sens de la CNAM, mais il est exclu du taux de fréquence */
const TYPES = ["accident", "accident_trajet", "incident", "presque_accident"], ACC = ["accident", "accident_trajet"];
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const LIB = {
  type:{accident:["Accident du travail","Work accident","حادث شغل"], accident_trajet:["Accident de trajet","Commuting accident","حادث طريق"], incident:["Incident","Incident","حادث عرضي"], presque_accident:["Presque-accident","Near miss","حادث وشيك"]},
  statut:{ouvert:["Ouvert","Open","مفتوح"], en_analyse:["En analyse","Under analysis","قيد التحليل"], clos:["Clos","Closed","مغلق"], annule:["Annulé","Cancelled","ملغى"]},
  oui:["Oui","Yes","نعم"], non:["Non","No","لا"],
  entete:[["Date","Heure","Type","Site","Lieu","Matricule","Salarié","Gravité","Arrêt","Jours d'arrêt","Statut","Déclaration CNAM","Référence CNAM","Description","Cause","Déclaré par","Clos le"],
    ["Date","Time","Type","Site","Place","Employee ID","Employee","Severity","Lost time","Days lost","Status","CNAM declaration","CNAM reference","Description","Cause","Reported by","Closed on"],
    ["التاريخ","الساعة","النوع","الموقع","المكان","المعرف","الأجير","الخطورة","توقف","أيام التوقف","الحالة","التصريح للصندوق","المرجع","الوصف","السبب","صرّح به","أغلق في"]]
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
  introuvable:["Introuvable.", "Not found.", "غير موجود."],
  sensibles:["Votre profil n'a pas accès aux données sensibles : modification des faits refusée.", "Your profile has no access to sensitive data: changing the facts is refused.", "ملفك لا يخول الاطلاع على المعطيات الحساسة: تعديل الوقائع مرفوض."],
  cnamExiste:["Accident déjà déclaré à la CNAM le {d} : type, salarié et date (au plus tard celle de la déclaration) ne peuvent plus changer.", "Accident already declared to the CNAM on {d}: type, employee and date (no later than the declaration) can no longer change.", "حادث مصرح به في {d}: لا يمكن تغيير النوع والأجير والتاريخ."],
  joursArretRequis:["Arrêt de travail sans jour d'arrêt : indiquez le nombre de jours (analyse) avant de clore.", "Lost time without days: enter the number of days (analysis) before closing.", "توقف بلا أيام: أدخل عدد الأيام قبل الإغلاق."],
  annule:["Événement annulé.", "Event cancelled.", "الحدث ملغى."],
  echeancePassee:["Nouvelle échéance réelle, à partir d'aujourd'hui et postérieure à l'événement.", "New due date must be real, from today and after the event.", "أجل جديد ابتداء من اليوم ولاحق للحدث."],
  siteCommun:["Risque commun à toute l'entreprise : un compte limité à un site ne peut pas le rattacher à un site.", "Company-wide risk: an account limited to a site cannot attach it to a site.", "خطر مشترك: لا يمكن لحساب محدود ربطه بموقع."],
  doublonRisque:["Ce risque existe déjà pour ce site.", "This risk already exists for this site.", "هذا الخطر موجود لهذا الموقع."],
  doublonEpi:["Cette dotation est déjà enregistrée (même salarié, équipement et date).", "This issue is already recorded (same employee, equipment and date).", "هذا التسليم مسجل مسبقا."],
  epiAvantEntree:["Date de remise antérieure à l'entrée du salarié ({d}).", "Issue date before the employee's start date ({d}).", "تاريخ التسليم سابق لانتداب الأجير ({d})."],
  epiIntrouvable:["Dotation introuvable ou déjà annulée.", "Issue not found or already cancelled.", "تسليم غير موجود أو ملغى."]
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
  /* correctif 41 : version d'un élément (empreinte de ses champs) — une modification faite depuis un état périmé est refusée */
  const ver = (r, champs) => crypto.createHash("sha1").update(JSON.stringify(champs.map(k=>r[k] == null ? null : String(r[k])))).digest("hex").slice(0, 16);
  const CH_EV = ["type","d","heure","site_id","lieu","mat","gravite","arret","jours_arret","description","cause","statut"], CH_AC = ["titre","responsable","echeance","statut"], CH_RQ = ["unite","danger","gravite","probabilite","mesures","maj"];
  /* correctif 41 : toute écriture prévient les autres modules (le Pilotage vide son cache) */
  const publie = () => { try { if (o.publier) o.publier("hse.maj", {}); } catch(e){} };
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* correctif 40 : matrice de l'écran « hse » (menu masqué ou en lecture ; actions lire / créer / modifier / valider /
     exporter) ; correctif 41 : supprimer (annulation d'un événement ou d'une dotation) et imprimer */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).hse, act = (pr.actions || {}).hse || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, sens:!PERIM.masquePerso(P), creer:voir && !ro && rang >= 2 && act.creer !== false, modifier:voir && !ro && rang >= 2 && act.modifier !== false,
      valider:voir && !ro && rang >= 3 && act.valider !== false, supprimer:voir && !ro && rang >= 3 && act.supprimer !== false, exporter:voir && rang >= 2 && act.exporter !== false,
      imprimer:voir && act.imprimer !== false};
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
  /* dotation en cours : non annulée, et aucune remise plus récente (non annulée) du même équipement au même salarié */
  const EPI_VALIDE = " AND NOT EXISTS (SELECT 1 FROM hse_epi_annul x WHERE x.epi_id=hse_epi.id)";
  const EPI_COURANT = EPI_VALIDE+" AND NOT EXISTS (SELECT 1 FROM hse_epi z WHERE z.mat=hse_epi.mat AND z.type=hse_epi.type AND (z.remis_le > hse_epi.remis_le OR (z.remis_le = hse_epi.remis_le AND z.id > hse_epi.id)) AND NOT EXISTS (SELECT 1 FROM hse_epi_annul y WHERE y.epi_id=z.id))";
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
    const ev = await B.all("SELECT type, d, mat, site_id, arret, jours_arret, declare_par FROM hse_evenements WHERE d>=? AND d<=? AND statut<>'annule'"+vs.sql, du, au, ...vs.a);
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
  /* délai légal de déclaration CNAM : 48 heures après l'accident (heure inconnue : début de journée) */
  const horsDelai = e => Date.now() - new Date(e.d+"T"+(e.heure || "00:00")+":00").getTime() > 48 * 3600e3;
  /* correctif 40 : « À traiter » limité au périmètre et à la matrice de l'écran ; correctif 41 : déclarations CNAM
     en retard (plus de 48 h) séparées de celles encore dans le délai, sans limite d'ancienneté, événements annulés exclus */
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
      const nd = " FROM hse_evenements WHERE type IN ('accident','accident_trajet') AND mat IS NOT NULL AND statut<>'annule' AND NOT EXISTS (SELECT 1 FROM hse_declarations c WHERE c.evenement_id=hse_evenements.id)"+vs.sql;
      const anciens = Number((await B.get("SELECT COUNT(*) n"+nd+" AND d<?", ...vs.a, ajoutJours(a, -2))).n);
      const recents = await B.all("SELECT d, heure"+nd+" AND d>=?", ...vs.a, ajoutJours(a, -2));
      const retard = anciens + recents.filter(horsDelai).length, delai = recents.length - recents.filter(horsDelai).length;
      if (retard) out.push({domaine:"sante", cle:"hse-cnam-retard", nombre:retard, urgence:3, vue:"hse"});
      if (delai) out.push({domaine:"sante", cle:"hse-cnam", nombre:delai, urgence:2, vue:"hse"});
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
    /* correctif 41 : accidents du travail seulement (les accidents de trajet sont exclus des taux), annulés exclus */
    const acc = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE mat=? AND type='accident' AND statut<>'annule' AND d>=?", m, ajoutJours(a, -365))).n);
    const epi = await B.all("SELECT type, renouveler_le FROM hse_epi WHERE mat=?"+EPI_COURANT+" ORDER BY remis_le DESC", m);
    if (!acc && !epi.length) return null;
    const ar = epi.filter(e=>e.renouveler_le && e.renouveler_le <= ajoutJours(a, 30)).length;
    return {cle:"hse", vue:"hse", lignes:[{k:"hseAccidents12", v:dr.sens ? String(acc) : "•••", alerte:dr.sens && acc > 0}, {k:"hseEpi", v:epi.length ? Array.from(new Set(epi.map(e=>e.type))).join(", ") : "—"}, {k:"hseEpiRenouv", v:String(ar), alerte:ar > 0}]};
  }
  /* correctif 41 : bloc « santé et sécurité » du Pilotage — mêmes règles que l'écran (annulés exclus, accidents du travail,
     taux non significatifs sous 1 000 heures) ; filtre selon la matrice de l'écran du demandeur */
  function pilotage(evs, heures){
    const ok = evs.filter(e=>e.statut !== "annule"), aa = ok.filter(e=>e.type === "accident" && Number(e.arret)), j = aa.reduce((s, e)=>s + (+e.jours_arret||0), 0), sig = heures >= SEUIL_HEURES;
    return {accidents:ok.filter(e=>e.type === "accident").length, avecArret:aa.length, joursArret:j, presqueAccidents:ok.filter(e=>e.type === "presque_accident").length,
      tf:sig ? Math.round(aa.length * 1e6 / heures * 100) / 100 : null, tg:sig ? Math.round(j * 1e3 / heures * 100) / 100 : null, nonSignificatif:!sig};
  }
  function filtrePilotage(admin, P, hse){ if (!hse) return hse; const dr = droitsEcran(admin, P); if (!dr.voir) return undefined;
    return dr.sens ? hse : Object.assign({}, hse, {joursArret:null, tg:null}); }
  const service = {droitsEcran, pilotage, filtrePilotage};
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    /* correctif 41 : langue de l'écran (en-tête X-Langue envoyé par l'application, ou ?lang= pour un lien d'export) */
    const L = (()=>{ const l = String((req.headers || {})["x-langue"] || u.searchParams.get("lang") || (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2)).slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
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
    const droits = {creer:dr.creer, modifier:dr.modifier, modifierFaits:dr.modifier && dr.sens, valider:dr.valider, supprimer:dr.supprimer, exporter:dr.exporter, imprimer:dr.imprimer, sensibles:dr.sens, cnam:dr.modifier};
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); publie(); return null; } catch(e){ if (e && e.st && MSG[e.message]) return err(e.st, e.message, e.v); if (/unique|duplicate|constraint/i.test((e && e.message) || "")) return err(409, "concurrence"); throw e; } };
    /* journal : motif libre et, pour une modification, valeurs précédentes (JSON) */
    const journal = (objet, nature, motif, avant) => B.run("INSERT INTO hse_journal(id,objet_id,nature,le,par,motif) VALUES(?,?,?,?,?,?)", id("hj"), objet, nature, maint(), C.login,
      avant ? JSON.stringify({motif:motif || "", avant}) : (motif || null));
    const lireJournal = j => { let motif = j.motif || "", avant = null; if (motif.charAt(0) === "{") try { const z = JSON.parse(motif); motif = z.motif || ""; avant = z.avant || null; } catch(e){}
      return {nature:j.nature, le:j.le, par:j.par, motif:dr.sens ? motif : (motif ? MQ : ""), avant:dr.sens ? avant : null}; };
    const ref0 = async () => await (D.referentielLecture || D.referentiel)() || {};
    const sitesDe = async (cx, plus) => { const ref = await ref0(); return (ref.sites||[]).filter(s=>s && (cx.sites === null || cx.sites.has(s.id) || s.id === plus)).map(s=>({id:s.id, nom:s.nom || s.id})); };
    /* victime et faits masqués pour un profil sans accès aux données sensibles */
    const MQ = "•••";
    const presente = (e, cx, decl, noms) => { const o2 = Object.assign({}, e, {victime:e.mat ? cx.nom(e.mat) : "", cnam:decl || null, version:ver(e, CH_EV), site_nom:noms ? noms.get(e.site_id) || "" : undefined});
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
      const demande = txt(b, "siteId", 60), siteId = demande || (mat ? (cx.parMat.get(mat) || {}).siteId || null : null) || (avant ? avant.site_id : null);
      /* correctif 41 : le site déjà enregistré est conservé même hors du périmètre (mission sur un autre site) ; seul un changement est contrôlé */
      if (demande && !(avant && demande === avant.site_id)){ const ref = await ref0();
        if (!(ref.sites||[]).some(z=>z.id === siteId) || (cx.sites !== null && !cx.sites.has(siteId))) throw ko(400, "site"); }
      return {type, d, heure, siteId, lieu:txt(b, "lieu", 120), mat:mat || null, g, arret, j, desc};
    };
    if (p === "/api/v1/hse/indicateurs" && req.method === "GET"){
      const au = q.au == null || q.au === "" ? auj() : q.au, du = q.du == null || q.du === "" ? (dateOk(au) ? ajoutJours(au, -364) : "") : q.du;
      if (!dateOk(au) || !dateOk(du) || du > au || ajoutJours(du, 731) < au) return err(400, "periode");
      return json(res, 200, Object.assign(await indicateurs(P, du, au, C.login), {droits}));
    }
    /* correctif 41 : recherche d'un salarié du périmètre par nom ou matricule (formulaires) */
    if (p === "/api/v1/hse/salaries" && req.method === "GET"){
      const s = String(q.q || "").trim().toLowerCase().slice(0, 60), a = auj(); if (s.length < 2) return json(res, 200, {lignes:[]});
      const l = (await D.employes()).filter(e=>dans(P, e.mat) && (!e.sortie || e.sortie >= ajoutJours(a, -365)) && (String(e.mat).toLowerCase().indexOf(s) === 0 || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0)).slice(0, 15);
      return json(res, 200, {lignes:l.map(e=>({mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), sorti:!!(e.sortie && e.sortie < a)}))});
    }
    if (p === "/api/v1/hse/evenements" && req.method === "GET"){
      const cx = await contexte(P), st = ["tous","clos","annule"].indexOf(q.statut) >= 0 ? q.statut : "";
      /* v56.23 : filtres, visibilité (salarié du périmètre, site du périmètre ou déclarant) et pagination en SQL ;
         correctif 41 : filtres salarié, période et site ; événements annulés à part */
      let w = " WHERE 1=1", a = [];
      if (st === "clos" || st === "annule"){ w += " AND ev.statut=?"; a.push(st); } else if (!st) w += " AND ev.statut NOT IN ('clos','annule')";
      if (TYPES.indexOf(q.type) >= 0){ w += " AND ev.type=?"; a.push(q.type); }
      if (q.mat){ w += " AND ev.mat=?"; a.push(String(q.mat).slice(0, 40)); }
      if (dateOk(q.du)){ w += " AND ev.d>=?"; a.push(q.du); } if (dateOk(q.au)){ w += " AND ev.d<=?"; a.push(q.au); }
      if (q.site){ w += " AND ev.site_id=?"; a.push(String(q.site).slice(0, 60)); }
      const vs = visibleSql(P, cx, C.login, "ev."); w += vs.sql; a.push(...vs.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements ev"+w, ...a)).n);
      const l = await B.all("SELECT ev.id, ev.type, ev.d, ev.heure, ev.site_id, ev.lieu, ev.mat, ev.gravite, ev.arret, ev.jours_arret, ev.description, ev.cause, ev.statut, ev.declare_par, c.declaree_le cnam_le FROM hse_evenements ev LEFT JOIN hse_declarations c ON c.evenement_id=ev.id"+w+" ORDER BY ev.d DESC, ev.heure DESC, ev.id LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, offset:off, limit:lim, droits, sites:await sitesDe(cx), lignes:l.map(e=>Object.assign(presente(e, cx, e.cnam_le ? {declaree_le:e.cnam_le} : null), {cnamRetard:ACC.indexOf(e.type) >= 0 && !!e.mat && !e.cnam_le && e.statut !== "annule" && horsDelai(e)}))});
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
    const me = /^\/api\/v1\/hse\/evenements\/([^/]+)(?:\/(analyse|cloturer|rouvrir|cnam|annuler|imprime))?$/.exec(p);
    if (me){
      const cx = await contexte(P), e = await B.get("SELECT * FROM hse_evenements WHERE id=?", me[1]);
      if (!e || !visible(P, cx, e, C.login)) return err(404, "evenement");
      if (!me[2] && req.method === "GET"){
        const decl = await B.get("SELECT declaree_le, reference FROM hse_declarations WHERE evenement_id=?", e.id), ref = await ref0(), noms = new Map((ref.sites||[]).map(s=>[s.id, s.nom || s.id]));
        const jr = await B.all("SELECT nature, le, par, motif FROM hse_journal WHERE objet_id=? ORDER BY le DESC", e.id);
        const acts = await B.all("SELECT * FROM hse_actions WHERE evenement_id=? ORDER BY (statut IN ('faite','annulee')), echeance, id", e.id);
        return json(res, 200, {evenement:Object.assign(presente(e, cx, decl, noms), {declarant:e.declare_par, clos_le:e.clos_le, cnamRetard:ACC.indexOf(e.type) >= 0 && !!e.mat && !decl && e.statut !== "annule" && horsDelai(e)}),
          droits, sites:await sitesDe(cx, e.site_id), journal:jr.map(lireJournal), actions:acts.map(a=>Object.assign(a, {version:ver(a, CH_AC)}))});
      }
      if (req.method !== "POST") return err(404, "introuvable");
      const b = await corpsJson(req);
      /* fiche imprimable : consultation tracée */
      if (me[2] === "imprime"){ if (!dr.imprimer) return refuse(); await audit(C.login, "hse.evenement.imprime", e.id, ip); return json(res, 200, {ok:true}); }
      /* modification d'une déclaration tant qu'elle n'est pas close ; correctif 41 : refusée sans accès aux données
         sensibles (le profil voyait « ••• » et l'enregistrait), version contrôlée, données validées (gravité, arrêt, jours)
         gardées pour un profil sans droit de validation, déclaration CNAM respectée, valeurs précédentes journalisées */
      if (!me[2]){
        if (!dr.modifier) return refuse(); if (!dr.sens) return err(403, "sensibles");
        let changes = null;
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const cur = await B.get("SELECT * FROM hse_evenements WHERE id=?", e.id); if (!cur) throw ko(404, "evenement");
          if (cur.statut === "clos") throw ko(409, "clos"); if (cur.statut === "annule") throw ko(409, "annule");
          if (b.version !== ver(cur, CH_EV)) throw ko(409, "concurrence");
          const v = await lireEvenement(b, cx, cur);
          if (!dr.valider && cur.statut !== "ouvert"){ v.g = Number(cur.gravite) || 1; v.arret = !!Number(cur.arret); v.j = Number(cur.jours_arret) || 0;
            if (v.arret && (ACC.indexOf(v.type) < 0 || !v.mat)) throw ko(400, "arretVictime"); }
          const decl = await B.get("SELECT declaree_le FROM hse_declarations WHERE evenement_id=?", e.id);
          if (decl && (ACC.indexOf(v.type) < 0 || v.mat !== cur.mat || v.d > decl.declaree_le)) throw ko(409, "cnamExiste", {d:jj(decl.declaree_le)});
          const nv = {type:v.type, d:v.d, heure:v.heure, site_id:v.siteId, lieu:v.lieu, mat:v.mat, gravite:v.g, arret:v.arret ? 1 : 0, jours_arret:v.j, description:v.desc};
          const avant = {}; Object.keys(nv).forEach(k=>{ if (String(cur[k] == null ? "" : cur[k]) !== String(nv[k] == null ? "" : nv[k])) avant[k] = cur[k]; });
          changes = Object.keys(avant).length; if (!changes) return;
          const n = await B.run("UPDATE hse_evenements SET type=?, d=?, heure=?, site_id=?, lieu=?, mat=?, gravite=?, arret=?, jours_arret=?, description=? WHERE id=? AND statut NOT IN ('clos','annule')",
            nv.type, nv.d, nv.heure, nv.site_id, nv.lieu, nv.mat, nv.gravite, nv.arret, nv.jours_arret, nv.description, e.id);
          if (!n_(n)) throw ko(409, "concurrence");
          await journal(e.id, "modification", "", avant); });
        if (r) return r; if (changes) await audit(C.login, "hse.evenement.modifie", e.id, ip); return json(res, 200, {ok:true, inchange:!changes});
      }
      if (me[2] === "cnam"){
        if (!dr.modifier) return refuse();
        const le = b.declareeLe, refc = txt(b, "reference", 60);
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const cur = await B.get("SELECT type, d, mat, statut FROM hse_evenements WHERE id=?", e.id);
          if (!cur || ACC.indexOf(cur.type) < 0 || !cur.mat) throw ko(400, "pasAccident"); if (cur.statut === "annule") throw ko(409, "annule");
          if (!dateOk(le) || le < cur.d || le > auj()) throw ko(400, "cnam");
          const prec = await B.get("SELECT declaree_le, reference FROM hse_declarations WHERE evenement_id=?", e.id);
          await B.run("INSERT INTO hse_declarations(evenement_id,declaree_le,reference,par,maj) VALUES(?,?,?,?,?) ON CONFLICT(evenement_id) DO UPDATE SET declaree_le=excluded.declaree_le, reference=excluded.reference, par=excluded.par, maj=excluded.maj", e.id, le, refc, C.login, maint());
          await journal(e.id, "cnam", "", prec ? {declaree_le:prec.declaree_le, reference:prec.reference || ""} : {declaree_le:null}); });
        if (r) return r; await audit(C.login, "hse.evenement.cnam", e.id, ip); return json(res, 200, {ok:true});
      }
      /* correctif 41 : annulation d'un événement saisi par erreur (motif, conservé au registre, exclu des taux) */
      if (me[2] === "annuler"){
        if (!dr.supprimer) return refuse();
        const motif = txt(b, "motif", 500); if (!motif) return err(400, "motif");
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const n = await B.run("UPDATE hse_evenements SET statut='annule' WHERE id=? AND statut<>'annule'", e.id); if (!n_(n)) throw ko(409, "annule");
          await B.run("UPDATE hse_actions SET statut='annulee' WHERE evenement_id=? AND statut NOT IN ('faite','annulee')", e.id);
          await journal(e.id, "annulation", motif); });
        if (r) return r; await audit(C.login, "hse.evenement.annule", e.id, ip); return json(res, 200, {ok:true});
      }
      if (!dr.valider) return refuse();
      if (e.statut === "annule") return err(409, "annule");
      if (me[2] === "rouvrir"){
        const motif = txt(b, "motif", 500); if (!motif) return err(400, "motif");
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const n = await B.run("UPDATE hse_evenements SET statut='en_analyse', clos_le=NULL WHERE id=? AND statut='clos'", e.id); if (!n_(n)) throw ko(409, "pasClos");
          await journal(e.id, "reouverture", motif); });
        if (r) return r; await audit(C.login, "hse.evenement.rouvert", e.id, ip); return json(res, 200, {ok:true});
      }
      if (me[2] === "analyse"){
        /* correctif 41 : refusée sans accès aux données sensibles (cause et jours écrasés à l'aveugle) */
        if (!dr.sens) return err(403, "sensibles");
        const cause = b.cause == null ? String(e.cause||"").trim() : txt(b, "cause", 2000); if (!cause) return err(400, "cause");
        let j = null;
        if (b.joursArret != null && b.joursArret !== ""){ j = entier(b.joursArret); if (!(j >= 0 && j <= 3650)) return err(400, "jours"); }
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const cur = await B.get("SELECT cause, jours_arret, statut FROM hse_evenements WHERE id=?", e.id); if (!cur || cur.statut === "clos" || cur.statut === "annule") throw ko(409, "clos");
          const jn = j == null ? Number(cur.jours_arret) || 0 : j;
          const n = await B.run("UPDATE hse_evenements SET cause=?, statut='en_analyse', jours_arret=CASE WHEN arret=1 THEN ? ELSE 0 END WHERE id=? AND statut NOT IN ('clos','annule')", cause, jn, e.id);
          if (!n_(n)) throw ko(409, "clos");
          const avant = {}; if (String(cur.cause||"") !== cause) avant.cause = cur.cause || ""; if (j != null && Number(cur.jours_arret) !== j) avant.jours_arret = Number(cur.jours_arret) || 0;
          if (Object.keys(avant).length) await journal(e.id, "analyse", "", avant); });
        if (r) return r; await audit(C.login, "hse.evenement.analyse", e.id, ip); return json(res, 200, {ok:true});
      }
      if (me[2] === "cloturer"){
        const r = await tx(async ()=>{ await verrou("hse:"+e.id);
          const e2 = await B.get("SELECT statut, cause, arret, jours_arret FROM hse_evenements WHERE id=?", e.id); if (!e2 || e2.statut === "clos") throw ko(409, "clos");
          if (!String(e2.cause||"").trim()) throw ko(409, "causeAvant");
          /* correctif 41 : un arrêt de travail compte dans le taux de fréquence — au moins un jour d'arrêt à la clôture */
          if (Number(e2.arret) && !(Number(e2.jours_arret) > 0)) throw ko(409, "joursArretRequis");
          const ouvertes = Number((await B.get("SELECT COUNT(*) n FROM hse_actions WHERE evenement_id=? AND statut NOT IN ('faite','annulee')", e.id)).n);
          if (ouvertes) throw ko(409, "actionsOuvertes", {n:ouvertes});
          const n = await B.run("UPDATE hse_evenements SET statut='clos', clos_le=? WHERE id=? AND statut NOT IN ('clos','annule') AND NOT EXISTS (SELECT 1 FROM hse_actions WHERE evenement_id=? AND statut NOT IN ('faite','annulee'))", maint(), e.id, e.id);
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
      return json(res, 200, {total, offset:off, limit:lim, droits, lignes:l.map(a=>Object.assign(a, {version:ver(a, CH_AC)}))});
    }
    if (p === "/api/v1/hse/actions" && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), titre = txt(b, "titre", 200), resp = txt(b, "responsable", 80), ech = b.echeance, evId = txt(b, "evenementId", 40), rqId = txt(b, "risqueId", 40);
      if (!titre || !dateOk(ech) || ech < auj()) return err(400, "action");
      if (!evId && !rqId) return err(400, "origine");
      const cx = await contexte(P), i = id("ha");
      const r = await tx(async ()=>{
        if (evId){ await verrou("hse:"+evId); const e = await B.get("SELECT * FROM hse_evenements WHERE id=? AND statut NOT IN ('clos','annule')", evId);
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
        const ev = a.evenement_id ? await B.get("SELECT statut, d FROM hse_evenements WHERE id=?", a.evenement_id) : null; if (ev && (ev.statut === "clos" || ev.statut === "annule")) throw ko(409, ev.statut === "clos" ? "clos" : "annule");
        if (op === "faite"){ const n = await B.run("UPDATE hse_actions SET statut='faite', faite_le=? WHERE id=? AND statut NOT IN ('faite','annulee')", maint(), a.id); if (!n_(n)) throw ko(409, "actionFaite"); return; }
        if (op === "annuler"){ const motif = txt(b, "motif", 500); if (!motif) throw ko(400, "motif");
          const n = await B.run("UPDATE hse_actions SET statut='annulee' WHERE id=? AND statut NOT IN ('faite','annulee')", a.id); if (!n_(n)) throw ko(409, "actionFaite"); await journal(a.id, "annulation", motif); return; }
        const cur = await B.get("SELECT * FROM hse_actions WHERE id=?", a.id); if (!cur || cur.statut === "faite" || cur.statut === "annulee") throw ko(409, "actionFaite");
        if (b.version !== ver(cur, CH_AC)) throw ko(409, "concurrence");
        const titre = b.titre == null ? cur.titre : txt(b, "titre", 200), resp = b.responsable == null ? (cur.responsable || "") : txt(b, "responsable", 80), ech = b.echeance == null ? cur.echeance : b.echeance;
        if (!titre || !dateOk(ech)) throw ko(400, "action");
        /* correctif 41 : une nouvelle échéance n'est ni passée ni antérieure à l'événement */
        if (ech !== cur.echeance && (ech < auj() || (ev && ech < ev.d))) throw ko(400, "echeancePassee");
        const n = await B.run("UPDATE hse_actions SET titre=?, responsable=?, echeance=? WHERE id=? AND statut NOT IN ('faite','annulee')", titre, resp, ech, a.id); if (!n_(n)) throw ko(409, "actionFaite");
        const avant = {}; if (cur.titre !== titre) avant.titre = cur.titre; if ((cur.responsable||"") !== resp) avant.responsable = cur.responsable || ""; if (cur.echeance !== ech) avant.echeance = cur.echeance;
        if (Object.keys(avant).length) await journal(a.evenement_id || a.id, "action", titre, avant); });
      if (r) return r; await audit(C.login, {faite:"hse.action.faite", annuler:"hse.action.annulee", modifier:"hse.action.modifiee"}[op], a.id, ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/hse/risques" && req.method === "GET"){
      const cx = await contexte(P), vr = risqueSql(P, cx, "rs.");
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE 1=1"+vr.sql, ...vr.a)).n);
      const l = await B.all("SELECT r.*, rs.site_id, rs.revise_le, r.gravite * r.probabilite criticite FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE 1=1"+vr.sql+" ORDER BY r.gravite * r.probabilite DESC, r.unite, r.id LIMIT "+lim+" OFFSET "+off, ...vr.a);
      return json(res, 200, {total, offset:off, limit:lim, droits, sites:await sitesDe(cx), lignes:l.map(z=>Object.assign(z, {gravite:Number(z.gravite), probabilite:Number(z.probabilite), criticite:Number(z.criticite), version:ver(z, CH_RQ)}))});
    }
    const mr = /^\/api\/v1\/hse\/risques(?:\/([^/]+))?$/.exec(p);
    if (mr && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), unite = txt(b, "unite", 120), danger = txt(b, "danger", 200), mesures = txt(b, "mesures", 2000), siteId = txt(b, "siteId", 60) || null;
      if (!unite || !danger) return err(400, "risqueChamps");
      const g = entier(b.gravite), pr = entier(b.probabilite); if (!(g >= 1 && g <= 4)) return err(400, "gravite"); if (!(pr >= 1 && pr <= 4)) return err(400, "probabilite");
      const cx = await contexte(P);
      if (siteId){ const ref = await ref0(); if (!(ref.sites||[]).some(z=>z.id === siteId) || (cx.sites !== null && !cx.sites.has(siteId))) return err(400, "site"); }
      else if (cx.sites !== null && !mr[1]) return err(400, "site");
      const i = mr[1] || id("hr");
      const r = await tx(async ()=>{
        await verrou("hsr:liste");
        let avant = null;
        if (mr[1]){ const vr = risqueSql(P, cx, "rs."); const ex = await B.get("SELECT r.*, rs.site_id FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE r.id=?"+vr.sql, i, ...vr.a); if (!ex) throw ko(404, "risque");
          if (b.version !== ver(ex, CH_RQ)) throw ko(409, "concurrence");
          /* correctif 41 : un risque commun reste commun quand un compte limité à un site le révise */
          if (cx.sites !== null && !ex.site_id && siteId) throw ko(400, "siteCommun");
          if (cx.sites !== null && ex.site_id && !siteId) throw ko(400, "site");
          avant = {unite:ex.unite, danger:ex.danger, gravite:Number(ex.gravite), probabilite:Number(ex.probabilite), mesures:ex.mesures || "", site_id:ex.site_id || null}; }
        /* correctif 41 : même unité, même danger et même site = doublon */
        const dup = await B.get("SELECT r.id FROM hse_risques r LEFT JOIN hse_risques_sites rs ON rs.risque_id=r.id WHERE lower(r.unite)=lower(?) AND lower(r.danger)=lower(?) AND COALESCE(rs.site_id,'')=? AND r.id<>?", unite, danger, siteId || "", i);
        if (dup) throw ko(409, "doublonRisque");
        if (mr[1]) await B.run("UPDATE hse_risques SET unite=?, danger=?, gravite=?, probabilite=?, mesures=?, maj=?, par=? WHERE id=?", unite, danger, g, pr, mesures, maint(), C.login, i);
        else await B.run("INSERT INTO hse_risques(id,unite,danger,gravite,probabilite,mesures,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, unite, danger, g, pr, mesures, maint(), C.login);
        await B.run("INSERT INTO hse_risques_sites(risque_id,site_id,revise_le) VALUES(?,?,?) ON CONFLICT(risque_id) DO UPDATE SET site_id=excluded.site_id, revise_le=excluded.revise_le", i, siteId, auj());
        if (avant) await journal(i, "revision", "", avant); });
      if (r) return r; await audit(C.login, mr[1] ? "hse.risque.revise" : "hse.risque", i, ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/hse/epi" && req.method === "GET"){
      const cx = await contexte(P), a = auj();
      /* correctif 40 : dotations en cours seulement (historique sur demande), salariés sortis exclus du filtre « à renouveler » */
      const pm = perimSql(B, P, "mat"), ren = q.filtre === "renouveler", hist = q.filtre === "historique", so = ren ? await sortisSql(a) : {sql:"", a:[]};
      const w = " WHERE 1=1"+(hist ? "" : EPI_COURANT)+(ren ? " AND renouveler_le IS NOT NULL AND renouveler_le <= ?" : "")+(q.mat ? " AND mat=?" : "")+so.sql+pm.sql, aa = (ren ? [ajoutJours(a, 30)] : []).concat(q.mat ? [String(q.mat).slice(0, 40)] : [], so.a, pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_epi"+w, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, remis_le, renouveler_le, (SELECT x.le FROM hse_epi_annul x WHERE x.epi_id=hse_epi.id) annule_le FROM hse_epi"+w+" ORDER BY "+(hist ? "remis_le DESC" : "renouveler_le IS NULL, renouveler_le")+", mat, id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, offset:off, limit:lim, droits, lignes:l.map(r=>{ const e = cx.parMat.get(String(r.mat)) || {}; return Object.assign(r, {nom:cx.nom(r.mat), sorti:!!(e.sortie && e.sortie < a), annule:!!r.annule_le, aRenouveler:!r.annule_le && !!(r.renouveler_le && r.renouveler_le <= ajoutJours(a, 30))}); })});
    }
    if (p === "/api/v1/hse/epi" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), type = txt(b, "type", 80), rl = b.remisLe;
      if (!mat || !type || !dateOk(rl) || rl > auj()) return err(400, "epi");
      let rn = null; if (b.renouvelerLe != null && b.renouvelerLe !== ""){ if (!dateOk(b.renouvelerLe) || b.renouvelerLe <= rl) return err(400, "renouv"); rn = b.renouvelerLe; }
      const e = dans(P, mat) ? (await contexte(P)).parMat.get(mat) : null; if (!e) return err(404, "salarie");
      if (e.sortie && e.sortie < auj()) return err(409, "sorti");
      if (e.entree && rl < e.entree) return err(400, "epiAvantEntree", {d:jj(e.entree)});
      const i = id("hp");
      /* correctif 41 : même salarié, même équipement, même date = doublon (sous verrou) */
      const r = await tx(async ()=>{ await verrou("hse:epi:"+mat+"|"+type.toLowerCase());
        if (await B.get("SELECT 1 FROM hse_epi WHERE mat=? AND lower(type)=lower(?) AND remis_le=?"+EPI_VALIDE, mat, type, rl)) throw ko(409, "doublonEpi");
        await B.run("INSERT INTO hse_epi(id,mat,type,remis_le,renouveler_le,par) VALUES(?,?,?,?,?,?)", i, mat, type, rl, rn, C.login); });
      if (r) return r; await audit(C.login, "hse.epi", i, ip); return json(res, 200, {ok:true, id:i});
    }
    /* correctif 41 : annulation d'une dotation saisie par erreur (motif) */
    const mp = /^\/api\/v1\/hse\/epi\/([^/]+)\/annuler$/.exec(p);
    if (mp && req.method === "POST"){
      if (!dr.supprimer) return refuse();
      const b = await corpsJson(req), motif = txt(b, "motif", 500); if (!motif) return err(400, "motif");
      const pm = perimSql(B, P, "mat"), ep = await B.get("SELECT id FROM hse_epi WHERE id=?"+pm.sql+EPI_VALIDE, mp[1], ...pm.a); if (!ep) return err(404, "epiIntrouvable");
      const r = await tx(async ()=>{ await B.run("INSERT INTO hse_epi_annul(epi_id,le,par,motif) VALUES(?,?,?,?)", ep.id, maint(), C.login, motif); });
      if (r) return r; await audit(C.login, "hse.epi.annule", ep.id, ip); return json(res, 200, {ok:true});
    }
    /* correctif 40 : registre des accidents et événements (CSV, tracé), dates jj/mm/aaaa, libellés traduits ;
       correctif 41 : période bornée à deux ans et notée au journal, description, cause, déclarant et clôture */
    if (p === "/api/v1/hse/export" && req.method === "GET"){
      if (!dr.exporter) return refuse();
      const au = q.au || auj(), du = q.du || (dateOk(au) ? ajoutJours(au, -364) : ""); if (!dateOk(au) || !dateOk(du) || du > au || ajoutJours(du, 731) < au) return err(400, "periode");
      const cx = await contexte(P), vs = visibleSql(P, cx, C.login, "ev."), ref = await ref0(), nomSite = new Map((ref.sites||[]).map(s=>[s.id, s.nom || s.id]));
      const l = await B.all("SELECT ev.*, c.declaree_le cnam_le, c.reference cnam_ref FROM hse_evenements ev LEFT JOIN hse_declarations c ON c.evenement_id=ev.id WHERE ev.d>=? AND ev.d<=?"+vs.sql+" ORDER BY ev.d, ev.heure, ev.id", du, au, ...vs.a);
      await audit(C.login, "hse.export", l.length+" événement(s) du "+jj(du)+" au "+jj(au), ip);
      const cel = c => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; };
      const sx = v => dr.sens ? v : (v ? MQ : "");
      const csv = [LIB.entete[L].map(cel).join(";")].concat(l.map(e=>[jj(e.d), e.heure || "", lib("type", e.type), nomSite.get(e.site_id) || "", e.lieu || "", sx(e.mat || ""), sx(e.mat ? cx.nom(e.mat) : ""),
        e.gravite == null ? "" : Number(e.gravite), Number(e.arret) ? LIB.oui[L] : LIB.non[L], dr.sens ? Number(e.jours_arret) || 0 : "", lib("statut", e.statut), jj(e.cnam_le), e.cnam_ref || "",
        sx(e.description || ""), sx(e.cause || ""), e.declare_par || "", jj(String(e.clos_le || "").slice(0, 10))].map(cel).join(";"))).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-registre-hse.csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); return res.end("﻿"+csv);
    }
    return err(404, "introuvable");
    }
  }
  return {traiter, aTraiter, fiche360, service};
}
module.exports = {ddl, tables, creer};
