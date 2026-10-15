#!/usr/bin/env node
/* FIWAKTI — jeu de démonstration du workflow (tests et démonstrations).

   node demo-workflow.js [--url http://localhost:8080] [--login admin] [--creer | --reinitialiser | --supprimer]

   Le mot de passe de l'administrateur est demandé (ou variable FIWAKTI_MDP). Tout ce qui est créé porte le préfixe
   « demo- » (identifiants) ou « DÉMO » (libellés) et les matricules 9001 à 9008 : rien d'autre n'est modifié.
   - --creer (par défaut)  : crée le jeu (refusé s'il existe déjà) ;
   - --reinitialiser       : supprime puis recrée le jeu — dates recalées sur aujourd'hui (à lancer avant chaque démo) ;
   - --supprimer           : retire tout le jeu (salariés, badgeages, demandes, absences, corrections, comptes,
                             profils, circuits et services de démonstration).

   Contenu :
   - 2 services : « DÉMO — Atelier montage » et « DÉMO — Ressources humaines » ;
   - 3 profils : DÉMO RH, DÉMO Chef d'équipe, DÉMO Employé ;
   - 3 circuits : congé annuel (chef puis RH), maladie (RH), autorisation d'absence (chef), limités aux services DÉMO ;
   - 8 salariés et leurs comptes (premier mot de passe = matricule, à changer à la première connexion) ;
   - 5 jours ouvrés de badgeages avec des situations à traiter (retards, oubli, heures supplémentaires, absence) ;
   - des demandes en attente, une demande acceptée (congé en cours). */
"use strict";
const readline = require("readline");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d; };
const URL_B = String(arg("--url", "http://localhost:8080")).replace(/\/+$/, ""), LOGIN = arg("--login", "admin");
const MODE = process.argv.includes("--supprimer") ? "supprimer" : process.argv.includes("--reinitialiser") ? "reinitialiser" : "creer";
let COOKIE = "", CSRF = "";

function demanderMdp(){
  if (process.env.FIWAKTI_MDP) return Promise.resolve(process.env.FIWAKTI_MDP);
  return new Promise(ok=>{
    const rl = readline.createInterface({input:process.stdin, output:process.stdout, terminal:true});
    rl._writeToOutput = function(s){ if (/Mot de passe/.test(s)) rl.output.write(s); else rl.output.write("*"); };
    rl.question("Mot de passe de « "+LOGIN+" » : ", m=>{ rl.close(); process.stdout.write("\n"); ok(m); });
  });
}
async function appel(methode, chemin, corps){
  const r = await fetch(URL_B + chemin, {method:methode, headers:Object.assign({Cookie:COOKIE, "X-CSRF":CSRF}, corps !== undefined ? {"Content-Type":"application/json"} : {}),
    body:corps === undefined ? undefined : JSON.stringify(corps)});
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch(e){}
  if (!r.ok) throw new Error(methode+" "+chemin+" : "+r.status+" "+((j && (j.message || j.erreur)) || t.slice(0, 200)));
  return j;
}
const pad = n => String(n).padStart(2, "0");
const jourK = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
/* jours ouvrés (lundi à vendredi) avant / après aujourd'hui */
function ouvres(n, sens){ const l = [], d = new Date(); while (l.length < n){ d.setDate(d.getDate() + sens); if (d.getDay() !== 0 && d.getDay() !== 6) l.push(jourK(d)); } return sens < 0 ? l.reverse() : l; }

const D1 = "demo-d1", D2 = "demo-d2", DEPTS = [D1, D2];
const PROFILS = [
  {id:"demo-prRH", nom:"DÉMO RH", niveauMenu:"rh", droits:{EMP:"saisie", CAL:"lecture", PTG:"validation", ABS:"validation", ETA:"config", PAR:"lecture", TER:"aucun", SYS:"aucun"}},
  {id:"demo-prChef", nom:"DÉMO Chef d'équipe", niveauMenu:"avance", droits:{EMP:"lecture", CAL:"lecture", PTG:"saisie", ABS:"validation", ETA:"lecture", PAR:"aucun", TER:"aucun", SYS:"aucun"}},
  {id:"demo-prEmp", nom:"DÉMO Employé", niveauMenu:"simple", droits:{EMP:"aucun", CAL:"aucun", PTG:"lecture", ABS:"saisie", ETA:"aucun", PAR:"aucun", TER:"aucun", SYS:"aucun"}}
].map(p=>Object.assign({mode:"regle", sites:[], depts:[], filtres:{}, inclus:[], exclus:[], sensibles:false, cloture:false, reouverture:false, a2f:false}, p));
const CIRCUITS = [
  {id:"demo-ci1", nom:"DÉMO — Congé annuel (chef puis RH)", types:["t5"], sites:[], depts:DEPTS, niveaux:[{qui:"hier", delai:3}, {qui:"profil:demo-prRH", delai:5}]},
  {id:"demo-ci2", nom:"DÉMO — Congé maladie (RH)", types:["t6"], sites:[], depts:DEPTS, niveaux:[{qui:"profil:demo-prRH", delai:2}]},
  {id:"demo-ci3", nom:"DÉMO — Autorisation d'absence (chef)", types:["t10", "t8"], sites:[], depts:DEPTS, niveaux:[{qui:"hier", delai:2}]}];
