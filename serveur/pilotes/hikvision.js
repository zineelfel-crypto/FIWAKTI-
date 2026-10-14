/* FIWAKTI — pilote Hikvision, API ISAPI (HTTP/HTTPS, authentification Digest).
   Terminaux de contrôle d'accès et de pointage (DS-K1T…, MinMoe) : informations,
   heure, événements d'authentification, utilisateurs, redémarrage. */
"use strict";
const {digest} = require("./http-util.js");
const base = T => (T.https ? "https" : "http")+"://"+T.ip+(T.port && Number(T.port) !== 80 ? ":"+T.port : "");
async function appel(T, S, methode, chemin, corpsJson){
  const r = await digest(base(T)+chemin, {method:methode, headers:corpsJson ? {"Content-Type":"application/json"} : {}}, corpsJson ? JSON.stringify(corpsJson) : null,
    (S && S.utilisateur) || T.identifiant || "admin", (S && S.mdp) || "");
  if (r.statut === 401) throw new Error("Identifiant ou mot de passe refusé par l'appareil.");
  if (r.statut >= 400) throw new Error("L'appareil a répondu "+r.statut+" sur "+chemin+".");
  return r.corps;
}
const xml = (t, k) => { const m = new RegExp("<"+k+">([^<]*)</"+k+">").exec(t); return m ? m[1] : ""; };
const iso = d => { const p = n => String(n).padStart(2, "0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds()); };
/* v56.31 : décalage horaire réel du serveur (avant : « +01:00 » écrit en dur — faux en heure d'été, en France notamment) */
const tz = d => { const m = -d.getTimezoneOffset(), a = Math.abs(m); return (m >= 0 ? "+" : "-")+String(Math.floor(a/60)).padStart(2, "0")+":"+String(a%60).padStart(2, "0"); };
module.exports = {
  id:"hikvision", nom:"Hikvision — ISAPI (HTTP)",
  marques:["Hikvision", "HiLook", "Ezviz (gamme pro)"], modeles:"DS-K1T, DS-K1A, MinMoe et terminaux compatibles ISAPI",
  capacites:["diagnostic","info","collecte","utilisateurs-lire","utilisateurs-envoyer","synchro-heure","redemarrer","visages-lire","visages-envoyer","utilisateurs-retirer"],
  champs:[{k:"utilisateur", l:"Identifiant de l'appareil"}, {k:"mdp", l:"Mot de passe de l'appareil", secret:true}],
  async executer(action, T, S, ctx){
    if (action === "diagnostic" || action === "info"){
      const x = await appel(T, S, "GET", "/ISAPI/System/deviceInfo");
      return {enLigne:true, info:{sn:xml(x, "serialNumber"), modele:xml(x, "model"), firmware:xml(x, "firmwareVersion"), nom:xml(x, "deviceName")}};
    }
    if (action === "synchro-heure"){
      const x = await appel(T, S, "GET", "/ISAPI/System/time");
      const avant = xml(x, "localTime"), ecart = avant ? Math.round((Date.now() - new Date(avant).getTime())/1000) : null;
      const corps = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Time><timeMode>manual</timeMode><localTime>"+iso(new Date())+"</localTime></Time>";
      const {digest:dg} = require("./http-util.js");
      const r = await dg(base(T)+"/ISAPI/System/time", {method:"PUT", headers:{"Content-Type":"application/xml"}}, corps, (S&&S.utilisateur)||T.identifiant||"admin", (S&&S.mdp)||"");
      if (r.statut >= 400) throw new Error("Mise à l'heure refusée ("+r.statut+").");
      return {ecartSecondes:ecart};
    }
    if (action === "collecte"){
      const depuis = new Date(Date.now() - (Number(T.joursCollecte)||31)*86400000), fin = new Date();
      const tous = []; let pos = 0;
      for (let g = 0; g < 500; g++){
        const j = JSON.parse(await appel(T, S, "POST", "/ISAPI/AccessControl/AcsEvent?format=json",
          {AcsEventCond:{searchID:"fiwakti", searchResultPosition:pos, maxResults:100, major:5, minor:75, startTime:iso(depuis)+tz(depuis), endTime:iso(fin)+tz(fin)}}));
        const ev = (j.AcsEvent && j.AcsEvent.InfoList) || [];
        ev.forEach(e=>{ if (e.employeeNoString) tous.push({utilisateur:String(e.employeeNoString), horodatage:String(e.time).slice(0,19).replace("T"," "),
          sens:/checkOut|breakOut|overtimeOut/i.test(e.attendanceStatus||"") ? "S" : /checkIn|breakIn|overtimeIn/i.test(e.attendanceStatus||"") ? "E" : ""}); });
        pos += ev.length;
        if (!ev.length || !j.AcsEvent || j.AcsEvent.responseStatusStrg !== "MORE") break;
      }
      return Object.assign({lus:tous.length, purge:false}, await ctx.integrer(tous));
    }
    if (action === "utilisateurs-lire"){
      const out = []; let pos = 0;
      for (let g = 0; g < 500; g++){
        const j = JSON.parse(await appel(T, S, "POST", "/ISAPI/AccessControl/UserInfo/Search?format=json", {UserInfoSearchCond:{searchID:"fiwakti", searchResultPosition:pos, maxResults:100}}));
        const l = (j.UserInfoSearch && j.UserInfoSearch.UserInfo) || [];
        l.forEach(u=>out.push({id:String(u.employeeNo), nom:u.name||"", carte:"", privilege:u.userType === "admin" ? 14 : 0}));
        pos += l.length;
        if (!l.length || (j.UserInfoSearch && j.UserInfoSearch.responseStatusStrg !== "MORE")) break;
      }
      return {utilisateurs:out};
    }
    if (action === "utilisateurs-envoyer"){
      const liste = await ctx.utilisateursPour(T); let n = 0;
      for (const u of liste){
        await appel(T, S, "PUT", "/ISAPI/AccessControl/UserInfo/SetUp?format=json",
          {UserInfo:{employeeNo:String(u.id), name:String(u.nom||"").slice(0,32), userType:"normal", Valid:{enable:true, beginTime:"2020-01-01T00:00:00", endTime:"2037-12-31T23:59:59"}}});
        if (u.carte) await appel(T, S, "PUT", "/ISAPI/AccessControl/CardInfo/SetUp?format=json", {CardInfo:{employeeNo:String(u.id), cardNo:String(u.carte), cardType:"normalCard"}}).catch(()=>{});
        n++;
      }
      return {envoyes:n, total:liste.length};
    }
    if (action === "redemarrer"){ await appel(T, S, "PUT", "/ISAPI/System/reboot"); return {ok:true}; }
    /* v56.24 : retrait ciblé — visages de la bibliothèque puis personne (confirmé par l'appareil) */
    if (action === "utilisateurs-retirer"){
      const ids = (ctx.options.ids || []).map(String); let n = 0;
      for (let i = 0; i < ids.length; i += 50){ const lot = ids.slice(i, i+50);
        await appel(T, S, "PUT", "/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json&FDID=1&faceLibType=blackFD", {FPID:lot.map(v=>({value:v}))}).catch(()=>{});
        await appel(T, S, "PUT", "/ISAPI/AccessControl/UserInfo/Delete?format=json", {UserInfoDelCond:{EmployeeNoList:lot.map(v=>({employeeNo:v}))}}); n += lot.length; }
      return {retires:n, confirme:true};
    }
    /* v56.5 : visages — bibliothèque de visages de l'appareil (photos JPEG) */
    if (action === "visages-lire"){
      let pos = 0, lus = 0, enreg = 0, inconnus = 0;
      for (let k = 0; k < 200; k++){
        const j = JSON.parse(await appel(T, S, "POST", "/ISAPI/Intelligent/FDLib/FDSearch?format=json", {searchResultPosition:pos, maxResults:30, faceLibType:"blackFD", FDID:"1"}));
        const l = j.MatchList || []; if (!l.length) break;
        for (const x of l){ if (!x.faceURL || !x.FPID) continue;
          const r = await digest(x.faceURL, {method:"GET", binaire:true}, null, (S && S.utilisateur) || T.identifiant || "admin", (S && S.mdp) || "");
          if (r.statut >= 400) continue; lus++;
          const e = await ctx.visageRecu(x.FPID, "photo-jpeg", r.corps, 0); if (e.ok) enreg++; else if (e.inconnu) inconnus++; }
        pos += l.length; if (pos >= Number(j.totalMatches || 0)) break;
      }
      return {lus, enregistres:enreg, inconnus};
    }
    if (action === "visages-envoyer"){
      const v = (await ctx.visagesPour(["photo-jpeg"])); let n = 0;
      for (const x of v){
        const lim = "fiwakti"+Date.now().toString(16), rec = JSON.stringify({faceLibType:"blackFD", FDID:"1", FPID:String(x.id)});
        const corps = Buffer.concat([Buffer.from("--"+lim+"\r\nContent-Disposition: form-data; name=\"FaceDataRecord\";\r\nContent-Type: application/json\r\n\r\n"+rec+"\r\n--"+lim+"\r\nContent-Disposition: form-data; name=\"img\"; filename=\"visage.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"),
          x.octets, Buffer.from("\r\n--"+lim+"--\r\n")]);
        const r = await digest(base(T)+"/ISAPI/Intelligent/FDLib/FDSetUp?format=json", {method:"PUT", headers:{"Content-Type":"multipart/form-data; boundary="+lim}}, corps, (S && S.utilisateur) || T.identifiant || "admin", (S && S.mdp) || "");
        if (r.statut < 300) n++;
      }
      return {envoyes:n, total:v.length};
    }
    throw new Error("Action non prise en charge par l'API ISAPI de cet appareil.");
  }
};
