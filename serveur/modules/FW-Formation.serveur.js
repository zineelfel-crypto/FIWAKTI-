/* FW-Formation — partie serveur. Catalogue (formations et habilitations), besoins (écarts de compétences, évaluations,
   échéances d'habilitation, saisie), sessions, inscriptions, présence et résultat, clôture : les niveaux acquis sont
   reportés dans la matrice des compétences (avec historique) et les habilitations obtenues prennent leur date
   d'échéance. Les habilitations vivent ici (pas de module séparé). Périmètre et matrice de l'écran appliqués. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const listeSql = (B, col, l, non) => B.type === "pg" ? {sql:" AND "+(non ? "NOT " : "")+"("+col+" = ANY(?))", a:[l]} : {sql:" AND "+col+(non ? " NOT" : "")+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(l)]};
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS frm_catalogue (id TEXT PRIMARY KEY, code TEXT NOT NULL, titre TEXT NOT NULL, type TEXT NOT NULL, duree_h REAL, validite_mois INTEGER, competence_id TEXT, niveau_vise INTEGER, organisme TEXT, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS frm_besoins (id TEXT PRIMARY KEY, mat TEXT NOT NULL, catalogue_id TEXT NOT NULL, origine TEXT NOT NULL, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS frm_besoins_statut ON frm_besoins(statut, catalogue_id)",
  "CREATE INDEX IF NOT EXISTS frm_besoins_mat ON frm_besoins(mat)",
  "CREATE TABLE IF NOT EXISTS frm_sessions (id TEXT PRIMARY KEY, catalogue_id TEXT NOT NULL, debut TEXT NOT NULL, fin TEXT NOT NULL, lieu TEXT, formateur TEXT, places INTEGER NOT NULL, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS frm_inscriptions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, mat TEXT NOT NULL, besoin_id TEXT, presence TEXT NOT NULL, resultat TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS frm_inscriptions_cle ON frm_inscriptions(session_id, mat)",
  "CREATE INDEX IF NOT EXISTS frm_inscriptions_mat ON frm_inscriptions(mat)",
  "CREATE TABLE IF NOT EXISTS frm_habilitations (id TEXT PRIMARY KEY, mat TEXT NOT NULL, catalogue_id TEXT NOT NULL, obtenue_le TEXT NOT NULL, expire_le TEXT, session_id TEXT, maj TEXT NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS frm_habilitations_cle ON frm_habilitations(mat, catalogue_id)",
  "CREATE INDEX IF NOT EXISTS frm_habilitations_exp ON frm_habilitations(expire_le)",
  /* correctif 37 : site d'une session (périmètre des sessions : avant, toutes visibles et clôturables) */
  "CREATE TABLE IF NOT EXISTS frm_session_sites (session_id TEXT PRIMARY KEY, site_id TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS frm_sessions_debut ON frm_sessions(debut, id)",
  "CREATE INDEX IF NOT EXISTS frm_besoins_inscr ON frm_inscriptions(besoin_id)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS frm_inscriptions_sess ON frm_inscriptions(session_id, mat)");
