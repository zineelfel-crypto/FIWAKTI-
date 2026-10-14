/* FW-Visiteurs — partie serveur. Entreprises → visiteurs → visites et interventions (uniques ou programmées par jour avec
   horaires propres), écran Loge, statuts contrôlés par le serveur, droits (droit « VIS » : 1 loge, 2 accueil,
   3 sécurité multi-sites et export, 4 paramétrage ; hôte : ses propres visiteurs), sites du périmètre, audit, export,
   absences (no-show) et purge par tâches légères. Les visiteurs ne sont jamais des salariés ; l'hôte est référencé par
   son matricule (aucune copie des données RH) ; aucune biométrie. */
"use strict";
const crypto = require("crypto");
const DDL = [
  "CREATE TABLE IF NOT EXISTS vis_entreprises (id TEXT PRIMARY KEY, nom TEXT NOT NULL, nom_norm TEXT NOT NULL, identifiant TEXT, type TEXT, contact TEXT, tel TEXT, email TEXT, adresse TEXT, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL, maj TEXT NOT NULL, dernier_usage TEXT)",
  "CREATE INDEX IF NOT EXISTS vis_entreprises_nom ON vis_entreprises(nom_norm)",
  "CREATE TABLE IF NOT EXISTS vis_visiteurs (id TEXT PRIMARY KEY, entreprise_id TEXT NOT NULL, nom TEXT NOT NULL, prenom TEXT, nom_norm TEXT NOT NULL, tel TEXT, email TEXT, type TEXT, identifiant TEXT, actif INTEGER NOT NULL DEFAULT 1, cree TEXT NOT NULL, maj TEXT NOT NULL, dernier_passage TEXT)",
  "CREATE INDEX IF NOT EXISTS vis_visiteurs_ent ON vis_visiteurs(entreprise_id, nom_norm)",
  "CREATE INDEX IF NOT EXISTS vis_visiteurs_nom ON vis_visiteurs(nom_norm)",
  "CREATE TABLE IF NOT EXISTS vis_programmations (id TEXT PRIMARY KEY, entreprise_id TEXT NOT NULL, visiteurs TEXT NOT NULL, site_id TEXT NOT NULL, zone_id TEXT, hote_mat TEXT NOT NULL, motif_id TEXT, nature TEXT NOT NULL, du TEXT NOT NULL, au TEXT NOT NULL, jours TEXT NOT NULL, statut TEXT NOT NULL, notes TEXT, cree TEXT NOT NULL, par TEXT, maj TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS vis_programmations_ent ON vis_programmations(entreprise_id, cree)",
  "CREATE TABLE IF NOT EXISTS vis_visites (id TEXT PRIMARY KEY, programmation_id TEXT, visiteur_id TEXT NOT NULL, entreprise_id TEXT NOT NULL, site_id TEXT NOT NULL, zone_id TEXT, hote_mat TEXT NOT NULL, motif_id TEXT, nature TEXT NOT NULL, d TEXT NOT NULL, debut_prevu TEXT NOT NULL, fin_prevu TEXT NOT NULL, statut TEXT NOT NULL, arrivee_le TEXT, debut_le TEXT, depart_le TEXT, notes TEXT, cree TEXT NOT NULL, par TEXT, maj TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS vis_visites_jour ON vis_visites(site_id, d, statut)",
  "CREATE INDEX IF NOT EXISTS vis_visites_hote ON vis_visites(hote_mat, d)",
  "CREATE INDEX IF NOT EXISTS vis_visites_prog ON vis_visites(programmation_id, d)",
  "CREATE INDEX IF NOT EXISTS vis_visites_visiteur ON vis_visites(visiteur_id, d)",
  "CREATE TABLE IF NOT EXISTS vis_evenements (id TEXT PRIMARY KEY, visite_id TEXT, programmation_id TEXT, de TEXT, vers TEXT, par TEXT, ts TEXT NOT NULL, detail TEXT)",
  "CREATE INDEX IF NOT EXISTS vis_evenements_visite ON vis_evenements(visite_id, ts)",
  "CREATE TABLE IF NOT EXISTS vis_motifs (id TEXT PRIMARY KEY, libelle TEXT NOT NULL, nature TEXT NOT NULL, actif INTEGER NOT NULL DEFAULT 1)",
  "CREATE TABLE IF NOT EXISTS vis_parametres (k TEXT PRIMARY KEY, v TEXT)"];
