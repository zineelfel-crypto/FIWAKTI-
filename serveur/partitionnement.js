/* FIWAKTI v56.4 — migration d'une base PostgreSQL existante vers le stockage partitionné par mois (lot 1b).
   Lancée par l'administrateur, en maintenance courte : écritures et normalisation suspendues (les pointeuses continuent
   d'être reçues dans la file d'ingestion, rien n'est perdu), copie table par table vers une table partitionnée, contrôle
   des volumes mois par mois (0 écart exigé), bascule atomique ; les anciennes tables restent (suffixe _v561) jusqu'à
   ce que l'administrateur termine la migration. Une sauvegarde vérifiée est faite avant. */
"use strict";
const BD = require("./bd.js");
const COL = {raw_events:"reception_ts_utc", normalized_events:"mois", day_transitions:"d", calc_jour:"d"};
function creer(o){
  const {B, audit, journal, sauvegarder, pause} = o;
  const etat = {statut:"inactif", etapes:[], debut:null, fin:null, erreur:null};
  const q = (s, p) => B.pool.query(s, p);
  async function partitionnee(t){ return (await q("SELECT 1 FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = $1 AND c.relnamespace = current_schema()::regnamespace", [t])).rows.length > 0; }
  async function existe(t){ return (await q("SELECT 1 FROM pg_class WHERE relname = $1 AND relnamespace = current_schema()::regnamespace", [t])).rows.length > 0; }
  async function diagnostic(){
    if (!B || B.type !== "pg") return {applicable:false, motif:"Base intégrée : partitionnement réservé à PostgreSQL."};
    const t = [];
    for (const n of Object.keys(COL)) t.push({table:n, partitionnee:await partitionnee(n), anciennes:await existe(n+"_v561"),
      lignes:Number((await q("SELECT reltuples::bigint n FROM pg_class WHERE relname=$1 AND relnamespace = current_schema()::regnamespace", [n])).rows[0]?.n || 0)});
    return {applicable:true, tables:t, aMigrer:t.filter(x=>!x.partitionnee).map(x=>x.table), aTerminer:t.filter(x=>x.anciennes).map(x=>x.table), etat};
  }
  /* DDL de la table partitionnée, tirée du schéma de référence (même définition que pour une installation neuve) */
  function ddl(t, nom){
    const s = BD.schema("pg").find(x=>x.indexOf("CREATE TABLE IF NOT EXISTS "+t+" (") === 0);
    return s.replace("CREATE TABLE IF NOT EXISTS "+t+" (", "CREATE TABLE "+nom+" (");
  }
  const etape = (m) => { etat.etapes.push({t:new Date().toISOString(), m}); journal("partitionnement : "+m); };
  async function migrerTable(t){
    const col = COL[t], nouv = t+"_part";
    if (await existe(nouv)) await q("DROP TABLE "+nouv+" CASCADE");
    await q(ddl(t, nouv));
    await q("CREATE TABLE "+t+"_defaut_n PARTITION OF "+nouv+" DEFAULT");
    /* partitions mensuelles couvrant les données existantes et 3 mois d'avance, nommées comme dans une installation neuve */
    const expr = t === "normalized_events" ? "COALESCE(mois, substr(COALESCE(work_date, ts_local, created_at), 1, 7))" : "substr("+col+", 1, 7)";
    const bornes = (await q("SELECT MIN("+expr+") a, MAX("+expr+") b FROM "+t+" WHERE "+expr+" ~ '^[0-9]{4}-[0-9]{2}$'")).rows[0];
    const n = new Date(), fin = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 3, 1)).toISOString().slice(0, 7);
    let m = bornes.a || n.toISOString().slice(0, 7); const max = bornes.b && bornes.b > fin ? bornes.b : fin; let k = 0;
    while (m <= max && k < 600){ const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 7);
      if (!(await existe(t+"_p"+m.replace("-", "")))) await q("CREATE TABLE "+t+"_p"+m.replace("-", "")+" PARTITION OF "+nouv+" FOR VALUES FROM ('"+m+"') TO ('"+d+"')");
      m = d; k++; }
    /* copie */
    const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema = current_schema() ORDER BY ordinal_position", [nouv])).rows.map(r=>r.column_name);
    const anc = new Set((await q("SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema = current_schema()", [t])).rows.map(r=>r.column_name));
    const sel = cols.map(c=>c === "mois" && t === "normalized_events" ? expr+" AS mois" : (anc.has(c) ? c : "NULL")).join(", ");
    await q("INSERT INTO "+nouv+" ("+cols.join(", ")+") SELECT "+sel+" FROM "+t);
    /* contrôle : volumes identiques, mois par mois */
    const a = (await q("SELECT "+expr+" m, COUNT(*) n FROM "+t+" GROUP BY 1")).rows, b = (await q("SELECT "+(t === "normalized_events" ? "mois" : "substr("+col+", 1, 7)")+" m, COUNT(*) n FROM "+nouv+" GROUP BY 1")).rows;
    const ka = {}; a.forEach(r=>{ ka[r.m || "∅"] = Number(r.n); }); const kb = {}; b.forEach(r=>{ kb[r.m || "∅"] = Number(r.n); });
    const ecarts = Object.keys(Object.assign({}, ka, kb)).filter(x=>(ka[x]||0) !== (kb[x]||0));
    const total = a.reduce((s, r)=>s + Number(r.n), 0);
    if (ecarts.length) throw new Error(t+" : écart de volume sur "+ecarts.slice(0, 5).join(", "));
    /* bascule */
    /* bascule atomique (une seule transaction sur une seule connexion) */
    const idx = (await q("SELECT indexname FROM pg_indexes WHERE tablename=$1 AND schemaname = current_schema()", [t])).rows.map(r=>r.indexname);
    const c = await B.pool.connect();
    try { await c.query("BEGIN");
      await c.query("ALTER TABLE "+t+" RENAME TO "+t+"_v561");
      for (const i of idx) await c.query("ALTER INDEX "+i+" RENAME TO "+i.slice(0, 50)+"_v561");
      await c.query("ALTER TABLE "+nouv+" RENAME TO "+t);
      await c.query("ALTER TABLE "+t+"_defaut_n RENAME TO "+t+"_defaut");
      await c.query("COMMIT");
    } catch(e){ try { await c.query("ROLLBACK"); } catch(x){} throw e; } finally { c.release(); }
    etape(t+" : "+total+" ligne(s) copiée(s), volumes identiques mois par mois, bascule faite");
    return total;
  }
  async function lancer(login){
    if (etat.statut === "en_cours") throw Object.assign(new Error("Migration déjà en cours."), {code:409});
    const dg = await diagnostic(); if (!dg.applicable) throw Object.assign(new Error(dg.motif), {code:400});
    if (!dg.aMigrer.length) throw Object.assign(new Error("Toutes les tables sont déjà partitionnées."), {code:409});
    Object.assign(etat, {statut:"en_cours", etapes:[], debut:new Date().toISOString(), fin:null, erreur:null, par:login});
    await audit(login, "partitionnement.lance", dg.aMigrer.join(", "));
    B.enTravail(async ()=>{
      if (pause) pause(true);
      try {
        if (sauvegarder){ etape("sauvegarde vérifiée avant migration"); await sauvegarder(); }
        for (const t of dg.aMigrer) await migrerTable(t);
        /* schéma de référence réappliqué : index, déclencheurs d'immutabilité, partitions par défaut */
        for (const s of BD.schema("pg")) await q(s);
        const n = await q("INSERT INTO event_keys(idempotency_key, mois, normalized_id, cree) SELECT idempotency_key, mois, id, created_at FROM normalized_events WHERE idempotency_key IS NOT NULL AND statut <> 'REPLAYED' ON CONFLICT DO NOTHING");
        etape("clés d'idempotence reprises : "+n.rowCount);
        if (B.partitions) await B.partitions();
        etat.statut = "termine"; etat.fin = new Date().toISOString();
        await audit(login, "partitionnement.termine", etat.etapes.map(e=>e.m).join(" | ").slice(0, 900));
      } catch(e){
        etat.statut = "erreur"; etat.erreur = e.message; etat.fin = new Date().toISOString();
        for (const t of Object.keys(COL)) try { await q("DROP TABLE IF EXISTS "+t+"_part CASCADE"); } catch(x){}
        await audit(login, "partitionnement.erreur", e.message);
      } finally { if (pause) pause(false); }
    });
    return {ok:true, etat};
  }
  /* fin de migration : suppression des anciennes tables (après vérification par l'administrateur) */
  async function terminer(login){
    const dg = await diagnostic(); if (!dg.applicable || !dg.aTerminer.length) throw Object.assign(new Error("Aucune ancienne table à supprimer."), {code:409});
    /* correctif 28 : jamais de suppression sans recomptage — une ancienne table qui a reçu des lignes après la copie (ou
       plus de lignes que la table partitionnée) est gardée */
    const ecarts = [];
    for (const t of dg.aTerminer){ const n0 = Number(((await q("SELECT COUNT(*) n FROM "+t+"_v561")).rows || [])[0].n || 0), n1 = Number(((await q("SELECT COUNT(*) n FROM "+t)).rows || [])[0].n || 0); if (n0 > n1) ecarts.push(t+" ("+n0+" ancienne(s) ligne(s) pour "+n1+")"); }
    if (ecarts.length) throw Object.assign(new Error("Suppression refusée : les anciennes tables contiennent plus de lignes que les nouvelles — "+ecarts.join(", ")+". Relancez la migration ou contactez le support."), {code:409});
    for (const t of dg.aTerminer) await q("DROP TABLE "+t+"_v561 CASCADE");
    await audit(login, "partitionnement.anciennes_tables_supprimees", dg.aTerminer.join(", "));
    return {ok:true, supprimees:dg.aTerminer};
  }
  return {diagnostic, lancer, terminer, enCours:()=>etat.statut === "en_cours", etat};
}
module.exports = {creer};
