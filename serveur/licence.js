/* FIWAKTI v56.30 — licences temporelles (cahier des charges V56.30, § 3, lot A).
   Logique pure et testable : période de validité, états, politique d'expiration, horloge protégée.
   Contrôle exclusivement côté serveur ; le navigateur ne fait qu'afficher ce que le serveur décide.

   Champs de la charge signée (tous facultatifs, rétrocompatibles avec les licences v1 / v2) :
     id, client, serie (entier croissant), debut, fin (ou expire), politique, grace (jours), apres ("lecture" | "blocage"),
     rappels ([30, 15, 7, 1]), capacite, empreinte (code d'installation), modules / fw. */
"use strict";

const POLITIQUES = {
  grace_lecture: {grace:7, apres:"lecture"},   /* 1. recommandée : grâce puis consultation seule */
  immediate:     {grace:0, apres:"blocage"},   /* 2. expiration immédiate */
  grace_blocage: {grace:7, apres:"blocage"},   /* 3. grâce puis blocage complet */
  contrat:       {grace:7, apres:"lecture"}    /* 4. politique contractuelle : grâce et effet portés par la licence */
};
const RAPPELS_DEFAUT = [30, 15, 7, 1];
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));
function ajout(d, n){ const x = new Date(d+"T12:00:00Z"); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0, 10); }
function ecart(a, b){ return Math.round((Date.parse(b+"T12:00:00Z") - Date.parse(a+"T12:00:00Z")) / 864e5); }

function normaliser(p){
  p = p || {};
  const nomPol = POLITIQUES[p.politique] ? p.politique : "grace_lecture", base = POLITIQUES[nomPol];
  const grace = nomPol === "immediate" ? 0 : (Number.isFinite(Number(p.grace)) && p.grace !== null && p.grace !== "" ? Math.max(0, Math.min(365, Math.round(Number(p.grace)))) : base.grace);
  const apres = nomPol === "contrat" && (p.apres === "lecture" || p.apres === "blocage") ? p.apres : base.apres;
  const rappels = Array.isArray(p.rappels) && p.rappels.length ? p.rappels.map(Number).filter(n=>n > 0 && n <= 365).sort((a, b)=>b-a) : RAPPELS_DEFAUT;
  return {id:p.id || "", client:p.client || "", serie:Number(p.serie) || 0, debut:dateOk(p.debut) ? p.debut : null,
    fin:dateOk(p.fin) ? p.fin : (dateOk(p.expire) ? p.expire : null), politique:nomPol, grace, apres, rappels,
    capacite:Number(p.capacite) || null};
}

/* état de la licence à la date « jour » (date effective du serveur, horloge protégée) */
function etat(charge, jour){
  const L = normaliser(charge);
  if (L.debut && jour < L.debut) return {etat:"pas_commencee", restriction:"blocage", joursRestants:null, L};
  if (!L.fin) return {etat:"active", restriction:null, joursRestants:null, perpetuelle:true, L};
  const reste = ecart(jour, L.fin);                       /* 0 = dernier jour de validité */
  if (reste >= 0) return {etat:reste <= 30 ? "bientot" : "active", restriction:null, joursRestants:reste, L};
  const finGrace = ajout(L.fin, L.grace);
  if (L.grace > 0 && jour <= finGrace) return {etat:"grace", restriction:null, joursRestants:reste, finGrace, L};
  return {etat:L.apres === "blocage" ? "bloquee" : "lecture", restriction:L.apres, joursRestants:reste, finGrace, L};
}

/* rappel courtois : dû aujourd'hui selon la fréquence choisie (« jour », « semaine », « seuils ») */
function rappelDu(e, frequence){
  if (!e || (e.etat !== "bientot" && e.etat !== "grace")) return false;
  if (e.etat === "grace") return true;
  if (frequence === "seuils") return e.L.rappels.indexOf(e.joursRestants) >= 0;
  if (frequence === "semaine") return e.joursRestants % 7 === 2 || e.L.rappels.indexOf(e.joursRestants) >= 0;
  return true;                                             /* chaque jour (une fois par jour et par utilisateur, côté écran) */
}

/* comparaison avant / après pour l'audit et l'écran des changements */
function differences(avant, apres){
  const A = avant ? normaliser(avant) : null, N = normaliser(apres);
  const mods = c => !c ? [] : (Array.isArray(c.fw) ? c.fw.slice() : String(c.modules||"").split("").map(x=>x === "P" ? "FW-Time" : x === "A" ? "FW-Acces" : x));
  const ma = mods(avant), mn = mods(apres);
  return {client:N.client, licence:N.id, serie:N.serie, ancienneFin:A ? A.fin : null, nouvelleFin:N.fin, debut:N.debut,
    ajoutes:mn.filter(x=>ma.indexOf(x) < 0), retires:ma.filter(x=>mn.indexOf(x) < 0), politique:N.politique, grace:N.grace, apres:N.apres};
}

/* horloge protégée : la dernière date vue est conservée chiffrée et authentifiée (AES-GCM du coffre) ;
   la date effective n'est jamais antérieure à la dernière date vue, un recul de plus de 24 h est signalé. */
function creerHorloge({lire, ecrire, chiffrer, dechiffrer, aujourdhui, signaler}){
  let derniere = null, dernierSignal = "";
  async function charger(){
    if (derniere !== null) return derniere;
    try { const v = await lire(); derniere = v ? JSON.parse(dechiffrer(v)).d : ""; }
    catch(e){ derniere = ""; await signaler("horloge illisible ou modifiée : date protégée réinitialisée"); }
    return derniere;
  }
  async function jour(){
    const vrai = aujourdhui(), vue = await charger();
    if (!vue || vrai > vue){ derniere = vrai; await ecrire(chiffrer(JSON.stringify({d:vrai, t:Date.now()}))); return vrai; }
    if (vrai < vue && ecart(vrai, vue) >= 1 && dernierSignal !== vrai){
      dernierSignal = vrai; await signaler("recul de l'horloge du serveur : "+vue+" → "+vrai+" (la date "+vue+" est conservée)"); }
    return vue;
  }
  return {jour, oublier(){ derniere = null; }};
}

module.exports = {POLITIQUES, RAPPELS_DEFAUT, normaliser, etat, rappelDu, differences, creerHorloge, ajout, ecart};
