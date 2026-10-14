/* FIWAKTI v56.24 — synchronisation biométrique automatique, UNE seule logique pour les pointeuses (FW-Time) et les
   lecteurs d'accès (FW-Acces).
   - File unique bio_sync_queue (priorités : 1 retrait/blocage, 5 diffusion, 9 réconciliation), différentielle,
     dédupliquée (salarié + appareil + action + version biométrique), reprise des travaux après redémarrage, essais avec
     délai progressif, échec définitif après le nombre maximal d'essais ; un appareil en panne ne bloque jamais les autres.
   - Une tâche du planificateur central (aucun processus supplémentaire), au plus un appareil à la fois, délai minimal
     entre deux actions sensibles sur un même appareil, plafond d'actions et de durée par cycle.
   - Les actions passent par le même chemin que les actions manuelles (PT.executer), qui gardent la priorité (verrou
     par appareil). Synchronisation désactivée : comportement manuel strictement inchangé.
   - Blocage biométrique selon les absences (types du référentiel) : exclusion de toutes les listes envoyées ET retrait
     réel des appareils (prioritaire) ; réactivation automatique (fin + délai de grâce) ou après validation RH.
   - Jamais de gabarit en clair : la file, l'état et le journal ne contiennent que matricule, appareil, action, version
     (empreinte tronquée) et résultat. */
"use strict";
const crypto = require("crypto");
const COLS = "id TEXT PRIMARY KEY, cle TEXT NOT NULL, mat TEXT, terminal_id TEXT, action TEXT NOT NULL, priorite INTEGER NOT NULL DEFAULT 5, statut TEXT NOT NULL, cree TEXT NOT NULL, " +
  "started_at TEXT, finished_at TEXT, essais INTEGER NOT NULL DEFAULT 0, max_essais INTEGER NOT NULL DEFAULT 5, next_retry_at TEXT, locked_at TEXT, worker_id TEXT, version_bio TEXT, source TEXT, detail TEXT";
const DDL = [
  "CREATE TABLE IF NOT EXISTS bio_sync_queue ("+COLS+")",
  "CREATE INDEX IF NOT EXISTS bio_sync_queue_file ON bio_sync_queue(statut, priorite, next_retry_at)",
  "CREATE INDEX IF NOT EXISTS bio_sync_queue_cle ON bio_sync_queue(cle, statut)",
  "CREATE INDEX IF NOT EXISTS bio_sync_queue_term ON bio_sync_queue(terminal_id, statut)",
  "CREATE TABLE IF NOT EXISTS bio_blocages (mat TEXT PRIMARY KEY, code TEXT, mode TEXT NOT NULL, depuis TEXT, fin TEXT, statut TEXT NOT NULL, leve_le TEXT, leve_par TEXT, maj TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS bio_presence (terminal_id TEXT NOT NULL, mat TEXT NOT NULL, version_bio TEXT, maj TEXT NOT NULL, PRIMARY KEY(terminal_id, mat))"];
const ddl = {pg:DDL, sqlite:DDL};
const tables = {bio_sync_queue:"id", bio_blocages:"mat", bio_presence:"terminal_id"};
const DEFAUTS = {actif:false, pause:false, intervalleMin:15, terminauxMaitres:[], maxActionsParCycle:5, formatsVisage:["photo-jpeg", "zk-bio9-*", "zk-face7"],
  inclureTerminauxAcces:true, typesBlocageAuto:[], typesBlocageFinAuto:[], typesBlocageValidationRH:[], delaiGraceHeures:2,
  delaiEntreActionsSec:20, maxDureeCycleSec:120, maxEssais:5, backoffRetrySec:[60, 300, 900, 3600], prioriteRetrait:1, delaiRecuperationJobBloqueMin:10};
