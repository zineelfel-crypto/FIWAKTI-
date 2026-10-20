/* FW-Recrutement — partie serveur. Postes ouverts, candidats, candidatures et étapes, entretiens, décisions, CV chiffrés.
   Listes paginées côté serveur ; historique des étapes en ajout seul ; décision finale réservée au droit « validation »
   (jamais automatique) ; données des candidats conservées une durée limitée (purge des candidatures clôturées). */
"use strict";
const crypto = require("crypto");
const T_TXT = "TEXT";
const def = (pg) => [
  "CREATE TABLE IF NOT EXISTS rec_postes (id TEXT PRIMARY KEY, intitule TEXT NOT NULL, fonction TEXT, site_id TEXT, dept_id TEXT, nb INTEGER NOT NULL DEFAULT 1, statut TEXT NOT NULL, description TEXT, ouvert_le TEXT NOT NULL, clos_le TEXT, par TEXT)",
  "CREATE TABLE IF NOT EXISTS rec_candidats (id TEXT PRIMARY KEY, nom TEXT NOT NULL, prenom TEXT, email TEXT, tel TEXT, source TEXT, cree TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS rec_candidats_nom ON rec_candidats(nom, prenom)",
  "CREATE TABLE IF NOT EXISTS rec_candidatures (id TEXT PRIMARY KEY, poste_id TEXT NOT NULL, candidat_id TEXT NOT NULL, etape TEXT NOT NULL, note INTEGER, maj TEXT NOT NULL, cree TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS rec_candidatures_cle ON rec_candidatures(poste_id, candidat_id)",
  "CREATE INDEX IF NOT EXISTS rec_candidatures_etape ON rec_candidatures(poste_id, etape)",
  /* correctif 34 : index par candidat (liste des candidats d'un compte limité et purge : 72 s → 30 ms à 30 000
     candidats, le serveur entier était bloqué pendant la requête) et par candidature pour les entretiens */
  "CREATE INDEX IF NOT EXISTS rec_candidatures_cand ON rec_candidatures(candidat_id)",
  "CREATE INDEX IF NOT EXISTS rec_candidats_email ON rec_candidats(lower(email))",
  "CREATE TABLE IF NOT EXISTS rec_historique (id TEXT PRIMARY KEY, candidature_id TEXT NOT NULL, de TEXT, vers TEXT NOT NULL, par TEXT, motif TEXT, ts TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS rec_historique_cand ON rec_historique(candidature_id)",
  "CREATE TABLE IF NOT EXISTS rec_entretiens (id TEXT PRIMARY KEY, candidature_id TEXT NOT NULL, d TEXT NOT NULL, intervenant TEXT, avis TEXT, note INTEGER, par TEXT, cree TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS rec_entretiens_cand ON rec_entretiens(candidature_id)",
  "CREATE TABLE IF NOT EXISTS rec_cv (candidat_id TEXT PRIMARY KEY, nom_fichier TEXT, type TEXT, taille INTEGER, donnees TEXT NOT NULL, cree TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS rec_parametres (k TEXT PRIMARY KEY, v TEXT)",
  "CREATE TABLE IF NOT EXISTS rec_embauches (candidature_id TEXT PRIMARY KEY, mat TEXT NOT NULL, le TEXT NOT NULL, par TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS rec_embauches_mat ON rec_embauches(mat)",
  /* correctif 35 : historique toujours immuable, sauf l'effacement du motif (droit à l'effacement : un motif libre peut
     contenir des données personnelles) — seule la mise à NULL du motif est admise, tout le reste est refusé */
  ...(pg ? ["CREATE OR REPLACE FUNCTION fiwakti_rec_hist_immuable() RETURNS trigger AS $$ BEGIN IF TG_OP = 'UPDATE' AND NEW.motif IS NULL AND (NEW.id, NEW.candidature_id, NEW.de, NEW.vers, NEW.par, NEW.ts) IS NOT DISTINCT FROM (OLD.id, OLD.candidature_id, OLD.de, OLD.vers, OLD.par, OLD.ts) THEN RETURN NEW; END IF; RAISE EXCEPTION 'historique non modifiable'; END $$ LANGUAGE plpgsql",
            "CREATE OR REPLACE TRIGGER rec_historique_immuable BEFORE UPDATE OR DELETE ON rec_historique FOR EACH ROW EXECUTE FUNCTION fiwakti_rec_hist_immuable()"]
         : ["DROP TRIGGER IF EXISTS rec_historique_maj",
            "CREATE TRIGGER IF NOT EXISTS rec_historique_maj2 BEFORE UPDATE ON rec_historique WHEN NOT (NEW.motif IS NULL AND NEW.id = OLD.id AND NEW.candidature_id = OLD.candidature_id AND NEW.de IS OLD.de AND NEW.vers = OLD.vers AND NEW.par IS OLD.par AND NEW.ts = OLD.ts) BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END",
            "CREATE TRIGGER IF NOT EXISTS rec_historique_sup BEFORE DELETE ON rec_historique BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END"])
];
const ddl = {pg:def(true), sqlite:def(false)};
const tables = {rec_parametres:"k", rec_embauches:"candidature_id", rec_postes:"id", rec_candidats:"id", rec_candidatures:"id", rec_historique:"id", rec_entretiens:"id", rec_cv:"candidat_id"};
/* étapes et transitions permises (la décision finale « retenu » exige le droit de validation) */
const ETAPES = ["recue", "preselection", "entretien", "decision", "retenu", "refuse"];
/* refuse → recue : réexamen d'un refus ; retenu → refuse (correctif 35) : désistement, tant qu'aucune embauche n'est
   enregistrée. Les deux sont des décisions (droit de validation et motif). */
