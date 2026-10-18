/* FIWAKTI — communication avec les pointeuses (v44).
   - Pilotes intégrés : ZKTeco natif (TCP 4370), ZKTeco Push/ADMS (HTTP), Hikvision
     ISAPI, Suprema BioStar 2 (REST).
   - Emplacement pour d'autres SDK : dossier donnees/pilotes/ (conservé lors des mises
     à jour). Deux formes :
       <nom>/index.js      pilote JavaScript (même interface que les pilotes intégrés)
       <nom>/pilote.json   pilote externe : un programme (exe, script) fourni avec le SDK
                           du constructeur, appelé avec une requête JSON sur l'entrée
                           standard et qui répond en JSON sur la sortie standard.
   - Les secrets (mots de passe, clés de communication) restent sur le serveur. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { spawn } = require("child_process");
const ACCES = require("./acces.js");
const ACTIONS = ["diagnostic","info","collecte","utilisateurs-lire","utilisateurs-envoyer","nettoyage","synchro-heure","redemarrer","effacer-commandes","visages-lire","visages-envoyer","utilisateurs-retirer"];

function creer(o){
  const {B, D, meta, audit, journal, dossierPilotes, invalider, coffre} = o;
  const config = o.config || (()=>({}));
  const INTEGRES = ["zk","zk-push","hikvision","biostar2","sagem"].map(n=>require("./pilotes/"+n+".js"));
  let pilotes = {};
  /* ---------- chargement des pilotes ---------- */
  function charger(){
    const p = {}; const erreurs = []; const attente = [];
    INTEGRES.forEach(x=>{ p[x.id] = Object.assign({origine:"intégré"}, x); });
    try { fs.mkdirSync(dossierPilotes, {recursive:true}); } catch(e){}
    let dossiers = []; try { dossiers = fs.readdirSync(dossierPilotes, {withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name); } catch(e){}
    for (const nom of dossiers){
      const rep = path.join(dossierPilotes, nom);
      try {
        const emp = empreinteDossier(rep);
        const idDecl = fs.existsSync(path.join(rep, "pilote.json")) ? (JSON.parse(fs.readFileSync(path.join(rep, "pilote.json"), "utf8")).id || nom) : nom;
        const ap = APPROUVES[idDecl];
        if (!ap || ap.empreinte !== emp || ap.desactive){
          attente.push({id:idDecl, dossier:nom, empreinte:emp.slice(0,16), statut:ap && ap.desactive ? "desactive" : (ap ? "modifie" : "a_approuver")});
          continue;
        }
        if (fs.existsSync(path.join(rep, "index.js"))){
          delete require.cache[require.resolve(path.join(rep, "index.js"))];
          const m = require(path.join(rep, "index.js"));
          if (!m.id || typeof m.executer !== "function") throw new Error("index.js doit exporter id et executer()");
          p[m.id] = Object.assign({origine:"dossier "+nom, empreinte:empreinte(path.join(rep, "index.js"))}, m);
        } else if (fs.existsSync(path.join(rep, "pilote.json"))){
          const cfg = JSON.parse(fs.readFileSync(path.join(rep, "pilote.json"), "utf8"));
          if (!cfg.id || !cfg.commande) throw new Error("pilote.json doit contenir id et commande");
          p[cfg.id] = externe(cfg, rep);
        }
      } catch(e){ erreurs.push(nom+" : "+e.message); journal("pilote "+nom+" : "+e.message); }
    }
    pilotes = p; ATTENTE = attente;
    if (attente.length) journal("pilotes en attente d'approbation : "+attente.map(x=>x.id+" ("+x.statut+")").join(", "));
    return {nb:Object.keys(p).length, erreurs, attente};
  }
  function empreinte(f){ try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0,16); } catch(e){ return ""; } }
  function empreinteDossier(rep){
    const h = crypto.createHash("sha256");
    const parcourir = d => fs.readdirSync(d, {withFileTypes:true}).sort((a,b)=>a.name < b.name ? -1 : 1).forEach(x=>{
      const f = path.join(d, x.name);
      if (x.isDirectory()) parcourir(f); else { h.update(path.relative(rep, f)); h.update(fs.readFileSync(f)); }
    });
    parcourir(rep);
    return h.digest("hex");
  }
  /* v46 : un pilote déposé dans donnees/pilotes n'est utilisable qu'après approbation par un
     administrateur ; toute modification de ses fichiers le suspend jusqu'à nouvelle approbation */
  let APPROUVES = {};
  /* v47 : chaque approbation est scellée (HMAC-SHA256, clé conservée hors de la base) :
     une approbation insérée ou modifiée directement dans la base n'est pas reconnue */
  const sceller = (id, a) => crypto.createHmac("sha256", coffre.cle("pilotes")).update([id, a.empreinte||"", a.par||"", a.le||"", a.desactive ? "1" : "0"].join("|")).digest("hex");
  async function chargerApprobations(){
    const brut = (await meta("pilotes_approuves")) || {};
    APPROUVES = {};
    Object.keys(brut).forEach(id=>{ const a = brut[id]; if (a && a.sceau && a.sceau === sceller(id, a)) APPROUVES[id] = a; else journal("approbation de pilote non valide (sceau absent ou incorrect) : "+id); });
  }
  /* pilote externe : un processus par action, échange JSON */
  function externe(cfg, rep){
    return {id:cfg.id, nom:cfg.nom || cfg.id, marques:cfg.marques || [], modeles:cfg.modeles || "", capacites:cfg.capacites || ACTIONS,
      champs:cfg.champs || [{k:"mdp", l:"Mot de passe / clé", secret:true}], origine:"externe ("+path.basename(rep)+")", empreinte:empreinte(path.join(rep, "pilote.json")),
      async executer(action, T, S, ctx){
        /* 56.33.11 : le pilote externe ne doit jamais effacer l'appareil lui-même (FIWAKTI n'a pas encore enregistré) */
        const req = {version:1, action, terminal:T, secret:S||{}, options:Object.assign({}, ctx.options||{}, action === "collecte" ? {purgeInterdite:true} : {}), depuis:ctx.depuis(T), utilisateurs:action === "utilisateurs-envoyer" ? await ctx.utilisateursPour(T) : undefined};
        const rep2 = await new Promise((ok, ko)=>{
          const decouper = t => { const o = []; String(t).replace(/"([^"]*)"|'([^']*)'|(\S+)/g, (_, a, b, c)=>{ o.push(a !== undefined ? a : b !== undefined ? b : c); }); return o; };
          let [prog, ...args] = Array.isArray(cfg.commande) ? cfg.commande.map(String) : decouper(cfg.commande);
          if (!prog || /[\0\n\r]/.test(prog + args.join(""))) return ko(new Error("Commande du pilote invalide."));
          /* Linux : ressources limitées si « prlimit » est disponible (mémoire, temps processeur, fichiers) */
          if (process.platform === "linux" && fs.existsSync("/usr/bin/prlimit")){
            /* limite mémoire seulement si le pilote la déclare (memoireMo) : un pilote écrit en Node.js ou en Java réserve
               beaucoup de mémoire virtuelle au démarrage et ne supporterait pas une limite par défaut */
            const lim = ["--cpu="+(Number(cfg.delai)||60), "--nofile=256", "--nproc=64"];
            if (Number(cfg.memoireMo) > 0) lim.unshift("--as="+(Number(cfg.memoireMo)*1024*1024));
            args = lim.concat(["--", prog]).concat(args); prog = "/usr/bin/prlimit";
          }
          const env = {PATH:process.env.PATH || "", SystemRoot:process.env.SystemRoot || "", TEMP:process.env.TEMP || process.env.TMPDIR || "", TMPDIR:process.env.TMPDIR || "", LANG:"fr_FR.UTF-8"};
          const p = spawn(prog, args, {cwd:rep, windowsHide:true, env});
          let out = "", err = ""; const t = setTimeout(()=>{ p.kill(); ko(new Error("Le pilote externe n'a pas répondu en "+(cfg.delai||60)+" s.")); }, (cfg.delai||60)*1000);
          p.stdout.on("data", d=>{ out += d; if (out.length > 10e6){ p.kill("SIGKILL"); ko(new Error("Réponse du pilote trop volumineuse (plus de 10 Mo).")); } }); p.stderr.on("data", d=>{ if (err.length < 64e3) err += d; });
          p.on("error", e=>{ clearTimeout(t); ko(new Error("Pilote externe introuvable ou non exécutable : "+e.message)); });
          p.on("close", code=>{ clearTimeout(t);
            try { const j = JSON.parse(out.trim().split("\n").pop()); ok(j); } catch(e){ ko(new Error("Réponse illisible du pilote externe (code "+code+") "+err.slice(0,200))); } });
          p.stdin.end(JSON.stringify(req));
        });
        if (rep2.ok === false) throw new Error(rep2.erreur || "Échec du pilote externe.");
        if (action === "collecte" && Array.isArray(rep2.pointages)){
          if (rep2.purge){ journal("pilote externe "+cfg.id+" : l'appareil "+(T.nom||T.id)+" a été effacé par le pilote lui-même, avant l'enregistrement par FIWAKTI");
            await audit("systeme", "pointeuse.purge_par_pilote", (T.nom||T.id)+" — "+rep2.pointages.length+" badgeage(s), purge faite par le pilote externe "+cfg.id); }
          const arch = ctx.archiver ? await ctx.archiver(rep2.pointages, {complet:!!rep2.purge}) : null;   /* 56.33.11 : appareil effacé → copie complète */
          return Object.assign({lus:rep2.pointages.length, purge:!!rep2.purge, purgeDemandee:false, archive:arch ? path.basename(arch.fichier) : null}, await ctx.integrer(rep2.pointages));
        }
        return rep2;
      }};
  }
  let ATTENTE = [];
  chargerApprobations().then(()=>charger()).catch(()=>charger());
  async function approuver(id, login, desactiver){
    const a = ATTENTE.find(x=>x.id === id) || null;
    const rep = a ? path.join(dossierPilotes, a.dossier) : null;
    let version = "";
    if (desactiver){ APPROUVES[id] = Object.assign({}, APPROUVES[id]||{}, {desactive:true, par:login, le:new Date().toISOString()}); }
    else {
      if (!rep) throw new Error("Pilote introuvable ou déjà approuvé.");
      try { version = JSON.parse(fs.readFileSync(path.join(rep, "pilote.json"), "utf8")).version || ""; } catch(e){}
      APPROUVES[id] = {empreinte:empreinteDossier(rep), par:login, le:new Date().toISOString(), version};
    }
    APPROUVES[id].sceau = sceller(id, APPROUVES[id]);
    await meta("pilotes_approuves", APPROUVES);
    await audit(login, desactiver ? "pilote.desactive" : "pilote.approuve", id+(version ? " version "+version : "")+(APPROUVES[id].empreinte ? " — empreinte SHA-256 "+APPROUVES[id].empreinte : ""));
    return charger();
  }

  /* ---------- appareils et secrets ---------- */
  async function terminal(id){ const ref = await D.referentielLecture() || {}; return (ref.terms||[]).find(x=>x.id === id) || null; }
  /* v45 : les accès (mots de passe, clés) sont chiffrés avec une clé conservée hors de la base :
     une sauvegarde volée ne les livre pas */
  /* 56.33.11 : accès chiffrés avec une autre clé « secrets » (données reprises d'une autre installation sans son
     trousseau) : au lieu d'une erreur de déchiffrement sur chaque appareil — et d'un enregistrement impossible —, le bloc
     illisible est mis de côté (récupérable en important le trousseau d'origine) et les identifiants peuvent être ressaisis */
  let ILLISIBLES = false;
  async function secrets(){
    const v = await meta("pointeuses_secrets");
    if (!v){ ILLISIBLES = false; return {}; }
    if (v.chiffre){
      try { const r = JSON.parse(coffre.dechiffrerTexte(v.chiffre, "secrets")); ILLISIBLES = false; return r; }
      catch(e){
        if (!ILLISIBLES){ ILLISIBLES = true;
          if (!(await meta("pointeuses_secrets_illisibles"))) await meta("pointeuses_secrets_illisibles", {chiffre:v.chiffre, le:new Date().toISOString()});
          await audit("systeme", "pointeuse.secrets.illisibles", "identifiants des appareils chiffrés avec une autre clé : à ressaisir, ou importer le trousseau d'origine"); }
        return {};
      }
    }
    await meta("pointeuses_secrets", {chiffre:coffre.chiffrerTexte(JSON.stringify(v), "secrets")});   /* ancien format en clair : chiffré au passage */
    return v;
  }
  async function secret(id){ const s = await secrets(); return s[id] || (ILLISIBLES ? {_illisible:true} : {}); }
  async function enregistrerSecret(id, valeurs){ const s = await secrets(); s[id] = Object.assign({}, s[id]||{}, valeurs); await meta("pointeuses_secrets", {chiffre:coffre.chiffrerTexte(JSON.stringify(s), "secrets")}); }
  function piloteDe(T){
    if (T.pilote && pilotes[T.pilote]) return pilotes[T.pilote];
    const m = String(T.modele||"").toLowerCase();
    if (/speedface|proface x|adms|push/.test(m)) return pilotes["zk-push"];
    if (/zk|iclock|k40|mb4|mb2|uface|inbio/.test(m)) return pilotes.zk;
    if (/hik|ds-k/.test(m)) return pilotes.hikvision;
    if (/suprema|biostation|bioentry|facestation|biostar|x-station/.test(m)) return pilotes.biostar2;
    return null;
  }
  const pad = n => String(n).padStart(2, "0");
  const horo = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());

  /* ---------- rattachement badge → employé ---------- */
  async function correspondance(T){
    const emps = await D.employes(), mode = T.identifiantAppareil || "mat";
    const m = new Map();
    emps.forEach(e=>{ const k = String(mode === "badge" ? (e.badge||"") : mode === "pin" ? (e.pin||"") : e.mat).trim(); if (k) m.set(k, e); if (mode !== "mat") m.set("mat:"+e.mat, e); });
    return {m, emps};
  }
  /* v50 : badgeages reçus d'un appareil → file d'ingestion → événement brut immuable → événement normalisé.
     Plus aucun badgeage existant n'est réécrit (auparavant, le sens des badgeages de la journée était recalculé). */
  /* 56.33.11 : copie de sauvegarde sur le serveur des badgeages lus sur un appareil, AVANT intégration et avant toute
     purge : donnees/archives-pointeuses/<appareil>/<AAAA-MM>/<horodatage>.fwa — JSON compressé puis chiffré
     (AES-256-GCM, clé des sauvegardes : lisible après une reprise sur une autre machine), empreinte SHA-256, écriture
     forcée sur le disque. Un échec d'archivage interdit la purge. */
  const D_ARCH = path.join(path.dirname(dossierPilotes), "archives-pointeuses");
  async function archiver(T, lignes){
    const zlib = require("zlib"), maintenant = new Date(), mois = maintenant.toISOString().slice(0, 7);
    const dossier = path.join(D_ARCH, String(T.id).replace(/[^A-Za-z0-9_-]/g, "_"), mois);
    fs.mkdirSync(dossier, {recursive:true, mode:0o700});
    const json = JSON.stringify({format:"fiwakti-archive-pointeuse-1", terminal:{id:T.id, nom:T.nom, sn:T.sn || null}, lu:maintenant.toISOString(), n:lignes.length, lignes});
    const sha256 = crypto.createHash("sha256").update(json).digest("hex");
    const contenu = JSON.stringify({sha256, donnees:coffre.chiffrerTexte(zlib.gzipSync(json).toString("base64"), "sauvegarde")});
    const fichier = path.join(dossier, maintenant.toISOString().replace(/[:.]/g, "-")+"-"+crypto.randomBytes(3).toString("hex")+".fwa");
    const fd = fs.openSync(fichier, "wx", 0o600);
    try { fs.writeSync(fd, contenu); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return {fichier, sha256, n:lignes.length};
  }
  /* 56.33.11 : copie incrémentale. Sans purge, l'appareil garde tout son journal et chaque collecte le relit en entier :
     tout était archivé de nouveau dans un nouveau .fwa à chaque collecte automatique (≈ 60 Mo par jour et par appareil).
     Seuls les badgeages postérieurs au plus récent déjà archivé pour cet appareil (même seconde : identifiant pas encore
     vu) sont copiés ; repère conservé dans meta (« archive_pointeuse:<id> »). Copie complète quand l'appareil est
     effacé (purge) ; les badgeages restent de toute façon dans raw_events. */
  const cleArch = b => String(b.utilisateur)+"|"+String(b.horodatage);
  async function archiverNouveaux(T, lignes, complet){
    const k = "archive_pointeuse:"+T.id, m = (await meta(k)) || {}, max = String(m.max || ""), vus = new Set(m.cles || []);
    const l = complet ? lignes : lignes.filter(b=>{ const h = String(b.horodatage || ""); return !h || h > max || (h === max && !vus.has(cleArch(b))); });
    if (!l.length) return null;
    const r = await archiver(T, l);
    let nmax = max; l.forEach(b=>{ const h = String(b.horodatage || ""); if (h > nmax) nmax = h; });
    const cles = new Set(nmax === max ? vus : []); l.forEach(b=>{ if (String(b.horodatage || "") === nmax) cles.add(cleArch(b)); });
    try { await meta(k, {max:nmax, cles:Array.from(cles).slice(-1000)}); } catch(e){}
    return r;
  }
  /* relecture d'une archive (contrôle, réintégration) */
  function lireArchive(fichier){
    const zlib = require("zlib"), o = JSON.parse(fs.readFileSync(fichier, "utf8"));
    const json = zlib.gunzipSync(Buffer.from(coffre.dechiffrerTexte(o.donnees, "sauvegarde"), "base64")).toString("utf8");
    if (crypto.createHash("sha256").update(json).digest("hex") !== o.sha256) throw new Error("Archive altérée : empreinte différente.");
    return JSON.parse(json);
  }
  /* conservation des archives : supprimées au-delà de la durée de conservation des badgeages (mois entiers) */
  function purgerArchives(ans){
    const lim = new Date(); lim.setFullYear(lim.getFullYear() - Math.max(1, Number(ans) || 5)); const limMois = lim.toISOString().slice(0, 7);
    let n = 0; if (!fs.existsSync(D_ARCH)) return 0;
    for (const t of fs.readdirSync(D_ARCH)) for (const m of fs.readdirSync(path.join(D_ARCH, t))) if (/^\d{4}-\d{2}$/.test(m) && m < limMois){ fs.rmSync(path.join(D_ARCH, t, m), {recursive:true, force:true}); n++; }
    return n;
  }
  async function integrer(T, liste, source){
    if (!o.ingestion) throw new Error("ingestion indisponible");
    const src = source || (T && T.pilote === "zk-push" ? "push" : "collecte");
    const r = await o.ingestion.recevoir(src, T, liste.map(b=>({utilisateur:b.utilisateur, horodatage:b.horodatage, sens:b.sens || "", badge:b.badge, source_event_id:b.source_event_id,
      payload:b.payload != null ? b.payload : {utilisateur:b.utilisateur, horodatage:b.horodatage, sens:b.sens, pilote:T && T.pilote}})));
    return Object.assign({ok:true}, r);
  }
  /* utilisateurs à envoyer : employés rattachés à l'appareil, sinon ceux de son site */
  /* v56.24 : identifiant d'un salarié sur l'appareil (matricule, badge ou code selon la fiche de l'appareil) */
  const idSurAppareil = (T, e) => { const mode = T.identifiantAppareil || "mat"; return String(mode === "badge" ? (e.badge||e.mat) : mode === "pin" ? (e.pin||e.mat) : e.mat); };
  /* v56.30 (§ 5) : contrôle de correspondance — lit les utilisateurs du terminal et signale les identifiants inconnus de
     FIWAKTI, les salariés sans badge / sans code quand le mode l'exige (repli sur le matricule), les doublons et les
     salariés attendus absents du terminal. Lecture seule : rien n'est modifié sur l'appareil. */
  async function verifierIdentifiants(id, login){
    const T = await terminal(id); if (!T) throw Object.assign(new Error("Terminal inconnu."), {code:404});
    const r = await executer("utilisateurs-lire", id, {}, login), mode = T.identifiantAppareil || "mat";
    const surApp = (r.utilisateurs||[]).map(u=>String(u.id)), {emps} = await correspondance(T), auj = horo(new Date()).slice(0,10);
    const actifs = emps.filter(e=>!(e.sortie && e.sortie < auj)), parId = new Map();
    actifs.forEach(e=>{ const k = idSurAppareil(T, e); (parId.get(k) || parId.set(k, []).get(k)).push(String(e.mat)); });
    const vus = new Map(); surApp.forEach(x=>vus.set(x, (vus.get(x)||0) + 1));
    const attendus = (await utilisateursPour(T, null)).map(u=>u.id);
    const L = a => a.slice(0, 200);
    return {terminal:T.nom||T.id, mode, lus:surApp.length,
      inconnus:L(surApp.filter(x=>!parId.has(x))),
      sansIdentifiant:mode === "mat" ? [] : L(actifs.filter(e=>!(mode === "badge" ? e.badge : e.pin) && attendus.indexOf(String(e.mat)) >= 0).map(e=>String(e.mat))),
      doublons:L(Array.from(parId.entries()).filter(([k, l])=>l.length > 1).map(([k, l])=>k+" → "+l.join(", ")).concat(Array.from(vus.entries()).filter(([k, n])=>n > 1).map(([k, n])=>k+" ×"+n))),
      absents:L(attendus.filter(x=>!vus.has(x)))};
  }
  async function utilisateursPour(T, mats){
    const {emps} = await correspondance(T), mode = T.identifiantAppareil || "mat", auj = horo(new Date()).slice(0,10);
    /* v56.24 : salariés au blocage biométrique actif (absence, mise à pied…) exclus de TOUS les appareils (pointage et
       accès), y compris pour un envoi manuel ; sous-ensemble ciblé (synchronisation différentielle) si demandé */
    const bloques = o.bloques ? o.bloques() : null, sous = mats ? new Set(mats.map(String)) : null;
    const rat = emps.filter(e=>(e.rds||[]).indexOf(T.id) >= 0);
    /* correctif 5 : lecteur de porte rattaché à une zone → seuls les salariés autorisés dans cette zone aujourd'hui (avant : tout le site) */
    const AC = ACCES.contexte(await D.referentielLecture() || {});
    const l = (rat.length ? rat : emps.filter(e=>!T.siteId || e.siteId === T.siteId)).filter(e=>!(e.sortie && e.sortie < auj) && !(bloques && bloques.has(String(e.mat))) && !(sous && !sous.has(String(e.mat))) && AC.admis(e, T, auj));
    return l.map(e=>({id:String(mode === "badge" ? (e.badge||e.mat) : mode === "pin" ? (e.pin||e.mat) : e.mat), nom:((e.prenom||"")+" "+(e.nom||"")).trim(), carte:e.badge||"", pin:""}));
  }
  /* ---------- v56.5 : visages ---------- */
  async function visageRecu(T, utilisateur, format, octets, indice){
    if (!o.visages) return {ok:false};
    const {m} = await correspondance(T), e = m.get(String(utilisateur).trim()) || m.get("mat:"+String(utilisateur).trim());
    if (!e) return {ok:false, inconnu:true};
    const r = await o.visages.enregistrer(e.mat, format, octets, T.id, indice);
    /* v56.24 : visage nouveau ou modifié → diffusion automatique aux autres appareils du périmètre (si activée) */
    if (r && r.ok && !r.inchange && o.surVisage) o.surVisage(e.mat, T.id).catch(()=>{});
    return r;
  }
  async function visagesPour(T, formats, mats){
    if (!o.visages) return [];
    const {emps} = await correspondance(T), mode = T.identifiantAppareil || "mat", l = await utilisateursPour(T, mats);
    const parId = new Map(l.map(u=>[String(u.id), u])), matVersId = new Map();
    emps.forEach(e=>{ const id = String(mode === "badge" ? (e.badge||e.mat) : mode === "pin" ? (e.pin||e.mat) : e.mat); if (parId.has(id)) matVersId.set(String(e.mat), id); });
    return (await o.visages.pour(Array.from(matVersId.keys()), formats)).map(v=>Object.assign(v, {id:matVersId.get(v.mat), nom:(parId.get(matVersId.get(v.mat))||{}).nom || ""}));
  }
  /* ---------- protocole Push (ADMS) ---------- */
  const PUSH = {};
  async function etatPushCharger(){ Object.assign(PUSH, (await meta("pointeuses_push")) || {}); }
  let sauvePush = null;
  function persisterPush(){ if (sauvePush) return; sauvePush = setTimeout(()=>{ sauvePush = null; meta("pointeuses_push", PUSH).catch(()=>{}); }, 2000); }
  /* 56.33.11 : écriture immédiate (retraits de sortants : un redémarrage dans les 2 s ne doit pas perdre la commande) */
  async function persisterPushMaintenant(){ if (sauvePush){ clearTimeout(sauvePush); sauvePush = null; } await meta("pointeuses_push", PUSH); }
  const etatPush = sn => PUSH[sn] || (PUSH[sn] = {cmds:[], seq:0});
  function commandePush(sn, c){ const e = etatPush(sn); e.seq = (e.seq||0) + 1; e.cmds.push({id:e.seq, c}); persisterPush(); return e.seq; }
  /* 56.33.11 : effacement des badgeages d'un appareil Push en deux temps — l'appareil renvoie tout son journal ; le
     « CLEAR LOG » n'est envoyé qu'après son accusé de réception de la demande, tous les envois enregistrés sans erreur
     et 15 s sans nouvel envoi (avant : effacement envoyé dans le même lot, badgeages renvoyés pas encore enregistrés) */
  function demanderPurgePush(sn, idQuery, login){ const e = etatPush(sn); e.purge = {query:idQuery, demande:Date.now(), par:login||""}; persisterPush(); }
  function viderPush(sn){ const e = etatPush(sn); e.cmds = []; persisterPush(); }
  const ipNorm = x => String(x||"").replace(/^::ffff:/, "").trim();
  function dansReseau(ip, cidr){
    const [base, bits] = String(cidr).split("/"); const n = bits === undefined ? 32 : +bits;
    const v = a => a.split(".").reduce((s, x)=>(s * 256) + (+x), 0);
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
    const m = n === 0 ? 0 : (0xFFFFFFFF << (32 - n)) >>> 0;
    return ((v(ip) & m) >>> 0) === ((v(base) & m) >>> 0);
  }
  function origineAutorisee(T, ip){
    ip = ipNorm(ip);
    if (T.ip && ipNorm(T.ip) === ip) return true;
    return (config().pushReseaux||[]).some(r=>dansReseau(ip, r));
  }
  const DEBIT = new Map();
  function debitOk(sn){
    const n = Date.now(), d = DEBIT.get(sn) || {t:n, c:0};
    if (n - d.t > 60000){ d.t = n; d.c = 0; }
    d.c++; DEBIT.set(sn, d);
    return d.c <= 240;
  }
  let dernierRefus = {};
  async function refuserPush(sn, ip, motif){
    /* 56.33.11 : numéros de série inventés regroupés par adresse (une entrée d'audit par adresse et par 10 min, et non
       une par numéro), table bornée */
    const cle = (motif === "numéro de série inconnu" ? "?" : sn)+"|"+ip+"|"+motif;
    if (Object.keys(dernierRefus).length > 5000) dernierRefus = {};
    if (!dernierRefus[cle] || Date.now() - dernierRefus[cle] > 600000){
      dernierRefus[cle] = Date.now();
      journal("push refusé "+sn+" depuis "+ip+" : "+motif);
      await audit("pointeuse", "pointeuse.push.refus", sn+" depuis "+ip+" : "+motif, ip);
      const r = (await meta("pointeuses_push_refus")) || []; r.unshift({le:horo(new Date()), sn, ip, motif}); await meta("pointeuses_push_refus", r.slice(0, 50));
    }
  }
  async function termParSn(sn){ const ref = await (D.referentielLecture || D.referentiel)() || {}; return (ref.terms||[]).find(x=>x.sn && String(x.sn) === String(sn) && x.actif !== false) || null; }
  /* requêtes émises par l'appareil : /iclock/cdata, /iclock/getrequest, /iclock/devicecmd */
  async function iclock(req, res, u, corps){
    const sn = u.searchParams.get("SN") || "";
    const T = sn ? await termParSn(sn) : null;
    const texte = (code, t) => { res.writeHead(code, {"Content-Type":"text/plain"}); res.end(t); };
    let ipSrc = ipNorm(req.socket && req.socket.remoteAddress);
    /* derrière un proxy inverse déclaré de confiance : adresse réelle de l'appareil transmise par le proxy */
    if ((config().proxyConfiance||[]).map(ipNorm).indexOf(ipSrc) >= 0 && req.headers["x-forwarded-for"]) ipSrc = ipNorm(String(req.headers["x-forwarded-for"]).split(",")[0]);
    if (!T){ await refuserPush(sn || "?", ipSrc, "numéro de série inconnu"); return texte(403, "ERROR: unknown device"); }
    /* le numéro de série ne suffit pas : l'appel doit venir de l'adresse déclarée de l'appareil (ou d'un réseau autorisé) */
    if (!origineAutorisee(T, ipSrc)){ await refuserPush(sn, ipSrc, "adresse d'origine non autorisée (attendue : "+(T.ip||"réseau autorisé")+")"); return texte(403, "ERROR: forbidden"); }
    if (!debitOk(sn)){ await refuserPush(sn, ipSrc, "débit excessif"); return texte(429, "ERROR: too many requests"); }
    /* 56.33.11 : corps lu seulement après identification de l'appareil (avant : jusqu'à 20 Mo lus pour tout appelant) */
    if (typeof corps === "function") corps = await corps();
    const e = etatPush(sn); e.vu = horo(new Date()); e.ip = (req.socket && req.socket.remoteAddress) || "";
    const p = u.pathname.toLowerCase();
    if (p.endsWith("/cdata") && req.method === "GET"){
      persisterPush();
      return texte(200, ["GET OPTION FROM: "+sn, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=30", "Delay=10",
        "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog OpLog EnrollUser ChgUser", "TimeZone=1", "Realtime=1", "Encrypt=None"].join("\r\n"));
    }
    if (p.endsWith("/cdata") && req.method === "POST"){
      const table = (u.searchParams.get("table")||"").toUpperCase(), lignes = String(corps||"").split(/\r?\n/).filter(Boolean);
      if (table === "ATTLOG"){
        if (lignes.length > 20000) return texte(413, "ERROR: too many lines");
        /* v50 : chaque ligne reçue devient un événement brut ; les lignes invalides (horodatage futur ou illisible,
           identifiant absent) sont conservées avec le statut INVALID au lieu d'être écartées sans trace */
        const l = lignes.map(x=>[x, x.split("\t")]).map(([ligne, x])=>({utilisateur:String(x[0]||"").trim().slice(0, 64), horodatage:String(x[1]||"").trim(), sens:{0:"E", 1:"S", 2:"S", 3:"E", 4:"E", 5:"S"}[x[2]] || "", payload:ligne}));
        let r;
        try { r = await integrer(T, l, "push"); }
        catch(e2){ journal("push "+sn+" : "+e2.message); if (e.purge){ e.purge = null; persisterPush(); journal("push "+sn+" : effacement annulé (envoi non enregistré)"); } return texte(503, "ERROR: retry later"); }      /* l'appareil garde ses badgeages et les renverra */
        e.dernierEnvoi = Date.now();
        if (r.invalides) await refuserPush(sn, ipSrc, r.invalides+" badgeage(s) invalide(s) conservé(s) pour examen");
        await audit("pointeuse", "pointeuse.push", T.nom+" : "+l.length+" reçus, "+r.integres+" nouveaux, "+r.doublons+" doublons, "+r.invalides+" invalides");
        return texte(200, "OK: "+l.length);
      }
      /* v56.5 : visages envoyés par l'appareil (gabarits BIODATA / FACE, photos BIOPHOTO) */
      if (table === "BIODATA" || table === "BIOPHOTO" || table === "FACE" || (table === "OPERLOG" && lignes.some(x=>/^(BIODATA|BIOPHOTO|FACE) /.test(x)))){
        let n = 0, inconnus = 0;
        for (const x of lignes){
          const t2 = (/^(BIODATA|BIOPHOTO|FACE) /.exec(x) || [null, table])[1], o2 = {};
          x.replace(/^(BIODATA|BIOPHOTO|FACE) /, "").split("\t").forEach(kv=>{ const i = kv.indexOf("="); if (i > 0) o2[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
          const pin = o2.PIN, b64 = o2.TMP || o2.CONTENT; if (!pin || !b64) continue;
          if (t2 === "BIODATA" && String(o2.TYPE) !== "9") continue;                   /* visages seulement (Type 9) */
          const format = t2 === "BIOPHOTO" ? "photo-jpeg" : t2 === "FACE" ? "zk-face7" : "zk-bio9-v"+(o2.MAJORVER || "0");
          const r = await visageRecu(T, pin, format, Buffer.from(b64, "base64"), Number(o2.INDEX || o2.FID || 0));
          if (r.ok) n++; else if (r.inconnu) inconnus++;
        }
        if (n || inconnus) await audit("pointeuse", "biometrie.visages.recus", T.nom+" : "+n+" visage(s) enregistré(s)"+(inconnus ? ", "+inconnus+" identifiant(s) inconnu(s)" : ""));
        if (table !== "OPERLOG") return texte(200, "OK: "+lignes.length);
      }
      if (table === "OPERLOG" || table === "USERINFO"){
        const u2 = lignes.filter(x=>/^USER /.test(x) || /^PIN=/.test(x)).map(x=>{ const o = {}; x.replace(/^USER /, "").split("\t").forEach(kv=>{ const i = kv.indexOf("="); if (i > 0) o[kv.slice(0,i)] = kv.slice(i+1); }); return o; })
          .filter(o=>o.PIN).map(o=>({id:o.PIN, nom:o.Name||"", carte:o.Card||"", privilege:Number(o.Pri)||0}));
        if (u2.length){ const m = new Map((e.utilisateurs||[]).map(x=>[x.id, x])); u2.forEach(x=>m.set(x.id, x)); e.utilisateurs = Array.from(m.values()); persisterPush(); }
        return texte(200, "OK: "+lignes.length);
      }
      return texte(200, "OK");
    }
    if (p.endsWith("/getrequest")){
      const info = u.searchParams.get("INFO"); if (info){ const x = info.split(","); e.firmware = x[0] || e.firmware; e.modele = e.modele || ""; }
      if (e.purge && e.purge.queryFaite && Date.now() - (e.dernierEnvoi || 0) > 15000 && Date.now() - e.purge.queryFaite > 15000){
        const par = e.purge.par; e.purge = null; commandePush(sn, "CLEAR LOG");
        journal("push "+sn+" : badgeages renvoyés et enregistrés, effacement de l'appareil envoyé");
        await audit(par || "systeme", "pointeuse.purge_push", T.nom+" : effacement après renvoi complet et enregistrement des badgeages");
      }
      if (e.purge && Date.now() - e.purge.demande > 6 * 3600000){ e.purge = null; persisterPush(); journal("push "+sn+" : effacement abandonné (renvoi non confirmé en 6 h)"); }
      if (!e.cmds.length) return texte(200, "OK");
      const lot = e.cmds.splice(0, 20); e.envoyees = (e.envoyees||[]).concat(lot).slice(-200); persisterPush();
      return texte(200, lot.map(c=>"C:"+c.id+":"+c.c).join("\r\n"));
    }
    if (p.endsWith("/devicecmd")){ const rl = String(corps||"").split(/\r?\n/).filter(Boolean); e.retours = (e.retours||[]).concat(rl).slice(-200);
      /* 56.33.11 : commande refusée par l'appareil (retour négatif) : journal et audit, jamais silencieuse */
      for (const x of rl){ const mR = /(?:^|&)ID=(\d+)&Return=(-\d+)/i.exec(x); if (mR){ const c0 = (e.envoyees||[]).find(c=>c.id === Number(mR[1]));
        journal("push "+sn+" : commande "+mR[1]+" refusée par l'appareil ("+mR[2]+") : "+(c0 ? String(c0.c).slice(0, 80) : "?"));
        await audit("pointeuse", "pointeuse.push.commande_refusee", T.nom+" : "+(c0 ? String(c0.c).slice(0, 120) : "commande "+mR[1])+" → "+mR[2]); } }
      if (e.purge && !e.purge.queryFaite) rl.forEach(x=>{ const o = {}; x.split("&").forEach(kv=>{ const i = kv.indexOf("="); if (i > 0) o[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
        if (Number(o.ID) === e.purge.query){ if (Number(o.RETURN) >= 0) e.purge.queryFaite = Date.now(); else { e.purge = null; journal("push "+sn+" : renvoi refusé par l'appareil, effacement annulé"); } } });
      persisterPush(); return texte(200, "OK"); }
    return texte(404, "ERROR");
  }

  /* ---------- exécution d'une action ---------- */
  /* v48 : actions qui modifient l'appareil : confirmation explicite, délai entre deux actions
     sur le même appareil, débit limité par utilisateur */
  const SENSIBLES = ["nettoyage", "redemarrer", "effacer-commandes", "utilisateurs-envoyer", "synchro-heure", "visages-envoyer", "utilisateurs-retirer"];
  /* v56.24 : synchronisation biométrique automatique — compte technique, verrou par appareil (une action à la fois ;
     une action manuelle attend la fin de l'action automatique en cours, puis passe en priorité) */
  const AUTO = "synchro biométrie", OCCUPE = new Map(), MANUEL = new Map(), DERNIERE_AUTO = new Map();
  const occupe = id => OCCUPE.has(String(id));
  const manuelRecent = (id, ms) => Date.now() - (MANUEL.get(String(id)) || 0) < (ms || 60000);
  const DERNIERE = new Map(), PAR_UTIL = new Map();
  async function executer(action, id, options, login){
    if (ACTIONS.indexOf(action) < 0) throw Object.assign(new Error("Action inconnue."), {code:404});
    const u = String(login||""), n = Date.now();
    const auto = u === AUTO;
    if (auto){
      /* synchronisation automatique : pas de confirmation interactive, mais délai minimal entre deux actions sensibles
         sur un même appareil, et jamais pendant (ou juste après) une action manuelle */
      if (occupe(id)) throw Object.assign(new Error("Appareil occupé par une autre action : reporté."), {code:423});
      if (manuelRecent(id, Number(options && options.delaiMs) || 20000)) throw Object.assign(new Error("Action manuelle récente sur l'appareil : reporté."), {code:423});
      /* délai propre à l'automatique : une action automatique ne retarde jamais une action manuelle */
      if (SENSIBLES.indexOf(action) >= 0){ const k = id+"|"+action, der = DERNIERE_AUTO.get(k) || 0, delai = Number(options && options.delaiMs) || 20000;
        if (n - der < delai) throw Object.assign(new Error("Délai minimal entre deux actions sur l'appareil : reporté."), {code:423});
        DERNIERE_AUTO.set(k, n); }
    } else if (SENSIBLES.indexOf(action) >= 0 && u !== "collecte automatique"){
      /* débit : 60 actions sensibles par minute et par utilisateur (plusieurs dizaines d'appareils restent gérables) */
      const d = PAR_UTIL.get(u) || {t:n, c:0};
      if (n - d.t > 60000){ d.t = n; d.c = 0; } d.c++; PAR_UTIL.set(u, d);
      if (d.c > 60) throw Object.assign(new Error("Trop d'actions sensibles sur les appareils en une minute : patientez."), {code:429});
      if (!(options && options.confirme === true)) throw Object.assign(new Error("Action sur l'appareil non confirmée."), {code:428});
      const k = id+"|"+action, der = DERNIERE.get(k) || 0;
      if (n - der < 20000) throw Object.assign(new Error("Cette action vient d'être lancée sur cet appareil : patientez "+Math.ceil((20000-(n-der))/1000)+" s."), {code:429});
      DERNIERE.set(k, n);
    }
    const T = await terminal(id);
    if (!T) throw Object.assign(new Error("Appareil introuvable : enregistrez-le d'abord dans Terminaux."), {code:404});
    const P = piloteDe(T);
    if (!P && T.pilote && ATTENTE.some(x=>x.id === T.pilote)) throw Object.assign(new Error("Le pilote « "+T.pilote+" » n'est pas encore approuvé (ou ses fichiers ont changé) : un administrateur doit l'approuver dans Terminaux > Pilotes."), {code:403});
    if (!P) throw Object.assign(new Error("Aucun pilote pour « "+(T.modele||T.nom)+" » : choisissez-le dans la fiche de l'appareil ou déposez le pilote du constructeur dans donnees/pilotes."), {code:501});
    if ((P.capacites||ACTIONS).indexOf(action) < 0 && !(action === "info" && (P.capacites||[]).indexOf("diagnostic") >= 0))
      throw Object.assign(new Error("« "+action+" » n'est pas proposé par le pilote "+P.nom+"."), {code:501});
    const S = await secret(T.id);
    if (S._illisible && !P.push) throw Object.assign(new Error("Identifiant et mot de passe de cet appareil illisibles : ils ont été chiffrés par une autre installation de FIWAKTI (clé différente). Ouvrez la fiche de l'appareil, ressaisissez l'identifiant et le mot de passe puis enregistrez — ou importez le trousseau de clés de l'installation d'origine."), {code:409});
    /* verrou par appareil : l'action manuelle attend l'action automatique en cours (au plus 60 s), puis passe */
    if (!auto){ MANUEL.set(String(id), Date.now()); const enc = OCCUPE.get(String(id)); if (enc) await Promise.race([enc.catch(()=>{}), new Promise(x=>setTimeout(x, 60000))]); }
    let libere; const verrou = new Promise(x=>{ libere = x; }); OCCUPE.set(String(id), verrou);
    try {
    const mats = options && Array.isArray(options.mats) ? options.mats : null;
    /* 56.33.11 : copie de sauvegarde automatique de toute collecte avant enregistrement, quel que soit le pilote (ZK et
       pilotes externes l'écrivent eux-mêmes avant de décider d'une purge : pas de seconde copie) */
    let copie = null;
    /* 56.33.11 : fuseau de l'appareil (fiche, sinon site, sinon défaut) — celui avec lequel l'ingestion lit ses badgeages ;
       heures « depuis » / « maintenant » données dans ce fuseau, et non à l'heure locale du serveur (serveur en UTC) */
    const ING = require("./ingestion.js");
    const fuseau = await (async ()=>{ let z = T.fuseau;
      if (!z && T.siteId) try { const ref = await D.referentielLecture() || {}, st = (ref.sites||[]).find(x=>x.id === T.siteId); z = st && st.tz; } catch(e){}
      try { new Intl.DateTimeFormat("en-GB", {timeZone:z || ING.FUSEAU_DEFAUT}); return z || ING.FUSEAU_DEFAUT; } catch(e){ return ING.FUSEAU_DEFAUT; } })();
    const horoTz = ms => ING.utcVersLocal(new Date(ms).toISOString(), fuseau);
    const ctx = {options:options||{}, fuseau,
      integrer:async l=>{
        if (!copie && action === "collecte" && Array.isArray(l) && l.length){ try { copie = await archiverNouveaux(T, l, false); } catch(e){ journal("copie de sauvegarde "+(T.nom||T.id)+" : "+e.message); } }
        return Object.assign({archive:copie ? path.basename(copie.fichier) : null}, await integrer(T, l));
      },
      archiver:async (l, opt)=>{ copie = await archiverNouveaux(T, l, !!(opt && opt.complet)); return copie; },
      utilisateursPour:T2=>utilisateursPour(T2, mats), etatPush, commandePush, viderPush, demanderPurgePush:(sn, id)=>demanderPurgePush(sn, id, login), persisterPushMaintenant,
      /* v56.5 : visages — enregistrement (identifiant de l'appareil → salarié) et visages à envoyer à cet appareil */
      visageRecu:(utilisateur, format, octets, indice)=>visageRecu(T, utilisateur, format, octets, indice),
      visagesPour:(formats)=>visagesPour(T, formats, mats),
      depuis:T2=>horoTz(Date.now() - (Number(T2.joursCollecte)||31)*86400000), maintenant:()=>horoTz(Date.now())};
    const t0 = Date.now();
    const reseau = e => /ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EHOSTUNREACH|ne répond plus|fermée|Pas de réponse/i.test((e.code||"")+" "+e.message);
    try {
      let r;
      try { r = await P.executer(action, T, S, ctx); }
      catch(e1){
        /* coupure réseau pendant une lecture : une nouvelle tentative (les doublons sont écartés) */
        if (!["collecte","utilisateurs-lire","diagnostic","info"].includes(action) || !reseau(e1)) throw e1;
        await new Promise(x=>setTimeout(x, 2000));
        r = await P.executer(action, T, S, ctx); r.reprise = true;
      }
      const et = (await meta("pointeuses_etat")) || {};
      et[T.id] = Object.assign({}, et[T.id]||{}, {derniere:horo(new Date()), action, ok:true, motif:"", pilote:P.id, tempsMs:Date.now()-t0, succes:horo(new Date())}, action === "collecte" ? {collecte:horo(new Date()), integres:r.integres||0, purge:!!r.purge, purgeNonFaite:r.purgeNonFaite||"", archive:r.archive||""} : {});
      if (action === "collecte" && r.purgeNonFaite) journal("collecte "+(T.nom||T.id)+" : appareil non effacé — "+r.purgeNonFaite);
      await meta("pointeuses_etat", et);
      await audit(login, "pointeuse."+action, (T.nom||T.id)+" ("+P.id+") : "+JSON.stringify(Object.assign({}, r, {utilisateurs:r.utilisateurs ? r.utilisateurs.length : undefined, info:undefined})).slice(0,300));
      return Object.assign({pilote:P.id, tempsMs:Date.now()-t0, le:new Date().toISOString()}, r);
    } catch(e){
      const et = (await meta("pointeuses_etat")) || {};
      et[T.id] = Object.assign({}, et[T.id]||{}, {derniere:horo(new Date()), action, ok:false, motif:e.message, pilote:P.id, echecs:(Number((et[T.id]||{}).echecs)||0) + 1});
      await meta("pointeuses_etat", et);
      await audit(login, "pointeuse."+action+".echec", (T.nom||T.id)+" : "+e.message);
      if (action === "diagnostic") return {enLigne:false, motif:traduire(e), pilote:P.id, tempsMs:Date.now()-t0, le:new Date().toISOString()};
      throw Object.assign(new Error(traduire(e)), {code:502});
    }
    } finally { if (OCCUPE.get(String(id)) === verrou) OCCUPE.delete(String(id)); libere(); }
  }
  function traduire(e){
    const c = e.code || "";
    if (c === "ECONNREFUSED") return "L'appareil refuse la connexion : vérifier le port et que le service de communication est activé.";
    if (c === "EHOSTUNREACH" || c === "ENETUNREACH") return "Appareil injoignable sur le réseau (adresse IP, câble, VLAN, pare-feu).";
    if (c === "ETIMEDOUT") return "Pas de réponse de l'appareil (adresse IP ou pare-feu).";
    return e.message;
  }
  /* ---------- v54 : supervision (cahier des charges §27, REC-21) ----------
     ONLINE : communication réussie récente ; DEGRADED : dernier essai en échec mais succès récent ;
     OFFLINE : aucune communication réussie dans le délai (ou jamais). */
  const DERNIER_BRUT = new Map();
  async function supervision(seuilMin){
    const ref = await (D.referentielLecture || D.referentiel)() || {}, et = (await meta("pointeuses_etat")) || {}, seuil = Math.max(1, Number(seuilMin) || 10) * 60000, n = Date.now();
    const t = s => s ? new Date(String(s).replace(" ", "T")).getTime() : 0;
    const out = [];
    /* 56.33.11 : événements en attente de toutes les pointeuses en une requête (index de la file par statut) */
    const enFile = new Map(); try { (await B.all("SELECT terminal_id t, COALESCE(SUM(nb),0) n FROM ingestion_queue WHERE statut IN ('attente','erreur','en_cours') GROUP BY terminal_id")).forEach(r=>enFile.set(r.t, Number(r.n))); } catch(x){}
    for (const T of (ref.terms||[])){
      if (T.actif === false) continue;
      const P = piloteDe(T), e = et[T.id] || {}, push = !!(P && P.push);
      const delai = Math.max(seuil, (Number(T.collecteMinutes)||0) * 2 * 60000);
      let statut, derCom, motif = "";
      if (push){ const ep = PUSH[T.sn] || {}; derCom = ep.vu || null; statut = derCom && n - t(derCom) <= delai ? "ONLINE" : "OFFLINE"; if (!derCom) motif = "jamais connecté"; }
      else { derCom = e.succes || (e.ok ? e.derniere : null);
        const recent = derCom && n - t(derCom) <= delai;
        statut = e.ok === false ? (recent ? "DEGRADED" : "OFFLINE") : (recent ? "ONLINE" : "OFFLINE");
        if (e.ok === false) motif = e.motif || ""; else if (!derCom) motif = "aucune communication"; }
      let dernierEvt = null, attente = 0;
      /* 56.33.11 : dernier événement = dernier lot reçu de l'appareil (file indexée par pointeuse) ; auparavant un
         MAX() sur tous les événements bruts sans index par appareil, pour chaque pointeuse (424 ms à 1,5 million de
         badgeages, et de plus en plus lent). Repli sur les événements bruts pour un appareil sans lot dans la file
         (badgeages repris d'une version antérieure), mémorisé 10 min. */
      try { const r = await B.get("SELECT MAX(recu_utc) m FROM ingestion_queue WHERE terminal_id=?", T.id); dernierEvt = r && r.m || null;
            if (!dernierEvt){ const c = DERNIER_BRUT.get(T.id);
              if (c && n - c.t < 600000) dernierEvt = c.m;
              else { const r2 = await B.get("SELECT MAX(reception_ts_utc) m FROM raw_events WHERE device_id=?", T.id); dernierEvt = r2 && r2.m || null; DERNIER_BRUT.set(T.id, {t:n, m:dernierEvt}); } }
            attente = enFile.get(T.id) || 0; } catch(x){}
      out.push({id:T.id, nom:T.nom, site:T.siteId, pilote:P ? P.id : T.pilote, versionConnecteur:P ? ((P.version || "") + (P.empreinte ? " "+String(P.empreinte).slice(0, 12) : "")) || P.origine || "" : "",
        mode:push ? "push" : "collecte", statut, motif, derniereCommunication:derCom, derniereSynchroReussie:e.collecte || (push ? derCom : null), dernierEvenement:dernierEvt,
        evenementsEnAttente:attente, erreurs:Number(e.echecs)||0, latenceMs:e.tempsMs == null ? null : e.tempsMs});
    }
    return out;
  }
  /* ---------- collecte automatique ---------- */
  let enCours = false;
  async function collecteAuto(){
    if (enCours) return; enCours = true;
    try {
      const ref = await D.referentielLecture() || {};
      const et = (await meta("pointeuses_etat")) || {};
      for (const T of (ref.terms||[])){
        const min = Number(T.collecteMinutes) || 0;
        if (!min || T.actif === false) continue;
        const P = piloteDe(T); if (!P || P.push) continue;
        const der = et[T.id] && et[T.id].collecte ? new Date(et[T.id].collecte.replace(" ", "T")).getTime() : 0;
        if (Date.now() - der < min*60000) continue;
        try { await executer("collecte", T.id, {}, "collecte automatique"); } catch(e){ journal("collecte "+T.nom+" : "+e.message); }
      }
    } finally { enCours = false; }
  }
  /* dernière action automatique sensible sur un appareil (le moteur attend le délai minimal au lieu de reporter) */
  const derniereAuto = id => { let m = 0; for (const [k, v] of DERNIERE_AUTO) if (k.startsWith(String(id)+"|") && v > m) m = v; return m; };
  return {lireArchive, purgerArchives, archiver, verifierIdentifiants, supervision, charger:()=>chargerApprobations().then(()=>charger()), approuver, attente:()=>ATTENTE, executer, AUTO, occupe, manuelRecent, idSurAppareil, derniereAuto,
    terminal, piloteDe, correspondance, iclock, collecteAuto, etatPushCharger, enregistrerSecret, secrets, pushRestreint:()=>true,
    liste:()=>Object.values(pilotes).map(p=>({id:p.id, nom:p.nom, marques:p.marques||[], modeles:p.modeles||"", capacites:p.capacites||ACTIONS, champs:p.champs||[], origine:p.origine, empreinte:p.empreinte||"", push:!!p.push})),
    async etat(){ return {etat:(await meta("pointeuses_etat")) || {}, inconnus:(await meta("pointeuses_inconnus")) || {}, refusPush:(await meta("pointeuses_push_refus")) || [], push:Object.fromEntries(Object.entries(PUSH).map(([k, v])=>[k, {vu:v.vu, ip:v.ip, attente:(v.cmds||[]).length}]))}; }};
}
module.exports = {creer, ACTIONS};
