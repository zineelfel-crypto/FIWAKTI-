/* FIWAKTI — FW-Licence et FW-ModuleEngine (v55, cahier des charges maître FIWAKTI Enterprise, §1A, §1B, §5, annexes A et B).
   Catalogue des modules FW- (implémentés ou réservés), droits accordés par la licence signée (vérifiés par le serveur),
   état d'activation, dépendances, versions, activation / désactivation sans perte de données, audit de chaque opération.
   Contrôle d'accès : une route ou une rubrique de données d'un module inactif est refusée par le serveur, quel que soit
   le chemin (écran, API, URL directe, import). Le contrôle est une simple consultation en mémoire (aucun coût mesurable). */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

/* Manifestes des modules livrés avec cette version (FW-ModuleSDK : identifiant stable, nom, version, catégorie,
   dépendances, écrans, rubriques de données, routes). Les modules « réservés » sont au catalogue sans être livrés. */
const CATALOGUE = [
  {id:"FW-Core", nom:"Socle (identité, organisation, sécurité, audit, configuration)", categorie:"socle", version:"55.0", implemente:true, socle:true, deps:[]},
  {id:"FW-Licence", nom:"Licences et modules", categorie:"socle", version:"55.0", implemente:true, socle:true, deps:["FW-Core"]},
  {id:"FW-RH", nom:"Dossier collaborateur et organisation", categorie:"metier", version:"55.0", implemente:true, socle:true, deps:["FW-Core"],
    vues:["emp","org","champs"], lettre:""},
  {id:"FW-Time", nom:"Temps et présence", categorie:"metier", version:"55.0", implemente:true, deps:["FW-Core","FW-RH"], lettre:"P",
    vues:["ptg","cal","jou","tt","arit","rgv","suivi","valj","cloture","dmd","circuits","bord","mgr"],
    donnees:["cals","jours","tt","arits","reglesV","circuits","convs","clotures"], colls:["ptg","abs","dmd","corrections","ajust"],
    routes:["/api/v1/calcul","/api/v1/journees","/api/v1/registre-anomalies","/api/v1/ajustements","/api/v1/recalculs","/api/v1/pointeuses","/api/v1/evenements","/api/v1/ingestion","/api/v1/moteur"]},
  {id:"FW-Acces", nom:"Contrôle des accès", categorie:"metier", version:"55.0", implemente:true, deps:["FW-Core","FW-RH","FW-Time"], lettre:"A",
    vues:["zones","acces","aplages","aplans"], donnees:["zones","aplages","aplans"]},
  {id:"FW-BI", nom:"Indicateurs, états et exports", categorie:"metier", version:"55.0", implemente:true, deps:["FW-Core","FW-RH"],
    vues:["etats"], donnees:["etats"], routes:["/api/v1/travaux","/api/v1/calcul/etat"]},
  /* réservés au catalogue (annexe A) : visibles, activables dès qu'une version les livre et que la licence les accorde */
  ...[["FW-ModuleEngine","Moteur de modules","socle"],["FW-ModuleSDK","Kit de développement de modules","socle"],["FW-Workflow","Processus et validations","socle"],
      ["FW-Rule","Règles et automatisations","socle"],["FW-Form","Formulaires dynamiques","socle"],["FW-EventBus","Événements métier","socle"],["FW-Search","Recherche","socle"],
      ["FW-AI","Intelligence artificielle","socle"],["FW-Integration","Intégrations","socle"],["FW-Data","Données analytiques","socle"],
      ["FW-Recrutement","Recrutement","metier"],["FW-Onboarding","Intégration des nouveaux collaborateurs","metier"],["FW-Competences","Compétences","metier"],
      ["FW-Evaluation","Évaluations","metier"],["FW-Formation","Formation","metier"],["FW-Conformite","Conformité","metier"],["FW-HSE","Santé, sécurité, environnement","metier"],
      ["FW-Medicale","Suivi médical","futur"],["FW-Visiteurs","Visiteurs","futur"],["FW-Migration","Assistant de migration des données","socle"],["FW-Parking","Parking et véhicules","futur"],["FW-Tenues","Tenues de travail","futur"],
      ["FW-CarteRepas","Cartes repas","futur"],["FW-Transport","Transport du personnel","futur"],["FW-Cantine","Cantine","futur"],["FW-Equipements","Équipements et dotations","futur"],
      ["FW-Habilitations","Habilitations","futur"],["FW-Documents","Gestion documentaire","futur"]]
    .map(([id, nom, categorie])=>({id, nom, categorie, version:null, implemente:false, deps:["FW-Core"].concat(["FW-Medicale","FW-Competences","FW-Evaluation","FW-Formation","FW-Onboarding","FW-Recrutement","FW-HSE","FW-Habilitations","FW-Visiteurs","FW-Parking","FW-Tenues","FW-CarteRepas","FW-Transport","FW-Cantine","FW-Equipements","FW-Documents"].indexOf(id) >= 0 ? ["FW-RH"] : [])}))
];
const ID_OK = /^FW-[A-Za-z][A-Za-z0-9]{1,30}$/;
/* v55.1 : un manifeste ne peut jamais revendiquer une route ou une rubrique du socle (sinon il pourrait bloquer
   la connexion, l'administration ou les licences) */
