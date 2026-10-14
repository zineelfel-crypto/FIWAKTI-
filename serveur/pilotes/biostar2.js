/* FIWAKTI — pilote Suprema BioStar 2 (API REST du serveur BioStar 2).
   Les terminaux Suprema (BioStation, BioEntry, FaceStation, X-Station…) sont
   gérés par BioStar 2 ; FIWAKTI lit les événements d'authentification et gère les
   utilisateurs par son API. La liaison directe à l'appareil (G-SDK) passe par un
   pilote externe (voir GUIDE-PILOTES). */
"use strict";
const {requete} = require("./http-util.js");
async function session(T, S){
  const url = String(T.urlServeur || ("https://"+T.ip+":"+(T.port||443))).replace(/\/$/, "");
  const r = await requete(url+"/api/login", {method:"POST", headers:{"Content-Type":"application/json"}}, JSON.stringify({User:{login_id:(S&&S.utilisateur)||T.identifiant||"admin", password:(S&&S.mdp)||""}}));
  if (r.statut === 401 || r.statut === 400) throw new Error("Identifiant ou mot de passe BioStar 2 refusé.");
  if (r.statut >= 400) throw new Error("Le serveur BioStar 2 a répondu "+r.statut+".");
  const sid = r.entetes["bs-session-id"];
  if (!sid) throw new Error("Session BioStar 2 non ouverte.");
  const appel = async (m, chemin, corps) => {
    const x = await requete(url+chemin, {method:m, headers:{"Content-Type":"application/json", "bs-session-id":sid}}, corps ? JSON.stringify(corps) : null);
    if (x.statut >= 400) throw new Error("BioStar 2 : "+x.statut+" sur "+chemin);
    return x.corps ? JSON.parse(x.corps) : {};
  };
  /* 56.33.11 : session fermée après chaque action (BioStar 2 limite les sessions ouvertes par compte) */
  const fermer = () => requete(url+"/api/logout", {method:"POST", headers:{"bs-session-id":sid}}).catch(()=>{});
  return {appel, fermer};
}
/* sens : touche T&A du terminal (tna_key) ; par défaut F1 = entrée, F2 = sortie, réglable (ex. « 1=E;2=S;3=S ») */
function sensTna(k, T){ const v = String(k == null ? "" : k).trim(); if (!v || v === "0") return "";
  const table = {"1":"E", "2":"S"}; String(T.codesSens||"").split(/[;,]/).forEach(x=>{ const m = /^\s*([^=]+)=\s*([ES])\s*$/i.exec(x); if (m) table[m[1].trim().toUpperCase()] = m[2].toUpperCase(); });
  return table[v.toUpperCase()] || ""; }