/* salariés : [matricule, prénom, nom, service, chef, rôle, compte] */
const SAL = [
  ["9001", "Ines", "Ben Ali", D2, "", "Responsable RH", "rh.demo", "demo-prRH"],
  ["9002", "Karim", "Trabelsi", D1, "", "Chef d'atelier", "chef.demo", "demo-prChef"],
  ["9003", "Sami", "Gharbi", D1, "9002", "Opérateur — journées normales", "9003", "demo-prEmp"],
  ["9004", "Leila", "Mansouri", D1, "9002", "Opératrice — retards", "9004", "demo-prEmp"],
  ["9005", "Youssef", "Jaziri", D1, "9002", "Opérateur — oubli de pointage", "9005", "demo-prEmp"],
  ["9006", "Mariem", "Hammami", D1, "9002", "Opératrice — heures supplémentaires", "9006", "demo-prEmp"],
  ["9007", "Walid", "Khelifi", D1, "9002", "Opérateur — absence non justifiée", "9007", "demo-prEmp"],
  ["9008", "Nour", "Sassi", D1, "9002", "Opératrice — en congé annuel", "9008", "demo-prEmp"]];
const MATS = SAL.map(s=>s[0]);

async function etatActuel(){
  const d = await appel("GET", "/api/v1/donnees");
  const ref = d.ref || {};
  const lot = await appel("POST", "/api/v1/employes/lot", {mats:MATS, ids:[]}).catch(()=>({lignes:[]}));
  return {ref, existants:(lot.lignes || []).map(e=>String(e.mat))};
}
async function supprimer(ref){
  /* enregistrements des salariés DÉMO sur une large fenêtre */
  const du = jourK(new Date(Date.now() - 400 * 864e5)), au = jourK(new Date(Date.now() + 400 * 864e5));
  const p = await appel("GET", "/api/v1/donnees/periode?du="+du+"&au="+au+"&mats="+MATS.join(","));
  const colls = {};
  ["ptg", "dmd", "abs", "corrections", "notifs"].forEach(c=>{ const ids = ((p.colls || {})[c] || []).filter(x=>x && MATS.includes(String(x.mat))).map(x=>x.id); if (ids.length) colls[c] = {del:ids}; });
  colls.emps = {del:SAL.map(s=>"demo-e"+s[0])};
  const r1 = await appel("POST", "/api/v1/donnees/sync", {colls});
  /* comptes, profils, circuits, services : retirés du référentiel (les comptes absents sont désactivés) */
  const sansDemo = l => (l || []).filter(x=>x && !String(x.id || "").startsWith("demo-"));
  const users = (ref.users || []).filter(u=>!String(u.id || "").startsWith("demo-u"));
  const r2 = await appel("POST", "/api/v1/donnees/sync", {ref:{users, profils:sansDemo(ref.profils), circuits:sansDemo(ref.circuits), depts:sansDemo(ref.depts)}});
  const n = Object.values(colls).reduce((a, c)=>a + c.del.length, 0);
  console.log("Jeu de démonstration supprimé : "+n+" enregistrement(s), "+((ref.users||[]).length - users.length)+" compte(s) désactivé(s)."+((r1.ignores||[]).length || (r2.ignores||[]).length ? " (éléments ignorés : "+JSON.stringify([].concat(r1.ignores||[], r2.ignores||[])).slice(0, 200)+")" : ""));
}
async function creer(ref){
  const tt = new Set((ref.tt || []).map(t=>t.id));
  const manquants = ["t0", "t1", "t5", "t6", "t8", "t9", "t10"].filter(x=>!tt.has(x));
  if (manquants.length) console.log("Attention : types de temps absents du paramétrage : "+manquants.join(", ")+" (les scénarios correspondants ne fonctionneront pas).");
  const site = ((ref.sites || [])[0] || {}).id || "s1", cal = ((ref.cals || []).find(c=>c.id === "c1") || (ref.cals || [])[0] || {}).id || "c1";
  const auj = jourK(new Date()), passes = ouvres(5, -1), futurs = ouvres(10, 1);
  /* 1. référentiel : services, profils, circuits (en tête : ils s'appliquent aux seuls services DÉMO) */
  const depts = (ref.depts || []).filter(d=>!DEPTS.includes(d.id)).concat([
    {id:D1, nom:"DÉMO — Atelier montage", parent:null, type:"std", custom_fields:[]},
    {id:D2, nom:"DÉMO — Ressources humaines", parent:null, type:"std", custom_fields:[]}]);
  const profils = (ref.profils || []).filter(p=>!String(p.id).startsWith("demo-")).concat(PROFILS);
  const circuits = CIRCUITS.concat((ref.circuits || []).filter(c=>!String(c.id).startsWith("demo-")));
  let r = await appel("POST", "/api/v1/donnees/sync", {ref:{depts, profils, circuits}});
  if ((r.ignores || []).length || (r.conflits || []).length) throw new Error("paramétrage refusé : "+JSON.stringify({ignores:r.ignores, conflits:r.conflits}).slice(0, 300)+" (lancez le script avec un compte administrateur)");
  /* 2. salariés (avant les comptes : le premier mot de passe d'un compte est le matricule de son salarié) */
  const emps = SAL.map(([mat, prenom, nom, dept, chef, poste])=>({id:"demo-e"+mat, mat, nom, prenom, cin:"", siteId:site, deptId:dept, chefMat:chef, calId:cal,
    entree:"2024-01-02", sortie:"", email:"", tel:"", badge:"", photo:"", poste, portail:true, tts:["t0", "t1", "t5", "t6", "t8", "t9", "t10"], rds:[], hist:{}}));
  /* 3. badgeages : 5 derniers jours ouvrés, plus les samedis travaillés du calendrier (demi-journée) */
  const ptg = [], mv = (mat, d, h, sens, i) => ptg.push({id:"demo-pt-"+mat+"-"+d+"-"+i, mat, ts:d+" "+h+":00", sens, dev:"", src:"badge"});
  const journee = (mat, d, e1, s1, e2, s2) => { mv(mat, d, e1, "E", 1); mv(mat, d, s1, "S", 2); mv(mat, d, e2, "E", 3); mv(mat, d, s2, "S", 4); };
  const calR = (ref.cals || []).find(c=>c.id === cal) || {}, jourDe = id => (ref.jours || []).find(x=>x.id === id);
  const samedis = []; for (let d = new Date(passes[0]+"T12:00:00"); jourK(d) <= passes[4]; d.setDate(d.getDate() + 1)) if (d.getDay() === 6){
    const jt = (calR.hebdo || {})[5], jo = jt && jt !== "repos" ? jourDe(jt) : null; if (jo) samedis.push(jourK(d)); }
  samedis.forEach(d=>MATS.forEach(m=>{ if (m === "9008" && d >= passes[2]) return; mv(m, d, "07:58", "E", 1); mv(m, d, "12:02", "S", 2); }));
  passes.forEach((d, i)=>{
    journee("9001", d, "07:55", "12:01", "12:58", "17:02");
    journee("9002", d, "07:56", "12:00", "12:57", "17:03");
    journee("9003", d, "07:56", "12:02", "12:58", "17:03");
    if (i === 4 || i === 2) journee("9004", d, i === 4 ? "08:27" : "08:41", "12:00", "13:00", "17:02"); else journee("9004", d, "07:58", "12:01", "12:59", "17:01");
    if (i === 4){ mv("9005", d, "07:59", "E", 1); mv("9005", d, "12:00", "S", 2); mv("9005", d, "13:01", "E", 3); }        /* sortie du soir oubliée */
    else journee("9005", d, "07:57", "12:03", "12:59", "17:02");
    journee("9006", d, "07:57", "12:00", "13:00", i >= 3 ? "19:35" : "17:03");                                                /* 2 h 30 de plus les 2 derniers jours */
    if (i !== 3) journee("9007", d, "07:58", "12:01", "12:58", "17:00");                                                       /* absent sans justificatif */
    if (i < 2) journee("9008", d, "07:54", "12:02", "12:56", "17:03");                                                         /* en congé ensuite */
  });
  /* 4. demandes et absences */
  const hist = (qui, action, d, niveau) => ({d, action, qui, niveau});
  const dmd = [
    {id:"demo-dm1", mat:"9004", tt:"t5", du:futurs[4], au:futurs[6], demi:false, motif:"Congé annuel — démonstration", circuitId:"demo-ci1", niveau:0, etat:"attente", creeLe:auj, origine:"employe", hist:[hist("Leila Mansouri", "cree", auj, 0)]},
    {id:"demo-dm2", mat:"9003", tt:"t10", du:futurs[0], au:futurs[0], demi:false, hDeb:"08:00", hFin:"10:00", motif:"Rendez-vous administratif", circuitId:"demo-ci3", niveau:0, etat:"attente", creeLe:auj, origine:"employe", hist:[hist("Sami Gharbi", "cree", auj, 0)]},
    {id:"demo-dm3", mat:"9008", tt:"t5", du:passes[2], au:futurs[1], demi:false, motif:"Congé annuel", circuitId:"demo-ci1", niveau:1, etat:"acceptee", creeLe:passes[0], origine:"employe", valideLe:passes[1], validePar:"Ines Ben Ali",
      hist:[hist("Nour Sassi", "cree", passes[0], 0), hist("Karim Trabelsi", "valide", passes[0], 0), hist("Ines Ben Ali", "accepte", passes[1], 1)]}];
  const abs = passes.slice(2).concat(futurs.slice(0, 2)).map(d=>({id:"demo-ab-9008-"+d, mat:"9008", d, tt:"t5", dmdId:"demo-dm3", h:8}));
  r = await appel("POST", "/api/v1/donnees/sync", {colls:{emps:{put:emps}, ptg:{put:ptg}, dmd:{put:dmd}, abs:{put:abs}}});
  if ((r.ignores || []).length || (r.conflits || []).length) throw new Error("données refusées : "+JSON.stringify({ignores:r.ignores, conflits:r.conflits}).slice(0, 300));
  /* 5. comptes (liste complète : les comptes absents seraient désactivés) — premier mot de passe = matricule */
  const ref2 = (await appel("GET", "/api/v1/donnees")).ref || ref;
  /* comptes déjà connus du serveur (jeu réinitialisé) : mot de passe remis au matricule (« reinit », horodatage plus récent) */
  const connus = new Set(((await appel("GET", "/api/v1/comptes").catch(()=>({}))).comptes || []).map(c=>String(c.login).toLowerCase())), maintenant = new Date().toISOString();
  const users = (ref2.users || []).filter(u=>!String(u.id || "").startsWith("demo-u")).concat(SAL.map(([mat, prenom, nom, dept, chef, poste, login, profil])=>({
    id:"demo-u"+mat, login, nom:prenom+" "+nom, empId:"demo-e"+mat, profilId:profil, langue:"fr", actif:true, deleg:[],
    perim:profil === "demo-prRH" ? {depts:DEPTS} : {}, mdpTemp:true, mdpTempLe:connus.has(login) ? maintenant : auj, mdpChangeRaison:connus.has(login) ? "reinit" : "premiere",
    mustChangePassword:true, mdpDefini:false})));
  r = await appel("POST", "/api/v1/donnees/sync", {ref:{users}});
  if ((r.ignores || []).length || (r.conflits || []).length) throw new Error("comptes refusés : "+JSON.stringify({ignores:r.ignores, conflits:r.conflits}).slice(0, 300));
  console.log("Jeu de démonstration créé ("+passes[0]+" → "+passes[4]+") :");
  console.log("  "+emps.length+" salariés, "+ptg.length+" badgeages, "+dmd.length+" demandes, "+abs.length+" jours d'absence, 3 profils, 3 circuits, 2 services.");
  console.log("\n  Comptes (premier mot de passe = matricule, à changer à la première connexion) :");
  SAL.forEach(([mat, prenom, nom, , , poste, login])=>console.log("   "+login.padEnd(10)+" mot de passe initial "+mat+"   "+(prenom+" "+nom).padEnd(18)+" "+poste));
  console.log("\n  Le calcul des journées est fait par le serveur dans les minutes qui suivent.");
}
(async ()=>{
  const mdp = await demanderMdp();
  const r = await fetch(URL_B+"/api/v1/connexion", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({login:LOGIN, mdp})});
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error("connexion refusée ("+r.status+") : "+(j.message || j.erreur || ""));
  if (j.changer) throw new Error("le mot de passe de « "+LOGIN+" » doit d'abord être changé dans l'application");
  if (j.a2f) throw new Error("ce compte utilise la double authentification : utilisez un compte administrateur sans double authentification");
  COOKIE = (r.headers.get("set-cookie") || "").split(";")[0];
  CSRF = (await appel("GET", "/api/v1/session")).csrf;
  let {ref, existants} = await etatActuel();
  if (MODE === "supprimer" || MODE === "reinitialiser"){ await supprimer(ref); ({ref, existants} = await etatActuel()); }
  if (MODE === "supprimer") return;
  if (existants.length) throw new Error("le jeu de démonstration existe déjà (matricules "+existants.join(", ")+") : utilisez --reinitialiser");
  await creer(ref);
})().catch(e=>{ console.error("ÉCHEC : "+e.message); process.exit(1); });
