/* FIWAKTI — version de démonstration : rejeu des API des modules FW- (intégré par outils/construire-demo.js).
   Lecture : correspondance exacte, puis même chemin sans paramètres, puis même chemin avec un autre identifiant final.
   Écriture : en mémoire seulement (rien n'est conservé à la fermeture). Une création ajoute la ligne en tête des listes
   du même chemin ; une action sur un élément (faite, clore, étape…) met à jour cet élément partout où il apparaît. */
(function(REP){
  "use strict";
  const copie = v => JSON.parse(JSON.stringify(v));
  const snake = k => k.replace(/[A-Z]/g, m => "_"+m.toLowerCase());
  const auj = () => new Date().toISOString().slice(0, 10), maint = () => new Date().toISOString();
  let seq = 0;
  const nouvelId = p => p+"-demo"+Date.now().toString(36)+(seq++);
  const nomDe = m => { try { const e = (db.emps||[]).find(x => String(x.mat) === String(m)); return e ? ((e.nom||"")+" "+(e.prenom||"")).trim() : ""; } catch(e){ return ""; } };
  const chemins = () => Object.keys(REP);
  const sansQ = k => k.split("?")[0];
  /* tableau principal d'une réponse de liste : « lignes », sinon le seul tableau d'objets */
  const tableau = v => { if (!v || typeof v !== "object") return null; if (Array.isArray(v.lignes)) return "lignes";
    const t = Object.keys(v).filter(k => Array.isArray(v[k]) && (!v[k].length || typeof v[k][0] === "object")); return t.length === 1 ? t[0] : null; };
  /* valeurs ajoutées à la création, par chemin (le reste vient du formulaire, en snake_case) */
  const DEFAUTS = {
    "/api/v1/hse/evenements": b => ({statut:"ouvert", cause:"", victime:nomDe(b.mat), site_id:b.siteId||null, arret:b.type === "accident" && b.arret ? 1 : 0, jours_arret:+b.joursArret||0, gravite:+b.gravite||1, declare_par:"admin"}),
    "/api/v1/hse/actions": () => ({statut:"a_faire"}),
    "/api/v1/hse/risques": b => ({criticite:(+b.gravite||1) * (+b.probabilite||1), maj:maint(), par:"admin"}),
    "/api/v1/hse/epi": b => ({nom:nomDe(b.mat), aRenouveler:false}),
    "/api/v1/medical/visites": b => ({statut:"planifiee", nom:nomDe(b.mat)}),
    "/api/v1/formation/sessions": b => ({statut:"planifiee", catalogue_id:b.catalogueId, inscrits:0}),
    "/api/v1/formation/catalogue": () => ({actif:1}),
    "/api/v1/competences/catalogue": () => ({actif:1, cree:maint()}),
    "/api/v1/evaluation/campagnes": () => ({statut:"ouverte", cree:maint(), par:"admin"}),
    "/api/v1/onboarding/modeles": () => ({actif:1, cree:maint()}),
    "/api/v1/onboarding/parcours": b => ({statut:"en_cours", progression:0, nom:nomDe(b.mat), modele_id:b.modeleId}),
    "/api/v1/recrutement/postes": () => ({statut:"ouvert", candidatures:0, retenus:0, ouvert_le:maint()}),
    "/api/v1/recrutement/candidats": () => ({cree:maint(), par:"admin", cv:0}),
    "/api/v1/visiteurs/entreprises": () => ({actif:1})
  };
  /* actions sur un élément existant : « /chemin/<id>/<verbe> » */
  const ACTIONS = {
    faite: () => ({statut:"faite", faite_le:maint()}),
    analyse: b => Object.assign({statut:"en_analyse"}, b.cause ? {cause:b.cause} : {}, b.joursArret != null && b.joursArret !== "" ? {jours_arret:+b.joursArret} : {}),
    cloturer: () => ({statut:"clos", clos_le:maint()}),
    realiser: b => ({statut:"realisee", realisee_le:b.realiseeLe||auj(), aptitude:b.aptitude||"apte"}),
    annuler: () => ({statut:"annulee"}),
    clore: () => ({statut:"clos"}),
    rouvrir: () => ({statut:"ouvert"}),
    etape: b => (b.vers ? {etape:b.vers, maj:maint()} : {}),
    terminer: () => ({statut:"terminee"}),
    valider: () => ({statut:"validee"}),
    retirer: () => ({actif:0})
  };
  /* met à jour toutes les occurrences d'un élément (listes et fiches) */
  function modifier(id, patch){
    let n = 0;
    (function marcher(o){ if (!o || typeof o !== "object") return;
      if (!Array.isArray(o) && o.id === id){ Object.assign(o, patch); n++; }
      Object.keys(o).forEach(k => marcher(o[k])); })(REP);
    return n;
  }
  function creer(p, b){
    const base = p.split("/").pop().replace(/s$/, "").slice(0, 3);
    const it = {id:nouvelId(base)};
    Object.keys(b || {}).forEach(k => { const v = b[k]; if (v === undefined || (v && typeof v === "object" && !Array.isArray(v))) return; it[snake(k)] = v; });
    Object.assign(it, (DEFAUTS[p] || (() => ({})))(b || {}));
    let n = 0;
    chemins().filter(k => sansQ(k) === p).forEach(k => { const v = REP[k], t = tableau(v); if (!t) return;
      v[t].unshift(copie(it)); if (typeof v.total === "number") v.total++; n++; });
    if (p === "/api/v1/hse/evenements"){
      REP[p+"/"+it.id] = {evenement:copie(it), actions:[]};
      const I = REP["/api/v1/hse/indicateurs"];
      if (I && it.d && it.d >= I.du && it.d <= I.au){
        I[{accident:"accidents", incident:"incidents", presque_accident:"presqueAccidents"}[it.type]]++;
        if (it.type === "accident" && it.arret){ I.avecArret++; I.joursArret += it.jours_arret; }
        const m = it.d.slice(0, 7); let x = I.parMois.find(z => z.mois === m);
        if (!x){ x = {mois:m, accident:0, incident:0, presque_accident:0}; I.parMois.push(x); I.parMois.sort((a, c) => a.mois < c.mois ? -1 : 1); }
        x[it.type]++;
      }
    }
    if (p === "/api/v1/hse/actions"){
      if (it.evenement_id && REP[p.replace("actions", "evenements")+"/"+it.evenement_id]) REP[p.replace("actions", "evenements")+"/"+it.evenement_id].actions.push(copie(it));
      const I = REP["/api/v1/hse/indicateurs"]; if (I) I.actionsOuvertes++;
    }
    return {n, id:it.id};
  }
  /* filtre par statut comme le serveur : un élément clos, fait ou annulé quitte la liste des éléments ouverts */
  function filtrer(p, c, v){
    const t = tableau(v);
    /* recrutement : compteurs par étape recalculés après un changement d'étape */
    if (t && v.comptes && v[t].length && "etape" in v[t][0]){ v.comptes = {}; v[t].forEach(x => { v.comptes[x.etape] = (v.comptes[x.etape] || 0) + 1; }); }
    if (!t || !v[t].length || !("statut" in v[t][0])) return v;
    let st = ""; try { st = new URLSearchParams(c.split("?")[1] || "").get("statut") || ""; } catch(e){}
    let garder = null;
    if (st && st !== "tous") garder = x => x.statut === st;
    else if (/\/hse\/actions$/.test(p)) garder = x => x.statut !== "faite";
    else if (/\/hse\/evenements$/.test(p) && !st) garder = x => x.statut !== "clos";
    if (garder){ const n = v[t].length; v[t] = v[t].filter(garder); if (typeof v.total === "number") v.total -= n - v[t].length; }
    return v;
  }
  function ecrire(p, b){
    if (DEFAUTS[p] || chemins().some(k => sansQ(k) === p)) return Object.assign({ok:true, demo:true}, {id:creer(p, b).id});
    const m = /^(.*)\/([^/]+)\/([a-z-]+)$/.exec(p);
    /* évaluation : campagne supprimée (retirée des listes) */
    if (m && m[3] === "supprimer"){ (function marcher(o){ if (!o || typeof o !== "object") return;
      Object.keys(o).forEach(k => { if (Array.isArray(o[k])) o[k] = o[k].filter(x => !(x && x.id === m[2])); marcher(o[k]); }); })(REP); return {ok:true, demo:true}; }
    if (m && ACTIONS[m[3]]){
      if (m[3] === "faite" && /\/hse\/actions$/.test(m[1])){ const I = REP["/api/v1/hse/indicateurs"]; if (I && I.actionsOuvertes > 0) I.actionsOuvertes--; }
      const patch = ACTIONS[m[3]](b || {});
      if (m[3] === "retirer" && /\/(catalogue|modeles)$/.test(m[1])) chemins().filter(k => sansQ(k) === m[1]).forEach(k => { const v = REP[k], t = tableau(v); if (t) v[t] = v[t].filter(x => x.id !== m[2]); });
      if (m[3] === "clore" && /\/evaluation\//.test(m[1])) patch.statut = "close";
      if (m[3] === "cloturer" && /\/formation\//.test(m[1])) patch.statut = "realisee";
      modifier(m[2], patch);
      return {ok:true, demo:true, vers:b && b.vers};
    }
    /* onboarding : tâche cochée */
    const t = /^\/api\/v1\/onboarding\/taches\/([^/]+)$/.exec(p);
    if (t){ modifier(t[1], b && b.faite ? {faite_le:maint(), faite_par:"admin"} : {faite_le:null, faite_par:null}); return {ok:true, demo:true}; }
    return {ok:true, demo:true, id:nouvelId("demo")};
  }
  return function(chemin, o){
    const c = "/"+String(chemin || "").replace(/^\.?\//, "");
    const methode = o && (o.methode || (o.corps !== undefined ? "POST" : "GET")) || "GET";
    if (methode !== "GET"){
      let r; try { r = ecrire(sansQ(c), o && o.corps); } catch(e){ r = {ok:true, demo:true}; }
      return new Promise(ok => setTimeout(() => ok(r), 150));
    }
    const p = sansQ(c), parent = p.replace(/\/[^/]+$/, "/"), cles = chemins();
    let k = REP[c] !== undefined ? c : cles.find(x => sansQ(x) === p);
    if (!k) k = cles.find(x => { const y = sansQ(x); return y.lastIndexOf("/") === parent.length - 1 && y.indexOf(parent) === 0 && y.length > parent.length; });
    if (!k) return Promise.reject(Object.assign(new Error("Non disponible dans la version de démonstration."), {status:404}));
    return new Promise(ok => setTimeout(() => ok(filtrer(p, c, copie(REP[k]))), 120));
  };
})