const ACTION_PILOTE = {lire:"visages-lire", envoyer_users:"utilisateurs-envoyer", envoyer_visages:"visages-envoyer", retrait:"utilisateurs-retirer"};
const RANG_ACTION = {retrait:0, envoyer_users:1, envoyer_visages:2, lire:3, reconciliation:4};
function creer(o){
  const {B, D, audit, journal} = o, PT = () => o.PT(), WORKER = "w-"+process.pid+"-"+crypto.randomBytes(3).toString("hex");
  const maint = () => new Date().toISOString(), auj = () => maint().slice(0, 10), nid = () => "bq-"+crypto.randomBytes(8).toString("hex");
  /* rend la main à la boucle d'événements régulièrement (base intégrée synchrone) : l'interface reste fluide */
  let PAS = 0; const ceder = () => (++PAS % 20 === 0) ? new Promise(r=>setImmediate(r)) : null;
  let CFG = null, BLOQUES = new Set(), CYCLE_EN_COURS = null;
  async function meta(k, v){ if (v === undefined){ const r = await B.get("SELECT v FROM meta WHERE k=?", k); return r ? JSON.parse(r.v) : null; }
    await B.run("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, JSON.stringify(v)); }
  async function config(){ if (!CFG) CFG = Object.assign({}, DEFAUTS, (await meta("biometrie_sync")) || {}); return CFG; }
  function nettoyerConfig(b){
    const c = Object.assign({}, DEFAUTS, CFG || {}), lst = x => Array.isArray(x) ? x.map(v=>String(v).slice(0, 40)).filter(Boolean).slice(0, 100) : [];
    const n = (x, a, z, d) => { const v = Number(x); return Number.isFinite(v) ? Math.min(z, Math.max(a, Math.round(v))) : d; };
    if ("actif" in b) c.actif = !!b.actif; if ("pause" in b) c.pause = !!b.pause; if ("inclureTerminauxAcces" in b) c.inclureTerminauxAcces = !!b.inclureTerminauxAcces;
    if ("intervalleMin" in b) c.intervalleMin = n(b.intervalleMin, 5, 240, 15);
    if ("maxActionsParCycle" in b) c.maxActionsParCycle = n(b.maxActionsParCycle, 1, 100, 5);
    if ("delaiGraceHeures" in b) c.delaiGraceHeures = n(b.delaiGraceHeures, 0, 168, 2);
    if ("delaiEntreActionsSec" in b) c.delaiEntreActionsSec = n(b.delaiEntreActionsSec, 5, 600, 20);
    if ("maxDureeCycleSec" in b) c.maxDureeCycleSec = n(b.maxDureeCycleSec, 10, 1800, 120);
    if ("maxEssais" in b) c.maxEssais = n(b.maxEssais, 1, 20, 5);
    if ("delaiRecuperationJobBloqueMin" in b) c.delaiRecuperationJobBloqueMin = n(b.delaiRecuperationJobBloqueMin, 2, 120, 10);
    if (Array.isArray(b.backoffRetrySec)) c.backoffRetrySec = b.backoffRetrySec.map(x=>n(x, 10, 86400, 60)).slice(0, 10);
    ["terminauxMaitres","formatsVisage","typesBlocageAuto","typesBlocageFinAuto","typesBlocageValidationRH"].forEach(k=>{ if (k in b) c[k] = lst(b[k]); });
    return c;
  }
  /* ---------- appareils concernés (pointage et accès : même règle) ---------- */
  async function appareils(cfg){
    const ref = await D.referentiel() || {}, acces = !!(o.moduleActif && o.moduleActif("FW-Acces"));
    return (ref.terms||[]).filter(T=>T.actif !== false && PT().piloteDe(T) && !(T.usage === "door" && !(cfg.inclureTerminauxAcces && acces)));
  }
  /* périmètre d'un salarié : appareils auxquels il est rattaché (rds) ; sinon ceux de son site — exactement la règle
     des listes envoyées (utilisateursPour), vue depuis le salarié */
  function perimetre(e, terms, avecRat){
    if (!e || (e.sortie && e.sortie < auj())) return [];
    return terms.filter(T=>avecRat.has(T.id) ? (e.rds||[]).indexOf(T.id) >= 0 : (!T.siteId || e.siteId === T.siteId)).map(T=>T.id);
  }
  const rattaches = emps => { const s = new Set(); emps.forEach(e=>(e.rds||[]).forEach(r=>s.add(r))); return s; };
  const capable = (T, action) => { const P = PT().piloteDe(T); return !!(P && (P.capacites || []).indexOf(ACTION_PILOTE[action] || action) >= 0); };
  /* version biométrique : empreinte des gabarits du salarié (aucun contenu) */
  async function versions(mats){
    const out = new Map(); if (!mats.length) return out;
    for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500);
      const r = await B.all("SELECT mat, format, indice, empreinte FROM bio_visages WHERE mat IN ("+l.map(()=>"?").join(",")+") ORDER BY mat, format, indice", ...l);
      const g = {}; r.forEach(x=>{ (g[x.mat] = g[x.mat] || []).push(x.format+"|"+x.indice+"|"+x.empreinte); });
      Object.keys(g).forEach(m=>out.set(m, crypto.createHash("sha256").update(g[m].join(";")).digest("hex").slice(0, 16))); }
    return out;
  }
  /* ---------- file : ajout dédupliqué ---------- */
  async function enfiler(j){
    const cfg = await config(), cle = [j.mat || "*", j.terminal_id || "*", j.action, j.version_bio || ""].join("|");
    const ex = await B.get("SELECT id, priorite FROM bio_sync_queue WHERE cle=? AND statut IN ('attente','en_cours','echec')", cle);
    if (ex){ if ((j.priorite||5) < ex.priorite) await B.run("UPDATE bio_sync_queue SET priorite=? WHERE id=?", j.priorite, ex.id); return {id:ex.id, doublon:true}; }
    /* un retrait annule les diffusions en attente du même salarié sur le même appareil, et inversement */
    if (j.mat && j.terminal_id){
      if (j.action === "retrait") await B.run("UPDATE bio_sync_queue SET statut='annule', finished_at=?, detail='remplacé par un retrait' WHERE mat=? AND terminal_id=? AND action IN ('envoyer_users','envoyer_visages') AND statut IN ('attente','echec')", maint(), j.mat, j.terminal_id);
      else if (j.action === "envoyer_users") await B.run("UPDATE bio_sync_queue SET statut='annule', finished_at=?, detail='remplacé par une diffusion' WHERE mat=? AND terminal_id=? AND action='retrait' AND statut IN ('attente','echec')", maint(), j.mat, j.terminal_id);
    }
    const id = nid();
    await B.run("INSERT INTO bio_sync_queue(id,cle,mat,terminal_id,action,priorite,statut,cree,essais,max_essais,version_bio,source,detail) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id, cle, j.mat || null, j.terminal_id || null, j.action, j.priorite || 5, "attente", maint(), 0, cfg.maxEssais, j.version_bio || null, String(j.source||"").slice(0, 60), j.detail || null);
    return {id};
  }
  async function enfilerDiffusion(mat, cibles, source, prio){
    const v = (await versions([String(mat)])).get(String(mat)) || null, ids = [];
    const pres = new Map((await B.all("SELECT terminal_id, version_bio FROM bio_presence WHERE mat=?", String(mat))).map(r=>[r.terminal_id, r.version_bio]));
    for (const t of cibles){
      await ceder();
      if (pres.has(t) && pres.get(t) === v) continue;                       /* version déjà présente : rien à renvoyer */
      ids.push((await enfiler({mat:String(mat), terminal_id:t, action:"envoyer_users", priorite:prio || 5, version_bio:v, source})).id);
      if (v) ids.push((await enfiler({mat:String(mat), terminal_id:t, action:"envoyer_visages", priorite:prio || 5, version_bio:v, source})).id);
    }
    return ids;
  }
  async function enfilerRetrait(mat, cibles, source){
    const cfg = await config(), ids = [];
    for (const t of cibles){ await ceder(); ids.push((await enfiler({mat:String(mat), terminal_id:t, action:"retrait", priorite:cfg.prioriteRetrait || 1, source})).id); }
    return ids;
  }
  /* ---------- événements ---------- */
  /* nouveau visage (ou visage modifié) reçu d'un appareil : diffusion aux autres appareils du périmètre */
  async function surVisage(mat, source){
    const cfg = await config(); if (!cfg.actif) return;
    const terms = await appareils(cfg), emps = await D.employes(), e = emps.find(x=>String(x.mat) === String(mat));
    if (!e || BLOQUES.has(String(mat))) return;
    await enfilerDiffusion(mat, perimetre(e, terms, rattaches(emps)).filter(t=>t !== source), "visage:"+source);
  }
  /* changement de site, de rattachement ou sortie : retraits (prioritaires) puis ajouts */
  async function surChangementEmp(ancien, nouveau){
    const cfg = await config(); if (!cfg.actif || !nouveau) return;
    const a = ancien || {}, n = nouveau, change = a.siteId !== n.siteId || JSON.stringify(a.rds||[]) !== JSON.stringify(n.rds||[]) || (a.sortie||"") !== (n.sortie||"") || String(a.mat||"") !== String(n.mat||"");
    if (!change) return;
    const terms = await appareils(cfg), emps = await D.employes(), rat = rattaches(emps);
    const avant = new Set(ancien ? perimetre(a, terms, rat) : []), apres = new Set(perimetre(n, terms, rat));
    const retirer = Array.from(avant).filter(t=>!apres.has(t)), ajouter = Array.from(apres).filter(t=>!avant.has(t));
    if (retirer.length) await enfilerRetrait(a.mat || n.mat, retirer, "perimetre");
    if (ajouter.length && !BLOQUES.has(String(n.mat))) await enfilerDiffusion(n.mat, ajouter, "perimetre");
  }
  /* ---------- blocages selon les absences (lot, une requête par cycle) ---------- */
  async function chargerBloques(){ BLOQUES = new Set((await B.all("SELECT mat FROM bio_blocages WHERE statut='actif'")).map(r=>String(r.mat))); return BLOQUES; }
  async function recalculerBlocages(cfg){
    const tous = new Set([].concat(cfg.typesBlocageAuto, cfg.typesBlocageFinAuto, cfg.typesBlocageValidationRH));
    const res = {nouveaux:0, leves:0};
    if (tous.size){
      const ref = await D.referentiel() || {}, codeDe = new Map((ref.tts||[]).map(t=>[t.id, String(t.code||"").toUpperCase()])), a = auj();
      const absAuj = (await B.all("SELECT mat, data FROM enreg WHERE coll='abs' AND d=?", a)).map(r=>{ let x = {}; try { x = JSON.parse(r.data); } catch(e){} return {mat:String(r.mat), code:codeDe.get(x.tt) || String(x.tt||"").toUpperCase()}; })
        .filter(x=>tous.has(x.code));
      if (absAuj.length){
        const mats = Array.from(new Set(absAuj.map(x=>x.mat))), fins = new Map();
        for (let i = 0; i < mats.length; i += 500){ const l = mats.slice(i, i+500);
          (await B.all("SELECT mat, MAX(d) f FROM enreg WHERE coll='abs' AND d>=? AND mat IN ("+l.map(()=>"?").join(",")+") GROUP BY mat", a, ...l)).forEach(r=>fins.set(String(r.mat), r.f)); }
        const terms = await appareils(cfg), emps = await D.employes(), rat = rattaches(emps), parMat = new Map(emps.map(e=>[String(e.mat), e]));
        for (const x of absAuj){
          await ceder();
          const fin = fins.get(x.mat) || a, mode = cfg.typesBlocageValidationRH.indexOf(x.code) >= 0 ? "rh" : "auto";
          const ex = await B.get("SELECT statut, mode, fin FROM bio_blocages WHERE mat=?", x.mat);
          if (ex && ex.statut === "actif"){ if (fin > (ex.fin||"")) await B.run("UPDATE bio_blocages SET fin=?, maj=? WHERE mat=?", fin, maint(), x.mat); continue; }
          await B.run("INSERT INTO bio_blocages(mat,code,mode,depuis,fin,statut,maj) VALUES(?,?,?,?,?,?,?) ON CONFLICT(mat) DO UPDATE SET code=excluded.code, mode=excluded.mode, depuis=excluded.depuis, fin=excluded.fin, statut='actif', leve_le=NULL, leve_par=NULL, maj=excluded.maj",
            x.mat, x.code, mode, a, fin, "actif", maint());
          BLOQUES.add(x.mat); res.nouveaux++;
          /* retrait réel : appareils du périmètre et appareils où le salarié est connu */
          const pres = (await B.all("SELECT terminal_id FROM bio_presence WHERE mat=?", x.mat)).map(r=>r.terminal_id);
          const cibles = Array.from(new Set(perimetre(parMat.get(x.mat), terms, rat).concat(pres))).filter(t=>terms.some(T=>T.id === t));
          await enfilerRetrait(x.mat, cibles, "blocage:"+x.code);
          await audit("systeme", "biometrie.blocage", x.mat+" ("+x.code+", "+(mode === "rh" ? "levée par les RH" : "fin automatique")+") — "+cibles.length+" appareil(s)");
        }
      }
    }
    /* réactivation automatique : fin d'absence dépassée + délai de grâce */
    const lim = new Date(Date.now() - (cfg.delaiGraceHeures||0) * 3600000).toISOString().slice(0, 10);
    const aLever = await B.all("SELECT mat, fin FROM bio_blocages WHERE statut='actif' AND mode='auto' AND fin < ?", auj());
    const terms = aLever.length ? await appareils(cfg) : [], emps = aLever.length ? await D.employes() : [], rat = rattaches(emps), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    for (const r of aLever){
      await ceder();
      const finGrace = new Date(new Date(r.fin+"T23:59:59").getTime() + (cfg.delaiGraceHeures||0) * 3600000);
      if (Date.now() < finGrace.getTime()) continue;
      await B.run("UPDATE bio_blocages SET statut='leve', leve_le=?, leve_par='automatique', maj=? WHERE mat=?", maint(), maint(), r.mat);
      BLOQUES.delete(String(r.mat)); res.leves++;
      await enfilerDiffusion(r.mat, perimetre(parMat.get(String(r.mat)), terms, rat), "fin-blocage");
      await audit("systeme", "biometrie.blocage.leve", r.mat+" (fin d'absence et délai de grâce)");
    }
    void lim;
    return res;
  }
  async function leverBlocage(mat, login){
    const r = await B.get("SELECT * FROM bio_blocages WHERE mat=?", String(mat));
    if (!r || r.statut !== "actif") throw Object.assign(new Error("Aucun blocage biométrique actif pour ce salarié."), {code:404});
    const cfg = await config();
    if ((r.fin || "") >= auj()){
      /* absence encore en cours : la levée est enregistrée, la réactivation suivra la fin de l'absence */
      await B.run("UPDATE bio_blocages SET mode='auto', leve_par=?, maj=? WHERE mat=?", login, maint(), String(mat));
      await audit(login, "biometrie.blocage.leve_rh", mat+" (prise en compte à la fin de l'absence, le "+r.fin+")");
      return {ok:true, differe:true, fin:r.fin, jobs:[]};
    }
    await B.run("UPDATE bio_blocages SET statut='leve', leve_le=?, leve_par=?, maj=? WHERE mat=?", maint(), login, maint(), String(mat));
    BLOQUES.delete(String(mat));
    const terms = await appareils(cfg), emps = await D.employes(), e = emps.find(x=>String(x.mat) === String(mat));
    const jobs = await enfilerDiffusion(mat, perimetre(e, terms, rattaches(emps)), "levee-rh", 3);
    await audit(login, "biometrie.blocage.leve_rh", mat+" — "+jobs.length+" envoi(s) en file");
    return {ok:true, jobs};
  }
  /* réconciliation ciblée d'un appareil (remplacé, réinitialisé) : même file, même traitement différentiel */
  async function resynchroniser(terminalId, login){
    const cfg = await config(), T = (await appareils(cfg)).find(x=>x.id === terminalId);
    if (!T) throw Object.assign(new Error("Appareil introuvable, inactif ou sans pilote."), {code:404});
    await B.run("DELETE FROM bio_presence WHERE terminal_id=?", T.id);                    /* état de l'appareil inconnu */
    const j = await enfiler({mat:"*", terminal_id:T.id, action:"reconciliation", priorite:9, source:"resync:"+login});
    await audit(login, "biometrie.resynchronisation", T.nom || T.id);
    return {ok:true, jobs:[j.id]};
  }
  /* ---------- traitement ---------- */
  async function recuperer(cfg, toutLeMonde){
    const lim = new Date(Date.now() - cfg.delaiRecuperationJobBloqueMin * 60000).toISOString();
    const r = toutLeMonde ? await B.run("UPDATE bio_sync_queue SET statut='attente', locked_at=NULL, worker_id=NULL, detail='repris après redémarrage' WHERE statut='en_cours' AND (worker_id IS NULL OR worker_id <> ?)", WORKER)
      : await B.run("UPDATE bio_sync_queue SET statut='attente', locked_at=NULL, worker_id=NULL, detail='repris (travail bloqué)' WHERE statut='en_cours' AND locked_at < ?", lim);
    return r.n || 0;
  }
  async function traiter(cfg, rapport){
    const t0 = Date.now(), maxMs = cfg.maxDureeCycleSec * 1000, maintenant = maint();
    const jobs = await B.all("SELECT id, mat, terminal_id, action, priorite, essais, max_essais, version_bio FROM bio_sync_queue WHERE statut IN ('attente','echec') AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY priorite, cree LIMIT 5000", maintenant);
    const terms = new Map((await appareils(cfg)).map(T=>[T.id, T])), emps = jobs.length ? new Map((await D.employes()).map(e=>[String(e.mat), e])) : new Map();
    /* regroupement par appareil et par action (une seule commande réseau pour plusieurs salariés), dans l'ordre :
       retraits, utilisateurs, visages, lectures, réconciliations */
    const groupes = new Map();
    for (const j of jobs){ const k = j.terminal_id+"|"+j.action; if (!groupes.has(k)) groupes.set(k, {terminal:j.terminal_id, action:j.action, prio:j.priorite, jobs:[]}); groupes.get(k).jobs.push(j); }
    const file = Array.from(groupes.values()).sort((a, b)=>a.prio - b.prio || RANG_ACTION[a.action] - RANG_ACTION[b.action]);
    const dernier = new Map(); let actions = 0;
    const der = id => Math.max(dernier.get(id) || 0, PT().derniereAuto ? PT().derniereAuto(id) : 0);
    const attendre = ms => new Promise(x=>setTimeout(x, ms));
    while (file.length && actions < cfg.maxActionsParCycle && Date.now() - t0 < maxMs){
      /* au plus un appareil à la fois ; délai minimal entre deux actions sur un même appareil */
      let idx = file.findIndex(g=>Date.now() - der(g.terminal) >= cfg.delaiEntreActionsSec * 1000);
      if (idx < 0){ const att = Math.min(...file.map(g=>cfg.delaiEntreActionsSec * 1000 - (Date.now() - der(g.terminal))));
        if (Date.now() - t0 + att > maxMs) break; await attendre(Math.max(50, att)); continue; }
      const g = file.splice(idx, 1)[0], T = terms.get(g.terminal), ids = g.jobs.map(j=>j.id);
      const fini = async (statut, detail, suite) => { for (const j of g.jobs){ await ceder();
        if (statut === "ok") await B.run("UPDATE bio_sync_queue SET statut='ok', finished_at=?, locked_at=NULL, detail=? WHERE id=?", maint(), detail, j.id);
        else if (statut === "report") await B.run("UPDATE bio_sync_queue SET statut='attente', locked_at=NULL, next_retry_at=?, detail=? WHERE id=?", new Date(Date.now() + cfg.delaiEntreActionsSec * 1000).toISOString(), detail, j.id);
        else { const e = j.essais + 1, def = e >= j.max_essais, d = cfg.backoffRetrySec[Math.min(e - 1, cfg.backoffRetrySec.length - 1)] || 300;
          await B.run("UPDATE bio_sync_queue SET statut=?, essais=?, finished_at=?, locked_at=NULL, next_retry_at=?, detail=? WHERE id=?", def ? "echec_final" : "echec", e, maint(), def ? null : new Date(Date.now() + d * 1000).toISOString(), String(detail).slice(0, 300), j.id); }
        if (suite) await suite(j); } };
      if (!T){ await fini("echec", "appareil absent, inactif, sans pilote ou exclu (accès)"); continue; }
      if (!capable(T, g.action === "reconciliation" ? "envoyer_users" : g.action)){ await fini("ok", "non pris en charge par le pilote de cet appareil"); continue; }
      for (const id of ids){ await ceder(); await B.run("UPDATE bio_sync_queue SET statut='en_cours', started_at=?, locked_at=?, worker_id=? WHERE id=?", maint(), maint(), WORKER, id); }
      const mats = g.jobs.map(j=>j.mat).filter(m=>m && m !== "*"), opts = {confirme:true, delaiMs:cfg.delaiEntreActionsSec * 1000};
      try {
        let r;
        if (g.action === "retrait"){ opts.ids = mats.map(m=>PT().idSurAppareil(T, emps.get(String(m)) || {mat:m})); r = await PT().executer("utilisateurs-retirer", T.id, opts, PT().AUTO); }
        else if (g.action === "lire") r = await PT().executer("visages-lire", T.id, opts, PT().AUTO);
        else if (g.action === "reconciliation"){
          r = await PT().executer("utilisateurs-envoyer", T.id, opts, PT().AUTO);
          if (capable(T, "envoyer_visages")){ dernier.set(T.id, Date.now()); await attendre(cfg.delaiEntreActionsSec * 1000); r = Object.assign(r||{}, {visages:await PT().executer("visages-envoyer", T.id, Object.assign({}, opts), PT().AUTO)}); }
        } else { opts.mats = mats; r = await PT().executer(ACTION_PILOTE[g.action], T.id, opts, PT().AUTO); }
        actions++; dernier.set(T.id, Date.now());
        /* envoi partiel (une partie refusée par l'appareil) : traité comme un échec, avec nouvel essai */
        if (r && typeof r.total === "number" && typeof r.envoyes === "number" && r.envoyes < r.total) throw Object.assign(new Error("Envoi partiel : "+r.envoyes+" sur "+r.total+" accepté(s) par l'appareil."), {code:502});
        await fini("ok", (r && (r.confirme ? "confirmé par l'appareil" : r.note ? "en file sur l'appareil" : "fait")) || "fait", async j=>{
          if (!j.mat || j.mat === "*") return;
          if (g.action === "retrait") await B.run("DELETE FROM bio_presence WHERE terminal_id=? AND mat=?", T.id, j.mat);
          else if (g.action === "envoyer_users" || g.action === "envoyer_visages")
            await B.run("INSERT INTO bio_presence(terminal_id,mat,version_bio,maj) VALUES(?,?,?,?) ON CONFLICT(terminal_id, mat) DO UPDATE SET version_bio=CASE WHEN excluded.version_bio IS NOT NULL THEN excluded.version_bio ELSE bio_presence.version_bio END, maj=excluded.maj",
              T.id, j.mat, g.action === "envoyer_visages" ? j.version_bio : null, maint());
        });
        rapport.faits.push({terminal:T.nom || T.id, action:g.action, salaries:mats.length, resultat:"ok"});
        await etatTerminal(T.id, {derniereSynchro:maint(), derniereErreur:null});
      } catch(e){
        if (e.code === 423){ await fini("report", e.message); rapport.reportes += g.jobs.length; continue; }
        actions++; dernier.set(T.id, Date.now());
        await fini("echec", e.message); rapport.echecs.push({terminal:T.nom || T.id, action:g.action, motif:String(e.message).slice(0, 160)});
        await etatTerminal(T.id, {derniereErreur:String(e.message).slice(0, 200), derniereErreurLe:maint()});
      }
    }
    rapport.actions = actions;
  }
  async function etatTerminal(id, x){ const et = (await meta("biometrie_sync_terminaux")) || {}; et[id] = Object.assign({}, et[id]||{}, x); await meta("biometrie_sync_terminaux", et); }
  /* ---------- cycle ---------- */
  async function cycle(declencheur){
    if (CYCLE_EN_COURS) return CYCLE_EN_COURS;
    CYCLE_EN_COURS = (async ()=>{
      const cfg = await config(), t0 = Date.now(), id = "cy-"+crypto.randomBytes(5).toString("hex");
      const rapport = {id, debut:maint(), declencheur:declencheur || "planificateur", faits:[], echecs:[], reportes:0, actions:0};
      try {
        if (!cfg.actif){ rapport.resultat = "inactif"; return rapport; }
        rapport.repris = await recuperer(cfg, false);
        if (cfg.pause){ rapport.resultat = "en pause"; return rapport; }
        /* 1. lecture des appareils maîtres (enrôlement) */
        const terms = await appareils(cfg);
        for (const tid of cfg.terminauxMaitres) if (terms.some(T=>T.id === tid)) await enfiler({mat:"*", terminal_id:tid, action:"lire", priorite:5, source:"maitre"});
        /* 2. blocages selon les absences (pointage et accès) */
        rapport.blocages = await recalculerBlocages(cfg);
        /* 3. traitement borné de la file */
        await traiter(cfg, rapport);
        /* 4. purge */
        const p = await B.run("DELETE FROM bio_sync_queue WHERE (statut IN ('ok','annule') AND COALESCE(finished_at, cree) < ?) OR (statut='echec_final' AND COALESCE(finished_at, cree) < ?)",
          new Date(Date.now() - 7*86400000).toISOString(), new Date(Date.now() - 30*86400000).toISOString());
        rapport.purges = p.n || 0;
        rapport.resultat = rapport.echecs.length ? "avec échecs" : "réussi";
        return rapport;
      } catch(e){ rapport.resultat = "échec"; rapport.motif = String(e.message).slice(0, 200); journal("synchro biométrie : "+e.message); return rapport; }
      finally {
        rapport.dureeMs = Date.now() - t0;
        const h = (await meta("biometrie_sync_cycles").catch(()=>null)) || [];
        h.unshift({id:rapport.id, debut:rapport.debut, dureeMs:rapport.dureeMs, resultat:rapport.resultat, actions:rapport.actions, echecs:rapport.echecs.length, reportes:rapport.reportes, blocages:rapport.blocages, declencheur:rapport.declencheur});
        await meta("biometrie_sync_cycles", h.slice(0, 20)).catch(()=>{});
        if (rapport.actions || rapport.echecs.length) await audit("systeme", "biometrie.cycle", rapport.resultat+" — "+rapport.actions+" action(s), "+rapport.echecs.length+" échec(s), "+rapport.dureeMs+" ms").catch(()=>{});
        CYCLE_EN_COURS = null;
      }
    })();
    return CYCLE_EN_COURS;
  }
  /* ---------- état (aucune donnée biométrique) ---------- */
  async function etat(){
    const cfg = await config(), c = {};
    (await B.all("SELECT statut, COUNT(*) n FROM bio_sync_queue GROUP BY statut")).forEach(r=>{ c[r.statut] = Number(r.n); });
    const ancien = await B.get("SELECT MIN(cree) m FROM bio_sync_queue WHERE statut IN ('attente','echec')");
    const parT = {}; (await B.all("SELECT terminal_id, COUNT(*) n FROM bio_sync_queue WHERE statut IN ('attente','echec','en_cours') GROUP BY terminal_id")).forEach(r=>{ parT[r.terminal_id] = Number(r.n); });
    const et = (await meta("biometrie_sync_terminaux")) || {}, cycles = (await meta("biometrie_sync_cycles")) || [];
    const terms = await appareils(cfg), ref = await D.referentiel() || {};
    const evenements = await B.all("SELECT mat, terminal_id, action, statut, essais, finished_at, detail FROM bio_sync_queue WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20");
    return {config:cfg, compteurs:c, plusAncienAttente:ancien && ancien.m || null, cycles, dernierReussi:(cycles.find(x=>x.resultat === "réussi")||{}).debut || null,
      dernierEchec:(cycles.find(x=>x.resultat === "échec" || x.resultat === "avec échecs")||{}).debut || null, bloques:Number((await B.get("SELECT COUNT(*) n FROM bio_blocages WHERE statut='actif'")).n),
      acces:!!(o.moduleActif && o.moduleActif("FW-Acces")),
      terminaux:(ref.terms||[]).filter(T=>T.actif !== false).map(T=>({id:T.id, nom:T.nom, usage:T.usage || "clocking", inclus:terms.some(x=>x.id === T.id), maitre:cfg.terminauxMaitres.indexOf(T.id) >= 0,
        enAttente:parT[T.id] || 0, derniereSynchro:(et[T.id]||{}).derniereSynchro || null, derniereErreur:(et[T.id]||{}).derniereErreur || null})),
      types:(ref.tts||[]).filter(t=>t.code).map(t=>({code:t.code, nom:t.nom})), evenements};
  }
  async function enregistrerConfig(b, login){
    const c = nettoyerConfig(b || {}); await meta("biometrie_sync", c); CFG = c;
    await audit(login, "biometrie.sync.config", (c.actif ? "active" : "inactive")+(c.pause ? ", en pause" : "")+", "+c.intervalleMin+" min, "+c.terminauxMaitres.length+" appareil(s) maître(s), accès "+(c.inclureTerminauxAcces ? "inclus" : "exclus"));
    return c;
  }
  async function demarrer(){ await config(); await chargerBloques(); await recuperer(await config(), true); }
  return {cycle, etat, enregistrerConfig, config, leverBlocage, resynchroniser, surVisage, surChangementEmp, demarrer, bloques:()=>BLOQUES, enfiler, recuperer:()=>config().then(c=>recuperer(c, false)), WORKER};
}
module.exports = {ddl, tables, creer, DEFAUTS};
