/* FIWAKTI — périmètres appliqués par le SERVEUR (v42).
   Chaque utilisateur reçoit uniquement les employés de son périmètre et les
   données qui s'y rattachent (pointages, demandes, absences, corrections,
   audit, notifications, biométrie, messages). À l'enregistrement, seules les
   modifications autorisées par ses droits et portant sur son périmètre sont
   reportées dans la base ; tout le reste est conservé tel quel.
   Les règles reprennent exactement celles de l'application (matsPerimetreDirect). */
"use strict";
const RANG = {aucun:0, lecture:1, saisie:2, validation:3, config:4};
const NIV_MENU = {simple:0, avance:1, rh:2, admin:3};
/* collections rattachées à un employé par son matricule */
const PAR_MAT = ["ptg","dmd","abs","corrections","audit","notifs","bio","msgp"];
/* ajouts autorisés hors périmètre (ex. notification envoyée au valideur) */
const AJOUT_LIBRE = ["notifs","audit","journal"];
/* droit nécessaire pour modifier chaque collection : [module, rang minimal] */
const ECRITURE = {
  emps:["EMP",2], ptg:["PTG",2], corrections:["PTG",2], dmd:["ABS",2], abs:["ABS",2], notifs:["ABS",0], audit:["PTG",0],
  cals:["CAL",4], jours:["CAL",4], tt:["CAL",4], arits:["CAL",4], convs:["PAR",4], etats:["ETA",4],
  sites:["PAR",4], depts:["PAR",4], champs:["PAR",4], impMod:["PAR",2],
  terms:["TER",4], zones:["TER",4], aplages:["TER",4], aplans:["TER",4], bio:["TER",2], bioRegles:["TER",4], msgp:["TER",2],
  reglesV:["CAL",4], etablissements:["PAR",4], corbeilleCfg:["SYS",4], users:["SYS",4], profils:["SYS",4], circuits:["SYS",4], regles:["SYS",4], journal:["SYS",0], corbeille:["SYS",4], clotures:["PTG",4]
};
const CHAMPS_PERSO = ["cin","email","tel","adresse","urgenceNom","urgenceLien","urgenceTel","pin","badge","naissance"];
const MASQUE = "•••";
/* champs de son propre compte qu'un utilisateur peut modifier lui-même */
const USER_SOI = ["ntfVus","derniereConx","langue","prefs","homeLayout"];

