/* FW-HSE — partie serveur. Événements (accidents, incidents, presque-accidents) avec analyse et clôture, actions
   correctives à échéance, évaluation des risques (gravité × probabilité), dotations d'équipements de protection,
   indicateurs (taux de fréquence et de gravité calculés sur les heures réellement travaillées, lues dans FW-Time).
   Aucune donnée médicale : seulement le nombre de jours d'arrêt. Périmètre et droits appliqués par le serveur. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS hse_evenements (id TEXT PRIMARY KEY, type TEXT NOT NULL, d TEXT NOT NULL, heure TEXT, site_id TEXT, lieu TEXT, mat TEXT, gravite INTEGER, arret INTEGER NOT NULL DEFAULT 0, jours_arret INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL, cause TEXT, statut TEXT NOT NULL, declare_par TEXT, cree TEXT NOT NULL, clos_le TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_evenements_d ON hse_evenements(d, type)",
  "CREATE INDEX IF NOT EXISTS hse_evenements_mat ON hse_evenements(mat)",
  "CREATE TABLE IF NOT EXISTS hse_actions (id TEXT PRIMARY KEY, evenement_id TEXT, risque_id TEXT, titre TEXT NOT NULL, responsable TEXT, echeance TEXT NOT NULL, statut TEXT NOT NULL, faite_le TEXT, cree TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_actions_statut ON hse_actions(statut, echeance)",
  "CREATE TABLE IF NOT EXISTS hse_risques (id TEXT PRIMARY KEY, unite TEXT NOT NULL, danger TEXT NOT NULL, gravite INTEGER NOT NULL, probabilite INTEGER NOT NULL, mesures TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS hse_epi (id TEXT PRIMARY KEY, mat TEXT NOT NULL, type TEXT NOT NULL, remis_le TEXT NOT NULL, renouveler_le TEXT, par TEXT)",
  "CREATE INDEX IF NOT EXISTS hse_epi_mat ON hse_epi(mat)",
  "CREATE INDEX IF NOT EXISTS hse_epi_renouv ON hse_epi(renouveler_le)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS hse_evenements_statut ON hse_evenements(statut, d)","CREATE INDEX IF NOT EXISTS hse_actions_evt ON hse_actions(evenement_id, echeance)");
ddl.sqlite = ddl.pg;
const tables = {hse_evenements:"id", hse_actions:"id", hse_risques:"id", hse_epi:"id"};
const TYPES = ["accident", "incident", "presque_accident"];
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D, audit} = o;
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => maint().slice(0, 10);
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  async function contexte(P){
    const emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    const sites = P.set === null ? null : new Set(emps.filter(e=>P.set.has(String(e.mat))).map(e=>e.siteId));
    const nom = m => { const e = parMat.get(String(m)) || {}; return ((e.nom||"")+" "+(e.prenom||"")).trim(); };
    return {parMat, sites, nom};
  }
  /* 56.33.11 : un événement qui nomme un salarié suit uniquement le périmètre de ce salarié (le site ou le déclarant
     ne suffisent plus : ils exposaient la victime hors périmètre) ; sans salarié, site du périmètre ou déclarant */
  const visible = (P, cx, e, login) => P.set === null || (e.mat ? dans(P, e.mat) : ((e.site_id && cx.sites.has(e.site_id)) || e.declare_par === login));
  /* même règle en SQL (préfixe de table « pre », vide ou « e. ») */
  const visibleSql = (P, cx, login, pre) => { if (P.set === null) return {sql:"", a:[]};
    const pm = perimSql(B, P, pre+"mat"), ps = perimSql(B, {set:cx.sites}, pre+"site_id");
    return {sql:" AND (("+pre+"mat IS NOT NULL"+pm.sql+") OR ("+pre+"mat IS NULL AND (("+pre+"site_id IS NOT NULL"+ps.sql+") OR "+pre+"declare_par=?)))", a:[...pm.a, ...ps.a, login]}; };
  /* indicateurs : taux de fréquence (accidents avec arrêt × 1 000 000 / heures travaillées) et taux de gravité
     (jours d'arrêt × 1 000 / heures travaillées) ; heures lues dans les journées calculées par FW-Time */
  /* 56.32 : heures travaillées gardées en mémoire 15 min par période et périmètre (la somme sur 12 mois parcourait
     2,3 millions de journées à chaque ouverture : 6 à 8 s à 60 000 salariés) ; vidées quand les journées changent */
  const HEURES = new Map();
  async function heuresPeriode(P, du, au){
    /* 56.33.11 : empreinte de la liste complète (la troncature à 4 000 caractères confondait des périmètres différents) */
    const cle = du+"|"+au+"|"+(P.set === null ? "*" : crypto.createHash("sha1").update(Array.from(P.set).sort().join(",")).digest("hex")), h = HEURES.get(cle);
    if (h && Date.now() - h.t < 15 * 60000) return h.v;
    let heures = 0;
    if (P.set === null) heures = Number((await B.get("SELECT SUM(hp) h FROM calc_jour WHERE d>=? AND d<=?", du, au)).h) || 0;
    else { const mats = Array.from(P.set); for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500);
      heures += Number((await B.get("SELECT SUM(hp) h FROM calc_jour WHERE d>=? AND d<=? AND mat IN ("+l.map(()=>"?").join(",")+")", du, au, ...l)).h) || 0; } }
    if (HEURES.size > 200) HEURES.clear(); HEURES.set(cle, {t:Date.now(), v:heures}); return heures;
  }
  async function indicateurs(P, du, au, login){
    const cx = await contexte(P);
    const ev = (await B.all("SELECT type, d, mat, site_id, arret, jours_arret, declare_par FROM hse_evenements WHERE d>=? AND d<=?", du, au)).filter(e=>visible(P, cx, e, login));
    let heures = 0;
    /* 56.33.11 : bloc résiduel retiré — il recomptait les heures (TF/TG divisés par deux en périmètre limité) et levait
       une exception pour un périmètre global (Array.from(null)) */
    try { heures = await heuresPeriode(P, du, au); } catch(e){}
    const acc = ev.filter(e=>e.type === "accident"), avecArret = acc.filter(e=>e.arret), jours = avecArret.reduce((s, e)=>s + (Number(e.jours_arret)||0), 0);
    const parMois = {}; ev.forEach(e=>{ const m = e.d.slice(0, 7); const x = parMois[m] || (parMois[m] = {accident:0, incident:0, presque_accident:0}); x[e.type]++; });
    const va = visibleSql(P, cx, login, "e.");
    const actions = await B.all("SELECT a.statut, a.echeance FROM hse_actions a LEFT JOIN hse_evenements e ON e.id=a.evenement_id WHERE a.statut <> 'faite'"+(va.sql ? " AND (a.evenement_id IS NULL OR (e.id IS NOT NULL"+va.sql+"))" : ""), ...va.a);
    return {du, au, heures:Math.round(heures), accidents:acc.length, avecArret:avecArret.length, joursArret:jours, incidents:ev.filter(e=>e.type === "incident").length,
      presqueAccidents:ev.filter(e=>e.type === "presque_accident").length, tf:heures ? Math.round(avecArret.length * 1e6 / heures * 100) / 100 : null,
      tg:heures ? Math.round(jours * 1e3 / heures * 100) / 100 : null, actionsOuvertes:actions.length, actionsRetard:actions.filter(a=>a.echeance < auj()).length,
      parMois:Object.keys(parMois).sort().map(m=>Object.assign({mois:m}, parMois[m]))};
  }
  async function aTraiter(x){
    const r = x.rang("EMP"), out = [], a = auj();
    if (r >= 3){
      const ev = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE statut='ouvert'")).n);
      if (ev) out.push({domaine:"sante", cle:"hse-evenements", nombre:ev, urgence:2, vue:"hse"});
      const ac = Number((await B.get("SELECT COUNT(*) n FROM hse_actions WHERE statut <> 'faite' AND echeance < ?", a)).n);
      if (ac) out.push({domaine:"sante", cle:"hse-actions-retard", nombre:ac, urgence:2, vue:"hse"});
    }
    if (r >= 2){ const e = (await B.all("SELECT mat FROM hse_epi WHERE renouveler_le IS NOT NULL AND renouveler_le <= ?", ajoutJours(a, 30))).filter(z=>dans(x.P, z.mat)).length;
      if (e) out.push({domaine:"sante", cle:"hse-epi", nombre:e, urgence:1, vue:"hse"}); }
    return out;
  }
  async function fiche360(x){
    if (x.rang("EMP") < 1) return null;
    const m = String(x.mat), a = auj();
    const acc = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements WHERE mat=? AND type='accident' AND d>=?", m, ajoutJours(a, -365))).n);
    const epi = await B.all("SELECT type, renouveler_le FROM hse_epi WHERE mat=? ORDER BY remis_le DESC", m);
    if (!acc && !epi.length) return null;
    const ar = epi.filter(e=>e.renouveler_le && e.renouveler_le <= ajoutJours(a, 30)).length;
    return {cle:"hse", vue:"hse", lignes:[{k:"hseAccidents12", v:String(acc), alerte:acc > 0}, {k:"hseEpi", v:epi.length ? Array.from(new Set(epi.map(e=>e.type))).join(", ") : "—"}, {k:"hseEpiRenouv", v:String(ar), alerte:ar > 0}]};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).EMP] || 0);
    if (rang < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.max(0, +q.offset||0), lim = Math.min(200, Math.max(1, +q.limit||50));
    if (p === "/api/v1/hse/indicateurs" && req.method === "GET"){
      const au = /^\d{4}-\d{2}-\d{2}$/.test(q.au||"") ? q.au : auj(), du = /^\d{4}-\d{2}-\d{2}$/.test(q.du||"") ? q.du : ajoutJours(au, -364);
      return json(res, 200, await indicateurs(P, du, au, C.login));
    }
    if (p === "/api/v1/hse/evenements" && req.method === "GET"){
      const cx = await contexte(P), st = q.statut === "tous" ? null : (q.statut === "clos" ? "clos" : "ouvert_analyse");
      /* v56.23 : filtres, visibilité (salarié du périmètre, site du périmètre ou déclarant) et pagination en SQL */
      let w = " WHERE 1=1", a = [];
      if (st) w += st === "clos" ? " AND statut='clos'" : " AND statut <> 'clos'";
      if (TYPES.indexOf(q.type) >= 0){ w += " AND type=?"; a.push(q.type); }
      const vs = visibleSql(P, cx, C.login, ""); w += vs.sql; a.push(...vs.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_evenements"+w, ...a)).n);
      const l = await B.all("SELECT id, type, d, heure, site_id, lieu, mat, gravite, arret, jours_arret, description, cause, statut, declare_par FROM hse_evenements"+w+" ORDER BY d DESC, heure DESC LIMIT "+lim+" OFFSET "+off, ...a);
      return json(res, 200, {total, lignes:l.map(e=>Object.assign(e, {victime:e.mat ? cx.nom(e.mat) : ""}))});
    }
    if (p === "/api/v1/hse/evenements" && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie requis pour déclarer.");
      const b = await corpsJson(req), type = TYPES.indexOf(b.type) >= 0 ? b.type : null, desc = String(b.description||"").trim();
      if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(b.d||"") || !desc) return erreur(res, 400, "Type, date et description obligatoires.");
      if (b.d > auj()) return erreur(res, 400, "La date ne peut pas être dans le futur.");
      const mat = String(b.mat||"").trim();
      if (mat && (!dans(P, mat) || !(await D.employes()).some(e=>String(e.mat) === mat))) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      /* 56.33.11 : site contrôlé (existant et dans les sites du périmètre), comme dans FW-Visiteurs */
      if (b.siteId){ const ref = await (D.referentielLecture || D.referentiel)() || {}, cx = await contexte(P);
        if (!(ref.sites||[]).some(z=>z.id === b.siteId) || (cx.sites !== null && !cx.sites.has(b.siteId))) return erreur(res, 400, "Site inconnu ou hors périmètre."); }
      const arret = type === "accident" && !!b.arret;
      const i = id("he"); await B.run("INSERT INTO hse_evenements(id,type,d,heure,site_id,lieu,mat,gravite,arret,jours_arret,description,cause,statut,declare_par,cree) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        i, type, b.d, String(b.heure||"").slice(0, 5), b.siteId || null, String(b.lieu||"").slice(0, 120), mat || null, Math.max(1, Math.min(4, +b.gravite||1)), arret ? 1 : 0, arret ? Math.max(0, Math.min(3650, +b.joursArret||0)) : 0,
        desc.slice(0, 4000), String(b.cause||"").slice(0, 2000), "ouvert", C.login, maint());
      await audit(C.login, "hse.evenement.declare", type+" du "+b.d+(mat ? " — "+mat : ""), ip); return json(res, 200, {ok:true, id:i});
    }
    const me = /^\/api\/v1\/hse\/evenements\/([^/]+)(?:\/(analyse|cloturer))?$/.exec(p);
    if (me){
      const e = await B.get("SELECT * FROM hse_evenements WHERE id=?", me[1]), cx = await contexte(P);
      if (!e || !visible(P, cx, e, C.login)) return erreur(res, 404, "Événement introuvable.");
      if (!me[2] && req.method === "GET") return json(res, 200, {evenement:Object.assign(e, {victime:e.mat ? cx.nom(e.mat) : ""}), actions:await B.all("SELECT * FROM hse_actions WHERE evenement_id=? ORDER BY echeance", e.id)});
      if (rang < 3) return erreur(res, 403, "Analyse et clôture réservées au droit de validation.");
      if (e.statut === "clos") return erreur(res, 409, "Événement clos.");
      if (me[2] === "analyse" && req.method === "POST"){ const b = await corpsJson(req);
        await B.run("UPDATE hse_evenements SET cause=?, statut='en_analyse', jours_arret=CASE WHEN arret=1 THEN ? ELSE 0 END WHERE id=?", String(b.cause||e.cause||"").slice(0, 2000), Math.max(0, Math.min(3650, (b.joursArret !== undefined && b.joursArret !== null && b.joursArret !== "" ? +b.joursArret : +e.jours_arret) || 0)), e.id); /* 56.33.11 : 0 accepté */
        await audit(C.login, "hse.evenement.analyse", e.id, ip); return json(res, 200, {ok:true}); }
      if (me[2] === "cloturer" && req.method === "POST"){
        if (!String(e.cause||"").trim()) return erreur(res, 409, "Renseignez la cause (analyse) avant de clore.");
        const ouvertes = Number((await B.get("SELECT COUNT(*) n FROM hse_actions WHERE evenement_id=? AND statut <> 'faite'", e.id)).n);
        if (ouvertes) return erreur(res, 409, ouvertes+" action(s) corrective(s) encore ouverte(s).");
        await B.run("UPDATE hse_evenements SET statut='clos', clos_le=? WHERE id=?", maint(), e.id); await audit(C.login, "hse.evenement.clos", e.id, ip); return json(res, 200, {ok:true}); }
    }
    if (p === "/api/v1/hse/actions" && req.method === "GET"){
      const st = q.statut === "faite" ? "faite" : null;
      /* 56.33.11 : actions rattachées à un événement limitées aux événements visibles (actions sur risque : communes) */
      const va = visibleSql(P, await contexte(P), C.login, "e.");
      const w = " WHERE "+(st ? "a.statut='faite'" : "a.statut <> 'faite'")+(va.sql ? " AND (a.evenement_id IS NULL OR (e.id IS NOT NULL"+va.sql+"))" : "");
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_actions a LEFT JOIN hse_evenements e ON e.id=a.evenement_id"+w, ...va.a)).n);
      const l = await B.all("SELECT a.id, a.evenement_id, a.risque_id, a.titre, a.responsable, a.echeance, a.statut, a.faite_le, e.type evtype, e.d evd, r.danger FROM hse_actions a LEFT JOIN hse_evenements e ON e.id=a.evenement_id LEFT JOIN hse_risques r ON r.id=a.risque_id"+w+" ORDER BY a.echeance LIMIT "+lim+" OFFSET "+off, ...va.a);
      return json(res, 200, {total, lignes:l});
    }
    if (p === "/api/v1/hse/actions" && req.method === "POST"){
      if (rang < 3) return erreur(res, 403, "Droit de validation requis.");
      const b = await corpsJson(req), titre = String(b.titre||"").trim();
      if (!titre || !/^\d{4}-\d{2}-\d{2}$/.test(b.echeance||"")) return erreur(res, 400, "Action et échéance obligatoires.");
      if (b.evenementId){ const e = await B.get("SELECT * FROM hse_evenements WHERE id=? AND statut <> 'clos'", String(b.evenementId)); /* 56.33.11 : événement visible exigé */
        if (!e || !visible(P, await contexte(P), e, C.login)) return erreur(res, 400, "Événement introuvable ou clos."); }
      if (b.risqueId && !await B.get("SELECT 1 FROM hse_risques WHERE id=?", b.risqueId)) return erreur(res, 400, "Risque introuvable.");
      const i = id("ha"); await B.run("INSERT INTO hse_actions(id,evenement_id,risque_id,titre,responsable,echeance,statut,cree,par) VALUES(?,?,?,?,?,?,?,?,?)", i, b.evenementId || null, b.risqueId || null, titre.slice(0, 200), String(b.responsable||"").slice(0, 80), b.echeance, "a_faire", maint(), C.login);
      await audit(C.login, "hse.action", titre, ip); return json(res, 200, {ok:true, id:i});
    }
    const ma = /^\/api\/v1\/hse\/actions\/([^/]+)\/faite$/.exec(p);
    if (ma && req.method === "POST"){ if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
      const a = await B.get("SELECT * FROM hse_actions WHERE id=?", ma[1]); if (!a) return erreur(res, 404, "Action introuvable.");
      /* 56.33.11 : action d'un événement hors visibilité = introuvable */
      if (a.evenement_id){ const e = await B.get("SELECT * FROM hse_evenements WHERE id=?", a.evenement_id); if (!e || !visible(P, await contexte(P), e, C.login)) return erreur(res, 404, "Action introuvable."); }
      if (a.statut === "faite") return erreur(res, 409, "Action déjà faite.");
      await B.run("UPDATE hse_actions SET statut='faite', faite_le=? WHERE id=?", maint(), a.id); await audit(C.login, "hse.action.faite", a.titre, ip); return json(res, 200, {ok:true}); }
    if (p === "/api/v1/hse/risques" && req.method === "GET")
      return json(res, 200, {lignes:(await B.all("SELECT * FROM hse_risques")).map(r=>Object.assign(r, {criticite:r.gravite * r.probabilite})).sort((a, b)=>b.criticite - a.criticite)});
    if (p === "/api/v1/hse/risques" && req.method === "POST"){
      if (rang < 3) return erreur(res, 403, "Droit de validation requis.");
      const b = await corpsJson(req), unite = String(b.unite||"").trim(), danger = String(b.danger||"").trim();
      if (!unite || !danger) return erreur(res, 400, "Unité de travail et danger obligatoires.");
      const i = id("hr"); await B.run("INSERT INTO hse_risques(id,unite,danger,gravite,probabilite,mesures,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, unite.slice(0, 120), danger.slice(0, 200),
        Math.max(1, Math.min(4, +b.gravite||1)), Math.max(1, Math.min(4, +b.probabilite||1)), String(b.mesures||"").slice(0, 2000), maint(), C.login);
      await audit(C.login, "hse.risque", unite+" — "+danger, ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/hse/epi" && req.method === "GET"){
      const cx = await contexte(P), a = auj();
      const pm = perimSql(B, P, "mat"), w = " WHERE 1=1"+(q.filtre === "renouveler" ? " AND renouveler_le IS NOT NULL AND renouveler_le <= ?" : "")+pm.sql, aa = (q.filtre === "renouveler" ? [ajoutJours(a, 30)] : []).concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM hse_epi"+w, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, remis_le, renouveler_le FROM hse_epi"+w+" ORDER BY renouveler_le LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, lignes:l.map(r=>Object.assign(r, {nom:cx.nom(r.mat), aRenouveler:!!(r.renouveler_le && r.renouveler_le <= ajoutJours(a, 30))}))});
    }
    if (p === "/api/v1/hse/epi" && req.method === "POST"){
      if (rang < 2) return erreur(res, 403, "Droit de saisie requis.");
      const b = await corpsJson(req), mat = String(b.mat||"").trim(), type = String(b.type||"").trim();
      if (!mat || !type || !/^\d{4}-\d{2}-\d{2}$/.test(b.remisLe||"")) return erreur(res, 400, "Salarié, équipement et date de remise obligatoires.");
      if (!dans(P, mat) || !(await D.employes()).some(e=>String(e.mat) === mat)) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      const i = id("hp"); await B.run("INSERT INTO hse_epi(id,mat,type,remis_le,renouveler_le,par) VALUES(?,?,?,?,?,?)", i, mat, type.slice(0, 80), b.remisLe, /^\d{4}-\d{2}-\d{2}$/.test(b.renouvelerLe||"") ? b.renouvelerLe : null, C.login);
      return json(res, 200, {ok:true, id:i});
    }
    return erreur(res, 404, "Introuvable.");
  }
  return {traiter, aTraiter, fiche360};
}
module.exports = {ddl, tables, creer};
