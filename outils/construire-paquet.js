#!/usr/bin/env node
/* FIWAKTI — construction du paquet de livraison d'une version.

   node outils/construire-paquet.js [--sortie DOSSIER] [--depuis 56.33.10] [--cle CLE_PRIVEE.pem|.json]
   node outils/construire-paquet.js --signer PAQUET.fwk --cle CLE_PRIVEE.pem|.json

   Produit dans DOSSIER (par défaut ./dist) :
   - FIWAKTI-<v>/                      dossier livré, prêt à copier sur le serveur
       versions/<v>/{app,public,serveur} version complète (node_modules installés par « npm ci », bibliothèques JavaScript
                                         seulement : identique sous Windows et Linux)
       installer-maj.js                  mise à jour d'une installation existante (sauvegarde, bascule, contrôle, retour)
       lanceur.js                        lanceur de référence (installation neuve sans lanceur de l'éditeur)
       INSTALLATION.md, SHA256SUMS.txt
   - FIWAKTI-<v>-installation.zip      le même dossier en archive
   - FIWAKTI-maj-<v>.fwk               mise à jour par l'application (Système › Mise à jour), signée si --cle est donné ;
                                         sinon FIWAKTI-maj-<v>.fwk.a-signer, à signer par l'éditeur avec --signer.
   La clé privée n'est jamais copiée ni écrite : elle sert seulement à signer. Une clé qui ne correspond pas à la clé
   publique livrée (serveur/cle-publique.json) est refusée : le serveur rejetterait le paquet. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");
const DEPOT = path.resolve(__dirname, "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

function cleePrivee(f){
  const t = fs.readFileSync(f, "utf8").trim();
  const k = t.startsWith("{") ? crypto.createPrivateKey({key:JSON.parse(t), format:"jwk"}) : crypto.createPrivateKey(t);
  const pub = crypto.createPublicKey(k).export({format:"jwk"}), livree = JSON.parse(fs.readFileSync(arg("--cle-publique", path.join(DEPOT, "serveur", "cle-publique.json")), "utf8")).active;   /* --cle-publique : essais avec une clé de test */
  if (pub.x !== livree.x || pub.y !== livree.y) throw new Error("Cette clé privée ne correspond pas à la clé publique livrée (serveur/cle-publique.json) : le serveur refuserait le paquet.");
  return k;
}
function signer(contenu, cle){ return b64u(crypto.sign("sha256", Buffer.from(JSON.stringify(contenu)), {key:cle, dsaEncoding:"ieee-p1363"})); }

if (process.argv.includes("--signer")){
  const f = arg("--signer"), cleF = arg("--cle"); if (!f || !cleF) throw new Error("Usage : --signer PAQUET --cle CLE_PRIVEE");
  const p = JSON.parse(fs.readFileSync(f, "utf8")); delete p.signature;
  const sortie = f.replace(/\.a-signer$/, "");
  fs.writeFileSync(sortie, JSON.stringify(Object.assign(p, {signature:signer(p, cleePrivee(cleF))})));
  console.log("paquet signé : "+sortie); process.exit(0);
}

const V = JSON.parse(fs.readFileSync(path.join(DEPOT, "serveur", "version.json"), "utf8")).version;
const SORTIE = path.resolve(arg("--sortie", path.join(DEPOT, "dist"))), DEPUIS = arg("--depuis", "56.33.10");
const RACINE = path.join(SORTIE, "FIWAKTI-"+V), VERS = path.join(RACINE, "versions", V);
const cle = arg("--cle") ? cleePrivee(arg("--cle")) : null;

/* 1. copie de la version (sans node_modules, journaux ni données de développement) */
fs.rmSync(RACINE, {recursive:true, force:true}); fs.mkdirSync(VERS, {recursive:true});
const exclus = n => n === "node_modules" || n === ".dev" || n === "donnees" || n.endsWith(".log") || n.endsWith(".fwk");
function copier(src, dst){ fs.mkdirSync(dst, {recursive:true});
  for (const n of fs.readdirSync(src)){ if (exclus(n)) continue; const s = path.join(src, n), d = path.join(dst, n);
    if (fs.statSync(s).isDirectory()) copier(s, d); else fs.copyFileSync(s, d); } }
["app", "public", "serveur"].forEach(d=>copier(path.join(DEPOT, d), path.join(VERS, d)));
["CARTE-DEPENDANCES.md"].forEach(f=>fs.copyFileSync(path.join(DEPOT, f), path.join(VERS, f)));

