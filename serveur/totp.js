/* FIWAKTI — double authentification par code à usage unique (TOTP, RFC 6238 :
   SHA-1, 6 chiffres, 30 s), compatible Google Authenticator, Microsoft Authenticator,
   FreeOTP… Tolérance d'un pas (±30 s) ; un code déjà utilisé est refusé. */
"use strict";
const crypto = require("crypto");
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf){ let bits = 0, v = 0, out = ""; for (const b of buf){ v = (v << 8) | b; bits += 8; while (bits >= 5){ out += ALPHA[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += ALPHA[(v << (5 - bits)) & 31]; return out; }
function debase32(s){ s = String(s).toUpperCase().replace(/[^A-Z2-7]/g, ""); let bits = 0, v = 0; const out = []; for (const c of s){ v = (v << 5) | ALPHA.indexOf(c); bits += 5; if (bits >= 8){ out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function hotp(cle, compteur){
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(compteur));
  const h = crypto.createHmac("sha1", cle).update(b).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, "0");
}
const pas = t => Math.floor((t || Date.now()) / 30000);
function nouveauSecret(){ return base32(crypto.randomBytes(20)); }
function uri(secret, compte, emetteur){ return "otpauth://totp/"+encodeURIComponent(emetteur+":"+compte)+"?secret="+secret+"&issuer="+encodeURIComponent(emetteur)+"&algorithm=SHA1&digits=6&period=30"; }
/* renvoie le pas accepté (pour refuser un rejeu), ou -1 */
function verifier(secret, code, dernierPas){
  code = String(code||"").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return -1;
  const cle = debase32(secret), p = pas();
  for (const d of [0, -1, 1]){
    const x = p + d;
    if (dernierPas !== undefined && dernierPas !== null && x <= Number(dernierPas)) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(cle, x)), Buffer.from(code))) return x;
  }
  return -1;
}
module.exports = {nouveauSecret, uri, verifier, hotp, debase32, pas};
