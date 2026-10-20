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
  /* correctif 35 : recrutement — tableau propre à chaque poste (un nouveau poste montrait les candidats d'un autre),
     candidature créée avec le candidat, recherche, fiche, rectification, effacement, réglages, embauche */
  const SUIV = {recue:["preselection","refuse"], preselection:["entretien","refuse"], entretien:["decision","refuse"], decision:["retenu","refuse"], retenu:["refuse"], refuse:["recue"]};
  const qp = c => { try { return new URLSearchParams(c.split("?")[1] || ""); } catch(e){ return new URLSearchParams(""); } };
  const postes = () => { const l = []; chemins().filter(k => sansQ(k) === "/api/v1/recrutement/postes").forEach(k => (REP[k].lignes || []).forEach(x => { if (!l.some(y => y.id === x.id)) l.push(x); })); return l; };
  const candidats = () => { const l = []; chemins().filter(k => sansQ(k) === "/api/v1/recrutement/candidats").forEach(k => (REP[k].lignes || []).forEach(x => { if (!l.some(y => y.id === x.id)) l.push(x); })); return l; };
  function pipe(pid){
    let k = chemins().find(x => sansQ(x) === "/api/v1/recrutement/candidatures" && qp(x).get("poste") === pid);
    if (!k){ k = "/api/v1/recrutement/candidatures?poste="+pid; REP[k] = {etapes:["recue","preselection","entretien","decision","retenu","refuse"], suivantes:SUIV, comptes:{}, lignes:[]}; }
    const v = REP[k]; v.suivantes = SUIV; const po = postes().find(x => x.id === pid); if (po) v.poste = {id:po.id, intitule:po.intitule, fonction:po.fonction, statut:po.statut, nb:po.nb || 1, site_id:po.site_id || null, dept_id:po.dept_id || null, description:po.description || ""};
    return v;
  }
  function ajouterCandidature(pid, c){
    const v = pipe(pid), ligne = {id:nouvelId("ra"), etape:"recue", note:null, maj:maint(), candidat_id:c.id, nom:c.nom, prenom:c.prenom || "", email:c.email || "", tel:c.tel || "", salarie:null, cv:0};
    v.lignes.unshift(ligne); v.comptes.recue = (v.comptes.recue || 0) + 1;
    modifier(pid, {candidatures:(((postes().find(x => x.id === pid)) || {}).candidatures || 0) + 1});
  }
  function recrut(methode, c, b){
    const p = sansQ(c); if (p.indexOf("/api/v1/recrutement/") !== 0) return undefined; b = b || {};
    let m;
    if (methode === "GET"){
      if (p === "/api/v1/recrutement/candidatures"){ const v = copie(pipe(qp(c).get("poste") || "")), et = qp(c).get("etape"), off = +qp(c).get("offset") || 0; v.comptes = {}; v.lignes.forEach(x => { v.comptes[x.etape] = (v.comptes[x.etape] || 0) + 1; });
        if (et) v.lignes = v.lignes.filter(x => x.etape === et); if (off) v.lignes = v.lignes.slice(off); return v; }
      if (p === "/api/v1/recrutement/candidats"){ const q = String(qp(c).get("q") || "").toLowerCase(), l = candidats().filter(x => !q || ((x.nom||"")+" "+(x.prenom||"")+" "+(x.email||"")).toLowerCase().indexOf(q) >= 0); return {total:l.length, lignes:copie(l.slice(+qp(c).get("offset") || 0, (+qp(c).get("offset") || 0) + 50))}; }
      if ((m = /^\/api\/v1\/recrutement\/candidats\/([^/]+)$/.exec(p))){ const x = candidats().find(z => z.id === m[1]); if (!x) return undefined;
        const l = []; chemins().filter(k => sansQ(k) === "/api/v1/recrutement/candidatures").forEach(k => { const v = REP[k], po = postes().find(z => z.id === qp(k).get("poste")) || {}; (v.lignes || []).filter(z => z.candidat_id === x.id).forEach(z => l.push({id:z.id, etape:z.etape, maj:z.maj, poste_id:po.id, intitule:po.intitule || "", poste_statut:po.statut || "ouvert"})); });
        return {candidat:copie(x), candidatures:l, autres:0}; }
      return undefined;
    }
    if (p === "/api/v1/recrutement/parametres") return {ok:true, demo:true, conservationMois:+b.conservationMois || 24, effaces:0};
    if (p === "/api/v1/recrutement/candidats"){ const r = {ok:true, demo:true, id:creer(p, b).id}; const x = candidats().find(z => z.id === r.id); if (x && b.posteId) ajouterCandidature(String(b.posteId), x); return r; }
    if (p === "/api/v1/recrutement/candidatures"){ const x = candidats().find(z => z.id === b.candidatId); if (x && b.posteId) ajouterCandidature(String(b.posteId), x); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/recrutement\/candidats\/([^/]+)\/effacer$/.exec(p))){ const z = {nom:"—", prenom:"", email:"", tel:"", source:""}; modifier(m[1], z); chemins().filter(k => sansQ(k) === "/api/v1/recrutement/candidatures").forEach(k => (REP[k].lignes || []).filter(y => y.candidat_id === m[1]).forEach(y => Object.assign(y, z))); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/recrutement\/candidats\/([^/]+)$/.exec(p))){ const z = {}; ["nom","prenom","email","tel","source"].forEach(k => { if (b[k] !== undefined) z[k] = b[k]; }); modifier(m[1], z); chemins().filter(k => sansQ(k) === "/api/v1/recrutement/candidatures").forEach(k => (REP[k].lignes || []).filter(y => y.candidat_id === m[1]).forEach(y => Object.assign(y, z))); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/recrutement\/postes\/([^/]+)$/.exec(p))){ modifier(m[1], {intitule:b.intitule, fonction:b.fonction, nb:b.nb, description:b.description, site_id:b.siteId || null, dept_id:b.deptId || null}); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/recrutement\/candidatures\/([^/]+)\/embauche$/.exec(p))){ modifier(m[1], {salarie:b.mat}); return {ok:true, demo:true, mat:b.mat}; }
    return undefined;
  }
  /* correctif 36 : intégration — parcours créé avec ses tâches et sa progression, statuts « termine » / « annule »,
     réouverture, coche et commentaire, modification d'un modèle ; tâches cochables (« peut ») */
  const ajoutJ = (k, n) => { const p = String(k).split("-").map(Number); return new Date(Date.UTC(p[0], p[1]-1, p[2] + n)).toISOString().slice(0, 10); };
  const aujL = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
  const ONB_L = "/api/v1/onboarding/parcours";
  const onbDetail = id => REP[ONB_L+"/"+id];
  function onbProgression(id){
    const d = onbDetail(id); if (!d) return; const j = aujL(), t = d.taches || [];
    const g = {total:t.length, faites:t.filter(x => x.faite_le).length, retard:t.filter(x => !x.faite_le && x.echeance < j).length, prochaine:(t.filter(x => !x.faite_le).map(x => x.echeance).sort()[0]) || null};
    modifier(id, {progression:g});
  }
  function integ(methode, c, b){
    const p = sansQ(c); if (p.indexOf("/api/v1/onboarding/") !== 0) return undefined; b = b || {};
    let m;
    if (methode === "GET"){
      if ((m = /^\/api\/v1\/onboarding\/parcours\/([^/]+)$/.exec(p))){ const d = onbDetail(m[1]); if (!d) return undefined; const v = copie(d);
        v.parcours.nom = v.parcours.nom || nomDe(v.parcours.mat); v.taches.forEach(t => { t.peut = v.parcours.statut === "en_cours"; }); return v; }
      return undefined;
    }
    if (p === ONB_L){
      const mods = ((REP["/api/v1/onboarding/modeles"] || {}).modeles || []), mo = mods.find(z => z.id === b.modeleId) || mods[0];
      const r = {ok:true, demo:true, id:creer(p, b).id}, debut = b.debut || aujL();
      const taches = ((mo || {}).taches || []).map((t, i) => ({id:nouvelId("ot"), parcours_id:r.id, ordre:i, titre:t.titre, responsable:t.responsable, echeance:ajoutJ(debut, +t.jour || 0), faite_le:null, faite_par:null, commentaire:null}));
      modifier(r.id, {debut, fin_essai:b.finEssai || ajoutJ(debut, 90), modele_id:mo ? mo.id : null, nom:nomDe(b.mat)});
      REP[ONB_L+"/"+r.id] = {parcours:{id:r.id, mat:b.mat, modele_id:mo ? mo.id : null, modele:mo ? mo.nom : "", debut, fin_essai:b.finEssai || ajoutJ(debut, 90), statut:"en_cours", cree:maint(), par:"admin"}, taches};
      onbProgression(r.id); return r;
    }
    if ((m = /^\/api\/v1\/onboarding\/parcours\/([^/]+)\/(terminer|annuler|rouvrir)$/.exec(p))){ modifier(m[1], {statut:{terminer:"termine", annuler:"annule", rouvrir:"en_cours"}[m[2]]}); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/onboarding\/taches\/([^/]+)$/.exec(p))){
      const z = {}; if (b.faite !== undefined) Object.assign(z, b.faite ? {faite_le:maint(), faite_par:"admin"} : {faite_le:null, faite_par:null}); if (b.commentaire !== undefined) z.commentaire = b.commentaire;
      modifier(m[1], z); const d = Object.keys(REP).filter(k => k.indexOf(ONB_L+"/") === 0).map(k => REP[k]).find(v => (v.taches || []).some(t => t.id === m[1])); if (d) onbProgression(d.parcours.id); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/onboarding\/modeles\/([^/]+)$/.exec(p))){ modifier(m[1], {nom:b.nom, fonction:b.fonction, taches:b.taches}); return {ok:true, demo:true}; }
    return undefined;
  }
  /* correctif 37 : formation — catalogue (ajout, modification, retrait), sessions avec détail propre, inscriptions,
     présence (une à une et en lot), désinscription, clôture, annulation, besoins (ajout, annulation), habilitations */
  const FR = "/api/v1/formation";
  const sessionsFr = () => { const l = []; chemins().filter(k => sansQ(k) === FR+"/sessions").forEach(k => (REP[k].sessions || []).forEach(x => { if (!l.some(y => y.id === x.id)) l.push(x); })); return l; };
  const catFr = () => (REP[FR+"/catalogue"] || {catalogue:[]}).catalogue;
  function compterInscrits(sid){ const d = REP[FR+"/sessions/"+sid]; if (d) modifier(sid, {inscrits:d.inscriptions.length}); }
  function formation(methode, c, b){
    const p = sansQ(c); if (p.indexOf(FR+"/") !== 0) return undefined; b = b || {};
    let m;
    if (methode === "GET"){
      if (p === FR+"/sessions"){ const st = qp(c).get("statut") || "", off = +qp(c).get("offset") || 0, l = sessionsFr().filter(x => !st || x.statut === st); return {sessions:copie(l.slice(off, off + 50)), total:l.length}; }
      if ((m = /^\/api\/v1\/formation\/sessions\/([^/]+)$/.exec(p))){ const d = REP[FR+"/sessions/"+m[1]]; if (!d) return undefined; const v = copie(d); v.session.inscrits = v.inscriptions.length; v.inscriptions.forEach(i => { i.nom = i.nom || nomDe(i.mat); }); return v; }
      if (p === FR+"/historique") return {mat:qp(c).get("mat"), sessions:[], habilitations:[], besoins:[]};
      return undefined;
    }
    if (p === FR+"/catalogue"){ const it = {id:nouvelId("fc"), code:b.code, titre:b.titre, type:b.type || "formation", duree_h:b.dureeH || 0, validite_mois:b.validiteMois || null, competence_id:b.competenceId || null, niveau_vise:b.competenceId ? b.niveauVise || 1 : null, organisme:b.organisme || "", actif:1, cree:maint()}; catFr().push(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/formation\/catalogue\/([^/]+)\/retirer$/.exec(p))){ const C = REP[FR+"/catalogue"]; if (C) C.catalogue = C.catalogue.filter(x => x.id !== m[1]); return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/formation\/catalogue\/([^/]+)$/.exec(p))){ modifier(m[1], {code:b.code, titre:b.titre, type:b.type, duree_h:b.dureeH, validite_mois:b.validiteMois || null, competence_id:b.competenceId || null, niveau_vise:b.competenceId ? b.niveauVise : null, organisme:b.organisme}); return {ok:true, demo:true}; }
    if (p === FR+"/besoins"){ const ca = catFr().find(x => x.id === b.catalogueId) || {}; const it = {id:nouvelId("fb"), mat:b.mat, catalogue_id:b.catalogueId, origine:"manuel", statut:"ouvert", cree:maint(), titre:ca.titre || "", code:ca.code || "", type:ca.type || "formation", nom:nomDe(b.mat)};
      chemins().filter(k => sansQ(k) === FR+"/besoins" && (qp(k).get("statut") || "ouvert") === "ouvert").forEach(k => { REP[k].lignes.unshift(copie(it)); REP[k].total++; }); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/formation\/besoins\/([^/]+)\/annuler$/.exec(p))){ modifier(m[1], {statut:"annule"}); return {ok:true, demo:true}; }
    if (p === FR+"/besoins/generer") return b.apercu ? {ok:true, demo:true, apercu:0} : {ok:true, demo:true, crees:0};
    if (p === FR+"/sessions"){ const ca = catFr().find(x => x.id === b.catalogueId) || {}, sid = nouvelId("fs");
      const se = {id:sid, catalogue_id:b.catalogueId, debut:b.debut, fin:b.fin, lieu:b.lieu || "", formateur:b.formateur || "", places:b.places || 12, statut:"planifiee", cree:maint(), par:"admin", titre:ca.titre || "", code:ca.code || "", type:ca.type || "formation", inscrits:0, site_id:b.siteId || null};
      chemins().filter(k => sansQ(k) === FR+"/sessions").forEach(k => { REP[k].sessions.unshift(copie(se)); if (typeof REP[k].total === "number") REP[k].total++; });
      REP[FR+"/sessions/"+sid] = {session:copie(se), inscriptions:[], horsPerimetre:0}; return {ok:true, demo:true, id:sid, inscrits:0}; }
    if ((m = /^\/api\/v1\/formation\/sessions\/([^/]+)(?:\/([a-z-]+))?$/.exec(p))){
      const d = REP[FR+"/sessions/"+m[1]]; if (!d) return {ok:true, demo:true};
      if (!m[2]){ modifier(m[1], {debut:b.debut, fin:b.fin, lieu:b.lieu, formateur:b.formateur, places:b.places, site_id:b.siteId || null}); return {ok:true, demo:true}; }
      if (m[2] === "inscrire"){ d.inscriptions.push({id:nouvelId("fi"), session_id:m[1], mat:b.mat, besoin_id:null, presence:"inscrit", resultat:null, maj:maint(), par:"admin", nom:nomDe(b.mat)}); compterInscrits(m[1]); return {ok:true, demo:true}; }
      if (m[2] === "desinscrire"){ d.inscriptions = d.inscriptions.filter(i => i.id !== b.inscriptionId); compterInscrits(m[1]); return {ok:true, demo:true}; }
      if (m[2] === "presence"){ const z = {}; if (b.presence !== undefined) z.presence = b.presence; if (b.resultat !== undefined) z.resultat = b.resultat || null; if (z.presence && z.presence !== "present") z.resultat = null; modifier(b.inscriptionId, z); return {ok:true, demo:true}; }
      if (m[2] === "presence-lot"){ d.inscriptions.filter(i => i.presence === "inscrit").forEach(i => { i.presence = b.presence; i.resultat = b.presence === "present" ? (b.resultat || null) : null; }); return {ok:true, demo:true}; }
      if (m[2] === "cloturer"){ modifier(m[1], {statut:"realisee"}); return {ok:true, demo:true, niveaux:0, habilitations:0}; }
      if (m[2] === "annuler"){ modifier(m[1], {statut:"annulee"}); return {ok:true, demo:true}; }
    }
    if (p === FR+"/habilitations"){ const ca = catFr().find(x => x.id === b.catalogueId) || {}; chemins().filter(k => sansQ(k) === FR+"/habilitations").forEach(k => { REP[k].lignes.unshift({id:nouvelId("fh"), mat:b.mat, catalogue_id:b.catalogueId, obtenue_le:b.obtenueLe, expire_le:null, titre:ca.titre || "", code:ca.code || "", nom:nomDe(b.mat), actif:1, etat:"valide"}); REP[k].total++; }); return {ok:true, demo:true}; }
    return undefined;
  }
  /* correctif 38 : évaluations — liste filtrée, fiche propre à chaque évaluation (plus celle d'un autre salarié), saisie
     et terminaison, validation (compteur), réouverture « en cours », réassignation, lancement, clôture et suppression */
  const EV = "/api/v1/evaluation";
  const evLignes = () => { const l = []; chemins().filter(k => sansQ(k) === EV+"/evaluations").forEach(k => (REP[k].lignes || []).forEach(x => { if (!l.some(y => y.id === x.id)) l.push(x); })); return l; };
  const evCamps = () => (REP[EV+"/campagnes"] || {campagnes:[]}).campagnes;
  const evModele = () => { const k = chemins().find(x => x.indexOf(EV+"/evaluations/") === 0); return k ? REP[k] : null; };
  if (!REP[EV+"/evaluations?demo=toutes"]) REP[EV+"/evaluations?demo=toutes"] = {total:0, lignes:[]};
  function evFiche(id){
    let d = REP[EV+"/evaluations/"+id]; if (d) return d;
    const r = evLignes().find(x => x.id === id), M = evModele(); if (!r) return null;
    const c = evCamps().find(x => x.nom === r.campagne) || {};
    d = REP[EV+"/evaluations/"+id] = {evaluation:{id, campagne_id:c.id, mat:r.mat, evaluateur:r.evaluateur || null, statut:r.statut, note:r.note == null ? null : r.note, objectifs:((M && M.evaluation.objectifs) || []).map(z => ({libelle:z.libelle, atteinte:null})), competences:[], commentaire:"", maj:maint(), cstatut:c.statut || "ouverte", campagne:r.campagne},
      salarie:{mat:r.mat, nom:r.nom || nomDe(r.mat), fonction:r.fonction || ""}, exigences:copie((M && M.exigences) || [])};
    return d;
  }
  function evaluation(methode, c, b){
    const p = sansQ(c); if (p.indexOf(EV+"/") !== 0) return undefined; b = b || {};
    let m;
    if (methode === "GET"){
      if (p === EV+"/evaluations"){ const q = qp(c), ca = q.get("campagne") || "", st = q.get("statut") || "", mes = q.get("mes") === "1", off = +q.get("offset") || 0;
        const cn = (evCamps().find(x => x.id === ca) || {}).nom, l = evLignes().filter(x => (!ca || x.campagne === cn) && (!st || x.statut === st) && (!mes || x.evaluateur === "admin"));
        return {total:l.length, lignes:copie(l.slice(off, off + 50))}; }
      if ((m = /^\/api\/v1\/evaluation\/evaluations\/([^/]+)$/.exec(p))){ const d = evFiche(m[1]); if (!d) return undefined; const v = copie(d), e = v.evaluation, ouv = e.cstatut === "ouverte";
        v.droits = {saisir:ouv && e.statut !== "validee", validerCelle:ouv && e.statut === "terminee", reassigner:ouv && e.statut !== "validee", valider:true}; return v; }
      return undefined;
    }
    if ((m = /^\/api\/v1\/evaluation\/evaluations\/([^/]+)(?:\/([a-z]+))?$/.exec(p))){
      const d = evFiche(m[1]); if (!d) return {ok:true, demo:true}; const e = d.evaluation;
      if (!m[2]){ if (b.note !== undefined) e.note = b.note === "" || b.note == null ? null : +b.note; if (Array.isArray(b.objectifs)) e.objectifs.forEach((z, k) => { const v = b.objectifs[k]; if (v !== undefined && v !== "") z.atteinte = +v; });
        if (Array.isArray(b.competences)) e.competences = b.competences; if (b.commentaire !== undefined) e.commentaire = b.commentaire; e.statut = b.terminer === true ? "terminee" : "en_cours"; if (!e.evaluateur) e.evaluateur = "admin";
        modifier(m[1], {statut:e.statut, note:e.note, evaluateur:e.evaluateur}); return {ok:true, demo:true, statut:e.statut}; }
      if (m[2] === "valider"){ modifier(m[1], {statut:"validee"}); const ca = evCamps().find(x => x.id === e.campagne_id); if (ca) ca.validees = (+ca.validees || 0) + 1; return {ok:true, demo:true, reportes:0, conflits:0}; }
      if (m[2] === "rouvrir"){ modifier(m[1], {statut:"en_cours"}); return {ok:true, demo:true}; }
      if (m[2] === "evaluateur"){ modifier(m[1], {evaluateur:b.login}); return {ok:true, demo:true}; }
    }
    if (p === EV+"/campagnes"){ const cid = nouvelId("ec"), M = evModele(), objectifs = (b.objectifs || []).map(z => ({libelle:String(z), atteinte:null}));
      let emps = []; try { emps = (db.emps || []).filter(e => !e.sortie && (!b.fonction || (e.poste || "") === b.fonction)); } catch(e){}
      evCamps().unshift({id:cid, nom:b.nom, type:b.type || "annuelle", debut:b.debut, fin:b.fin, statut:"ouverte", cree:maint(), par:"admin", total:emps.length, validees:0});
      const L0 = REP[EV+"/evaluations?demo=toutes"]; emps.forEach(e => { const id = nouvelId("ev"); L0.lignes.push({id, mat:e.mat, evaluateur:null, statut:"a_faire", note:null, maj:maint(), campagne:b.nom, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:e.poste || ""});
        REP[EV+"/evaluations/"+id] = {evaluation:{id, campagne_id:cid, mat:e.mat, evaluateur:null, statut:"a_faire", note:null, objectifs:copie(objectifs), competences:[], commentaire:"", maj:maint(), cstatut:"ouverte", campagne:b.nom}, salarie:{mat:e.mat, nom:((e.nom||"")+" "+(e.prenom||"")).trim(), fonction:e.poste || ""}, exigences:copie((M && M.exigences) || [])}; });
      L0.total = L0.lignes.length; return {ok:true, demo:true, id:cid, evaluations:emps.length}; }
    if ((m = /^\/api\/v1\/evaluation\/campagnes\/([^/]+)\/(clore|supprimer)$/.exec(p))){ const ca = evCamps().find(x => x.id === m[1]);
      if (m[2] === "clore"){ if (ca) ca.statut = "close"; evLignes().forEach(x => { if (ca && x.campagne === ca.nom){ const d = REP[EV+"/evaluations/"+x.id]; if (d) d.evaluation.cstatut = "close"; } }); }
      else if (ca){ const C = REP[EV+"/campagnes"]; C.campagnes = C.campagnes.filter(x => x.id !== m[1]); chemins().filter(k => sansQ(k) === EV+"/evaluations").forEach(k => { REP[k].lignes = REP[k].lignes.filter(x => x.campagne !== ca.nom); REP[k].total = REP[k].lignes.length; }); }
      return {ok:true, demo:true}; }
    return undefined;
  }
  /* correctif 39 : compétences — jeu de démonstration avec fonctions et exigences, matrice filtrée et paginée, écarts
     recalculés, niveaux (avec contrôle du niveau affiché), historique, catalogue (ajout, modification, retrait, réactivation) */
  const CP = "/api/v1/competences";
  let CPD = null;
  function cpDonnees(){
    if (CPD) return CPD;
    const C = REP[CP+"/catalogue"] || {competences:[]}, M = REP[CP+"/matrice?offset=0&limit=100&q=&fonction="] || {lignes:[]};
    const code = k => (C.competences.find(c => c.code === k) || {}).id;
    const FCT = ["Opérateur de production", "Technicien qualité", "Réceptionniste"];
    const lignes = copie(M.lignes).map((l, i) => Object.assign(l, {fonction:l.fonction || FCT[i % FCT.length], niveaux:l.niveaux || {}}));
    const exigences = [["Opérateur de production","SOU",3],["Opérateur de production","SST",2],["Technicien qualité","QUA",3],["Technicien qualité","EXC",2],["Réceptionniste","ACC",3]].filter(x => code(x[1])).map(x => ({fonction:x[0], competence_id:code(x[1]), niveau:x[2]}));
    CPD = {competences:copie(C.competences).filter(c => c.actif !== 0), retirees:[], exigences, lignes, hist:[]};
    return CPD;
  }
  const cpRequis = (d, f) => { const r = {}; d.exigences.filter(x => x.fonction === f).forEach(x => { r[x.competence_id] = x.niveau; }); return r; };
  const cpLigne = (d, l) => { const r = cpRequis(d, l.fonction); return Object.assign({}, l, {requis:r, ecarts:Object.keys(r).filter(c => (l.niveaux[c] || 0) < r[c]).length}); };
  function competences(methode, c, b){
    const p = sansQ(c); if (p.indexOf(CP+"/") !== 0) return undefined; b = b || {};
    const d = cpDonnees(), q = qp(c), fonctions = Array.from(new Set(d.lignes.map(l => l.fonction))).sort();
    const droits = {modifier:true, parametrer:true, exporter:false};
    let m;
    if (methode === "GET"){
      if (p === CP+"/catalogue") return {competences:copie(d.competences), retirees:copie(d.retirees), exigences:copie(d.exigences), fonctions, fonctionsParam:fonctions, niveaux:[0,1,2,3,4], droits};
      if (p === CP+"/matrice"){ const s = String(q.get("q") || "").trim().toLowerCase(), f = q.get("fonction") || "", off = +q.get("offset") || 0, lim = +q.get("limit") || 100;
        const l = d.lignes.filter(x => (!f || x.fonction === f) && (s.length < 2 || (x.nom+" "+x.mat).toLowerCase().indexOf(s) >= 0));
        return {total:l.length, offset:off, competences:d.competences.map(z => ({id:z.id, code:z.code, nom:z.nom, domaine:z.domaine})), lignes:l.slice(off, off + lim).map(x => cpLigne(d, x)), droits}; }
      if (p === CP+"/ecarts"){ const agg = {}; d.competences.forEach(k => { agg[k.id] = {id:k.id, code:k.code, nom:k.nom, concernes:0, conformes:0, ecarts:0}; }); let se = 0;
        d.lignes.forEach(l => { const r = cpRequis(d, l.fonction); let e = false; Object.keys(r).forEach(cid => { const a = agg[cid]; if (!a) return; a.concernes++; if ((l.niveaux[cid] || 0) >= r[cid]) a.conformes++; else { a.ecarts++; e = true; } }); if (e) se++; });
        return {salaries:d.lignes.length, salariesEcart:se, competences:Object.values(agg).map(a => Object.assign(a, {taux:a.concernes ? Math.round(100*a.conformes/a.concernes) : null})).sort((x, y) => y.ecarts - x.ecarts)}; }
      if (p === CP+"/historique"){ const mat = q.get("mat"), l = d.hist.filter(h => h.mat === mat).slice().reverse(); return {total:l.length, historique:l}; }
      return undefined;
    }
    if (p === CP+"/niveau"){ const l = d.lignes.find(x => x.mat === b.mat); if (!l) return {ok:true, demo:true};
      const av = l.niveaux[b.competenceId] || 0; if (b.avant !== undefined && +b.avant !== av) return Promise.reject(Object.assign(new Error("Niveau modifié entre-temps (actuellement "+av+") : actualisez."), {statut:409}));
      l.niveaux[b.competenceId] = +b.niveau; const z = d.competences.find(k => k.id === b.competenceId) || {};
      d.hist.push({id:nouvelId("ch"), mat:b.mat, competence_id:b.competenceId, code:z.code, nom:z.nom, avant:av, apres:+b.niveau, par:"admin", motif:b.motif || "", ts:maint()}); return {ok:true, demo:true, avant:av, apres:+b.niveau}; }
    if (p === CP+"/exigence"){ d.exigences = d.exigences.filter(x => !(x.fonction === b.fonction && x.competence_id === b.competenceId)); if (+b.niveau > 0) d.exigences.push({fonction:b.fonction, competence_id:b.competenceId, niveau:+b.niveau}); return {ok:true, demo:true}; }
    if (p === CP+"/catalogue"){ const it = {id:nouvelId("cp"), code:b.code, nom:b.nom, domaine:b.domaine || "", actif:1, cree:maint()}; d.competences.push(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/competences\/catalogue\/([^/]+)(?:\/(retirer|reactiver))?$/.exec(p))){
      if (m[2] === "retirer"){ const k = d.competences.find(z => z.id === m[1]); if (k){ d.competences = d.competences.filter(z => z.id !== m[1]); d.retirees.push(k); } }
      else if (m[2] === "reactiver"){ const k = d.retirees.find(z => z.id === m[1]); if (k){ d.retirees = d.retirees.filter(z => z.id !== m[1]); d.competences.push(k); } }
      else { const k = d.competences.find(z => z.id === m[1]); if (k) Object.assign(k, {code:b.code, nom:b.nom, domaine:b.domaine}); }
      return {ok:true, demo:true}; }
    return undefined;
  }
  return function(chemin, o){
    const c = "/"+String(chemin || "").replace(/^\.?\//, "");
    const methode = o && (o.methode || (o.corps !== undefined ? "POST" : "GET")) || "GET";
    if (methode !== "GET"){
      let r; try { r = recrut(methode, c, o && o.corps); if (r === undefined) r = integ(methode, c, o && o.corps); if (r === undefined) r = formation(methode, c, o && o.corps); if (r === undefined) r = evaluation(methode, c, o && o.corps); if (r === undefined) r = competences(methode, c, o && o.corps); if (r === undefined) r = ecrire(sansQ(c), o && o.corps); } catch(e){ r = {ok:true, demo:true}; }
      return new Promise(ok => setTimeout(() => ok(r), 150));
    }
    let rr = recrut("GET", c); if (rr === undefined) rr = integ("GET", c); if (rr === undefined) rr = formation("GET", c); if (rr === undefined) rr = evaluation("GET", c); if (rr === undefined) rr = competences("GET", c); if (rr !== undefined) return new Promise(ok => setTimeout(() => ok(rr), 120));
    const p = sansQ(c), parent = p.replace(/\/[^/]+$/, "/"), cles = chemins();
    let k = REP[c] !== undefined ? c : cles.find(x => sansQ(x) === p);
    if (!k) k = cles.find(x => { const y = sansQ(x); return y.lastIndexOf("/") === parent.length - 1 && y.indexOf(parent) === 0 && y.length > parent.length; });
    if (!k) return Promise.reject(Object.assign(new Error("Non disponible dans la version de démonstration."), {status:404}));
    return new Promise(ok => setTimeout(() => ok(filtrer(p, c, copie(REP[k]))), 120));
  };
})
