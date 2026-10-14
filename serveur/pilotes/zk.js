/* FIWAKTI — pilote ZKTeco, protocole natif (TCP, port 4370 par défaut).
   Couvre les terminaux ZKTeco / ZKSoftware « standalone » (séries K, iClock, MB, uFace,
   SpeedFace en mode protocole natif…) : informations, heure, badgeages, utilisateurs,
   effacements, redémarrage. Implémentation du protocole public « ZK » (format des
   paquets, clé de communication, lecture par tampon), sans DLL constructeur. */
"use strict";
const path = require("path");
const net = require("net");
const C = {CONNECT:1000, EXIT:1001, ENABLE:1002, DISABLE:1003, RESTART:1004, ACK_OK:2000, ACK_ERROR:2001, ACK_DATA:2002, ACK_UNAUTH:2005,
  AUTH:1102, OPTIONS_RRQ:11, GET_TIME:201, SET_TIME:202, ATTLOG_RRQ:13, USERTEMP_RRQ:9, CLEAR_DATA:14, CLEAR_ATTLOG:15, USER_WRQ:8,
  DELETE_USER:18, FREE_SIZES:50, PREPARE_DATA:1500, DATA:1501, FREE_DATA:1502, DATA_WRRQ:1503, READ_BUFFER:1504, GET_VERSION:1100, REFRESHDATA:1013};
const USHRT = 65535;
function checksum(buf){
  let s = 0, i = 0;
  for (; i + 1 < buf.length; i += 2){ s += buf.readUInt16LE(i); if (s > USHRT) s -= USHRT; }
  if (i < buf.length) s += buf[buf.length-1];
  while (s > USHRT) s -= USHRT;
  s = ~s; while (s < 0) s += USHRT;
  return s & 0xFFFF;
}
function paquet(cmd, session, reply, data){
  data = data || Buffer.alloc(0);
  const h = Buffer.alloc(8); h.writeUInt16LE(cmd, 0); h.writeUInt16LE(0, 2); h.writeUInt16LE(session, 4); h.writeUInt16LE(reply, 6);
  const cs = checksum(Buffer.concat([h, data]));
  let r2 = reply + 1; if (r2 >= USHRT) r2 -= USHRT;
  h.writeUInt16LE(cs, 2); h.writeUInt16LE(r2, 6);
  const p = Buffer.concat([h, data]);
  const top = Buffer.alloc(8); top.writeUInt16LE(0x5050, 0); top.writeUInt16LE(0x7D82, 2); top.writeUInt32LE(p.length, 4);
  return Buffer.concat([top, p]);
}
function cleComm(key, session, ticks){
  key = Number(key) || 0; ticks = ticks || 50;
  let k = 0;
  for (let i = 0; i < 32; i++) k = ((key & (1 << i)) ? ((k << 1) | 1) : (k << 1)) >>> 0;
  k = (k + session) >>> 0;
  const b = Buffer.alloc(4); b.writeUInt32LE(k, 0);
  const x = Buffer.from([b[0] ^ 0x5A, b[1] ^ 0x4B, b[2] ^ 0x53, b[3] ^ 0x4F]);
  const h1 = x.readUInt16LE(0), h2 = x.readUInt16LE(2);
  const y = Buffer.alloc(4); y.writeUInt16LE(h2, 0); y.writeUInt16LE(h1, 2);
  const B = 0xFF & ticks;
  return Buffer.from([y[0] ^ B, y[1] ^ B, B, y[3] ^ B]);
}
function decodeTemps(t){
  const s = t % 60; t = Math.floor(t / 60); const mi = t % 60; t = Math.floor(t / 60); const h = t % 24; t = Math.floor(t / 24);
  const d = t % 31 + 1; t = Math.floor(t / 31); const mo = t % 12 + 1; t = Math.floor(t / 12); const y = t + 2000;
  const p = n => String(n).padStart(2, "0");
  return y+"-"+p(mo)+"-"+p(d)+" "+p(h)+":"+p(mi)+":"+p(s);
}
function encodeTemps(dt){
  return (((dt.getFullYear() % 100) * 12 * 31 + dt.getMonth() * 31 + dt.getDate() - 1) * 86400) + (dt.getHours() * 60 + dt.getMinutes()) * 60 + dt.getSeconds();
}
const chaine = b => { const i = b.indexOf(0); return (i >= 0 ? b.slice(0, i) : b).toString("latin1").trim(); };

