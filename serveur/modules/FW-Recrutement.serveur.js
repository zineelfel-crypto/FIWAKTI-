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
  ...(pg ? ["CREATE OR REPLACE FUNCTION fiwakti_rec_hist_immuable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'historique non modifiable'; END $$ LANGUAGE plpgsql",
            "CREATE OR REPLACE TRIGGER rec_historique_immuable BEFORE UPDATE OR DELETE ON rec_historique FOR EACH ROW EXECUTE FUNCTION fiwakti_rec_hist_immuable()"]
         : ["CREATE TRIGGER IF NOT EXISTS rec_historique_maj BEFORE UPDATE ON rec_historique BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END",
            "CREATE TRIGGER IF NOT EXISTS rec_historique_sup BEFORE DELETE ON rec_historique BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END"])
];
const ddl = {pg:def(true), sqlite:def(false)};
const tables = {rec_parametres:"k", rec_embauches:"candidature_id", rec_postes:"id", rec_candidats:"id", rec_candidatures:"id", rec_historique:"id", rec_entretiens:"id", rec_cv:"candidat_id"};
/* étapes et transitions permises (la décision finale « retenu » exige le droit de validation) */
const ETAPES = ["recue", "preselection", "entretien", "decision", "retenu", "refuse"];
/* refuse → recue : réexamen d'un refus, traité comme une décision (droit de validation et motif) */
const SUIVANTES = {recue:["preselection","refuse"], preselection:["entretien","refuse"], entretien:["decision","refuse"], decision:["retenu","refuse"], retenu:[], refuse:["recue"]};
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
  const dateOk = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||"")); if (!m || +m[1] < 1900) return false; const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); return d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3]; };
  /* note entière de 0 à 5 (2,5 enregistré sous SQLite, erreur 500 sous PostgreSQL) ; undefined = invalide */
  const noteDe = v => v == null || v === "" ? null : (Number.isInteger(+v) && +v >= 0 && +v <= 5 ? +v : undefined);
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
    const sitesD = new Set(); for (const e of emps) if (e.siteId && e.deptId && depts.has(e.deptId) && !(e.sortie && e.sortie < j)) sitesD.add(e.siteId);
    const r = {sites, depts, sitesD}; MEMO.set(P, {emps, j, r}); return r;
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
     et décisions restent, anonymes, pour les statistiques et l'audit. Les candidats retenus ne sont jamais effacés. */
  const DUREES = [6, 12, 24, 36];
  async function conservation(){ const r = await B.get("SELECT v FROM rec_parametres WHERE k='conservation_mois'"); const n = Number(r && r.v); return DUREES.indexOf(n) >= 0 ? n : 24; }
  async function purger(){
    const mois = await conservation(), lim = new Date(Date.now() - mois*30.44*86400000).toISOString();
    /* correctif 34 : seules les candidatures clôturées (refusées, ou poste clos) sont effacées — un candidat en entretien
       sur un poste ouvert, sans mouvement depuis l'échéance, était effacé */
    const l = await B.all("SELECT c.id FROM rec_candidats c WHERE c.nom <> '—' AND NOT EXISTS (SELECT 1 FROM rec_candidatures a LEFT JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id AND (a.etape='retenu' OR a.maj > ? OR (a.etape <> 'refuse' AND p.statut='ouvert'))) AND c.cree < ?", lim, lim);
    for (const r of l) await effacer(r.id);
    if (l.length) await audit("systeme", "recrutement.purge", l.length+" candidat(s) effacé(s) après "+mois+" mois");
    return l.length;
  }
  async function effacer(cid){
      await B.transaction(async ()=>{
        await B.run("UPDATE rec_candidats SET nom='—', prenom=NULL, email=NULL, tel=NULL, source=NULL WHERE id=?", cid);
        await B.run("DELETE FROM rec_cv WHERE candidat_id=?", cid);
        await B.run("DELETE FROM rec_entretiens WHERE candidature_id IN (SELECT id FROM rec_candidatures WHERE candidat_id=?)", cid);
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
    const n = Number((await B.get("SELECT COUNT(*) n FROM rec_postes WHERE statut='ouvert' AND fonction=?"+ps.sql, f, ...ps.a)).n);
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
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    /* correctif 34 : matrice de l'écran (un menu masqué lisait les candidats et ouvrait des postes) */
    const dr = droitsEcran(admin, P), rang = dr.rang;
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    if (!dr.voir) return erreur(res, 403, "Écran Recrutement masqué pour votre profil.");
    const q = Object.fromEntries(u.searchParams.entries());
    const refuse = () => erreur(res, 403, "Action non permise par vos droits sur l'écran Recrutement.");
    const pt = await portee(P), global = pt.sites === null;
    const posteVu = po => posteVuP(po, pt);
    const candidatureVue = async cid => { const s = posteSql(pt, "p."); return cid ? await B.get("SELECT a.*, p.statut poste_statut, p.nb poste_nb, p.site_id poste_site, p.intitule poste_intitule FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.id=?"+s.sql, String(cid), ...s.a) : null; };
    const candidatVu = async cid => { if (global) return !!await B.get("SELECT 1 FROM rec_candidats WHERE id=?", String(cid||""));
      const s = posteSql(pt, "p."); return !!await B.get("SELECT 1 FROM rec_candidats c WHERE c.id=? AND (c.par=? OR EXISTS (SELECT 1 FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id"+s.sql+"))", String(cid||""), C.login, ...s.a); };
    /* coordonnées réservées au droit de saisie (un profil « lecture » voyait courriels et téléphones) */
    const sansPerso = l => dr.perso ? l : l.map(r=>Object.assign({}, r, {email:null, tel:null}));
    if (p === "/api/v1/recrutement/parametres" && req.method === "GET") return json(res, 200, {conservationMois:await conservation(), durees:DUREES});
    if (p === "/api/v1/recrutement/parametres" && req.method === "POST"){
      if (!dr.parametrer) return erreur(res, 403, "Réservé au paramétrage.");
      const n = Number((await corpsJson(req)).conservationMois); if (DUREES.indexOf(n) < 0) return erreur(res, 400, "Durée non prévue.");
      const av = await conservation();
      await B.run("INSERT INTO rec_parametres(k,v) VALUES('conservation_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n));
      await audit(C.login, "recrutement.conservation", av+" → "+n+" mois", ip); const e = await purger();
      return json(res, 200, {ok:true, conservationMois:n, effaces:e});
    }
    /* postes */
    if (p === "/api/v1/recrutement/postes" && req.method === "GET"){
      const st = q.statut === "clos" ? "clos" : q.statut === "tous" ? null : "ouvert", {off, lim} = page(q);
      const ps = posteSql(pt, "p."), w = " WHERE 1=1"+(st ? " AND p.statut=?" : "")+ps.sql, a = (st ? [st] : []).concat(ps.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_postes p"+w, ...a)).n);
      const l = await B.all("SELECT p.*, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id) candidatures, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id AND c.etape='retenu') retenus FROM rec_postes p"+w+" ORDER BY p.ouvert_le DESC, p.id LIMIT "+lim+" OFFSET "+off, ...a);
      /* sites et services proposés à l'ouverture d'un poste : ceux de la portée du compte */
      const ref = await (D.referentielLecture || D.referentiel)() || {};
      const choix = {sites:(ref.sites||[]).filter(z=>z && (global || pt.sites.has(z.id) || pt.sitesD.has(z.id))).map(z=>({id:z.id, nom:z.nom||z.id})),
        depts:(ref.depts||[]).filter(z=>z && (global || pt.depts.has(z.id))).map(z=>({id:z.id, nom:z.nom||z.id})), siteObligatoire:(ref.sites||[]).length > 0};
      return json(res, 200, {total, lignes:l, choix, droits:{creer:dr.creer, modifier:dr.modifier, valider:dr.valider, perso:dr.perso, parametrer:dr.parametrer}});
    }
    if (p === "/api/v1/recrutement/postes" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), intit = String(b.intitule||"").trim().slice(0, 120);
      if (!intit) return erreur(res, 400, "Intitulé obligatoire.");
      const nb = b.nb == null || b.nb === "" ? 1 : +b.nb;
      if (!Number.isInteger(nb) || nb < 1 || nb > 500) return erreur(res, 400, "Nombre de postes : entier de 1 à 500.");
      /* correctif 34 : site et service vérifiés dans le référentiel ; un compte limité ouvre un poste sur un site ou un
         service entièrement couvert par son périmètre */
      const ref = await (D.referentielLecture || D.referentiel)() || {}, siteId = b.siteId ? String(b.siteId) : null, deptId = b.deptId ? String(b.deptId) : null;
      if (siteId && !(ref.sites||[]).some(z=>z && z.id === siteId)) return erreur(res, 400, "Site inconnu.");
      if (deptId && !(ref.depts||[]).some(z=>z && z.id === deptId)) return erreur(res, 400, "Service inconnu.");
      if (!siteId && (ref.sites||[]).length) return erreur(res, 400, "Site obligatoire.");
      if (!global && !((siteId && pt.sites.has(siteId)) || (deptId && pt.depts.has(deptId)))) return erreur(res, 403, "Site ou service hors de votre périmètre.");
      const i = id("rp"); await B.run("INSERT INTO rec_postes(id,intitule,fonction,site_id,dept_id,nb,statut,description,ouvert_le,par) VALUES(?,?,?,?,?,?,?,?,?,?)",
        i, intit, String(b.fonction||"").slice(0, 80), siteId, deptId, nb, "ouvert", String(b.description||"").slice(0, 4000), maint(), C.login);
      await audit(C.login, "recrutement.poste", "ouvert : "+i+" « "+intit+" », "+nb+" poste(s), site "+(siteId||"—")+(deptId ? ", service "+deptId : ""), ip); return json(res, 200, {ok:true, id:i});
    }
    const mp = /^\/api\/v1\/recrutement\/postes\/([^/]+)\/(clore|rouvrir)$/.exec(p);
    if (mp && req.method === "POST"){
      if (!dr.valider) return refuse();
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", mp[1]);
      if (!posteVu(po)) return erreur(res, 404, "Poste introuvable."); /* 56.33.11 */
      const vers = mp[2] === "clore" ? "clos" : "ouvert";
      if (po.statut === vers) return erreur(res, 409, mp[2] === "clore" ? "Ce poste est déjà clos." : "Ce poste est déjà ouvert.");
      const r = await B.run("UPDATE rec_postes SET statut=?, clos_le=? WHERE id=? AND statut=?", vers, vers === "clos" ? maint() : null, mp[1], po.statut);
      if (!r.n) return erreur(res, 409, "Le poste vient d'être modifié : actualisez.");
      await audit(C.login, "recrutement.poste", mp[1]+" « "+po.intitule+" » : "+po.statut+" → "+vers, ip); return json(res, 200, {ok:true});
    }
    /* candidats */
    if (p === "/api/v1/recrutement/candidats" && req.method === "GET"){
      const {off, lim} = page(q), s = String(q.q||"").trim().toLowerCase().slice(0, 100);
      /* correctif 34 : « % » et « _ » recherchés tels quels */
      const ps = posteSql(pt, "p."), w = " WHERE 1=1"+(s ? " AND lower(c.nom || ' ' || COALESCE(c.prenom,'') || ' ' || COALESCE(c.email,'')) LIKE ? ESCAPE '\\'" : "")
        +(global ? "" : " AND (c.par=? OR EXISTS (SELECT 1 FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.candidat_id=c.id"+ps.sql+"))");
      const a = (s ? ["%"+s.replace(/[\\%_]/g, m=>"\\"+m)+"%"] : []).concat(global ? [] : [C.login, ...ps.a]);
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_candidats c"+w, ...a)).n);
      const l = await B.all("SELECT c.*, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv, (SELECT COUNT(*) FROM rec_candidatures a WHERE a.candidat_id=c.id AND a.etape='retenu') retenu FROM rec_candidats c"+w+" ORDER BY c.cree DESC, c.id LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, lignes:sansPerso(l)});
    }
    if (p === "/api/v1/recrutement/candidats" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req, 8e6), nom = String(b.nom||"").trim().slice(0, 80), prenom = String(b.prenom||"").trim().slice(0, 80);
      const email = String(b.email||"").trim().toLowerCase().slice(0, 120), tel = String(b.tel||"").trim().slice(0, 30);
      if (!nom) return erreur(res, 400, "Nom obligatoire.");
      if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return erreur(res, 400, "Courriel invalide.");
      if (tel && !/^[+\d][\d .\-()]{5,29}$/.test(tel)) return erreur(res, 400, "Téléphone invalide.");
      /* v56.23 : le CV est entièrement contrôlé AVANT toute écriture ; candidat, CV, candidature et historique sont
         enregistrés dans une seule transaction (un CV refusé ne laisse aucun candidat partiel) */
      let cvBuf = null;
      if (b.cv && b.cv.donnees){ const buf = Buffer.from(String(b.cv.donnees), "base64");
        if (buf.length > 5*1024*1024) return erreur(res, 413, "CV trop volumineux (5 Mo au plus).");
        if (!/^(application\/pdf|image\/(png|jpeg))$/.test(b.cv.type||"")) return erreur(res, 400, "CV : PDF, PNG ou JPEG uniquement.");
        const sig = buf.subarray(0, 8), estPdf = sig.subarray(0, 5).toString("latin1") === "%PDF-", estPng = sig.equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])), estJpg = sig[0] === 0xFF && sig[1] === 0xD8 && sig[2] === 0xFF;
        const attendu = b.cv.type === "application/pdf" ? estPdf : b.cv.type === "image/png" ? estPng : estJpg;
        if (!attendu) return erreur(res, 400, "CV refusé : le contenu du fichier ne correspond pas à son type.");
        if (!/\.(pdf|png|jpe?g)$/i.test(String(b.cv.nom||""))) return erreur(res, 400, "CV refusé : extension non autorisée.");
        cvBuf = buf; }
      if (b.posteId && !posteVu(await B.get("SELECT * FROM rec_postes WHERE id=? AND statut='ouvert'", String(b.posteId)))) return erreur(res, 400, "Poste ouvert obligatoire.");
      /* correctif 34 : candidat déjà enregistré (même courriel, ou mêmes nom, prénom et téléphone) — 409 au lieu d'un doublon */
      const dbl = email ? await B.get("SELECT id FROM rec_candidats WHERE lower(email)=? AND nom <> '—'", email)
        : tel ? await B.get("SELECT id FROM rec_candidats WHERE lower(nom)=? AND lower(COALESCE(prenom,''))=? AND tel=?", nom.toLowerCase(), prenom.toLowerCase(), tel) : null;
      if (dbl && b.doublonAccepte !== true) return json(res, 409, {message:"Ce candidat est déjà enregistré : sa candidature est rattachée à sa fiche existante si vous confirmez.", doublon:true, candidatId:await candidatVu(dbl.id) ? dbl.id : null});
      if (dbl && b.posteId){
        if (!await candidatVu(dbl.id) && !global) return erreur(res, 409, "Ce candidat est déjà enregistré par un autre service.");
        if (await B.get("SELECT 1 FROM rec_candidatures WHERE poste_id=? AND candidat_id=?", String(b.posteId), dbl.id)) return erreur(res, 409, "Ce candidat a déjà postulé à ce poste.");
      }
      const i = dbl ? dbl.id : id("rc"), cvChiffre = cvBuf ? chiffrer(cvBuf) : null; let c = null;
      try {
        await B.transaction(async ()=>{
          if (!dbl) await B.run("INSERT INTO rec_candidats(id,nom,prenom,email,tel,source,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, nom, prenom, email, tel, String(b.source||"").slice(0, 60), maint(), C.login);
          if (cvBuf) await B.run("INSERT INTO rec_cv(candidat_id,nom_fichier,type,taille,donnees,cree) VALUES(?,?,?,?,?,?) ON CONFLICT(candidat_id) DO UPDATE SET nom_fichier=excluded.nom_fichier, type=excluded.type, taille=excluded.taille, donnees=excluded.donnees, cree=excluded.cree", i, String(b.cv.nom||"cv").slice(0, 120), b.cv.type, cvBuf.length, cvChiffre, maint());
          if (b.posteId){ c = id("ra"); await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, String(b.posteId), i, "recue", maint(), maint());
            await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint()); }
        });
      } catch(e){ return erreur(res, 409, "Ce candidat a déjà postulé à ce poste."); }
      /* correctif 34 : l'audit ne garde que l'identifiant (le nom restait dans le journal après l'effacement RGPD) */
      await audit(C.login, "recrutement.candidat", (dbl ? "existant " : "ajout ")+i+(c ? ", candidature "+c+" au poste "+b.posteId : "")+(cvBuf ? ", CV" : ""), ip); return json(res, 200, {ok:true, id:i, candidature:c});
    }
    /* correctif 34 : effacement sur demande du candidat (droit à l'effacement), hors candidat retenu */
    const mef = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/effacer$/.exec(p);
    if (mef && req.method === "POST"){
      if (!dr.valider) return refuse();
      if (!await candidatVu(mef[1])) return erreur(res, 404, "Candidat introuvable.");
      const c = await B.get("SELECT nom, (SELECT COUNT(*) FROM rec_candidatures a WHERE a.candidat_id=rec_candidats.id AND a.etape='retenu') retenu FROM rec_candidats WHERE id=?", mef[1]);
      if (c.nom === "—") return erreur(res, 409, "Ce candidat est déjà effacé.");
      if (Number(c.retenu)) return erreur(res, 409, "Un candidat retenu n'est pas effacé : ses données suivent la fiche salarié.");
      await effacer(mef[1]);
      await audit(C.login, "recrutement.effacement", mef[1]+" (demande du candidat)", ip); return json(res, 200, {ok:true});
    }
    const mcv = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/cv$/.exec(p);
    if (mcv && req.method === "GET"){
      /* 56.33.11 : CV déchiffré réservé au droit de saisie et aux candidats du périmètre */
      if (!dr.perso) return erreur(res, 403, "Droit de saisie requis.");
      if (!await candidatVu(mcv[1])) return erreur(res, 404, "Aucun CV.");
      const r = await B.get("SELECT * FROM rec_cv WHERE candidat_id=?", mcv[1]); if (!r) return erreur(res, 404, "Aucun CV.");
      await audit(C.login, "recrutement.cv.consulte", mcv[1], ip);
      res.writeHead(200, {"Content-Type":r.type, "Content-Disposition":"attachment; filename=\""+String(r.nom_fichier).replace(/[^\w.\- ]/g, "_")+"\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(dechiffrer(r.donnees));
    }
    /* candidatures : tableau par étape, paginé */
    if (p === "/api/v1/recrutement/candidatures" && req.method === "GET"){
      const {off, lim} = page(q); if (!q.poste) return erreur(res, 400, "Poste obligatoire.");
      const po = await B.get("SELECT * FROM rec_postes WHERE id=?", String(q.poste));
      if (!posteVu(po)) return erreur(res, 404, "Poste introuvable."); /* 56.33.11 */
      const comptes = {}; (await B.all("SELECT etape, COUNT(*) n FROM rec_candidatures WHERE poste_id=? GROUP BY etape", po.id)).forEach(r=>{ comptes[r.etape] = Number(r.n); });
      const et = ETAPES.indexOf(q.etape) >= 0 ? q.etape : null;
      const l = await B.all("SELECT a.id, a.etape, a.note, a.maj, c.id candidat_id, c.nom, c.prenom, c.email, c.tel, (SELECT mat FROM rec_embauches h WHERE h.candidature_id=a.id) salarie, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv FROM rec_candidatures a JOIN rec_candidats c ON c.id=a.candidat_id WHERE a.poste_id=?"+(et ? " AND a.etape=?" : "")+" ORDER BY a.maj DESC, a.id LIMIT "+lim+" OFFSET "+off, ...(et ? [po.id, et] : [po.id]));
      return json(res, 200, {etapes:ETAPES, suivantes:SUIVANTES, comptes, lignes:sansPerso(l), poste:{id:po.id, intitule:po.intitule, fonction:po.fonction, statut:po.statut, nb:po.nb, site_id:po.site_id, dept_id:po.dept_id}});
    }
    const ma = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/(etape|entretien|historique)$/.exec(p);
    /* 56.33.11 : historique et comptes rendus d'entretien : droit de saisie et candidature du périmètre */
    if (ma && ma[2] === "historique" && req.method === "GET"){
      if (!dr.perso) return erreur(res, 403, "Droit de saisie requis.");
      if (!await candidatureVue(ma[1])) return erreur(res, 404, "Candidature introuvable.");
      return json(res, 200, {historique:await B.all("SELECT * FROM rec_historique WHERE candidature_id=? ORDER BY ts, id", ma[1]), entretiens:await B.all("SELECT * FROM rec_entretiens WHERE candidature_id=? ORDER BY d, cree", ma[1])}); }
    if (ma && ma[2] === "etape" && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const b = await corpsJson(req), a = await candidatureVue(ma[1]); if (!a) return erreur(res, 404, "Candidature introuvable.");
      const vers = String(b.vers||""), motif = String(b.motif||"").trim().slice(0, 500), note = noteDe(b.note);
      if (note === undefined) return erreur(res, 400, "Note : entier de 0 à 5.");
      /* correctif 34 : rien ne bouge sur un poste clos */
      if (a.poste_statut !== "ouvert") return erreur(res, 409, "Poste clos : rouvrez-le pour faire avancer la candidature.");
      if ((SUIVANTES[a.etape]||[]).indexOf(vers) < 0) return erreur(res, 409, "Passage de « "+a.etape+" » à « "+vers+" » non permis.");
      /* décision : retenu, refusé, et réexamen d'un refus (avant : un compte en saisie annulait un refus sans motif) */
      const decision = vers === "retenu" || vers === "refuse" || a.etape === "refuse";
      if (decision && !dr.valider) return erreur(res, 403, "La décision est réservée au droit de validation.");
      if (decision && !motif) return erreur(res, 400, "Motif obligatoire pour une décision.");
      try {
        await B.transaction(async ()=>{
          /* correctif 34 : pas plus de retenus que de postes à pourvoir (contrôlé dans la transaction) */
          if (vers === "retenu" && Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures WHERE poste_id=? AND etape='retenu'", a.poste_id)).n) >= Number(a.poste_nb || 1)) throw Object.assign(new Error("Tous les postes à pourvoir ont déjà un candidat retenu ("+a.poste_nb+")."), {code:409});
          const u1 = await B.run("UPDATE rec_candidatures SET etape=?, maj=?, note=COALESCE(?, note) WHERE id=? AND etape=?", vers, maint(), note, a.id, a.etape);
          if (!u1.n) throw Object.assign(new Error("La candidature vient de changer d'étape : actualisez."), {code:409});
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, a.etape, vers, C.login, motif, maint());
        });
      } catch(e){ return erreur(res, 409, e.code === 409 ? e.message : "Enregistrement impossible : actualisez."); }
      await audit(C.login, "recrutement.etape", a.id+" : "+a.etape+" → "+vers+(note != null ? ", note "+note : ""), ip); return json(res, 200, {ok:true, de:a.etape, vers});
    }
    if (ma && ma[2] === "entretien" && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const b = await corpsJson(req); if (!dateOk(b.d)) return erreur(res, 400, "Date d'entretien invalide (jj/mm/aaaa).");
      const note = noteDe(b.note); if (note === undefined) return erreur(res, 400, "Note : entier de 0 à 5.");
      const a = await candidatureVue(ma[1]); if (!a) return erreur(res, 404, "Candidature introuvable."); /* 56.33.11 */
      if (a.poste_statut !== "ouvert") return erreur(res, 409, "Poste clos : aucun entretien ne peut être ajouté.");
      if (a.etape === "retenu" || a.etape === "refuse") return erreur(res, 409, "Candidature décidée : aucun entretien ne peut être ajouté.");
      const ie = id("re");
      await B.run("INSERT INTO rec_entretiens(id,candidature_id,d,intervenant,avis,note,par,cree) VALUES(?,?,?,?,?,?,?,?)", ie, a.id, String(b.d), String(b.intervenant||"").slice(0, 80), String(b.avis||"").slice(0, 2000), note, C.login, maint());
      await audit(C.login, "recrutement.entretien", a.id+" : entretien "+ie+" du "+String(b.d).split("-").reverse().join("/")+(note != null ? ", note "+note : ""), ip); return json(res, 200, {ok:true, id:ie});
    }
    /* v56.18 : embauche — la candidature retenue est rattachée à la fiche salarié créée (une seule fois, sans copie) */
    const mh = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/embauche$/.exec(p);
    if (mh && req.method === "POST"){
      if (!dr.modifier) return refuse();
      const a = await candidatureVue(mh[1]); if (!a) return erreur(res, 404, "Candidature introuvable.");
      if (a.etape !== "retenu") return erreur(res, 409, "Seule une candidature retenue donne lieu à une embauche.");
      const mat = String((await corpsJson(req)).mat||"").trim();
      /* 56.33.11 : fiche salarié du périmètre uniquement */
      const e = mat && (P.set === null || P.set.has(mat)) ? (await D.employes()).find(z=>String(z.mat) === mat) : null;
      if (!e) return erreur(res, 404, "Fiche salarié introuvable : enregistrez-la d'abord.");
      /* correctif 34 : fiche d'un salarié présent, entré après la candidature, sur le site du poste (un salarié sorti ou
         embauché des années plus tôt était accepté) */
      if (e.sortie && e.sortie < auj()) return erreur(res, 409, "Cette fiche est celle d'un salarié sorti.");
      if (!e.entree || String(e.entree) < String(a.cree).slice(0, 10)) return erreur(res, 409, "La fiche doit être celle d'un salarié entré après la candidature.");
      if (a.poste_site && e.siteId && e.siteId !== a.poste_site) return erreur(res, 409, "La fiche n'est pas rattachée au site du poste.");
      if (await B.get("SELECT 1 FROM rec_embauches WHERE candidature_id=? OR mat=?", a.id, mat)) return erreur(res, 409, "Cette embauche est déjà enregistrée.");
      try {
        await B.transaction(async ()=>{
          await B.run("INSERT INTO rec_embauches(candidature_id,mat,le,par) VALUES(?,?,?,?)", a.id, mat, maint(), C.login);
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, "retenu", "retenu", C.login, "fiche salarié créée : "+mat, maint());
        });
      } catch(e2){ return erreur(res, 409, "Cette embauche est déjà enregistrée."); }
      await audit(C.login, "recrutement.embauche", a.id+" → salarié "+mat, ip); return json(res, 200, {ok:true, mat});
    }
    if (p === "/api/v1/recrutement/candidatures" && req.method === "POST"){
      if (!dr.creer) return refuse();
      const b = await corpsJson(req), pid = String(b.posteId||""), cid = String(b.candidatId||"");
      if (!posteVu(await B.get("SELECT * FROM rec_postes WHERE id=? AND statut='ouvert'", pid))) return erreur(res, 400, "Poste ouvert obligatoire.");
      if (!await candidatVu(cid)) return erreur(res, 400, "Candidat introuvable."); /* 56.33.11 : candidat du périmètre */
      if ((await B.get("SELECT nom FROM rec_candidats WHERE id=?", cid)).nom === "—") return erreur(res, 409, "Candidat effacé.");
      if (await B.get("SELECT 1 FROM rec_candidatures WHERE poste_id=? AND candidat_id=?", pid, cid)) return erreur(res, 409, "Ce candidat a déjà postulé à ce poste.");
      const c = id("ra");
      try {
        await B.transaction(async ()=>{
          await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, pid, cid, "recue", maint(), maint());
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint());
        });
      } catch(e){ return erreur(res, 409, "Ce candidat a déjà postulé à ce poste."); }
      await audit(C.login, "recrutement.candidature", c+" : candidat "+cid+" au poste "+pid, ip);
      return json(res, 200, {ok:true, id:c});
    }
    return erreur(res, 404, "Introuvable.");
  }
  return {traiter, aTraiter, purger, fiche360};
}
module.exports = {ddl, tables, creer, ETAPES, SUIVANTES};