/* 2. bibliothèques installées depuis le fichier de verrouillage (versions exactes, sans scripts d'installation) */
cp.execSync("npm ci --omit=dev --ignore-scripts --no-audit --no-fund", {cwd:path.join(VERS, "serveur"), stdio:"inherit"});
/* paquets de définitions de types seulement (aucun code exécuté) : retirés du paquet livré */
for (const d of ["@types", "undici-types"]){ const p = path.join(VERS, "serveur", "node_modules", d);
  if (fs.existsSync(p)){ const code = []; (function v(x){ for (const n of fs.readdirSync(x)){ const q = path.join(x, n); if (fs.statSync(q).isDirectory()) v(q); else if (/\.(c|m)?js$/.test(n)) code.push(q); } })(p);
    if (!code.length) fs.rmSync(p, {recursive:true, force:true}); } }

/* 3. contrôles de cohérence avant livraison */
const lu = f => fs.readFileSync(path.join(VERS, f), "utf8");
if (JSON.parse(lu("serveur/package.json")).version !== V) throw new Error("serveur/package.json et serveur/version.json n'ont pas la même version.");
cp.execSync(process.execPath+" --check "+JSON.stringify(path.join(VERS, "serveur", "principal.js")));
for (const f of fs.readdirSync(path.join(VERS, "serveur", "modules")).filter(x=>x.endsWith(".json"))){
  const m = JSON.parse(lu("serveur/modules/"+f));
  for (const k of ["js", "css"]) if (m.assets && m.assets[k] && m.integrite && m.integrite[k]){
    const h = "sha384-"+crypto.createHash("sha384").update(fs.readFileSync(path.join(VERS, "app", m.assets[k]))).digest("base64");
    if (h !== m.integrite[k]) throw new Error("Empreinte d'intégrité fausse pour "+m.id+" ("+k+") : le navigateur refuserait le module."); } }

/* 4. outils et documentation livrés à la racine du dossier */
["installer-maj.js", "lanceur.js"].forEach(f=>fs.copyFileSync(path.join(DEPOT, "outils", "livraison", f), path.join(RACINE, f)));
fs.copyFileSync(path.join(DEPOT, "INSTALLATION.md"), path.join(RACINE, "INSTALLATION.md"));
const fichiers = []; (function lister(d){ for (const n of fs.readdirSync(d)){ const p = path.join(d, n); if (fs.statSync(p).isDirectory()) lister(p); else fichiers.push(p); } })(RACINE);
fs.writeFileSync(path.join(RACINE, "SHA256SUMS.txt"), fichiers.sort().map(p=>sha(fs.readFileSync(p))+"  "+path.relative(RACINE, p).split(path.sep).join("/")).join("\n")+"\n");

/* 5. archive */
const zip = path.join(SORTIE, "FIWAKTI-"+V+"-installation.zip"); fs.rmSync(zip, {force:true});
try { cp.execSync("zip -qr -X "+JSON.stringify(zip)+" "+JSON.stringify("FIWAKTI-"+V), {cwd:SORTIE}); }
catch(e){ console.log("zip indisponible : archive non produite (le dossier FIWAKTI-"+V+" suffit)"); }

/* 6. paquet de mise à jour par l'application (format fiwakti-maj-1, lu par appliquerMiseAJour) */
const contenu = {format:"fiwakti-maj-1", version:V, depuis:DEPUIS, nodeMin:"22.13.0", bases:["sqlite", "pg"], cree:new Date().toISOString(),
  notes:"FIWAKTI "+V+" : voir INSTALLATION.md et AUDIT-COMPLET.md", fichiers:{}};
(function ajouter(d){ for (const n of fs.readdirSync(d)){ const p = path.join(d, n); if (fs.statSync(p).isDirectory()){ ajouter(p); continue; }
  const b = fs.readFileSync(p); contenu.fichiers[path.relative(VERS, p).split(path.sep).join("/")] = {b64:b.toString("base64"), sha256:sha(b)}; } })(VERS);
const fwk = path.join(SORTIE, "FIWAKTI-maj-"+V+".fwk");
fs.rmSync(fwk, {force:true}); fs.rmSync(fwk+".a-signer", {force:true});
if (cle) fs.writeFileSync(fwk, JSON.stringify(Object.assign({}, contenu, {signature:signer(contenu, cle)})));
else fs.writeFileSync(fwk+".a-signer", JSON.stringify(contenu));
const taille = f => (fs.statSync(f).size / 1048576).toFixed(1)+" Mo";
console.log("version "+V+" : "+Object.keys(contenu.fichiers).length+" fichiers");
console.log("dossier : "+RACINE);
if (fs.existsSync(zip)) console.log("archive : "+zip+" ("+taille(zip)+")");
console.log(cle ? "paquet signé : "+fwk+" ("+taille(fwk)+")" : "paquet à signer : "+fwk+".a-signer ("+taille(fwk+".a-signer")+") — node outils/construire-paquet.js --signer <fichier> --cle <clé privée>");
if (fs.statSync(cle ? fwk : fwk+".a-signer").size > 80e6) console.log("ATTENTION : paquet de plus de 80 Mo, refusé par le serveur (limite de /api/v1/mise-a-jour).");
