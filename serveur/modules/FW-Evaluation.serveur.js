/* FW-Evaluation — partie serveur. Campagnes (annuelle, fin de période d'essai…), une évaluation par salarié et par
   campagne (référence par matricule), évaluateur désigné (le responsable du salarié s'il a un compte habilité), objectifs
   avec taux d'atteinte, niveaux de compétences proposés ; à la validation (quatre yeux), les niveaux sont reportés dans
   la matrice des compétences (si FW-Competences est actif) avec historique. Périmètre et matrice de l'écran appliqués. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const listeSql = (B, col, l) => B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[l]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(l)]};
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS eva_campagnes (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type TEXT, debut TEXT NOT NULL, fin TEXT NOT NULL, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS eva_evaluations (id TEXT PRIMARY KEY, campagne_id TEXT NOT NULL, mat TEXT NOT NULL, evaluateur TEXT, statut TEXT NOT NULL, note INTEGER, objectifs TEXT, competences TEXT, commentaire TEXT, maj TEXT NOT NULL, valide_par TEXT, valide_le TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS eva_evaluations_cle ON eva_evaluations(campagne_id, mat)",
  "CREATE INDEX IF NOT EXISTS eva_evaluations_eval ON eva_evaluations(evaluateur, statut)",
  /* correctif 38 : dernier auteur de la saisie (quatre yeux : il ne valide pas) */
  "CREATE TABLE IF NOT EXISTS eva_saisies (evaluation_id TEXT PRIMARY KEY, saisi_par TEXT NOT NULL, le TEXT NOT NULL)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS eva_evaluations_mat ON eva_evaluations(mat, statut)","CREATE INDEX IF NOT EXISTS eva_evaluations_camp ON eva_evaluations(campagne_id, statut)");
