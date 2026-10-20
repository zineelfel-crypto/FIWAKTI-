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
  /* correctif 40 : santé et sécurité — gestionnaires dédiés (mêmes contrôles que le serveur, listes recalculées,
     détail par identifiant, indicateurs sur les 12 derniers mois glissants, jour local) */
  const jPlus = (k, n) => { const d = new Date(k+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const mPlus = (k, n) => { const p = k.split("-").map(Number), t = new Date(Date.UTC(p[0], p[1]-1+n, 1)), der = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth()+1, 0)).getUTCDate(); t.setUTCDate(Math.min(p[2], der)); return t.toISOString().slice(0, 10); };
  const dOk = s => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0, 4) < 1990 || +s.slice(0, 4) > 2100) return false; const d = new Date(s+"T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
  const langue = () => { try { return ui.lang === "en" ? 1 : ui.lang === "ar" ? 2 : 0; } catch(e){ return 0; } };
  const MD = {
    declaration:["Type, date réelle et description obligatoires.","Type, a real date and a description are required.","النوع والتاريخ والوصف إجبارية."],
    gravite:["Gravité : nombre entier de 1 à 4.","Severity: whole number from 1 to 4.","الخطورة: عدد صحيح من 1 إلى 4."],
    jours:["Jours d'arrêt : nombre entier de 0 à 3650.","Days lost: whole number from 0 to 3650.","أيام التوقف: عدد صحيح من 0 إلى 3650."],
    heure:["Heure attendue au format hh:mm.","Time expected as hh:mm.","الساعة بصيغة سس:دد."],
    site:["Site inconnu ou hors périmètre.","Unknown site or outside your scope.","موقع غير معروف أو خارج نطاقك."],
    pasAccident:["Seul un accident se déclare à la CNAM.","Only an accident is declared to the CNAM.","يصرح بالحوادث فقط."],
    cnamExiste:["Accident déjà déclaré à la CNAM : type, salarié et date ne peuvent plus changer.","Accident already declared to the CNAM: type, employee and date can no longer change.","حادث مصرح به: لا يمكن تغيير النوع والأجير والتاريخ."],
    joursArretRequis:["Arrêt de travail sans jour d'arrêt : indiquez le nombre de jours (analyse) avant de clore.","Lost time without days: enter the number of days (analysis) before closing.","توقف بلا أيام: أدخل عدد الأيام قبل الإغلاق."],
    epiEntree:["Date de remise antérieure à l'entrée du salarié.","Issue date before the employee's start date.","تاريخ التسليم سابق للانتداب."],
    doublonEpi:["Cette dotation est déjà enregistrée (même salarié, équipement et date).","This issue is already recorded (same employee, equipment and date).","هذا التسليم مسجل مسبقا."],
    futur:["La date ne peut pas être dans le futur.","The date cannot be in the future.","لا يمكن أن يكون التاريخ في المستقبل."],
    victime:["Un accident désigne le salarié concerné.","An accident names the employee concerned.","الحادث يحدد الأجير المعني."],
    arret:["Un arrêt de travail concerne un accident avec un salarié désigné.","Lost time requires an accident with a named employee.","التوقف يخص حادثا لأجير محدد."],
    salarie:["Salarié introuvable.","Employee not found.","أجير غير موجود."],
    cause:["Renseignez la cause identifiée.","Enter the root cause.","أدخل السبب."],
    causeAvant:["Renseignez la cause (analyse) avant de clore.","Enter the cause (analysis) before closing.","أدخل السبب قبل الإغلاق."],
    actionsOuvertes:["{n} action(s) corrective(s) encore ouverte(s).","{n} corrective action(s) still open.","{n} إجراء تصحيحي ما زال مفتوحا."],
    clos:["Événement clos.","Event closed.","الحدث مغلق."],
    action:["Action et échéance (réelle, à partir d'aujourd'hui) obligatoires.","Action and a real due date (from today) required.","الإجراء والأجل إجباريان."],
    motif:["Motif obligatoire.","Reason required.","التعليل إجباري."],
    risque:["Unité de travail et danger obligatoires.","Work unit and hazard required.","وحدة العمل والخطر إجباريان."],
    epi:["Salarié, équipement et date de remise (réelle, au plus tard aujourd'hui) obligatoires.","Employee, equipment and a real issue date (today at the latest) required.","الأجير والمعدات وتاريخ التسليم إجبارية."],
    renouv:["Date de renouvellement réelle et postérieure à la remise.","Renewal date must be real and after the issue date.","تاريخ التجديد لاحق للتسليم."],
    cnam:["Date de déclaration réelle, entre la date de l'accident et aujourd'hui.","Declaration date must be real, between the accident date and today.","تاريخ التصريح بين تاريخ الحادث واليوم."],
    planif:["Salarié, type et date prévue (réelle) obligatoires.","Employee, type and a real planned date required.","الأجير والنوع وتاريخ البرمجة إجبارية."],
    passee:["Date prévue passée : choisissez aujourd'hui ou une date future.","Planned date in the past: choose today or later.","تاريخ ماض: اختر اليوم أو تاريخا لاحقا."],
    doublon:["Une visite de ce type est déjà planifiée pour ce salarié.","A visit of this type is already scheduled for this employee.","زيارة من هذا النوع مبرمجة مسبقا لهذا الأجير."],
    aptitude:["Aptitude obligatoire (apte, apte avec restriction, inapte).","Fitness required (fit, fit with restrictions, unfit).","الأهلية إجبارية."],
    restrictions:["Précisez les restrictions.","Specify the restrictions.","حدد القيود."],
    dateRealisation:["Date de réalisation réelle obligatoire, au plus tard aujourd'hui.","A real completion date, today at the latest, is required.","تاريخ الإنجاز إجباري ولا يتجاوز اليوم."],
    prochaine:["Prochaine visite : date réelle postérieure à la visite.","Next visit: a real date after the visit.","الزيارة القادمة: تاريخ لاحق للزيارة."],
    report:["Nouvelle date réelle, à partir d'aujourd'hui et différente de l'actuelle.","A real new date, from today and different from the current one.","تاريخ جديد صالح ابتداء من اليوم ومختلف عن الحالي."],
    traitee:["Visite déjà traitée.","Visit already processed.","تمت معالجة الزيارة."],
    sorti:["Salarié sorti : aucune visite à planifier.","Employee has left: no visit to schedule.","غادر الأجير: لا زيارة للبرمجة."],
    avantEntree:["Date antérieure à l'entrée du salarié.","Date before the employee's start date.","تاريخ سابق لانتداب الأجير."],
    trop:["Texte trop long.","Text too long.","نص طويل جدا."],
    tableau:["Tableau : numéro de 1 à 3 chiffres, éventuellement « bis » ou « ter ».","Table: 1 to 3 digits, optionally “bis” or “ter”.","الجدول: رقم من 1 إلى 3 أرقام."],
    mpStatut:["Statut non prévu.","Status not allowed.","حالة غير مقبولة."],
    mpTransition:["Retour d'un statut décidé : motif obligatoire.","Reverting a decided status: reason required.","الرجوع عن حالة مقررة: التعليل إجباري."],
    pasRealisee:["Seule une visite réalisée se rectifie.","Only a completed visit can be corrected.","تصحح الزيارة المنجزة فقط."],
    restrictionsHors:["Les restrictions ne s'inscrivent qu'avec l'aptitude « apte avec restriction ».","Restrictions are only recorded with “fit with restrictions”.","تسجل القيود فقط مع «أهل مع قيود»."],
    declarationMp:["Salarié et date de déclaration (réelle, au plus tard aujourd'hui) obligatoires.","Employee and a real declaration date (today at the latest) required.","الأجير وتاريخ التصريح إجباريان."],
    export:["Export non disponible dans la version de démonstration.","Export not available in the demo version.","التصدير غير متاح في النسخة التجريبية."]
  };
  const refus = (k, st, v) => { let t = (MD[k] || [k])[langue()] || MD[k][0]; Object.keys(v || {}).forEach(z => { t = t.split("{"+z+"}").join(v[z]); }); return Promise.reject(Object.assign(new Error(t), {statut:st || 400, status:st || 400})); };
  const empDe = m => { try { return (db.emps||[]).find(x => String(x.mat) === String(m)) || null; } catch(e){ return null; } };
  const sitesDemo = () => { try { return (db.sites||[]).map(s => ({id:s.id, nom:s.nom || s.id})); } catch(e){ return []; } };
  const pagine = (l, q) => { const off = Math.max(0, Math.floor(+q.get("offset") || 0)), lim = Math.min(200, Math.max(1, Math.floor(+q.get("limit") || 50))); return {total:l.length, offset:off, limit:lim, lignes:copie(l.slice(off, off + lim))}; };
  const HS = "/api/v1/hse";
  let HSD = null;
  function hseDonnees(){
    if (HSD) return HSD;
    const evs = copie((REP[HS+"/evenements?limit=100&statut="] || {lignes:[]}).lignes), acts = [];
    chemins().filter(k => k.indexOf(HS+"/evenements/") === 0).forEach(k => { const d = REP[k]; if (!d || !d.evenement) return; const e = evs.find(x => x.id === d.evenement.id); if (e) Object.assign(e, d.evenement); else evs.push(copie(d.evenement));
      (d.actions || []).forEach(a => { if (!acts.some(x => x.id === a.id)) acts.push(copie(a)); }); });
    ((REP[HS+"/actions?limit=200"] || {}).lignes || []).forEach(a => { if (!acts.some(x => x.id === a.id)) acts.push(copie(a)); });
    const I = REP[HS+"/indicateurs"] || {};
    HSD = {ev:evs, actions:acts, risques:copie((REP[HS+"/risques"] || {lignes:[]}).lignes).map(r => Object.assign(r, {site_id:r.site_id || null, revise_le:r.revise_le || String(r.maj || "").slice(0, 10)})),
      epi:copie((REP[HS+"/epi?limit=200&filtre="] || {lignes:[]}).lignes), decl:{}, journal:[], heures:+I.heures || 0};
    return HSD;
  }
  const HDROITS = {creer:true, modifier:true, modifierFaits:true, valider:true, supprimer:true, imprimer:true, cnam:true, exporter:false, sensibles:true};
  function hseIndicateurs(h){
    const au = aujL(), du = jPlus(au, -364), ev = h.ev.filter(e => e.d >= du && e.d <= au);
    const acc = ev.filter(e => e.type === "accident"), aa = acc.filter(e => +e.arret), j = aa.reduce((s, e) => s + (+e.jours_arret || 0), 0), parMois = [];
    for (let m = du.slice(0, 7); m <= au.slice(0, 7); ){ parMois.push({mois:m, accident:0, accident_trajet:0, incident:0, presque_accident:0}); const y = +m.slice(0, 4), mo = +m.slice(5, 7); m = mo === 12 ? (y+1)+"-01" : y+"-"+String(mo+1).padStart(2, "0"); }
    ev.forEach(e => { const x = parMois.find(z => z.mois === e.d.slice(0, 7)); if (x && x[e.type] != null) x[e.type]++; });
    const ouv = h.actions.filter(a => a.statut !== "faite" && a.statut !== "annulee"), sig = h.heures >= 1000;
    return {du, au, heures:h.heures, heuresIndisponibles:false, nonSignificatif:!sig, seuilHeures:1000, accidents:acc.length, avecArret:aa.length, joursArret:j, trajets:ev.filter(e => e.type === "accident_trajet").length,
      incidents:ev.filter(e => e.type === "incident").length, presqueAccidents:ev.filter(e => e.type === "presque_accident").length, tf:sig ? Math.round(aa.length * 1e6 / h.heures * 100) / 100 : null, tg:sig ? Math.round(j * 1e3 / h.heures * 100) / 100 : null,
      actionsOuvertes:ouv.length, actionsRetard:ouv.filter(a => a.echeance < au).length, parMois, droits:HDROITS};
  }
  function hseLireEvt(b){
    const T = ["accident","accident_trajet","incident","presque_accident"], desc = String(b.description || "").trim(), mat = String(b.mat || "").trim();
    if (T.indexOf(b.type) < 0 || !dOk(b.d) || !desc) return {err:"declaration"};
    if (b.d > aujL()) return {err:"futur"};
    if (mat && !empDe(mat)) return {err:"salarie"};
    if (!mat && (b.type === "accident" || b.type === "accident_trajet")) return {err:"victime"};
    const arret = b.arret === true; if (arret && (!mat || (b.type !== "accident" && b.type !== "accident_trajet"))) return {err:"arret"};
    const g = b.gravite == null || b.gravite === "" ? 1 : Number(b.gravite), j = !arret ? 0 : b.joursArret == null || b.joursArret === "" ? 0 : Number(b.joursArret);
    if (!(Number.isInteger(g) && g >= 1 && g <= 4)) return {err:"gravite"}; if (!(Number.isInteger(j) && j >= 0 && j <= 3650)) return {err:"jours"};
    if (b.heure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.heure))) return {err:"heure"};
    if (b.siteId && !sitesDemo().some(z => z.id === b.siteId)) return {err:"site"};
    const e = empDe(mat);
    return {type:b.type, d:b.d, heure:String(b.heure || ""), site_id:b.siteId || (e && e.siteId) || null, lieu:String(b.lieu || ""), mat:mat || null, victime:mat ? nomDe(mat) : "", gravite:+b.gravite || 1, arret:arret ? 1 : 0, jours_arret:arret ? Math.max(0, Math.floor(+b.joursArret || 0)) : 0, description:desc};
  }
  function hse(methode, c, b){
    const p = sansQ(c); if (p.indexOf(HS+"/") !== 0) return undefined; b = b || {};
    const h = hseDonnees(), q = qp(c), a = aujL(); let m;
    const detail = id => { const e = h.ev.find(x => x.id === id); if (!e) return null; return {evenement:Object.assign(copie(e), {cnam:h.decl[id] ? copie(h.decl[id]) : null}), actions:copie(h.actions.filter(x => x.evenement_id === id)), journal:copie(h.journal.filter(j => j.objet_id === id)), droits:HDROITS, sites:sitesDemo()}; };
    if (methode === "GET"){
      if (p === HS+"/indicateurs") return hseIndicateurs(h);
      if (p === HS+"/salaries"){ const s = String(q.get("q") || "").trim().toLowerCase(); let l = []; try { l = s.length < 2 ? [] : (db.emps || []).filter(e => String(e.mat).toLowerCase().indexOf(s) === 0 || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0).slice(0, 15); } catch(e){}
        return {lignes:l.map(e => ({mat:e.mat, nom:nomDe(e.mat), sorti:!!(e.sortie && e.sortie < a)}))}; }
      if (p === HS+"/evenements"){ const st = q.get("statut") || "", fm = q.get("mat") || "", fd = q.get("du") || "", fa = q.get("au") || "", fs = q.get("site") || "", l = h.ev.filter(e => (st === "tous" ? true : st === "clos" || st === "annule" ? e.statut === st : e.statut !== "clos" && e.statut !== "annule") && (!fm || e.mat === fm) && (!fd || e.d >= fd) && (!fa || e.d <= fa) && (!fs || e.site_id === fs)).sort((x, y) => (y.d+(y.heure||"")).localeCompare(x.d+(x.heure||"")));
        return Object.assign(pagine(l.map(e => Object.assign({}, e, {cnam:h.decl[e.id] ? {declaree_le:h.decl[e.id].declaree_le} : null})), q), {droits:HDROITS, sites:sitesDemo()}); }
      if ((m = /^\/api\/v1\/hse\/evenements\/([^/]+)$/.exec(p))){ const d = detail(m[1]); return d || Promise.reject(Object.assign(new Error("Introuvable."), {status:404})); }
      if (p === HS+"/actions"){ const st = q.get("statut") || "", l = h.actions.filter(x => st ? x.statut === st : x.statut !== "faite" && x.statut !== "annulee").map(x => { const e = h.ev.find(z => z.id === x.evenement_id), r = h.risques.find(z => z.id === x.risque_id); return Object.assign({}, x, {evtype:e ? e.type : null, evd:e ? e.d : null, danger:r ? r.danger : null}); }).sort((x, y) => x.echeance.localeCompare(y.echeance));
        return Object.assign(pagine(l, q), {droits:HDROITS}); }
      if (p === HS+"/risques") return Object.assign(pagine(h.risques.map(r => Object.assign({}, r, {criticite:r.gravite * r.probabilite})).sort((x, y) => y.criticite - x.criticite), q), {droits:HDROITS, sites:sitesDemo()});
      if (p === HS+"/epi"){ const f = q.get("filtre") || "", s30 = jPlus(a, 30);
        const cour = h.epi.filter(x => f === "historique" || (!x.annule && !h.epi.some(z => z !== x && !z.annule && z.mat === x.mat && z.type === x.type && z.remis_le > x.remis_le)));
        const l = cour.filter(x => f !== "renouveler" || (x.renouveler_le && x.renouveler_le <= s30)).sort((x, y) => (x.renouveler_le || "9999").localeCompare(y.renouveler_le || "9999"));
        return Object.assign(pagine(l.map(x => Object.assign({}, x, {aRenouveler:!x.annule && !!(x.renouveler_le && x.renouveler_le <= s30)})), q), {droits:HDROITS}); }
      if (p === HS+"/export") return refus("export", 404);
      return undefined;
    }
    if (p === HS+"/evenements"){ const v = hseLireEvt(b); if (v.err) return refus(v.err);
      const it = Object.assign({id:nouvelId("he"), cause:"", statut:"ouvert", declare_par:"admin", cree:maint(), clos_le:null}, v); h.ev.unshift(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/hse\/evenements\/([^/]+)(?:\/(analyse|cloturer|rouvrir|cnam|annuler|imprime))?$/.exec(p))){
      const e = h.ev.find(x => x.id === m[1]); if (!e) return Promise.reject(Object.assign(new Error("Introuvable."), {status:404}));
      if (m[2] === "imprime") return {ok:true, demo:true};
      if (m[2] === "annuler"){ if (!String(b.motif || "").trim()) return refus("motif"); if (e.statut === "annule") return refus("clos", 409); e.statut = "annule";
        h.actions.forEach(x => { if (x.evenement_id === e.id && x.statut !== "faite") x.statut = "annulee"; }); h.journal.unshift({objet_id:e.id, nature:"annulation", le:maint(), par:"admin", motif:String(b.motif).trim()}); return {ok:true, demo:true}; }
      if (e.statut === "annule") return refus("clos", 409);
      if (!m[2]){ if (e.statut === "clos") return refus("clos", 409); const v = hseLireEvt(b); if (v.err) return refus(v.err);
        const dc = h.decl[e.id]; if (dc && ((v.type !== "accident" && v.type !== "accident_trajet") || v.mat !== e.mat || v.d > dc.declaree_le)) return refus("cnamExiste", 409);
        const avant = {}; ["type","d","heure","site_id","lieu","mat","gravite","arret","jours_arret","description"].forEach(k => { if (String(e[k] == null ? "" : e[k]) !== String(v[k] == null ? "" : v[k])) avant[k] = e[k]; });
        if (Object.keys(avant).length) h.journal.unshift({objet_id:e.id, nature:"modification", le:maint(), par:"admin", motif:"", avant}); Object.assign(e, v); return {ok:true, demo:true}; }
      if (m[2] === "cnam"){ if ((e.type !== "accident" && e.type !== "accident_trajet") || !e.mat) return refus("pasAccident"); if (!dOk(b.declareeLe) || b.declareeLe < e.d || b.declareeLe > a) return refus("cnam"); h.decl[e.id] = {declaree_le:b.declareeLe, reference:String(b.reference || "")}; return {ok:true, demo:true}; }
      if (m[2] === "rouvrir"){ if (!String(b.motif || "").trim()) return refus("motif"); if (e.statut !== "clos") return refus("clos", 409); e.statut = "en_analyse"; e.clos_le = null; h.journal.unshift({objet_id:e.id, nature:"reouverture", le:maint(), par:"admin", motif:String(b.motif).trim()}); return {ok:true, demo:true}; }
      if (e.statut === "clos") return refus("clos", 409);
      if (m[2] === "analyse"){ const cause = b.cause == null ? String(e.cause || "").trim() : String(b.cause).trim(); if (!cause) return refus("cause");
        e.cause = cause; e.statut = "en_analyse"; if (+e.arret && b.joursArret != null && b.joursArret !== "") e.jours_arret = Math.max(0, Math.floor(+b.joursArret || 0)); return {ok:true, demo:true}; }
      if (!String(e.cause || "").trim()) return refus("causeAvant", 409);
      if (+e.arret && !(+e.jours_arret > 0)) return refus("joursArretRequis", 409);
      const n = h.actions.filter(x => x.evenement_id === e.id && x.statut !== "faite" && x.statut !== "annulee").length; if (n) return refus("actionsOuvertes", 409, {n});
      e.statut = "clos"; e.clos_le = maint(); return {ok:true, demo:true};
    }
    if (p === HS+"/actions"){ const t = String(b.titre || "").trim(); if (!t || !dOk(b.echeance) || b.echeance < a) return refus("action");
      if (b.evenementId){ const e = h.ev.find(x => x.id === b.evenementId); if (!e || e.statut === "clos") return refus("clos", 409); }
      const it = {id:nouvelId("ha"), evenement_id:b.evenementId || null, risque_id:b.risqueId || null, titre:t, responsable:String(b.responsable || ""), echeance:b.echeance, statut:"a_faire", faite_le:null, cree:maint(), par:"admin"};
      h.actions.push(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/hse\/actions\/([^/]+)(?:\/(faite|annuler))?$/.exec(p))){ const x = h.actions.find(z => z.id === m[1]); if (!x) return Promise.reject(Object.assign(new Error("Introuvable."), {status:404}));
      if (x.statut === "faite" || x.statut === "annulee") return refus("clos", 409);
      if (m[2] === "faite"){ x.statut = "faite"; x.faite_le = maint(); }
      else if (m[2] === "annuler"){ if (!String(b.motif || "").trim()) return refus("motif"); x.statut = "annulee"; h.journal.unshift({objet_id:x.id, nature:"annulation", le:maint(), par:"admin", motif:String(b.motif).trim()}); }
      else { if (!String(b.titre || x.titre).trim() || !dOk(b.echeance || x.echeance)) return refus("action"); Object.assign(x, {titre:String(b.titre || x.titre).trim(), responsable:b.responsable == null ? x.responsable : String(b.responsable), echeance:b.echeance || x.echeance}); }
      return {ok:true, demo:true}; }
    if ((m = /^\/api\/v1\/hse\/risques(?:\/([^/]+))?$/.exec(p))){ const u = String(b.unite || "").trim(), d = String(b.danger || "").trim(), g = +b.gravite, pr = +b.probabilite;
      if (!u || !d || !(Number.isInteger(g) && g >= 1 && g <= 4) || !(Number.isInteger(pr) && pr >= 1 && pr <= 4)) return refus("risque");
      if (b.siteId && !sitesDemo().some(z => z.id === b.siteId)) return refus("site");
      const v = {unite:u, danger:d, gravite:g, probabilite:pr, mesures:String(b.mesures || ""), site_id:b.siteId || null, revise_le:a, maj:maint(), par:"admin"};
      if (m[1]){ const r = h.risques.find(z => z.id === m[1]); if (r) Object.assign(r, v); return {ok:true, demo:true, id:m[1]}; }
      const it = Object.assign({id:nouvelId("hr")}, v); h.risques.push(it); return {ok:true, demo:true, id:it.id}; }
    if (p === HS+"/epi"){ const mat = String(b.mat || "").trim(), t = String(b.type || "").trim(); if (!mat || !t || !dOk(b.remisLe) || b.remisLe > a) return refus("epi");
      const em = empDe(mat); if (!em) return refus("salarie", 404); if (b.renouvelerLe && (!dOk(b.renouvelerLe) || b.renouvelerLe <= b.remisLe)) return refus("renouv");
      if (em.entree && b.remisLe < em.entree) return refus("epiEntree"); if (h.epi.some(z => !z.annule && z.mat === mat && z.type.toLowerCase() === t.toLowerCase() && z.remis_le === b.remisLe)) return refus("doublonEpi", 409);
      const it = {id:nouvelId("hp"), mat, type:t, remis_le:b.remisLe, renouveler_le:b.renouvelerLe || null, nom:nomDe(mat)}; h.epi.push(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/hse\/epi\/([^/]+)\/annuler$/.exec(p))){ if (!String(b.motif || "").trim()) return refus("motif"); const x = h.epi.find(z => z.id === m[1]); if (x){ x.annule = true; x.annule_le = maint(); } return {ok:true, demo:true}; }
    return undefined;
  }
  const MED = "/api/v1/medical";
  let MDD = null;
  function medDonnees(){
    if (MDD) return MDD;
    const vis = [], mp = [];
    chemins().filter(k => k.indexOf(MED+"/dossier/") === 0).forEach(k => { const d = REP[k]; (d.visites || []).forEach(v => { if (!vis.some(x => x.id === v.id)) vis.push(copie(v)); }); (d.maladiesPro || []).forEach(z => mp.push(copie(z))); });
    ((REP[MED+"/visites?limit=100&statut=planifiee"] || {}).lignes || []).forEach(v => { if (!vis.some(x => x.id === v.id)) vis.push(Object.assign({restrictions:"", observations:"", maj:maint(), par:"admin"}, copie(v))); });
    /* aptitudes enregistrées sans dossier : visite périodique reconstituée (un an avant la prochaine) */
    ((REP[MED+"/aptitudes?limit=100&q=&filtre="] || {}).lignes || []).forEach(r => { if (r.aptitude && !vis.some(v => v.mat === r.mat && v.statut === "realisee")){ const d = r.prochaine ? mPlus(r.prochaine, -12) : aujL();
      vis.push({id:nouvelId("mv"), mat:r.mat, type:"periodique", prevue_le:d, realisee_le:d, statut:"realisee", aptitude:r.aptitude, restrictions:"", observations:"", prochaine_le:r.prochaine, maj:d+"T09:00:00.000Z", par:"admin"}); } });
    MDD = {vis, mp, journal:[], per:+((REP[MED+"/parametres"] || {}).periodiciteMois) || 12};
    return MDD;
  }
  const MDROITS = {medical:true, sensibles:true, planifier:true, modifier:true, declarer:true, valider:true, supprimer:true, imprimer:true, parametrer:true, exporter:false};
  function medAptitude(d, mat){ const l = d.vis.filter(v => v.mat === String(mat) && v.statut === "realisee" && v.type !== "pre_reprise").sort((x, y) => (x.realisee_le+x.maj).localeCompare(y.realisee_le+y.maj)), v = l[l.length - 1];
    return v ? {aptitude:v.aptitude, derniere:v.realisee_le, prochaine:v.aptitude === "inapte" ? null : v.prochaine_le, type:v.type} : null; }
  function medical(methode, c, b){
    const p = sansQ(c); if (p.indexOf(MED+"/") !== 0) return undefined; b = b || {};
    const d = medDonnees(), q = qp(c), a = aujL(); let m;
    const echue = v => !v || (v.aptitude !== "inapte" && (!v.prochaine || v.prochaine <= a));
    if (methode === "GET"){
      if (p === MED+"/salaries"){ const s = String(q.get("q") || "").trim().toLowerCase(); let l = []; try { l = s.length < 2 ? [] : (db.emps || []).filter(e => (!e.sortie || e.sortie >= a) && (String(e.mat).toLowerCase().indexOf(s) === 0 || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0)).slice(0, 15); } catch(e){}
        return {lignes:l.map(e => ({mat:e.mat, nom:nomDe(e.mat)}))}; }
      if (p === MED+"/aptitudes"){ const s = String(q.get("q") || "").trim().toLowerCase(), f = q.get("filtre") || "";
        let emps = []; try { emps = (db.emps || []).filter(e => !e.sortie || e.sortie >= a); } catch(e){}
        const l = emps.filter(e => !s || String(e.mat).toLowerCase() === s || ((e.nom||"")+" "+(e.prenom||"")).toLowerCase().indexOf(s) >= 0).map(e => { const v = medAptitude(d, e.mat), pl = d.vis.filter(x => x.mat === String(e.mat) && x.statut === "planifiee").sort((x, y) => x.prevue_le.localeCompare(y.prevue_le))[0];
          return {mat:e.mat, nom:nomDe(e.mat), aptitude:v ? v.aptitude : null, prochaine:v ? v.prochaine : null, echue:echue(v), planifiee:pl ? pl.prevue_le : null}; })
          .filter(r => !f || (f === "restriction" ? (r.aptitude === "apte_restriction" || r.aptitude === "inapte") : f === "inapte" ? r.aptitude === "inapte" : r.echue)).sort((x, y) => x.nom.localeCompare(y.nom));
        return Object.assign(pagine(l, q), {droits:MDROITS, roleMedical:true}); }
      if (p === MED+"/parametres") return {periodiciteMois:d.per, droits:MDROITS};
      if (p === MED+"/visites"){ const st = q.get("statut") || "planifiee", et = q.get("etat") || "", s7 = jPlus(a, 7), mo = a.slice(0, 7);
        const pl = d.vis.filter(v => v.statut === "planifiee"), cpt = st === "planifiee" ? {total:pl.length, retard:pl.filter(v => v.prevue_le < a).length, proche:pl.filter(v => v.prevue_le >= a && v.prevue_le <= s7).length, mois:pl.filter(v => v.prevue_le.slice(0, 7) === mo).length} : null;
        const l = d.vis.filter(v => v.statut === st && (st !== "planifiee" || !et || (et === "retard" ? v.prevue_le < a : v.prevue_le >= a && v.prevue_le <= s7)))
          .sort((x, y) => st === "realisee" ? (y.realisee_le+y.maj).localeCompare(x.realisee_le+x.maj) : st === "annulee" ? y.maj.localeCompare(x.maj) : x.prevue_le.localeCompare(y.prevue_le))
          .map(v => ({id:v.id, mat:v.mat, type:v.type, prevue_le:v.prevue_le, realisee_le:v.realisee_le, statut:v.statut, aptitude:v.aptitude, prochaine_le:v.prochaine_le, nom:nomDe(v.mat)}));
        return Object.assign(pagine(l, q), {compteurs:cpt, droits:MDROITS}); }
      if ((m = /^\/api\/v1\/medical\/dossier\/([^/]+)$/.exec(p))){ let mat; try { mat = decodeURIComponent(m[1]); } catch(e){ mat = ""; } const e = empDe(mat);
        if (!e) return Promise.reject(Object.assign(new Error((MD.salarie)[langue()]), {status:404}));
        const vis = d.vis.filter(v => v.mat === String(mat)).sort((x, y) => ((y.realisee_le || y.prevue_le)+y.maj).localeCompare((x.realisee_le || x.prevue_le)+x.maj));
        return {salarie:{mat:e.mat, nom:nomDe(mat), poste:e.poste || "", entree:e.entree || "", sortie:e.sortie || ""}, aptitude:medAptitude(d, mat), visites:copie(vis), journal:copie(d.journal.filter(j => vis.some(v => v.id === j.visite) || d.mp.some(z => z.id === j.visite && z.mat === String(mat)))), maladiesPro:copie(d.mp.filter(z => z.mat === String(mat))), illisible:0, droits:MDROITS}; }
      if (p === MED+"/export") return refus("export", 404);
      return undefined;
    }
    if (p === MED+"/parametres"){ const n = +b.periodiciteMois; if ([6,12,24,36].indexOf(n) >= 0) d.per = n; return {ok:true, demo:true}; }
    if (p === MED+"/visites"){ const mat = String(b.mat || "").trim(), T = ["embauche","periodique","reprise","pre_reprise","demande"];
      if (!mat || T.indexOf(b.type) < 0 || !dOk(b.prevueLe)) return refus("planif"); const em = empDe(mat); if (!em) return refus("salarie", 404); if (em.sortie && em.sortie < a) return refus("sorti", 409); if (b.prevueLe < a) return refus("passee");
      if (d.vis.some(v => v.mat === mat && v.type === b.type && v.statut === "planifiee")) return refus("doublon", 409);
      const it = {id:nouvelId("mv"), mat, type:b.type, prevue_le:b.prevueLe, realisee_le:null, statut:"planifiee", aptitude:null, restrictions:"", observations:"", prochaine_le:null, maj:maint(), par:"admin"}; d.vis.push(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/medical\/visites\/([^/]+)\/(realiser|annuler|reporter|rectifier|imprime)$/.exec(p))){
      const v = d.vis.find(x => x.id === m[1]); if (!v) return Promise.reject(Object.assign(new Error("Introuvable."), {status:404}));
      if (m[2] === "imprime") return {ok:true, demo:true};
      const em = empDe(v.mat) || {};
      const resultat = () => { const r = b.realiseeLe || a; if (!dOk(r) || r > a) return {err:"dateRealisation"}; if (em.entree && r < jPlus(em.entree, -60)) return {err:"avantEntree"};
        if (String(b.restrictions || "").length > 2000 || String(b.observations || "").length > 4000) return {err:"trop"};
        if (!(v.type === "pre_reprise" && !b.aptitude) && ["apte","apte_restriction","inapte"].indexOf(b.aptitude) < 0) return {err:"aptitude"};
        if (b.aptitude === "apte_restriction" && !String(b.restrictions || "").trim()) return {err:"restrictions"};
        if (String(b.restrictions || "").trim() && b.aptitude !== "apte_restriction") return {err:"restrictionsHors"};
        let pr = null; if (b.aptitude !== "inapte" && v.type !== "pre_reprise"){ if (b.prochaineLe){ if (!dOk(b.prochaineLe) || b.prochaineLe <= r) return {err:"prochaine"}; pr = b.prochaineLe; } else pr = mPlus(r, d.per); }
        return {realisee_le:r, aptitude:b.aptitude, restrictions:String(b.restrictions || "").trim(), observations:String(b.observations || "").trim(), prochaine_le:pr, maj:maint()}; };
      if (m[2] === "rectifier"){ if (v.statut !== "realisee") return refus("pasRealisee", 409); if (!String(b.motif || "").trim()) return refus("motif"); const x = resultat(); if (x.err) return refus(x.err);
        d.journal.unshift({visite:v.id, nature:"rectification", le:maint(), par:"admin", motif:String(b.motif).trim(), avant:{realisee_le:v.realisee_le, aptitude:v.aptitude, restrictions:v.restrictions, prochaine_le:v.prochaine_le}, apres:null}); Object.assign(v, x); return {ok:true, demo:true, prochaine:x.prochaine_le}; }
      if (m[2] === "annuler" && v.statut === "realisee"){ if (!String(b.motif || "").trim()) return refus("motif");
        d.journal.unshift({visite:v.id, nature:"annulation", le:maint(), par:"admin", motif:String(b.motif).trim(), avant:{realisee_le:v.realisee_le, aptitude:v.aptitude}, apres:null}); Object.assign(v, {statut:"annulee", maj:maint()}); return {ok:true, demo:true}; }
      if (v.statut !== "planifiee") return refus("traitee", 409);
      if (m[2] === "annuler" || m[2] === "reporter"){ if (!String(b.motif || "").trim()) return refus("motif");
        if (m[2] === "reporter" && (!dOk(b.prevueLe) || b.prevueLe < a || b.prevueLe === v.prevue_le)) return refus("report");
        d.journal.unshift({visite:v.id, nature:m[2] === "annuler" ? "annulation" : "report", le:maint(), par:"admin", motif:String(b.motif).trim(), avant:v.prevue_le, apres:m[2] === "reporter" ? b.prevueLe : null});
        if (m[2] === "annuler") Object.assign(v, {statut:"annulee", maj:maint()}); else Object.assign(v, {prevue_le:b.prevueLe, maj:maint()}); return {ok:true, demo:true}; }
      const x = resultat(); if (x.err) return refus(x.err); Object.assign(v, x, {statut:"realisee"}); return {ok:true, demo:true, prochaine:x.prochaine_le}; }
    if (p === MED+"/maladies-pro"){ const mat = String(b.mat || "").trim(); if (!mat || !dOk(b.declareeLe) || b.declareeLe > a) return refus("declarationMp");
      const em = empDe(mat) || {}; if (em.entree && b.declareeLe < em.entree) return refus("avantEntree"); if (b.tableau && !/^\d{1,3}( ?(bis|ter))?$/i.test(String(b.tableau).trim())) return refus("tableau");
      if (String(b.observations || "").length > 4000) return refus("trop");
      const it = {id:nouvelId("mp"), mat, declaree_le:b.declareeLe, tableau:String(b.tableau || ""), statut:"declaree", observations:String(b.observations || ""), maj:maint(), par:"admin"}; d.mp.unshift(it); return {ok:true, demo:true, id:it.id}; }
    if ((m = /^\/api\/v1\/medical\/maladies-pro\/([^/]+)\/(statut|rectifier|annuler)$/.exec(p))){ const z = d.mp.find(x => x.id === m[1]); if (!z) return Promise.reject(Object.assign(new Error("Introuvable."), {status:404}));
      const motif = String(b.motif || "").trim();
      if (m[2] === "statut"){ if (["declaree","reconnue","refusee"].indexOf(b.statut) < 0) return refus("mpStatut"); if (z.statut !== "declaree" && b.statut !== z.statut && !motif) return refus("mpTransition");
        if (b.statut !== z.statut) d.journal.unshift({visite:z.id, nature:"mp.statut", le:maint(), par:"admin", motif, avant:{statut:z.statut}, apres:b.statut}); z.statut = b.statut; return {ok:true, demo:true}; }
      if (!motif) return refus("motif");
      if (m[2] === "annuler"){ d.journal.unshift({visite:z.id, nature:"mp.annulation", le:maint(), par:"admin", motif, avant:{statut:z.statut}, apres:null}); z.statut = "annulee"; return {ok:true, demo:true}; }
      if (!dOk(b.declareeLe) || b.declareeLe > a) return refus("declarationMp"); if (b.tableau && !/^\d{1,3}( ?(bis|ter))?$/i.test(String(b.tableau).trim())) return refus("tableau");
      d.journal.unshift({visite:z.id, nature:"mp.rectification", le:maint(), par:"admin", motif, avant:{declaree_le:z.declaree_le, tableau:z.tableau}, apres:null}); Object.assign(z, {declaree_le:b.declareeLe, tableau:String(b.tableau || ""), observations:String(b.observations || "")}); return {ok:true, demo:true}; }
    return undefined;
  }
  return function(chemin, o){
    const c = "/"+String(chemin || "").replace(/^\.?\//, "");
    const methode = o && (o.methode || (o.corps !== undefined ? "POST" : "GET")) || "GET";
    if (methode !== "GET"){
      let r; try { r = recrut(methode, c, o && o.corps); if (r === undefined) r = integ(methode, c, o && o.corps); if (r === undefined) r = formation(methode, c, o && o.corps); if (r === undefined) r = evaluation(methode, c, o && o.corps); if (r === undefined) r = competences(methode, c, o && o.corps); if (r === undefined) r = hse(methode, c, o && o.corps); if (r === undefined) r = medical(methode, c, o && o.corps); if (r === undefined) r = ecrire(sansQ(c), o && o.corps); } catch(e){ r = {ok:true, demo:true}; }
      /* correctif 40 : un refus (promesse rejetée) est marqué géré pendant la latence simulée (sinon « unhandledrejection ») */
      if (r && typeof r.then === "function") r.catch(() => {});
      return new Promise(ok => setTimeout(() => ok(r), 150));
    }
    let rr = recrut("GET", c); if (rr === undefined) rr = integ("GET", c); if (rr === undefined) rr = formation("GET", c); if (rr === undefined) rr = evaluation("GET", c); if (rr === undefined) rr = competences("GET", c); if (rr === undefined) rr = hse("GET", c); if (rr === undefined) rr = medical("GET", c); if (rr !== undefined){ if (rr && typeof rr.then === "function") rr.catch(() => {}); return new Promise(ok => setTimeout(() => ok(rr), 120)); }
    const p = sansQ(c), parent = p.replace(/\/[^/]+$/, "/"), cles = chemins();
    let k = REP[c] !== undefined ? c : cles.find(x => sansQ(x) === p);
    if (!k) k = cles.find(x => { const y = sansQ(x); return y.lastIndexOf("/") === parent.length - 1 && y.indexOf(parent) === 0 && y.length > parent.length; });
    if (!k) return Promise.reject(Object.assign(new Error("Non disponible dans la version de démonstration."), {status:404}));
    return new Promise(ok => setTimeout(() => ok(filtrer(p, c, copie(REP[k]))), 120));
  };
})
