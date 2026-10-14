#!/usr/bin/env node
/* FIWAKTI — mise à jour d'une installation existante, à lancer sur le serveur depuis le dossier livré.

   node installer-maj.js --racine DOSSIER [--service NOM] [--url https://serveur:port] [--sans-redemarrage]
   node installer-maj.js --racine DOSSIER --retour [--service NOM]        (revenir à la version précédente)
   node installer-maj.js --racine DOSSIER --verifier                      (contrôles seulement, rien n'est modifié)

   DOSSIER = racine de l'installation FIWAKTI (elle contient versions/ et donnees/).
   --service : nom du service FIWAKTI (Windows : nom du service ; Linux : unité systemd). Sans lui, le script demande de
               redémarrer le service à la main puis attend.
   --url     : adresse du serveur pour le contrôle de santé (par défaut lue dans donnees/config.json).

   Étapes (rien n'est modifié avant la fin des contrôles) :
   1. contrôles : racine, version installée (actuelle.txt), version de Node.js, espace disque, intégrité du paquet
      (SHA256SUMS.txt), présence d'une sauvegarde VÉRIFIÉE de moins de 24 h (Système › Sauvegardes) ;
   2. copie de la nouvelle version dans versions/<version> (dossier temporaire puis renommage) ;
   3. bascule : precedente.txt = ancienne, essai.txt et actuelle.txt = nouvelle (mécanisme du lanceur FIWAKTI) ;
   4. redémarrage du service, contrôle de santé (/api/sante doit annoncer la nouvelle version) et confirmation de l'essai
      (le serveur efface essai.txt après 90 s de fonctionnement) ;
   5. en cas d'échec : retour automatique à l'ancienne version et nouveau redémarrage.
   Les données (donnees/) ne sont jamais copiées ni modifiées par ce script : la base est mise à niveau par le serveur
   lui-même au démarrage (migrations automatiques, compatibles avec l'ancienne version). Journal :
   donnees/journaux/installer-maj.log */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process"), http = require("http"), https = require("https");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const opt = n => process.argv.includes(n);
const ICI = __dirname, RACINE = arg("--racine") ? path.resolve(arg("--racine")) : null;
const nv = s => String(s||"").split(".").map(Number).reduce((t, x, i)=>t + (x||0) * Math.pow(1000, 2 - i), 0);
let LOG = null;
function log(m){ const l = new Date().toISOString()+" "+m; console.log(m); if (LOG) try { fs.appendFileSync(LOG, l+"\n"); } catch(e){} }
function stop(m){ log("ÉCHEC : "+m); process.exit(1); }
const attendre = ms => new Promise(r=>setTimeout(r, ms));

if (!RACINE) stop("indiquez la racine de l'installation : --racine <dossier contenant versions/ et donnees/>");
const VD = path.join(RACINE, "versions"), DON = path.join(RACINE, "donnees");
if (!fs.existsSync(VD) || !fs.existsSync(DON)) stop("« "+RACINE+" » n'est pas une racine FIWAKTI (versions/ et donnees/ attendus).");
fs.mkdirSync(path.join(DON, "journaux"), {recursive:true}); LOG = path.join(DON, "journaux", "installer-maj.log");
const lire = f => { try { return fs.readFileSync(path.join(VD, f), "utf8").trim(); } catch(e){ return ""; } };
const ecrire = (f, t) => fs.writeFileSync(path.join(VD, f), t+"\n");
const config = (()=>{ try { return JSON.parse(fs.readFileSync(path.join(DON, "config.json"), "utf8")); } catch(e){ return {}; } })();
/* même règle que le serveur : certificat dans donnees/certificats → HTTPS (port 8443 par défaut), sinon HTTP (8080) */
const HTTPS_ = (()=>{ try { return fs.readdirSync(path.join(DON, "certificats")).some(f=>/\.(pem|crt|key|pfx)$/i.test(f)); } catch(e){ return false; } })();
/* adresse du serveur : --url, sinon port de l'environnement ou de config.json, sinon dernière adresse annoncée par le
   serveur dans son journal (« à l'écoute sur … » — cas d'un port fixé dans la définition du service), sinon défaut */
