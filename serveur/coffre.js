/* FIWAKTI — chiffrement au repos (v45).
   Clés dans donnees/cles/ (fichiers séparés de la base : ils ne figurent jamais dans
   une sauvegarde de la base). AES-256-GCM, authentifié : une donnée modifiée ne se
   déchiffre pas. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const MAGIC = Buffer.from("FWKENC1\n");
function creer(dossier){
  const D = path.join(dossier, "cles");
  fs.mkdirSync(D, {recursive:true, mode:0o700});
  const cache = {};
  function cle(nom){
    if (cache[nom]) return cache[nom];
    const f = path.join(D, nom+".key");
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString("base64"), {mode:0o600});
    const k = Buffer.from(fs.readFileSync(f, "utf8").trim(), "base64");
    if (k.length !== 32) throw new Error("Clé "+nom+" invalide ("+f+").");
    return (cache[nom] = k);
  }
  const empreinte = nom => crypto.createHash("sha256").update(cle(nom)).digest("hex").slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
  function chiffrerTexte(txt, nom){
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(nom), iv);
    const ct = Buffer.concat([c.update(String(txt), "utf8"), c.final()]);
    return "fwk1:"+Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
  }
  function dechiffrerTexte(v, nom){
    const b = Buffer.from(String(v).replace(/^fwk1:/, ""), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", cle(nom), b.slice(0, 12));
    d.setAuthTag(b.slice(12, 28));
    return Buffer.concat([d.update(b.slice(28)), d.final()]).toString("utf8");
  }
  /* fichiers (sauvegardes) : MAGIC | iv(12) | données chiffrées | tag(16) — en flux, sans tout charger en mémoire */
  function chiffrerFichier(src, dst, nom){
    return new Promise((ok, ko)=>{
      const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(nom), iv);
      const out = fs.createWriteStream(dst, {mode:0o600});
      out.write(Buffer.concat([MAGIC, iv]));
      fs.createReadStream(src).pipe(c).on("data", d=>out.write(d)).on("end", ()=>{ out.end(c.getAuthTag(), ()=>ok(dst)); }).on("error", ko);
    });
  }
  function dechiffrerFichier(src, dst, nom){
    return new Promise((ok, ko)=>{
      const taille = fs.statSync(src).size, fd = fs.openSync(src, "r");
      const tete = Buffer.alloc(MAGIC.length + 12); fs.readSync(fd, tete, 0, tete.length, 0);
      const tag = Buffer.alloc(16); fs.readSync(fd, tag, 0, 16, taille - 16); fs.closeSync(fd);
      if (!tete.slice(0, MAGIC.length).equals(MAGIC)) return ko(new Error("Fichier non chiffré par FIWAKTI."));
      const d = crypto.createDecipheriv("aes-256-gcm", cle(nom), tete.slice(MAGIC.length));
      d.setAuthTag(tag);
      const out = fs.createWriteStream(dst, {mode:0o600});
      fs.createReadStream(src, {start:tete.length, end:taille - 17}).pipe(d).on("error", e=>{ out.destroy(); try { fs.unlinkSync(dst); } catch(x){} ko(new Error("Déchiffrement impossible : clé différente ou fichier altéré.")); })
        .pipe(out).on("finish", ()=>ok(dst)).on("error", ko);
    });
  }
  const estChiffre = f => { try { const fd = fs.openSync(f, "r"), b = Buffer.alloc(MAGIC.length); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); return b.equals(MAGIC); } catch(e){ return false; } };
  /* v47 : trousseau = toutes les clés (sauvegardes, accès des appareils, approbations des pilotes, double
     authentification). Indispensable pour une reprise après sinistre sur une autre machine. */
  /* v56.23 : inventaire dynamique — toutes les clés présentes (dont biometrie, medical, recrutement et celles des futurs
     modules), plus les trois clés de base ; aucune liste à tenir à jour à la main */
  const NOM_OK = /^[a-z0-9-]{2,40}$/;
  function noms(){ const l = new Set(["sauvegarde","secrets","pilotes"]); try { fs.readdirSync(D).forEach(f=>{ const m = /^([a-z0-9-]{2,40})\.key$/.exec(f); if (m) l.add(m[1]); }); } catch(e){} return Array.from(l).sort(); }
  function existe(nom){ return NOM_OK.test(nom) && fs.existsSync(path.join(D, nom+".key")); }
  /* empreinte d'une clé existante, sans jamais en créer une */
  function empreinteSiExiste(nom){ return existe(nom) ? empreinte(nom) : null; }
  function inventaire(){ const o = {}; noms().forEach(n=>{ const e = empreinteSiExiste(n); if (e) o[n] = e; }); return o; }
  function trousseau(){ const o = {format:"fiwakti-trousseau-2", cree:new Date().toISOString(), cles:{}, empreintes:{}};
    noms().forEach(n=>{ o.cles[n] = cle(n).toString("base64"); o.empreintes[n] = empreinte(n); }); return o; }
  function importer(t){
    let o = t; if (typeof t === "string"){ try { o = JSON.parse(t); } catch(e){ o = {cles:{sauvegarde:t.trim()}}; } }   /* ancien format : la seule clé des sauvegardes */
    const faites = [];
    Object.keys((o && o.cles) || {}).forEach(n=>{
      if (!NOM_OK.test(n)) return;
      const k = Buffer.from(String(o.cles[n]), "base64"); if (k.length !== 32) throw new Error("Clé « "+n+" » invalide.");
      const f = path.join(D, n+".key"); if (fs.existsSync(f)) fs.renameSync(f, f+".avant-reprise-"+Date.now());
      fs.writeFileSync(f, k.toString("base64"), {mode:0o600}); delete cache[n]; faites.push(n);
    });
    if (!faites.length) throw new Error("Aucune clé reconnue dans ce fichier.");
    return faites;
  }
  return {oublier:nom=>{ delete cache[nom]; }, trousseau, importer, cle, empreinte, empreinteSiExiste, inventaire, existe, chiffrerTexte, dechiffrerTexte, chiffrerFichier, dechiffrerFichier, estChiffre, dossier:D};
}
module.exports = {creer};
