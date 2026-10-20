/* FW-Competences — partie serveur (module pilote, cahier des charges v56.2 DevRH).
   Données propres au module (aucune copie de la fiche salarié : référence par matricule), listes paginées et filtrées
   côté serveur, écarts calculés côté serveur avec cache invalidé à chaque écriture, périmètre et matrice de l'écran
   contrôlés par le serveur, historique des niveaux en ajout seul, audit. */
"use strict";
const crypto = require("crypto");
const ddl = {
  pg:["CREATE TABLE IF NOT EXISTS comp_catalogue (id TEXT PRIMARY KEY, code TEXT NOT NULL, nom TEXT NOT NULL, domaine TEXT, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS comp_exigences (fonction TEXT NOT NULL, competence_id TEXT NOT NULL, niveau INTEGER NOT NULL, PRIMARY KEY(fonction, competence_id))",
      "CREATE TABLE IF NOT EXISTS comp_niveaux (mat TEXT NOT NULL, competence_id TEXT NOT NULL, niveau INTEGER NOT NULL, d TEXT NOT NULL, evaluateur TEXT, PRIMARY KEY(mat, competence_id))",
      "CREATE INDEX IF NOT EXISTS comp_niveaux_comp ON comp_niveaux(competence_id, niveau)",
      "CREATE TABLE IF NOT EXISTS comp_historique (id TEXT PRIMARY KEY, mat TEXT NOT NULL, competence_id TEXT NOT NULL, avant INTEGER, apres INTEGER NOT NULL, par TEXT, motif TEXT, ts TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS comp_historique_mat ON comp_historique(mat, competence_id)",
      "CREATE OR REPLACE FUNCTION fiwakti_comp_hist_immuable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'historique non modifiable'; END $$ LANGUAGE plpgsql",
      "CREATE OR REPLACE TRIGGER comp_historique_immuable BEFORE UPDATE OR DELETE ON comp_historique FOR EACH ROW EXECUTE FUNCTION fiwakti_comp_hist_immuable()"],
  sqlite:["CREATE TABLE IF NOT EXISTS comp_catalogue (id TEXT PRIMARY KEY, code TEXT NOT NULL, nom TEXT NOT NULL, domaine TEXT, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS comp_exigences (fonction TEXT NOT NULL, competence_id TEXT NOT NULL, niveau INTEGER NOT NULL, PRIMARY KEY(fonction, competence_id))",
      "CREATE TABLE IF NOT EXISTS comp_niveaux (mat TEXT NOT NULL, competence_id TEXT NOT NULL, niveau INTEGER NOT NULL, d TEXT NOT NULL, evaluateur TEXT, PRIMARY KEY(mat, competence_id))",
      "CREATE INDEX IF NOT EXISTS comp_niveaux_comp ON comp_niveaux(competence_id, niveau)",
      "CREATE TABLE IF NOT EXISTS comp_historique (id TEXT PRIMARY KEY, mat TEXT NOT NULL, competence_id TEXT NOT NULL, avant INTEGER, apres INTEGER NOT NULL, par TEXT, motif TEXT, ts TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS comp_historique_mat ON comp_historique(mat, competence_id)",
      "CREATE TRIGGER IF NOT EXISTS comp_historique_maj BEFORE UPDATE ON comp_historique BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END",
      "CREATE TRIGGER IF NOT EXISTS comp_historique_sup BEFORE DELETE ON comp_historique BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END"]
};
/* correctif 39 : rattachement des matricules et des lignes d'historique à la fiche salarié (identifiant interne) —
   un matricule changé perdait ses niveaux ; un matricule réutilisé les donnait au nouvel embauché */
["CREATE TABLE IF NOT EXISTS comp_mats (mat TEXT PRIMARY KEY, emp_id TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS comp_hist_emp (hist_id TEXT PRIMARY KEY, emp_id TEXT NOT NULL)",
 "CREATE INDEX IF NOT EXISTS comp_hist_emp_emp ON comp_hist_emp(emp_id)"].forEach(s=>{ ddl.pg.push(s); ddl.sqlite.push(s); });
