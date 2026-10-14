/* FW-Competences — partie serveur (module pilote, cahier des charges v56.2 DevRH).
   Données propres au module (aucune copie de la fiche salarié : référence par matricule), listes paginées et filtrées
   côté serveur, écarts calculés côté serveur avec cache invalidé à chaque écriture, périmètre et droits contrôlés
   par le serveur, historique des niveaux en ajout seul, audit. */
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
const tables = {comp_catalogue:"id", comp_exigences:"fonction, competence_id", comp_niveaux:"mat, competence_id", comp_historique:"id"};
const NIVEAUX = [0, 1, 2, 3, 4];

function creer(o){
  const {B, D, audit} = o;
  let GEN = 0; const CACHE = new Map();
  /* index des niveaux en mémoire : chargé une fois, tenu à jour à chaque saisie (évite de relire 600 000 lignes
     à chaque calcul d'écarts à 20 000 salariés × 30 compétences) */
  let NIV = null, NIV_P = null;
  async function niveauxIndex(){
    if (NIV) return NIV;
    if (!NIV_P) NIV_P = B.all("SELECT mat, competence_id, niveau FROM comp_niveaux").then(l=>{ const m = new Map(); l.forEach(r=>m.set(r.mat+"|"+r.competence_id, r.niveau)); NIV = m; NIV_P = null; return m; });
    return NIV_P;
  }
  /* v56.17 : niveau modifié par un autre module (évaluation validée, formation clôturée) : index et écarts à jour */
  function surEvenement(nom, d){
    if (nom !== "competences.niveau" || !d) return;
    if (NIV) NIV.set(String(d.mat)+"|"+d.competence_id, d.niveau);
    GEN++; CACHE.clear();
  }
  const maintenant = () => new Date().toISOString();
  const fonctionDe = e => String(e.poste || e.fonction || "").trim();
  async function catalogue(){ return B.all("SELECT * FROM comp_catalogue WHERE actif=1 ORDER BY domaine, code"); }
  async function exigences(){ return B.all("SELECT * FROM comp_exigences"); }
  /* salariés du périmètre, filtrés côté serveur */
  async function salaries(C, q){
    const ref = await D.referentiel() || {}, {P, emps} = await D.perimetreDe(ref, C.login);
    let l = emps.filter(e=>(P.set === null || P.set.has(String(e.mat))) && !(e.sortie && e.sortie < maintenant().slice(0, 10)));
    if (q.site) l = l.filter(e=>e.siteId === q.site);
    if (q.dept) l = l.filter(e=>e.deptId === q.dept);
    if (q.fonction) l = l.filter(e=>fonctionDe(e) === q.fonction);
    if (q.q && String(q.q).trim().length >= 2){ const s = String(q.q).toLowerCase(); l = l.filter(e=>(e.nom+" "+e.prenom+" "+e.mat).toLowerCase().indexOf(s) >= 0); }
    return {P, l, ref};
  }
  async function matrice(C, q){
    const off = Math.max(0, +q.offset||0), lim = Math.min(200, Math.max(1, +q.limit||100));
    const {l} = await salaries(C, q), cat = await catalogue(), ex = await exigences();
    l.sort((a, b)=>String(a.nom).localeCompare(String(b.nom), "fr") || String(a.mat).localeCompare(String(b.mat)));
    const page = l.slice(off, off + lim), mats = page.map(e=>String(e.mat));
    const niv = {};
    for (let i = 0; i < mats.length; i += 500){ const lot = mats.slice(i, i+500);
      (await B.all("SELECT mat, competence_id, niveau FROM comp_niveaux WHERE mat IN ("+lot.map(()=>"?").join(",")+")", ...lot)).forEach(r=>{ (niv[r.mat] = niv[r.mat] || {})[r.competence_id] = r.niveau; }); }
    const req = {}; ex.forEach(x=>{ (req[x.fonction] = req[x.fonction] || {})[x.competence_id] = x.niveau; });
    return {total:l.length, offset:off, competences:cat.map(c=>({id:c.id, code:c.code, nom:c.nom, domaine:c.domaine})),
      lignes:page.map(e=>{ const f = fonctionDe(e), n = niv[String(e.mat)] || {}, r = req[f] || {};
        const ecarts = Object.keys(r).filter(cid=>(n[cid]||0) < r[cid]).length;
        return {mat:String(e.mat), nom:(e.nom||"")+" "+(e.prenom||""), fonction:f, niveaux:n, requis:r, ecarts}; })};
  }
  /* écarts par compétence sur tout le périmètre : calcul serveur, mis en cache jusqu'à la prochaine écriture */
  async function ecarts(C, q){
    const cle = C.login+"|"+(q.site||"")+"|"+(q.dept||"")+"|"+GEN, c = CACHE.get(cle);
    if (c && Date.now() - c.t < 3600000) return c.r;
    const {l} = await salaries(C, q), cat = await catalogue(), ex = await exigences();
    const req = {}; ex.forEach(x=>{ (req[x.fonction] = req[x.fonction] || {})[x.competence_id] = x.niveau; });
    const niv = await niveauxIndex();
    const agg = {}; cat.forEach(k=>{ agg[k.id] = {id:k.id, code:k.code, nom:k.nom, concernes:0, conformes:0, ecarts:0}; });
    for (const e of l){ const r = req[fonctionDe(e)]; if (!r) continue;
      for (const cid of Object.keys(r)){ const a = agg[cid]; if (!a) continue; a.concernes++; ((niv.get(String(e.mat)+"|"+cid) || 0) >= r[cid]) ? a.conformes++ : a.ecarts++; } }
    const res = {salaries:l.length, competences:Object.values(agg).map(a=>Object.assign(a, {taux:a.concernes ? Math.round(100*a.conformes/a.concernes) : null})).sort((x, y)=>y.ecarts - x.ecarts)};
    CACHE.set(cle, {t:Date.now(), r:res}); if (CACHE.size > 200) CACHE.clear();
    return res;
  }
  /* routeur du module (appelé par le socle pour /api/v1/competences…, uniquement si le module est actif) */
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries());
    if (p === "/api/v1/competences/catalogue" && req.method === "GET"){
      const {l} = await salaries(C, {});
      return json(res, 200, {competences:await catalogue(), exigences:await exigences(), fonctions:Array.from(new Set(l.map(fonctionDe).filter(Boolean))).sort(), niveaux:NIVEAUX});
    }
    if (p === "/api/v1/competences/catalogue" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Paramétrage des compétences réservé au droit « paramétrage » sur les salariés.");
      const b = await corpsJson(req), code = String(b.code||"").trim().slice(0, 20), nom = String(b.nom||"").trim().slice(0, 120);
      if (!code || !nom) return erreur(res, 400, "Code et nom obligatoires.");
      if (await B.get("SELECT 1 FROM comp_catalogue WHERE code=? AND actif=1", code)) return erreur(res, 409, "Ce code existe déjà.");
      const id = "cp-"+crypto.randomBytes(5).toString("hex");
      await B.run("INSERT INTO comp_catalogue(id,code,nom,domaine,actif,cree) VALUES(?,?,?,?,1,?)", id, code, nom, String(b.domaine||"").slice(0, 60), maintenant());
      GEN++; await audit(C.login, "competences.catalogue", "ajout "+code+" — "+nom, ip);
      return json(res, 200, {ok:true, id});
    }
    if (p === "/api/v1/competences/exigence" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Paramétrage des compétences réservé au droit « paramétrage » sur les salariés.");
      const b = await corpsJson(req), f = String(b.fonction||"").trim(), cid = String(b.competenceId||""), n = Number(b.niveau);
      if (!f || !await B.get("SELECT 1 FROM comp_catalogue WHERE id=?", cid) || NIVEAUX.indexOf(n) < 0) return erreur(res, 400, "Fonction, compétence et niveau (0 à 4) obligatoires.");
      if (n === 0) await B.run("DELETE FROM comp_exigences WHERE fonction=? AND competence_id=?", f, cid);
      else await B.run("INSERT INTO comp_exigences(fonction,competence_id,niveau) VALUES(?,?,?) ON CONFLICT(fonction, competence_id) DO UPDATE SET niveau=excluded.niveau", f, cid, n);
      GEN++; await audit(C.login, "competences.exigence", f+" — "+cid+" : niveau requis "+n, ip);
      return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/competences/matrice" && req.method === "GET") return json(res, 200, await matrice(C, q));
    if (p === "/api/v1/competences/ecarts" && req.method === "GET") return json(res, 200, await ecarts(C, q));
    if (p === "/api/v1/competences/niveau" && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie sur les salariés requis.");
      const b = await corpsJson(req), mat = String(b.mat||""), cid = String(b.competenceId||""), n = Number(b.niveau);
      if (!(P.set === null || (P.set && P.set.has(mat))) && !admin) return erreur(res, 404, "Salarié hors périmètre.");
      if (!await B.get("SELECT 1 FROM comp_catalogue WHERE id=?", cid) || NIVEAUX.indexOf(n) < 0) return erreur(res, 400, "Compétence et niveau (0 à 4) obligatoires.");
      const av = await B.get("SELECT niveau FROM comp_niveaux WHERE mat=? AND competence_id=?", mat, cid);
      await B.transaction(async ()=>{
        await B.run("INSERT INTO comp_niveaux(mat,competence_id,niveau,d,evaluateur) VALUES(?,?,?,?,?) ON CONFLICT(mat, competence_id) DO UPDATE SET niveau=excluded.niveau, d=excluded.d, evaluateur=excluded.evaluateur", mat, cid, n, maintenant().slice(0, 10), C.login);
        await B.run("INSERT INTO comp_historique(id,mat,competence_id,avant,apres,par,motif,ts) VALUES(?,?,?,?,?,?,?,?)", "ch-"+crypto.randomBytes(8).toString("hex"), mat, cid, av ? av.niveau : null, n, C.login, String(b.motif||"").slice(0, 200), maintenant());
      });
      if (NIV) NIV.set(mat+"|"+cid, n);
      GEN++; await audit(C.login, "competences.niveau", mat+" — "+cid+" : "+(av ? av.niveau : "—")+" → "+n, ip);
      return json(res, 200, {ok:true, avant:av ? av.niveau : null, apres:n});
    }
    if (p === "/api/v1/competences/historique" && req.method === "GET"){
      const mat = String(q.mat||""); if (!(P.set === null || (P.set && P.set.has(mat))) && !admin) return erreur(res, 404, "Salarié hors périmètre.");
      return json(res, 200, {historique:await B.all("SELECT * FROM comp_historique WHERE mat=? ORDER BY ts DESC LIMIT 200", mat)});
    }
    return erreur(res, 404, "Introuvable.");
  }
  /* rubrique de la fiche salarié 360° : niveaux requis par sa fonction et niveaux atteints */
  async function fiche360(x){
    if (x.rang("EMP") < 1) return null;
    const f = fonctionDe(x.emp), ex = await B.all("SELECT e.competence_id, e.niveau requis, c.code, c.nom FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE e.fonction=? AND c.actif=1 ORDER BY c.code", f);
    const niv = {}; (await B.all("SELECT competence_id, niveau FROM comp_niveaux WHERE mat=?", String(x.mat))).forEach(r=>{ niv[r.competence_id] = r.niveau; });
    return {cle:"competences", vue:"competences", sousTitre:f, lignes:ex.length ? ex.map(r=>({l:r.code+" — "+r.nom, v:(niv[r.competence_id]||0)+" / "+r.requis, alerte:(niv[r.competence_id]||0) < r.requis})) : [{k:"aucuneExigence", v:"—"}]};
  }
  /* élément « À traiter » : salariés de l'utilisateur ayant au moins un écart avec les niveaux requis */
  async function aTraiter(x){
    if (x.rang("EMP") < 2) return [];
    const r = await ecarts(x.C, {}); const n = r.competences.reduce((s, c)=>s + c.ecarts, 0);
    return n ? [{domaine:"talents", cle:"competences-ecarts", nombre:n, urgence:0, vue:"competences"}] : [];
  }
  /* préchargement de l'index au démarrage, en arrière-plan (le premier écran d'écarts n'attend pas) */
  setTimeout(()=>{ niveauxIndex().catch(()=>{}); }, 8000).unref();
  /* v56.30 (§ 2) : service déclaré pour les autres modules — FW-Formation n'accède plus aux tables de FW-Competences */
  const service = {
    catalogue:()=>B.all("SELECT id, code, nom FROM comp_catalogue WHERE actif=1 ORDER BY code"),
    exigences:()=>B.all("SELECT fonction, competence_id, niveau FROM comp_exigences"),
    niveaux:()=>B.all("SELECT mat, competence_id, niveau FROM comp_niveaux"),
    exigencesFonction:(mat, fonction)=>B.all("SELECT e.competence_id, e.niveau requis, c.code, c.nom, (SELECT niveau FROM comp_niveaux n WHERE n.mat=? AND n.competence_id=e.competence_id) actuel FROM comp_exigences e JOIN comp_catalogue c ON c.id=e.competence_id WHERE e.fonction=? AND c.actif=1 ORDER BY c.code", mat, fonction),
    /* niveau écrit (hausse seulement si « hausse »), historisé et annoncé aux modules qui écoutent ; true si modifié */
    async ecrireNiveau(mat, competenceId, niveau, par, motif, d, hausse){
      const av = await B.get("SELECT niveau FROM comp_niveaux WHERE mat=? AND competence_id=?", mat, competenceId);
      if (av && (hausse ? av.niveau >= niveau : av.niveau === niveau)) return false;
      await B.run("INSERT INTO comp_niveaux(mat,competence_id,niveau,d,evaluateur) VALUES(?,?,?,?,?) ON CONFLICT(mat, competence_id) DO UPDATE SET niveau=excluded.niveau, d=excluded.d, evaluateur=excluded.evaluateur", mat, competenceId, niveau, d || new Date().toISOString().slice(0, 10), par);
      await B.run("INSERT INTO comp_historique(id,mat,competence_id,avant,apres,par,motif,ts) VALUES(?,?,?,?,?,?,?,?)", "ch-"+require("crypto").randomBytes(8).toString("hex"), mat, competenceId, av ? av.niveau : null, niveau, par, motif || "", new Date().toISOString());
      if (o.publier) o.publier("competences.niveau", {mat, competence_id:competenceId, niveau});
      return true; },
    porterNiveau(mat, competenceId, niveau, par, motif, d){ return service.ecrireNiveau(mat, competenceId, niveau, par, motif, d, true); }
  };
  return {traiter, aTraiter, fiche360, surEvenement, service};
}
module.exports = {ddl, tables, creer};