const ROUTES_SOCLE = ["/api/sante","/api/installation","/api/v1/connexion","/api/v1/deconnexion","/api/v1/session","/api/v1/a2f","/api/v1/mot-de-passe",
  "/api/v1/comptes","/api/v1/modules","/api/v1/licence","/api/v1/systeme","/api/v1/donnees","/api/v1/cle","/api/v1/metriques","/api/v1/sessions","/api/v1/alertes","/api/v1/mise-a-jour"];
const DONNEES_SOCLE = ["users","profils","secu","sites","depts","champs","params","__versions","emps","etablissements","anoDec","regles"];
function routeAdmise(r){ return typeof r === "string" && /^\/api\/v1\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(r) && !ROUTES_SOCLE.some(s=>r === s || r.startsWith(s+"/") || s.startsWith(r)); }
function donneeAdmise(k){ return typeof k === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k) && DONNEES_SOCLE.indexOf(k) < 0; }
function lireManifeste(brut, implemente, fichier){
  if (!brut || !ID_OK.test(brut.id||"")) return null;
  const refus = [];
  const routes = (Array.isArray(brut.routes) ? brut.routes : []).filter(r=>{ const ok = routeAdmise(r); if (!ok) refus.push("route "+r); return ok; });
  const donnees = (Array.isArray(brut.donnees) ? brut.donnees : []).filter(k=>{ const ok = donneeAdmise(k); if (!ok) refus.push("rubrique "+k); return ok; });
  const colls = (Array.isArray(brut.colls) ? brut.colls : []).filter(k=>{ const ok = donneeAdmise(k); if (!ok) refus.push("collection "+k); return ok; });
  return {id:brut.id, nom:String(brut.nom||brut.id).slice(0, 80), categorie:["metier","futur","socle"].indexOf(brut.categorie) >= 0 ? brut.categorie : "futur",
    version:implemente ? String(brut.version||"1.0") : null, implemente:!!implemente, deps:(Array.isArray(brut.deps) ? brut.deps : ["FW-Core"]).filter(d=>ID_OK.test(d)),
    vues:(Array.isArray(brut.vues) ? brut.vues : []).filter(v=>/^[a-z0-9]{1,20}$/.test(v)), routes, donnees, colls, manifeste:fichier, refus,
    /* v56.2 : ressources chargées à la demande (JS, CSS) avec empreinte d'intégrité, menu, droit, partie serveur */
    assets:implemente ? Object.fromEntries(Object.entries(brut.assets||{}).filter(([k, v])=>/^(js|css)$/.test(k) && new RegExp("^modules/"+brut.id+"/[a-z0-9.-]+\\.(js|css)$").test(String(v)))) : {},
    integrite:implemente && brut.integrite && typeof brut.integrite === "object" ? brut.integrite : {},
    menu:brut.menu && typeof brut.menu === "object" ? {groupe:String(brut.menu.groupe||"rh").slice(0, 20), vue:String(brut.menu.vue||"").slice(0, 20), libelle:brut.menu.libelle || {}} : null,
    niveauMenu:["simple","avance","rh","admin"].indexOf(brut.niveauMenu) >= 0 ? brut.niveauMenu : null,
    droit:/^[A-Z]{3}$/.test(brut.droit||"") ? brut.droit : null, serveur:implemente && /^[A-Za-z0-9.-]+\.serveur\.js$/.test(brut.serveur||"") ? brut.serveur : null,
    etend:!!(implemente && brut.etend === true)};
}

