/* FIWAKTI v56.5 — visages des pointeuses faciales : import depuis un terminal vers la base, envoi vers d'autres terminaux.
   Données biométriques : chiffrées dans la base (AES-256-GCM, clé du coffre), jamais envoyées au navigateur (seulement
   leurs métadonnées), opérations réservées au droit « paramétrage » des terminaux et tracées. Formats :
   - photo-jpeg      : photo du visage (Hikvision, BioStar 2, ZKTeco BIOPHOTO) — réutilisable par tout terminal à photo ;
   - zk-bio9-v<N>    : gabarit ZKTeco visage lumière visible (BIODATA Type=9, algorithme majeur N) — même famille seulement ;
   - zk-face7        : ancien gabarit ZKTeco (table FACE) — même famille seulement. */
"use strict";
const crypto = require("crypto");
const ddl = {
  pg:["CREATE TABLE IF NOT EXISTS bio_visages (id TEXT PRIMARY KEY, mat TEXT NOT NULL, format TEXT NOT NULL, indice INTEGER NOT NULL DEFAULT 0, empreinte TEXT NOT NULL, taille INTEGER NOT NULL, donnees TEXT NOT NULL, source TEXT, cree TEXT NOT NULL, par TEXT)",
      "CREATE UNIQUE INDEX IF NOT EXISTS bio_visages_cle ON bio_visages(mat, format, indice)"],
  sqlite:["CREATE TABLE IF NOT EXISTS bio_visages (id TEXT PRIMARY KEY, mat TEXT NOT NULL, format TEXT NOT NULL, indice INTEGER NOT NULL DEFAULT 0, empreinte TEXT NOT NULL, taille INTEGER NOT NULL, donnees TEXT NOT NULL, source TEXT, cree TEXT NOT NULL, par TEXT)",
      "CREATE UNIQUE INDEX IF NOT EXISTS bio_visages_cle ON bio_visages(mat, format, indice)"]
};
const tables = {bio_visages:"id"};
function creer(o){
  const {B, coffre, audit} = o;
  const cle = () => crypto.createHash("sha256").update(coffre.cle("biometrie")).digest();
  function chiffrer(buf){ const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", cle(), iv);
    const x = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([iv, c.getAuthTag(), x]).toString("base64"); }
  function dechiffrer(s){ const b = Buffer.from(s, "base64"), d = crypto.createDecipheriv("aes-256-gcm", cle(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]); }
  /* enregistrement (ou remplacement si le visage a changé) — mat déjà résolu par l'appelant */
  async function enregistrer(mat, format, octets, source, indice){
    if (!mat || !octets || !octets.length || octets.length > 2*1024*1024) return {ok:false};
    const emp = crypto.createHash("sha256").update(octets).digest("hex"), i = Number(indice)||0;
    const av = await B.get("SELECT id, empreinte FROM bio_visages WHERE mat=? AND format=? AND indice=?", String(mat), format, i);
    if (av && av.empreinte === emp) return {ok:true, inchange:true};
    if (av) await B.run("UPDATE bio_visages SET empreinte=?, taille=?, donnees=?, source=?, cree=? WHERE id=?", emp, octets.length, chiffrer(octets), source||"", new Date().toISOString(), av.id);
    else await B.run("INSERT INTO bio_visages(id,mat,format,indice,empreinte,taille,donnees,source,cree,par) VALUES(?,?,?,?,?,?,?,?,?,?)",
      "bv-"+crypto.randomBytes(8).toString("hex"), String(mat), format, i, emp, octets.length, chiffrer(octets), source||"", new Date().toISOString(), "terminal");
    return {ok:true, nouveau:!av};
  }
  async function pour(mats, formats){
    if (!mats.length) return [];
    const out = [];
    for (let k = 0; k < mats.length; k += 500){ const lot = mats.slice(k, k+500);
      (await B.all("SELECT mat, format, indice, donnees FROM bio_visages WHERE mat IN ("+lot.map(()=>"?").join(",")+")", ...lot))
        .filter(r=>!formats || formats.some(f=>r.format === f || (f.endsWith("*") && r.format.startsWith(f.slice(0, -1)))))
        .forEach(r=>{ try { out.push({mat:r.mat, format:r.format, indice:r.indice, octets:dechiffrer(r.donnees)}); } catch(e){} }); }
    return out;
  }
  async function resume(){ const r = await B.all("SELECT format, COUNT(*) n, COUNT(DISTINCT mat) s FROM bio_visages GROUP BY format"); return r.map(x=>({format:x.format, visages:Number(x.n), salaries:Number(x.s)})); }
  async function deSalarie(mat){ return (await B.all("SELECT format, indice, taille, source, cree FROM bio_visages WHERE mat=? ORDER BY format", String(mat))); }
  async function supprimer(mat, login){ const n = (await B.all("SELECT id FROM bio_visages WHERE mat=?", String(mat))).length; await B.run("DELETE FROM bio_visages WHERE mat=?", String(mat)); await audit(login, "biometrie.visages.supprimes", mat+" : "+n); return n; }
  return {enregistrer, pour, resume, deSalarie, supprimer};
}
module.exports = {ddl, tables, creer};