/* événements d'authentification réussie (identification, vérification, carte, visage) */
const SUCCES = c => (c >= 4096 && c < 4352) || (c >= 4864 && c < 5120);
module.exports = {sensTna,
  id:"biostar2", nom:"Suprema — BioStar 2 (API REST)",
  marques:["Suprema"], modeles:"BioStation, BioEntry, FaceStation, FaceLite, X-Station, BioLite (via BioStar 2)",
  capacites:["diagnostic","info","collecte","utilisateurs-lire","utilisateurs-envoyer","visages-lire","visages-envoyer","utilisateurs-retirer"],
  champs:[{k:"urlServeur", l:"Adresse du serveur BioStar 2 (https://…)", public:true}, {k:"utilisateur", l:"Identifiant BioStar 2"}, {k:"mdp", l:"Mot de passe BioStar 2", secret:true},
    {k:"codesSens", l:"Touches entrée / sortie (vide = F1 entrée, F2 sortie ; ex. 1=E;2=S;3=S)", public:true}],
  async executer(action, T, S, ctx){
    const B = await session(T, S);
    try { return await module.exports.agir(action, T, S, ctx, B); } finally { await B.fermer(); }
  },
  async agir(action, T, S, ctx, B){
    if (action === "diagnostic" || action === "info"){
      const d = await B.appel("GET", "/api/devices?limit=500");
      const l = (d.DeviceCollection && d.DeviceCollection.rows) || [];
      const dev = l.find(x=>String(x.id) === String(T.sn) || String(x.lan && x.lan.ip) === String(T.ip)) || null;
      return {enLigne:true, info:dev ? {sn:String(dev.id), modele:(dev.device_type_id||{}).name||"", nom:dev.name, etat:dev.status} : {note:"Serveur BioStar 2 joignable ; appareil non trouvé (renseignez son identifiant BioStar dans N° de série)."}};
    }
    if (action === "collecte"){
      const depuis = new Date(Date.now() - (Number(T.joursCollecte)||31)*86400000).toISOString(), fin = new Date().toISOString();
      const cond = [{column:"datetime", operator:3, values:[depuis, fin]}];
      if (T.sn) cond.push({column:"device_id.id", operator:2, values:[String(T.sn)]});
      const tous = []; let offset = 0;
      for (let g = 0; g < 200; g++){
        const j = await B.appel("POST", "/api/events/search", {Query:{limit:1000, offset, conditions:cond, orders:[{column:"datetime", descending:false}]}});
        const rows = (j.EventCollection && j.EventCollection.rows) || [];
        rows.forEach(e=>{ const code = Number((e.event_type_id||{}).code); const uid = (e.user_id||{}).user_id;
          /* 56.33.11 : heure transmise avec son fuseau (BioStar 2 répond en UTC) : convertie dans le fuseau du site à
             l'enregistrement — avant, l'heure UTC était prise pour l'heure locale (1 h d'écart en Tunisie) */
          if (uid && SUCCES(code)) tous.push({utilisateur:String(uid), horodatage:String(e.datetime), sens:sensTna(e.tna_key, T),
            source_event_id:e.id != null ? "bs2:"+(T.urlServeur||T.ip)+":"+e.id : undefined}); });
        offset += rows.length;
        if (rows.length < 1000) break;
      }
      return Object.assign({lus:tous.length, purge:false}, await ctx.integrer(tous));
    }
    if (action === "utilisateurs-lire"){
      const j = await B.appel("GET", "/api/users?limit=0&offset=0");
      return {utilisateurs:((j.UserCollection && j.UserCollection.rows) || []).map(u=>({id:String(u.user_id), nom:u.name||"", carte:"", privilege:0}))};
    }
    /* v56.24 : retrait ciblé (BioStar 2 retire l'utilisateur et ses données de tous ses terminaux) */
    if (action === "utilisateurs-retirer"){
      const ids = (ctx.options.ids || []).map(String); let n = 0;
      for (const id of ids){ try { await B.appel("DELETE", "/api/users/"+encodeURIComponent(id)); n++; } catch(e){ if (!/404/.test(e.message)) throw e; n++; } }
      return {retires:n, confirme:true};
    }
    if (action === "utilisateurs-envoyer"){
      const liste = await ctx.utilisateursPour(T); let n = 0;
      for (const u of liste){
        const U = {User:{user_id:String(u.id), name:String(u.nom||"").slice(0,48), user_group_id:{id:1}, start_datetime:"2001-01-01T00:00:00.00Z", expiry_datetime:"2037-12-31T23:59:00.00Z"}};
        try { await B.appel("POST", "/api/users", U); } catch(e){ await B.appel("PUT", "/api/users/"+encodeURIComponent(u.id), U); }
        n++;
      }
      return {envoyes:n, total:liste.length};
    }
    /* v56.5 : visages — image normalisée du visage de chaque utilisateur (BioStar 2 recalcule les gabarits et les
       transmet lui-même à ses terminaux FaceStation / BioStation) */
    if (action === "visages-lire"){
      const j = await B.appel("GET", "/api/users?limit=0"); let lus = 0, enreg = 0, inconnus = 0;
      for (const u of ((j.UserCollection||{}).rows||[])){
        const d = await B.appel("GET", "/api/users/"+encodeURIComponent(u.user_id));
        const vf = (((d.User||{}).credentials||{}).visualFaces||[]);
        for (let i = 0; i < vf.length; i++){ const img = vf[i].template_ex_normalized_image; if (!img) continue; lus++;
          const e = await ctx.visageRecu(u.user_id, "photo-jpeg", Buffer.from(img, "base64"), i); if (e.ok) enreg++; else if (e.inconnu) inconnus++; }
      }
      return {lus, enregistres:enreg, inconnus};
    }
    if (action === "visages-envoyer"){
      const v = await ctx.visagesPour(["photo-jpeg"]); let n = 0;
      for (const x of v){ await B.appel("PUT", "/api/users/"+encodeURIComponent(x.id), {User:{credentials:{visualFaces:[{template_ex_normalized_image:x.octets.toString("base64")}]}}}); n++; }
      return {envoyes:n, total:v.length};
    }
    throw new Error("Action non disponible par l'API BioStar 2 : utilisez la console BioStar 2 ou un pilote G-SDK.");
  }
};