function creer(o){
  const {meta, audit, dossierManifestes} = o;
  let etatCache = null;                       /* {id:{actif, depuis, par, motif}} — lu une fois, tenu en mémoire */
  let actifs = new Set();                     /* modules effectivement actifs (entitlement + activation + dépendances) */
  let droits = new Set();                     /* modules accordés par la licence */
  let catalogue = CATALOGUE.slice();
  /* manifestes supplémentaires déposés (catalogue seulement : ajouter un module au catalogue sans toucher au socle) */
  /* manifestes : ceux livrés avec la version (serveur/modules/, signés dans le paquet) décrivent des modules
     implémentés et remplacent l'entrée réservée du même identifiant ; ceux déposés dans donnees/modules/ ne font
     qu'ajouter un module au catalogue (jamais « implémenté » : le code doit venir d'une mise à jour signée) */
  function chargerManifestes(){
    catalogue = CATALOGUE.slice();
    const lire = (dossier, implemente) => { try { if (dossier && fs.existsSync(dossier)) fs.readdirSync(dossier).filter(f=>/\.json$/.test(f)).sort().forEach(f=>{
      try { const m = lireManifeste(JSON.parse(fs.readFileSync(path.join(dossier, f), "utf8")), implemente, f); if (!m) return;
        const i = catalogue.findIndex(x=>x.id === m.id);
        if (i >= 0){
          if (implemente && !catalogue[i].implemente){ catalogue[i] = m; return; }
          /* v56.20 : un manifeste livré « etend » complète un module du socle (nouvel écran chargé à la demande, routes,
             partie serveur) sans rien retirer à ses écrans existants */
          if (implemente && m.etend && catalogue[i].implemente){ const c = catalogue[i];
            catalogue[i] = Object.assign({}, c, {vues:Array.from(new Set((c.vues||[]).concat(m.vues))), routes:Array.from(new Set((c.routes||[]).concat(m.routes))),
              donnees:Array.from(new Set((c.donnees||[]).concat(m.donnees))), assets:m.assets, integrite:m.integrite, menu:m.menu || c.menu, niveauMenu:m.niveauMenu || c.niveauMenu,
              droit:m.droit || c.droit, serveur:m.serveur, manifeste:m.manifeste, etend:true}); }
          return; }
        catalogue.push(m); } catch(e){} }); } catch(e){} };
    lire(o.dossierModulesLivres || path.join(__dirname, "modules"), true);
    lire(dossierManifestes, false);
    indexer();
  }
  /* index des routes et des rubriques, reconstruits à chaque chargement (modules livrés ou ajoutés ensuite) */
  let ROUTES = [], PAR_DONNEE = {};
  function indexer(){
    ROUTES = catalogue.flatMap(x=>(x.routes||[]).map(r=>[r, x.id])).sort((a, b)=>b[0].length - a[0].length);
    PAR_DONNEE = {};
    catalogue.forEach(m=>{ (m.donnees||[]).forEach(k=>{ if (!PAR_DONNEE["ref:"+k]) PAR_DONNEE["ref:"+k] = m.id; }); (m.colls||[]).forEach(c=>{ if (!PAR_DONNEE["coll:"+c]) PAR_DONNEE["coll:"+c] = m.id; }); });
  }
  /* droits de la licence (signée, vérifiée par le serveur) : liste FW- explicite, ou anciennes lettres P / A */
  function droitsDeLicence(lic){
    const s = new Set(["FW-Core","FW-Licence","FW-RH"]);
    if (!lic) return s;
    /* licence v2 : la liste FW- fait foi (les lettres qu'elle porte ne servent qu'aux versions antérieures) */
    if (Array.isArray(lic.fw)){ lic.fw.filter(x=>ID_OK.test(x)).forEach(x=>s.add(x)); return s; }
    const m = String(lic.modules||"");
    if (m.indexOf("P") >= 0){ s.add("FW-Time"); s.add("FW-BI"); }       /* licences antérieures : rien ne disparaît */
    if (m.indexOf("A") >= 0){ s.add("FW-Acces"); s.add("FW-BI"); }
    return s;
  }
  /* v55.1 : résolution des dépendances jusqu'à stabilité (aucune limite de profondeur) ; un cycle de dépendances
     est détecté et ses modules restent inactifs, avec un motif explicite */
  let CYCLES = new Set();
  function recalculer(){
    const act = new Set(), voulu = m => { const e = etatCache[m.id]; return m.socle ? true : (e ? e.actif !== false : true); };
    let change = true;
    while (change){
      change = false;
      for (const m of catalogue){
        if (act.has(m.id) || !m.implemente || !droits.has(m.id) || !voulu(m)) continue;
        if ((m.deps||[]).every(d=>act.has(d))){ act.add(m.id); change = true; }
      }
    }
    /* détection des cycles (parcours en profondeur sur le graphe des dépendances) */
    CYCLES = new Set(); const etat = {}, parId2 = new Map(catalogue.map(m=>[m.id, m]));
    const visiter = (id, pile) => { if (etat[id] === 2) return; if (etat[id] === 1){ pile.slice(pile.indexOf(id)).forEach(x=>CYCLES.add(x)); return; }
      etat[id] = 1; pile.push(id); ((parId2.get(id)||{}).deps||[]).forEach(d=>visiter(d, pile)); pile.pop(); etat[id] = 2; };
    catalogue.forEach(m=>visiter(m.id, []));
    actifs = act;
  }
  async function charger(lic){
    chargerManifestes();
    etatCache = (await meta("modules_etat")) || {};
    droits = droitsDeLicence(lic);
    /* v56.31 (cahier § 3.2, L06) : un module accordé par une NOUVELLE licence apparaît « Disponible — Activer » ; il n'est
       pas activé d'office. Les modules déjà accordés gardent leur état (aucun changement pour les installations en place). */
    const connus = await meta("modules_licencies");
    /* première licence (installation) : tout ce qu'elle accorde est actif, comme avant */
    if (lic && Array.isArray(connus) && connus.length){ let maj = false;
      droits.forEach(id=>{ const m = catalogue.find(x=>x.id === id); if (connus.indexOf(id) < 0 && m && m.implemente && !m.socle && !etatCache[id]){ etatCache[id] = {actif:false, depuis:new Date().toISOString(), par:"licence", motif:"accordé par la licence : à activer"}; maj = true; } });
      if (maj) await meta("modules_etat", etatCache); }
    const liste = Array.from(droits).sort(); if (lic && liste.length && JSON.stringify(liste) !== JSON.stringify(connus)) await meta("modules_licencies", liste);
    recalculer();
  }
  const estActif = id => actifs.has(id);
  const parId = id => catalogue.find(m=>m.id === id);
  function etatDe(m){
    const e = etatCache[m.id] || {}, lic = droits.has(m.id);
    if (!m.implemente) return lic ? "MISE_A_JOUR_REQUISE" : "DISPONIBLE";
    if (!lic) return "NON_LICENCIE";
    if (actifs.has(m.id)) return "ACTIF";
    /* voulu actif mais une dépendance manque : « dépendance manquante » ; désactivé volontairement : « inactif » */
    if (CYCLES.has(m.id)) return "DEPENDANCE_CIRCULAIRE";
    if (e.actif !== false && (m.deps||[]).some(d=>!actifs.has(d))) return "DEPENDANCE_MANQUANTE";
    return "INACTIF";
  }
  function liste(){
    return catalogue.map(m=>({id:m.id, nom:m.nom, categorie:m.categorie, version:m.version, implemente:m.implemente, socle:!!m.socle, deps:m.deps||[],
      dependants:catalogue.filter(x=>(x.deps||[]).indexOf(m.id) >= 0).map(x=>x.id), licencie:droits.has(m.id), actif:actifs.has(m.id), etat:etatDe(m),
      vues:m.vues||[], lettre:m.lettre||"", depuis:(etatCache[m.id]||{}).depuis || null, par:(etatCache[m.id]||{}).par || null, manifeste:m.manifeste || null,
      routes:m.routes||[], donnees:(m.donnees||[]).concat(m.colls||[]), refus:m.refus && m.refus.length ? m.refus : undefined,
      assets:m.assets || {}, integrite:m.integrite || {}, menu:m.menu || null, droit:m.droit || null, niveauMenu:m.niveauMenu || null}));
  }
  /* activation (annexe B) : droit de licence, version livrée, dépendances et compatibilité vérifiés par le serveur */
  async function activer(id, login, motif){
    const m = parId(id), op = "op-"+crypto.randomBytes(6).toString("hex");
    const refus = async (msg, code) => { await audit(login, "module.activation.refusee", op+" "+id+" : "+msg); throw Object.assign(new Error(msg), {code:code||409, op}); };
    if (!m) return refus("Module inconnu du catalogue.", 404);
    if (!droits.has(id)) return refus("Module "+id+" non accordé par la licence : revalidez la licence avec ce module.", 403);
    if (!m.implemente) return refus("Module "+id+" non livré dans la version installée : mise à jour requise.");
    if (CYCLES.has(id)) return refus("Dépendances circulaires pour "+id+" : le manifeste du module doit être corrigé.");
    const manq = (m.deps||[]).filter(d=>!actifs.has(d));
    if (manq.length) return refus("Dépendance(s) manquante(s) pour "+id+" : "+manq.join(", ")+" — activez-la(les) d'abord.");
    etatCache[id] = {actif:true, depuis:new Date().toISOString(), par:login, motif:motif||"", version:m.version};
    await meta("modules_etat", etatCache); recalculer();
    await audit(login, "module.active", op+" "+id+" v"+m.version+" (licence : accordé)"+(motif ? " — "+motif : ""));
    return {ok:true, op, module:id, etat:etatDe(m)};
  }
  /* désactivation : fonctions masquées et refusées, données, historiques et paramètres conservés */
  async function desactiver(id, login, motif){
    const m = parId(id), op = "op-"+crypto.randomBytes(6).toString("hex");
    const refus = async (msg, code) => { await audit(login, "module.desactivation.refusee", op+" "+id+" : "+msg); throw Object.assign(new Error(msg), {code:code||409, op}); };
    if (!m) return refus("Module inconnu du catalogue.", 404);
    if (m.socle) return refus(id+" fait partie du socle : il ne peut pas être désactivé.");
    const dep = catalogue.filter(x=>(x.deps||[]).indexOf(id) >= 0 && actifs.has(x.id)).map(x=>x.id);
    if (dep.length) return refus("Module(s) actif(s) dépendant de "+id+" : "+dep.join(", ")+" — désactivez-le(les) d'abord.");
    etatCache[id] = Object.assign({}, etatCache[id]||{}, {actif:false, depuis:new Date().toISOString(), par:login, motif:motif||""});
    await meta("modules_etat", etatCache); recalculer();
    await audit(login, "module.desactive", op+" "+id+" (données conservées)"+(motif ? " — "+motif : ""));
    return {ok:true, op, module:id, etat:etatDe(m)};
  }
  /* contrôle serveur : route ou rubrique de données appartenant à un module inactif */
  /* préfixes indexés, du plus long au plus court : un contrôle coûte quelques dixièmes de microseconde */
  function moduleDeRoute(p){
    if (p.charCodeAt(1) !== 97 /* « /a »pi */) return null;
    for (const [r, id] of ROUTES){ if (p.startsWith(r) && (p.length === r.length || p[r.length] === "/" || p[r.length] === "?")) return id; }
    return null;
  }
  indexer();
  const moduleDeDonnee = (type, k) => PAR_DONNEE[type+":"+k] || null;
  /* lettres héritées pour l'application (P = pointage, A = accès) */
  const lettres = () => (actifs.has("FW-Time") ? "P" : "")+(actifs.has("FW-Acces") ? "A" : "");
  /* ressource déclarée par un module (servie seulement si le module est actif) */
  function ressource(id, fichier){ const x = catalogue.find(c=>c.id === id); if (!x || !x.implemente) return null;
    const chemin = "modules/"+id+"/"+fichier; return Object.values(x.assets||{}).indexOf(chemin) >= 0 ? chemin : null; }
  const serveurs = () => catalogue.filter(c=>c.implemente && c.serveur).map(c=>({id:c.id, serveur:c.serveur, routes:c.routes||[]}));
  return {ressource, serveurs, charger, liste, activer, desactiver, estActif, moduleDeRoute, moduleDeDonnee, lettres, droitsDeLicence, catalogue:()=>catalogue};
}
module.exports = {creer, CATALOGUE, ID_OK, routeAdmise, donneeAdmise};
