#!/usr/bin/env node
/* FIWAKTI — lanceur de référence (Windows et Linux).

   node lanceur.js [--racine DOSSIER]          (DOSSIER = racine d'installation : versions/, donnees/)

   À utiliser seulement sur une installation qui n'a pas de lanceur fourni par l'éditeur. Il est prévu pour tourner comme
   service (systemd sous Linux, service Windows via NSSM ou le Planificateur de tâches au démarrage). Il fait ce que le
   serveur attend de son lanceur :
   - démarre la version écrite dans versions/actuelle.txt ;
   - relance le serveur quand il s'arrête avec le code 75 (mise à jour, retour à la version précédente, restauration) ;
   - version à l'essai (versions/essai.txt, écrit par une mise à jour) : le serveur efface ce fichier après 90 s de
     fonctionnement ; s'il s'arrête avant, ou si le fichier est toujours là après 150 s, retour automatique à la
     version de versions/precedente.txt ;
   - relance après un arrêt imprévu, avec un délai croissant (5 s à 60 s) ;
   - arrêt propre (SIGTERM / SIGINT / Ctrl+C) transmis au serveur.
   Journal : donnees/journaux/lanceur.log */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const RACINE = path.resolve(arg("--racine", __dirname)), V = path.join(RACINE, "versions");
const LOG = path.join(RACINE, "donnees", "journaux", "lanceur.log");
function log(m){ const l = new Date().toISOString()+" "+m; console.log(l); try { fs.mkdirSync(path.dirname(LOG), {recursive:true}); fs.appendFileSync(LOG, l+"\n"); } catch(e){} }
const lire = f => { try { return fs.readFileSync(path.join(V, f), "utf8").trim(); } catch(e){ return ""; } };
const ecrire = (f, t) => fs.writeFileSync(path.join(V, f), t+"\n");
let enfant = null, arret = false, delai = 5000, minuteurEssai = null;

function retourArriere(motif){
  const prec = lire("precedente.txt"), cour = lire("actuelle.txt");
  if (!prec || prec === cour || !fs.existsSync(path.join(V, prec, "serveur", "principal.js"))){ log("retour impossible ("+motif+") : pas de version précédente utilisable"); try { fs.unlinkSync(path.join(V, "essai.txt")); } catch(e){} return; }
  log("RETOUR AUTOMATIQUE à "+prec+" : "+motif);
  ecrire("actuelle.txt", prec); ecrire("precedente.txt", cour); try { fs.unlinkSync(path.join(V, "essai.txt")); } catch(e){}
}
function demarrer(){
  if (arret) return;
  const version = lire("actuelle.txt"), dir = path.join(V, version, "serveur");
  if (!version || !fs.existsSync(path.join(dir, "principal.js"))){ log("version introuvable : « "+version+" » (versions/actuelle.txt)"); if (lire("essai.txt")) { retourArriere("version absente"); return setTimeout(demarrer, 2000); } return setTimeout(demarrer, 30000); }
  const essai = lire("essai.txt") === version, debut = Date.now();
  log("démarrage de la version "+version+(essai ? " (à l'essai)" : ""));
  enfant = cp.spawn(process.execPath, ["principal.js"], {cwd:dir, stdio:"inherit", env:process.env});
  if (essai){ clearTimeout(minuteurEssai); minuteurEssai = setTimeout(()=>{ if (lire("essai.txt") === version){ retourArriere("la version "+version+" n'a pas confirmé son bon fonctionnement en 150 s"); if (enfant) enfant.kill("SIGTERM"); } }, 150000); }
  enfant.on("exit", (code, signal)=>{
    clearTimeout(minuteurEssai); enfant = null;
    if (arret) return;
    if (code === 75){ log("relance demandée par le serveur (code 75)"); delai = 5000; return setTimeout(demarrer, 500); }
    log("arrêt imprévu de la version "+version+" (code "+code+(signal ? ", signal "+signal : "")+")");
    if (essai && lire("essai.txt") === version && Date.now() - debut < 150000){ retourArriere("arrêt pendant l'essai"); return setTimeout(demarrer, 1000); }
    setTimeout(demarrer, delai); delai = Math.min(60000, delai * 2);
    if (Date.now() - debut > 600000) delai = 5000;   /* a tourné plus de 10 min : délai remis à zéro */
  });
}
["SIGTERM", "SIGINT"].forEach(s=>process.on(s, ()=>{ arret = true; log("arrêt du lanceur ("+s+")"); if (enfant){ enfant.kill("SIGTERM"); setTimeout(()=>process.exit(0), 15000); enfant.on("exit", ()=>process.exit(0)); } else process.exit(0); }));
if (!fs.existsSync(V)){ console.error("Dossier versions introuvable : "+V+" (précisez --racine)"); process.exit(2); }
demarrer();
