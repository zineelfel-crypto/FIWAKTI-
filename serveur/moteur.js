/* FIWAKTI — moteur de calcul exécuté par le serveur (v44).
   Ce fil de travail charge le moteur même de l'application (app.js) : mêmes
   règles de calcul que dans le navigateur (journées, retards, heures
   supplémentaires, anomalies, compteurs, états), sans interface. Il lit la base
   directement et range les résultats jour par jour dans « calc_jour ». */
"use strict";
const { parentPort, workerData } = require("worker_threads");
const vm = require("vm"), fs = require("fs"), path = require("path");
const bd = require("./bd.js");
const COLLS_JOUR = ["ptg","abs","corrections","ajust"];

function chargerMoteur(fichierApp){
  const noop = ()=>{};
  const el = () => ({addEventListener:noop, removeEventListener:noop, setAttribute:noop, removeAttribute:noop, appendChild:noop, remove:noop,
    classList:{add:noop, remove:noop, toggle:noop, contains:()=>false}, style:{}, dataset:{}, querySelector:()=>null, querySelectorAll:()=>[], innerHTML:"", textContent:""});
  const doc = Object.assign(el(), {documentElement:el(), body:el(), head:el(), getElementById:()=>null, createElement:el, readyState:"complete", title:""});
  const obs = function(){ return {observe:noop, disconnect:noop}; };
  const ctx = {FIWAKTI_MOTEUR:true, console:{log:noop, warn:noop, error:noop, info:noop}, setTimeout, clearTimeout, setInterval:()=>0, clearInterval:noop,
    document:doc, navigator:{language:"fr", userAgent:"fiwakti-moteur"}, location:{href:"http://moteur/", search:"", hash:"", pathname:"/", origin:"http://moteur"},
    localStorage:{getItem:()=>null, setItem:noop, removeItem:noop}, sessionStorage:{getItem:()=>null, setItem:noop, removeItem:noop},
    matchMedia:()=>({matches:false, addEventListener:noop, addListener:noop}), addEventListener:noop, removeEventListener:noop,
    requestAnimationFrame:f=>setTimeout(f, 0), performance:{now:()=>Date.now()}, crypto:require("crypto").webcrypto, TextEncoder, TextDecoder, atob, btoa, URL,
    Blob:function(){}, fetch:async()=>({ok:false, status:503, json:async()=>({})}), indexedDB:undefined, MutationObserver:obs, ResizeObserver:obs, IntersectionObserver:obs,
    HTMLElement:function(){}, Element:function(){}, Node:function(){}, Event:function(){}, CustomEvent:function(){}, getComputedStyle:()=>({}),
    innerWidth:1400, innerHeight:900, screen:{width:1400, height:900}, history:{replaceState:noop, pushState:noop}, alert:noop, confirm:()=>true, print:noop,
    open:()=>null, scrollTo:noop, Image:function(){}, FileReader:function(){}, XMLHttpRequest:function(){}};
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const code = fs.readFileSync(fichierApp, "utf8") + `
;globalThis.__moteur = {
  get db(){ return db; }, set db(v){ db = v; },
  reinit(){ ptgTouch(); absTouch(); SUIVI_CACHE = []; if (typeof jvVider === "function") jvVider(); if (typeof PERIM_TICK !== "undefined") PERIM_TICK++; },
  jourVars, convFor, mvtsDe, seqIncoherente, suiviAnomalies, absLibJour, todayKey, dAjout, exportEtatCsv, NUL, jourTypeDe, runCounters, regleEff
};`;
  vm.runInContext(code, ctx, {filename:"app.js"});
  ctx.download = (nom, contenu)=>{ if (ctx.__capture) ctx.__capture(nom, contenu); };
  ctx.flash = noop;
  return {M:ctx.__moteur, ctx};
}

let B = null, E = null;
async function init(){
  B = await bd.ouvrir(workerData.base, workerData.dossier);
  E = chargerMoteur(workerData.app);
}
const plage = (du, au) => { const out = []; let k = du, g = 0; while (k <= au && g++ < 1000){ out.push(k); k = E.M.dAjout(k, 1); } return out; };
function filtre(mats){
  const arr = mats.map(String);
  return B.type === "pg" ? {sql:"mat = ANY(?)", a:[arr]} : {sql:"mat IN (SELECT value FROM json_each(?))", a:[JSON.stringify(arr)]};
}
/* v53 : badgeages reconstruits depuis les événements normalisés (niveau 2) : pour chaque badgeage, le dernier
   événement accepté ; une annulation le retire. C'est la source du moteur une fois la comparaison validée. */
