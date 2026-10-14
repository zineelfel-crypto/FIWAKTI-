/* FW-Medicale — suivi médical, cloisonné selon le modèle validé par le client :
   - seul le rôle médical (droit « MED » : médecin du travail, infirmier) accède au détail (visites, restrictions,
     observations, maladies professionnelles) ; le statut d'administrateur ne suffit pas ;
   - RH et responsables ne voient que l'aptitude (apte, apte avec restriction, inapte) et la prochaine visite ;
   - chaque consultation d'un dossier médical est tracée ; les exports sont réservés au rôle médical ;
   - restrictions et observations chiffrées dans la base (AES-256-GCM, clé du coffre « medical ») ;
   - le pilotage ne reçoit que des taux et des nombres par service, masqués sous 5 salariés. */
"use strict";
/* v56.23 : périmètre appliqué dans la requête SQL (tableau de matricules), jamais par filtrage en mémoire */
const perimSql = (B, P, col) => P.set === null ? {sql:"", a:[]} : (B.type === "pg" ? {sql:" AND "+col+" = ANY(?)", a:[Array.from(P.set)]} : {sql:" AND "+col+" IN (SELECT value FROM json_each(?))", a:[JSON.stringify(Array.from(P.set))]});
const crypto = require("crypto");
const ddl = {pg:[
  "CREATE TABLE IF NOT EXISTS med_visites (id TEXT PRIMARY KEY, mat TEXT NOT NULL, type TEXT NOT NULL, prevue_le TEXT, realisee_le TEXT, statut TEXT NOT NULL, aptitude TEXT, restrictions TEXT, observations TEXT, prochaine_le TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS med_visites_mat ON med_visites(mat, realisee_le)",
  "CREATE INDEX IF NOT EXISTS med_visites_statut ON med_visites(statut, prevue_le)",
  "CREATE TABLE IF NOT EXISTS med_mp (id TEXT PRIMARY KEY, mat TEXT NOT NULL, declaree_le TEXT NOT NULL, tableau TEXT, statut TEXT NOT NULL, observations TEXT, maj TEXT NOT NULL, par TEXT)",
  "CREATE INDEX IF NOT EXISTS med_mp_d ON med_mp(declaree_le)",
  "CREATE TABLE IF NOT EXISTS med_parametres (k TEXT PRIMARY KEY, v TEXT)"]};
