/* FW-Medicale — suivi médical, cloisonné selon le modèle validé par le client :
   - seul le rôle médical (droit « MED » : médecin du travail, infirmier) accède au détail (visites, restrictions,
     observations, maladies professionnelles) ; le statut d'administrateur ne suffit pas ;
   - RH et responsables ne voient que l'aptitude (apte, apte avec restriction, inapte) et la prochaine visite ;
   - chaque consultation d'un dossier médical est tracée ; les exports sont réservés au rôle médical ;
   - restrictions, observations, tableau et motifs chiffrés dans la base (AES-256-GCM, clé du coffre « medical ») ;
   - le pilotage ne reçoit que des taux et des nombres par service, masqués sous 5 salariés.
   Correctif 40 : matrice de l'écran « medical » appliquée (menu masqué ou en lecture, actions), détail médical refusé à
   un profil sans accès aux données sensibles, verrous et mises à jour conditionnelles (PostgreSQL), dates réelles,
   aptitude courante fiable, report et annulation motivés, rectification tracée, pagination et compteurs côté serveur,
   messages trilingues, export traduit, jour local.
   Correctif 42 : aptitude prononcée et maladie professionnelle reconnue avec le droit de validation seulement ; versions
   contre les écrasements (rectification, maladie professionnelle, paramètres) ; rectification dans l'ordre des visites ;
   prochaine visite bornée à la périodicité ; salariés sortis exclus ; maladies professionnelles contrôlées (tableau,
   date, doublon, transitions motivées, rectification, annulation) ; annulation d'une visite réalisée, fiche d'aptitude
   imprimable ; historique complet ; recherche par nom, filtres et export bornés ; « À traiter » sans doublon ni borne
   basse ; Pilotage aligné sur l'écran (matrice, définition « à jour », total hors services masqués, mise à jour). */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const listeSql = (B, col, l) => B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[l]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(l)]};
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS med_visites (id TEXT PRIMARY KEY, mat TEXT NOT NULL, type TEXT NOT NULL, prevue_le TEXT, realisee_le TEXT, statut TEXT NOT NULL, aptitude TEXT, restrictions TEXT, observations TEXT, prochaine_le TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS med_visites_mat ON med_visites(mat, realisee_le)",
  "CREATE INDEX IF NOT EXISTS med_visites_statut ON med_visites(statut, prevue_le)",
  "CREATE TABLE IF NOT EXISTS med_mp (id TEXT PRIMARY KEY, mat TEXT NOT NULL, declaree_le TEXT NOT NULL, tableau TEXT, statut TEXT NOT NULL, observations TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS med_mp_d ON med_mp(declaree_le)",
  "CREATE TABLE IF NOT EXISTS med_parametres (k TEXT PRIMARY KEY, v TEXT)",
  /* correctif 40 : motifs de report et d'annulation, valeurs avant rectification (chiffrés) */
  "CREATE TABLE IF NOT EXISTS med_journal (id TEXT PRIMARY KEY, objet_id TEXT NOT NULL, nature TEXT NOT NULL, le TEXT NOT NULL, par TEXT, donnees TEXT)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS med_visites_mat_statut ON med_visites(mat, statut, realisee_le)", "CREATE INDEX IF NOT EXISTS med_journal_objet ON med_journal(objet_id, le)");
