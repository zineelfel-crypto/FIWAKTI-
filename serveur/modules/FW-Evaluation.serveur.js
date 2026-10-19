/* FW-Evaluation — partie serveur. Campagnes (annuelle, fin de période d'essai…), une évaluation par salarié et par
   campagne (référence par matricule), évaluateur désigné (le responsable du salarié s'il a un compte), objectifs avec
   taux d'atteinte, niveaux de compétences proposés ; à la validation, les niveaux sont reportés dans la matrice des
   compétences (si FW-Competences est actif) avec historique. Périmètre et droits appliqués par le serveur. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS eva_campagnes (id TEXT PRIMARY KEY, nom TEXT NOT NULL, type TEXT, debut TEXT NOT NULL, fin TEXT NOT NULL, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS eva_evaluations (id TEXT PRIMARY KEY, campagne_id TEXT NOT NULL, mat TEXT NOT NULL, evaluateur TEXT, statut TEXT NOT NULL, note INTEGER, objectifs TEXT, competences TEXT, commentaire TEXT, maj TEXT NOT NULL, valide_par TEXT, valide_le TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS eva_evaluations_cle ON eva_evaluations(campagne_id, mat)",
  "CREATE INDEX IF NOT EXISTS eva_evaluations_eval ON eva_evaluations(evaluateur, statut)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS eva_evaluations_mat ON eva_evaluations(mat, statut)","CREATE INDEX IF NOT EXISTS eva_evaluations_camp ON eva_evaluations(campagne_id, statut)");
ddl.sqlite = ddl.pg;
const tables = {eva_campagnes:"id", eva_evaluations:"id"};
const STATUTS = ["a_faire", "en_cours", "terminee", "validee"];
function creer(o){
  const {B, D, audit} = o, actif = o.moduleActif || (()=>false);
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString();
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  const json2 = v => { try { return v ? JSON.parse(v) : []; } catch(e){ return []; } };
  /* correctif 34 : dates réelles, nombres entiers, données d'évaluation confidentielles */
  const dateOk = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const entier = v => typeof v === "number" ? (Number.isInteger(v) ? v : NaN) : (/^\d+$/.test(String(v == null ? "" : v).trim()) ? +String(v).trim() : NaN);
  const PERIM = require("../perimetre.js");
  const voitConfidentiel = (x, ev) => x.admin || (ev && ev.evaluateur === x.C.login) || (x.rang >= 3 && !PERIM.masquePerso(x.P));
  const masquer = ev => Object.assign(ev, {note:null, commentaire:"", objectifs:json2(ev.objectifs).map(z=>({libelle:z.libelle, atteinte:null})), competences:[], confidentiel:true});
  const monMat = async P => { if (!P || !P.u || !P.u.empId) return null; const e = (await D.employes()).find(z=>z.id === P.u.empId); return e ? String(e.mat) : null; };
  /* évaluateur par défaut : le compte rattaché au responsable du salarié */
  async function evaluateurs(){
    const ref = await (D.referentielLecture || D.referentiel)() || {}, emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    const loginDeEmp = new Map((ref.users||[]).filter(u=>u.actif !== false && u.empId).map(u=>[u.empId, u.login]));
    return m => { const e = parMat.get(String(m)), c = e && e.chefMat ? parMat.get(String(e.chefMat)) : null; return c ? (loginDeEmp.get(c.id) || null) : null; };
  }
  async function aTraiter(x){
    const r = x.rang("EMP"), out = [];
    const mien = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE c.statut='ouverte' AND a.evaluateur=? AND a.statut IN ('a_faire','en_cours')", x.C.login)).n);
    if (mien && r >= 2) out.push({domaine:"talents", cle:"evaluation-a-faire", nombre:mien, urgence:1, vue:"evaluation"});
    if (r >= 3){ const pm = perimSql(B, x.P, "mat"), l = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations WHERE statut='terminee'"+pm.sql, ...pm.a)).n);
      if (l) out.push({domaine:"talents", cle:"evaluation-a-valider", nombre:l, urgence:1, vue:"evaluation"}); }
    return out;
  }
  async function fiche360(x){
    if (x.rang("EMP") < 1) return null;
    const e = await B.get("SELECT a.*, c.nom campagne FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE a.mat=? ORDER BY c.debut DESC LIMIT 1", String(x.mat)); if (!e) return null;
    const ob = json2(e.objectifs), moy = ob.length ? Math.round(ob.reduce((s, z)=>s + (Number(z.atteinte)||0), 0) / ob.length) : null;
    const vc = voitConfidentiel({admin:x.admin, C:x.C, P:x.P, rang:x.rang("EMP")}, e);
    return {cle:"evaluation", vue:"evaluation", sousTitre:e.campagne, lignes:[{k:"evaStatut_"+e.statut, v:""}].concat(vc ? [{k:"evaNote", v:e.note == null ? "—" : e.note+" / 5"}, {k:"evaObjectifs", v:moy == null ? "—" : moy+" %"}] : [])};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries());
    const catalogueActif = async () => { const SC = actif("FW-Competences") && o.service ? o.service("FW-Competences") : null;
      if (!SC || !SC.service || !SC.service.catalogue) return null; try { return new Set((await SC.service.catalogue()).map(c=>String(c.id))); } catch(e){ return null; } };
    if (p === "/api/v1/evaluation/campagnes" && req.method === "GET"){
      /* 56.33.11 : totaux limités au périmètre (mêmes règles que la liste des évaluations) */
      const pm = perimSql(B, P, "a.mat"), pw = P.set === null ? "" : " AND ((1=1"+pm.sql+") OR a.evaluateur=?)", pa = P.set === null ? [] : [...pm.a, C.login];
      const l = await B.all("SELECT c.*, (SELECT COUNT(*) FROM eva_evaluations a WHERE a.campagne_id=c.id"+pw+") total, (SELECT COUNT(*) FROM eva_evaluations a WHERE a.campagne_id=c.id AND a.statut='validee'"+pw+") validees FROM eva_campagnes c ORDER BY debut DESC LIMIT 100", ...pa, ...pa);
      return json(res, 200, {campagnes:l, competencesActif:actif("FW-Competences")});
    }
    if (p === "/api/v1/evaluation/campagnes" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Lancement des campagnes réservé au paramétrage.");
      const b = await corpsJson(req), nom = String(b.nom||"").trim().slice(0, 100);
      if (!nom || !dateOk(b.debut) || !dateOk(b.fin) || b.fin < b.debut) return erreur(res, 400, "Nom et période réelle (début ≤ fin) obligatoires.");
      /* correctif 34 : même campagne lancée deux fois (double clic : deux campagnes de 9 500 évaluations) */
      if (await B.get("SELECT 1 FROM eva_campagnes WHERE statut='ouverte' AND nom=? AND debut=? AND fin=?", nom, b.debut, b.fin)) return erreur(res, 409, "Une campagne ouverte porte déjà ce nom et cette période.");
      /* salariés actifs du périmètre de celui qui lance, filtrés par site, service ou fonction */
      const emps = (await D.employes()).filter(e=>dans(P, e.mat) && !(e.sortie && e.sortie < b.debut) && (!b.site || e.siteId === b.site) && (!b.dept || e.deptId === b.dept) && (!b.fonction || (e.poste||"") === b.fonction));
      if (!emps.length) return erreur(res, 400, "Aucun salarié ne correspond.");
      const ev = await evaluateurs(), i = id("ec"), objectifs = (Array.isArray(b.objectifs) ? b.objectifs : []).slice(0, 15).map(z=>({libelle:String(z.libelle||z).slice(0, 160), atteinte:null})).filter(z=>z.libelle);
      await B.transaction(async ()=>{
        await B.run("INSERT INTO eva_campagnes(id,nom,type,debut,fin,statut,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, nom, String(b.type||"annuelle").slice(0, 30), b.debut, b.fin, "ouverte", maint(), C.login);
        for (const e of emps) await B.run("INSERT INTO eva_evaluations(id,campagne_id,mat,evaluateur,statut,objectifs,competences,maj) VALUES(?,?,?,?,?,?,?,?)", id("ev"), i, String(e.mat), ev(e.mat), "a_faire", JSON.stringify(objectifs), "[]", maint());
      });
      await audit(C.login, "evaluation.campagne", nom+" : "+emps.length+" évaluation(s)", ip); return json(res, 200, {ok:true, id:i, evaluations:emps.length});
    }
    /* correctif 34 : clôture et suppression d'une campagne — existence, statut, périmètre global ; suppression seulement
       si aucune évaluation n'a commencé */
    const mc = /^\/api\/v1\/evaluation\/campagnes\/([^/]+)\/(clore|supprimer)$/.exec(p);
    if (mc && req.method === "POST"){ if (rang < 4) return erreur(res, 403, "Réservé au paramétrage.");
      const cp = await B.get("SELECT * FROM eva_campagnes WHERE id=?", mc[1]); if (!cp) return erreur(res, 404, "Campagne introuvable.");
      if (cp.statut !== "ouverte") return erreur(res, 409, "Campagne déjà close.");
      if (P.set !== null && !admin){ const pm = perimSql(B, P, "mat"), tot = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations WHERE campagne_id=?", cp.id)).n), mien = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations WHERE campagne_id=?"+pm.sql, cp.id, ...pm.a)).n);
        if (mien < tot) return erreur(res, 403, "La campagne comprend des salariés hors de votre périmètre : action réservée à un compte couvrant tous ses salariés."); }
      const st = await B.all("SELECT statut, COUNT(*) n FROM eva_evaluations WHERE campagne_id=? GROUP BY statut", cp.id), resume = st.map(z=>z.statut+" "+z.n).join(", ");
      if (mc[2] === "supprimer"){ if (st.some(z=>z.statut !== "a_faire" && Number(z.n) > 0)) return erreur(res, 409, "Des évaluations sont commencées : clôturez la campagne au lieu de la supprimer.");
        await B.transaction(async ()=>{ await B.run("DELETE FROM eva_evaluations WHERE campagne_id=?", cp.id); await B.run("DELETE FROM eva_campagnes WHERE id=?", cp.id); });
        await audit(C.login, "evaluation.campagne.supprimee", cp.nom+" ("+cp.id+") — "+resume, ip); return json(res, 200, {ok:true}); }
      await B.run("UPDATE eva_campagnes SET statut='close' WHERE id=? AND statut='ouverte'", cp.id); await audit(C.login, "evaluation.campagne.close", cp.nom+" ("+cp.id+") ouverte → close — "+resume, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/evaluation/evaluations" && req.method === "GET"){
      const off = Math.min(1e7, Math.max(0, Math.floor(Number(q.offset)) || 0)), lim = Math.min(200, Math.max(1, Math.floor(Number(q.limit)) || 50));
      const w = ["1=1"], a = []; if (q.campagne){ w.push("a.campagne_id=?"); a.push(q.campagne); } if (STATUTS.indexOf(q.statut) >= 0){ w.push("a.statut=?"); a.push(q.statut); }
      if (q.mes === "1"){ w.push("a.evaluateur=?"); a.push(C.login); }
      if (P.set !== null){ const pm = perimSql(B, P, "a.mat"); w.push("((1=1"+pm.sql+") OR a.evaluateur=?)"); a.push(...pm.a, C.login); }
      const total = Number((await B.get("SELECT COUNT(*) n FROM eva_evaluations a WHERE "+w.join(" AND "), ...a)).n);
      const l = await B.all("SELECT a.id, a.mat, a.evaluateur, a.statut, a.note, a.maj, c.nom campagne FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE "+w.join(" AND ")+" ORDER BY a.mat LIMIT "+lim+" OFFSET "+off, ...a);
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      return json(res, 200, {total, lignes:l.map(r=>{ const e = emps.get(r.mat) || {}; if (!voitConfidentiel({admin, C, P, rang}, r)) r.note = null; return Object.assign(r, {nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:e.poste||""}); })});
    }
    const me = /^\/api\/v1\/evaluation\/evaluations\/([^/]+)(?:\/(valider|rouvrir))?$/.exec(p);
    if (me){
      const ev = await B.get("SELECT a.*, c.statut cstatut, c.nom campagne FROM eva_evaluations a JOIN eva_campagnes c ON c.id=a.campagne_id WHERE a.id=?", me[1]);
      if (!ev || !(dans(P, ev.mat) || ev.evaluateur === C.login)) return erreur(res, 404, "Évaluation introuvable.");
      const e = (await D.employes()).find(z=>String(z.mat) === ev.mat) || {};
      if (!me[2] && req.method === "GET"){
        let exig = [];
        /* v56.30 (§ 2) : exigences lues par le service déclaré de FW-Competences */
        { const SC = actif("FW-Competences") && o.service ? o.service("FW-Competences") : null; if (SC && SC.service) try { exig = await SC.service.exigencesFonction(ev.mat, String(e.poste||"")); } catch(err){} }
        const evv = voitConfidentiel({admin, C, P, rang}, ev) ? Object.assign(ev, {objectifs:json2(ev.objectifs), competences:json2(ev.competences)}) : masquer(ev);
        return json(res, 200, {evaluation:evv, salarie:{mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:e.poste||""}, exigences:exig});
      }
      if (!me[2] && req.method === "POST"){
        if (ev.cstatut !== "ouverte" || ev.statut === "validee") return erreur(res, 409, "Évaluation clôturée.");
        if (!(rang >= 3 || (rang >= 2 && (ev.evaluateur === C.login || !ev.evaluateur)))) return erreur(res, 403, "Seul l'évaluateur désigné (ou un valideur) peut saisir cette évaluation.");
        /* correctif 34 : personne n'évalue ni ne valide sa propre évaluation */
        if (!admin && await monMat(P) === String(ev.mat)) return erreur(res, 403, "Vous ne pouvez pas saisir votre propre évaluation.");
        const b = await corpsJson(req);
        /* note entière de 1 à 5, taux entiers de 0 à 100 ; valeurs absentes conservées */
        let note = ev.note; if (b.note !== undefined){ if (b.note === null || b.note === "") note = null; else { const n = entier(b.note); if (!(n >= 1 && n <= 5)) return erreur(res, 400, "Note : nombre entier de 1 à 5."); note = n; } }
        const ob0 = json2(ev.objectifs); let mauvais = false;
        const ob = ob0.map((z, k)=>{ const v = Array.isArray(b.objectifs) ? b.objectifs[k] : undefined; if (v == null || v === "") return z; const n = entier(v); if (!(n >= 0 && n <= 100)){ mauvais = true; return z; } return Object.assign({}, z, {atteinte:n}); });
        if (mauvais) return erreur(res, 400, "Atteinte des objectifs : nombre entier de 0 à 100 %.");
        /* 56.33.11 : seules les compétences actives du catalogue (service de FW-Competences) sont retenues ; correctif 34 : sans
           envoi ou module inactif, les compétences déjà saisies sont conservées */
        const cat = await catalogueActif(); let cp = json2(ev.competences);
        if (Array.isArray(b.competences) && cat){ cp = [];
          for (const z of b.competences.slice(0, 60)){ const n = entier(z && z.niveau); if (!(n >= 0 && n <= 4)) return erreur(res, 400, "Niveau de compétence : nombre entier de 0 à 4."); if (cat.has(String(z.competence_id))) cp.push({competence_id:String(z.competence_id), niveau:n}); } }
        const com = b.commentaire === undefined ? (ev.commentaire || "") : String(b.commentaire || "").slice(0, 4000);
        if (b.terminer && (note == null || ob.some(z=>z.atteinte == null))) return erreur(res, 400, "Pour terminer : note et atteinte de chaque objectif obligatoires.");
        const statut = b.terminer ? "terminee" : "en_cours";
        await B.run("UPDATE eva_evaluations SET note=?, objectifs=?, competences=?, commentaire=?, statut=?, maj=?, evaluateur=COALESCE(evaluateur, ?) WHERE id=?",
          note, JSON.stringify(ob), JSON.stringify(cp), com, statut, maint(), C.login, ev.id);
        const ch = []; if (note !== ev.note) ch.push("note "+(ev.note == null ? "—" : ev.note)+" → "+(note == null ? "—" : note)); if (com !== (ev.commentaire || "")) ch.push("commentaire modifié ("+com.length+" car.)");
        if (JSON.stringify(ob) !== JSON.stringify(ob0)) ch.push("objectifs "+ob.map(z=>z.atteinte == null ? "—" : z.atteinte+" %").join(", ")); if (JSON.stringify(cp) !== JSON.stringify(json2(ev.competences))) ch.push(cp.length+" niveau(x) de compétence");
        await audit(C.login, "evaluation.saisie", ev.mat+" — "+ev.campagne+" : "+ev.statut+" → "+statut+(ch.length ? " ; "+ch.join(" ; ") : ""), ip); return json(res, 200, {ok:true, statut});
      }
      if (me[2] && req.method === "POST"){
        if (rang < 3) return erreur(res, 403, "Validation réservée au droit de validation.");
        if (!admin && await monMat(P) === String(ev.mat)) return erreur(res, 403, "Vous ne pouvez pas valider votre propre évaluation.");
        if (!admin && me[2] === "valider" && ev.evaluateur === C.login) return erreur(res, 403, "L'évaluateur ne valide pas sa propre saisie : un autre valideur doit le faire.");
        if (ev.cstatut !== "ouverte") return erreur(res, 409, "Campagne close."); /* 56.33.11 */
        if (me[2] === "rouvrir"){ if (ev.statut === "validee") return erreur(res, 409, "Une évaluation validée ne se rouvre pas."); await B.run("UPDATE eva_evaluations SET statut='en_cours', maj=? WHERE id=?", maint(), ev.id); await audit(C.login, "evaluation.rouverte", ev.mat, ip); return json(res, 200, {ok:true}); }
        if (ev.statut !== "terminee") return erreur(res, 409, "Seule une évaluation terminée se valide.");
        let reportes = 0;
        try { await B.transaction(async ()=>{
          if (!(await B.run("UPDATE eva_evaluations SET statut='validee', valide_par=?, valide_le=?, maj=? WHERE id=? AND statut='terminee'", C.login, maint(), maint(), ev.id)).n) throw Object.assign(new Error("Évaluation déjà validée."), {code:409});
          /* report des niveaux dans la matrice des compétences, avec historique */
          { const SC = actif("FW-Competences") && o.service ? o.service("FW-Competences") : null;
            const cat = await catalogueActif(); /* 56.33.11 : compétence retirée du catalogue depuis la saisie = ignorée */
            if (SC && SC.service) for (const z of json2(ev.competences)) if (cat && cat.has(String(z.competence_id)) && await SC.service.ecrireNiveau(ev.mat, z.competence_id, z.niveau, C.login, "évaluation : "+ev.campagne, maint().slice(0, 10), false)) reportes++; }
        }); } catch(e){ if (e.code === 409) return erreur(res, 409, e.message); throw e; }
        await audit(C.login, "evaluation.validee", ev.mat+" — "+ev.campagne+" : "+reportes+" niveau(x) reporté(s)", ip); return json(res, 200, {ok:true, reportes});
      }
    }
    return erreur(res, 404, "Introuvable.");
  }
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
