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
  "CREATE TABLE IF NOT EXISTS rec_historique (id TEXT PRIMARY KEY, candidature_id TEXT NOT NULL, de TEXT, vers TEXT NOT NULL, par TEXT, motif TEXT, ts TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS rec_historique_cand ON rec_historique(candidature_id)",
  "CREATE TABLE IF NOT EXISTS rec_entretiens (id TEXT PRIMARY KEY, candidature_id TEXT NOT NULL, d TEXT NOT NULL, intervenant TEXT, avis TEXT, note INTEGER, par TEXT, cree TEXT NOT NULL)",
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
const SUIVANTES = {recue:["preselection","refuse"], preselection:["entretien","refuse"], entretien:["decision","refuse"], decision:["retenu","refuse"], retenu:[], refuse:["recue"]};
function creer(o){
  const {B, D, audit} = o, coffre = o.coffre;
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  /* v56.23 : jamais de clé de secours prévisible — sans coffre, le chiffrement échoue (fail closed) */
  const cle = () => { if (!coffre || typeof coffre.cle !== "function") throw new Error("Coffre de clés indisponible : chiffrement « recrutement » impossible."); return crypto.createHash("sha256").update(coffre.cle("recrutement")).digest(); };
  const chiffrer = b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(), iv); const x = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]).toString("base64"); };
  const dechiffrer = s => { const b = Buffer.from(s, "base64"), d = crypto.createDecipheriv("aes-256-gcm", cle(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };
  const page = q => ({off:Math.max(0, +q.offset||0), lim:Math.min(200, Math.max(1, +q.limit||50))});
  /* v1.1 : durée de conservation des candidats non retenus (6, 12, 24 ou 36 mois ; 24 par défaut). À l'échéance, les
     données personnelles du candidat sont effacées (identité, coordonnées, CV, comptes rendus d'entretien) ; les étapes
     et décisions restent, anonymes, pour les statistiques et l'audit. Les candidats retenus ne sont jamais effacés. */
  const DUREES = [6, 12, 24, 36];
  async function conservation(){ const r = await B.get("SELECT v FROM rec_parametres WHERE k='conservation_mois'"); const n = Number(r && r.v); return DUREES.indexOf(n) >= 0 ? n : 24; }
  async function purger(){
    const mois = await conservation(), lim = new Date(Date.now() - mois*30.44*86400000).toISOString();
    const l = await B.all("SELECT c.id FROM rec_candidats c WHERE c.nom <> '—' AND NOT EXISTS (SELECT 1 FROM rec_candidatures a WHERE a.candidat_id=c.id AND (a.etape='retenu' OR a.maj > ?)) AND c.cree < ?", lim, lim);
    for (const r of l){
      await B.transaction(async ()=>{
        await B.run("UPDATE rec_candidats SET nom='—', prenom=NULL, email=NULL, tel=NULL, source=NULL WHERE id=?", r.id);
        await B.run("DELETE FROM rec_cv WHERE candidat_id=?", r.id);
        await B.run("DELETE FROM rec_entretiens WHERE candidature_id IN (SELECT id FROM rec_candidatures WHERE candidat_id=?)", r.id);
      });
    }
    if (l.length) await audit("systeme", "recrutement.purge", l.length+" candidat(s) effacé(s) après "+mois+" mois");
    return l.length;
  }
  /* v56.16 : purge confiée au planificateur central (ignorée si le module est inactif) */
  if (o.planifier) o.planifier("purge-candidats", {intervalle:6*3600000, premier:60000, priorite:3, delai:10*60000, fn:async ()=>(await purger())+" candidat(s) effacé(s)"});
  else { setTimeout(()=>{ purger().catch(()=>{}); }, 60000).unref(); setInterval(()=>{ purger().catch(()=>{}); }, 6*3600000).unref(); }
  /* rubrique de la fiche 360° : postes ouverts sur la fonction du salarié (repère pour la mobilité interne) */
  async function fiche360(x){
    if (x.rang("EMP") < 2) return null;
    const f = String(x.emp.poste||"").trim(); if (!f) return null;
    const n = Number((await B.get("SELECT COUNT(*) n FROM rec_postes WHERE statut='ouvert' AND fonction=?", f)).n);
    return {cle:"recrutement", vue:"recrutement", lignes:[{k:"postesOuvertsFonction", v:String(n)}]};
  }
  /* éléments de la liste « À traiter » de l'accueil */
  async function aTraiter(x){
    const r = x.rang("EMP"), out = [];
    if (r >= 3){ const n = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.etape='decision' AND p.statut='ouvert'")).n);
      if (n) out.push({domaine:"talents", cle:"recrutement-decision", nombre:n, urgence:2, vue:"recrutement"}); }
    if (r >= 2){ const n = Number((await B.get("SELECT COUNT(*) n FROM rec_candidatures a JOIN rec_postes p ON p.id=a.poste_id WHERE a.etape='recue' AND p.statut='ouvert'")).n);
      if (n) out.push({domaine:"talents", cle:"recrutement-recues", nombre:n, urgence:1, vue:"recrutement"}); }
    return out;
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries());
    const ecrire = rang >= 2, decider = rang >= 3;
    if (p === "/api/v1/recrutement/parametres" && req.method === "GET") return json(res, 200, {conservationMois:await conservation(), durees:DUREES});
    if (p === "/api/v1/recrutement/parametres" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Réservé au paramétrage.");
      const n = Number((await corpsJson(req)).conservationMois); if (DUREES.indexOf(n) < 0) return erreur(res, 400, "Durée non prévue.");
      await B.run("INSERT INTO rec_parametres(k,v) VALUES('conservation_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n));
      await audit(C.login, "recrutement.conservation", n+" mois", ip); const e = await purger();
      return json(res, 200, {ok:true, conservationMois:n, effaces:e});
    }
    /* postes */
    if (p === "/api/v1/recrutement/postes" && req.method === "GET"){
      const st = q.statut === "clos" ? "clos" : q.statut === "tous" ? null : "ouvert", {off, lim} = page(q);
      const w = st ? " WHERE statut=?" : "", a = st ? [st] : [];
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_postes"+w, ...a)).n);
      const l = await B.all("SELECT p.*, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id) candidatures, (SELECT COUNT(*) FROM rec_candidatures c WHERE c.poste_id=p.id AND c.etape='retenu') retenus FROM rec_postes p"+w+" ORDER BY ouvert_le DESC LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, lignes:l});
    }
    if (p === "/api/v1/recrutement/postes" && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req), intit = String(b.intitule||"").trim().slice(0, 120);
      if (!intit) return erreur(res, 400, "Intitulé obligatoire.");
      const i = id("rp"); await B.run("INSERT INTO rec_postes(id,intitule,fonction,site_id,dept_id,nb,statut,description,ouvert_le,par) VALUES(?,?,?,?,?,?,?,?,?,?)",
        i, intit, String(b.fonction||"").slice(0, 80), b.siteId||null, b.deptId||null, Math.max(1, Math.min(500, +b.nb||1)), "ouvert", String(b.description||"").slice(0, 4000), maint(), C.login);
      await audit(C.login, "recrutement.poste", "ouvert : "+intit, ip); return json(res, 200, {ok:true, id:i});
    }
    const mp = /^\/api\/v1\/recrutement\/postes\/([^/]+)\/(clore|rouvrir)$/.exec(p);
    if (mp && req.method === "POST"){
      if (!decider) return erreur(res, 403, "Droit de validation requis.");
      await B.run("UPDATE rec_postes SET statut=?, clos_le=? WHERE id=?", mp[2] === "clore" ? "clos" : "ouvert", mp[2] === "clore" ? maint() : null, mp[1]);
      await audit(C.login, "recrutement.poste", mp[2]+" "+mp[1], ip); return json(res, 200, {ok:true});
    }
    /* candidats */
    if (p === "/api/v1/recrutement/candidats" && req.method === "GET"){
      const {off, lim} = page(q), s = String(q.q||"").trim().toLowerCase();
      const w = s ? " WHERE lower(nom || ' ' || COALESCE(prenom,'') || ' ' || COALESCE(email,'')) LIKE ?" : "", a = s ? ["%"+s+"%"] : [];
      const total = Number((await B.get("SELECT COUNT(*) n FROM rec_candidats"+w, ...a)).n);
      const l = await B.all("SELECT c.*, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv FROM rec_candidats c"+w+" ORDER BY cree DESC LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, lignes:l});
    }
    if (p === "/api/v1/recrutement/candidats" && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req, 8e6), nom = String(b.nom||"").trim().slice(0, 80);
      if (!nom) return erreur(res, 400, "Nom obligatoire.");
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
      if (b.posteId && !await B.get("SELECT 1 FROM rec_postes WHERE id=? AND statut='ouvert'", String(b.posteId))) return erreur(res, 400, "Poste ouvert obligatoire.");
      const i = id("rc"), cvChiffre = cvBuf ? chiffrer(cvBuf) : null;
      await B.transaction(async ()=>{
        await B.run("INSERT INTO rec_candidats(id,nom,prenom,email,tel,source,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, nom, String(b.prenom||"").slice(0, 80), String(b.email||"").slice(0, 120), String(b.tel||"").slice(0, 30), String(b.source||"").slice(0, 60), maint(), C.login);
        if (cvBuf) await B.run("INSERT INTO rec_cv(candidat_id,nom_fichier,type,taille,donnees,cree) VALUES(?,?,?,?,?,?)", i, String(b.cv.nom||"cv").slice(0, 120), b.cv.type, cvBuf.length, cvChiffre, maint());
        if (b.posteId){ const c = id("ra"); await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, String(b.posteId), i, "recue", maint(), maint());
          await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint()); }
      });
      await audit(C.login, "recrutement.candidat", "ajout "+nom, ip); return json(res, 200, {ok:true, id:i});
    }
    const mcv = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/cv$/.exec(p);
    if (mcv && req.method === "GET"){
      const r = await B.get("SELECT * FROM rec_cv WHERE candidat_id=?", mcv[1]); if (!r) return erreur(res, 404, "Aucun CV.");
      await audit(C.login, "recrutement.cv.consulte", mcv[1], ip);
      res.writeHead(200, {"Content-Type":r.type, "Content-Disposition":"attachment; filename=\""+String(r.nom_fichier).replace(/[^\w.\- ]/g, "_")+"\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"});
      return res.end(dechiffrer(r.donnees));
    }
    /* candidatures : tableau par étape, paginé */
    if (p === "/api/v1/recrutement/candidatures" && req.method === "GET"){
      const {off, lim} = page(q); if (!q.poste) return erreur(res, 400, "Poste obligatoire.");
      const comptes = {}; (await B.all("SELECT etape, COUNT(*) n FROM rec_candidatures WHERE poste_id=? GROUP BY etape", q.poste)).forEach(r=>{ comptes[r.etape] = Number(r.n); });
      const et = ETAPES.indexOf(q.etape) >= 0 ? q.etape : null;
      const l = await B.all("SELECT a.id, a.etape, a.note, a.maj, c.id candidat_id, c.nom, c.prenom, c.email, c.tel, (SELECT mat FROM rec_embauches h WHERE h.candidature_id=a.id) salarie, (SELECT COUNT(*) FROM rec_cv v WHERE v.candidat_id=c.id) cv FROM rec_candidatures a JOIN rec_candidats c ON c.id=a.candidat_id WHERE a.poste_id=?"+(et ? " AND a.etape=?" : "")+" ORDER BY a.maj DESC LIMIT "+lim+" OFFSET "+off, ...(et ? [q.poste, et] : [q.poste]));
      return json(res, 200, {etapes:ETAPES, suivantes:SUIVANTES, comptes, lignes:l});
    }
    const ma = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/(etape|entretien|historique)$/.exec(p);
    if (ma && ma[2] === "historique" && req.method === "GET")
      return json(res, 200, {historique:await B.all("SELECT * FROM rec_historique WHERE candidature_id=? ORDER BY ts", ma[1]), entretiens:await B.all("SELECT * FROM rec_entretiens WHERE candidature_id=? ORDER BY d", ma[1])});
    if (ma && ma[2] === "etape" && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req), a = await B.get("SELECT * FROM rec_candidatures WHERE id=?", ma[1]); if (!a) return erreur(res, 404, "Candidature introuvable.");
      const vers = String(b.vers||"");
      if ((SUIVANTES[a.etape]||[]).indexOf(vers) < 0) return erreur(res, 409, "Passage de « "+a.etape+" » à « "+vers+" » non permis.");
      if ((vers === "retenu" || vers === "refuse") && !decider) return erreur(res, 403, "La décision est réservée au droit de validation.");
      if ((vers === "refuse" || vers === "retenu") && !String(b.motif||"").trim()) return erreur(res, 400, "Motif obligatoire pour une décision.");
      await B.transaction(async ()=>{
        await B.run("UPDATE rec_candidatures SET etape=?, maj=?, note=COALESCE(?, note) WHERE id=?", vers, maint(), b.note == null ? null : Math.max(0, Math.min(5, +b.note)), a.id);
        await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, a.etape, vers, C.login, String(b.motif||"").slice(0, 500), maint());
      });
      await audit(C.login, "recrutement.etape", a.id+" : "+a.etape+" → "+vers, ip); return json(res, 200, {ok:true, de:a.etape, vers});
    }
    if (ma && ma[2] === "entretien" && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req); if (!/^\d{4}-\d{2}-\d{2}/.test(String(b.d||""))) return erreur(res, 400, "Date obligatoire.");
      await B.run("INSERT INTO rec_entretiens(id,candidature_id,d,intervenant,avis,note,par,cree) VALUES(?,?,?,?,?,?,?,?)", id("re"), ma[1], String(b.d).slice(0, 16), String(b.intervenant||"").slice(0, 80), String(b.avis||"").slice(0, 2000), b.note == null ? null : Math.max(0, Math.min(5, +b.note)), C.login, maint());
      await audit(C.login, "recrutement.entretien", ma[1], ip); return json(res, 200, {ok:true});
    }
    /* v56.18 : embauche — la candidature retenue est rattachée à la fiche salarié créée (une seule fois, sans copie) */
    const mh = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/embauche$/.exec(p);
    if (mh && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const a = await B.get("SELECT * FROM rec_candidatures WHERE id=?", mh[1]); if (!a) return erreur(res, 404, "Candidature introuvable.");
      if (a.etape !== "retenu") return erreur(res, 409, "Seule une candidature retenue donne lieu à une embauche.");
      const mat = String((await corpsJson(req)).mat||"").trim();
      if (!mat || !(await D.employes()).some(e=>String(e.mat) === mat)) return erreur(res, 404, "Fiche salarié introuvable : enregistrez-la d'abord.");
      if (await B.get("SELECT 1 FROM rec_embauches WHERE candidature_id=? OR mat=?", a.id, mat)) return erreur(res, 409, "Cette embauche est déjà enregistrée.");
      await B.run("INSERT INTO rec_embauches(candidature_id,mat,le,par) VALUES(?,?,?,?)", a.id, mat, maint(), C.login);
      await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), a.id, "retenu", "retenu", C.login, "fiche salarié créée : "+mat, maint());
      await audit(C.login, "recrutement.embauche", a.id+" → salarié "+mat, ip); return json(res, 200, {ok:true, mat});
    }
    if (p === "/api/v1/recrutement/candidatures" && req.method === "POST"){
      if (!ecrire) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req);
      if (!await B.get("SELECT 1 FROM rec_postes WHERE id=? AND statut='ouvert'", String(b.posteId||""))) return erreur(res, 400, "Poste ouvert obligatoire.");
      if (!await B.get("SELECT 1 FROM rec_candidats WHERE id=?", String(b.candidatId||""))) return erreur(res, 400, "Candidat introuvable.");
      if (await B.get("SELECT 1 FROM rec_candidatures WHERE poste_id=? AND candidat_id=?", b.posteId, b.candidatId)) return erreur(res, 409, "Ce candidat a déjà postulé à ce poste.");
      const c = id("ra"); await B.run("INSERT INTO rec_candidatures(id,poste_id,candidat_id,etape,maj,cree) VALUES(?,?,?,?,?,?)", c, b.posteId, b.candidatId, "recue", maint(), maint());
      await B.run("INSERT INTO rec_historique(id,candidature_id,de,vers,par,motif,ts) VALUES(?,?,?,?,?,?,?)", id("rh"), c, null, "recue", C.login, "candidature enregistrée", maint());
      return json(res, 200, {ok:true, id:c});
    }
    return erreur(res, 404, "Introuvable.");
  }
  return {traiter, aTraiter, purger, fiche360};
}
module.exports = {ddl, tables, creer, ETAPES, SUIVANTES};