class Liaison {
  constructor(ip, port, delai){ this.ip = ip; this.port = port || 4370; this.delai = delai || 8000; this.session = 0; this.reply = USHRT - 1; this.tampon = Buffer.alloc(0); this.attente = null; }
  ouvrir(){
    return new Promise((ok, ko)=>{
      this.s = net.connect({host:this.ip, port:this.port});
      const t = setTimeout(()=>{ this.s.destroy(); ko(new Error("Pas de réponse de l'appareil ("+this.ip+":"+this.port+").")); }, this.delai);
      this.s.once("connect", ()=>{ clearTimeout(t); ok(); });
      this.s.once("error", e=>{ clearTimeout(t); ko(e); });
      this.s.on("data", d=>{ this.tampon = Buffer.concat([this.tampon, d]); this.depiler(); });
      this.s.on("close", ()=>{ if (this.attente){ const a = this.attente; this.attente = null; a.ko(new Error("Connexion fermée par l'appareil.")); } });
    });
  }
  /* un message TCP complet = en-tête 8 octets + paquet ZK */
  depiler(){
    while (this.tampon.length >= 8){
      if (this.tampon.readUInt16LE(0) !== 0x5050){ this.tampon = Buffer.alloc(0); return; }
      const n = this.tampon.readUInt32LE(4);
      if (this.tampon.length < 8 + n) return;
      const p = this.tampon.slice(8, 8 + n); this.tampon = this.tampon.slice(8 + n);
      const r = {code:p.readUInt16LE(0), session:p.readUInt16LE(4), reply:p.readUInt16LE(6), data:p.slice(8)};
      if (this.attente){ const a = this.attente; this.attente = null; clearTimeout(a.t); a.ok(r); }
      else (this.surplus = this.surplus || []).push(r);
    }
  }
  recevoir(){
    if (this.surplus && this.surplus.length) return Promise.resolve(this.surplus.shift());
    return new Promise((ok, ko)=>{ const t = setTimeout(()=>{ this.attente = null; ko(new Error("L'appareil ne répond plus.")); }, this.delai); this.attente = {ok, ko, t}; });
  }
  async commande(cmd, data){
    this.s.write(paquet(cmd, this.session, this.reply, data));
    const r = await this.recevoir();
    this.reply = r.reply;          /* l'appareil renvoie le numéro à reprendre */
    return r;
  }
  async connecter(cle){
    const r = await this.commande(C.CONNECT);
    this.session = r.session;
    if (r.code === C.ACK_UNAUTH){
      const a = await this.commande(C.AUTH, cleComm(cle, this.session));
      if (a.code !== C.ACK_OK) throw new Error("Clé de communication refusée par l'appareil.");
    } else if (r.code !== C.ACK_OK) throw new Error("Connexion refusée par l'appareil (code "+r.code+").");
  }
  async option(nom){
    const r = await this.commande(C.OPTIONS_RRQ, Buffer.from("~"+nom+"\0", "latin1"));
    const v = chaine(r.data); const i = v.indexOf("="); return i >= 0 ? v.slice(i+1) : "";
  }
  /* lecture d'un bloc de données (badgeages, utilisateurs) par le tampon de l'appareil */
  async lireTampon(cmd, fct){
    const q = Buffer.alloc(11); q.writeInt8(1, 0); q.writeInt16LE(cmd, 1); q.writeInt32LE(fct || 0, 3); q.writeInt32LE(0, 7);
    const r = await this.commande(C.DATA_WRRQ, q);
    if (r.code === C.DATA) return r.data;
    if (r.code !== C.ACK_OK) throw new Error("Lecture refusée par l'appareil (code "+r.code+").");
    const taille = r.data.readUInt32LE(1);
    const morceaux = []; const MAX = 0xFFC0;
    for (let debut = 0; debut < taille; debut += MAX){
      const n = Math.min(MAX, taille - debut);
      const b = Buffer.alloc(8); b.writeInt32LE(debut, 0); b.writeInt32LE(n, 4);
      let x = await this.commande(C.READ_BUFFER, b);
      if (x.code === C.DATA){ morceaux.push(x.data); continue; }
      if (x.code !== C.PREPARE_DATA) throw new Error("Réponse inattendue pendant la lecture (code "+x.code+").");
      const attendu = x.data.readUInt32LE(0); let lu = 0;
      while (lu < attendu){ const d = await this.recevoir(); if (d.code !== C.DATA) break; morceaux.push(d.data); lu += d.data.length; }
      const fin = await this.recevoir(); if (fin.code !== C.ACK_OK) throw new Error("Fin de lecture incorrecte.");
    }
    await this.commande(C.FREE_DATA);
    return Buffer.concat(morceaux);
  }
  async tailles(){
    const r = await this.commande(C.FREE_SIZES);
    if (r.data.length < 80) return {utilisateurs:0, badgeages:0};
    return {utilisateurs:r.data.readInt32LE(16), empreintes:r.data.readInt32LE(24), badgeages:r.data.readInt32LE(32)};
  }
  /* fin de session : réponse attendue au plus 1 s, et rien à envoyer si la liaison est déjà coupée */
  async fermer(){
    if (this.s && !this.s.destroyed && this.s.writable){ const d = this.delai; this.delai = 1000; try { await this.commande(C.EXIT); } catch(e){} this.delai = d; }
    try { this.s.destroy(); } catch(e){}
  }
}

