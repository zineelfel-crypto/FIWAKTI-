/* FW-Onboarding — partie serveur. Modèles de parcours (tâches avec responsable et jour d'échéance), parcours d'un
   salarié (référence par matricule, jamais de copie de la fiche), cases à cocher datées et signées, fin de période
   d'essai ; périmètre appliqué ; éléments « À traiter » et rubrique de la fiche 360°. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const crypto = require("crypto");
const ddl = {
  pg:["CREATE TABLE IF NOT EXISTS onb_modeles (id TEXT PRIMARY KEY, nom TEXT NOT NULL, fonction TEXT, taches TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS onb_parcours (id TEXT PRIMARY KEY, mat TEXT NOT NULL, modele_id TEXT, debut TEXT NOT NULL, fin_essai TEXT, statut TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
      "CREATE INDEX IF NOT EXISTS onb_parcours_mat ON onb_parcours(mat, statut)",
      "CREATE TABLE IF NOT EXISTS onb_taches (id TEXT PRIMARY KEY, parcours_id TEXT NOT NULL, ordre INTEGER, titre TEXT NOT NULL, responsable TEXT, echeance TEXT NOT NULL, faite_le TEXT, faite_par TEXT, commentaire TEXT)",
      "CREATE INDEX IF NOT EXISTS onb_taches_parcours ON onb_taches(parcours_id)",
      "CREATE INDEX IF NOT EXISTS onb_taches_echeance ON onb_taches(echeance, faite_le)"],
  sqlite:null
};
ddl.pg.push("CREATE INDEX IF NOT EXISTS onb_taches_parc ON onb_taches(parcours_id, echeance)");
ddl.sqlite = ddl.pg;
const tables = {onb_modeles:"id", onb_parcours:"id", onb_taches:"id"};
const RESP = ["rh", "manager", "salarie", "it", "hse"];
/* modèle proposé au premier usage (modifiable) */
const STANDARD = [
  {titre:"Badge, accès et compte informatique", responsable:"rh", jour:0}, {titre:"Visage enregistré sur les pointeuses", responsable:"rh", jour:0},
  {titre:"Accueil sécurité et remise des EPI", responsable:"manager", jour:1}, {titre:"Formation au poste", responsable:"manager", jour:7},
  {titre:"Point d'étape à 30 jours", responsable:"manager", jour:30}, {titre:"Point d'étape à 60 jours", responsable:"manager", jour:60},
  {titre:"Entretien de fin de période d'essai", responsable:"rh", jour:90}];
