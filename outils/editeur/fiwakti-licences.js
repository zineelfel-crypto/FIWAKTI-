#!/usr/bin/env node
/* FIWAKTI — kit de l'éditeur : émission des licences et des jetons d'intervention.

   Outil réservé à l'éditeur : il n'est jamais livré aux clients (les paquets ne contiennent que app/, public/, serveur/).
   Toute signature exige la clé privée de l'éditeur ; une clé qui ne correspond pas à la clé publique livrée
   (serveur/cle-publique.json, « active ») est refusée, car les installations rejetteraient ce qu'elle signe.
   La clé privée n'est jamais copiée, affichée ni écrite : elle sert seulement à signer.

   Usage :
     node outils/editeur/fiwakti-licences.js verifier-cle --cle CLE_PRIVEE.pem
     node outils/editeur/fiwakti-licences.js licence --cle CLE_PRIVEE.pem --client "Nom du client" [options]
         --serie N              numéro croissant (une licence de série inférieure ne remplace pas la licence en place)
         --debut AAAA-MM-JJ     début de validité (facultatif)
         --fin AAAA-MM-JJ       fin de validité (absente = licence perpétuelle)
         --politique P          grace_lecture (défaut) | immediate | grace_blocage | contrat
         --grace N              jours de grâce après la fin (0 à 365)
         --apres lecture|blocage   effet après la grâce (politique « contrat » seulement)
         --modules FW-BI,FW-HSE…   modules FW- accordés (ou --lettres P | A | PA : Temps / Accès historiques)
         --capacite N           nombre de salariés prévu au contrat (information)
         --empreinte XXXX-XXXX-XXXX-XXXX   code d'installation affiché par le serveur du client (licence liée à la machine)
         --revoque ID1,ID2      identifiants de licences ou de jetons à révoquer sur cette installation
         --id ID                identifiant (par défaut : généré)
         --sortie FICHIER       écrit la licence dans un fichier (sinon affichée)
     node outils/editeur/fiwakti-licences.js jeton --cle CLE_PRIVEE.pem --empreinte XXXX-XXXX-XXXX-XXXX [--minutes 60]
         jeton d'intervention du fournisseur (une heure au plus, lié à l'installation)
     node outils/editeur/fiwakti-licences.js lire LICENCE_OU_FICHIER
         décode une licence ou un jeton et vérifie sa signature avec la clé publique livrée (aucune clé privée)

   Options communes : --cle-publique FICHIER (essais avec une clé de test), --registre FICHIER (journal des émissions,
   par défaut outils/editeur/registre-licences.jsonl — à conserver chez l'éditeur, hors des livraisons). */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const DEPOT = path.resolve(__dirname, "..", "..");
