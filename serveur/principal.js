/* FIWAKTI — serveur d'application (v44).
   Base : PostgreSQL (recommandé) ou SQLite intégré (poste unique, petits effectifs).
   Rôle : servir l'application, être l'autorité pour l'identité, les sessions, les
   périmètres, la licence, les calculs des grands effectifs, les sauvegardes et
   les mises à jour. Le navigateur n'est pas considéré comme fiable. */
"use strict";
const http = require("http"), https = require("https"), fs = require("fs"), path = require("path");
const crypto = require("crypto"), os = require("os"), net = require("net"), util = require("util");
const BD = require("./bd.js");
const PERIM = require("./perimetre.js");
const DONNEES_MOD = require("./donnees.js");
const CALCUL = require("./calcul.js");
const POINT = require("./pointeuses.js");
const INGESTION = require("./ingestion.js");
const WORKFLOW = require("./workflow.js");
const RECALCUL = require("./recalcul.js");
const MODULES = require("./modules.js");
const LICENCE = require("./licence.js");
const ANNUAIRE = require("./annuaire.js");
const VISAGES = require("./visages.js");
const PLANIFICATEUR = require("./planificateur.js");
const PLAN = PLANIFICATEUR.creer({journal:m=>journal(m), enveloppe:fn=>(B && B.enTravail) ? B.enTravail(fn) : fn()});
BD.ajouterModule(VISAGES);
const BIOSYNC = require("./biosync.js");
const ACCES = require("./acces.js");
BD.ajouterModule(BIOSYNC);                                  /* v56.24 : file unique de synchronisation biométrique */                                  /* table chiffrée des visages (sauvegardée avec le reste) */
const PARTITIONNEMENT = require("./partitionnement.js");
let PART = null, PART_PAUSE_AVANT = false;
/* v56.2 : parties serveur des modules livrés, chargées avant l'ouverture de la base (elles déclarent leurs tables) */
const MODS_SERVEUR = [];
try { const dm = path.join(__dirname, "modules");
  if (fs.existsSync(dm)) fs.readdirSync(dm).filter(f=>/\.json$/.test(f)).forEach(f=>{
    try { const man = JSON.parse(fs.readFileSync(path.join(dm, f), "utf8"));
      if (!man.serveur || !/^[A-Za-z0-9.-]+\.serveur\.js$/.test(man.serveur)) return;
      const mod = require(path.join(dm, man.serveur)); BD.ajouterModule(mod);
      MODS_SERVEUR.push({id:man.id, routes:(man.routes||[]).filter(r=>MODULES.routeAdmise(r)), mod, inst:null}); } catch(e){ console.error("module "+f+" : "+e.message); } }); } catch(e){}
const COFFRE = require("./coffre.js");
const COURRIEL = require("./courriel.js");
const TOTP = require("./totp.js");

/* 56.33.11 : base SQLite, journaux et sauvegardes réservés au compte du service (empreintes de mots de passe) */
try { process.umask(0o077); } catch(e){}
const VERSION = process.env.FIWAKTI_VERSION || require("./version.json").version;
const RACINE = process.env.FIWAKTI_RACINE || path.resolve(__dirname, "..", "..", "..");
const ICI = path.resolve(__dirname, "..");
const DONNEES = path.join(RACINE, "donnees");
const F_CONFIG = path.join(DONNEES, "config.json");
const D_SAUV = path.join(DONNEES, "sauvegardes");
const D_CERT = path.join(DONNEES, "certificats");
const D_JOURN = path.join(DONNEES, "journaux");
const CLE_PUBLIQUE_BRUT = require("./cle-publique.json");
/* v56.31 : renouvellement de la clé de l'éditeur — « active » signe licences, jetons et mises à jour ; les « anciennes »
   (avec date de fin) ne servent qu'aux licences déjà en place, pour que la mise à jour ne bloque personne */
const CLE_PUBLIQUE = CLE_PUBLIQUE_BRUT.active || CLE_PUBLIQUE_BRUT, CLES_ANCIENNES = Array.isArray(CLE_PUBLIQUE_BRUT.anciennes) ? CLE_PUBLIQUE_BRUT.anciennes : [];
const CLE_APP = DONNEES_MOD.CLE_APP;
const PUBLIC = path.join(ICI, "public"), APP = path.join(ICI, "app");

[DONNEES, D_SAUV, D_CERT, D_JOURN].forEach(d=>fs.mkdirSync(d, {recursive:true}));
/* v56.15 : le journal ne contient jamais de secret (mots de passe, jetons, cookies, adresses de base avec identifiants) */
function masquerSecrets(m){
  return String(m)
    .replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/gi, "$1***@")
    .replace(/("?(?:mdp|motDePasse|password|pass|secret|totp|jeton|token|cle|confirmation|actuel|nouveau)"?\s*[:=]\s*)("[^"]*"|[^\s,;&}]+)/gi, "$1***")
    .replace(/(fwk_s|fw_sess|session|cookie)=([^;\s]+)/gi, "$1=***")
    .replace(/\b(FWK1[A-Za-z0-9_\-.]{8})[A-Za-z0-9_\-.]{20,}/g, "$1…");
}
/* 56.33.11 : rotation des journaux (avant : croissance sans limite) — au-delà de 20 Mo, le fichier devient .1 (… .5) */
function tourner(f){ try { if (fs.statSync(f).size < 20e6) return; for (let i = 4; i >= 1; i--){ try { fs.renameSync(f+"."+i, f+"."+(i+1)); } catch(e){} } fs.renameSync(f, f+".1"); } catch(e){} }
let J_COMPTE = 0;
function journal(m){ try { const f = path.join(D_JOURN, "serveur.log"); if (++J_COMPTE % 500 === 1) tourner(f); fs.appendFileSync(f, new Date().toISOString()+" "+masquerSecrets(m)+"\n"); } catch(e){} }
/* 56.33.11 : une erreur imprévue est écrite au journal au lieu d'arrêter le serveur sans trace (promesse rejetée) ;
   une exception non rattrapée est journalisée puis le processus s'arrête (état incertain), le lanceur le relance */
process.on("unhandledRejection", e=>{ journal("erreur non traitée (promesse) : "+((e && e.stack) || e)); });
process.on("uncaughtException", e=>{ journal("exception non rattrapée, arrêt : "+((e && e.stack) || e)); try { console.error(e); } catch(x){} process.exit(1); });
const maintenant = () => new Date().toISOString();
function aujourdhui(){ const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0"); }
function ajoutJours(k, j){ const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)+j); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* correctif 22 : droit de lecture d'un module (profil EN VIGUEUR, délégation comprise) et écran non masqué — les routes
   de lecture des salariés, des badgeages et des journées calculées ne vérifiaient que le périmètre : un profil « aucun
   droit » obtenait fiches (CIN, téléphone), badgeages et journées */
async function droitLire(C, admin, mods, ecrans){
  if (admin) return true;
  const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {};
  if (PERIM.niveauProfil(pr) === "admin") return true;
  const RG = {lecture:1, saisie:2, validation:3, config:4};
  if (!mods.some(m=>(RG[(pr.droits || {})[m]] || 0) >= 1)) return false;
  return !(ecrans && ecrans.length && ecrans.every(v=>(pr.menus || {})[v] === "masque"));
}
/* ---- correctif 20 : clôture de période (outils) ---- */
let CLOTURE_EN_COURS = false;
function jourValideSrv(j){ if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j || ""))) return false; const d = new Date(j+"T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j && j >= "2000-01-01"; }
function jjmmaaaa(j){ return String(j || "").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1"); }
function clotDerniere(ref){ return ((ref && ref.clotures) || []).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, ""); }
/* droit de clôturer (ou, en lecture, de vérifier / exporter un dossier) : administrateur, ou drapeau « clôture » du
   profil + Pointages « configuration » + périmètre entreprise + écran Clôture non masqué et acte permis */
async function droitCloture(ref, C, admin, lecture, acte){
  if (admin) return {ok:true};
  const {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {}, RG = {lecture:1, saisie:2, validation:3, config:4};
  const m = (pr.menus || {}).cloture, a = ((pr.actions || {}).cloture || {})[acte || (lecture ? "lire" : "valider")];
  if (!pr.cloture && !(lecture && pr.reouverture)) return {ok:false, motif:"Votre profil n'est pas autorisé à clôturer (drapeau « clôture »)."};
  if (!lecture && !(RG[(pr.droits || {}).PTG] >= 4)) return {ok:false, motif:"Clôturer demande le droit Pointages « configuration »."};
  if (P.set !== null) return {ok:false, motif:"Une clôture porte sur toute l'entreprise : réservée à un compte sans limite de périmètre."};
  if (m === "masque" || (!lecture && m === "lecture") || a === false) return {ok:false, motif:"Action non permise par la matrice de l'écran Clôture."};
  return {ok:true};
}
/* tout ce qui empêche de clôturer, sur toute l'entreprise et toute la période */
async function bloquantsComplets(du, au){
  const o = Object.assign({}, await WF.bloquantsCloture(du, au));
  const att = async (coll, champ) => { let n = 0; for (const r of await B.all("SELECT data FROM enreg WHERE coll=? AND data LIKE ?", coll, '%"'+champ+'":"attente"%')){ try { const x = JSON.parse(r.data), d0 = String(x.du || x.d || ""), d1 = String(x.au || x.du || x.d || ""); if (x[champ] === "attente" && d0 && d0 <= au && d1 >= du) n++; } catch(e){} } return n; };
  o.DEMANDES = await att("dmd", "etat");
  o.CORRECTIONS = (await att("corrections", "statut")) + (await att("corrections", "etat"));
  o.FILE = Number(((await B.get("SELECT COALESCE(SUM(nb),0) n FROM ingestion_queue WHERE statut IN ('attente','erreur','en_cours')")) || {}).n || 0);
  try { o.REVUE = Number(((await B.get("SELECT COUNT(*) n FROM normalized_events WHERE statut='PENDING_REVIEW' AND employee_mat IS NOT NULL AND substr(ts_local,1,10)>=? AND substr(ts_local,1,10)<=?", du, au)) || {}).n || 0);
    o.inconnus = Number(((await B.get("SELECT COUNT(*) n FROM normalized_events WHERE statut='PENDING_REVIEW' AND employee_mat IS NULL AND substr(ts_local,1,10)>=? AND substr(ts_local,1,10)<=?", du, au)) || {}).n || 0); } catch(e){ o.REVUE = 0; }
  /* journées non encore calculées : calculées maintenant (ou lancées en arrière-plan), puis recomptées */
  const emps = await D.employes(), nbJ = (a, b) => Math.round((Date.parse(b+"T00:00:00Z") - Date.parse(a+"T00:00:00Z")) / 86400000) + 1;
  const attendus = () => emps.reduce((s, e)=>{ const a = e.entree && e.entree > du ? e.entree : du, b = e.sortie && e.sortie < au ? e.sortie : au; return s + (a <= b ? nbJ(a, b) : 0); }, 0);
  const faits = async () => Number(((await B.get("SELECT COUNT(*) n FROM calc_jour WHERE d>=? AND d<=?", du, au)) || {}).n || 0);
  if (await faits() < attendus()){ try { await K.assurer(emps.map(e=>String(e.mat)), du, au); } catch(e){} }
  const manque = attendus() - await faits(); o.NON_CALCULEES = manque > 0 ? manque : 0;
  if (!o.NON_CALCULEES){ const o2 = await WF.bloquantsCloture(du, au); ["ANOMALIE","CORRIGEE","APPROUVEE_MANAGER"].forEach(k=>{ o[k] = o2[k] || 0; }); }
  return o;
}
function libBloquants(b){
  const L = {ANOMALIE:"journée(s) en anomalie", CORRIGEE:"journée(s) à valider par le responsable", APPROUVEE_MANAGER:"journée(s) à valider par les RH", DEMANDES:"demande(s) en attente",
    CORRECTIONS:"correction(s) en attente", FILE:"badgeage(s) en file d'intégration", REVUE:"badgeage(s) en attente de revue (horloge, rattachement)", NON_CALCULEES:"journée(s) en cours de calcul (réessayez dans quelques minutes)"};
  return Object.keys(L).filter(k=>b[k]).map(k=>b[k]+" "+L[k]).join(", ");
}
/* sceau v3 : texte canonique produit par lots ordonnés (matricule, date, identifiant), haché au fil de l'eau ; la
   boucle rend la main entre deux lots (les autres requêtes, y compris celles des pointeuses, restent servies) */
async function sceauV3(du, au, sortie){
  const h = crypto.createHash("sha256"), nb = {ptg:0, absences:0, decisions:0, regles:0, salaries:0};
  let tampon = "";
  const ecr = txt => { h.update(txt, "utf8"); if (sortie){ tampon += txt; if (tampon.length > 262144){ sortie(tampon); tampon = ""; } } };
  const pause = () => new Promise(r=>setImmediate(r));
  ecr("FIWAKTI-CLOTURE-v3|"+du+"|"+au+"\n");
  const ref = await D.referentielLecture() || {};
  ecr("#salaries\n");
  for (const e of (await D.employes()).slice().sort((a, b)=>String(a.mat) < String(b.mat) ? -1 : String(a.mat) > String(b.mat) ? 1 : 0)){
    if ((e.entree && e.entree > au) || (e.sortie && e.sortie < du)) continue;
    const ch = (Array.isArray(e.calHist) ? e.calHist : []).filter(x=>x && String(x.from || "") <= au).map(x=>[String(x.from || ""), String(x.calId || "")]).sort();
    ecr(JSON.stringify([String(e.mat), e.entree || "", e.sortie || "", ch])+"\n"); nb.salaries++; }
  /* lecture par lots de 200 matricules (index enreg(coll, mat, d)), tri fait ici (ordre identique sous SQLite et
     PostgreSQL : comparaison de chaînes JavaScript) ; la boucle rend la main entre deux lots */
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const parcourir = async (coll, ligne) => {
    const mats = (await B.all("SELECT DISTINCT mat FROM enreg WHERE coll=? AND d>=? AND d<=?", coll, du, au)).map(r=>r.mat == null ? "" : String(r.mat)).sort(cmp);
    for (let i = 0; i < mats.length; i += 200){
      const part = mats.slice(i, i + 200), vides = part.indexOf("") >= 0, nv = part.filter(m=>m !== "");
      const rows = (nv.length ? await B.all("SELECT mat, d, id, data FROM enreg WHERE coll=? AND mat IN ("+nv.map(()=>"?").join(",")+") AND d>=? AND d<=?", coll, ...nv, du, au) : [])
        .concat(vides ? await B.all("SELECT mat, d, id, data FROM enreg WHERE coll=? AND (mat IS NULL OR mat='') AND d>=? AND d<=?", coll, du, au) : []);
      rows.sort((a, b)=>cmp(String(a.mat == null ? "" : a.mat), String(b.mat == null ? "" : b.mat)) || cmp(String(a.d), String(b.d)) || cmp(String(a.id), String(b.id)));
      let txt = ""; for (const r of rows){ try { txt += JSON.stringify(ligne(JSON.parse(r.data)))+"\n"; nb[coll === "ptg" ? "ptg" : "absences"]++; } catch(e){} }
      ecr(txt); await pause();
    }
  };
  ecr("#ptg\n"); await parcourir("ptg", m=>[m.mat || "", String(m.ts || ""), m.sens || "", m.dev || "", m.src || "", m.corr ? 1 : 0]);
  ecr("#absences\n"); await parcourir("abs", a=>[a.mat || "", a.d || a.du || "", a.au || "", a.tt || ""]);
  ecr("#decisions\n"); const dec = ref.anoDec || {};
  Object.keys(dec).filter(id=>{ const d = String(id.split("|")[2] || ""); return d >= du && d <= au; }).sort().forEach(id=>{ ecr(JSON.stringify([id, (dec[id] || {}).dec || "", (dec[id] || {}).min || 0])+"\n"); nb.decisions++; });
  ecr("#regles\n");
  (ref.reglesV || []).filter(x=>x && x.statut === "publiee" && x.valid_from <= au && (!x.valid_to || x.valid_to >= du)).map(x=>[x.id, x.code, x.niveau, String(x.cible), JSON.stringify(x.valeur), x.valid_from])
    .sort((a, b)=>a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).forEach(x=>{ ecr(JSON.stringify(x)+"\n"); nb.regles++; });
  if (sortie && tampon) sortie(tampon);
  return {hash:h.digest("hex"), nb};
}

/* ---------------- configuration ---------------- */
function lireConfig(){ try { return JSON.parse(fs.readFileSync(F_CONFIG, "utf8").replace(/^\uFEFF/, "")); } catch(e){ return {}; } }   /* 56.33.9 : config.json retouché à la main (BOM) */
/* 56.33.11 : une base fournie par l'environnement (FIWAKTI_PG_URL, secret Docker) n'est jamais recopiée dans config.json */
let BASE_ENV = null;
function ecrireConfig(c){ const t = F_CONFIG+".tmp", o = Object.assign({}, c); if (BASE_ENV && o.base === BASE_ENV) delete o.base;
  fs.writeFileSync(t, JSON.stringify(o, null, 2), {mode:0o600}); fs.renameSync(t, F_CONFIG); }
let CONFIG = Object.assign({port:0, installe:false, sauvegarde:{heure:2, retention:14, chiffrer:true, copie:""}, sessionMinutes:30, adresse:"0.0.0.0", fenetreMois:2, seuilGrandEffectif:1000,
  pushReseaux:[], conservation:{badgeagesAns:5, auditAns:5, calculsJours:400}}, lireConfig());
if (CONFIG.sauvegarde && CONFIG.sauvegarde.chiffrer === undefined) CONFIG.sauvegarde.chiffrer = true;
const CF = COFFRE.creer(DONNEES);
/* la base PostgreSQL peut aussi être donnée par l'environnement (Docker) */
if (!CONFIG.base && process.env.FIWAKTI_PG_URL) CONFIG.base = BASE_ENV = {type:"pg", url:process.env.FIWAKTI_PG_URL};
/* v47 : secret Docker (fichier monté, jamais dans l'image ni dans une variable d'environnement) */
if (!CONFIG.base && process.env.FIWAKTI_PG_MDP_FILE){
  try {
    const mdp = fs.readFileSync(process.env.FIWAKTI_PG_MDP_FILE, "utf8").trim(), e = encodeURIComponent;
    CONFIG.base = BASE_ENV = {type:"pg", url:"postgres://"+e(process.env.FIWAKTI_PG_UTILISATEUR||"fiwakti")+":"+e(mdp)+"@"+(process.env.FIWAKTI_PG_HOTE||"postgres")+":"+(Number(process.env.FIWAKTI_PG_PORT)||5432)+"/"+e(process.env.FIWAKTI_PG_BASE||"fiwakti")};
  } catch(err){ journal("secret PostgreSQL illisible : "+err.message); }
}

let B = null, D = null, K = null, PT = null, ING = null, WF = null, RC = null, MOD = null;
/* v56.3 : préchauffage pour les comptes qui consultent tout le personnel (administrateurs, RH) */
async function prechauffer(){
  try { const ref = await D.referentielLecture() || {}, prof = id => (ref.profils||[]).find(x=>x.id === id) || {};
    const logins = (ref.users||[]).filter(u=>u.actif !== false && (u.admin || prof(u.profilId).admin || ["validation","config"].indexOf((prof(u.profilId).droits||{}).PTG) >= 0)).map(u=>u.login);
    const r = await K.prechauffer(logins); if (r.requetes) journal("préchauffage : "+r.requetes+" écran(s) en "+r.ms+" ms"); } catch(e){ journal("préchauffage : "+e.message); }
}
let VIS_I = null, AN_I = null, NB_CALC = null; const EN_VOL_AT = new Map(); let IDX_PTG = null;
function VIS(){ if (!VIS_I || VIS_I.B !== B){ VIS_I = VISAGES.creer({B, coffre:CF, audit}); VIS_I.B = B; } return VIS_I; }
/* v56.24 : moteur de synchronisation biométrique, lié à la base en service (recréé après une restauration) */
let BS_I = null;
function BS(){ if (!BS_I || BS_I.B !== B || BS_I.D !== D){ BS_I = BIOSYNC.creer({B, D, audit, journal, PT:()=>PT, moduleActif:id=>!!(MOD && MOD.estActif(id))}); BS_I.B = B; BS_I.D = D;
  BS_I.demarrer().catch(e=>journal("synchro biométrie : "+e.message)); if (D && D.surEmp) D.surEmp((a, n)=>BS().surChangementEmp(a, n).catch(e=>journal("synchro biométrie (périmètre) : "+e.message))); } return BS_I; }
function partitionneur(){
  if (!PART || PART.B !== B){ PART = PARTITIONNEMENT.creer({B, audit, journal, sauvegarder:()=>sauvegarder("systeme", "avant partitionnement"),
    pause:(on)=>{ if (on) PART_PAUSE_AVANT = !!(CONFIG.ingestion || {}).pause; CONFIG.ingestion = Object.assign({}, CONFIG.ingestion || {}, {pause:on ? true : PART_PAUSE_AVANT}); }}); PART.B = B; }
  return PART;
}
async function chargerModules(){ try { if (!REVOQUES.size) await revocationsCharger(); await MOD.charger(await licenceActive()); } catch(e){ journal("modules : "+e.message); } }
function initPointeuses(){
  /* v50 : ingestion (file persistante → événements bruts → normalisés) partagée par les pointeuses et l'application */
  ING = INGESTION.creer({B, D, meta, audit, journal, config:()=>CONFIG, invalider:(t, r)=>K.invalider(t, r, {pointeuse:true}), appJs:path.join(APP, "app.js")});
  D.tracerPtg = (login, avant, apres) => ING.tracerSaisie(login, avant, apres);
  /* v52 : cycle de vie des journées ; une clôture est refusée tant que la période a des journées en attente */
  WF = WORKFLOW.creer({B, D, audit, journal, regle:(c, m, d)=>ING.regle(c, m, d)});
  RC = RECALCUL.creer({B, D, K, audit, journal, dossier:path.join(DONNEES, "travaux")});
  instancierModule = function(x){ try { x.inst = x.mod.creer({B, D, audit, journal, coffre:CF, moduleActif:(id)=>!!(MOD && MOD.estActif(id)),
      /* v56.17 : événements entre modules (ex. niveau de compétence modifié par l'évaluation ou la formation) */
      /* v56.21 : service d'un autre module (s'il est actif) — ex. le pilotage lit les indicateurs agrégés du suivi médical */
      service:(id)=>{ const y = MODS_SERVEUR.find(z=>z.id === id); return y && y.inst && (!MOD || MOD.estActif(id)) ? y.inst : null; },
      /* v56.31 : recalcul des journées touchées (ex. badgeages repris par l'assistant de migration) ; dossier racine */
      invalider:(t, r)=>K.invalider(t, r), racine:path.join(ICI, "..", ".."), dossierDonnees:DONNEES,
      /* correctif 17 : calcul des journées manquantes avant lecture, et génération des données (cache des modules) */
      assurer:(m, du, au)=>K.assurer(m, du, au), generation:()=>K.generation(),
      publier:(nom, d)=>{ CACHE_AT.clear(); MODS_SERVEUR.forEach(y=>{ try { if (y.inst && y.inst.surEvenement) y.inst.surEvenement(nom, d); } catch(e){ journal("événement "+nom+" → "+y.id+" : "+e.message); } }); },
      planifier:(nom, opts)=>PLAN.planifier(x.id.toLowerCase()+"-"+nom, Object.assign({}, opts, {actif:()=>!!(CONFIG.installe && (!MOD || MOD.estActif(x.id))) && (!opts.actif || opts.actif())}))}); } catch(e){ x.inst = null; journal("module "+x.id+" : "+e.message); } }
  MODS_SERVEUR.forEach(instancierModule);
  /* v55 : FW-Licence — catalogue des modules, droits de la licence, activation ; contrôle des rubriques de données */
  MOD = MODULES.creer({meta, audit, dossierManifestes:path.join(DONNEES, "modules")});
  D.moduleRefus = (type, k) => { const m = MOD.moduleDeDonnee(type, k); return m && !MOD.estActif(m) ? m : null; };
  K.setWorkflow(WF);
  D.verifierCloture = async c => {
    const du = c.du || c.jusqu, b = await WF.bloquantsCloture(du, c.jusqu);
    const n = Object.values(b).reduce((x, y)=>x + y, 0);
    return n ? n+" journée(s) en attente entre le "+du+" et le "+c.jusqu+" (anomalie : "+(b.ANOMALIE||0)+", à valider par le responsable : "+(b.CORRIGEE||0)+", à valider par les RH : "+(b.APPROUVEE_MANAGER||0)+")" : "";
  };
  PT = POINT.creer({B, D, meta, audit, journal, dossierPilotes:path.join(DONNEES, "pilotes"), invalider:(t, r)=>K.invalider(t, r), coffre:CF, config:()=>CONFIG, ingestion:ING,
    visages:{enregistrer:(...a)=>VIS().enregistrer(...a), pour:(...a)=>VIS().pour(...a)},
    /* v56.24 : salariés au blocage biométrique actif (exclus de toutes les listes), nouveau visage → diffusion */
    bloques:()=>BS_I ? BS_I.bloques() : null, surVisage:(mat, source)=>CONFIG.installe ? BS().surVisage(mat, source) : Promise.resolve()});
  PT.etatPushCharger().catch(()=>{});
  if (CONFIG.installe) BS();
}
async function ouvrirBase(){
  B = await BD.ouvrir(CONFIG.base || null, DONNEES);
  for (const s of ["ALTER TABLE sessions ADD COLUMN csrf TEXT", "ALTER TABLE audit ADD COLUMN empreinte TEXT",
                   "ALTER TABLE sessions ADD COLUMN a2f_ok INTEGER", "ALTER TABLE sessions ADD COLUMN persistant INTEGER",
                   "ALTER TABLE comptes ADD COLUMN historique TEXT", "ALTER TABLE comptes ADD COLUMN mdp_le TEXT",
                   "ALTER TABLE comptes ADD COLUMN a2f_secret TEXT", "ALTER TABLE comptes ADD COLUMN a2f_actif INTEGER", "ALTER TABLE comptes ADD COLUMN a2f_pas INTEGER"]){
    try { await B.exec(B.type === "pg" ? s.replace("ADD COLUMN", "ADD COLUMN IF NOT EXISTS") : s); } catch(e){ /* colonne déjà présente */ }
  }
  /* v46 : une session sans jeton anti-falsification (ouverte avant la v45) n'est plus acceptée */
  try { await B.run("DELETE FROM sessions WHERE csrf IS NULL OR csrf=''"); } catch(e){}
  D = DONNEES_MOD.creer(B, PERIM);
  if (K) K.arreter();
  /* 56.33.11 : moteur de calcul (app.js) modifié depuis le dernier démarrage → journées calculées effacées une fois,
     recalculées avec les nouvelles règles (sans cela, une correction du moteur ne s'appliquait qu'après un changement
     du paramétrage ou un recalcul demandé) */
  try {
    const emp = crypto.createHash("sha256").update(fs.readFileSync(path.join(APP, "app.js"))).digest("hex"), avant = await meta("moteur_empreinte");
    if (avant !== emp){
      try { await B.run("DELETE FROM calc_jour"); } catch(e){}
      if (avant) journal("moteur de calcul mis à jour : journées recalculées");
      await meta("moteur_empreinte", emp);
    }
  } catch(e){ journal("empreinte du moteur : "+e.message); }
  /* 56.33.11 : compteurs de congé livrés d'origine — « Congé annuel pris » (unité : jours) additionnait les heures
     d'absence (8 par jour) : un jour de congé comptait 8 jours et le solde (240 - pris) baissait d'autant. Corrigés une
     seule fois, et seulement s'ils sont restés tels que livrés : pris = heures / durée de la journée de base ; solde
     = 30 jours (les 240 heures d'origine) - pris. Un compteur modifié par le client n'est jamais touché. */
  try {
    if (!await meta("migration_conges_jours")){
      const r = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP);
      if (r){
        const ref = JSON.parse(r.valeur), l = Array.isArray(ref.arits) ? ref.arits : [];
        const pris = l.find(a=>a && a.code === "CONGE" && a.unite === "j" && String(a.f||"").trim() === "TT_030");
        const solde = l.find(a=>a && a.code === "SOLDECONGE" && a.unite === "j" && String(a.f||"").replace(/\s+/g, " ").trim() === "240 - CUM(CONGE)");
        if (pris || solde){
          if (pris) pris.f = "TT_030 / BASEJOUR";
          if (solde) solde.f = "30 - CUM(CONGE)";
          ref.__versions = ref.__versions || {}; ref.__versions.arits = Number(ref.__versions.arits || 0) + 1;
          await B.run("UPDATE kv SET valeur=?, version=version+1, maj=? WHERE cle=?", JSON.stringify(ref), new Date().toISOString(), CLE_APP);
          try { await B.run("DELETE FROM calc_jour"); } catch(e){}
          journal("compteurs de congé d'origine corrigés (jours au lieu d'heures)");
        }
      }
      await meta("migration_conges_jours", "1");
    }
  } catch(e){ journal("migration des compteurs de congé : "+e.message); }
  K = CALCUL.creer(B, D, {base:CONFIG.base || null, dossier:DONNEES, app:path.join(APP, "app.js"), journal, config:()=>CONFIG});
  initPointeuses(); await chargerModules();
}
/* 56.33.11 : réglages d'envoi (paramétrage) + mot de passe chiffré ; « surcharge » = réglages saisis à l'écran, pas
   encore enregistrés (test d'envoi) — jamais le mot de passe */
async function smtpReglages(surcharge){
  const ref = await D.referentielLecture() || {}, sm = Object.assign({}, (ref.secu || {}).smtp || {});
  if (surcharge && typeof surcharge === "object") ["hote","port","securite","auth","user","expediteur","nomExpediteur"].forEach(k=>{ if (surcharge[k] !== undefined) sm[k] = surcharge[k]; });
  const c = await meta("smtp_mdp"); let mdp = "";
  if (c) try { mdp = CF.dechiffrerTexte(c, "secrets"); } catch(e){ journal("mot de passe d'envoi illisible (clé « secrets » changée ?)"); }
  return Object.assign(sm, {mdp});
}
/* notification créée (demande acceptée, refusée, rectifiée…) → e-mail à l'adresse de la fiche du salarié, si l'envoi
   est configuré et activé. Une à une, sans bloquer l'enregistrement ; échecs comptés dans le journal (sans adresse).
   Garde-fous : un compte ne déclenche pas plus de 60 e-mails par heure ; le texte est tronqué et ses liens retirés
   (une notification peut être créée par tout utilisateur : la messagerie de l'entreprise ne doit pas servir à diffuser
   un message ou un lien arbitraire). */
const COURRIEL_QUOTA = new Map();
async function notifierParCourriel(notifs, login){
  const cfg = await smtpReglages();
  if (!cfg.hote || !cfg.expediteur || cfg.notifMail === false) return;
  const h = Math.floor(Date.now() / 3600000), q = COURRIEL_QUOTA.get(login) || {h, n:0};
  if (q.h !== h){ q.h = h; q.n = 0; } COURRIEL_QUOTA.set(login, q);
  if (COURRIEL_QUOTA.size > 5000) COURRIEL_QUOTA.clear();
  const propre = t => String(t || "").replace(/[\r\n]+/g, " ").replace(/\b(?:https?|ftp|file):\/\/\S+|\bwww\.\S+/gi, "[lien retiré]").slice(0, 300);
  const emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e]));
  let envoyes = 0, sansAdresse = 0, echecs = 0, derniere = "";
  for (const n of notifs.slice(0, 500)){
    if (q.n >= 60){ journal("notifications par e-mail : limite horaire atteinte pour le compte "+login); break; }
    const e = parMat.get(String(n.mat)); const a = e && String(e.email || "").trim();
    if (!e || e.sortie && e.sortie < aujourdhui() || !COURRIEL.adresseValide(a)){ sansAdresse++; continue; }
    q.n++;
    try { await COURRIEL.envoyer(cfg, {a, sujet:"FIWAKTI — "+(propre(n.txt) || "notification").slice(0, 120), texte:propre(n.txt)+"\r\n\r\n"+(e.prenom || "")+" "+(e.nom || "")+" ("+e.mat+")\r\n— FIWAKTI"}); envoyes++; }
    catch(x){ echecs++; derniere = String(x.message).replace(/[^\s@<>"]+@[^\s@<>"]+/g, "[adresse]"); }
  }
  if (envoyes || echecs) await meta("smtp_dernier", {le:new Date().toISOString(), envoyes, echecs, erreur:derniere.slice(0, 200)});
  if (echecs) journal("notifications par e-mail : "+echecs+" échec(s) — "+derniere);
  else if (envoyes) journal("notifications par e-mail : "+envoyes+" envoyée(s)"+(sansAdresse ? ", "+sansAdresse+" sans adresse" : ""));
}
async function meta(k, v){
  if (v === undefined){ const r = await B.get("SELECT v FROM meta WHERE k=?", k); return r ? JSON.parse(r.v) : null; }
  await B.run("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, JSON.stringify(v));
}
/* v45 : journal d'audit chaîné (SHA-256) : modifier ou supprimer une entrée directement
   dans la base casse la chaîne, ce que l'écran État du système signale */
let AUDIT_FILE = Promise.resolve();
const sceau = (prec, r) => crypto.createHash("sha256").update([prec||"", r.ts, r.login||"", r.action, r.detail||"", r.ip||""].join("\u0001"), "utf8").digest("hex");
/* correctif 13 : sceau à clé (HMAC-SHA-256, clé « audit » du coffre, sauvegardée avec le trousseau). Le sceau sans clé
   pouvait être recalculé par quiconque accède à la base : une ligne insérée avec un sceau recalculé passait la
   vérification. Les anciennes lignes gardent leur sceau ; après la première ligne à clé, plus aucune ligne sans clé
   n'est admise. */
const sceauH = (prec, r) => "h1:"+crypto.createHmac("sha256", CF.cle("audit")).update([prec||"", r.ts, r.login||"", r.action, r.detail||"", r.ip||""].join("\u0001"), "utf8").digest("hex");
/* v47 : copie de chaque entrée vers un journal distant (syslog RFC 5424, UDP ou TCP) :
   une compromission du serveur ne permet plus de réécrire à la fois la base et la trace */
const dgram = require("dgram");
let SYSLOG_TCP = null;
function versSyslog(r, emp){
  const S = CONFIG.syslog; if (!S || !S.hote) return;
  const pri = /echec|refus|alerte|csrf/.test(r.action) ? 12 : 14;       /* facility user, avertissement / info */
  const msg = "<"+pri+">1 "+r.ts+" "+os.hostname()+" fiwakti - "+r.action+" - "+JSON.stringify({login:r.login, detail:r.detail, ip:r.ip, sceau:emp});
  try {
    if ((S.protocole||"udp") === "tcp"){
      if (!SYSLOG_TCP || SYSLOG_TCP.destroyed){ SYSLOG_TCP = net.connect({host:S.hote, port:Number(S.port)||514}); SYSLOG_TCP.on("error", e=>{ journal("syslog : "+e.message); SYSLOG_TCP = null; }); }
      SYSLOG_TCP.write(msg.length+" "+msg);
    } else { const s = dgram.createSocket(String(S.hote).indexOf(":") >= 0 ? "udp6" : "udp4"); s.send(Buffer.from(msg), Number(S.port)||514, S.hote, ()=>s.close()); }
  } catch(e){ journal("syslog : "+e.message); }
}
function audit(login, action, detail, ip){
  const r = {ts:maintenant(), login:login||"", action, detail:String(detail||"").slice(0,2000), ip:ip||""};
  AUDIT_FILE = AUDIT_FILE.then(async ()=>{
    try {
      const der = await B.get("SELECT empreinte FROM audit WHERE empreinte IS NOT NULL ORDER BY id DESC LIMIT 1");
      const emp = sceauH(der && der.empreinte, r);
      await B.run("INSERT INTO audit(ts,login,action,detail,ip,empreinte) VALUES(?,?,?,?,?,?)", r.ts, r.login, r.action, r.detail, r.ip, emp);
      versSyslog(r, emp);
    } catch(e){ journal("audit : "+e.message); }
  });
  return AUDIT_FILE;
}
/* export quotidien des entrées de la veille vers un emplacement externe (partage en écriture seule, stockage à rétention verrouillée) */
async function exporterAudit(){
  const dest = String(CONFIG.auditExterne||"").trim(); if (!dest) return null;
  /* correctif 18 : rattrapage des jours non exportés (serveur arrêté, destination indisponible), 31 jours au plus */
  fs.mkdirSync(dest, {recursive:true});
  const hier = ajoutJours(aujourdhui(), -1), der = await meta("audit_export");
  let j = der && der.jour ? ajoutJours(der.jour, 1) : hier; if (j < ajoutJours(hier, -30)) j = ajoutJours(hier, -30);
  let f = null;
  for (; j <= hier; j = ajoutJours(j, 1)){
    const l = await B.all("SELECT id, ts, login, action, detail, ip, empreinte FROM audit WHERE ts >= ? AND ts < ? ORDER BY id", j, ajoutJours(j, 1));
    f = path.join(dest, "fiwakti-audit-"+j+".jsonl");
    if (!fs.existsSync(f)) fs.writeFileSync(f, l.map(r=>JSON.stringify(r)).join("\n")+"\n", {flag:"wx"});   /* jamais réécrit */
    await meta("audit_export", {le:maintenant(), jour:j, fichier:f, lignes:l.length});
  }
  return f;
}
/* correctif 13 : vérification renforcée — une ligne non scellée n'est admise qu'avant la première ligne scellée (lignes
   antérieures à la v45) ; la chaîne doit contenir le dernier ancrage quotidien (ancrages-audit.log) : une troncature de
   la fin de la table (lignes supprimées par un accès direct à la base) est ainsi détectée */
function dernierAncrage(){
  try { const l = fs.readFileSync(path.join(D_JOURN, "ancrages-audit.log"), "utf8").trim().split(/\r?\n/).reverse();
    for (const x of l){ const m = /^(\S+) ((?:h1:)?[0-9a-f]{64}) (\d+)$/.exec(x.trim()); if (m) return {le:m[1], empreinte:m[2], n:Number(m[3])}; if (/ REPRISE$/.test(x)) return null; }
  } catch(e){}
  return null;
}
async function verifierAudit(){
  let prec = null, n = 0, anciens = 0, scelle = false, aCle = false, nCle = 0;
  const anc = dernierAncrage(); let ancVu = !anc;
  const rupture = (r, motif) => ({ok:false, n, anciens, rupture:{id:Number(r.id), ts:r.ts, action:r.action, motif}});
  for (let dernier = 0; ; ){
    const l = await B.all("SELECT id, ts, login, action, detail, ip, empreinte FROM audit WHERE id > ? ORDER BY id LIMIT 5000", dernier);
    if (!l.length) break;
    for (const r of l){
      dernier = Number(r.id);
      if (!r.empreinte){ if (scelle) return rupture(r, "ligne non scellée"); anciens++; continue; }
      scelle = true;
      if (String(r.empreinte).indexOf("h1:") === 0){ aCle = true; nCle++; if (sceauH(prec, r) !== r.empreinte) return rupture(r, "sceau invalide"); }
      else { if (aCle) return rupture(r, "sceau sans clé après des sceaux à clé"); if (sceau(prec, r) !== r.empreinte) return rupture(r, "sceau invalide"); }
      prec = r.empreinte; n++;
      if (!ancVu && r.empreinte === anc.empreinte) ancVu = true;
    }
  }
  if (!ancVu) return {ok:false, n, anciens, rupture:{motif:"dernier ancrage introuvable ("+anc.le+", "+anc.n+" entrées) : des entrées ont été supprimées", ancrage:anc}};
  return {ok:true, n, anciens, aCle:nCle, dernier:prec, ancrage:anc ? anc.le : null};
}

/* ---------------- mots de passe (scrypt, standard, sans bloquer le serveur) ---------------- */
const SCRYPT = {N:32768, r:8, p:1, maxmem:96*1024*1024};
const scrypt = util.promisify(crypto.scrypt);
async function hacher(mdp){
  const sel = crypto.randomBytes(16);
  const h = await scrypt(String(mdp).normalize("NFKC"), sel, 32, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, sel.toString("base64"), h.toString("base64")].join("$");
}
async function verifier(mdp, stocke){
  try {
    const [algo, N, r, p, sel, h] = String(stocke||"").split("$");
    if (algo !== "scrypt") return false;
    const att = Buffer.from(h, "base64");
    const calc = await scrypt(String(mdp).normalize("NFKC"), Buffer.from(sel, "base64"), att.length, {N:+N, r:+r, p:+p, maxmem:SCRYPT.maxmem});
    return crypto.timingSafeEqual(att, calc);
  } catch(e){ return false; }
}
function egalConstant(a, b){ const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
async function appSecu(){ try { const d = await D.referentielLecture(); return (d && d.secu) || {}; } catch(e){ return {}; } }
/* v46 : politique appliquée par le serveur, d'après l'écran Sécurité de l'application
   (longueur, mélange de caractères, mots de passe courants, historique, expiration) */
const COURANTS = ["password","motdepasse","azerty","azertyuiop","qwerty","qwertyuiop","123456","12345678","123456789","abc123","admin","administrateur","bonjour",
  "soleil","tunisie","tunis","sfax","sousse","fiwakti","marquardt","welcome","bienvenue","changeme","secret","iloveyou","letmein","monkey","dragon","football",
  "master","superman","batman","princesse","chocolat","doudou","loulou","nicolas","jeanne","ahmed","mohamed","fatma","amine","salah","leila","sonia","karim",
  "employe","utilisateur","pointage","rh","ressources","entreprise","societe","travail","juillet","janvier","printemps","hiver","ete","automne"];
/* correctif 24 : politique BORNÉE à la lecture (valeurs absurdes ou mal typées : « tentatives -1 » supprimait le
   verrouillage, « verrouillageMin 1e7 » bloquait un compte jusqu'en 2045, « exigerMix "false" » valait vrai,
   « historique "abc" » désactivait l'historique) — mêmes bornes que l'écran et que le contrôle à l'enregistrement */
const SECU_BORNES = {minLen:[8, 64, 12], historique:[0, 24, 5], expirationJours:[0, 365, 0], tentatives:[1, 20, 5], verrouillageMin:[1, 1440, 15],
  sessionInactivite:[1, 480, 30], sessionMax:[1, 72, 12], resetValiditeMin:[5, 1440, 60]};
const SECU_BOOL = {exigerMix:false, interdireCourants:true, memoriser:false};
function secuDe(ref){ const brut = ref && ref.secu && typeof ref.secu === "object" && !Array.isArray(ref.secu) ? ref.secu : {}, s = Object.assign({}, brut);
  Object.keys(SECU_BORNES).forEach(k=>{ const [a, b, d] = SECU_BORNES[k], v = Number(brut[k]); s[k] = brut[k] === undefined || brut[k] === null || brut[k] === "" || !Number.isFinite(v) || v < a && k === "tentatives" ? d : Math.min(b, Math.max(a, Math.round(v))); });
  Object.keys(SECU_BOOL).forEach(k=>{ s[k] = brut[k] === undefined ? SECU_BOOL[k] : brut[k] === true; });
  const pr = brut.premiere && typeof brut.premiere === "object" ? brut.premiere : {}, vj = Number(pr.validiteJours);
  s.premiere = Object.assign({}, pr, {validiteJours:pr.validiteJours === undefined || pr.validiteJours === null || pr.validiteJours === "" || !Number.isFinite(vj) ? 30 : Math.min(365, Math.max(0, Math.round(vj)))});
  return s; }
/* « verrouillé jusqu'à » : date jj/mm/aaaa quand ce n'est pas aujourd'hui */
function jusquA(v){ const d = new Date(v), h = d.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  return d.toDateString() === new Date().toDateString() ? h : String(d.getDate()).padStart(2, "0")+"/"+String(d.getMonth()+1).padStart(2, "0")+"/"+d.getFullYear()+" à "+h; }
/* date d'un mot de passe temporaire : jamais dans le futur (elle venait du navigateur et prolongeait la validité) */
const leTemp = u => /^\d{4}-\d{2}-\d{2}$/.test(String(u && u.mdpTempLe || "")) && u.mdpTempLe <= aujourdhui() ? u.mdpTempLe : aujourdhui();
async function politique(mdp, compte, secu){
  secu = secu || secuDe(await D.referentielLecture());
  const v = String(mdp||"");
  const min = Math.max(8, Number(secu.minLen) || 12);
  if (v.length < min) return "Au moins "+min+" caractères.";
  if (secu.exigerMix){
    if (!/[a-zà-ÿ]/.test(v) || !/[A-ZÀ-Þ]/.test(v) || !/[0-9]/.test(v) || !/[^A-Za-z0-9À-ÿ]/.test(v)) return "Minuscule, majuscule, chiffre et caractère spécial obligatoires.";
  } else if ((!/[A-ZÀ-Þ]/.test(v) || !/[0-9]/.test(v)) && !(secu.premiere && secu.premiere.exigerMajChiffre === false && await comptePortail(compte))) return "Au moins une majuscule et un chiffre.";
  const interdits = [compte.login, compte.matricule, compte.nom].filter(Boolean).map(x=>String(x).toLowerCase()).filter(x=>x.length >= 3);
  if (interdits.some(x=>v.toLowerCase().indexOf(x) >= 0)) return "Le mot de passe ne doit contenir ni l'identifiant, ni le matricule, ni le nom.";
  if (secu.interdireCourants !== false){
    const racine = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
    const ent = String(CONFIG.entreprise||"").toLowerCase().replace(/[^a-z]/g, "");
    if (COURANTS.indexOf(racine) >= 0 || (ent.length >= 4 && racine.indexOf(ent) >= 0) || /^(.)\1+$/.test(racine)) return "Mot de passe trop courant ou trop facile à deviner.";
  }
  const n = Math.max(0, Number(secu.historique) || 0);
  if (n && compte.hash && await verifier(v, compte.hash)) return "Le nouveau mot de passe doit être différent de l'actuel.";
  if (n) for (const h of JSON.parse(compte.historique || "[]").slice(0, n)) if (await verifier(v, h)) return "Ce mot de passe a déjà été utilisé : choisissez-en un autre ("+n+" derniers refusés).";
  return "";
}
/* correctif 24 : compte du portail salarié (profil de niveau « simple ») — l'option « exiger une majuscule et un chiffre »
   de l'écran Sécurité n'était lue nulle part */
async function comptePortail(compte){ try { const ref = await D.referentielLecture() || {}, lg = String((compte && compte.login) || "").trim().toLowerCase();
  const u = (ref.users || []).find(x=>x && String(x.login).trim().toLowerCase() === lg); return !!u && PERIM.niveauProfil((ref.profils || []).find(p=>p && p.id === u.profilId)) === "simple"; } catch(e){ return false; } }
/* enregistre le nouveau mot de passe et garde les précédents pour la règle d'historique */
async function definirMdp(c, nouveau, secu){
  const n = Math.max(0, Number(secu.historique) || 0);
  const hist = (c.hash ? [c.hash] : []).concat(JSON.parse(c.historique || "[]")).slice(0, Math.max(n, 1));
  await B.run("UPDATE comptes SET hash=?, historique=?, mdp_le=?, etat='actif', changer=0, raison=NULL, temp_le=NULL, maj=? WHERE login=?", await hacher(nouveau), JSON.stringify(hist), maintenant(), maintenant(), c.login);
}
/* la double authentification est exigée par le profil (écran Profils) ou pour le compte */
async function a2fRequise(login){
  const ref = await D.referentielLecture() || {};
  /* correctif 23 : comparaison sans les espaces (un compte « ␣adm » se connectait par « adm » sans double authentification) */
  const lg = String(login == null ? "" : login).trim().toLowerCase(), u = (ref.users||[]).find(x=>x && String(x.login).trim().toLowerCase() === lg);
  if (!u) return false;
  const j = new Date().toISOString().slice(0,10);
  const dl = (u.deleg||[]).find(x=>x.du <= j && j <= x.au && x.profilId);
  /* correctif 22 : exigée si le profil propre OU le profil délégué l'exige (une délégation d'un profil sans double
     authentification l'annulait) */
  return [u.profilId, dl && dl.profilId].filter(Boolean).some(id=>((ref.profils||[]).find(x=>x && x.id === id) || {}).a2f === true) || !!u.a2fForce || u.a2f === true;   /* correctif 23 : case de l'écran Utilisateurs (« a2f ») */
}
const compteDe = login => B.get("SELECT * FROM comptes WHERE lower(login)=lower(?)", String(login||"").trim());
/* 56.33.11 : compte rattaché à un salarié sorti (date de sortie passée) — refusé à la connexion et à chaque requête,
   sans attendre la désactivation du compte (tâche horaire) ni l'ouverture de l'application par un administrateur */
let SORTIS_CPT = null;
async function salarieSorti(c){
  const m = String((c && c.matricule) || ""); if (!m || !D) return false;
  const emps = await D.employes(), j = aujourdhui();
  if (!SORTIS_CPT || SORTIS_CPT.emps !== emps || SORTIS_CPT.jour !== j) SORTIS_CPT = {emps, jour:j, set:new Set(emps.filter(e=>e.sortie && e.sortie < j).map(e=>String(e.mat)))};
  return SORTIS_CPT.set.has(m);
}

/* comptes de l'application reflétés côté serveur (seul juge des mots de passe) */
/* empIds (facultatif) : seuls les comptes rattachés à ces salariés sont examinés — cas d'un enregistrement de salariés
   sans changement de la liste des comptes (aucun compte ne peut alors disparaître) */
async function synchroniserComptes(doc, par, empIds){
  if (!doc || !Array.isArray(doc.users)) return;
  const partiel = empIds instanceof Set, usersVus = partiel ? doc.users.filter(u=>u && empIds.has(String(u.empId))) : doc.users;
  const profils = {}; (doc.profils||[]).forEach(p=>{ profils[p.id] = p; });
  const emps = {}; (doc.emps||[]).forEach(e=>{ emps[e.id] = e; });
  const vus = new Set(), tousLogins = new Set(doc.users.filter(u=>u && u.login).map(u=>String(u.login).trim().toLowerCase()));
  /* 56.33.11 : tous les comptes lus en une requête, et seuls ceux qui changent sont réécrits. Auparavant chaque
     enregistrement d'un salarié (import, modification d'une fiche) relisait et réécrivait chaque compte un par un :
     avec un portail de 50 000 comptes, ~100 000 requêtes par modification. */
  const champsC = "login, uid, nom, matricule, role, actif, etat, temp_le";
  const lus = !partiel ? await B.all("SELECT "+champsC+" FROM comptes") : usersVus.length ? await B.all("SELECT "+champsC+" FROM comptes WHERE lower(login) IN ("+usersVus.map(()=>"lower(?)").join(",")+")", ...usersVus.map(u=>String(u.login||"").trim())) : [];
  const existants = new Map(lus.map(c=>[String(c.login).toLowerCase(), c]));
  /* correctif 23 : identifiant renommé → même ligne de compte (mot de passe conservé) ; auparavant un nouveau compte sans mot
     de passe était créé et l'ancien désactivé, en gardant son mot de passe pour une réutilisation du nom */
  const parUid = new Map(); if (!partiel) lus.forEach(c=>{ if (c.uid && !tousLogins.has(String(c.login).toLowerCase())) parUid.set(String(c.uid), c); });
  for (const u of usersVus){
    if (!u || !u.login) continue;
    const login = String(u.login).trim(); vus.add(login.toLowerCase());
    const pr = profils[u.profilId] || {}, d = pr.droits || {};
    const niveau = u.profilId && profils[u.profilId] ? PERIM.niveauProfil(pr) : "";
    const role = niveau === "admin" || login.toLowerCase() === String(CONFIG.adminInitial||"").toLowerCase() ? "admin" : "utilisateur";
    const emp = emps[u.empId]; const mat = emp ? String(emp.mat||"") : "";
    const actif = u.actif !== false && !(emp && emp.sortie && emp.sortie < aujourdhui()) ? 1 : 0;
    let c = existants.get(login.toLowerCase());
    const rn = !c && u.id ? parUid.get(String(u.id)) : null;
    if (rn && Number(rn.actif)){ await B.run("UPDATE comptes SET login=?, maj=? WHERE login=?", login, maintenant(), rn.login); await B.run("DELETE FROM sessions WHERE lower(login)=lower(?)", rn.login);
      await audit(par, "compte.renomme", rn.login+" → "+login); parUid.delete(String(u.id)); existants.delete(String(rn.login).toLowerCase()); rn.login = login; existants.set(login.toLowerCase(), rn); c = rn; }
    /* correctif 19/23 : jamais de mot de passe temporaire = matricule pour un compte administrateur ou ayant un droit
       d'écriture en Administration (un matricule se devine), ni à la création ni à la réinitialisation */
    const matOk = !!mat && role !== "admin" && niveau === "simple" && !({saisie:1, validation:1, config:1}[d.SYS]);   /* portail salarié seulement */
    if (!c){
      /* correctif 19 : jamais de mot de passe temporaire = matricule pour un compte administrateur ou ayant un droit
         d'écriture en Administration (un matricule se devine) : ces comptes attendent un mot de passe (invitation) */
      const temp = !!u.mdpTemp && matOk;
      await B.run("INSERT INTO comptes(login,uid,nom,matricule,role,actif,etat,temp_le,changer,raison,maj) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        login, u.id||"", u.nom||login, mat, role, actif, temp ? "temp_matricule" : "sans_mdp", temp ? leTemp(u) : null, 1, temp ? "premiere" : "invitation", maintenant());
      await audit(par, "compte.cree", login+" — profil "+(pr.nom || u.profilId || "aucun")+(role === "admin" ? " (administrateur)" : "")+" ("+(temp ? "mot de passe temporaire = matricule" : "en attente d'un mot de passe")+")");
      existants.set(login.toLowerCase(), {login, uid:u.id||"", nom:u.nom||login, matricule:mat, role, actif, etat:temp ? "temp_matricule" : "sans_mdp", temp_le:temp ? leTemp(u) : null});
    } else {
      /* correctif 23 : compte retiré puis recréé, ou identifiant repris par une autre personne (autre identifiant interne) :
         remis à zéro — il héritait du mot de passe, de la double authentification et de l'historique de l'ancien titulaire */
      const repris = (c.uid && u.id && String(c.uid) !== String(u.id) && login.toLowerCase() !== String(CONFIG.adminInitial||"").toLowerCase()) || (!Number(c.actif) && c.raison === "retire" && actif);
      if (repris){ const temp = !!u.mdpTemp && matOk;
        await B.run("UPDATE comptes SET uid=?, nom=?, matricule=?, role=?, actif=?, hash=NULL, historique=NULL, mdp_le=NULL, a2f_secret=NULL, a2f_actif=0, a2f_pas=NULL, etat=?, temp_le=?, changer=1, raison=?, echecs=0, verrou=NULL, maj=? WHERE login=?",
          u.id||"", u.nom||login, mat, role, actif, temp ? "temp_matricule" : "sans_mdp", temp ? leTemp(u) : null, temp ? "premiere" : "invitation", maintenant(), c.login);
        await B.run("DELETE FROM sessions WHERE lower(login)=lower(?)", c.login);
        await audit(par, "compte.reactive", login+" — nouveau titulaire ou compte recréé : mot de passe et double authentification remis à zéro ("+(temp ? "mot de passe temporaire = matricule" : "en attente d'un mot de passe")+")");
        Object.assign(c, {uid:u.id||"", nom:u.nom||login, matricule:mat, role, actif, etat:temp ? "temp_matricule" : "sans_mdp", temp_le:temp ? leTemp(u) : null, raison:temp ? "premiere" : "invitation"}); }
      const nv = {uid:u.id||c.uid, nom:u.nom||c.nom, matricule:mat, role, actif};
      if (Object.keys(nv).some(k=>String(nv[k] == null ? "" : nv[k]) !== String(c[k] == null ? "" : c[k]))){
        const ch = []; if (String(c.role) !== role) ch.push("rôle "+c.role+" → "+role); if (Number(c.actif) !== actif) ch.push(actif ? "activé" : "désactivé");
        await B.run("UPDATE comptes SET uid=?, nom=?, matricule=?, role=?, actif=?, maj=? WHERE login=?", nv.uid, nv.nom, mat, role, actif, maintenant(), c.login);
        if (!actif && Number(c.actif)) await B.run("DELETE FROM sessions WHERE lower(login)=lower(?)", c.login);
        if (ch.length) await audit(par, "compte.modifie", login+" — "+ch.join(" ; "));
        Object.assign(c, nv);
      }
      if (u.mdpTemp && matOk && c.etat !== "temp_matricule" && u.mdpChangeRaison === "reinit" && (u.mdpTempLe||"") > (c.temp_le||"")){
        await B.run("UPDATE comptes SET etat='temp_matricule', hash=NULL, temp_le=?, changer=1, raison='reinit', echecs=0, verrou=NULL WHERE login=?", leTemp(u), c.login);
        c.etat = "temp_matricule"; c.temp_le = leTemp(u);
        await audit(par, "compte.reinitialise", login+" (matricule)");
      }
    }
    delete u.mdp; delete u.mdpHisto; delete u.codeReset;
  }
  if (!partiel) for (const c of await B.all("SELECT login FROM comptes WHERE actif=1")){
    if (!vus.has(c.login.toLowerCase()) && c.login.toLowerCase() !== String(CONFIG.adminInitial||"").toLowerCase()){
      /* correctif 23 : compte retiré — mot de passe et secret de double authentification effacés (ils restaient en base) */
      await B.run("UPDATE comptes SET actif=0, raison='retire', hash=NULL, historique=NULL, a2f_secret=NULL, a2f_actif=0, a2f_pas=NULL WHERE login=?", c.login);
      await B.run("DELETE FROM sessions WHERE lower(login)=lower(?)", c.login); await audit(par, "compte.desactive", c.login+" (retiré de l'application)");
    }
  }
}

/* correctif 24 : comptes du portail salarié générés par le serveur — l'écran ne voyait que les salariés chargés dans le
   navigateur (aucun avec 20 000 salariés : « Générer les comptes manquants (0) ») et la création automatique ne tournait
   que dans le navigateur. ids (facultatif) : salariés à examiner. */
function portailProfil(ref){ const pr = secuDe(ref).premiere, L = (ref.profils || []).filter(p=>p && PERIM.niveauProfil(p) === "simple");
  return L.find(p=>p.id === pr.profilId) || L.find(p=>p.id === "prEmp") || L[0] || null; }
async function portailEligibles(ref, ids){
  const pr = secuDe(ref).premiere, j = aujourdhui(), users = (ref.users || []).filter(Boolean);
  const aCompte = new Set(users.map(u=>u.empId).filter(Boolean));
  return (await D.employes()).filter(e=>e && e.mat && !(e.sortie && e.sortie <= j) && (!pr.portailSeul || e.portail) && !aCompte.has(e.id) && (!ids || ids.has(String(e.id))));
}
async function portailGenerer(par, ids, ip){
  const ref = await D.referentiel(); if (!ref) return {crees:0, conflits:[]};
  const prof = portailProfil(ref); if (!prof) return {crees:0, conflits:[], motif:"aucun profil de niveau « simple » pour le portail"};
  const elig = await portailEligibles(ref, ids); if (!elig.length) return {crees:0, conflits:[]};
  const logins = new Set((ref.users || []).filter(Boolean).map(u=>String(u.login).trim().toLowerCase())), j = aujourdhui(), crees = [], conflits = [];
  for (const e of elig){ const login = String(e.mat).trim(); if (logins.has(login.toLowerCase())){ conflits.push(login); continue; } logins.add(login.toLowerCase());
    crees.push({id:"u"+crypto.randomBytes(8).toString("hex"), login, nom:((e.prenom || "")+" "+(e.nom || "")).trim() || login, empId:e.id, profilId:prof.id, langue:"fr", actif:true, deleg:[], delegPerim:[], perim:{},
      mdpTemp:true, mdpTempLe:j, mdpChangeRaison:"premiere", mustChangePassword:true, mdpDefini:false}); }
  if (crees.length){
    ref.users = (ref.users || []).concat(crees); const v = ref.__versions || (ref.__versions = {}); v.users = (Number(v.users) || 0) + 1;
    await synchroniserComptes({users:ref.users, profils:ref.profils, emps:await D.employes(), secu:ref.secu}, par, new Set(crees.map(u=>String(u.empId))));
    await B.run("UPDATE kv SET valeur=?, version=version+1, maj=? WHERE cle=?", JSON.stringify(ref), maintenant(), CLE_APP);
    await audit(par, "comptes.portail_generes", crees.length+" compte(s) du portail créé(s) — profil « "+String(prof.nom || prof.id).slice(0, 60)+" »"+(conflits.length ? " ; identifiant déjà pris : "+conflits.slice(0, 20).join(", ")+(conflits.length > 20 ? "…" : "") : ""), ip);
  }
  return {crees:crees.length, conflits};
}

/* ---------------- correctif 25 : règles métier exécutées par le serveur ----------------
   Auparavant exécutées dans le navigateur du compte qui enregistrait la fiche : jamais au-delà de 1 000 salariés (le
   navigateur ne reçoit plus les fiches), ni pour un import, ni avec une règle désactivée entre-temps ; journal écrit par
   le navigateur (falsifiable). Ici : événements déduits de la fiche ENREGISTRÉE et de son dernier état connu
   (« regleEtat », tenu par le serveur), actions faites en base, journal écrit par le serveur (un identifiant par règle,
   salarié, événement et date : jamais deux fois). ids : salariés à examiner (null = tous, tâche planifiée) ;
   nouveaux : salariés créés par l'envoi. */
const REGLE_LIB = {desac_compte:"compte désactivé", desac_portail:"portail désactivé", bloquer_badge:"badge bloqué", retirer_acces:"accès aux zones retirés", retirer_bio:"biométrie retirée des appareils", notif_rh:"notification RH", archiver:"(sans effet)", maj_workflows:"(sans effet)"};
let REGLES_EN_COURS = Promise.resolve();
function executerRegles(ids, par, nouveaux, horsForce){ const p = REGLES_EN_COURS.then(()=>executerRegles0(ids, par, nouveaux || new Set(), horsForce || new Set())); REGLES_EN_COURS = p.catch(()=>{}); return p; }
async function executerRegles0(ids, par, nouveaux, horsForce){
  const ref = await D.referentielLecture() || {}, j = aujourdhui(), regles = (ref.regles || []).filter(r=>r && r.actif === true && Array.isArray(r.actions));
  const hors = new Set((ref.depts || []).filter(d=>d && d.type === "hors").map(d=>d.id)), siteNom = id => ((ref.sites || []).find(s=>s && s.id === id) || {}).nom || id || "—";
  const z = v => String(v).padStart(2, "0"), n0 = new Date(), ts = n0.getFullYear()+"-"+z(n0.getMonth()+1)+"-"+z(n0.getDate())+" "+z(n0.getHours())+":"+z(n0.getMinutes());
  const jjmm = d => String(d || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");
  const journalL = [], notifs = [], comptesOff = new Map(), bio = new Set(), bilan = {salaries:0, executions:0, actions:0, mats:[]};
  const liste = (await D.employes()).filter(e=>e && e.id && (!ids || ids.has(String(e.id))));
  for (const e of liste){
    const etat = e.regleEtat && typeof e.regleEtat === "object" ? e.regleEtat : null, evts = [], x = JSON.parse(JSON.stringify(e)), nouv = nouveaux.has(String(e.id));
    if (nouv) evts.push({type:"employe.cree", detail:"création"});
    if (e.sortie && e.sortie <= j && e.sortieTraitee !== e.sortie){ evts.push({type:"employe.sorti", detail:"sortie au "+jjmm(e.sortie)}); x.sortieTraitee = e.sortie; }
    if (!e.sortie && e.sortieTraitee){ delete x.sortieTraitee;
      journalL.push({id:"js_reint_"+String(e.mat).replace(/[^A-Za-z0-9_.:-]/g, "_")+"_"+j, type:"systeme", code:"reintegration", mat:String(e.mat), employe:((e.nom || "")+" "+(e.prenom || "")).trim(), msg:"sortie annulée : les effets des règles de sortie (compte, portail, badge, accès, biométrie) sont à rétablir manuellement", par:"système", ts, at:ts+":00", srv:1}); }
    if (etat && !nouv && (etat.siteId !== (e.siteId || "") || etat.deptId !== (e.deptId || ""))) evts.push({type:"employe.mutation", detail:"→ "+siteNom(e.siteId)+" / "+(((ref.depts || []).find(d=>d && d.id === e.deptId) || {}).nom || e.deptId || "—")});
    const estHors = hors.has(e.deptId);
    if (estHors && !(e.sortie && e.sortie <= j) && ((etat && !etat.hors) || (!etat && (nouv || horsForce.has(e.deptId))))) evts.push({type:"employe.hors_effectif", detail:(((ref.depts || []).find(d=>d && d.id === e.deptId) || {}).nom || "hors effectif")});
    /* état de référence : posé à chaque fiche enregistrée ; la tâche planifiée ne réécrit pas 20 000 fiches pour l'initialiser */
    if (ids || etat || evts.length) x.regleEtat = {siteId:e.siteId || "", deptId:e.deptId || "", hors:estHors};
    for (const ev of evts) for (const r of regles){
      if (r.declencheur !== ev.type || (Array.isArray(r.siteIds) && r.siteIds.length && r.siteIds.indexOf(e.siteId) < 0)) continue;
      const faites = [], sansEffet = [];
      for (const a of r.actions){
        if (a === "desac_compte" || a === "desac_portail"){ const m = comptesOff.get(String(e.id)) || {tous:false}; if (a === "desac_compte") m.tous = true; comptesOff.set(String(e.id), m);
          if (a === "desac_portail" && x.portail !== false) x.portail = false; faites.push(a); }
        else if (a === "bloquer_badge"){ if (x.badge && !String(x.badge).startsWith("BLK:")){ x.badge = "BLK:"+x.badge; faites.push(a); } else sansEffet.push(a); bio.add(String(e.mat)); }
        else if (a === "retirer_acces"){ const dEff = x.sortie && x.sortie >= j ? ajoutJours(x.sortie, 1) : j, acc = Array.isArray(x.acces) ? x.acces : [], zones = new Set();
          acc.forEach(y=>{ if (y && y.zoneId && y.from <= dEff) zones.add(y.zoneId); });
          let n = 0; zones.forEach(zid=>{ const der = acc.filter(y=>y && y.zoneId === zid && y.from <= dEff).sort((a2, b2)=>a2.from < b2.from ? 1 : -1)[0]; if (!der || der.planId === "aucun") return;
            const k = acc.findIndex(y=>y.zoneId === zid && y.from === dEff); if (k >= 0) acc[k].planId = "aucun"; else acc.push({zoneId:zid, planId:"aucun", from:dEff}); n++; });
          if (n){ x.acces = acc.sort((a2, b2)=>a2.from < b2.from ? -1 : 1); faites.push(a); } else sansEffet.push(a); }
        else if (a === "retirer_bio"){ bio.add(String(e.mat)); faites.push(a); }
        else if (a === "notif_rh"){ notifs.push({id:"nf_rg_"+String(r.id).replace(/[^A-Za-z0-9_.:-]/g, "_")+"_"+String(e.mat).replace(/[^A-Za-z0-9_.:-]/g, "_")+"_"+j, d:j, mat:String(e.mat), txt:"Règle « "+String(r.nom || "").slice(0, 80)+" » : "+((e.nom || "")+" "+(e.prenom || "")).trim()+" ("+e.mat+") — "+ev.detail}); faites.push(a); }
        else sansEffet.push(a);
      }
      bilan.executions++; bilan.actions += faites.length;
      journalL.push({id:("jr_"+r.id+"_"+e.mat+"_"+ev.type+"_"+j).replace(/[^A-Za-z0-9_.:-]/g, "_"), regleId:r.id, regleNom:String(r.nom || "").slice(0, 120), declencheur:ev.type, mat:String(e.mat), employe:((e.nom || "")+" "+(e.prenom || "")).trim().slice(0, 120),
        codes:faites, sansEffet, refuses:[], echecs:[], actions:faites.map(c=>REGLE_LIB[c] || c), detail:ev.detail, par:"système (règle) — "+String(par || "").slice(0, 60), ts, at:ts+":00", srv:1});
    }
    /* effets visibles (badge, portail, accès…) : nouvelle version de la fiche — une copie plus ancienne envoyée ensuite par un
       navigateur est refusée (conflit) au lieu d'annuler les effets ; le suivi interne seul ne change pas la version */
    if (JSON.stringify(x) !== JSON.stringify(e)){ const sans = o=>{ const y = Object.assign({}, o); ["regleEtat", "sortieTraitee", "__v"].forEach(k=>delete y[k]); return JSON.stringify(y); };
      if (sans(x) !== sans(e)){ x.__v = Number(e.__v || 0) + 1; if (bilan.mats.length < 200) bilan.mats.push(String(e.mat)); }
      await D.ecrire("emps", x, e); bilan.salaries++; }
  }
  /* comptes : désactivation en une écriture du paramétrage (portail seul : comptes de niveau « simple ») */
  if (comptesOff.size){ const ref2 = await D.referentiel(); let n = 0;
    (ref2.users || []).forEach(u=>{ const m = u && comptesOff.get(String(u.empId)); if (!m || u.actif === false) return;
      if (m.tous || PERIM.niveauProfil((ref2.profils || []).find(p=>p && p.id === u.profilId)) === "simple"){ u.actif = false; n++; } });
    if (n){ const v = ref2.__versions || (ref2.__versions = {}); v.users = (Number(v.users) || 0) + 1;
      await synchroniserComptes({users:ref2.users, profils:ref2.profils, emps:await D.employes(), secu:ref2.secu}, "système (règle)", new Set(comptesOff.keys()));
      await B.run("UPDATE kv SET valeur=?, version=version+1, maj=? WHERE cle=?", JSON.stringify(ref2), maintenant(), CLE_APP); } }
  if (journalL.length) await D.ecrireLot("journal", journalL);
  if (notifs.length) await D.ecrireLot("notifs", notifs);
  if (bio.size && PT) for (const m of bio){ try { await BS().retirerBiometrie(m, "regle"); } catch(err){ journal("règles métier : biométrie "+m+" : "+err.message); } }
  if (bilan.executions) await audit(String(par || "système"), "regles.executees", bilan.executions+" exécution(s), "+bilan.actions+" action(s) faite(s), "+bilan.salaries+" fiche(s) mise(s) à jour", "");
  return bilan;
}

/* ---------------- licence (signature ECDSA P-256 de l'éditeur) ---------------- */
function empreinteMachine(){
  const macs = Object.values(os.networkInterfaces()).flat().filter(i=>i && !i.internal && i.mac && i.mac !== "00:00:00:00:00:00").map(i=>i.mac).sort();
  const brut = [os.hostname(), os.platform(), os.arch(), macs[0]||"", (os.cpus()[0]||{}).model||""].join("|");
  const h = crypto.createHash("sha256").update(brut).digest("hex").toUpperCase();
  return h.slice(0,4)+"-"+h.slice(4,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16);
}
const b64u = { dec:s=>Buffer.from(String(s).replace(/-/g,"+").replace(/_/g,"/"), "base64") };
const CLE_PUB_OBJ = crypto.createPublicKey({key:CLE_PUBLIQUE, format:"jwk"});
function verifierSignature(donnees, signatureB64u){ return crypto.verify("sha256", Buffer.from(donnees), {key:CLE_PUB_OBJ, dsaEncoding:"ieee-p1363"}, b64u.dec(signatureB64u)); }
const CLES_ANC_OBJ = CLES_ANCIENNES.map(a=>{ try { return {cle:crypto.createPublicKey({key:a.publique, format:"jwk"}), jusqua:a.jusqua||""}; } catch(e){ return null; } }).filter(Boolean);
/* licence : clé active, sinon une ancienne clé encore valable (date « jusqua ») — jamais pour une mise à jour ni un jeton */
function verifierSignatureLicence(donnees, sig){ if (verifierSignature(donnees, sig)) return true;
  return CLES_ANC_OBJ.some(a=>(!a.jusqua || aujourdhui() <= a.jusqua) && crypto.verify("sha256", Buffer.from(donnees), {key:a.cle, dsaEncoding:"ieee-p1363"}, b64u.dec(sig))); }
function lireLicence(cle){
  const m = /^FWK1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(cle||"").replace(/\s+/g,""));
  if (!m) return {ok:false, motif:"Format de licence non reconnu."};
  if (!verifierSignatureLicence("FWK1."+m[1], m[2])) return {ok:false, motif:"Signature invalide : cette licence n'a pas été émise par l'éditeur."};
  let p; try { p = JSON.parse(b64u.dec(m[1]).toString("utf8")); } catch(e){ return {ok:false, motif:"Licence illisible."}; }
  if (p.empreinte && p.empreinte !== empreinteMachine()) return {ok:false, motif:"Licence émise pour une autre machine (empreinte "+p.empreinte+").", charge:p};
  if (p.id && REVOQUES.has(String(p.id))) return {ok:false, motif:"Licence révoquée par le fournisseur.", charge:p};
  /* v55 : licence v2 — liste explicite de modules FW- (fw), ou lettres historiques P / A */
  if (!/^(P|A|PA)$/.test(p.modules||"") && !(Array.isArray(p.fw) && p.fw.length && p.fw.every(x=>MODULES.ID_OK.test(x)))) return {ok:false, motif:"Modules inconnus."};
  return {ok:true, charge:p};
}
async function licenceActive(){ const l = await meta("licence"); if (!l) return null; const r = lireLicence(l.cle); return r.ok ? Object.assign({cle:l.cle, activee:l.activee}, r.charge) : null; }
/* v56.30 : licence temporelle (cahier des charges § 3) — état calculé par le serveur sur la date effective (horloge protégée),
   gardé une minute en mémoire ; une licence de renouvellement dont la période commence plus tard est programmée */
let HORLOGE_I = null, LIC_CACHE = {t:0, v:null}, LIC_VERROU = false;
/* v56.30 (lot B) : liste de révocation signée — portée par chaque licence (champ « revoque »), cumulée sur le serveur ;
   jeton fournisseur d'une heure lié à l'installation (remplace toute « clé générale ») */
const REVOQUES = new Set(), JETONS_SESS = new Map(), LOGIN_FOURNISSEUR = "fournisseur-fwk";
async function revocationsCharger(){ try { ((await meta("revocations")) || []).forEach(x=>REVOQUES.add(String(x))); } catch(e){} }
async function revocationsAjouter(l){ if (!Array.isArray(l) || !l.length) return 0; let n = 0; l.forEach(x=>{ if (!REVOQUES.has(String(x))){ REVOQUES.add(String(x)); n++; } });
  if (n) await meta("revocations", Array.from(REVOQUES)); return n; }
function lireJeton(j){
  const m = /^FWJ1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(j||"").replace(/\s+/g,""));
  if (!m) return {ok:false, motif:"Jeton non reconnu."};
  if (!verifierSignature("FWJ1."+m[1], m[2])) return {ok:false, motif:"Jeton refusé : il n'a pas été émis par le fournisseur."};
  let p; try { p = JSON.parse(b64u.dec(m[1]).toString("utf8")); } catch(e){ return {ok:false, motif:"Jeton illisible."}; }
  if (!p.empreinte || p.empreinte !== empreinteMachine()) return {ok:false, motif:"Jeton émis pour une autre installation."};
  const exp = Date.parse(p.exp||""), em = Date.parse(p.emis||"");
  if (!exp || !em || exp - em > 3700000) return {ok:false, motif:"Jeton invalide (durée supérieure à une heure)."};
  if (Date.now() > exp) return {ok:false, motif:"Jeton expiré : demandez-en un nouveau au fournisseur."};
  if (p.id && REVOQUES.has(String(p.id))) return {ok:false, motif:"Jeton révoqué."};
  return {ok:true, charge:p, exp};
}
const REFUS_LIC = {jour:"", n:0, routes:{}};
function horloge(){ if (!HORLOGE_I) HORLOGE_I = LICENCE.creerHorloge({lire:async ()=>{ const v = await meta("horloge"); return v && v.c; },
  ecrire:async c=>meta("horloge", {c}), chiffrer:t=>CF.chiffrerTexte(t, "secrets"), dechiffrer:v=>CF.dechiffrerTexte(v, "secrets"), aujourdhui,
  signaler:async m=>{ journal("licence : "+m); await audit("systeme", "licence.horloge", m); }}); return HORLOGE_I; }
async function licenceEtat(force){
  if (!force && LIC_CACHE.v && Date.now() - LIC_CACHE.t < 60000) return LIC_CACHE.v;
  const jour = await horloge().jour();
  const suiv = await meta("licence_suivante");
  if (suiv){ const rs = lireLicence(suiv.cle), ls = rs.ok ? LICENCE.normaliser(rs.charge) : null;
    const cur0 = await licenceActive();
    if (!rs.ok || (cur0 && ls.serie < LICENCE.normaliser(cur0).serie)) await meta("licence_suivante", null);
    else if (!ls.debut || ls.debut <= jour){ const avant = cur0;
      await meta("licence", {cle:suiv.cle, activee:maintenant(), programmee:true}); await meta("licence_suivante", null);
      await audit("systeme", "licence.programmee_appliquee", JSON.stringify(LICENCE.differences(avant, rs.charge))); await chargerModules(); } }
  const lic = await licenceActive();
  const e = lic ? LICENCE.etat(lic, jour) : {etat:"invalide", restriction:"blocage", joursRestants:null, L:null};
  const sv = suiv && (await meta("licence_suivante")); const v = {jour, lic, e, suivante:sv ? LICENCE.normaliser(lireLicence(sv.cle).charge || {}) : null};
  LIC_CACHE = {t:Date.now(), v}; return v;
}
function licencePublique(v){
  if (!v || !v.lic) return null; const L = v.e.L || LICENCE.normaliser(v.lic);
  return {client:L.client, licence:L.id, serie:L.serie, debut:L.debut, fin:L.fin, politique:L.politique, grace:L.grace, apres:L.apres,
    etat:v.e.etat, restriction:v.e.restriction, joursRestants:v.e.joursRestants, finGrace:v.e.finGrace || null, capacite:L.capacite,
    rappel:LICENCE.rappelDu(v.e, (CONFIG.licenceRappel||{}).frequence || "jour"), rappelTous:!!(CONFIG.licenceRappel||{}).tous,
    suivante:v.suivante ? {debut:v.suivante.debut, fin:v.suivante.fin} : null};
}
/* routes toujours ouvertes, quelle que soit l'échéance : session, licence, déconnexion, état et sauvegardes (export
   administratif), préférences d'affichage ; en consultation seule, toutes les lectures restent ouvertes */
function routeLibreLicence(p, methode){
  if (/^\/api\/v1\/(session|licence|deconnexion|mot-de-passe|modules)(\/|$)/.test(p)) return true;
  if (methode === "GET" && /^\/api\/v1\/(systeme|sauvegardes|travaux)(\/|$)/.test(p)) return true;
  return false;
}
/* en consultation seule, les exports (travaux d'export) et la sauvegarde manuelle restent permis : ce sont des lectures */
function exportPermis(p, methode){ return methode === "POST" && (p === "/api/v1/travaux" || p === "/api/v1/sauvegardes"); }
function compterRefusLicence(p){ const j = aujourdhui(); if (REFUS_LIC.jour !== j){ flushRefusLicence(); REFUS_LIC.jour = j; }
  REFUS_LIC.n++; const r = p.replace(/\/[0-9a-f-]{8,}.*$/i, "/…"); REFUS_LIC.routes[r] = (REFUS_LIC.routes[r]||0) + 1; }
function flushRefusLicence(){ if (!REFUS_LIC.n) return; const d = REFUS_LIC.jour+" : "+REFUS_LIC.n+" écriture(s) refusée(s) — "+Object.entries(REFUS_LIC.routes).slice(0, 10).map(([k, n])=>k+" ×"+n).join(", ");
  audit("systeme", "licence.ecritures_refusees", d).catch(()=>{}); REFUS_LIC.n = 0; REFUS_LIC.routes = {}; }
function clePreference(p){ let k = ""; try { k = decodeURIComponent(p.slice(9)); } catch(e){ return false; }
  return k !== CLE_APP && k !== "fiwakti:home:admin:v2" && !/^fiwakti:(bak|avant-migration|illisible|lic):/.test(k); }
const MSG_LIC_ECHUE = "Votre licence FIWAKTI est arrivée à échéance. Certaines fonctions sont temporairement limitées. Pour rétablir l'ensemble des fonctionnalités, veuillez contacter votre fournisseur. Vos données restent conservées.";

/* ---------------- sessions ---------------- */
const COOKIE = "fwk_s", ESSAIS_IP = new Map();
/* 56.33.11 : identifiants inconnus ou inactifs verrouillés comme un vrai compte (sinon seul un compte existant répond
   « verrouillé » : l'identifiant se devine) */
const ECHECS_INCONNUS = new Map();
function cookies(req){ const o = {}; String(req.headers.cookie||"").split(";").forEach(p=>{ const i = p.indexOf("="); if (i > 0) o[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim()); }); return o; }
const hid = id => crypto.createHash("sha256").update(id).digest("hex");
async function sessionDe(req){
  const id = cookies(req)[COOKIE]; if (!id) return null;
  const s = await B.get("SELECT * FROM sessions WHERE id=?", hid(id));
  if (!s) return null;
  if (!s.csrf){ await B.run("DELETE FROM sessions WHERE id=?", s.id); return null; }
  const secu = secuDe(await D.referentielLecture());
  const n = Date.now(), inactif = Math.max(1, Number(secu.sessionInactivite)||30)*60000, max = Math.max(1, Number(secu.sessionMax)||12)*3600000;
  /* correctif 24 : « rester connecté » — la session mémorisée n'expire pas par inactivité (seule la durée maximale
     s'applique), sinon l'option était sans effet au-delà de l'inactivité */
  if ((!Number(s.persistant) && n - Number(s.vu) > inactif) || n - Number(s.cree) > max){ await B.run("DELETE FROM sessions WHERE id=?", s.id); return null; }
  if (n - Number(s.vu) > 15000) await B.run("UPDATE sessions SET vu=? WHERE id=?", n, s.id);
  const c = await compteDe(s.login);
  if (!c || !Number(c.actif) || await salarieSorti(c)){ await B.run("DELETE FROM sessions WHERE id=?", s.id); return null; }
  return {sid:s.id, compte:c, csrf:s.csrf||"", a2fOk:s.a2f_ok === null || s.a2f_ok === undefined ? true : !!Number(s.a2f_ok)};
}
async function ouvrirSession(res, req, login, opts){
  opts = opts || {};
  const id = crypto.randomBytes(32).toString("base64url");
  await B.run("INSERT INTO sessions(id,login,cree,vu,ip,agent,csrf,a2f_ok,persistant) VALUES(?,?,?,?,?,?,?,?,?)", hid(id), login, Date.now(), Date.now(), ipDe(req),
    String(req.headers["user-agent"]||"").slice(0,200), crypto.randomBytes(24).toString("base64url"), opts.a2f ? 0 : 1, opts.persistant ? 1 : 0);
  /* « rester connecté » (si la politique l'autorise) : cookie conservé jusqu'à la durée maximale de session */
  res.setHeader("Set-Cookie", COOKIE+"="+id+"; HttpOnly; SameSite=Strict; Path=/"+(SECURISE ? "; Secure" : "")+(opts.persistant ? "; Max-Age="+Math.round(opts.maxSec||43200) : ""));
}
async function fermerSession(res, sess){
  if (sess) await B.run("DELETE FROM sessions WHERE id=?", sess.sid);
  res.setHeader("Set-Cookie", COOKIE+"=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+(SECURISE ? "; Secure" : ""));
}
/* v47 : adresse du client. Derrière un proxy inverse DÉCLARÉ de confiance (config « proxyConfiance »),
   l'adresse transmise par le proxy est retenue ; sinon celle de la connexion, jamais un en-tête. */
const ipBrute = req => String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
function ipDe(req){
  const brute = ipBrute(req);
  /* correctif 18 : la chaîne X-Forwarded-For est lue de droite à gauche : première adresse qui n'est pas un proxy de
     confiance (la plus à gauche est fournie par le client et peut être inventée) */
  if ((CONFIG.proxyConfiance||[]).indexOf(brute) >= 0 && req.headers["x-forwarded-for"]){
    const l = String(req.headers["x-forwarded-for"]).split(",").map(x=>x.trim().replace(/^::ffff:/, "")).filter(Boolean);
    for (let i = l.length - 1; i >= 0; i--) if ((CONFIG.proxyConfiance||[]).indexOf(l[i]) < 0) return l[i];
    return l[0] || brute;
  }
  return brute;
}
/* limites : par adresse (20 échecs / 15 min), globale (300 échecs / 15 min, toutes adresses),
   et alerte quand un même compte échoue depuis plusieurs adresses (attaque distribuée) */
const ECHECS_GLOBAL = {n:0, t:Date.now()}, ECHECS_COMPTE = new Map();
async function noterEchec(login, ip){
  if (Date.now() - ECHECS_GLOBAL.t > 15*60000){ ECHECS_GLOBAL.n = 0; ECHECS_GLOBAL.t = Date.now(); }
  ECHECS_GLOBAL.n++;
  if (ECHECS_GLOBAL.n === 300) await alerte("connexion.limite_globale", "300 échecs de connexion en moins de 15 min, toutes adresses confondues : connexions ralenties");
  const k = String(login||"").toLowerCase(); if (!k) return;
  const e = ECHECS_COMPTE.get(k) || {ips:new Set(), t:Date.now(), alerte:false};
  if (Date.now() - e.t > 15*60000){ e.ips = new Set(); e.t = Date.now(); e.alerte = false; }
  e.ips.add(ip); ECHECS_COMPTE.set(k, e);
  if (e.ips.size >= 3 && !e.alerte){ e.alerte = true; await alerte("connexion.attaque_distribuee", "compte « "+login+" » : échecs depuis "+e.ips.size+" adresses différentes en 15 min ("+Array.from(e.ips).slice(0,5).join(", ")+")"); }
}
async function alerte(action, detail){
  journal("ALERTE "+action+" : "+detail);
  await audit("securite", "alerte."+action, detail);
  const l = (await meta("alertes")) || []; l.unshift({le:maintenant(), action, detail}); await meta("alertes", l.slice(0, 100));
}

/* ---------------- sauvegardes (avec restauration d'essai) ---------------- */
function horodatage(){ return maintenant().replace(/[-:]/g,"").replace("T","-").slice(0,15); }
function sha256Fichier(f){ return new Promise((ok, ko)=>{ const h = crypto.createHash("sha256"); fs.createReadStream(f).on("data", d=>h.update(d)).on("end", ()=>ok(h.digest("hex"))).on("error", ko); }); }
let SAUVEGARDE_EN_COURS = null;
/* v56.23 : exécuté dans la réserve à délai long (opération de fond) */
function sauvegarder(par, motif){ return (B && B.enTravail) ? B.enTravail(()=>sauvegarderInterne(par,motif)) : sauvegarderInterne(par,motif); }
async function sauvegarderInterne(par, motif){
  if (SAUVEGARDE_EN_COURS) await SAUVEGARDE_EN_COURS;
  let fin; SAUVEGARDE_EN_COURS = new Promise(r=>fin = r);
  try {
    const chiffrer = !!(CONFIG.sauvegarde||{}).chiffrer;
    /* 56.33.11 : nom unique même pour deux sauvegardes dans la même seconde (la sauvegarde de sécurité prise avant une
       restauration écrasait la sauvegarde à restaurer) */
    let base = "fiwakti-"+horodatage(), k = 1; const ext = B.extension+(chiffrer ? ".chiffre" : "");
    while (fs.existsSync(path.join(D_SAUV, base+(k > 1 ? "-"+k : "")+ext)) || fs.existsSync(path.join(D_SAUV, base+(k > 1 ? "-"+k : "")+ext+".json"))) k++;
    const nom = base+(k > 1 ? "-"+k : "")+ext, f = path.join(D_SAUV, nom);
    const brut = chiffrer ? path.join(os.tmpdir(), "fiwakti-export-"+crypto.randomBytes(6).toString("hex")+B.extension) : f;
    /* v56.30 : espace disque contrôlé avant de commencer — à 60 000 employés la base dépasse 4 Go ; export, fichier chiffré
       et copie de vérification demandent environ trois fois sa taille. Un disque plein arrêtait le serveur et laissait
       un export temporaire de plusieurs Go. */
    try { const taille = B.taille ? await B.taille() : (fs.existsSync(path.join(DONNEES, "fiwakti"+B.extension)) ? fs.statSync(path.join(DONNEES, "fiwakti"+B.extension)).size : 0);
      const libre = d => { try { const st = fs.statfsSync(d); return st.bavail * st.bsize; } catch(e){ return Infinity; } };
      const besoin = taille * (chiffrer ? 3 : 2) + 200e6, dispo = Math.min(libre(os.tmpdir()), libre(D_SAUV));
      if (taille && dispo < besoin){ const m = "espace disque insuffisant pour sauvegarder : "+Math.round(dispo/1e6)+" Mo libres, "+Math.round(besoin/1e6)+" Mo nécessaires";
        await alerte("sauvegarde", m); throw new Error(m); } } catch(e){ if (/espace disque/.test(e.message)) throw e; }
    /* v56.23 : empreintes des clés inscrites dans la sauvegarde elle-même (reprise sur un serveur vierge) */
    await meta("cles_empreintes", CF.inventaire());
    const attendus = {};
    for (const t of ["kv","enreg","comptes"]) attendus[t] = Number((await B.get("SELECT COUNT(*) n FROM "+t)).n);
    await AUDIT_FILE; let auditMaxSv = null; try { const am = await B.get("SELECT id, empreinte FROM audit ORDER BY id DESC LIMIT 1"); if (am) auditMaxSv = {id:Number(am.id), empreinte:am.empreinte || null}; } catch(e){}
    try { await B.exporter(brut);
      if (chiffrer) await CF.chiffrerFichier(brut, f, "sauvegarde"); }
    catch(e){ try { fs.unlinkSync(f); } catch(x){} throw e; }
    finally { if (chiffrer) try { fs.unlinkSync(brut); } catch(e){} }
    const man = {fichier:nom, cree:maintenant(), par:par||"automatique", motif:motif||"", version:VERSION, base:B.type, lignes:attendus, taille:fs.statSync(f).size, sha256:await sha256Fichier(f),
      /* v56.23 : empreintes des clés en service (aucune clé elle-même) : une restauration est refusée si une clé
         nécessaire aux données chiffrées manque ou diffère sur le serveur cible */
      cles:CF.inventaire(),
      /* correctif 18 : dernière entrée d'audit contenue dans la sauvegarde (reprise exacte à la restauration) */
      auditMax:auditMaxSv,
      chiffre:chiffrer, cle:chiffrer ? CF.empreinte("sauvegarde") : null};
    man.verification = await verifierFichier(f, man);
    man.verification.le = maintenant();
    fs.writeFileSync(f+".json", JSON.stringify(man, null, 2));
    man.copie = copierHorsServeur(f, man);
    if (man.copie) fs.writeFileSync(f+".json", JSON.stringify(man, null, 2));
    purgerSauvegardes();
    await audit(par, "sauvegarde", nom+" — "+(man.verification.ok ? "vérifiée" : "ÉCHEC de vérification : "+man.verification.motif));
    return man;
  } finally { SAUVEGARDE_EN_COURS = null; fin(); }
}
/* vérification : déchiffrement dans un fichier temporaire, puis restauration d'essai */
async function verifierFichier(f, man){
  if (!man.chiffre) return B.verifierExport(f, man.lignes);
  const tmp = path.join(os.tmpdir(), "fiwakti-verif-"+crypto.randomBytes(6).toString("hex")+B.extension);
  try { await CF.dechiffrerFichier(f, tmp, "sauvegarde"); return await B.verifierExport(tmp, man.lignes); }
  catch(e){ return {ok:false, motif:e.message}; }
  finally { try { fs.unlinkSync(tmp); } catch(e){} }
}
/* copie vers un second emplacement (disque réseau, autre disque) : une sauvegarde qui ne quitte pas la machine ne protège pas d'une panne de celle-ci */
function copierHorsServeur(f, man){
  const dest = String((CONFIG.sauvegarde||{}).copie||"").trim();
  if (!dest) return null;
  try {
    fs.mkdirSync(dest, {recursive:true});
    fs.copyFileSync(f, path.join(dest, path.basename(f)));
    fs.writeFileSync(path.join(dest, path.basename(f)+".json"), JSON.stringify(man, null, 2));
    const garder = Math.max(3, Number((CONFIG.sauvegarde||{}).retention) || 14);
    const l = fs.readdirSync(dest).filter(x=>/^fiwakti-.*\.json$/.test(x)).sort().reverse();
    l.slice(garder).forEach(x=>{ [x, x.replace(/\.json$/, "")].forEach(y=>{ try { fs.unlinkSync(path.join(dest, y)); } catch(e){} }); });
    return {ok:true, vers:dest, le:maintenant()};
  } catch(e){ journal("copie hors serveur : "+e.message); return {ok:false, vers:dest, motif:e.message, le:maintenant()}; }
}
function listeSauvegardes(){
  return fs.readdirSync(D_SAUV).filter(f=>/^fiwakti-.*\.json$/.test(f)).map(f=>{ try { return JSON.parse(fs.readFileSync(path.join(D_SAUV, f), "utf8")); } catch(e){ return null; } })
    .filter(Boolean).sort((a,b)=>a.cree < b.cree ? 1 : -1);
}
function purgerSauvegardes(){
  const garder = Math.max(3, Number((CONFIG.sauvegarde||{}).retention) || 14);
  /* 56.33.11 : les 3 dernières sauvegardes vérifiées sont toujours gardées, même au-delà de la rétention (avant : une
     suite de sauvegardes en échec pouvait faire supprimer la dernière sauvegarde restaurable) */
  const l = listeSauvegardes(), sures = new Set(l.filter(m=>m.verification && m.verification.ok).slice(0, 3).map(m=>m.fichier));
  l.slice(garder).filter(m=>!sures.has(m.fichier)).forEach(m=>{ ["", ".json"].forEach(x=>{ try { fs.unlinkSync(path.join(D_SAUV, m.fichier+x)); } catch(e){} }); });
}
/* v56.23 : exécuté dans la réserve à délai long (opération de fond) */
function restaurer(fichier, par){ return (B && B.enTravail) ? B.enTravail(()=>restaurerInterne(fichier,par)) : restaurerInterne(fichier,par); }
async function restaurerInterne(fichier, par){
  const f = path.join(D_SAUV, path.basename(fichier));
  if (!fs.existsSync(f) || !fs.existsSync(f+".json")) throw new Error("Sauvegarde introuvable.");
  const man = JSON.parse(fs.readFileSync(f+".json", "utf8"));
  if ((man.base || "sqlite") !== B.type) throw new Error("Cette sauvegarde vient d'une base "+(man.base||"sqlite")+" : elle ne se restaure pas sur la base actuelle ("+B.type+").");
  /* v56.23 : clés des données chiffrées (biométrie, médical, CV, secrets des appareils…) identiques à celles de la
     sauvegarde, sinon ces données seraient restaurées mais illisibles : importer d'abord le trousseau */
  if (man.cles && typeof man.cles === "object"){
    const manquantes = Object.keys(man.cles).filter(n=>n !== "sauvegarde" && CF.empreinteSiExiste(n) !== man.cles[n]);
    if (manquantes.length) throw new Error("Clé(s) de chiffrement absente(s) ou différente(s) sur ce serveur : "+manquantes.join(", ")+". Importez d'abord le trousseau de l'installation d'origine (État du système › Reprise après sinistre).");
  }
  /* v56.15 : une sauvegarde d'une version plus récente que le logiciel en place est refusée */
  const vNum = v => String(v||"0").split(".").map(Number).reduce((s, x, i)=>s + (x||0) * Math.pow(1000, 2 - i), 0);
  if (man.version && vNum(man.version) > vNum(VERSION)) throw new Error("Cette sauvegarde provient d'une version plus récente ("+man.version+") : mettez d'abord FIWAKTI à jour.");
  const v = await verifierFichier(f, man);
  if (!v.ok) throw new Error("Cette sauvegarde ne se relit pas correctement ("+v.motif+") : restauration refusée.");
  const securite = await sauvegarder(par, "avant restauration de "+man.fichier);
  /* correctif 20 : clôtures présentes avant la restauration, pour signaler celles que la sauvegarde ne contient pas */
  const clotAvant = ((await D.referentielLecture() || {}).clotures || []).filter(Boolean).map(c=>({id:c.id, du:c.du, jusqu:c.jusqu}));
  /* correctif 13 : les entrées d'audit postérieures à la sauvegarde restaurée ne sont plus effacées en silence. Elles sont
     copiées dans un fichier (journaux/audit-avant-restauration-*.jsonl), puis remises dans la base restaurée avec leurs
     sceaux si la chaîne continue (même installation) ; sinon elles restent dans ce fichier et la restauration le dit. */
  await AUDIT_FILE;
  const fAud = path.join(D_JOURN, "audit-avant-restauration-"+maintenant().replace(/[^0-9]/g, "")+".jsonl");
  const depuisSauv = ajoutJours(String(man.cree || "0000-00-00").slice(0, 10), -1);
  /* correctif 18 : extraction à partir de la dernière entrée de la sauvegarde (manifeste), sans filtre de date ; filtre
     de date seulement pour une sauvegarde ancienne sans cette information */
  const depuisId = man.auditMax && Number.isFinite(+man.auditMax.id) ? Math.max(0, +man.auditMax.id - 1) : null;
  { const out = fs.openSync(fAud, "w", 0o600); try { for (let dernier = depuisId === null ? 0 : depuisId; ; ){ const l = depuisId === null ? await B.all("SELECT id, ts, login, action, detail, ip, empreinte FROM audit WHERE id > ? AND ts >= ? ORDER BY id LIMIT 5000", dernier, depuisSauv) : await B.all("SELECT id, ts, login, action, detail, ip, empreinte FROM audit WHERE id > ? ORDER BY id LIMIT 5000", dernier); if (!l.length) break; fs.writeSync(out, l.map(r=>JSON.stringify(r)).join("\n")+"\n"); dernier = Number(l[l.length-1].id); } } finally { fs.closeSync(out); } }
  let source = f, tmp = null;
  if (man.chiffre){ tmp = path.join(os.tmpdir(), "fiwakti-rest-"+crypto.randomBytes(6).toString("hex")+B.extension); await CF.dechiffrerFichier(f, tmp, "sauvegarde"); source = tmp; }
  try { B = await B.restaurer(source); } finally { if (tmp) try { fs.unlinkSync(tmp); } catch(e){} }
  D = DONNEES_MOD.creer(B, PERIM);
  K.arreter(); K = CALCUL.creer(B, D, {base:CONFIG.base || null, dossier:DONNEES, app:path.join(APP, "app.js"), journal, config:()=>CONFIG});
  initPointeuses(); await chargerModules();
  const reprise = await reprendreAudit(fAud);
  await audit(par, "restauration", man.fichier+" (sauvegarde de sécurité : "+securite.fichier+") — "+reprise.texte);
  { const ids = new Set(((await D.referentielLecture() || {}).clotures || []).filter(Boolean).map(c=>c.id)), perdues = clotAvant.filter(c=>!ids.has(c.id));
    if (perdues.length) await audit(par, "cloture.annulee_par_restauration", perdues.map(c=>"du "+jjmmaaaa(c.du || c.jusqu)+" au "+jjmmaaaa(c.jusqu)).join(" ; ")+" — période(s) de nouveau ouverte(s) par la restauration de "+man.fichier); }
  try { const v = await verifierAudit(); fs.appendFileSync(path.join(D_JOURN, "ancrages-audit.log"), maintenant()+" "+(v.ok ? v.dernier+" "+v.n : "RESTAURATION "+JSON.stringify(v.rupture)+" REPRISE")+"\n"); } catch(e){}
  return {restauree:man.fichier, securite:securite.fichier, audit:reprise};
}

async function reprendreAudit(fAud){
  let l = []; try { l = fs.readFileSync(fAud, "utf8").split("\n").filter(Boolean).map(x=>JSON.parse(x)); } catch(e){}
  const der = await B.get("SELECT id, empreinte FROM audit ORDER BY id DESC LIMIT 1");
  const maxId = der ? Number(der.id) : 0;
  const lien = l.find(r=>Number(r.id) === maxId);
  const suite = l.filter(r=>Number(r.id) > maxId);
  if (!suite.length){ try { fs.unlinkSync(fAud); } catch(e){} return {remises:0, texte:"aucune entrée d'audit postérieure"}; }
  /* même chaîne : la dernière entrée restaurée est celle du fichier (même numéro, même sceau) */
  if ((maxId === 0 && !lien) || (lien && der && lien.empreinte === der.empreinte)){
    await B.transaction(async ()=>{ for (const r of suite) await B.run("INSERT INTO audit(id,ts,login,action,detail,ip,empreinte) VALUES(?,?,?,?,?,?,?)", Number(r.id), r.ts, r.login, r.action, r.detail, r.ip, r.empreinte); });
    if (B.type === "pg") try { await B.run("SELECT setval(pg_get_serial_sequence('audit','id'), (SELECT MAX(id) FROM audit) + 1, false)"); } catch(e){}
    try { fs.unlinkSync(fAud); } catch(e){}
    return {remises:suite.length, texte:suite.length+" entrée(s) d'audit postérieures à la sauvegarde remises (chaîne continue)"};
  }
  return {remises:0, conservees:suite.length, fichier:fAud, texte:suite.length+" entrée(s) d'audit postérieures conservées dans "+path.basename(fAud)+" (chaîne différente : sauvegarde d'une autre installation)"};
}
/* ---------------- mises à jour signées ---------------- */
async function appliquerMiseAJour(paquet, par){
  const p = JSON.parse(paquet);
  if (p.format !== "fiwakti-maj-1") throw new Error("Ce fichier n'est pas une mise à jour FIWAKTI.");
  const {signature, ...contenu} = p;
  if (!verifierSignature(JSON.stringify(contenu), signature)) throw new Error("Signature invalide : mise à jour refusée.");
  if (!/^\d+\.\d+\.\d+$/.test(contenu.version)) throw new Error("Numéro de version invalide.");
  const cible = path.join(RACINE, "versions", contenu.version);
  if (path.dirname(cible) !== path.join(RACINE, "versions")) throw new Error("Chemin de version refusé.");
  if (contenu.version === VERSION) throw new Error("Cette version est déjà installée.");
  /* 56.33.11 : pas de retour vers une version plus ancienne par un paquet (un ancien paquet signé rejoué sur une base
     déjà migrée) — le retour arrière passe par « revenir à la version précédente » ; paquet complet exigé */
  { const vN = v => String(v).split(".").map(Number).reduce((s, x, i)=>s + x * Math.pow(1000, 2-i), 0);
    if (vN(contenu.version) < vN(VERSION)) throw new Error("Version "+contenu.version+" plus ancienne que la version installée ("+VERSION+") : refusée.");
    const noms = Object.keys(contenu.fichiers || {}).map(n=>String(n).replace(/\\/g, "/"));
    if (!["serveur/principal.js", "serveur/version.json"].every(x=>noms.some(n=>n === x || n.endsWith("/"+x)))) throw new Error("Paquet incomplet (serveur/principal.js ou serveur/version.json absent) : refusé."); }
  /* v47 : compatibilité vérifiée avant toute installation (manifeste signé) */
  const vNum = v => String(v).split(".").map(Number).reduce((s, x, i)=>s + x * Math.pow(1000, 2-i), 0);
  if (contenu.nodeMin && vNum(process.versions.node) < vNum(contenu.nodeMin)) throw new Error("Cette mise à jour demande Node.js "+contenu.nodeMin+" ou plus (installé : "+process.versions.node+").");
  if (contenu.depuis && vNum(VERSION) < vNum(contenu.depuis)) throw new Error("Cette mise à jour s'installe à partir de la version "+contenu.depuis+" (installée : "+VERSION+") : installez d'abord la mise à jour intermédiaire.");
  if (contenu.bases && contenu.bases.indexOf(B.type) < 0) throw new Error("Cette mise à jour ne prend pas en charge la base "+B.type+".");
  /* correctif 18 : contenu vérifié (chemins, empreintes) AVANT la sauvegarde préalable — un paquet refusé déclenchait
     d'abord une sauvegarde complète */
  { const base = path.resolve(cible+".tmp");
    for (const [rel, info] of Object.entries(contenu.fichiers || {})){
      const dest = path.resolve(base, rel); if (!dest.startsWith(base+path.sep)) throw new Error("Chemin refusé : "+rel);
      if (!info || typeof info.b64 !== "string" || crypto.createHash("sha256").update(Buffer.from(info.b64, "base64")).digest("hex") !== info.sha256) throw new Error("Fichier altéré : "+rel); } }
  journalMaj("début "+VERSION+" → "+contenu.version+" par "+par);
  /* 56.33.11 : mise à jour seulement avec une sauvegarde préalable vérifiée (restaurable) */
  const manAv = await sauvegarder(par, "avant mise à jour vers "+contenu.version);
  if (!(manAv && manAv.verification && manAv.verification.ok)) throw new Error("Sauvegarde préalable non vérifiée : mise à jour annulée (voir Système › Sauvegardes).");
  const tmp = cible+".tmp";
  fs.rmSync(tmp, {recursive:true, force:true});
  for (const [rel, info] of Object.entries(contenu.fichiers)){
    const dest = path.resolve(tmp, rel);
    if (!dest.startsWith(path.resolve(tmp)+path.sep)) throw new Error("Chemin refusé : "+rel);
    const buf = Buffer.from(info.b64, "base64");
    if (crypto.createHash("sha256").update(buf).digest("hex") !== info.sha256) throw new Error("Fichier altéré : "+rel);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.writeFileSync(dest, buf);
  }
  fs.rmSync(cible, {recursive:true, force:true});
  fs.renameSync(tmp, cible);
  const V = path.join(RACINE, "versions");
  fs.writeFileSync(path.join(V, "precedente.txt"), VERSION+"\n");
  fs.writeFileSync(path.join(V, "essai.txt"), contenu.version+"\n");
  fs.writeFileSync(path.join(V, "actuelle.txt"), contenu.version+"\n");
  await audit(par, "mise_a_jour", VERSION+" → "+contenu.version);
  journalMaj("installée "+VERSION+" → "+contenu.version+" : redémarrage, contrôle de santé par le lanceur");
  return {de:VERSION, vers:contenu.version, notes:contenu.notes||""};
}
/* v56.31 (cahier § 4) : mise à jour CIBLÉE d'un seul module (format fiwakti-module-1, signé) — sans redémarrage ni
   redéploiement du socle : contrôle de la signature, du socle requis et des dépendances, sauvegarde des fichiers en
   place (retour arrière en un clic), remplacement des fichiers du module seul, rechargement à chaud. */
let instancierModule = function(x){ /* remplacé à l'initialisation (initPointeuses) */ };
function fichiersModule(id){ const V = path.join(RACINE, "versions", VERSION), out = [];
  const dA = path.join(V, "app", "modules", id); if (fs.existsSync(dA)) fs.readdirSync(dA).forEach(f=>out.push("app/modules/"+id+"/"+f));
  const dS = path.join(V, "serveur", "modules"); if (fs.existsSync(dS)) fs.readdirSync(dS).filter(f=>f === id+".json" || f.startsWith(id+".")).forEach(f=>out.push("serveur/modules/"+f));
  return out; }
async function rechargerModule(id){
  const V = path.join(RACINE, "versions", VERSION), fm = path.join(V, "serveur", "modules", id+".json");
  const man = JSON.parse(fs.readFileSync(fm, "utf8"));
  Object.keys(require.cache).forEach(k=>{ if (k.startsWith(path.join(V, "serveur", "modules", id+".")) || k.startsWith(path.join(V, "serveur", "modules", id+".serveur"))) delete require.cache[k]; });
  let x = MODS_SERVEUR.find(z=>z.id === id);
  if (man.serveur){ const mod = require(path.join(V, "serveur", "modules", man.serveur)); BD.ajouterModule(mod);
    for (const sql of ((mod.ddl||{})[B.type] || [])) try { await B.run(sql); } catch(e){ if (!/exists|existe/i.test(e.message)) journal("module "+id+" : schéma : "+e.message); }
    if (x){ x.mod = mod; x.routes = (man.routes||[]).filter(r=>MODULES.routeAdmise(r)); } else { x = {id, routes:(man.routes||[]).filter(r=>MODULES.routeAdmise(r)), mod, inst:null}; MODS_SERVEUR.push(x); }
    instancierModule(x); }
  await chargerModules(); CACHE_AT.clear();
  return man;
}
async function appliquerMajModule(paquet, par){
  const p = JSON.parse(paquet);
  if (p.format !== "fiwakti-module-1") throw new Error("Ce fichier n'est pas une mise à jour de module FIWAKTI.");
  const {signature, ...contenu} = p;
  if (!verifierSignature(JSON.stringify(contenu), signature)) throw new Error("Signature invalide : mise à jour de module refusée.");
  const id = String(contenu.module||""); if (!MODULES.ID_OK.test(id)) throw new Error("Identifiant de module invalide.");
  const vNum = v => String(v).split(".").map(Number).reduce((s, x, i)=>s + x * Math.pow(1000, 2-i), 0);
  if (contenu.socleMin && vNum(VERSION) < vNum(contenu.socleMin)) throw new Error("Ce module demande FIWAKTI "+contenu.socleMin+" ou plus (installé : "+VERSION+") : mettez d'abord à jour l'application.");
  if (contenu.socleMax && vNum(VERSION) > vNum(contenu.socleMax)) throw new Error("Ce module est prévu pour FIWAKTI "+contenu.socleMax+" au plus (installé : "+VERSION+").");
  const noms = Object.keys(contenu.fichiers||{}); if (!noms.length) throw new Error("Paquet vide.");
  const ok = n => n === "serveur/modules/"+id+".json" || n === "serveur/modules/"+id+".serveur.js" || new RegExp("^serveur/modules/"+id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")+"\\.[A-Za-z0-9-]+\\.js$").test(n) || new RegExp("^app/modules/"+id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")+"/[A-Za-z0-9._-]+$").test(n);
  const refuse = noms.filter(n=>!ok(n)); if (refuse.length) throw new Error("Fichier hors du module "+id+" refusé : "+refuse[0]);
  if (!contenu.fichiers["serveur/modules/"+id+".json"]) throw new Error("Manifeste du module absent.");
  const man = JSON.parse(Buffer.from(contenu.fichiers["serveur/modules/"+id+".json"].b64, "base64").toString("utf8"));
  if (man.id !== id) throw new Error("Le manifeste ne correspond pas au module "+id+".");
  const connus = new Set(MOD ? MOD.liste().filter(m=>m.implemente || m.socle).map(m=>m.id) : []); connus.add(id);
  const manquantes = (man.deps||[]).filter(d=>!connus.has(d)); if (manquantes.length) throw new Error("Dépendance absente : "+manquantes.join(", ")+" — installez-la d'abord.");
  const V = path.join(RACINE, "versions", VERSION), avant = (MOD ? MOD.liste().find(m=>m.id === id) : null), versionAvant = avant && avant.version || "";
  journalMaj("module "+id+" "+(versionAvant||"—")+" → "+(man.version||"?")+" par "+par);
  /* sauvegarde des fichiers en place (retour arrière) */
  const dP = path.join(V, "modules-precedents", id); fs.rmSync(dP, {recursive:true, force:true}); fs.mkdirSync(dP, {recursive:true});
  const presents = fichiersModule(id); presents.forEach(rel=>{ const dst = path.join(dP, rel); fs.mkdirSync(path.dirname(dst), {recursive:true}); fs.copyFileSync(path.join(V, rel), dst); });
  fs.writeFileSync(path.join(dP, "precedent.json"), JSON.stringify({version:versionAvant, fichiers:presents, le:maintenant()}));
  /* écriture : fichiers vérifiés puis déposés ; fichiers de l'ancienne version absents du paquet retirés */
  const ecrits = [];
  for (const [rel, info] of Object.entries(contenu.fichiers)){ const buf = Buffer.from(info.b64, "base64");
    if (crypto.createHash("sha256").update(buf).digest("hex") !== info.sha256) throw new Error("Fichier altéré : "+rel);
    const dest = path.resolve(V, rel); if (!dest.startsWith(path.resolve(V)+path.sep)) throw new Error("Chemin refusé : "+rel);
    fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.writeFileSync(dest+".tmp", buf); ecrits.push([dest+".tmp", dest]); }
  ecrits.forEach(([t, d])=>fs.renameSync(t, d));
  presents.filter(rel=>!contenu.fichiers[rel]).forEach(rel=>{ try { fs.unlinkSync(path.join(V, rel)); } catch(e){} });
  try { await rechargerModule(id); }
  catch(e){ journalMaj("module "+id+" : rechargement en échec ("+e.message+") : retour aux fichiers précédents"); await retourModule(id, par, true); throw new Error("Module refusé au chargement : "+e.message+" (fichiers précédents remis en place)."); }
  await audit(par, "mise_a_jour.module", id+" "+(versionAvant||"—")+" → "+(man.version||"?")+(contenu.notes ? " — "+String(contenu.notes).slice(0, 120) : ""));
  journalMaj("module "+id+" installé : "+(man.version||"?"));
  return {module:id, de:versionAvant, vers:man.version||"", notes:contenu.notes||"", redemarrage:false};
}
async function retourModule(id, par, silencieux){
  const V = path.join(RACINE, "versions", VERSION), dP = path.join(V, "modules-precedents", id), fp = path.join(dP, "precedent.json");
  if (!fs.existsSync(fp)) throw new Error("Aucune version précédente de ce module.");
  const prec = JSON.parse(fs.readFileSync(fp, "utf8"));
  fichiersModule(id).forEach(rel=>{ try { fs.unlinkSync(path.join(V, rel)); } catch(e){} });
  prec.fichiers.forEach(rel=>{ const dst = path.join(V, rel); fs.mkdirSync(path.dirname(dst), {recursive:true}); fs.copyFileSync(path.join(dP, rel), dst); });
  fs.unlinkSync(fp);
  if (prec.fichiers.length) await rechargerModule(id); else { MOD && MOD.charger && await chargerModules(); }
  if (!silencieux){ await audit(par, "mise_a_jour.module.retour", id+" → "+(prec.version||"retiré")); journalMaj("module "+id+" : retour à "+(prec.version||"version retirée")); }
  return {module:id, vers:prec.version||""};
}
/* journal des mises à jour, hors de la base (lisible même si la base ne démarre plus) */
function journalMaj(m){ try { const f = path.join(D_JOURN, "mises-a-jour.log"); tourner(f); fs.appendFileSync(f, maintenant()+" "+m+"\n"); } catch(e){} }
function versionsInstallees(){ const V = path.join(RACINE, "versions"); try { return fs.readdirSync(V).filter(d=>fs.existsSync(path.join(V, d, "serveur", "principal.js"))); } catch(e){ return []; } }
setTimeout(()=>{ try { const f = path.join(RACINE, "versions", "essai.txt"); if (fs.existsSync(f) && fs.readFileSync(f, "utf8").trim() === VERSION) fs.unlinkSync(f); } catch(e){} }, 90000);

/* ---------------- contrôles et état du système ---------------- */
function espaceDisque(){ try { const s = fs.statfsSync(DONNEES); return {libre:s.bavail*s.bsize, total:s.blocks*s.bsize}; } catch(e){ return null; } }
function infoCertificat(){
  const c = certificat(); if (!c) return null;
  try { const x = c.cert ? new crypto.X509Certificate(c.cert) : null; return x ? {sujet:x.subject, fin:new Date(x.validTo).toISOString(), autoSigne:x.issuer === x.subject} : {pfx:true}; }
  catch(e){ return {erreur:e.message}; }
}
async function testerPg(url){
  try { const b = await BD.ouvrir({type:"pg", url}, DONNEES); const v = await b.get("SELECT version() v"); await b.fermer(); return {ok:true, version:String(v.v).split(" on ")[0]}; }
  catch(e){ return {ok:false, motif:e.code === "ECONNREFUSED" ? "PostgreSQL ne répond pas à cette adresse (service arrêté ou port fermé)." : e.code === "28P01" ? "Utilisateur ou mot de passe PostgreSQL refusé." : e.code === "3D000" ? "Cette base n'existe pas sur le serveur PostgreSQL." : e.message}; }
}
async function controles(){
  const l = [];
  const ajout = (id, etat, titre, detail, solution) => l.push({id, etat, titre, detail:detail||"", solution:solution||""});
  const [maj, min] = process.versions.node.split(".").map(Number);
  /* versions LTS : 22 (à partir de 22.13) et 24 ; une version impaire (non LTS) est déconseillée */
  const lts = (maj === 22 && min >= 13) || (maj >= 24 && maj % 2 === 0);
  ajout("node", lts ? "ok" : (maj > 22 ? "verifier" : "bloquant"), "Moteur Node.js "+process.versions.node+(lts ? " (LTS)" : ""), maj > 22 && !lts ? "Version non LTS : non recommandée en production." : "", "Installer Node.js 22 LTS (22.13 ou plus récent) ou 24 LTS.");
  try { const t = path.join(DONNEES, ".essai"); fs.writeFileSync(t, "x"); fs.unlinkSync(t); ajout("ecriture", "ok", "Dossier des données accessible en écriture", DONNEES); }
  catch(e){ ajout("ecriture", "bloquant", "Impossible d'écrire dans le dossier des données", DONNEES, "Donner au service FIWAKTI les droits d'écriture sur ce dossier."); }
  try { await B.get("SELECT 1 AS un"); ajout("base", "ok", "Base de données opérationnelle", B.type === "pg" ? "PostgreSQL" : "SQLite intégré (poste unique)"); }
  catch(e){ ajout("base", "bloquant", "Base de données inaccessible", e.message, B.type === "pg" ? "Vérifier que PostgreSQL est démarré et que l'adresse est juste." : "Vérifier les droits sur le dossier des données."); }
  if (B.type !== "pg") ajout("pg", "verifier", "Base intégrée", "Adaptée à un poste unique ou à quelques centaines d'employés.", "Au-delà, choisir PostgreSQL (étape suivante de l'assistant, ou État du système une fois installé).");
  const d = espaceDisque();
  if (d){ const go = d.libre/1e9; ajout("disque", go >= 5 ? "ok" : go >= 1 ? "verifier" : "bloquant", "Espace disque libre : "+go.toFixed(1)+" Go", "", go < 5 ? "Prévoir de l'espace : les sauvegardes quotidiennes en ont besoin." : ""); }
  const ci = infoCertificat();
  if (!ci) ajout("https", LOCAL_SEUL ? "verifier" : "bloquant", "HTTPS non actif", "Sans certificat, FIWAKTI n'accepte que les connexions de ce poste.", "Relancer l'installateur ou déposer un certificat dans donnees/certificats (cert.pem et cle.pem), ou placer FIWAKTI derrière un proxy HTTPS sur ce serveur.");
  else if (ci.erreur) ajout("https", "bloquant", "Certificat illisible", ci.erreur, "Remplacer le certificat.");
  else if (ci.fin && ci.fin < maintenant()) ajout("https", "bloquant", "Certificat expiré le "+ci.fin.slice(0,10), "", "Renouveler le certificat.");
  else ajout("https", ci.autoSigne ? "verifier" : "ok", "HTTPS actif"+(ci.fin ? " jusqu'au "+ci.fin.slice(0,10) : ""), ci.autoSigne ? "Certificat auto-signé : le navigateur affichera un avertissement." : "", ci.autoSigne ? "Pour un usage en réseau, installer un certificat émis par votre autorité interne." : "");
  const an = new Date().getFullYear();
  ajout("heure", an >= 2024 && an < 2100 ? "ok" : "bloquant", "Heure du serveur : "+new Date().toLocaleString("fr-FR"), "", "Régler l'horloge du serveur (les pointages en dépendent).");
  try { const t = path.join(D_SAUV, ".essai"); fs.writeFileSync(t, "x"); fs.unlinkSync(t); ajout("sauvegarde", "ok", "Sauvegardes possibles", D_SAUV); }
  catch(e){ ajout("sauvegarde", "bloquant", "Sauvegardes impossibles", D_SAUV, "Donner les droits d'écriture sur ce dossier."); }
  return l;
}
let AUDIT_CACHE = null;
async function auditEtat(){ if (!AUDIT_CACHE || Date.now() - AUDIT_CACHE.t > 600000) AUDIT_CACHE = {t:Date.now(), v:await verifierAudit()}; return AUDIT_CACHE.v; }
/* conservation : purge des données anciennes, jamais sur une période non clôturée */
async function conservation(simuler){
  const cfg = CONFIG.conservation || {}, ref = await D.referentielLecture() || {};
  const clot = (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, "");
  const limite = ans => { const d = new Date(); d.setFullYear(d.getFullYear() - (Number(ans)||5)); return d.toISOString().slice(0,10); };
  /* correctif 13 : l'audit applicatif n'est jamais purgé au-delà de la dernière clôture (comme l'annonce l'état du
     système) ; sans aucune clôture, rien n'est purgé (« jamais sur une période non clôturée ») */
  const lb = clot ? [limite(cfg.badgeagesAns), clot].sort()[0] : "0000", la = clot ? [limite(cfg.auditAns), clot].sort()[0] : "0000";
  /* correctif 16 : journal des événements conservé comme l'audit (même durée, jamais au-delà de la dernière clôture) */
  const lj = clot ? [limite(cfg.journalAns || cfg.auditAns), clot].sort()[0] : "0000";
  const lc = ajoutJours(aujourdhui(), -(Number(cfg.calculsJours)||400));
  const n = {badgeages:0, absences:0, corrections:0, auditApp:0, journal:0, calculs:0};
  const compte = async (sql, ...a) => Number((await B.get("SELECT COUNT(*) n FROM "+sql, ...a)).n);
  n.badgeages = await compte("enreg WHERE coll='ptg' AND d < ?", lb);
  n.absences = await compte("enreg WHERE coll='abs' AND d < ?", lb);
  n.corrections = await compte("enreg WHERE coll='corrections' AND d < ?", lb);
  n.auditApp = await compte("enreg WHERE coll='audit' AND d < ?", la);
  n.journal = await compte("enreg WHERE coll='journal' AND d < ?", lj);
  n.calculs = await compte("calc_jour WHERE d < ?", lc);
  if (!simuler && (n.badgeages + n.absences + n.corrections + n.auditApp + n.journal + n.calculs)){
    await B.transaction(async ()=>{
      await B.run("DELETE FROM enreg WHERE coll IN ('ptg','abs','corrections') AND d < ?", lb);
      await B.run("DELETE FROM enreg WHERE coll='audit' AND d < ?", la);
      await B.run("DELETE FROM enreg WHERE coll='journal' AND d < ?", lj);
      await B.run("DELETE FROM calc_jour WHERE d < ?", lc);
    });
    await meta("purge", {le:maintenant(), n, avant:{badgeages:lb, audit:la, journal:lj}});
    await audit("conservation", "donnees.purgees", JSON.stringify(n)+" (avant "+lb+")");
  }
  return {n, limites:{badgeages:lb, audit:la, journal:lj, calculs:lc}, derniereCloture:clot || null};
}
async function etatSysteme(){
  const sauv = listeSauvegardes(), der = sauv[0];
  const lic = await licenceActive(), d = espaceDisque(), ci = infoCertificat(); await licenceEtat();
  const st = await D.statistiques(), taille = await B.taille();
  /* 56.33.11 : comptage mémorisé 5 min (plusieurs millions de journées calculées) */
  if (!NB_CALC || NB_CALC.B !== B || Date.now() - NB_CALC.t > 300000) NB_CALC = {B, t:Date.now(), n:Number((await B.get("SELECT COUNT(*) n FROM calc_jour")).n)};
  const nbCalc = NB_CALC.n;
  const it = (id, etat, titre, detail) => ({id, etat, titre, detail:detail||""});
  const lire = f => { try { return fs.readFileSync(path.join(RACINE, "versions", f), "utf8").trim(); } catch(e){ return ""; } };
  return {
    version:VERSION, versions:versionsInstallees(), precedente:lire("precedente.txt"), mode:"serveur", base:B.type, demarre:DEMARRE, empreinte:empreinteMachine(),
    elements:[
      it("app", "ok", "Application", "FIWAKTI "+VERSION),
      it("api", "ok", "Serveur", "actif depuis "+new Date(DEMARRE).toLocaleString("fr-FR")),
      it("base", B.type === "pg" ? "ok" : ((st.emps||0) > 500 ? "verifier" : "ok"), "Base de données",
        (B.type === "pg" ? "PostgreSQL" : "SQLite intégré")+" — "+(taille/1e6).toFixed(0)+" Mo — "+(st.emps||0)+" employés, "+(st.ptg||0)+" badgeages"+(st.ptgDu ? " ("+st.ptgDu+" → "+st.ptgAu+")" : "")+
        (B.type !== "pg" && (st.emps||0) > 500 ? " — PostgreSQL recommandé pour cet effectif : bouton « Passer à PostgreSQL » ci-dessous (copie contrôlée, sans perte)" : "")),
      it("calcul", "ok", "Calculs du serveur", nbCalc+" journées calculées d'avance"),
      await (async ()=>{ const refA = await D.referentielLecture() || {};
        const sans = (refA.profils||[]).filter(pr=>((pr.droits||{}).SYS === "config" || pr.admin) && !pr.a2f).map(pr=>pr.nom || pr.id);
        return it("a2f-admin", sans.length ? "verifier" : "ok", "Double authentification des administrateurs",
          sans.length ? "Non exigée pour : "+sans.join(", ")+". Recommandé : Profils → cocher « Double authentification »." : "Exigée pour tous les profils d'administration."); })(),
      await (async ()=>{
        /* v56.2 : stockage des grands volumes */
        if (B.type !== "pg"){ const ne = Number((await B.get("SELECT COUNT(*) n FROM enreg WHERE coll='emps'")).n);
          return it("partitions", ne > 2000 ? "verifier" : "ok", "Stockage des grands volumes", ne > 2000 ? "Base intégrée avec "+ne+" salariés : PostgreSQL est recommandé au-delà de 2 000 salariés (partitionnement mensuel)." : "Base intégrée (partitionnement réservé à PostgreSQL, recommandé au-delà de 2 000 salariés)."); }
        const pa = await B.partitions(0, 0), def = await B.lignesParDefaut();
        const horsPlage = ["calc_jour","day_transitions","normalized_events"].reduce((s, t)=>s + (def[t]||0), 0);
        if (!pa.tables.length) return it("partitions", "verifier", "Partitionnement mensuel", "Installation antérieure à la v56.2 : tables non partitionnées — migration disponible dans État du système (bouton « Migrer maintenant »).");
        return it("partitions", horsPlage ? "verifier" : "ok", "Partitionnement mensuel", pa.tables.length+" tables partitionnées par mois"+(horsPlage ? " ; "+horsPlage+" ligne(s) hors plage dans les partitions par défaut" : " ; aucune ligne hors plage")); })(),
      it("moteur-source", "ok", "Source des badgeages du moteur", CONFIG.moteurSource === "normalise" ? "événements normalisés (niveau 2)" : "projection de compatibilité (identique aux événements normalisés tant que la comparaison est sans écart)"),
      await (async ()=>{ const g = await ING.etat(); const err = (g.file.erreur||{}).evenements || 0, rev = g.statuts.PENDING_REVIEW || 0;
        return it("ingestion", err ? "bloquant" : (rev || g.pause ? "verifier" : "ok"), "Ingestion des pointages",
          g.bruts+" événements bruts conservés, "+g.retransmissions+" retransmissions identifiées ; file : "+g.enAttente+"/"+g.capacite+(err ? " ; "+err+" en erreur (reprise automatique)" : "")+
          (rev ? " ; "+rev+" en attente de revue (identifiant inconnu)" : "")+(g.migration && g.migration.etat === "en_cours" ? " ; migration v49 : "+g.migration.faits+"/"+g.migration.total : "")+(g.pause ? " ; NORMALISATION SUSPENDUE" : "")); })(),
      ci && !ci.erreur ? it("https", ci.autoSigne ? "verifier" : "ok", "HTTPS", ci.fin ? "certificat valable jusqu'au "+ci.fin.slice(0,10)+(ci.autoSigne ? " (auto-signé)" : "") : "actif")
         : it("https", "bloquant", "HTTPS", "absent : FIWAKTI n'écoute que sur ce poste (127.0.0.1) tant qu'aucun certificat n'est installé"),
      !der ? it("sauvegarde", "verifier", "Sauvegarde", "aucune sauvegarde pour l'instant")
        : it("sauvegarde", der.verification && der.verification.ok ? (der.cree.slice(0,10) >= ajoutJours(aujourdhui(), -2) ? "ok" : "verifier") : "bloquant", "Sauvegarde",
          "dernière : "+new Date(der.cree).toLocaleString("fr-FR")+" — "+(der.verification && der.verification.ok ? "restauration d'essai réussie" : "vérification en échec")),
      lic ? (()=>{ const LP = licencePublique(LIC_CACHE.v) || {}, ET = {active:["ok", "active"], bientot:["verifier", "expire bientôt"], grace:["verifier", "période de grâce"], lecture:["bloquant", "consultation seule"], bloquee:["bloquant", "bloquée"], pas_commencee:["bloquant", "pas encore en vigueur"]}[LP.etat] || ["ok", "active"];
        return it("licence", ET[0], "Licence", lic.client+" — modules "+(lic.modules||(lic.fw||[]).join(", "))+" — "+ET[1]+(LP.fin ? " — du "+(LP.debut||"—")+" au "+LP.fin+(LP.joursRestants >= 0 ? " ("+LP.joursRestants+" j)" : "")+" — série "+LP.serie : " — sans échéance")); })() : it("licence", "bloquant", "Licence", "aucune licence valide"),
      d ? it("disque", d.libre/d.total > 0.15 ? "ok" : "verifier", "Stockage", Math.round(100*d.libre/d.total)+" % disponible ("+(d.libre/1e9).toFixed(1)+" Go)") : it("disque", "verifier", "Stockage", "inconnu"),
      it("terminaux", "verifier", "Service des terminaux", "test de liaison réseau disponible ; collecte par SDK constructeur non installée"),
      await (async ()=>{ const v = await auditEtat(); return it("audit", v.ok ? "ok" : "bloquant", "Journal d'audit",
        v.ok ? v.n+" entrées scellées, chaîne intègre"+(v.anciens ? " ("+v.anciens+" antérieures au scellement)" : "") : (v.rupture.id ? "CHAÎNE ROMPUE à l'entrée "+v.rupture.id+" ("+v.rupture.ts+")"+(v.rupture.motif ? " — "+v.rupture.motif : "")+" : modification directe de la base" : "JOURNAL INCOMPLET : "+(v.rupture.motif || "entrées supprimées"))); })(),
      it("chiffrement", (CONFIG.sauvegarde||{}).chiffrer ? "ok" : "verifier", "Chiffrement au repos",
        ((CONFIG.sauvegarde||{}).chiffrer ? "sauvegardes chiffrées (clé "+CF.empreinte("sauvegarde")+")" : "sauvegardes NON chiffrées")+" ; accès des pointeuses chiffrés"),
      (()=>{ const c = der && der.copie; const dest = (CONFIG.sauvegarde||{}).copie;
        return !dest ? it("copie", "verifier", "Copie hors serveur", "non configurée : une panne du serveur emporterait les sauvegardes")
          : it("copie", c && c.ok ? "ok" : "bloquant", "Copie hors serveur", c ? (c.ok ? "dernière copie vers "+c.vers+" le "+new Date(c.le).toLocaleString("fr-FR") : "échec : "+c.motif) : "en attente de la prochaine sauvegarde"); })(),
      it("push", (CONFIG.pushReseaux||[]).length || PT.pushRestreint() ? "ok" : "verifier", "Pointeuses en mode Push",
        "acceptées seulement depuis l'adresse IP déclarée de chaque appareil"+((CONFIG.pushReseaux||[]).length ? " ou les réseaux "+CONFIG.pushReseaux.join(", ") : "")),
      await (async ()=>{ const a = ((await meta("alertes")) || []).filter(x=>x.le >= new Date(Date.now()-86400000).toISOString());
        return it("alertes", a.length ? "bloquant" : "ok", "Alertes de sécurité (24 h)", a.length ? a.length+" alerte(s) : "+a[0].detail : "aucune"); })(),
      it("auditExterne", (CONFIG.syslog && CONFIG.syslog.hote) || CONFIG.auditExterne ? "ok" : "verifier", "Audit hors serveur",
        [(CONFIG.syslog && CONFIG.syslog.hote) ? "syslog "+CONFIG.syslog.protocole+" vers "+CONFIG.syslog.hote+":"+CONFIG.syslog.port : "", CONFIG.auditExterne ? "export quotidien vers "+CONFIG.auditExterne : ""].filter(Boolean).join(" ; ") || "non configuré : l'audit n'existe que sur ce serveur"),
      it("conservation", "ok", "Conservation des données", "badgeages "+CONFIG.conservation.badgeagesAns+" ans, audit "+CONFIG.conservation.auditAns+" ans, journal des événements "+(CONFIG.conservation.journalAns || CONFIG.conservation.auditAns)+" ans (jamais avant la dernière clôture)"+
        (await meta("purge") ? " — dernière purge "+new Date((await meta("purge")).le).toLocaleString("fr-FR") : ""))
    ],
    sauvegardes:sauv.slice(0, 20), sessions:Number((await B.get("SELECT COUNT(*) n FROM sessions")).n)
  };
}

/* v54 : alerte quand une pointeuse change de statut (hors ligne, dégradée, de nouveau en ligne) */
async function alertesSupervision(l){
  const avant = (await meta("supervision_statuts")) || {}, apres = {};
  for (const x of l){ apres[x.id] = x.statut;
    if (avant[x.id] && avant[x.id] !== x.statut) await alerte("pointeuse."+x.statut.toLowerCase(), (x.nom||x.id)+" : "+avant[x.id]+" → "+x.statut+(x.motif ? " ("+x.motif+")" : "")); }
  await meta("supervision_statuts", apres);
}
/* ---------------- travaux en arrière-plan (v49) ----------------
   Un export lourd ne bloque plus une requête : il devient un travail suivi (avancement, erreur,
   fichier à télécharger pendant 24 h), exécuté par le fil de calcul. */
const D_TRAV = path.join(DONNEES, "travaux");
fs.mkdirSync(D_TRAV, {recursive:true});
const TRAVAUX = new Map();
try { JSON.parse(fs.readFileSync(path.join(D_TRAV, "index.json"), "utf8")).forEach(x=>{ if (x.etat === "en_cours" || x.etat === "attente"){ x.etat = "erreur"; x.motif = "interrompu par un redémarrage du serveur"; } TRAVAUX.set(x.id, x); }); } catch(e){}
function sauverTravaux(){ try { fs.writeFileSync(path.join(D_TRAV, "index.json"), JSON.stringify(Array.from(TRAVAUX.values()))); } catch(e){} }
function lancerTravail(login, type, params){
  const enCours = Array.from(TRAVAUX.values()).filter(x=>x.login === login && (x.etat === "en_cours" || x.etat === "attente")).length;
  if (enCours >= 2) throw Object.assign(new Error("Deux travaux sont déjà en cours pour vous : attendez leur fin."), {code:429});
  const id = crypto.randomBytes(8).toString("hex");
  /* correctif 14 : un aperçu (grand effectif) n'est pas un fichier à télécharger : absent de la liste, gardé 1 h */
  const tr = {id, login, type, titre:params.titre || type, cree:maintenant(), etat:"attente", progression:0, apercu:!!params.apercu || undefined, expire:new Date(Date.now()+(params.apercu ? 3600000 : 24*3600000)).toISOString()};
  TRAVAUX.set(id, tr); sauverTravaux();
  /* v56.23 : un travail de fond utilise la réserve de connexions à délai long (jamais coupé par le délai des requêtes) */
  B.enTravail(async ()=>{
    tr.etat = "en_cours"; const t0 = Date.now();
    try {
      const txt = await K.etat(login, params.etat, params.du, params.au, params.filtres || {}, a=>{ tr.progression = a.total ? Math.round(100*a.fait/a.total) : 0; }, params.format, params.lang);
      fs.writeFileSync(path.join(D_TRAV, id+".csv"), txt, {mode:0o600});
      /* correctif 13 : format « blocs » (JSON, un bloc par salarié) : Excel, impression et aperçu gardent la structure de l'état */
      let nl = 0; if (/^blocs/.test(params.format || "")){ try { nl = JSON.parse(txt).blocs.length; } catch(e){} } else nl = txt.split("\r\n").length - 1;
      Object.assign(tr, {etat:"termine", progression:100, taille:Buffer.byteLength(txt), lignes:nl, format:params.format || "csv", dureeMs:Date.now()-t0, fini:maintenant()});
      await audit(login, "travail.termine", tr.titre+" — "+tr.lignes+" lignes en "+Math.round(tr.dureeMs/1000)+" s");
    } catch(e){ Object.assign(tr, {etat:"erreur", motif:e.message, fini:maintenant()}); journal("travail "+id+" : "+e.message); }
    sauverTravaux();
  });
  return tr;
}
function purgerTravaux(){
  const n = new Date().toISOString();
  TRAVAUX.forEach((x, id)=>{ if (x.expire < n){ try { fs.unlinkSync(path.join(D_TRAV, id+".csv")); } catch(e){} TRAVAUX.delete(id); } });
  sauverTravaux();
}

/* ---------------- HTTP ---------------- */
const DEMARRE = Date.now();
let SECURISE = false, LOCAL_SEUL = false, JETON_INSTALL = "", GERER_PUSH = ()=>{};
const estLocal = req => /^(127\.|::1$|::ffff:127\.)/.test(ipDe(req));
/* 56.33.11 : une requête relayée par un proxy inverse placé sur ce serveur arrive de 127.0.0.1 : elle n'est « locale »
   que si aucun en-tête de proxy n'est présent (assistant d'installation, compte administrateur provisoire) */
const estLocalDirect = req => estLocal(req) && !req.headers["x-forwarded-for"] && !req.headers["forwarded"] && !req.headers["x-real-ip"] && !req.headers["x-forwarded-host"];
/* 56.33.11 : avant installation, seuls les noms de cette machine sont acceptés (protection contre le rebinding DNS) */
function hoteInstallationOk(req){
  const brut = String(req.headers.host||"").toLowerCase(), v6 = /^\[([^\]]+)\](:\d+)?$/.exec(brut);
  const h = v6 ? v6[1] : brut.replace(/:\d+$/, "");
  if (!h) return true;
  const ok = new Set(["localhost", "127.0.0.1", "::1", os.hostname().toLowerCase()].concat(CONFIG.nomsHote || []));
  Object.values(os.networkInterfaces()).flat().forEach(i=>{ if (i && i.address) ok.add(String(i.address).toLowerCase()); });
  return ok.has(h) || /\.localhost$/.test(h) || h.startsWith(os.hostname().toLowerCase()+".");
}
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8"};
function entetes(res, api){
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"); res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (SECURISE) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  if (api) res.setHeader("Cache-Control", "no-store");
}
/* v49 : réponses volumineuses compressées (gzip) quand le navigateur l'accepte : ~8 fois moins de volume réseau */
const zlibM = require("zlib"), CACHE_DONNEES = new Map();
function envoyer(res, code, type, texte){
  if (res.headersSent || res.writableEnded) return;
  entetes(res, true);
  const req = res.req, buf = Buffer.from(texte, "utf8");
  if (buf.length > 32768 && req && /\bgzip\b/.test(String(req.headers["accept-encoding"]||""))){
    /* v56.15 : compression asynchrone (réserve de fils de libuv) : la boucle d'événements n'est jamais bloquée */
    return zlibM.gzip(buf, {level:5}, (e, z)=>{
      if (res.headersSent || res.writableEnded) return;
      if (e){ res.writeHead(code, {"Content-Type":type}); return res.end(buf); }
      res.writeHead(code, {"Content-Type":type, "Content-Encoding":"gzip", "Vary":"Accept-Encoding", "Content-Length":z.length}); res.end(z);
    });
  }
  res.writeHead(code, {"Content-Type":type}); res.end(buf);
}
let BASCULE = null;
function json(res, code, o){ envoyer(res, code, "application/json; charset=utf-8", JSON.stringify(o)); }
function texteJson(res, texte){ envoyer(res, 200, "application/json; charset=utf-8", texte); }
/* v56.30 (§ 7.3) : toute erreur 5xx porte une référence courte (« Réf. E-7F3A ») retrouvable dans le journal du serveur,
   le problème, l'impact et l'action recommandée ; jamais de détail technique ni de secret côté écran */
const DERNIERES_ERREURS = [];
function refErreur(){ return "E-"+crypto.randomBytes(2).toString("hex").toUpperCase(); }
function erreur(res, code, message, extra){
  const o = Object.assign({erreur:message, message:message}, extra||{});
  if (code >= 500 && !o.ref){ o.ref = refErreur(); o.message = message+" (Réf. "+o.ref+")"; o.erreur = o.message;
    journal("réf. "+o.ref+" — "+code+" — "+message); DERNIERES_ERREURS.unshift({ref:o.ref, code, message, le:new Date().toISOString()}); DERNIERES_ERREURS.length = Math.min(DERNIERES_ERREURS.length, 20); }
  json(res, code, o); }
function redirige(res, url){ entetes(res); res.writeHead(302, {Location:url}); res.end(); }
function corps(req, max){
  return new Promise((ok, ko)=>{
    let n = 0; const parts = [];
    req.on("data", c=>{ n += c.length; if (n > max){ ko(new Error("trop volumineux")); req.destroy(); } else parts.push(c); });
    req.on("end", ()=>ok(Buffer.concat(parts).toString("utf8"))); req.on("error", ko);
  });
}
async function corpsJson(req, max){ const t = await corps(req, max || 1e6); let v; try { v = t ? JSON.parse(t) : {}; } catch(e){ throw new Error("JSON invalide"); } return v && typeof v === "object" ? v : {}; }
/* v56.14 : fichiers de l'application compressés une fois (Brotli, sinon gzip) et gardés en mémoire, avec empreinte
   (ETag) : un navigateur qui a déjà la bonne version reçoit « 304 Non modifié » au lieu de re-télécharger ~1,6 Mo.
   Les pages HTML restent « no-store » ; les scripts et styles sont revalidés à chaque visite (no-cache + ETag). */
const STATIQUE = new Map(), CACHE_AT = new Map();
function statiquePrepare(f, st, buf){
  const ext = path.extname(f), comp = /\.(js|css|html|json|svg|md|txt)$/.test(ext) && buf.length > 1024;
  const e = {mtime:st.mtimeMs, taille:st.size, buf, etag:'"'+crypto.createHash("sha1").update(buf).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 20)+'"', br:null, gz:null};
  if (comp){ e.br = zlibM.brotliCompressSync(buf, {params:{[zlibM.constants.BROTLI_PARAM_QUALITY]:9, [zlibM.constants.BROTLI_PARAM_SIZE_HINT]:buf.length}}); e.gz = zlibM.gzipSync(buf, {level:9}); }
  STATIQUE.set(f, e); return e;
}
function fichierStatique(res, base, rel){
  const f = path.resolve(base, "."+path.posix.normalize("/"+rel));
  if (!f.startsWith(path.resolve(base))) return erreur(res, 403, "Refusé");
  fs.stat(f, (es, st)=>{
    if (es || !st.isFile()) return erreur(res, 404, "Introuvable");
    const servir = e => {
      entetes(res);
      const req = res.req, html = /\.html$/.test(f), h = {"Content-Type":TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control":html ? "no-store" : "no-cache", "Vary":"Accept-Encoding"};
      if (!html){ h.ETag = e.etag; if (req && String(req.headers["if-none-match"]||"") === e.etag){ res.writeHead(304, {"ETag":e.etag, "Cache-Control":h["Cache-Control"]}); return res.end(); } }
      const ae = String((req && req.headers["accept-encoding"]) || "");
      if (e.br && /\bbr\b/.test(ae)){ h["Content-Encoding"] = "br"; h["Content-Length"] = e.br.length; res.writeHead(200, h); return res.end(e.br); }
      if (e.gz && /\bgzip\b/.test(ae)){ h["Content-Encoding"] = "gzip"; h["Content-Length"] = e.gz.length; res.writeHead(200, h); return res.end(e.gz); }
      h["Content-Length"] = e.buf.length; res.writeHead(200, h); res.end(e.buf);
    };
    const c = STATIQUE.get(f);
    if (c && c.mtime === st.mtimeMs && c.taille === st.size) return servir(c);
    fs.readFile(f, (e, buf)=>{ if (e) return erreur(res, 404, "Introuvable"); servir(statiquePrepare(f, st, buf)); });
  });
}
function origineOk(req){
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return true;
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch(e){ return false; }
}
function pgUrl(b){
  if (b.url) return b.url;
  const e = encodeURIComponent;
  return "postgres://"+e(b.utilisateur||"fiwakti")+":"+e(b.mdp||"")+"@"+(b.hote||"localhost")+":"+(Number(b.port)||5432)+"/"+e(b.nom||"fiwakti");
}
const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s||"");

/* v49 : métriques de fonctionnement (dernières 1 000 requêtes par famille de routes) et budgets de performance */
const METRIQUES = new Map(), DEMARRAGE_CPU = process.cpuUsage(), ALERTES_BUDGET = new Map();
/* v56.15 : robustesse — retard de la boucle d'événements, débit, délais */
const BOUCLE = require("perf_hooks").monitorEventLoopDelay({resolution:20}); BOUCLE.enable();
const METRIQUES_ROBUSTESSE = {refus429:0, delais503:0};
/* délai maximal par catégorie : connexion 15 s, recherche 30 s, API 30 s, ingestion 60 s ; les travaux longs (mise à
   jour, restauration, migration, exports) sont asynchrones ou exclus. Réglable (CONFIG.delais) ; FIWAKTI_DELAI_API_MS pour les essais. */
function delaiMax(m, p){
  const c = CONFIG.delais || {}, essai = Number(process.env.FIWAKTI_DELAI_API_MS) || 0;
  if (!p.startsWith("/api/") && !p.startsWith("/iclock")) return 0;
  if (/^\/api\/(v1\/)?(mise-a-jour|sauvegardes|installation|systeme\/partitionnement|systeme\/postgresql|pointeuses|travaux|exports?|clotures)/.test(p) || /\/restaurer$/.test(p)) return 0;
  if (p === "/api/v1/connexion" || p.startsWith("/api/v1/a2f")) return c.connexion || 15000;
  /* v56.31 : assistant de migration — lecture de gros fichiers ou de bases et imports par lots (au plus 15 min) */
  if (p.startsWith("/api/v1/migration/")) return 900000;
  if (p.startsWith("/iclock") || p.startsWith("/api/v1/ingestion")) return essai || c.ingestion || 60000;
  return essai || c.api || 30000;
}
/* débit : seau à jetons par adresse (600 requêtes / 10 s) et par session (400 / 10 s) ; pages et fichiers exclus.
   Instances multiples : chaque instance applique sa limite ; les échecs de connexion sont comptés dans la base
   (communs à toutes les instances) ; un répartiteur de charge peut ajouter sa propre limite. */
const SEAUX = new Map();
function debitPartage(){ return !!(B && B.type === "pg" && (CONFIG.multiInstance || process.env.FIWAKTI_MULTI_INSTANCE)); }
/* compteur partagé : fenêtre fixe de 10 s par adresse et par session, une seule requête atomique (INSERT … ON CONFLICT) */
async function limiteDebitPartagee(req){
  const c = CONFIG.debit || {}, essai = Number(process.env.FIWAKTI_DEBIT) || 0, f = Math.floor(Date.now() / 10000);
  const ip = "ip:"+ipDe(req), s = (String(req.headers.cookie||"").match(new RegExp(COOKIE+"=([^;]+)"))||[])[1];
  const cles = [ip].concat(s ? ["s:"+crypto.createHash("sha256").update(s).digest("hex").slice(0, 24)] : []);
  const r = await B.pool.query("INSERT INTO fw_debit(cle, fenetre, n) VALUES "+cles.map((_, i)=>"($"+(i+1)+", $"+(cles.length+1)+", 1)").join(",")+
    " ON CONFLICT (cle, fenetre) DO UPDATE SET n = fw_debit.n + 1 RETURNING cle, n", cles.concat([f]));
  const depasse = r.rows.some(x=>x.n > (x.cle.startsWith("ip:") ? (essai || c.adresse || 600) : (essai || c.session || 400)));
  return depasse ? Math.max(1, Math.ceil(((f + 1) * 10000 - Date.now()) / 1000)) : 0;
}
function limiteDebit(req, p){
  if (!p.startsWith("/api/") || p === "/api/sante") return 0;
  const c = CONFIG.debit || {}, essai = Number(process.env.FIWAKTI_DEBIT) || 0;
  const ip = ipDe(req), s = (String(req.headers.cookie||"").match(new RegExp(COOKIE+"=([^;]+)"))||[])[1];
  const prendre = (cle, cap) => { const n = Date.now(); let b = SEAUX.get(cle); if (!b){ b = {j:cap, t:n}; SEAUX.set(cle, b); }
    b.j = Math.min(cap, b.j + (n - b.t) * cap / 10000); b.t = n; if (b.j < 1) return Math.ceil((1 - b.j) * 10000 / cap / 1000) || 1; b.j -= 1; return 0; };
  if (SEAUX.size > 50000){ const lim = Date.now() - 20000; for (const [k, b] of SEAUX) if (b.t < lim) SEAUX.delete(k); }
  return prendre("ip:"+ip, essai || c.adresse || 600) || (s ? prendre("s:"+s, essai || c.session || 400) : 0);
}
function familleRoute(m, p){
  if (!p.startsWith("/api/")) return "pages statiques";
  return m+" "+p.replace(/\/[0-9a-f]{12,}/gi, "/:id").replace(/\/fiwakti-[^/]+/, "/:fichier").replace(/\/api\/cle\/.*/, "/api/cle/:cle").replace(/\/(\d+|[a-z0-9-]{20,})(\/|$)/gi, "/:id$2");
}
/* 56.33.6 : traitements longs par nature (migration, bascule, sauvegarde, mise à jour, exports en tâche de fond) : budget
   adapté — ils ne déclenchent plus d'« alerte de sécurité » de performance (fausse alerte vue pendant une reprise Netime) */
function budgetDe(fam){ const b = CONFIG.budgets || {}; if (b[fam]) return Number(b[fam]);
  if (/\/api\/v1\/(migration|systeme\/postgresql|sauvegardes|mise-a-jour|travaux|systeme\/partitionnement)/.test(fam)) return 900000;
  return Number(b.defaut || 2000); }
function noterMetrique(fam, ms, code){
  let m = METRIQUES.get(fam); if (!m){ m = {t:[], n:0, erreurs:0, depassements:0}; METRIQUES.set(fam, m); }
  m.n++; if (code >= 500) m.erreurs++; m.t.push(ms); if (m.t.length > 1000) m.t.shift();
  if (ms > budgetDe(fam)) m.depassements++;
}
const pct = (l, q) => { if (!l.length) return 0; const s = l.slice().sort((a,b)=>a-b); return Math.round(s[Math.min(s.length-1, Math.ceil(q/100*s.length)-1)]); };
async function metriques(){
  const routes = Array.from(METRIQUES.entries()).map(([f, m])=>({route:f, n:m.n, p50:pct(m.t, 50), p95:pct(m.t, 95), p99:pct(m.t, 99), erreurs:m.erreurs, horsBudget:m.depassements,
    budget:budgetDe(f)})).sort((a,b)=>b.p95 - a.p95);
  const mem = process.memoryUsage(), cpu = process.cpuUsage(DEMARRAGE_CPU), duree = (Date.now() - DEMARRE) / 1000;
  const a = aujourdhui(), nb = async (sql, ...x) => { try { return Number((await B.get("SELECT COUNT(*) n FROM "+sql, ...x)).n); } catch(e){ return null; } };
  return {
    technique:{memoireMo:Math.round(mem.rss/1e6), tasMo:Math.round(mem.heapUsed/1e6), processeurPct:Math.round(100*(cpu.user+cpu.system)/1e6/duree/Math.max(1, os.cpus().length)),
      charge:os.loadavg().map(x=>Math.round(x*100)/100), base:B.type, connexions:B.pool ? {total:B.pool.totalCount, libres:B.pool.idleCount, attente:B.pool.waitingCount} : null,
      /* retard de la boucle d'événements (la résolution de mesure, 20 ms, est retranchée) */
      boucle:{moyenneMs:Math.max(0, Math.round((BOUCLE.mean/1e6 - 20)*10)/10), p99Ms:Math.max(0, Math.round((BOUCLE.percentile(99)/1e6 - 20)*10)/10), maxMs:Math.max(0, Math.round((BOUCLE.max/1e6 - 20)*10)/10)}, refus429:METRIQUES_ROBUSTESSE.refus429, delais503:METRIQUES_ROBUSTESSE.delais503,
      calcul:K.charge(), travaux:{enCours:Array.from(TRAVAUX.values()).filter(x=>x.etat === "en_cours" || x.etat === "attente").length}, sessions:await nb("sessions"), depuis:new Date(DEMARRE).toISOString()},
    metier:{employes:await nb("enreg WHERE coll='emps'"), badgeagesDuJour:await nb("enreg WHERE coll='ptg' AND d=?", a), demandesEnAttente:null,
      anomaliesDuJour:await nb("calc_jour WHERE d=? AND nano>0", a), journeesCalculees:await nb("calc_jour"), exportsDuJour:Array.from(TRAVAUX.values()).filter(x=>String(x.cree).slice(0,10) === a).length},
    routes};
}
async function traiter(req, res){
  const u = new URL(req.url, "http://x");
  const p = u.pathname, ip = ipDe(req);
  if (!origineOk(req)) return erreur(res, 403, "Origine refusée");

  /* ---- appareils ZKTeco en mode Push (ADMS) ---- */
  if (/^\/iclock\//i.test(p)){
    if (!CONFIG.installe || !PT) return erreur(res, 503, "Non prêt");
    /* 56.33.11 : mêmes règles que le port Push (module de pointage ou d'accès actif) et limite de débit par adresse */
    if (MOD && !MOD.estActif("FW-Time") && !MOD.estActif("FW-Acces")) return erreur(res, 403, "Pointage non activé.");
    { const att = limiteDebit(req, "/api/iclock"); if (att){ res.writeHead(429, {"Retry-After":String(att), "Content-Type":"text/plain"}); return res.end("ERROR: too many requests"); } }
    return PT.iclock(req, res, u, req.method === "POST" ? ()=>corps(req, 20e6) : "");
  }
  /* ---- toujours publics ---- */
  if (p === "/api/sante" || p === "/api/v1/sante") return json(res, 200, {ok:true, version:VERSION, installe:!!CONFIG.installe, schema:3, base:B ? B.type : null});
  if (/^\/(public|installation|connexion)\.(css|js)$/.test(p) || p.startsWith("/public/")) return fichierStatique(res, PUBLIC, p.replace(/^\/public\//, "/"));
  if ((p === "/" || p === "/index.html") && u.searchParams.has("demo")) return fichierStatique(res, APP, "index.html");
  if (p === "/app.js" || p === "/app.css") return fichierStatique(res, APP, p);

  /* ---- installation ---- */
  if (!CONFIG.installe){
    if (p.startsWith("/api/installation") && !hoteInstallationOk(req)) return erreur(res, 403, "Nom de serveur non reconnu : ouvrez l'assistant avec l'adresse de ce serveur (ou ajoutez ce nom à « nomsHote » dans config.json).");
    if (p.startsWith("/api/installation") && !estLocalDirect(req)){
      const j = String(req.headers["x-jeton-installation"]||"");
      if (!JETON_INSTALL || !egalConstant(j, JETON_INSTALL)) return erreur(res, 403, "Code d'installation requis : il est affiché par l'installateur (et dans donnees/jeton-installation.txt).", {jeton:true});
    }
    if (p === "/api/installation/controles") return json(res, 200, {controles:await controles(), empreinte:empreinteMachine(), version:VERSION, pgPreconfigure:!!(CONFIG.base && CONFIG.base.type === "pg")});
    if (p === "/api/installation/licence" && req.method === "POST"){
      const b = await corpsJson(req); const r = lireLicence(b.cle);
      if (r.ok){ const e = LICENCE.etat(r.charge, aujourdhui()); if (e.restriction) return json(res, 200, {ok:false, motif:e.etat === "pas_commencee" ? "Cette licence ne commence que le "+e.L.debut+"." : "Cette licence est arrivée à échéance le "+e.L.fin+"."}); }
      return json(res, 200, r.ok ? {ok:true, client:r.charge.client, modules:r.charge.modules, fw:Array.isArray(r.charge.fw) ? r.charge.fw : null, expire:LICENCE.normaliser(r.charge).fin} : {ok:false, motif:r.motif});
    }
    if (p === "/api/installation/base" && req.method === "POST"){
      const b = await corpsJson(req);
      if (b.type !== "pg") return json(res, 200, {ok:true, type:"sqlite"});
      return json(res, 200, await testerPg(pgUrl(b)));
    }
    if (p === "/api/installation" && req.method === "POST"){
      const b = await corpsJson(req);
      const lic = lireLicence(b.licence);
      if (!lic.ok) return erreur(res, 400, lic.motif);
      { const e = LICENCE.etat(lic.charge, aujourdhui()); if (e.restriction) return erreur(res, 400, e.etat === "pas_commencee" ? "Cette licence ne commence que le "+e.L.debut+"." : "Cette licence est arrivée à échéance le "+e.L.fin+"."); }
      /* 56.33.1 : installation simple — compte « admin », mot de passe provisoire « admin », changement obligatoire à la
         première connexion ; ce compte ne fonctionne que sur le serveur lui-même tant que le mot de passe n'est pas changé */
      const rapide = b.rapide === true && estLocalDirect(req);
      if (rapide){ b.login = "admin"; b.mdp = b.confirmation = "admin"; b.mode = b.mode || "local"; }
      const login = String(b.login||"").trim();
      if (!/^[A-Za-z0-9._@-]{3,60}$/.test(login)) return erreur(res, 400, "Identifiant invalide (3 à 60 caractères : lettres, chiffres, . _ - @).");
      if (!rapide){ const pol = await politique(b.mdp, {login, nom:b.nom}, secuDe(null)); if (pol) return erreur(res, 400, pol); }
      if (b.mdp !== b.confirmation) return erreur(res, 400, "La confirmation ne correspond pas.");
      /* base choisie : PostgreSQL (recommandé) ou intégrée */
      if (b.base && b.base.type === "pg"){
        const url = pgUrl(b.base), t = await testerPg(url);
        if (!t.ok) return erreur(res, 400, "PostgreSQL : "+t.motif);
        if (!(CONFIG.base && CONFIG.base.url === url)){ await B.fermer(); CONFIG.base = {type:"pg", url}; await ouvrirBase(); }
      }
      const bloquants = (await controles()).filter(c=>c.etat === "bloquant");
      if (bloquants.length) return erreur(res, 400, "Installation impossible : "+bloquants.map(c=>c.titre).join(", "));
      const hash = await hacher(b.mdp);
      const exist = await compteDe(login);
      if (exist) await B.run("UPDATE comptes SET hash=?, mdp_le=?, role='admin', actif=1, etat='actif', changer=? WHERE login=?", hash, maintenant(), rapide ? 1 : 0, exist.login);
      else await B.run("INSERT INTO comptes(login,uid,nom,role,actif,hash,etat,changer,maj,mdp_le) VALUES(?,?,?,?,1,?,'actif',"+(rapide ? 1 : 0)+",?,?)", login, "u1", String(b.nom||"Administrateur").slice(0,80), "admin", hash, maintenant(), maintenant());
      await meta("licence", {cle:String(b.licence).replace(/\s+/g,""), activee:maintenant()}); await chargerModules();
      CONFIG = Object.assign(CONFIG, {installe:true, entreprise:String(b.entreprise||lic.charge.client).slice(0,120), adminInitial:login, installeLe:maintenant(), adminProvisoire:rapide,
        adresse: b.mode === "local" ? "127.0.0.1" : "0.0.0.0", sauvegarde:Object.assign({}, CONFIG.sauvegarde, {heure:Math.min(23, Math.max(0, Number(b.heureSauvegarde)||2)), retention:14, chiffrer:true})});
      ecrireConfig(CONFIG);
      try { fs.unlinkSync(path.join(DONNEES, "jeton-installation.txt")); } catch(e){} JETON_INSTALL = "";
      await audit(login, "installation", "FIWAKTI "+VERSION+" — "+CONFIG.entreprise+" — base "+B.type, ip);
      const man = await sauvegarder(login, "fin d'installation");
      return json(res, 200, {ok:true, sauvegarde:man.verification.ok, base:B.type, ecouteLocale:LOCAL_SEUL, mode:b.mode || ""});
    }
    /* v47 : reprise après sinistre — nouvelle machine, clé des sauvegardes et dernière sauvegarde
       récupérées hors du serveur perdu. Étape 1 : la clé ; étape 2 : le fichier de sauvegarde. */
    if (p === "/api/installation/cle-sauvegarde" && req.method === "POST"){
      const b = await corpsJson(req, 64e3);
      try { const n = CF.importer(b.cle); return json(res, 200, {ok:true, cles:n, empreinte:CF.empreinte("sauvegarde")}); }
      catch(e){ return erreur(res, 400, "Trousseau invalide : utilisez le fichier .key téléchargé depuis État du système ("+e.message+")."); }
    }
    if (p === "/api/installation/restaurer" && req.method === "POST"){
      const nom = path.basename(String(req.headers["x-nom-fichier"]||"")).replace(/[^A-Za-z0-9._-]/g, "");
      if (!/^fiwakti-.*\.(db|pgjson\.gz)(\.chiffre)?$/.test(nom)) return erreur(res, 400, "Nom de sauvegarde FIWAKTI attendu (fiwakti-….db, .pgjson.gz, éventuellement .chiffre).");
      const typeFichier = /\.db(\.chiffre)?$/.test(nom) ? "sqlite" : "pg";
      let cfgBase = null; try { cfgBase = req.headers["x-base"] ? JSON.parse(Buffer.from(String(req.headers["x-base"]), "base64").toString("utf8")) : null; } catch(e){}
      const t0 = Date.now();
      if (typeFichier === "pg" && !(cfgBase && cfgBase.type === "pg") && !(CONFIG.base && CONFIG.base.type === "pg")) return erreur(res, 400, "Sauvegarde PostgreSQL : choisissez d'abord la base PostgreSQL de destination.");
      if (typeFichier === "sqlite" && ((cfgBase && cfgBase.type === "pg") || (CONFIG.base && CONFIG.base.type === "pg"))) return erreur(res, 400, "Sauvegarde de base intégrée : choisissez la base intégrée comme destination (le passage à PostgreSQL se fera ensuite).");
      if (cfgBase && cfgBase.type === "pg"){ const url = pgUrl(cfgBase), tt = await testerPg(url); if (!tt.ok) return erreur(res, 400, "PostgreSQL : "+tt.motif); await B.fermer(); CONFIG.base = {type:"pg", url}; await ouvrirBase(); }
      const dest = path.join(D_SAUV, nom);
      await new Promise((ok, ko)=>{ const o = fs.createWriteStream(dest, {mode:0o600}); req.pipe(o); o.on("finish", ok); o.on("error", ko); req.on("error", ko); });
      let source = dest, tmp = null;
      try {
        if (/\.chiffre$/.test(nom)){ tmp = path.join(os.tmpdir(), "fiwakti-reprise-"+crypto.randomBytes(6).toString("hex")); await CF.dechiffrerFichier(dest, tmp, "sauvegarde"); source = tmp; }
        const v = await B.verifierExport(source, null);
        if (!v.ok) throw new Error("Sauvegarde illisible : "+v.motif);
        B = await B.restaurer(source); D = DONNEES_MOD.creer(B, PERIM); K.arreter(); K = CALCUL.creer(B, D, {base:CONFIG.base || null, dossier:DONNEES, app:path.join(APP, "app.js"), journal, config:()=>CONFIG}); initPointeuses(); await chargerModules();
        /* v56.23 : clés des données chiffrées présentes et identiques, sinon reprise refusée (importer le trousseau
           complet, puis relancer la restauration) */
        { let attendu = {}; try { const r = await B.get("SELECT v FROM meta WHERE k='cles_empreintes'"); attendu = r && r.v ? JSON.parse(r.v) : {}; if (typeof attendu === "string") attendu = JSON.parse(attendu); if (!attendu || typeof attendu !== "object") attendu = {}; } catch(e){}
          const manquantes = Object.keys(attendu).filter(n=>n !== "sauvegarde" && CF.empreinteSiExiste(n) !== attendu[n]);
          if (manquantes.length) throw Object.assign(new Error("Clé(s) de chiffrement absente(s) ou différente(s) : "+manquantes.join(", ")+". Importez d'abord le trousseau complet de l'installation d'origine, puis relancez la restauration."), {cles:manquantes}); }
        const nb = async (sql, ...a) => Number((await B.get("SELECT COUNT(*) n FROM "+sql, ...a)).n);
        const ref = await D.referentielLecture() || {};
        const bilan = {comptes:await nb("comptes"), employes:await nb("enreg WHERE coll='emps'"), badgeages:await nb("enreg WHERE coll='ptg'"), demandes:await nb("enreg WHERE coll='dmd'"),
          audit:await nb("audit"), clotures:(ref.clotures||[]).length, profils:(ref.profils||[]).length, parametres:Object.keys(ref).length};
        const adm = await B.get("SELECT login FROM comptes WHERE role='admin' AND actif=1 ORDER BY login LIMIT 1");
        const lic = await licenceActive();
        await B.run("DELETE FROM sessions");
        CONFIG = Object.assign(CONFIG, {installe:true, entreprise:(lic && lic.client) || CONFIG.entreprise || "", adminInitial:adm ? adm.login : "", installeLe:maintenant(), repriseLe:maintenant(),
          sauvegarde:Object.assign({}, CONFIG.sauvegarde, {chiffrer:true})});
        ecrireConfig(CONFIG);
        try { fs.unlinkSync(path.join(DONNEES, "jeton-installation.txt")); } catch(e){} JETON_INSTALL = "";
        const verifAudit = await verifierAudit();
        await audit(adm ? adm.login : "systeme", "reprise.apres.sinistre", nom+" — "+JSON.stringify(bilan)+" — "+(Date.now()-t0)+" ms", ip);
        return json(res, 200, {ok:true, bilan, dureeMs:Date.now()-t0, licence:lic ? lic.client : null, licenceValide:!!lic, audit:verifAudit.ok, administrateur:adm ? adm.login : null});
      } catch(e){ try { fs.unlinkSync(dest); } catch(x){} return erreur(res, 400, e.message); }
      finally { if (tmp) try { fs.unlinkSync(tmp); } catch(e){} }
    }
    if (p === "/" || p === "/index.html" || p === "/installation" || p === "/installation.html") return fichierStatique(res, PUBLIC, "installation.html");
    if (p.startsWith("/api/")) return erreur(res, 402, "Installation non terminée");
    return redirige(res, "/installation.html");
  }
  if (p === "/installation" || p === "/installation.html" || p.startsWith("/api/installation")) return redirige(res, "/");

  /* ---- connexion ---- */
  if (p === "/connexion" || p === "/connexion.html") return fichierStatique(res, PUBLIC, "connexion.html");
  if (p === "/api/v1/connexion/options"){ const s = secuDe(await D.referentielLecture()); return json(res, 200, {memoriser:!!s.memoriser, minLen:Math.max(8, Number(s.minLen)||12), exigerMix:!!s.exigerMix, entreprise:CONFIG.entreprise||"",
    /* correctif 24 : règles affichées = règles appliquées (mots courants, historique) ; aide « matricule » selon le réglage du portail */
    interdireCourants:s.interdireCourants !== false, courants:s.interdireCourants !== false ? COURANTS : [], historique:s.historique, aideConnexion:s.premiere.aideConnexion !== false}); }
  if (p === "/api/v1/connexion" && req.method === "POST"){
    /* correctif 24 : entrées périmées purgées (la table grossissait sans fin derrière un proxy ou un balayage d'adresses) */
    if (ESSAIS_IP.size > 5000){ const lim = Date.now() - 15*60000; for (const [k, v] of ESSAIS_IP) if (v.t < lim) ESSAIS_IP.delete(k); if (ESSAIS_IP.size > 50000) ESSAIS_IP.clear(); }
    const e = ESSAIS_IP.get(ip) || {n:0, t:Date.now()};
    if (Date.now() - e.t > 15*60000){ e.n = 0; e.t = Date.now(); }
    if (e.n >= 20){ if (e.n === 20){ e.n++; await audit("", "connexion.limite_adresse", "20 échecs en 15 min", ip); } return erreur(res, 429, "Trop de tentatives depuis ce poste. Réessayez dans quelques minutes."); }
    if (Date.now() - ECHECS_GLOBAL.t < 15*60000 && ECHECS_GLOBAL.n >= 300) await new Promise(r=>setTimeout(r, 1500));   /* ralentissement global */
    const b = await corpsJson(req);
    const c = await compteDe(b.login);
    const refus = async () => { e.n++; ESSAIS_IP.set(ip, e); await noterEchec(b.login, ip); return erreur(res, 401, "Identifiant ou mot de passe incorrect."); };
    if (!c || !Number(c.actif) || await salarieSorti(c)){
      const cle = String(b.login||"").toLowerCase().slice(0, 200), secuI = secuDe(await D.referentielLecture());
      const maxI = Number(secuI.tentatives) || 5, vmI = Math.max(1, Number(secuI.verrouillageMin)||15), x = ECHECS_INCONNUS.get(cle) || {n:0, verrou:0};
      if (x.verrou > Date.now()) return erreur(res, 423, "Compte verrouillé jusqu'à "+jusquA(x.verrou)+".");
      await hacher("leurre");
      x.n++; if (x.n >= maxI){ x.n = 0; x.verrou = Date.now() + vmI*60000; }
      if (ECHECS_INCONNUS.size > 50000) ECHECS_INCONNUS.clear();
      ECHECS_INCONNUS.set(cle, x);
      return refus();
    }
    if (CONFIG.adminProvisoire && c.login === CONFIG.adminInitial && Number(c.changer) && !estLocalDirect(req))
      return erreur(res, 403, "Compte administrateur provisoire : première connexion uniquement depuis le serveur FIWAKTI lui-même (https://localhost), le temps de choisir un vrai mot de passe.");
    if (c.verrou && c.verrou > maintenant()) return erreur(res, 423, "Compte verrouillé jusqu'à "+jusquA(c.verrou)+".");
    let ok = false;
    const secu = secuDe(await D.referentielLecture());
    if (c.etat === "temp_matricule"){
      const validite = secu.premiere.validiteJours;   /* correctif 24 : 0 = sans limite, comme l'annonce l'écran (valait 30 jours) */
      /* correctif 23 : même coût et même réponse qu'un mot de passe faux tant que le mot de passe n'est pas vérifié
         (l'état du compte se lisait dans le message et le temps de réponse) */
      await hacher("leurre");
      ok = !!c.matricule && egalConstant(String(b.mdp||""), c.matricule);
      if (ok && c.temp_le && validite > 0 && new Date(c.temp_le).getTime() + validite*86400000 < Date.now()) return erreur(res, 401, "Mot de passe temporaire expiré : demandez une réinitialisation au service RH.");
    } else if (c.etat === "temp_code"){
      /* mot de passe temporaire remis par l'administrateur : valable « resetValiditeMin » minutes */
      const lim = Math.max(5, Number(secu.resetValiditeMin)||60)*60000;
      ok = await verifier(b.mdp, c.hash);
      if (ok && c.temp_le && new Date(c.temp_le).getTime() + lim < Date.now()) return erreur(res, 401, "Mot de passe temporaire expiré : demandez-en un nouveau à l'administrateur.");
      /* correctif 24 : usage unique — une fois utilisé, le mot de passe temporaire ne rouvre plus de session (il reste
         valable pour le changement de mot de passe de la session ouverte) */
      if (ok) await B.run("UPDATE comptes SET etat='temp_code_utilise' WHERE login=?", c.login);
    } else if (c.etat === "temp_code_utilise"){ await hacher("leurre"); ok = false;
    } else if (c.hash) ok = await verifier(b.mdp, c.hash);
    else { await hacher("leurre"); ok = false; }   /* correctif 23 : compte sans mot de passe — réponse générique, tentatives comptées */
    if (!ok){
      const n = (Number(c.echecs)||0) + 1, max = Number(secu.tentatives) || 5;
      const vm = Math.max(1, Number(secu.verrouillageMin)||15);
      await B.run("UPDATE comptes SET echecs=?, verrou=? WHERE login=?", max > 0 && n >= max ? 0 : n, max > 0 && n >= max ? new Date(Date.now()+vm*60000).toISOString() : null, c.login);
      await audit(c.login, "connexion.echec", max > 0 && n >= max ? "compte verrouillé "+vm+" min" : "tentative "+n, ip);
      return refus();
    }
    await B.run("UPDATE comptes SET echecs=0, verrou=NULL, derniere=? WHERE login=?", maintenant(), c.login);
    /* expiration du mot de passe */
    const exp = Number(secu.expirationJours)||0;
    if (exp > 0 && c.etat === "actif" && c.mdp_le && new Date(c.mdp_le).getTime() + exp*86400000 < Date.now() && !Number(c.changer)){
      await B.run("UPDATE comptes SET changer=1, raison='expire' WHERE login=?", c.login); c.changer = 1; c.raison = "expire";
    }
    const a2f = await a2fRequise(c.login);
    await ouvrirSession(res, req, c.login, {a2f, persistant:!!(secu.memoriser && b.memoriser), maxSec:Math.max(1, Number(secu.sessionMax)||12)*3600});
    await audit(c.login, "connexion", a2f ? "mot de passe correct, code de vérification attendu" : "", ip);
    return json(res, 200, {ok:true, changer:!!Number(c.changer), raison:c.raison||"", a2f:a2f ? (Number(c.a2f_actif) ? "code" : "enrolement") : ""});
  }

  /* v56.30 : intervention du fournisseur — jeton signé, lié à cette installation, valable une heure ; il n'ouvre que
     l'écran de licence (aucune donnée métier) et chaque usage est tracé */
  if (p === "/api/v1/licence/jeton" && req.method === "POST"){
    const e = ESSAIS_IP.get(ip) || {n:0, t:Date.now()}; if (e.n >= 20) return erreur(res, 429, "Trop de tentatives depuis ce poste.");
    const b = await corpsJson(req); const r = lireJeton(b.jeton);
    if (!r.ok){ e.n++; ESSAIS_IP.set(ip, e); await audit("", "licence.jeton.refuse", r.motif, ip); return erreur(res, 400, r.motif); }
    if (!(await compteDe(LOGIN_FOURNISSEUR))) await B.run("INSERT INTO comptes(login,uid,nom,role,actif,hash,etat,changer,maj,mdp_le) VALUES(?,?,?,?,1,NULL,'actif',0,?,?)", LOGIN_FOURNISSEUR, "fournisseur", "Intervention du fournisseur", "fournisseur", maintenant(), maintenant());
    else await B.run("UPDATE comptes SET role='fournisseur', actif=1, hash=NULL WHERE login=?", LOGIN_FOURNISSEUR);
    await ouvrirSession(res, req, LOGIN_FOURNISSEUR, {});
    const sc = String(res.getHeader("Set-Cookie")||""), sid = /=([^;]+)/.exec(sc); if (sid) JETONS_SESS.set(hid(sid[1]), r.exp);
    await audit(LOGIN_FOURNISSEUR, "licence.jeton.utilise", "jeton "+(r.charge.id||"")+" — valable jusqu'à "+new Date(r.exp).toLocaleTimeString("fr-FR"), ip);
    return json(res, 200, {ok:true, jusqua:new Date(r.exp).toISOString()});
  }
  const sess = await sessionDe(req);
  if (p === "/api/v1/deconnexion" && req.method === "POST"){ if (sess) await audit(sess.compte.login, "deconnexion", "", ip); await fermerSession(res, sess); return json(res, 200, {ok:true}); }
  if (!sess){ if (p.startsWith("/api/")) return erreur(res, 401, "Session requise"); return redirige(res, "/connexion.html"); }
  const C = sess.compte;
  /* correctif 18 : rôle administrateur revérifié à chaque requête d'après le profil EN VIGUEUR (le rôle enregistré
     n'était recalculé qu'à la prochaine synchronisation des comptes : un profil rétrogradé restait administrateur) */
  let admin = C.role === "admin";
  if (admin && String(C.login).toLowerCase() !== String(CONFIG.adminInitial || "").toLowerCase() && D && D.referentielLecture){ try { const refA = await D.referentielLecture();
    const uA = refA && (refA.users || []).find(x=>x && String(x.login || "").trim().toLowerCase() === String(C.login).trim().toLowerCase());
    if (uA && PERIM.niveauProfil((refA.profils || []).find(x=>x && x.id === uA.profilId)) !== "admin") admin = false; } catch(e){} }
  if (C.role === "fournisseur"){
    const exp = JETONS_SESS.get(sess.sid);
    if (!exp || Date.now() > exp){ JETONS_SESS.delete(sess.sid); await fermerSession(res, sess); return p.startsWith("/api/") ? erreur(res, 401, "Intervention terminée : le jeton a expiré.") : redirige(res, "/connexion.html"); }
    if (p.startsWith("/api/") && !/^\/api\/v1\/(session|licence|modules)(\/|$)/.test(p) && !(req.method === "GET" && p === "/api/v1/systeme"))
      return erreur(res, 403, "L'intervention du fournisseur ne donne accès qu'à l'écran de licence.");
  }
  if (!sess.a2fOk){
    const secuA = await D.referentielLecture();
    if (p === "/api/v1/a2f/etat") return json(res, 200, {a2f:Number(C.a2f_actif) ? "code" : "enrolement", csrf:sess.csrf});
    if (p === "/api/v1/a2f/enrolement" && req.method === "POST"){
      if (Number(C.a2f_actif)) return erreur(res, 400, "Double authentification déjà configurée.");
      if (!egalConstant(String(req.headers["x-csrf"]||""), sess.csrf)) return erreur(res, 403, "Jeton invalide.");
      const secret = TOTP.nouveauSecret();
      await B.run("UPDATE comptes SET a2f_secret=?, a2f_actif=0 WHERE login=?", CF.chiffrerTexte(secret, "secrets"), C.login);
      return json(res, 200, {secret:secret.replace(/(.{4})/g, "$1 ").trim(), uri:TOTP.uri(secret, C.login, "FIWAKTI "+(CONFIG.entreprise||""))});
    }
    if (p === "/api/v1/a2f/verifier" && req.method === "POST"){
      if (!egalConstant(String(req.headers["x-csrf"]||""), sess.csrf)) return erreur(res, 403, "Jeton invalide.");
      const b = await corpsJson(req);
      const c2 = await compteDe(C.login);
      if (!c2.a2f_secret) return erreur(res, 400, "Aucune configuration en cours.");
      const pasOk = TOTP.verifier(CF.dechiffrerTexte(c2.a2f_secret, "secrets"), b.code, c2.a2f_pas);
      if (pasOk < 0){
        const n = (Number(c2.echecs)||0) + 1, max = Number(secuDe(secuA).tentatives) || 5;
        await B.run("UPDATE comptes SET echecs=?, verrou=? WHERE login=?", n >= max ? 0 : n, n >= max ? new Date(Date.now()+Math.max(1, Number(secuDe(secuA).verrouillageMin)||15)*60000).toISOString() : null, C.login);
        if (n >= max) await B.run("DELETE FROM sessions WHERE login=?", C.login);
        await audit(C.login, "a2f.echec", "code incorrect ("+n+")", ip);
        return erreur(res, 401, "Code incorrect ou déjà utilisé.");
      }
      await B.run("UPDATE comptes SET a2f_actif=1, a2f_pas=?, echecs=0 WHERE login=?", pasOk, C.login);
      /* 56.33.11 : nouvel identifiant de session après la double authentification (fixation de session) */
      const nid2 = crypto.randomBytes(32).toString("base64url"), ligS = await B.get("SELECT persistant FROM sessions WHERE id=?", sess.sid);
      await B.run("UPDATE sessions SET id=?, a2f_ok=1, csrf=? WHERE id=?", hid(nid2), crypto.randomBytes(24).toString("base64url"), sess.sid);
      res.setHeader("Set-Cookie", COOKIE+"="+nid2+"; HttpOnly; SameSite=Strict; Path=/"+(SECURISE ? "; Secure" : "")+(ligS && Number(ligS.persistant) ? "; Max-Age="+Math.max(1, Number(secuDe(secuA).sessionMax)||12)*3600 : ""));
      await audit(C.login, Number(c2.a2f_actif) ? "a2f.ok" : "a2f.active", "", ip);
      return json(res, 200, {ok:true, changer:!!Number(C.changer), raison:C.raison||""});
    }
    if (p === "/api/v1/session") return json(res, 200, {login:C.login, a2f_attendu:true, a2f:Number(C.a2f_actif) ? "code" : "enrolement", csrf:sess.csrf});
    if (p === "/api/v1/deconnexion"){ /* autorisé */ }
    else if (p.startsWith("/api/")) return erreur(res, 403, "Code de vérification requis.", {a2f:true});
    else return redirige(res, "/connexion.html?a2f=1");
  }
  if (!["GET","HEAD","OPTIONS"].includes(req.method) && sess.csrf && !egalConstant(String(req.headers["x-csrf"]||""), sess.csrf)){
    await audit(C.login, "csrf.refus", req.method+" "+p, ip);
    return erreur(res, 403, "Requête refusée : jeton de sécurité absent ou invalide. Rechargez la page.");
  }

  if (p === "/api/v1/mot-de-passe" && req.method === "POST"){
    const b = await corpsJson(req);
    const actuelOk = C.etat === "temp_matricule" ? egalConstant(String(b.actuel||""), C.matricule||"\u0000") : await verifier(b.actuel, C.hash);
    if (!actuelOk) return erreur(res, 400, "Mot de passe actuel incorrect.");
    if (b.nouveau === b.actuel) return erreur(res, 400, "Le nouveau mot de passe doit être différent de l'actuel.");
    const secuM = secuDe(await D.referentielLecture());
    const pol = await politique(b.nouveau, C, secuM); if (pol) return erreur(res, 400, pol);
    await definirMdp(C, b.nouveau, secuM);
    const nouveauJeton = crypto.randomBytes(24).toString("base64url");
    await B.run("UPDATE sessions SET csrf=? WHERE id=?", nouveauJeton, sess.sid);
    await B.run("DELETE FROM sessions WHERE login=? AND id<>?", C.login, sess.sid);
    await audit(C.login, "mot_de_passe", "défini par l'utilisateur", ip);
    if (CONFIG.adminProvisoire && C.login === CONFIG.adminInitial){ CONFIG.adminProvisoire = false; ecrireConfig(CONFIG); await audit(C.login, "installation.admin_definitif", "mot de passe provisoire remplacé", ip); }
    return json(res, 200, {ok:true, csrf:nouveauJeton});
  }
  if (Number(C.changer) && p !== "/api/v1/session"){
    if (p.startsWith("/api/")) return erreur(res, 403, "Changement de mot de passe obligatoire", {must_change_password:true});
    return redirige(res, "/connexion.html?changer=1");
  }
  if (p === "/api/v1/session"){
    const lic = await licenceActive();
    return json(res, 200, {login:C.login, nom:C.nom, role:C.role === "admin" && !admin ? "utilisateur" : C.role, csrf:sess.csrf, recette:!!CONFIG.recette, must_change_password:!!Number(C.changer), raison:C.raison||"",
      licence: lic ? Object.assign({client:lic.client, modules:MOD ? MOD.lettres() : lic.modules, fw:MOD ? MOD.liste().filter(m=>m.actif).map(m=>m.id) : [], expire:LICENCE.normaliser(lic).fin}, licencePublique(await licenceEtat())) : null, version:VERSION, entreprise:CONFIG.entreprise||""});
  }

  /* v56.4 : maintenance du stockage — écritures, calculs et recalculs suspendus quelques minutes (les pointeuses
     restent reçues dans la file d'ingestion) */
  if (PART && PART.enCours() && !p.startsWith("/api/v1/systeme/partitionnement") && (req.method !== "GET" || /^\/api\/v1\/(calcul|journees|recalculs|registre-anomalies|ajustements)/.test(p)))
    return erreur(res, 503, "Maintenance du stockage en cours (quelques minutes) : réessayez ensuite.", {maintenance:true});
  /* v56.30 : échéance de la licence — appliquée ici, pour toutes les routes (écran, API, appel direct) ;
     la date du poste n'intervient pas, celle du serveur est protégée contre le recul */
  if (p.startsWith("/api/") && !routeLibreLicence(p, req.method)){
    const LV = await licenceEtat();
    if (LV.e.restriction === "blocage" || (LV.e.restriction === "lecture" && req.method !== "GET" && !exportPermis(p, req.method) && !(p.startsWith("/api/cle/") && clePreference(p)))){
      if (req.method !== "GET") compterRefusLicence(p);
      return erreur(res, 403, LV.e.etat === "invalide" ? "Licence absente ou invalide : contactez votre fournisseur." : LV.e.etat === "pas_commencee" ? "La licence installée n'est pas encore en vigueur." : MSG_LIC_ECHUE,
        {licence:LV.e.etat, restriction:LV.e.restriction}); } }
  /* v55 : contrôle serveur des modules — toute route d'un module inactif ou non accordé est refusée (URL, API, appel direct) */
  { const mo = MOD && MOD.moduleDeRoute(p);
    if (mo && !MOD.estActif(mo)) return erreur(res, 403, "Module "+mo+" non activé ou non accordé par la licence.", {module:mo}); }
  /* v56.2 : ressources d'un module chargées à la demande — jamais pour un module inactif ou non accordé */
  const mr = /^\/modules\/(FW-[A-Za-z0-9]+)\/([a-z0-9.-]+\.(?:js|css))$/.exec(p);
  if (mr){
    const chemin = MOD && MOD.ressource(mr[1], mr[2]);
    if (!chemin || !MOD.estActif(mr[1])) return erreur(res, 403, "Module "+mr[1]+" non activé ou non accordé par la licence.");
    return fichierStatique(res, APP, "/"+chemin);
  }
  /* v56.2 : API des modules livrés (partie serveur du module) */
  for (const x of MODS_SERVEUR){
    if (!x.inst || !x.routes.some(r=>p === r || p.startsWith(r+"/"))) continue;
    const refM = await D.referentielLecture() || {}, {P} = await D.perimetreDe(refM, C.login);
    /* v56.17 : toute écriture dans un module rafraîchit « À traiter » (cache de 30 s) */
    if (req.method !== "GET") CACHE_AT.clear();
    return x.inst.traiter(req, res, {p, C, admin, P, u, json, erreur, corpsJson, ip});
  }

  /* ---- préférences d'affichage (rangées par utilisateur) ---- */
  let m;
  const cleRangee = k => {
    if (k === CLE_APP) return k;
    if (/^fiwakti:(bak|avant-migration|illisible):/.test(k)) return admin ? k : null;
    if (k === "fiwakti:home:admin:v2") return k;
    return "u:"+C.login.toLowerCase()+":"+k;
  };
  if ((m = /^\/api\/cle\/(.+)$/.exec(p))){
    const cle = decodeURIComponent(m[1]);
    if (cle.length > 200) return erreur(res, 400, "Clé trop longue");
    if (/^fiwakti:lic:/.test(cle)) return erreur(res, 403, "La licence est gérée par le serveur.");
    const k = cleRangee(cle);
    if (!k) return req.method === "GET" ? erreur(res, 404, "Absent") : json(res, 200, {ok:true, ignore:true});
    if (k === CLE_APP) return erreur(res, 409, "FIWAKTI a été mis à jour : rechargez la page (Ctrl+F5).");
    if (req.method === "GET"){ const r = await B.get("SELECT valeur FROM kv WHERE cle=?", k); if (!r) return erreur(res, 404, "Absent"); return texteJson(res, r.valeur); }
    if (req.method === "PUT"){
      if (k === "fiwakti:home:admin:v2" && !admin) return erreur(res, 403, "Réservé aux administrateurs.");
      const texte = await corps(req, 5e6); try { JSON.parse(texte); } catch(e){ return erreur(res, 400, "JSON invalide"); }
      await B.run("INSERT INTO kv(cle,valeur,version,maj,par) VALUES(?,?,1,?,?) ON CONFLICT(cle) DO UPDATE SET valeur=excluded.valeur, version=kv.version+1, maj=excluded.maj, par=excluded.par", k, texte, maintenant(), C.login);
      return json(res, 200, {ok:true});
    }
    if (req.method === "DELETE"){ if (k === "fiwakti:home:admin:v2" && !admin) return erreur(res, 403, "Réservé aux administrateurs.");   /* 56.33.11 : comme l'écriture */
      await B.run("DELETE FROM kv WHERE cle=?", k); return json(res, 200, {ok:true}); }
  }
  if (p === "/api/cles"){
    const pre = String(u.searchParams.get("prefixe")||"");
    const k = cleRangee(pre || "fiwakti:"); if (!k || k === CLE_APP) return json(res, 200, {cles:[]});
    const ns = k.startsWith("u:") ? k.slice(0, k.length - (pre || "fiwakti:").length) : "";
    return json(res, 200, {cles:(await B.all("SELECT cle FROM kv WHERE substr(cle,1,?)=? ORDER BY cle", k.length, k)).map(r=>r.cle.slice(ns.length))});
  }

  /* ---- données structurées ---- */
  if (p === "/api/v1/donnees" && req.method === "GET"){
    const n = new Date(), mois = Math.max(1, Number(CONFIG.fenetreMois) || 2);
    const def = new Date(n.getFullYear(), n.getMonth() - (mois - 1), 1);
    const depuis = dateOk(u.searchParams.get("depuis")) ? u.searchParams.get("depuis") : def.getFullYear()+"-"+String(def.getMonth()+1).padStart(2,"0")+"-01";
    if (!await D.referentielLecture()) return texteJson(res, JSON.stringify({ref:null, colls:{}, fenetre:{du:depuis}, mode:"normal"}));
    const t0 = Date.now();
    /* v49 : grand effectif — réponse (déjà compressée) gardée tant qu'aucune donnée n'a changé (5 min au plus) */
    const cleD = C.login+"|"+depuis+"|"+K.generation()+"|"+aujourdhui();
    const cD = CACHE_DONNEES.get(C.login);
    if (cD && cD.cle === cleD && Date.now() - cD.t < 300000 && /\bgzip\b/.test(String(req.headers["accept-encoding"]||""))){
      entetes(res, true); res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Content-Encoding":"gzip", "Vary":"Accept-Encoding", "Content-Length":cD.gz.length}); return res.end(cD.gz);
    }
    const texte = await D.charger(C.login, depuis, {seuil:Number(CONFIG.seuilGrandEffectif)||1000, hier:ajoutJours(aujourdhui(), -1), annuairePagine:(CONFIG.annuaire||{}).pagine, admin});
    journal("donnees "+C.login+" : "+Math.round(texte.length/1024)+" Ko en "+(Date.now()-t0)+" ms");
    /* v56.30 : une seule compression, asynchrone (avant : gzipSync bloquant pour le cache PUIS une seconde compression
       pour la réponse) ; le résultat compressé sert à la fois la réponse et le cache */
    const accepteGz = /\bgzip\b/.test(String(req.headers["accept-encoding"]||""));
    if (texte.length > 32768 && accepteGz){
      const brut = Buffer.from(texte, "utf8");
      return zlibM.gzip(brut, {level:5}, (e, z)=>{
        if (res.headersSent || res.writableEnded) return;
        if (e) return texteJson(res, texte);
        if (texte.length > 2e6){ if (CACHE_DONNEES.size >= 50) CACHE_DONNEES.delete(CACHE_DONNEES.keys().next().value); CACHE_DONNEES.set(C.login, {cle:cleD, t:Date.now(), gz:z}); }
        entetes(res, true); res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Content-Encoding":"gzip", "Vary":"Accept-Encoding", "Content-Length":z.length}); res.end(z);
      });
    }
    return texteJson(res, texte);
  }
  if (p === "/api/v1/donnees/periode" && req.method === "GET"){
    const du = u.searchParams.get("du"), au = u.searchParams.get("au");
    if (!dateOk(du) || !dateOk(au)) return erreur(res, 400, "Dates invalides");
    const mats = (u.searchParams.get("mats")||"").split(",").filter(Boolean);
    const colls = (u.searchParams.get("colls")||"").split(",").filter(Boolean);
    return texteJson(res, await D.chargerPeriode(C.login, du, au, mats.length ? mats : null, colls.length ? colls : null, admin));
  }
  if (p === "/api/v1/donnees/sync" && req.method === "POST"){
    let paquet; try { paquet = JSON.parse(await corps(req, 200e6)); } catch(e){ return erreur(res, 400, "JSON invalide"); }
    if (!await D.referentielLecture()){
      if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
      const ref = paquet.ref || {}; DONNEES_MOD.COLLS.forEach(c=>{ delete ref[c]; });
      /* le premier référentiel doit être complet : jamais un paramétrage partiel */
      const manque = ["profils","tt","jours","cals","arits","etats"].filter(k=>!Array.isArray(ref[k]));
      if (manque.length) return erreur(res, 409, "Paramétrage initial incomplet ("+manque.join(", ")+") : rechargez la page.");
      await B.run("INSERT INTO kv(cle,valeur,version,maj,par) VALUES(?,?,1,?,?)", CLE_APP, JSON.stringify(ref), maintenant(), C.login);
      paquet.ref = {};
    }
    /* correctif 21 : sites avant l'envoi, pour tracer précisément ce qui change (fuseau compris) */
    const sitesAvant = paquet.ref && Array.isArray(paquet.ref.sites) ? (((await D.referentielLecture()) || {}).sites || []) : null;
    const profilsAvant = paquet.ref && Array.isArray(paquet.ref.profils) ? (((await D.referentielLecture()) || {}).profils || []) : null;
    const secuAvant = paquet.ref && paquet.ref.secu !== undefined ? secuDe(await D.referentielLecture()) : null;
    const deptsAvant = paquet.ref && Array.isArray(paquet.ref.depts) ? (((await D.referentielLecture()) || {}).depts || []) : null;
    const circuitsAvant = paquet.ref && Array.isArray(paquet.ref.circuits) ? (((await D.referentielLecture()) || {}).circuits || []) : null;
    const reglesAvant = paquet.ref && Array.isArray(paquet.ref.regles) ? (((await D.referentielLecture()) || {}).regles || []) : null;
    const empsAvantIds = paquet.colls && paquet.colls.emps && (paquet.colls.emps.put || []).length ? new Set((await D.employes()).map(e=>String(e.id))) : null;
    const usersAvant = admin && paquet.ref && Array.isArray(paquet.ref.users) ? (((await D.referentielLecture()) || {}).users || []) : null;
    const r = await D.synchroniser(C.login, paquet, {admin, recette:!!CONFIG.recette});
    if (!r.ok) return erreur(res, 403, (r.ignores||[]).join(", "));
    /* correctif 22 : un profil modifié change le rôle des comptes qui le portent (administrateur promu ou rétrogradé) */
    if ((r.refCles || []).indexOf("profils") >= 0 && !(paquet.ref && paquet.ref.users)){ try { await synchroniserComptes({users:r.ref.users, profils:r.ref.profils, emps:await D.employes(), secu:r.ref.secu}, C.login); } catch(e){ journal("comptes : "+e.message); } }
    if ((paquet.ref && paquet.ref.users) || (paquet.colls && paquet.colls.emps)){
      /* 56.33.11 : enregistrement de salariés seul → comptes de ces salariés seulement (50 000 comptes examinés et deux
         copies de 8 Mo comparées à chaque fiche modifiée auparavant) */
      const ids = !(paquet.ref && paquet.ref.users) ? new Set([].concat((paquet.colls.emps.put||[]).map(x=>x && String(x.id)), (paquet.colls.emps.del||[]).map(String))) : null;
      const docC = {users:r.ref.users, profils:r.ref.profils, emps:await D.employes(), secu:r.ref.secu};
      const vus = ids ? (docC.users||[]).filter(x=>x && ids.has(String(x.empId))) : docC.users;
      const avant = JSON.stringify(vus);
      await synchroniserComptes(docC, C.login, ids || undefined);
      if (JSON.stringify(vus) !== avant){ r.ref.users = docC.users; await B.run("UPDATE kv SET valeur=?, version=version+1 WHERE cle=?", JSON.stringify(r.ref), CLE_APP); }
    }
    /* correctif 25 : règles métier exécutées par le serveur sur les fiches réellement enregistrées */
    if (empsAvantIds){ const idsP = new Set((paquet.colls.emps.put || []).map(x=>x && String(x.id)).filter(Boolean));
      try { r.regles = await executerRegles(idsP, C.login, new Set(Array.from(idsP).filter(id=>!empsAvantIds.has(id)))); } catch(e){ journal("règles métier : "+e.message); } }
    /* correctif 25 : service passé « hors effectif » → règles exécutées pour tous ses salariés (pas seulement ceux chargés
       dans le navigateur) */
    if (deptsAvant && (r.refCles || []).indexOf("depts") >= 0){ const etaitH = new Set(deptsAvant.filter(d=>d && d.type === "hors").map(d=>d.id)), nvH = new Set((((r.ref || {}).depts) || []).filter(d=>d && d.type === "hors" && !etaitH.has(d.id)).map(d=>d.id));
      if (nvH.size){ try { const idsH = new Set((await D.employes()).filter(e=>e && nvH.has(e.deptId)).map(e=>String(e.id))); const rh = await executerRegles(idsH, C.login, new Set(), nvH);
        r.regles = r.regles ? {salaries:r.regles.salaries + rh.salaries, executions:r.regles.executions + rh.executions, actions:r.regles.actions + rh.actions, mats:r.regles.mats.concat(rh.mats).slice(0, 200)} : rh; } catch(e){ journal("règles métier : "+e.message); } } }
    /* correctif 24 : création automatique des comptes du portail pour les salariés enregistrés (réglage « auto ») */
    if (paquet.colls && paquet.colls.emps && (paquet.colls.emps.put || []).length && secuDe(r.ref).premiere.auto === true){
      try { await portailGenerer(C.login, new Set((paquet.colls.emps.put || []).map(x=>x && String(x.id)).filter(Boolean)), ip); } catch(e){ journal("comptes du portail : "+e.message); } }
    try { await K.invalider(r.touches, r.refCles); } catch(e){ journal("invalidation : "+e.message); }
    if ((r.nouvellesNotifs || []).length) notifierParCourriel(r.nouvellesNotifs, C.login).catch(e=>journal("notifications par e-mail : "+e.message));
    if ((r.refCles||[]).indexOf("terms") >= 0) try { await GERER_PUSH(); } catch(e){}
    /* correctif 24 : politique tracée en détail (avant → après, sans secret) ; sessions fermées seulement si les règles de
       SESSION se durcissent (auparavant tout enregistrement — même du seul envoi d'e-mails — déconnectait tout le monde) */
    if ((r.refCles||[]).indexOf("secu") >= 0 && secuAvant){
      const ap = secuDe(r.ref), ch = [], plat = (o, pre) => Object.keys(o || {}).reduce((m, k)=>{ const v = o[k]; if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(m, plat(v, pre+k+".")); else m[pre+k] = v; return m; }, {});
      const fa = plat(secuAvant, ""), fb = plat(ap, "");
      new Set(Object.keys(fa).concat(Object.keys(fb))).forEach(k=>{ if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) ch.push(k+" "+String(fa[k] === undefined ? "—" : fa[k]).slice(0, 60)+" → "+String(fb[k] === undefined ? "—" : fb[k]).slice(0, 60)); });
      if (ch.length) await audit(C.login, "securite.politique", ch.join(" ; ").slice(0, 1500), ip);
      /* correctif 24 : serveur d'envoi, port, sécurité ou identifiant changés → mot de passe enregistré effacé (il partait
         vers le nouveau serveur, choisi par celui qui modifie les réglages) : il doit être ressaisi */
      const sa = secuAvant.smtp || {}, sb = ap.smtp || {};
      if (["hote", "port", "securite", "user"].some(k=>String(sa[k] == null ? "" : sa[k]) !== String(sb[k] == null ? "" : sb[k])) && await meta("smtp_mdp")){
        await meta("smtp_mdp", ""); await audit(C.login, "courriel.mot_de_passe", "effacé : serveur d'envoi modifié (à ressaisir)", ip); }
      if (ap.sessionMax < secuAvant.sessionMax || ap.sessionInactivite < secuAvant.sessionInactivite || (secuAvant.memoriser && !ap.memoriser)){
        const n = (await B.run("DELETE FROM sessions WHERE id<>?", sess.sid)).n;
        if (n) await audit(C.login, "sessions.revoquees", "règles de session durcies : "+n+" session(s) fermée(s)", ip); }
    }
    if (r.ignores.length) await audit(C.login, "donnees.refusees", r.ignores.join(", "), ip);
    if (r.ecrits) await audit(C.login, "donnees.enregistrees", r.ecrits+" ligne(s)", ip);
    /* correctif 21 : paramétrage modifié tracé par le serveur (rubriques), détail des sites créés, modifiés, supprimés */
    { const cles = (r.refCles || []).filter(k=>["anoDec","corbeille","journal","notifs"].indexOf(k) < 0);
      if (cles.length) await audit(C.login, "parametrage.modifie", cles.join(", ").slice(0, 300), ip);
      /* correctif 22 : profils — détail tracé (droits, niveau, drapeaux, périmètre) ; double authentification nouvellement
         exigée : les sessions ouvertes des comptes concernés doivent la passer */
      if (profilsAvant && (r.refCles || []).indexOf("profils") >= 0){ const av = new Map(profilsAvant.filter(x=>x && x.id).map(x=>[x.id, x])), ap = new Map(((r.ref || {}).profils || []).filter(x=>x && x.id).map(x=>[x.id, x])), l = [], a2fOn = [];
        const res = x => JSON.stringify({sites:x.sites || [], depts:x.depts || [], filtres:x.filtres || {}, mode:x.mode || "regle", inclus:(x.inclus || []).length, exclus:(x.exclus || []).length});
        ap.forEach((x, id)=>{ const a = av.get(id); if (!a){ l.push("créé « "+String(x.nom || id).slice(0, 60)+" » "+JSON.stringify(x.droits || {})+" niveau "+(x.niveauMenu || "")); if (x.a2f === true) a2fOn.push(id); return; }
          if (JSON.stringify(a) === JSON.stringify(x)) return; const ch = [];
          Object.keys(Object.assign({}, a.droits, x.droits)).forEach(m=>{ if ((a.droits || {})[m] !== (x.droits || {})[m]) ch.push(m+" "+((a.droits || {})[m] || "—")+"→"+((x.droits || {})[m] || "—")); });
          ["niveauMenu","a2f","sensibles","persoMasque","cloture","reouverture"].forEach(k=>{ if (a[k] !== x[k]) ch.push(k+" "+String(a[k])+"→"+String(x[k])); });
          if (res(a) !== res(x)) ch.push("périmètre "+res(x).slice(0, 200)); if (JSON.stringify(a.menus || {}) !== JSON.stringify(x.menus || {})) ch.push("écrans"); if (JSON.stringify(a.actions || {}) !== JSON.stringify(x.actions || {})) ch.push("matrice des actions");
          l.push("modifié « "+String(x.nom || id).slice(0, 60)+" » — "+ch.join(" ; ")); if (x.a2f === true && a.a2f !== true) a2fOn.push(id); });
        av.forEach((a, id)=>{ if (!ap.has(id)) l.push("supprimé « "+String(a.nom || id).slice(0, 60)+" »"); });
        if (l.length) await audit(C.login, "profils.modifies", l.join(" | ").slice(0, 2000), ip);
        if (a2fOn.length){ const j0 = aujourdhui(), log = ((r.ref || {}).users || []).filter(u=>u && (a2fOn.indexOf(u.profilId) >= 0 || (u.deleg || []).some(d=>d && a2fOn.indexOf(d.profilId) >= 0 && d.du <= j0 && j0 <= d.au))).map(u=>String(u.login));
          for (const lg of log) await B.run("UPDATE sessions SET a2f_ok=0 WHERE lower(login)=lower(?) AND id<>?", lg, sess.sid);
          if (log.length) await audit(C.login, "a2f.exigee", log.length+" compte(s) : sessions ouvertes soumises à la double authentification", ip); } }
      /* correctif 23 : comptes — détail tracé (profil, activation, salarié, délégations, périmètre, double authentification) ;
         seules deux lignes « parametrage.modifie | users » apparaissaient */
      if (usersAvant && (r.refCles || []).indexOf("users") >= 0){ const av = new Map(usersAvant.filter(x=>x && x.id).map(x=>[x.id, x])), l = [], pn = id=>(((r.ref || {}).profils || []).find(x=>x && x.id === id) || {}).nom || id || "aucun";
        ((r.ref || {}).users || []).forEach(x=>{ if (!x || !x.id) return; const a = av.get(x.id); if (!a){ l.push("créé « "+String(x.login).slice(0, 40)+" » profil "+pn(x.profilId)); return; } const ch = [];
          if (String(a.login).trim() !== String(x.login).trim()) ch.push("identifiant « "+String(a.login).slice(0, 40)+" »→« "+String(x.login).slice(0, 40)+" »");
          if (a.profilId !== x.profilId) ch.push("profil "+pn(a.profilId)+"→"+pn(x.profilId)); if ((a.actif !== false) !== (x.actif !== false)) ch.push(x.actif !== false ? "activé" : "désactivé");
          if ((a.empId || "") !== (x.empId || "")) ch.push("salarié "+(a.empId || "—")+"→"+(x.empId || "—")); if (!!(a.a2f || a.a2fForce) !== !!(x.a2f || x.a2fForce)) ch.push("double authentification "+(x.a2f || x.a2fForce ? "imposée" : "non imposée"));
          if (JSON.stringify(a.deleg || []) !== JSON.stringify(x.deleg || [])) ch.push("délégations "+JSON.stringify((x.deleg || []).map(d=>[d.du, d.au, pn(d.profilId)])).slice(0, 200));
          if (JSON.stringify(a.delegPerim || []) !== JSON.stringify(x.delegPerim || [])) ch.push("délégations de périmètre "+JSON.stringify((x.delegPerim || []).map(g=>[g.a, g.du, g.au])).slice(0, 200));
          if (JSON.stringify(a.perim || {}) !== JSON.stringify(x.perim || {})){ const q = x.perim || {}; ch.push("périmètre "+(q.tout ? "tout le personnel" : JSON.stringify({sites:(q.sites || []).length, services:(q.depts || []).length, matricules:(q.mats || []).length, terminaux:(q.terms || []).length, equipe:q.equipe || ""}))); }
          if (ch.length) l.push("« "+String(x.login).slice(0, 40)+" » — "+ch.join(" ; ")); av.delete(x.id); });
        av.forEach(a=>l.push("supprimé « "+String(a.login).slice(0, 40)+" »"));
        if (l.length) await audit(C.login, "comptes.modifies", l.join(" | ").slice(0, 2000), ip); }
      /* correctif 26 : circuits — détail tracé (types, sites, services, niveaux) ; décisions et passages de niveau des demandes */
      if (circuitsAvant && (r.refCles || []).indexOf("circuits") >= 0){ const av = new Map(circuitsAvant.filter(x=>x && x.id).map(x=>[x.id, x])), l = [], d = x=>"types "+(x.types || []).join("+")+(x.sites && x.sites.length ? ", sites "+x.sites.join("+") : "")+(x.depts && x.depts.length ? ", services "+x.depts.join("+") : "")+", niveaux "+(x.niveaux || []).map(n=>(n.qui || "hier")+(n.min ? "≥"+n.min+"j" : "")+(n.delai ? "/"+n.delai+"j" : "")).join(" → ")+(x.siAbsent === "bloquer" ? ", bloquer si absent" : "");
        (((r.ref || {}).circuits) || []).forEach(x=>{ if (!x || !x.id) return; const a = av.get(x.id); av.delete(x.id); if (!a) l.push("créé « "+String(x.nom || x.id).slice(0, 60)+" » ("+d(x)+")"); else if (JSON.stringify(a) !== JSON.stringify(x)) l.push("modifié « "+String(x.nom || x.id).slice(0, 60)+" » : "+d(a)+" ⇒ "+d(x)); });
        av.forEach(a=>l.push("supprimé « "+String(a.nom || a.id).slice(0, 60)+" »"));
        if (l.length) await audit(C.login, "circuits.modifies", l.join(" | ").slice(0, 2000), ip); }
      for (const x of (r.decisionsDmd || []).slice(0, 500)) await audit(C.login, x.de ? "demande."+(x.vers !== x.de ? x.vers : "niveau") : "demande.creee", "demande "+x.id+" — "+x.mat+" ("+x.tt+", "+String(x.du || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1")+(x.au && x.au !== x.du ? " → "+String(x.au).replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1") : "")+")"+(x.de ? " : "+x.de+" niveau "+(x.nivAv + 1)+" → "+x.vers+" niveau "+(x.nivAp + 1) : " : niveau "+(x.nivAp + 1)), ip);
      /* correctif 25 : règles métier — détail tracé (activation, déclencheur, actions, sites) */
      if (reglesAvant && (r.refCles || []).indexOf("regles") >= 0){ const av = new Map(reglesAvant.filter(x=>x && x.id).map(x=>[x.id, x])), l = [], d = x=>(x.actif ? "active" : "inactive")+", "+x.declencheur+" → "+(x.actions || []).join("+")+((x.siteIds || []).length ? ", sites "+x.siteIds.join("+") : "");
        (((r.ref || {}).regles) || []).forEach(x=>{ if (!x || !x.id) return; const a = av.get(x.id); av.delete(x.id); if (!a) l.push("créée « "+String(x.nom || x.id).slice(0, 60)+" » ("+d(x)+")"); else if (JSON.stringify(a) !== JSON.stringify(x)) l.push("modifiée « "+String(x.nom || x.id).slice(0, 60)+" » : "+d(a)+" ⇒ "+d(x)); });
        av.forEach(a=>l.push("supprimée « "+String(a.nom || a.id).slice(0, 60)+" » ("+d(a)+")"));
        if (l.length) await audit(C.login, "regles.modifiees", l.join(" | ").slice(0, 2000), ip); }
      if (sitesAvant && (r.refCles || []).indexOf("sites") >= 0){ const av = new Map(sitesAvant.filter(x=>x && x.id).map(x=>[x.id, x])), ap = new Map(((r.ref || {}).sites || []).filter(x=>x && x.id).map(x=>[x.id, x])), l = [];
        ap.forEach((x, id)=>{ const a = av.get(id); if (!a){ l.push("créé "+(x.code || id)+" « "+String(x.nom || "").slice(0, 60)+" » ("+(x.tz || "")+")"); return; }
          const ch = ["code","nom","ville","tz","actif"].filter(k=>JSON.stringify(a[k]) !== JSON.stringify(x[k])).map(k=>k+" : "+String(a[k] === undefined ? "" : a[k]).slice(0, 60)+" → "+String(x[k] === undefined ? "" : x[k]).slice(0, 60));
          if (ch.length) l.push("modifié "+(x.code || id)+" — "+ch.join(" ; ")); });
        av.forEach((a, id)=>{ if (!ap.has(id)) l.push("supprimé "+(a.code || id)+" « "+String(a.nom || "").slice(0, 60)+" »"); });
        if (l.length) await audit(C.login, "sites.modifies", l.join(" | ").slice(0, 1500), ip); } }
    /* correctif 19 : import (ou son annulation) tracé par le serveur d'après ce qu'il a RÉELLEMENT écrit — auparavant
       seule une trace rédigée par le navigateur (« emp x2 »), refusée pour un compte au périmètre limité */
    if (paquet.import && typeof paquet.import === "object"){
      const im = paquet.import, txt = c => { const x = (r.parColl || {})[c]; return x ? c+" : "+x.crees+" créé(s), "+x.maj+" mis à jour"+(x.suppr ? ", "+x.suppr+" supprimé(s)" : "")+(x.mats.length ? " ("+x.mats.join(", ")+(x.crees+x.maj > x.mats.length ? "…" : "")+")" : "") : ""; };
      const lib = String(im.fichier || "").replace(/[\r\n]/g, " ").slice(0, 120);
      await audit(C.login, im.annulation ? "import.annule" : "import.execute", (im.cible === "badge" ? "badgeages" : "salariés")+(lib ? " — fichier « "+lib+" »" : "")+" — "+(["emps", "ptg", "users"].map(txt).filter(Boolean).join(" ; ") || "rien d'enregistré")+((r.ignores || []).length || (r.refusEmps || []).length ? " — refus : "+(r.refusEmps || []).map(x=>x && x.message).filter(Boolean).concat((r.ignores || []).filter(x=>!/^emps \(/.test(x) || /refusé\(s\)\)$/.test(x))).join(", ").slice(0, 600) : ""), ip);
    }
    if (r.conflits.length) await audit(C.login, "donnees.conflits", r.conflits.map(x=>x.type === "ref" ? "référentiel:"+x.cle : x.coll+":"+x.id).join(", ").slice(0, 500), ip);
    return json(res, 200, {ok:true, regles:r.regles || null, ignores:r.ignores, ecrits:r.ecrits, parColl:r.parColl || {}, refusPar:r.refusPar || {}, conflits:r.conflits, versions:r.versions, refusEmps:r.refusEmps || []});
  }

  /* ---- correctif 18 : restauration d'un élément de la corbeille par le serveur — l'élément est réinséré avec tous les
     contrôles d'un enregistrement normal (unicité, clôture, périmètre) et l'entrée n'est retirée qu'en cas de succès
     (auparavant retirée par le navigateur avant la réponse : un refus la faisait disparaître définitivement) ---- */
  if (p === "/api/v1/corbeille/restaurer" && req.method === "POST"){
    const b = await corpsJson(req), ref0 = await D.referentiel() || {}, {P} = await D.perimetreDe(ref0, C.login);
    if (!admin && !PERIM.peutEcrire(P.profil, "corbeille")) return erreur(res, 403, "Droit de restauration requis.");
    const e = (ref0.corbeille || []).find(x=>x && x.cid === String(b.cid || "")); if (!e) return erreur(res, 404, "Élément introuvable dans la corbeille.");
    const row = Object.assign({}, e.row); delete row.__v;
    let r;
    if (DONNEES_MOD.COLLS.indexOf(e.ent) >= 0){
      const av = await B.get("SELECT 1 x FROM enreg WHERE coll=? AND id=?", e.ent, String(row.id)); if (av) return erreur(res, 409, "Un élément de même identifiant existe déjà.");
      r = await D.synchroniser(C.login, {colls:{[e.ent]:{put:[row]}}}, {admin, recette:!!CONFIG.recette});
    } else {
      const liste = Array.isArray(ref0[e.ent]) ? ref0[e.ent] : null; if (!liste) return erreur(res, 400, "Type d'élément non restaurable.");
      if (liste.some(x=>x && x.id === row.id)) return erreur(res, 409, "Un élément de même identifiant existe déjà.");
      r = await D.synchroniser(C.login, {ref:{[e.ent]:liste.concat([row])}, basesRef:{[e.ent]:(ref0.__versions || {})[e.ent] || 0}}, {admin, recette:!!CONFIG.recette});
    }
    const ok = r && r.ok !== false && Number(r.ecrits || 0) + ((r.refCles || []).indexOf(e.ent) >= 0 ? 1 : 0) > 0 && !(r.conflits || []).length;
    if (!ok) return erreur(res, 409, "Restauration refusée : "+(((r && r.refusEmps) || []).map(x=>x && x.message).filter(Boolean).concat((r && r.ignores) || []).join(" ; ") || ((r && r.conflits || []).length ? "conflit de version" : "élément non enregistrable")));
    const ref1 = await D.referentiel() || {}; ref1.corbeille = (ref1.corbeille || []).filter(x=>!x || x.cid !== e.cid); ref1.__versions = ref1.__versions || {}; ref1.__versions.corbeille = Number(ref1.__versions.corbeille || 0) + 1;
    await B.run("UPDATE kv SET valeur=?, version=version+1, maj=?, par=? WHERE cle=?", JSON.stringify(ref1), new Date().toISOString(), C.login, CLE_APP);
    K.invalider([], ["corbeille"]); await audit(C.login, "corbeille.restauree", e.ent+" "+(e.nom || row.id), ip);
    return json(res, 200, {ok:true});
  }
  /* ---- correctif 15 : Tableau de bord des demandes — demandes DÉCIDÉES ou DÉPOSÉES sur la période (quelle que soit la
     date d'absence : une régularisation acceptée ce mois-ci pour une absence de février y figure), périmètre du compte,
     site et nom des demandeurs joints (fiches non chargées en grand effectif) ---- */
  if (p === "/api/v1/demandes/bord" && req.method === "GET"){
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {};
    if (!admin && !({lecture:1, saisie:2, validation:3, config:4}[(pr.droits || {}).ABS] >= 1)) return erreur(res, 403, "Droit de consultation des absences requis.");
    const du = u.searchParams.get("du"), au = u.searchParams.get("au");
    if (!dateOk(du) || !dateOk(au) || du > au) return erreur(res, 400, "Période invalide.");
    if (ajoutJours(du, 3*366) < au) return erreur(res, 400, "Période limitée à 3 ans.");
    const mois = []; for (let k = du.slice(0, 7); k <= au.slice(0, 7) && mois.length < 40; ){ mois.push(k); const y = +k.slice(0, 4), m = +k.slice(5, 7); k = (m === 12 ? (y+1)+"-01" : y+"-"+String(m+1).padStart(2, "0")); }
    const w = [], a = [];
    mois.forEach(m=>{ w.push("data LIKE ?", "data LIKE ?"); a.push('%"valideLe":"'+m+'%', '%"creeLe":"'+m+'%'); });
    let sql = "SELECT data FROM enreg WHERE coll='dmd' AND ("+w.join(" OR ")+")";
    if (P.set !== null){ const arr = Array.from(P.set); if (B.type === "pg"){ sql += " AND mat = ANY(?)"; a.push(arr); } else { sql += " AND mat IN (SELECT value FROM json_each(?))"; a.push(JSON.stringify(arr)); } }
    const dans = k => !!k && String(k).slice(0, 10) >= du && String(k).slice(0, 10) <= au;
    const l = (await B.all(sql, ...a)).map(r=>JSON.parse(r.data)).filter(x=>dans(x.valideLe) || dans(x.creeLe) || (x.hist || []).some(h=>h && dans(h.d) && /^(accepte|refuse|annule)$/.test(h.action)));
    const emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e])), infos = {};
    l.forEach(x=>{ const e = parMat.get(String(x.mat)); if (e && !infos[x.mat]) infos[x.mat] = {siteId:e.siteId || "", nom:e.nom || "", prenom:e.prenom || ""}; });
    return json(res, 200, {dmd:l, emps:infos, du, au});
  }
  /* ---- correctif 13 : audit applicatif (corrections de pointage, décisions, sécurité, clôtures…) servi par page ----
     L'écran Audit ne montrait que les traces chargées dans le navigateur (≈ 2 mois, hier et aujourd'hui seulement en
     grand effectif, 5 000 au plus). Périmètre du compte appliqué ; traces sans matricule réservées au droit Système. */
  if ((p === "/api/v1/audit-app" || p === "/api/v1/journal-app") && req.method === "GET"){
    const coll = p === "/api/v1/journal-app" ? "journal" : "audit";
    /* correctif 16 : ordre à la minute près dans une même journée (avant : identifiants aléatoires) */
    const ORDRE_HEURE = B.type === "pg" ? "COALESCE(data::jsonb->>'at', data::jsonb->>'ts', '')" : "COALESCE(json_extract(data,'$.at'), json_extract(data,'$.ts'), '')";
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {};
    const rg = x => ({lecture:1, saisie:2, validation:3, config:4}[x] || 0);
    const sysLu = admin || PERIM.niveauProfil(pr) === "admin" || rg((pr.droits || {}).SYS) >= 1, ptgLu = sysLu || rg((pr.droits || {}).PTG) >= 1;
    if (!ptgLu || (coll === "journal" && !sysLu)) return erreur(res, 403, "Droit de consultation requis.");
    const q = Object.fromEntries(u.searchParams.entries()), w = ["coll='"+coll+"'"], a = [];
    /* correctif 16 : date invalide refusée (elle était ignorée : toute la base revenait) */
    if ((q.du && !dateOk(q.du)) || (q.au && !dateOk(q.au)) || (q.du && q.au && q.du > q.au)) return erreur(res, 400, "Période invalide (dates jj/mm/aaaa, début avant la fin).");
    if (dateOk(q.du)){ w.push("d >= ?"); a.push(q.du); }
    if (dateOk(q.au)){ w.push("d <= ?"); a.push(q.au); }
    /* correctif 16 : journal — filtre par nature (règles, imports, accueil, système) et par site */
    if (coll === "journal" && q.nature){ if (q.nature === "regle"){ w.push("data LIKE ?"); a.push('%"regleId":%'); } else { w.push("data LIKE ?"); a.push('%"type":"'+String(q.nature).replace(/[%_"]/g, "").slice(0, 20)+'"%'); } }
    if (q.site){ const ms = (await D.employes()).filter(e=>e.siteId === q.site).map(e=>String(e.mat)); if (B.type === "pg"){ w.push("mat = ANY(?)"); a.push(ms); } else { w.push("mat IN (SELECT value FROM json_each(?))"); a.push(JSON.stringify(ms)); } }
    /* onglet Pointages › Audit (droit Pointage seul) : corrections et décisions uniquement */
    const types = coll === "journal" ? null : (!sysLu || q.portee === "pointage") ? ["pointage", "decision"] : (q.type ? [String(q.type).slice(0, 40)] : null);
    if (types) { w.push("("+types.map(()=>"data LIKE ?").join(" OR ")+(types.indexOf("pointage") >= 0 ? " OR data NOT LIKE ?" : "")+")"); types.forEach(t=>a.push('%"type":"'+t.replace(/[%_"]/g, "")+'"%')); if (types.indexOf("pointage") >= 0) a.push('%"type":%'); }
    if (q.mat){ w.push("mat = ?"); a.push(String(q.mat)); }
    if (q.q && String(q.q).trim().length >= 2){ let x = String(q.q).trim(); const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(x); if (m) x = m[3]+"-"+m[2]+"-"+m[1]; w.push("lower(data) LIKE ?"); a.push("%"+x.toLowerCase().replace(/[%_]/g, "").slice(0, 80)+"%"); }
    if (!sysLu) w.push("mat IS NOT NULL AND mat<>'' AND mat<>'—'");
    if (P.set !== null){ const arr = Array.from(P.set); if (B.type === "pg"){ w.push("(mat IS NULL OR mat='' OR mat = ANY(?))"); a.push(arr); } else { w.push("(mat IS NULL OR mat='' OR mat IN (SELECT value FROM json_each(?)))"); a.push(JSON.stringify(arr)); } }
    const wh = " WHERE "+w.join(" AND "), lim = Math.min(500, Math.max(1, Number(q.limit) || 100)), off = Math.max(0, Number(q.offset) || 0);
    if (q.format === "csv"){
      if (!admin && ((pr.actions || {})[coll === "journal" ? "journal" : q.portee === "pointage" ? "ptg" : "audit"] || {}).exporter === false) return erreur(res, 403, "Droit d'export requis.");
      const l = (await B.all("SELECT data FROM enreg"+wh+" ORDER BY d DESC, "+ORDRE_HEURE+" DESC, id DESC LIMIT 200001", ...a)).map(r=>JSON.parse(r.data));
      const tronque = l.length > 200000; if (tronque) l.length = 200000;
      await audit(C.login, coll+".exporte", (coll === "journal" ? "journal des événements" : "audit applicatif")+" : "+l.length+" ligne(s)", ip);
      /* correctif 16 : une valeur commençant par = + - @ (formule) est neutralisée à l'ouverture dans un tableur */
      const cel = v => { let x = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(x)) x = "'"+x; return /[;"\r\n]/.test(x) ? '"'+x.replace(/"/g, '""')+'"' : x; };
      const fr = k => String(k||"").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1");
      const EN = q.lang === "en", AR = q.lang === "ar";
      const txt = "\uFEFF"+(coll === "journal"
        ? [EN ? "Time;Type;Staff no.;Employee;Event;Trigger;Actions done;Without effect;By" : AR ? "التوقيت;النوع;المعرف;العون;الحدث;المُطلِق;الإجراءات المنجزة;دون أثر;بواسطة" : "Horodatage;Type;Matricule;Salarié;Événement;Déclencheur;Actions faites;Sans effet;Par"].concat(l.map(x=>{
          /* correctif 25 : valeurs traduites (type, déclencheur, actions) et colonne « sans effet » */
          const L = EN ? "en" : AR ? "ar" : "fr", TR = {regle:{fr:"Règle", en:"Rule", ar:"قاعدة"}, systeme:{fr:"Système", en:"System", ar:"النظام"}, import:{fr:"Import", en:"Import", ar:"توريد"}, home:{fr:"Accueil", en:"Home", ar:"الرئيسية"},
            "employe.sorti":{fr:"Sortie d'un salarié", en:"Employee leaves", ar:"مغادرة عون"}, "employe.mutation":{fr:"Mutation", en:"Transfer", ar:"نقلة"}, "employe.hors_effectif":{fr:"Passage hors effectif", en:"Moved out of headcount", ar:"خارج التعداد"}, "employe.cree":{fr:"Création d'un salarié", en:"Employee created", ar:"إحداث عون"},
            desac_compte:{fr:"Désactiver le compte", en:"Disable the account", ar:"تعطيل الحساب"}, desac_portail:{fr:"Désactiver le portail", en:"Disable the portal", ar:"تعطيل البوابة"}, bloquer_badge:{fr:"Bloquer le badge", en:"Block the badge", ar:"حظر الشارة"}, retirer_acces:{fr:"Retirer les accès", en:"Remove access", ar:"سحب النفاذ"},
            retirer_bio:{fr:"Retirer la biométrie", en:"Remove biometrics", ar:"سحب البصمة"}, notif_rh:{fr:"Notifier les RH", en:"Notify HR", ar:"إعلام الموارد البشرية"}, archiver:{fr:"Archiver", en:"Archive", ar:"أرشفة"}, maj_workflows:{fr:"Circuits", en:"Workflows", ar:"المسارات"},
            sortie_non_traitee:{fr:"Sortie non traitée", en:"Departure not processed", ar:"مغادرة غير معالجة"}, reintegration:{fr:"Sortie annulée : effets à rétablir", en:"Departure cancelled: effects to restore", ar:"أُلغيت المغادرة: آثار يجب استرجاعها"}};
          const tr = v => (TR[v] && TR[v][L]) || v || "", liste = l2 => (Array.isArray(l2) ? l2 : []).map(tr).join(", ");
          return [fr(x.ts || x.at), tr(x.type || (x.regleId ? "regle" : "")), x.mat, x.employe, x.regleNom || x.msg || tr(x.code) || x.action || "", tr(x.declencheur), (Array.isArray(x.codes) ? liste(x.codes) : (x.actions || []).join(", "))+((x.refuses || []).length ? " ("+liste(x.refuses)+" : "+(EN ? "not done" : AR ? "لم تُنجز" : "non faites")+")" : ""), liste(x.sansEffet), x.par].map(cel).join(";"); }))
        : ["Horodatage;Compte;Type;Matricule;Journée;Avant;Après;Motif;Lot"].concat(l.map(x=>[fr(x.ts), x.user, x.type || "pointage", x.mat, fr(x.date), x.avant, x.apres, x.motif, x.lot ? "oui" : ""].map(cel).join(";")))).join("\r\n")+(tronque ? "\r\n"+cel("… export limité aux 200 000 entrées les plus récentes : réduisez la période") : "");
      entetes(res, true); res.writeHead(200, {"Content-Disposition":"attachment; filename=\""+coll+"-"+(q.du || "")+"_"+(q.au || aujourdhui())+".csv\"", "Content-Type":"text/csv; charset=utf-8"}); return res.end(txt);
    }
    const total = Number((await B.get("SELECT COUNT(*) n FROM enreg"+wh, ...a)).n);
    const lignes = (await B.all("SELECT data FROM enreg"+wh+" ORDER BY d DESC, "+ORDRE_HEURE+" DESC, id DESC LIMIT "+lim+" OFFSET "+off, ...a)).map(r=>JSON.parse(r.data));
    return json(res, 200, {lignes, total, offset:off, limit:lim});
  }
  /* ---- travaux en arrière-plan ---- */
  /* 56.33.11 : export d'états (en direct ou en tâche de fond) réservé au droit de consultation des états (matrice ETA) */
  const droitEtats = async () => { if (admin) return true; const {P} = await D.perimetreDe(await D.referentielLecture() || {}, C.login);
    return ({lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).ETA] || 0) >= 1; };
  if (p === "/api/v1/travaux" && req.method === "POST" && !(await droitEtats())) return erreur(res, 403, "Droit de consultation des états requis.");
  if (p === "/api/v1/travaux" && req.method === "POST"){
    const b = await corpsJson(req, 2e6);
    if (b.type !== "etat" || !b.etat || typeof b.etat !== "object" || !Array.isArray(b.etat.champs)) return erreur(res, 400, "Travail inconnu.");
    /* correctif 13 : mêmes contrôles que l'écran États, appliqués par le serveur — menu masqué, action « exporter »
       retirée, liste des états autorisés du profil ; la définition est relue dans le référentiel (seules les options
       de la visualisation sont reprises du navigateur, contrôlées) ; période contrôlée (dates valides, 3 ans au plus) */
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = admin ? null : (P.profil || {});
    if (pr){
      if ((pr.menus || {}).etats === "masque") return erreur(res, 403, "Écran États masqué pour votre profil.");
      /* correctif 14 : droit selon l'usage — aperçu (lecture), impression, export (Excel, texte, CSV) */
      const usageB = b.format === "blocs-leger" ? "lire" : (b.usage === "imprimer" ? "imprimer" : "exporter");
      if (usageB !== "lire" && ((pr.actions || {}).etats || {})[usageB] === false) return erreur(res, 403, usageB === "imprimer" ? "Droit d'impression des états requis." : "Droit d'export des états requis.");
      if (Array.isArray(pr.etats) && pr.etats.length && pr.etats.indexOf(String(b.etat.id || "")) < 0) return erreur(res, 403, "État non autorisé pour votre profil.");
    }
    const stocke = (ref.etats || []).find(x=>x && x.id === b.etat.id);
    const rangEta = admin ? 4 : ({lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).ETA] || 0);
    /* état non encore enregistré (atelier) : seulement pour qui peut le créer */
    if (!stocke && rangEta < 2) return erreur(res, 403, "État inconnu : enregistrez-le d'abord.");
    /* qui peut modifier les états (saisie et plus) exporte la définition de l'atelier telle qu'elle est à l'écran */
    const libre = !stocke || rangEta >= 2;
    const def = JSON.parse(JSON.stringify(libre ? b.etat : stocke)), arits = new Set((ref.arits || []).map(a=>a.id));
    const PERS = ["jour", "semaine", "semainep", "mois", "ev", "annee", "libre"];
    if (!libre){
      /* correctif 14 : en consultation, les compteurs de l'état enregistré seulement (on peut en retirer, pas en ajouter) */
      if (Array.isArray(b.etat.champs)) def.champs = Array.from(new Set(b.etat.champs.map(String))).filter(id=>(stocke.champs || []).indexOf(id) >= 0);
      if (PERS.indexOf(b.etat.periode) >= 0) def.periode = b.etat.periode;
      def.plage = !!b.etat.plage;
      ["ref", "from", "to"].forEach(k=>{ if (b.etat[k] === undefined || b.etat[k] === "" || b.etat[k] === null) delete def[k]; else if (dateOk(b.etat[k])) def[k] = b.etat[k]; });
      if (b.etat.stats && typeof b.etat.stats === "object") def.stats = {total:!!b.etat.stats.total, moy:!!b.etat.stats.moy, min:!!b.etat.stats.min, max:!!b.etat.stats.max};
    }
    def.champs = Array.from(new Set((def.champs || []).map(String))).filter(id=>arits.has(id)).slice(0, 200);
    if (!def.champs.length) return erreur(res, 400, "Aucun compteur valide dans l'état.");
    if (PERS.indexOf(def.periode) < 0) def.periode = "mois";
    if (!dateOk(b.du) || !dateOk(b.au) || b.du > b.au) return erreur(res, 400, "Période invalide (dates jj/mm/aaaa, début avant la fin).");
    if (ajoutJours(b.du, 3*366) < b.au) return erreur(res, 400, "Période limitée à 3 ans.");
    const fl = b.filtres && typeof b.filtres === "object" ? b.filtres : {}, filtres = {dept:String(fl.dept || ""), mat:String(fl.mat || ""), site:String(fl.site || "")};
    const format = b.format === "blocs" || b.format === "blocs-leger" ? b.format : "csv";
    const lang = ["fr","en","ar"].indexOf(b.lang) >= 0 ? b.lang : "fr";
    try { const tr = lancerTravail(C.login, "etat", {titre:(def.nom||"État")+" "+b.du.split("-").reverse().join("/")+" → "+b.au.split("-").reverse().join("/"), etat:def, du:b.du, au:b.au, filtres, format, lang, apercu:format === "blocs-leger"}); if (!tr.apercu) await audit(C.login, "travail.lance", tr.titre, ip); return json(res, 200, tr); }
    catch(e){ return erreur(res, e.code === 429 ? 429 : 400, e.message); }
  }
  if (p === "/api/v1/travaux" && req.method === "GET") return json(res, 200, {travaux:Array.from(TRAVAUX.values()).filter(x=>x.login === C.login && !x.apercu).sort((a,b)=>a.cree < b.cree ? 1 : -1).slice(0, 20)});
  if ((m = /^\/api\/v1\/travaux\/([0-9a-f]{16})(\/fichier)?$/.exec(p))){
    const tr = TRAVAUX.get(m[1]);
    if (!tr || (tr.login !== C.login && !admin)) return erreur(res, 404, "Travail introuvable.");
    if (!m[2]) return json(res, 200, tr);
    if (tr.etat !== "termine") return erreur(res, 409, "Travail non terminé.");
    const f = path.join(D_TRAV, tr.id+".csv"); if (!fs.existsSync(f)) return erreur(res, 410, "Fichier expiré.");
    if (!tr.apercu) await audit(C.login, "travail.telecharge", tr.titre, ip);
    if (/^blocs/.test(tr.format || "")){ entetes(res, true); res.writeHead(200, {"Content-Type":"application/json; charset=utf-8"}); return fs.createReadStream(f).pipe(res); }
    entetes(res, true); res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\""+(tr.titre||"etat").replace(/[^A-Za-z0-9._-]+/g, "_")+".csv\""});
    return fs.createReadStream(f).pipe(res);
  }
  /* ---- v56.4 : migration d'une base PostgreSQL existante vers le stockage partitionné ---- */
  if (p === "/api/v1/systeme/partitionnement" && req.method === "GET"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); return json(res, 200, await partitionneur().diagnostic()); }
  if ((p === "/api/v1/systeme/partitionnement/lancer" || p === "/api/v1/systeme/partitionnement/terminer") && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    try { return json(res, 200, p.endsWith("lancer") ? await partitionneur().lancer(C.login) : await partitionneur().terminer(C.login)); }
    catch(e){ return erreur(res, e.code || 500, e.message); }
  }
  /* ---- v56.27 : anniversaire de l'utilisateur connecté — lu dans SA fiche salarié (date de naissance), jamais
     celles des autres ; la réponse ne contient ni la date ni l'année ---- */
  if (p === "/api/v1/anniversaire" && req.method === "GET"){
    const ref = await D.referentielLecture() || {}, u = (ref.users||[]).find(z=>z.login === C.login), e = u && u.empId ? (await D.employes()).find(z=>z.id === u.empId) : null;
    let dn = e && /^\d{4}-\d{2}-\d{2}$/.test(e.naissance || "") ? e.naissance : null;
    if (!dn && e && e.cf){ const ch = (ref.champs||[]).find(c=>/naiss|birth|ddn/i.test((c.code||"")+" "+(c.nom||""))); const v = ch ? String(e.cf[ch.code]||"") : "";
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) || /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); if (m) dn = m[0].indexOf("/") > 0 ? m[3]+"-"+m[2]+"-"+m[1] : m[0]; }
    const a = aujourdhui(), jm = a.slice(5), bis = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const ok = !!dn && (dn.slice(5) === jm || (dn.slice(5) === "02-29" && jm === "02-28" && !bis(Number(a.slice(0, 4)))));
    return json(res, 200, {anniversaire:ok, prenom:ok && e ? (e.prenom || "") : ""});
  }
  /* ---- v56.14 : journal des badgeages servi par page (grand effectif) ---- */
  /* ---- correctif 20 : clôture de période établie par le serveur. Auparavant le navigateur écrivait la rubrique
     « clotures » avec son propre début, sa fin, son auteur, sa date et son empreinte : une clôture future ou sur un seul
     jour était acceptée (irréversible), un compte limité à un site clôturait l'entreprise sans le drapeau « clôture »,
     les demandes, corrections et badgeages en attente étaient enfermés, et aucune trace serveur n'était écrite.
     Ici : droits (administrateur, ou drapeau « clôture » + Pointages « configuration » + périmètre entreprise + matrice),
     début imposé (lendemain de la dernière clôture ; première clôture : date choisie), fin antérieure à aujourd'hui,
     contrôles complets sur toute la période et toute l'entreprise, sceau calculé par le serveur (v3, en flux, sans
     bloquer les autres requêtes), auteur et date du serveur, audit. Une seule clôture à la fois. ---- */
  /* ---- correctif 22 : aperçu du périmètre d'un profil calculé par le SERVEUR (règle réellement appliquée) — l'aperçu de
     l'écran était calculé dans le navigateur avec une autre règle (niveau administrateur ou simple, profil sans règle,
     périmètre propre du compte) et sur les seules fiches chargées (faux en grand effectif) ---- */
  if (p === "/api/v1/profils/apercu" && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const b = await corpsJson(req, 2e6), pr = b.profil && typeof b.profil === "object" && !Array.isArray(b.profil) ? b.profil : null;
    if (!pr || !/^[A-Za-z0-9_.:-]{1,80}$/.test(String(pr.id))) return erreur(res, 400, "Profil attendu.");
    const ref = await D.referentielLecture() || {}, emps = await D.employes(), ID = "__apercu__";
    const comptes = (ref.users || []).filter(x=>x && (x.profilId === pr.id || (x.deleg || []).some(d=>d && d.profilId === pr.id)));
    const cible = b.login ? (ref.users || []).find(x=>x && String(x.login).toLowerCase() === String(b.login).toLowerCase()) : null;
    const u = cible ? Object.assign({}, cible, {login:ID, profilId:pr.id, deleg:[]}) : {id:ID, login:ID, profilId:pr.id, empId:"", perim:{}, actif:true};
    const doc = Object.assign({}, ref, {emps, profils:(ref.profils || []).filter(x=>x && x.id !== pr.id).concat([pr]), users:(ref.users || []).concat([u])});
    let P; try { P = PERIM.perimetre(doc, ID); } catch(e){ return erreur(res, 400, "Profil invalide : "+e.message); }
    const niv = PERIM.niveauProfil(pr), q = (cible && cible.perim) || {}, perimPropre = !!(q.tout || (q.depts||[]).length || (q.mats||[]).length || (q.sites||[]).length || (q.terms||[]).length || q.equipe);
    const regle = pr.mode === "liste" || (pr.sites||[]).length || (pr.depts||[]).length || (pr.inclus||[]).length || Object.keys(pr.filtres||{}).some(k=>pr.filtres[k]);
    const mats = P.set === null ? null : Array.from(P.set), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    const ex = (mats === null ? emps : mats.map(m=>parMat.get(String(m))).filter(Boolean)).slice(0, 12).map(e=>({mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), siteId:e.siteId || ""}));
    return json(res, 200, {n:mats === null ? emps.length : mats.length, tous:mats === null, total:emps.length, regle:niv === "admin" ? "admin" : niv === "simple" ? "simple" : perimPropre ? "compte" : regle ? "profil" : "equipe", exemples:ex, comptes:comptes.length, login:cible ? cible.login : null});
  }
  if (p === "/api/v1/clotures" && req.method === "POST"){
    const ref0 = await D.referentielLecture() || {}, dr = await droitCloture(ref0, C, admin);
    if (!dr.ok) return erreur(res, 403, dr.motif);
    const b = await corpsJson(req, 1e5), jusqu = String(b.jusqu || ""), der = clotDerniere(ref0);
    if (!jourValideSrv(jusqu)) return erreur(res, 400, "Date de fin de clôture invalide.");
    if (jusqu >= aujourdhui()) return erreur(res, 400, "Une clôture porte sur des journées terminées : au plus tard la veille.");
    if (der && jusqu <= der) return erreur(res, 409, "La période est déjà clôturée jusqu'au "+jjmmaaaa(der)+".");
    let du = der ? ajoutJours(der, 1) : String(b.du || "");
    if (!der && !jourValideSrv(du)) return erreur(res, 400, "Première clôture : date de début requise.");
    if (du > jusqu) return erreur(res, 400, "La date de début dépasse la date de fin.");
    if (!der){ const avant = await B.get("SELECT MIN(d) d FROM enreg WHERE coll IN ('ptg','abs','corrections') AND d IS NOT NULL AND d < ?", du);
      if (avant && avant.d && b.confirmerAnterieur !== true) return json(res, 409, {erreur:"anterieur", message:"Des données existent avant le "+jjmmaaaa(du)+" (depuis le "+jjmmaaaa(avant.d)+") : elles seront aussi fermées. Choisissez le "+jjmmaaaa(avant.d)+" comme début, ou confirmez.", depuis:avant.d}); }
    if (CLOTURE_EN_COURS) return erreur(res, 409, "Une clôture est déjà en cours.");
    CLOTURE_EN_COURS = true;
    try {
      const bl = await bloquantsComplets(du, jusqu);
      const nb = Object.keys(bl).filter(k=>k !== "inconnus").reduce((x, k)=>x + (bl[k] || 0), 0);
      if (nb) return json(res, 409, {erreur:"bloquants", message:"Clôture impossible : "+libBloquants(bl)+" entre le "+jjmmaaaa(du)+" et le "+jjmmaaaa(jusqu)+".", bloquants:bl, du, jusqu});
      const t0 = Date.now(), sc = await sceauV3(du, jusqu, null);
      const u = (ref0.users || []).find(x=>x && String(x.login).toLowerCase() === C.login.toLowerCase()) || {};
      const n = new Date(), z = v => String(v).padStart(2, "0");
      const rec = {id:"clot_"+crypto.randomBytes(8).toString("hex"), du, jusqu, par:u.nom || C.login, login:C.login, le:aujourdhui()+" "+z(n.getHours())+":"+z(n.getMinutes()), empreinte:sc.hash, algo:"SHA-256", sceau:3,
        nbPtg:sc.nb.ptg, nbDec:sc.nb.decisions, nbAbs:sc.nb.absences, nbRegles:sc.nb.regles, nbEmps:sc.nb.salaries, serveur:true, inconnus:bl.inconnus || 0};
      if (b.resume && typeof b.resume === "object"){ const r = {}; ["pct","retards","absences","hsDet","hsVal","hsAtt"].forEach(k=>{ if (Number.isFinite(Number(b.resume[k]))) r[k] = Number(b.resume[k]); }); rec.resume = r; }
      let version = 0;
      await B.transaction(async ()=>{
        const row = await B.get("SELECT valeur FROM kv WHERE cle=?", CLE_APP), ref = JSON.parse(row.valeur);
        if (clotDerniere(ref) !== der) throw Object.assign(new Error("Une autre clôture vient d'être enregistrée : rechargez."), {code:409});
        ref.clotures = (ref.clotures || []).concat([rec]); ref.__versions = ref.__versions || {}; version = ref.__versions.clotures = Number(ref.__versions.clotures || 0) + 1;
        await B.run("UPDATE kv SET valeur=?, version=version+1, maj=?, par=? WHERE cle=?", JSON.stringify(ref), new Date().toISOString(), C.login, CLE_APP);
      });
      try { await K.invalider([], ["clotures"]); } catch(e){ journal("invalidation : "+e.message); }
      await audit(C.login, "cloture.creee", "du "+jjmmaaaa(du)+" au "+jjmmaaaa(jusqu)+" — sceau v3 SHA-256 "+sc.hash+" — "+sc.nb.ptg+" badgeage(s), "+sc.nb.absences+" absence(s), "+sc.nb.decisions+" décision(s), "+sc.nb.salaries+" salarié(s) ("+(Date.now() - t0)+" ms)"+(bl.inconnus ? " — "+bl.inconnus+" badgeage(s) d'identifiant inconnu non rattaché(s)" : ""), ip);
      return json(res, 200, {ok:true, cloture:rec, version, clotures:((await D.referentielLecture() || {}).clotures || [])});
    } catch(e){ return erreur(res, e.code === 409 ? 409 : 500, e.message); }
    finally { CLOTURE_EN_COURS = false; }
  }
  /* vérification d'une clôture : le sceau est recalculé par le serveur sur les données actuelles */
  if (p === "/api/v1/clotures/verifier" && req.method === "GET"){
    const ref = await D.referentielLecture() || {}, dr = await droitCloture(ref, C, admin, true);
    if (!dr.ok) return erreur(res, 403, dr.motif);
    const rec = (ref.clotures || []).find(x=>x && x.id === String(u.searchParams.get("id") || ""));
    if (!rec || !rec.empreinte) return erreur(res, 404, "Clôture introuvable ou sans sceau.");
    let hash;
    if (rec.sceau === 3) hash = (await sceauV3(rec.du, rec.jusqu, null)).hash;
    else { const c = await K.contenuPeriode(rec.du || rec.jusqu, rec.jusqu);
      if (rec.sceau === 2){ c.regles = (ref.reglesV||[]).filter(x=>x && x.statut === "publiee" && x.valid_from <= rec.jusqu && (!x.valid_to || x.valid_to >= (rec.du || rec.jusqu))).map(x=>[x.id, x.code, x.niveau, String(x.cible), JSON.stringify(x.valeur), x.valid_from, x.valid_to||""]).sort((a, b)=>a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); c.perimetre = "entreprise"; c.version = 2; }
      hash = crypto.createHash("sha256").update(JSON.stringify(c), "utf8").digest("hex"); }
    await audit(C.login, "cloture.verifiee", "du "+jjmmaaaa(rec.du || rec.jusqu)+" au "+jjmmaaaa(rec.jusqu)+" — "+(hash === rec.empreinte ? "intacte" : "ÉCART : sceau "+rec.empreinte.slice(0, 16)+"…, recalculé "+hash.slice(0, 16)+"…"), ip);
    return json(res, 200, {ok:hash === rec.empreinte, attendu:rec.empreinte, calcule:hash, sceau:rec.sceau || 1});
  }
  /* dossier de clôture vérifiable par un tiers : 1re ligne = description (JSON), puis le texte exact scellé —
     SHA-256 de tout ce qui suit la première ligne = empreinte de la clôture. Envoyé en flux (pas de copie en mémoire). */
  if (p === "/api/v1/clotures/dossier" && req.method === "GET"){
    const ref = await D.referentielLecture() || {}, dr = await droitCloture(ref, C, admin, true, "exporter");
    if (!dr.ok) return erreur(res, 403, dr.motif);
    const rec = (ref.clotures || []).find(x=>x && x.id === String(u.searchParams.get("id") || ""));
    if (!rec || rec.sceau !== 3) return erreur(res, 404, "Dossier disponible pour les clôtures scellées par le serveur (v3).");
    res.writeHead(200, {"Content-Type":"application/x-ndjson; charset=utf-8", "Content-Disposition":'attachment; filename="FIWAKTI-cloture-'+rec.du+'_'+rec.jusqu+'.ndjson"', "Cache-Control":"no-store"});
    res.write(JSON.stringify({application:"FIWAKTI", entreprise:CONFIG.entreprise || "", genere:new Date().toISOString(), par:C.login, cloture:rec,
      algorithme:"SHA-256 (hexadécimal) du texte UTF-8 qui suit cette première ligne, retours à la ligne compris ; sections #salaries [mat, entrée, sortie, historique du calendrier], #ptg [mat, horodatage, sens, terminal, origine, corrigé], #absences [mat, date, fin, type], #decisions [clé, décision, minutes], #regles [id, code, niveau, cible, valeur, effet] ; lignes triées par matricule, date et identifiant"})+"\n");
    const sc = await sceauV3(rec.du, rec.jusqu, txt=>res.write(txt));
    res.end();
    await audit(C.login, "cloture.dossier", "du "+jjmmaaaa(rec.du)+" au "+jjmmaaaa(rec.jusqu)+" — "+(sc.hash === rec.empreinte ? "conforme au sceau" : "ÉCART avec le sceau"), ip);
    return;
  }
  /* ---- correctif 19 : import de badgeages par le serveur, par lots (5 000 lignes au plus par appel). Auparavant tout le
     fichier partait dans un seul enregistrement global : 100 000 lignes bloquaient le serveur 15 min, une réponse 503
     arrivait alors que tout était écrit (conflits au renvoi), un badgeage du terminal à la même minute était supprimé ou
     doublé (identifiants aléatoires), et les refus (clôture, périmètre) n'étaient pas rendus ligne par ligne.
     Chaque ligne est contrôlée ici (salarié par matricule ou badge, périmètre, présence à la date, période clôturée,
     horodatage réel et pas dans le futur, doublon dans le fichier ou avec un badgeage existant à ±1 min), puis passe
     par la chaîne d'ingestion (traçabilité, alternance du sens, date de travail) avec un identifiant stable :
     réimporter le même fichier ne crée rien en double. ---- */
  if (p === "/api/v1/pointages/import" && req.method === "POST"){
    const b = await corpsJson(req, 20e6), lignes = Array.isArray(b.lignes) ? b.lignes : null;
    if (!lignes || !lignes.length) return erreur(res, 400, "Aucune ligne à importer.");
    if (lignes.length > 5000) return erreur(res, 413, "5 000 lignes au plus par envoi.");
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {};
    const RG = {lecture:1, saisie:2, validation:3, config:4};
    const acteKo = v => { const m = (pr.menus || {})[v], a = ((pr.actions || {})[v] || {}).creer; return m === "masque" || m === "lecture" || a === false; };
    if (!admin && (!(RG[(pr.droits || {}).PTG] >= 2) || acteKo("ptg") || acteKo("import"))) return erreur(res, 403, "Droit de saisie des pointages et de création à l'import requis.");
    const emps = await D.employes(), parMat = new Map(), parBadge = new Map();
    emps.forEach(e=>{ parMat.set(String(e.mat), e); const bg = String(e.badge || "").trim(); if (bg && !/^BLK:/.test(bg)) parBadge.set(bg, e); });
    const clot = (ref.clotures || []).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
    const tzDe = e => { const si = (ref.sites || []).find(s=>s && s.id === e.siteId); return (si && si.tz) || INGESTION.FUSEAU_DEFAUT || "Africa/Tunis"; };
    const refus = [], vus = new Set(), retenues = [];
    const jourOk = j => { const d = new Date(j+"T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j; };
    lignes.forEach((x, i)=>{
      const l = Number.isFinite(+(x && x.l)) ? +x.l : i + 1, ko = m => refus.push({l, motif:m});
      if (!x || typeof x !== "object") return ko("ligne illisible");
      const mat = String(x.mat == null ? "" : x.mat).trim(), bg = String(x.badge == null ? "" : x.badge).trim();
      const e = mat ? parMat.get(mat) : bg ? parBadge.get(bg) : null;
      if (!mat && !bg) return ko("matricule absent");
      if (!e || (!admin && P.set !== null && !P.set.has(String(e.mat)))) return ko((mat ? "matricule « "+mat.slice(0, 30) : "badge « "+bg.slice(0, 30))+" » inconnu ou hors de votre périmètre");
      const tz = tzDe(e), brut = String(x.ts || "").trim();
      const abs = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i.exec(brut);
      let local = null;
      if (abs){ const ms = Date.parse(abs[1]+"T"+abs[2]+(abs[3].toUpperCase() === "Z" ? "Z" : abs[3].slice(0, 3)+":"+abs[3].slice(-2))); if (!isNaN(ms)) local = INGESTION.utcVersLocal(new Date(ms).toISOString(), tz); }
      else { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(brut); if (m && +m[2] < 24 && +m[3] < 60 && !(m[4] && +m[4] > 59)) local = m[1]+" "+m[2]+":"+m[3]+":"+(m[4] || "00"); }
      if (!local || !jourOk(local.slice(0, 10)) || local.slice(0, 4) < "2000") return ko("date ou heure invalide");
      local = local.slice(0, 16)+":"+(local.slice(17, 19) || "00");
      if (new Date(INGESTION.localVersUtc(local, tz)).getTime() > Date.now() + 5*60000) return ko("horodatage dans le futur");
      const d = local.slice(0, 10);
      if (e.entree && d < e.entree) return ko("badgeage antérieur à l'entrée du salarié ("+e.entree+")");
      if (e.sortie && d > e.sortie) return ko("badgeage postérieur à la sortie du salarié ("+e.sortie+")");
      if (clot && d <= clot) return ko("période clôturée jusqu'au "+clot+" : ajustement de période antérieure requis");
      const sens = x.sens === "E" || x.sens === "S" ? x.sens : null;
      if (x.sens != null && x.sens !== "" && !sens) return ko("sens inconnu");
      const cle = e.mat+"|"+local.slice(0, 16); if (vus.has(cle)){ refus.push({l, motif:"doublon dans le fichier", doublon:true}); return; } vus.add(cle);
      retenues.push({l, e, local, sens, dev:String(x.dev == null ? "" : x.dev).slice(0, 80)});
    });
    /* doublons avec les badgeages existants (terminal, saisie, import précédent) : même salarié à ±1 minute */
    const exist = new Map(), matsJ = Array.from(new Set(retenues.map(r=>String(r.e.mat))));
    if (retenues.length){
      const ds = retenues.map(r=>r.local.slice(0, 10)).sort(), du = ds[0], au = ds[ds.length - 1];
      for (let i = 0; i < matsJ.length; i += 500){
        const part = matsJ.slice(i, i + 500);
        (await B.all("SELECT data FROM enreg WHERE coll='ptg' AND mat IN ("+part.map(()=>"?").join(",")+") AND d >= ? AND d <= ?", ...part, du, au)).forEach(r=>{ try { const o = JSON.parse(r.data); const k = String(o.mat)+"|"+String(o.ts || "").slice(0, 10); (exist.get(k) || exist.set(k, []).get(k)).push(o); } catch(e){} });
      }
    }
    const minute = ts => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(ts); return m ? Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]) / 60000 : NaN; };
    const lot = [], parId = new Map();
    let doublons = refus.filter(r=>r.doublon).length;
    for (const r of retenues){
      const id = "im"+crypto.createHash("sha1").update(r.e.mat+"|"+r.local+"|"+(r.sens || "")).digest("hex").slice(0, 18);
      const deja = (exist.get(r.e.mat+"|"+r.local.slice(0, 10)) || []).some(o=>o.id === id || (Math.abs(minute(String(o.ts || "")) - minute(r.local)) <= 1 && (!r.sens || !o.sens || o.sens === r.sens)));
      if (deja){ doublons++; continue; }
      parId.set(id, r.l);
      lot.push({utilisateur:String(r.e.mat), horodatage:r.local, sens:r.sens || undefined, ptgId:id, dev:r.dev, src:"import", source_event_id:"import:"+id});
    }
    let ing = {integres:0, doublons:0, rejetes:0, invalides:0};
    if (lot.length){
      try { ing = await ING.recevoir("import", null, lot, C.login) || ing; }
      catch(e){ return erreur(res, e.code === 503 ? 503 : 500, e.message); }
    }
    const ids = [], rows = [], ecrits = new Set(), cles = Array.from(parId.keys());
    for (let i = 0; i < cles.length; i += 500){
      const part = cles.slice(i, i + 500);
      (await B.all("SELECT id, data FROM enreg WHERE coll='ptg' AND id IN ("+part.map(()=>"?").join(",")+")", ...part)).forEach(r=>{ let v = 0; try { v = Number(JSON.parse(r.data).__v || 0); } catch(e){} ids.push({id:r.id, v, l:parId.get(r.id)}); ecrits.add(r.id); try { rows.push(JSON.parse(r.data)); } catch(e){} });
    }
    parId.forEach((l, id)=>{ if (!ecrits.has(id)) refus.push({l, motif:ing.enFile ? "en file d'attente d'intégration (sera intégré automatiquement)" : "non intégré (doublon ou période clôturée)"}); });
    const lib = String(b.fichier || "").replace(/[\r\n]/g, " ").slice(0, 120);
    await audit(C.login, "import.execute", "badgeages"+(lib ? " — fichier « "+lib+" »" : "")+(b.lot ? " — lot "+String(b.lot).slice(0, 20) : "")+" — "+ids.length+" intégré(s), "+doublons+" doublon(s), "+refus.filter(r=>!r.doublon).length+" refusé(s)"+(matsJ.length ? " ("+matsJ.slice(0, 20).join(", ")+(matsJ.length > 20 ? "…" : "")+")" : ""), ip);
    return json(res, 200, {ok:true, lus:lignes.length, ecrits:ids.length, doublons, refus, ids, rows, enFile:!!ing.enFile});
  }
  /* annulation d'un import de badgeages : seules les lignes créées par cet import (identifiant et version connus du
     navigateur) sont supprimées ; une ligne modifiée depuis (version changée), d'une période clôturée ou hors périmètre
     est conservée et signalée. Les fiches salariés ne sont jamais touchées. */
  if (p === "/api/v1/pointages/import/annuler" && req.method === "POST"){
    const b = await corpsJson(req, 10e6), l = (Array.isArray(b.ids) ? b.ids : []).filter(x=>x && /^im[0-9a-f]{18}$/.test(String(x.id))).slice(0, 200000);
    if (!l.length) return erreur(res, 400, "Aucune ligne d'import à annuler.");
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login), pr = P.profil || {};
    const RG = {lecture:1, saisie:2, validation:3, config:4};
    const acteKo = v => { const m = (pr.menus || {})[v], a = ((pr.actions || {})[v] || {}).supprimer; return m === "masque" || m === "lecture" || a === false; };
    if (!admin && (!(RG[(pr.droits || {}).PTG] >= 2) || acteKo("ptg") || acteKo("import"))) return erreur(res, 403, "Droit de suppression des pointages à l'import requis.");
    const clot = (ref.clotures || []).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
    const conservesIds = [], touches = new Set(); let supprimes = 0, modifies = 0;
    for (let i = 0; i < l.length; i += 500){
      const part = l.slice(i, i + 500), vus = new Map((await B.all("SELECT id, data FROM enreg WHERE coll='ptg' AND id IN ("+part.map(()=>"?").join(",")+")", ...part.map(x=>String(x.id)))).map(r=>[r.id, r.data])), suppr = [];
      part.forEach(x=>{ const dd = vus.get(String(x.id)); if (!dd) return; let o; try { o = JSON.parse(dd); } catch(e){ conservesIds.push(String(x.id)); return; }
        const ko = o.src !== "import" || (!admin && P.set !== null && !P.set.has(String(o.mat))) || (clot && String(o.ts || "").slice(0, 10) <= clot);
        if (ko || Number(o.__v || 0) !== Number(x.v || 0)){ if (!ko) modifies++; conservesIds.push(String(x.id)); return; }
        suppr.push(o); });
      if (!suppr.length) continue;
      await B.transaction(async ()=>{
        await B.run("DELETE FROM enreg WHERE coll='ptg' AND id IN ("+suppr.map(()=>"?").join(",")+")", ...suppr.map(o=>String(o.id)));
        await ING.tracerAnnulationLot(C.login, suppr);
      });
      supprimes += suppr.length; suppr.forEach(o=>touches.add(String(o.mat)+"|"+String(o.ts || "").slice(0, 10)));
    }
    try { await K.invalider(Array.from(touches), []); } catch(e){ journal("invalidation : "+e.message); }
    await audit(C.login, "import.annule", "badgeages — "+supprimes+" supprimé(s), "+conservesIds.length+" conservé(s)"+(modifies ? " dont "+modifies+" modifié(s) depuis l'import" : ""), ip);
    return json(res, 200, {ok:true, demandes:l.length, supprimes, conserves:conservesIds.length, conservesIds, conflits:modifies});
  }
  if (p === "/api/v1/pointages" && req.method === "GET" && !(await droitLire(C, admin, ["PTG"], ["ptg","mvts","suivi"]))) return erreur(res, 403, "Droit de consultation des pointages requis.");
  if (p === "/api/v1/pointages" && req.method === "GET"){
    const q = Object.fromEntries(u.searchParams.entries()), ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
    const au = /^\d{4}-\d{2}-\d{2}$/.test(q.au||"") ? q.au : aujourdhui(), du = /^\d{4}-\d{2}-\d{2}$/.test(q.du||"") ? q.du : ajoutJours(au, -1);
    const lim = Math.min(200, Math.max(1, +q.limit||100)), off = Math.max(0, +q.offset||0);
    /* 56.33.11 : table matricule → salarié et noms en minuscules gardés tant que la liste des salariés ne change pas */
    const emps = await D.employes();
    if (!IDX_PTG || IDX_PTG.emps !== emps) IDX_PTG = {emps, parMat:new Map(emps.map(e=>[String(e.mat), e])), mats:emps.map(e=>String(e.mat).toLowerCase()), noms:emps.map(e=>((e.nom||"")+" "+(e.prenom||"")).toLowerCase())};
    const parMat = IDX_PTG.parMat;
    let mats = null;
    const s = String(q.q||"").trim().toLowerCase();
    if (s){ mats = []; for (let i = 0; i < emps.length && mats.length < 500; i++) if (IDX_PTG.mats[i] === s || IDX_PTG.noms[i].indexOf(s) >= 0) mats.push(String(emps[i].mat)); }
    if (P.set !== null) mats = (mats || Array.from(P.set)).filter(m=>P.set.has(m));
    /* recette : service (avec ses sous-services), équipe directe et site choisis dans la barre du registre */
    if (q.dept || q.chef || q.site){
      let arbre = null;
      if (q.dept){ arbre = new Set([String(q.dept)]); let aj = true; while (aj){ aj = false; (ref.depts||[]).forEach(x=>{ if (x && arbre.has(x.parent) && !arbre.has(x.id)){ arbre.add(x.id); aj = true; } }); } }
      const ok = new Set(emps.filter(e=>(!arbre || arbre.has(e.deptId)) && (!q.chef || String(e.chefMat) === String(q.chef)) && (!q.site || e.siteId === q.site)).map(e=>String(e.mat)));
      mats = (mats || Array.from(ok)).filter(m=>ok.has(m));
    }
    if (mats && !mats.length) return json(res, 200, {total:0, lignes:[], du, au});
    let w = " WHERE coll='ptg' AND d>=? AND d<=?", a = [du, au];
    if (mats){ w += " AND mat IN ("+mats.map(()=>"?").join(",")+")"; a.push(...mats); }
    const total = Number((await B.get("SELECT COUNT(*) n FROM enreg"+w, ...a)).n);
    const l = (await B.all("SELECT data FROM enreg"+w+" ORDER BY d DESC, id DESC LIMIT "+lim+" OFFSET "+off, ...a)).map(r=>{ const x = JSON.parse(r.data), e = parMat.get(String(x.mat)) || {};
      /* v56.27 : complet=1 → enregistrement entier (avec sa version) pour l'éditeur de journée */
      return q.complet ? Object.assign({}, x, {nom:((e.nom||"")+" "+(e.prenom||"")).trim()}) : {id:x.id, mat:x.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), ts:x.ts, sens:x.sens, dev:x.dev||"", src:x.src||"", motif:x.motif||"", corr:x.corr||""}; });
    return json(res, 200, {total, lignes:l, du, au});
  }
  /* ---- v56.7 : « À traiter » — une seule liste pour tous les modules actifs, selon les droits et le périmètre ---- */
  if (p === "/api/v1/a-traiter" && req.method === "GET" && CACHE_AT.has(C.login) && K.cacheFrais(CACHE_AT.get(C.login), 30000))
    return json(res, 200, CACHE_AT.get(C.login).r);
  if (p === "/api/v1/a-traiter" && req.method === "GET"){
    /* 56.33.11 : calcul unique partagé par les demandes simultanées d'un même utilisateur */
    let vol = EN_VOL_AT.get(C.login);
    if (!vol){
      vol = (async ()=>{
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
    const pr = (ref.profils||[]).find(x=>x.id === ((ref.users||[]).find(y=>y.login === C.login)||{}).profilId) || {};
    const rang = c => admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[(pr.droits||{})[c]] || 0);
    const dans = m => P.set === null || P.set.has(String(m));
    const items = [];
    if (!MOD || MOD.estActif("FW-Time")){
      if (rang("PTG") >= 2){
        const du = ajoutJours(aujourdhui(), -62), et = {};
        /* v56.14 : périmètre global → comptage direct par la base (plus de lecture ligne à ligne) */
        if (P.set === null) (await B.all("SELECT etat, COUNT(*) n FROM day_states WHERE d>=? AND etat IN ('ANOMALIE','CORRIGEE','APPROUVEE_MANAGER') GROUP BY etat", du)).forEach(r=>{ et[r.etat] = Number(r.n); });
        else (await B.all("SELECT mat, etat FROM day_states WHERE d>=? AND etat IN ('ANOMALIE','CORRIGEE','APPROUVEE_MANAGER')", du)).forEach(r=>{ if (dans(r.mat)) et[r.etat] = (et[r.etat]||0) + 1; });
        if (et.ANOMALIE) items.push({domaine:"temps", module:"FW-Time", cle:"journees-anomalie", nombre:et.ANOMALIE, urgence:2, vue:"valj"});
        const aValider = (et.CORRIGEE||0) + (rang("PTG") >= 3 ? (et.APPROUVEE_MANAGER||0) : 0);
        if (aValider) items.push({domaine:"temps", module:"FW-Time", cle:"journees-a-valider", nombre:aValider, urgence:1, vue:"valj"});
      }
      const dm = (await B.all("SELECT mat, data FROM enreg WHERE coll='dmd'")).filter(r=>dans(r.mat)).map(r=>JSON.parse(r.data)).filter(d=>(d.etat||"attente") === "attente");
      if (dm.length && rang("PTG") >= 2) items.push({domaine:"temps", module:"FW-Time", cle:"demandes", nombre:dm.length, urgence:1, vue:"dmd"});
    }
    for (const x of MODS_SERVEUR){
      if (!x.inst || !x.inst.aTraiter || (MOD && !MOD.estActif(x.id))) continue;
      try { (await x.inst.aTraiter({C, admin, P, rang})).forEach(i=>items.push(Object.assign({module:x.id}, i))); } catch(e){ journal("à traiter "+x.id+" : "+e.message); }
    }
    items.sort((a, b)=>(b.urgence||0) - (a.urgence||0) || b.nombre - a.nombre);
    const rep = {items, le:new Date().toISOString()};
    /* cache de 30 s par utilisateur, invalidé dès qu'un calcul change (génération) */
    CACHE_AT.set(C.login, Object.assign(K.cacheMarque(), {r:rep})); if (CACHE_AT.size > 500) CACHE_AT.delete(CACHE_AT.keys().next().value);
    return rep;
      })();
      EN_VOL_AT.set(C.login, vol); const fin = () => { if (EN_VOL_AT.get(C.login) === vol) EN_VOL_AT.delete(C.login); }; vol.then(fin, fin);
    }
    return json(res, 200, await vol);
  }
  /* ---- v56.16 : planificateur central — état des tâches de fond, exécution immédiate ---- */
  if (p === "/api/v1/systeme/taches" && req.method === "GET"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); return json(res, 200, {taches:PLAN.etat(), minuteries:PLAN.minuteries()}); }
  const mtache = /^\/api\/v1\/systeme\/taches\/([a-z0-9-]+)\/lancer$/.exec(p);
  if (mtache && req.method === "POST"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    try { const r = await PLAN.lancer(mtache[1]); await audit(C.login, "systeme.tache.lancee", mtache[1], ip); return json(res, 200, r); } catch(e){ return erreur(res, e.code || 500, e.message); } }
  /* ---- v56.4 : préchauffage à la demande (administrateur), par exemple après un redémarrage ---- */
  if (p === "/api/v1/systeme/prechauffer" && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const r = await K.prechauffer([C.login]); return json(res, 200, r);
  }
  /* ---- v56 : purge immédiate de la corbeille selon la durée de conservation (administrateur) ---- */
  if (p === "/api/v1/systeme/corbeille/purger" && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const n = await D.purgerCorbeille(); if (n) await audit(C.login, "corbeille.purge", n+" élément(s) effacé(s) à l'échéance de conservation", ip);
    return json(res, 200, {ok:true, effaces:n});
  }
  /* ---- v56.3 : annuaire paginé (liste, fiche, lot de matricules, valeurs des filtres), périmètre appliqué ---- */
  if ((p === "/api/v1/employes" || p.startsWith("/api/v1/employes/")) && p !== "/api/v1/employes/lot" && !(await droitLire(C, admin, ["EMP"], ["emp","org"]))) return erreur(res, 403, "Droit de consultation des salariés requis.");
  if (p === "/api/v1/employes" || p.startsWith("/api/v1/employes/")){
    /* 56.33.11 : annuaire conservé tant que la couche de données est la même (ordres de tri préparés réutilisés) */
    if (!AN_I || AN_I.D !== D) AN_I = {D, an:ANNUAIRE.creer({D})};
    const AN = AN_I.an, q = Object.fromEntries(u.searchParams.entries());
    if (p === "/api/v1/employes" && req.method === "GET") return json(res, 200, await AN.liste(C.login, q));
    if (p === "/api/v1/employes/valeurs" && req.method === "GET") return json(res, 200, await AN.valeurs(C.login));
    /* 56.33.11 : comptage sur tout le personnel (avant suppression d'un élément de paramétrage) : réservé au paramétrage */
    if (p === "/api/v1/employes/compter" && req.method === "GET"){
      if (!admin){ const {P} = await D.perimetreDe(await D.referentielLecture() || {}, C.login);
        const dr = (P.profil||{}).droits||{}, rg = x=>({lecture:1, saisie:2, validation:3, config:4}[x] || 0);
        /* correctif 10 : critères des écrans Terminaux et Contrôle d'accès aussi pour le paramétrage des terminaux (avant : 403, affiché « 0 salarié ») */
        if (!rg(dr.PAR) && !(rg(dr.TER) >= 4 && ["rd", "zone", "zoneAuj", "plan", "planAuj"].indexOf(q.critere) >= 0)) return erreur(res, 403, "Réservé au paramétrage."); }
      return json(res, 200, await AN.compter(q)); }
    if (p === "/api/v1/employes/complets" && req.method === "POST"){ const b = await corpsJson(req, 2e6), r = await AN.complets(C.login, Array.isArray(b.mats) ? b.mats : []);
      /* export de la liste des employés : fiches sans photo (taille) */
      if (b.sansPhoto) r.lignes = r.lignes.map(e=>{ const o = Object.assign({}, e); delete o.photo; delete o.visage; return o; });
      return json(res, 200, r); }
    /* 56.33.11 : affectation de calendrier en masse côté serveur. L'écran filtrait les salariés chargés dans le
       navigateur : en grand effectif (annuaire paginé) il n'en trouvait presque aucun. Même sélection (sites, services
       avec sous-services, champs à la date d'effet, calendrier actuel, sortis) sur tout le périmètre ; « appliquer »
       enregistre par lots de 500 via la synchronisation (droits, périmètre, versions, audit, recalcul). */
    if (p === "/api/v1/employes/calendrier-masse" && req.method === "POST"){
      const b = await corpsJson(req), ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
      if (!admin && !PERIM.peutEcrire(P.profil, "emps")) return erreur(res, 403, "Droit de modification des salariés requis.");
      const d = /^\d{4}-\d{2}-\d{2}$/.test(b.from || "") ? b.from : aujourdhui();
      const dst = (ref.cals || []).find(c=>c.id === b.calDst);
      if (b.appliquer && !dst) return erreur(res, 400, "Calendrier à affecter introuvable.");
      { const clot = (ref.clotures||[]).reduce((x, c)=>c && c.jusqu > x ? c.jusqu : x, "");
        if (b.appliquer && clot && d <= clot) return erreur(res, 409, "Date d'effet en période clôturée (jusqu'au "+clot.split("-").reverse().join("/")+") : choisissez une date postérieure."); }
      const histDe = e => (Array.isArray(e.calHist) ? e.calHist.slice() : (e.calId ? [{from:e.entree || "2000-01-01", calId:e.calId}] : [])).sort((x, y)=>x.from < y.from ? -1 : 1);
      const calAt = (e, k) => { let v = ""; for (const h of histDe(e)){ if (h.from <= k) v = h.calId; else break; } return v; };
      const valA = (e, code, k) => { const h = ((e.hist || {})[code] || []).slice().sort((x, y)=>String(x.d).localeCompare(String(y.d))); let v = ""; h.forEach(x=>{ if (x.d <= k) v = x.v; }); return v; };
      const sousArbre = id => { const o = [id]; for (let i = 0; i < o.length; i++) (ref.depts || []).forEach(x=>{ if (x.parent === o[i] && o.indexOf(x.id) < 0) o.push(x.id); }); return o; };
      const sites = Array.isArray(b.sites) ? b.sites.map(String) : [], depts = new Set([].concat(...(Array.isArray(b.depts) ? b.depts : []).map(x=>sousArbre(String(x)))));
      const filtres = b.filtres && typeof b.filtres === "object" ? b.filtres : {};
      const pop = (await D.employes()).filter(e=>{
        if (P.set !== null && !P.set.has(String(e.mat))) return false;
        if (!b.sortis && e.sortie && e.sortie < d) return false;
        if (sites.length && sites.indexOf(e.siteId) < 0) return false;
        if (depts.size && !depts.has(e.deptId)) return false;
        for (const c in filtres) if (filtres[c] && valA(e, c, d) !== filtres[c]) return false;
        if (b.calSrc && calAt(e, d) !== b.calSrc) return false;
        return true;
      });
      const aModifier = dst ? pop.filter(e=>calAt(e, d) !== dst.id) : [];
      const nomCal = id => ((ref.cals || []).find(c=>c.id === id) || {}).nom || "—";
      if (!b.appliquer) return json(res, 200, {total:pop.length, aModifier:aModifier.length,
        apercu:pop.slice(0, 60).map(e=>({id:e.id, mat:e.mat, nom:e.nom, prenom:e.prenom, deptId:e.deptId, siteId:e.siteId, calActuel:nomCal(calAt(e, d)), deja:!!dst && calAt(e, d) === dst.id}))});
      let ecrits = 0, conflits = 0; const ignores = new Set(), touches = [];
      for (let i = 0; i < aModifier.length; i += 500){
        const lot = aModifier.slice(i, i + 500).map(e=>{
          const x = JSON.parse(JSON.stringify(e)), h = histDe(x), j = h.findIndex(z=>z.from === d);
          if (j >= 0) h[j] = {from:d, calId:dst.id}; else h.push({from:d, calId:dst.id});
          h.sort((y, z)=>y.from < z.from ? -1 : 1); x.calHist = h;
          let v = ""; for (const z of h){ if (z.from <= aujourdhui()) v = z.calId; else break; } x.calId = v;
          return x;
        });
        const r = await D.synchroniser(C.login, {colls:{emps:{put:lot}}}, {admin});
        if (!r.ok){ (r.ignores || []).forEach(z=>ignores.add(z)); break; }
        ecrits += r.ecrits || 0; conflits += (r.conflits || []).length; (r.ignores || []).forEach(z=>ignores.add(z)); touches.push(...(r.touches || []));
      }
      try { await K.invalider(touches, []); } catch(e){ journal("invalidation : "+e.message); }
      await audit(C.login, "calendriers.masse", ecrits+" salarié(s) → « "+dst.nom+" » à partir du "+d+(conflits ? " ; "+conflits+" conflit(s)" : ""), ip);
      return json(res, 200, {ok:true, modifies:ecrits, conflits, ignores:Array.from(ignores)});
    }
    /* correctif 5 : affectation des droits d'accès en masse côté serveur (Contrôle d'accès › Accès). L'écran filtrait les
       salariés chargés dans le navigateur : en grand effectif il n'en trouvait presque aucun. Même sélection que l'écran
       (sites, services avec sous-services, champs à la date d'effet, zone actuelle, sortis) sur tout le périmètre ;
       « appliquer » enregistre par lots de 500 via la synchronisation (droits, périmètre, versions, audit, lecteurs). */
    if (p === "/api/v1/employes/acces-masse" && req.method === "POST"){
      const b = await corpsJson(req), ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
      if (!admin && !PERIM.peutEcrire(P.profil, "emps")) return erreur(res, 403, "Droit de modification des salariés requis.");
      /* correctif 6 : module Contrôle d'accès requis ; jamais de droit accordé ou retiré rétroactivement */
      if (!(MOD && MOD.estActif("FW-Acces"))) return erreur(res, 403, "Module Contrôle d'accès non activé.");
      const d = /^\d{4}-\d{2}-\d{2}$/.test(b.from || "") ? b.from : aujourdhui();
      if (b.appliquer && d < aujourdhui()) return erreur(res, 409, "Date d'effet passée : un droit d'accès ne s'accorde ni ne se retire rétroactivement. Choisissez aujourd'hui ou une date future.");
      const zone = (ref.zones || []).find(z=>z.id === b.zoneDst), planDst = String(b.planDst || "");
      const plan = planDst === "aucun" ? {id:"aucun", nom:"aucun accès"} : (ref.aplans || []).find(x=>x.id === planDst);
      if (b.appliquer && (!zone || !plan)) return erreur(res, 400, "Zone ou plan d'accès introuvable.");
      const AC = ACCES.contexte(ref), norm = v=>v || "aucun";
      const valA = (e, code, k) => { const h = ((e.hist || {})[code] || []).slice().sort((x, y)=>String(x.d).localeCompare(String(y.d))); let v = ""; h.forEach(x=>{ if (x.d <= k) v = x.v; }); return v; };
      const sousArbre = id => { const o = [id]; for (let i = 0; i < o.length; i++) (ref.depts || []).forEach(x=>{ if (x.parent === o[i] && o.indexOf(x.id) < 0) o.push(x.id); }); return o; };
      const sites = Array.isArray(b.sites) ? b.sites.map(String) : [], depts = new Set([].concat(...(Array.isArray(b.depts) ? b.depts : []).map(x=>sousArbre(String(x)))));
      const filtres = b.filtres && typeof b.filtres === "object" ? b.filtres : {};
      const pop = (await D.employes()).filter(e=>{
        if (P.set !== null && !P.set.has(String(e.mat))) return false;
        if (!b.sortis && e.sortie && e.sortie < d) return false;
        if (sites.length && sites.indexOf(e.siteId) < 0) return false;
        if (depts.size && !depts.has(e.deptId)) return false;
        for (const c in filtres) if (filtres[c] && valA(e, c, d) !== filtres[c]) return false;
        if (b.zoneSrc && !AC.autorise(e, String(b.zoneSrc), d)) return false;
        return true;
      });
      const aModifier = zone && plan ? pop.filter(e=>norm(ACCES.planAt(e, zone.id, d)) !== plan.id) : [];
      const nomPlan = id => !id || id === "aucun" ? "" : ((ref.aplans || []).find(x=>x.id === id) || {}).nom || "?";
      const zonesA = e => (ref.zones || []).filter(z=>AC.autorise(e, z.id, d)).map(z=>z.nom);
      const programmes = zone ? pop.filter(e=>(e.acces || []).some(a=>a && a.zoneId === zone.id && a.from > d)).length : 0;
      if (!b.appliquer) return json(res, 200, {total:pop.length, aModifier:aModifier.length, programmes,
        apercu:pop.slice(0, 60).map(e=>({id:e.id, mat:e.mat, nom:e.nom, prenom:e.prenom, deptId:e.deptId, siteId:e.siteId, zones:zonesA(e),
          planActuel:zone ? nomPlan(ACCES.planAt(e, zone.id, d)) : "", deja:!!(zone && plan) && norm(ACCES.planAt(e, zone.id, d)) === plan.id}))});
      let ecrits = 0, conflits = 0; const ignores = new Set();
      for (let i = 0; i < aModifier.length; i += 500){
        const lot = aModifier.slice(i, i + 500).map(e=>{
          const x = JSON.parse(JSON.stringify(e)), l = Array.isArray(x.acces) ? x.acces : [], j = l.findIndex(z=>z && z.zoneId === zone.id && z.from === d);
          if (j >= 0) l[j].planId = plan.id; else l.push({zoneId:zone.id, planId:plan.id, from:d});
          l.sort((y, z)=>y.from < z.from ? -1 : 1); x.acces = l;
          return x;
        });
        const r = await D.synchroniser(C.login, {colls:{emps:{put:lot}}}, {admin});
        if (!r.ok){ (r.ignores || []).forEach(z=>ignores.add(z)); break; }
        ecrits += r.ecrits || 0; conflits += (r.conflits || []).length; (r.ignores || []).forEach(z=>ignores.add(z));
      }
      await audit(C.login, "acces.masse", ecrits+" salarié(s) → zone « "+zone.nom+" » : "+(plan.id === "aucun" ? "accès retiré" : "plan « "+plan.nom+" »")+" à partir du "+d+(conflits ? " ; "+conflits+" conflit(s)" : ""), ip);
      return json(res, 200, {ok:true, modifies:ecrits, conflits, ignores:Array.from(ignores)});
    }
    /* 56.33.11 : matricule, badge et CIN déjà attribués (tout le personnel ; l'autre salarié n'est pas nommé) */
    if (p === "/api/v1/employes/unicite" && req.method === "POST"){
      if (!admin){ const {P} = await D.perimetreDe(await D.referentielLecture() || {}, C.login); if (!PERIM.peutEcrire(P.profil, "emps")) return erreur(res, 403, "Droit de modification des salariés requis."); }
      const b = await corpsJson(req); return json(res, 200, {conflits:await D.unicite({id:String(b.id||""), mat:b.mat, badge:b.badge, cin:b.cin})}); }
    if (p === "/api/v1/employes/lot" && req.method === "POST"){ const b = await corpsJson(req); return json(res, 200, {lignes:await AN.lot(C.login, Array.isArray(b.mats) ? b.mats : [], Array.isArray(b.ids) ? b.ids : [])}); }
    /* v56.8 : fiche salarié 360° — chaque module actif apporte sa rubrique (droits et périmètre appliqués) */
    const m360 = /^\/api\/v1\/employes\/([^/]+)\/360$/.exec(p);
    if (m360 && req.method === "GET"){
      const mat = decodeURIComponent(m360[1]), e = await AN.fiche(C.login, mat);
      if (!e) return erreur(res, 404, "Salarié introuvable ou hors périmètre.");
      const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
      const pr = (ref.profils||[]).find(x=>x.id === ((ref.users||[]).find(y=>y.login === C.login)||{}).profilId) || {};
      const rang = c => admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[(pr.droits||{})[c]] || 0);
      const rubriques = [];
      if ((!MOD || MOD.estActif("FW-Time")) && rang("PTG") >= 1){
        const a = aujourdhui(), deb = a.slice(0, 8)+"01", hier = ajoutJours(a, -1);
        const c = await B.get("SELECT COUNT(*) n, SUM(hp) hp, SUM(ht) ht, SUM(CASE WHEN ret > 0 THEN 1 ELSE 0 END) ret FROM calc_jour WHERE mat=? AND d>=? AND d<=?", mat, deb, hier < deb ? deb : hier);
        const an = Number((await B.get("SELECT COUNT(*) n FROM day_states WHERE mat=? AND d>=? AND etat='ANOMALIE'", mat, ajoutJours(a, -62))).n);
        const dm = (await B.all("SELECT data FROM enreg WHERE coll='dmd' AND mat=?", mat)).map(r=>JSON.parse(r.data)).filter(d=>(d.etat||"attente") === "attente").length;
        const h = v => { const x = Math.round((Number(v)||0)*60); return Math.floor(x/60)+" h "+String(x%60).padStart(2, "0"); };
        rubriques.push({cle:"temps", vue:"suivi", lignes:[{k:"heuresMois", v:h(c.hp)}, {k:"theoMois", v:h(c.ht)}, {k:"retardsMois", v:String(Number(c.ret)||0), alerte:Number(c.ret) > 0},
          {k:"anomaliesOuvertes", v:String(an), alerte:an > 0}, {k:"demandesAttente", v:String(dm)}]});
      }
      if (rang("TER") >= 4){
        const v = await B.all("SELECT format FROM bio_visages WHERE mat=?", mat);
        rubriques.push({cle:"biometrie", vue:"term", lignes:[{k:"visage", v:v.length ? v.map(x=>x.format).join(", ") : "—", alerte:!v.length}]});
      }
      for (const x of MODS_SERVEUR){
        if (!x.inst || !x.inst.fiche360 || (MOD && !MOD.estActif(x.id))) continue;
        try { const r = await x.inst.fiche360({C, admin, P, rang, mat, emp:e}); if (r) (Array.isArray(r) ? r : [r]).forEach(z=>rubriques.push(Object.assign({module:x.id}, z))); } catch(err){ journal("360 "+x.id+" : "+err.message); }
      }
      return json(res, 200, {mat, rubriques});
    }
    const mf = /^\/api\/v1\/employes\/([^/]+)$/.exec(p);
    if (mf && req.method === "GET"){ const e = await AN.fiche(C.login, decodeURIComponent(mf[1])); return e ? json(res, 200, {employe:e}) : erreur(res, 404, "Salarié introuvable ou hors périmètre."); }
    return erreur(res, 404, "Introuvable.");
  }
  /* ---- v55 : FW-Licence ---- */
  if (p === "/api/v1/modules" && req.method === "GET"){ const lic = await licenceActive();
    await licenceEtat(); const dPrec = path.join(RACINE, "versions", VERSION, "modules-precedents");
    const precedents = fs.existsSync(dPrec) ? fs.readdirSync(dPrec).filter(d=>fs.existsSync(path.join(dPrec, d, "precedent.json"))) : [];
    return json(res, 200, {modules:MOD.liste(), lettres:MOD.lettres(), precedents, etatLicence:licencePublique(LIC_CACHE.v), licence:lic ? {client:lic.client, expire:LICENCE.normaliser(lic).fin, fw:Array.isArray(lic.fw) ? lic.fw : null, modules:lic.modules||null} : null}); }
  if ((p === "/api/v1/modules/activer" || p === "/api/v1/modules/desactiver") && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const b = await corpsJson(req);
    try { return json(res, 200, await (p.endsWith("activer") && !p.endsWith("desactiver") ? MOD.activer(String(b.id||""), C.login, b.motif) : MOD.desactiver(String(b.id||""), C.login, b.motif))); }
    catch(e){ return json(res, e.code || 409, {message:e.message, op:e.op}); }
  }

  /* ---- v53 : recalculs demandés (rapport avant/après) et source du moteur ---- */
  if (p.startsWith("/api/v1/recalculs")){
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
    const dansPerim = mm => admin || P.set === null || (P.set && P.set.has(String(mm)));
    const rangPtg = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).PTG] || 0);
    if (rangPtg < 3) return erreur(res, 403, "Recalcul réservé aux profils ayant le droit « validation » sur le pointage.");
    const acces = {login:C.login, admin, global:admin || P.set === null, dansPerim};
    if (p === "/api/v1/recalculs" && req.method === "GET") return json(res, 200, {recalculs:await RC.liste(acces)});
    if (p === "/api/v1/recalculs" && req.method === "POST"){ try { return json(res, 200, await RC.lancer(C.login, await corpsJson(req), dansPerim)); } catch(e){ return erreur(res, e.code || 400, e.message); } }
    if ((m = /^\/api\/v1\/recalculs\/(rc-[0-9a-f]{16})$/.exec(p))){ const r = await RC.lire(m[1], u.searchParams.get("ecarts") === "1", +u.searchParams.get("offset")||0, Math.min(500, +u.searchParams.get("limit")||100), acces); return r ? json(res, 200, r) : erreur(res, 404, "Introuvable."); }
    if ((m = /^\/api\/v1\/recalculs\/(rc-[0-9a-f]{16})\/valider$/.exec(p)) && req.method === "POST"){ try { const b = await corpsJson(req); return json(res, 200, await RC.valider(C.login, m[1], b.decision === "rejet" ? "rejet" : "ok", acces)); } catch(e){ return erreur(res, e.code || 400, e.message); } }
    return erreur(res, 404, "Introuvable.");
  }
  if (p === "/api/v1/moteur/comparaison" && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const b = await corpsJson(req), du = dateOk(b.du) ? b.du : ajoutJours(aujourdhui(), -60), au = dateOk(b.au) ? b.au : aujourdhui();
    const mats = (await D.employes()).map(e=>String(e.mat)), t0 = Date.now();
    const r = Object.assign(await K.comparer(mats, du, au), {du, au, salaries:mats.length, date:new Date().toISOString(), dureeMs:Date.now()-t0, par:C.login});
    await meta("comparaison_sources", r);
    await audit(C.login, "moteur.comparaison", du+" → "+au+" : "+r.projection+" badgeages (projection), "+r.normalises+" (événements normalisés), "+r.ecarts+" écart(s)", ip);
    return json(res, 200, r);
  }
  if (p === "/api/v1/moteur/source"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    if (req.method === "GET") return json(res, 200, {source:CONFIG.moteurSource === "normalise" ? "normalise" : "compat", comparaison:await meta("comparaison_sources")});
    const b = await corpsJson(req), cible = b.source === "normalise" ? "normalise" : "compat";
    if (cible === "normalise"){
      const c = await meta("comparaison_sources");
      const ok = c && c.ecarts === 0 && (Date.now() - new Date(c.date).getTime()) < 86400000 && c.au >= ajoutJours(aujourdhui(), -1) && c.du <= ajoutJours(aujourdhui(), -30);
      if (!ok) return erreur(res, 409, "Bascule refusée : une comparaison sans écart, de moins de 24 h et couvrant au moins les 30 derniers jours est exigée.");
    }
    CONFIG.moteurSource = cible; ecrireConfig(CONFIG);
    try { await K.invalider([], ["params"]); } catch(e){}
    await audit(C.login, "moteur.source", "source des badgeages du moteur : "+(cible === "normalise" ? "événements normalisés (niveau 2)" : "projection de compatibilité"), ip);
    return json(res, 200, {ok:true, source:cible});
  }

  /* ---- v52 : cycle de vie des journées, anomalies, ajustements ---- */
  if (p.startsWith("/api/v1/journees") || p.startsWith("/api/v1/registre-anomalies") || p.startsWith("/api/v1/ajustements")){
    const ref = await D.referentielLecture() || {}, {P} = await D.perimetreDe(ref, C.login);
    const dansPerim = m => admin || P.set === null || (P.set && P.set.has(String(m)));
    const rangPtg = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((P.profil||{}).droits||{}).PTG] || 0);
    /* 56.33.11 : consultation des journées, anomalies et ajustements réservée au droit de lecture du pointage (le
       portail salarié lit ses journées par /api/v1/donnees) ; matricule du compte pour la séparation des pouvoirs */
    if (rangPtg < 1) return erreur(res, 403, "Droit de consultation du pointage requis.");
    const moi = P.u && P.u.empId ? ((await D.employes()).find(e=>e.id === P.u.empId) || {}).mat : null;
    const clot = await WF.clotureJusqu(), a = aujourdhui();
    const filtre = mats => (admin || P.set === null) ? {sql:"", a:[]} : D.filtreMat(new Set(mats || Array.from(P.set||[])));
    const fm = f => f.sql.replace(" AND (mat IS NULL OR mat='' OR ", " AND (");
    /* 56.33.11 : recherche d'un salarié (nom, prénom, matricule) dans les listes de l'écran Validation des journées */
    const filtreQ = async () => { const q = String(u.searchParams.get("q")||"").trim().toLowerCase();
      if (q.length < 2) return filtre();
      const mots = q.split(/\s+/).filter(Boolean);
      const l = (await D.employes()).filter(e=>dansPerim(e.mat) && (t=>mots.every(m=>t.indexOf(m) >= 0))(((e.nom||"")+" "+(e.prenom||"")+" "+e.mat).toLowerCase())).slice(0, 2000).map(e=>String(e.mat));
      return D.filtreMat(new Set(l.length ? l : ["\u0000"])); };
    if (p === "/api/v1/journees" && req.method === "GET"){
      const du = dateOk(u.searchParams.get("du")) ? u.searchParams.get("du") : ajoutJours(a, -30), au = dateOk(u.searchParams.get("au")) ? u.searchParams.get("au") : a;
      const etat = u.searchParams.get("etat") || "", f = await filtreQ(), off = Math.max(0, +u.searchParams.get("offset")||0), lim = Math.min(500, Math.max(1, +u.searchParams.get("limit")||100));
      const comptes = {}; (await B.all("SELECT etat, COUNT(*) n FROM day_states WHERE d>=? AND d<=?"+fm(f)+" GROUP BY etat", du, au, ...f.a)).forEach(r=>{ comptes[r.etat] = Number(r.n); });
      const auto = await B.get("SELECT COUNT(*) n FROM calc_jour c WHERE c.d>=? AND c.d<=? AND c.d<? AND c.nano=0"+fm(f).replace(/mat/g, "c.mat")+" AND NOT EXISTS (SELECT 1 FROM day_states s WHERE s.mat=c.mat AND s.d=c.d)", du, au, a, ...f.a);
      comptes.APPROUVEE_AUTO = Number(auto.n);
      let lignes = [];
      if (etat && etat !== "APPROUVEE_AUTO") lignes = await B.all("SELECT s.mat, s.d, s.etat, s.maj, s.auteur, (SELECT COUNT(*) FROM anomalies x WHERE x.mat=s.mat AND x.d=s.d AND x.statut='ouverte') ouvertes FROM day_states s WHERE s.d>=? AND s.d<=? AND s.etat=?"+fm(f).replace(/mat/g, "s.mat")+" ORDER BY s.d DESC, s.mat LIMIT "+lim+" OFFSET "+off, du, au, etat, ...f.a);
      const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
      return json(res, 200, {du, au, cloture:clot || null, comptes, items:lignes.map(r=>Object.assign(r, {ouvertes:Number(r.ouvertes), nom:(emps.get(String(r.mat))||{}).nom||"", prenom:(emps.get(String(r.mat))||{}).prenom||"", cloturee:!!(clot && r.d <= clot)}))});
    }
    if (p === "/api/v1/journees/historique"){
      const mat = String(u.searchParams.get("mat")||""), d = u.searchParams.get("d");
      if (!dansPerim(mat) || !dateOk(d)) return erreur(res, 404, "Introuvable.");
      const s = await B.get("SELECT etat FROM day_states WHERE mat=? AND d=?", mat, d), c = await B.get("SELECT nano, ht, hp, calc FROM calc_jour WHERE mat=? AND d=?", mat, d);
      return json(res, 200, {mat, d, etat:WORKFLOW.etatEffectif(s && s.etat, c, d, clot, a), calcul:c,
        transitions:await B.all("SELECT de, vers, auteur, motif, ts FROM day_transitions WHERE mat=? AND d=? ORDER BY ts", mat, d),
        anomalies:await B.all("SELECT id, code, gravite, statut, responsable, motif, action, cree, maj FROM anomalies WHERE mat=? AND d=? ORDER BY cree", mat, d),
        evenements:await ING.historique(mat, ajoutJours(d, -1), ajoutJours(d, 1)),
        ajustements:await B.all("SELECT * FROM adjustments WHERE mat=? AND (d_origine=? OR d_imputation=?) ORDER BY cree", mat, d, d)});
    }
    if (p === "/api/v1/journees/valider" && req.method === "POST"){
      const b = await corpsJson(req, 2e6), niveau = b.niveau === "rh" ? "rh" : "manager";
      if (rangPtg < (niveau === "rh" ? 3 : 2)) return erreur(res, 403, niveau === "rh" ? "Validation RH réservée aux profils ayant le droit « validation » sur le pointage." : "Droit de saisie sur le pointage requis.");
      /* v54 : validation de masse — toutes les journées d'un état sur la période, dans le périmètre, en une fois */
      let items = b.items;
      if (b.tout){ const du = dateOk(b.du) ? b.du : ajoutJours(a, -31), au = dateOk(b.au) ? b.au : a, f = filtre();
        const etatTout = ["CORRIGEE","APPROUVEE_MANAGER","ANOMALIE"].indexOf(b.etat) >= 0 ? b.etat : (niveau === "rh" ? "APPROUVEE_MANAGER" : "CORRIGEE");
        items = (await B.all("SELECT mat, d FROM day_states WHERE d>=? AND d<=? AND etat=?"+fm(f)+" LIMIT 20000", du, au, etatTout, ...f.a)); }
      try { return json(res, 200, await WF.valider(C.login, items, niveau, b.decision === "rejet" ? "rejet" : "ok", b.motif, dansPerim, moi)); }
      catch(e){ return erreur(res, e.code || 400, e.message); }
    }
    if (p === "/api/v1/registre-anomalies"){
      const du = dateOk(u.searchParams.get("du")) ? u.searchParams.get("du") : ajoutJours(a, -30), au = dateOk(u.searchParams.get("au")) ? u.searchParams.get("au") : a;
      const f = await filtreQ(), cond = [], par = [du, au];
      ["statut","gravite","code"].forEach(k=>{ const v = u.searchParams.get(k); if (v){ cond.push(" AND "+k+"=?"); par.push(v); } });
      const off = Math.max(0, +u.searchParams.get("offset")||0), lim = Math.min(500, Math.max(1, +u.searchParams.get("limit")||100));
      const tot = await B.get("SELECT COUNT(*) n FROM anomalies WHERE d>=? AND d<=?"+cond.join("")+fm(f), ...par, ...f.a);
      const l = await B.all("SELECT * FROM anomalies WHERE d>=? AND d<=?"+cond.join("")+fm(f)+" ORDER BY d DESC, mat LIMIT "+lim+" OFFSET "+off, ...par, ...f.a);
      const parG = {}; (await B.all("SELECT gravite, statut, COUNT(*) n FROM anomalies WHERE d>=? AND d<=?"+fm(f)+" GROUP BY gravite, statut", du, au, ...f.a)).forEach(r=>{ parG[r.gravite+"|"+r.statut] = Number(r.n); });
      const empsR = new Map((await D.employes()).map(e=>[String(e.mat), e]));   /* 56.33.11 : nom du salarié dans le registre */
      return json(res, 200, {total:Number(tot.n), items:l.map(x=>Object.assign(x, {nom:(empsR.get(String(x.mat))||{}).nom||"", prenom:(empsR.get(String(x.mat))||{}).prenom||""})), repartition:parG});
    }
    if (p === "/api/v1/ajustements" && req.method === "GET"){
      const st = u.searchParams.get("statut"), f = filtre();
      const l = await B.all("SELECT * FROM adjustments WHERE 1=1"+(st ? " AND statut=?" : "")+fm(f)+" ORDER BY cree DESC LIMIT 500", ...(st ? [st] : []), ...f.a);
      return json(res, 200, {cloture:clot || null, imputation:clot ? ajoutJours(clot, 1) : null, items:l});
    }
    if (p === "/api/v1/ajustements" && req.method === "POST"){
      if (rangPtg < 2) return erreur(res, 403, "Droit de saisie sur le pointage requis.");
      try { return json(res, 200, await WF.ajuster(C.login, await corpsJson(req), dansPerim)); } catch(e){ return erreur(res, e.code || 400, e.message); }
    }
    if ((m = /^\/api\/v1\/ajustements\/([a-z0-9-]+)\/valider$/.exec(p)) && req.method === "POST"){
      if (rangPtg < 3) return erreur(res, 403, "Validation réservée aux profils ayant le droit « validation » sur le pointage.");
      try { const b = await corpsJson(req); const r = await WF.validerAjustement(C.login, m[1], b.decision === "refus" ? "refus" : "ok", dansPerim, moi);
        if (r.statut === "valide") try { await K.invalider([r.mat+"|"+r.imputation], []); } catch(e){}
        return json(res, 200, r); } catch(e){ return erreur(res, e.code || 400, e.message); }
    }
    return erreur(res, 404, "Introuvable.");
  }

  /* ---- v50 : ingestion et historique des événements ---- */
  if (p === "/api/v1/ingestion/etat"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); return json(res, 200, await ING.etat()); }
  if (p === "/api/v1/ingestion/rejouer" && req.method === "POST"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); return json(res, 200, await ING.rejouer(C.login)); }
  if (p === "/api/v1/ingestion/reglage" && req.method === "POST"){
    if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
    const b = await corpsJson(req);
    CONFIG.ingestion = Object.assign({}, CONFIG.ingestion, b.pause !== undefined ? {pause:!!b.pause} : {}, b.capacite ? {capacite:Math.max(1000, Number(b.capacite))} : {});
    ecrireConfig(CONFIG); await audit(C.login, "ingestion.reglage", JSON.stringify(CONFIG.ingestion), ip);
    let repris = 0; if (!CONFIG.ingestion.pause) repris = await ING.reprendre();
    return json(res, 200, {ok:true, ingestion:CONFIG.ingestion, lotsRepris:repris});
  }
  if (p === "/api/v1/evenements"){
    const mat = String(u.searchParams.get("mat")||""), du = u.searchParams.get("du"), au = u.searchParams.get("au");
    if (!mat || !dateOk(du) || !dateOk(au)) return erreur(res, 400, "Paramètres : mat, du, au.");
    const ref = await D.referentielLecture() || {}; const {P} = await D.perimetreDe(ref, C.login);
    if (!admin && P.set !== null && !(P.set && P.set.has(mat))) return erreur(res, 404, "Introuvable.");
    return json(res, 200, {evenements:await ING.historique(mat, du, au)});
  }
  /* v54 : supervision des pointeuses (statut ONLINE / DEGRADED / OFFLINE, alertes aux changements) */
  if (p === "/api/v1/pointeuses/supervision"){
    /* 56.33.11 : droit de lecture des terminaux, pointeuses des sites du périmètre, sans n° de série ni adresse sous le
       paramétrage ; les alertes sont produites par la tâche planifiée (plus d'écriture sur une simple lecture) */
    const refS = await D.referentielLecture() || {}, {P:PS} = await D.perimetreDe(refS, C.login);
    const rangT = admin ? 4 : ({aucun:0, lecture:1, saisie:2, validation:3, config:4}[((PS.profil||{}).droits||{}).TER] || 0);
    if (rangT < 1) return erreur(res, 403, "Droit de consultation des terminaux requis.");
    let l = await PT.supervision((CONFIG.supervision||{}).seuilMinutes);
    if (!admin && PS.set !== null){ const sites = new Set((await D.employes()).filter(e=>PS.set && PS.set.has(String(e.mat))).map(e=>e.siteId)); l = l.filter(x=>!x.site || sites.has(x.site)); }
    if (rangT < 4) l = l.map(x=>{ const c = Object.assign({}, x); delete c.sn; delete c.ip; return c; });
    return json(res, 200, {seuilMinutes:(CONFIG.supervision||{}).seuilMinutes || 10, terminaux:l,
      resume:l.reduce((o, x)=>{ o[x.statut] = (o[x.statut]||0) + 1; return o; }, {})});
  }
  if (p === "/api/v1/metriques"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); return json(res, 200, await metriques()); }

  /* ---- calculs du serveur (grands effectifs) ---- */
  if (/^\/api\/v1\/calcul\/(journees|anomalies|synthese|presences|preaudit)$/.test(p) && !(await droitLire(C, admin, ["PTG","ETA"], ["ptg","anomalies","dash","suivi","etats","cloture"]))) return erreur(res, 403, "Droit de consultation des pointages ou des états requis.");
  if (p.startsWith("/api/v1/calcul/")){
    const q = Object.fromEntries(u.searchParams.entries());
    const a = aujourdhui();
    if (!dateOk(q.du)) q.du = ajoutJours(a, -7);
    if (!dateOk(q.au)) q.au = a;
    if (q.au < q.du) [q.du, q.au] = [q.au, q.du];
    if ((new Date(q.au) - new Date(q.du)) / 86400000 > 400) return erreur(res, 400, "Période limitée à 400 jours.");
    const t0 = Date.now();
    let r;
    if (p === "/api/v1/calcul/anomalies") r = await K.anomalies(C.login, q);
    else if (p === "/api/v1/calcul/journees") r = await K.journees(C.login, q);
    else if (p === "/api/v1/calcul/synthese") r = await K.synthese(C.login, q);
    else if (p === "/api/v1/calcul/presences") r = await K.presences(C.login, q);
    else if (p === "/api/v1/calcul/accueil") r = await K.accueil(C.login);
    else if (p === "/api/v1/calcul/preaudit") r = await K.preaudit(C.login, q);
    else if (p === "/api/v1/calcul/contenu"){
      /* empreinte de clôture : sur toute l'entreprise, jamais sur un périmètre */
      const ref = await D.referentielLecture() || {}; const pr = (ref.profils||[]).find(x=>x.id === ((ref.users||[]).find(u=>String(u.login).toLowerCase() === C.login.toLowerCase())||{}).profilId);
      /* correctif 20 : même droit que la clôture (périmètre entreprise) ; contenu détaillé réservé à l'administrateur et tracé */
      { const dr = await droitCloture(ref, C, admin, true); if (!dr.ok) return erreur(res, 403, dr.motif); }
      if (q.complet && !admin) return erreur(res, 403, "Le contenu détaillé de la période est réservé à l'administrateur (dossier de clôture : écran Clôture).");
      if (!jourValideSrv(q.du) || !jourValideSrv(q.au) || q.du > q.au) return erreur(res, 400, "Période invalide.");
      if (q.complet) await audit(C.login, "cloture.contenu_lu", "du "+jjmmaaaa(q.du)+" au "+jjmmaaaa(q.au), ip);
      const c = await K.contenuPeriode(q.du, q.au);
      /* v52 : sceau v2 — la période scellée inclut aussi les versions de règles applicables et le périmètre */
      if (q.v === "2"){ const refS = await D.referentielLecture() || {};
        c.regles = (refS.reglesV||[]).filter(x=>x && x.statut === "publiee" && x.valid_from <= q.au && (!x.valid_to || x.valid_to >= q.du)).map(x=>[x.id, x.code, x.niveau, String(x.cible), JSON.stringify(x.valeur), x.valid_from, x.valid_to||"", x.version]).sort();
        c.perimetre = "entreprise"; c.version = 2; }
      const hash = crypto.createHash("sha256").update(JSON.stringify(c), "utf8").digest("hex");
      r = {hash, nbPtg:c.ptg.length, nbDec:c.decisions.length, nbAbs:c.absences.length, nbRegles:(c.regles||[]).length, version:c.version||1, contenu:q.complet ? c : undefined};
    }
    else if (p === "/api/v1/calcul/etat" && req.method === "POST"){
      if (!(await droitEtats())) return erreur(res, 403, "Droit de consultation des états requis.");
      const b = await corpsJson(req, 2e6);
      /* 56.33.11 : paramètres contrôlés (avant : erreur 500 dans le fil de calcul pour un état absent) */
      if (!b.etat || typeof b.etat !== "object" || !Array.isArray(b.etat.champs)) return erreur(res, 400, "État à produire absent ou incomplet.");
      if (!dateOk(b.du || q.du) || !dateOk(b.au || q.au)) return erreur(res, 400, "Période invalide (du, au).");
      const texte = await K.etat(C.login, b.etat, b.du || q.du, b.au || q.au, b.filtres || {});
      await audit(C.login, "etat.serveur", (b.etat && b.etat.nom || "")+" "+(b.du||"")+" → "+(b.au||""), ip);
      entetes(res, true); res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8"}); return res.end(texte);
    }
    else return erreur(res, 404, "Introuvable");
    journal("calcul "+p.split("/").pop()+" "+C.login+" : "+(Date.now()-t0)+" ms");
    return json(res, 200, r);
  }

  /* ---- administration ---- */
  if (/^\/api\/v1\/(systeme|sauvegardes|mise-a-jour|licence|comptes|audit-serveur|sessions|alertes)/.test(p) && !admin && !(C.role === "fournisseur" && /^\/api\/v1\/licence(\/|$)/.test(p))) return erreur(res, 403, "Réservé aux administrateurs.");
  if (p === "/api/v1/systeme") return json(res, 200, await etatSysteme());
  /* v56.30 (§ 7.3) : diagnostic exportable en un clic — aucun secret, aucune donnée personnelle (adresses, courriels et
     matricules masqués dans les messages) ; version, modules, licence, base, sauvegarde, disque, tâches, erreurs, P95 / P99 */
  if (p === "/api/v1/systeme/diagnostic" && req.method === "GET"){
    const masquer = x => String(x||"").replace(/[^\s@]+@[^\s@]+/g, "[courriel]").replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[adresse]").replace(/\b\d{4,}\b/g, "[n°]");
    const E = await etatSysteme(), M = await metriques().catch(()=>({}));
    const d = {genere:new Date().toISOString(), version:VERSION, versions:E.versions, base:B.type, installation:E.empreinte,
      systeme:{plateforme:os.platform()+" "+os.release(), architecture:os.arch(), node:process.version, processeurs:os.cpus().length, memoireGo:Math.round(os.totalmem()/1e9)},
      controles:(E.elements||[]).map(x=>({id:x.id, etat:x.etat, titre:x.titre, detail:masquer(x.detail)})),
      modules:MOD ? MOD.liste().map(m=>({id:m.id, version:m.version||"", actif:!!m.actif, licencie:!!m.licencie})) : [],
      licence:(()=>{ const L = licencePublique(LIC_CACHE.v) || {}; return {etat:L.etat, debut:L.debut, fin:L.fin, politique:L.politique, serie:L.serie}; })(),
      performances:{technique:M.technique || null, routes:(M.routes||[]).slice(0, 25).map(r=>({route:r.route, n:r.n, p50:r.p50, p95:r.p95, p99:r.p99, erreurs:r.erreurs, horsBudget:r.horsBudget, budget:r.budget}))},
      taches:(()=>{ try { return PLAN.etat(); } catch(e){ return null; } })(),
      dernieresErreurs:DERNIERES_ERREURS.map(x=>({ref:x.ref, code:x.code, le:x.le, message:masquer(x.message)}))};
    await audit(C.login, "systeme.diagnostic", "diagnostic exporté", ip);
    res.setHeader("Content-Disposition", "attachment; filename=\"FIWAKTI-diagnostic-"+aujourdhui()+".json\"");
    return json(res, 200, d);
  }
  if (p === "/api/v1/systeme/controles") return json(res, 200, {controles:await controles()});
  /* correctif 13 : vérification complète à la demande (« Vérifier » : ?forcer=1), sinon résultat de moins de 10 min */
  if (p === "/api/v1/systeme/audit"){ if (u.searchParams.get("forcer") === "1") AUDIT_CACHE = null; return json(res, 200, await auditEtat()); }
  if (p === "/api/v1/systeme/conservation") return json(res, 200, Object.assign({politique:CONFIG.conservation}, await conservation(true)));
  if (p === "/api/v1/systeme/reglages"){
    if (req.method === "GET") return json(res, 200, {copie:(CONFIG.sauvegarde||{}).copie||"", chiffrer:!!(CONFIG.sauvegarde||{}).chiffrer, pushReseaux:CONFIG.pushReseaux||[], conservation:CONFIG.conservation, cle:CF.empreinte("sauvegarde"),
      syslog:CONFIG.syslog||{hote:"", port:514, protocole:"udp"}, auditExterne:CONFIG.auditExterne||"", proxyConfiance:CONFIG.proxyConfiance||[]});
    const b = await corpsJson(req);
    if (b.copie !== undefined){
      const d = String(b.copie||"").trim();
      /* correctif 18 : la copie « hors serveur » ne peut pas être dans le dossier des données (ni celui des sauvegardes) */
      if (d){ const rd = path.resolve(d), rD = path.resolve(DONNEES); if (rd === rD || rd.startsWith(rD+path.sep) || rD.startsWith(rd+path.sep)) return erreur(res, 400, "La copie hors serveur doit être sur un autre emplacement que le dossier des données ("+DONNEES+")."); }
      if (d){ try { fs.mkdirSync(d, {recursive:true}); const t = path.join(d, ".fiwakti-essai"); fs.writeFileSync(t, "x"); fs.unlinkSync(t); } catch(e){ return erreur(res, 400, "Emplacement inaccessible en écriture : "+d); } }
      CONFIG.sauvegarde = Object.assign({}, CONFIG.sauvegarde, {copie:d});
    }
    if (b.pushReseaux !== undefined){
      const l = (Array.isArray(b.pushReseaux) ? b.pushReseaux : String(b.pushReseaux).split(/[\s,;]+/)).map(x=>String(x).trim()).filter(Boolean);
      const reseauOk = x => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(x); return !!m && [1,2,3,4].every(i=>+m[i] <= 255) && (m[5] === undefined || +m[5] <= 32); };
      if (l.some(x=>!reseauOk(x))) return erreur(res, 400, "Réseau invalide : notation attendue 10.20.0.0/16 ou 10.20.1.15.");
      CONFIG.pushReseaux = l;
    }
    if (b.syslog !== undefined){
      const s = b.syslog || {};
      if (s.hote && !/^[A-Za-z0-9.:-]{1,253}$/.test(s.hote)) return erreur(res, 400, "Serveur syslog invalide.");
      CONFIG.syslog = {hote:String(s.hote||"").trim(), port:Math.min(65535, Math.max(1, Number(s.port)||514)), protocole:s.protocole === "tcp" ? "tcp" : "udp"};
    }
    if (b.auditExterne !== undefined){
      const d = String(b.auditExterne||"").trim();
      if (d){ try { fs.mkdirSync(d, {recursive:true}); const t = path.join(d, ".fiwakti-essai-"+Date.now()); fs.writeFileSync(t, "x"); fs.unlinkSync(t); } catch(e){ return erreur(res, 400, "Emplacement d'export de l'audit inaccessible : "+d); } }
      CONFIG.auditExterne = d;
      if (d){ ecrireConfig(CONFIG); try { await exporterAudit(); } catch(e){ return erreur(res, 400, "Export de l'audit impossible : "+e.message); } }
    }
    if (b.proxyConfiance !== undefined){
      const l = (Array.isArray(b.proxyConfiance) ? b.proxyConfiance : String(b.proxyConfiance).split(/[\s,;]+/)).map(x=>String(x).trim()).filter(Boolean);
      if (l.some(x=>!net.isIP(x))) return erreur(res, 400, "Adresse de proxy invalide.");
      CONFIG.proxyConfiance = l;
    }
    if (b.conservation){
      const c = b.conservation, ok = (v, min) => Number.isFinite(+v) && +v >= min;
      /* correctif 18 : durées entières bornées (une valeur énorme rendait la limite invalide : « NaN-NaN-NaN ») */
      const ent = (v, min, max) => Number.isInteger(+v) && +v >= min && +v <= max;
      if (!ent(c.badgeagesAns, 1, 50) || !ent(c.auditAns, 1, 50) || (c.journalAns !== undefined && c.journalAns !== null && c.journalAns !== "" && !ent(c.journalAns, 1, 50)) || (c.calculsJours !== undefined && c.calculsJours !== "" && !ent(c.calculsJours, 60, 3650))) return erreur(res, 400, "Durées de conservation : de 1 à 50 ans (calculs : de 60 à 3 650 jours).");
      CONFIG.conservation = {badgeagesAns:+c.badgeagesAns, auditAns:+c.auditAns, journalAns:c.journalAns ? +c.journalAns : undefined, calculsJours:+c.calculsJours || 400};
    }
    ecrireConfig(CONFIG);
    await audit(C.login, "systeme.reglages", JSON.stringify({copie:(CONFIG.sauvegarde||{}).copie, pushReseaux:CONFIG.pushReseaux, conservation:CONFIG.conservation, syslog:CONFIG.syslog, auditExterne:CONFIG.auditExterne, proxyConfiance:CONFIG.proxyConfiance}), ip);
    return json(res, 200, {ok:true});
  }
  if (p === "/api/v1/systeme/cle-sauvegarde" && req.method === "POST"){
    /* la clé permet de relire les sauvegardes sur un autre serveur : téléchargement tracé */
    await audit(C.login, "sauvegarde.cle.telechargee", "trousseau "+CF.empreinte("sauvegarde"), ip);
    entetes(res, true); res.writeHead(200, {"Content-Type":"application/json; charset=utf-8", "Content-Disposition":"attachment; filename=\"fiwakti-trousseau-"+CF.empreinte("sauvegarde")+".key\""});
    return res.end(JSON.stringify(CF.trousseau()));
  }
  /* passage de la base intégrée à PostgreSQL, sans perte : copie, vérification, bascule */
  /* 56.33.5 : bascule sans délai imposé (la copie dépasse 30 s dès quelques milliers de salariés), une seule à la fois,
     état consultable (GET), et redémarrage garanti une fois la configuration écrite — avant, un délai dépassé laissait
     le serveur sur la base intégrée avec une configuration déjà tournée vers PostgreSQL */
  if (p === "/api/v1/systeme/postgresql" && req.method === "GET") return json(res, 200, Object.assign({base:B.type}, BASCULE || {}));
  if (p === "/api/v1/systeme/postgresql" && req.method === "POST"){
    if (B.type === "pg") return erreur(res, 400, "La base est déjà PostgreSQL.");
    if (BASCULE && BASCULE.enCours) return erreur(res, 409, "Une copie vers PostgreSQL est déjà en cours ("+(BASCULE.etape||"")+") : patientez.");
    const b = await corpsJson(req); const url = pgUrl(b);
    const t = await testerPg(url); if (!t.ok) return erreur(res, 400, "PostgreSQL : "+t.motif);
    BASCULE = {enCours:true, etape:"sauvegarde", debut:maintenant()};
    try {
      await sauvegarder(C.login, "avant passage à PostgreSQL");
      BASCULE.etape = "copie";
      const dst = await BD.ouvrir({type:"pg", url}, DONNEES);
      const n = await BD.copier(B, dst, (tb, nb)=>{ BASCULE.etape = "copie de "+tb+" ("+nb+")"; });
      BASCULE.etape = "vérification";
      for (const tb of ["kv","enreg","comptes","audit"]){
        const a = Number((await B.get("SELECT COUNT(*) n FROM "+tb)).n), z = Number((await dst.get("SELECT COUNT(*) n FROM "+tb)).n);
        if (a !== z){ await dst.fermer(); BASCULE = {enCours:false, erreur:"Copie incomplète ("+tb+" : "+z+"/"+a+")"}; return erreur(res, 500, "Copie incomplète ("+tb+" : "+z+"/"+a+") : la base intégrée reste en service."); }
      }
      await dst.fermer();
      CONFIG.base = {type:"pg", url}; ecrireConfig(CONFIG);
      await audit(C.login, "base.postgresql", JSON.stringify(n), ip);
      BASCULE = {enCours:false, termine:true, etape:"redémarrage", copie:n};
      try { json(res, 200, {ok:true, copie:n, redemarrage:true}); } catch(e){}
    } catch(e){ BASCULE = {enCours:false, erreur:e.message}; journal("bascule PostgreSQL : "+e.message); return erreur(res, 500, "Bascule interrompue : "+e.message+" — la base intégrée reste en service."); }
    setTimeout(()=>process.exit(75), 800); return;
  }
  if (p === "/api/v1/sauvegardes" && req.method === "POST"){ try { return json(res, 200, await sauvegarder(C.login, "manuelle")); } catch(e){ return erreur(res, 500, e.message); } }
  if ((m = /^\/api\/v1\/sauvegardes\/([^/]+)$/.exec(p)) && req.method === "GET"){
    const f = path.join(D_SAUV, path.basename(decodeURIComponent(m[1])));
    if (!/\.(db|pgjson\.gz)(\.chiffre)?$/.test(f) || !fs.existsSync(f)) return erreur(res, 404, "Introuvable");
    await audit(C.login, "sauvegarde.telechargee", path.basename(f), ip);
    entetes(res, true); res.writeHead(200, {"Content-Type":"application/octet-stream", "Content-Disposition":"attachment; filename=\""+path.basename(f)+"\""});
    return fs.createReadStream(f).pipe(res);
  }
  if ((m = /^\/api\/v1\/sauvegardes\/([^/]+)\/restaurer$/.exec(p)) && req.method === "POST"){
    try { return json(res, 200, await restaurer(decodeURIComponent(m[1]), C.login)); } catch(e){ return erreur(res, 400, e.message); }
  }
  if (p === "/api/v1/mise-a-jour" && req.method === "POST"){
    try { const r = await appliquerMiseAJour(await corps(req, 80e6), C.login); json(res, 200, Object.assign({ok:true, redemarrage:true}, r)); setTimeout(()=>process.exit(75), 800); return; }
    catch(e){ return erreur(res, 400, e.message); }
  }
  if (p === "/api/v1/mise-a-jour/module" && req.method === "POST"){
    try { return json(res, 200, Object.assign({ok:true}, await appliquerMajModule(await corps(req, 80e6), C.login))); } catch(e){ return erreur(res, 400, e.message); }
  }
  if (p === "/api/v1/mise-a-jour/module/retour" && req.method === "POST"){
    const b = await corpsJson(req); try { return json(res, 200, Object.assign({ok:true}, await retourModule(String(b.id||""), C.login))); } catch(e){ return erreur(res, 400, e.message); }
  }
  if (p === "/api/v1/mise-a-jour/retour" && req.method === "POST"){
    const V = path.join(RACINE, "versions");
    const prec = (()=>{ try { return fs.readFileSync(path.join(V, "precedente.txt"), "utf8").trim(); } catch(e){ return ""; } })();
    if (!prec || !fs.existsSync(path.join(V, prec, "serveur", "principal.js"))) return erreur(res, 400, "Aucune version précédente disponible.");
    await sauvegarder(C.login, "avant retour à la version "+prec);
    fs.writeFileSync(path.join(V, "precedente.txt"), VERSION+"\n"); fs.writeFileSync(path.join(V, "actuelle.txt"), prec+"\n");
    await audit(C.login, "mise_a_jour.retour", VERSION+" → "+prec, ip);
    json(res, 200, {ok:true, vers:prec, redemarrage:true}); setTimeout(()=>process.exit(75), 800); return;
  }
  /* v56.30 : aperçu d'une licence avant import (écran des changements) */
  if (p === "/api/v1/licence/apercu" && req.method === "POST"){
    const b = await corpsJson(req); const r = lireLicence(b.cle); if (!r.ok) return erreur(res, 400, r.motif);
    const LV = await licenceEtat(true), cur = LV.lic, N = LICENCE.normaliser(r.charge), C0 = cur ? LICENCE.normaliser(cur) : null;
    if (C0 && N.serie < C0.serie) return erreur(res, 400, "Licence refusée : son numéro de série ("+N.serie+") est inférieur à celui de la licence en place ("+C0.serie+").");
    return json(res, 200, {ok:true, changements:LICENCE.differences(cur, r.charge), etatApres:LICENCE.etat(r.charge, LV.jour).etat, programmee:!!(N.debut && N.debut > LV.jour)});
  }
  if (p === "/api/v1/licence" && req.method === "POST"){
    if (LIC_VERROU) return erreur(res, 409, "Un renouvellement de licence est déjà en cours : réessayez dans un instant.");
    LIC_VERROU = true;
    try {
      const b = await corpsJson(req); const r = lireLicence(b.cle);
      if (!r.ok){ await audit(C.login, "licence.refusee", r.motif, ip); return erreur(res, 400, r.motif); }
      const LV = await licenceEtat(true), cur = LV.lic, N = LICENCE.normaliser(r.charge), C0 = cur ? LICENCE.normaliser(cur) : null;
      const diff = LICENCE.differences(cur, r.charge);
      if (C0 && N.serie < C0.serie){ const m = "Licence refusée : son numéro de série ("+N.serie+") est inférieur à celui de la licence en place ("+C0.serie+")."; await audit(C.login, "licence.refusee", m, ip); return erreur(res, 400, m); }
      const eN = LICENCE.etat(r.charge, LV.jour), cle = String(b.cle).replace(/\s+/g,"");
      if (eN.etat === "pas_commencee"){
        if (!cur || LV.e.restriction){ const m = "Cette licence ne commence que le "+N.debut+" : la licence en place n'est plus valable, demandez à votre fournisseur une licence qui commence aujourd'hui."; await audit(C.login, "licence.refusee", m, ip); return erreur(res, 400, m); }
        await meta("licence_suivante", {cle, recue:maintenant()}); LIC_CACHE.t = 0;
        await audit(C.login, "licence.programmee", JSON.stringify(diff)+(b.reference ? " — réf. "+String(b.reference).slice(0, 60) : ""), ip);
        return json(res, 200, {ok:true, programmee:true, debut:N.debut, changements:diff});
      }
      const nRev = await revocationsAjouter(r.charge.revoque);
      if (nRev) await audit(C.login, "licence.revocation", nRev+" licence(s) ou jeton(s) révoqué(s) : "+r.charge.revoque.join(", "), ip);
      await meta("licence", {cle, activee:maintenant()});
      { const sv = await meta("licence_suivante"); if (sv){ const rs = lireLicence(sv.cle); if (!rs.ok || LICENCE.normaliser(rs.charge).serie <= N.serie) await meta("licence_suivante", null); } }
      /* revalidation : les droits de la nouvelle licence s'appliquent aussitôt (modules accordés, retirés ou ajoutés), sans redémarrage */
      await MOD.charger(r.charge); LIC_CACHE.t = 0; const LV2 = await licenceEtat(true);
      await audit(C.login, "licence.revalidation", JSON.stringify(Object.assign({}, diff, {etat:LV2.e.etat, resultat:"appliquée"}))+(b.reference ? " — réf. "+String(b.reference).slice(0, 60) : ""), ip);
      return json(res, 200, {ok:true, client:r.charge.client, modules:MOD.lettres(), fw:MOD.liste().filter(m=>m.actif).map(m=>m.id), expire:N.fin, changements:diff, licence:licencePublique(LV2)});
    } finally { LIC_VERROU = false; }
  }
  /* 56.33.11 : envoi des e-mails (notifications des demandes). Réglages dans Administration › Sécurité ; le mot de passe
     du compte d'envoi est gardé chiffré sur le serveur, jamais renvoyé au navigateur ni journalisé. */
  if (p === "/api/v1/systeme/courriel" && req.method === "GET") return json(res, 200, {mdpDefini:!!await meta("smtp_mdp"), dernier:await meta("smtp_dernier") || null});
  if (p === "/api/v1/systeme/courriel/mot-de-passe" && req.method === "POST"){
    const b = await corpsJson(req), mdp = String(b.mdp || "");
    if (mdp.length > 512) return erreur(res, 400, "Mot de passe trop long.");
    await meta("smtp_mdp", mdp ? CF.chiffrerTexte(mdp, "secrets") : "");
    await audit(C.login, "courriel.mot_de_passe", mdp ? "défini" : "effacé", ip);
    return json(res, 200, {ok:true, mdpDefini:!!mdp});
  }
  if (p === "/api/v1/systeme/courriel/test" && req.method === "POST"){
    const b = await corpsJson(req), so = b.smtp && typeof b.smtp === "object" ? b.smtp : {}, smS = ((((await D.referentielLecture()) || {}).secu) || {}).smtp || {};
    /* correctif 24 : réglages d'essai différents de ceux enregistrés (serveur, port, sécurité, identifiant) → le mot de passe
       enregistré n'est PAS joint (il partait en clair vers un hôte au choix) : il doit être saisi pour l'essai */
    const autres = ["hote","port","securite","user","auth"].some(k=>so[k] !== undefined && String(so[k]) !== String(smS[k] === undefined ? "" : smS[k]));
    const cfg = await smtpReglages(so);
    if (autres){ if (typeof b.mdp === "string" && b.mdp) cfg.mdp = b.mdp.slice(0, 512); else if (cfg.auth) return erreur(res, 400, "Réglages modifiés : enregistrez-les d'abord, ou saisissez le mot de passe du compte d'envoi pour cet essai."); else cfg.mdp = ""; }
    const motifS = COURRIEL.controleReglages(cfg); if (motifS) return erreur(res, 400, "Réglages d'envoi : "+motifS+".");
    const cible = String(cfg.hote || "").slice(0, 120)+":"+(cfg.port || "")+" → "+String(b.a || "").slice(0, 120);
    try { await COURRIEL.envoyer(cfg, {a:b.a, sujet:"FIWAKTI — message de test", texte:"Ce message confirme que FIWAKTI peut envoyer des e-mails avec les réglages enregistrés.\r\n\r\nThis message confirms that FIWAKTI can send e-mails.\r\n\r\nتؤكد هذه الرسالة أن FIWAKTI قادر على إرسال الرسائل الإلكترونية."});
      await audit(C.login, "courriel.test", "réussi — "+cible, ip); return json(res, 200, {ok:true}); }
    catch(e){ await audit(C.login, "courriel.test", "échec — "+cible+" : "+e.message, ip); return erreur(res, 400, "Envoi impossible : "+e.message); }
  }
  if (p === "/api/v1/comptes/reinitialiser" && req.method === "POST"){
    const b = await corpsJson(req);
    const c = await compteDe(b.login);
    if (!c) return erreur(res, 404, "Compte inconnu du serveur : enregistrez d'abord l'utilisateur dans l'application.");
    if (c.login.toLowerCase() === C.login.toLowerCase()) return erreur(res, 400, "Utilisez le changement de mot de passe pour votre propre compte.");
    await B.run("DELETE FROM sessions WHERE login=?", c.login);
    if (b.mode === "a2f"){
      await B.run("UPDATE comptes SET a2f_secret=NULL, a2f_actif=0, a2f_pas=NULL WHERE login=?", c.login);
      await audit(C.login, "a2f.reinitialisee", c.login, ip);
      return json(res, 200, {ok:true, mode:"a2f"});
    }
    /* correctif 23 : jamais le matricule pour un administrateur ou un profil en écriture en Administration (le correctif 19
       ne protégeait que la création) — un mot de passe temporaire aléatoire est remis à la place */
    let matInterdit = c.role === "admin";
    if (!matInterdit){ const refR = await D.referentielLecture() || {}, uR = (refR.users || []).find(x=>x && String(x.login || "").trim().toLowerCase() === String(c.login).toLowerCase());
      const prR = uR && (refR.profils || []).find(x=>x && x.id === uR.profilId); matInterdit = !prR || !!({saisie:1, validation:1, config:1}[(prR.droits || {}).SYS]) || PERIM.niveauProfil(prR) !== "simple"; }
    if (c.matricule && b.mode !== "code" && !matInterdit){
      await B.run("UPDATE comptes SET etat='temp_matricule', hash=NULL, temp_le=?, changer=1, raison='reinit', echecs=0, verrou=NULL WHERE login=?", aujourdhui(), c.login);
      await audit(C.login, "compte.reinitialise", c.login+" (matricule)", ip);
      return json(res, 200, {ok:true, mode:"matricule"});
    }
    const code = crypto.randomBytes(9).toString("base64url").replace(/[-_]/g,"x").slice(0,10)+"7A";
    await B.run("UPDATE comptes SET etat='temp_code', hash=?, temp_le=?, changer=1, raison='reinit', echecs=0, verrou=NULL WHERE login=?", await hacher(code), maintenant(), c.login);
    await audit(C.login, "compte.reinitialise", c.login+" (mot de passe temporaire)", ip);
    return json(res, 200, {ok:true, mode:"code", temporaire:code});
  }
  /* correctif 23 : déverrouillage d'un compte par le serveur (le bouton de l'écran n'écrivait que dans le paramétrage :
     la connexion restait refusée) */
  /* correctif 23 : changement de mot de passe imposé à la prochaine connexion (le bouton de l'écran ne changeait que le
     paramétrage : la connexion répondait « changer: false ») */
  if (p === "/api/v1/comptes/portail" && req.method === "GET"){ const ref = await D.referentielLecture() || {}, pr = portailProfil(ref);
    return json(res, 200, {eligibles:(await portailEligibles(ref)).length, profil:pr ? {id:pr.id, nom:pr.nom} : null}); }
  if (p === "/api/v1/comptes/portail/generer" && req.method === "POST"){ const r = await portailGenerer(C.login, null, ip);
    if (r.motif) return erreur(res, 400, "Comptes du portail : "+r.motif+"."); return json(res, 200, Object.assign({ok:true}, r)); }
  if (p === "/api/v1/comptes/forcer" && req.method === "POST"){
    const b = await corpsJson(req), c = await compteDe(b.login);
    if (!c) return erreur(res, 404, "Compte inconnu du serveur.");
    if (c.login.toLowerCase() === C.login.toLowerCase()) return erreur(res, 400, "Utilisez le changement de mot de passe pour votre propre compte.");
    if (!c.hash) return erreur(res, 400, "Ce compte n'a pas encore de mot de passe : réinitialisez-le.");
    await B.run("UPDATE comptes SET changer=1, raison='force' WHERE login=?", c.login);
    await audit(C.login, "compte.changement_impose", c.login, ip);
    return json(res, 200, {ok:true});
  }
  if (p === "/api/v1/comptes/deverrouiller" && req.method === "POST"){
    const b = await corpsJson(req), c = await compteDe(b.login);
    if (!c) return erreur(res, 404, "Compte inconnu du serveur.");
    await B.run("UPDATE comptes SET echecs=0, verrou=NULL WHERE login=?", c.login); ECHECS_INCONNUS.delete(String(c.login).toLowerCase());
    await audit(C.login, "compte.deverrouille", c.login+(c.verrou && c.verrou > maintenant() ? " (verrouillé jusqu'à "+c.verrou+")" : " (n'était pas verrouillé)"), ip);
    return json(res, 200, {ok:true});
  }
  /* correctif 23 : liste filtrée et paginée (50 000 comptes du portail : 7,6 Mo à chaque ouverture de l'écran) —
     ?logins=a,b (comptes affichés), ?q= (recherche), ?limite= et ?decalage= ; sans paramètre, liste complète comme avant */
  if (p === "/api/v1/comptes"){
    const q = Object.fromEntries(u.searchParams.entries()), w = [], a = [];
    if (q.logins){ const l = String(q.logins).split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0, 500); if (l.length){ w.push("lower(login) IN ("+l.map(()=>"?").join(",")+")"); a.push(...l); } }
    if (q.q){ w.push("(lower(login) LIKE ? OR lower(nom) LIKE ?)"); const m = "%"+String(q.q).toLowerCase().slice(0, 60).replace(/[%_]/g, "")+"%"; a.push(m, m); }
    if (q.actif === "1" || q.actif === "0"){ w.push("actif=?"); a.push(Number(q.actif)); }
    const lim = q.limite ? Math.min(2000, Math.max(1, Number(q.limite) || 200)) : 0, dec = Math.max(0, Number(q.decalage) || 0);
    const where = w.length ? " WHERE "+w.join(" AND ") : "";
    if (q.resume === "1"){ const n = async sql=>Number(((await B.get(sql, maintenant())) || {}).n || 0);
      const sq = secuDe(await D.referentielLecture()), vj = sq.premiere.validiteJours, lim = Date.now() - sq.resetValiditeMin*60000; let prem = 0, exp = 0;
      for (const c of await B.all("SELECT etat, temp_le FROM comptes WHERE actif=1 AND etat IN ('temp_matricule','temp_code','temp_code_utilise')")){
        const perime = c.etat === "temp_matricule" ? vj > 0 && c.temp_le && new Date(c.temp_le).getTime() + vj*86400000 < Date.now() : c.etat === "temp_code_utilise" || (c.temp_le && new Date(c.temp_le).getTime() < lim);
        if (perime) exp++; else prem++; }
      return json(res, 200, {resume:{invite:await n("SELECT COUNT(*) AS n FROM comptes WHERE actif=1 AND etat='sans_mdp' AND ?<>''"), verrouille:await n("SELECT COUNT(*) AS n FROM comptes WHERE actif=1 AND verrou IS NOT NULL AND verrou>?"), premiere:prem, expires:exp}}); }
    const comptes = await B.all("SELECT login,nom,role,actif,etat,changer,derniere,verrou,a2f_actif FROM comptes"+where+" ORDER BY login"+(lim ? " LIMIT "+lim+" OFFSET "+dec : ""), ...a);
    return json(res, 200, lim ? {comptes, total:Number(((await B.get("SELECT COUNT(*) AS n FROM comptes"+where, ...a)) || {}).n || 0)} : {comptes});
  }
  /* v47 : sessions actives, révocation individuelle ou globale */
  if (p === "/api/v1/sessions" && req.method === "GET"){
    /* correctif 23 : filtre par compte et limite réglable (500 en dur auparavant) */
    const qs = Object.fromEntries(u.searchParams.entries()), limS = Math.min(5000, Math.max(1, Number(qs.limite) || 500));
    const l = qs.login ? await B.all("SELECT id, login, cree, vu, ip, agent, a2f_ok, persistant FROM sessions WHERE lower(login)=lower(?) ORDER BY vu DESC LIMIT "+limS, String(qs.login).trim())
      : await B.all("SELECT id, login, cree, vu, ip, agent, a2f_ok, persistant FROM sessions ORDER BY vu DESC LIMIT "+limS);
    const totalS = Number(((qs.login ? await B.get("SELECT COUNT(*) AS n FROM sessions WHERE lower(login)=lower(?)", String(qs.login).trim()) : await B.get("SELECT COUNT(*) AS n FROM sessions")) || {}).n || 0);
    return json(res, 200, {total:totalS, sessions:l.map(s=>({ref:s.id.slice(0,12), login:s.login, cree:new Date(Number(s.cree)).toISOString(), vu:new Date(Number(s.vu)).toISOString(), ip:s.ip, agent:String(s.agent||"").slice(0,80),
      moi:s.id === sess.sid, verifiee:s.a2f_ok === null || Number(s.a2f_ok) === 1, persistante:!!Number(s.persistant)}))});
  }
  if (p === "/api/v1/sessions/revoquer" && req.method === "POST"){
    const b = await corpsJson(req);
    let n;
    if (b.tout) n = (await B.run("DELETE FROM sessions WHERE id<>?", sess.sid)).n;
    else if (b.login) n = (await B.run("DELETE FROM sessions WHERE lower(login)=lower(?) AND id<>?", String(b.login), sess.sid)).n;
    else n = (await B.run("DELETE FROM sessions WHERE substr(id,1,12)=? AND id<>?", String(b.ref||"").slice(0,12), sess.sid)).n;
    await audit(C.login, "sessions.revoquees", b.tout ? "toutes ("+n+")" : (b.login ? "compte "+b.login : "session "+b.ref)+" ("+n+")", ip);
    return json(res, 200, {ok:true, revoquees:n});
  }
  if (p === "/api/v1/alertes") return json(res, 200, {alertes:(await meta("alertes")) || []});
  /* correctif 13 : audit du serveur (connexions, refus, réglages, restaurations, écritures) consultable par page,
     avec filtres de période (jj/mm/aaaa à l'écran), de compte, d'action et recherche ; aucune limite fixe à 500 */
  if (p === "/api/v1/audit-serveur"){
    const q = Object.fromEntries(u.searchParams.entries()), w = [], a = [];
    /* horodatage en UTC (ISO) : bornes du jour local converties */
    const isoJour = k => new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)).toISOString();
    if (dateOk(q.du)){ w.push("ts >= ?"); a.push(isoJour(q.du)); }
    if (dateOk(q.au)){ w.push("ts < ?"); a.push(isoJour(ajoutJours(q.au, 1))); }
    if (q.login){ w.push("lower(login) = ?"); a.push(String(q.login).toLowerCase().slice(0, 80)); }
    if (q.action){ w.push("action LIKE ?"); a.push(String(q.action).replace(/[%_]/g, "").slice(0, 60)+"%"); }
    if (q.q && String(q.q).trim().length >= 2){ const s = "%"+String(q.q).trim().toLowerCase().replace(/[%_]/g, "").slice(0, 80)+"%"; w.push("(lower(detail) LIKE ? OR lower(login) LIKE ? OR lower(action) LIKE ? OR ip LIKE ?)"); a.push(s, s, s, s); }
    const lim = Math.min(500, Math.max(1, Number(q.limit) || 100)), off = Math.max(0, Number(q.offset) || 0), wh = w.length ? " WHERE "+w.join(" AND ") : "";
    const total = Number((await B.get("SELECT COUNT(*) n FROM audit"+wh, ...a)).n);
    const lignes = await B.all("SELECT id,ts,login,action,detail,ip,CASE WHEN empreinte IS NULL THEN 0 ELSE 1 END scelle FROM audit"+wh+" ORDER BY id DESC LIMIT "+lim+" OFFSET "+off, ...a);
    if (q.format === "csv"){
      await audit(C.login, "audit.exporte", "audit du serveur : "+total+" ligne(s)", ip);
      const tous = await B.all("SELECT id,ts,login,action,detail,ip FROM audit"+wh+" ORDER BY id DESC LIMIT 200000", ...a);
      /* correctif 16 : une valeur commençant par = + - @ (formule) est neutralisée à l'ouverture dans un tableur */
      const cel = v => { let x = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(x)) x = "'"+x; return /[;"\r\n]/.test(x) ? '"'+x.replace(/"/g, '""')+'"' : x; };
      const fr = ts => { const d = new Date(ts); if (isNaN(d)) return String(ts||""); const z = v => String(v).padStart(2, "0"); return z(d.getDate())+"/"+z(d.getMonth()+1)+"/"+d.getFullYear()+" "+z(d.getHours())+":"+z(d.getMinutes())+":"+z(d.getSeconds()); };
      const txt = "\uFEFF"+["N°;Date;Compte;Action;Détail;Adresse"].concat(tous.map(r=>[r.id, fr(r.ts), r.login, r.action, r.detail, r.ip].map(cel).join(";"))).join("\r\n");
      entetes(res, true); res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"audit-serveur-"+aujourdhui()+".csv\""}); return res.end(txt);
    }
    return json(res, 200, {lignes, total, offset:off, limit:lim});
  }

  /* ---- terminaux : pilotes intégrés ou déposés dans donnees/pilotes ---- */
  if (p.startsWith("/api/v1/pointeuses/")){
    const ref = await D.referentielLecture() || {};
    const moiU = (ref.users||[]).find(x=>String(x.login).toLowerCase() === C.login.toLowerCase());
    const pr = moiU ? (ref.profils||[]).find(x=>x.id === moiU.profilId) : null;
    const rang = {aucun:0, lecture:1, saisie:2, validation:3, config:4}[((pr||{}).droits||{}).TER] || 0;
    const action = p.split("/").pop();
    /* 56.33.11 : lecture des pilotes et de l'état des appareils (n° de série, adresses, badges inconnus) réservée au droit
       sur les terminaux (avant : tout utilisateur connecté) */
    /* correctif 11 : la validation RH (sans droit sur les terminaux) consulte et lève les blocages biométriques de son périmètre */
    const rangRh = ({validation:3, config:4}[((pr||{}).droits||{}).EMP] || 0), rhSeul = !admin && rang < 2 && rangRh >= 3 && (action === "biometrie-lever-blocage" || action === "biometrie-sync-etat");
    if (!admin && rang < 1 && !rhSeul) return erreur(res, 403, "Droit de consultation des terminaux requis.");
    if (action === "pilotes") return json(res, 200, {pilotes:PT.liste(), attente:PT.attente(), dossier:path.join(DONNEES, "pilotes")});
    if (action === "etat"){ if (!admin && rang < 2) return erreur(res, 403, "Droits insuffisants sur les terminaux."); return json(res, 200, await PT.etat()); }
    /* correctif 10 : badgeages d'un terminal exportés par le serveur (avant : badgeages chargés dans le navigateur — partiels en
       grand effectif —, rapprochés sur le nom du terminal, lignes sans terminal incluses). Période de 93 jours au plus, périmètre appliqué. */
    if (action === "export" && req.method === "GET"){
      const id = String(u.searchParams.get("id")||""), T = (ref.terms||[]).find(x=>x.id === id); if (!T) return erreur(res, 404, "Terminal introuvable.");
      const j = s => /^\d{4}-\d{2}-\d{2}$/.test(s||"") ? s : null, au = j(u.searchParams.get("au")) || aujourdhui();
      const du = j(u.searchParams.get("du")) || new Date(new Date(au+"T00:00:00Z").getTime() - 30*86400000).toISOString().slice(0, 10);
      if (du > au || (new Date(au) - new Date(du)) / 86400000 > 93) return erreur(res, 400, "Période de 93 jours au plus.");
      const {P:PE} = await D.perimetreDe(ref, C.login);
      if (!admin && PE.set !== null && T.siteId){ const sites = new Set((await D.employes()).filter(e=>PE.set.has(String(e.mat))).map(e=>e.siteId)); if (!sites.has(T.siteId)) return erreur(res, 403, "Terminal hors de votre périmètre."); }
      const l = (await B.all("SELECT data FROM enreg WHERE coll='ptg' AND d>=? AND d<=?", du, au)).map(r=>{ try { return JSON.parse(r.data); } catch(e){ return null; } })
        .filter(x=>x && (x.term ? x.term === id : (x.dev && (x.dev === T.nom || x.dev === T.ip))) && (admin || PE.set === null || PE.set.has(String(x.mat)))).sort((a, b)=>String(a.ts) < String(b.ts) ? -1 : 1);
      const c = v=>{ v = String(v == null ? "" : v); return /[";\r\n]/.test(v) ? '"'+v.replace(/"/g, '""')+'"' : v; };
      const csv = "\ufeff"+["MATRICULE;DATE;HEURE;SENS;TERMINAL;SOURCE"].concat(l.map(x=>[x.mat, String(x.ts).slice(0, 10), String(x.ts).slice(11, 16), x.sens, T.nom, x.src||""].map(c).join(";"))).join("\r\n");
      await audit(C.login, "pointeuse.export", (T.nom||id)+" du "+du+" au "+au+" : "+l.length+" badgeage(s)", ip);
      res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"pointages_"+String(T.nom||id).replace(/[^A-Za-z0-9_-]+/g, "_")+"_"+du+"_"+au+".csv\""}); return res.end(csv);
    }
    if (!admin && rang < 2 && !rhSeul) return erreur(res, 403, "Droits insuffisants sur les terminaux.");
    /* 56.33.11 : liste des réactivations en attente des RH (matricule, nom, code d'absence) réservée à ceux qui peuvent
       lever le blocage : validation RH ou paramétrage des terminaux */
    const etatBio = async () => { const e = await BS().etat(); if (!(admin || rang >= 4 || rangRh >= 3)) delete e.blocagesRh;
      /* correctif 11 : blocages (code d'absence = donnée de santé) et derniers événements limités au périmètre */
      if (!admin){ const {P:PB} = await D.perimetreDe(ref, C.login); if (PB.set !== null){ const ok = m=>PB.set.has(String(m)); if (e.blocagesRh) e.blocagesRh = e.blocagesRh.filter(x=>ok(x.mat)); e.evenements = (e.evenements||[]).filter(x=>!x.mat || x.mat === "*" || ok(x.mat)); } }
      if (rhSeul) return {blocagesRh:e.blocagesRh || []};
      return e; };
    if (action === "biometrie-sync-etat" && req.method === "GET") return json(res, 200, await etatBio());
    if (req.method !== "POST") return erreur(res, 405, "Méthode");
    const b = await corpsJson(req);
    /* correctif 10 : un terminal d'un site hors du périmètre n'est ni interrogé ni commandé (même règle que la supervision) */
    if (!admin && b.id && ["recharger", "approuver", "desactiver", "biometrie-sync-config", "biometrie-sync-now", "biometrie-lever-blocage"].indexOf(action) < 0){
      const {P:PP} = await D.perimetreDe(ref, C.login), T0 = (ref.terms||[]).find(x=>x.id === String(b.id));
      if (PP.set !== null && T0 && T0.siteId){ const sites = new Set((await D.employes()).filter(e=>PP.set && PP.set.has(String(e.mat))).map(e=>e.siteId)); if (!sites.has(T0.siteId)) return erreur(res, 403, "Terminal hors de votre périmètre."); }
    }
    if (action === "recharger"){ if (!admin) return erreur(res, 403, "Réservé aux administrateurs."); const r = await PT.charger(); await audit(C.login, "pilotes.recharges", JSON.stringify({nb:r.nb, erreurs:r.erreurs, attente:(r.attente||[]).map(x=>x.id)}), ip); return json(res, 200, Object.assign({pilotes:PT.liste(), attente:PT.attente()}, r)); }
    if (action === "approuver" || action === "desactiver"){
      if (!admin) return erreur(res, 403, "Réservé aux administrateurs.");
      try { const r = await PT.approuver(String(b.pilote||""), C.login, action === "desactiver"); return json(res, 200, Object.assign({pilotes:PT.liste(), attente:PT.attente()}, r)); }
      catch(e){ return erreur(res, 400, e.message); }
    }
    if (action === "secret"){
      if (!admin && rang < 4) return erreur(res, 403, "Réservé au paramétrage des terminaux.");
      const v = {}; Object.keys(b.valeurs||{}).forEach(k=>{ if (/^[a-zA-Z]{1,30}$/.test(k)) v[k] = String(b.valeurs[k]).slice(0, 200); });
      await PT.enregistrerSecret(String(b.id||""), v); await audit(C.login, "pointeuse.secret", String(b.id||"")+" : "+Object.keys(v).join(", "), ip);
      return json(res, 200, {ok:true, champs:Object.keys(v)});
    }
    if (action === "referentiel") return json(res, 200, {ok:true});
    if (action === "verifier-identifiants" && !admin && rang < 4) return erreur(res, 403, "Réservé au paramétrage des terminaux.");
    if (action === "verifier-identifiants" && req.method === "POST"){ try { return json(res, 200, await PT.verifierIdentifiants(String(b.id||""), C.login)); } catch(e){ return erreur(res, e.code || 400, e.message); } }
    /* v56.24 : synchronisation biométrique automatique (pointage et accès) — les actions manuelles restent inchangées */
    if (action === "biometrie-sync-etat") return json(res, 200, await etatBio());
    if (action === "biometrie-sync-config" || action === "biometrie-sync-now" || action === "biometrie-resync-terminal"){
      if (!admin && rang < 4) return erreur(res, 403, "Réservé au paramétrage des terminaux.");
      if (action === "biometrie-sync-config") return json(res, 200, {ok:true, config:await BS().enregistrerConfig(b, C.login)});
      if (action === "biometrie-resync-terminal"){ try { return json(res, 200, await BS().resynchroniser(String(b.id||""), C.login)); } catch(e){ return erreur(res, e.code || 400, e.message); } }
      const c = await BS().config(); if (!c.actif) return erreur(res, 409, "Synchronisation automatique désactivée : utilisez les actions manuelles ou activez-la.");
      const r = BS().cycle("manuel : "+C.login); const id = "cy-demande-"+Date.now().toString(36);
      r.then(x=>audit(C.login, "biometrie.cycle.demande", x.id+" : "+x.resultat)).catch(()=>{});
      return json(res, 202, {ok:true, operation:id, note:"Cycle lancé : suivez son résultat dans « Derniers cycles »."});
    }
    if (action === "biometrie-lever-blocage"){
      const rh = {aucun:0, lecture:1, saisie:2, validation:3, config:4}[((pr||{}).droits||{}).EMP] || 0;
      if (!admin && rang < 4 && rh < 3) return erreur(res, 403, "Réservé à la validation RH ou au paramétrage des terminaux.");
      if (!admin){ const {P:PL} = await D.perimetreDe(ref, C.login); if (PL.set !== null && !PL.set.has(String(b.mat||"").trim())) return erreur(res, 403, "Salarié hors de votre périmètre."); }
      try { return json(res, 200, await BS().leverBlocage(String(b.mat||"").trim(), C.login, String(b.motif||"").trim())); } catch(e){ return erreur(res, e.code || 400, e.message); }
    }
    /* v56.5 : état des visages enregistrés (métadonnées seulement, jamais les images ni les gabarits) */
    if (action === "visages-etat"){ if (!admin && rang < 4) return erreur(res, 403, "Réservé au paramétrage des terminaux."); return json(res, 200, {resume:await VIS().resume()}); }
    /* correctif 11 : écran Biométrie relié aux données réelles — liste paginée des salariés enrôlés (métadonnées seulement, jamais les
       gabarits), périmètre appliqué ; effacement des gabarits d'un salarié (paramétrage TER, confirmation, audit, retrait des appareils) */
    if (action === "visages-liste"){
      const {P:PV} = await D.perimetreDe(ref, C.login), emps = new Map((await D.employes()).map(e=>[String(e.mat), e])), q = String(b.q||"").trim().toLowerCase();
      const parMat = new Map(); (await B.all("SELECT mat, format, indice, taille, source, cree FROM bio_visages ORDER BY mat, format, indice")).forEach(r=>{ const m = String(r.mat); if (!admin && PV.set !== null && !PV.set.has(m)) return; (parMat.get(m) || parMat.set(m, []).get(m)).push({format:r.format, indice:Number(r.indice), taille:Number(r.taille), source:r.source||"", cree:r.cree}); });
      const pres = new Map(); (await B.all("SELECT terminal_id, mat FROM bio_presence")).forEach(r=>{ const m = String(r.mat); if (parMat.has(m) || !q) (pres.get(m) || pres.set(m, []).get(m)).push(r.terminal_id); });
      const bloq = new Map((await B.all("SELECT mat, mode, fin FROM bio_blocages WHERE statut='actif'")).map(r=>[String(r.mat), r]));
      let l = Array.from(parMat.entries()).map(([m, v])=>{ const e = emps.get(m) || {}; return {mat:m, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), siteId:e.siteId||"", sortie:e.sortie||"", inconnu:!emps.has(m), gabarits:v, appareils:pres.get(m) || [], bloque:bloq.has(m) ? (bloq.get(m).mode === "rh" ? "rh" : "auto") : ""}; });
      if (q) l = l.filter(x=>(x.mat+" "+x.nom).toLowerCase().indexOf(q) >= 0);
      const off = Math.max(0, Number(b.offset)||0); return json(res, 200, {total:l.length, lignes:l.slice(off, off + 100), sansBio:Array.from(emps.values()).filter(e=>!(e.sortie && e.sortie < aujourdhui()) && (admin || PV.set === null || PV.set.has(String(e.mat))) && !parMat.has(String(e.mat))).length});
    }
    if (action === "visages-supprimer"){
      if (!admin && rang < 4) return erreur(res, 403, "Réservé au paramétrage des terminaux.");
      if (b.confirme !== true) return erreur(res, 428, "Effacement non confirmé.");
      const mat = String(b.mat||"").trim(); if (!mat) return erreur(res, 400, "Matricule manquant.");
      if (!admin){ const {P:PS2} = await D.perimetreDe(ref, C.login); if (PS2.set !== null && !PS2.set.has(mat)) return erreur(res, 403, "Salarié hors de votre périmètre."); }
      const r = await VIS().supprimer(mat, C.login), rb = await BS().retirerBiometrie(mat, C.login);
      return json(res, 200, {ok:true, gabarits:Number(r)||0, retrait:rb});
    }
    /* actions qui modifient l'appareil : réservées au paramétrage des terminaux */
    /* correctif 10 : lire ou retirer les utilisateurs d'un appareil (noms, cartes) relève aussi du paramétrage (avant : dès la saisie) */
    if (["nettoyage", "redemarrer", "effacer-commandes", "utilisateurs-envoyer", "utilisateurs-lire", "utilisateurs-retirer", "visages-lire", "visages-envoyer"].indexOf(action) >= 0 && !admin && rang < 4) return erreur(res, 403, "Action réservée au paramétrage des terminaux.");
    try { return json(res, 200, await PT.executer(action, String(b.id||""), {quoi:b.quoi, confirme:b.confirme === true}, C.login)); }
    catch(e){ return erreur(res, [403, 404, 428, 429, 501].indexOf(e.code) >= 0 ? e.code : 502, e.message); }
  }

  if (req.method === "GET" && !p.startsWith("/api/")){
    if (p === "/" || p === "/index.html") return fichierStatique(res, APP, "index.html");
    return fichierStatique(res, APP, p);
  }
  return erreur(res, 404, "Introuvable");
}

/* ---------------- démarrage ---------------- */
function certificat(){
  try {
    const pem = path.join(D_CERT, "cert.pem"), cle = path.join(D_CERT, "cle.pem"), pfx = path.join(D_CERT, "fiwakti.pfx");
    if (fs.existsSync(pem) && fs.existsSync(cle)) return {cert:fs.readFileSync(pem), key:fs.readFileSync(cle)};
    if (fs.existsSync(pfx)){ const c = {pfx:fs.readFileSync(pfx), passphrase:(()=>{ try { return fs.readFileSync(path.join(D_CERT, "pfx.txt"), "utf8").replace(/^\uFEFF/, "").trim(); } catch(e){ return ""; } })()};
      /* 56.33.1 : certificat vérifié avant usage — un PFX exporté par Windows avec un ancien chiffrement est refusé par
         Node 22 (OpenSSL 3) : on le signale et FIWAKTI démarre quand même, en HTTP sur ce poste seulement */
      try { require("tls").createSecureContext(c); return c; }
      catch(e){ const m = "certificat fiwakti.pfx illisible ("+e.message+") : démarrage en HTTP sur ce poste (http://localhost:8080). Réexportez le certificat en AES-256 (voir LISEZ-MOI)."; journal(m); console.error(m); return null; } }
  } catch(e){ journal("certificat : "+e.message); }
  return null;
}
async function demarrer(){
  /* 56.33.8 : après un redémarrage de Windows, PostgreSQL peut mettre plusieurs minutes à accepter les connexions
     (observé : délai dépassé, arrêt, relance) — FIWAKTI l'attend jusqu'à 15 min en réessayant toutes les 5 s, avec un
     message clair dans le journal, au lieu de s'arrêter */
  const pg = !!(CONFIG.base && CONFIG.base.type === "pg"), t0 = Date.now(); let n = 0;
  for (;;){
    try { await ouvrirBase(); if (n) journal("PostgreSQL disponible après "+Math.round((Date.now()-t0)/1000)+" s d'attente"); break; }
    catch(e){ n++;
      if (!pg || Date.now() - t0 > 15 * 60000){ const m = "Base de données inaccessible ("+(pg ? "PostgreSQL" : "SQLite")+") : "+e.message; journal(m); console.error(m); process.exit(1); }
      if (n === 1 || n % 6 === 0) journal("attente de PostgreSQL ("+e.message+") : nouvel essai toutes les 5 s, jusqu'à 15 min");
      await new Promise(ok=>setTimeout(ok, 5000)); } }
  if (CONFIG.installe){
    try {
      const n = await D.migrer((par, motif)=>sauvegarder(par, motif));
      if (n){ journal("migration vers le stockage structuré : "+JSON.stringify(n)); await audit("systeme", "migration", "stockage structuré : "+Object.keys(n).map(k=>k+" "+n[k]).join(", ")); }
    } catch(e){ journal("migration impossible : "+e.message); console.error("Migration impossible : "+e.message); process.exit(1); }
  }
  const cert = certificat();
  SECURISE = !!cert;
  /* v46 : HTTP n'est jamais exposé sur le réseau. Sans certificat, écoute limitée à ce poste
     (installation locale, proxy HTTPS placé sur le même serveur, développement). */
  const adresse = SECURISE ? (CONFIG.adresse || "0.0.0.0") : "127.0.0.1";
  LOCAL_SEUL = !SECURISE;
  if (!SECURISE && (CONFIG.adresse || "0.0.0.0") !== "127.0.0.1") journal("HTTPS absent : écoute limitée à 127.0.0.1. Installez un certificat (donnees/certificats) pour ouvrir FIWAKTI au réseau.");
  /* jeton d'installation : exigé pour utiliser l'assistant depuis un autre poste */
  if (!CONFIG.installe){
    const f = path.join(DONNEES, "jeton-installation.txt");
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(9).toString("base64url"), {mode:0o600});
    JETON_INSTALL = fs.readFileSync(f, "utf8").trim();
    const m = "Code d'installation (pour un accès depuis un autre poste) : "+JETON_INSTALL;
    /* v56.23 : jamais dans le journal persistant ; seulement à l'écran de l'installateur */
    journal("installation en attente : code d'installation affiché à l'écran (donnees/jeton-installation.txt)"); console.log(m);
  }
  const port = Number(process.env.FIWAKTI_PORT) || Number(CONFIG.port) || (SECURISE ? 8443 : 8080);
  const gestion = (req, res) => {
    const t0 = process.hrtime.bigint(), chemin = String(req.url||"").split("?")[0], fam = familleRoute(req.method, chemin);
    /* v56.15 : débit maximal par adresse et par session (429 au-delà), délai maximal par catégorie (503 au-delà) */
    const refuser = lim => { METRIQUES_ROBUSTESSE.refus429++; res.setHeader("Retry-After", String(lim)); return erreur(res, 429, "Trop de requêtes : réessayez dans "+lim+" s."); };
    /* v56.23 : plusieurs instances (PostgreSQL + FIWAKTI_MULTI_INSTANCE ou CONFIG.multiInstance) → compteur partagé dans la
       base, qui fait autorité pour toutes les instances ; sinon seau à jetons local */
    if (debitPartage() && chemin.startsWith("/api/") && chemin !== "/api/sante")
      return limiteDebitPartagee(req).then(l=>{ if (l) return refuser(l); suiteGestion(req, res, t0, chemin, fam); }).catch(()=>suiteGestion(req, res, t0, chemin, fam));
    const lim = limiteDebit(req, chemin);
    if (lim) return refuser(lim);
    suiteGestion(req, res, t0, chemin, fam);
  };
  const suiteGestion = (req, res, t0, chemin, fam) => {
    const delai = delaiMax(req.method, chemin);
    const minuteur = delai ? setTimeout(()=>{ if (!res.headersSent){ METRIQUES_ROBUSTESSE.delais503++; journal("délai dépassé ("+delai+" ms) : "+req.method+" "+chemin);
      erreur(res, 503, "Le traitement dépasse le délai prévu ("+Math.round(delai/1000)+" s) : réessayez ou lancez-le en tâche de fond.", {delai:true}); } }, delai) : null;
    res.on("close", ()=>{ if (minuteur) clearTimeout(minuteur); });
    res.on("finish", ()=>{ try { noterMetrique(fam, Number(process.hrtime.bigint() - t0)/1e6, res.statusCode); } catch(e){} });
    traiter(req, res).catch(e=>{
      /* v56.15 : base momentanément indisponible → 503 explicite (le serveur reste en marche et reprend seul) */
      const indispo = /ECONNREFUSED|ECONNRESET|57P01|57P03|08006|08001|Connection terminated|timeout exceeded when trying to connect|the database system is (starting|shutting)/i.test(String(e.code||"")+" "+String(e.message||""));
      const ref = refErreur();
      journal("réf. "+ref+" — "+(indispo ? "base indisponible " : "erreur ")+req.method+" "+String(req.url||"").split("?")[0]+" : "+(indispo ? (e.code||e.message) : (e.stack||e.message)));
      try { if (indispo){ res.setHeader && !res.headersSent && res.setHeader("Retry-After", "5"); erreur(res, 503, "Base de données momentanément indisponible : vos données ne sont pas perdues, réessayez dans quelques secondes.", {ref, message:"Base de données momentanément indisponible : vos données ne sont pas perdues, réessayez dans quelques secondes. (Réf. "+ref+")"}); }
        else erreur(res, 500, "Erreur interne du serveur : l'opération n'a pas été enregistrée. Réessayez ; si le problème persiste, communiquez la référence à votre administrateur.", {ref, message:"Erreur interne du serveur : l'opération n'a pas été enregistrée. Réessayez ; si le problème persiste, communiquez la référence à votre administrateur. (Réf. "+ref+")"}); } catch(x){}
      DERNIERES_ERREURS.unshift({ref, code:indispo ? 503 : 500, message:indispo ? "base indisponible" : String(e.message||"").slice(0, 160), le:new Date().toISOString()}); DERNIERES_ERREURS.length = Math.min(DERNIERES_ERREURS.length, 20); });
  };
  const serveur = SECURISE ? https.createServer(cert, gestion) : http.createServer(gestion);
  /* v56.15 : en-têtes en 15 s au plus ; requête complète (dont envoi d'une sauvegarde ou d'une mise à jour) en 60 min au plus (config « envoiMaxMinutes ») ; connexions
     inactives fermées après 5 s */
  serveur.headersTimeout = 15000; serveur.requestTimeout = Math.max(5, Number(CONFIG.envoiMaxMinutes) || 60) * 60000; serveur.keepAliveTimeout = 5000;   /* 56.33.11 : 60 min (sauvegardes de plusieurs Go) */
  serveur.listen(port, adresse, ()=>{
    const m = "FIWAKTI "+VERSION+" ("+B.type+") à l'écoute sur "+(SECURISE ? "https" : "http")+"://localhost:"+port+(CONFIG.installe ? "" : "/installation.html");
    journal(m); console.log(m);
  });
  serveur.on("error", e=>{
    const m = e.code === "EADDRINUSE" ? "Le port "+port+" est déjà utilisé par un autre logiciel. Choisissez un autre port (FIWAKTI_PORT) ou arrêtez ce logiciel." : e.message;
    journal("démarrage impossible : "+m); console.error(m); process.exit(1);
  });
  /* port dédié aux appareils en mode Push (/iclock/ uniquement, HTTP simple) :
     ouvert seulement tant qu'au moins un appareil en mode Push est déclaré */
  const portPush = Number(process.env.FIWAKTI_PORT_PUSH) || Number(CONFIG.portPush) || 8081;
  let SP = null;
  async function gererPortPush(){
    let besoin = false;
    try { const ref = CONFIG.installe ? await D.referentielLecture() : null; besoin = CONFIG.pushActif !== false && !!(ref && (ref.terms||[]).some(t=>t.pilote === "zk-push" && t.actif !== false)); } catch(e){}
    if (besoin && !SP){
      SP = http.createServer((req, res)=>{
        const u = new URL(req.url, "http://x");
        if (!/^\/iclock\//i.test(u.pathname) || !CONFIG.installe){ res.writeHead(404); return res.end(); }
        if (MOD && !MOD.estActif("FW-Time") && !MOD.estActif("FW-Acces")){ res.writeHead(403); return res.end(); }
        if (limiteDebit(req, "/api/iclock")){ res.writeHead(429); return res.end(); }
        (async ()=>PT.iclock(req, res, u, req.method === "POST" ? ()=>corps(req, 20e6) : ""))().catch(e=>{ journal("push : "+e.message); try { res.writeHead(500); res.end(); } catch(x){} });
      });
      SP.on("error", e=>{ journal("port push "+portPush+" indisponible : "+e.message); SP = null; });
      SP.listen(portPush, CONFIG.adressePush || CONFIG.adresse || "0.0.0.0", ()=>journal("appareils en mode Push : http://<serveur>:"+portPush+"/iclock/"));
    } else if (!besoin && SP){ SP.close(); SP = null; journal("port push fermé : aucun appareil en mode Push"); }
  }
  GERER_PUSH = gererPortPush;
  gererPortPush(); PLAN.planifier("pointeuses-port-push", {intervalle:60000, priorite:2, delai:15000, fn:async ()=>{ gererPortPush(); return SP ? "ouvert" : "fermé"; }});
  /* v55 : collecte automatique seulement si le pointage ou l'accès est actif ; droits de licence relus chaque minute
     (licence arrivée à expiration, par exemple) */
  PLAN.planifier("licences-et-collecte", {intervalle:60000, priorite:1, delai:120000, actif:()=>!!CONFIG.installe, fn:async ()=>{
    await chargerModules();
    /* v56.30 : passage en rappel, en grâce, en consultation seule ou en blocage tracé une fois ; refus agrégés par jour */
    try { const LV = await licenceEtat(true), prec = await meta("licence_etat");
      if (LV.e.etat !== (prec && prec.etat)){ await meta("licence_etat", {etat:LV.e.etat, le:maintenant()});
        if (prec) await audit("systeme", "licence.etat", (prec.etat||"—")+" → "+LV.e.etat+" (fin "+((LV.e.L||{}).fin||"—")+", politique "+((LV.e.L||{}).politique||"—")+")"); }
      if (REFUS_LIC.jour && REFUS_LIC.jour !== aujourdhui()) flushRefusLicence(); } catch(e){ journal("licence : "+e.message); }
    if (PT && MOD && (MOD.estActif("FW-Time") || MOD.estActif("FW-Acces"))){ await PT.collecteAuto().catch(e=>journal("collecte automatique : "+e.message)); return "collecte faite"; }
    return "modules relus"; }});
  /* v56.16 : tâches de fond déclarées au planificateur central (FW-Scheduler) — une seule minuterie, état visible */
  const installe = () => !!CONFIG.installe;
  PLAN.planifier("sauvegarde-quotidienne", {intervalle:10*60000, priorite:1, delai:30*60000, actif:installe, fn:async ()=>{
    const h = new Date().getHours(), j = aujourdhui(), der = listeSauvegardes().find(m=>m.par === "automatique");
    const hS = Number((CONFIG.sauvegarde||{}).heure); if (!(h >= (Number.isFinite(hS) && hS >= 0 && hS <= 23 ? hS : 2) && (!der || der.cree.slice(0,10) < j))) return "pas encore l'heure";
    await sauvegarder("automatique", "quotidienne");
    try { await conservation(false); } catch(e){ journal("conservation : "+e.message); }
    try { const v = await verifierAudit(); fs.appendFileSync(path.join(D_JOURN, "ancrages-audit.log"), maintenant()+" "+(v.ok ? v.dernier+" "+v.n : "RUPTURE "+JSON.stringify(v.rupture))+"\n"); } catch(e){}
    try { await exporterAudit(); } catch(e){ journal("export d'audit : "+e.message); }
    if ((!MOD || MOD.estActif("FW-Time")) && !(PART && PART.enCours())){ await K.precalculer(); await prechauffer(); }
    return "sauvegarde faite";
  }});
  let BIO_DERNIER = 0;
  PLAN.planifier("synchro-biometrique", {intervalle:60000, premier:90000, priorite:2, delai:30*60000, actif:()=>installe() && !!PT, fn:async ()=>{
    const c = await BS().config(); if (!c.actif) return "inactive (mode manuel)"; if (c.pause) return "en pause";
    if (Date.now() - BIO_DERNIER < c.intervalleMin * 60000) return "prochain cycle dans "+Math.ceil((c.intervalleMin * 60000 - (Date.now() - BIO_DERNIER)) / 60000)+" min";
    BIO_DERNIER = Date.now(); const r = await BS().cycle("planificateur"); return r.resultat+" — "+r.actions+" action(s)"; }});
  /* correctif 11 : effacement des gabarits des salariés sortis (délai de conservation) et supprimés, même sans synchronisation automatique */
  /* correctif 16 : sorties échues — les règles « sortie d'un salarié » s'exécutent dans le navigateur d'un compte RH (et
     jamais en grand effectif, où le navigateur ne reçoit pas les fiches). Le serveur signale dans le journal chaque sortie
     passée depuis plus d'un jour sans traitement, une seule fois par salarié et date de sortie. */
  /* correctif 26 : absences en double d'une même demande et d'un même jour (régénérées par le navigateur avant ce correctif) :
     la première est gardée, les autres supprimées et tracées */
  PLAN.planifier("absences-doublons", {intervalle:24*3600000, premier:120000, priorite:4, delai:30*60000, actif:installe, fn:async ()=>{
    const vus = new Set(), aSuppr = [];
    for (const r of await B.all("SELECT id, mat, d, data FROM enreg WHERE coll='abs' AND data LIKE ? ORDER BY id", '%"dmdId"%')){
      let x; try { x = JSON.parse(r.data); } catch(e){ continue; } if (!x.dmdId) continue; const k = x.dmdId+"|"+r.d+"|"+r.mat; if (vus.has(k)) aSuppr.push(r); else vus.add(k); }
    for (const r of aSuppr) await B.run("DELETE FROM enreg WHERE coll='abs' AND id=?", r.id);
    if (aSuppr.length){ try { await K.invalider(aSuppr.map(r=>r.mat+"|"+r.d), []); } catch(e){} await audit("systeme", "absences.doublons_supprimes", aSuppr.length+" absence(s) en double supprimée(s) ("+Array.from(new Set(aSuppr.map(r=>r.mat))).slice(0, 20).join(", ")+")", ""); }
    return aSuppr.length+" doublon(s) supprimé(s)"; }});
  /* correctif 26 : délai d'un niveau de circuit — une demande restée en attente au-delà du délai est relancée (notification
     et trace dans l'historique et l'audit), une fois par niveau ; auparavant le délai saisi à l'écran n'avait aucun effet */
  PLAN.planifier("circuits-relances", {intervalle:3600000, premier:240000, priorite:4, delai:30*60000, actif:installe, fn:async ()=>{
    const ref = await D.referentielLecture() || {}, j = aujourdhui(), z = v => String(v).padStart(2, "0"), n0 = new Date(); let n = 0;
    for (const row of await B.all("SELECT id, data FROM enreg WHERE coll='dmd' AND (data LIKE ? OR data NOT LIKE ?)", '%"etat":"attente"%', '%"etat":%')){
      let x; try { x = JSON.parse(row.data); } catch(e){ continue; } if ((x.etat || "attente") !== "attente") continue;
      const L = Array.isArray(x.circuitNiv) ? x.circuitNiv : ((((ref.circuits || []).find(c=>c && c.id === x.circuitId)) || {}).niveaux || []), niv = Number(x.niveau || 0), nv = L[niv];
      const dl = Number(nv && nv.delai) || 0, depuis = x.niveauLe || x.creeLe || (x.hist && x.hist[0] && x.hist[0].d) || "";
      if (!dl || !/^\d{4}-\d{2}-\d{2}$/.test(depuis) || ajoutJours(depuis, dl) >= j || x.relanceNiv === niv) continue;
      x.relanceNiv = niv; x.__v = Number(x.__v || 0) + 1; x.hist = (Array.isArray(x.hist) ? x.hist : []).concat([{d:j, h:z(n0.getHours())+":"+z(n0.getMinutes()), action:"relance", qui:"FIWAKTI", niveau:niv, c:"délai de "+dl+" jour(s) dépassé au niveau "+(niv + 1)}]);
      await D.ecrire("dmd", x);
      await D.ecrireLot("notifs", [{id:"nf_rel_"+String(x.id).replace(/[^A-Za-z0-9_.:-]/g, "_")+"_"+niv, d:j, mat:String(x.mat || ""), txt:"Demande en attente depuis plus de "+dl+" jour(s) au niveau "+(niv + 1)+" : relance du valideur"}]);
      n++; }
    if (n) await audit("systeme", "demandes.relancees", n+" demande(s) en attente au-delà du délai de leur niveau", "");
    return n+" demande(s) relancée(s)"; }});
  /* correctif 25 : règles métier — sorties arrivées à échéance, services passés « hors effectif » : exécutées par le serveur
     (auparavant seulement signalées : « sortie non traitée ») */
  PLAN.planifier("regles-metier", {intervalle:3600000, premier:180000, priorite:4, delai:30*60000, actif:installe, fn:async ()=>{
    const r = await executerRegles(null, "système", new Set()); return r.executions+" exécution(s), "+r.actions+" action(s)"; }});
  PLAN.planifier("purge-biometrique", {intervalle:6*3600000, premier:120000, priorite:3, delai:30*60000, actif:()=>installe() && !!PT, fn:async ()=>{ const r = await BS().purgerVisages(); return r.gabarits+" gabarit(s) de "+r.salaries+" salarié(s) effacé(s)"; }});
  PLAN.planifier("debit-purge", {intervalle:60000, priorite:3, delai:30000, actif:()=>installe() && B.type === "pg", fn:async ()=>{
    const r = await B.run("DELETE FROM fw_debit WHERE fenetre < ?", Math.floor(Date.now() / 10000) - 6); return r.n+" compteur(s) purgé(s)"; }});
  PLAN.planifier("nettoyage-sessions-et-travaux", {intervalle:10*60000, priorite:3, delai:60000, actif:installe, fn:async ()=>{
    await B.run("DELETE FROM sessions WHERE vu < ?", Date.now() - 24*3600000); purgerTravaux();
    await B.run("DELETE FROM bases WHERE cree < ?", Date.now() - 24*3600000); return "ok"; }});
  /* 56.33.11 : lots déjà traités de la file d'ingestion purgés au-delà de conservation.fileJours (30 j par défaut) :
     leur contenu est conservé dans les événements bruts (raw_events). Jamais un lot en attente, en cours ou en erreur.
     Par tranches de 5 000 (verrous courts), au plus 200 000 lots par passage. */
  PLAN.planifier("purge-file-ingestion", {intervalle:3600000, premier:300000, priorite:3, delai:600000, actif:installe, fn:async ()=>{
    const jours = Math.max(7, Number((CONFIG.conservation||{}).fileJours) || 30), lim = new Date(Date.now() - jours*86400000).toISOString();
    let n = 0;
    for (let i = 0; i < 40; i++){
      const r = await B.run("DELETE FROM ingestion_queue WHERE id IN (SELECT id FROM ingestion_queue WHERE statut='traite' AND traite_utc < ? LIMIT 5000)", lim);
      n += r.n || 0; if ((r.n || 0) < 5000) break;
      await new Promise(ok=>setTimeout(ok, 200));
    }
    if (n) journal("file d'ingestion : "+n+" lot(s) traité(s) de plus de "+jours+" jours purgé(s)");
    /* archives des pointeuses : gardées aussi longtemps que les badgeages (conservation.badgeagesAns) */
    let na = 0; try { na = PT ? PT.purgerArchives((CONFIG.conservation||{}).badgeagesAns) : 0; } catch(e){ journal("archives des pointeuses : "+e.message); }
    if (na) journal("archives des pointeuses : "+na+" mois supprimé(s) (au-delà de la durée de conservation)");
    return n+" lot(s) purgé(s), "+na+" mois d'archives supprimé(s)";
  }});
  /* v56.2 : partitions des mois à venir (3 mois d'avance) */
  PLAN.planifier("partitions-postgresql", {intervalle:3600000, premier:60000, priorite:2, delai:120000, actif:()=>installe() && B.type === "pg", fn:async ()=>{
    const r = await B.partitions(); if (r.creees) journal("partitions : "+r.creees+" créée(s)");
    if (r.ignorees.length) await alerte("partitions.hors_plage", "partitions non créées (lignes déjà présentes dans la partition par défaut) : "+r.ignorees.join(", "));
    return r.creees+" créée(s)"; }});
  /* 56.33.11 : comptes des salariés sortis désactivés chaque heure (portail fermé, sessions supprimées) */
  PLAN.planifier("comptes-sortants", {intervalle:3600000, premier:120000, priorite:3, delai:120000, actif:installe, fn:async ()=>{
    const emps = await D.employes(), j = aujourdhui(), sortis = new Map(emps.filter(e=>e.sortie && e.sortie < j).map(e=>[String(e.mat), e.sortie]));
    if (!sortis.size) return "aucun";
    const adm = String(CONFIG.adminInitial||"").toLowerCase();
    const l = (await B.all("SELECT login, matricule FROM comptes WHERE actif=1 AND matricule IS NOT NULL AND matricule<>''")).filter(c=>sortis.has(String(c.matricule)) && String(c.login).toLowerCase() !== adm);
    for (const c of l){
      await B.run("UPDATE comptes SET actif=0, maj=? WHERE login=?", maintenant(), c.login); await B.run("DELETE FROM sessions WHERE login=?", c.login);
      await audit("systeme", "compte.desactive", c.login+" (salarié "+c.matricule+" sorti le "+sortis.get(String(c.matricule))+")");
    }
    return l.length+" compte(s) désactivé(s)";
  }});
  PLAN.planifier("corbeille", {intervalle:10*60000, priorite:3, delai:120000, actif:installe, fn:async ()=>{
    const n = await D.purgerCorbeille(); if (n) await audit("systeme", "corbeille.purge", n+" élément(s) effacé(s) à l'échéance de conservation"); return n+" effacé(s)"; }});
  PLAN.planifier("supervision-pointeuses", {intervalle:10*60000, priorite:2, delai:60000, actif:()=>installe() && !!PT, fn:async ()=>{
    await alertesSupervision(await PT.supervision((CONFIG.supervision||{}).seuilMinutes)); return "ok"; }});
  /* budgets de performance : alerte (au plus une par heure et par route) si le P95 dépasse le budget */
  PLAN.planifier("budgets-performance", {intervalle:10*60000, priorite:3, delai:30000, actif:installe, fn:async ()=>{
    let n = 0;
    for (const r of (await metriques()).routes){
      if (r.n >= 20 && r.p95 > r.budget){ const k = "budget|"+r.route, d = ALERTES_BUDGET.get(k) || 0;
        if (Date.now() - d > 3600000){ ALERTES_BUDGET.set(k, Date.now()); n++; await alerte("performance.budget", r.route+" : P95 "+r.p95+" ms au-delà du budget de "+r.budget+" ms ("+r.n+" requêtes)"); } }
    }
    return n+" alerte(s)"; }});

  if (CONFIG.installe) setTimeout(()=>{ ING.migrer().catch(e=>journal("migration v50 : "+e.message)); }, 3000);
  if (CONFIG.installe) setTimeout(async ()=>{ try { const du = ajoutJours(aujourdhui(), -45);
    const mats = (await B.all("SELECT DISTINCT mat FROM calc_jour WHERE d>=? AND nano>0", du)).map(r=>r.mat);
    const n = await WF.synchroniser(mats, du, aujourdhui()); if (n) journal("cycle de vie : "+n+" journée(s) à anomalie initialisée(s)"); } catch(e){ journal("cycle de vie : "+e.message); } }, 8000);
  /* 56.33.11 : badgeages en attente (identifiant inconnu de FIWAKTI) rattachés automatiquement quand le salarié est créé ou
     que son badge / code est renseigné — vérifié à chaque changement de la liste des salariés, au plus toutes les 2 minutes */
  let REJEU_EMPS = null;
  PLAN.planifier("rattachement-badgeages-en-attente", {intervalle:120000, priorite:2, delai:90000, actif:()=>!!(CONFIG.installe && ING), fn:async ()=>{
    const emps = await D.employes(); if (emps === REJEU_EMPS) return "salariés inchangés";
    const n = Number(((await B.get("SELECT COUNT(*) n FROM normalized_events WHERE statut='PENDING_REVIEW'")) || {}).n) || 0;
    if (!n){ REJEU_EMPS = emps; return "aucun badgeage en attente"; }
    const r = await ING.rejouer("systeme"); REJEU_EMPS = emps;
    return r.rejoues ? r.acceptes+" badgeage(s) rattaché(s)" : n+" en attente, sans salarié correspondant"; }});
  PLAN.planifier("reprise-file-ingestion", {intervalle:30000, priorite:1, delai:60000, actif:()=>!!(CONFIG.installe && ING), fn:async ()=>{ const n = await ING.reprendre(); return n ? n+" repris" : "file à jour"; }});
  PLAN.demarrer();
  /* calcul d'avance et préchauffage au démarrage (une seule fois, visible dans le planificateur) */
  PLAN.planifier("calcul-avance-demarrage", {intervalle:0, premier:15000, priorite:2, delai:3600000, actif:()=>!!CONFIG.installe && (!MOD || MOD.estActif("FW-Time")), fn:async ()=>{
    const n = await K.precalculer(); if (n) journal("calcul d'avance : "+n+" journées"); await prechauffer(); return n+" journée(s) calculée(s)"; }});
  process.on("SIGTERM", async ()=>{ try { K.arreter(); await B.fermer(); } catch(e){} process.exit(0); });
}
demarrer();