ddl.pg.push("CREATE INDEX IF NOT EXISTS med_visites_mat_statut ON med_visites(mat, statut, realisee_le)");
ddl.sqlite = ddl.pg;
const tables = {med_visites:"id", med_mp:"id", med_parametres:"k"};
const TYPES = ["embauche", "periodique", "reprise", "pre_reprise", "demande"], APT = ["apte", "apte_restriction", "inapte"];
function ajoutMois(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
function ajoutJours(k, n){ const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function creer(o){
  const {B, D, audit} = o, coffre = o.coffre;
  const id = p => p+"-"+crypto.randomBytes(6).toString("hex"), maint = () => new Date().toISOString(), auj = () => maint().slice(0, 10);
  const dans = (P, m) => P.set === null || (P.set && P.set.has(String(m)));
  /* v56.23 : jamais de clé de secours prévisible — sans coffre, le chiffrement échoue (fail closed) */
  const cle = () => { if (!coffre || typeof coffre.cle !== "function") throw new Error("Coffre de clés indisponible : chiffrement « medical » impossible."); return crypto.createHash("sha256").update(coffre.cle("medical")).digest(); };
  const chiffrer = t => { if (!t) return null; const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(), iv); const x = Buffer.concat([c.update(Buffer.from(String(t), "utf8")), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]).toString("base64"); };
  const dechiffrer = s => { if (!s) return ""; try { const b = Buffer.from(s, "base64"), d = crypto.createDecipheriv("aes-256-gcm", cle(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"); } catch(e){ return ""; } };
  const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
  /* rôle médical : droit MED explicite, jamais déduit du statut d'administrateur */
  const rangMed = P => RANG[((P.profil||{}).droits||{}).MED] || 0;
  async function periodicite(){ const r = await B.get("SELECT v FROM med_parametres WHERE k='periodicite_mois'"); const n = Number(r && r.v); return [6, 12, 24, 36].indexOf(n) >= 0 ? n : 12; }
  /* état d'aptitude courant par salarié (dernière visite réalisée) — sans restriction ni observation */
  async function aptitudes(mats){
    const out = new Map();
    for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500);
      (await B.all("SELECT mat, aptitude, realisee_le, prochaine_le, type FROM med_visites WHERE statut='realisee' AND mat IN ("+l.map(()=>"?").join(",")+") ORDER BY realisee_le", ...l))
        .forEach(r=>out.set(r.mat, {aptitude:r.aptitude, derniere:r.realisee_le, prochaine:r.prochaine_le, type:r.type})); }
    return out;
  }
  /* indicateurs pour le pilotage : par service, nombres et taux seulement, masqués sous 5 salariés */
  async function indicateurs(emps, du, au){
    const per = await periodicite(), apt = await aptitudes(emps.map(e=>String(e.mat))), ref = await (D.referentielLecture || D.referentiel)() || {};
    const nomDept = new Map((ref.depts||[]).map(d=>[d.id, d.nom])), parDept = {};
    const visites = []; const mats = emps.map(e=>String(e.mat));
    for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, type, realisee_le FROM med_visites WHERE statut='realisee' AND mat IN ("+l.map(()=>"?").join(",")+")", ...l)).forEach(v=>visites.push(v)); }
    const vParMat = {}; visites.forEach(v=>{ (vParMat[v.mat] = vParMat[v.mat] || []).push(v); });
    const mp = []; for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500); (await B.all("SELECT mat, statut FROM med_mp WHERE declaree_le>=? AND declaree_le<=? AND mat IN ("+l.map(()=>"?").join(",")+")", du, au, ...l)).forEach(x=>mp.push(x)); }
    const mpParMat = {}; mp.forEach(x=>{ (mpParMat[x.mat] = mpParMat[x.mat] || []).push(x); });
    emps.forEach(e=>{
      const k = e.deptId || "", x = parDept[k] || (parDept[k] = {service:nomDept.get(k) || "—", effectif:0, aJour:0, periodiquesPeriode:0, embauches:0, embauchesVisite:0, mpDeclarees:0, mpReconnues:0});
      const actif = (!e.entree || e.entree <= au) && (!e.sortie || e.sortie >= au); if (!actif) return;
      x.effectif++;
      const a = apt.get(String(e.mat)); if (a && a.derniere && a.derniere >= ajoutMois(au, -per)) x.aJour++;
      const vs = vParMat[String(e.mat)] || [];
      x.periodiquesPeriode += vs.filter(v=>v.type === "periodique" && v.realisee_le >= du && v.realisee_le <= au).length;
      if (e.entree && e.entree >= du && e.entree <= au){ x.embauches++; if (vs.some(v=>v.type === "embauche" && v.realisee_le >= ajoutJours(e.entree, -30))) x.embauchesVisite++; }
      const m = mpParMat[String(e.mat)] || []; x.mpDeclarees += m.length; x.mpReconnues += m.filter(z=>z.statut === "reconnue").length;
    });
    const SEUIL = 5, r1 = v => Math.round(v * 10) / 10;
    const lignes = Object.values(parDept).filter(x=>x.effectif).sort((a, b)=>a.service.localeCompare(b.service)).map(x=>x.effectif < SEUIL
      ? {service:x.service, effectif:x.effectif, masque:true}
      : {service:x.service, effectif:x.effectif, tauxPeriodiquesAJour:r1(100 * x.aJour / x.effectif), periodiquesPeriode:x.periodiquesPeriode, embauches:x.embauches,
         tauxVisitesEmbauche:x.embauches ? r1(100 * x.embauchesVisite / x.embauches) : null, mpDeclarees:x.mpDeclarees, mpReconnues:x.mpReconnues});
    const T = Object.values(parDept).reduce((s, x)=>({effectif:s.effectif + x.effectif, aJour:s.aJour + x.aJour, emb:s.emb + x.embauches, embV:s.embV + x.embauchesVisite, mp:s.mp + x.mpDeclarees, mpR:s.mpR + x.mpReconnues, per:s.per + x.periodiquesPeriode}), {effectif:0, aJour:0, emb:0, embV:0, mp:0, mpR:0, per:0});
    return {periodiciteMois:per, seuilMasquage:SEUIL, total:T.effectif < SEUIL ? {masque:true} : {tauxPeriodiquesAJour:r1(100 * T.aJour / T.effectif), periodiquesPeriode:T.per, embauches:T.emb,
      tauxVisitesEmbauche:T.emb ? r1(100 * T.embV / T.emb) : null, mpDeclarees:T.mp, mpReconnues:T.mpR}, parService:lignes};
  }
  async function aTraiter(x){
    const out = [], a = auj(), rm = rangMed(x.P);
    if (rm >= 2){
      const emps = (await D.employes()).filter(e=>(!e.sortie || e.sortie >= a) && dans(x.P, e.mat)), apt = await aptitudes(emps.map(e=>String(e.mat)));
      const sansEmb = emps.filter(e=>e.entree && e.entree >= ajoutJours(a, -90) && !apt.has(String(e.mat))).length;
      const dues = emps.filter(e=>{ const v = apt.get(String(e.mat)); return v && v.prochaine && v.prochaine <= ajoutJours(a, 30); }).length;
      if (sansEmb) out.push({domaine:"sante", cle:"med-embauche", nombre:sansEmb, urgence:2, vue:"medical"});
      if (dues) out.push({domaine:"sante", cle:"med-periodiques", nombre:dues, urgence:1, vue:"medical"});
    }
    return out;
  }
  async function fiche360(x){
    if (x.rang("EMP") < 1 && rangMed(x.P) < 1) return null;
    const v = (await aptitudes([String(x.mat)])).get(String(x.mat));
    return {cle:"medical", vue:"medical", lignes:[{k:v && v.aptitude ? "medApt_"+v.aptitude : "medAptInconnue", v:"", alerte:!v || v.aptitude !== "apte"}, {k:"medProchaine", v:v && v.prochaine ? v.prochaine : "—", alerte:!!(v && v.prochaine && v.prochaine <= auj())}]};
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, u, json, erreur, corpsJson, ip} = x;
    const rm = rangMed(P), re = admin ? 4 : (RANG[((P.profil||{}).droits||{}).EMP] || 0);
    const q = Object.fromEntries(u.searchParams.entries()), off = Math.max(0, +q.offset||0), lim = Math.min(200, Math.max(1, +q.limit||50));
    /* vue RH et responsables : aptitude et prochaine visite uniquement */
    if (p === "/api/v1/medical/aptitudes" && req.method === "GET"){
      if (re < 1 && rm < 1) return erreur(res, 403, "Droit de consultation des salariés requis.");
      const s = String(q.q||"").trim().toLowerCase();
      const emps = (await D.employes()).filter(e=>dans(P, e.mat) && (!e.sortie || e.sortie >= auj()) && (!s || String(e.mat).toLowerCase() === s || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0));
      /* v56.23 : filtres d'aptitude calculés en SQL ; aptitudes lues seulement pour la page affichée */
      let liste = emps;
      if (q.filtre === "restriction"){ const pm = perimSql(B, P, "v.mat");
        const m = new Set((await B.all("SELECT v.mat FROM med_visites v WHERE v.statut='realisee' AND v.aptitude IN ('apte_restriction','inapte') AND v.realisee_le = (SELECT MAX(w.realisee_le) FROM med_visites w WHERE w.mat=v.mat AND w.statut='realisee')"+pm.sql, ...pm.a)).map(r=>String(r.mat)));
        liste = liste.filter(e=>m.has(String(e.mat))); }
      if (q.filtre === "echue"){ const aJour = new Set((await B.all("SELECT mat FROM med_visites WHERE statut='realisee' GROUP BY mat HAVING MAX(prochaine_le) > ?", auj())).map(r=>String(r.mat)));
        liste = liste.filter(e=>!aJour.has(String(e.mat))); }
      const page = liste.slice(off, off + lim), apt = await aptitudes(page.map(e=>String(e.mat)));
      return json(res, 200, {total:liste.length, lignes:page.map(e=>{ const v = apt.get(String(e.mat)) || {}; return {mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), aptitude:v.aptitude || null, prochaine:v.prochaine || null}; }), roleMedical:rm >= 1});
    }
    if (rm < 1) return erreur(res, 403, "Accès réservé au service médical.");
    if (p === "/api/v1/medical/parametres" && req.method === "GET") return json(res, 200, {periodiciteMois:await periodicite()});
    if (p === "/api/v1/medical/parametres" && req.method === "POST"){
      if (rm < 3) return erreur(res, 403, "Réservé au médecin du travail."); const n = Number((await corpsJson(req)).periodiciteMois);
      if ([6, 12, 24, 36].indexOf(n) < 0) return erreur(res, 400, "Périodicité non prévue.");
      await B.run("INSERT INTO med_parametres(k,v) VALUES('periodicite_mois',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(n)); await audit(C.login, "medical.periodicite", n+" mois", ip); return json(res, 200, {ok:true});
    }
    if (p === "/api/v1/medical/visites" && req.method === "GET"){
      const st = ["planifiee","realisee","annulee"].indexOf(q.statut) >= 0 ? q.statut : "planifiee";
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      const pm = perimSql(B, P, "mat"), aa = [st].concat(pm.a);
      const total = Number((await B.get("SELECT COUNT(*) n FROM med_visites WHERE statut=?"+pm.sql, ...aa)).n);
      const l = await B.all("SELECT id, mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites WHERE statut=?"+pm.sql+" ORDER BY "+(st === "realisee" ? "realisee_le DESC" : "prevue_le")+" LIMIT "+lim+" OFFSET "+off, ...aa);
      return json(res, 200, {total, lignes:l.map(r=>{ const e = emps.get(r.mat) || {}; return Object.assign(r, {nom:((e.nom||"")+" "+(e.prenom||"")).trim()}); })});
    }
    if (p === "/api/v1/medical/visites" && req.method === "POST"){
      if (rm < 2) return erreur(res, 403, "Droit de saisie médicale requis.");
      const b = await corpsJson(req), mat = String(b.mat||"").trim(), type = TYPES.indexOf(b.type) >= 0 ? b.type : null;
      if (!mat || !type || !/^\d{4}-\d{2}-\d{2}$/.test(b.prevueLe||"")) return erreur(res, 400, "Salarié, type et date prévue obligatoires.");
      if (!dans(P, mat) || !(await D.employes()).some(e=>String(e.mat) === mat)) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      const i = id("mv"); await B.run("INSERT INTO med_visites(id,mat,type,prevue_le,statut,maj,par) VALUES(?,?,?,?,?,?,?)", i, mat, type, b.prevueLe, "planifiee", maint(), C.login);
      await audit(C.login, "medical.visite.planifiee", mat+" — "+type, ip); return json(res, 200, {ok:true, id:i});
    }
    const mv = /^\/api\/v1\/medical\/visites\/([^/]+)\/(realiser|annuler)$/.exec(p);
    if (mv && req.method === "POST"){
      if (rm < 2) return erreur(res, 403, "Droit de saisie médicale requis.");
      const v = await B.get("SELECT * FROM med_visites WHERE id=?", mv[1]); if (!v || !dans(P, v.mat)) return erreur(res, 404, "Visite introuvable.");
      if (v.statut !== "planifiee") return erreur(res, 409, "Visite déjà traitée.");
      if (mv[2] === "annuler"){ await B.run("UPDATE med_visites SET statut='annulee', maj=?, par=? WHERE id=?", maint(), C.login, v.id); await audit(C.login, "medical.visite.annulee", v.mat, ip); return json(res, 200, {ok:true}); }
      const b = await corpsJson(req), d = /^\d{4}-\d{2}-\d{2}$/.test(b.realiseeLe||"") ? b.realiseeLe : auj();
      if (APT.indexOf(b.aptitude) < 0) return erreur(res, 400, "Aptitude obligatoire (apte, apte avec restriction, inapte).");
      if (b.aptitude === "apte_restriction" && !String(b.restrictions||"").trim()) return erreur(res, 400, "Précisez les restrictions.");
      const prochaine = /^\d{4}-\d{2}-\d{2}$/.test(b.prochaineLe||"") ? b.prochaineLe : ajoutMois(d, await periodicite());
      await B.run("UPDATE med_visites SET statut='realisee', realisee_le=?, aptitude=?, restrictions=?, observations=?, prochaine_le=?, maj=?, par=? WHERE id=?",
        d, b.aptitude, chiffrer(String(b.restrictions||"").slice(0, 2000)), chiffrer(String(b.observations||"").slice(0, 4000)), prochaine, maint(), C.login, v.id);
      await audit(C.login, "medical.visite.realisee", v.mat+" — "+v.type+" ("+b.aptitude+")", ip); return json(res, 200, {ok:true, prochaine});
    }
    /* dossier médical d'un salarié (consultation tracée) */
    const md = /^\/api\/v1\/medical\/dossier\/([^/]+)$/.exec(p);
    if (md && req.method === "GET"){
      const mat = decodeURIComponent(md[1]); if (!dans(P, mat)) return erreur(res, 404, "Salarié hors périmètre.");
      const e = (await D.employes()).find(z=>String(z.mat) === mat); if (!e) return erreur(res, 404, "Salarié introuvable.");
      await audit(C.login, "medical.dossier.consulte", mat, ip);
      const vis = (await B.all("SELECT * FROM med_visites WHERE mat=? ORDER BY COALESCE(realisee_le, prevue_le) DESC", mat)).map(v=>Object.assign(v, {restrictions:dechiffrer(v.restrictions), observations:dechiffrer(v.observations)}));
      const mp = (await B.all("SELECT * FROM med_mp WHERE mat=? ORDER BY declaree_le DESC", mat)).map(m=>Object.assign(m, {observations:dechiffrer(m.observations)}));
      return json(res, 200, {salarie:{mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), poste:e.poste||"", entree:e.entree||""}, visites:vis, maladiesPro:mp});
    }
    if (p === "/api/v1/medical/maladies-pro" && req.method === "POST"){
      if (rm < 2) return erreur(res, 403, "Droit de saisie médicale requis.");
      const b = await corpsJson(req), mat = String(b.mat||"").trim();
      if (!mat || !/^\d{4}-\d{2}-\d{2}$/.test(b.declareeLe||"")) return erreur(res, 400, "Salarié et date de déclaration obligatoires.");
      if (!dans(P, mat) || !(await D.employes()).some(e=>String(e.mat) === mat)) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      const i = id("mp"); await B.run("INSERT INTO med_mp(id,mat,declaree_le,tableau,statut,observations,maj,par) VALUES(?,?,?,?,?,?,?,?)", i, mat, b.declareeLe, String(b.tableau||"").slice(0, 40),
        ["declaree","reconnue","refusee"].indexOf(b.statut) >= 0 ? b.statut : "declaree", chiffrer(String(b.observations||"").slice(0, 4000)), maint(), C.login);
      await audit(C.login, "medical.mp.declaree", mat, ip); return json(res, 200, {ok:true, id:i});
    }
    const mm = /^\/api\/v1\/medical\/maladies-pro\/([^/]+)\/statut$/.exec(p);
    if (mm && req.method === "POST"){ if (rm < 2) return erreur(res, 403, "Droit de saisie médicale requis.");
      const st = (await corpsJson(req)).statut; if (["declaree","reconnue","refusee"].indexOf(st) < 0) return erreur(res, 400, "Statut non prévu.");
      const m = await B.get("SELECT mat FROM med_mp WHERE id=?", mm[1]); if (!m || !dans(P, m.mat)) return erreur(res, 404, "Introuvable.");
      await B.run("UPDATE med_mp SET statut=?, maj=?, par=? WHERE id=?", st, maint(), C.login, mm[1]); await audit(C.login, "medical.mp.statut", m.mat+" : "+st, ip); return json(res, 200, {ok:true}); }
    /* export réservé au rôle médical, tracé */
    if (p === "/api/v1/medical/export" && req.method === "GET"){
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      const l = (await B.all("SELECT mat, type, prevue_le, realisee_le, statut, aptitude, prochaine_le FROM med_visites ORDER BY mat, prevue_le")).filter(r=>dans(P, r.mat));
      await audit(C.login, "medical.export", l.length+" visite(s)", ip);
      const csv = ["Matricule;Nom;Type;Prévue le;Réalisée le;Statut;Aptitude;Prochaine visite"].concat(l.map(r=>{ const e = emps.get(r.mat) || {}; return [r.mat, ((e.nom||"")+" "+(e.prenom||"")).trim(), r.type, r.prevue_le||"", r.realisee_le||"", r.statut, r.aptitude||"", r.prochaine_le||""].map(c=>{ let s = String(c); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'"+s; return '"'+s.replace(/"/g, '""')+'"'; }).join(";"); })).join("\r\n");
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-suivi-medical.csv\"", "Cache-Control":"no-store"}); return res.end("\ufeff"+csv);
    }
    return erreur(res, 404, "Introuvable.");
  }
  return {traiter, aTraiter, fiche360, indicateurs};
}
module.exports = {ddl, tables, creer};