const LICENCE = require(path.join(DEPOT, "serveur", "licence.js"));
const argv = process.argv.slice(2), cmd = argv[0];
const arg = (n, d) => { const i = argv.indexOf(n); return i > 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deb64u = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T12:00:00Z")) && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;   /* 2026-02-30 refusée */
const ID_MODULE = /^FW-[A-Za-z][A-Za-z0-9]{1,30}$/;
const EMPREINTE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const fin = m => { console.error("Erreur : " + m); process.exit(1); };

function clesPubliques(){
  const f = arg("--cle-publique", path.join(DEPOT, "serveur", "cle-publique.json"));
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return {fichier:f, active:j.active, anciennes:(j.anciennes || []).map(a=>a.publique).filter(Boolean)};
}
function clePrivee(){
  const f = arg("--cle"); if (!f) fin("--cle CLE_PRIVEE.pem est obligatoire.");
  const t = fs.readFileSync(f, "utf8").trim();
  let k;
  try { k = t.startsWith("{") ? crypto.createPrivateKey({key:JSON.parse(t), format:"jwk"}) : crypto.createPrivateKey({key:t, passphrase:process.env.FIWAKTI_CLE_PHRASE || undefined}); }
  catch(e){ fin("clé privée illisible (" + e.message + "). Clé chiffrée : définir FIWAKTI_CLE_PHRASE."); }
  const pub = crypto.createPublicKey(k).export({format:"jwk"}), P = clesPubliques();
  if (pub.crv !== "P-256" || pub.x !== P.active.x || pub.y !== P.active.y)
    fin("cette clé privée ne correspond pas à la clé publique livrée (" + P.fichier + ") : les installations refuseraient ce qu'elle signe.");
  return k;
}
function signer(prefixe, charge, cle){
  const corps = prefixe + "." + b64u(JSON.stringify(charge));
  return corps + "." + b64u(crypto.sign("sha256", Buffer.from(corps), {key:cle, dsaEncoding:"ieee-p1363"}));
}
/* même contrôle que le serveur (serveur/principal.js : lireLicence / lireJeton) */
function verifier(texte){
  const m = /^(FWK1|FWJ1)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(texte || "").replace(/\s+/g, ""));
  if (!m) return {ok:false, motif:"format non reconnu (FWK1.… ou FWJ1.…)"};
  const P = clesPubliques(), corps = m[1] + "." + m[2];
  const cles = m[1] === "FWK1" ? [P.active].concat(P.anciennes) : [P.active];
  const ok = cles.some(j=>{ try { return crypto.verify("sha256", Buffer.from(corps), {key:crypto.createPublicKey({key:j, format:"jwk"}), dsaEncoding:"ieee-p1363"}, deb64u(m[3])); } catch(e){ return false; } });
  let charge = null; try { charge = JSON.parse(deb64u(m[2]).toString("utf8")); } catch(e){}
  return {ok:ok && !!charge, type:m[1], charge, motif:ok ? (charge ? "" : "charge illisible") : "signature invalide pour la clé publique livrée"};
}
function registrer(type, charge){
  const f = arg("--registre", path.join(__dirname, "registre-licences.jsonl"));
  fs.appendFileSync(f, JSON.stringify({emis:new Date().toISOString(), type, charge}) + "\n");
  return f;
}
function derniereSerie(client){
  const f = arg("--registre", path.join(__dirname, "registre-licences.jsonl"));
  if (!fs.existsSync(f)) return 0;
  return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l=>{ try { return JSON.parse(l); } catch(e){ return null; } })
    .filter(x=>x && x.type === "licence" && x.charge && x.charge.client === client).reduce((m, x)=>Math.max(m, Number(x.charge.serie) || 0), 0);
}