async function ptgNormalises(mats, d0, d1){
  const f = filtre(mats), fe = f.sql.replace(/^mat /, "employee_mat ");
  const l = await B.all("SELECT x.ptg_id, x.employee_mat, x.ts_local, x.type, x.methode_type, x.raw_event_id, r.ingestion_source, r.payload_raw, r.device_id, r.terminal_code FROM (SELECT n.*, ROW_NUMBER() OVER (PARTITION BY ptg_id ORDER BY created_at DESC, id DESC) rn FROM normalized_events n"+
    " WHERE ptg_id IS NOT NULL AND statut='ACCEPTED' AND "+fe+") x JOIN raw_events r ON r.raw_event_id = x.raw_event_id WHERE x.rn=1 AND x.type <> 'CANCEL' AND substr(x.ts_local,1,10) >= ? AND substr(x.ts_local,1,10) <= ?", ...f.a, d0, d1);
  return l.map(x=>{
    const sens = (x.type === "IN" || x.type === "AUTO_IN") ? "E" : "S";
    /* saisie, correction, migration : l'enregistrement d'origine est dans le message brut ; appareil : reconstitué */
    let o = null;
    try { const p = JSON.parse(x.payload_raw || "null");
      if (x.ingestion_source === "migration_v49") o = p;
      else if (x.ingestion_source === "saisie" || x.ingestion_source === "correction") o = p && p.apres;
    } catch(e){}
    if (!o) o = {id:x.ptg_id, mat:String(x.employee_mat), ts:x.ts_local, sens, dev:x.terminal_code || "", src:"badge", term:x.device_id || undefined, raw:x.raw_event_id, sensAuto:/^alternance/.test(x.methode_type||"") ? true : undefined};
    o = Object.assign({}, o, {id:x.ptg_id, mat:String(x.employee_mat), ts:x.ts_local, sens});
    delete o.__v;
    return o;
  });
}
async function contexte(mats, du, au, source){
  const ref = JSON.parse((await B.get("SELECT valeur FROM kv WHERE cle=?", "fiwakti:ref:v1")).valeur);
  const emps = (await B.all("SELECT data FROM enreg WHERE coll='emps'")).map(r=>JSON.parse(r.data));
  const f = filtre(mats);
  const d0 = E.M.dAjout(du, -1), d1 = E.M.dAjout(au, 1);
  /* serveur = données réelles : jamais de badgeages simulés */
  const doc = Object.assign({}, ref, {emps, audit:[], notifs:[], journal:[], bio:[], msgp:[], exemple:false});
  for (const c of COLLS_JOUR) doc[c] = (await B.all("SELECT data FROM enreg WHERE coll=? AND d>=? AND d<=? AND "+f.sql, c, d0, d1, ...f.a)).map(r=>JSON.parse(r.data));
  if (source === "normalise") doc.ptg = await ptgNormalises(mats, d0, d1);
  doc.dmd = (await B.all("SELECT data FROM enreg WHERE coll='dmd' AND d>=? AND "+f.sql, d0, ...f.a)).map(r=>JSON.parse(r.data));
  E.M.db = doc; E.M.reinit();
  return doc;
}
/* calcule et range les journées de ces employés sur la période */
/* v53 : valeur de chaque compteur par salarié sur une période (recalcul avec rapport avant/après) */
async function compteurs(mats, du, au, source, reglesSim){
  const doc = await contexte(mats, du, au, source), out = {};
  const p = k => { const x = k.split("-").map(Number); return new Date(x[0], x[1]-1, x[2]); };
  const lire = () => { const o = {};
    for (const mat of mats){
      const e = doc.emps.find(x=>String(x.mat) === String(mat)); if (!e) continue;
      const r = E.M.runCounters(e, p(du), p(au), false), v = {};
      Object.keys(r.val||{}).forEach(k=>{ const x = r.val[k]; v[k] = (x === null || x === undefined || Number.isNaN(x)) ? null : Math.round(Number(x)*10000)/10000; });
      o[mat] = v;
    }
    return o; };
  if (!reglesSim) return lire();
  /* v54 : simulation « what if » — mêmes données, règles candidates ajoutées en mémoire seulement */
  const avant = lire();
  E.M.db.reglesV = (doc.reglesV || []).concat(reglesSim.map(r=>Object.assign({}, r, {statut:"publiee", id:"sim-"+(r.id || Math.random()), version:(Number(r.version)||0) + 1000})));
  E.M.reinit();
  const apres = lire();
  mats.forEach(mat=>{ if (avant[mat]) out[mat] = {avant:avant[mat], apres:apres[mat]}; });
  return out;
}
/* v53 : comparaison des deux sources de badgeages (projection v49 et événements normalisés) */
async function comparerSources(mats, du, au){
  const f = filtre(mats);
  const a = (await B.all("SELECT data FROM enreg WHERE coll='ptg' AND d>=? AND d<=? AND "+f.sql, du, au, ...f.a)).map(r=>JSON.parse(r.data));
  const b = await ptgNormalises(mats, du, au);
  /* comparaison complète de chaque badgeage (tous les champs, hors numéro de version) */
  const cle = x => { const y = Object.assign({}, x); delete y.__v; return JSON.stringify(Object.keys(y).sort().reduce((o, k)=>{ if (y[k] !== undefined) o[k] = y[k]; return o; }, {})); };
  const A = new Map(a.map(x=>[x.id, cle(x)])), Bm = new Map(b.map(x=>[x.id, cle(x)]));
  const ecarts = [];
  A.forEach((v, id)=>{ if (!Bm.has(id)) ecarts.push({id, type:"absent des événements normalisés", v}); else if (Bm.get(id) !== v) ecarts.push({id, type:"différent", v, n:Bm.get(id)}); });
  Bm.forEach((v, id)=>{ if (!A.has(id)) ecarts.push({id, type:"absent de la projection", n:v}); });
  return {projection:a.length, normalises:b.length, ecarts:ecarts.length, exemples:ecarts.slice(0, 20)};
}
async function calculer(mats, du, au, horodatage, source){
  const doc = await contexte(mats, du, au, source);
  const liste = doc.emps.filter(e=>mats.indexOf(String(e.mat)) >= 0);
  const jours = plage(du, au);
  const anos = {};
  try { E.M.suiviAnomalies({du, au}, liste).forEach(a=>{
    const k = a.e.mat+"|"+a.k;
    (anos[k] = anos[k] || []).push({id:a.id, type:a.type, min:a.min, arr:a.arr, deb:a.deb, sug:a.sug, hp:a.hp, ht:a.ht});
  }); } catch(e){}
  const lignes = [];
  for (const e of liste){
    let conv = null; try { conv = E.M.convFor(e); } catch(x){}
    for (const k of jours){
      if ((e.entree && k < e.entree) || (e.sortie && k > e.sortie)) continue;
      let v; try { v = E.M.jourVars(e, k, conv); } catch(x){ continue; }
      const list = E.M.mvtsDe(e.mat, k);
      const nv = x => (x === E.M.NUL || x === undefined || x === null || isNaN(x)) ? null : x;
      const ht = nv(v.d.HT), hp = nv(v.d.HP), ret = nv(v.d.RET);
      const a = anos[e.mat+"|"+k] || [];
      const jr = v.inf.jour || null;
      lignes.push([String(e.mat), k, e.deptId||"", e.siteId||"", ht, hp, ret, (hp != null && ht != null) ? Math.round((hp-ht)*60) : null,
        a.length, a.map(x=>x.type).join(","), JSON.stringify(a),
        JSON.stringify({jid:v.inf.jid||"", jour:jr ? jr.nom : "", coul:jr ? jr.couleur : "", reel:!!v.inf.reel,
          mv:list.map(m=>[m.id, String(m.ts).slice(11,16), m.sens, m.dev||"", m.src||"", m.__v||0, String(m.ts).slice(16,19)]), abs:(()=>{ try { return E.M.absLibJour(e.mat, k); } catch(x){ return ""; } })()}),
        horodatage, list.length, v.inf.jid||"", v.inf.reel ? 1 : 0, a.filter(x=>x.type === "hs").reduce((s, x)=>s + (x.min||0), 0)]);
    }
  }
  /* 56.33.11 : journées invalidées après le début de ce calcul (horodatage de la tâche) : résultat retiré, recalculé
     ensuite — dans la transaction, puis une seconde fois après validation (sous PostgreSQL, une invalidation validée
     pendant la transaction ne voit pas encore ces lignes) */
  const f = filtre(mats);
  const perimes = async () => { if (!horodatage) return; try {
    await B.run("DELETE FROM calc_jour WHERE d>=? AND d<=? AND "+f.sql+" AND calc=? AND EXISTS (SELECT 1 FROM calc_invalidations i WHERE (i.mat=calc_jour.mat OR i.mat='*') AND (i.d=calc_jour.d OR i.d='*') AND i.ts > ?)", du, au, ...f.a, horodatage, horodatage);
  } catch(e){ /* table créée à la première invalidation */ } };
  await B.transaction(async ()=>{
    await B.run("DELETE FROM calc_jour WHERE d>=? AND d<=? AND "+f.sql, du, au, ...f.a);
    for (let i = 0; i < lignes.length; i += 400){
      const lot = lignes.slice(i, i+400);
      const ph = lot.map(()=>"(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      await B.run("INSERT INTO calc_jour(mat,d,dept,site,ht,hp,ret,hs,nano,types,anos,data,calc,nmv,jid,reel,hsmin) VALUES "+ph, ...lot.flat());
    }
    await perimes();
  });
  await perimes();
  return lignes.length;
}
/* état (export CSV) calculé par lots d'employés, mêmes règles que l'écran États */
async function etat(def, mats, du, au, idTache, source){
  let entete = null; const corps = [];
  for (let i = 0; i < mats.length; i += 500){
    /* v49 : avancement transmis au serveur (travaux en arrière-plan) */
    if (idTache) parentPort.postMessage({id:idTache, progression:{fait:i, total:mats.length}});
    const lot = mats.slice(i, i+500);
    await contexte(lot, du, au, source);
    E.M.db.emps = E.M.db.emps.filter(e=>lot.indexOf(String(e.mat)) >= 0);
    E.M.reinit();
    let contenu = "";
    E.ctx.__capture = (nom, c)=>{ contenu = c; };
    E.M.exportEtatCsv(JSON.parse(JSON.stringify(def)));
    const l = contenu.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    if (!entete) entete = l[0];
    corps.push(...l.slice(1));
  }
  return "\uFEFF"+[entete || ""].concat(corps).join("\r\n");
}
/* une tâche à la fois : le moteur travaille sur un seul jeu de données en mémoire
   (deux tâches mêlées calculeraient sur les données l'une de l'autre) */
let file = Promise.resolve();
/* v50 : le module peut aussi être chargé dans le fil principal (moteur léger pour la date de travail) */
module.exports = {chargerMoteur};
/* 56.33.11 : sous Linux, la priorité est propre à chaque fil d'exécution : les fils de calcul passent en priorité basse
   (nice 10). Ils gardent toute la puissance libre, mais cèdent le processeur aux requêtes des utilisateurs et à
   PostgreSQL (après un import massif de badgeages, trois fils à 100 % ralentissaient tous les écrans sur 4 cœurs).
   Réglable : FIWAKTI_PRIORITE_CALCUL (0 = désactivé). Sous Windows le réglage s'appliquerait à tout le processus : non appliqué. */
if (parentPort && process.platform === "linux"){
  const nice = process.env.FIWAKTI_PRIORITE_CALCUL === undefined ? 10 : Number(process.env.FIWAKTI_PRIORITE_CALCUL);
  if (nice > 0) try { require("os").setPriority(Math.min(19, nice)); } catch(e){}
}
if (parentPort) parentPort.on("message", m=>{
  file = file.then(async ()=>{
    try {
      if (!E) await init();
      let r;
      if (m.type === "calculer") r = await calculer(m.mats, m.du, m.au, m.horodatage, m.source);
      else if (m.type === "compteurs") r = await compteurs(m.mats, m.du, m.au, m.source, m.reglesSim);
      else if (m.type === "comparer") r = await comparerSources(m.mats, m.du, m.au);
      else if (m.type === "etat") r = await etat(m.def, m.mats, m.du, m.au, m.id, m.source);
      else throw new Error("tâche inconnue");
      parentPort.postMessage({id:m.id, ok:true, r});
    } catch(e){ parentPort.postMessage({id:m.id, ok:false, erreur:e.message, pile:e.stack}); }
  });
});
