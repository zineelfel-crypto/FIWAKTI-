/* FW-Onboarding — partie serveur. Modèles de parcours (tâches avec responsable et jour d'échéance), parcours d'un
   salarié (référence par matricule, jamais de copie de la fiche), cases à cocher datées et signées, fin de période
   d'essai ; périmètre et matrice de l'écran appliqués ; éléments « À traiter » et rubrique de la fiche 360°. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const listeSql = (B, col, l) => B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[l]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(l)]};
const crypto = require("crypto");
const ddl = {
  pg:["CREATE TABLE IF NOT EXISTS onb_modeles (id TEXT PRIMARY KEY, nom TEXT NOT NULL, fonction TEXT, taches TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS onb_parcours (id TEXT PRIMARY KEY, mat TEXT NOT NULL, modele_id TEXT, debut TEXT NOT NULL, fin_essai TEXT, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
      "CREATE INDEX IF NOT EXISTS onb_parcours_mat ON onb_parcours(mat, statut)",
      "CREATE TABLE IF NOT EXISTS onb_taches (id TEXT PRIMARY KEY, parcours_id TEXT NOT NULL, ordre INTEGER, titre TEXT NOT NULL, responsable TEXT, echeance TEXT NOT NULL, faite_le TEXT, faite_par TEXT, commentaire TEXT)",
      "CREATE INDEX IF NOT EXISTS onb_taches_parcours ON onb_taches(parcours_id)",
      "CREATE INDEX IF NOT EXISTS onb_taches_echeance ON onb_taches(echeance, faite_le)",
      /* correctif 36 : pagination stable, et lien parcours → fiche salarié (identifiant interne) pour suivre un
         changement de matricule (le parcours était annulé « salarié supprimé » et ses tâches perdues) */
      "CREATE INDEX IF NOT EXISTS onb_parcours_statut ON onb_parcours(statut, debut)",
      "CREATE TABLE IF NOT EXISTS onb_liens (parcours_id TEXT PRIMARY KEY, emp_id TEXT NOT NULL)"],
  sqlite:null
};
ddl.pg.push("CREATE INDEX IF NOT EXISTS onb_taches_parc ON onb_taches(parcours_id, echeance)");
ddl.sqlite = ddl.pg;
const tables = {onb_modeles:"id", onb_parcours:"id", onb_taches:"id", onb_liens:"parcours_id"};
const RESP = ["rh", "manager", "salarie", "it", "hse"];
/* modèle proposé au premier usage (modifiable) ; identifiant fixe : jamais créé deux fois */
const STD_ID = "om-standard";
const STANDARD = [
  {titre:"Badge, accès et compte informatique", responsable:"rh", jour:0}, {titre:"Visage enregistré sur les pointeuses", responsable:"rh", jour:0},
  {titre:"Accueil sécurité et remise des EPI", responsable:"manager", jour:1}, {titre:"Formation au poste", responsable:"manager", jour:7},
  {titre:"Point d'étape à 30 jours", responsable:"manager", jour:30}, {titre:"Point d'étape à 60 jours", responsable:"manager", jour:60},
  {titre:"Entretien de fin de période d'essai", responsable:"rh", jour:90}];