ddl.sqlite = ddl.pg;
const tables = {frm_catalogue:"id", frm_besoins:"id", frm_sessions:"id", frm_inscriptions:"id", frm_habilitations:"id", frm_session_sites:"session_id"};
/* correctif 37 : fin de mois respectée (31/08 + 6 mois donnait le 03/03 au lieu du 28/02) */
function ajoutMois(k, n){ const p = k.split("-").map(Number), t = new Date(Date.UTC(p[0], p[1]-1+n, 1)), der = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth()+1, 0)).getUTCDate();
  t.setUTCDate(Math.min(p[2], der)); return t.toISOString().slice(0, 10); }
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* correctif 37 : messages dans la langue de l'utilisateur */
const PRES = {inscrit:["Inscrit","Enrolled","مسجل"], present:["Présent","Present","حاضر"], absent:["Absent","Absent","غائب"], excuse:["Excusé","Excused","معذور"]};
const RES = {acquis:["Acquis","Passed","مكتسب"], non_acquis:["Non acquis","Not passed","غير مكتسب"]};
const MSG = {
  droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
  masque:["Écran Formation masqué pour votre profil.", "Training screen hidden for your profile.", "شاشة التكوين مخفية لملفك."],
  refuse:["Action non permise par vos droits sur l'écran Formation.", "Action not allowed by your rights on the Training screen.", "إجراء غير مسموح بحقوقك على شاشة التكوين."],
  parametrage:["Catalogue réservé au paramétrage.", "Catalogue restricted to configuration.", "الدليل مخصص للإعداد."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  codeTitre:["Code et intitulé obligatoires.", "Code and title required.", "الرمز والتسمية إجباريان."],
  codePris:["Code « {c} » déjà utilisé.", "Code “{c}” already used.", "الرمز «{c}» مستعمل."],
  competence:["Compétence liée inconnue.", "Unknown linked skill.", "كفاءة مرتبطة غير معروفة."],
  validite:["Validité : nombre entier de mois de 1 à 240.", "Validity: whole number of months from 1 to 240.", "الصلاحية: عدد صحيح من 1 إلى 240 شهرا."],
  niveau:["Niveau visé : entier de 1 à 4.", "Target level: whole number from 1 to 4.", "المستوى المستهدف: عدد صحيح من 1 إلى 4."],
  duree:["Durée : nombre d'heures positif (pas de 0,5).", "Duration: positive hours (step 0.5).", "المدة: ساعات موجبة."],
  type:["Type : formation ou habilitation.", "Type: training or authorisation.", "النوع: تكوين أو تأهيل."],
  places:["Places : entier de 1 à 500.", "Seats: whole number from 1 to 500.", "المقاعد: عدد صحيح من 1 إلى 500."],
  placesInscrits:["Places inférieures au nombre d'inscrits ({n}).", "Fewer seats than enrolled ({n}).", "المقاعد أقل من المسجلين ({n})."],
  formationInconnue:["Formation inconnue.", "Unknown training.", "تكوين غير معروف."],
  formationIntrouvable:["Formation introuvable.", "Training not found.", "تكوين غير موجود."],
  sessionPlanifiee:["Une session est planifiée pour cette formation : annulez-la d'abord.", "A session is planned for this training: cancel it first.", "دورة مبرمجة لهذا التكوين: ألغها أولا."],
  dates:["Dates de début et de fin obligatoires et réelles (début ≤ fin).", "Real start and end dates required (start ≤ end).", "تاريخا البداية والنهاية إجباريان (البداية ≤ النهاية)."],
  site:["Site inconnu ou hors de votre périmètre.", "Unknown site or outside your scope.", "موقع غير معروف أو خارج نطاقك."],
  salarie:["Salarié introuvable ou hors périmètre.", "Employee not found or outside your scope.", "أجير غير موجود أو خارج نطاقك."],
  sortiBesoin:["Salarié sorti : aucun besoin de formation.", "Employee has left: no training need.", "غادر الأجير: لا حاجة تكوين."],
  sortiInscr:["Salarié sorti : inscription impossible.", "Employee has left: cannot enrol.", "غادر الأجير: التسجيل غير ممكن."],
  besoinExiste:["Ce besoin existe déjà.", "This need already exists.", "هذه الحاجة موجودة."],
  besoinIntrouvable:["Besoin introuvable.", "Need not found.", "حاجة غير موجودة."],
  besoinOuvert:["Seul un besoin ouvert s'annule.", "Only an open need can be cancelled.", "تلغى الحاجة المفتوحة فقط."],
  motif:["Motif obligatoire.", "Reason required.", "التعليل إجباري."],
  sessionIntrouvable:["Session introuvable.", "Session not found.", "دورة غير موجودة."],
  annulee:["Session annulée.", "Session cancelled.", "دورة ملغاة."],
  cloturee:["Session clôturée.", "Session closed.", "دورة مغلقة."],
  horsPerim:["Des inscrits sont hors de votre périmètre : action réservée à un valideur couvrant tous les inscrits.", "Some attendees are outside your scope.", "بعض المسجلين خارج نطاقك."],
  complete:["Session complète.", "Session full.", "الدورة ممتلئة."],
  dejaInscrit:["Déjà inscrit.", "Already enrolled.", "مسجل مسبقا."],
  terminee:["Session terminée le {d} : inscription impossible.", "Session ended on {d}: enrolment closed.", "انتهت الدورة في {d}: التسجيل مغلق."],
  inscrIntrouvable:["Inscription introuvable.", "Enrolment not found.", "تسجيل غير موجود."],
  pasCommencee:["Session non commencée (début le {d}) : présence et résultat saisis à partir de cette date.", "Session not started (starts {d}).", "لم تبدأ الدورة (تبدأ في {d})."],
  presence:["Présence attendue : inscrit, present, absent ou excuse.", "Attendance expected: enrolled, present, absent or excused.", "الحضور: مسجل، حاضر، غائب أو معذور."],
  resultat:["Résultat attendu : acquis, non_acquis ou vide.", "Result expected: passed, not passed or empty.", "النتيجة: مكتسب، غير مكتسب أو فارغ."],
  nonTerminee:["Session non terminée (fin le {d}) : clôture possible à partir de cette date.", "Session not finished (ends {d}).", "لم تنته الدورة (تنتهي في {d})."],
  presenceManquante:["Saisissez la présence de chaque inscrit avant de clôturer.", "Record each attendee's attendance before closing.", "سجل حضور كل مسجل قبل الإغلاق."],
  resultatManquant:["Résultat manquant pour {n} présent(s) : indiquez acquis ou non acquis.", "Result missing for {n} attendee(s).", "النتيجة ناقصة لـ {n} حاضر."],
  vide:["Session sans inscrit : annulez-la plutôt que de la clôturer.", "Session without attendees: cancel it instead.", "دورة بلا مسجلين: ألغها."],
  concurrence:["Session modifiée entre-temps : actualisez.", "Session modified in the meantime: refresh.", "عُدّلت الدورة في الأثناء: حدّث."],
  dateHab:["Date d'obtention invalide ou future.", "Invalid or future date obtained.", "تاريخ حصول غير صالح."],
  pasHab:["Cet élément du catalogue n'est pas une habilitation.", "This catalogue item is not an authorisation.", "هذا العنصر ليس تأهيلا."],
  introuvable:["Introuvable.", "Not found.", "غير موجود."]
};
function creer(o){
  const {B, D, audit} = o, actif = o.moduleActif || (()=>false), pg = B.type === "pg";
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  /* correctif 40 : un mois ou un jour hors limites (2026-13-45) levait une exception (erreur 500) au lieu d'être refusé */
  const dateOk = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0, 4) < 1990 || +s.slice(0, 4) > 2100) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "—";
  const sorti = e => !!(e && e.sortie && e.sortie < auj());
  const actifEmp = async mat => { const e = (await D.employes()).find(x=>String(x.mat) === String(mat)); return !e ? null : sorti(e) ? false : e; };
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  const presents = async () => (await D.employes()).filter(e=>!sorti(e)).map(e=>String(e.mat));
  async function nomsDe(){ const e = new Map((await D.employes()).map(x=>[String(x.mat), x])); return m => { const x = e.get(String(m)) || {}; return ((x.nom||"")+" "+(x.prenom||"")).trim(); }; }
  const SC = () => actif("FW-Competences") && o.service ? (o.service("FW-Competences") || {}).service : null;
  /* matrice de l'écran Formation (menu masqué ou en lecture ; actions lire / créer / modifier / valider) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).formation, act = (pr.actions || {}).formation || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, creer:voir && !ro && rang >= 2 && act.creer !== false, modifier:voir && !ro && rang >= 2 && act.modifier !== false,
      valider:voir && !ro && rang >= 3 && act.valider !== false, parametrer:voir && !ro && rang >= 4 && act.modifier !== false, exporter:voir && rang >= 2 && act.exporter !== false};
  }
  /* sites où le compte voit au moins un salarié (portée des sessions d'un compte limité) */
  async function sitesVus(P){ if (P.set === null) return null; return new Set((await D.employes()).filter(e=>P.set.has(String(e.mat))).map(e=>e.siteId).filter(Boolean)); }
  /* session visible : compte global, créateur, site de la session dans la portée, ou un inscrit du périmètre */
  async function sessionVue(P, login, s){
    if (P.set === null) return true; if (s.par === login) return true;
    const st = await B.get("SELECT site_id FROM frm_session_sites WHERE session_id=?", s.id), sv = await sitesVus(P);
    if (st && sv.has(st.site_id)) return true;
    const pm = perimSql(B, P, "mat"); return !!await B.get("SELECT 1 FROM frm_inscriptions WHERE session_id=?"+pm.sql+" LIMIT 1", s.id, ...pm.a);
  }
  /* besoins issus des écarts de compétences et des habilitations arrivant à échéance. Correctif 37 : formation choisie
     selon le niveau qu'elle vise (une formation qui ne fait pas progresser n'est pas proposée), exigences indexées par
     fonction, index des niveaux en mémoire, insertions groupées par lots dans une transaction en rendant la main entre
     les lots (à 20 000 salariés, le serveur était bloqué 17 s) ; « apercu » compte sans écrire. */
  async function generer(P, login, apercu){
    const cat = await B.all("SELECT * FROM frm_catalogue WHERE actif=1");
    /* un besoin annulé (motif saisi) n'est pas recréé à chaque passage */
    const ouverts = new Set((await B.all("SELECT mat, catalogue_id FROM frm_besoins WHERE statut IN ('ouvert','planifie','annule')")).map(r=>r.mat+"|"+r.catalogue_id));
    const a_creer = [], ajouter = (mat, c, origine) => { const k = mat+"|"+c.id; if (ouverts.has(k) || !dans(P, mat)) return; ouverts.add(k); a_creer.push([mat, c.id, origine]); };
    const emps = (await D.employes()).filter(e=>!sorti(e));
    const sv = SC();
    if (sv){
      const parComp = new Map(); cat.filter(c=>c.competence_id && c.niveau_vise).forEach(c=>{ if (!parComp.has(c.competence_id)) parComp.set(c.competence_id, []); parComp.get(c.competence_id).push(c); });
      if (parComp.size){
        const exigF = new Map(); for (const x of await sv.exigences()) if (parComp.has(x.competence_id)){ if (!exigF.has(x.fonction)) exigF.set(x.fonction, []); exigF.get(x.fonction).push(x); }
        const niv = sv.niveauxIndex ? await sv.niveauxIndex() : new Map((await sv.niveaux()).map(r=>[r.mat+"|"+r.competence_id, r.niveau]));
        let i = 0;
        for (const e of emps){ const f = String(e.poste || e.fonction || "").trim(); const ex = f && exigF.get(f); if (!ex) continue;
          for (const x of ex){ const act = Number(niv.get(String(e.mat)+"|"+x.competence_id) || 0); if (act >= Number(x.niveau)) continue;
            /* formation qui couvre l'exigence, sinon celle qui fait progresser le plus ; aucune si aucune ne dépasse le niveau actuel */
            const l = parComp.get(x.competence_id).filter(c=>Number(c.niveau_vise) > act).sort((a, b)=>Number(a.niveau_vise) - Number(b.niveau_vise));
            const c = l.find(z=>Number(z.niveau_vise) >= Number(x.niveau)) || l[l.length - 1]; if (c) ajouter(String(e.mat), c, "ecart"); }
          if (++i % 2000 === 0) await new Promise(r=>setImmediate(r)); }
      }
    }
    const pres = new Set(emps.map(e=>String(e.mat))), catId = new Map(cat.map(c=>[c.id, c]));
    for (const h of await B.all("SELECT mat, catalogue_id FROM frm_habilitations WHERE expire_le IS NOT NULL AND expire_le <= ?", ajoutJours(auj(), 90))){ const c = catId.get(h.catalogue_id); if (c && pres.has(String(h.mat))) ajouter(String(h.mat), c, "echeance"); }
    if (apercu) return a_creer.length;
    const t = maint();
    for (let k = 0; k < a_creer.length; k += 500){
      const lot = a_creer.slice(k, k + 500);
      await B.transaction(async ()=>{ await B.run("INSERT INTO frm_besoins(id,mat,catalogue_id,origine,statut,cree,par) VALUES "+lot.map(()=>"(?,?,?,?,'ouvert',?,?)").join(","), ...[].concat(...lot.map(r=>[id("fb"), r[0], r[1], r[2], t, login]))); });
      await new Promise(r=>setImmediate(r));
    }
    if (a_creer.length) await audit(login, "formation.besoins.generes", a_creer.length+" besoin(s)");
    return a_creer.length;
  }
  /* besoins des salariés sortis : annulés (ils restaient ouverts et comptés « à traiter ») */
  async function besoinsSortis(){
    const E = await D.employes(); if (!E.length) return 0;
    const l = listeSql(B, "mat", E.filter(e=>!sorti(e)).map(e=>String(e.mat)), true);
    const r = await B.run("UPDATE frm_besoins SET statut='annule' WHERE statut='ouvert'"+l.sql, ...l.a);
    if (r.n) await audit("systeme", "formation.besoins.annules", r.n+" besoin(s) de salariés sortis ou supprimés");
    return r.n;
  }
  async function aTraiter(x){
    const dr = droitsEcran(x.admin, x.P), out = []; if (!dr.voir) return out;
    const a = auj(), pmB = perimSql(B, x.P, "b.mat"), pr = listeSql(B, "b.mat", await presents());
    if (dr.valider){
      /* correctif 37 : besoins de salariés présents, formations actives */
      const b = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins b JOIN frm_catalogue c ON c.id=b.catalogue_id AND c.actif=1 WHERE b.statut='ouvert'"+pmB.sql+pr.sql, ...pmB.a, ...pr.a)).n);
      if (b) out.push({domaine:"talents", cle:"formation-besoins", nombre:b, urgence:1, vue:"formation"});
      /* sessions à clôturer : du périmètre (créateur ou inscrits du périmètre) */
      const pmI = perimSql(B, x.P, "i.mat");
      const s = Number((await B.get("SELECT COUNT(*) n FROM frm_sessions s WHERE s.statut='planifiee' AND s.fin < ?"+(x.P.set === null ? "" : " AND (s.par=? OR EXISTS (SELECT 1 FROM frm_inscriptions i WHERE i.session_id=s.id"+pmI.sql+"))"), a, ...(x.P.set === null ? [] : [x.C.login, ...pmI.a]))).n);
      if (s) out.push({domaine:"talents", cle:"formation-a-cloturer", nombre:s, urgence:1, vue:"formation"});
    }
    if (dr.modifier){ const pmH = perimSql(B, x.P, "b.mat");
      const h = Number((await B.get("SELECT COUNT(*) n FROM frm_habilitations b JOIN frm_catalogue c ON c.id=b.catalogue_id AND c.actif=1 WHERE b.expire_le IS NOT NULL AND b.expire_le <= ?"+pmH.sql+pr.sql, ajoutJours(a, 30), ...pmH.a, ...pr.a)).n);
      if (h) out.push({domaine:"talents", cle:"habilitations-echeance", nombre:h, urgence:2, vue:"formation"}); }
    return out;
  }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir) return null;
    const m = String(x.mat), a = auj();
    const real = Number((await B.get("SELECT COUNT(*) n FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id WHERE i.mat=? AND s.statut='realisee' AND i.presence='present'", m)).n);
    const bes = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins WHERE mat=? AND statut IN ('ouvert','planifie')", m)).n);
    const hab = await B.all("SELECT h.expire_le, c.titre FROM frm_habilitations h JOIN frm_catalogue c ON c.id=h.catalogue_id WHERE h.mat=? ORDER BY (h.expire_le IS NULL), h.expire_le", m);
    const valides = hab.filter(h=>!h.expire_le || h.expire_le >= a), proch = valides.find(h=>h.expire_le);
    if (!real && !bes && !hab.length) return null;
    return {cle:"formation", vue:"formation", lignes:[{k:"frmRealisees", v:String(real)}, {k:"frmBesoins", v:String(bes), alerte:bes > 0},
      {k:"frmHabilitations", v:valides.length+" / "+hab.length, alerte:valides.length < hab.length}, {k:"frmProchaine", v:proch ? proch.titre+" — "+jj(proch.expire_le) : "—", alerte:!!(proch && proch.expire_le <= ajoutJours(a, 30))}]};
  }
  /* lecture stricte d'un élément du catalogue (création et modification) */
  async function lireCatalogue(b, txt, avant){
    const v = (k, d) => b[k] === undefined ? d : b[k];
    const code = b.code === undefined && avant ? avant.code : txt(b, "code", 20), titre = b.titre === undefined && avant ? avant.titre : txt(b, "titre", 120);
    const type = v("type", avant ? avant.type : "formation"); if (type !== "formation" && type !== "habilitation") return {err:"type"};
    if (!code || !titre) return {err:"codeTitre"};
    const dureeH = v("dureeH", avant ? avant.duree_h : 0) == null || v("dureeH", 0) === "" ? 0 : +v("dureeH", avant ? avant.duree_h : 0);
    if (!(Number.isFinite(dureeH) && dureeH >= 0 && dureeH <= 2000 && Number.isInteger(dureeH * 2))) return {err:"duree"};
    let validite = null;
    if (type === "habilitation"){ validite = +v("validiteMois", avant ? avant.validite_mois : null); if (!Number.isInteger(validite) || validite < 1 || validite > 240) return {err:"validite"}; }
    const competenceId = v("competenceId", avant ? avant.competence_id : null) || null;
    let niveauVise = null;
    if (competenceId){
      const sv = SC(); let lc = []; if (sv) try { lc = await sv.catalogue(); } catch(e){}
      if (!lc.some(c=>c && String(c.id) === String(competenceId))) return {err:"competence"};
      niveauVise = +v("niveauVise", avant ? avant.niveau_vise : 1); if (!Number.isInteger(niveauVise) || niveauVise < 1 || niveauVise > 4) return {err:"niveau"};
    }
    const organisme = b.organisme === undefined && avant ? (avant.organisme || "") : txt(b, "organisme", 80);
    return {code, titre, type, dureeH, validite, competenceId:competenceId ? String(competenceId) : null, niveauVise, organisme};
  }
  /* rattache le besoin ouvert (ou planifié ailleurs) d'un salarié à une inscription */
  async function besoinPour(mat, cid){ return await B.get("SELECT id FROM frm_besoins WHERE mat=? AND catalogue_id=? AND statut IN ('ouvert','planifie') ORDER BY (statut='ouvert') DESC, cree LIMIT 1", mat, cid); }
  /* un besoin redevient « ouvert » seulement s'il n'est plus porté par aucune autre inscription en cours */
  async function rouvrirBesoin(bid, sauf){ if (!bid) return;
    if (await B.get("SELECT 1 FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id WHERE i.besoin_id=? AND i.session_id <> ? AND s.statut='planifiee'", bid, sauf)) return;
    await B.run("UPDATE frm_besoins SET statut='ouvert' WHERE id=? AND statut='planifie'", bid); }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ const l = (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    /* correctif 40 : err renvoie true — « if (e) return e » après tx() arrêtait le traitement seulement en apparence
       (json renvoie undefined : l'audit et une seconde réponse suivaient un refus) */
    const err = (st, k, v) => { json(res, st, {message:m(k, v), code:k}); return true; };
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k}); return String(v).trim().slice(0, max); };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ}); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P);
    if (dr.rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const refuse = () => err(403, "refuse");
    const droits = {creer:dr.creer, modifier:dr.modifier, valider:dr.valider, parametrer:dr.parametrer, exporter:dr.exporter};
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); return null; } catch(e){ if (e && e.st) return err(e.st, e.message, e.v); if (/unique|duplicate|constraint/i.test((e && e.message) || "")) return err(409, "concurrence"); throw e; } };
    if (p === "/api/v1/formation/catalogue" && req.method === "GET"){
      let comps = []; const sv = SC(); if (sv) try { comps = await sv.catalogue(); } catch(e){}
      const ref = await (D.referentielLecture || D.referentiel)() || {}, sv2 = await sitesVus(P);
      return json(res, 200, {catalogue:(await B.all("SELECT * FROM frm_catalogue WHERE actif=1 ORDER BY type, code")).map(c=>Object.assign(c, {validite_mois:c.validite_mois == null ? null : Number(c.validite_mois), niveau_vise:c.niveau_vise == null ? null : Number(c.niveau_vise), duree_h:c.duree_h == null ? null : Number(c.duree_h)})),
        competences:comps, sites:(ref.sites||[]).filter(s=>s && (sv2 === null || sv2.has(s.id))).map(s=>({id:s.id, nom:s.nom || s.id})), droits});
    }
    if (p === "/api/v1/formation/catalogue" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const r = await lireCatalogue(await corpsJson(req), txt); if (r.err) return err(400, r.err);
      const i = id("fc");
      const e = await tx(async ()=>{
        /* correctif 37 : code unique sous verrou (deux créations simultanées donnaient deux « DUP » sous PostgreSQL) */
        await verrou("frm:code:"+r.code.toLowerCase());
        if (await B.get("SELECT 1 FROM frm_catalogue WHERE lower(code)=lower(?) AND actif=1", r.code)) throw ko(409, "codePris", {c:r.code});
        await B.run("INSERT INTO frm_catalogue(id,code,titre,type,duree_h,validite_mois,competence_id,niveau_vise,organisme,actif,cree) VALUES(?,?,?,?,?,?,?,?,?,1,?)", i, r.code, r.titre, r.type, r.dureeH, r.validite, r.competenceId, r.niveauVise, r.organisme, maint());
      }); if (e) return e;
      await audit(C.login, "formation.catalogue", "ajout "+i+" "+r.code+" "+r.titre, ip); return json(res, 200, {ok:true, id:i});
    }
    /* correctif 34 : retrait ; correctif 37 : modification d'un élément du catalogue */
    const mcr = /^\/api\/v1\/formation\/catalogue\/([^/]+)(\/retirer)?$/.exec(p);
    if (mcr && req.method === "POST"){ if (!dr.parametrer) return err(403, "parametrage");
      const c = await B.get("SELECT * FROM frm_catalogue WHERE id=? AND actif=1", mcr[1]); if (!c) return err(404, "formationIntrouvable");
      if (mcr[2]){
        if (await B.get("SELECT 1 FROM frm_sessions WHERE catalogue_id=? AND statut='planifiee'", c.id)) return err(409, "sessionPlanifiee");
        await B.transaction(async ()=>{ await B.run("UPDATE frm_catalogue SET actif=0 WHERE id=?", c.id); await B.run("UPDATE frm_besoins SET statut='annule' WHERE catalogue_id=? AND statut='ouvert'", c.id); });
        await audit(C.login, "formation.catalogue", "retrait "+c.code+" "+c.titre, ip); return json(res, 200, {ok:true}); }
      const r = await lireCatalogue(await corpsJson(req), txt, c); if (r.err) return err(400, r.err);
      const e = await tx(async ()=>{
        await verrou("frm:code:"+r.code.toLowerCase());
        if (r.code.toLowerCase() !== String(c.code).toLowerCase() && await B.get("SELECT 1 FROM frm_catalogue WHERE lower(code)=lower(?) AND actif=1 AND id <> ?", r.code, c.id)) throw ko(409, "codePris", {c:r.code});
        await B.run("UPDATE frm_catalogue SET code=?, titre=?, type=?, duree_h=?, validite_mois=?, competence_id=?, niveau_vise=?, organisme=? WHERE id=?", r.code, r.titre, r.type, r.dureeH, r.validite, r.competenceId, r.niveauVise, r.organisme, c.id);
      }); if (e) return e;
      await audit(C.login, "formation.catalogue", "modification "+c.id+" "+c.code+" → "+r.code+" « "+r.titre+" »", ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/formation/besoins" && req.method === "GET"){
      const st = ["ouvert","planifie","realise","annule"].indexOf(q.statut) >= 0 ? q.statut : "ouvert", nm = await nomsDe(), pm = perimSql(B, P, "b.mat");
      const w = " WHERE b.statut=?"+(q.catalogue ? " AND b.catalogue_id=?" : "")+pm.sql, aa = (q.catalogue ? [st, String(q.catalogue)] : [st]).concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins b"+w, ...aa)).n);
      const l = await B.all("SELECT b.id, b.mat, b.catalogue_id, b.origine, b.statut, b.cree, c.titre, c.code, c.type FROM frm_besoins b JOIN frm_catalogue c ON c.id=b.catalogue_id"+w+" ORDER BY c.code, b.mat, b.id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, droits, lignes:l.map(r=>Object.assign(r, {nom:nm(r.mat)}))});
    }
    if (p === "/api/v1/formation/besoins/generer" && req.method === "POST"){ if (!dr.valider) return refuse();
      const b = await corpsJson(req);
      if (b.apercu === true) return json(res, 200, {ok:true, apercu:await generer(P, C.login, true)});
      return json(res, 200, {ok:true, crees:await generer(P, C.login)}); }
    if (p === "/api/v1/formation/besoins" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), cid = txt(b, "catalogueId", 60);
      const em = mat && dans(P, mat) ? await actifEmp(mat) : null;
      if (!em){ if (em === false) return err(409, "sortiBesoin"); return err(404, "salarie"); }
      const c = await B.get("SELECT code FROM frm_catalogue WHERE id=? AND actif=1", cid); if (!c) return err(400, "formationInconnue");
      const i = id("fb");
      const e = await tx(async ()=>{ await verrou("frm:besoin:"+mat+"|"+cid);
        if (await B.get("SELECT 1 FROM frm_besoins WHERE mat=? AND catalogue_id=? AND statut IN ('ouvert','planifie')", mat, cid)) throw ko(409, "besoinExiste");
        await B.run("INSERT INTO frm_besoins(id,mat,catalogue_id,origine,statut,cree,par) VALUES(?,?,?,?,?,?,?)", i, mat, cid, b.origine === "evaluation" ? "evaluation" : "manuel", "ouvert", maint(), C.login); }); if (e) return e;
      await audit(C.login, "formation.besoin", mat+" — "+c.code, ip);
      return json(res, 200, {ok:true, id:i});
    }
    /* correctif 37 : annulation d'un besoin ouvert (avec motif) */
    const mba = /^\/api\/v1\/formation\/besoins\/([^/]+)\/annuler$/.exec(p);
    if (mba && req.method === "POST"){ if (!dr.valider) return refuse();
      const bz = await B.get("SELECT * FROM frm_besoins WHERE id=?", mba[1]); if (!bz || !dans(P, bz.mat)) return err(404, "besoinIntrouvable");
      const motif = txt(await corpsJson(req), "motif", 300); if (!motif) return err(400, "motif");
      const r = await B.run("UPDATE frm_besoins SET statut='annule' WHERE id=? AND statut='ouvert'", bz.id); if (!r.n) return err(409, "besoinOuvert");
      await audit(C.login, "formation.besoin", bz.mat+" — besoin "+bz.id+" annulé : "+motif, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/formation/sessions" && req.method === "GET"){
      const pmI = perimSql(B, P, "i.mat"), sv = await sitesVus(P);
      let w = " WHERE 1=1", aa = [];
      if (P.set !== null){ const ls = listeSql(B, "ss.site_id", Array.from(sv));
        w += " AND (s.par=? OR EXISTS (SELECT 1 FROM frm_session_sites ss WHERE ss.session_id=s.id"+ls.sql+") OR EXISTS (SELECT 1 FROM frm_inscriptions i WHERE i.session_id=s.id"+pmI.sql+"))"; aa = [C.login, ...ls.a, ...pmI.a]; }
      if (["planifiee","realisee","annulee"].indexOf(q.statut) >= 0){ w += " AND s.statut=?"; aa.push(q.statut); }
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_sessions s"+w, ...aa)).n);
      const l = await B.all("SELECT s.*, c.titre, c.code, c.type, (SELECT site_id FROM frm_session_sites ss WHERE ss.session_id=s.id) site_id, (SELECT COUNT(*) FROM frm_inscriptions i WHERE i.session_id=s.id) inscrits FROM frm_sessions s JOIN frm_catalogue c ON c.id=s.catalogue_id"+w+" ORDER BY s.debut DESC, s.id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {sessions:l.map(s=>Object.assign(s, {inscrits:Number(s.inscrits), places:Number(s.places)})), total, droits});
    }
    /* lecture stricte des champs d'une session (création et modification) */
    const lireSession = async (b, avant) => {
      const debut = b.debut === undefined && avant ? avant.debut : b.debut, fin = b.fin === undefined && avant ? avant.fin : b.fin;
      if (!dateOk(debut) || !dateOk(fin) || fin < debut) return {err:"dates"};
      const places = b.places === undefined || b.places === null || b.places === "" ? (avant ? Number(avant.places) : 12) : +b.places;
      if (!Number.isInteger(places) || places < 1 || places > 500) return {err:"places"};
      let siteId = b.siteId === undefined ? (avant ? avant.site_id || null : null) : (b.siteId ? txt(b, "siteId", 60) : null);
      const ref = await (D.referentielLecture || D.referentiel)() || {}, sv = await sitesVus(P);
      if (siteId && !(ref.sites||[]).some(s=>s && s.id === siteId)) return {err:"site"};
      if (sv !== null && (!siteId || !sv.has(siteId)) && !(avant && avant.site_id === siteId)) return {err:"site"};
      return {debut, fin, places, siteId, lieu:b.lieu === undefined && avant ? avant.lieu || "" : txt(b, "lieu", 80), formateur:b.formateur === undefined && avant ? avant.formateur || "" : txt(b, "formateur", 80)};
    };
    if (p === "/api/v1/formation/sessions" && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), cid = txt(b, "catalogueId", 60);
      if (!await B.get("SELECT 1 FROM frm_catalogue WHERE id=? AND actif=1", cid)) return err(400, "formationInconnue");
      const r = await lireSession(b); if (r.err) return err(400, r.err);
      const i = id("fs"); let ins = 0;
      const e = await tx(async ()=>{
        await B.run("INSERT INTO frm_sessions(id,catalogue_id,debut,fin,lieu,formateur,places,statut,cree,par) VALUES(?,?,?,?,?,?,?,?,?,?)", i, cid, r.debut, r.fin, r.lieu, r.formateur, r.places, "planifiee", maint(), C.login);
        if (r.siteId) await B.run("INSERT INTO frm_session_sites(session_id, site_id) VALUES(?,?)", i, r.siteId);
        /* inscription directe des besoins ouverts de cette formation (dans la limite des places) */
        if (b.besoins === true){ const pres = new Set(await presents());
          const l = (await B.all("SELECT * FROM frm_besoins WHERE catalogue_id=? AND statut='ouvert' ORDER BY cree, id LIMIT 5000", cid)).filter(z=>dans(P, z.mat) && pres.has(String(z.mat))).slice(0, r.places);
          const t = maint();
          for (let k = 0; k < l.length; k += 200){ const lot = l.slice(k, k + 200);
            await B.run("INSERT INTO frm_inscriptions(id,session_id,mat,besoin_id,presence,maj,par) VALUES "+lot.map(()=>"(?,?,?,?,'inscrit',?,?)").join(","), ...[].concat(...lot.map(z=>[id("fi"), i, z.mat, z.id, t, C.login])));
            const lb = listeSql(B, "id", lot.map(z=>z.id)); await B.run("UPDATE frm_besoins SET statut='planifie' WHERE statut='ouvert'"+lb.sql, ...lb.a); }
          ins = l.length; }
      }); if (e) return e;
      await audit(C.login, "formation.session", i+" du "+jj(r.debut)+" au "+jj(r.fin)+(r.siteId ? ", site "+r.siteId : "")+" — "+ins+" inscrit(s)", ip); return json(res, 200, {ok:true, id:i, inscrits:ins});
    }
    const ms = /^\/api\/v1\/formation\/sessions\/([^/]+)(?:\/(inscrire|desinscrire|presence|presence-lot|cloturer|annuler|emargement))?$/.exec(p);
    if (ms){
      const s = await B.get("SELECT s.*, c.titre, c.code, c.type, c.competence_id, c.niveau_vise, c.validite_mois, (SELECT site_id FROM frm_session_sites ss WHERE ss.session_id=s.id) site_id FROM frm_sessions s JOIN frm_catalogue c ON c.id=s.catalogue_id WHERE s.id=?", ms[1]);
      if (!s || !await sessionVue(P, C.login, s)) return err(404, "sessionIntrouvable");
      s.places = Number(s.places);
      if (!ms[2] && req.method === "GET"){ const nm = await nomsDe();
        const tous = await B.all("SELECT * FROM frm_inscriptions WHERE session_id=? ORDER BY mat", s.id);
        return json(res, 200, {session:Object.assign(s, {inscrits:tous.length}), droits, inscriptions:tous.filter(r=>dans(P, r.mat)).map(r=>Object.assign(r, {nom:nm(r.mat)})), horsPerimetre:tous.filter(r=>!dans(P, r.mat)).length}); }
      /* correctif 37 : feuille d'émargement (CSV) */
      if (ms[2] === "emargement" && req.method === "GET"){
        if (!dr.exporter) return refuse();
        const nm = await nomsDe(), l = (await B.all("SELECT * FROM frm_inscriptions WHERE session_id=? ORDER BY mat", s.id)).filter(r=>dans(P, r.mat));
        const T = [["Matricule","Nom","Présence","Résultat","Signature"], ["Employee ID","Name","Attendance","Result","Signature"], ["المعرف","الاسم","الحضور","النتيجة","الإمضاء"]][L];
        const cel = v => { let z = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(z)) z = "'"+z; return /[";\n\r]/.test(z) ? '"'+z.replace(/"/g, '""')+'"' : z; };
        const csv = "﻿"+[[s.code+" — "+s.titre, jj(s.debut)+" → "+jj(s.fin), s.lieu || "", s.formateur || ""].map(cel).join(";"), T.join(";")].concat(l.map(r=>[r.mat, nm(r.mat), (PRES[r.presence] || [r.presence])[L], r.resultat ? (RES[r.resultat] || [r.resultat])[L] : "", ""].map(cel).join(";"))).join("\r\n");
        await audit(C.login, "formation.emargement", s.id+" : "+l.length+" inscrit(s)", ip);
        res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"emargement-"+s.id+".csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
        return res.end(csv);
      }
      /* correctif 37 : modification d'une session planifiée (dates, lieu, formateur, places ≥ inscrits, site) */
      if (!ms[2] && req.method === "POST"){
        if (!dr.valider) return refuse();
        if (s.statut !== "planifiee") return err(409, s.statut === "annulee" ? "annulee" : "cloturee");
        const r = await lireSession(await corpsJson(req), s); if (r.err) return err(400, r.err);
        const e = await tx(async ()=>{ await verrou("frm:"+s.id);
          const n = Number((await B.get("SELECT COUNT(*) n FROM frm_inscriptions WHERE session_id=?", s.id)).n); if (r.places < n) throw ko(409, "placesInscrits", {n});
          const u1 = await B.run("UPDATE frm_sessions SET debut=?, fin=?, lieu=?, formateur=?, places=? WHERE id=? AND statut='planifiee'", r.debut, r.fin, r.lieu, r.formateur, r.places, s.id); if (!u1.n) throw ko(409, "concurrence");
          if (r.siteId !== (s.site_id || null)){ await B.run("DELETE FROM frm_session_sites WHERE session_id=?", s.id); if (r.siteId) await B.run("INSERT INTO frm_session_sites(session_id, site_id) VALUES(?,?)", s.id, r.siteId); }
        }); if (e) return e;
        await audit(C.login, "formation.session", s.id+" modifiée : "+jj(s.debut)+"–"+jj(s.fin)+" → "+jj(r.debut)+"–"+jj(r.fin)+", places "+s.places+" → "+r.places, ip); return json(res, 200, {ok:true});
      }
      if (req.method !== "POST") return err(404, "introuvable");
      if (s.statut !== "planifiee") return err(409, s.statut === "annulee" ? "annulee" : "cloturee");
      /* correctif 34 : annulation — besoins rouverts ; correctif 37 : sous verrou, passage conditionnel (une clôture et
         une annulation simultanées répondaient toutes deux OK et la session finissait clôturée) */
      if (ms[2] === "annuler"){
        if (!dr.valider) return refuse();
        const l = await B.all("SELECT * FROM frm_inscriptions WHERE session_id=?", s.id);
        if (P.set !== null && l.some(r=>!dans(P, r.mat))) return err(403, "horsPerim");
        const e = await tx(async ()=>{ await verrou("frm:"+s.id);
          const r = await B.run("UPDATE frm_sessions SET statut='annulee' WHERE id=? AND statut='planifiee'", s.id); if (!r.n) throw ko(409, "concurrence");
          for (const z of l) await rouvrirBesoin(z.besoin_id, s.id); }); if (e) return e;
        await audit(C.login, "formation.session.annulee", s.titre+" ("+s.id+") du "+jj(s.debut)+" — "+l.length+" inscrit(s), besoins rouverts", ip); return json(res, 200, {ok:true}); }
      if (ms[2] === "inscrire"){
        if (!dr.creer) return refuse();
        const mat = txt(await corpsJson(req), "mat", 40);
        const em = mat && dans(P, mat) ? await actifEmp(mat) : null;
        if (!em){ if (em === false) return err(409, "sortiInscr"); return err(404, "salarie"); }
        if (s.fin < auj()) return err(409, "terminee", {d:jj(s.fin)});
        /* correctif 37 : places et doublon contrôlés sous verrou (six inscriptions simultanées donnaient 5 inscrits pour
           2 places sous PostgreSQL ; trois du même salarié → erreur 500) */
        const e = await tx(async ()=>{ await verrou("frm:"+s.id);
          const st = await B.get("SELECT statut, places FROM frm_sessions WHERE id=?", s.id); if (st.statut !== "planifiee") throw ko(409, "concurrence");
          if (await B.get("SELECT 1 FROM frm_inscriptions WHERE session_id=? AND mat=?", s.id, mat)) throw ko(409, "dejaInscrit");
          if (Number((await B.get("SELECT COUNT(*) n FROM frm_inscriptions WHERE session_id=?", s.id)).n) >= Number(st.places)) throw ko(409, "complete");
          const bes = await besoinPour(mat, s.catalogue_id);
          await B.run("INSERT INTO frm_inscriptions(id,session_id,mat,besoin_id,presence,maj,par) VALUES(?,?,?,?,?,?,?)", id("fi"), s.id, mat, bes ? bes.id : null, "inscrit", maint(), C.login);
          if (bes) await B.run("UPDATE frm_besoins SET statut='planifie' WHERE id=?", bes.id); }); if (e) return e;
        await audit(C.login, "formation.inscription", mat+" — "+s.titre+" ("+s.id+")", ip);
        return json(res, 200, {ok:true});
      }
      /* correctif 37 : désinscription (besoin rouvert s'il n'est porté par aucune autre session) */
      if (ms[2] === "desinscrire"){
        if (!dr.modifier) return refuse();
        const i = await B.get("SELECT * FROM frm_inscriptions WHERE id=? AND session_id=?", txt(await corpsJson(req), "inscriptionId", 60), s.id);
        if (!i || !dans(P, i.mat)) return err(404, "inscrIntrouvable");
        const e = await tx(async ()=>{ await verrou("frm:"+s.id); await B.run("DELETE FROM frm_inscriptions WHERE id=?", i.id); await rouvrirBesoin(i.besoin_id, s.id); }); if (e) return e;
        await audit(C.login, "formation.desinscription", i.mat+" — "+s.titre+" ("+s.id+")", ip); return json(res, 200, {ok:true});
      }
      if (ms[2] === "presence"){
        if (!dr.modifier) return refuse();
        if (s.debut > auj()) return err(409, "pasCommencee", {d:jj(s.debut)});
        const b = await corpsJson(req), i = await B.get("SELECT * FROM frm_inscriptions WHERE id=? AND session_id=?", txt(b, "inscriptionId", 60), s.id);
        if (!i || !dans(P, i.mat)) return err(404, "inscrIntrouvable");
        if (b.presence !== undefined && ["inscrit","present","absent","excuse"].indexOf(b.presence) < 0) return err(400, "presence");
        if (b.resultat !== undefined && b.resultat !== null && ["acquis","non_acquis",""].indexOf(b.resultat) < 0) return err(400, "resultat");
        /* correctif 34 : un absent n'a pas de résultat ; correctif 37 : « excusé », résultat effaçable */
        const pr = b.presence === undefined ? i.presence : b.presence, re = pr !== "present" ? null : (b.resultat === undefined ? i.resultat : (b.resultat || null));
        await B.run("UPDATE frm_inscriptions SET presence=?, resultat=?, maj=?, par=? WHERE id=?", pr, re, maint(), C.login, i.id);
        if (pr !== i.presence || re !== i.resultat) await audit(C.login, "formation.presence", i.mat+" — "+s.titre+" : "+i.presence+"/"+(i.resultat||"—")+" → "+pr+"/"+(re||"—"), ip);
        return json(res, 200, {ok:true});
      }
      if (ms[2] === "presence-lot"){
        if (!dr.modifier) return refuse();
        if (s.debut > auj()) return err(409, "pasCommencee", {d:jj(s.debut)});
        const b = await corpsJson(req), pr = ["present","absent","excuse"].indexOf(b.presence) >= 0 ? b.presence : null; if (!pr) return err(400, "presence");
        const re = pr === "present" && ["acquis","non_acquis"].indexOf(b.resultat) >= 0 ? b.resultat : null;
        const l = (await B.all("SELECT * FROM frm_inscriptions WHERE session_id=? AND presence='inscrit'", s.id)).filter(r=>dans(P, r.mat));
        await B.transaction(async ()=>{ for (const r of l) await B.run("UPDATE frm_inscriptions SET presence=?, resultat=?, maj=?, par=? WHERE id=? AND presence='inscrit'", pr, re, maint(), C.login, r.id); });
        if (l.length) await audit(C.login, "formation.presence", s.titre+" ("+s.id+") : "+l.length+" inscrit(s) → "+pr+"/"+(re||"—"), ip);
        return json(res, 200, {ok:true, n:l.length});
      }
      if (ms[2] === "cloturer"){
        if (!dr.valider) return refuse();
        const l = await B.all("SELECT * FROM frm_inscriptions WHERE session_id=?", s.id);
        /* 56.33.11 : refusée à un valideur limité dès qu'un inscrit est hors de son périmètre */
        if (P.set !== null && l.some(r=>!dans(P, r.mat))) return err(403, "horsPerim");
        if (s.fin > auj()) return err(409, "nonTerminee", {d:jj(s.fin)});
        if (!l.length) return err(409, "vide");
        if (l.some(r=>r.presence === "inscrit")) return err(409, "presenceManquante");
        /* correctif 37 : un présent sans résultat bloque la clôture (son besoin était rouvert sans avertissement) */
        const sansRes = l.filter(r=>r.presence === "present" && !r.resultat).length; if (sansRes) return err(409, "resultatManquant", {n:sansRes});
        const pres = new Set(await presents()), sv = s.competence_id && s.niveau_vise ? SC() : null;
        let niveaux = 0, habs = 0, ignores = 0;
        const e = await tx(async ()=>{ await verrou("frm:"+s.id);
          /* correctif 37 : passage conditionnel (trois clôtures simultanées → deux succès et deux audits) */
          const r0 = await B.run("UPDATE frm_sessions SET statut='realisee' WHERE id=? AND statut='planifiee'", s.id); if (!r0.n) throw ko(409, "concurrence");
          for (const r of l){
            const ok = r.presence === "present" && r.resultat === "acquis";
            if (r.besoin_id){ if (ok) await B.run("UPDATE frm_besoins SET statut='realise' WHERE id=?", r.besoin_id); else await rouvrirBesoin(r.besoin_id, s.id); }
            if (!ok) continue;
            /* correctif 37 : rien n'est reporté pour un salarié sorti (une habilitation lui était créée) */
            if (!pres.has(String(r.mat))){ ignores++; continue; }
            /* v56.30 (§ 2) : niveau reporté par le service déclaré de FW-Competences */
            if (sv && await sv.porterNiveau(r.mat, s.competence_id, Number(s.niveau_vise), C.login, "formation : "+s.titre, s.fin)) niveaux++;
            if (s.type === "habilitation"){
              const exp = s.validite_mois ? ajoutMois(s.fin, Number(s.validite_mois)) : null;
              const w = await B.run("INSERT INTO frm_habilitations(id,mat,catalogue_id,obtenue_le,expire_le,session_id,maj) VALUES(?,?,?,?,?,?,?) ON CONFLICT(mat, catalogue_id) DO UPDATE SET obtenue_le=excluded.obtenue_le, expire_le=excluded.expire_le, session_id=excluded.session_id, maj=excluded.maj WHERE excluded.obtenue_le >= frm_habilitations.obtenue_le",
                id("fh"), r.mat, s.catalogue_id, s.fin, exp, s.id, maint());
              if (w.n) habs++;
            }
          }
        }); if (e) return e;
        await audit(C.login, "formation.session.cloturee", s.titre+" ("+s.id+") : "+niveaux+" niveau(x), "+habs+" habilitation(s)"+(ignores ? ", "+ignores+" salarié(s) sorti(s) ignoré(s)" : ""), ip);
        return json(res, 200, {ok:true, niveaux, habilitations:habs, ignores});
      }
      return err(404, "introuvable");
    }
    if (p === "/api/v1/formation/habilitations" && req.method === "GET"){
      const a = auj(), nm = await nomsDe(), pm = perimSql(B, P, "h.mat");
      let w = " WHERE 1=1"+pm.sql, aa = pm.a.slice();
      if (q.filtre === "echeance"){ const pr = listeSql(B, "h.mat", await presents()); w += " AND h.expire_le IS NOT NULL AND h.expire_le <= ?"+pr.sql; aa = aa.concat([ajoutJours(a, 90)], pr.a); }
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_habilitations h"+w, ...aa)).n);
      const l = await B.all("SELECT h.id, h.mat, h.catalogue_id, h.obtenue_le, h.expire_le, c.titre, c.code, c.actif FROM frm_habilitations h JOIN frm_catalogue c ON c.id=h.catalogue_id"+w+" ORDER BY (h.expire_le IS NULL), h.expire_le, h.id LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, droits, lignes:l.map(r=>Object.assign(r, {nom:nm(r.mat), actif:Number(r.actif), etat:!r.expire_le ? "valide" : r.expire_le < a ? "expiree" : r.expire_le <= ajoutJours(a, 30) ? "j30" : r.expire_le <= ajoutJours(a, 90) ? "j90" : "valide"}))});
    }
    /* correctif 37 : saisie d'une habilitation obtenue hors session (antérieure à l'outil, organisme externe) */
    if (p === "/api/v1/formation/habilitations" && req.method === "POST"){
      if (!dr.valider) return refuse();
      const b = await corpsJson(req), mat = txt(b, "mat", 40), cid = txt(b, "catalogueId", 60), le = txt(b, "obtenueLe", 10);
      const em = mat && dans(P, mat) ? await actifEmp(mat) : null; if (!em){ if (em === false) return err(409, "sortiBesoin"); return err(404, "salarie"); }
      const c = await B.get("SELECT * FROM frm_catalogue WHERE id=? AND actif=1", cid); if (!c) return err(400, "formationInconnue"); if (c.type !== "habilitation") return err(400, "pasHab");
      if (!dateOk(le) || le > auj()) return err(400, "dateHab");
      const exp = c.validite_mois ? ajoutMois(le, Number(c.validite_mois)) : null;
      const w = await B.run("INSERT INTO frm_habilitations(id,mat,catalogue_id,obtenue_le,expire_le,session_id,maj) VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(mat, catalogue_id) DO UPDATE SET obtenue_le=excluded.obtenue_le, expire_le=excluded.expire_le, session_id=NULL, maj=excluded.maj WHERE excluded.obtenue_le >= frm_habilitations.obtenue_le", id("fh"), mat, cid, le, exp, maint());
      await audit(C.login, "formation.habilitation", mat+" — "+c.code+" obtenue le "+jj(le)+(exp ? ", échéance "+jj(exp) : "")+(w.n ? "" : " (plus ancienne que l'existante : ignorée)"), ip);
      return json(res, 200, {ok:true, enregistree:!!w.n, expireLe:exp});
    }
    /* correctif 37 : historique de formation d'un salarié (droit d'accès) */
    if (p === "/api/v1/formation/historique" && req.method === "GET"){
      const mat = String(q.mat || ""); if (!mat || !dans(P, mat)) return err(404, "salarie");
      const sessions = await B.all("SELECT s.id, s.debut, s.fin, s.statut, c.code, c.titre, i.presence, i.resultat FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id JOIN frm_catalogue c ON c.id=s.catalogue_id WHERE i.mat=? ORDER BY s.debut DESC", mat);
      const habilitations = await B.all("SELECT h.obtenue_le, h.expire_le, c.code, c.titre FROM frm_habilitations h JOIN frm_catalogue c ON c.id=h.catalogue_id WHERE h.mat=? ORDER BY c.code", mat);
      const besoins = await B.all("SELECT b.statut, b.origine, b.cree, c.code, c.titre FROM frm_besoins b JOIN frm_catalogue c ON c.id=b.catalogue_id WHERE b.mat=? ORDER BY b.cree DESC", mat);
      return json(res, 200, {mat, sessions, habilitations, besoins});
    }
    return err(404, "introuvable");
    }
  }
  /* besoins d'échéances et d'écarts chaque jour (premier passage 15 min après le démarrage, et non 2 min), puis
     annulation des besoins des salariés sortis */
  if (o.planifier) o.planifier("besoins-echeances", {intervalle:24*3600000, premier:15*60000, priorite:3, delai:10*60000, fn:async ()=>{ const n = await generer({set:null}, "systeme"), a = await besoinsSortis(); return n+" besoin(s) créé(s), "+a+" besoin(s) de salariés sortis annulé(s)"; }});
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