const aujourdhui = () => { const n = new Date(); return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0"); };

function contexte(doc){
  const emps = doc.emps || [], depts = doc.depts || [];
  const parChef = {};
  emps.forEach(e=>{ if (e.chefMat) (parChef[e.chefMat] = parChef[e.chefMat] || []).push(e.mat); });
  return {doc, emps, depts, parChef, jour:aujourdhui()};
}
function niveauProfil(p){
  if (!p) return "admin";
  if (p.niveauMenu && NIV_MENU[p.niveauMenu] !== undefined) return p.niveauMenu;
  const d = p.droits || {};
  if (d.SYS === "config") return "admin";
  if (d.ABS === "validation" && (d.PTG === "config" || d.ETA === "config")) return "rh";
  if (d.PTG === "saisie" || d.PTG === "config" || d.ABS === "validation") return "avance";
  return "simple";
}
function profilEff(C, u){
  const d = C.jour, dl = (u.deleg||[]).find(x=>x.du <= d && d <= x.au && x.profilId);
  const id = dl ? dl.profilId : u.profilId;
  return (C.doc.profils||[]).find(p=>p.id === id) || null;
}
function sousArbre(C, id){
  const out = [id];
  for (let i=0; i<out.length; i++) C.depts.forEach(d=>{ if (d.parent === out[i] && out.indexOf(d.id) < 0) out.push(d.id); });
  return out;
}
function equipeDe(C, mat, directe){
  const out = new Set(), file = [mat];
  while (file.length){ const m = file.shift(); (C.parChef[m]||[]).forEach(x=>{ if (x !== mat && !out.has(x)){ out.add(x); if (!directe) file.push(x); } }); }
  return out;
}
function valAt(e, code, d){
  const h = (e.hist||{})[code]; if (!h || !h.length) return "";
  let v = ""; h.slice().sort((a,b)=>String(a.d).localeCompare(String(b.d))).forEach(x=>{ if (x.d <= d) v = x.v; }); return v;
}
function scopeEmps(C, pr){
  const inclus = pr.inclus || [], exclus = pr.exclus || [];
  return C.emps.filter(e=>{
    if (exclus.indexOf(e.id) >= 0) return false;
    if (inclus.indexOf(e.id) >= 0) return true;
    if (pr.mode === "liste") return false;
    if ((pr.sites||[]).length && pr.sites.indexOf(e.siteId) < 0) return false;
    if ((pr.depts||[]).length && !pr.depts.some(id=>sousArbre(C, id).indexOf(e.deptId) >= 0)) return false;
    const f = pr.filtres || {};
    for (const code in f){ if (f[code] && valAt(e, code, C.jour) !== f[code]) return false; }
    return true;
  });
}
function repliGlobalActif(C){
  const p = C.doc.params || {};
  if (p.fallbackGlobal === false) return false;
  if (p.fallbackGlobalJusqu && C.jour > p.fallbackGlobalJusqu) return false;
  return true;
}
function perimDirect(C, u){
  const pr = profilEff(C, u), niv = niveauProfil(pr);
  const me = u.empId ? C.emps.find(e=>e.id === u.empId) : null;
  if (!pr || niv === "admin") return null;
  const set = new Set(me ? [me.mat] : []);
  if (niv === "simple") return set;
  const q = u.perim || {};
  const p = {tout:!!q.tout && !(u.perimMigre && !repliGlobalActif(C)), depts:q.depts||[], mats:q.mats||[], sites:q.sites||[], terms:q.terms||[],
             exclus:q.exclus||[], equipe:q.equipe||"", sousDepts:q.sousDepts !== false, sitesFiltre:!!q.sitesFiltre};
  if (p.tout) return null;
  const crit = new Set();
  const vide = !p.depts.length && !p.mats.length && !p.sites.length && !p.terms.length && !p.equipe;
  if (vide){
    const regle = pr.mode === "liste" || (pr.sites||[]).length || (pr.depts||[]).length || (pr.inclus||[]).length || Object.keys(pr.filtres||{}).some(k=>pr.filtres[k]);
    if (regle) scopeEmps(C, pr).forEach(e=>crit.add(e.mat));
    else if (me) equipeDe(C, me.mat).forEach(m=>crit.add(m));
  } else {
    const depts = new Set();
    p.depts.forEach(id=>(p.sousDepts ? sousArbre(C, id) : [id]).forEach(x=>depts.add(x)));
    const sitesAjout = p.sites.length && !p.sitesFiltre;
    C.emps.forEach(e=>{
      if (depts.has(e.deptId) || p.mats.indexOf(e.mat) >= 0 || (sitesAjout && p.sites.indexOf(e.siteId) >= 0) || (e.rds||[]).some(r=>p.terms.indexOf(r) >= 0)) crit.add(e.mat);
    });
    if (me && p.equipe) equipeDe(C, me.mat, p.equipe === "directe").forEach(m=>crit.add(m));
    if (p.sitesFiltre && p.sites.length){
      const autres = p.depts.length || p.mats.length || p.terms.length || p.equipe;
      if (!autres) C.emps.forEach(e=>{ if (p.sites.indexOf(e.siteId) >= 0) crit.add(e.mat); });
      else { const siteDe = new Map(C.emps.map(e=>[e.mat, e.siteId])); Array.from(crit).forEach(m=>{ if (p.sites.indexOf(siteDe.get(m)) < 0 && p.mats.indexOf(m) < 0) crit.delete(m); }); }
    }
  }
  p.exclus.forEach(m=>crit.delete(m));
  if (me) equipeDe(C, me.mat, true).forEach(m=>crit.add(m));
  crit.forEach(m=>set.add(m));
  return set;
}
/* périmètre complet : propre + délégations reçues ; null = tout le personnel */
function perimetre(doc, login){
  const C = contexte(doc);
  const u = (doc.users||[]).find(x=>String(x.login).toLowerCase() === String(login).toLowerCase());
  if (!u) return {u:null, set:new Set(), profil:null, C};
  let set = perimDirect(C, u);
  if (set !== null){
    for (const x of (doc.users||[])){
      if (x.id === u.id || x.actif === false) continue;
      if (!(x.delegPerim||[]).some(g=>g.a === u.id && g.du <= C.jour && C.jour <= g.au)) continue;
      const s2 = perimDirect(C, x);
      if (s2 === null){ set = null; break; }
      s2.forEach(m=>set.add(m));
    }
  }
  return {u, set, profil:profilEff(C, u), C};
}
function droitsDe(profil){ return (profil && profil.droits) || {}; }
function peutEcrire(profil, cle){
  if (!profil || niveauProfil(profil) === "admin") return true;
  const r = ECRITURE[cle]; if (!r) return false;
  return (RANG[droitsDe(profil)[r[0]]] || 0) >= r[1];
}

/* ---------- lecture : document filtré pour l'utilisateur ---------- */
function vue(doc, login){
  const P = perimetre(doc, login);
  if (P.u && P.set === null && !(P.profil && P.profil.persoMasque)) return {doc, P};   /* accès global */
  const o = Object.assign({}, doc);
  const ok = m => P.set !== null && P.set !== undefined ? P.set.has(m) : true;
  if (P.set){
    o.emps = (doc.emps||[]).filter(e=>ok(e.mat));
    PAR_MAT.forEach(k=>{ if (Array.isArray(doc[k])) o[k] = doc[k].filter(x=>!x || !x.mat || ok(x.mat)); });
    if (Array.isArray(doc.journal)) o.journal = doc.journal.filter(x=>!x || !x.mat || ok(x.mat));
  }
  if (P.profil && P.profil.persoMasque)
    o.emps = (o.emps||doc.emps||[]).map(e=>{ const c = Object.assign({}, e); CHAMPS_PERSO.forEach(k=>{ if (c[k]) c[k] = MASQUE; }); return c; });
  /* comptes des autres : identité seulement, jamais leur périmètre détaillé */
  if (niveauProfil(P.profil) !== "admin") o.users = (doc.users||[]).map(u=>u === P.u ? u :
    {id:u.id, login:u.login, nom:u.nom, empId:u.empId, profilId:u.profilId, actif:u.actif, deleg:u.deleg, delegPerim:(u.delegPerim||[]).filter(g=>P.u && g.a === P.u.id)});
  return {doc:o, P};
}

/* ---------- écriture : fusion à trois points ----------
   base   = document tel que l'utilisateur l'a reçu (version indiquée par l'application)
   recu   = document renvoyé par l'utilisateur après ses modifications
   courant= document actuellement en base (peut contenir les modifications d'autres utilisateurs)
   Seules les différences base → reçu sont appliquées au courant : deux personnes qui
   travaillent en même temps ne s'écrasent plus. Pour un non-administrateur, chaque
   différence est contrôlée (droit sur la collection, employé dans le périmètre). */
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const estListe = v => Array.isArray(v) && v.every(x=>x && typeof x === "object" && x.id !== undefined);
function fusionner(courant, recu, login, baseVue){
  const P = perimetre(courant, login);
  const admin = !!P.u && (!P.profil || niveauProfil(P.profil) === "admin");
  if (!P.u) return {doc:courant, ignores:["compte inconnu"]};
  const sansBase = !baseVue;
  if (!baseVue) baseVue = admin ? courant : vue(courant, login).doc;
  const dansPerim = m => admin || P.set === null || (P.set && P.set.has(m));
  const out = Object.assign({}, courant), ignores = [];
  const cles = new Set(Object.keys(recu).concat(Object.keys(baseVue)));
  for (const cle of cles){
    const a = baseVue[cle], n = recu[cle];
    if (n === undefined || egal(a, n)) continue;
    if (cle === "users" && !admin){ out.users = fusionUsers(courant.users, n, P.u); continue; }
    if (!estListe(n) || (a !== undefined && !estListe(a))){
      if (admin) out[cle] = n; else ignores.push(cle);
      continue;
    }
    if (!admin && !peutEcrire(P.profil, cle)){ ignores.push(cle); continue; }
    const parMat = cle === "emps" || PAR_MAT.indexOf(cle) >= 0 || cle === "journal";
    const immuable = cle === "audit" || cle === "journal";
    const mA = new Map((a||[]).map(x=>[x.id, x])), mN = new Map(n.map(x=>[x.id, x]));
    const cur = (courant[cle]||[]).slice();
    const pos = new Map(cur.map((x,i)=>[x && x.id, i]));
    let refus = 0;
    const permis = (avant, apres) => {
      if (admin || !parMat) return true;
      if (avant && avant.mat && !dansPerim(avant.mat)) return false;
      if (apres && apres.mat && !dansPerim(apres.mat) && !(AJOUT_LIBRE.indexOf(cle) >= 0 && !avant)) return false;
      return true;
    };
    /* ajouts et modifications */
    for (const [id, x] of mN){
      const avant = mA.get(id);
      if (avant && egal(avant, x)) continue;
      const i = pos.get(id), actuel = i !== undefined ? cur[i] : null;
      if (immuable && (avant || actuel)){ refus++; continue; }
      if (!permis(actuel || avant, x)){ refus++; continue; }
      let v = x;
      if (cle === "emps" && P.profil && P.profil.persoMasque && actuel){ v = Object.assign({}, x); CHAMPS_PERSO.forEach(k=>{ if (v[k] === MASQUE) v[k] = actuel[k]; }); }
      if (i !== undefined) cur[i] = v; else { pos.set(id, cur.length); cur.push(v); }
    }
    /* suppressions */
    if (!sansBase && !immuable) for (const [id, x] of mA){
      if (mN.has(id)) continue;
      const i = pos.get(id); if (i === undefined) continue;
      if (!permis(cur[i], null)){ refus++; continue; }
      cur[i] = undefined;
    }
    if (refus) ignores.push(cle+" ("+refus+" refusé(s))");
    out[cle] = cur.filter(x=>x !== undefined);
  }
  return {doc:out, ignores};
}
function fusionUsers(stockes, recus, moi){
  const r = (recus||[]).find(x=>x && x.id === moi.id);
  return (stockes||[]).map(u=>{
    if (u.id !== moi.id || !r) return u;
    const c = Object.assign({}, u); USER_SOI.forEach(k=>{ if (k in r) c[k] = r[k]; }); return c;
  });
}
module.exports = {perimetre, vue, fusionner, niveauProfil, peutEcrire};
