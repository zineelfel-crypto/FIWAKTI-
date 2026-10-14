/* FIWAKTI — accès à la base (v44) : PostgreSQL (recommandé) ou SQLite intégré.
   Une seule interface asynchrone ; les requêtes sont écrites avec « ? » et
   converties pour PostgreSQL. */
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto"), os = require("os");
const { AsyncLocalStorage } = require("async_hooks");
const TABLES = ["kv","comptes","sessions","audit","meta","bases","enreg","calc_jour","ingestion_queue","raw_events","normalized_events","event_retransmissions",
  "day_states","day_transitions","anomalies","adjustments","recalculs","counter_snapshots","event_keys"];
/* v56.2 : les modules FW- livrés déclarent leurs propres tables (schéma, sauvegarde, restauration, vérification) */
const SCHEMA_MODULES = {pg:[], sqlite:[]};
function ajouterModule(m){
  (m.ddl && m.ddl.pg || []).forEach(s=>{ if (SCHEMA_MODULES.pg.indexOf(s) < 0) SCHEMA_MODULES.pg.push(s); });
  (m.ddl && m.ddl.sqlite || []).forEach(s=>{ if (SCHEMA_MODULES.sqlite.indexOf(s) < 0) SCHEMA_MODULES.sqlite.push(s); });
  Object.entries(m.tables || {}).forEach(([t, cle])=>{ if (TABLES.indexOf(t) < 0) TABLES.push(t); CLES[t] = cle; });
}
function schema(type){ return schemaBase(type).concat(SCHEMA_MODULES[type === "pg" ? "pg" : "sqlite"]); }
function schemaBase(type){
  const PG = type === "pg";
  const AUTO = PG ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  const BIG = PG ? "BIGINT" : "INTEGER";
  return [
    "CREATE TABLE IF NOT EXISTS kv (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, maj TEXT NOT NULL, par TEXT)",
    "CREATE TABLE IF NOT EXISTS comptes (login TEXT PRIMARY KEY, uid TEXT, nom TEXT, matricule TEXT, role TEXT NOT NULL DEFAULT 'utilisateur', actif INTEGER NOT NULL DEFAULT 1, hash TEXT, etat TEXT NOT NULL DEFAULT 'actif', temp_le TEXT, changer INTEGER NOT NULL DEFAULT 0, raison TEXT, echecs INTEGER NOT NULL DEFAULT 0, verrou TEXT, derniere TEXT, maj TEXT, historique TEXT, mdp_le TEXT, a2f_secret TEXT, a2f_actif INTEGER, a2f_pas INTEGER)",
    "CREATE UNIQUE INDEX IF NOT EXISTS comptes_login_min ON comptes (lower(login))",
    "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, login TEXT NOT NULL, cree "+BIG+" NOT NULL, vu "+BIG+" NOT NULL, ip TEXT, agent TEXT, csrf TEXT, a2f_ok INTEGER, persistant INTEGER)",
    "CREATE TABLE IF NOT EXISTS audit (id "+AUTO+", ts TEXT NOT NULL, login TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT, empreinte TEXT)",
    /* v56.15 : scellement quotidien et recherches de l'audit par date sans parcourir toute la table (EXPLAIN) */
    /* v56.23 : compteur de débit partagé entre instances (table non journalisée, purgée chaque minute) */
    ...(type === "pg" ? ["CREATE UNLOGGED TABLE IF NOT EXISTS fw_debit (cle TEXT NOT NULL, fenetre BIGINT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(cle, fenetre))"] : []),
    "CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts)",
    "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)",
    "CREATE TABLE IF NOT EXISTS bases (id TEXT PRIMARY KEY, sid TEXT NOT NULL, cree "+BIG+" NOT NULL, valeur TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS enreg (coll TEXT NOT NULL, id TEXT NOT NULL, mat TEXT, d TEXT, mois TEXT, data TEXT NOT NULL, PRIMARY KEY(coll, id))",
    "CREATE INDEX IF NOT EXISTS enreg_mat ON enreg(coll, mat, d)",
    "CREATE INDEX IF NOT EXISTS enreg_date ON enreg(coll, d)",
    "CREATE INDEX IF NOT EXISTS enreg_mois ON enreg(coll, mois)",
    /* résultats calculés par le serveur : une ligne par employé et par jour */
    "CREATE TABLE IF NOT EXISTS calc_jour (mat TEXT NOT NULL, d TEXT NOT NULL, dept TEXT, site TEXT, ht REAL, hp REAL, ret REAL, hs REAL, nano INTEGER NOT NULL DEFAULT 0, types TEXT, anos TEXT, data TEXT, calc TEXT, nmv INTEGER, jid TEXT, reel INTEGER, hsmin REAL, PRIMARY KEY(mat, d))"+(PG ? " PARTITION BY RANGE (d)" : ""),
    "CREATE INDEX IF NOT EXISTS calc_jour_d ON calc_jour(d, nano)",
    /* 56.32 : sommes d'heures par période lues dans l'index seul (indicateurs HSE, pilotage) — 2,3 millions de journées à 60 000 salariés */
    "CREATE INDEX IF NOT EXISTS calc_jour_d_hp ON calc_jour(d, hp)",
    /* v50 — niveau 1 : événements bruts, en ajout seul (ni modification ni suppression, même par l'application) */
    "CREATE TABLE IF NOT EXISTS ingestion_queue (id TEXT PRIMARY KEY, recu_utc TEXT NOT NULL, source TEXT NOT NULL, terminal_id TEXT, nb INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, statut TEXT NOT NULL, tentatives INTEGER NOT NULL DEFAULT 0, erreur TEXT, correlation TEXT, traite_utc TEXT)",
    "CREATE INDEX IF NOT EXISTS ingestion_queue_statut ON ingestion_queue(statut, recu_utc)",
    "CREATE TABLE IF NOT EXISTS raw_events (raw_event_id TEXT NOT NULL, device_id TEXT, terminal_code TEXT, raw_badge_code TEXT, raw_employee_id TEXT, event_ts_utc TEXT, event_ts_local TEXT, reception_ts_utc TEXT NOT NULL, ingestion_source TEXT NOT NULL, payload_raw TEXT, source_event_id TEXT, timezone_source TEXT, ingestion_status TEXT NOT NULL, auteur TEXT, correlation TEXT, created_at TEXT NOT NULL, PRIMARY KEY(raw_event_id, reception_ts_utc))"+(PG ? " PARTITION BY RANGE (reception_ts_utc)" : ""),
    "CREATE INDEX IF NOT EXISTS raw_events_emp ON raw_events(raw_employee_id, event_ts_utc)",
    "CREATE INDEX IF NOT EXISTS raw_events_recu ON raw_events(reception_ts_utc)",
    /* niveau 2 : événements normalisés, idempotents (une clé = un seul événement métier) */
    "CREATE TABLE IF NOT EXISTS normalized_events (id TEXT NOT NULL, mois TEXT NOT NULL DEFAULT '0000-00', raw_event_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, employee_mat TEXT, type TEXT NOT NULL, methode_type TEXT, event_ts_utc TEXT, ts_local TEXT, work_date TEXT, site_id TEXT, statut TEXT NOT NULL, motif TEXT, ptg_id TEXT, remplace_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(id, mois))"+(PG ? " PARTITION BY RANGE (mois)" : ""),
    /* v56.2 : unicité globale de la clé d'idempotence (une table partitionnée ne peut pas la garantir seule) */
    "CREATE TABLE IF NOT EXISTS event_keys (idempotency_key TEXT PRIMARY KEY, mois TEXT, normalized_id TEXT, cree TEXT)",
    /* v56.2 : index complémentaires ; sur une grande base PostgreSQL existante, créés en arrière-plan (voir ouvrirPg) */
    ...(PG ? [] : ["CREATE INDEX IF NOT EXISTS normalized_events_cle2 ON normalized_events(idempotency_key)", "CREATE INDEX IF NOT EXISTS normalized_events_ptg ON normalized_events(ptg_id)"]),
    "CREATE INDEX IF NOT EXISTS normalized_events_emp ON normalized_events(employee_mat, work_date)",
    "CREATE INDEX IF NOT EXISTS normalized_events_statut ON normalized_events(statut)",
    "CREATE TABLE IF NOT EXISTS event_retransmissions (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL, raw_event_id TEXT NOT NULL, recu_utc TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS event_retransmissions_cle ON event_retransmissions(idempotency_key)",
    ...(PG ? ["CREATE OR REPLACE FUNCTION fiwakti_brut_immuable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'événement brut non modifiable'; END $$ LANGUAGE plpgsql",
              "CREATE OR REPLACE TRIGGER raw_events_immuable BEFORE UPDATE OR DELETE ON raw_events FOR EACH ROW EXECUTE FUNCTION fiwakti_brut_immuable()",
              "CREATE OR REPLACE FUNCTION fiwakti_normalise_conserve() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'événement normalisé non supprimable'; END $$ LANGUAGE plpgsql",
              "CREATE OR REPLACE TRIGGER normalized_events_conserve BEFORE DELETE ON normalized_events FOR EACH ROW EXECUTE FUNCTION fiwakti_normalise_conserve()",
              "CREATE OR REPLACE TRIGGER retransmissions_immuables BEFORE UPDATE OR DELETE ON event_retransmissions FOR EACH ROW EXECUTE FUNCTION fiwakti_brut_immuable()"]
           : ["CREATE TRIGGER IF NOT EXISTS raw_events_immuable_maj BEFORE UPDATE ON raw_events BEGIN SELECT RAISE(ABORT, 'événement brut non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS raw_events_immuable_sup BEFORE DELETE ON raw_events BEGIN SELECT RAISE(ABORT, 'événement brut non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS normalized_events_conserve BEFORE DELETE ON normalized_events BEGIN SELECT RAISE(ABORT, 'événement normalisé non supprimable'); END",
              "CREATE TRIGGER IF NOT EXISTS retransmissions_immuables_maj BEFORE UPDATE ON event_retransmissions BEGIN SELECT RAISE(ABORT, 'événement brut non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS retransmissions_immuables_sup BEFORE DELETE ON event_retransmissions BEGIN SELECT RAISE(ABORT, 'événement brut non modifiable'); END"]),
    /* v52 — niveau 4 : état de chaque journée, historique des transitions (ajout seul), anomalies persistées,
       ajustements de période antérieure (ajout seul ; seul le statut de validation évolue) */
    "CREATE TABLE IF NOT EXISTS day_states (mat TEXT NOT NULL, d TEXT NOT NULL, etat TEXT NOT NULL, maj TEXT NOT NULL, auteur TEXT, PRIMARY KEY(mat, d))",
    "CREATE INDEX IF NOT EXISTS day_states_etat ON day_states(etat, d)",
    "CREATE TABLE IF NOT EXISTS day_transitions (id TEXT NOT NULL, mat TEXT NOT NULL, d TEXT NOT NULL, de TEXT, vers TEXT NOT NULL, auteur TEXT, motif TEXT, ts TEXT NOT NULL, PRIMARY KEY(id, d))"+(PG ? " PARTITION BY RANGE (d)" : ""),
    "CREATE INDEX IF NOT EXISTS day_transitions_jour ON day_transitions(mat, d)",
    "CREATE TABLE IF NOT EXISTS anomalies (id TEXT PRIMARY KEY, mat TEXT NOT NULL, d TEXT NOT NULL, type TEXT, code TEXT NOT NULL, gravite TEXT NOT NULL, statut TEXT NOT NULL, responsable TEXT, site TEXT, dept TEXT, motif TEXT, action TEXT, detail TEXT, cree TEXT NOT NULL, maj TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS anomalies_statut ON anomalies(statut, d)",
    "CREATE INDEX IF NOT EXISTS anomalies_jour ON anomalies(mat, d)",
    "CREATE TABLE IF NOT EXISTS adjustments (id TEXT PRIMARY KEY, mat TEXT NOT NULL, d_origine TEXT NOT NULL, d_imputation TEXT NOT NULL, compteur TEXT NOT NULL, delta REAL NOT NULL, avant REAL, apres REAL, motif TEXT NOT NULL, justificatif TEXT, auteur TEXT NOT NULL, cree TEXT NOT NULL, statut TEXT NOT NULL, valide_par TEXT, valide_le TEXT)",
    "CREATE INDEX IF NOT EXISTS adjustments_mat ON adjustments(mat, d_imputation)",
    ...(PG ? ["CREATE OR REPLACE TRIGGER day_transitions_immuables BEFORE UPDATE OR DELETE ON day_transitions FOR EACH ROW EXECUTE FUNCTION fiwakti_brut_immuable()",
              "CREATE OR REPLACE FUNCTION fiwakti_ajustement_fige() RETURNS trigger AS $$ BEGIN IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ajustement non supprimable'; END IF; IF NEW.mat <> OLD.mat OR NEW.d_origine <> OLD.d_origine OR NEW.d_imputation <> OLD.d_imputation OR NEW.compteur <> OLD.compteur OR NEW.delta <> OLD.delta OR NEW.motif <> OLD.motif OR NEW.auteur <> OLD.auteur OR OLD.statut <> 'propose' THEN RAISE EXCEPTION 'ajustement non modifiable'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql",
              "CREATE OR REPLACE TRIGGER adjustments_fige BEFORE UPDATE OR DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION fiwakti_ajustement_fige()"]
           : ["CREATE TRIGGER IF NOT EXISTS day_transitions_maj BEFORE UPDATE ON day_transitions BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS day_transitions_sup BEFORE DELETE ON day_transitions BEGIN SELECT RAISE(ABORT, 'historique non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS adjustments_sup BEFORE DELETE ON adjustments BEGIN SELECT RAISE(ABORT, 'ajustement non supprimable'); END",
              "CREATE TRIGGER IF NOT EXISTS adjustments_maj BEFORE UPDATE ON adjustments WHEN NEW.mat <> OLD.mat OR NEW.d_origine <> OLD.d_origine OR NEW.d_imputation <> OLD.d_imputation OR NEW.compteur <> OLD.compteur OR NEW.delta <> OLD.delta OR NEW.motif <> OLD.motif OR NEW.auteur <> OLD.auteur OR OLD.statut <> 'propose' BEGIN SELECT RAISE(ABORT, 'ajustement non modifiable'); END"]),
    /* v53 — recalculs demandés : rapport avant/après, puis références de compteurs versionnées (ajout seul) */
    "CREATE TABLE IF NOT EXISTS recalculs (id TEXT PRIMARY KEY, portee TEXT NOT NULL, cible TEXT, du TEXT NOT NULL, au TEXT NOT NULL, statut TEXT NOT NULL, progression INTEGER NOT NULL DEFAULT 0, nb_emps INTEGER, nb_jours INTEGER, nb_ecarts INTEGER, resume TEXT, erreur TEXT, cree TEXT NOT NULL, par TEXT NOT NULL, valide_par TEXT, valide_le TEXT)",
    "CREATE TABLE IF NOT EXISTS counter_snapshots (mat TEXT NOT NULL, du TEXT NOT NULL, au TEXT NOT NULL, version INTEGER NOT NULL, valeurs TEXT NOT NULL, recalcul_id TEXT, cree TEXT NOT NULL, PRIMARY KEY(mat, du, au, version))",
    ...(PG ? ["CREATE OR REPLACE TRIGGER counter_snapshots_immuables BEFORE UPDATE OR DELETE ON counter_snapshots FOR EACH ROW EXECUTE FUNCTION fiwakti_brut_immuable()"]
           : ["CREATE TRIGGER IF NOT EXISTS counter_snapshots_maj BEFORE UPDATE ON counter_snapshots BEGIN SELECT RAISE(ABORT, 'référence non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS counter_snapshots_sup BEFORE DELETE ON counter_snapshots BEGIN SELECT RAISE(ABORT, 'référence non modifiable'); END"]),
    /* v48 : journal d'audit en ajout seul, garanti par la base elle-même (modification et suppression refusées) */
    ...(PG ? ["CREATE OR REPLACE FUNCTION fiwakti_audit_immuable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'journal d''audit non modifiable'; END $$ LANGUAGE plpgsql",
              "CREATE OR REPLACE TRIGGER audit_immuable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION fiwakti_audit_immuable()"]
           : ["CREATE TRIGGER IF NOT EXISTS audit_immuable_maj BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'journal d''audit non modifiable'); END",
              "CREATE TRIGGER IF NOT EXISTS audit_immuable_sup BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'journal d''audit non modifiable'); END"]),
    "CREATE INDEX IF NOT EXISTS calc_jour_dept ON calc_jour(dept, d)"
  ];
}
const enPg = sql => { let i = 0; return sql.replace(/\?/g, ()=>"$"+(++i)); };