const ANNONCE = (()=>{ try { const l = fs.readFileSync(path.join(DON, "journaux", "serveur.log"), "utf8").split("\n").filter(x=>/à l'écoute sur https?:\/\/localhost:\d+/.test(x)).pop();
  const m = l && /(https?):\/\/localhost:(\d+)/.exec(l); return m ? m[1]+"://127.0.0.1:"+m[2] : ""; } catch(e){ return ""; } })();
const URLB = (arg("--url") || (process.env.FIWAKTI_PORT || config.port ? (HTTPS_ ? "https" : "http")+"://127.0.0.1:"+(Number(process.env.FIWAKTI_PORT) || Number(config.port)) : "") || ANNONCE
  || (HTTPS_ ? "https" : "http")+"://127.0.0.1:"+(HTTPS_ ? 8443 : 8080)).replace(/\/$/, "");

function sante(){ return new Promise(ok=>{ try { const u = new URL(URLB+"/api/sante"), lib = u.protocol === "https:" ? https : http;
  const r = lib.get(u, {rejectUnauthorized:false, timeout:5000}, res=>{ let t = ""; res.on("data", d=>t += d); res.on("end", ()=>{ try { ok(JSON.parse(t)); } catch(e){ ok(null); } }); });
  r.on("error", ()=>ok(null)); r.on("timeout", ()=>{ r.destroy(); ok(null); }); } catch(e){ ok(null); } }); }
function redemarrer(){
  const s = arg("--service");
  if (opt("--sans-redemarrage") || !s){ log(">>> Redémarrez maintenant le service FIWAKTI (ou le lanceur). Le script attend le redémarrage…"); return; }
  try {
    if (process.platform === "win32"){ try { cp.execSync('net stop "'+s+'"', {stdio:"inherit"}); } catch(e){} cp.execSync('net start "'+s+'"', {stdio:"inherit"}); }
    else cp.execSync("systemctl restart "+JSON.stringify(s), {stdio:"inherit"});
    log("service « "+s+" » redémarré");
  } catch(e){ log("redémarrage du service « "+s+" » impossible ("+e.message+") : redémarrez-le à la main, le script attend."); }
}
async function attendreVersion(v, maxS){ for (let i = 0; i < maxS; i += 3){ const r = await sante(); if (r && r.version === v) return r; await attendre(3000); } return null; }

(async ()=>{
  const actuelle = lire("actuelle.txt");
  /* ---------- retour manuel à la version précédente ---------- */
  if (opt("--retour")){
    const prec = lire("precedente.txt");
    if (!prec || !fs.existsSync(path.join(VD, prec, "serveur", "principal.js"))) stop("aucune version précédente utilisable (versions/precedente.txt).");
    log("retour de "+actuelle+" à "+prec);
    ecrire("precedente.txt", actuelle); ecrire("actuelle.txt", prec); try { fs.unlinkSync(path.join(VD, "essai.txt")); } catch(e){}
    redemarrer(); const r = await attendreVersion(prec, 180);
    log(r ? "OK : la version "+prec+" est en service." : "La version "+prec+" ne répond pas encore sur "+URLB+" : vérifiez le service et donnees/journaux/serveur.log.");
    process.exit(r ? 0 : 1);
  }

  /* ---------- 1. contrôles ---------- */
  const paquet = fs.readdirSync(path.join(ICI, "versions")).filter(d=>fs.existsSync(path.join(ICI, "versions", d, "serveur", "principal.js")))[0];
  if (!paquet) stop("version à installer introuvable à côté de ce script (versions/<version>/serveur).");
  const cible = JSON.parse(fs.readFileSync(path.join(ICI, "versions", paquet, "serveur", "version.json"), "utf8")).version;
  log("FIWAKTI : version installée « "+(actuelle||"?")+" », version livrée « "+cible+" », racine "+RACINE);
  if (!actuelle) stop("versions/actuelle.txt absent : ce n'est pas une installation gérée par un lanceur FIWAKTI (voir INSTALLATION.md, installation neuve).");
  if (actuelle === cible) stop("la version "+cible+" est déjà en service.");
  if (nv(actuelle) > nv(cible)) stop("la version installée ("+actuelle+") est plus récente que la version livrée ("+cible+").");
  if (nv(actuelle) < nv("56.33.10")) stop("mise à jour prévue à partir de la version 56.33.10 (installée : "+actuelle+") : installez d'abord la 56.33.10.");
  if (nv(process.versions.node) < nv("22.13.0")) stop("Node.js 22.13 ou plus requis (installé : "+process.versions.node+").");
  /* intégrité du dossier livré */
  const sommes = fs.readFileSync(path.join(ICI, "SHA256SUMS.txt"), "utf8").split("\n").filter(Boolean); let fautes = 0;
  for (const l of sommes){ const [h, ...r] = l.split("  "), f = path.join(ICI, r.join("  ")); if (!fs.existsSync(f) || crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") !== h){ fautes++; if (fautes < 5) log("  fichier absent ou altéré : "+r.join("  ")); } }
  if (fautes) stop(fautes+" fichier(s) du paquet absent(s) ou altéré(s) : recopiez le paquet.");
  log("intégrité du paquet : "+sommes.length+" fichiers vérifiés");
  /* espace disque : deux fois la taille de la version */
  let taille = 0; (function t(d){ for (const n of fs.readdirSync(d)){ const p = path.join(d, n), s = fs.statSync(p); if (s.isDirectory()) t(p); else taille += s.size; } })(path.join(ICI, "versions", paquet));
  try { const s = fs.statfsSync(RACINE); if (s.bavail * s.bsize < 2 * taille + 500e6) stop("espace disque insuffisant ("+Math.round(s.bavail*s.bsize/1e6)+" Mo libres)."); } catch(e){}
  /* sauvegarde vérifiée récente */
  const sauv = (()=>{ try { return fs.readdirSync(path.join(DON, "sauvegardes")).filter(f=>/^fiwakti-.*\.json$/.test(f)).map(f=>{ try { return JSON.parse(fs.readFileSync(path.join(DON, "sauvegardes", f), "utf8")); } catch(e){ return null; } }).filter(Boolean); } catch(e){ return []; } })()
    .filter(m=>m.verification && m.verification.ok).sort((a, b)=>a.cree < b.cree ? 1 : -1)[0];
  const ageH = sauv ? (Date.now() - new Date(sauv.cree).getTime()) / 3600000 : null;
  if (!sauv || ageH > 24){ if (!opt("--sans-controle-sauvegarde")) stop("aucune sauvegarde vérifiée de moins de 24 h dans donnees/sauvegardes. Faites-en une : FIWAKTI › Système › Sauvegardes › « Sauvegarder maintenant » (statut « vérifiée »), puis relancez."); log("ATTENTION : contrôle de sauvegarde désactivé (--sans-controle-sauvegarde)"); }
  else log("sauvegarde vérifiée : "+sauv.fichier+" (il y a "+ageH.toFixed(1)+" h)");
  /* le serveur actuel doit répondre à l'adresse de contrôle : sinon le contrôle après bascule serait faux (retour
     arrière injustifié) — rien n'est modifié tant que ce n'est pas le cas */
  { const r0 = await sante();
    if (!r0 || r0.version !== actuelle) stop("le serveur FIWAKTI "+actuelle+" ne répond pas sur "+URLB+(r0 ? " (version annoncée : "+r0.version+")" : "")+". Démarrez-le, ou indiquez son adresse avec --url (ex. --url https://127.0.0.1:8443).");
    log("serveur en service sur "+URLB+" : version "+r0.version+", base "+(r0.base||"?")); }
  log("trousseau de clés : vérifiez qu'il est exporté et conservé hors du serveur (Système › Sauvegardes › Exporter le trousseau) — sans lui une sauvegarde chiffrée est illisible.");
  if (opt("--verifier")){ log("contrôles terminés : rien n'a été modifié (--verifier)."); process.exit(0); }

  /* ---------- 2. copie de la version ---------- */
  const dest = path.join(VD, cible), tmp = dest+".installation";
  fs.rmSync(tmp, {recursive:true, force:true});
  fs.cpSync(path.join(ICI, "versions", paquet), tmp, {recursive:true});
  if (fs.existsSync(dest)){ fs.rmSync(dest+".ancien", {recursive:true, force:true}); fs.renameSync(dest, dest+".ancien"); }
  fs.renameSync(tmp, dest);
  log("version "+cible+" copiée dans "+dest);

  /* ---------- 3. bascule ---------- */
  ecrire("precedente.txt", actuelle); ecrire("essai.txt", cible); ecrire("actuelle.txt", cible);
  log("bascule : actuelle = "+cible+" (à l'essai), précédente = "+actuelle);

  /* ---------- 4. redémarrage et contrôle ---------- */
  redemarrer();
  const r = await attendreVersion(cible, 300);
  if (!r){
    log("la version "+cible+" ne répond pas sur "+URLB+" après 5 min : RETOUR à "+actuelle);
    ecrire("actuelle.txt", actuelle); ecrire("precedente.txt", cible); try { fs.unlinkSync(path.join(VD, "essai.txt")); } catch(e){}
    redemarrer(); const r2 = await attendreVersion(actuelle, 180);
    stop(r2 ? "mise à jour annulée, la version "+actuelle+" est de nouveau en service. Consultez donnees/journaux/serveur.log." : "mise à jour annulée mais la version "+actuelle+" ne répond pas : vérifiez le service.");
  }
  log("la version "+cible+" répond (base "+(r.base||"?")+") ; confirmation de l'essai (90 s)…");
  for (let i = 0; i < 40 && lire("essai.txt") === cible; i++) await attendre(5000);
  if (lire("essai.txt") === cible) log("essai.txt toujours présent après 200 s : le lanceur peut revenir à "+actuelle+" ; vérifiez /api/sante et donnees/journaux.");
  else log("OK : FIWAKTI "+cible+" est en service. Retour possible : node installer-maj.js --racine \""+RACINE+"\" --retour"+(arg("--service") ? " --service \""+arg("--service")+"\"" : ""));
})().catch(e=>stop(e.message));