function ajout(k, n){ const p = String(k).split("-").map(Number); const d = new Date(Date.UTC(p[0], p[1]-1, p[2] + n)); return d.toISOString().slice(0, 10); }
/* correctif 36 : messages dans la langue de l'utilisateur */
const MSG = {
  droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
  masque:["Écran Intégration masqué pour votre profil.", "Onboarding screen hidden for your profile.", "شاشة الإدماج مخفية لملفك."],
  refuse:["Action non permise par vos droits sur l'écran Intégration.", "Action not allowed by your rights on the Onboarding screen.", "إجراء غير مسموح بحقوقك على شاشة الإدماج."],
  parametrage:["Paramétrage des modèles réservé.", "Template configuration is restricted.", "إعداد النماذج مخصص."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  modeleIntrouvable:["Modèle introuvable.", "Template not found.", "نموذج غير موجود."],
  modeleNom:["Nom et au moins une tâche obligatoires.", "Name and at least one task required.", "الاسم ومهمة واحدة على الأقل إجباريان."],
  tacheJour:["Tâche « {t} » : jour entier de 0 à 365.", "Task “{t}”: whole day from 0 to 365.", "المهمة «{t}»: يوم صحيح من 0 إلى 365."],
  tacheResp:["Tâche « {t} » : responsable inconnu.", "Task “{t}”: unknown owner.", "المهمة «{t}»: مسؤول غير معروف."],
  tacheObj:["Tâches : liste d'objets attendue.", "Tasks: list of objects expected.", "المهام: قائمة منتظرة."],
  aucunModele:["Aucun modèle actif : créez-en un dans l'onglet Modèles.", "No active template: create one in the Templates tab.", "لا نموذج نشط: أنشئ نموذجا."],
  debut:["Date de début invalide.", "Invalid start date.", "تاريخ بداية غير صالح."],
  essai:["Date de fin de période d'essai invalide.", "Invalid end of probation date.", "تاريخ نهاية التجربة غير صالح."],
  essaiAvant:["La fin de période d'essai précède le début du parcours.", "End of probation is before the start.", "نهاية التجربة قبل البداية."],
  essaiSortie:["La fin de période d'essai dépasse la sortie prévue le {d}.", "End of probation is after the planned exit on {d}.", "نهاية التجربة بعد الخروج المبرمج في {d}."],
  debutEntree:["Le parcours ne peut pas commencer avant l'entrée du salarié ({d}).", "The path cannot start before the employee's hire date ({d}).", "لا يبدأ المسار قبل دخول الأجير ({d})."],
  debutLoin:["Début trop éloigné (plus d'un an).", "Start too far ahead (more than a year).", "بداية بعيدة جدا (أكثر من سنة)."],
  salarie:["Salarié introuvable ou hors périmètre.", "Employee not found or outside your scope.", "أجير غير موجود أو خارج نطاقك."],
  sorti:["Salarié sorti le {d} : pas de parcours d'intégration.", "Employee left on {d}: no onboarding path.", "غادر الأجير في {d}: لا مسار إدماج."],
  enCours:["Un parcours est déjà en cours pour ce salarié.", "A path is already in progress for this employee.", "مسار جار لهذا الأجير."],
  parcoursIntrouvable:["Parcours introuvable.", "Path not found.", "مسار غير موجود."],
  cloture:["Parcours clôturé.", "Path closed.", "مسار مغلق."],
  pasClos:["Seul un parcours terminé ou annulé se rouvre.", "Only a completed or cancelled path can be reopened.", "يعاد فتح مسار منته أو ملغى فقط."],
  motif:["Motif obligatoire pour annuler ou rouvrir.", "Reason required to cancel or reopen.", "التعليل إجباري للإلغاء أو إعادة الفتح."],
  concurrence:["Parcours modifié entre-temps : actualisez.", "Path modified in the meantime: refresh.", "عُدّل المسار في الأثناء: حدّث."],
  tacheIntrouvable:["Tâche introuvable.", "Task not found.", "مهمة غير موجودة."],
  faite:["« faite » : vrai ou faux attendu.", "“done”: true or false expected.", "«منجزة»: صحيح أو خطأ."],
  cocher:["Cette tâche revient à son responsable ({r}).", "This task belongs to its owner ({r}).", "هذه المهمة لمسؤولها ({r})."],
  introuvable:["Introuvable.", "Not found.", "غير موجود."]
};
const RESP_L = {rh:["RH","HR","الموارد البشرية"], manager:["responsable","manager","المسؤول"], salarie:["salarié","employee","الأجير"], it:["informatique","IT","الإعلامية"], hse:["HSE","HSE","السلامة"]};
function creer(o){
  const {B, D, audit} = o, pg = B.type === "pg";
  /* correctif 34 : jour LOCAL (entre minuit et 1 h, l'heure UTC donnait la veille) ; date réelle exigée */
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  const dateOk = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && ajout(s, 0) === s && +s.slice(0, 4) >= 1990 && +s.slice(0, 4) <= 2100;
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "—";
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  /* correctif 36 : même règle de sortie partout — sorti = date de sortie passée (le jour même, il travaille encore) */
  const sorti = e => !!(e && e.sortie && e.sortie < auj());
  /* matrice de l'écran Intégration (menu masqué ou en lecture ; actions lire / créer / modifier / valider) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).onboarding, act = (pr.actions || {}).onboarding || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, creer:voir && !ro && rang >= 2 && act.creer !== false, modifier:voir && !ro && rang >= 2 && act.modifier !== false,
      valider:voir && !ro && rang >= 3 && act.valider !== false, parametrer:voir && !ro && rang >= 4 && act.modifier !== false};
  }
  async function aSemer(){ return !await B.get("SELECT 1 FROM onb_modeles LIMIT 1"); }
  /* correctif 36 : le modèle standard n'est semé que si AUCUN modèle n'a jamais existé (retirer tous les modèles le
     recréait en silence) ; identifiant fixe (deux créations simultanées le dupliquaient sous PostgreSQL) */
  async function semer(){ await B.run("INSERT INTO onb_modeles(id,nom,fonction,taches,actif,cree) VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING", STD_ID, "Intégration standard", "", JSON.stringify(STANDARD), maint()); }
  async function modeles(){
    const l = (await B.all("SELECT * FROM onb_modeles WHERE actif=1 ORDER BY nom, id")).map(m=>Object.assign(m, {taches:JSON.parse(m.taches)}));
    /* premier usage : le modèle standard est proposé (sans écriture tant qu'aucun parcours n'est créé) */
    if (!l.length && await aSemer()) l.push({id:STD_ID, nom:"Intégration standard", fonction:"", taches:STANDARD, actif:1, propose:true});
    return l;
  }
  async function progression(pids){
    if (!pids.length) return {};
    const out = {};
    (await B.all("SELECT parcours_id, COUNT(*) n, SUM(CASE WHEN faite_le IS NOT NULL THEN 1 ELSE 0 END) f, SUM(CASE WHEN faite_le IS NULL AND echeance < ? THEN 1 ELSE 0 END) r, MIN(CASE WHEN faite_le IS NULL THEN echeance END) p FROM onb_taches WHERE parcours_id IN ("+pids.map(()=>"?").join(",")+") GROUP BY parcours_id", auj(), ...pids))
      .forEach(x=>{ out[x.parcours_id] = {total:Number(x.n), faites:Number(x.f)||0, retard:Number(x.r)||0, prochaine:x.p||null}; });
    return out;
  }
  async function aTraiter(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || !dr.modifier) return [];
    /* correctif 34 : périmètre et comptage dans la requête */
    const pm = perimSql(B, x.P, "p.mat"), pm2 = perimSql(B, x.P, "mat"), j = auj();
    const l = Number((await B.get("SELECT COUNT(*) n FROM onb_taches t JOIN onb_parcours p ON p.id=t.parcours_id WHERE p.statut='en_cours' AND t.faite_le IS NULL AND t.echeance < ?"+pm.sql, j, ...pm.a)).n);
    const fe = Number((await B.get("SELECT COUNT(*) n FROM onb_parcours WHERE statut='en_cours' AND fin_essai >= ? AND fin_essai <= ?"+pm2.sql, j, ajout(j, 15), ...pm2.a)).n);
    /* correctif 36 : une fin d'essai dépassée sur un parcours encore en cours reste signalée (elle disparaissait) */
    const fd = Number((await B.get("SELECT COUNT(*) n FROM onb_parcours WHERE statut='en_cours' AND fin_essai < ?"+pm2.sql, j, ...pm2.a)).n);
    const out = [];
    if (l) out.push({domaine:"talents", cle:"onboarding-retard", nombre:l, urgence:1, vue:"onboarding"});
    if (fe) out.push({domaine:"talents", cle:"onboarding-essai", nombre:fe, urgence:2, vue:"onboarding"});
    if (fd) out.push({domaine:"talents", cle:"onboarding-essai-depasse", nombre:fd, urgence:2, vue:"onboarding"});
    return out;
  }
  async function fiche360(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir) return null;
    const p = await B.get("SELECT * FROM onb_parcours WHERE mat=? AND statut <> 'annule' ORDER BY debut DESC, id DESC LIMIT 1", String(x.mat)); if (!p) return null;
    const g = (await progression([p.id]))[p.id] || {total:0, faites:0, retard:0};
    /* correctif 36 : retard et prochaine échéance pour un parcours en cours seulement (un parcours terminé affichait
       « en retard 7 ») */
    const enc = p.statut === "en_cours";
    return {cle:"onboarding", vue:"onboarding", lignes:[{k:"onbProgression", v:g.faites+" / "+g.total}].concat(enc ? [{k:"onbRetard", v:String(g.retard), alerte:g.retard > 0},
      {k:"onbProchaine", v:jj(g.prochaine)}, {k:"onbFinEssai", v:jj(p.fin_essai), alerte:!!p.fin_essai && p.fin_essai < auj()}] : [])};
  }
  /* lecture stricte d'un modèle reçu (nom, fonction, tâches) ; renvoie {err} ou {nom, fonction, taches} */
  function lireModele(b, txt){
    const nom = txt(b, "nom", 80), fonction = txt(b, "fonction", 80);
    if (b.taches != null && !Array.isArray(b.taches)) return {err:"tacheObj"};
    const taches = [];
    for (const t of (b.taches || []).slice(0, 60)){
      if (!t || typeof t !== "object" || Array.isArray(t)) return {err:"tacheObj"};
      const titre = txt(t, "titre", 120); if (!titre) continue;
      const jour = t.jour == null || t.jour === "" ? 0 : +t.jour;
      if (!Number.isInteger(jour) || jour < 0 || jour > 365) return {err:"tacheJour", v:{t:titre}};
      const responsable = t.responsable == null || t.responsable === "" ? "rh" : t.responsable;
      if (RESP.indexOf(responsable) < 0) return {err:"tacheResp", v:{t:titre}};
      taches.push({titre, responsable, jour});
    }
    if (!nom || !taches.length) return {err:"modeleNom"};
    return {nom, fonction, taches};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ /* correctif 41 : langue de l'écran (en-tête X-Langue envoyé par l'application) en priorité */ const l = String((req.headers || {})["x-langue"] || u.searchParams.get("lang") || (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2)).slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    const err = (st, k, v) => json(res, st, {message:m(k, v), code:k});
    /* champs texte uniquement (un objet était enregistré « [object Object] ») */
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k}); return String(v).trim().slice(0, max); };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ}); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P);
    if (dr.rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const q = Object.fromEntries(u.searchParams.entries()), droits = {creer:dr.creer, modifier:dr.modifier, valider:dr.valider, parametrer:dr.parametrer};
    const emps = async () => await D.employes();
    /* le compte connecté et sa fiche (manager d'une tâche « responsable », salarié d'une tâche « salarié ») */
    const moi = async () => { const u0 = P && P.u; if (!u0 || !u0.empId) return null; return (await emps()).find(e=>e.id === u0.empId) || null; };
    if (p === "/api/v1/onboarding/modeles" && req.method === "GET") return json(res, 200, {modeles:await modeles(), responsables:RESP, droits});
    /* correctif 34 : un modèle se retire */
    const mrm = /^\/api\/v1\/onboarding\/modeles\/([^/]+)(\/retirer)?$/.exec(p);
    if (mrm && mrm[2] && req.method === "POST"){ if (!dr.parametrer) return err(403, "parametrage");
      const mo = await B.get("SELECT id, nom FROM onb_modeles WHERE id=? AND actif=1", mrm[1]); if (!mo) return err(404, "modeleIntrouvable");
      await B.run("UPDATE onb_modeles SET actif=0 WHERE id=?", mo.id); await audit(C.login, "onboarding.modele", "retrait "+mo.id+" « "+mo.nom+" »", ip); return json(res, 200, {ok:true}); }
    /* correctif 36 : modification d'un modèle (les parcours déjà créés gardent leurs tâches) */
    if (mrm && !mrm[2] && req.method === "POST"){ if (!dr.parametrer) return err(403, "parametrage");
      if (mrm[1] === STD_ID && await aSemer()) await semer();
      const mo = await B.get("SELECT * FROM onb_modeles WHERE id=? AND actif=1", mrm[1]); if (!mo) return err(404, "modeleIntrouvable");
      const r = lireModele(await corpsJson(req), txt); if (r.err) return err(400, r.err, r.v);
      await B.run("UPDATE onb_modeles SET nom=?, fonction=?, taches=? WHERE id=?", r.nom, r.fonction, JSON.stringify(r.taches), mo.id);
      await audit(C.login, "onboarding.modele", "modification "+mo.id+" « "+mo.nom+" » → « "+r.nom+" », "+r.taches.length+" tâche(s)", ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/onboarding/modeles" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const r = lireModele(await corpsJson(req), txt); if (r.err) return err(400, r.err, r.v);
      const i = id("om"); await B.run("INSERT INTO onb_modeles(id,nom,fonction,taches,actif,cree) VALUES(?,?,?,?,1,?)", i, r.nom, r.fonction, JSON.stringify(r.taches), maint());
      await audit(C.login, "onboarding.modele", "ajout "+i+" « "+r.nom+" », "+r.taches.length+" tâche(s)", ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/onboarding/parcours" && req.method === "GET"){
      const off = Math.min(1e7, Math.max(0, Math.floor(+q.offset) || 0)), lim = Math.min(200, Math.max(1, Math.floor(+q.limit) || 50));
      const st = ["en_cours","termine","annule"].indexOf(q.statut) >= 0 ? q.statut : q.statut === "tous" ? null : "en_cours";
      const E = await emps(), parMat = new Map(E.map(e=>[String(e.mat), e]));
      /* correctif 36 : recherche par matricule ou par nom, filtre « en retard » */
      const s = String(q.q || "").trim().toLowerCase().slice(0, 80);
      let w = " WHERE 1=1"+(st ? " AND statut=?" : ""), aa = st ? [st] : [];
      const pm = perimSql(B, P, "mat"); w += pm.sql; aa = aa.concat(pm.a);
      if (s){ const mats = E.filter(e=>String(e.mat).toLowerCase().indexOf(s) >= 0 || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0 || ((e.prenom||"")+" "+(e.nom||"")).toLowerCase().indexOf(s) >= 0).map(e=>String(e.mat)).slice(0, 5000);
        const ls = listeSql(B, "mat", mats); w += ls.sql; aa = aa.concat(ls.a); }
      if (q.retard === "1"){ w += " AND EXISTS (SELECT 1 FROM onb_taches t WHERE t.parcours_id=onb_parcours.id AND t.faite_le IS NULL AND t.echeance < ?)"; aa.push(auj()); }
      const total = Number((await B.get("SELECT COUNT(*) n FROM onb_parcours"+w, ...aa)).n);
      const page = await B.all("SELECT id, mat, modele_id, debut, fin_essai, statut FROM onb_parcours"+w+" ORDER BY debut DESC, id LIMIT "+lim+" OFFSET "+off, ...aa), g = await progression(page.map(r=>r.id));
      return json(res, 200, {total, droits, lignes:page.map(r=>{ const e = parMat.get(String(r.mat)); return Object.assign(r, {nom:e ? ((e.nom||"")+" "+(e.prenom||"")).trim() : "", progression:g[r.id] || {total:0, faites:0, retard:0}}); })});
    }
    if (p === "/api/v1/onboarding/parcours" && req.method === "POST"){
      if (!dr.creer) return err(403, "refuse");
      const b = await corpsJson(req), mat = txt(b, "mat", 40), modeleId = txt(b, "modeleId", 60), debutS = txt(b, "debut", 10), essaiS = txt(b, "finEssai", 10);
      /* correctif 34 : dates réelles exigées */
      if (debutS && !dateOk(debutS)) return err(400, "debut");
      if (essaiS && !dateOk(essaiS)) return err(400, "essai");
      const emp = mat ? (await emps()).find(e=>String(e.mat) === mat) : null;
      if (!emp || !dans(P, mat)) return err(404, "salarie");
      if (sorti(emp)) return err(409, "sorti", {d:jj(emp.sortie)});
      /* correctif 36 : début par défaut = date d'entrée (le parcours d'un salarié entré le 01/09 commençait le jour de
         la saisie) ; jamais avant l'entrée ; fin d'essai avant la sortie prévue */
      const debut = debutS || (emp.entree && dateOk(String(emp.entree)) ? String(emp.entree) : auj());
      if (emp.entree && debut < String(emp.entree)) return err(400, "debutEntree", {d:jj(emp.entree)});
      if (debut > ajout(auj(), 366)) return err(400, "debutLoin");
      if (essaiS && essaiS < debut) return err(400, "essaiAvant");
      const essai = essaiS || ajout(debut, 90);
      if (emp.sortie && essai > String(emp.sortie)) return err(400, "essaiSortie", {d:jj(emp.sortie)});
      const i = id("op"); let mo;
      try { await B.transaction(async ()=>{
        /* correctif 36 : verrou par salarié sous PostgreSQL (six créations simultanées donnaient six parcours) */
        if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "onb:"+mat);
        if (await B.get("SELECT 1 FROM onb_parcours WHERE mat=? AND statut='en_cours'", mat)) throw Object.assign(new Error("enCours"), {code:409});
        if ((!modeleId || modeleId === STD_ID) && await aSemer()) await semer();
        const ms = (await B.all("SELECT * FROM onb_modeles WHERE actif=1 ORDER BY nom, id")).map(z=>Object.assign(z, {taches:JSON.parse(z.taches)}));
        mo = modeleId ? ms.find(z=>z.id === modeleId) : ms[0];
        if (!mo) throw Object.assign(new Error(modeleId ? "modeleIntrouvable" : "aucunModele"), {code:400});
        await B.run("INSERT INTO onb_parcours(id,mat,modele_id,debut,fin_essai,statut,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, mat, mo.id, debut, essai, "en_cours", maint(), C.login);
        if (emp.id) await B.run("INSERT INTO onb_liens(parcours_id, emp_id) VALUES(?,?)", i, String(emp.id));
        let n = 0; for (const t of mo.taches) await B.run("INSERT INTO onb_taches(id,parcours_id,ordre,titre,responsable,echeance) VALUES(?,?,?,?,?,?)", id("ot"), i, n++, t.titre, t.responsable, ajout(debut, t.jour));
      }); } catch(e){ if (e.code) return err(e.code, e.message); throw e; }
      await audit(C.login, "onboarding.parcours", mat+" — "+mo.nom+" à partir du "+jj(debut)+", fin d'essai "+jj(essai)+" ("+i+")", ip); return json(res, 200, {ok:true, id:i});
    }
    const mp = /^\/api\/v1\/onboarding\/parcours\/([^/]+)(?:\/(terminer|annuler|rouvrir))?$/.exec(p);
    if (mp){
      const pc = await B.get("SELECT * FROM onb_parcours WHERE id=?", mp[1]); if (!pc || !dans(P, pc.mat)) return err(404, "parcoursIntrouvable");
      if (!mp[2] && req.method === "GET"){
        const e = (await emps()).find(z=>String(z.mat) === String(pc.mat)), mo = pc.modele_id ? await B.get("SELECT nom FROM onb_modeles WHERE id=?", pc.modele_id) : null, me = await moi();
        const taches = await B.all("SELECT * FROM onb_taches WHERE parcours_id=? ORDER BY echeance, ordre", pc.id);
        /* chaque tâche dit si le compte connecté peut la cocher (responsable désigné) */
        const peut = t => pc.statut === "en_cours" && (dr.modifier || (!!me && t.responsable === "manager" && !!e && String(e.chefMat || "") === String(me.mat)) || (!!me && t.responsable === "salarie" && String(me.mat) === String(pc.mat)));
        return json(res, 200, {parcours:Object.assign(pc, {nom:e ? ((e.nom||"")+" "+(e.prenom||"")).trim() : "", modele:mo ? mo.nom : ""}), taches:taches.map(t=>Object.assign(t, {peut:peut(t)})), droits});
      }
      if (mp[2] && req.method === "POST"){
        if (!dr.valider) return err(403, "refuse");
        const b = await corpsJson(req), motif = txt(b, "motif", 300);
        if (mp[2] === "rouvrir"){ if (pc.statut === "en_cours") return err(409, "pasClos"); }
        else if (pc.statut !== "en_cours") return err(409, "cloture");
        if ((mp[2] === "annuler" || mp[2] === "rouvrir") && !motif) return err(400, "motif");
        const vers = mp[2] === "terminer" ? "termine" : mp[2] === "annuler" ? "annule" : "en_cours";
        try { await B.transaction(async ()=>{
          if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "onb:"+pc.mat);
          if (vers === "en_cours"){
            const e = (await emps()).find(z=>String(z.mat) === String(pc.mat));
            if (!e) throw Object.assign(new Error("salarie"), {code:404});
            if (sorti(e)) throw Object.assign(new Error("sorti"), {code:409, v:{d:jj(e.sortie)}});
            if (await B.get("SELECT 1 FROM onb_parcours WHERE mat=? AND statut='en_cours'", pc.mat)) throw Object.assign(new Error("enCours"), {code:409});
          }
          /* correctif 36 : passage conditionnel (deux clôtures simultanées donnaient deux 200 et deux audits) */
          const r = await B.run("UPDATE onb_parcours SET statut=? WHERE id=? AND statut=?", vers, pc.id, pc.statut);
          if (!r.n) throw Object.assign(new Error("concurrence"), {code:409});
        }); } catch(e){ if (e.code) return err(e.code, e.message, e.v); throw e; }
        const nf = Number((await B.get("SELECT COUNT(*) n FROM onb_taches WHERE parcours_id=? AND faite_le IS NULL", pc.id)).n);
        await audit(C.login, "onboarding.parcours."+mp[2], pc.mat+" ("+pc.id+") "+pc.statut+" → "+vers+(nf ? " ; "+nf+" tâche(s) non faite(s)" : "")+(motif ? " ; motif : "+motif : ""), ip); return json(res, 200, {ok:true});
      }
    }
    const mt = /^\/api\/v1\/onboarding\/taches\/([^/]+)$/.exec(p);
    if (mt && req.method === "POST"){
      const t = await B.get("SELECT t.*, p.mat, p.statut FROM onb_taches t JOIN onb_parcours p ON p.id=t.parcours_id WHERE t.id=?", mt[1]);
      if (!t || !dans(P, t.mat)) return err(404, "tacheIntrouvable");
      if (t.statut !== "en_cours") return err(409, "cloture");
      /* correctif 36 : la tâche revient à son responsable — droit « modifier » de l'écran, ou manager du salarié pour
         une tâche « responsable », ou le salarié lui-même pour une tâche « salarié » */
      if (!dr.modifier){
        const me = await moi(), e = (await emps()).find(z=>String(z.mat) === String(t.mat));
        const ok = !!me && ((t.responsable === "manager" && !!e && String(e.chefMat || "") === String(me.mat)) || (t.responsable === "salarie" && String(me.mat) === String(t.mat)));
        if (!ok) return err(403, "cocher", {r:(RESP_L[t.responsable] || [t.responsable])[L] || t.responsable});
      }
      const b = await corpsJson(req);
      if (b.faite !== undefined && typeof b.faite !== "boolean") return err(400, "faite");
      const com = b.commentaire === undefined ? null : txt(b, "commentaire", 500);
      /* correctif 34 : un commentaire seul ne décoche plus la tâche ; 56.33.11 : recocher garde la date d'origine */
      const faite = b.faite === undefined ? !!t.faite_le : b.faite, deja = faite && t.faite_le;
      await B.run("UPDATE onb_taches SET faite_le=?, faite_par=?, commentaire=COALESCE(?, commentaire) WHERE id=?", deja ? t.faite_le : faite ? maint() : null, deja ? t.faite_par : faite ? C.login : null, com, t.id);
      const etatAv = t.faite_le ? "faite" : "à faire", etatAp = faite ? "faite" : "à faire", comCh = com !== null && com !== (t.commentaire || "");
      /* correctif 36 : le journal ne recopie plus le commentaire (données personnelles possibles) */
      if (etatAv !== etatAp || comCh) await audit(C.login, "onboarding.tache", t.mat+" — "+t.titre+" : "+etatAv+" → "+etatAp+(comCh ? " ; commentaire modifié" : ""), ip);
      return json(res, 200, {ok:true});
    }
    return err(404, "introuvable");
    }
  }
  /* correctif 34 : parcours en cours d'un salarié sorti → annulé. Correctif 36 : un matricule changé est suivi (lien
     par l'identifiant de la fiche) ; un salarié introuvable (supprimé, en corbeille) n'est plus annulé d'office ;
     aucune annulation si la liste des salariés est vide (garde-fou) ; écritures groupées dans une transaction. */
  if (o.planifier) o.planifier("orphelins", {intervalle:3600000, premier:120000, priorite:3, delai:120000, fn:async ()=>{
    const l = await B.all("SELECT p.id, p.mat, k.emp_id FROM onb_parcours p LEFT JOIN onb_liens k ON k.parcours_id=p.id WHERE p.statut='en_cours'"); if (!l.length) return "aucun parcours";
    const E = await D.employes(); if (!E.length) return "liste des salariés vide : rien n'est annulé";
    const parMat = new Map(E.map(e=>[String(e.mat), e])), parId = new Map(E.map(e=>[String(e.id), e])), j0 = auj();
    let n = 0, rm = 0, absents = 0; const journal = [];
    await B.transaction(async ()=>{
      for (const r of l){
        let e = parMat.get(String(r.mat));
        if (!e && r.emp_id && parId.has(String(r.emp_id))){ e = parId.get(String(r.emp_id));
          await B.run("UPDATE onb_parcours SET mat=? WHERE id=? AND statut='en_cours'", String(e.mat), r.id); rm++; journal.push([r.mat+" → "+e.mat+" ("+r.id+") : matricule suivi", "onboarding.parcours"]); }
        if (!e){ absents++; continue; }
        if (e.id && !r.emp_id) await B.run("INSERT INTO onb_liens(parcours_id, emp_id) VALUES(?,?) ON CONFLICT(parcours_id) DO NOTHING", r.id, String(e.id));
        if (!(e.sortie && e.sortie < j0)) continue;
        await B.run("UPDATE onb_parcours SET statut='annule' WHERE id=? AND statut='en_cours'", r.id); n++;
        journal.push([e.mat+" ("+r.id+") en cours → annulé : salarié sorti le "+jj(e.sortie), "onboarding.parcours.annuler"]);
      }
    });
    for (const [d, a] of journal.slice(0, 500)) await audit("systeme", a, d);
    if (journal.length > 500) await audit("systeme", "onboarding.parcours", (journal.length - 500)+" autre(s) mise(s) à jour non détaillée(s)");
    return n+" parcours annulé(s), "+rm+" matricule(s) suivi(s)"+(absents ? ", "+absents+" salarié(s) introuvable(s) laissé(s) en cours" : ""); }});
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