function ajout(k, n){ const p = String(k).split("-").map(Number); const d = new Date(Date.UTC(p[0], p[1]-1, p[2] + n)); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D, audit} = o;
  const existe = async m => (await D.employes()).some(e=>String(e.mat) === String(m));
  /* correctif 34 : jour LOCAL (entre minuit et 1 h, l'heure UTC donnait la veille) ; date réelle exigée */
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && ajout(s, 0) === s && +String(s).slice(0, 4) >= 1990 && +String(s).slice(0, 4) <= 2100;
  const jj = d => d ? String(d).slice(8, 10)+"/"+String(d).slice(5, 7)+"/"+String(d).slice(0, 4) : "—";
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  /* correctif 34 : le modèle standard n'est créé qu'au premier parcours (une simple lecture écrivait en base) */
  async function modeles(semer){
    let l = await B.all("SELECT * FROM onb_modeles WHERE actif=1 ORDER BY nom");
    if (!l.length && semer){ await B.run("INSERT INTO onb_modeles(id,nom,fonction,taches,actif,cree) VALUES(?,?,?,?,1,?)", id("om"), "Intégration standard", "", JSON.stringify(STANDARD), maint());
      l = await B.all("SELECT * FROM onb_modeles WHERE actif=1 ORDER BY nom"); }
    return l.map(m=>Object.assign(m, {taches:JSON.parse(m.taches)}));
  }
  async function progression(pids){
    if (!pids.length) return {};
    const out = {};
    (await B.all("SELECT parcours_id, COUNT(*) n, SUM(CASE WHEN faite_le IS NOT NULL THEN 1 ELSE 0 END) f, SUM(CASE WHEN faite_le IS NULL AND echeance < ? THEN 1 ELSE 0 END) r, MIN(CASE WHEN faite_le IS NULL THEN echeance END) p FROM onb_taches WHERE parcours_id IN ("+pids.map(()=>"?").join(",")+") GROUP BY parcours_id", auj(), ...pids))
      .forEach(x=>{ out[x.parcours_id] = {total:Number(x.n), faites:Number(x.f)||0, retard:Number(x.r)||0, prochaine:x.p||null}; });
    return out;
  }
  async function aTraiter(x){
    if (x.rang("EMP") < 2) return [];
    /* correctif 34 : périmètre et comptage dans la requête (140 000 lignes lues puis filtrées en mémoire à 20 000) */
    const pm = perimSql(B, x.P, "p.mat"), pm2 = perimSql(B, x.P, "mat");
    const l = Number((await B.get("SELECT COUNT(*) n FROM onb_taches t JOIN onb_parcours p ON p.id=t.parcours_id WHERE p.statut='en_cours' AND t.faite_le IS NULL AND t.echeance < ?"+pm.sql, auj(), ...pm.a)).n);
    const fe = Number((await B.get("SELECT COUNT(*) n FROM onb_parcours WHERE statut='en_cours' AND fin_essai >= ? AND fin_essai <= ?"+pm2.sql, auj(), ajout(auj(), 15), ...pm2.a)).n);
    const out = [];
    if (l) out.push({domaine:"talents", cle:"onboarding-retard", nombre:l, urgence:1, vue:"onboarding"});
    if (fe) out.push({domaine:"talents", cle:"onboarding-essai", nombre:fe, urgence:2, vue:"onboarding"});
    return out;
  }
  async function fiche360(x){
    if (x.rang("EMP") < 1) return null;
    const p = await B.get("SELECT * FROM onb_parcours WHERE mat=? AND statut <> 'annule' ORDER BY debut DESC LIMIT 1", String(x.mat)); if (!p) return null;
    const g = (await progression([p.id]))[p.id] || {total:0, faites:0, retard:0};
    return {cle:"onboarding", vue:"onboarding", lignes:[{k:"onbProgression", v:g.faites+" / "+g.total}, {k:"onbRetard", v:String(g.retard), alerte:g.retard > 0},
      {k:"onbProchaine", v:jj(g.prochaine)}, {k:"onbFinEssai", v:jj(p.fin_essai)}]};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries());
    if (p === "/api/v1/onboarding/modeles" && req.method === "GET") return json(res, 200, {modeles:await modeles(false), responsables:RESP});
    /* correctif 34 : un modèle se retire (il restait proposé indéfiniment, même erroné) */
    const mrm = /^\/api\/v1\/onboarding\/modeles\/([^/]+)\/retirer$/.exec(p);
    if (mrm && req.method === "POST"){ if (rang < 4) return erreur(res, 403, "Paramétrage réservé.");
      const m = await B.get("SELECT id, nom FROM onb_modeles WHERE id=? AND actif=1", mrm[1]); if (!m) return erreur(res, 404, "Modèle introuvable.");
      await B.run("UPDATE onb_modeles SET actif=0 WHERE id=?", m.id); await audit(C.login, "onboarding.modele", "retrait "+m.nom, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/onboarding/modeles" && req.method === "POST"){
      if (rang < 4) return erreur(res, 403, "Paramétrage réservé.");
      const b = await corpsJson(req), nom = String(b.nom||"").trim().slice(0, 80);
      const taches = (Array.isArray(b.taches) ? b.taches : []).slice(0, 60).map(t=>({titre:String(t.titre||"").trim().slice(0, 120), responsable:RESP.indexOf(t.responsable) >= 0 ? t.responsable : "rh", jour:Math.max(0, Math.min(365, +t.jour||0))})).filter(t=>t.titre);
      if (!nom || !taches.length) return erreur(res, 400, "Nom et au moins une tâche obligatoires.");
      const i = id("om"); await B.run("INSERT INTO onb_modeles(id,nom,fonction,taches,actif,cree) VALUES(?,?,?,?,1,?)", i, nom, String(b.fonction||"").slice(0, 80), JSON.stringify(taches), maint());
      await audit(C.login, "onboarding.modele", "ajout "+nom, ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/onboarding/parcours" && req.method === "GET"){
      const off = Math.min(1e7, Math.max(0, Math.floor(+q.offset) || 0)), lim = Math.min(200, Math.max(1, Math.floor(+q.limit) || 50)), st = ["en_cours","termine","annule"].indexOf(q.statut) >= 0 ? q.statut : "en_cours";
      const pm = perimSql(B, P, "mat"), aa = [st].concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM onb_parcours WHERE statut=?"+pm.sql, ...aa)).n);
      const page = await B.all("SELECT id, mat, modele_id, debut, fin_essai, statut FROM onb_parcours WHERE statut=?"+pm.sql+" ORDER BY debut DESC LIMIT "+lim+" OFFSET "+off, ...aa), g = await progression(page.map(r=>r.id));
      const parMat = new Map((await D.employes()).map(e=>[String(e.mat), ((e.nom||"")+" "+(e.prenom||"")).trim()]));
      return json(res, 200, {total, lignes:page.map(r=>Object.assign(r, {nom:parMat.get(String(r.mat)) || "", progression:g[r.id] || {total:0, faites:0, retard:0}}))});
    }
    if (p === "/api/v1/onboarding/parcours" && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req), mat = String(b.mat||"").trim();
      /* correctif 34 : dates réelles exigées (31/02 accepté, saisie jj/mm/aaaa remplacée en silence par le jour) */
      if (b.debut && !dateOk(b.debut)) return erreur(res, 400, "Date de début invalide.");
      if (b.finEssai && !dateOk(b.finEssai)) return erreur(res, 400, "Date de fin de période d'essai invalide.");
      const debut = b.debut || auj();
      if (b.finEssai && b.finEssai < debut) return erreur(res, 400, "La fin de période d'essai précède le début du parcours.");
      const emp = (await D.employes()).find(e=>String(e.mat) === mat);
      if (!mat || !dans(P, mat) || !emp) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      if (emp.sortie && emp.sortie <= auj()) return erreur(res, 409, "Salarié sorti le "+jj(emp.sortie)+" : pas de parcours d'intégration.");
      if (await B.get("SELECT 1 FROM onb_parcours WHERE mat=? AND statut='en_cours'", mat)) return erreur(res, 409, "Un parcours est déjà en cours pour ce salarié.");
      const ms = await modeles(true), m = b.modeleId ? ms.find(z=>z.id === b.modeleId) : ms[0];
      if (!m) return erreur(res, 400, "Modèle de parcours introuvable.");
      const i = id("op"), essai = b.finEssai || ajout(debut, 90);
      try { await B.transaction(async ()=>{
        if (await B.get("SELECT 1 FROM onb_parcours WHERE mat=? AND statut='en_cours'", mat)) throw Object.assign(new Error("Un parcours est déjà en cours pour ce salarié."), {code:409});
        await B.run("INSERT INTO onb_parcours(id,mat,modele_id,debut,fin_essai,statut,cree,par) VALUES(?,?,?,?,?,?,?,?)", i, mat, m.id, debut, essai, "en_cours", maint(), C.login);
        let n = 0; for (const t of m.taches) await B.run("INSERT INTO onb_taches(id,parcours_id,ordre,titre,responsable,echeance) VALUES(?,?,?,?,?,?)", id("ot"), i, n++, t.titre, t.responsable, ajout(debut, t.jour));
      }); } catch(e){ if (e.code === 409) return erreur(res, 409, e.message); throw e; }
      await audit(C.login, "onboarding.parcours", mat+" — "+m.nom+" à partir du "+jj(debut)+", fin d'essai "+jj(essai)+" ("+i+")", ip); return json(res, 200, {ok:true, id:i});
    }
    const mp = /^\/api\/v1\/onboarding\/parcours\/([^/]+)(?:\/(terminer|annuler))?$/.exec(p);
    if (mp){
      const pc = await B.get("SELECT * FROM onb_parcours WHERE id=?", mp[1]); if (!pc || !dans(P, pc.mat)) return erreur(res, 404, "Parcours introuvable.");
      if (!mp[2] && req.method === "GET") return json(res, 200, {parcours:pc, taches:await B.all("SELECT * FROM onb_taches WHERE parcours_id=? ORDER BY echeance, ordre", pc.id)});
      if (mp[2] && req.method === "POST"){
        if (rang < 3) return erreur(res, 403, "Droit de validation requis.");
        /* 56.33.11 : seul un parcours en cours se termine ou s'annule (un parcours annulé ne redevient pas « terminé ») */
        if (pc.statut !== "en_cours") return erreur(res, 409, "Parcours clôturé.");
        await B.run("UPDATE onb_parcours SET statut=? WHERE id=? AND statut='en_cours'", mp[2] === "terminer" ? "termine" : "annule", pc.id);
        const nf = Number((await B.get("SELECT COUNT(*) n FROM onb_taches WHERE parcours_id=? AND faite_le IS NULL", pc.id)).n);
        await audit(C.login, "onboarding.parcours."+mp[2], pc.mat+" ("+pc.id+") en cours → "+(mp[2] === "terminer" ? "terminé" : "annulé")+(nf ? " ; "+nf+" tâche(s) non faite(s)" : ""), ip); return json(res, 200, {ok:true});
      }
    }
    const mt = /^\/api\/v1\/onboarding\/taches\/([^/]+)$/.exec(p);
    if (mt && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
      const t = await B.get("SELECT t.*, p.mat, p.statut FROM onb_taches t JOIN onb_parcours p ON p.id=t.parcours_id WHERE t.id=?", mt[1]);
      if (!t || !dans(P, t.mat)) return erreur(res, 404, "Tâche introuvable.");
      if (t.statut !== "en_cours") return erreur(res, 409, "Parcours clôturé.");
      /* correctif 34 : un commentaire seul ne décoche plus la tâche (elle perdait date et signataire) */
      const b = await corpsJson(req), faite = b.faite === undefined ? !!t.faite_le : !!b.faite;
      /* 56.33.11 : recocher une tâche déjà faite garde sa date et son signataire d'origine */
      const deja = faite && t.faite_le;
      await B.run("UPDATE onb_taches SET faite_le=?, faite_par=?, commentaire=COALESCE(?, commentaire) WHERE id=?", deja ? t.faite_le : faite ? maint() : null, deja ? t.faite_par : faite ? C.login : null, b.commentaire == null ? null : String(b.commentaire).slice(0, 500), t.id);
      const etatAv = t.faite_le ? "faite" : "à faire", etatAp = faite ? "faite" : "à faire", com = b.commentaire == null ? null : String(b.commentaire).slice(0, 500);
      if (etatAv !== etatAp || (com !== null && com !== (t.commentaire || "")))
        await audit(C.login, "onboarding.tache", t.mat+" — "+t.titre+" : "+etatAv+" → "+etatAp+(com !== null && com !== (t.commentaire || "") ? " ; commentaire « "+String(t.commentaire || "").slice(0, 120)+" » → « "+com.slice(0, 120)+" »" : ""), ip);
      return json(res, 200, {ok:true});
    }
    return erreur(res, 404, "Introuvable.");
  }
  /* correctif 34 : parcours en cours d'un salarié supprimé ou sorti → annulé (il restait compté « à traiter ») */
  if (o.planifier) o.planifier("orphelins", {intervalle:3600000, premier:120000, priorite:3, delai:120000, fn:async ()=>{
    const l = await B.all("SELECT id, mat FROM onb_parcours WHERE statut='en_cours'"); if (!l.length) return "aucun parcours";
    const parMat = new Map((await D.employes()).map(e=>[String(e.mat), e])), j0 = auj(); let n = 0;
    for (const r of l){ const e = parMat.get(String(r.mat)); if (e && !(e.sortie && e.sortie < j0)) continue;
      await B.run("UPDATE onb_parcours SET statut='annule' WHERE id=? AND statut='en_cours'", r.id); n++;
      await audit("systeme", "onboarding.parcours.annuler", r.mat+" ("+r.id+") en cours → annulé : salarié "+(e ? "sorti le "+jj(e.sortie) : "supprimé")); }
    return n+" parcours annulé(s)"; }});
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