const SUIVANTES = {recue:["preselection","refuse"], preselection:["entretien","refuse"], entretien:["decision","refuse"], decision:["retenu","refuse"], retenu:["refuse"], refuse:["recue"]};
function creer(o){
  const {B, D, audit} = o, coffre = o.coffre;
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  /* v56.23 : jamais de clé de secours prévisible — sans coffre, le chiffrement échoue (fail closed) */
  const cle = () => { if (!coffre || typeof coffre.cle !== "function") throw new Error("Coffre de clés indisponible : chiffrement « recrutement » impossible."); return crypto.createHash("sha256").update(coffre.cle("recrutement")).digest(); };
  const chiffrer = b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(), iv); const x = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]).toString("base64"); };
  const dechiffrer = s => { const b = Buffer.from(s, "base64"), d = crypto.createDecipheriv("aes-256-gcm", cle(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };
  const page = q => ({off:Math.max(0, Math.floor(+q.offset)||0), lim:Math.min(200, Math.max(1, Math.floor(+q.limit)||50))});
  const auj = () => { const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2, "0")+"-"+String(n.getDate()).padStart(2, "0"); };
  /* correctif 34 : date réelle (le 31/02 ou « 2026-13-45xyz » étaient enregistrés) */
  const dateOk = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof v === "string" ? v : ""); if (!m || +m[1] < 2000 || +m[1] > 2100) return false; const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); return d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3]; };
  /* note entière de 0 à 5 (2,5 enregistré sous SQLite, erreur 500 sous PostgreSQL) ; undefined = invalide */
  const noteDe = v => v == null || v === "" ? null : ((typeof v === "number" || typeof v === "string") && /^[0-5]$/.test(String(v)) ? +v : undefined);
  /* correctif 34 : portée d'un compte limité = sites et services ENTIÈREMENT couverts par son périmètre (salariés
     présents). Avant : tout site où il voyait un seul salarié — un périmètre « service d3 » ouvrait les postes, les
     candidatures et les CV de sites entiers. Un site sans salarié compte s'il est déclaré dans le périmètre (sites seuls). */
  const MEMO = new WeakMap();
  async function portee(P){
    if (!P || P.set === null) return {sites:null, depts:null};
    const emps = await D.employes(), j = auj(), m = MEMO.get(P);
    if (m && m.emps === emps && m.j === j) return m.r;
    const sT = new Map(), sV = new Map(), dT = new Map(), dV = new Map(), add = (x, k) => x.set(k, (x.get(k) || 0) + 1);
    for (const e of emps){ if (e.sortie && e.sortie < j) continue; const v = P.set.has(String(e.mat));
      if (e.siteId){ add(sT, e.siteId); if (v) add(sV, e.siteId); }
      if (e.deptId){ add(dT, e.deptId); if (v) add(dV, e.deptId); } }
    const sites = new Set(Array.from(sT).filter(([k, n])=>sV.get(k) === n).map(([k])=>k)), depts = new Set(Array.from(dT).filter(([k, n])=>dV.get(k) === n).map(([k])=>k));
    const q = (P.u && P.u.perim) || {};
    if ((q.sites || []).length && !(q.depts || []).length && !(q.mats || []).length && !(q.terms || []).length && !q.equipe) q.sites.forEach(x=>{ if (!sT.has(x)) sites.add(x); });
    /* sites où travaillent les services couverts (proposés à l'ouverture d'un poste de ces services) */
    const sitesD = new Set(), deptSites = new Map();
    for (const e of emps) if (e.siteId && e.deptId && depts.has(e.deptId) && !(e.sortie && e.sortie < j)){ sitesD.add(e.siteId); if (!deptSites.has(e.deptId)) deptSites.set(e.deptId, new Set()); deptSites.get(e.deptId).add(e.siteId); }
    const r = {sites, depts, sitesD, deptSites}; MEMO.set(P, {emps, j, r}); return r;
  }
  const posteVuP = (po, pt) => !!po && (pt.sites === null || (!!po.site_id && pt.sites.has(po.site_id)) || (!!po.dept_id && pt.depts.has(po.dept_id)));
  const posteSqlP = (pt, pre) => pt.sites === null ? {sql:"", a:[]} : {sql:" AND ("+pre+"site_id IN (SELECT value FROM json_each(?)) OR "+pre+"dept_id IN (SELECT value FROM json_each(?)))", a:[JSON.stringify(Array.from(pt.sites)), JSON.stringify(Array.from(pt.depts))]};
  const posteSql = (pt, pre) => { if (B.type !== "pg") return posteSqlP(pt, pre); if (pt.sites === null) return {sql:"", a:[]};
    return {sql:" AND ("+pre+"site_id = ANY(?) OR "+pre+"dept_id = ANY(?))", a:[Array.from(pt.sites), Array.from(pt.depts)]}; };
  /* matrice de l'écran Recrutement (menu masqué ou en lecture, actions lire / créer / modifier / valider) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).recrutement, act = (pr.actions || {}).recrutement || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, creer:voir && !ro && rang >= 2 && act.creer !== false, modifier:voir && !ro && rang >= 2 && act.modifier !== false,
      valider:voir && !ro && rang >= 3 && act.valider !== false, perso:voir && rang >= 2, parametrer:voir && !ro && rang >= 4};
  }
  /* v1.1 : durée de conservation des candidats non retenus (6, 12, 24 ou 36 mois ; 24 par défaut). À l'échéance, les
     données personnelles du candidat sont effacées (identité, coordonnées, CV, comptes rendus d'entretien) ; les étapes
     et décisions restent, anonymes, pour les statistiques et l'audit. Les candidats embauchés ne sont jamais effacés ; un
     retenu sans embauche l'est une fois le poste clos (correctif 35 : il était conservé sans limite). */
  const DUREES = [6, 12, 24, 36];
  async function conservation(){ const r = await B.get("SELECT v FROM rec_parametres WHERE k='conservation_mois'"); const n = Number(r && r.v); return DUREES.indexOf(n) >= 0 ? n : 24; }
  async function purger(){
    const mois = await conservation(), lim = new Date(Date.now() - mois*30.44*86400000).toISOString();
    /* correctif 34 : seules les candidatures clôturées (refusées, ou poste clos) sont effacées — un candidat en entretien
       sur un poste ouvert, sans mouvement depuis l'échéance, était effacé */
    const l = await B.all("SELECT c.id FROM rec_candidats c WHERE c.nom <> '—' AND NOT EXISTS (SELECT 1 FROM rec_candidatures a LEFT JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id AND (a.maj > ? OR (a.etape <> 'refuse' AND p.statut='ouvert') OR (a.etape='retenu' AND EXISTS (SELECT 1 FROM rec_embauches h WHERE h.candidature_id=a.id)))) AND c.cree < ?", lim, lim);
    for (const r of l) await effacer(r.id);
    if (l.length) await audit("systeme", "recrutement.purge", l.length+" candidat(s) effacé(s) après "+mois+" mois");
    return l.length;
  }
  async function effacer(cid){
      await B.transaction(async ()=>{
        await B.run("UPDATE rec_candidats SET nom='—', prenom=NULL, email=NULL, tel=NULL, source=NULL WHERE id=?", cid);
        await B.run("DELETE FROM rec_cv WHERE candidat_id=?", cid);
        await B.run("DELETE FROM rec_entretiens WHERE candidature_id IN (SELECT id FROM rec_candidatures WHERE candidat_id=?)", cid);
        /* correctif 35 : motifs libres effacés aussi (ils pouvaient contenir santé, situation familiale, téléphone…) */
        await B.run("UPDATE rec_historique SET motif=NULL WHERE motif IS NOT NULL AND candidature_id IN (SELECT id FROM rec_candidatures WHERE candidat_id=?)", cid);
      });
  }
  /* v56.16 : purge confiée au planificateur central (ignorée si le module est inactif) */
  if (o.planifier) o.planifier("purge-candidats", {intervalle:6*3600000, premier:60000, priorite:3, delai:10*60000, fn:async ()=>(await purger())+" candidat(s) effacé(s)"});
  else { setTimeout(()=>{ purger().catch(()=>{}); }, 60000).unref(); setInterval(()=>{ purger().catch(()=>{}); }, 6*3600000).unref(); }
  /* rubrique de la fiche 360° : postes ouverts sur la fonction du salarié (repère pour la mobilité interne) */
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || dr.rang < 2) return null;
    const f = String(x.emp.poste||"").trim(); if (!f) return null;
    const ps = posteSql(await portee(x.P), "");
    const n = Number((await B.get("SELECT COUNT(*) n FROM rec_postes WHERE statut='ouvert' AND lower(fonction)=lower(?)"+ps.sql, f, ...ps.a)).n);
    return {cle:"recrutement", vue:"recrutement", lignes:[{k:"postesOuvertsFonction", v:String(n)}]};
  }
  /* éléments de la liste « À traiter » de l'accueil */
  async function aTraiter(x){
    /* correctif 34 : compteurs limités au périmètre et à la matrice de l'écran (avant : candidatures de tous les sites) */
    const dr = droitsEcran(x.admin, x.P), out = []; if (!dr.voir) return out;
    const ps = posteSql(await portee(x.P), "p.");
    if (dr.valider){ const n = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.etape='decision' AND p.statut='ouvert'"+ps.sql, ...ps.a)).n);
      if (n) out.push({domaine:"talents", cle:"recrutement-decision", nombre:n, urgence:2, vue:"recrutement"}); }
    if (dr.modifier){ const n = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.etape='recue' AND p.statut='ouvert'"+ps.sql, ...ps.a)).n);
      if (n) out.push({domaine:"talents", cle:"recrutement-recues", nombre:n, urgence:1, vue:"recrutement"}); }
    return out;
  }
  /* correctif 35 : messages dans la langue de l'utilisateur (ils s'affichaient en français dans les écrans en / ar) */
  const MSG = {
    droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
    masque:["Écran Recrutement masqué pour votre profil.", "Recruitment screen hidden for your profile.", "شاشة الانتداب مخفية لملفك."],
    refuse:["Action non permise par vos droits sur l'écran Recrutement.", "Action not allowed by your rights on the Recruitment screen.", "إجراء غير مسموح بحقوقك على شاشة الانتداب."],
    parametrage:["Réservé au paramétrage.", "Reserved to configuration.", "مخصص للإعداد."],
    duree:["Durée non prévue.", "Unsupported duration.", "مدة غير متوقعة."],
    json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
    texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
    intitule:["Intitulé obligatoire.", "Title required.", "التسمية إجبارية."],
    nb:["Nombre de postes : entier de 1 à 500.", "Openings: whole number from 1 to 500.", "عدد المناصب: عدد صحيح من 1 إلى 500."],
    nbRetenus:["Nombre de postes inférieur aux candidats déjà retenus ({n}).", "Fewer openings than candidates already hired ({n}).", "عدد المناصب أقل من المقبولين ({n})."],
    siteInconnu:["Site inconnu.", "Unknown site.", "موقع غير معروف."],
    serviceInconnu:["Service inconnu.", "Unknown department.", "مصلحة غير معروفة."],
    siteObl:["Site obligatoire.", "Site required.", "الموقع إجباري."],
    horsPerim:["Site ou service hors de votre périmètre.", "Site or department outside your scope.", "موقع أو مصلحة خارج نطاقك."],
    serviceSite:["Ce service n'a personne sur ce site : choisissez un site où il travaille.", "This department has nobody on this site.", "لا أحد من هذه المصلحة في هذا الموقع."],
    posteIntrouvable:["Poste introuvable.", "Position not found.", "منصب غير موجود."],
    dejaClos:["Ce poste est déjà clos.", "This position is already closed.", "هذا المنصب مغلق."],
    dejaOuvert:["Ce poste est déjà ouvert.", "This position is already open.", "هذا المنصب مفتوح."],
    concurrence:["Élément modifié entre-temps : actualisez.", "Modified in the meantime: refresh.", "عُدّل في الأثناء: حدّث الصفحة."],
    nom:["Nom obligatoire.", "Last name required.", "اللقب إجباري."],
    courriel:["Courriel invalide.", "Invalid email.", "بريد غير صالح."],
    tel:["Téléphone invalide.", "Invalid phone.", "هاتف غير صالح."],
    cvTaille:["CV trop volumineux (5 Mo au plus).", "CV too large (5 MB max).", "السيرة كبيرة جدا (5 م.ب كحد أقصى)."],
    cvType:["CV : PDF, PNG ou JPEG uniquement.", "CV: PDF, PNG or JPEG only.", "السيرة: PDF أو PNG أو JPEG فقط."],
    cvContenu:["CV refusé : le contenu du fichier ne correspond pas à son type.", "CV rejected: content does not match its type.", "رُفضت السيرة: المحتوى لا يطابق النوع."],
    cvExt:["CV refusé : extension absente ou différente du type.", "CV rejected: missing extension or not matching the type.", "رُفضت السيرة: امتداد غير مطابق."],
    cvAbsent:["Aucun CV.", "No CV.", "لا سيرة."],
    posteOuvert:["Poste ouvert obligatoire.", "Open position required.", "يلزم منصب مفتوح."],
    dejaPostule:["Ce candidat a déjà postulé à ce poste.", "This candidate already applied to this position.", "المترشح ترشح لهذا المنصب."],
    candidatIntrouvable:["Candidat introuvable.", "Candidate not found.", "مترشح غير موجود."],
    efface:["Candidat effacé : plus aucune action possible.", "Erased candidate: no further action.", "مترشح ممحو: لا إجراء ممكن."],
    dejaEfface:["Ce candidat est déjà effacé.", "This candidate is already erased.", "المترشح ممحو."],
    embaucheEff:["Un candidat embauché n'est pas effacé : ses données suivent la fiche salarié.", "A hired candidate is not erased: the data follows the employee record.", "لا يُمحى مترشح منتدب."],
    autrePerim:["Ce candidat a aussi des candidatures hors de votre périmètre : l'effacement revient à un compte qui les voit toutes.", "This candidate also applied outside your scope.", "للمترشح ترشحات خارج نطاقك."],
    candidatureIntrouvable:["Candidature introuvable.", "Application not found.", "ترشح غير موجود."],
    note:["Note : entier de 0 à 5.", "Score: whole number from 0 to 5.", "العدد: عدد صحيح من 0 إلى 5."],
    posteClos:["Poste clos : rouvrez-le pour faire avancer la candidature.", "Closed position: reopen it first.", "منصب مغلق: أعد فتحه أولا."],
    passage:["Passage de « {a} » à « {b} » non permis.", "Move from “{a}” to “{b}” not allowed.", "الانتقال من «{a}» إلى «{b}» غير مسموح."],
    decision:["La décision est réservée au droit de validation.", "The decision requires the validation right.", "القرار مخصص لحق المصادقة."],
    motif:["Motif obligatoire pour une décision.", "Reason required for a decision.", "التعليل إجباري للقرار."],
    quota:["Tous les postes à pourvoir ont déjà un candidat retenu ({n}).", "All openings already have a hired candidate ({n}).", "كل المناصب لها مقبول ({n})."],
    desistement:["Embauche déjà enregistrée : le désistement n'est plus possible ici.", "Hiring already recorded: withdrawal no longer possible here.", "الانتداب مسجل: لا يمكن الانسحاب هنا."],
    dateEntretien:["Date d'entretien invalide (jj/mm/aaaa).", "Invalid interview date.", "تاريخ مقابلة غير صالح."],
    entretienClos:["Poste clos : aucun entretien ne peut être ajouté.", "Closed position: no interview can be added.", "منصب مغلق: لا مقابلة."],
    entretienDecide:["Candidature décidée : aucun entretien ne peut être ajouté.", "Decided application: no interview can be added.", "ترشح محسوم: لا مقابلة."],
    retenuSeul:["Seule une candidature retenue donne lieu à une embauche.", "Only a hired application leads to an employee record.", "فقط ترشح مقبول يؤدي إلى انتداب."],
    ficheIntrouvable:["Fiche salarié introuvable : enregistrez-la d'abord.", "Employee record not found: save it first.", "ملف الأجير غير موجود."],
    ficheSortie:["Cette fiche est celle d'un salarié sorti.", "This record belongs to an employee who left.", "هذا ملف أجير غادر."],
    ficheAncienne:["La fiche doit être celle d'un salarié entré après la candidature.", "The record must belong to an employee hired after the application.", "يجب أن يكون الأجير قد دخل بعد الترشح."],
    ficheSite:["La fiche n'est pas rattachée au site du poste.", "The record is not on the position's site.", "الملف غير مرتبط بموقع المنصب."],
    ficheNom:["La fiche {m} ({n}) ne porte pas le nom du candidat.", "Record {m} ({n}) does not bear the candidate's name.", "الملف {m} ({n}) لا يحمل اسم المترشح."],
    dejaEmbauche:["Cette embauche est déjà enregistrée.", "This hiring is already recorded.", "الانتداب مسجل."],
    export:["Droit d'export requis.", "Export right required.", "يلزم حق التصدير."],
    perso:["Droit de saisie requis.", "Entry right required.", "يلزم حق الإدخال."],
    courrielPris:["Un autre candidat porte déjà ce courriel.", "Another candidate already has this email.", "مترشح آخر يحمل هذا البريد."],
    introuvable:["Introuvable.", "Not found.", "غير موجود."]
  };
  const langueDe = (P, req) => { /* correctif 41 : langue de l'écran (en-tête X-Langue envoyé par l'application) en priorité */ const l = String((req.headers || {})["x-langue"] || u.searchParams.get("lang") || (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2)).slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; };
  const sansAccent = v => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const csvCel = v => { let x = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(x)) x = "'"+x; return /[";\n\r]/.test(x) ? '"'+x.replace(/"/g, '""')+'"' : x; };
  const nbr = l => l.map(r=>{ ["cv","candidatures","retenus","retenu","nb","note"].forEach(k=>{ if (r[k] != null) r[k] = Number(r[k]); }); return r; });
  /* CV contrôlé (taille, type, signature, extension cohérente avec le type) ; null = pas de CV ; {err} = refusé */
  function lireCv(cv){
    if (!cv || !cv.donnees) return null;
    const buf = Buffer.from(String(cv.donnees), "base64");
    if (buf.length > 5*1024*1024) return {st:413, err:"cvTaille"};
    if (!/^(application\/pdf|image\/(png|jpeg))$/.test(cv.type||"")) return {st:400, err:"cvType"};
    const sig = buf.subarray(0, 8), estPdf = sig.subarray(0, 5).toString("latin1") === "%PDF-", estPng = sig.equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])), estJpg = sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF;
    if (!(cv.type === "application/pdf" ? estPdf : cv.type === "image/png" ? estPng : estJpg)) return {st:400, err:"cvContenu"};
    const ext = (/\.([a-z0-9]+)$/i.exec(String(cv.nom||"")) || [])[1] || "";
    if (!({"application/pdf":/^pdf$/i, "image/png":/^png$/i, "image/jpeg":/^jpe?g$/i})[cv.type].test(ext)) return {st:400, err:"cvExt"};
    return {buf, nom:String(cv.nom).replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 120), type:cv.type};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x, L = langueDe(P, req);
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    const err = (st, k, v) => json(res, st, {message:m(k, v), code:k});
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); throw e; }
    async function router(){
    /* correctif 34 : matrice de l'écran (un menu masqué lisait les candidats et ouvrait des postes) */
    const dr = droitsEcran(admin, P), rang = dr.rang;
    if (rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const q = Object.fromEntries(u.searchParams.entries());
    const refuse = () => err(403, "refuse");
    const pt = await portee(P), global = pt.sites === null;
    const posteVu = po => posteVuP(po, pt);
    const pg = B.type === "pg";
    /* correctif 35 : champs texte uniquement (un objet était enregistré « [object Object] ») */
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k}); return String(v).trim().slice(0, max); };
    const candidatureVue = async cid => { const s = posteSql(pt, "p."); return cid ? await B.get("SELECT a.*, p.statut poste_statut, p.nb poste_nb, p.site_id poste_site, p.dept_id poste_dept, p.intitule poste_intitule, c.nom cand_nom, c.prenom cand_prenom, (SELECT mat FROM rec_embauches h WHERE h.candidature_id=a.id) embauche FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id JOIN rec_candidats c ON c.id=a.candidat_id WHERE a.id=?"+s.sql, String(cid), ...s.a) : null; };
    const candidatVu = async cid => { if (global) return !!await B.get("SELECT 1 FROM rec_candidats WHERE id=?", String(cid||""));
      const s = posteSql(pt, "p."); return !!await B.get("SELECT 1 FROM rec_candidats c WHERE c.id=? AND (c.par=? OR EXISTS (SELECT 1 FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id"+s.sql+"))", String(cid||""), C.login, ...s.a); };
    /* doublon parmi les seuls candidats visibles (correctif 35 : un doublon hors périmètre révélait l'existence d'un
       courriel et permettait d'écrire sur la fiche d'un autre périmètre) */
    const doublon = async (email, nom, prenom, tel, sauf) => {
      const l = email ? await B.all("SELECT id FROM rec_candidats WHERE lower(email)=? AND nom <> '—' AND id <> ?", email, sauf || "")
        : tel ? await B.all("SELECT id FROM rec_candidats WHERE lower(nom)=? AND lower(COALESCE(prenom,''))=? AND tel=? AND id <> ?", nom.toLowerCase(), prenom.toLowerCase(), tel, sauf || "") : [];
      for (const r of l) if (await candidatVu(r.id)) return r; return null; };
    /* coordonnées réservées au droit de saisie (un profil « lecture » voyait courriels et téléphones) */
    const sansPerso = l => nbr(dr.perso ? l : l.map(r=>Object.assign({}, r, {email:null, tel:null})));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const lieuOk = async (siteId, deptId) => {
      const ref = await (D.referentielLecture || D.referentiel)() || {};
      if (siteId && !(ref.sites||[]).some(z=>z && z.id === siteId)) return "siteInconnu";
      if (deptId && !(ref.depts||[]).some(z=>z && z.id === deptId)) return "serviceInconnu";
      if (!siteId && (ref.sites||[]).length) return "siteObl";
      if (global || (siteId && pt.sites.has(siteId))) return null;
      if (!(deptId && pt.depts.has(deptId))) return "horsPerim";
      /* correctif 35 : poste d'un service couvert, sur un site où ce service travaille */
      if (siteId && !(pt.deptSites.get(deptId) || new Set()).has(siteId)) return "serviceSite";
      return null; };
    try {
    if (p === "/api/v1/recrutement/parametres" && req.method === "GET") return json(res, 200, {conservationMois:await conservation(), durees:DUREES});
    if (p === "/api/v1/recrutement/parametres" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const n = Number((await corpsJson(req)).conservationMois); if (DUREES.indexOf(n) < 0) return err(400, "duree");
      const av = await conservation();
      await B.run("INSERT INTO rec_parametres(k,v) VALUES('conservation_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n));
      await audit(C.login, "recrutement.conservation", av+" → "+n+" mois", ip); const e = await purger();
      return json(res, 200, {ok:true, conservationMois:n, effaces:e});
    }
    /* postes */
    if (p === "/api/v1/recrutement/postes" && req.method === "GET"){
      const st = q.statut === "clos" ? "clos" : q.statut === "tous" ? null : "ouvert", {off, lim} = page(q), s = String(q.q||"").trim().toLowerCase().slice(0, 100);
      const ps = posteSql(pt, "p."), w = " WHERE 1=1"+(st ? " AND p.statut=?" : "")+(s ? " AND lower(p.intitule) LIKE ? ESCAPE '\\'" : "")+ps.sql, a = (st ? [st] : []).concat(s ? ["%"+s.replace(/[\\%_]/g, z=>"\\"+z)+"%"] : []).concat(ps.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_postes p"+w, ...a)).n);
      const l = await B.all("SELECT p.*, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id) candidatures, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id AND c.etape='retenu') retenus FROM rec_postes p"+w+" ORDER BY p.ouvert_le DESC, p.id LIMIT "+lim+" OFFSET "+off, ...a);
      /* sites et services proposés à l'ouverture d'un poste : ceux de la portée du compte */
      const ref = await (D.referentielLecture || D.referentiel)() || {};
      const choix = {sites:(ref.sites||[]).filter(z=>z && (global || pt.sites.has(z.id) || pt.sitesD.has(z.id))).map(z=>({id:z.id, nom:z.nom||z.id, couvert:global || pt.sites.has(z.id)})),
        depts:(ref.depts||[]).filter(z=>z && (global || pt.depts.has(z.id))).map(z=>({id:z.id, nom:z.nom||z.id})), siteObligatoire:(ref.sites||[]).length > 0};
      const act = admin ? {} : (((P.profil || {}).actions || {}).recrutement || {});
      return json(res, 200, {total, lignes:nbr(l), choix, droits:{creer:dr.creer, modifier:dr.modifier, valider:dr.valider, perso:dr.perso, parametrer:dr.parametrer, exporter:dr.perso && act.exporter !== false}});
    }
    if (p === "/api/v1/recrutement/postes" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), intit = txt(b, "intitule", 120);
      if (!intit) return err(400, "intitule");
      const nb = b.nb == null || b.nb === "" ? 1 : +b.nb;
      if (!Number.isInteger(nb) || nb < 1 || nb > 500) return err(400, "nb");
      const siteId = b.siteId ? String(b.siteId) : null, deptId = b.deptId ? String(b.deptId) : null, k = await lieuOk(siteId, deptId);
      if (k) return err(k === "horsPerim" || k === "serviceSite" ? 403 : 400, k);
      const i = id("rp"); await B.run("INSERT INTO rec_postes(id,intitule,fonction,site_id,dept_id,nb,statut,description,ouvert_le,par) VALUES(?,?,?,?,?,?,?,?,?,?)",
        i, intit, txt(b, "fonction", 80), siteId, deptId, nb, "ouvert", txt(b, "description", 4000), maint(), C.login);
      await audit(C.login, "recrutement.poste", "ouvert : "+i+" « "+intit+" », "+nb+" poste(s), site "+(siteId||"—")+(deptId ? ", service "+deptId : ""), ip); return json(res, 200, {ok:true, id:i});
    }
    /* correctif 35 : modification d'un poste (intitulé, fonction, nombre ≥ retenus, description, site et service) */
    const mpm = /^\/api\/v1\/recrutement\/postes\/([^/]+)$/.exec(p);
    if (mpm && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", mpm[1]); if (!posteVu(po)) return err(404, "posteIntrouvable");
      const b = await corpsJson(req), n = {intitule:b.intitule === undefined ? po.intitule : txt(b, "intitule", 120), fonction:b.fonction === undefined ? po.fonction : txt(b, "fonction", 80),
        description:b.description === undefined ? po.description : txt(b, "description", 4000), nb:b.nb === undefined ? Number(po.nb) : +b.nb,
        site_id:b.siteId === undefined ? po.site_id : (b.siteId ? String(b.siteId) : null), dept_id:b.deptId === undefined ? po.dept_id : (b.deptId ? String(b.deptId) : null)};
      if (!n.intitule) return err(400, "intitule");
      if (!Number.isInteger(n.nb) || n.nb < 1 || n.nb > 500) return err(400, "nb");
      if (n.site_id !== po.site_id || n.dept_id !== po.dept_id){ const k = await lieuOk(n.site_id, n.dept_id); if (k) return err(k === "horsPerim" || k === "serviceSite" ? 403 : 400, k); }
      const ch = Object.keys(n).filter(z=>String(n[z] == null ? "" : n[z]) !== String(po[z] == null ? "" : po[z]));
      if (!ch.length) return json(res, 200, {ok:true, inchange:true});
      try {
        await B.transaction(async ()=>{
          if (pg) await B.get("SELECT id FROM rec_postes WHERE id=? FOR UPDATE", po.id);
          const ret = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE poste_id=? AND etape='retenu'", po.id)).n);
          if (n.nb < ret) throw Object.assign(new Error("nbRetenus"), {code:409, v:{n:ret}});
          await B.run("UPDATE rec_postes SET intitule=?, fonction=?, description=?, nb=?, site_id=?, dept_id=? WHERE id=?", n.intitule, n.fonction, n.description, n.nb, n.site_id, n.dept_id, po.id);
        });
      } catch(e){ if (e.code === 409) return err(409, e.message, e.v); throw e; }
      await audit(C.login, "recrutement.poste", po.id+" modifié : "+ch.map(z=>z === "description" ? z : z+" "+(po[z] == null ? "—" : po[z])+" → "+(n[z] == null ? "—" : n[z])).join(", "), ip);
      return json(res, 200, {ok:true});
    }
    const mp = /^\/api\/v1\/recrutement\/postes\/([^/]+)\/(clore|rouvrir)$/.exec(p);
    if (mp && req.method === "POST"){
      if (!dr.valider) return refuse();
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", mp[1]);
      if (!posteVu(po)) return err(404, "posteIntrouvable"); /* 56.33.11 */
      const vers = mp[2] === "clore" ? "clos" : "ouvert";
      if (po.statut === vers) return err(409, mp[2] === "clore" ? "dejaClos" : "dejaOuvert");
      const r = await B.run("UPDATE rec_postes SET statut=?, clos_le=? WHERE id=? AND statut=?", vers, vers === "clos" ? maint() : null, mp[1], po.statut);
      if (!r.n) return err(409, "concurrence");
      await audit(C.login, "recrutement.poste", mp[1]+" « "+po.intitule+" » : "+po.statut+" → "+vers, ip); return json(res, 200, {ok:true});
    }
    /* correctif 35 : export CSV du tableau d'un poste (cellules protégées contre les formules) */
    if (p === "/api/v1/recrutement/export" && req.method === "GET"){
      const act = admin ? {} : (((P.profil || {}).actions || {}).recrutement || {});
      if (!dr.perso || act.exporter === false) return err(403, "export");
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", String(q.poste||"")); if (!posteVu(po)) return err(404, "posteIntrouvable");
      const l = await B.all("SELECT c.nom, c.prenom, c.email, c.tel, c.source, a.etape, a.note, a.maj, (SELECT mat FROM rec_embauches h WHERE h.candidature_id=a.id) salarie FROM rec_candidatures a JOIN rec_candidats c ON c.id=a.candidat_id WHERE a.poste_id=? ORDER BY a.etape, a.maj DESC LIMIT 50000", po.id);
      const E = {fr:{t:["Nom","Prénom","Courriel","Téléphone","Source","Étape","Note","Mis à jour","Salarié"], e:{recue:"Reçue", preselection:"Présélection", entretien:"Entretien", decision:"Décision", retenu:"Retenu", refuse:"Refusé"}},
        en:{t:["Last name","First name","Email","Phone","Source","Stage","Score","Updated","Employee"], e:{recue:"Received", preselection:"Shortlist", entretien:"Interview", decision:"Decision", retenu:"Hired", refuse:"Rejected"}},
        ar:{t:["اللقب","الاسم","البريد","الهاتف","المصدر","المرحلة","العدد","آخر تحديث","الأجير"], e:{recue:"مستلم", preselection:"انتقاء أولي", entretien:"مقابلة", decision:"قرار", retenu:"مقبول", refuse:"مرفوض"}}}[["fr","en","ar"][L]];
      const jj = d => String(d||"").slice(0, 10).split("-").reverse().join("/");
      const csv = "﻿"+[E.t.join(";")].concat(l.map(r=>[r.nom === "—" ? "—" : r.nom, r.prenom, r.email, r.tel, r.source, E.e[r.etape] || r.etape, r.note, jj(r.maj), r.salarie].map(csvCel).join(";"))).join("\r\n");
      await audit(C.login, "recrutement.export", po.id+" : "+l.length+" candidature(s)", ip);
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"recrutement-"+po.id+".csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(csv);
    }
    /* candidats */
    if (p === "/api/v1/recrutement/candidats" && req.method === "GET"){
      const {off, lim} = page(q), s = String(q.q||"").trim().toLowerCase().slice(0, 100);
      /* correctif 34 : « % » et « _ » recherchés tels quels ; correctif 35 : pas de recherche par courriel sans droit de saisie */
      const champ = dr.perso ? "lower(c.nom || ' ' || COALESCE(c.prenom,'') || ' ' || COALESCE(c.email,''))" : "lower(c.nom || ' ' || COALESCE(c.prenom,''))";
      const ps = posteSql(pt, "p."), w = " WHERE 1=1"+(s ? " AND "+champ+" LIKE ? ESCAPE '\\'" : "")
        +(global ? "" : " AND (c.par=? OR EXISTS (SELECT 1 FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id"+ps.sql+"))");
      const a = (s ? ["%"+s.replace(/[\\%_]/g, z=>"\\"+z)+"%"] : []).concat(global ? [] : [C.login, ...ps.a]);
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_candidats c"+w, ...a)).n);
      const l = await B.all("SELECT c.*, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv, (SELECT COUNT(*) FROM rec_candidatures a WHERE a.candidat_id=c.id AND a.etape='retenu') retenu, (SELECT COUNT(*) FROM rec_candidatures a JOIN rec_embauches h ON h.candidature_id=a.id WHERE a.candidat_id=c.id) embauche FROM rec_candidats c"+w+" ORDER BY c.cree DESC, c.id LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, lignes:sansPerso(l).map(r=>Object.assign(r, {embauche:Number(r.embauche)}))});
    }
    if (p === "/api/v1/recrutement/candidats" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req, 8e6), nom = txt(b, "nom", 80), prenom = txt(b, "prenom", 80), email = txt(b, "email", 120).toLowerCase(), tel = txt(b, "tel", 30), source = txt(b, "source", 60);
      if (!nom) return err(400, "nom");
      if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return err(400, "courriel");
      if (tel && !/^[+\d][\d .\-()]{5,29}$/.test(tel)) return err(400, "tel");
      /* v56.23 : le CV est entièrement contrôlé AVANT toute écriture */
      const cv = lireCv(b.cv); if (cv && cv.err) return err(cv.st, cv.err);
      const posteId = b.posteId ? String(b.posteId) : null;
      if (posteId && !posteVu(await B.get("SELECT * FROM rec_postes WHERE id=? AND statut='ouvert'", posteId))) return err(400, "posteOuvert");
      const cvChiffre = cv ? chiffrer(cv.buf) : null; let res2;
      try {
        res2 = await B.transaction(async ()=>{
          /* correctif 35 : doublon contrôlé dans la transaction, sous verrou (trois créations simultanées sous PostgreSQL
             donnaient trois fiches) */
          await verrou("rec-cand:"+(email || nom.toLowerCase()+"|"+prenom.toLowerCase()+"|"+tel));
          const dbl = await doublon(email, nom, prenom, tel);
          if (dbl && b.doublonAccepte !== true) return {doublon:dbl.id};
          if (dbl && posteId && await B.get("SELECT 1 FROM rec_candidatures WHERE poste_id=? AND candidat_id=?", posteId, dbl.id)) throw Object.assign(new Error("dejaPostule"), {code:409});
          const i = dbl ? dbl.id : id("rc"); let c = null, cvMis = false;
          if (!dbl) await B.run("INSERT INTO rec_candidats(id,nom,prenom,email,tel,source,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, nom, prenom, email, tel, source, maint(), C.login);
          /* candidat existant : son CV n'est jamais remplacé ici (route « CV » dédiée) ; ajouté s'il n'en a pas */
          if (cv && !(dbl && await B.get("SELECT 1 FROM rec_cv WHERE candidat_id=?", i))){ await B.run("INSERT INTO rec_cv(candidat_id,nom_fichier,type,taille,donnees,cree) VALUES(?,?,?,?,?,?)", i, cv.nom, cv.type, cv.buf.length, cvChiffre, maint()); cvMis = true; }
          if (posteId){ c = id("ra"); await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, posteId, i, "recue", maint(), maint());
            await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint()); }
          return {i, c, dbl:!!dbl, cvMis, cvIgnore:!!cv && !cvMis};
        });
      } catch(e){ if (e.code === 409) return err(409, e.message); if (/unique|duplicate|constraint/i.test(e.message || "")) return err(409, "dejaPostule"); throw e; }
      /* doublon visible : rattachement proposé (réponse 200, sans écriture) */
      if (res2.doublon) return json(res, 200, {ok:false, doublon:true, candidatId:res2.doublon});
      /* correctif 34 : l'audit ne garde que l'identifiant */
      await audit(C.login, "recrutement.candidat", (res2.dbl ? "existant " : "ajout ")+res2.i+(res2.c ? ", candidature "+res2.c+" au poste "+posteId : "")+(res2.cvMis ? ", CV" : ""), ip);
      return json(res, 200, {ok:true, id:res2.i, candidature:res2.c, cvIgnore:res2.cvIgnore});
    }
    /* correctif 35 : fiche d'un candidat (coordonnées, CV, candidatures visibles) */
    const mcf = /^\/api\/v1\/recrutement\/candidats\/([^/]+)$/.exec(p);
    if (mcf && req.method === "GET"){
      if (!await candidatVu(mcf[1])) return err(404, "candidatIntrouvable");
      const c = await B.get("SELECT c.*, v.nom_fichier cv_nom, v.taille cv_taille FROM rec_candidats c LEFT JOIN rec_cv v ON v.candidat_id=c.id WHERE c.id=?", mcf[1]);
      const ps = posteSql(pt, "p.");
      const l = await B.all("SELECT a.id, a.etape, a.maj, a.poste_id, p.intitule, p.statut poste_statut FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=?"+ps.sql+" ORDER BY a.maj DESC", c.id, ...ps.a);
      const autres = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE candidat_id=?", c.id)).n) - l.length;
      const r = sansPerso([c])[0]; if (!dr.perso){ r.cv_nom = null; }
      return json(res, 200, {candidat:Object.assign(r, {cv_taille:r.cv_taille == null ? null : Number(r.cv_taille)}), candidatures:l, autres});
    }
    /* correctif 35 : rectification (droit de rectification) — l'audit liste les champs, jamais les valeurs */
    if (mcf && req.method === "POST"){
      if (!dr.modifier || !dr.perso) return refuse();
      if (!await candidatVu(mcf[1])) return err(404, "candidatIntrouvable");
      const c = await B.get("SELECT * FROM rec_candidats WHERE id=?", mcf[1]); if (c.nom === "—") return err(409, "efface");
      const b = await corpsJson(req), n = {};
      for (const [k, max] of [["nom",80],["prenom",80],["email",120],["tel",30],["source",60]]) if (b[k] !== undefined) n[k] = k === "email" ? txt(b, k, max).toLowerCase() : txt(b, k, max);
      if (n.nom !== undefined && !n.nom) return err(400, "nom");
      if (n.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(n.email)) return err(400, "courriel");
      if (n.tel && !/^[+\d][\d .\-()]{5,29}$/.test(n.tel)) return err(400, "tel");
      const ch = Object.keys(n).filter(k=>String(n[k]) !== String(c[k] == null ? "" : c[k]));
      if (!ch.length) return json(res, 200, {ok:true, inchange:true});
      if (n.email && n.email !== String(c.email||"").toLowerCase() && await B.get("SELECT 1 FROM rec_candidats WHERE lower(email)=? AND id <> ? AND nom <> '—'", n.email, c.id)) return err(409, "courrielPris");
      await B.run("UPDATE rec_candidats SET "+ch.map(k=>k+"=?").join(", ")+" WHERE id=?", ...ch.map(k=>n[k]), c.id);
      await audit(C.login, "recrutement.candidat", c.id+" rectifié : "+ch.join(", "), ip); return json(res, 200, {ok:true});
    }
    const mef = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/effacer$/.exec(p);
    if (mef && req.method === "POST"){
      if (!dr.valider) return refuse();
      if (!await candidatVu(mef[1])) return err(404, "candidatIntrouvable");
      const c = await B.get("SELECT nom, (SELECT COUNT(*) FROM rec_candidatures a JOIN rec_embauches h ON h.candidature_id=a.id WHERE a.candidat_id=rec_candidats.id) emb FROM rec_candidats WHERE id=?", mef[1]);
      if (c.nom === "—") return err(409, "dejaEfface");
      /* correctif 35 : un retenu sans embauche peut être effacé ; un embauché non */
      if (Number(c.emb)) return err(409, "embaucheEff");
      /* correctif 35 : pas d'effacement par un compte qui ne voit pas toutes les candidatures du candidat */
      if (!global){ const ps = posteSql(pt, "p."); const vis = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=?"+ps.sql, mef[1], ...ps.a)).n);
        if (vis < Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE candidat_id=?", mef[1])).n)) return err(403, "autrePerim"); }
      await effacer(mef[1]);
      await audit(C.login, "recrutement.effacement", mef[1]+" (demande du candidat)", ip); return json(res, 200, {ok:true});
    }
    const mcv = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/cv(\/supprimer)?$/.exec(p);
    if (mcv && req.method === "GET" && !mcv[2]){
      /* 56.33.11 : CV déchiffré réservé au droit de saisie et aux candidats du périmètre */
      if (!dr.perso) return err(403, "perso");
      if (!await candidatVu(mcv[1])) return err(404, "cvAbsent");
      const r = await B.get("SELECT * FROM rec_cv WHERE candidat_id=?", mcv[1]); if (!r) return err(404, "cvAbsent");
      await audit(C.login, "recrutement.cv.consulte", mcv[1], ip);
      const nf = String(r.nom_fichier || "cv");
      /* correctif 35 : nom de fichier non latin conservé (filename*) */
      res.writeHead(200, {"Content-Type":r.type, "Content-Disposition":"attachment; filename=\""+nf.replace(/[^\w.\- ]/g, "_")+"\"; filename*=UTF-8''"+encodeURIComponent(nf), "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(dechiffrer(r.donnees));
    }
    /* correctif 35 : remplacer ou supprimer le CV d'un candidat */
    if (mcv && req.method === "POST"){
      if (!dr.modifier || !dr.perso) return refuse();
      if (!await candidatVu(mcv[1])) return err(404, "candidatIntrouvable");
      if ((await B.get("SELECT nom FROM rec_candidats WHERE id=?", mcv[1])).nom === "—") return err(409, "efface");
      if (mcv[2]){ const r = await B.run("DELETE FROM rec_cv WHERE candidat_id=?", mcv[1]); if (!r.n) return err(404, "cvAbsent");
        await audit(C.login, "recrutement.cv", mcv[1]+" : CV supprimé", ip); return json(res, 200, {ok:true}); }
      const cv = lireCv((await corpsJson(req, 8e6)).cv); if (!cv) return err(400, "cvType"); if (cv.err) return err(cv.st, cv.err);
      await B.run("INSERT INTO rec_cv(candidat_id,nom_fichier,type,taille,donnees,cree) VALUES(?,?,?,?,?,?) ON CONFLICT(candidat_id) DO UPDATE SET nom_fichier=excluded.nom_fichier, type=excluded.type, taille=excluded.taille, donnees=excluded.donnees, cree=excluded.cree", mcv[1], cv.nom, cv.type, cv.buf.length, chiffrer(cv.buf), maint());
      await audit(C.login, "recrutement.cv", mcv[1]+" : CV remplacé ("+cv.type+", "+cv.buf.length+" octets)", ip); return json(res, 200, {ok:true});
    }
    /* candidatures : tableau par étape, paginé */
    if (p === "/api/v1/recrutement/candidatures" && req.method === "GET"){
      const {off, lim} = page(q); if (!q.poste) return err(400, "posteIntrouvable");
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", String(q.poste));
      if (!posteVu(po)) return err(404, "posteIntrouvable"); /* 56.33.11 */
      const comptes = {}; (await B.all("SELECT etape, COUNT(*) n FROM rec_candidatures WHERE poste_id=? GROUP BY etape", po.id)).forEach(r=>{ comptes[r.etape] = Number(r.n); });
      const et = ETAPES.indexOf(q.etape) >= 0 ? q.etape : null;
      const l = await B.all("SELECT a.id, a.etape, a.note, a.maj, c.id candidat_id, c.nom, c.prenom, c.email, c.tel, (SELECT mat FROM rec_embauches h WHERE h.candidature_id=a.id) salarie, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv FROM rec_candidatures a JOIN rec_candidats c ON c.id=a.candidat_id WHERE a.poste_id=?"+(et ? " AND a.etape=?" : "")+" ORDER BY a.maj DESC, a.id LIMIT "+lim+" OFFSET "+off, ...(et ? [po.id, et] : [po.id]));
      return json(res, 200, {etapes:ETAPES, suivantes:SUIVANTES, comptes, lignes:sansPerso(l), poste:{id:po.id, intitule:po.intitule, fonction:po.fonction, statut:po.statut, nb:Number(po.nb), site_id:po.site_id, dept_id:po.dept_id, description:po.description}});
    }
    const ma = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/(etape|entretien|historique)$/.exec(p);
    /* 56.33.11 : historique et comptes rendus d'entretien : droit de saisie et candidature du périmètre */
    if (ma && ma[2] === "historique" && req.method === "GET"){
      if (!dr.perso) return err(403, "perso");
      if (!await candidatureVue(ma[1])) return err(404, "candidatureIntrouvable");
      return json(res, 200, {historique:await B.all("SELECT * FROM rec_historique WHERE candidature_id=? ORDER BY ts, id", ma[1]), entretiens:nbr(await B.all("SELECT * FROM rec_entretiens WHERE candidature_id=? ORDER BY d, cree", ma[1]))}); }
    if (ma && ma[2] === "etape" && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const b = await corpsJson(req), a = await candidatureVue(ma[1]); if (!a) return err(404, "candidatureIntrouvable");
      const vers = String(b.vers||""), motif = txt(b, "motif", 500), note = noteDe(b.note);
      if (note === undefined) return err(400, "note");
      if (a.cand_nom === "—") return err(409, "efface");
      /* correctif 34 : rien ne bouge sur un poste clos */
      if (a.poste_statut !== "ouvert") return err(409, "posteClos");
      if ((SUIVANTES[a.etape]||[]).indexOf(vers) < 0) return err(409, "passage", {a:a.etape, b:vers});
      /* décision : retenu, refusé, réexamen d'un refus, désistement d'un retenu */
      const decision = vers === "retenu" || vers === "refuse" || a.etape === "refuse";
      if (decision && !dr.valider) return err(403, "decision");
      if (decision && !motif) return err(400, "motif");
      if (a.etape === "retenu" && a.embauche) return err(409, "desistement");
      try {
        await B.transaction(async ()=>{
          /* correctif 35 : poste verrouillé sous PostgreSQL (six « retenu » simultanés donnaient trois retenus pour un poste) */
          if (pg) await B.get("SELECT id FROM rec_postes WHERE id=? FOR UPDATE", a.poste_id);
          if (vers === "retenu"){ const nb = Number((await B.get("SELECT nb FROM rec_postes WHERE id=?", a.poste_id)).nb || 1);
            if (Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE poste_id=? AND etape='retenu'", a.poste_id)).n) >= nb) throw Object.assign(new Error("quota"), {code:409, v:{n:nb}}); }
          if (a.etape === "retenu" && await B.get("SELECT 1 FROM rec_embauches WHERE candidature_id=?", a.id)) throw Object.assign(new Error("desistement"), {code:409});
          const u1 = await B.run("UPDATE rec_candidatures SET etape=?, maj=?, note=COALESCE(?, note) WHERE id=? AND etape=?", vers, maint(), note, a.id, a.etape);
          if (!u1.n) throw Object.assign(new Error("concurrence"), {code:409});
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, a.etape, vers, C.login, motif, maint());
        });
      } catch(e){ if (e.code === 409) return err(409, e.message, e.v); throw e; }
      await audit(C.login, "recrutement.etape", a.id+" : "+a.etape+" → "+vers+(note != null ? ", note "+note : ""), ip); return json(res, 200, {ok:true, de:a.etape, vers});
    }
    if (ma && ma[2] === "entretien" && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const b = await corpsJson(req); if (!dateOk(b.d)) return err(400, "dateEntretien");
      const note = noteDe(b.note); if (note === undefined) return err(400, "note");
      const a = await candidatureVue(ma[1]); if (!a) return err(404, "candidatureIntrouvable"); /* 56.33.11 */
      if (a.cand_nom === "—") return err(409, "efface");
      if (a.poste_statut !== "ouvert") return err(409, "entretienClos");
      if (a.etape === "retenu" || a.etape === "refuse") return err(409, "entretienDecide");
      const ie = id("re");
      await B.run("INSERT INTO rec_entretiens(id,candidature_id,d,intervenant,avis,note,par,cree) VALUES(?,?,?,?,?,?,?,?)", ie, a.id, b.d, txt(b, "intervenant", 80), txt(b, "avis", 2000), note, C.login, maint());
      await audit(C.login, "recrutement.entretien", a.id+" : entretien "+ie+" du "+b.d.split("-").reverse().join("/")+(note != null ? ", note "+note : ""), ip); return json(res, 200, {ok:true, id:ie});
    }
    /* v56.18 : embauche — la candidature retenue est rattachée à la fiche salarié créée (une seule fois, sans copie) */
    const mh = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/embauche$/.exec(p);
    if (mh && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const a = await candidatureVue(mh[1]); if (!a) return err(404, "candidatureIntrouvable");
      if (a.cand_nom === "—") return err(409, "efface");
      if (a.etape !== "retenu") return err(409, "retenuSeul");
      const mat = txt(await corpsJson(req), "mat", 40);
      /* 56.33.11 : fiche salarié du périmètre uniquement */
      const e = mat && (P.set === null || P.set.has(mat)) ? (await D.employes()).find(z=>String(z.mat) === mat) : null;
      if (!e) return err(404, "ficheIntrouvable");
      /* correctif 34 : salarié présent, entré après la candidature, sur le site du poste */
      if (e.sortie && e.sortie < auj()) return err(409, "ficheSortie");
      if (!e.entree || String(e.entree) < String(a.cree).slice(0, 10)) return err(409, "ficheAncienne");
      if (a.poste_site && e.siteId && e.siteId !== a.poste_site) return err(409, "ficheSite");
      /* correctif 35 : la fiche porte le nom du candidat (une candidature pouvait être reliée à n'importe quel salarié) */
      if (sansAccent(e.nom) !== sansAccent(a.cand_nom) || (a.cand_prenom && sansAccent(e.prenom) !== sansAccent(a.cand_prenom))) return err(409, "ficheNom", {m:mat, n:((e.nom||"")+" "+(e.prenom||"")).trim()});
      try {
        await B.transaction(async ()=>{
          if (await B.get("SELECT 1 FROM rec_embauches WHERE candidature_id=? OR mat=?", a.id, mat)) throw Object.assign(new Error("dejaEmbauche"), {code:409});
          await B.run("INSERT INTO rec_embauches(candidature_id,mat,le,par) VALUES(?,?,?,?)", a.id, mat, maint(), C.login);
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, "retenu", "retenu", C.login, "fiche salarié créée : "+mat, maint());
        });
      } catch(e2){ if (e2.code === 409 || /unique|duplicate|constraint/i.test(e2.message || "")) return err(409, "dejaEmbauche"); throw e2; }
      await audit(C.login, "recrutement.embauche", a.id+" → salarié "+mat, ip); return json(res, 200, {ok:true, mat});
    }
    if (p === "/api/v1/recrutement/candidatures" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), pid = String(b.posteId||""), cid = String(b.candidatId||"");
      if (!posteVu(await B.get("SELECT * FROM rec_postes WHERE id=? AND statut='ouvert'", pid))) return err(400, "posteOuvert");
      if (!await candidatVu(cid)) return err(404, "candidatIntrouvable"); /* 56.33.11 : candidat du périmètre */
      if ((await B.get("SELECT nom FROM rec_candidats WHERE id=?", cid)).nom === "—") return err(409, "efface");
      const c = id("ra");
      try {
        await B.transaction(async ()=>{
          if (await B.get("SELECT 1 FROM rec_candidatures WHERE poste_id=? AND candidat_id=?", pid, cid)) throw new Error("dejaPostule");
          await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, pid, cid, "recue", maint(), maint());
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint());
        });
      } catch(e){ if (e.message === "dejaPostule" || /unique|duplicate|constraint/i.test(e.message || "")) return err(409, "dejaPostule"); throw e; }
      await audit(C.login, "recrutement.candidature", c+" : candidat "+cid+" au poste "+pid, ip);
      return json(res, 200, {ok:true, id:c});
    }
    return err(404, "introuvable");
    } catch(e){ if (e && e.message === "texte") return err(400, "texte", {c:e.champ}); throw e; }
    }
  }
  return {traiter, aTraiter, purger, fiche360};
}
module.exports = {ddl, tables, creer, ETAPES, SUIVANTES};
