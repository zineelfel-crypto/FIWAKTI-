/* FW-Formation — partie serveur. Catalogue (formations et habilitations), besoins (écarts de compétences, évaluations,
   échéances d'habilitation, saisie), sessions, inscriptions, présence et résultat, clôture : les niveaux acquis sont
   reportés dans la matrice des compétences (avec historique) et les habilitations obtenues prennent leur date
   d'échéance. Les habilitations vivent ici (pas de module séparé). Périmètre et droits appliqués par le serveur. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
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
  "CREATE INDEX IF NOT EXISTS frm_habilitations_exp ON frm_habilitations(expire_le)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS frm_inscriptions_sess ON frm_inscriptions(session_id, mat)");
ddl.sqlite = ddl.pg;
const tables = {frm_catalogue:"id", frm_besoins:"id", frm_sessions:"id", frm_inscriptions:"id", frm_habilitations:"id"};
function ajoutMois(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D, audit} = o, actif = o.moduleActif || (()=>false);
  /* correctif 34 : jour local ; dates réelles ; salarié actif (ni supprimé ni sorti) */
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && ajoutJours(s, 0) === s && +String(s).slice(0, 4) >= 1990 && +String(s).slice(0, 4) <= 2100;
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "—";
  const actifEmp = async mat => { const e = (await D.employes()).find(x=>String(x.mat) === String(mat)); return !e ? null : (e.sortie && e.sortie < auj()) ? false : e; };
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  async function nomsDe(mats){ const e = new Map((await D.employes()).map(x=>[String(x.mat), x])); return m => { const x = e.get(String(m)) || {}; return ((x.nom||"")+" "+(x.prenom||"")).trim(); }; }
  /* besoins issus des écarts de compétences (formation liée à la compétence) et des habilitations arrivant à échéance */
  async function generer(P, login){
    let n = 0; const cat = await B.all("SELECT * FROM frm_catalogue WHERE actif=1");
    const ouverts = new Set((await B.all("SELECT mat, catalogue_id FROM frm_besoins WHERE statut IN ('ouvert','planifie')")).map(r=>r.mat+"|"+r.catalogue_id));
    const ajouter = async (mat, c, origine) => { const k = mat+"|"+c.id; if (ouverts.has(k) || !dans(P, mat)) return; ouverts.add(k);
      await B.run("INSERT INTO frm_besoins(id,mat,catalogue_id,origine,statut,cree,par) VALUES(?,?,?,?,?,?,?)", id("fb"), mat, c.id, origine, "ouvert", maint(), login); n++; };
    if (actif("FW-Competences")){
      const parComp = new Map(cat.filter(c=>c.competence_id).map(c=>[c.competence_id, c]));
      if (parComp.size){
        const emps = (await D.employes()).filter(e=>!e.sortie || e.sortie >= auj());
        const SCg = o.service ? o.service("FW-Competences") : null, SV = SCg && SCg.service;
        const exig = SV ? await SV.exigences() : [];
        const niv = new Map(); (SV ? await SV.niveaux() : []).forEach(r=>niv.set(r.mat+"|"+r.competence_id, r.niveau));
        for (const e of emps){ const f = String(e.poste || e.fonction || "").trim(); if (!f) continue;
          for (const x of exig) if (x.fonction === f && parComp.has(x.competence_id) && (niv.get(String(e.mat)+"|"+x.competence_id) || 0) < x.niveau) await ajouter(String(e.mat), parComp.get(x.competence_id), "ecart"); }
      }
    }
    const lim = ajoutJours(auj(), 90);
    const presents = new Map((await D.employes()).filter(e=>!e.sortie || e.sortie >= auj()).map(e=>[String(e.mat), 1]));
    for (const h of await B.all("SELECT * FROM frm_habilitations WHERE expire_le IS NOT NULL AND expire_le <= ?", lim)){ const c = cat.find(z=>z.id === h.catalogue_id); if (c && presents.has(String(h.mat))) await ajouter(h.mat, c, "echeance"); }
    if (n) await audit(login, "formation.besoins.generes", n+" besoin(s)");
    return n;
  }
  async function aTraiter(x){
    const r = x.rang("EMP"), out = [], a = auj();
    const pmB = perimSql(B, x.P, "mat");
    if (r >= 3){ const b = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins WHERE statut='ouvert'"+pmB.sql, ...pmB.a)).n);
      if (b) out.push({domaine:"talents", cle:"formation-besoins", nombre:b, urgence:1, vue:"formation"});
      const s = Number((await B.get("SELECT COUNT(*) n FROM frm_sessions WHERE statut='planifiee' AND fin < ?", a)).n);
      if (s) out.push({domaine:"talents", cle:"formation-a-cloturer", nombre:s, urgence:1, vue:"formation"}); }
    if (r >= 2){ const h = Number((await B.get("SELECT COUNT(*) n FROM frm_habilitations WHERE expire_le IS NOT NULL AND expire_le <= ?"+pmB.sql, ajoutJours(a, 30), ...pmB.a)).n);
      if (h) out.push({domaine:"talents", cle:"habilitations-echeance", nombre:h, urgence:2, vue:"formation"}); }
    return out;
  }
  async function fiche360(x){
    if (x.rang("EMP") < 1) return null;
    const m = String(x.mat), a = auj();
    const real = Number((await B.get("SELECT COUNT(*) n FROM frm_inscriptions i JOIN frm_sessions s ON s.id=i.session_id WHERE i.mat=? AND s.statut='realisee' AND i.presence='present'", m)).n);
    const bes = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins WHERE mat=? AND statut IN ('ouvert','planifie')", m)).n);
    const hab = await B.all("SELECT h.expire_le, c.titre FROM frm_habilitations h JOIN frm_catalogue c ON c.id=h.catalogue_id WHERE h.mat=? ORDER BY h.expire_le", m);
    const valides = hab.filter(h=>!h.expire_le || h.expire_le >= a), proch = valides.find(h=>h.expire_le);
    if (!real && !bes && !hab.length) return null;
    return {cle:"formation", vue:"formation", lignes:[{k:"frmRealisees", v:String(real)}, {k:"frmBesoins", v:String(bes), alerte:bes > 0},
      {k:"frmHabilitations", v:valides.length+" / "+hab.length, alerte:valides.length < hab.length}, {k:"frmProchaine", v:proch ? proch.titre+" — "+jj(proch.expire_le) : "—", alerte:!!(proch && proch.expire_le <= ajoutJours(a, 30))}]};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
    if (p === "/api/v1/formation/catalogue" && req.method === "GET"){
      let comps = []; const SCc = actif("FW-Competences") && o.service ? o.service("FW-Competences") : null; if (SCc && SCc.service) try { comps = await SCc.service.catalogue(); } catch(e){}
      return json(res, 200, {catalogue:await B.all("SELECT * FROM frm_catalogue WHERE actif=1 ORDER BY type, code"), competences:comps});
    }
    if (p === "/api/v1/formation/catalogue" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Catalogue réservé au paramétrage.");
      const b = await corpsJson(req), code = String(b.code||"").trim().slice(0, 20), titre = String(b.titre||"").trim().slice(0, 120), type = b.type === "habilitation" ? "habilitation" : "formation";
      if (!code || !titre) return erreur(res, 400, "Code et intitulé obligatoires.");
      /* correctif 34 : code unique ; compétence liée existante */
      if (await B.get("SELECT 1 FROM frm_catalogue WHERE lower(code)=lower(?) AND actif=1", code)) return erreur(res, 409, "Code « "+code+" » déjà utilisé.");
      if (b.competenceId){ const SCx = actif("FW-Competences") && o.service ? o.service("FW-Competences") : null; let lc = []; if (SCx && SCx.service) try { lc = await SCx.service.catalogue(); } catch(e){}
        if (!lc.some(c=>c && String(c.id) === String(b.competenceId))) return erreur(res, 400, "Compétence liée inconnue."); }
      if (type === "habilitation" && !(+b.validiteMois > 0)) return erreur(res, 400, "Durée de validité obligatoire pour une habilitation.");
      const i = id("fc"); await B.run("INSERT INTO frm_catalogue(id,code,titre,type,duree_h,validite_mois,competence_id,niveau_vise,organisme,actif,cree) VALUES(?,?,?,?,?,?,?,?,?,1,?)",
        i, code, titre, type, Math.max(0, +b.dureeH||0), type === "habilitation" ? Math.min(240, +b.validiteMois) : null, b.competenceId || null, b.competenceId ? Math.max(1, Math.min(4, +b.niveauVise||1)) : null, String(b.organisme||"").slice(0, 80), maint());
      await audit(C.login, "formation.catalogue", code+" "+titre, ip); return json(res, 200, {ok:true, id:i});
    }
    /* correctif 34 : une formation du catalogue se retire (aucune correction possible auparavant) */
    const mcr = /^\/api\/v1\/formation\/catalogue\/([^/]+)\/retirer$/.exec(p);
    if (mcr && req.method === "POST"){ if (rang < 4) return erreur(res, 403, "Catalogue réservé au paramétrage.");
      const c = await B.get("SELECT id, code, titre FROM frm_catalogue WHERE id=? AND actif=1", mcr[1]); if (!c) return erreur(res, 404, "Formation introuvable.");
      if (await B.get("SELECT 1 FROM frm_sessions WHERE catalogue_id=? AND statut='planifiee'", c.id)) return erreur(res, 409, "Une session est planifiée pour cette formation : annulez-la d'abord.");
      await B.run("UPDATE frm_catalogue SET actif=0 WHERE id=?", c.id); await B.run("UPDATE frm_besoins SET statut='annule' WHERE catalogue_id=? AND statut='ouvert'", c.id);
      await audit(C.login, "formation.catalogue", "retrait "+c.code+" "+c.titre, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/formation/besoins" && req.method === "GET"){
      const st = ["ouvert","planifie","realise","annule"].indexOf(q.statut) >= 0 ? q.statut : "ouvert", nm = await nomsDe(), pm = perimSql(B, P, "b.mat");
      const w = " WHERE b.statut=?"+(q.catalogue ? " AND b.catalogue_id=?" : "")+pm.sql, aa = (q.catalogue ? [st, q.catalogue] : [st]).concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_besoins b"+w, ...aa)).n);
      const l = await B.all("SELECT b.id, b.mat, b.catalogue_id, b.origine, b.statut, b.cree, c.titre, c.code, c.type FROM frm_besoins b JOIN frm_catalogue c ON c.id=b.catalogue_id"+w+" ORDER BY c.code, b.mat LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, lignes:l.map(r=>Object.assign(r, {nom:nm(r.mat)}))});
    }
    if (p === "/api/v1/formation/besoins/generer" && req.method === "POST"){ if (rang < 3) return erreur(res, 403, "Droit de validation requis."); return json(res, 200, {ok:true, crees:await generer(P, C.login)}); }
    if (p === "/api/v1/formation/besoins" && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req), mat = String(b.mat||"").trim(), cid = String(b.catalogueId||"");
      const em = mat && dans(P, mat) ? await actifEmp(mat) : null;
      if (!em){ if (em === false) return erreur(res, 409, "Salarié sorti : aucun besoin de formation."); return erreur(res, 404, "Salarié introuvable ou hors périmètre."); }
      const c = await B.get("SELECT code FROM frm_catalogue WHERE id=? AND actif=1", cid); if (!c) return erreur(res, 400, "Formation inconnue.");
      if (await B.get("SELECT 1 FROM frm_besoins WHERE mat=? AND catalogue_id=? AND statut IN ('ouvert','planifie')", mat, cid)) return erreur(res, 409, "Ce besoin existe déjà.");
      const i = id("fb"); await B.run("INSERT INTO frm_besoins(id,mat,catalogue_id,origine,statut,cree,par) VALUES(?,?,?,?,?,?,?)", i, mat, cid, b.origine === "evaluation" ? "evaluation" : "manuel", "ouvert", maint(), C.login);
      await audit(C.login, "formation.besoin", mat+" — "+c.code, ip);
      return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/formation/sessions" && req.method === "GET"){
      /* correctif 34 : sessions paginées (200 au plus auparavant, sans suite) */
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_sessions")).n);
      const l = await B.all("SELECT s.*, c.titre, c.code, c.type, (SELECT COUNT(*) FROM frm_inscriptions i WHERE i.session_id=s.id) inscrits FROM frm_sessions s JOIN frm_catalogue c ON c.id=s.catalogue_id ORDER BY s.debut DESC LIMIT "+(q.limit ? lim : 200)+" OFFSET "+off);
      return json(res, 200, {sessions:l, total});
    }
    if (p === "/api/v1/formation/sessions" && req.method === "POST"){
      if (rang < 3) return erreur(res, 403, "Planification réservée au droit de validation.");
      const b = await corpsJson(req);
      const cid = String(b.catalogueId||"");
      if (!await B.get("SELECT 1 FROM frm_catalogue WHERE id=? AND actif=1", cid)) return erreur(res, 400, "Formation inconnue.");
      if (!dateOk(b.debut) || !dateOk(b.fin) || b.fin < b.debut) return erreur(res, 400, "Dates de début et de fin obligatoires et réelles (début ≤ fin).");
      const i = id("fs"); await B.run("INSERT INTO frm_sessions(id,catalogue_id,debut,fin,lieu,formateur,places,statut,cree,par) VALUES(?,?,?,?,?,?,?,?,?,?)",
        i, cid, b.debut, b.fin, String(b.lieu||"").slice(0, 80), String(b.formateur||"").slice(0, 80), Math.max(1, Math.min(500, +b.places||12)), "planifiee", maint(), C.login);
      /* inscription directe des besoins ouverts de cette formation (dans la limite des places) */
      let ins = 0;
      if (b.besoins){ const pres = new Set((await D.employes()).filter(e=>!e.sortie || e.sortie >= auj()).map(e=>String(e.mat)));
        const l = (await B.all("SELECT * FROM frm_besoins WHERE catalogue_id=? AND statut='ouvert' ORDER BY cree", cid)).filter(r=>dans(P, r.mat) && pres.has(String(r.mat))).slice(0, Math.max(1, Math.min(500, +b.places||12)));
        for (const r of l){ await B.run("INSERT INTO frm_inscriptions(id,session_id,mat,besoin_id,presence,maj,par) VALUES(?,?,?,?,?,?,?)", id("fi"), i, r.mat, r.id, "inscrit", maint(), C.login); await B.run("UPDATE frm_besoins SET statut='planifie' WHERE id=?", r.id); ins++; } }
      await audit(C.login, "formation.session", i+" du "+jj(b.debut)+" au "+jj(b.fin)+" — "+ins+" inscrit(s)", ip); return json(res, 200, {ok:true, id:i, inscrits:ins});
    }
    const ms = /^\/api\/v1\/formation\/sessions\/([^/]+)(?:\/(inscrire|presence|presence-lot|cloturer|annuler))?$/.exec(p);
    if (ms){
      const s = await B.get("SELECT s.*, c.titre, c.type, c.competence_id, c.niveau_vise, c.validite_mois FROM frm_sessions s JOIN frm_catalogue c ON c.id=s.catalogue_id WHERE s.id=?", ms[1]);
      if (!s) return erreur(res, 404, "Session introuvable.");
      if (!ms[2] && req.method === "GET"){ const nm = await nomsDe();
        return json(res, 200, {session:s, inscriptions:(await B.all("SELECT * FROM frm_inscriptions WHERE session_id=? ORDER BY mat", s.id)).filter(r=>dans(P, r.mat)).map(r=>Object.assign(r, {nom:nm(r.mat)}))}); }
      if (s.statut !== "planifiee") return erreur(res, 409, s.statut === "annulee" ? "Session annulée." : "Session clôturée.");
      /* correctif 34 : annulation d'une session planifiée — besoins rouverts, inscriptions conservées pour l'historique */
      if (ms[2] === "annuler" && req.method === "POST"){
        if (rang < 3) return erreur(res, 403, "Droit de validation requis.");
        const l = await B.all("SELECT * FROM frm_inscriptions WHERE session_id=?", s.id);
        if (P.set !== null && l.some(r=>!dans(P, r.mat))) return erreur(res, 403, "Des inscrits sont hors de votre périmètre : annulation réservée à un valideur couvrant tous les inscrits.");
        await B.transaction(async ()=>{ await B.run("UPDATE frm_sessions SET statut='annulee' WHERE id=? AND statut='planifiee'", s.id);
          for (const r of l) if (r.besoin_id) await B.run("UPDATE frm_besoins SET statut='ouvert' WHERE id=? AND statut='planifie'", r.besoin_id); });
        await audit(C.login, "formation.session.annulee", s.titre+" ("+s.id+") du "+jj(s.debut)+" — "+l.length+" inscrit(s), besoins rouverts", ip); return json(res, 200, {ok:true}); }
      if (ms[2] === "inscrire" && req.method === "POST"){
        if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
        const b = await corpsJson(req), mat = String(b.mat||"").trim();
        const em = mat && dans(P, mat) ? await actifEmp(mat) : null;
        if (!em){ if (em === false) return erreur(res, 409, "Salarié sorti : inscription impossible."); return erreur(res, 404, "Salarié introuvable ou hors périmètre."); }
        if (Number((await B.get("SELECT COUNT(*) n FROM frm_inscriptions WHERE session_id=?", s.id)).n) >= s.places) return erreur(res, 409, "Session complète.");
        if (await B.get("SELECT 1 FROM frm_inscriptions WHERE session_id=? AND mat=?", s.id, mat)) return erreur(res, 409, "Déjà inscrit.");
        const bes = await B.get("SELECT id FROM frm_besoins WHERE mat=? AND catalogue_id=? AND statut='ouvert'", mat, s.catalogue_id);
        await B.run("INSERT INTO frm_inscriptions(id,session_id,mat,besoin_id,presence,maj,par) VALUES(?,?,?,?,?,?,?)", id("fi"), s.id, mat, bes ? bes.id : null, "inscrit", maint(), C.login);
        if (bes) await B.run("UPDATE frm_besoins SET statut='planifie' WHERE id=?", bes.id);
        await audit(C.login, "formation.inscription", mat+" — "+s.titre+" ("+s.id+")", ip);
        return json(res, 200, {ok:true});
      }
      if (ms[2] === "presence" && req.method === "POST"){
        if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
        const b = await corpsJson(req), i = await B.get("SELECT * FROM frm_inscriptions WHERE id=? AND session_id=?", String(b.inscriptionId||""), s.id);
        if (!i || !dans(P, i.mat)) return erreur(res, 404, "Inscription introuvable.");
        /* correctif 34 : un absent n'a pas de résultat ; présence et résultat tracés (avant → après) */
        const pr = ["inscrit","present","absent"].indexOf(b.presence) >= 0 ? b.presence : i.presence, re = pr !== "present" ? null : (["acquis","non_acquis"].indexOf(b.resultat) >= 0 ? b.resultat : i.resultat);
        await B.run("UPDATE frm_inscriptions SET presence=?, resultat=?, maj=?, par=? WHERE id=?", pr, re, maint(), C.login, i.id);
        if (pr !== i.presence || re !== i.resultat) await audit(C.login, "formation.presence", i.mat+" — "+s.titre+" : "+i.presence+"/"+(i.resultat||"—")+" → "+pr+"/"+(re||"—"), ip);
        return json(res, 200, {ok:true});
      }
      /* correctif 34 : présence (et résultat) de tous les inscrits restants en une fois (une requête par ligne : 429 à 500 inscrits) */
      if (ms[2] === "presence-lot" && req.method === "POST"){
        if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
        const b = await corpsJson(req), pr = ["present","absent"].indexOf(b.presence) >= 0 ? b.presence : null; if (!pr) return erreur(res, 400, "Présence attendue : present ou absent.");
        const re = pr === "present" && ["acquis","non_acquis"].indexOf(b.resultat) >= 0 ? b.resultat : null;
        const l = (await B.all("SELECT * FROM frm_inscriptions WHERE session_id=? AND presence='inscrit'", s.id)).filter(r=>dans(P, r.mat));
        await B.transaction(async ()=>{ for (const r of l) await B.run("UPDATE frm_inscriptions SET presence=?, resultat=?, maj=?, par=? WHERE id=?", pr, re, maint(), C.login, r.id); });
        if (l.length) await audit(C.login, "formation.presence", s.titre+" ("+s.id+") : "+l.length+" inscrit(s) → "+pr+"/"+(re||"—"), ip);
        return json(res, 200, {ok:true, n:l.length});
      }
      if (ms[2] === "cloturer" && req.method === "POST"){
        if (rang < 3) return erreur(res, 403, "Clôture réservée au droit de validation.");
        const l = await B.all("SELECT * FROM frm_inscriptions WHERE session_id=?", s.id);
        /* 56.33.11 : la clôture reporte niveaux et habilitations de TOUS les inscrits — refusée à un valideur limité dès
           qu'un inscrit est hors de son périmètre (il n'a pu ni voir ni saisir sa présence) */
        if (P.set !== null && l.some(r=>!dans(P, r.mat))) return erreur(res, 403, "Des inscrits sont hors de votre périmètre : clôture réservée à un valideur couvrant tous les inscrits.");
        if (s.fin > auj()) return erreur(res, 409, "Session non terminée (fin le "+jj(s.fin)+") : clôture possible à partir de cette date.");
        if (l.some(r=>r.presence === "inscrit")) return erreur(res, 409, "Saisissez la présence de chaque inscrit avant de clôturer.");
        let niveaux = 0, habs = 0;
        await B.transaction(async ()=>{
          await B.run("UPDATE frm_sessions SET statut='realisee' WHERE id=?", s.id);
          for (const r of l){
            const ok = r.presence === "present" && r.resultat === "acquis";
            if (r.besoin_id) await B.run("UPDATE frm_besoins SET statut=? WHERE id=?", ok ? "realise" : "ouvert", r.besoin_id);
            if (!ok) continue;
            /* v56.30 (§ 2) : niveau reporté par le service déclaré de FW-Competences (plus d'accès direct à ses tables) */
            const SC = s.competence_id && s.niveau_vise && actif("FW-Competences") && o.service ? o.service("FW-Competences") : null;
            if (SC && SC.service && await SC.service.porterNiveau(r.mat, s.competence_id, s.niveau_vise, C.login, "formation : "+s.titre, s.fin)) niveaux++;
            if (s.type === "habilitation"){
              const exp = s.validite_mois ? ajoutMois(s.fin, s.validite_mois) : null;
              await B.run("INSERT INTO frm_habilitations(id,mat,catalogue_id,obtenue_le,expire_le,session_id,maj) VALUES(?,?,?,?,?,?,?) ON CONFLICT(mat, catalogue_id) DO UPDATE SET obtenue_le=excluded.obtenue_le, expire_le=excluded.expire_le, session_id=excluded.session_id, maj=excluded.maj WHERE excluded.obtenue_le >= frm_habilitations.obtenue_le",
                id("fh"), r.mat, s.catalogue_id, s.fin, exp, s.id, maint()); habs++;
            }
          }
        });
        await audit(C.login, "formation.session.cloturee", s.titre+" : "+niveaux+" niveau(x), "+habs+" habilitation(s)", ip);
        return json(res, 200, {ok:true, niveaux, habilitations:habs});
      }
    }
    if (p === "/api/v1/formation/habilitations" && req.method === "GET"){
      const a = auj(), nm = await nomsDe(), pm = perimSql(B, P, "h.mat");
      const w = " WHERE 1=1"+(q.filtre === "echeance" ? " AND h.expire_le IS NOT NULL AND h.expire_le <= ?" : "")+pm.sql, aa = (q.filtre === "echeance" ? [ajoutJours(a, 90)] : []).concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM frm_habilitations h"+w, ...aa)).n);
      const l = await B.all("SELECT h.id, h.mat, h.catalogue_id, h.obtenue_le, h.expire_le, c.titre, c.code FROM frm_habilitations h JOIN frm_catalogue c ON c.id=h.catalogue_id"+w+" ORDER BY (h.expire_le IS NULL), h.expire_le LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, lignes:l.map(r=>Object.assign(r, {nom:nm(r.mat), etat:!r.expire_le ? "valide" : r.expire_le < a ? "expiree" : r.expire_le <= ajoutJours(a, 30) ? "j30" : r.expire_le <= ajoutJours(a, 90) ? "j90" : "valide"}))});
    }
    return erreur(res, 404, "Introuvable.");
  }
  if (o.planifier) o.planifier("besoins-echeances", {intervalle:24*3600000, premier:120000, priorite:3, delai:10*60000, fn:async ()=>(await generer({set:null}, "systeme"))+" besoin(s) créé(s)"});
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
