/* FIWAKTI — calculs faits par le serveur (v44) : file de travail, cache par
   employé et par jour, et listes paginées pour les grands effectifs. */
"use strict";
const { Worker } = require("worker_threads");
const path = require("path");
/* 56.33.11 : comparateur créé une fois (même ordre que localeCompare sans paramètre, ~10 fois plus rapide sur 50 000
   salariés) */
const COLL = new Intl.Collator();
const REF_GLOBALES = ["cals","feries","jours","tt","arits","convs","sites","depts","champs","clotures","params","secu","regles","circuits","reglesV","etablissements"];
function creer(B, D, opts){
  let GENERATION = 0;
  /* 56.33.11 : deux générations. GENERATION change à chaque modification faite par un utilisateur (correction,
     validation, paramétrage) : les résultats en cache sont abandonnés tout de suite. GEN_P change à chaque badgeage
     reçu d'une pointeuse : un résultat reste servi au plus 5 s après. À l'heure d'arrivée (200 badgeages/s), chaque
     badgeage abandonnait auparavant tous les caches de calcul : chaque écran refaisait ses contrôles sur tout le
     personnel (accueil à 15 s, délais dépassés). */
  let GEN_P = 0; const FRAIS_P = 5000;
  const marque = () => ({t:Date.now(), gen:GENERATION, genP:GEN_P});
  const frais = (c, ttl) => !!c && c.gen === GENERATION && Date.now() - c.t < ttl && (c.genP === GEN_P || Date.now() - c.t < FRAIS_P);
  /* plusieurs fils de calcul avec PostgreSQL (un seul avec la base intégrée, qui n'a qu'un écrivain) */
  /* 56.33.11 : nombre de fils réglable sur un gros serveur (FIWAKTI_FILS_CALCUL ou config « filsCalcul », 1 à 32) ;
     par défaut, cœurs − 1, 4 au plus, comme avant */
  const reglage = Number(process.env.FIWAKTI_FILS_CALCUL) || Number(((opts.config && opts.config()) || {}).filsCalcul) || 0;
  const NB = opts.base && opts.base.type === "pg" ? Math.max(1, reglage ? Math.min(32, reglage) : Math.min(4, require("os").cpus().length - 1)) : 1;
  const fils = []; let seq = 0; const attente = new Map();
  function fil(i){
    if (fils[i] && fils[i].w) return fils[i];
    const w = new Worker(path.join(__dirname, "moteur.js"), {workerData:{base:opts.base, dossier:opts.dossier, app:opts.app}});
    const f = {w, charge:0, fond:0};
    w.on("message", m=>{ const p = attente.get(m.id); if (!p) return;
      if (m.progression){ if (p.avancement) p.avancement(m.progression); return; }
      attente.delete(m.id); f.charge--; if (p.fond) f.fond--; m.ok ? p.ok(m.r) : p.ko(new Error(m.erreur)); pomper(); });
    w.on("error", e=>{ opts.journal("moteur : "+e.message); attente.forEach((p, id)=>{ if (p.f === f){ attente.delete(id); p.ko(e); } }); f.w = null; pomper(); });
    w.on("exit", ()=>{ f.w = null; pomper(); });
    fils[i] = f; return f;
  }
  /* 56.33.11 : deux priorités. Une demande d'écran part tout de suite vers le fil le moins chargé ; un calcul de fond
     (rattrapage après un import de badgeages, rafraîchissement d'hier et d'aujourd'hui) attend en file et n'occupe
     jamais plus d'une place par fil. Auparavant les deux se mélangeaient : à 50 000 salariés, pendant l'arrivée des
     badgeages, une synthèse de 100 salariés attendait derrière des centaines de milliers de journées (30 s, délai
     dépassé). */
  const FILE_FOND = [];
  function envoyer(i, m, ok, ko, avancement, fond){
    const f = fil(i);
    /* v53 : source des badgeages du moteur (projection de compatibilité ou événements normalisés) */
    const source = (opts.config && (opts.config().moteurSource === "normalise")) ? "normalise" : "compat";
    const id = ++seq; attente.set(id, {ok, ko, f, avancement, fond}); f.charge++; if (fond) f.fond++;
    f.w.postMessage(Object.assign({id, source}, m));
  }
  function pomper(){
    while (FILE_FOND.length){
      let libre = -1;
      for (let i = 0; i < NB; i++){ const f = fils[i]; if (!f || !f.w || !f.fond){ libre = i; break; } }
      if (libre < 0) return;
      const t = FILE_FOND.shift(); envoyer(libre, t.m, t.ok, t.ko, t.avancement, true);
    }
  }
  function tache(m, avancement, fond){
    if (fond) return new Promise((ok, ko)=>{ FILE_FOND.push({m, ok, ko, avancement}); pomper(); });
    let meilleur = 0;
    for (let i = 0; i < NB; i++){ const f = fils[i]; if (!f || !f.w){ meilleur = i; break; } if (f.charge - f.fond < fils[meilleur].charge - fils[meilleur].fond) meilleur = i; }
    return new Promise((ok, ko)=>envoyer(meilleur, m, ok, ko, avancement, false));
  }
  const auj = () => { const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0"); };
  const ajout = (k, j) => { const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)+j); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  /* 56.33.11 : dates AAAA-MM-JJ comptées sans objet Date (même valeur que new Date(), qui les lit en UTC) */
  const JOUR_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const nbJours = (du, au) => JOUR_ISO.test(du) && JOUR_ISO.test(au)
    ? Math.round((Date.UTC(+au.slice(0,4), +au.slice(5,7)-1, +au.slice(8,10)) - Date.UTC(+du.slice(0,4), +du.slice(5,7)-1, +du.slice(8,10))) / 86400000) + 1
    : Math.round((new Date(au) - new Date(du)) / 86400000) + 1;
  const MEMO_ATT = new Map();
  /* un calcul à la fois pour une même période : les demandes simultanées attendent le même résultat */
  const enCours = new Map();
  /* v49 : une vérification de couverture récente (moins d'une minute, sans invalidation depuis) n'est pas refaite */
  const VERIFIES = new Map(); let RAFRAICHISSEMENT = false, WF = null;
  /* v52 : après chaque calcul, états des journées et anomalies persistées (cycle de vie) */
  /* v56.30 : base intégrée — pendant un long calcul d'avance, le fil de calcul garde l'écriture plus de 5 s et la
     synchronisation du cycle de vie échouait (« database is locked ») : nouvel essai différé, sans bloquer le serveur */
  const suivre = (mats, du, au, essai) => WF ? WF.synchroniser(mats, du, au).catch(e=>{
    const n = essai || 0;
    if (/database is locked|SQLITE_BUSY/i.test(String(e && e.message)) && n < 6)
      return new Promise(ok=>setTimeout(ok, 2000 * (n + 1))).then(()=>suivre(mats, du, au, n + 1));
    opts.journal("workflow : "+e.message); }) : Promise.resolve();
  async function assurer(mats, du, au){
    if (!mats.length) return 0;
    const cle = du+"|"+au+"|"+mats.length+"|"+mats[0]+"|"+mats[mats.length-1];
    const v = VERIFIES.get(cle);
    if (frais(v, 60000)) return 0;
    if (enCours.has(cle)) return enCours.get(cle);
    const p = (async ()=>{
      const aujourdhui = auj(), hier = ajout(aujourdhui, -1), limite = new Date(Date.now() - 10*60000).toISOString();
      const emps = await D.employes();
      /* tout le personnel : aucune liste de matricules dans la requête */
      const f = mats.length >= emps.length ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
      const fm = f.sql.replace(" AND (mat IS NULL OR mat='' OR ", " AND (");
      /* v49 : jours manquants → calculés avant de répondre ; jours récents simplement anciens (aujourd'hui,
         hier, plus de 10 min) → rafraîchis en arrière-plan, la réponse utilise la version existante */
      /* v50 : seuls les jours antérieurs à hier sont calculés avant de répondre ; hier et aujourd'hui (manquants ou
         anciens) le sont en arrière-plan — le premier écran du matin n'attend plus le calcul de tout le personnel */
      const auPasse = au < hier ? au : ajout(hier, -1);
      let tot = 0;
      if (du <= auPasse){
        /* v56.3 : jours attendus calculés sans boucle par jour (bornes d'entrée et de sortie), puis contrôle global en une
           seule requête de comptage ; le détail par salarié n'est lu que s'il manque des journées */
        const nb = nbJours(du, auPasse), cleA = du+"|"+auPasse, mA = MEMO_ATT.get(cleA);
        let attendus;
        if (mA && mA.emps === emps) attendus = mA.attendus;
        else { attendus = {};
          emps.forEach(e=>{ if (!e.entree && !e.sortie){ attendus[e.mat] = nb; return; }
            const a = e.entree && e.entree > du ? e.entree : du, b = e.sortie && e.sortie < auPasse ? e.sortie : auPasse; attendus[e.mat] = a <= b ? nbJours(a, b) : 0; });
          if (MEMO_ATT.size > 100) MEMO_ATT.clear(); MEMO_ATT.set(cleA, {emps, attendus}); }
        const attenduTotal = mats.reduce((s, m)=>s + (attendus[m] !== undefined ? attendus[m] : nb), 0);
        const total = Number((await B.get("SELECT COUNT(*) n FROM calc_jour WHERE d>=? AND d<=?"+fm, du, auPasse, ...f.a)).n);
        let manque = [];
        if (total !== attenduTotal){
          const faits = await B.all("SELECT mat, COUNT(*) n FROM calc_jour WHERE d>=? AND d<=?"+fm+" GROUP BY mat", du, auPasse, ...f.a);
          const n = {}; faits.forEach(r=>{ n[r.mat] = Number(r.n); });
          manque = mats.filter(m=>(n[m]||0) < (attendus[m] !== undefined ? attendus[m] : nb));
        }
        const lots = [];
        for (let i = 0; i < manque.length; i += 400) lots.push(manque.slice(i, i+400));
        const calculer = fond => Promise.all(lots.map(l=>tache({type:"calculer", mats:l, du, au:auPasse, horodatage:new Date().toISOString()}, null, fond)));
        /* v56.30 : après un changement de paramétrage qui efface tous les résultats, des centaines de milliers de journées
           manquent : on ne fait plus attendre l'écran (92 s mesurées à 60 000 salariés) — calcul en arrière-plan, la réponse
           signale « recalcul en cours » et l'écran se met à jour seul */
        if (manque.length > 3000){
          if (!EN_FOND.actif){ EN_FOND.actif = true; EN_FOND.depuis = Date.now(); EN_FOND.salaries = manque.length;
            /* base intégrée occupée (calcul d'avance, synchronisation) : nouvel essai, jusqu'à 6 fois */
            const essayer = n => calculer(true).catch(e=>{ if (/database is locked|SQLITE_BUSY/i.test(String(e && e.message)) && n < 6) return new Promise(ok=>setTimeout(ok, 3000*(n+1))).then(()=>essayer(n+1)); throw e; });
            essayer(0).then(res=>{ if (res.reduce((x, y)=>x + y, 0)){ GENERATION++; return suivre(manque, du, auPasse); } })
              .catch(e=>opts.journal("recalcul en arrière-plan : "+e.message)).then(()=>{ EN_FOND.actif = false; }); }
        } else {
          const res = await calculer();
          tot = res.reduce((x, y)=>x + y, 0);
          if (tot){ GENERATION++; if (manque.length <= 2000) await suivre(manque, du, auPasse); else suivre(manque, du, auPasse); }
        }
      }
      if (au >= hier && !RAFRAICHISSEMENT){
        const r0 = du > hier ? du : hier, r1 = au < aujourdhui ? au : aujourdhui;
        /* à rafraîchir : lignes anciennes, et salariés sans ligne pour ces jours récents */
        const vieux = await B.all("SELECT DISTINCT mat FROM calc_jour WHERE d>=? AND d<=? AND calc<?"+fm, r0, r1, limite, ...f.a);
        const presents = new Set((await B.all("SELECT mat, COUNT(*) n FROM calc_jour WHERE d>=? AND d<=?"+fm+" GROUP BY mat", r0, r1, ...f.a)).filter(x=>Number(x.n) >= nbJours(r0, r1)).map(x=>x.mat));
        const absents = mats.filter(m=>!presents.has(m));
        /* peu de journées manquantes (un service, quelques salariés) : calculées tout de suite ; tout le personnel : en arrière-plan */
        if (absents.length && absents.length * nbJours(r0, r1) <= 4000){
          const res = await Promise.all(Array.from({length:Math.ceil(absents.length/400)}, (_, k)=>tache({type:"calculer", mats:absents.slice(k*400, k*400+400), du:r0, au:r1, horodatage:new Date().toISOString()})));
          const n2 = res.reduce((x, y)=>x + y, 0); if (n2){ tot += n2; GENERATION++; await suivre(absents, r0, r1); }
        } else { if (absents.length) MANQUANTS_FOND = true; absents.forEach(m=>vieux.push({mat:m})); }
        if (vieux.length){
          RAFRAICHISSEMENT = true;
          const l = Array.from(new Set(vieux.map(x=>x.mat))), lots2 = [];
          for (let i = 0; i < l.length; i += 400) lots2.push(l.slice(i, i+400));
          Promise.all(lots2.map(x=>tache({type:"calculer", mats:x, du:r0, au:r1, horodatage:new Date().toISOString()}, null, true)))
            .then(()=>{ GENERATION++; return suivre(l, r0, r1); }).catch(e=>opts.journal("rafraîchissement : "+e.message)).finally(()=>{ RAFRAICHISSEMENT = false; MANQUANTS_FOND = false; });
        }
      }
      return tot;
    })();
    enCours.set(cle, p);
    const m0 = marque();
    try { const r = await p; VERIFIES.set(cle, m0); if (VERIFIES.size > 500) VERIFIES.clear(); return r; } finally { enCours.delete(cle); }
  }
  const EN_FOND = {actif:false, depuis:0, salaries:0};
  /* 56.33.11 : journées encore absentes, calculées en arrière-plan (après une mise à jour ou un changement de paramétrage) :
     les écrans affichent « calcul en cours » au lieu de zéro anomalie / zéro présent, et ces résultats partiels ne sont
     pas gardés en cache */
  let MANQUANTS_FOND = false;
  const partiel = () => EN_FOND.actif || MANQUANTS_FOND;
  /* 56.33.11 : invalidations horodatées — un calcul en cours (lecture des données avant l'écriture) ne réécrit pas une
     journée invalidée après le début de sa lecture : le fil de calcul supprime ces lignes (moteur.js, calculer). Avant,
     une correction ou un badgeage arrivé pendant un calcul de fond pouvait être recouvert par l'ancien résultat. */
  let INV_PRET = null, INV_PURGE = 0;
  const INV_DDL = "CREATE TABLE IF NOT EXISTS calc_invalidations (mat TEXT NOT NULL, d TEXT NOT NULL, ts TEXT NOT NULL, PRIMARY KEY(mat, d))";
  async function noterInvalidations(paires){
    if (!INV_PRET) INV_PRET = B.run(INV_DDL).catch(e=>{ INV_PRET = null; throw e; });
    await INV_PRET; const ts = new Date().toISOString();
    for (let i = 0; i < paires.length; i += 400){ const p = paires.slice(i, i + 400);
      await B.run("INSERT INTO calc_invalidations(mat,d,ts) VALUES "+p.map(()=>"(?,?,?)").join(",")+" ON CONFLICT(mat,d) DO UPDATE SET ts=excluded.ts", ...[].concat(...p.map(x=>[x[0], x[1], ts]))); }
    if (Date.now() - INV_PURGE > 600000){ INV_PURGE = Date.now(); await B.run("DELETE FROM calc_invalidations WHERE ts < ?", new Date(Date.now() - 3600000).toISOString()); }
  }
  async function invalider(touches, refCles, opts){
    if ((refCles||[]).length || !(opts && opts.pointeuse)) GENERATION++; else GEN_P++;
    try { const paires = (refCles||[]).some(k=>REF_GLOBALES.indexOf(k) >= 0) ? [["*", "*"]] : Array.from(new Set(touches||[])).map(t=>t.split("|")).filter(x=>x[0] && x[1]);
      if (paires.length) await noterInvalidations(paires); } catch(e){ if (opts && opts.journal) opts.journal("invalidations : "+e.message); }
    if ((refCles||[]).some(k=>REF_GLOBALES.indexOf(k) >= 0)){ await B.run("DELETE FROM calc_jour"); return; }
    /* 56.33.11 : badgeage reçu d'une pointeuse pour hier ou aujourd'hui → journée marquée « à rafraîchir » (date de
       calcul vidée) au lieu d'être effacée : les écrans servent la valeur précédente quelques secondes et le recalcul
       part en tâche de fond (rafraîchissement d'hier et d'aujourd'hui), au lieu de faire attendre chaque écran à l'heure
       d'arrivée. Jours plus anciens et modifications des utilisateurs : effacement, recalcul avant réponse, comme avant.
       Écritures groupées par jour (une requête par badgeage auparavant). */
    const recent = opts && opts.pointeuse ? ajout(auj(), -1) : null, parJour = new Map(), tous = [];
    for (const t of touches||[]){
      const [mat, d] = t.split("|");
      if (d === "*"){ tous.push(mat); continue; }
      if (!parJour.has(d)) parJour.set(d, []); parJour.get(d).push(mat);
    }
    const lots = (l, n) => { const r = []; for (let i = 0; i < l.length; i += n) r.push(l.slice(i, i + n)); return r; };
    for (const p of lots(tous, 500)) await B.run("DELETE FROM calc_jour WHERE mat IN ("+p.map(()=>"?").join(",")+")", ...p);
    for (const [d, mats] of parJour) for (const p of lots(mats, 500)){
      const dans = "mat IN ("+p.map(()=>"?").join(",")+")";
      if (recent && d >= recent) await B.run("UPDATE calc_jour SET calc='' WHERE d=? AND "+dans, d, ...p);
      else await B.run("DELETE FROM calc_jour WHERE d=? AND "+dans, d, ...p);
    }
  }
  /* ensemble d'employés : périmètre ∩ filtres (département avec sous-départements, équipe, recherche) */
  /* 56.33.11 : sélection mémorisée pour un même périmètre, mêmes filtres, même jour et même liste de salariés, avec ses
     matricules et sa table matricule → salarié. Auparavant chaque écran refiltrait les 50 000 salariés et reconstruisait
     ces tables (~45 ms de calcul sur le fil principal par requête : 16 écrans/s au plus sous 100 utilisateurs). La
     liste renvoyée est une copie (certains appelants la trient). */
  const MEMO_SEL = new Map();
  async function selection(login, q){
    const ref = await (D.referentielLecture || D.referentiel)() || {};
    const {P, emps: tous} = await D.perimetreDe(ref, login);
    const cleM = [login, q.du || "", auj(), q.dept || "", q.site || "", q.chef || "", q.equipe || "", q.q || "", q.mat || ""].join("|"), mm = MEMO_SEL.get(cleM);
    if (mm && mm.tous === tous && mm.ref === ref && mm.P === P) return {emps:mm.l.slice(), ref, global:mm.global, mats:mm.mats, parMat:mm.parMat};
    const r = selectionCalcul(ref, P, tous, q);
    r.mats = r.emps.map(e=>String(e.mat)); r.parMat = new Map(r.emps.map(e=>[String(e.mat), e]));
    if (Object.isFrozen(ref)){ if (MEMO_SEL.size > 300) MEMO_SEL.clear(); MEMO_SEL.set(cleM, {tous, ref, P, l:r.emps, global:r.global, mats:r.mats, parMat:r.parMat}); }
    return Object.assign({}, r, {emps:r.emps.slice()});
  }
  function selectionCalcul(ref, P, emps, q){
    let l = emps.filter(e=>P.set === null || P.set.has(String(e.mat)));
    const limiteSortie = q.du || auj(), actifs = e => !(e.sortie && e.sortie < limiteSortie);
    l = l.filter(actifs);
    if (q.dept){
      const arbre = new Set([q.dept]); let ajoutes = true;
      while (ajoutes){ ajoutes = false; (ref.depts||[]).forEach(d=>{ if (arbre.has(d.parent) && !arbre.has(d.id)){ arbre.add(d.id); ajoutes = true; } }); }
      l = l.filter(e=>arbre.has(e.deptId));
    }
    if (q.site) l = l.filter(e=>e.siteId === q.site);
    if (q.mat) l = l.filter(e=>String(e.mat) === String(q.mat));   /* état consulté pour un seul salarié */
    if (q.chef) l = l.filter(e=>String(e.chefMat) === String(q.chef));
    if (q.equipe){
      const eq = new Set(), file = [String(q.equipe)];
      /* 56.33.11 : index chef → équipe (un parcours de tout le personnel par membre de l'équipe auparavant) */
      const parChef = new Map(); emps.forEach(e=>{ const c = String(e.chefMat); if (!parChef.has(c)) parChef.set(c, []); parChef.get(c).push(e); });
      while (file.length){ const m = file.shift(); (parChef.get(m) || []).forEach(e=>{ if (!eq.has(String(e.mat))){ eq.add(String(e.mat)); file.push(String(e.mat)); } }); }
      l = l.filter(e=>eq.has(String(e.mat)));
    }
    if (q.q && q.q.length >= 2){
      /* recherche par mots, dans n'importe quel ordre : « khald », « 200 Khaldi Fethi », « Fethi Khaldi » */
      const mots = q.q.toLowerCase().split(/\s+/).filter(Boolean);
      l = l.filter(e=>{ const txt = (e.nom+" "+e.prenom+" "+e.mat).toLowerCase(); return mots.every(m=>txt.indexOf(m) >= 0); });
    }
    /* v49 : périmètre global sans filtre → aucune liste de matricules dans les requêtes (25 000 paramètres évités) */
    const global = P.set === null && !q.dept && !q.chef && !q.site && !q.equipe && !q.mat && !(q.q && q.q.length >= 2);
    return {emps:l, ref, global};
  }
  const ident = e => ({mat:e.mat, nom:e.nom, prenom:e.prenom, deptId:e.deptId, siteId:e.siteId, id:e.id});
  /* v49 : anomalies — comptes calculés en SQL, seule la page demandée est lue et décodée
     (auparavant : toutes les journées en anomalie de la période, soit ~35 000 lignes à 25 000 employés) */
  const CACHE_ANO = new Map(), CACHE_JT = new Map(), CACHE_ANOC = new Map();
  /* 56.33.11 : calcul unique partagé — des demandes identiques arrivées ensemble attendent le même résultat (100
     utilisateurs qui ouvrent l'accueil en même temps : une seule requête au lieu de 100) */
  const EN_VOL = new Map();
  function unique(cle, fn){ let p = EN_VOL.get(cle); if (!p){ p = fn(); EN_VOL.set(cle, p); const fin = () => { if (EN_VOL.get(cle) === p) EN_VOL.delete(cle); }; p.then(fin, fin); } return p; }
  async function anomalies(login, q){
    const off = Math.max(0, +q.offset||0), lim = Math.min(500, Math.max(1, +q.limit||40));
    const cle = login+"|"+[q.du, q.au, q.type||"", q.dept||"", q.chef||"", q.site||"", q.q||"", q.equipe||"", off, lim].join("|");
    const c0 = CACHE_ANO.get(cle);
    if (frais(c0, 60000)) return c0.r;
    return unique("ano|"+cle, ()=>anomaliesCalcul(login, q, cle, off, lim));
  }
  /* comptes par type d'anomalie : indépendants de la page et du type affiché (mis en cache à part) */
  async function compteAnomalies(login, q, sel){
    const cleC = login+"|"+[q.du, q.au, q.dept||"", q.chef||"", q.site||"", q.q||"", q.equipe||""].join("|"), cc = CACHE_ANOC.get(cleC);
    if (frais(cc, 60000)) return cc.compte;
    return unique("anoc|"+cleC, async ()=>{
      const m0 = marque(), {global, mats} = sel || await selection(login, q);
      if (!sel) await assurer(mats, q.du, q.au);
      const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
      const compte = await compteAnomaliesSql(f, q);
      if (!partiel()){ CACHE_ANOC.set(cleC, Object.assign(m0, {compte})); if (CACHE_ANOC.size > 300) CACHE_ANOC.clear(); }
      return compte;
    });
  }
  async function compteAnomaliesSql(f, q){
    const n = await B.get("SELECT SUM(CASE WHEN types LIKE '%oubli%' THEN 1 ELSE 0 END) oubli, SUM(CASE WHEN types LIKE '%retard%' THEN 1 ELSE 0 END) retard,"+
      " SUM(CASE WHEN types LIKE '%absence%' THEN 1 ELSE 0 END) absence, SUM(CASE WHEN types LIKE '%hs%' THEN 1 ELSE 0 END) hs, SUM(CASE WHEN types LIKE '%depart%' THEN 1 ELSE 0 END) depart"+
      " FROM calc_jour WHERE d>=? AND d<=? AND nano>0"+f.sql, q.du, q.au, ...f.a);
    const N = x => Number(x)||0;
    const compte = {oubli:N(n.oubli), retard:N(n.retard), absence:N(n.absence), hs:N(n.hs), depart:N(n.depart)};
    compte[""] = compte.oubli + compte.retard + compte.absence + compte.hs + compte.depart;
    return compte;
  }
  async function anomaliesCalcul(login, q, cle, off, lim){
    const m0 = marque();
    const {emps, global, mats, parMat} = await selection(login, q);
    await assurer(mats, q.du, q.au);
    const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
    const compte = Object.assign({}, await compteAnomalies(login, q, {global, mats}));
    /* ordre d'affichage : oublis, puis retards et absences, puis heures supplémentaires ; les plus récents d'abord */
    const groupes = q.type ? [[q.type]] : [["oubli"], ["retard","depart","absence"], ["hs"]];
    const total = groupes.reduce((s, g)=>s + g.reduce((x, ty)=>x + (compte[ty]||0), 0), 0);
    const items = []; let saut = off;
    for (const g of groupes){
      if (items.length >= lim) break;
      const nG = g.reduce((x, ty)=>x + (compte[ty]||0), 0);
      if (saut >= nG){ saut -= nG; continue; }
      const cond = "("+g.map(()=>"types LIKE ?").join(" OR ")+")";
      const lignes = await B.all("SELECT mat, d, anos, data FROM calc_jour WHERE d>=? AND d<=? AND nano>0 AND "+cond+f.sql+" ORDER BY d DESC, mat LIMIT "+(saut + lim - items.length + 5), q.du, q.au, ...g.map(ty=>"%"+ty+"%"), ...f.a);
      const l = [];
      lignes.forEach(r=>{ const data = JSON.parse(r.data||"{}"); JSON.parse(r.anos||"[]").forEach(x=>{ if (g.indexOf(x.type) >= 0) l.push(Object.assign({}, x, {mat:r.mat, k:r.d, mv:data.mv||[]})); }); });
      l.slice(saut, saut + lim - items.length).forEach(x=>items.push(Object.assign(x, {e:ident(parMat.get(x.mat)||{mat:x.mat})})));
      saut = 0;
    }
    const r = {compte, total, items, du:q.du, au:q.au, recalcul:partiel()};
    if (!r.recalcul){ CACHE_ANO.set(cle, Object.assign(m0, {r})); if (CACHE_ANO.size > 300) CACHE_ANO.clear(); }
    return r;
  }
  async function journees(login, q){
    const {emps, global, mats, parMat} = await selection(login, q);
    await assurer(mats, q.du, q.au);
    const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
    /* v49 : nombre total de journées gardé jusqu'au prochain changement (le parcours des pages ne le recompte pas) */
    const cleT = login+"|"+[q.du, q.au, q.dept||"", q.chef||"", q.site||"", q.q||"", q.equipe||"", q.mat||""].join("|"), cT = CACHE_JT.get(cleT);
    const mT = marque(), tot = frais(cT, 300000) ? cT.tot : await B.get("SELECT COUNT(*) n FROM calc_jour WHERE d>=? AND d<=?"+f.sql, q.du, q.au, ...f.a);
    if (!frais(cT, 300000)){ CACHE_JT.set(cleT, Object.assign(mT, {tot})); if (CACHE_JT.size > 300) CACHE_JT.clear(); }
    const off = Math.max(0, +q.offset||0), lim = Math.min(500, Math.max(1, +q.limit||100));
    const lignes = await B.all("SELECT mat, d, ht, hp, ret, hs, nano, types, data FROM calc_jour WHERE d>=? AND d<=?"+f.sql+" ORDER BY d DESC, mat LIMIT "+lim+" OFFSET "+off, q.du, q.au, ...f.a);
    return {total:Number(tot.n), offset:off, recalcul:EN_FOND.actif, items:lignes.map(r=>Object.assign({mat:r.mat, d:r.d, ht:r.ht, hp:r.hp, ret:r.ret, hs:r.hs, nano:Number(r.nano), types:r.types},
      JSON.parse(r.data||"{}"), {e:ident(parMat.get(r.mat)||{mat:r.mat})}))};
  }
  /* 56.33.11 : « Suivi des équipes & présences », onglet Pointages & présences, en grand effectif. L'écran calculait les
     statuts dans le navigateur, sur les seuls salariés chargés (une cinquantaine sur des milliers). Statut de chaque
     journée calculé en SQL depuis les journées calculées, mêmes règles que l'écran : congé (absence enregistrée, aucun
     badgeage), repos / férié / non planifié, incomplet (journée passée à badgeage manquant), retard, présent, absent.
     Comptes par statut sur toute la sélection ; seule la page demandée est lue. */
  async function presences(login, q){
    const a = auj();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) throw new Error("date du jour invalide");
    const {global, mats, parMat} = await selection(login, q);
    await assurer(mats, q.du, q.au);
    const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
    const ST = "CASE WHEN nmv = 0 AND data NOT LIKE '%\"abs\":\"\"%' THEN 'conge'"+
      " WHEN nmv = 0 AND (jid IS NULL OR jid IN ('repos','ferie','')) THEN 'repos'"+
      " WHEN nmv > 0 AND d < '"+a+"' AND (types LIKE '%oubli%' OR nmv % 2 = 1) THEN 'incomplet'"+
      " WHEN nmv > 0 AND reel = 1 AND ret > 0 THEN 'retard' WHEN nmv > 0 THEN 'present' ELSE 'absent' END";
    const base = "SELECT mat, d, hp, ret, data, "+ST+" AS st FROM calc_jour WHERE d>=? AND d<=?"+f.sql;
    const comptes = await B.all("SELECT st, COUNT(*) n FROM ("+base+") x GROUP BY st", q.du, q.au, ...f.a);
    const compte = {present:0, retard:0, incomplet:0, absent:0, conge:0, repos:0};
    comptes.forEach(r=>{ compte[r.st] = Number(r.n)||0; });
    const groupes = {present:["present","retard","incomplet"], retard:["retard"], absent:["absent"], conge:["conge"], incomplet:["incomplet"]};
    const garder = groupes[q.statut] || ["present","retard","incomplet","absent","conge"];
    const total = garder.reduce((x, k)=>x + (compte[k]||0), 0);
    const off = Math.max(0, +q.offset||0), lim = Math.min(500, Math.max(1, +q.limit||60));
    const rang = "CASE st WHEN 'absent' THEN 0 WHEN 'incomplet' THEN 1 WHEN 'retard' THEN 2 WHEN 'present' THEN 4 WHEN 'conge' THEN 5 ELSE 6 END";
    const lignes = await B.all("SELECT * FROM ("+base+") x WHERE st IN ("+garder.map(()=>"?").join(",")+") ORDER BY d DESC, "+rang+", mat LIMIT "+lim+" OFFSET "+off,
      q.du, q.au, ...f.a, ...garder);
    const champ = (e, code) => { let v = ""; ((e.hist||{})[code]||[]).slice().sort((x, y)=>String(x.d).localeCompare(String(y.d))).forEach(h=>{ if (String(h.d) <= a) v = h.v; }); return v; };
    return {compte, total, offset:off, recalcul:partiel(), items:lignes.map(r=>{ const e = parMat.get(String(r.mat)) || {mat:r.mat};
      return Object.assign(JSON.parse(r.data||"{}"), {mat:r.mat, d:r.d, hp:r.hp, ret:r.ret, st:r.st, e:Object.assign(ident(e), {grade:champ(e, "GRADE") || e.poste || ""})}); })};
  }
  const lundi = k => { const d = new Date(+k.slice(0,4), +k.slice(5,7)-1, +k.slice(8,10)); d.setDate(d.getDate() - (d.getDay()+6)%7); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  /* v56.14 : synthèse mise en cache (60 s, invalidée à chaque recalcul) : ~800 ms → quelques ms à 20 000 salariés */
  const CACHE_SY = new Map();
  async function synthese(login, q){
    const cleS = login+"|"+JSON.stringify(q), cs = CACHE_SY.get(cleS);
    if (frais(cs, 60000)) return cs.r;
    return unique("sy|"+cleS, async ()=>{ const m0 = marque(), r0 = await syntheseCalcul(login, q);
    CACHE_SY.set(cleS, Object.assign(m0, {r:r0})); if (CACHE_SY.size > 200) CACHE_SY.clear();
    return r0; });
  }
  async function syntheseCalcul(login, q){
    const {emps, global} = await selection(login, q);
    emps.sort((a,b)=>COLL.compare(String(a.mat), String(b.mat)));
    const off = Math.max(0, +q.offset||0), lim = Math.min(300, Math.max(1, +q.limit||50));
    const page = emps.slice(off, off+lim), mats = page.map(e=>String(e.mat));
    await assurer(mats, q.du, q.au);
    const f = D.filtreMat(new Set(mats));
    const lignes = await B.all("SELECT mat, d, ht, hp, hs, types, data FROM calc_jour WHERE d>=? AND d<=?"+f.sql, q.du, q.au, ...f.a);
    const cle = k => q.gran === "mois" ? k.slice(0,7) : q.gran === "periode" ? "P" : lundi(k);
    const grp = new Map();
    lignes.forEach(r=>{
      const g = r.mat+"|"+cle(r.d); let o = grp.get(g);
      if (!o){ o = {mat:r.mat, du:r.d, au:r.d, prevu:0, fait:0, absH:0, absJ:0, jours:0, hsMin:0, inc:0}; grp.set(g, o); }
      /* registre, onglet hebdomadaire : dépassements journaliers (minutes) et journées incomplètes */
      if (r.hs > 0) o.hsMin += r.hs; if (String(r.types||"").indexOf("oubli") >= 0) o.inc++;
      if (r.d < o.du) o.du = r.d; if (r.d > o.au) o.au = r.d;
      const data = JSON.parse(r.data||"{}");
      o.prevu += r.ht || 0; if (data.reel && r.hp) { o.fait += r.hp; if (r.hp > 0) o.jours++; }
      if (data.abs && r.ht > 0){ o.absH += r.ht; o.absJ++; }
    });
    const parMat = new Map(page.map(e=>[String(e.mat), e]));
    const items = Array.from(grp.values()).map(o=>Object.assign(o, {ecart:o.fait - (o.prevu - o.absH), taux:o.prevu > 0 ? Math.round(100*o.fait/o.prevu) : null, e:ident(parMat.get(o.mat))}))
      .sort((a,b)=>a.du === b.du ? COLL.compare(String(a.mat), String(b.mat)) : (a.du < b.du ? 1 : -1));
    return {total:emps.length, offset:off, limit:lim, items};
  }
  const CACHE_AC = new Map();
  async function accueil(login){
    const c = CACHE_AC.get(login); if (frais(c, 60000) && c.jour === auj()) return c.r;
    return unique("ac|"+login, async ()=>{ const m0 = marque(), r = await accueilCalcul(login);
      if (!r.recalcul){ CACHE_AC.set(login, Object.assign(m0, {r, jour:auj()})); if (CACHE_AC.size > 500) CACHE_AC.clear(); }
      return r; });
  }
  async function accueilCalcul(login){
    const a = auj(), du = ajout(a, -7);
    const r = {compte:await compteAnomalies(login, {du, au:a})};
    const {emps, global, mats} = await selection(login, {});
    try { await assurer(mats, a, a); } catch(e){}
    const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(emps.map(e=>String(e.mat))));
    const pres = await B.get("SELECT COUNT(*) n FROM calc_jour WHERE d=? AND hp>0"+f.sql, a, ...f.a);
    const att = await B.get("SELECT COUNT(*) n FROM calc_jour WHERE d=? AND ht>0"+f.sql, a, ...f.a);
    return {anomalies:r.compte, presents:Number(pres.n), attendus:Number(att.n), effectif:emps.length, recalcul:partiel()};
  }
  /* v47 : pré-audit calculé en SQL (colonnes nmv, jid, reel, hsmin) : plus de lecture ligne à ligne */
  const CACHE_PA = new Map();
  async function preaudit(login, q){
    const clePA = login+"|"+q.du+"|"+q.au+"|"+(q.site||"");
    const cp = CACHE_PA.get(clePA);
    if (frais(cp, 300000)) return cp.r;
    const m0 = marque(), r0 = await preauditCalcul(login, q);
    CACHE_PA.set(clePA, Object.assign(m0, {r:r0})); if (CACHE_PA.size > 100) CACHE_PA.clear();
    return r0;
  }
  async function preauditCalcul(login, q){
    const {emps, global} = await selection(login, q);
    const mats = emps.map(e=>String(e.mat));
    await assurer(mats, q.du, q.au);
    const f = global ? {sql:"", a:[]} : D.filtreMat(new Set(mats));
    const prevu = "(nmv > 0 OR (jid NOT IN ('repos','ferie') AND jid <> '' AND ht > 0))";
    const r = await B.get("SELECT SUM(CASE WHEN "+prevu+" THEN 1 ELSE 0 END) prevus, SUM(CASE WHEN "+prevu+" AND nano = 0 THEN 1 ELSE 0 END) conformes,"+
      " SUM(CASE WHEN "+prevu+" AND reel = 1 AND hp > ht THEN (hp - ht) * 60 ELSE 0 END) hsdet, SUM(COALESCE(hsmin, 0)) hsatt,"+
      " SUM(CASE WHEN types LIKE '%oubli%' THEN 1 ELSE 0 END) oubli, SUM(CASE WHEN types LIKE '%retard%' THEN 1 ELSE 0 END) retard,"+
      " SUM(CASE WHEN types LIKE '%absence%' THEN 1 ELSE 0 END) absence, SUM(CASE WHEN types LIKE '%hs%' THEN 1 ELSE 0 END) hs, SUM(CASE WHEN types LIKE '%depart%' THEN 1 ELSE 0 END) depart"+
      ", COUNT(DISTINCT CASE WHEN nmv > 0 THEN mat END) presents FROM calc_jour WHERE d>=? AND d<=?"+f.sql, q.du, q.au, ...f.a);
    const pres = {n:r.presents};                                       /* v56.3 : une seule lecture des journées */
    const att = await B.all("SELECT data FROM enreg WHERE coll='corrections' AND d>=? AND d<=?"+f.sql, q.du, q.au, ...f.a);
    const attente = att.filter(x=>{ try { return JSON.parse(x.data).statut === "attente"; } catch(e){ return false; } }).length;
    const N = v => Number(v)||0;
    return {total:emps.length, presents:N(pres.n), prevus:N(r.prevus), conformes:N(r.conformes), hsDet:Math.round(N(r.hsdet)), hsAtt:N(r.hsatt),
      n:{oubli:N(r.oubli), retard:N(r.retard), absence:N(r.absence), hs:N(r.hs), depart:N(r.depart)}, attente};
  }
  /* contenu d'une période clôturée : mêmes champs et même ordre que l'application (empreinte SHA-256 identique) */
  async function contenuPeriode(du, au){
    const ref = await D.referentiel() || {};
    const ptg = (await B.all("SELECT data FROM enreg WHERE coll='ptg' AND d>=? AND d<=?", du, au)).map(r=>{ const m = JSON.parse(r.data); return [m.mat||"", String(m.ts), m.sens||"", m.dev||"", m.src||"", m.corr ? 1 : 0]; })
      .sort((a,b)=>a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
    const dec = ref.anoDec || {};
    const dans = k => k >= du && k <= au;
    const decisions = Object.keys(dec).filter(id=>dans(String(id.split("|")[2]||""))).sort().map(id=>[id, dec[id].dec||"", dec[id].min||0]);
    const absences = (await B.all("SELECT data FROM enreg WHERE coll='abs' AND d>=? AND d<=?", du, au)).map(r=>{ const a = JSON.parse(r.data); return [a.mat||"", a.d||a.du||"", a.au||"", a.tt||""]; })
      .filter(x=>dans(String(x[1]))).sort();
    return {du, au, ptg, decisions, absences};
  }
  /* 56.33.11 : export réparti sur tous les fils de calcul (tranches de 2 000 salariés, multiples des lots de 500 du
     moteur : fichier identique), en priorité « fond » pour ne pas ralentir les écrans. Auparavant un seul fil
     calculait tout le personnel, lot après lot. */
  async function etat(login, def, du, au, filtres, avancement){
    const {emps} = await selection(login, filtres || {});
    const mats = emps.map(e=>String(e.mat)), T = 2000;
    if (mats.length <= T) return tache({type:"etat", def, mats, du, au}, avancement);
    const parts = []; for (let i = 0; i < mats.length; i += T) parts.push(mats.slice(i, i + T));
    const fait = parts.map(()=>0);
    const res = await Promise.all(parts.map((p, k)=>tache({type:"etat", def, mats:p, du, au}, a=>{ fait[k] = a.fait; if (avancement) avancement({fait:fait.reduce((x, y)=>x + y, 0), total:mats.length}); }, true)
      .then(txt=>{ fait[k] = p.length; return txt; })));
    let entete = null; const corps = [];
    res.forEach(txt=>{ const l = String(txt).replace(/^\uFEFF/, "").split("\r\n").filter(Boolean); if (entete === null && l.length) entete = l[0]; corps.push(...l.slice(1)); });
    return "\uFEFF"+[entete || ""].concat(corps).join("\r\n");
  }
  /* file d'attente des calculs (observabilité) */
  function charge(){ return {fils:fils.filter(f=>f && f.w).length, enCours:fils.reduce((s, f)=>s + ((f && f.charge) || 0), 0), fondEnFile:FILE_FOND.length}; }
  /* précalcul en tâche de fond : les 45 derniers jours de tout le personnel */
  async function precalculer(){
    const emps = await D.employes(); if (!emps.length) return 0;
    const a = auj();
    return assurer(emps.map(e=>String(e.mat)), ajout(a, -45), a);
  }
  /* v53 : compteurs par salarié et comparaison des sources, par lots, en arrière-plan */
  async function compteursPeriode(mats, du, au, avancement, reglesSim){
    const out = {}; for (let i = 0; i < mats.length; i += 200){ Object.assign(out, await tache({type:"compteurs", mats:mats.slice(i, i+200), du, au, reglesSim:reglesSim || null})); if (avancement) avancement(Math.min(mats.length, i+200), mats.length); }
    return out;
  }
  async function comparer(mats, du, au){
    const t = {projection:0, normalises:0, ecarts:0, exemples:[]};
    for (let i = 0; i < mats.length; i += 1000){ const r = await tache({type:"comparer", mats:mats.slice(i, i+1000), du, au});
      t.projection += r.projection; t.normalises += r.normalises; t.ecarts += r.ecarts; t.exemples = t.exemples.concat(r.exemples).slice(0, 20); }
    return t;
  }
  /* v56.3 : préchauffage après le calcul d'avance — les premiers écrans du matin (accueil, anomalies, journées, synthèse,
     pré-audit) sont servis depuis les caches et la mémoire de la base au lieu de payer le premier accès */
  async function prechauffer(logins){
    const a = auj(), j = k => ajout(a, k), t0 = Date.now(); let n = 0;
    for (const login of (logins || []).slice(0, 5)){
      for (const [f, q] of [[anomalies, {du:j(-7), au:a, limit:50}], [journees, {du:j(-30), au:a, limit:100}], [synthese, {du:j(-30), au:a, gran:"semaine", limit:50}],
                            [preaudit, {du:j(-30), au:a}], [accueil, {}]]){ try { await f(login, q); n++; } catch(e){} }
    }
    return {requetes:n, ms:Date.now() - t0};
  }
  return {recalculEnCours:()=>EN_FOND.actif, prechauffer, compteursPeriode, comparer, setWorkflow(w){ WF = w; }, generation:()=>GENERATION+"."+GEN_P, cacheFrais:frais, cacheMarque:marque, charge, assurer, invalider, anomalies, journees, synthese, accueil, presences, etat, precalculer, preaudit, contenuPeriode, arreter(){ fils.forEach(f=>{ if (f && f.w) f.w.terminate(); }); }};
}
module.exports = {creer};