const ddl = {pg:DDL, sqlite:DDL};
const tables = {vis_entreprises:"id", vis_visiteurs:"id", vis_programmations:"id", vis_visites:"id", vis_evenements:"id", vis_motifs:"id", vis_parametres:"k"};
const STATUTS = ["ANNONCEE","ARRIVEE","EN_VISITE","PARTIE","ANNULEE","NO_SHOW"];
/* transitions autorisées (contrôlées par le serveur) */
const SUITES = {ANNONCEE:["ARRIVEE","ANNULEE","NO_SHOW"], ARRIVEE:["EN_VISITE","PARTIE","ANNULEE"], EN_VISITE:["PARTIE"], NO_SHOW:["ARRIVEE"], PARTIE:[], ANNULEE:[]};
const ACTIONS = {arrivee:"ARRIVEE", debut:"EN_VISITE", depart:"PARTIE", annuler:"ANNULEE"};
const MOTIFS_DEFAUT = [["Réunion", "visite"], ["Entretien", "visite"], ["Livraison fournisseur", "visite"], ["Audit client", "visite"], ["Travaux de maintenance", "intervention"], ["Installation", "intervention"], ["Nettoyage", "intervention"], ["Sous-traitance", "intervention"]];
const norm = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(sarl|suarl|sa|sas|sasu|ste|societe|ets|etablissements)\b\.?/g, " ").replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/, JOUR = /^\d{4}-\d{2}-\d{2}$/;
/* v56.25 : valeurs proposées (paramétrables dans le module) */
const CONSERVATIONS = [30, 60, 90, 180, 365, 730, 1095], DELAIS_NOSHOW = [10, 20, 30, 60, 120, 240, 480];
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D, audit} = o, actif = o.moduleActif || (()=>false);
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => maint().slice(0, 10);
  const lim0 = (q, def, max) => Math.min(max || 200, Math.max(1, +q.limit || def || 50));
  async function param(k, def){ const r = await B.get("SELECT v FROM vis_parametres WHERE k=?", k); return r ? JSON.parse(r.v) : def; }
  async function params(){ return {conservationJours:await param("conservationJours", 90), delaiNoShowMin:await param("delaiNoShowMin", 120), hoteProgramme:await param("hoteProgramme", true), rafraichissementSec:await param("rafraichissementSec", 45)}; }
  async function motifsInit(){ if (!await B.get("SELECT 1 FROM vis_motifs LIMIT 1")) for (const [l, n] of MOTIFS_DEFAUT) await B.run("INSERT INTO vis_motifs(id,libelle,nature,actif) VALUES(?,?,?,1)", id("vm"), l, n); }
  async function journal(visite, prog, de, vers, par, detail){ await B.run("INSERT INTO vis_evenements(id,visite_id,programmation_id,de,vers,par,ts,detail) VALUES(?,?,?,?,?,?,?,?)", id("ve"), visite, prog, de, vers, par, maint(), detail ? String(detail).slice(0, 300) : null); }
  /* contexte de l'utilisateur : rang, hôte (son matricule), sites visibles */
  async function contexte(x){
    const {C, admin, P} = x, rang = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).VIS] || 0);
    const ref = await (D.referentielLecture || D.referentiel)() || {}, emps = await D.employes(), u = (ref.users||[]).find(z=>z.login === C.login);
    /* v56.25 : seul un compte coché « Reçoit des visites » et lié à une fiche salarié est hôte */
    const moi = u && u.recoitVisites && u.actif !== false && emps.find(e=>e.id === u.empId);
    const hotesIds = new Set((ref.users||[]).filter(z=>z.recoitVisites && z.actif !== false && z.empId).map(z=>z.empId));
    let sites = null;                                                          /* null = tous les sites */
    if (!(admin || rang >= 3 || P.set === null)) sites = new Set(emps.filter(e=>P.set.has(String(e.mat))).map(e=>e.siteId).filter(Boolean));
    /* hôtes proposés : salariés liés à un compte « Reçoit des visites » ; tant qu'aucun compte n'est coché, tous les
       salariés actifs (mise en service progressive) */
    const estHote = e => !hotesIds.size || hotesIds.has(e.id);
    return {rang, hote:moi ? String(moi.mat) : null, sites, ref, emps, estHote, hotesCoches:hotesIds.size};
  }
  const siteOk = (cx, s) => cx.sites === null || cx.sites.has(s);
  const sitesSql = (cx, col) => cx.sites === null ? {sql:"", a:[]} : {sql:" AND "+col+" IN ("+(Array.from(cx.sites).map(()=>"?").join(",") || "''")+")", a:Array.from(cx.sites)};
  /* informations de l'hôte limitées à l'accueil : nom, matricule, service, fonction, téléphone interne */
  function hoteInfos(cx, mat){ const e = cx.emps.find(z=>String(z.mat) === String(mat)); if (!e) return {mat, nom:mat};
    const dep = (cx.ref.depts||[]).find(d=>d.id === e.deptId); return {mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), service:dep ? dep.nom : "", poste:e.poste || "", tel:e.tel || ""}; }
  function valideJours(j){
    const out = {}; for (const k of Object.keys(j||{})){ const n = Number(k), v = j[k];
      if (!(n >= 0 && n <= 6) || !v || !HEURE.test(v.debut||"") || !HEURE.test(v.fin||"") || v.fin <= v.debut) throw Object.assign(new Error("Horaires invalides pour le jour "+k+" (début et fin au format HH:MM, fin après début)."), {code:400});
      out[n] = {debut:v.debut, fin:v.fin}; }
    if (!Object.keys(out).length) throw Object.assign(new Error("Choisissez au moins un jour avec ses horaires."), {code:400});
    return out;
  }
  async function valideCommun(cx, b){
    if (!b.site || !siteOk(cx, b.site) || !(cx.ref.sites||[]).some(s=>s.id === b.site)) throw Object.assign(new Error("Site obligatoire et dans votre périmètre."), {code:400});
    if (actif("FW-Acces") && !b.zone) throw Object.assign(new Error("Zone obligatoire (contrôle d'accès actif)."), {code:400});
    if (b.zone && !(cx.ref.zones||[]).some(z=>z.id === b.zone)) throw Object.assign(new Error("Zone inconnue."), {code:400});
    const h = cx.emps.find(e=>String(e.mat) === String(b.hote||"") && !(e.sortie && e.sortie < auj()));
    if (!h) throw Object.assign(new Error("Hôte salarié obligatoire (salarié actif)."), {code:400});
    if (!cx.estHote(h)) throw Object.assign(new Error("Ce salarié ne reçoit pas de visites (case « Reçoit des visites » de son compte)."), {code:400});
    if (!b.motif || !await B.get("SELECT 1 FROM vis_motifs WHERE id=? AND actif=1", b.motif)) throw Object.assign(new Error("Motif obligatoire."), {code:400});
    if (cx.rang < 2 && !(cx.hote && String(b.hote) === cx.hote && (await params()).hoteProgramme)) throw Object.assign(new Error("Droit d'accueil requis (ou programmation par l'hôte de ses propres visites)."), {code:403});
    const vis = Array.from(new Set((b.visiteurs||[]).map(String))).slice(0, 50);
    if (!vis.length) throw Object.assign(new Error("Choisissez au moins un visiteur."), {code:400});
    const rows = await B.all("SELECT id, entreprise_id FROM vis_visiteurs WHERE actif=1 AND id IN ("+vis.map(()=>"?").join(",")+")", ...vis);
    if (rows.length !== vis.length) throw Object.assign(new Error("Visiteur inconnu ou inactif."), {code:400});
    return {vis:rows, nature:b.nature === "intervention" ? "intervention" : "visite"};
  }
  /* génération des occurrences d'une programmation (à partir d'une date) */
  async function generer(p, depuis, par){
    const jours = JSON.parse(p.jours), vis = JSON.parse(p.visiteurs), rows = await B.all("SELECT id, entreprise_id FROM vis_visiteurs WHERE id IN ("+vis.map(()=>"?").join(",")+")", ...vis);
    let n = 0;
    for (let d = depuis > p.du ? depuis : p.du; d <= p.au; d = ajoutJours(d, 1)){
      const h = jours[new Date(d+"T00:00:00Z").getUTCDay()]; if (!h) continue;
      for (const v of rows){ await B.run("INSERT INTO vis_visites(id,programmation_id,visiteur_id,entreprise_id,site_id,zone_id,hote_mat,motif_id,nature,d,debut_prevu,fin_prevu,statut,notes,cree,par,maj) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id("vv"), p.id, v.id, v.entreprise_id, p.site_id, p.zone_id, p.hote_mat, p.motif_id, p.nature, d, h.debut, h.fin, "ANNONCEE", p.notes, maint(), par, maint()); n++; }
    }
    return n;
  }
  async function aTraiter(x){
    const cx = await contexte({C:x.C || {login:""}, admin:x.admin, P:x.P}).catch(()=>null); if (!cx) return [];
    const a = auj(), out = [];
    if (cx.rang >= 1){ const s = sitesSql(cx, "site_id"), n = Number((await B.get("SELECT COUNT(*) n FROM vis_visites WHERE d=? AND statut='ANNONCEE'"+s.sql, a, ...s.a)).n);
      if (n) out.push({domaine:"acces", cle:"visiteurs-attendus", nombre:n, urgence:0, vue:"visiteurs"}); }
    else if (cx.hote){ const n = Number((await B.get("SELECT COUNT(*) n FROM vis_visites WHERE d=? AND hote_mat=? AND statut IN ('ANNONCEE','ARRIVEE')", a, cx.hote)).n);
      if (n) out.push({domaine:"acces", cle:"visiteurs-mes-visites", nombre:n, urgence:0, vue:"visiteurs"}); }
    return out;
  }
  async function traiter(req, res, x){
    const {p, C, u, json, erreur, corpsJson, ip} = x, cx = await contexte(x), q = Object.fromEntries(u.searchParams.entries());
    const off = Math.max(0, +q.offset||0);
    if (cx.rang < 1 && !cx.hote) return erreur(res, 403, "Accès aux visiteurs non autorisé.");
    const err = e => erreur(res, e.code || 400, e.message);
    /* ---- paramètres et listes de référence ---- */
    if (p === "/api/v1/visiteurs/parametres" && req.method === "GET"){
      await motifsInit();
      return json(res, 200, Object.assign(await params(), {rang:cx.rang, hote:cx.hote, accesActif:actif("FW-Acces"), conservations:CONSERVATIONS, delaisNoShow:DELAIS_NOSHOW, hotesCoches:cx.hotesCoches,
        motifsTous:cx.rang >= 4 ? await B.all("SELECT id, libelle, nature, actif FROM vis_motifs ORDER BY actif DESC, nature, libelle") : undefined,
        sites:(cx.ref.sites||[]).filter(s=>siteOk(cx, s.id)).map(s=>({id:s.id, nom:s.nom})), zones:actif("FW-Acces") ? (cx.ref.zones||[]).map(z=>({id:z.id, nom:z.nom, siteId:z.siteId||null})) : [],
        motifs:await B.all("SELECT id, libelle, nature FROM vis_motifs WHERE actif=1 ORDER BY nature, libelle")}));
    }
    if (p === "/api/v1/visiteurs/parametres" && req.method === "POST"){
      if (cx.rang < 4) return erreur(res, 403, "Paramétrage réservé.");
      const b = await corpsJson(req), w = (k, v) => B.run("INSERT INTO vis_parametres(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, JSON.stringify(v));
      if (b.conservationJours !== undefined){ const n = Math.round(+b.conservationJours); if (CONSERVATIONS.indexOf(n) < 0) return erreur(res, 400, "Conservation : "+CONSERVATIONS.join(", ")+" jours."); await w("conservationJours", n); }
      if (b.delaiNoShowMin !== undefined){ const n = Math.round(+b.delaiNoShowMin); if (DELAIS_NOSHOW.indexOf(n) < 0) return erreur(res, 400, "Délai de non-présentation : "+DELAIS_NOSHOW.join(", ")+" minutes."); await w("delaiNoShowMin", n); }
      if (b.hoteProgramme !== undefined) await w("hoteProgramme", !!b.hoteProgramme);
      if (b.motif && String(b.motif.libelle||"").trim()) await B.run("INSERT INTO vis_motifs(id,libelle,nature,actif) VALUES(?,?,?,1)", id("vm"), String(b.motif.libelle).trim().slice(0, 80), b.motif.nature === "intervention" ? "intervention" : "visite");
      await audit(C.login, "visiteurs.parametres", JSON.stringify(b).slice(0, 200), ip); return json(res, 200, await params());
    }
    /* ---- v56.25 : motifs paramétrables (libellé, nature, actif) ; un motif utilisé est désactivé, jamais supprimé ---- */
    const mm = /^\/api\/v1\/visiteurs\/motifs\/([^/]+)$/.exec(p);
    if (mm && req.method === "POST"){
      if (cx.rang < 4) return erreur(res, 403, "Paramétrage réservé.");
      const m = await B.get("SELECT * FROM vis_motifs WHERE id=?", mm[1]); if (!m) return erreur(res, 404, "Motif introuvable.");
      const b = await corpsJson(req), lib = b.libelle !== undefined ? String(b.libelle).trim().slice(0, 80) : m.libelle;
      if (!lib) return erreur(res, 400, "Libellé obligatoire.");
      if (b.supprimer){ const util = await B.get("SELECT 1 FROM vis_visites WHERE motif_id=? LIMIT 1", m.id) || await B.get("SELECT 1 FROM vis_programmations WHERE motif_id=? LIMIT 1", m.id);
        if (util) await B.run("UPDATE vis_motifs SET actif=0 WHERE id=?", m.id); else await B.run("DELETE FROM vis_motifs WHERE id=?", m.id);
        await audit(C.login, "visiteurs.motif.retire", m.libelle, ip); return json(res, 200, {ok:true, desactive:!!util}); }
      await B.run("UPDATE vis_motifs SET libelle=?, nature=?, actif=? WHERE id=?", lib, b.nature === "intervention" ? "intervention" : b.nature === "visite" ? "visite" : m.nature, b.actif === undefined ? m.actif : (b.actif ? 1 : 0), m.id);
      await audit(C.login, "visiteurs.motif", lib, ip); return json(res, 200, {ok:true});
    }
    /* ---- recherche intelligente ---- */
    if (p === "/api/v1/visiteurs/entreprises" && req.method === "GET"){
      const s = norm(q.q); if (s.length < 1) return json(res, 200, {lignes:await B.all("SELECT id, nom, type FROM vis_entreprises WHERE actif=1 ORDER BY COALESCE(dernier_usage, cree) DESC LIMIT 8")});
      return json(res, 200, {lignes:await B.all("SELECT id, nom, type, (SELECT COUNT(*) FROM vis_visiteurs v WHERE v.entreprise_id=e.id AND v.actif=1) visiteurs FROM vis_entreprises e WHERE actif=1 AND (nom_norm LIKE ? OR nom_norm LIKE ?) ORDER BY CASE WHEN nom_norm LIKE ? THEN 0 ELSE 1 END, COALESCE(dernier_usage, cree) DESC LIMIT 10", s+"%", "% "+s+"%", s+"%")});
    }
    if (p === "/api/v1/visiteurs/entreprises" && req.method === "POST"){
      if (cx.rang < 2 && !cx.hote) return erreur(res, 403, "Droit d'accueil requis.");
      const b = await corpsJson(req), nom = String(b.nom||"").trim().slice(0, 120), n = norm(nom);
      if (!n) return erreur(res, 400, "Nom de la société obligatoire.");
      const ex = await B.get("SELECT id, nom FROM vis_entreprises WHERE nom_norm=?", n);
      if (ex) return json(res, 409, {erreur:"Cette société existe déjà.", message:"Cette société existe déjà : « "+ex.nom+" ».", existant:ex});
      const i = id("ve"); await B.run("INSERT INTO vis_entreprises(id,nom,nom_norm,identifiant,type,contact,tel,email,adresse,actif,cree,maj) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)", i, nom, n,
        String(b.identifiant||"").slice(0, 40) || null, String(b.type||"").slice(0, 40) || null, String(b.contact||"").slice(0, 80) || null, String(b.tel||"").slice(0, 30) || null, String(b.email||"").slice(0, 80) || null, String(b.adresse||"").slice(0, 200) || null, maint(), maint());
      await audit(C.login, "visiteurs.entreprise", nom, ip); return json(res, 200, {ok:true, id:i, nom});
    }
    if (p === "/api/v1/visiteurs/visiteurs" && req.method === "GET"){
      const s = norm(q.q), w = ["v.actif=1"], a = [];
      if (q.entreprise){ w.push("v.entreprise_id=?"); a.push(q.entreprise); }
      if (s){ w.push("(v.nom_norm LIKE ? OR v.nom_norm LIKE ? OR v.identifiant=?)"); a.push(s+"%", "% "+s+"%", String(q.q).trim()); }
      if (!q.entreprise && !s) return json(res, 200, {lignes:[]});
      return json(res, 200, {lignes:await B.all("SELECT v.id, v.nom, v.prenom, v.tel, v.email, v.type, v.entreprise_id, e.nom entreprise, v.dernier_passage FROM vis_visiteurs v JOIN vis_entreprises e ON e.id=v.entreprise_id WHERE "+w.join(" AND ")+" ORDER BY COALESCE(v.dernier_passage, v.cree) DESC LIMIT 50", ...a)});
    }
    if (p === "/api/v1/visiteurs/visiteurs" && req.method === "POST"){
      if (cx.rang < 2 && !cx.hote) return erreur(res, 403, "Droit d'accueil requis.");
      const b = await corpsJson(req), nom = String(b.nom||"").trim().slice(0, 80), prenom = String(b.prenom||"").trim().slice(0, 80);
      if (!nom || !prenom) return erreur(res, 400, "Nom et prénom obligatoires.");
      if (!b.entreprise || !await B.get("SELECT 1 FROM vis_entreprises WHERE id=? AND actif=1", b.entreprise)) return erreur(res, 400, "Société obligatoire.");
      const n = norm(nom+" "+prenom), ex = await B.get("SELECT id, nom, prenom FROM vis_visiteurs WHERE entreprise_id=? AND nom_norm=?", b.entreprise, n);
      if (ex) return json(res, 409, {erreur:"Ce visiteur existe déjà.", message:"Ce visiteur existe déjà pour cette société : "+ex.nom+" "+ex.prenom+".", existant:ex});
      const i = id("vp"); await B.run("INSERT INTO vis_visiteurs(id,entreprise_id,nom,prenom,nom_norm,tel,email,type,identifiant,actif,cree,maj) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)", i, b.entreprise, nom, prenom, n,
        String(b.tel||"").slice(0, 30) || null, String(b.email||"").slice(0, 80) || null, String(b.type||"").slice(0, 40) || null, String(b.identifiant||"").slice(0, 40) || null, maint(), maint());
      await audit(C.login, "visiteurs.visiteur", nom+" "+prenom, ip); return json(res, 200, {ok:true, id:i});
    }
    if (p === "/api/v1/visiteurs/hotes" && req.method === "GET"){
      const s = norm(q.q); if (!s) return json(res, 200, {lignes:[]});
      const l = cx.emps.filter(e=>!(e.sortie && e.sortie < auj()) && siteOk(cx, e.siteId) && cx.estHote(e) && (String(e.mat) === String(q.q).trim() || norm((e.nom||"")+" "+(e.prenom||"")).indexOf(s) >= 0 || norm((e.prenom||"")+" "+(e.nom||"")).indexOf(s) >= 0)).slice(0, 12);
      return json(res, 200, {lignes:l.map(e=>hoteInfos(cx, e.mat))});
    }
    /* ---- création : visite unique (éventuellement arrivée immédiate) ---- */
    if (p === "/api/v1/visiteurs/visites" && req.method === "POST"){
      try {
        const b = await corpsJson(req), v = await valideCommun(cx, b);
        if (!JOUR.test(b.d||"") || !HEURE.test(b.debut||"") || !HEURE.test(b.fin||"") || b.fin <= b.debut) return erreur(res, 400, "Date, heure de début et heure de fin obligatoires (fin après début).");
        if (b.d < auj()) return erreur(res, 400, "La date ne peut pas être passée.");
        const immediate = !!b.arriveeImmediate && b.d === auj() && cx.rang >= 1, ids = [];
        await B.transaction(async ()=>{ for (const r of v.vis){ const i = id("vv"); ids.push(i);
          await B.run("INSERT INTO vis_visites(id,programmation_id,visiteur_id,entreprise_id,site_id,zone_id,hote_mat,motif_id,nature,d,debut_prevu,fin_prevu,statut,arrivee_le,notes,cree,par,maj) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            i, null, r.id, r.entreprise_id, b.site, b.zone || null, String(b.hote), b.motif, v.nature, b.d, b.debut, b.fin, immediate ? "ARRIVEE" : "ANNONCEE", immediate ? maint() : null, String(b.notes||"").slice(0, 500) || null, maint(), C.login, maint());
          await journal(i, null, null, immediate ? "ARRIVEE" : "ANNONCEE", C.login, immediate ? "arrivée enregistrée à l'accueil" : "visite annoncée");
          await B.run("UPDATE vis_entreprises SET dernier_usage=? WHERE id=?", maint(), r.entreprise_id); } });
        await audit(C.login, "visiteurs.visite", ids.length+" visiteur(s) le "+b.d, ip); return json(res, 200, {ok:true, ids});
      } catch(e){ return err(e); }
    }
    /* ---- programmation d'une série (jours et horaires propres à chaque jour) ---- */
    if (p === "/api/v1/visiteurs/programmations" && req.method === "POST"){
      try {
        const b = await corpsJson(req), v = await valideCommun(cx, b), jours = valideJours(b.jours);
        if (!JOUR.test(b.du||"") || !JOUR.test(b.au||"") || b.au < b.du) return erreur(res, 400, "Période obligatoire (du ≤ au).");
        if (b.au < auj()) return erreur(res, 400, "La période est entièrement passée.");
        if ((new Date(b.au) - new Date(b.du)) / 86400000 > 366) return erreur(res, 400, "Période limitée à un an.");
        const ent = v.vis[0].entreprise_id; if (v.vis.some(r=>r.entreprise_id !== ent)) return erreur(res, 400, "Les visiteurs d'une programmation appartiennent à la même société.");
        const pid = id("vg"); let n = 0;
        await B.transaction(async ()=>{
          await B.run("INSERT INTO vis_programmations(id,entreprise_id,visiteurs,site_id,zone_id,hote_mat,motif_id,nature,du,au,jours,statut,notes,cree,par,maj) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            pid, ent, JSON.stringify(v.vis.map(r=>r.id)), b.site, b.zone || null, String(b.hote), b.motif, v.nature, b.du, b.au, JSON.stringify(jours), "active", String(b.notes||"").slice(0, 500) || null, maint(), C.login, maint());
          const pr = await B.get("SELECT * FROM vis_programmations WHERE id=?", pid);
          n = await generer(pr, auj(), C.login);
          if (n > 5000) throw Object.assign(new Error("Programmation trop volumineuse ("+n+" visites) : réduisez la période ou le nombre de visiteurs."), {code:400});
          await journal(null, pid, null, "active", C.login, n+" visite(s) générée(s)");
          await B.run("UPDATE vis_entreprises SET dernier_usage=? WHERE id=?", maint(), ent);
        });
        await audit(C.login, "visiteurs.programmation", pid+" : "+n+" visite(s) du "+b.du+" au "+b.au, ip); return json(res, 200, {ok:true, id:pid, visites:n});
      } catch(e){ return err(e); }
    }
    if (p === "/api/v1/visiteurs/programmations" && req.method === "GET"){
      const s = sitesSql(cx, "p.site_id"), w = " WHERE 1=1"+s.sql+(cx.rang < 1 ? " AND p.hote_mat=?" : "")+(q.statut ? " AND p.statut=?" : "")+(q.entreprise ? " AND p.entreprise_id=?" : "");
      const a = s.a.concat(cx.rang < 1 ? [cx.hote] : []).concat(q.statut ? [q.statut] : []).concat(q.entreprise ? [q.entreprise] : []), lim = lim0(q, 50);
      const total = Number((await B.get("SELECT COUNT(*) n FROM vis_programmations p"+w, ...a)).n);
      const l = await B.all("SELECT p.id, p.entreprise_id, e.nom entreprise, p.visiteurs, p.site_id, p.zone_id, p.hote_mat, p.motif_id, m.libelle motif, p.nature, p.du, p.au, p.jours, p.statut, p.notes FROM vis_programmations p JOIN vis_entreprises e ON e.id=p.entreprise_id LEFT JOIN vis_motifs m ON m.id=p.motif_id"+w+" ORDER BY p.cree DESC LIMIT "+lim+" OFFSET "+off, ...a);
      const vids = Array.from(new Set(l.flatMap(r=>JSON.parse(r.visiteurs)))), noms = new Map();
      if (vids.length) (await B.all("SELECT id, nom, prenom FROM vis_visiteurs WHERE id IN ("+vids.map(()=>"?").join(",")+")", ...vids)).forEach(v=>noms.set(v.id, v.nom+" "+(v.prenom||"")));
      return json(res, 200, {total, lignes:l.map(r=>Object.assign(r, {jours:JSON.parse(r.jours), visiteurs:JSON.parse(r.visiteurs).map(v=>({id:v, nom:noms.get(v) || "—"})), hote:hoteInfos(cx, r.hote_mat)}))});
    }
    if (p === "/api/v1/visiteurs/derniere-programmation" && req.method === "GET"){
      const s = sitesSql(cx, "site_id"), r = await B.get("SELECT entreprise_id, visiteurs, site_id, zone_id, hote_mat, motif_id, nature, jours, notes FROM vis_programmations WHERE entreprise_id=?"+s.sql+" ORDER BY cree DESC LIMIT 1", String(q.entreprise||""), ...s.a);
      return json(res, 200, {programmation:r ? Object.assign(r, {visiteurs:JSON.parse(r.visiteurs), jours:JSON.parse(r.jours), hote:hoteInfos(cx, r.hote_mat)}) : null});
    }
    const mp = /^\/api\/v1\/visiteurs\/programmations\/([^/]+)(?:\/(suspendre|reprendre|annuler))?$/.exec(p);
    if (mp && req.method === "POST"){
      const pr = await B.get("SELECT * FROM vis_programmations WHERE id=?", mp[1]);
      if (!pr || !siteOk(cx, pr.site_id) || (cx.rang < 2 && pr.hote_mat !== cx.hote)) return erreur(res, 404, "Programmation introuvable.");
      if (cx.rang < 2 && !(await params()).hoteProgramme) return erreur(res, 403, "Droit d'accueil requis.");
      if (pr.statut === "annulee") return erreur(res, 409, "Programmation annulée.");
      const a = auj(), act = mp[2];
      try {
        let n = 0;
        await B.transaction(async ()=>{
          if (act === "annuler"){ const l = await B.all("SELECT id FROM vis_visites WHERE programmation_id=? AND d>=? AND statut='ANNONCEE'", pr.id, a);
            for (const v of l){ await B.run("UPDATE vis_visites SET statut='ANNULEE', maj=? WHERE id=?", maint(), v.id); await journal(v.id, pr.id, "ANNONCEE", "ANNULEE", C.login, "programmation annulée"); }
            await B.run("UPDATE vis_programmations SET statut='annulee', maj=? WHERE id=?", maint(), pr.id); n = l.length; }
          else if (act === "suspendre"){ if (pr.statut !== "active") throw Object.assign(new Error("Programmation non active."), {code:409});
            n = (await B.run("DELETE FROM vis_visites WHERE programmation_id=? AND d>=? AND statut='ANNONCEE'", pr.id, a)).n || 0;
            await B.run("UPDATE vis_programmations SET statut='suspendue', maj=? WHERE id=?", maint(), pr.id); }
          else if (act === "reprendre"){ if (pr.statut !== "suspendue") throw Object.assign(new Error("Programmation non suspendue."), {code:409});
            await B.run("UPDATE vis_programmations SET statut='active', maj=? WHERE id=?", maint(), pr.id); n = await generer(Object.assign({}, pr, {statut:"active"}), a, C.login); }
          else {
            /* modification : seules les visites futures encore annoncées sont régénérées ; l'historique est conservé */
            const b = await corpsJson(req), nv = Object.assign({}, pr);
            if (b.jours) nv.jours = JSON.stringify(valideJours(b.jours));
            if (b.au){ if (!JOUR.test(b.au) || b.au < pr.du) throw Object.assign(new Error("Date de fin invalide."), {code:400}); nv.au = b.au; }
            /* 56.33.11 : mêmes plafonds qu'à la création (un an, 5 000 visites), sinon une modification les contournait */
            if ((new Date(nv.au) - new Date(pr.du)) / 86400000 > 366) throw Object.assign(new Error("Période limitée à un an."), {code:400});
            if (b.visiteurs){ const vv = Array.from(new Set(b.visiteurs.map(String))).slice(0, 50); const rows = vv.length ? await B.all("SELECT id FROM vis_visiteurs WHERE actif=1 AND entreprise_id=? AND id IN ("+vv.map(()=>"?").join(",")+")", pr.entreprise_id, ...vv) : [];
              if (!rows.length || rows.length !== vv.length) throw Object.assign(new Error("Visiteurs invalides."), {code:400}); nv.visiteurs = JSON.stringify(vv); }
            if (b.notes !== undefined) nv.notes = String(b.notes||"").slice(0, 500) || null;
            if (b.zone !== undefined && b.zone && !(cx.ref.zones||[]).some(z=>z.id === b.zone)) throw Object.assign(new Error("Zone inconnue."), {code:400});
            if (b.zone !== undefined) nv.zone_id = b.zone || null;
            await B.run("UPDATE vis_programmations SET jours=?, au=?, visiteurs=?, notes=?, zone_id=?, maj=? WHERE id=?", nv.jours, nv.au, nv.visiteurs, nv.notes, nv.zone_id, maint(), pr.id);
            await B.run("DELETE FROM vis_visites WHERE programmation_id=? AND d>=? AND statut='ANNONCEE'", pr.id, a);
            n = pr.statut === "active" ? await generer(nv, a, C.login) : 0;
            if (n > 5000) throw Object.assign(new Error("Programmation trop volumineuse ("+n+" visites) : réduisez la période ou le nombre de visiteurs."), {code:400}); }
          await journal(null, pr.id, pr.statut, act || "modifiee", C.login, n+" visite(s) concernée(s)");
        });
        await audit(C.login, "visiteurs.programmation."+(act || "modification"), pr.id+" : "+n, ip); return json(res, 200, {ok:true, visites:n});
      } catch(e){ return err(e); }
    }
    /* ---- écran Loge (aujourd'hui par défaut) ---- */
    if ((p === "/api/v1/visiteurs/loge" || p === "/api/v1/visiteurs/historique") && req.method === "GET"){
      const loge = p.endsWith("/loge"), d = JOUR.test(q.d||"") ? q.d : auj(), s = sitesSql(cx, "v.site_id"), w = [], a = [];
      if (loge){ w.push("v.d=?"); a.push(d); } else { if (cx.rang < 2 && !cx.hote) return erreur(res, 403, "Droit d'accueil requis.");
        const du = JOUR.test(q.du||"") ? q.du : ajoutJours(auj(), -30), au = JOUR.test(q.au||"") ? q.au : auj(); w.push("v.d>=? AND v.d<=?"); a.push(du, au); }
      if (cx.rang < 1){ w.push("v.hote_mat=?"); a.push(cx.hote); }
      if (q.site){ if (!siteOk(cx, q.site)) return erreur(res, 403, "Site hors périmètre."); w.push("v.site_id=?"); a.push(q.site); }
      const hm = new Date().toISOString().slice(11, 16), f = q.filtre || "tous";
      if (f === "attendus"){ w.push("v.statut='ANNONCEE'"); } else if (f === "retard"){ w.push("v.statut='ANNONCEE' AND v.debut_prevu < ?"); a.push(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 16)); }
      else if (f === "presents") w.push("v.statut IN ('ARRIVEE','EN_VISITE')"); else if (f === "partis") w.push("v.statut='PARTIE'"); else if (f === "annules") w.push("v.statut='ANNULEE'");
      else if (f === "noshow") w.push("v.statut='NO_SHOW'"); else if (f === "interventions") w.push("v.nature='intervention'");
      if (q.q){ const n = norm(q.q); w.push("(e.nom_norm LIKE ? OR p.nom_norm LIKE ?)"); a.push("%"+n+"%", "%"+n+"%"); }
      void hm;
      const where = " WHERE "+w.join(" AND ")+s.sql, aa = a.concat(s.a), lim = lim0(q, loge ? 200 : 50, loge ? 500 : 200);
      const total = Number((await B.get("SELECT COUNT(*) n FROM vis_visites v JOIN vis_entreprises e ON e.id=v.entreprise_id JOIN vis_visiteurs p ON p.id=v.visiteur_id"+where, ...aa)).n);
      const l = await B.all("SELECT v.id, v.d, v.debut_prevu, v.fin_prevu, v.statut, v.nature, v.site_id, v.zone_id, v.hote_mat, v.arrivee_le, v.debut_le, v.depart_le, v.notes, v.programmation_id, p.nom, p.prenom, e.nom entreprise, m.libelle motif FROM vis_visites v JOIN vis_entreprises e ON e.id=v.entreprise_id JOIN vis_visiteurs p ON p.id=v.visiteur_id LEFT JOIN vis_motifs m ON m.id=v.motif_id"+where+" ORDER BY v.d"+(loge ? "" : " DESC")+", v.debut_prevu, e.nom LIMIT "+lim+" OFFSET "+off, ...aa);
      const comptes = {}; if (loge) (await B.all("SELECT v.statut, COUNT(*) n FROM vis_visites v WHERE v.d=?"+(cx.rang < 1 ? " AND v.hote_mat=?" : "")+s.sql+" GROUP BY v.statut", d, ...(cx.rang < 1 ? [cx.hote] : []), ...s.a)).forEach(r=>{ comptes[r.statut] = Number(r.n); });
      const zones = new Map((cx.ref.zones||[]).map(z=>[z.id, z.nom])), sites = new Map((cx.ref.sites||[]).map(z=>[z.id, z.nom]));
      return json(res, 200, {d, total, comptes, lignes:l.map(r=>Object.assign(r, {hote:hoteInfos(cx, r.hote_mat), zone:zones.get(r.zone_id) || "", site:sites.get(r.site_id) || "", suites:SUITES[r.statut] || []}))});
    }
    /* ---- changements de statut (horodatés par le serveur, transitions contrôlées) ---- */
    const ma = /^\/api\/v1\/visiteurs\/visites\/([^/]+)\/(arrivee|debut|depart|annuler)$/.exec(p);
    if (ma && req.method === "POST"){
      const v = await B.get("SELECT * FROM vis_visites WHERE id=?", ma[1]);
      if (!v || !siteOk(cx, v.site_id) || (cx.rang < 1 && v.hote_mat !== cx.hote)) return erreur(res, 404, "Visite introuvable.");
      const vers = ACTIONS[ma[2]];
      if (ma[2] === "annuler" ? (cx.rang < 2 && v.hote_mat !== cx.hote) : cx.rang < 1) return erreur(res, 403, "Action non autorisée.");
      if ((SUITES[v.statut] || []).indexOf(vers) < 0) return erreur(res, 409, "Transition impossible : "+v.statut+" → "+vers+".");
      const champ = {ARRIVEE:"arrivee_le", EN_VISITE:"debut_le", PARTIE:"depart_le"}[vers], t = maint();
      await B.run("UPDATE vis_visites SET statut=?, maj=?"+(champ ? ", "+champ+"=?" : "")+(vers === "PARTIE" && !v.arrivee_le ? ", arrivee_le=?" : "")+" WHERE id=? AND statut=?", ...[vers, t].concat(champ ? [t] : []).concat(vers === "PARTIE" && !v.arrivee_le ? [t] : []), v.id, v.statut);
      if (vers === "ARRIVEE") await B.run("UPDATE vis_visiteurs SET dernier_passage=? WHERE id=?", t, v.visiteur_id);
      await journal(v.id, v.programmation_id, v.statut, vers, C.login, null);
      await audit(C.login, "visiteurs."+ma[2], v.id, ip); return json(res, 200, {ok:true, statut:vers, le:t});
    }
    const mv = /^\/api\/v1\/visiteurs\/visites\/([^/]+)$/.exec(p);
    if (mv && req.method === "GET"){
      const v = await B.get("SELECT v.*, p.nom, p.prenom, p.tel, e.nom entreprise FROM vis_visites v JOIN vis_visiteurs p ON p.id=v.visiteur_id JOIN vis_entreprises e ON e.id=v.entreprise_id WHERE v.id=?", mv[1]);
      if (!v || !siteOk(cx, v.site_id) || (cx.rang < 1 && v.hote_mat !== cx.hote)) return erreur(res, 404, "Visite introuvable.");
      return json(res, 200, {visite:Object.assign(v, {hote:hoteInfos(cx, v.hote_mat)}), evenements:await B.all("SELECT de, vers, par, ts, detail FROM vis_evenements WHERE visite_id=? ORDER BY ts", v.id)});
    }
    /* ---- export (sécurité, tracé) ---- */
    if (p === "/api/v1/visiteurs/export" && req.method === "GET"){
      if (cx.rang < 3) return erreur(res, 403, "Export réservé à la sécurité et au paramétrage.");
      const du = JOUR.test(q.du||"") ? q.du : ajoutJours(auj(), -30), au = JOUR.test(q.au||"") ? q.au : auj(), s = sitesSql(cx, "v.site_id");
      const w = " WHERE v.d>=? AND v.d<=?"+(q.site ? " AND v.site_id=?" : "")+s.sql, a = [du, au].concat(q.site ? [q.site] : []).concat(s.a);
      const l = await B.all("SELECT v.d, v.debut_prevu, v.fin_prevu, v.statut, v.nature, v.site_id, v.hote_mat, v.arrivee_le, v.depart_le, p.nom, p.prenom, e.nom entreprise, m.libelle motif FROM vis_visites v JOIN vis_entreprises e ON e.id=v.entreprise_id JOIN vis_visiteurs p ON p.id=v.visiteur_id LEFT JOIN vis_motifs m ON m.id=v.motif_id"+w+" ORDER BY v.d, v.debut_prevu LIMIT 50000", ...a);
      await audit(C.login, "visiteurs.export", l.length+" visite(s) du "+du+" au "+au, ip);
      const sites = new Map((cx.ref.sites||[]).map(z=>[z.id, z.nom])), c = x => { /* 56.33.11 : cellule neutralisée (=, +, -, @ en tête deviennent du texte : pas de formule exécutée par le tableur) */ let s = String(x == null ? "" : x); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; };
      const csv = ["Date;Début prévu;Fin prévue;Visiteur;Société;Motif;Nature;Site;Hôte (matricule);Hôte;Arrivée;Départ;Statut"].concat(l.map(r=>{ const h = hoteInfos(cx, r.hote_mat);
        return [r.d, r.debut_prevu, r.fin_prevu, r.nom+" "+(r.prenom||""), r.entreprise, r.motif, r.nature, sites.get(r.site_id) || "", r.hote_mat, h.nom, r.arrivee_le || "", r.depart_le || "", r.statut].map(c).join(";"); })).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-visiteurs-"+du+"-"+au+".csv\"", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}); return res.end("\ufeff"+csv);
    }
    return erreur(res, 404, "Introuvable.");
  }
  /* ---- tâches légères : absences (no-show), puis purge de l'historique ---- */
  async function noShow(){
    const pr = await params(), maintenant = new Date(), loc = new Date(maintenant.getTime() - maintenant.getTimezoneOffset() * 60000), a = loc.toISOString().slice(0, 10);
    const lim = new Date(loc.getTime() - pr.delaiNoShowMin * 60000).toISOString().slice(11, 16);
    const l = await B.all("SELECT id, programmation_id FROM vis_visites WHERE statut='ANNONCEE' AND (d < ? OR (d = ? AND debut_prevu < ?)) LIMIT 2000", a, a, lim);
    for (const v of l){ await B.run("UPDATE vis_visites SET statut='NO_SHOW', maj=? WHERE id=? AND statut='ANNONCEE'", maint(), v.id); await journal(v.id, v.programmation_id, "ANNONCEE", "NO_SHOW", "systeme", "non présenté après "+pr.delaiNoShowMin+" min"); }
    /* départ non enregistré la veille : clôture technique (présence de la veille terminée) */
    return l.length;
  }
  async function purger(){
    const pr = await params(), lim = ajoutJours(auj(), -pr.conservationJours);
    const v = await B.all("SELECT id FROM vis_visites WHERE d < ? AND statut <> 'ANNONCEE' LIMIT 5000", lim);
    for (let i = 0; i < v.length; i += 200){ const l = v.slice(i, i+200).map(x=>x.id), ph = l.map(()=>"?").join(",");
      await B.run("DELETE FROM vis_evenements WHERE visite_id IN ("+ph+")", ...l); await B.run("DELETE FROM vis_visites WHERE id IN ("+ph+")", ...l); }
    /* programmations terminées depuis la conservation (jamais les futures ni les en cours) */
    const p = await B.run("DELETE FROM vis_programmations WHERE au < ? AND NOT EXISTS (SELECT 1 FROM vis_visites x WHERE x.programmation_id=vis_programmations.id)", lim);
    /* visiteurs sans passage ni visite depuis la conservation : anonymisés (minimisation) */
    const anon = await B.run("UPDATE vis_visiteurs SET nom='—', prenom=NULL, nom_norm='anonymise '||id, tel=NULL, email=NULL, identifiant=NULL, actif=0, maj=? WHERE actif=1 AND COALESCE(dernier_passage, cree) < ? AND NOT EXISTS (SELECT 1 FROM vis_visites x WHERE x.visiteur_id=vis_visiteurs.id)", maint(), lim);
    const r = {visites:v.length, programmations:p.n || 0, visiteursAnonymises:anon.n || 0};
    if (r.visites || r.programmations || r.visiteursAnonymises) await audit("systeme", "visiteurs.purge", JSON.stringify(r));
    return r;
  }
  if (o.planifier){
    o.planifier("absences", {intervalle:15*60000, premier:120000, priorite:3, delai:120000, fn:async ()=>(await noShow())+" visite(s) non présentée(s)"});
    o.planifier("purge", {intervalle:24*3600000, premier:300000, priorite:3, delai:10*60000, fn:async ()=>JSON.stringify(await purger())});
  }
  return {traiter, aTraiter, noShow, purger};
}
module.exports = {ddl, tables, creer, norm, SUITES};