if (cmd === "verifier-cle"){
  clePrivee(); console.log("Clé privée conforme : elle correspond à la clé publique active livrée (" + clesPubliques().fichier + ").");
}
else if (cmd === "licence"){
  const client = String(arg("--client", "")).trim(); if (!client) fin("--client est obligatoire.");
  const charge = {id:arg("--id", "L-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + crypto.randomBytes(3).toString("hex").toUpperCase()), client};
  const serie = arg("--serie"); const prec = derniereSerie(client);
  charge.serie = serie !== undefined ? Number(serie) : prec + 1;
  if (!Number.isInteger(charge.serie) || charge.serie < 1) fin("--serie doit être un entier positif.");
  if (charge.serie <= prec) console.warn("Attention : série " + charge.serie + " ≤ dernière série émise pour ce client (" + prec + ") : elle ne remplacera pas une licence de série supérieure.");
  for (const k of ["debut", "fin"]){ const v = arg("--" + k); if (v !== undefined){ if (!dateOk(v)) fin("--" + k + " : date AAAA-MM-JJ attendue."); charge[k] = v; } }
  if (charge.debut && charge.fin && charge.fin < charge.debut) fin("--fin est antérieure à --debut.");
  const pol = arg("--politique"); if (pol !== undefined){ if (!LICENCE.POLITIQUES[pol]) fin("--politique : " + Object.keys(LICENCE.POLITIQUES).join(" | ")); charge.politique = pol; }
  const gr = arg("--grace"); if (gr !== undefined){ if (!/^\d+$/.test(gr) || +gr > 365) fin("--grace : 0 à 365 jours."); charge.grace = +gr; }
  const ap = arg("--apres"); if (ap !== undefined){ if (ap !== "lecture" && ap !== "blocage") fin("--apres : lecture | blocage."); charge.apres = ap; }
  const mods = arg("--modules"), lettres = arg("--lettres");
  if (mods){ charge.fw = mods.split(",").map(s=>s.trim()).filter(Boolean); const mauvais = charge.fw.filter(x=>!ID_MODULE.test(x)); if (mauvais.length || !charge.fw.length) fin("--modules : identifiants FW-… attendus (" + mauvais.join(", ") + ").");
    const connus = fs.readdirSync(path.join(DEPOT, "serveur", "modules")).filter(f=>/^FW-.+\.json$/.test(f)).map(f=>f.replace(/\.json$/, ""));
    const inconnus = charge.fw.filter(x=>connus.indexOf(x) < 0); if (inconnus.length) console.warn("Attention : modules absents de cette version : " + inconnus.join(", ") + " (connus : " + connus.join(", ") + ")."); }
  else if (lettres){ if (!/^(P|A|PA)$/.test(lettres)) fin("--lettres : P | A | PA."); charge.modules = lettres; }
  else fin("indiquez --modules FW-… ou --lettres P|A|PA (le serveur refuse une licence sans modules).");
  const cap = arg("--capacite"); if (cap !== undefined){ if (!/^\d+$/.test(cap)) fin("--capacite : nombre entier."); charge.capacite = +cap; }
  const emp = arg("--empreinte"); if (emp !== undefined){ const e = emp.trim().toUpperCase(); if (!EMPREINTE.test(e)) fin("--empreinte : XXXX-XXXX-XXXX-XXXX (code d'installation affiché par le serveur)."); charge.empreinte = e; }
  const rev = arg("--revoque"); if (rev){ charge.revoque = rev.split(",").map(s=>s.trim()).filter(Boolean); }
  const lic = signer("FWK1", charge, clePrivee());
  const ctrl = verifier(lic); if (!ctrl.ok) fin("contrôle après signature impossible : " + ctrl.motif);
  const jour = new Date().toISOString().slice(0, 10), e = LICENCE.etat(charge, jour), L = LICENCE.normaliser(charge);
  const sortie = arg("--sortie"); if (sortie) fs.writeFileSync(sortie, lic + "\n");
  const reg = registrer("licence", charge);
  console.log("Licence émise pour « " + client + " » (série " + charge.serie + ", id " + charge.id + ")");
  console.log("  validité : " + (L.debut || "immédiate") + " → " + (L.fin || "sans fin") + " ; politique " + L.politique + ", grâce " + L.grace + " j, puis " + L.apres);
  console.log("  modules : " + (charge.fw ? charge.fw.join(", ") : charge.modules) + (charge.empreinte ? " ; liée à l'installation " + charge.empreinte : " ; non liée à une machine") + (charge.revoque ? " ; révoque " + charge.revoque.join(", ") : ""));
  console.log("  état au " + jour + " : " + e.etat + " ; signature vérifiée avec la clé publique livrée ; inscrite au registre " + reg);
  console.log(sortie ? "  écrite dans " + sortie : "\n" + lic);
}
else if (cmd === "jeton"){
  const emp = String(arg("--empreinte", "")).trim().toUpperCase(); if (!EMPREINTE.test(emp)) fin("--empreinte XXXX-XXXX-XXXX-XXXX obligatoire.");
  const min = Number(arg("--minutes", "60")); if (!(min >= 1 && min <= 60)) fin("--minutes : 1 à 60 (le serveur refuse plus d'une heure).");
  const emis = new Date(), exp = new Date(emis.getTime() + min * 60000);
  const charge = {id:"J-" + crypto.randomBytes(4).toString("hex").toUpperCase(), empreinte:emp, emis:emis.toISOString(), exp:exp.toISOString()};
  const j = signer("FWJ1", charge, clePrivee());
  if (!verifier(j).ok) fin("contrôle après signature impossible.");
  registrer("jeton", charge);
  console.log("Jeton d'intervention " + charge.id + " pour l'installation " + emp + ", valable jusqu'à " + exp.toLocaleString("fr-FR") + " :\n\n" + j);
}
else if (cmd === "lire"){
  let t = argv[1] || ""; if (t && fs.existsSync(t)) t = fs.readFileSync(t, "utf8").trim();
  const r = verifier(t);
  console.log((r.ok ? "Signature valide" : "REFUSÉE : " + r.motif) + (r.type ? " (" + (r.type === "FWK1" ? "licence" : "jeton") + ")" : ""));
  if (r.charge) console.log(JSON.stringify(r.charge, null, 2));
  if (r.ok && r.type === "FWK1"){ const e = LICENCE.etat(r.charge, new Date().toISOString().slice(0, 10)); console.log("état aujourd'hui : " + e.etat + (e.joursRestants != null ? " (" + e.joursRestants + " jour(s) restants)" : "")); }
  process.exit(r.ok ? 0 : 2);
}
else {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\* ?/, ""));
}