async function ouvrir(cfg, dossier){
  if (cfg && cfg.type === "pg") return ouvrirPg(cfg, dossier);
  return ouvrirSqlite(path.join(dossier, "fiwakti.db"), dossier);
}

/* ---------------- SQLite (poste unique, petits effectifs) ---------------- */
function ouvrirSqlite(fichier, dossier){
  const { DatabaseSync } = require("node:sqlite");
  const d = new DatabaseSync(fichier);
  d.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
  schema("sqlite").forEach(s=>d.exec(s));
  /* v56.2 : colonne « mois » des événements normalisés (installations antérieures) */
  if (!d.prepare("PRAGMA table_info(normalized_events)").all().some(c=>c.name === "mois")) d.exec("ALTER TABLE normalized_events ADD COLUMN mois TEXT");
  if (!d.prepare("PRAGMA table_info(calc_jour)").all().some(c=>c.name === "nmv")){ d.exec("DROP TABLE calc_jour"); schema("sqlite").filter(s=>/calc_jour/.test(s)).forEach(s=>d.exec(s)); }
  const prep = new Map();
  const st = sql => { let p = prep.get(sql); if (!p){ p = d.prepare(sql); prep.set(sql, p); } return p; };
  const als = new AsyncLocalStorage();
  let verrou = null;
  const attendre = async () => { while (verrou && !als.getStore()) await verrou; };
  const B = {
    type:"sqlite", fichier, enTravail(fn){ return fn(); },
    partitions:async ()=>({creees:0, ignorees:[], tables:[]}), lignesParDefaut:async ()=>({}),
    async get(sql, ...a){ await attendre(); return st(sql).get(...a) || null; },
    async all(sql, ...a){ await attendre(); return st(sql).all(...a); },
    async run(sql, ...a){ await attendre(); const r = st(sql).run(...a); return {n:r.changes}; },
    async exec(sql){ await attendre(); d.exec(sql); },
    async transaction(fn){
      if (als.getStore()) return fn(B);
      await attendre();
      let lib; verrou = new Promise(r=>lib = r);
      d.exec("BEGIN");
      try { const r = await als.run(true, ()=>fn(B)); d.exec("COMMIT"); return r; }
      catch(e){ try { d.exec("ROLLBACK"); } catch(x){} throw e; }
      finally { verrou = null; lib(); }
    },
    async fermer(){ try { d.close(); } catch(e){} },
    async taille(){ return ["", "-wal"].reduce((s, x)=>{ try { return s + fs.statSync(fichier+x).size; } catch(e){ return s; } }, 0); },
    /* sauvegarde : copie cohérente de la base */
    async exporter(dest){ d.exec("VACUUM INTO '"+dest.replace(/'/g,"''")+"'"); return dest; },
    async verifierExport(f, attendus){
      const tmp = path.join(os.tmpdir(), "fiwakti-essai-"+crypto.randomBytes(4).toString("hex")+".db");
      try {
        fs.copyFileSync(f, tmp);
        const x = new DatabaseSync(tmp, {readOnly:true});
        const integ = Object.values(x.prepare("PRAGMA integrity_check").get())[0];
        const n = {}; for (const t of TABLES){ try { n[t] = x.prepare("SELECT COUNT(*) n FROM "+t).get().n; } catch(e){ n[t] = 0; } }
        let illisibles = 0; x.prepare("SELECT valeur FROM kv").all().forEach(r=>{ try { JSON.parse(r.valeur); } catch(e){ illisibles++; } });
        x.close();
        if (integ !== "ok") return {ok:false, motif:"intégrité : "+integ};
        for (const t of ["kv","enreg","comptes"]) if (attendus && attendus[t] !== undefined && n[t] !== attendus[t]) return {ok:false, motif:t+" : "+n[t]+" lignes au lieu de "+attendus[t]};
        if (illisibles) return {ok:false, motif:illisibles+" document(s) illisible(s)"};
        return {ok:true, lignes:n};
      } catch(e){ return {ok:false, motif:e.message}; }
      finally { try { fs.unlinkSync(tmp); } catch(e){} }
    },
    async restaurer(f){
      d.close();
      ["-wal","-shm"].forEach(x=>{ try { fs.unlinkSync(fichier+x); } catch(e){} });
      fs.copyFileSync(f, fichier);
      return ouvrirSqlite(fichier, dossier);
    },
    extension:".db"
  };
  return B;
}

/* ---------------- v56.2 : partitions mensuelles (PostgreSQL) ----------------
   Tables partitionnées par intervalle mensuel sur une colonne texte (date ISO ou « AAAA-MM ») :
   une partition par mois, de 24 mois en arrière à 3 mois en avance, plus une partition par défaut
   qui reçoit toute ligne hors plage (aucune écriture ne peut échouer faute de partition). */
const PARTITIONNEES = [["calc_jour","d"], ["day_transitions","d"], ["normalized_events","mois"], ["raw_events","reception_ts_utc"]];
function moisDecale(k){ const n = new Date(); const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + k, 1)); return d.toISOString().slice(0, 7); }
/* partition par défaut de chaque table partitionnée (créée seulement si la table l'est : une installation antérieure
   garde ses tables ordinaires) */
async function creerDefauts(q){
  for (const [t] of PARTITIONNEES){
    const est = await q("SELECT 1 FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = $1 AND c.relnamespace = current_schema()::regnamespace", [t]);
    if (est.rows.length) await q("CREATE TABLE IF NOT EXISTS "+t+"_defaut PARTITION OF "+t+" DEFAULT");
  }
}
async function assurerPartitions(pool, avant, apres){
  const res = {creees:0, ignorees:[], tables:[]};
  for (const [t, col] of PARTITIONNEES){
    const est = await pool.query("SELECT 1 FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = $1 AND c.relnamespace = current_schema()::regnamespace", [t]);
    if (!est.rows.length) continue;
    res.tables.push(t);
    for (let k = -(avant || 24); k <= (apres || 3); k++){
      const m = moisDecale(k), s = moisDecale(k + 1), nom = t+"_p"+m.replace("-", "");
      const ex = await pool.query("SELECT 1 FROM pg_class WHERE relname = $1 AND relnamespace = current_schema()::regnamespace", [nom]);
      if (ex.rows.length) continue;
      /* des lignes de ce mois déjà dans la partition par défaut : partition non créée (signalé), aucune donnée déplacée */
      const def = await pool.query("SELECT 1 FROM "+t+"_defaut WHERE "+col+" >= $1 AND "+col+" < $2 LIMIT 1", [m, s]);
      if (def.rows.length){ res.ignorees.push(nom); continue; }
      await pool.query("CREATE TABLE IF NOT EXISTS "+nom+" PARTITION OF "+t+" FOR VALUES FROM ('"+m+"') TO ('"+s+"')");
      res.creees++;
    }
  }
  return res;
}
async function lignesParDefaut(pool){
  const o = {};
  /* les événements invalides (horodatage futur ou illisible) sont attendus dans la partition par défaut : non comptés */
  for (const [t] of PARTITIONNEES){ try { o[t] = Number((await pool.query("SELECT COUNT(*) n FROM "+t+"_defaut"+(t === "normalized_events" ? " WHERE statut <> 'INVALID'" : ""))).rows[0].n); } catch(e){} }
  return o;
}

/* ---------------- PostgreSQL (recommandé) ---------------- */
async function ouvrirPg(cfg, dossier){
  const { Pool } = require("pg");
  /* v56.23 : deux réserves de connexions — requêtes des utilisateurs avec un délai SQL maximal côté PostgreSQL
     (statement_timeout, 30 s par défaut : une requête qui dépasse est annulée par la base, pas seulement abandonnée) ;
     travaux de fond (planificateur, recalculs, migrations, sauvegardes) avec un délai long (30 min) */
  const delaiApi = Number(process.env.FIWAKTI_SQL_API_MS) || Number(cfg.delaiSqlMs) || 30000;
  const opts = {connectionString:cfg.url, idleTimeoutMillis:30000, connectionTimeoutMillis:8000, lock_timeout:10000, ssl:cfg.ssl ? {rejectUnauthorized:cfg.ssl !== "sans-verification"} : false};
  const pool = new Pool(Object.assign({}, opts, {max:cfg.max || 10, statement_timeout:delaiApi}));
  const poolTravaux = new Pool(Object.assign({}, opts, {max:Math.max(2, Math.ceil((cfg.max || 10) / 3)), statement_timeout:Number(cfg.delaiSqlTravauxMs) || 1800000}));
  poolTravaux.on("error", e=>{ try { process.emitWarning("PostgreSQL : connexion inactive interrompue ("+(e.code||e.message)+")"); } catch(x){} });
  /* v56.15 : une connexion inactive coupée par PostgreSQL (arrêt, redémarrage, réseau) ne doit jamais arrêter le serveur :
     l'erreur est signalée, la connexion est écartée et le pool en ouvre une nouvelle à la requête suivante */
  pool.on("error", e=>{ try { process.emitWarning("PostgreSQL : connexion inactive interrompue ("+(e.code||e.message)+")"); } catch(x){} });
  const c0 = await pool.connect(); c0.release();
  for (const s of schema("pg")) await pool.query(s);
  /* v56.2 : colonne « mois » (installations antérieures, tables non partitionnées) et partitions mensuelles */
  await creerDefauts((s, p)=>pool.query(s, p));
  await pool.query("ALTER TABLE normalized_events ADD COLUMN IF NOT EXISTS mois TEXT");
  { const part = (await pool.query("SELECT 1 FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = 'normalized_events' AND c.relnamespace = current_schema()::regnamespace")).rows.length;
    const idx = ["CREATE INDEX IF NOT EXISTS normalized_events_cle2 ON normalized_events(idempotency_key)", "CREATE INDEX IF NOT EXISTS normalized_events_ptg ON normalized_events(ptg_id)"];
    if (part) for (const s of idx) await pool.query(s);                                  /* tables neuves : instantané */
    else setTimeout(async ()=>{ for (const s of idx.slice(1)) try { await pool.query(s.replace("INDEX IF NOT EXISTS", "INDEX CONCURRENTLY IF NOT EXISTS")); } catch(e){} }, 20000); }
  try { await assurerPartitions(pool); } catch(e){ console.error("partitions : "+e.message); }
  const col = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='calc_jour' AND column_name='nmv' AND table_schema=current_schema()");
  if (!col.rows.length){ await pool.query("DROP TABLE calc_jour"); for (const s of schema("pg").filter(x=>/calc_jour/.test(x))) await pool.query(s); await creerDefauts((s, p)=>pool.query(s, p)); }
  const als = new AsyncLocalStorage(), travail = new AsyncLocalStorage();
  const reserve = () => travail.getStore() ? poolTravaux : pool;
  const cible = () => als.getStore() || reserve();
  const B = {
    type:"pg", url:cfg.url, pool, poolTravaux, delaiApi,
    /* exécute fn comme travail de fond : ses requêtes passent par la réserve à délai long */
    enTravail(fn){ return travail.run(true, fn); },
    partitions:(avant, apres)=>assurerPartitions(pool, avant, apres), lignesParDefaut:()=>lignesParDefaut(pool),
    async get(sql, ...a){ const r = await cible().query(enPg(sql), a); return r.rows[0] || null; },
    async all(sql, ...a){ const r = await cible().query(enPg(sql), a); return r.rows; },
    async run(sql, ...a){ const r = await cible().query(enPg(sql), a); return {n:r.rowCount}; },
    async exec(sql){ await cible().query(sql); },
    /* une transaction à la fois : les écritures FIWAKTI sont brèves, et l'ordre reste simple à suivre */
    async transaction(fn){
      if (als.getStore()) return fn(B);
      const c = await reserve().connect();
      try { await c.query("BEGIN"); const r = await als.run(c, ()=>fn(B)); await c.query("COMMIT"); return r; }
      catch(e){ try { await c.query("ROLLBACK"); } catch(x){} throw e; }
      finally { c.release(); }
    },
    async fermer(){ await pool.end(); try { await poolTravaux.end(); } catch(e){} },
    async taille(){ const r = await pool.query("SELECT pg_database_size(current_database()) t"); return Number(r.rows[0].t); },
    /* sauvegarde logique : chaque table en lignes JSON compressées ; indépendante de pg_dump */
    async exporter(dest){
      const gz = zlib.createGzip({level:6}), out = fs.createWriteStream(dest);
      gz.pipe(out);
      const ecrire = s => new Promise(r=>{ if (!gz.write(s)) gz.once("drain", r); else r(); });
      await ecrire(JSON.stringify({format:"fiwakti-pg-1", tables:TABLES})+"\n");
      for (const t of TABLES){
        await ecrire(JSON.stringify({table:t})+"\n");
        /* 56.33.9 : lecture par lots en avançant sur la clé (et non plus par OFFSET, de plus en plus lent), sur la réserve
           à délai long : la sauvegarde d'une base de plusieurs centaines de milliers de badgeages était annulée au bout
           de 30 s (« annulation de la requête à cause du délai écoulé »), ce qui bloquait aussi les mises à jour */
        const cols = String(CLES[t] || "id").split(",").map(x=>x.trim()).filter(Boolean), lot = 20000, db = poolTravaux;
        let dernier = null;
        for (;;){
          const cond = dernier ? " WHERE ("+cols.join(", ")+") > ("+cols.map((c, i)=>"$"+(i+1)).join(", ")+")" : "";
          const r = await db.query("SELECT * FROM "+t+cond+" ORDER BY "+cols.join(", ")+" LIMIT "+lot, dernier || []);
          if (!r.rows.length) break;
          let buf = ""; for (const row of r.rows) buf += JSON.stringify(row)+"\n";
          await ecrire(buf); const z = r.rows[r.rows.length-1]; dernier = cols.map(c=>z[c]);
          if (r.rows.length < lot) break;
        }
      }
      await new Promise((ok, ko)=>{ out.on("finish", ok); out.on("error", ko); gz.end(); });
      return dest;
    },
    /* restauration d'essai dans un schéma temporaire, puis suppression */
    async verifierExport(f, attendus){
      const sch = "verif_"+crypto.randomBytes(4).toString("hex");
      const c = await pool.connect();
      try {
        await c.query("CREATE SCHEMA "+sch);
        await c.query("SET search_path TO "+sch);
        for (const s of schema("pg")) await c.query(s.replace(/ON (\w+)\(/, "ON "+sch+".$1(").replace(/INDEX IF NOT EXISTS (\w+)/, "INDEX IF NOT EXISTS "+sch+"_$1"));
        await creerDefauts((s, p)=>c.query(s, p));
        const n = await chargerFichier(c, f, sch);
        const cpt = {};
        for (const t of TABLES){ const r = await c.query("SELECT COUNT(*) n FROM "+sch+"."+t); cpt[t] = Number(r.rows[0].n); }
        let illisibles = 0;
        (await c.query("SELECT valeur FROM "+sch+".kv")).rows.forEach(r=>{ try { JSON.parse(r.valeur); } catch(e){ illisibles++; } });
        for (const t of ["kv","enreg","comptes"]) if (attendus && attendus[t] !== undefined && cpt[t] !== attendus[t]) return {ok:false, motif:t+" : "+cpt[t]+" lignes au lieu de "+attendus[t]};
        if (illisibles) return {ok:false, motif:illisibles+" document(s) illisible(s)"};
        return {ok:true, lignes:cpt};
      } catch(e){ return {ok:false, motif:e.message}; }
      finally { try { await c.query("SET search_path TO public"); await c.query("DROP SCHEMA IF EXISTS "+sch+" CASCADE"); } catch(e){} c.release(); }
    },
    async restaurer(f){
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const t of TABLES) await c.query("TRUNCATE "+t+(t === "audit" ? " RESTART IDENTITY" : ""));
        await chargerFichier(c, f, "public");
        await c.query("SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT MAX(id) FROM audit), 0) + 1, false)");
        await c.query("COMMIT");
      } catch(e){ await c.query("ROLLBACK"); throw e; }
      finally { c.release(); }
      return B;
    },
    extension:".pgjson.gz"
  };
  return B;
}
async function chargerFichier(c, f, sch){
  const texte = zlib.gunzipSync(fs.readFileSync(f)).toString("utf8");
  let table = null, cols = null, lot = [], n = 0;
  const vider = async () => {
    if (!lot.length) return;
    const vals = [], ph = [];
    lot.forEach((row, i)=>{ ph.push("("+cols.map((_, j)=>"$"+(i*cols.length+j+1)).join(",")+")"); cols.forEach(k=>vals.push(row[k])); });
    await c.query("INSERT INTO "+sch+"."+table+" ("+cols.join(",")+") VALUES "+ph.join(","), vals);
    n += lot.length; lot = [];
  };
  let debut = 0;
  const lignes = texte.split("\n");
  for (let i = 1; i < lignes.length; i++){
    const l = lignes[i]; if (!l) continue;
    const o = JSON.parse(l);
    if (o && o.table && Object.keys(o).length === 1){ await vider(); table = o.table; cols = null; continue; }
    if (!cols) cols = Object.keys(o);
    lot.push(o);
    if (lot.length * cols.length >= 30000) await vider();
  }
  await vider();
  return n;
}
/* copie complète d'une base vers une autre (passage de SQLite à PostgreSQL), par lots */
const CLES = {kv:"cle", comptes:"login", sessions:"id", audit:"id", meta:"k", bases:"id", enreg:"coll, id", calc_jour:"mat, d",
  ingestion_queue:"id", raw_events:"raw_event_id", normalized_events:"id", event_retransmissions:"id", event_keys:"idempotency_key",
  day_states:"mat, d", day_transitions:"id", anomalies:"id", adjustments:"id", recalculs:"id", counter_snapshots:"mat, du, au, version"};
async function copier(src, dst, progression){
  const n = {};
  for (const t of TABLES){
    await dst.run("DELETE FROM "+t);
    n[t] = 0;
    for (let off = 0; ; off += 5000){
      const lignes = await src.all("SELECT * FROM "+t+" ORDER BY "+CLES[t]+" LIMIT 5000 OFFSET "+off);
      if (!lignes.length) break;
      const cols = Object.keys(lignes[0]);
      await dst.transaction(async ()=>{
        for (let i = 0; i < lignes.length; i += 500){
          const lot = lignes.slice(i, i+500);
          const ph = lot.map(()=>"("+cols.map(()=>"?").join(",")+")").join(",");
          const vals = []; lot.forEach(r=>cols.forEach(k=>vals.push(r[k])));
          await dst.run("INSERT INTO "+t+" ("+cols.join(",")+") VALUES "+ph, ...vals);
        }
      });
      n[t] += lignes.length;
      if (progression) progression(t, n[t]);
      if (lignes.length < 5000) break;
    }
  }
  if (dst.type === "pg") await dst.exec("SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT MAX(id) FROM audit), 0) + 1, false)");
  return n;
}
module.exports = {ouvrir, copier, TABLES, ajouterModule, schema, PARTITIONNEES};
