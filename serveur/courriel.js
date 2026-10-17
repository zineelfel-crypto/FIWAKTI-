"use strict";
/* FIWAKTI 56.33.11 — envoi d'e-mails par SMTP, sans dépendance externe (net / tls de Node.js).
   Sécurité : « aucune » (port 25), « starttls » (port 587 : connexion simple puis chiffrement obligatoire) ou « ssl »
   (port 465, chiffré dès la connexion). Authentification PLAIN ou LOGIN si le serveur l'exige. Le certificat du serveur
   de messagerie est vérifié (une connexion non vérifiable est refusée). Le mot de passe n'est jamais journalisé. */
const net = require("net"), tls = require("tls"), crypto = require("crypto"), os = require("os");

const b64 = s => Buffer.from(String(s), "utf8").toString("base64");
/* en-tête encodé (accents, arabe) : =?UTF-8?B?…?= */
const entete = s => /^[\x20-\x7e]*$/.test(String(s)) ? String(s) : "=?UTF-8?B?"+b64(s)+"?=";
const adresseValide = a => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(String(a || "").trim());

function message(o){
  const de = o.nomExpediteur ? entete(o.nomExpediteur)+" <"+o.expediteur+">" : "<"+o.expediteur+">";
  const corps = b64(o.texte || "").replace(/.{1,76}/g, "$&\r\n");
  return ["From: "+de, "To: <"+o.a+">", "Subject: "+entete(o.sujet || "FIWAKTI"), "Date: "+new Date().toUTCString(),
    "Message-ID: <"+crypto.randomBytes(12).toString("hex")+"@"+(String(o.expediteur).split("@")[1] || "fiwakti")+">",
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "Auto-Submitted: auto-generated",
    "", corps].join("\r\n");
}

/* cfg : {hote, port, securite, auth, user, mdp, expediteur, nomExpediteur} ; m : {a, sujet, texte} */
function envoyer(cfg, m){
  return new Promise((ok, ko)=>{
    const hote = String(cfg.hote || "").trim(), sec = cfg.securite || "starttls";
    if (!hote) return ko(new Error("serveur d'envoi non renseigné"));
    if (!adresseValide(cfg.expediteur)) return ko(new Error("adresse d'expédition invalide"));
    if (!adresseValide(m.a)) return ko(new Error("adresse du destinataire invalide"));
    if (cfg.auth && (!cfg.user || !cfg.mdp)) return ko(new Error("identifiant ou mot de passe du compte d'envoi manquant"));
    const port = Number(cfg.port) || (sec === "ssl" ? 465 : sec === "starttls" ? 587 : 25);
    let s, tampon = "", attente = null, fini = false, ext = "";
    const fin = (e)=>{ if (fini) return; fini = true; clearTimeout(minuterie); try { s.end(); s.destroy(); } catch(x){} e ? ko(e) : ok({ok:true}); };
    const minuterie = setTimeout(()=>fin(new Error("délai dépassé (serveur "+hote+":"+port+")")), 30000);
    /* réponse complète : dernière ligne « ddd texte » */
    const brancher = sock => {
      sock.setEncoding("utf8");
      sock.on("data", d=>{ tampon += d; const l = tampon.split("\r\n"); const der = l.filter(Boolean).pop() || "";
        if (/^\d{3} /.test(der) && tampon.endsWith("\r\n")){ const r = {code:+der.slice(0, 3), texte:tampon}; tampon = ""; const a = attente; attente = null; if (a) a(r); } });
      sock.on("error", e=>fin(new Error("connexion "+hote+":"+port+" : "+e.message)));
      sock.on("close", ()=>fin(new Error("connexion fermée par le serveur")));
    };
    const lire = () => new Promise(r=>{ attente = r; });
    const cmd = async (ligne, attendus, masque) => {
      s.write(ligne+"\r\n"); const r = await lire();
      if (attendus.indexOf(r.code) < 0) throw new Error((masque || ligne.split(" ")[0])+" refusé : "+r.texte.trim().split("\r\n").pop().slice(0, 200));
      return r;
    };
    const nomPoste = (os.hostname() || "fiwakti").replace(/[^A-Za-z0-9.-]/g, "") || "fiwakti";
    const dialogue = async () => {
      let r = await lire(); if (r.code !== 220) throw new Error("accueil du serveur inattendu : "+r.texte.trim().slice(0, 200));
      r = await cmd("EHLO "+nomPoste, [250]); ext = r.texte;
      if (sec === "starttls"){
        if (!/STARTTLS/i.test(ext)) throw new Error("le serveur ne propose pas STARTTLS : choisissez SSL/TLS ou vérifiez le port");
        await cmd("STARTTLS", [220]);
        await new Promise((res, rej)=>{ const brut = s; brut.removeAllListeners("data"); brut.removeAllListeners("close"); brut.removeAllListeners("error");
          s = tls.connect({socket:brut, servername:net.isIP(hote) ? undefined : hote}, res); s.once("error", rej); brancher(s); });
        r = await cmd("EHLO "+nomPoste, [250]); ext = r.texte;
      }
      if (cfg.auth){
        if (/AUTH[^\r\n]*PLAIN/i.test(ext)) await cmd("AUTH PLAIN "+b64("\0"+cfg.user+"\0"+cfg.mdp), [235], "authentification");
        else { await cmd("AUTH LOGIN", [334]); await cmd(b64(cfg.user), [334], "identifiant"); await cmd(b64(cfg.mdp), [235], "authentification"); }
      }
      await cmd("MAIL FROM:<"+String(cfg.expediteur).trim()+">", [250]);
      await cmd("RCPT TO:<"+String(m.a).trim()+">", [250, 251]);
      await cmd("DATA", [354]);
      /* points en début de ligne doublés (transparence SMTP) */
      await cmd(message({expediteur:String(cfg.expediteur).trim(), nomExpediteur:cfg.nomExpediteur, a:String(m.a).trim(), sujet:m.sujet, texte:m.texte}).replace(/\r\n\./g, "\r\n..")+"\r\n.", [250], "message");
      try { s.write("QUIT\r\n"); } catch(e){}
    };
    try {
      s = sec === "ssl" ? tls.connect({host:hote, port, servername:net.isIP(hote) ? undefined : hote}) : net.connect({host:hote, port});
      brancher(s);
      dialogue().then(()=>fin(null), e=>fin(e));
    } catch(e){ fin(e); }
  });
}

module.exports = {envoyer, adresseValide};