const tables = {comp_catalogue:"id", comp_exigences:"fonction, competence_id", comp_niveaux:"mat, competence_id", comp_historique:"id", comp_mats:"mat", comp_hist_emp:"hist_id"};
const NIVEAUX = [0, 1, 2, 3, 4];
/* correctif 39 : messages dans la langue de l'utilisateur */
const MSG = {
  droitEmp:["Droit de consultation des salariés requis.", "Employee viewing right required.", "يلزم حق الاطلاع على الأجراء."],
  masque:["Écran Compétences masqué pour votre profil.", "Skills screen hidden for your profile.", "شاشة الكفاءات مخفية لملفك."],
  refuse:["Action non permise par vos droits sur l'écran Compétences.", "Action not allowed by your rights on the Skills screen.", "إجراء غير مسموح بحقوقك على شاشة الكفاءات."],
  parametrage:["Paramétrage des compétences réservé au droit « paramétrage » sur les salariés, sans limite de périmètre.", "Skills configuration requires the configuration right without scope limit.", "إعداد الكفاءات مخصص لحق الإعداد دون حدود النطاق."],
  json:["Requête illisible (JSON invalide).", "Unreadable request (invalid JSON).", "طلب غير مقروء."],
  texte:["Champ « {c} » : texte attendu.", "Field “{c}”: text expected.", "الحقل «{c}»: نص منتظر."],
  codeNom:["Code et nom obligatoires.", "Code and name required.", "الرمز والاسم إجباريان."],
  codePris:["Ce code existe déjà.", "This code already exists.", "هذا الرمز موجود."],
  compIntrouvable:["Compétence introuvable.", "Skill not found.", "كفاءة غير موجودة."],
  compInactive:["Compétence retirée du catalogue.", "Skill removed from the catalogue.", "كفاءة مسحوبة من الفهرس."],
  dejaRetiree:["Compétence déjà retirée.", "Skill already removed.", "كفاءة مسحوبة."],
  dejaActive:["Compétence déjà active.", "Skill already active.", "كفاءة نشطة."],
  utilisee:["Compétence exigée par {n} fonction(s) : retirez d'abord ces exigences.", "Skill required by {n} job(s): remove these requirements first.", "كفاءة مطلوبة في {n} وظيفة."],
  exigence:["Fonction, compétence active et niveau (0 à 4) obligatoires.", "Job, active skill and level (0 to 4) required.", "الوظيفة والكفاءة والمستوى إجبارية."],
  fonctionInconnue:["Fonction inconnue : aucun salarié ne l'occupe.", "Unknown job: no employee holds it.", "وظيفة غير معروفة."],
  horsPerim:["Salarié hors périmètre.", "Employee outside your scope.", "أجير خارج نطاقك."],
  salarie:["Salarié introuvable, sorti ou pas encore entré.", "Employee not found, left or not yet hired.", "أجير غير موجود أو غادر."],
  soi:["Vous ne pouvez pas fixer vos propres niveaux de compétence.", "You cannot set your own skill levels.", "لا يمكنك تحديد مستوياتك."],
  niveau:["Compétence et niveau entier (0 à 4) obligatoires.", "Skill and whole level (0 to 4) required.", "الكفاءة ومستوى صحيح (0 إلى 4) إجباريان."],
  modifie:["Niveau modifié entre-temps (actuellement {n}) : actualisez.", "Level changed in the meantime (now {n}): refresh.", "تغير المستوى في الأثناء (حاليا {n})."],
  motifBaisse:["Motif obligatoire pour baisser un niveau.", "Reason required to lower a level.", "التعليل إجباري لخفض المستوى."],
  export:["Droit d'export requis.", "Export right required.", "يلزم حق التصدير."],
  introuvable:["Introuvable.", "Not found.", "غير موجود."]
};
function creer(o){
  const {B, D, audit} = o, pg = B.type === "pg";
  let GEN = 0; const CACHE = new Map();
  /* index des niveaux en mémoire : chargé une fois, tenu à jour à chaque saisie (évite de relire 600 000 lignes
     à chaque calcul d'écarts à 20 000 salariés × 30 compétences) */
  let NIV = null, NIV_P = null, NIV_V = 0;
  async function niveauxIndex(){
    if (NIV) return NIV;
    /* correctif 39 : une écriture pendant le chargement invalide le chargement (version), au lieu d'être perdue */
    if (!NIV_P){ const v = NIV_V; NIV_P = B.all("SELECT mat, competence_id, niveau FROM comp_niveaux").then(l=>{ const m = new Map(); l.forEach(r=>m.set(r.mat+"|"+r.competence_id, Number(r.niveau))); NIV_P = null; if (v === NIV_V) NIV = m; return m; }); }
    return NIV_P;
  }
  const oublier = () => { NIV = null; NIV_V++; GEN++; CACHE.clear(); };
  /* v56.17 : niveau modifié par un autre module (évaluation validée, formation clôturée) : index et écarts à jour */
  function surEvenement(nom, d){
    if (nom !== "competences.niveau" || !d) return;
    if (NIV) NIV.set(String(d.mat)+"|"+d.competence_id, Number(d.niveau)); NIV_V++;
    GEN++; CACHE.clear();
  }
  const maintenant = () => new Date().toISOString();
  /* correctif 34 : niveau entier de 0 à 4 */
  const entier = v => typeof v === "number" ? (Number.isInteger(v) ? v : NaN) : (typeof v === "string" && /^\d+$/.test(v.trim()) ? +v.trim() : NaN);
  const jourL = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  /* correctif 39 : même population partout — ni sortis (jour local), ni pas encore entrés */
  const present = e => !!e && !(e.sortie && e.sortie < jourL()) && !(e.entree && e.entree > jourL());
  const salarieActif = async mat => { const e = (await D.employes()).find(x=>String(x.mat) === String(mat)); return present(e) ? e : null; };
  const fonctionDe = e => String(e.poste || e.fonction || "").trim();
  const PERIM = require("../perimetre.js");
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* matrice de l'écran Compétences ; le paramétrage (catalogue, exigences) est global : réservé à un compte sans limite
     de périmètre (un compte limité à un site changeait l'exigence d'une fonction pour toute l'entreprise) */
  function droitsEcran(admin, P){
    const rang = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0);
    const pr = admin ? {} : (P.profil || {}), menu = (pr.menus || {}).competences, act = (pr.actions || {}).competences || {};
    const voir = rang >= 1 && menu !== "masque" && act.lire !== false, ro = menu === "lecture";
    return {rang, voir, modifier:voir && !ro && rang >= 2 && act.modifier !== false, parametrer:voir && !ro && rang >= 4 && act.creer !== false && (admin || P.set === null),
      exporter:voir && rang >= 2 && act.exporter !== false, sensibles:admin || !PERIM.masquePerso(P)};
  }
  async function catalogue(tous){ return B.all("SELECT * FROM comp_catalogue"+(tous ? "" : " WHERE actif=1")+" ORDER BY actif DESC, domaine, code"); }
  async function exigences(){ return B.all("SELECT * FROM comp_exigences"); }
  /* salariés du périmètre, filtrés côté serveur */
  async function salaries(C, q){
    const ref = await (D.referentielLecture || D.referentiel)() || {}, {P, emps} = await D.perimetreDe(ref, C.login);
    let l = emps.filter(e=>(P.set === null || P.set.has(String(e.mat))) && present(e));
    if (q.site) l = l.filter(e=>e.siteId === q.site);
    if (q.dept) l = l.filter(e=>e.deptId === q.dept);
    if (q.fonction) l = l.filter(e=>fonctionDe(e) === q.fonction);
    if (q.q && String(q.q).trim().length >= 2){ const s = String(q.q).toLowerCase(); l = l.filter(e=>((e.nom||"")+" "+(e.prenom||"")+" "+e.mat).toLowerCase().indexOf(s) >= 0); }
    return {P, l, ref};
  }
  async function matrice(C, q){
    const off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 100));
    const {l} = await salaries(C, q), cat = await catalogue(), ex = await exigences();
    l.sort((a, b)=>String(a.nom).localeCompare(String(b.nom), "fr") || String(a.mat).localeCompare(String(b.mat)));
    const page = l.slice(off, off + lim), mats = page.map(e=>String(e.mat));
    const niv = {};
    for (let i = 0; i < mats.length; i += 500){ const lot = mats.slice(i, i+500);
      (await B.all("SELECT mat, competence_id, niveau FROM comp_niveaux WHERE mat IN ("+lot.map(()=>"?").join(",")+")", ...lot)).forEach(r=>{ (niv[r.mat] = niv[r.mat] || {})[r.competence_id] = Number(r.niveau); }); }
    const req = {}; ex.forEach(x=>{ (req[x.fonction] = req[x.fonction] || {})[x.competence_id] = Number(x.niveau); });
    return {total:l.length, offset:off, competences:cat.map(c=>({id:c.id, code:c.code, nom:c.nom, domaine:c.domaine})),
      lignes:page.map(e=>{ const f = fonctionDe(e), n = niv[String(e.mat)] || {}, r = req[f] || {};
        const ecarts = Object.keys(r).filter(cid=>(n[cid]||0) < r[cid]).length;
        return {mat:String(e.mat), nom:(e.nom||"")+" "+(e.prenom||""), fonction:f, niveaux:n, requis:r, ecarts}; })};
  }
  /* écarts par compétence sur tout le périmètre : calcul serveur, mis en cache jusqu'à la prochaine écriture */
  async function ecarts(C, q){
    const cle = [C.login, q.site||"", q.dept||"", q.fonction||"", q.q||"", GEN, (await D.employes()).length, o.generation ? o.generation() : ""].join("|"), c = CACHE.get(cle);
    if (c && Date.now() - c.t < 3600000) return c.r;
    const {l} = await salaries(C, q), cat = await catalogue(), ex = await exigences();
    const req = {}; ex.forEach(x=>{ (req[x.fonction] = req[x.fonction] || {})[x.competence_id] = Number(x.niveau); });
    const niv = await niveauxIndex();
    const agg = {}; cat.forEach(k=>{ agg[k.id] = {id:k.id, code:k.code, nom:k.nom, concernes:0, conformes:0, ecarts:0}; });
    let salariesEcart = 0;
    for (const e of l){ const r = req[fonctionDe(e)]; if (!r) continue; let enEcart = false;
      for (const cid of Object.keys(r)){ const a = agg[cid]; if (!a) continue; a.concernes++; if ((niv.get(String(e.mat)+"|"+cid) || 0) >= r[cid]) a.conformes++; else { a.ecarts++; enEcart = true; } }
      if (enEcart) salariesEcart++; }
    const res = {salaries:l.length, salariesEcart, competences:Object.values(agg).map(a=>Object.assign(a, {taux:a.concernes ? Math.round(100*a.conformes/a.concernes) : null})).sort((x, y)=>y.ecarts - x.ecarts)};
    CACHE.set(cle, {t:Date.now(), r:res}); if (CACHE.size > 200) CACHE.clear();
    return res;
  }
  /* toutes les fonctions occupées (et celles qui ont déjà des exigences) — proposées au paramétrage */
  async function fonctionsConnues(){ const s = new Set((await D.employes()).map(fonctionDe).filter(Boolean)); (await B.all("SELECT DISTINCT fonction FROM comp_exigences")).forEach(r=>s.add(r.fonction)); return Array.from(s).sort((a, b)=>a.localeCompare(b, "fr")); }
  async function empIdDe(mat){ const e = (await D.employes()).find(x=>String(x.mat) === String(mat)); return e && e.id ? String(e.id) : null; }
  /* écriture d'un niveau dans une transaction, sous verrou (sous PostgreSQL, six saisies simultanées rompaient la
     chaîne de l'historique) ; « attendu » : niveau que l'auteur croyait trouver (409 si différent) */
  async function ecrire(mat, cid, n, par, motif, d, opts){
    opts = opts || {}; let res = null;
    const eid = await empIdDe(mat);
    await B.transaction(async ()=>{
      if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "cmp:"+mat+"|"+cid);
      const av = await B.get("SELECT niveau FROM comp_niveaux WHERE mat=? AND competence_id=?", mat, cid), a = av ? Number(av.niveau) : null;
      if (opts.attendu !== undefined && opts.attendu !== null && (a == null ? 0 : a) !== Number(opts.attendu)){ res = {conflit:a == null ? 0 : a}; return; }
      if (a !== null && (opts.hausse ? a >= n : a === n)){ res = {inchange:true, avant:a}; return; }
      if (opts.baisseMotif && a !== null && n < a && !motif){ res = {motif:true}; return; }
      await B.run("INSERT INTO comp_niveaux(mat,competence_id,niveau,d,evaluateur) VALUES(?,?,?,?,?) ON CONFLICT(mat, competence_id) DO UPDATE SET niveau=excluded.niveau, d=excluded.d, evaluateur=excluded.evaluateur", mat, cid, n, d || maintenant().slice(0, 10), par);
      const hid = "ch-"+crypto.randomBytes(8).toString("hex");
      await B.run("INSERT INTO comp_historique(id,mat,competence_id,avant,apres,par,motif,ts) VALUES(?,?,?,?,?,?,?,?)", hid, mat, cid, a, n, par, String(motif || "").slice(0, 300), maintenant());
      if (eid){ await B.run("INSERT INTO comp_hist_emp(hist_id, emp_id) VALUES(?,?)", hid, eid); await B.run("INSERT INTO comp_mats(mat, emp_id) VALUES(?,?) ON CONFLICT(mat) DO UPDATE SET emp_id=excluded.emp_id", mat, eid); }
      /* correctif 39 : si la transaction (éventuellement celle d'un autre module) est annulée, l'index est oublié (il
         gardait un niveau jamais enregistré jusqu'au redémarrage) */
      if (B.siAnnulation) B.siAnnulation(oublier);
      if (NIV) NIV.set(mat+"|"+cid, n); NIV_V++; GEN++; CACHE.clear();
      res = {avant:a, apres:n};
    });
    /* le tableau de pilotage et les autres modules sont prévenus (cache du pilotage) */
    if (res && res.apres !== undefined && o.publier && !opts.silencieux) o.publier("competences.niveau", {mat, competence_id:cid, niveau:n});
    return res;
  }
  /* routeur du module (appelé par le socle pour /api/v1/competences…, uniquement si le module est actif) */
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, corpsJson, ip} = x;
    const L = (()=>{ /* correctif 41 : langue de l'écran (en-tête X-Langue envoyé par l'application) en priorité */ const l = String((req.headers || {})["x-langue"] || u.searchParams.get("lang") || (P && P.u && P.u.langue) || String((req.headers || {})["accept-language"] || "").slice(0, 2)).slice(0, 2); return l === "en" ? 1 : l === "ar" ? 2 : 0; })();
    const m = (k, v) => { let t = (MSG[k] || [k])[L] || MSG[k][0]; Object.keys(v || {}).forEach(z=>{ t = t.split("{"+z+"}").join(v[z]); }); return t; };
    const err = (st, k, v) => json(res, st, {message:m(k, v), code:k});
    const txt = (b, k, max) => { const v = b[k]; if (v == null) return ""; if (typeof v !== "string" && typeof v !== "number") throw Object.assign(new Error("texte"), {champ:k}); return String(v).trim().slice(0, max); };
    try { return await router(); }
    catch(e){ if (e && e.message === "JSON invalide") return err(400, "json"); if (e && e.message === "texte") return err(400, "texte", {c:e.champ}); throw e; }
    async function router(){
    const dr = droitsEcran(admin, P);
    if (dr.rang < 1) return err(403, "droitEmp");
    if (!dr.voir) return err(403, "masque");
    const droits = {modifier:dr.modifier, parametrer:dr.parametrer, exporter:dr.exporter};
    const q = Object.fromEntries(u.searchParams.entries());
    const publierParam = () => { GEN++; CACHE.clear(); if (o.publier) o.publier("competences.parametrage", {}); };
    if (p === "/api/v1/competences/catalogue" && req.method === "GET"){
      const {l} = await salaries(C, {});
      return json(res, 200, {competences:await catalogue(), retirees:dr.parametrer ? await B.all("SELECT * FROM comp_catalogue WHERE actif=0 ORDER BY code") : [], exigences:(await exigences()).map(z=>Object.assign(z, {niveau:Number(z.niveau)})),
        fonctions:Array.from(new Set(l.map(fonctionDe).filter(Boolean))).sort(), fonctionsParam:dr.parametrer ? await fonctionsConnues() : [], niveaux:NIVEAUX, droits});
    }
    if (p === "/api/v1/competences/catalogue" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const b = await corpsJson(req), code = txt(b, "code", 20), nom = txt(b, "nom", 120), domaine = txt(b, "domaine", 60);
      if (!code || !nom) return err(400, "codeNom");
      const id = "cp-"+crypto.randomBytes(5).toString("hex"); let pris = false;
      await B.transaction(async ()=>{
        /* correctif 39 : code unique sans tenir compte de la casse, sous verrou (codes en double sous PostgreSQL) */
        if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "cmp:code:"+code.toLowerCase());
        if (await B.get("SELECT 1 FROM comp_catalogue WHERE lower(code)=lower(?) AND actif=1", code)){ pris = true; return; }
        await B.run("INSERT INTO comp_catalogue(id,code,nom,domaine,actif,cree) VALUES(?,?,?,?,1,?)", id, code, nom, domaine, maintenant()); });
      if (pris) return err(409, "codePris");
      publierParam(); await audit(C.login, "competences.catalogue", "ajout "+id+" "+code+" — "+nom, ip);
      return json(res, 200, {ok:true, id});
    }
    /* correctif 39 : modification, retrait et réactivation d'une compétence */
    const mc = /^\/api\/v1\/competences\/catalogue\/([^/]+)(?:\/(retirer|reactiver))?$/.exec(p);
    if (mc && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const c = await B.get("SELECT * FROM comp_catalogue WHERE id=?", mc[1]); if (!c) return err(404, "compIntrouvable");
      if (mc[2] === "retirer"){
        if (!Number(c.actif)) return err(409, "dejaRetiree");
        const n = Number((await B.get("SELECT COUNT(*) n FROM comp_exigences WHERE competence_id=?", c.id)).n); if (n) return err(409, "utilisee", {n});
        await B.run("UPDATE comp_catalogue SET actif=0 WHERE id=? AND actif=1", c.id); publierParam();
        await audit(C.login, "competences.catalogue", "retrait "+c.id+" "+c.code, ip); return json(res, 200, {ok:true}); }
      if (mc[2] === "reactiver"){
        if (Number(c.actif)) return err(409, "dejaActive"); let pris = false;
        await B.transaction(async ()=>{ if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "cmp:code:"+String(c.code).toLowerCase());
          if (await B.get("SELECT 1 FROM comp_catalogue WHERE lower(code)=lower(?) AND actif=1", c.code)){ pris = true; return; } await B.run("UPDATE comp_catalogue SET actif=1 WHERE id=?", c.id); });
        if (pris) return err(409, "codePris"); publierParam();
        await audit(C.login, "competences.catalogue", "réactivation "+c.id+" "+c.code, ip); return json(res, 200, {ok:true}); }
      if (!Number(c.actif)) return err(409, "compInactive");
      const b = await corpsJson(req), code = b.code === undefined ? c.code : txt(b, "code", 20), nom = b.nom === undefined ? c.nom : txt(b, "nom", 120), domaine = b.domaine === undefined ? (c.domaine || "") : txt(b, "domaine", 60);
      if (!code || !nom) return err(400, "codeNom");
      if (code === c.code && nom === c.nom && domaine === (c.domaine || "")) return json(res, 200, {ok:true, inchange:true});
      let pris = false;
      await B.transaction(async ()=>{ if (pg) await B.get("SELECT pg_advisory_xact_lock(hashtext(?))", "cmp:code:"+code.toLowerCase());
        if (await B.get("SELECT 1 FROM comp_catalogue WHERE lower(code)=lower(?) AND actif=1 AND id <> ?", code, c.id)){ pris = true; return; }
        await B.run("UPDATE comp_catalogue SET code=?, nom=?, domaine=? WHERE id=?", code, nom, domaine, c.id); });
      if (pris) return err(409, "codePris"); publierParam();
      await audit(C.login, "competences.catalogue", "modification "+c.id+" : "+c.code+" → "+code+", « "+c.nom+" » → « "+nom+" »", ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/competences/exigence" && req.method === "POST"){
      if (!dr.parametrer) return err(403, "parametrage");
      const b = await corpsJson(req), f = txt(b, "fonction", 80), cid = txt(b, "competenceId", 60), n = entier(b.niveau);
      if (!f || !await B.get("SELECT 1 FROM comp_catalogue WHERE id=? AND actif=1", cid) || NIVEAUX.indexOf(n) < 0) return err(400, "exigence");
      if ((await fonctionsConnues()).indexOf(f) < 0) return err(400, "fonctionInconnue");
      const av = await B.get("SELECT niveau FROM comp_exigences WHERE fonction=? AND competence_id=?", f, cid), a = av ? Number(av.niveau) : 0;
      /* correctif 39 : rien n'est écrit ni journalisé si rien ne change */
      if (a === n) return json(res, 200, {ok:true, inchange:true});
      if (n === 0) await B.run("DELETE FROM comp_exigences WHERE fonction=? AND competence_id=?", f, cid);
      else await B.run("INSERT INTO comp_exigences(fonction,competence_id,niveau) VALUES(?,?,?) ON CONFLICT(fonction, competence_id) DO UPDATE SET niveau=excluded.niveau", f, cid, n);
      publierParam(); await audit(C.login, "competences.exigence", f+" — "+cid+" : niveau requis "+a+" → "+n, ip);
      return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/competences/matrice" && req.method === "GET") return json(res, 200, Object.assign(await matrice(C, q), {droits}));
    if (p === "/api/v1/competences/ecarts" && req.method === "GET") return json(res, 200, await ecarts(C, q));
    /* correctif 39 : export CSV de la matrice du périmètre (niveaux atteints / requis) */
    if (p === "/api/v1/competences/export" && req.method === "GET"){
      if (!dr.exporter) return err(403, "export");
      const r = await matrice(C, Object.assign({}, q, {offset:0, limit:200})), {l} = await salaries(C, q), cat = r.competences;
      const tous = []; for (let off = 0; off < l.length; off += 200) tous.push(...(await matrice(C, Object.assign({}, q, {offset:off, limit:200}))).lignes);
      const TT = [["Matricule","Nom","Fonction","Écarts"], ["Employee ID","Name","Job","Gaps"], ["المعرف","الاسم","الوظيفة","الفوارق"]][L];
      const cel = v => { let z = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(z)) z = "'"+z; return /[";\n\r]/.test(z) ? '"'+z.replace(/"/g, '""')+'"' : z; };
      const csv = "﻿"+[TT.concat(cat.map(c=>c.code)).map(cel).join(";")].concat(tous.map(z=>[z.mat, z.nom, z.fonction, z.ecarts].concat(cat.map(c=>(z.niveaux[c.id] || 0)+(z.requis[c.id] ? "/"+z.requis[c.id] : ""))).map(cel).join(";"))).join("\r\n");
      await audit(C.login, "competences.export", tous.length+" salarié(s)", ip);
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"competences.csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(csv);
    }
    if (p === "/api/v1/competences/niveau" && req.method === "POST"){
      if (!dr.modifier) return err(403, "refuse");
      const b = await corpsJson(req), mat = txt(b, "mat", 40), cid = txt(b, "competenceId", 60), n = entier(b.niveau), motif = txt(b, "motif", 300);
      if (!(P.set === null || (P.set && P.set.has(mat))) && !admin) return err(404, "horsPerim");
      /* correctif 34 : salarié existant et présent ; jamais son propre niveau */
      if (!(await salarieActif(mat))) return err(404, "salarie");
      if (!admin && P.u && P.u.empId){ const moi = (await D.employes()).find(e=>e.id === P.u.empId); if (moi && String(moi.mat) === mat) return err(403, "soi"); }
      if (!await B.get("SELECT 1 FROM comp_catalogue WHERE id=? AND actif=1", cid) || NIVEAUX.indexOf(n) < 0) return err(400, "niveau");
      const attendu = b.avant === undefined || b.avant === null || b.avant === "" ? undefined : entier(b.avant);
      /* correctif 39 : l'écran envoie le niveau qu'il affichait (une saisie d'un autre utilisateur n'est plus écrasée) ;
         une baisse exige un motif */
      const r = await ecrire(mat, cid, n, C.login, motif, null, {attendu, baisseMotif:true});
      if (r.conflit !== undefined) return err(409, "modifie", {n:r.conflit});
      if (r.motif) return err(400, "motifBaisse");
      if (r.inchange) return json(res, 200, {ok:true, avant:n, apres:n, inchange:true});
      await audit(C.login, "competences.niveau", mat+" — "+cid+" : "+(r.avant == null ? "—" : r.avant)+" → "+n, ip);
      return json(res, 200, {ok:true, avant:r.avant, apres:n});
    }
    if (p === "/api/v1/competences/historique" && req.method === "GET"){
      const mat = String(q.mat||""); if (!(P.set === null || (P.set && P.set.has(mat))) && !admin) return err(404, "horsPerim");
      const off = Math.min(1e6, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
      /* correctif 39 : lignes de cette fiche (matricules successifs suivis ; un matricule réutilisé ne montre pas
         l'historique de l'ancien titulaire) ; motif réservé à l'accès aux données sensibles ; pagination */
      const eid = await empIdDe(mat);
      const w = eid ? "(h.id IN (SELECT hist_id FROM comp_hist_emp WHERE emp_id=?) OR (h.mat=? AND NOT EXISTS (SELECT 1 FROM comp_hist_emp x WHERE x.hist_id=h.id)))" : "h.mat=?", a = eid ? [eid, mat] : [mat];
      const total = Number((await B.get("SELECT COUNT(*) n FROM comp_historique h WHERE "+w, ...a)).n);
      const l = await B.all("SELECT h.id, h.competence_id, c.code, c.nom, h.avant, h.apres, h.par, h.motif, h.ts FROM comp_historique h LEFT JOIN comp_catalogue c ON c.id=h.competence_id WHERE "+w+" ORDER BY h.ts DESC, h.id LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, historique:l.map(r=>Object.assign(r, {avant:r.avant == null ? null : Number(r.avant), apres:Number(r.apres), motif:dr.sensibles ? r.motif : (r.motif ? "•••" : "")}))});
    }
    return err(404, "introuvable");
    }
  }
  /* rubrique de la fiche salarié 360° : niveaux requis par sa fonction et niveaux atteints */
  async function fiche360(x){
    if (!droitsEcran(x.admin, x.P).voir) return null;
    const f = fonctionDe(x.emp), ex = await B.all("SELECT e.competence_id, e.niveau requis, c.code, c.nom FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE e.fonction=? AND c.actif=1 ORDER BY c.code", f);
    const niv = {}; (await B.all("SELECT competence_id, niveau FROM comp_niveaux WHERE mat=?", String(x.mat))).forEach(r=>{ niv[r.competence_id] = Number(r.niveau); });
    return {cle:"competences", vue:"competences", sousTitre:f, lignes:ex.length ? ex.map(r=>({l:r.code+" — "+r.nom, v:(niv[r.competence_id]||0)+" / "+r.requis, alerte:(niv[r.competence_id]||0) < Number(r.requis)})) : [{k:"aucuneExigence", v:"—"}]};
  }
  /* élément « À traiter » : correctif 39 — nombre de salariés en écart (et non la somme salarié × compétence) */
  async function aTraiter(x){
    const dr = droitsEcran(x.admin, x.P); if (!dr.voir || !dr.modifier) return [];
    const r = await ecarts(x.C, {}), n = r.salariesEcart || 0;
    return n ? [{domaine:"talents", cle:"competences-ecarts", nombre:n, urgence:0, vue:"competences"}] : [];
  }
  /* correctif 39 : suivi des matricules — un matricule changé emporte ses niveaux ; ceux d'un salarié supprimé dont le
     matricule est réutilisé sont retirés (ils passaient au nouvel embauché) ; garde-fou si la liste est vide */
  if (o.planifier) o.planifier("matricules", {intervalle:3600000, premier:180000, priorite:3, delai:120000, fn:async ()=>{
    const E = await D.employes(); if (!E.length) return "liste des salariés vide : rien n'est modifié";
    const parId = new Map(E.map(e=>[String(e.id), e])), parMat = new Map(E.map(e=>[String(e.mat), e]));
    let suivis = 0, retires = 0;
    for (const r of await B.all("SELECT mat, emp_id FROM comp_mats")){
      const e = parId.get(String(r.emp_id)), occ = parMat.get(String(r.mat));
      if (e && String(e.mat) !== String(r.mat)){
        await B.transaction(async ()=>{
          if (!await B.get("SELECT 1 FROM comp_niveaux WHERE mat=? LIMIT 1", String(e.mat))) await B.run("UPDATE comp_niveaux SET mat=? WHERE mat=?", String(e.mat), r.mat);
          else await B.run("DELETE FROM comp_niveaux WHERE mat=?", r.mat);
          await B.run("DELETE FROM comp_mats WHERE mat=?", r.mat);
          await B.run("INSERT INTO comp_mats(mat, emp_id) VALUES(?,?) ON CONFLICT(mat) DO UPDATE SET emp_id=excluded.emp_id", String(e.mat), String(e.id)); });
        suivis++; await audit("systeme", "competences.matricule", r.mat+" → "+e.mat+" : niveaux suivis"); continue; }
      if (!e && occ && String(occ.id) !== String(r.emp_id)){
        await B.transaction(async ()=>{ await B.run("DELETE FROM comp_niveaux WHERE mat=?", r.mat); await B.run("UPDATE comp_mats SET emp_id=? WHERE mat=?", String(occ.id), r.mat); });
        retires++; await audit("systeme", "competences.matricule", r.mat+" réutilisé : niveaux de l'ancien titulaire retirés"); }
    }
    if (suivis || retires) oublier();
    return suivis+" matricule(s) suivi(s), "+retires+" réutilisé(s)"; }});
  /* préchargement de l'index au démarrage, en arrière-plan (le premier écran d'écarts n'attend pas) */
  setTimeout(()=>{ niveauxIndex().catch(()=>{}); }, 8000).unref();
  /* v56.30 (§ 2) : service déclaré pour les autres modules — FW-Formation n'accède plus aux tables de FW-Competences */
  const service = {
    catalogue:()=>B.all("SELECT id, code, nom FROM comp_catalogue WHERE actif=1 ORDER BY code"),
    exigences:()=>B.all("SELECT fonction, competence_id, niveau FROM comp_exigences"),
    niveaux:()=>B.all("SELECT mat, competence_id, niveau FROM comp_niveaux"),
    /* correctif 37 : index en mémoire */
    niveauxIndex:()=>niveauxIndex(),
    exigencesFonction:(mat, fonction)=>B.all("SELECT e.competence_id, e.niveau requis, c.code, c.nom, (SELECT niveau FROM comp_niveaux n WHERE n.mat=? AND n.competence_id=e.competence_id) actuel FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE e.fonction=? AND c.actif=1 ORDER BY c.code", mat, fonction)
      .then(l=>l.map(r=>Object.assign(r, {requis:Number(r.requis), actuel:r.actuel == null ? null : Number(r.actuel)}))),
    /* niveau écrit (hausse seulement si « hausse »), historisé et annoncé ; true si modifié. Correctif 39 : sous verrou,
       dans la transaction de l'appelant, index oublié si elle est annulée */
    async ecrireNiveau(mat, competenceId, niveau, par, motif, d, hausse){
      niveau = entier(niveau); if (NIVEAUX.indexOf(niveau) < 0 || !(await salarieActif(mat))) return false;
      /* correctif 37 : pas de niveau sur une compétence retirée du catalogue */
      if (!await B.get("SELECT 1 FROM comp_catalogue WHERE id=? AND actif=1", competenceId)) return false;
      const r = await ecrire(String(mat), String(competenceId), niveau, par, motif, d, {hausse});
      return !!(r && r.apres !== undefined); },
    porterNiveau(mat, competenceId, niveau, par, motif, d){ return service.ecrireNiveau(mat, competenceId, niveau, par, motif, d, true); }
  };
  return {traiter, aTraiter, fiche360, surEvenement, service};
}
module.exports = {ddl, tables, creer};
