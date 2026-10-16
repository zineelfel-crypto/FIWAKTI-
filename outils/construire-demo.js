#!/usr/bin/env node
/* FIWAKTI — construction de la version de démonstration autonome : un seul fichier HTML, sans serveur ni réseau.
   - application (app.css, app.js) et compléments (public/*.js, thème sombre) intégrés au fichier ;
   - données d'exemple de l'application : jeu intégré à app.js (mode « démo », rien n'est enregistré) ;
   - modules FW- : code et styles intégrés ; leurs réponses d'API sont rejouées depuis outils/demo/modules-reponses.json
     (enregistrées sur un serveur d'essai rempli de données fictives). Les enregistrements faits dans un module sont
     appliqués en mémoire (outils/demo/rejeu.js) : la liste se met à jour, rien n'est conservé à la fermeture.
   Usage : node outils/construire-demo.js [--sortie livraison/FIWAKTI-demo.html] */
"use strict";
const fs = require("fs"), path = require("path");
const RAC = path.join(__dirname, "..");
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i+1] : null; };
const SORTIE = path.resolve(arg("--sortie") || path.join(RAC, "livraison", "FIWAKTI-demo.html"));
const lire = f => fs.readFileSync(path.join(RAC, f), "utf8");
/* aucune séquence ne doit fermer la balise <script> en ligne */
const js = s => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const css = s => s.replace(/<\/style/gi, "<\\/style");

const version = JSON.parse(lire("serveur/version.json")).version;
let app = lire("app/app.js");
/* le mode démo démarre toujours, quel que soit l'adresse du fichier */
const AVANT = 'function demoDemande(){try{return new URLSearchParams(location.search).has("demo")}';
if (app.split(AVANT).length !== 2) throw new Error("app.js : détection du mode démo introuvable (fonction demoDemande modifiée ?)");
app = app.replace(AVANT, 'function demoDemande(){return true;try{return new URLSearchParams(location.search).has("demo")}');

/* modules : manifeste (menu, droit, vues), code et styles */
const dirMan = path.join(RAC, "serveur", "modules");
const MAN = [], CODE = [], CSS = {};
for (const f of fs.readdirSync(dirMan).filter(f => /^FW-[A-Za-z]+\.json$/.test(f)).sort()){
  const m = JSON.parse(fs.readFileSync(path.join(dirMan, f), "utf8"));
  if (!m.assets || !m.assets.js) continue;
  const fj = path.join(RAC, "app", m.assets.js), fc = m.assets.css ? path.join(RAC, "app", m.assets.css) : null;
  if (!fs.existsSync(fj)) throw new Error("code du module introuvable : "+m.assets.js);
  MAN.push({id:m.id, menu:m.menu, droit:m.droit, niveauMenu:m.niveauMenu, vues:m.vues || []});
  CODE.push(JSON.stringify(m.id)+":function(){\n"+fs.readFileSync(fj, "utf8")+"\n}");
  if (fc && fs.existsSync(fc)) CSS[m.id] = fs.readFileSync(fc, "utf8");
}
const REP = JSON.parse(lire("outils/demo/modules-reponses.json"));

/* rejeu des API des modules et écritures en mémoire : voir outils/demo/rejeu.js */
const API = lire("outils/demo/rejeu.js").replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();

const pub = ["ext-aide.js", "ext-pointage-jour.js", "ext-import-renforce.js", "ext-xlsx.js", "anniversaire.js"];

const html = '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
  +'<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  +'<meta name="referrer" content="no-referrer">\n'
  +'<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Crect width=%2740%27 height=%2740%27 rx=%2711%27 fill=%27%23047857%27/%3E%3Cpath d=%27M13 29V11h13M13 20h9%27 stroke=%27%23fff%27 stroke-width=%273.6%27 stroke-linecap=%27round%27 fill=%27none%27/%3E%3C/svg%3E">\n'
  +'<title>FIWAKTI — démonstration</title>\n'
  +'<!-- FIWAKTI '+version+' — version de démonstration autonome, construite par outils/construire-demo.js. Données fictives. -->\n'
  +'<style>\n'+css(lire("app/app.css"))+'\n</style>\n'
  +'<style id="fwSombre">\n'+css(lire("public/theme-sombre.css"))+'\n</style>\n'
  +'</head>\n<body>\n<div id="app" class="fw"><div class="fw-boot">FIWAKTI</div></div>\n<div id="fwprint" aria-hidden="true"></div>\n'
  +'<script>\nwindow.FWK_DEMO={MAN:'+js(JSON.stringify(MAN))+',\nCSS:'+js(JSON.stringify(CSS))+',\nCODE:{\n'+js(CODE.join(",\n"))+'\n},\n'
  +'api:'+js(API)+'('+js(JSON.stringify(REP))+')};\n</script>\n'
  +pub.map(f => '<script>\n'+js(lire("public/"+f))+'\n</script>\n').join("")
  +'<script>\n'+js(app)+'\n</script>\n</body>\n</html>\n';

fs.mkdirSync(path.dirname(SORTIE), {recursive:true});
fs.writeFileSync(SORTIE, html);
console.log("Démo construite :", path.relative(process.cwd(), SORTIE), "—", (Buffer.byteLength(html)/1048576).toFixed(2), "Mo,", MAN.length, "modules,", Object.keys(REP).length, "réponses d'API");
