/* FIWAKTI — requêtes HTTP(S) vers les appareils, avec authentification « Digest »
   (Hikvision ISAPI) ou par session (Suprema BioStar 2). */
"use strict";
const http = require("http"), https = require("https"), crypto = require("crypto");
function requete(url, opts, corps){
  return new Promise((ok, ko)=>{
    const u = new URL(url), lib = u.protocol === "https:" ? https : http;
    const r = lib.request({hostname:u.hostname, port:u.port || (u.protocol === "https:" ? 443 : 80), path:u.pathname + u.search, method:opts.method || "GET",
      headers:opts.headers || {}, rejectUnauthorized:opts.verifierCertificat !== false ? false : false, timeout:opts.delai || 15000}, res=>{
      const parts = []; res.on("data", d=>parts.push(d)); res.on("end", ()=>{ const b = Buffer.concat(parts); ok({statut:res.statusCode, entetes:res.headers, corps:opts.binaire ? b : b.toString("utf8")}); });
    });
    r.on("timeout", ()=>{ r.destroy(new Error("Pas de réponse de l'appareil ("+u.host+").")); });
    r.on("error", ko);
    if (corps) r.write(corps);
    r.end();
  });
}
const md5 = s => crypto.createHash("md5").update(s).digest("hex");
/* authentification Digest (RFC 7616, MD5, qop=auth) */
async function digest(url, opts, corps, util, mdp){
  const r1 = await requete(url, opts, corps);
  if (r1.statut !== 401) return r1;
  const a = String(r1.entetes["www-authenticate"]||"");
  if (!/^Digest/i.test(a)) return r1;
  const p = {}; a.replace(/(\w+)="?([^",]+)"?/g, (_, k, v)=>{ p[k] = v; });
  const u = new URL(url), uri = u.pathname + u.search, nc = "00000001", cnonce = crypto.randomBytes(8).toString("hex");
  const ha1 = md5(util+":"+p.realm+":"+mdp), ha2 = md5((opts.method||"GET")+":"+uri);
  const rep = p.qop ? md5(ha1+":"+p.nonce+":"+nc+":"+cnonce+":auth:"+ha2) : md5(ha1+":"+p.nonce+":"+ha2);
  const h = 'Digest username="'+util+'", realm="'+p.realm+'", nonce="'+p.nonce+'", uri="'+uri+'", response="'+rep+'"'+
    (p.qop ? ', qop=auth, nc='+nc+', cnonce="'+cnonce+'"' : '')+(p.opaque ? ', opaque="'+p.opaque+'"' : '')+', algorithm=MD5';
  return requete(url, Object.assign({}, opts, {headers:Object.assign({}, opts.headers||{}, {Authorization:h})}), corps);
}
module.exports = {requete, digest};