ddl.sqlite = ddl.pg;
const tables = {eva_campagnes:"id", eva_evaluations:"id", eva_saisies:"evaluation_id"};
const STATUTS = ["a_faire", "en_cours", "terminee", "validee"];
const TYPES = ["annuelle", "essai", "habil"];
/* correctif 38 : messages dans la langue de l'utilisateur */
const MSG = {
  droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
  masque:["Écran Évaluations masqué pour votre profil.", "Evaluations screen hidden for your profile.", "شاشة التقييمات مخفية لملفك."],
  refuse:["Action non permise par vos droits sur l'écran Évaluations.", "Action not allowed by your rights on the Evaluations screen.", "إجراء غير مسموح بحقوقك على شاشة التقييمات."],
  parametrage:["Lancement et clôture des campagnes réservés au paramétrage.", "Campaigns are restricted to configuration.", "الحملات مخصصة للإعداد."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  campagneDonnees:["Nom et période réelle (début ≤ fin) obligatoires.", "Name and real period (start ≤ end) required.", "الاسم والفترة (البداية ≤ النهاية) إجباريان."],
  type:["Type : annuelle, essai ou habil.", "Type: annual, probation or authorisation.", "النوع: سنوية أو تجربة أو تأهيل."],
  doublon:["Une campagne ouverte porte déjà ce nom et cette période.", "An open campaign already has this name and period.", "حملة مفتوحة بنفس الاسم والفترة."],
  aucunSalarie:["Aucun salarié ne correspond.", "No employee matches.", "لا أجير مطابق."],
  campagneIntrouvable:["Campagne introuvable.", "Campaign not found.", "حملة غير موجودة."],
  dejaClose:["Campagne déjà close.", "Campaign already closed.", "الحملة مغلقة."],
  horsPerim:["La campagne comprend des salariés hors de votre périmètre : action réservée à un compte couvrant tous ses salariés.", "The campaign includes employees outside your scope.", "تشمل الحملة أجراء خارج نطاقك."],
  commencees:["Des évaluations sont commencées : clôturez la campagne au lieu de la supprimer.", "Some evaluations have started: close the campaign instead.", "بدأت تقييمات: أغلق الحملة بدل حذفها."],
  introuvable:["Évaluation introuvable.", "Evaluation not found.", "تقييم غير موجود."],
  cloturee:["Évaluation clôturée (validée ou campagne close).", "Evaluation closed (approved or campaign closed).", "تقييم مغلق."],
  saisieEval:["Seul l'évaluateur désigné saisit cette évaluation (un valideur peut la réassigner).", "Only the designated evaluator can enter this evaluation.", "يدخل المقيم المعين فقط هذا التقييم."],
  soi:["Vous ne pouvez pas saisir ni valider votre propre évaluation.", "You cannot enter or approve your own evaluation.", "لا يمكنك إدخال أو المصادقة على تقييمك."],
  confid:["Contenu confidentiel : accès aux données sensibles requis.", "Confidential content: sensitive data access required.", "محتوى سري."],
  note:["Note : nombre entier de 1 à 5.", "Score: whole number from 1 to 5.", "العدد: عدد صحيح من 1 إلى 5."],
  atteinte:["Atteinte des objectifs : nombre entier de 0 à 100 %.", "Objective achievement: whole number from 0 to 100%.", "نسبة الإنجاز: عدد صحيح من 0 إلى 100."],
  niveau:["Niveau de compétence : nombre entier de 0 à 4.", "Skill level: whole number from 0 to 4.", "مستوى الكفاءة: عدد صحيح من 0 إلى 4."],
  terminer:["Pour terminer : note et atteinte de chaque objectif obligatoires.", "To complete: score and each objective's achievement required.", "للإنهاء: العدد ونسبة كل هدف إجباريان."],
  concurrence:["Évaluation modifiée entre-temps : actualisez.", "Evaluation modified in the meantime: refresh.", "عُدّل التقييم في الأثناء: حدّث."],
  validation:["Validation réservée au droit de validation.", "Approval requires the validation right.", "المصادقة مخصصة لحق المصادقة."],
  quatreYeux:["L'auteur de la saisie ne la valide pas : un autre valideur doit le faire.", "The author of the entry cannot approve it.", "صاحب الإدخال لا يصادق عليه."],
  campagneClose:["Campagne close.", "Campaign closed.", "الحملة مغلقة."],
  pasTerminee:["Seule une évaluation terminée se valide ou se rouvre.", "Only a completed evaluation can be approved or reopened.", "يصادق أو يعاد فتح تقييم منته فقط."],
  motif:["Motif obligatoire.", "Reason required.", "التعليل إجباري."],
  evaluateurKo:["Évaluateur inconnu, inactif, sans droit de saisie ou concerné par l'évaluation.", "Unknown, inactive or ineligible evaluator.", "مقيم غير صالح."],
  export:["Droit d'export requis.", "Export right required.", "يلزم حق التصدير."],
  introuvable2:["Introuvable.", "Not found.", "غير موجود."]
};
function creer(o){
  const {B, D, audit} = o, actif = o.moduleActif || (()=>false), pg = B.type === "pg";
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  const auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  const json2 = v => { try { const x = v ? JSON.parse(v) : []; return Array.isArray(x) ? x : []; } catch(e){ return []; } };
  /* correctif 34 : dates réelles ; correctif 38 : années 2000–2100 */
  const dateOk = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0, 4) < 2000 || +s.slice(0, 4) > 2100) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const entier = v => typeof v === "number" ? (Number.isInteger(v) ? v : NaN) : (typeof v === "string" && /^\d+$/.test(v.trim()) ? +v.trim() : NaN);
  const sorti = e => !!(e && e.sortie && e.sortie < auj());
  const fonctionDe = e => String((e && (e.poste || e.fonction)) || "").trim();
  const PERIM = require("../perimetre.js");
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* matrice de l'écran Évaluations (menu masqué ou en lecture ; actions lire / modifier / valider / exporter) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).evaluation, act = (pr.actions || {}).evaluation || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, modifier:voir && !ro && rang >= 2 && act.modifier !== false, valider:voir && !ro && rang >= 3 && act.valider !== false,
      parametrer:voir && !ro && rang >= 4 && act.creer !== false, supprimer:voir && !ro && rang >= 4 && act.supprimer !== false, exporter:voir && rang >= 3 && act.exporter !== false};
  }
  const voitConfidentiel = (x, ev) => x.admin || (ev && ev.evaluateur === x.C.login) || (x.rang >= 3 && !PERIM.masquePerso(x.P));
  const masquer = ev => Object.assign(ev, {note:null, commentaire:"", objectifs:json2(ev.objectifs).map(z=>({libelle:z.libelle, atteinte:null})), competences:[], confidentiel:true});
  const monMat = async P => { if (!P || !P.u || !P.u.empId) return null; const e = (await D.employes()).find(z=>z.id === P.u.empId); return e ? String(e.mat) : null; };
  /* correctif 38 : comptes pouvant évaluer — actifs, liés à un salarié présent, droit de saisie sur les salariés et
     écran Évaluations visible (un manager sorti ou en lecture seule recevait des évaluations qu'il ne pouvait saisir) */
  async function eligibles(){
    const ref = await (D.referentielLecture || D.referentiel)() || {}, emps = await D.employes(), parId = new Map(emps.map(e=>[e.id, e]));
    const prof = new Map((ref.profils||[]).filter(Boolean).map(p=>[p.id, p])), out = new Map();
    for (const u of (ref.users||[])){ if (!u || u.actif === false || !u.empId) continue; const e = parId.get(u.empId); if (!e || sorti(e)) continue;
      const p = prof.get(u.profilId) || {}, admin = u.role === "admin" || PERIM.niveauProfil(p) === "admin";
      const rang = admin ? 4 : (RANG[(p.droits||{}).EMP] || 0), menu = (p.menus||{}).evaluation, act = (p.actions||{}).evaluation || {};
      if (rang >= 2 && menu !== "masque" && menu !== "lecture" && act.modifier !== false) out.set(String(u.login), String(e.mat)); }
    return out;
  }
  /* évaluateur par défaut : le compte habilité rattaché au responsable du salarié */
  async function evaluateurs(){
    const emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e])), el = await eligibles(), parEmpMat = new Map(Array.from(el).map(([l, m])=>[m, l]));
    return m => { const e = parMat.get(String(m)), c = e && e.chefMat ? parMat.get(String(e.chefMat)) : null; return c && !sorti(c) ? (parEmpMat.get(String(c.mat)) || null) : null; };
  }
  async function aTraiter(x){
    const dr = droitsEcran(x.admin, x.P), out = []; if (!dr.voir) return out;
    const pres = listeSql(B, "a.mat", (await D.employes()).filter(e=>!sorti(e)).map(e=>String(e.mat)));
    if (dr.modifier){ const mien = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE c.statut='ouverte' AND a.evaluateur=? AND a.statut IN ('a_faire','en_cours')"+pres.sql, x.C.login, ...pres.a)).n);
      if (mien) out.push({domaine:"talents", cle:"evaluation-a-faire", nombre:mien, urgence:1, vue:"evaluation"}); }
    /* correctif 38 : campagnes ouvertes seulement ; ni ses propres saisies, ni sa propre évaluation */
    if (dr.valider && !PERIM.masquePerso(x.P)){ const pm = perimSql(B, x.P, "a.mat"), mm = await monMat(x.P);
      const l = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id LEFT JOIN eva_saisies s ON s.evaluation_id=a.id WHERE a.statut='terminee' AND c.statut='ouverte' AND COALESCE(a.evaluateur,'') <> ? AND COALESCE(s.saisi_par,'') <> ? AND a.mat <> ?"+pm.sql+pres.sql, x.C.login, x.C.login, mm || "", ...pm.a, ...pres.a)).n);
      if (l) out.push({domaine:"talents", cle:"evaluation-a-valider", nombre:l, urgence:1, vue:"evaluation"}); }
    return out;
  }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir) return null;
    const e = await B.get("SELECT a.*, c.nom campagne FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE a.mat=? ORDER BY c.debut DESC, c.cree DESC LIMIT 1", String(x.mat)); if (!e) return null;
    /* correctif 38 : moyenne sur les seuls objectifs notés (« 0 % » s'affichait avant toute saisie) */
    const ob = json2(e.objectifs).filter(z=>z && z.atteinte != null), moy = ob.length ? Math.round(ob.reduce((s, z)=>s + Number(z.atteinte), 0) / ob.length) : null;
    const vc = voitConfidentiel({admin:x.admin, C:x.C, P:x.P, rang:dr.rang}, e);
    return {cle:"evaluation", vue:"evaluation", sousTitre:e.campagne, lignes:[{k:"evaStatut_"+e.statut, v:""}].concat(vc ? [{k:"evaNote", v:e.note == null ? "—" : e.note+" / 5"}, {k:"evaObjectifs", v:moy == null ? "—" : moy+" %"}] : [])};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ const l = (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    const err = (st, k, v) => json(res, st, {message:m(k, v), code:k});
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k}); return String(v).trim().slice(0, max); };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ}); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P), rang = dr.rang;
    if (rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const droits = {modifier:dr.modifier, valider:dr.valider, parametrer:dr.parametrer, supprimer:dr.supprimer, exporter:dr.exporter};
    const q = Object.fromEntries(u.searchParams.entries());
    const verrou = async cle => { if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", cle); };
    const ko = (st, k, v) => Object.assign(new Error(k), {st, v});
    const tx = async f => { try { await B.transaction(f); return null; } catch(e){ if (e && e.st) return err(e.st, e.message, e.v); throw e; } };
    const SCv = () => actif("FW-Competences") && o.service ? (o.service("FW-Competences") || {}).service : null;
    if (p === "/api/v1/evaluation/campagnes" && req.method === "GET"){
      /* 56.33.11 : totaux limités au périmètre ; correctif 38 : un compte limité ne voit que les campagnes qui concernent
         son périmètre (ou qu'il a lancées) ; totaux numériques sous PostgreSQL */
      const pm = perimSql(B, P, "a.mat"), pw = P.set === null ? "" : " AND ((1=1"+pm.sql+") OR a.evaluateur=?)", pa = P.set === null ? [] : [...pm.a, C.login];
      const l = (await B.all("SELECT c.*, (SELECT COUNT(*) FROM eva_evaluations a WHERE a.campagne_id=c.id"+pw+") total, (SELECT COUNT(*) FROM eva_evaluations a WHERE a.campagne_id=c.id AND a.statut='validee'"+pw+") validees FROM eva_campagnes c ORDER BY debut DESC, cree DESC LIMIT 100", ...pa, ...pa))
        .map(c=>Object.assign(c, {total:Number(c.total), validees:Number(c.validees)})).filter(c=>P.set === null || c.total > 0 || c.par === C.login);
      return json(res, 200, {campagnes:l, competencesActif:actif("FW-Competences"), droits});
    }
    if (p === "/api/v1/evaluation/campagnes" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const b = await corpsJson(req), nom = txt(b, "nom", 100), type = b.type == null || b.type === "" ? "annuelle" : b.type, fonction = txt(b, "fonction", 80), site = txt(b, "site", 60), dept = txt(b, "dept", 60);
      if (!nom || !dateOk(b.debut) || !dateOk(b.fin) || b.fin < b.debut) return err(400, "campagneDonnees");
      if (TYPES.indexOf(type) < 0) return err(400, "type");
      if (b.objectifs != null && !Array.isArray(b.objectifs)) return err(400, "texte", {c:"objectifs"});
      const objectifs = (b.objectifs || []).slice(0, 15).map((z, k)=>{ const v = z && typeof z === "object" ? z.libelle : z; if (v != null && typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:"objectifs"}); return {libelle:String(v == null ? "" : v).trim().slice(0, 160), atteinte:null}; }).filter(z=>z.libelle);
      /* salariés du périmètre présents sur la période (correctif 38 : un salarié entré après la fin était inclus),
         filtrés par site, service ou fonction (poste ou fonction, sans espaces) */
      const emps = (await D.employes()).filter(e=>dans(P, e.mat) && !(e.sortie && e.sortie < b.debut) && !(e.entree && e.entree > b.fin) && (!site || e.siteId === site) && (!dept || e.deptId === dept) && (!fonction || fonctionDe(e) === fonction));
      if (!emps.length) return err(400, "aucunSalarie");
      const ev = await evaluateurs(), i = id("ec"), t = maint(), obj = JSON.stringify(objectifs);
      const e = await tx(async ()=>{
        /* correctif 38 : contrôle du doublon sous verrou (trois lancements simultanés → trois campagnes sous PostgreSQL) */
        await verrou("eva:campagne");
        if (await B.get("SELECT 1 FROM eva_campagnes WHERE statut='ouverte' AND nom=? AND debut=? AND fin=?", nom, b.debut, b.fin)) throw ko(409, "doublon");
        await B.run("INSERT INTO eva_campagnes(id,nom,type,debut,fin,statut,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, nom, type, b.debut, b.fin, "ouverte", t, C.login);
        /* insertions groupées (une requête par salarié : 5,9 s à 20 000 sous PostgreSQL) */
        for (let k = 0; k < emps.length; k += 500){ const lot = emps.slice(k, k + 500);
          await B.run("INSERT INTO eva_evaluations(id,campagne_id,mat,evaluateur,statut,objectifs,competences,maj) VALUES "+lot.map(()=>"(?,?,?,?,'a_faire',?,'[]',?)").join(","), ...[].concat(...lot.map(z=>[id("ev"), i, String(z.mat), ev(z.mat), obj, t]))); }
      }); if (e) return e;
      await audit(C.login, "evaluation.campagne", i+" « "+nom+" » ("+type+") : "+emps.length+" évaluation(s)", ip); return json(res, 200, {ok:true, id:i, evaluations:emps.length});
    }
    /* correctif 34 : clôture et suppression ; correctif 38 : sous verrou, suppression atomique (une saisie concurrente
       n'est plus effacée) ; export CSV */
    const mc = /^\/api\/v1\/evaluation\/campagnes\/([^/]+)\/(clore|supprimer|export)$/.exec(p);
    if (mc && mc[2] === "export" && req.method === "GET"){
      if (!dr.exporter) return err(403, "export");
      const cp = await B.get("SELECT * FROM eva_campagnes WHERE id=?", mc[1]); if (!cp) return err(404, "campagneIntrouvable");
      const pm = perimSql(B, P, "a.mat"), l = await B.all("SELECT a.* FROM eva_evaluations a WHERE a.campagne_id=?"+pm.sql+" ORDER BY a.mat", cp.id, ...pm.a);
      const emps = new Map((await D.employes()).map(z=>[String(z.mat), z])), vc = admin || !PERIM.masquePerso(P);
      const TT = [["Matricule","Nom","Fonction","Évaluateur","Statut","Note","Atteinte moyenne (%)"], ["Employee ID","Name","Job","Evaluator","Status","Score","Average achievement (%)"], ["المعرف","الاسم","الوظيفة","المقيم","الحالة","العدد","متوسط الإنجاز"]][L];
      const ST = {a_faire:["À faire","To do","للإنجاز"], en_cours:["En cours","In progress","جارية"], terminee:["Terminée","Completed","منتهية"], validee:["Validée","Approved","مصادق عليها"]};
      const cel = v => { let z = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(z)) z = "'"+z; return /[";\n\r]/.test(z) ? '"'+z.replace(/"/g, '""')+'"' : z; };
      const csv = "﻿"+[TT.join(";")].concat(l.map(r=>{ const z = emps.get(String(r.mat)) || {}, ob = json2(r.objectifs).filter(y=>y && y.atteinte != null);
        return [r.mat, ((z.nom||"")+" "+(z.prenom||"")).trim(), fonctionDe(z), r.evaluateur || "", (ST[r.statut] || [r.statut])[L], vc ? (r.note == null ? "" : r.note) : "", vc && ob.length ? Math.round(ob.reduce((s, y)=>s + Number(y.atteinte), 0) / ob.length) : ""].map(cel).join(";"); })).join("\r\n");
      await audit(C.login, "evaluation.export", cp.id+" : "+l.length+" ligne(s)", ip);
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"evaluations-"+cp.id+".csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(csv);
    }
    if (mc && req.method === "POST"){
      if (mc[2] === "clore" ? !dr.parametrer : !dr.supprimer) return err(403, "parametrage");
      const cp = await B.get("SELECT * FROM eva_campagnes WHERE id=?", mc[1]); if (!cp) return err(404, "campagneIntrouvable");
      if (cp.statut !== "ouverte") return err(409, "dejaClose");
      if (P.set !== null && !admin){ const pm = perimSql(B, P, "mat"), tot = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations WHERE campagne_id=?", cp.id)).n), mien = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations WHERE campagne_id=?"+pm.sql, cp.id, ...pm.a)).n);
        if (mien < tot) return err(403, "horsPerim"); }
      const st = await B.all("SELECT statut, COUNT(*) n FROM eva_evaluations WHERE campagne_id=? GROUP BY statut", cp.id), resume = st.map(z=>z.statut+" "+z.n).join(", ");
      if (mc[2] === "supprimer"){ if (st.some(z=>z.statut !== "a_faire" && Number(z.n) > 0)) return err(409, "commencees");
        const e = await tx(async ()=>{ await verrou("eva:camp:"+cp.id);
          await B.run("DELETE FROM eva_evaluations WHERE campagne_id=? AND statut='a_faire'", cp.id);
          if (await B.get("SELECT 1 FROM eva_evaluations WHERE campagne_id=? LIMIT 1", cp.id)) throw ko(409, "commencees");
          if (!(await B.run("DELETE FROM eva_campagnes WHERE id=? AND statut='ouverte'", cp.id)).n) throw ko(409, "dejaClose"); }); if (e) return e;
        await audit(C.login, "evaluation.campagne.supprimee", cp.nom+" ("+cp.id+") — "+resume, ip); return json(res, 200, {ok:true}); }
      const e = await tx(async ()=>{ await verrou("eva:camp:"+cp.id); if (!(await B.run("UPDATE eva_campagnes SET statut='close' WHERE id=? AND statut='ouverte'", cp.id)).n) throw ko(409, "dejaClose"); }); if (e) return e;
      await audit(C.login, "evaluation.campagne.close", cp.nom+" ("+cp.id+") ouverte → close — "+resume, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/evaluation/evaluations" && req.method === "GET"){
      const off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
      const w = ["1=1"], a = []; if (q.campagne){ w.push("a.campagne_id=?"); a.push(String(q.campagne)); } if (STATUTS.indexOf(q.statut) >= 0){ w.push("a.statut=?"); a.push(q.statut); }
      if (q.mes === "1"){ w.push("a.evaluateur=?"); a.push(C.login); }
      if (P.set !== null){ const pm = perimSql(B, P, "a.mat"); w.push("((1=1"+pm.sql+") OR a.evaluateur=?)"); a.push(...pm.a, C.login); }
      const total = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations a WHERE "+w.join(" AND "), ...a)).n);
      const l = await B.all("SELECT a.id, a.mat, a.evaluateur, a.statut, a.note, a.maj, c.nom campagne FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE "+w.join(" AND ")+" ORDER BY a.mat, a.id LIMIT "+lim+" OFFSET "+off, ...a);
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      return json(res, 200, {total, droits, lignes:l.map(r=>{ const e = emps.get(r.mat) || {}; if (!voitConfidentiel({admin, C, P, rang}, r)) r.note = null; return Object.assign(r, {nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:fonctionDe(e), sorti:sorti(e)}); })});
    }
    const me = /^\/api\/v1\/evaluation\/evaluations\/([^/]+)(?:\/(valider|rouvrir|evaluateur))?$/.exec(p);
    if (me){
      const ev = await B.get("SELECT a.*, c.statut cstatut, c.nom campagne, s.saisi_par FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id LEFT JOIN eva_saisies s ON s.evaluation_id=a.id WHERE a.id=?", me[1]);
      if (!ev || !(dans(P, ev.mat) || ev.evaluateur === C.login)) return err(404, "introuvable");
      const e = (await D.employes()).find(z=>String(z.mat) === ev.mat) || {}, vc = voitConfidentiel({admin, C, P, rang}, ev), mm = await monMat(P);
      const exigences = async () => { const sv = SCv(); if (!sv) return []; try { return await sv.exigencesFonction(ev.mat, fonctionDe(e)); } catch(err2){ return []; } };
      if (!me[2] && req.method === "GET"){
        const evv = vc ? Object.assign(ev, {objectifs:json2(ev.objectifs), competences:json2(ev.competences)}) : masquer(ev);
        const peutSaisir = dr.modifier && vc && ev.cstatut === "ouverte" && ev.statut !== "validee" && mm !== String(ev.mat) && (ev.evaluateur === C.login || (!ev.evaluateur && dr.valider));
        const peutValider = dr.valider && vc && ev.cstatut === "ouverte" && ev.statut === "terminee" && mm !== String(ev.mat) && ev.evaluateur !== C.login && ev.saisi_par !== C.login;
        return json(res, 200, {evaluation:evv, salarie:{mat:e.mat || ev.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:fonctionDe(e), sorti:sorti(e)}, exigences:await exigences(), droits:Object.assign({}, droits, {saisir:peutSaisir, validerCelle:peutValider, reassigner:dr.valider && ev.cstatut === "ouverte" && ev.statut !== "validee"})});
      }
      if (!me[2] && req.method === "POST"){
        if (!dr.modifier) return err(403, "refuse");
        if (!admin && mm === String(ev.mat)) return err(403, "soi");
        /* correctif 38 : seul l'évaluateur désigné saisit (un valideur réécrivait la note puis validait lui-même) ;
           une évaluation sans évaluateur peut être reprise par un valideur ; contenu confidentiel visible exigé */
        if (!(ev.evaluateur === C.login || (!ev.evaluateur && dr.valider))) return err(403, "saisieEval");
        if (!vc) return err(403, "confid");
        const b = await corpsJson(req);
        let note = ev.note; if (b.note !== undefined){ if (b.note === null || b.note === "") note = null; else { const n = entier(b.note); if (!(n >= 1 && n <= 5)) return err(400, "note"); note = n; } }
        const ob0 = json2(ev.objectifs); let mauvais = false;
        const ob = ob0.map((z, k)=>{ const v = Array.isArray(b.objectifs) ? b.objectifs[k] : undefined; if (v == null || v === "") return z; const n = entier(v); if (!(n >= 0 && n <= 100)){ mauvais = true; return z; } return Object.assign({}, z, {atteinte:n}); });
        if (mauvais) return err(400, "atteinte");
        /* correctif 38 : compétences de la fonction seulement ; niveau constaté mémorisé (report à la validation seulement
           s'il n'a pas changé entre-temps) */
        let cp = json2(ev.competences);
        if (Array.isArray(b.competences) && SCv()){ const ex = new Map((await exigences()).map(z=>[String(z.competence_id), z])); cp = [];
          for (const z of b.competences.slice(0, 60)){ const n = entier(z && z.niveau); if (!(n >= 0 && n <= 4)) return err(400, "niveau"); const xz = ex.get(String(z && z.competence_id));
            if (xz) cp.push({competence_id:String(z.competence_id), niveau:n, constate:xz.actuel == null ? null : Number(xz.actuel)}); } }
        const com = b.commentaire === undefined ? (ev.commentaire || "") : txt(b, "commentaire", 4000);
        if (b.terminer !== undefined && typeof b.terminer !== "boolean") return err(400, "texte", {c:"terminer"});
        if (b.terminer === true && (note == null || ob.some(z=>z.atteinte == null))) return err(400, "terminer");
        const statut = b.terminer === true ? "terminee" : "en_cours";
        const e2 = await tx(async ()=>{ await verrou("eva:"+ev.id);
          /* correctif 38 : écriture conditionnelle (sous PostgreSQL, une saisie simultanée faisait repasser « en cours »
             une évaluation validée) */
          const r = await B.run("UPDATE eva_evaluations SET note=?, objectifs=?, competences=?, commentaire=?, statut=?, maj=?, evaluateur=COALESCE(evaluateur, ?) WHERE id=? AND statut <> 'validee' AND EXISTS (SELECT 1 FROM eva_campagnes c WHERE c.id=eva_evaluations.campagne_id AND c.statut='ouverte')",
            note, JSON.stringify(ob), JSON.stringify(cp), com, statut, maint(), C.login, ev.id);
          if (!r.n) throw ko(409, "cloturee");
          await B.run("INSERT INTO eva_saisies(evaluation_id, saisi_par, le) VALUES(?,?,?) ON CONFLICT(evaluation_id) DO UPDATE SET saisi_par=excluded.saisi_par, le=excluded.le", ev.id, C.login, maint());
        }); if (e2) return e2;
        /* correctif 38 : le journal ne contient plus les notes ni les taux (données confidentielles) */
        const ch = []; if (note !== ev.note) ch.push("note"); if (JSON.stringify(ob) !== JSON.stringify(ob0)) ch.push("objectifs"); if (com !== (ev.commentaire || "")) ch.push("commentaire"); if (JSON.stringify(cp) !== JSON.stringify(json2(ev.competences))) ch.push("compétences");
        await audit(C.login, "evaluation.saisie", ev.mat+" — "+ev.campagne+" : "+ev.statut+" → "+statut+(ch.length ? " ; modifié : "+ch.join(", ") : ""), ip); return json(res, 200, {ok:true, statut});
      }
      /* correctif 38 : réassignation de l'évaluateur (changement de manager, manager sorti ou sans droit) */
      if (me[2] === "evaluateur" && req.method === "POST"){
        if (!dr.valider) return err(403, "validation");
        if (ev.cstatut !== "ouverte" || ev.statut === "validee") return err(409, "cloturee");
        const login = txt(await corpsJson(req), "login", 80), el = await eligibles();
        if (!el.has(login) || el.get(login) === String(ev.mat)) return err(400, "evaluateurKo");
        const r = await B.run("UPDATE eva_evaluations SET evaluateur=?, maj=? WHERE id=? AND statut <> 'validee'", login, maint(), ev.id); if (!r.n) return err(409, "concurrence");
        await audit(C.login, "evaluation.evaluateur", ev.mat+" — "+ev.campagne+" : "+(ev.evaluateur || "—")+" → "+login, ip); return json(res, 200, {ok:true});
      }
      if (me[2] && req.method === "POST"){
        if (!dr.valider) return err(403, "validation");
        if (!admin && mm === String(ev.mat)) return err(403, "soi");
        if (!vc) return err(403, "confid");
        if (ev.cstatut !== "ouverte") return err(409, "campagneClose"); /* 56.33.11 */
        if (ev.statut !== "terminee") return err(409, "pasTerminee");
        if (me[2] === "rouvrir"){
          /* correctif 38 : seule une évaluation terminée se rouvre, avec motif */
          const motif = txt(await corpsJson(req), "motif", 300); if (!motif) return err(400, "motif");
          const e3 = await tx(async ()=>{ await verrou("eva:"+ev.id); if (!(await B.run("UPDATE eva_evaluations SET statut='en_cours', maj=? WHERE id=? AND statut='terminee'", maint(), ev.id)).n) throw ko(409, "concurrence"); }); if (e3) return e3;
          await audit(C.login, "evaluation.rouverte", ev.mat+" — "+ev.campagne+" : terminée → en cours ; motif : "+motif, ip); return json(res, 200, {ok:true}); }
        /* quatre yeux : ni l'évaluateur, ni l'auteur de la dernière saisie */
        if (!admin && (ev.evaluateur === C.login || ev.saisi_par === C.login)) return err(403, "quatreYeux");
        let reportes = 0, conflits = 0;
        const e4 = await tx(async ()=>{ await verrou("eva:"+ev.id);
          if (!(await B.run("UPDATE eva_evaluations SET statut='validee', valide_par=?, valide_le=?, maj=? WHERE id=? AND statut='terminee' AND EXISTS (SELECT 1 FROM eva_campagnes c WHERE c.id=eva_evaluations.campagne_id AND c.statut='ouverte')", C.login, maint(), maint(), ev.id)).n) throw ko(409, "concurrence");
          /* report des niveaux : correctif 38 — seulement si le niveau de la matrice n'a pas changé depuis la saisie (une
             formation intermédiaire n'est plus écrasée), compétences actives de la fonction */
          const sv = SCv();
          if (sv){ const ex = new Map((await exigences()).map(z=>[String(z.competence_id), z]));
            for (const z of json2(ev.competences)){ const xz = ex.get(String(z.competence_id)); if (!xz) continue;
              const act = xz.actuel == null ? null : Number(xz.actuel);
              if (z.constate !== undefined && act !== (z.constate == null ? null : Number(z.constate))){ conflits++; continue; }
              if (await sv.ecrireNiveau(ev.mat, z.competence_id, z.niveau, C.login, "évaluation : "+ev.campagne, maint().slice(0, 10), false)) reportes++; } }
        }); if (e4) return e4;
        await audit(C.login, "evaluation.validee", ev.mat+" — "+ev.campagne+" : "+reportes+" niveau(x) reporté(s)"+(conflits ? ", "+conflits+" ignoré(s) (niveau modifié depuis la saisie)" : ""), ip); return json(res, 200, {ok:true, reportes, conflits});
      }
    }
    return err(404, "introuvable2");
    }
  }
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