ddl.sqlite = ddl.pg;
const tables = {med_visites:"id", med_mp:"id", med_parametres:"k", med_journal:"id"};
const TYPES = ["embauche", "periodique", "reprise", "pre_reprise", "demande"], APT = ["apte", "apte_restriction", "inapte"], MPS = ["declaree", "reconnue", "refusee"];
/* correctif 42 : numéro de tableau de maladie professionnelle (ex. 57, 57 bis) */
const TABLEAU = /^\d{1,3}( ?(bis|ter))?$/i;
/* correctif 40 : fin de mois respectée (31/08 + 6 mois donne le 28/02) */
function ajoutMois(k, n){ const p = k.split("-").map(Number), t = new Date(Date.UTC(p[0], p[1]-1+n, 1)), der = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth()+1, 0)).getUTCDate();
  t.setUTCDate(Math.min(p[2], der)); return t.toISOString().slice(0, 10); }
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const LIB = {
  type:{embauche:["Embauche","Pre-employment","انتداب"], periodique:["Périodique","Periodic","دورية"], reprise:["Reprise","Return to work","استئناف"], pre_reprise:["Pré-reprise","Pre-return","ما قبل الاستئناف"], demande:["À la demande","On request","بطلب"]},
  statut:{planifiee:["Planifiée","Scheduled","مبرمجة"], realisee:["Réalisée","Done","منجزة"], annulee:["Annulée","Cancelled","ملغاة"]},
  aptitude:{apte:["Apte","Fit","أهل"], apte_restriction:["Apte avec restriction","Fit with restrictions","أهل مع قيود"], inapte:["Inapte","Unfit","غير أهل"]},
  entete:[["Matricule","Nom","Type","Prévue le","Réalisée le","Statut","Aptitude","Prochaine visite"],["Employee ID","Name","Type","Planned","Done on","Status","Fitness","Next visit"],["المعرف","الاسم","النوع","مبرمجة في","أنجزت في","الحالة","الأهلية","الزيارة القادمة"]]
};
const MSG = {
  masque:["Écran Suivi médical masqué pour votre profil.", "Medical follow-up screen hidden for your profile.", "شاشة المتابعة الطبية مخفية لملفك."],
  droitEmp:["Droit de consultation des salariés ou droit médical requis.", "Employee viewing right or medical right required.", "يلزم حق الاطلاع على الأجراء أو الحق الطبي."],
  medical:["Accès réservé au service médical.", "Restricted to the medical service.", "الدخول حكر على المصلحة الطبية."],
  sensibles:["Votre profil n'a pas accès aux données sensibles : le détail médical est refusé.", "Your profile has no access to sensitive data: medical details refused.", "ملفك لا يخول الاطلاع على المعطيات الحساسة: التفاصيل الطبية مرفوضة."],
  refuse:["Action non permise par vos droits sur l'écran Suivi médical.", "Action not allowed by your rights on the Medical follow-up screen.", "إجراء غير مسموح بحقوقك على شاشة المتابعة الطبية."],
  medecin:["Réservé au médecin du travail.", "Restricted to the occupational physician.", "حكر على طبيب الشغل."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  trop:["Champ « {c} » : {n} caractères au plus.", "Field “{c}”: at most {n} characters.", "الحقل «{c}»: {n} حرفا على الأكثر."],
  periodicite:["Périodicité non prévue (6, 12, 24 ou 36 mois).", "Interval not allowed (6, 12, 24 or 36 months).", "دورية غير مقبولة (6 أو 12 أو 24 أو 36 شهرا)."],
  planif:["Salarié, type et date prévue (réelle) obligatoires.", "Employee, type and a real planned date required.", "الأجير والنوع وتاريخ البرمجة إجبارية."],
  salarie:["Salarié introuvable ou hors périmètre.", "Employee not found or outside your scope.", "أجير غير موجود أو خارج نطاقك."],
  sorti:["Salarié sorti le {d} : aucune visite à planifier.", "Employee left on {d}: no visit to schedule.", "غادر الأجير في {d}: لا زيارة للبرمجة."],
  apresSortie:["Date prévue postérieure à la sortie du salarié ({d}).", "Planned date after the employee's leaving date ({d}).", "التاريخ بعد مغادرة الأجير ({d})."],
  passee:["Date prévue passée : choisissez aujourd'hui ou une date future.", "Planned date in the past: choose today or later.", "تاريخ ماض: اختر اليوم أو تاريخا لاحقا."],
  doublon:["Une visite « {t} » est déjà planifiée pour ce salarié (le {d}).", "A “{t}” visit is already scheduled for this employee ({d}).", "زيارة «{t}» مبرمجة مسبقا لهذا الأجير ({d})."],
  visite:["Visite introuvable.", "Visit not found.", "زيارة غير موجودة."],
  traitee:["Visite déjà traitée.", "Visit already processed.", "تمت معالجة الزيارة."],
  concurrence:["Visite modifiée entre-temps : actualisez.", "Visit modified in the meantime: refresh.", "عُدّلت الزيارة في الأثناء: حدّث."],
  aptitude:["Aptitude obligatoire (apte, apte avec restriction, inapte).", "Fitness required (fit, fit with restrictions, unfit).", "الأهلية إجبارية."],
  restrictions:["Précisez les restrictions.", "Specify the restrictions.", "حدد القيود."],
  dateRealisation:["Date de réalisation réelle obligatoire, au plus tard aujourd'hui.", "A real completion date, today at the latest, is required.", "تاريخ الإنجاز إجباري ولا يتجاوز اليوم."],
  avantEntree:["Date antérieure à l'entrée du salarié ({d}).", "Date before the employee's start date ({d}).", "تاريخ سابق لانتداب الأجير ({d})."],
  prochaine:["Prochaine visite : date réelle postérieure à la visite.", "Next visit: a real date after the visit.", "الزيارة القادمة: تاريخ لاحق للزيارة."],
  motif:["Motif obligatoire.", "Reason required.", "التعليل إجباري."],
  report:["Nouvelle date réelle, à partir d'aujourd'hui et différente de l'actuelle.", "A real new date, from today and different from the current one.", "تاريخ جديد صالح ابتداء من اليوم ومختلف عن الحالي."],
  pasRealisee:["Seule une visite réalisée se rectifie.", "Only a completed visit can be corrected.", "تصحح الزيارة المنجزة فقط."],
  declaration:["Salarié et date de déclaration (réelle, au plus tard aujourd'hui) obligatoires.", "Employee and a real declaration date (today at the latest) required.", "الأجير وتاريخ التصريح إجباريان."],
  mpStatut:["Statut non prévu.", "Status not allowed.", "حالة غير مقبولة."],
  introuvable:["Introuvable.", "Not found.", "غير موجود."],
  valider:["Réservé au droit de validation médicale (médecin du travail).", "Restricted to the medical validation right (occupational physician).", "حكر على حق المصادقة الطبية (طبيب الشغل)."],
  ordreVisites:["Date hors de l'ordre des visites : entre le {a} et le {b}.", "Date out of the visits' order: between {a} and {b}.", "تاريخ خارج ترتيب الزيارات: بين {a} و{b}."],
  prochaineMax:["Prochaine visite au plus tard le {d} (périodicité).", "Next visit no later than {d} (interval).", "الزيارة القادمة في أجل أقصاه {d}."],
  apresSortieR:["Visite postérieure à la sortie du salarié ({d}).", "Visit after the employee's leaving date ({d}).", "زيارة بعد مغادرة الأجير ({d})."],
  restrictionsHors:["Les restrictions ne s'inscrivent qu'avec l'aptitude « apte avec restriction ».", "Restrictions are only recorded with “fit with restrictions”.", "تسجل القيود فقط مع «أهل مع قيود»."],
  embaucheFaite:["Visite d'embauche déjà réalisée le {d} pour cette entrée.", "Pre-employment visit already done on {d} for this hiring.", "زيارة الانتداب أنجزت في {d}."],
  tableau:["Tableau : numéro de 1 à 3 chiffres, éventuellement « bis » ou « ter ».", "Table: 1 to 3 digits, optionally “bis” or “ter”.", "الجدول: رقم من 1 إلى 3 أرقام."],
  mpDoublon:["Maladie professionnelle déjà déclarée pour ce salarié et ce tableau.", "Occupational disease already declared for this employee and table.", "مرض مهني مصرح به لهذا الأجير وهذا الجدول."],
  mpTransition:["Retour d'un statut décidé : motif obligatoire.", "Reverting a decided status: reason required.", "الرجوع عن حالة مقررة: التعليل إجباري."],
  mpAnnulee:["Maladie professionnelle annulée.", "Occupational disease cancelled.", "مرض مهني ملغى."],
  pasRealiseeImp:["Seule une visite réalisée s'imprime.", "Only a completed visit can be printed.", "تطبع الزيارة المنجزة فقط."],
  periode:["Période invalide : dates réelles, début ≤ fin, deux ans au plus.", "Invalid period: real dates, start ≤ end, two years at most.", "فترة غير صالحة."],
  coffre:["Coffre de clés indisponible : enregistrement médical impossible.", "Key vault unavailable: medical record cannot be saved.", "خزنة المفاتيح غير متاحة."]
};
const MAXT = {restrictions:2000, observations:4000, tableau:40, motif:500};
function creer(o){
  const {B, D, audit} = o, coffre = o.coffre, pg = B.type === "pg";
  const PERIM = require("../perimetre.js");
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  /* correctif 40 : jour local (entre minuit et 1 h en Tunisie, le jour UTC était la veille) */
  const auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  /* correctif 40 : un mois ou un jour hors limites (2026-13-45) levait une exception (erreur 500) au lieu d'être refusé */
  const dateOk = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0, 4) < 1990 || +s.slice(0, 4) > 2100) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "";
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  const nomDe = e => (((e||{}).nom||"")+" "+((e||{}).prenom||"")).trim();
  /* v56.23 : jamais de clé de secours prévisible — sans coffre, le chiffrement échoue (fail closed) */
  const cle = () => { if (!coffre || typeof coffre.cle !== "function") throw Object.assign(new Error("coffre"), {st:503}); return crypto.createHash("sha256").update(coffre.cle("medical")).digest(); };
  const chiffrer = t => { if (!t) return null; const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(), iv); const x = Buffer.concat([c.update(Buffer.from(String(t), "utf8")), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]).toString("base64"); };
  /* correctif 40 : un échec de déchiffrement est signalé (avant : texte vide, sans alerte) ; « clair » accepte les
     valeurs saisies en clair avant le chiffrement (tableau des maladies professionnelles) */
  const dechiffrer = (s, clair) => { if (!s) return {v:""}; try { const b = Buffer.from(s, "base64"); if (b.length < 29) throw new Error("court"); const d = crypto.createDecipheriv("aes-256-gcm", cle(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return {v:Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8")}; } catch(e){ return clair ? {v:String(s)} : {v:"", ko:true}; } };
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* rôle médical : droit MED explicite, jamais déduit du statut d'administrateur */
  const rangMed = P => RANG[((P.profil||{}).droits||{}).MED] || 0;
  /* correctif 40 : matrice de l'écran « medical » (menu masqué ou en lecture ; actions lire / créer / modifier / valider /
     exporter) ; vue RH (droit EMP) limitée aux aptitudes ; détail médical : droit MED et accès aux données sensibles.
     Correctif 42 : aptitude et reconnaissance d'une maladie professionnelle réservées à la validation (médecin) ; le
     profil « saisie » (infirmier) planifie, reporte, annule et déclare ; supprimer (annulation d'une visite réalisée ou
     d'une maladie professionnelle) et imprimer (fiche d'aptitude) */
  function droitsEcran(admin, P){
    const re = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0), rm = rangMed(P);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).medical, act = (pr.actions || {}).medical || {};
    const voir = (re >= 1 || rm >= 1) && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    const med = voir && rm >= 1, sens = med && !PERIM.masquePerso(P);
    return {re, rm, voir, med, sens, planifier:sens && !ro && rm >= 2 && act.creer !== false, modifier:sens && !ro && rm >= 2 && act.modifier !== false,
      declarer:sens && !ro && rm >= 2 && act.creer !== false, valider:sens && !ro && rm >= 3 && act.valider !== false, supprimer:sens && !ro && rm >= 3 && act.supprimer !== false,
      parametrer:sens && !ro && rm >= 3 && act.modifier !== false, exporter:sens && rm >= 2 && act.exporter !== false, imprimer:sens && act.imprimer !== false};
  }
  /* correctif 42 : version d'un élément (empreinte de ses champs) — une modification faite depuis un état périmé est refusée */
  const ver = (r, champs) => crypto.createHash("sha1").update(JSON.stringify(champs.map(k=>r[k] == null ? null : String(r[k])))).digest("hex").slice(0, 16);
  const CH_V = ["statut","realisee_le","aptitude","restrictions","observations","prochaine_le","prevue_le","maj"], CH_MP = ["statut","declaree_le","tableau","observations","maj"];
  /* correctif 42 : toute écriture prévient les autres modules (le Pilotage vide son cache) */
  const publie = () => { try { if (o.publier) o.publier("medical.maj", {}); } catch(e){} };
  async function periodicite(){ const r = await B.get("SELECT v FROM med_parametres WHERE k='periodicite_mois'"); const n = Number(r && r.v); return [6, 12, 24, 36].indexOf(n) >= 0 ? n : 12; }
  /* état d'aptitude courant par salarié — sans restriction ni observation. Correctif 40 : dernière visite selon la date
     de réalisation puis la saisie (deux visites le même jour), la pré-reprise ne fixe pas l'aptitude, un inapte n'a pas
     de prochaine visite périodique ; mats = null : tout le périmètre P */
  async function aptitudes(mats, P){
    const out = new Map(), ajoute = r => out.set(String(r.mat), {aptitude:r.aptitude, derniere:r.realisee_le, prochaine:r.aptitude === "inapte" ? null : r.prochaine_le, type:r.type});
    const sql = "SELECT mat, aptitude, realisee_le, prochaine_le, type FROM med_visites WHERE statut='realisee' AND type<>'pre_reprise' AND aptitude IS NOT NULL";
    if (mats === null){ const pm = perimSql(B, P, "mat"); (await B.all(sql+pm.sql+" ORDER BY mat, realisee_le, maj", ...pm.a)).forEach(ajoute); return out; }
    for (let i = 0; i < mats.length; i += 1000){ const l = listeSql(B, "mat", mats.slice(i, i+1000)); (await B.all(sql+l.sql+" ORDER BY mat, realisee_le, maj", ...l.a)).forEach(ajoute); }
    return out;
  }
  /* première visite planifiée de chaque salarié du périmètre */
  async function planifiees(P){ const pm = perimSql(B, P, "mat"), m = new Map();
    (await B.all("SELECT mat, prevue_le, type FROM med_visites WHERE statut='planifiee'"+pm.sql+" ORDER BY mat, prevue_le DESC", ...pm.a)).forEach(r=>m.set(String(r.mat), {prevue:r.prevue_le, type:r.type})); return m; }
  const echue = (v, a) => !v || (v.aptitude !== "inapte" && (!v.prochaine || v.prochaine <= a));
  /* salariés sortis (exclus des compteurs, des retards et des listes de travail) */
  async function sortisSql(col){ const a = auj(), s = (await D.employes()).filter(e=>e.sortie && e.sortie < a).map(e=>String(e.mat)); if (!s.length) return {sql:"", a:[]};
    return pg ? {sql:" AND NOT ("+col+" = ANY(?))", a:[s]} : {sql:" AND "+col+" NOT IN (SELECT value FROM json_each(?))", a:[JSON.stringify(s)]}; }
  /* indicateurs pour le pilotage : par service, nombres et taux seulement, masqués sous 5 salariés.
     Correctif 42 : « à jour » = même définition que l'écran (visite non échue à la fin de la période) ; total calculé sur
     les seuls services publiés (un total incluant les services masqués révélait leurs valeurs par différence) */
  async function indicateurs(emps, du, au){
    const per = await periodicite(), apt = await aptitudes(emps.map(e=>String(e.mat))), ref = await (D.referentielLecture || D.referentiel)() || {};
    const nomDept = new Map((ref.depts||[]).map(d=>[d.id, d.nom])), parDept = {};
    const visites = []; const mats = emps.map(e=>String(e.mat));
    for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, type, realisee_le FROM med_visites WHERE statut='realisee' AND mat IN ("+l.map(()=>"?").join(",")+")", ...l)).forEach(v=>visites.push(v)); }
    const vParMat = {}; visites.forEach(v=>{ (vParMat[v.mat] = vParMat[v.mat] || []).push(v); });
    const mp = []; for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, statut FROM med_mp WHERE statut<>'annulee' AND declaree_le>=? AND declaree_le<=? AND mat IN ("+l.map(()=>"?").join(",")+")", du, au, ...l)).forEach(x=>mp.push(x)); }
    const mpParMat = {}; mp.forEach(x=>{ (mpParMat[x.mat] = mpParMat[x.mat] || []).push(x); });
    emps.forEach(e=>{
      const k = e.deptId || "", x = parDept[k] || (parDept[k] = {service:nomDept.get(k) || "—", effectif:0, aJour:0, periodiquesPeriode:0, embauches:0, embauchesVisite:0, mpDeclarees:0, mpReconnues:0});
      const actif = (!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au); if (!actif) return;
      x.effectif++;
      const a = apt.get(String(e.mat)); if (a && (a.aptitude === "inapte" || (a.prochaine && a.prochaine > au))) x.aJour++;
      const vs = vParMat[String(e.mat)] || [];
      x.periodiquesPeriode += vs.filter(v=>v.type === "periodique" && v.realisee_le >= du && v.realisee_le <= au).length;
      if (e.entree && e.entree >= du && e.entree <= au){ x.embauches++; if (vs.some(v=>v.type === "embauche" && v.realisee_le >= ajoutJours(e.entree, -30))) x.embauchesVisite++; }
      const m = mpParMat[String(e.mat)] || []; x.mpDeclarees += m.length; x.mpReconnues += m.filter(z=>z.statut === "reconnue").length;
    });
    const SEUIL = 5, r1 = v => Math.round(v * 10) / 10;
    /* 56.33.11 : petits nombres — un numérateur de 1 à 4 (embauches, maladies professionnelles) permettait de reconnaître
       la personne même dans un service de 5 salariés ou plus : valeur remplacée par null (et le taux qui en dépend),
       ligne signalée par « petitsNombresMasques » (« masque » reste réservé au service entièrement masqué) */
    const petits = o => { const pn = n => n > 0 && n < SEUIL; let m = false;
      if (pn(o.embauches)){ o.embauches = null; o.tauxVisitesEmbauche = null; m = true; }
      if (pn(o.mpDeclarees)){ o.mpDeclarees = null; o.mpReconnues = null; m = true; }
      if (pn(o.mpReconnues)){ o.mpReconnues = null; m = true; }
      if (m) o.petitsNombresMasques = true; return o; };
    const tous = Object.values(parDept).filter(x=>x.effectif), publies = tous.filter(x=>x.effectif >= SEUIL);
    const lignes = tous.sort((a, b)=>a.service.localeCompare(b.service)).map(x=>x.effectif < SEUIL
      ? {service:x.service, effectif:x.effectif, masque:true}
      : petits({service:x.service, effectif:x.effectif, tauxPeriodiquesAJour:r1(100 * x.aJour / x.effectif), periodiquesPeriode:x.periodiquesPeriode, embauches:x.embauches,
         tauxVisitesEmbauche:x.embauches ? r1(100 * x.embauchesVisite / x.embauches) : null, mpDeclarees:x.mpDeclarees, mpReconnues:x.mpReconnues}));
    const T = publies.reduce((s, x)=>({effectif:s.effectif + x.effectif, aJour:s.aJour + x.aJour, emb:s.emb + x.embauches, embV:s.embV + x.embauchesVisite, mp:s.mp + x.mpDeclarees, mpR:s.mpR + x.mpReconnues, per:s.per + x.periodiquesPeriode}), {effectif:0, aJour:0, emb:0, embV:0, mp:0, mpR:0, per:0});
    const masques = tous.length - publies.length;
    return {periodiciteMois:per, seuilMasquage:SEUIL, servicesMasques:masques, total:T.effectif < SEUIL ? {masque:true} : petits(Object.assign({tauxPeriodiquesAJour:r1(100 * T.aJour / T.effectif), periodiquesPeriode:T.per, embauches:T.emb,
      tauxVisitesEmbauche:T.emb ? r1(100 * T.embV / T.emb) : null, mpDeclarees:T.mp, mpReconnues:T.mpR}, masques ? {horsServicesMasques:true, effectif:T.effectif} : {})), parService:lignes};
  }
  /* correctif 40 : « À traiter » — salariés déjà planifiés exclus, visites planifiées en retard, nouveaux salariés sans
     aucune visite ; correctif 42 : salariés sortis exclus des retards, reprise sans borne basse (accidents des 12 derniers
     mois) et retirée des salariés « sans visite », une seule requête, erreur journalisée */
  async function aTraiter(x){
    const out = [], a = auj(), dr = droitsEcran(x.admin, x.P);
    if (!dr.planifier && !dr.modifier) return out;
    const emps = (await D.employes()).filter(e=>(!e.sortie || e.sortie >= a) && dans(x.P, e.mat)), apt = await aptitudes(null, x.P), plan = await planifiees(x.P);
    const presents = new Set(emps.map(z=>String(z.mat))), reprise = new Set();
    if ((o.moduleActif || (()=>false))("FW-HSE")) try {
      const pa = perimSql(B, x.P, "mat"), arr = await B.all("SELECT mat, d, jours_arret FROM hse_evenements WHERE type IN ('accident','accident_trajet') AND arret=1 AND jours_arret>0 AND statut<>'annule' AND d>=?"+pa.sql, ajoutJours(a, -365), ...pa.a);
      const cand = arr.filter(r=>presents.has(String(r.mat)) && ajoutJours(r.d, Number(r.jours_arret)) <= ajoutJours(a, 7));
      if (cand.length){ const l = listeSql(B, "mat", Array.from(new Set(cand.map(r=>String(r.mat))))), vus = new Map();
        (await B.all("SELECT mat, COALESCE(realisee_le, prevue_le) d FROM med_visites WHERE type IN ('reprise','pre_reprise') AND statut<>'annulee'"+l.sql, ...l.a)).forEach(v=>{ const k = String(v.mat); if (!vus.has(k) || v.d > vus.get(k)) vus.set(k, v.d); });
        cand.forEach(r=>{ const v = vus.get(String(r.mat)); if (!v || v < r.d) reprise.add(String(r.mat)); }); }
    } catch(e){ (o.journal||console.log)("suivi médical : reprises après accident : "+e.message); }
    const libres = emps.filter(e=>!plan.has(String(e.mat)));
    const sansEmb = libres.filter(e=>!apt.has(String(e.mat)) && !reprise.has(String(e.mat))).length;
    const dues = libres.filter(e=>{ const v = apt.get(String(e.mat)); return v && v.aptitude !== "inapte" && v.prochaine && v.prochaine <= ajoutJours(a, 30); }).length;
    const pm = perimSql(B, x.P, "mat"), so = await sortisSql("mat"), retard = Number((await B.get("SELECT COUNT(*) n FROM med_visites WHERE statut='planifiee' AND prevue_le<?"+so.sql+pm.sql, a, ...so.a, ...pm.a)).n);
    if (retard) out.push({domaine:"sante", cle:"med-retard", nombre:retard, urgence:2, vue:"medical"});
    if (reprise.size) out.push({domaine:"sante", cle:"med-reprise", nombre:reprise.size, urgence:2, vue:"medical"});
    if (sansEmb) out.push({domaine:"sante", cle:"med-embauche", nombre:sansEmb, urgence:2, vue:"medical"});
    if (dues) out.push({domaine:"sante", cle:"med-periodiques", nombre:dues, urgence:1, vue:"medical"});
    return out;
  }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || !dans(x.P, x.mat)) return null;
    const v = (await aptitudes([String(x.mat)])).get(String(x.mat));
    return {cle:"medical", vue:"medical", lignes:[{k:v && v.aptitude ? "medApt_"+v.aptitude : "medAptInconnue", v:"", alerte:!v || v.aptitude !== "apte"},
      {k:"medProchaine", v:v && v.prochaine ? jj(v.prochaine) : "—", alerte:!!(v && v.aptitude !== "inapte" && (!v.prochaine || v.prochaine <= auj()))}]};
  }
  /* correctif 42 : bloc « suivi médical » du Pilotage selon la matrice de l'écran du demandeur */
  function filtrePilotage(admin, P, med){ if (!med) return med; return droitsEcran(admin, P).voir ? med : undefined; }
  const service = {droitsEcran, filtrePilotage};
  /* consultation d'un dossier tracée une fois par quart d'heure et par compte (avant : à chaque rechargement) */
  const VUS = new Map();
  async function tracerConsultation(login, mat, ip){ const k = login+"|"+mat, t = Date.now(); if (VUS.has(k) && t - VUS.get(k) < 15 * 60000) return; VUS.set(k, t);
    if (VUS.size > 5000) VUS.clear(); await audit(login, "medical.dossier.consulte", mat, ip); }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ /* correctif 41 : langue de l'écran (en-tête X-Langue envoyé par l'application) en priorité */ const l = String((req.headers || {})["x-langue"] || u.searchParams.get("lang") || (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2)).slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    /* correctif 40 : err renvoie true — « if (e) return e » après tx() arrêtait le traitement seulement en apparence
       (json renvoie undefined : l'audit et une seconde réponse suivaient un refus) */
    const err = (st, k, v) => { json(res, st, {message:m(k, v), code:k}); return true; };
    const lib = (g, k) => ((LIB[g] || {})[k] || [k])[L] || k;
    /* texte strict : un objet ou un tableau est refusé ; un texte trop long aussi (avant : tronqué sans avertissement) */
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k});
      const s = String(v).trim(); if (max && s.length > max) throw Object.assign(new Error("trop"), {champ:k, n:max}); return s; };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ});
      if (e && e.message === "trop") return err(400, "trop", {c:e.champ, n:e.n}); if (e && e.message === "coffre") return err(503, "coffre"); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P);
    if (dr.re < 1 && dr.rm < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const refuse = () => err(403, "refuse");
    const droits = {medical:dr.med, sensibles:dr.sens, planifier:dr.planifier, modifier:dr.modifier, declarer:dr.declarer, valider:dr.valider, supprimer:dr.supprimer, parametrer:dr.parametrer, exporter:dr.exporter, imprimer:dr.imprimer};
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); publie(); return null; } catch(e){ if (e && e.st && MSG[e.message]) return err(e.st, e.message, e.v); if (/unique|duplicate|constraint/i.test((e && e.message) || "")) return err(409, "concurrence"); throw e; } };
    const empDe = async mat => (await D.employes()).find(e=>String(e.mat) === String(mat));
    const nchg = n => !!(n && (n.changes || n.rowCount || n.n));
    /* journal médical chiffré : motif et valeurs précédentes */
    const journal = (objet, nature, donnees) => B.run("INSERT INTO med_journal(id,objet_id,nature,le,par,donnees) VALUES(?,?,?,?,?,?)", id("mj"), objet, nature, maint(), C.login, chiffrer(JSON.stringify(donnees || {})));
    /* vue RH et responsables : aptitude et prochaine visite uniquement */
    if (p === "/api/v1/medical/aptitudes" && req.method === "GET"){
      const s = String(q.q||"").trim().toLowerCase().slice(0, 100), a = auj();
      const emps = (await D.employes()).filter(e=>dans(P, e.mat) && (!e.sortie || e.sortie >= a) && (!s || String(e.mat).toLowerCase() === s || nomDe(e).toLowerCase().indexOf(s) >= 0))
        .sort((x1, x2)=>nomDe(x1).localeCompare(nomDe(x2)) || String(x1.mat).localeCompare(String(x2.mat)));
      /* correctif 40 : filtres calculés sur la dernière visite (avant : MAX(prochaine_le), toutes visites confondues) */
      const filtre = ["restriction", "echue", "inapte"].indexOf(q.filtre) >= 0 ? q.filtre : "";
      const apt = filtre ? await aptitudes(null, P) : null;
      const liste = !filtre ? emps : emps.filter(e=>{ const v = apt.get(String(e.mat));
        return filtre === "restriction" ? !!v && (v.aptitude === "apte_restriction" || v.aptitude === "inapte") : filtre === "inapte" ? !!v && v.aptitude === "inapte" : echue(v, a); });
      const page = liste.slice(off, off + lim), ap = apt || await aptitudes(page.map(e=>String(e.mat))), plan = await planifiees(P);
      return json(res, 200, {total:liste.length, offset:off, limit:lim, droits, roleMedical:dr.sens,
        lignes:page.map(e=>{ const v = ap.get(String(e.mat)) || {}, pl = plan.get(String(e.mat)); return {mat:e.mat, nom:nomDe(e), aptitude:v.aptitude || null, prochaine:v.prochaine || null, echue:echue(ap.get(String(e.mat)), a), planifiee:pl ? pl.prevue : null}; })});
    }
    if (!dr.med) return err(403, "medical");
    if (!dr.sens) return err(403, "sensibles");
    /* correctif 42 : recherche d'un salarié du périmètre par nom ou matricule (formulaires) */
    if (p === "/api/v1/medical/salaries" && req.method === "GET"){
      const s = String(q.q || "").trim().toLowerCase().slice(0, 60), a = auj(); if (s.length < 2) return json(res, 200, {lignes:[]});
      const l = (await D.employes()).filter(e=>dans(P, e.mat) && (!e.sortie || e.sortie >= a) && (String(e.mat).toLowerCase().indexOf(s) === 0 || nomDe(e).toLowerCase().indexOf(s) >= 0)).slice(0, 15);
      return json(res, 200, {lignes:l.map(e=>({mat:e.mat, nom:nomDe(e)}))});
    }
    if (p === "/api/v1/medical/parametres" && req.method === "GET"){ const per = await periodicite(); return json(res, 200, {periodiciteMois:per, version:String(per), droits}); }
    if (p === "/api/v1/medical/parametres" && req.method === "POST"){
      if (!dr.parametrer) return dr.rm < 3 ? err(403, "medecin") : refuse();
      const b = await corpsJson(req), n = Number(b.periodiciteMois);
      if ([6, 12, 24, 36].indexOf(n) < 0) return err(400, "periodicite");
      /* correctif 42 : version (valeur affichée) contrôlée sous verrou ; ancienne valeur journalisée */
      const r = await tx(async ()=>{ await verrou("med:parametres"); const avant = await periodicite();
        if (String(b.version) !== String(avant)) throw ko(409, "concurrence"); if (avant === n) return;
        await B.run("INSERT INTO med_parametres(k,v) VALUES('periodicite_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n));
        await journal("parametres", "parametre", {avant:{periodicite_mois:avant}, apres:n}); });
      if (r) return r; await audit(C.login, "medical.periodicite", n+" mois", ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/medical/visites" && req.method === "GET"){
      const st = ["planifiee","realisee","annulee"].indexOf(q.statut) >= 0 ? q.statut : "planifiee", a = auj(), s7 = ajoutJours(a, 7), mois = a.slice(0, 7);
      const tous = await D.employes(), emps = new Map(tous.map(e=>[String(e.mat), e]));
      const pm = perimSql(B, P, "mat");
      /* correctif 42 : filtres salarié, type, période et site ; salariés sortis exclus des visites planifiées */
      let f = "", fa = [];
      if (q.mat){ f += " AND mat=?"; fa.push(String(q.mat).slice(0, 40)); }
      if (TYPES.indexOf(q.type) >= 0){ f += " AND type=?"; fa.push(q.type); }
      if (dateOk(q.du)){ f += " AND COALESCE(realisee_le, prevue_le)>=?"; fa.push(q.du); } if (dateOk(q.au)){ f += " AND COALESCE(realisee_le, prevue_le)<=?"; fa.push(q.au); }
      if (q.site){ const ls = listeSql(B, "mat", tous.filter(e=>e.siteId === String(q.site)).map(e=>String(e.mat))); f += ls.sql; fa.push(...ls.a); }
      const so = st === "planifiee" ? await sortisSql("mat") : {sql:"", a:[]};
      let compteurs = null, etat = "", ea = [];
      if (st === "planifiee"){
        const c = await B.get("SELECT COUNT(*) total, SUM(CASE WHEN prevue_le<? THEN 1 ELSE 0 END) retard, SUM(CASE WHEN prevue_le>=? AND prevue_le<=? THEN 1 ELSE 0 END) proche, SUM(CASE WHEN substr(prevue_le,1,7)=? THEN 1 ELSE 0 END) mois FROM med_visites WHERE statut='planifiee'"+so.sql+pm.sql, a, a, s7, mois, ...so.a, ...pm.a);
        compteurs = {total:Number(c.total)||0, retard:Number(c.retard)||0, proche:Number(c.proche)||0, mois:Number(c.mois)||0};
        if (q.etat === "retard"){ etat = " AND prevue_le<?"; ea = [a]; } else if (q.etat === "proche"){ etat = " AND prevue_le>=? AND prevue_le<=?"; ea = [a, s7]; }
      }
      const w = " WHERE statut=?"+etat+f+so.sql+pm.sql, aa = [st].concat(ea, fa, so.a, pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM med_visites"+w, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites"+w+" ORDER BY "+(st === "realisee" ? "realisee_le DESC, maj DESC" : st === "annulee" ? "maj DESC" : "prevue_le, mat")+", id LIMIT "+lim+" OFFSET "+off, ...aa);
      /* correctif 42 : motif d'annulation affiché dans la liste des visites annulées */
      const motifs = new Map();
      if (st === "annulee" && l.length){ const jl = listeSql(B, "objet_id", l.map(r=>r.id));
        (await B.all("SELECT objet_id, donnees FROM med_journal WHERE nature='annulation'"+jl.sql+" ORDER BY le", ...jl.a)).forEach(j=>{ const r = dechiffrer(j.donnees); try { motifs.set(j.objet_id, (JSON.parse(r.v || "{}").motif) || ""); } catch(e){} }); }
      return json(res, 200, {total, offset:off, limit:lim, compteurs, droits, lignes:l.map(r=>Object.assign(r, {nom:nomDe(emps.get(r.mat))}, st === "annulee" ? {motif:motifs.get(r.id) || ""} : {}))});
    }
    if (p === "/api/v1/medical/visites" && req.method === "POST"){
      if (!dr.planifier) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), type = TYPES.indexOf(b.type) >= 0 ? b.type : null, d = b.prevueLe;
      if (!mat || !type || !dateOk(d)) return err(400, "planif");
      const e = dans(P, mat) ? await empDe(mat) : null; if (!e) return err(404, "salarie");
      if (e.sortie && e.sortie < auj()) return err(409, "sorti", {d:jj(e.sortie)});
      if (e.sortie && d > e.sortie) return err(400, "apresSortie", {d:jj(e.sortie)});
      if (d < auj()) return err(400, "passee");
      const i = id("mv");
      /* correctif 40 : une seule visite planifiée par salarié et par type, sous verrou (PostgreSQL) ; correctif 42 : une seule
         visite d'embauche réalisée par entrée */
      const r = await tx(async ()=>{ await verrou("med:"+mat);
        const deja = await B.get("SELECT prevue_le FROM med_visites WHERE mat=? AND type=? AND statut='planifiee'", mat, type);
        if (deja) throw ko(409, "doublon", {t:lib("type", type), d:jj(deja.prevue_le)});
        if (type === "embauche"){ const emb = await B.get("SELECT realisee_le FROM med_visites WHERE mat=? AND type='embauche' AND statut='realisee' AND realisee_le>=? ORDER BY realisee_le DESC", mat, e.entree ? ajoutJours(e.entree, -60) : "0000");
          if (emb) throw ko(409, "embaucheFaite", {d:jj(emb.realisee_le)}); }
        await B.run("INSERT INTO med_visites(id,mat,type,prevue_le,statut,maj,par) VALUES(?,?,?,?,?,?,?)", i, mat, type, d, "planifiee", maint(), C.login); });
      if (r) return r;
      await audit(C.login, "medical.visite.planifiee", mat, ip); return json(res, 200, {ok:true, id:i});
    }
    const mv = /^\/api\/v1\/medical\/visites\/([^/]+)\/(realiser|annuler|reporter|rectifier|imprime)$/.exec(p);
    if (mv && req.method === "POST"){
      const vid = mv[1], act = mv[2], b = await corpsJson(req);
      const v0 = await B.get("SELECT mat, statut FROM med_visites WHERE id=?", vid); if (!v0 || !dans(P, v0.mat)) return err(404, "visite");
      /* correctif 42 : droits par opération — résultat (réaliser, rectifier) : validation ; annulation d'une visite réalisée :
         supprimer ; impression : imprimer ; planification (reporter, annuler) : modifier */
      if (act === "imprime"){ if (!dr.imprimer) return refuse(); if (v0.statut !== "realisee") return err(409, "pasRealiseeImp"); await audit(C.login, "medical.fiche.imprimee", v0.mat, ip); return json(res, 200, {ok:true}); }
      if (act === "realiser" || act === "rectifier"){ if (!dr.valider) return dr.modifier ? err(403, "valider") : refuse(); }
      else if (act === "annuler" && v0.statut === "realisee"){ if (!dr.supprimer) return refuse(); }
      else if (!dr.modifier) return refuse();
      const e = await empDe(v0.mat), a = auj();
      /* contrôles communs à la réalisation et à la rectification */
      const lireResultat = async (v) => {
        const d = b.realiseeLe == null || b.realiseeLe === "" ? a : b.realiseeLe;
        if (!dateOk(d) || d > a) throw ko(400, "dateRealisation");
        if (e && e.entree && d < ajoutJours(e.entree, -60)) throw ko(400, "avantEntree", {d:jj(e.entree)});
        if (e && e.sortie && d > e.sortie) throw ko(400, "apresSortieR", {d:jj(e.sortie)});
        /* la pré-reprise ne fixe pas l'aptitude : aptitude facultative */
        const aptitude = (b.aptitude == null || b.aptitude === "") && v.type === "pre_reprise" ? null : b.aptitude;
        if (aptitude !== null && APT.indexOf(aptitude) < 0) throw ko(400, "aptitude");
        const restr = txt(b, "restrictions", MAXT.restrictions), obs = txt(b, "observations", MAXT.observations);
        if (aptitude === "apte_restriction" && !restr) throw ko(400, "restrictions");
        if (restr && aptitude !== "apte_restriction") throw ko(400, "restrictionsHors");
        let prochaine = null;
        if (aptitude && aptitude !== "inapte" && v.type !== "pre_reprise"){
          const per = await periodicite(), max = ajoutMois(d, per);
          if (b.prochaineLe != null && b.prochaineLe !== ""){ if (!dateOk(b.prochaineLe) || b.prochaineLe <= d) throw ko(400, "prochaine"); if (b.prochaineLe > max) throw ko(400, "prochaineMax", {d:jj(max)}); prochaine = b.prochaineLe; }
          else prochaine = max;
        }
        return {d, aptitude, restr, obs, prochaine};
      };
      let rep = {ok:true};
      const r = await tx(async ()=>{ await verrou("med:"+v0.mat);
        const v = await B.get("SELECT * FROM med_visites WHERE id=?", vid); if (!v) throw ko(404, "visite");
        const avantV = () => ({realisee_le:v.realisee_le, aptitude:v.aptitude, restrictions:dechiffrer(v.restrictions).v, observations:dechiffrer(v.observations).v, prochaine_le:v.prochaine_le});
        if (act === "rectifier"){
          if (v.statut !== "realisee") throw ko(409, "pasRealisee");
          if (b.version !== ver(v, CH_V)) throw ko(409, "concurrence");
          const motif = txt(b, "motif", MAXT.motif); if (!motif) throw ko(400, "motif");
          const x = await lireResultat(v);
          /* correctif 42 : la date rectifiée reste entre la visite réalisée précédente et la suivante (une rectification
             d'une ancienne visite inversait l'aptitude courante) */
          const voisines = await B.all("SELECT id, realisee_le FROM med_visites WHERE mat=? AND statut='realisee' AND id<>? ORDER BY realisee_le, maj", v.mat, v.id);
          const prec = voisines.filter(z=>z.realisee_le < v.realisee_le || (z.realisee_le === v.realisee_le && z.id < v.id)).pop(), suiv = voisines.find(z=>z.realisee_le > v.realisee_le || (z.realisee_le === v.realisee_le && z.id > v.id));
          if ((prec && x.d < prec.realisee_le) || (suiv && x.d > suiv.realisee_le)) throw ko(400, "ordreVisites", {a:prec ? jj(prec.realisee_le) : "—", b:suiv ? jj(suiv.realisee_le) : jj(a)});
          await journal(v.id, "rectification", {motif, avant:avantV()});
          const n = await B.run("UPDATE med_visites SET realisee_le=?, aptitude=?, restrictions=?, observations=?, prochaine_le=?, maj=?, par=? WHERE id=? AND statut='realisee' AND maj=?",
            x.d, x.aptitude, chiffrer(x.restr), chiffrer(x.obs), x.prochaine, maint(), C.login, v.id, v.maj);
          if (!nchg(n)) throw ko(409, "concurrence");
          rep.prochaine = x.prochaine; return;
        }
        if (act === "annuler" && v.statut === "realisee"){
          if (b.version !== ver(v, CH_V)) throw ko(409, "concurrence");
          const motif = txt(b, "motif", MAXT.motif); if (!motif) throw ko(400, "motif");
          await journal(v.id, "annulation", {motif, avant:avantV()});
          const n = await B.run("UPDATE med_visites SET statut='annulee', maj=?, par=? WHERE id=? AND statut='realisee' AND maj=?", maint(), C.login, v.id, v.maj); if (!nchg(n)) throw ko(409, "concurrence"); return;
        }
        if (v.statut !== "planifiee") throw ko(409, "traitee");
        if (act === "annuler" || act === "reporter"){
          const motif = txt(b, "motif", MAXT.motif); if (!motif) throw ko(400, "motif");
          let nd = null; if (act === "reporter"){ nd = b.prevueLe; if (!dateOk(nd) || nd < a || nd === v.prevue_le) throw ko(400, "report"); if (e && e.sortie && nd > e.sortie) throw ko(400, "apresSortie", {d:jj(e.sortie)}); }
          await journal(v.id, act === "annuler" ? "annulation" : "report", {motif, avant:v.prevue_le, apres:nd});
          const n = act === "annuler" ? await B.run("UPDATE med_visites SET statut='annulee', maj=?, par=? WHERE id=? AND statut='planifiee'", maint(), C.login, v.id)
            : await B.run("UPDATE med_visites SET prevue_le=?, maj=?, par=? WHERE id=? AND statut='planifiee'", nd, maint(), C.login, v.id);
          if (!nchg(n)) throw ko(409, "concurrence"); return;
        }
        const x = await lireResultat(v);
        const n = await B.run("UPDATE med_visites SET statut='realisee', realisee_le=?, aptitude=?, restrictions=?, observations=?, prochaine_le=?, maj=?, par=? WHERE id=? AND statut='planifiee'",
          x.d, x.aptitude, chiffrer(x.restr), chiffrer(x.obs), x.prochaine, maint(), C.login, v.id);
        if (!nchg(n)) throw ko(409, "concurrence");
        rep.prochaine = x.prochaine;
      });
      if (r) return r;
      /* journal neutre : ni aptitude ni motif (données de santé) */
      await audit(C.login, {realiser:"medical.visite.realisee", annuler:"medical.visite.annulee", reporter:"medical.visite.reportee", rectifier:"medical.visite.rectifiee"}[act], v0.mat, ip);
      return json(res, 200, rep);
    }
    /* dossier médical d'un salarié (consultation tracée) */
    const md = /^\/api\/v1\/medical\/dossier\/([^/]+)$/.exec(p);
    if (md && req.method === "GET"){
      let mat; try { mat = decodeURIComponent(md[1]); } catch(e){ return err(404, "salarie"); }
      if (!dans(P, mat)) return err(404, "salarie");
      const e = await empDe(mat); if (!e) return err(404, "salarie");
      await tracerConsultation(C.login, mat, ip);
      let illisible = 0; const dz = (s, clair) => { const r = dechiffrer(s, clair); if (r.ko) illisible++; return r.v; };
      const vis = (await B.all("SELECT * FROM med_visites WHERE mat=? ORDER BY COALESCE(realisee_le, prevue_le) DESC, maj DESC", mat)).map(v=>Object.assign(v, {version:ver(v, CH_V), restrictions:dz(v.restrictions), observations:dz(v.observations)}));
      const mp = (await B.all("SELECT * FROM med_mp WHERE mat=? ORDER BY declaree_le DESC, maj DESC", mat)).map(z=>Object.assign(z, {version:ver(z, CH_MP), tableau:dz(z.tableau, true), observations:dz(z.observations)}));
      const ids = vis.map(v=>v.id).concat(mp.map(z=>z.id)), jr = ids.length ? listeSql(B, "objet_id", ids) : null;
      /* correctif 42 : valeurs précédentes renvoyées (rectification, annulation, statut de maladie professionnelle) */
      const journalL = jr ? (await B.all("SELECT objet_id, nature, le, par, donnees FROM med_journal WHERE 1=1"+jr.sql+" ORDER BY le DESC", ...jr.a)).map(j=>{ let d = {}; try { d = JSON.parse(dz(j.donnees) || "{}"); } catch(z){}
        return {visite:j.objet_id, nature:j.nature, le:j.le, par:j.par, motif:d.motif || "", avant:d.avant == null ? null : d.avant, apres:d.apres == null ? null : d.apres}; }) : [];
      const apt = (await aptitudes([mat])).get(mat) || null;
      return json(res, 200, {salarie:{mat:e.mat, nom:nomDe(e), poste:e.poste||"", entree:e.entree||"", sortie:e.sortie||""}, aptitude:apt, visites:vis, journal:journalL, maladiesPro:mp, illisible, droits});
    }
    /* maladies professionnelles — correctif 42 : tableau contrôlé, date ≥ entrée, doublon refusé sous verrou, création au
       statut « déclarée », transitions motivées, rectification et annulation */
    const lireMp = (b, e) => { const tableau = txt(b, "tableau", MAXT.tableau), obs = txt(b, "observations", MAXT.observations);
      if (!dateOk(b.declareeLe) || b.declareeLe > auj()) throw ko(400, "declaration");
      if (e.entree && b.declareeLe < e.entree) throw ko(400, "avantEntree", {d:jj(e.entree)});
      if (tableau && !TABLEAU.test(tableau)) throw ko(400, "tableau");
      return {d:b.declareeLe, tableau:tableau.toLowerCase().replace(/\s+/g, " "), obs}; };
    const doublonMp = async (mat, tableau, sauf) => { if (!tableau) return false;
      return (await B.all("SELECT id, tableau FROM med_mp WHERE mat=? AND statut<>'annulee' AND id<>?", mat, sauf || "")).some(z=>dechiffrer(z.tableau, true).v.toLowerCase() === tableau); };
    if (p === "/api/v1/medical/maladies-pro" && req.method === "POST"){
      if (!dr.declarer) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40); if (!mat) return err(400, "declaration");
      const e = dans(P, mat) ? await empDe(mat) : null; if (!e) return err(404, "salarie");
      const i = id("mp");
      const r = await tx(async ()=>{ const v = lireMp(b, e); await verrou("mp:"+mat); if (await doublonMp(mat, v.tableau)) throw ko(409, "mpDoublon");
        await B.run("INSERT INTO med_mp(id,mat,declaree_le,tableau,statut,observations,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, mat, v.d, chiffrer(v.tableau), "declaree", chiffrer(v.obs), maint(), C.login); });
      if (r) return r; await audit(C.login, "medical.dossier.complete", mat, ip); return json(res, 200, {ok:true, id:i});
    }
    const mm = /^\/api\/v1\/medical\/maladies-pro\/([^/]+)\/(statut|rectifier|annuler)$/.exec(p);
    if (mm && req.method === "POST"){
      const op = mm[2]; if (op === "annuler" ? !dr.supprimer : !dr.valider) return op !== "annuler" && dr.modifier ? err(403, "valider") : refuse();
      const b = await corpsJson(req);
      const z0 = await B.get("SELECT mat FROM med_mp WHERE id=?", mm[1]); if (!z0 || !dans(P, z0.mat)) return err(404, "introuvable");
      const e = await empDe(z0.mat) || {};
      const r = await tx(async ()=>{ await verrou("mp:"+z0.mat);
        const z = await B.get("SELECT * FROM med_mp WHERE id=?", mm[1]); if (!z) throw ko(404, "introuvable"); if (z.statut === "annulee") throw ko(409, "mpAnnulee");
        if (b.version !== ver(z, CH_MP)) throw ko(409, "concurrence");
        const motif = txt(b, "motif", MAXT.motif);
        if (op === "statut"){ const st = b.statut; if (MPS.indexOf(st) < 0) throw ko(400, "mpStatut"); if (st === z.statut) return;
          if (z.statut !== "declaree" && !motif) throw ko(400, "mpTransition");
          await journal(z.id, "mp.statut", {motif, avant:{statut:z.statut}, apres:st});
          if (!nchg(await B.run("UPDATE med_mp SET statut=?, maj=?, par=? WHERE id=? AND maj=?", st, maint(), C.login, z.id, z.maj))) throw ko(409, "concurrence"); return; }
        if (!motif) throw ko(400, "motif");
        if (op === "annuler"){ await journal(z.id, "mp.annulation", {motif, avant:{statut:z.statut}});
          if (!nchg(await B.run("UPDATE med_mp SET statut='annulee', maj=?, par=? WHERE id=? AND maj=?", maint(), C.login, z.id, z.maj))) throw ko(409, "concurrence"); return; }
        const v = lireMp(b, e); if (await doublonMp(z.mat, v.tableau, z.id)) throw ko(409, "mpDoublon");
        await journal(z.id, "mp.rectification", {motif, avant:{declaree_le:z.declaree_le, tableau:dechiffrer(z.tableau, true).v, observations:dechiffrer(z.observations).v}});
        if (!nchg(await B.run("UPDATE med_mp SET declaree_le=?, tableau=?, observations=?, maj=?, par=? WHERE id=? AND maj=?", v.d, chiffrer(v.tableau), chiffrer(v.obs), maint(), C.login, z.id, z.maj))) throw ko(409, "concurrence"); });
      if (r) return r; await audit(C.login, "medical.dossier.complete", z0.mat, ip); return json(res, 200, {ok:true});
    }
    /* export réservé au rôle médical (droit d'export), tracé ; dates jj/mm/aaaa et libellés dans la langue de l'utilisateur ;
       correctif 42 : période bornée à deux ans (date de la visite), filtres salarié et type, période notée au journal */
    if (p === "/api/v1/medical/export" && req.method === "GET"){
      if (!dr.exporter) return refuse();
      const au = q.au || auj(), du = q.du || (dateOk(au) ? ajoutJours(au, -364) : ""); if (!dateOk(au) || !dateOk(du) || du > au || ajoutJours(du, 731) < au) return err(400, "periode");
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e])), pm = perimSql(B, P, "mat");
      let f = "", fa = []; if (q.mat){ f += " AND mat=?"; fa.push(String(q.mat).slice(0, 40)); } if (TYPES.indexOf(q.type) >= 0){ f += " AND type=?"; fa.push(q.type); }
      const l = await B.all("SELECT mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites WHERE COALESCE(realisee_le, prevue_le)>=? AND COALESCE(realisee_le, prevue_le)<=?"+f+pm.sql+" ORDER BY mat, COALESCE(realisee_le, prevue_le)", du, au, ...fa, ...pm.a);
      await audit(C.login, "medical.export", l.length+" visite(s) du "+jj(du)+" au "+jj(au), ip);
      const cel = c => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; };
      const csv = [LIB.entete[L].map(cel).join(";")].concat(l.map(r=>[r.mat, nomDe(emps.get(r.mat)), lib("type", r.type), jj(r.prevue_le), jj(r.realisee_le), lib("statut", r.statut), r.aptitude ? lib("aptitude", r.aptitude) : "", jj(r.prochaine_le)].map(cel).join(";"))).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-suivi-medical.csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); return res.end("﻿"+csv);
    }
    return err(404, "introuvable");
    }
  }
  return {traiter, aTraiter, fiche360, indicateurs, service};
}
module.exports = {ddl, tables, creer};
