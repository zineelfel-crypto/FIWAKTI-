const {DatabaseSync}=require("node:sqlite"), fs=require("fs");
const B={ancienne:"C:/FIWAKTI-56.34.1-ancien/donnees/fiwakti.db", nouvelle:"C:/FIWAKTI/donnees/fiwakti.db"};
if (process.argv[2]) { B.ancienne=process.argv[2]; B.nouvelle=process.argv[3]; }
const res={};
for (const [n,f] of Object.entries(B)){
  if (!fs.existsSync(f)){ console.log(n+" : pas de fichier "+f+" (base PostgreSQL ?)"); continue; }
  const db=new DatabaseSync(f,{readOnly:true}), q=(s)=>{ try { return db.prepare(s).all(); } catch(e){ return []; } };
  const r={}; q("SELECT coll, COUNT(*) n FROM enreg GROUP BY coll").forEach(x=>r[x.coll]=Number(x.n));
  r.badgeages_bruts=Number((q("SELECT COUNT(*) n FROM raw_events")[0]||{}).n||0);
  const p=q("SELECT MIN(d) a, MAX(d) b FROM enreg WHERE coll='ptg'")[0]||{}; r.ptg_du=p.a; r.ptg_au=p.b;
  res[n]=r;
  if (n==="ancienne"){ console.log("Historique de l'ancienne installation :");
    q("SELECT ts,login,action,detail,ip FROM audit WHERE action LIKE 'mise_a_jour%' OR action='installation' OR action LIKE 'reprise%' ORDER BY id").forEach(x=>console.log("  ",x.ts,x.login,x.action,x.detail,x.ip||"")); }
}
console.log("\nComparaison (nombre d'enregistrements) :");
const cles=[...new Set(Object.values(res).flatMap(Object.keys))];
console.table(Object.fromEntries(cles.map(k=>[k,{ancienne:res.ancienne&&res.ancienne[k], nouvelle:res.nouvelle&&res.nouvelle[k]}])));
