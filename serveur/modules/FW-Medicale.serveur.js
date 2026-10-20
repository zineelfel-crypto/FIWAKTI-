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
   messages trilingues, export traduit, jour local. */
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
     exporter) ; vue RH (droit EMP) limitée aux aptitudes ; détail médical : droit MED et accès aux données sensibles */
  function droitsEcran(admin, P){
    const re = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0), rm = rangMed(P);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).medical, act = (pr.actions || {}).medical || {};
    const voir = (re >= 1 || rm >= 1) && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    const med = voir && rm >= 1, sens = med && !PERIM.masquePerso(P);
    return {re, rm, voir, med, sens, planifier:sens && !ro && rm >= 2 && act.creer !== false, modifier:sens && !ro && rm >= 2 && act.modifier !== false,
      declarer:sens && !ro && rm >= 2 && act.creer !== false, parametrer:sens && !ro && rm >= 3 && act.modifier !== false, exporter:sens && rm >= 2 && act.exporter !== false};
  }
  async function periodicite(){ const r = await B.get("SELECT v FROM med_parametres WHERE k='periodicite_mois'"); const n = Number(r && r.v); return [6, 12, 24, 36].indexOf(n) >= 0 ? n : 12; }
  /* état d'aptitude courant par salarié — sans restriction ni observation. Correctif 40 : dernière visite selon la date
     de réalisation puis la saisie (deux visites le même jour), la pré-reprise ne fixe pas l'aptitude, un inapte n'a pas
     de prochaine visite périodique ; mats = null : tout le périmètre P */
  async function aptitudes(mats, P){
    const out = new Map(), ajoute = r => out.set(String(r.mat), {aptitude:r.aptitude, derniere:r.realisee_le, prochaine:r.aptitude === "inapte" ? null : r.prochaine_le, type:r.type});
    const sql = "SELECT mat, aptitude, realisee_le, prochaine_le, type FROM med_visites WHERE statut='realisee' AND type<>'pre_reprise'";
    if (mats === null){ const pm = perimSql(B, P, "mat"); (await B.all(sql+pm.sql+" ORDER BY mat, realisee_le, maj", ...pm.a)).forEach(ajoute); return out; }
    for (let i = 0; i < mats.length; i += 1000){ const l = listeSql(B, "mat", mats.slice(i, i+1000)); (await B.all(sql+l.sql+" ORDER BY mat, realisee_le, maj", ...l.a)).forEach(ajoute); }
    return out;
  }
  /* première visite planifiée de chaque salarié du périmètre */
  async function planifiees(P){ const pm = perimSql(B, P, "mat"), m = new Map();
    (await B.all("SELECT mat, prevue_le, type FROM med_visites WHERE statut='planifiee'"+pm.sql+" ORDER BY mat, prevue_le DESC", ...pm.a)).forEach(r=>m.set(String(r.mat), {prevue:r.prevue_le, type:r.type})); return m; }
  const echue = (v, a) => !v || (v.aptitude !== "inapte" && (!v.prochaine || v.prochaine <= a));
  /* indicateurs pour le pilotage : par service, nombres et taux seulement, masqués sous 5 salariés */
  async function indicateurs(emps, du, au){
    const per = await periodicite(), apt = await aptitudes(emps.map(e=>String(e.mat))), ref = await (D.referentielLecture || D.referentiel)() || {};
    const nomDept = new Map((ref.depts||[]).map(d=>[d.id, d.nom])), parDept = {};
    const visites = []; const mats = emps.map(e=>String(e.mat));
    for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, type, realisee_le FROM med_visites WHERE statut='realisee' AND mat IN ("+l.map(()=>"?").join(",")+")", ...l)).forEach(v=>visites.push(v)); }
    const vParMat = {}; visites.forEach(v=>{ (vParMat[v.mat] = vParMat[v.mat] || []).push(v); });
    const mp = []; for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, statut FROM med_mp WHERE declaree_le>=? AND declaree_le<=? AND mat IN ("+l.map(()=>"?").join(",")+")", du, au, ...l)).forEach(x=>mp.push(x)); }
    const mpParMat = {}; mp.forEach(x=>{ (mpParMat[x.mat] = mpParMat[x.mat] || []).push(x); });
    emps.forEach(e=>{
      const k = e.deptId || "", x = parDept[k] || (parDept[k] = {service:nomDept.get(k) || "—", effectif:0, aJour:0, periodiquesPeriode:0, embauches:0, embauchesVisite:0, mpDeclarees:0, mpReconnues:0});
      const actif = (!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au); if (!actif) return;
      x.effectif++;
      const a = apt.get(String(e.mat)); if (a && a.derniere && a.derniere >= ajoutMois(au, -per)) x.aJour++;
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
    const lignes = Object.values(parDept).filter(x=>x.effectif).sort((a, b)=>a.service.localeCompare(b.service)).map(x=>x.effectif < SEUIL
      ? {service:x.service, effectif:x.effectif, masque:true}
      : petits({service:x.service, effectif:x.effectif, tauxPeriodiquesAJour:r1(100 * x.aJour / x.effectif), periodiquesPeriode:x.periodiquesPeriode, embauches:x.embauches,
         tauxVisitesEmbauche:x.embauches ? r1(100 * x.embauchesVisite / x.embauches) : null, mpDeclarees:x.mpDeclarees, mpReconnues:x.mpReconnues}));
    const T = Object.values(parDept).reduce((s, x)=>({effectif:s.effectif + x.effectif, aJour:s.aJour + x.aJour, emb:s.emb + x.embauches, embV:s.embV + x.embauchesVisite, mp:s.mp + x.mpDeclarees, mpR:s.mpR + x.mpReconnues, per:s.per + x.periodiquesPeriode}), {effectif:0, aJour:0, emb:0, embV:0, mp:0, mpR:0, per:0});
    return {periodiciteMois:per, seuilMasquage:SEUIL, total:T.effectif < SEUIL ? {masque:true} : petits({tauxPeriodiquesAJour:r1(100 * T.aJour / T.effectif), periodiquesPeriode:T.per, embauches:T.emb,
      tauxVisitesEmbauche:T.emb ? r1(100 * T.embV / T.emb) : null, mpDeclarees:T.mp, mpReconnues:T.mpR}), parService:lignes};
  }
  /* correctif 40 : « À traiter » — salariés déjà planifiés exclus, visites planifiées en retard, nouveaux salariés sans
     aucune visite (plus seulement les 90 derniers jours) ; matrice de l'écran et accès sensible appliqués */
  async function aTraiter(x){
    const out = [], a = auj(), dr = droitsEcran(x.admin, x.P);
    if (!dr.planifier && !dr.modifier) return out;
    const emps = (await D.employes()).filter(e=>(!e.sortie || e.sortie >= a) && dans(x.P, e.mat)), apt = await aptitudes(null, x.P), plan = await planifiees(x.P);
    const libres = emps.filter(e=>!plan.has(String(e.mat)));
    const sansEmb = libres.filter(e=>!apt.has(String(e.mat))).length;
    const dues = libres.filter(e=>{ const v = apt.get(String(e.mat)); return v && v.aptitude !== "inapte" && v.prochaine && v.prochaine <= ajoutJours(a, 30); }).length;
    const pm = perimSql(B, x.P, "mat"), retard = Number((await B.get("SELECT COUNT(*) n FROM med_visites WHERE statut='planifiee' AND prevue_le<?"+pm.sql, a, ...pm.a)).n);
    if (retard) out.push({domaine:"sante", cle:"med-retard", nombre:retard, urgence:2, vue:"medical"});
    if (sansEmb) out.push({domaine:"sante", cle:"med-embauche", nombre:sansEmb, urgence:2, vue:"medical"});
    if (dues) out.push({domaine:"sante", cle:"med-periodiques", nombre:dues, urgence:1, vue:"medical"});
    /* correctif 41 : reprise après un arrêt pour accident (FW-HSE) — fin d'arrêt passée ou dans les 7 jours (60 derniers
       jours au plus), aucune visite de reprise ou de pré-reprise planifiée ou réalisée depuis l'accident */
    if ((o.moduleActif || (()=>false))("FW-HSE")) try {
      const pa = perimSql(B, x.P, "mat"), arr = await B.all("SELECT mat, d, jours_arret FROM hse_evenements WHERE type IN ('accident','accident_trajet') AND arret=1 AND jours_arret>0 AND statut<>'annule' AND d>=?"+pa.sql, ajoutJours(a, -365), ...pa.a);
      const sans = new Set(), presents = new Set(emps.map(z=>String(z.mat)));
      for (const r of arr){ const fin = ajoutJours(r.d, Number(r.jours_arret)); if (fin > ajoutJours(a, 7) || fin < ajoutJours(a, -60) || sans.has(String(r.mat))) continue;
        if (!presents.has(String(r.mat))) continue;
        if (!await B.get("SELECT 1 FROM med_visites WHERE mat=? AND type IN ('reprise','pre_reprise') AND statut<>'annulee' AND COALESCE(realisee_le, prevue_le)>=?", String(r.mat), r.d)) sans.add(String(r.mat)); }
      if (sans.size) out.push({domaine:"sante", cle:"med-reprise", nombre:sans.size, urgence:2, vue:"medical"});
    } catch(e){}
    return out;
  }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || !dans(x.P, x.mat)) return null;
    const v = (await aptitudes([String(x.mat)])).get(String(x.mat));
    return {cle:"medical", vue:"medical", lignes:[{k:v && v.aptitude ? "medApt_"+v.aptitude : "medAptInconnue", v:"", alerte:!v || v.aptitude !== "apte"},
      {k:"medProchaine", v:v && v.prochaine ? jj(v.prochaine) : "—", alerte:!!(v && v.aptitude !== "inapte" && (!v.prochaine || v.prochaine <= auj()))}]};
  }
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
    const droits = {medical:dr.med, sensibles:dr.sens, planifier:dr.planifier, modifier:dr.modifier, declarer:dr.declarer, parametrer:dr.parametrer, exporter:dr.exporter};
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); return null; } catch(e){ if (e && e.st && MSG[e.message]) return err(e.st, e.message, e.v); if (/unique|duplicate|constraint/i.test((e && e.message) || "")) return err(409, "concurrence"); throw e; } };
    const empDe = async mat => (await D.employes()).find(e=>String(e.mat) === String(mat));
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
    if (p === "/api/v1/medical/parametres" && req.method === "GET") return json(res, 200, {periodiciteMois:await periodicite(), droits});
    if (p === "/api/v1/medical/parametres" && req.method === "POST"){
      if (!dr.parametrer) return dr.rm < 3 ? err(403, "medecin") : refuse();
      const n = Number((await corpsJson(req)).periodiciteMois);
      if ([6, 12, 24, 36].indexOf(n) < 0) return err(400, "periodicite");
      await B.run("INSERT INTO med_parametres(k,v) VALUES('periodicite_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n)); await audit(C.login, "medical.periodicite", n+" mois", ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/medical/visites" && req.method === "GET"){
      const st = ["planifiee","realisee","annulee"].indexOf(q.statut) >= 0 ? q.statut : "planifiee", a = auj(), s7 = ajoutJours(a, 7), mois = a.slice(0, 7);
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      const pm = perimSql(B, P, "mat");
      /* correctif 40 : compteurs calculés par le serveur sur toutes les visites planifiées (avant : sur les 100 premières) */
      let compteurs = null, etat = "", ea = [];
      if (st === "planifiee"){
        const c = await B.get("SELECT COUNT(*) total, SUM(CASE WHEN prevue_le<? THEN 1 ELSE 0 END) retard, SUM(CASE WHEN prevue_le>=? AND prevue_le<=? THEN 1 ELSE 0 END) proche, SUM(CASE WHEN substr(prevue_le,1,7)=? THEN 1 ELSE 0 END) mois FROM med_visites WHERE statut='planifiee'"+pm.sql, a, a, s7, mois, ...pm.a);
        compteurs = {total:Number(c.total)||0, retard:Number(c.retard)||0, proche:Number(c.proche)||0, mois:Number(c.mois)||0};
        if (q.etat === "retard"){ etat = " AND prevue_le<?"; ea = [a]; } else if (q.etat === "proche"){ etat = " AND prevue_le>=? AND prevue_le<=?"; ea = [a, s7]; }
      }
      const aa = [st].concat(ea, pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM med_visites WHERE statut=?"+etat+pm.sql, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites WHERE statut=?"+etat+pm.sql+" ORDER BY "+(st === "realisee" ? "realisee_le DESC, maj DESC" : st === "annulee" ? "maj DESC" : "prevue_le, mat")+", id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, offset:off, limit:lim, compteurs, droits, lignes:l.map(r=>Object.assign(r, {nom:nomDe(emps.get(r.mat))}))});
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
      /* correctif 40 : une seule visite planifiée par salarié et par type, sous verrou (PostgreSQL) */
      const r = await tx(async ()=>{ await verrou("med:"+mat);
        const deja = await B.get("SELECT prevue_le FROM med_visites WHERE mat=? AND type=? AND statut='planifiee'", mat, type);
        if (deja) throw ko(409, "doublon", {t:lib("type", type), d:jj(deja.prevue_le)});
        await B.run("INSERT INTO med_visites(id,mat,type,prevue_le,statut,maj,par) VALUES(?,?,?,?,?,?,?)", i, mat, type, d, "planifiee", maint(), C.login); });
      if (r) return r;
      await audit(C.login, "medical.visite.planifiee", mat, ip); return json(res, 200, {ok:true, id:i});
    }
    const mv = /^\/api\/v1\/medical\/visites\/([^/]+)\/(realiser|annuler|reporter|rectifier)$/.exec(p);
    if (mv && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const vid = mv[1], act = mv[2], b = await corpsJson(req);
      const v0 = await B.get("SELECT mat FROM med_visites WHERE id=?", vid); if (!v0 || !dans(P, v0.mat)) return err(404, "visite");
      const e = await empDe(v0.mat), a = auj();
      /* contrôles communs à la réalisation et à la rectification */
      const lireResultat = async (v) => {
        const d = b.realiseeLe == null || b.realiseeLe === "" ? a : b.realiseeLe;
        if (!dateOk(d) || d > a) throw ko(400, "dateRealisation");
        if (e && e.entree && d < ajoutJours(e.entree, -60)) throw ko(400, "avantEntree", {d:jj(e.entree)});
        if (APT.indexOf(b.aptitude) < 0) throw ko(400, "aptitude");
        const restr = txt(b, "restrictions", MAXT.restrictions), obs = txt(b, "observations", MAXT.observations);
        if (b.aptitude === "apte_restriction" && !restr) throw ko(400, "restrictions");
        let prochaine = null;
        if (b.aptitude !== "inapte" && v.type !== "pre_reprise"){
          if (b.prochaineLe != null && b.prochaineLe !== ""){ if (!dateOk(b.prochaineLe) || b.prochaineLe <= d) throw ko(400, "prochaine"); prochaine = b.prochaineLe; }
          else prochaine = ajoutMois(d, await periodicite());
        }
        return {d, restr, obs, prochaine};
      };
      let rep = {ok:true};
      const r = await tx(async ()=>{ await verrou("med:"+v0.mat);
        const v = await B.get("SELECT * FROM med_visites WHERE id=?", vid); if (!v) throw ko(404, "visite");
        if (act === "rectifier"){
          if (v.statut !== "realisee") throw ko(409, "pasRealisee");
          const motif = txt(b, "motif", MAXT.motif); if (!motif) throw ko(400, "motif");
          const x = await lireResultat(v);
          await B.run("INSERT INTO med_journal(id,objet_id,nature,le,par,donnees) VALUES(?,?,?,?,?,?)", id("mj"), v.id, "rectification", maint(), C.login,
            chiffrer(JSON.stringify({motif, avant:{realisee_le:v.realisee_le, aptitude:v.aptitude, restrictions:v.restrictions, observations:v.observations, prochaine_le:v.prochaine_le}})));
          const n = await B.run("UPDATE med_visites SET realisee_le=?, aptitude=?, restrictions=?, observations=?, prochaine_le=?, maj=?, par=? WHERE id=? AND statut='realisee' AND maj=?",
            x.d, b.aptitude, chiffrer(x.restr), chiffrer(x.obs), x.prochaine, maint(), C.login, v.id, v.maj);
          if (!(n && (n.changes || n.rowCount || n.n))) throw ko(409, "concurrence");
          rep.prochaine = x.prochaine; return;
        }
        if (v.statut !== "planifiee") throw ko(409, "traitee");
        if (act === "annuler" || act === "reporter"){
          const motif = txt(b, "motif", MAXT.motif); if (!motif) throw ko(400, "motif");
          let nd = null; if (act === "reporter"){ nd = b.prevueLe; if (!dateOk(nd) || nd < a || nd === v.prevue_le) throw ko(400, "report"); if (e && e.sortie && nd > e.sortie) throw ko(400, "apresSortie", {d:jj(e.sortie)}); }
          await B.run("INSERT INTO med_journal(id,objet_id,nature,le,par,donnees) VALUES(?,?,?,?,?,?)", id("mj"), v.id, act === "annuler" ? "annulation" : "report", maint(), C.login, chiffrer(JSON.stringify({motif, avant:v.prevue_le, apres:nd})));
          const n = act === "annuler" ? await B.run("UPDATE med_visites SET statut='annulee', maj=?, par=? WHERE id=? AND statut='planifiee'", maint(), C.login, v.id)
            : await B.run("UPDATE med_visites SET prevue_le=?, maj=?, par=? WHERE id=? AND statut='planifiee'", nd, maint(), C.login, v.id);
          if (!(n && (n.changes || n.rowCount || n.n))) throw ko(409, "concurrence"); return;
        }
        const x = await lireResultat(v);
        const n = await B.run("UPDATE med_visites SET statut='realisee', realisee_le=?, aptitude=?, restrictions=?, observations=?, prochaine_le=?, maj=?, par=? WHERE id=? AND statut='planifiee'",
          x.d, b.aptitude, chiffrer(x.restr), chiffrer(x.obs), x.prochaine, maint(), C.login, v.id);
        if (!(n && (n.changes || n.rowCount || n.n))) throw ko(409, "concurrence");
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
      const vis = (await B.all("SELECT * FROM med_visites WHERE mat=? ORDER BY COALESCE(realisee_le, prevue_le) DESC, maj DESC", mat)).map(v=>Object.assign(v, {restrictions:dz(v.restrictions), observations:dz(v.observations)}));
      const ids = vis.map(v=>v.id), jr = ids.length ? listeSql(B, "objet_id", ids) : null;
      const journal = jr ? (await B.all("SELECT objet_id, nature, le, par, donnees FROM med_journal WHERE 1=1"+jr.sql+" ORDER BY le DESC", ...jr.a)).map(j=>{ let d = {}; try { d = JSON.parse(dz(j.donnees) || "{}"); } catch(z){}
        return {visite:j.objet_id, nature:j.nature, le:j.le, par:j.par, motif:d.motif || "", avant:typeof d.avant === "string" ? d.avant : null, apres:d.apres || null}; }) : [];
      const mp = (await B.all("SELECT * FROM med_mp WHERE mat=? ORDER BY declaree_le DESC, maj DESC", mat)).map(z=>Object.assign(z, {tableau:dz(z.tableau, true), observations:dz(z.observations)}));
      const apt = (await aptitudes([mat])).get(mat) || null;
      return json(res, 200, {salarie:{mat:e.mat, nom:nomDe(e), poste:e.poste||"", entree:e.entree||"", sortie:e.sortie||""}, aptitude:apt, visites:vis, journal, maladiesPro:mp, illisible, droits});
    }
    if (p === "/api/v1/medical/maladies-pro" && req.method === "POST"){
      if (!dr.declarer) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), tableau = txt(b, "tableau", MAXT.tableau), obs = txt(b, "observations", MAXT.observations);
      if (!mat || !dateOk(b.declareeLe) || b.declareeLe > auj()) return err(400, "declaration");
      const st = b.statut == null || b.statut === "" ? "declaree" : b.statut; if (MPS.indexOf(st) < 0) return err(400, "mpStatut");
      const e = dans(P, mat) ? await empDe(mat) : null; if (!e) return err(404, "salarie");
      const i = id("mp"); await B.run("INSERT INTO med_mp(id,mat,declaree_le,tableau,statut,observations,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, mat, b.declareeLe, chiffrer(tableau), st, chiffrer(obs), maint(), C.login);
      await audit(C.login, "medical.dossier.complete", mat, ip); return json(res, 200, {ok:true, id:i});
    }
    const mm = /^\/api\/v1\/medical\/maladies-pro\/([^/]+)\/statut$/.exec(p);
    if (mm && req.method === "POST"){ if (!dr.modifier) return refuse();
      const st = (await corpsJson(req)).statut; if (MPS.indexOf(st) < 0) return err(400, "mpStatut");
      const z = await B.get("SELECT mat, statut FROM med_mp WHERE id=?", mm[1]); if (!z || !dans(P, z.mat)) return err(404, "introuvable");
      if (z.statut === st) return json(res, 200, {ok:true});
      const n = await B.run("UPDATE med_mp SET statut=?, maj=?, par=? WHERE id=? AND statut=?", st, maint(), C.login, mm[1], z.statut);
      if (!(n && (n.changes || n.rowCount || n.n))) return err(409, "concurrence");
      await audit(C.login, "medical.dossier.complete", z.mat, ip); return json(res, 200, {ok:true}); }
    /* export réservé au rôle médical (droit d'export), tracé ; dates jj/mm/aaaa et libellés dans la langue de l'utilisateur */
    if (p === "/api/v1/medical/export" && req.method === "GET"){
      if (!dr.exporter) return refuse();
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e])), pm = perimSql(B, P, "mat");
      const l = await B.all("SELECT mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites WHERE 1=1"+pm.sql+" ORDER BY mat, COALESCE(realisee_le, prevue_le)", ...pm.a);
      await audit(C.login, "medical.export", l.length+" visite(s)", ip);
      const cel = c => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; };
      const csv = [LIB.entete[L].map(cel).join(";")].concat(l.map(r=>[r.mat, nomDe(emps.get(r.mat)), lib("type", r.type), jj(r.prevue_le), jj(r.realisee_le), lib("statut", r.statut), r.aptitude ? lib("aptitude", r.aptitude) : "", jj(r.prochaine_le)].map(cel).join(";"))).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-suivi-medical.csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); return res.end("﻿"+csv);
    }
    return err(404, "introuvable");
    }
  }
  return {traiter, aTraiter, fiche360, indicateurs};
}
module.exports = {ddl, tables, creer};
