#!/usr/bin/env node
/* FIWAKTI — vérification des homonymes (LECTURE SEULE : rien n'est modifié).

   node verifier-homonymes.js [--url http://localhost:8080] [--login admin]

   Le mot de passe est demandé (ou variable FIWAKTI_MDP). Le script lit la liste des salariés page par page et affiche :
   - le nombre de salariés et leur origine probable (jeu DÉMO du workflow : matricules 9001 à 9008 ; données fictives
     du banc d'essai : matricules 100001 et suivants ; autres) ;
   - les homonymes exacts (même nom et même prénom, matricules différents), avec leurs matricules ;
   - les noms qui ne diffèrent que par un numéro (ex. « Ayari 1 Fatma » et « Ayari 101 Fatma ») ;
   - les salariés DÉMO qui portent le même nom qu'un salarié existant.
   Un rapport complet est écrit dans homonymes-<date>.csv, à côté du script. */
"use strict";
const fs = require("fs"), path = require("path"), readline = require("readline");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const URL_B = String(arg("--url", "http://localhost:8080")).replace(/\/+$/, ""), LOGIN = arg("--login", "admin");
let COOKIE = "";

function demanderMdp(){
  if (process.env.FIWAKTI_MDP) return Promise.resolve(process.env.FIWAKTI_MDP);
  return new Promise(ok=>{
    const rl = readline.createInterface({input:process.stdin, output:process.stdout, terminal:true});
    rl._writeToOutput = function(s){ if (/Mot de passe/.test(s)) rl.output.write(s); else rl.output.write("*"); };
    rl.question("Mot de passe de « "+LOGIN+" » : ", m=>{ rl.close(); process.stdout.write("\n"); ok(m); });
  });
}
async function lire(chemin){
  const r = await fetch(URL_B + chemin, {headers:{Cookie:COOKIE}});
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch(e){}
  if (!r.ok) throw new Error("GET "+chemin+" : "+r.status+" "+((j && (j.message || j.erreur)) || t.slice(0, 200)));
  return j;
}
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const origine = m => { const n = Number(m); return n >= 9001 && n <= 9008 ? "DÉMO workflow" : n >= 100001 && n <= 199999 ? "fictif (banc d'essai)" : "autre"; };

(async()=>{
  const mdp = await demanderMdp();
  const r = await fetch(URL_B+"/api/v1/connexion", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({login:LOGIN, mdp})});
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error("connexion refusée ("+r.status+") : "+(j.message || j.erreur || ""));
  COOKIE = (r.headers.get("set-cookie") || "").split(";")[0];
  if (j.a2f) throw new Error("ce compte utilise la double authentification : utilisez un compte administrateur sans double authentification");

  /* lecture de tous les salariés (actifs et sortis), 500 par page */
  const tous = [];
  for (let off = 0; ; off += 500){
    const p = await lire("/api/v1/employes?limit=500&tri=mat&offset="+off);
    tous.push(...(p.lignes || []));
    process.stdout.write("\rLecture des salariés : "+tous.length+" / "+p.total);
    if (!p.lignes || !p.lignes.length || tous.length >= p.total) break;
  }
  process.stdout.write("\n\n");

  const parOrig = {}; tous.forEach(e=>{ const o = origine(e.mat); parOrig[o] = (parOrig[o] || 0) + 1; });
  console.log("Salariés : "+tous.length);
  Object.keys(parOrig).forEach(o=>console.log("  - "+o.padEnd(22)+" : "+parOrig[o]));
  const mats = new Map(); tous.forEach(e=>mats.set(String(e.mat), (mats.get(String(e.mat)) || 0) + 1));
  const matsDoubles = Array.from(mats.entries()).filter(x=>x[1] > 1);
  console.log("Matricules en double : "+(matsDoubles.length ? matsDoubles.map(x=>x[0]).join(", ") : "aucun"));

  /* homonymes exacts */
  const groupes = new Map();
  tous.forEach(e=>{ const k = norm(e.nom)+"|"+norm(e.prenom); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(e); });
  const exacts = Array.from(groupes.values()).filter(g=>g.length > 1);
  console.log("\nHomonymes exacts (même nom et même prénom) : "+exacts.length+" groupe(s)");
  exacts.slice(0, 30).forEach(g=>console.log("  - "+(g[0].nom+" "+g[0].prenom).padEnd(30)+" matricules "+g.map(e=>e.mat+" ("+origine(e.mat)+")").join(", ")));
  if (exacts.length > 30) console.log("  … (liste complète dans le fichier CSV)");

  /* noms qui ne diffèrent que par un numéro */
  const sansNum = new Map();
  tous.forEach(e=>{ const k = norm(String(e.nom).replace(/\s*\d+\s*/g, " "))+"|"+norm(e.prenom); if (!sansNum.has(k)) sansNum.set(k, []); sansNum.get(k).push(e); });
  const numerotes = Array.from(sansNum.values()).filter(g=>g.length > 1 && g.some(e=>/\d/.test(e.nom)));
  console.log("\nNoms identiques à un numéro près (données fictives numérotées) : "+numerotes.length+" groupe(s), "+numerotes.reduce((a, g)=>a + g.length, 0)+" salarié(s)");
  numerotes.slice(0, 5).forEach(g=>console.log("  - ex. "+g.slice(0, 4).map(e=>e.nom+" "+e.prenom+" ("+e.mat+")").join(" ; ")+(g.length > 4 ? " … ("+g.length+" au total)" : "")));

  /* salariés DÉMO homonymes d'un salarié existant */
  const demo = tous.filter(e=>origine(e.mat) === "DÉMO workflow");
  const conflitsDemo = demo.map(d=>({d, autres:(groupes.get(norm(d.nom)+"|"+norm(d.prenom)) || []).filter(e=>e.mat !== d.mat)})).filter(x=>x.autres.length);
  console.log("\nSalariés DÉMO du workflow : "+demo.length+" ; homonymes d'un salarié existant : "+(conflitsDemo.length ? conflitsDemo.map(x=>x.d.prenom+" "+x.d.nom+" ("+x.d.mat+") = "+x.autres.map(e=>e.mat).join(", ")).join(" ; ") : "aucun"));

  const f = path.join(__dirname, "homonymes-"+new Date().toISOString().slice(0, 10)+".csv");
  const lignes = ["GROUPE;TYPE;MATRICULE;NOM;PRENOM;ORIGINE"];
  exacts.forEach((g, i)=>g.forEach(e=>lignes.push([i + 1, "exact", e.mat, e.nom, e.prenom, origine(e.mat)].join(";"))));
  numerotes.forEach((g, i)=>g.forEach(e=>lignes.push(["N"+(i + 1), "à un numéro près", e.mat, e.nom, e.prenom, origine(e.mat)].join(";"))));
  fs.writeFileSync(f, "﻿"+lignes.join("\r\n"));
  console.log("\nRapport complet : "+f+"\nAucune donnée n'a été modifiée.");
})().catch(e=>{ console.error("\nÉCHEC : "+e.message); process.exit(1); });