async function avecAppareil(terminal, secret, fn){
  if (!terminal.ip) throw new Error("Adresse IP de l'appareil manquante.");
  const L = new Liaison(terminal.ip, Number(terminal.port) || 4370, 10000);
  await L.ouvrir();
  try { await L.connecter((secret && secret.cle) || 0); return await fn(L); }
  finally { await L.fermer(); }
}
/* 56.33.11 : taille d'une fiche (72 ou 28 octets) déduite du nombre d'utilisateurs annoncé par l'appareil quand il est
   connu : « multiple de 72 » seul lisait de travers un ancien appareil à fiches de 28 octets (18 utilisateurs = 504 octets) */
function lireUtilisateurs(buf, nb){
  const total = buf.readUInt32LE(0), data = buf.slice(4, 4 + total), out = [];
  const taille = nb > 0 && (data.length === nb * 72 || data.length === nb * 28) ? data.length / nb : data.length % 72 === 0 ? 72 : 28;
  for (let o = 0; o + taille <= data.length; o += taille){
    const r = data.slice(o, o + taille);
    if (taille === 72) out.push({uid:r.readUInt16LE(0), privilege:r[2], nom:chaine(r.slice(11, 35)), carte:r.readUInt32LE(35), groupe:chaine(r.slice(40, 47)), id:chaine(r.slice(48, 72))});
    else out.push({uid:r.readUInt16LE(0), privilege:r[2], nom:chaine(r.slice(8, 16)), carte:r.readUInt32LE(16), groupe:String(r[21]), id:String(r.readUInt32LE(24))});
  }
  return out;
}
function lireBadgeages(buf, nb, utilisateurs){
  const total = buf.readUInt32LE(0), data = buf.slice(4, 4 + total), out = [];
  if (!nb) return out;
  const taille = Math.round(data.length / nb);
  const parUid = new Map((utilisateurs||[]).map(u=>[u.uid, u.id]));
  for (let o = 0; o + taille <= data.length; o += taille){
    const r = data.slice(o, o + taille);
    if (taille === 8) out.push({utilisateur:parUid.get(r.readUInt16LE(0)) || String(r.readUInt16LE(0)), horodatage:decodeTemps(r.readUInt32LE(3)), etat:r[7]});
    else if (taille === 16) out.push({utilisateur:String(r.readUInt32LE(0)), horodatage:decodeTemps(r.readUInt32LE(4)), etat:r[9]});
    else if (taille >= 40) out.push({utilisateur:chaine(r.slice(2, 26)), horodatage:decodeTemps(r.readUInt32LE(27)), etat:r[31]});
  }
  return out;
}
const nbUtilisateurs = L => L.tailles().then(t=>t.utilisateurs, ()=>0);
/* 56.33.11 : heure « AAAA-MM-JJ HH:MM:SS » de l'instant ms dans le fuseau tz (l'appareil est à l'heure locale du site) */
function heureDans(tz, ms){
  const f = tz => new Intl.DateTimeFormat("en-GB", {timeZone:tz, hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"});
  let F; try { F = f(tz); } catch(e){ F = f("Africa/Tunis"); }
  const p = {}; F.formatToParts(new Date(ms)).forEach(x=>{ p[x.type] = x.value; });
  return p.year+"-"+p.month+"-"+p.day+" "+p.hour+":"+p.minute+":"+p.second;
}
/* même codage qu'encodeTemps, à partir du texte (sans Date locale du serveur, ni ses changements d'heure) */
const encodeTexte = h => { const [y, mo, d, hh, mi, ss] = h.match(/\d+/g).map(Number); return (((y % 100) * 12 * 31 + (mo - 1) * 31 + d - 1) * 86400) + (hh * 60 + mi) * 60 + ss; };
/* 56.33.11 : règle de purge après collecte — motif de refus, ou "" si l'effacement de l'appareil est permis */
function refusPurge({erreurArchive, archiveurDispo, archive, integres, lus, annonce}){
  if (erreurArchive) return erreurArchive;
  if (archiveurDispo && !archive) return "pas de copie de sauvegarde";
  if (!integres || !integres.ok) return "badgeages non enregistrés";
  if (annonce === null || annonce === undefined || lus !== annonce) return "lecture incomplète ("+lus+" lus sur "+(annonce == null ? "?" : annonce)+")";
  return "";
}
/* état ZK du badgeage : 0 entrée, 1 sortie, 2 sortie pause, 3 retour pause, 4/5 heures sup. ; 255 = non renseigné */
const SENS = {0:"E", 1:"S", 2:"S", 3:"E", 4:"E", 5:"S"};

module.exports = {refusPurge, 
  id:"zk", nom:"ZKTeco — protocole natif (TCP 4370)",
  marques:["ZKTeco", "ZKSoftware", "Entrosys", "Anviz (compatibles ZK)", "iClock"],
  modeles:"Séries K, MB, iClock, uFace, SpeedFace, ProFace (mode protocole natif)",
  capacites:["diagnostic","info","collecte","utilisateurs-lire","utilisateurs-envoyer","nettoyage","synchro-heure","redemarrer","utilisateurs-retirer"],
  champs:[{k:"cle", l:"Clé de communication (0 si aucune)", secret:true}],
  async executer(action, T, secret, ctx){
    return avecAppareil(T, secret, async L=>{
      if (action === "diagnostic" || action === "info"){
        const info = {sn:await L.option("SerialNumber").catch(()=>""), plateforme:await L.option("Platform").catch(()=>""), nom:await L.option("DeviceName").catch(()=>"")};
        try { const v = await L.commande(C.GET_VERSION); info.firmware = chaine(v.data); } catch(e){}
        try { Object.assign(info, await L.tailles()); } catch(e){}
        return {enLigne:true, info};
      }
      if (action === "synchro-heure"){
        /* 56.33.11 : heure envoyée dans le fuseau de l'appareil (fiche, site, sinon Africa/Tunis), celui avec lequel
           l'ingestion lit ses badgeages — et non l'heure locale du serveur : serveur en UTC = badgeages décalés d'1 h */
        const tz = (ctx && ctx.fuseau) || T.fuseau || "Africa/Tunis";
        const avant = await L.commande(C.GET_TIME);
        const h = decodeTemps(avant.data.readUInt32LE(0)), maintenant = Date.now(), ici = heureDans(tz, maintenant);
        const ecart = Math.round((Date.parse(ici.replace(" ", "T")+"Z") - Date.parse(h.replace(" ", "T")+"Z")) / 1000);
        const b = Buffer.alloc(4); b.writeUInt32LE(encodeTexte(ici), 0);
        const r = await L.commande(C.SET_TIME, b);
        if (r.code !== C.ACK_OK) throw new Error("L'appareil a refusé la mise à l'heure.");
        return {ecartSecondes:ecart};
      }
      if (action === "collecte" || action === "utilisateurs-lire"){
        const tl = await L.tailles();
        const users = lireUtilisateurs(await L.lireTampon(C.USERTEMP_RRQ, 5), tl.utilisateurs);
        if (action === "utilisateurs-lire") return {utilisateurs:users.map(u=>({id:u.id, nom:u.nom, carte:u.carte ? String(u.carte) : "", privilege:u.privilege}))};
        await L.commande(C.DISABLE);
        try {
          /* 56.33.11 : nombre de badgeages relu appareil verrouillé (plus aucun badgeage ne peut arriver) */
          const tl2 = await L.tailles().catch(()=>null);
          const bad = lireBadgeages(await L.lireTampon(C.ATTLOG_RRQ, 0), tl2 ? tl2.badgeages : tl.badgeages, users);
          const lignes = bad.map(b=>({utilisateur:b.utilisateur, horodatage:b.horodatage, sens:SENS[b.etat] || ""}));
          /* copie de sauvegarde sur le serveur avant tout enregistrement et toute purge */
          let arch = null, motifSansPurge = "";
          /* 56.33.11 : copie complète seulement si l'appareil va être effacé ; sans purge, l'appareil garde son journal et
             la copie automatique (ctx.integrer) n'archive que les badgeages pas encore archivés */
          if (T.purgeApresCollecte && lignes.length && ctx.archiver){ try { arch = await ctx.archiver(lignes, {complet:true}); } catch(e){ motifSansPurge = "archive impossible : "+e.message; } }
          const integres = await ctx.integrer(lignes);
          /* purge de l'appareil seulement si l'option est demandée ET si : copie de sauvegarde écrite, badgeages enregistrés
             par FIWAKTI, et lecture complète (autant de badgeages lus que l'appareil en annonce) — une lecture tronquée
             (coupure réseau) n'efface jamais l'appareil */
          let purge = false;
          if (T.purgeApresCollecte && bad.length){
            motifSansPurge = refusPurge({erreurArchive:motifSansPurge, archiveurDispo:!!ctx.archiver, archive:arch, integres, lus:bad.length, annonce:tl2 ? tl2.badgeages : null});
            if (!motifSansPurge){ const r = await L.commande(C.CLEAR_ATTLOG); purge = r.code === C.ACK_OK; if (!purge) motifSansPurge = "effacement refusé par l'appareil"; }
          }
          /* code du motif, traduit par l'interface (le texte détaillé reste pour le journal) */
          const purgeCode = !motifSansPurge ? undefined : /^(archive|pas de copie)/.test(motifSansPurge) ? "copie" : /^badgeages non/.test(motifSansPurge) ? "enregistrement" : /^lecture/.test(motifSansPurge) ? "lecture" : /^effacement/.test(motifSansPurge) ? "appareil" : "autre";
          return Object.assign({lus:bad.length, purge, purgeDemandee:!!T.purgeApresCollecte, archive:arch ? path.basename(arch.fichier) : null, purgeNonFaite:motifSansPurge || undefined, purgeCode}, integres);
        } finally { await L.commande(C.ENABLE).catch(()=>{}); }
      }
      if (action === "utilisateurs-envoyer"){
        const liste = await ctx.utilisateursPour(T);
        const actuels = lireUtilisateurs(await L.lireTampon(C.USERTEMP_RRQ, 5), await nbUtilisateurs(L));
        const parId = new Map(actuels.map(u=>[u.id, u]));
        let uidMax = actuels.reduce((m, u)=>Math.max(m, u.uid), 0), n = 0;
        await L.commande(C.DISABLE);
        try {
          for (const u of liste){
            const ex = parId.get(String(u.id));
            const uid = ex ? ex.uid : ++uidMax;
            const b = Buffer.alloc(72);
            b.writeUInt16LE(uid, 0); b[2] = 0;
            Buffer.from(String(u.pin||"").slice(0, 8), "latin1").copy(b, 3);
            Buffer.from(String(u.nom||"").slice(0, 24), "latin1").copy(b, 11);
            b.writeUInt32LE(Number(u.carte)||0, 35);
            Buffer.from("1", "latin1").copy(b, 40);
            Buffer.from(String(u.id).slice(0, 24), "latin1").copy(b, 48);
            const r = await L.commande(C.USER_WRQ, b);
            if (r.code === C.ACK_OK) n++;
          }
          await L.commande(C.REFRESHDATA);
        } finally { await L.commande(C.ENABLE).catch(()=>{}); }
        return {envoyes:n, total:liste.length};
      }
      if (action === "nettoyage"){
        const quoi = ctx.options.quoi || "pointages";
        if (quoi === "pointages" || quoi === "tout"){ const r = await L.commande(C.CLEAR_ATTLOG); if (r.code !== C.ACK_OK) throw new Error("Effacement des badgeages refusé."); }
        if (quoi === "utilisateurs" || quoi === "tout"){ const r = await L.commande(C.CLEAR_DATA, Buffer.from([5])); if (r.code !== C.ACK_OK) throw new Error("Effacement des utilisateurs refusé."); }
        return {ok:true};
      }
      if (action === "redemarrer"){ await L.commande(C.RESTART); return {ok:true}; }
      /* v56.24 : retrait ciblé — l'utilisateur et ses empreintes (confirmé par l'appareil) */
      if (action === "utilisateurs-retirer"){
        const ids = new Set((ctx.options.ids || []).map(String)), actuels = lireUtilisateurs(await L.lireTampon(C.USERTEMP_RRQ, 5), await nbUtilisateurs(L)); let n = 0;
        await L.commande(C.DISABLE);
        try { for (const u of actuels.filter(x=>ids.has(String(x.id)))){ const b = Buffer.alloc(2); b.writeUInt16LE(u.uid, 0); const r = await L.commande(C.DELETE_USER, b); if (r.code === C.ACK_OK) n++; }
          await L.commande(C.REFRESHDATA); } finally { await L.commande(C.ENABLE).catch(()=>{}); }
        return {retires:n, absents:ids.size - n, confirme:true};
      }
      if (action === "effacer-commandes") return {ok:true, note:"Aucune file de commandes en mode protocole natif."};
      throw new Error("Action non prise en charge par ce pilote.");
    });
  },
  _interne:{paquet, checksum, cleComm, decodeTemps, encodeTemps, C, lireUtilisateurs, heureDans, encodeTexte}
};
