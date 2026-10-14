/* FIWAKTI — pilote ZKTeco « Push » (protocole ADMS / iclock, HTTP).
   Les terminaux récents (SpeedFace, ProFace X, MB, uFace en mode ADMS) appellent
   eux-mêmes le serveur : ils envoient leurs badgeages au fil de l'eau et
   viennent chercher les commandes en attente (utilisateurs, heure, redémarrage,
   effacements). Côté appareil : Menu Communication > Serveur cloud / ADMS,
   adresse de ce serveur et port « push » (8081 par défaut). */
"use strict";
module.exports = {
  id:"zk-push", nom:"ZKTeco — Push ADMS (l'appareil appelle le serveur)",
  marques:["ZKTeco", "ZKSoftware"], modeles:"SpeedFace, ProFace X, MB, uFace, iClock en mode ADMS / Cloud Server",
  capacites:["diagnostic","info","collecte","utilisateurs-lire","utilisateurs-envoyer","nettoyage","synchro-heure","redemarrer","effacer-commandes","visages-lire","visages-envoyer","utilisateurs-retirer"],
  champs:[],
  push:true,
  async executer(action, T, S, ctx){
    const etat = ctx.etatPush(T.sn);
    if (!T.sn) throw new Error("Renseignez le numéro de série de l'appareil : c'est lui qui identifie ses envois.");
    if (action === "diagnostic" || action === "info"){
      const recent = etat.vu && (Date.now() - new Date(etat.vu).getTime()) < 3*60000;
      return {enLigne:!!recent, motif:recent ? "" : (etat.vu ? "Dernier contact : "+etat.vu : "L'appareil ne s'est jamais connecté (vérifier l'adresse du serveur dans son menu Communication)."),
        info:{sn:T.sn, modele:etat.modele||"", firmware:etat.firmware||"", dernierContact:etat.vu||null, commandesEnAttente:(etat.cmds||[]).length}};
    }
    const cmd = c => ctx.commandePush(T.sn, c);
    if (action === "collecte"){ cmd("DATA QUERY ATTLOG StartTime="+ctx.depuis(T)+"\tEndTime="+ctx.maintenant()); return {lus:0, integres:0, purge:false, note:"Demande envoyée : l'appareil transmet ses badgeages à sa prochaine connexion (quelques secondes)."}; }
    if (action === "utilisateurs-lire"){ cmd("DATA QUERY USERINFO"); return {utilisateurs:etat.utilisateurs || [], note:"Liste reçue lors du dernier envoi de l'appareil ; une nouvelle demande est partie."}; }
    if (action === "utilisateurs-envoyer"){
      const l = await ctx.utilisateursPour(T);
      l.forEach(u=>cmd("DATA UPDATE USERINFO PIN="+u.id+"\tName="+String(u.nom||"").replace(/[\t\r\n]/g," ").slice(0,24)+"\tPri=0\tPasswd="+(u.pin||"")+"\tCard="+(u.carte||"")+"\tGrp=1\tTZ=0000000000000000"));
      return {envoyes:l.length, total:l.length, note:"Commandes en file : appliquées à la prochaine connexion de l'appareil."};
    }
    /* v56.24 : retrait ciblé — l'utilisateur et toutes ses données biométriques (visage, photo, empreintes) */
    if (action === "utilisateurs-retirer"){
      const tous = (ctx.options.ids || []).map(String), ids = tous.filter(x=>/^[A-Za-z0-9_-]{1,24}$/.test(x));
      /* 56.33.11 : identifiant non transmissible au protocole Push : échec visible (avant : ignoré, compté comme retiré) */
      if (ids.length < tous.length) throw new Error("Identifiant(s) non transmissible(s) à l'appareil : "+tous.filter(x=>ids.indexOf(x) < 0).join(", ")+" — à retirer à la main.");
      ids.forEach(id=>{ cmd("DATA DELETE BIODATA Pin="+id); cmd("DATA DELETE BIOPHOTO PIN="+id); cmd("DATA DELETE FACE PIN="+id); cmd("DATA DELETE FINGERTMP PIN="+id); cmd("DATA DELETE USERINFO PIN="+id); });
      if (ctx.persisterPushMaintenant) await ctx.persisterPushMaintenant();
      return {retires:ids.length, note:"Commandes de retrait en file : appliquées à la prochaine connexion de l'appareil."};
    }
    /* v56.5 : visages — l'appareil envoie ses gabarits (Type 9) et ses photos à sa prochaine connexion */
    if (action === "visages-lire"){ cmd("DATA QUERY BIODATA Type=9"); cmd("DATA QUERY BIOPHOTO"); cmd("DATA QUERY FACE");
      return {note:"Demande en file : l'appareil enverra ses visages à sa prochaine connexion ; ils seront enregistrés (chiffrés) dans la base."}; }
    if (action === "visages-envoyer"){
      const v = await ctx.visagesPour(["photo-jpeg", "zk-bio9-*", "zk-face7"]);
      const parId = {}; v.forEach(x=>{ (parId[x.id] = parId[x.id] || []).push(x); });
      let photos = 0, gabarits = 0;
      for (const id of Object.keys(parId)){
        const l = parId[id], ph = l.find(x=>x.format === "photo-jpeg");
        /* la photo est privilégiée (l'appareil recalcule son gabarit, quel que soit son algorithme) ; sinon les gabarits ZKTeco */
        if (ph){ const b = ph.octets.toString("base64"); cmd("DATA UPDATE BIOPHOTO PIN="+id+"\tType=9\tSize="+b.length+"\tContent="+b+"\tFormat=0\tUrl=\tPostBackTmpFlag=0"); photos++; continue; }
        l.filter(x=>x.format.indexOf("zk-bio9-v") === 0).forEach(x=>{ cmd("DATA UPDATE BIODATA Pin="+id+"\tNo=0\tIndex="+(x.indice||0)+"\tValid=1\tDuress=0\tType=9\tMajorVer="+x.format.slice(9)+"\tMinorVer=0\tFormat=0\tTmp="+x.octets.toString("base64")); gabarits++; });
        l.filter(x=>x.format === "zk-face7").forEach(x=>{ const b = x.octets.toString("base64"); cmd("DATA UPDATE FACE PIN="+id+"\tFID="+(x.indice||0)+"\tSIZE="+b.length+"\tVALID=1\tTMP="+b); gabarits++; });
      }
      return {salaries:Object.keys(parId).length, photos, gabarits, note:"Commandes en file : appliquées à la prochaine connexion de l'appareil."};
    }
    /* 56.33.11 : avant d'effacer les badgeages, l'appareil renvoie d'abord tous ceux de la période de collecte (il exécute
       ses commandes dans l'ordre) : un badgeage pas encore transmis n'est pas perdu */
    if (action === "nettoyage"){ const q = ctx.options.quoi || "pointages";
      /* 56.33.11 : renvoi de tout le journal, effacement envoyé par le serveur seulement après enregistrement confirmé */
      if (q !== "utilisateurs"){ const id = cmd("DATA QUERY ATTLOG StartTime=2000-01-01 00:00:00\tEndTime=2099-12-31 23:59:59"); if (ctx.demanderPurgePush) ctx.demanderPurgePush(T.sn, id); else return {ok:false, note:"effacement indisponible"}; } if (q !== "pointages") cmd("CLEAR DATA"); return {ok:true}; }
    if (action === "synchro-heure"){ cmd("SET OPTIONS DateTime="+Math.round(Date.now()/1000)); return {ecartSecondes:null, note:"Mise à l'heure en file."}; }
    if (action === "redemarrer"){ cmd("REBOOT"); return {ok:true}; }
    if (action === "effacer-commandes"){ ctx.viderPush(T.sn); return {ok:true}; }
    throw new Error("Action non prise en charge.");
  }
};
