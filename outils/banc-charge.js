/* FIWAKTI — banc de charge (grand effectif).
   Usage : node outils/banc-charge.js <phase> [options]   (serveur déjà installé, compte administrateur)
     env : BANC_URL (http://localhost:8099), BANC_LOGIN, BANC_MDP
   Phases :
     referentiel   sites, services et pointeuses Push (une par site)
     employes N    import de N employés par /api/v1/donnees/sync, par lots de 1 000 (mesure le débit d'import)
     push N J      N badgeages envoyés par les pointeuses en mode Push (/iclock/cdata), sur J jours (débit d'ingestion)
     mesures       temps de réponse des écrans et recherches (médiane, p95, max) */
"use strict";
const URL_B = process.env.BANC_URL || "http://localhost:8099";
const LOGIN = process.env.BANC_LOGIN || "admin", MDP = process.env.BANC_MDP || "Kx7mPq2vLt9w";
let COOKIE = "", CSRF = "";

async function appel(methode, chemin, corps, entetes, sess){
  const t0 = performance.now();
  const r = await fetch(URL_B + chemin, {method:methode, headers:Object.assign({"Cookie":sess ? sess.cookie : COOKIE, "X-CSRF":sess ? sess.csrf : CSRF, "Accept-Encoding":"gzip"},
    corps !== undefined && typeof corps !== "string" ? {"Content-Type":"application/json"} : {}, entetes || {}),
    body:corps === undefined ? undefined : typeof corps === "string" ? corps : JSON.stringify(corps)});
  const texte = await r.text(), ms = performance.now() - t0;
  let j = null; try { j = JSON.parse(texte); } catch(e){}
  return {statut:r.status, ms, j, texte, taille:texte.length, r};
}
async function connexion(login, mdp){
  COOKIE = ""; CSRF = "";
  const r = await appel("POST", "/api/v1/connexion", {login:login || LOGIN, mdp:mdp || MDP});
  if (r.statut !== 200) throw new Error("connexion : "+r.statut+" "+r.texte.slice(0, 200));
  COOKIE = (r.r.headers.get("set-cookie")||"").split(";")[0];
  const s = await appel("GET", "/api/v1/session"); CSRF = s.j.csrf;
  return r.ms;
}
async function referentiel(){ const r = await appel("GET", "/api/v1/donnees"); return r.j; }

const NOMS = ["Ben Salah","Trabelsi","Gharbi","Jaziri","Mansouri","Hammami","Bouazizi","Khelifi","Chaabane","Ayari","Saidi","Dridi","Riahi","Mejri","Sassi","Zouari","Ferchichi","Baccouche","Jebali","Masmoudi"];
const PRENOMS = ["Amine","Ines","Mohamed","Fatma","Karim","Leila","Sonia","Salah","Youssef","Mariem","Hichem","Rim","Walid","Nour","Aymen","Sarra","Bilel","Hela","Omar","Asma"];
const NB_SITES = 20, NB_DEPTS = 300;

async function phaseReferentiel(){
  const d = await referentiel(), ref = d.ref;
  const sites = [], depts = [], terms = [];
  for (let i = 1; i <= NB_SITES; i++) sites.push({id:"bs"+i, code:"S"+i, nom:"Site "+i, ville:"", tz:"Africa/Tunis", actif:true});
  for (let i = 1; i <= NB_DEPTS; i++) depts.push({id:"bd"+i, nom:"Service "+i, parent:null, custom_fields:[], type:"std"});
  for (let i = 1; i <= NB_SITES; i++) terms.push({id:"bt"+i, nom:"Pointeuse "+i, pilote:"zk-push", sn:"BANC"+i, ip:"127.0.0.1", siteId:"bs"+i, actif:true, identifiantAppareil:"mat"});
  const r = await appel("POST", "/api/v1/donnees/sync", {ref:{sites:(ref.sites||[]).concat(sites), depts:(ref.depts||[]).concat(depts), terms:(ref.terms||[]).concat(terms)}});
  console.log("référentiel :", r.statut, r.j && r.j.ignores, Math.round(r.ms)+" ms");
}

/* comptes du portail salarié (un par employé, mot de passe temporaire = matricule) et un chef de site (périmètre
   limité au site 1, soit 2 500 salariés) */
async function phaseComptes(n){
  const d = await referentiel(), ref = d.ref;
  const profils = (ref.profils||[]).filter(p=>p.id !== "bpChef").concat([{id:"bpChef", nom:"Chef de site (banc)", mode:"regle", sites:["bs1"], depts:[], filtres:{}, inclus:[], exclus:[],
    droits:{EMP:"lecture", CAL:"lecture", PTG:"validation", ABS:"validation", ETA:"lecture", PAR:"aucun", TER:"aucun", SYS:"aucun"}}]);
  const users = (ref.users||[]).filter(u=>!/^(p1\d{5}|chef1)$/.test(u.login));
  for (let i = 1; i <= n; i++) users.push({id:"bu"+i, login:"p"+(100000 + i), nom:"Salarié "+i, empId:"be"+i, profilId:"prEmp", langue:"fr", actif:true, deleg:[], mdpTemp:true, mdpTempLe:new Date().toISOString().slice(0, 10)});
  users.push({id:"buChef", login:"chef1", nom:"Chef site 1", empId:"be20", profilId:"bpChef", langue:"fr", actif:true, deleg:[], mdpTemp:true, mdpTempLe:new Date().toISOString().slice(0, 10)});
  const r = await appel("POST", "/api/v1/donnees/sync", {ref:{profils, users}});
  console.log("comptes : "+n+" comptes portail + 1 chef de site : "+r.statut+" en "+Math.round(r.ms)+" ms ; taille du paramétrage : "+Math.round(JSON.stringify(Object.assign({}, ref, {users})).length / 1024)+" Ko");
}
function employe(i){
  const mat = String(100000 + i);
  return {id:"be"+i, mat, nom:NOMS[i % NOMS.length]+" "+(i % 997), prenom:PRENOMS[(i * 7) % PRENOMS.length], cin:String(10000000 + i * 13).slice(0, 8),
    siteId:"bs"+(1 + i % NB_SITES), deptId:"bd"+(1 + i % NB_DEPTS), entree:"20"+String(10 + i % 15)+"-01-02", sortie:i % 50 === 0 ? "2025-06-30" : "",
    email:"e"+i+"@banc.tn", tel:"", badge:String(4000000000 + i), calId:"c1", chefMat:i > 100 ? String(100000 + (i % 100) + 1) : "", poste:["Ouvrier","Technicien","Cadre","Agent"][i % 4], tts:[], rds:[]};
}
async function phaseEmployes(n){
  const lot = 1000, t0 = performance.now(), temps = [];
  for (let i = 1; i <= n; i += lot){
    const put = []; for (let k = i; k < Math.min(n + 1, i + lot); k++) put.push(employe(k));
    const r = await appel("POST", "/api/v1/donnees/sync", {colls:{emps:{put}}});
    if (r.statut !== 200 || (r.j.ignores||[]).length) console.log("lot", i, r.statut, r.texte.slice(0, 200));
    temps.push(r.ms);
    if ((i - 1) % 10000 === 0) console.log("  employés "+(i - 1 + put.length)+" — lot en "+Math.round(r.ms)+" ms");
  }
  const s = (performance.now() - t0) / 1000;
  console.log("import de "+n+" employés : "+s.toFixed(1)+" s, soit "+Math.round(n / s)+" employés/s ; lot de 1 000 : médiane "+Math.round(stat(temps).med)+" ms, max "+Math.round(stat(temps).max)+" ms");
}

/* badgeages : chaque employé badge entrée ~08:00 et sortie ~17:00 ; envoi par pointeuse (site), lignes ATTLOG */
async function phasePush(total, jours, nbEmps){
  nbEmps = nbEmps || 50000;
  const fin = new Date(); fin.setDate(fin.getDate() - 1);
  const p2 = n => String(n).padStart(2, "0"), j = d => d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  let envoyes = 0, t0 = performance.now(); const temps = [];
  const parLot = 500;
  outer:
  for (let jj = jours - 1; jj >= 0; jj--){
    const d = new Date(fin); d.setDate(d.getDate() - jj); const jour = j(d);
    const parSite = new Map();
    for (let i = 1; i <= nbEmps; i++){
      const s = 1 + i % NB_SITES, mat = String(100000 + i), m1 = (i * 7) % 30, m2 = (i * 11) % 40;
      if (!parSite.has(s)) parSite.set(s, []);
      parSite.get(s).push(mat+"\t"+jour+" 07:"+p2(40 + m1 % 20)+":00\t0\t1", mat+"\t"+jour+" 17:"+p2(m2)+":00\t1\t1");
    }
    const lots = [];
    for (const [s, l] of parSite) for (let k = 0; k < l.length; k += parLot) lots.push([s, l.slice(k, k + parLot)]);
    /* 20 pointeuses en parallèle, comme sur le terrain */
    let idx = 0;
    await Promise.all(Array.from({length:NB_SITES}, async ()=>{
      while (idx < lots.length && envoyes < total){
        const [s, l] = lots[idx++]; envoyes += l.length;
        const r = await appel("POST", "/iclock/cdata?SN=BANC"+s+"&table=ATTLOG&Stamp=1", l.join("\n"), {"Content-Type":"text/plain"});
        temps.push(r.ms);
        if (r.statut !== 200) console.log("push", r.statut, r.texte.slice(0, 120));
      }
    }));
    const sec = (performance.now() - t0) / 1000;
    console.log("  "+jour+" : "+envoyes+" badgeages envoyés, "+Math.round(envoyes / sec)+" /s");
    if (envoyes >= total) break outer;
  }
  const sec = (performance.now() - t0) / 1000, st = stat(temps);
  console.log("ingestion Push : "+envoyes+" badgeages en "+sec.toFixed(1)+" s, soit "+Math.round(envoyes / sec)+" badgeages/s ; lot de "+parLot+" : médiane "+Math.round(st.med)+" ms, p95 "+Math.round(st.p95)+" ms");
}

function stat(t){ const s = t.slice().sort((a, b)=>a - b); const q = x => s[Math.min(s.length - 1, Math.floor(x * s.length))]; return {med:q(0.5), p95:q(0.95), max:s[s.length - 1], n:s.length}; }
async function mesurer(nom, fn, n){
  const t = []; let taille = 0, statut = 0;
  for (let i = 0; i < (n || 5); i++){ const r = await fn(i); t.push(r.ms); taille = r.taille; statut = r.statut; }
  const s = stat(t);
  console.log((nom+" ".repeat(46)).slice(0, 46)+" "+String(statut).padEnd(4)+" méd "+String(Math.round(s.med)).padStart(6)+" ms  p95 "+String(Math.round(s.p95)).padStart(6)+" ms  max "+String(Math.round(s.max)).padStart(6)+" ms  "+Math.round(taille / 1024)+" Ko");
  return s;
}
/* chef de site : première connexion avec le matricule, puis mot de passe définitif */
async function connexionChef(){
  const MDP_CHEF = "Tq8!vRz3mLw9";
  try { await connexion("chef1", MDP_CHEF); return; } catch(e){}
  await connexion("chef1", "100020");
  const r = await appel("POST", "/api/v1/mot-de-passe", {actuel:"100020", nouveau:MDP_CHEF});
  if (r.statut !== 200) throw new Error("chef : "+r.texte);
  await connexion("chef1", MDP_CHEF);
}
async function phaseMesures(){
  const p2 = n => String(n).padStart(2, "0"), d = new Date(); d.setDate(d.getDate() - 1);
  const hier = d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  const d30 = new Date(d); d30.setDate(d30.getDate() - 29); const du = d30.getFullYear()+"-"+p2(d30.getMonth()+1)+"-"+p2(d30.getDate());
  const termes = ["ben", "100421", "amine trab", "zzz", "masmoudi 9", "1000"];
  await mesurer("connexion", ()=>appel("POST", "/api/v1/connexion", {login:LOGIN, mdp:MDP}), 3);
  await connexion();
  await mesurer("ouverture : /api/v1/donnees", ()=>appel("GET", "/api/v1/donnees?x="+Math.random()), 3);
  await mesurer("annuaire : 1re page (tri nom)", ()=>appel("GET", "/api/v1/employes?offset=0&limit=100"));
  await mesurer("annuaire : page 250 (tri matricule)", ()=>appel("GET", "/api/v1/employes?offset=25000&limit=100&tri=mat"));
  await mesurer("annuaire : recherche (frappe)", i=>appel("GET", "/api/v1/employes?limit=50&q="+encodeURIComponent(termes[i % termes.length])), 12);
  await mesurer("annuaire : filtre site + actifs", i=>appel("GET", "/api/v1/employes?limit=100&site=bs"+(1 + i)+"&statut=actifs"));
  await mesurer("annuaire : valeurs des filtres", ()=>appel("GET", "/api/v1/employes/valeurs"));
  await mesurer("annuaire : fiche (lot de 50)", i=>appel("POST", "/api/v1/employes/lot", {mats:Array.from({length:50}, (_, k)=>String(100001 + i * 50 + k))}));
  await mesurer("import : fiches complètes (1 000)", i=>appel("POST", "/api/v1/employes/complets", {mats:Array.from({length:1000}, (_, k)=>String(100001 + i * 1000 + k))}));
  await mesurer("badgeages : journal du jour p.1", ()=>appel("GET", "/api/v1/pointages?du="+hier+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("badgeages : journal 30 j, recherche", i=>appel("GET", "/api/v1/pointages?du="+du+"&au="+hier+"&offset=0&limit=100&q="+(100100 + i)));
  await mesurer("badgeages : 1 employé sur 30 j", i=>appel("GET", "/api/v1/pointages?du="+du+"&au="+hier+"&q="+(100200 + i)));
  await mesurer("calcul : accueil", ()=>appel("GET", "/api/v1/calcul/accueil"));
  await mesurer("calcul : journées du jour", ()=>appel("GET", "/api/v1/calcul/journees?du="+hier+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("calcul : anomalies du jour", ()=>appel("GET", "/api/v1/calcul/anomalies?du="+hier+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("calcul : synthèse 30 j (pages)", i=>appel("GET", "/api/v1/calcul/synthese?du="+du+"&au="+hier+"&offset="+(i*100)+"&limit=100"));
  await mesurer("à traiter", ()=>appel("GET", "/api/v1/a-traiter"));
  await mesurer("alertes", ()=>appel("GET", "/api/v1/alertes"));
  await mesurer("supervision des pointeuses", ()=>appel("GET", "/api/v1/pointeuses/supervision"));
  await mesurer("état du système", ()=>appel("GET", "/api/v1/systeme"), 2);
  await mesurer("modification d'une fiche (sync)", async i=>{
    const f = await appel("POST", "/api/v1/employes/complets", {mats:[String(100500 + i)]}), e = f.j.lignes[0];
    return appel("POST", "/api/v1/donnees/sync", {colls:{emps:{put:[Object.assign({}, e, {tel:"2000000"+i})]}}}); });
  await mesurer("annuaire juste après modification", i=>appel("GET", "/api/v1/employes?limit=50&q=ben"+i));
  await mesurer("badgeage temps réel (1 ligne Push)", i=>appel("POST", "/iclock/cdata?SN=BANC1&table=ATTLOG&Stamp=1", "100021\t"+hier+" 12:0"+i+":00\t0\t1", {"Content-Type":"text/plain"}));
}

async function phaseMesuresChef(){
  const p2 = n => String(n).padStart(2, "0"), d = new Date(); d.setDate(d.getDate() - 1);
  const hier = d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  const d30 = new Date(d); d30.setDate(d30.getDate() - 29); const du = d30.getFullYear()+"-"+p2(d30.getMonth()+1)+"-"+p2(d30.getDate());
  console.log("— chef de site (périmètre : site 1) —");
  await mesurer("ouverture : /api/v1/donnees", ()=>appel("GET", "/api/v1/donnees?x="+Math.random()), 3);
  await mesurer("annuaire : 1re page", ()=>appel("GET", "/api/v1/employes?offset=0&limit=100"));
  await mesurer("annuaire : recherche", i=>appel("GET", "/api/v1/employes?limit=50&q=ben"+i));
  await mesurer("badgeages : journal du jour p.1", ()=>appel("GET", "/api/v1/pointages?du="+hier+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("badgeages : journal 30 j", ()=>appel("GET", "/api/v1/pointages?du="+du+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("calcul : journées du jour", ()=>appel("GET", "/api/v1/calcul/journees?du="+hier+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("calcul : anomalies 7 j", ()=>appel("GET", "/api/v1/calcul/anomalies?du="+du+"&au="+hier+"&offset=0&limit=100"));
  await mesurer("calcul : synthèse 30 j", i=>appel("GET", "/api/v1/calcul/synthese?du="+du+"&au="+hier+"&offset="+(i*100)+"&limit=100"));
  await mesurer("calcul : accueil", ()=>appel("GET", "/api/v1/calcul/accueil"));
  await mesurer("à traiter", ()=>appel("GET", "/api/v1/a-traiter"));
}
/* charge simultanée : N utilisateurs qui enchaînent des écrans (sans pause) pendant D secondes, pendant que les 20
   pointeuses envoient chacune un badgeage toutes les 100 ms (200 badgeages/s, l'arrivée du matin) */
async function phaseConcurrence(n, duree, pauseMs){
  const p2 = x => String(x).padStart(2, "0"), d = new Date(); d.setDate(d.getDate() - 1);
  const hier = d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  const d7 = new Date(d); d7.setDate(d7.getDate() - 6); const du = d7.getFullYear()+"-"+p2(d7.getMonth()+1)+"-"+p2(d7.getDate());
  const ecrans = [
    ["annuaire (page)", i=>"/api/v1/employes?limit=50&offset="+((i * 50) % 40000)],
    ["annuaire (recherche)", i=>"/api/v1/employes?limit=20&q="+["ben", "amine trab", "1004", "salah 2", "masmoudi"][i % 5]],
    ["badgeages du jour", i=>"/api/v1/pointages?du="+hier+"&au="+hier+"&offset="+((i * 100) % 5000)+"&limit=100"],
    ["badgeages d'un salarié", i=>"/api/v1/pointages?du="+du+"&au="+hier+"&q="+(100001 + (i * 37) % 49000)],
    ["journées du jour", i=>"/api/v1/calcul/journees?du="+hier+"&au="+hier+"&offset="+((i * 100) % 5000)+"&limit=100"],
    ["anomalies 7 j", ()=>"/api/v1/calcul/anomalies?du="+du+"&au="+hier+"&limit=100"],
    ["à traiter", ()=>"/api/v1/a-traiter"],
    ["accueil", ()=>"/api/v1/calcul/accueil"]];
  const t = new Map(ecrans.map(e=>[e[0], []])); let erreurs = 0, pousses = 0; const tp = [];
  /* une session par utilisateur virtuel (le serveur limite le débit par session) */
  const sessions = [];
  for (let k = 0; k < n; k += 10){ const lot = await Promise.all(Array.from({length:Math.min(10, n - k)}, async ()=>{
    const r = await fetch(URL_B+"/api/v1/connexion", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({login:LOGIN, mdp:MDP})});
    const cookie = (r.headers.get("set-cookie")||"").split(";")[0], s2 = await (await fetch(URL_B+"/api/v1/session", {headers:{Cookie:cookie}})).json();
    return {cookie, csrf:s2.csrf}; })); sessions.push(...lot); }
  const codes = {};
  const vu = async k => { let i = k * 7;
    while (Date.now() < fin){ const [nom, url] = ecrans[i % ecrans.length]; const r = await appel("GET", url(i), undefined, undefined, sessions[k]); t.get(nom).push(r.ms); if (r.statut !== 200){ erreurs++; codes[r.statut] = (codes[r.statut]||0) + 1; } i++;
      if (pauseMs) await new Promise(ok=>setTimeout(ok, pauseMs * (0.5 + Math.random()))); } };
  const pointeuse = async s => { let m = 0;
    while (Date.now() < fin){ const h = new Date(); const ts = h.getFullYear()+"-"+p2(h.getMonth()+1)+"-"+p2(h.getDate())+" "+p2(h.getHours())+":"+p2(h.getMinutes())+":"+p2(h.getSeconds());
      const r = await appel("POST", "/iclock/cdata?SN=BANC"+s+"&table=ATTLOG&Stamp=1", String(100000 + s + NB_SITES * (m++ % 2400))+"\t"+ts+"\t0\t1", {"Content-Type":"text/plain"});
      tp.push(r.ms); pousses++; if (r.statut !== 200) erreurs++;
      await new Promise(ok=>setTimeout(ok, Math.max(0, 100 - r.ms))); } };
  const t0 = Date.now(), fin = t0 + duree * 1000;
  await Promise.all([...Array.from({length:n}, (_, k)=>vu(k)), ...Array.from({length:NB_SITES}, (_, s)=>pointeuse(s + 1))]);
  const sec = (Date.now() - t0) / 1000; let total = 0;
  console.log("— "+n+" utilisateurs simultanés"+(pauseMs ? " (un clic toutes les "+(pauseMs/1000)+" s en moyenne)" : " sans pause")+" + 20 pointeuses en temps réel, "+Math.round(sec)+" s —");
  for (const [nom, l] of t){ total += l.length; const st = stat(l); console.log((nom+" ".repeat(26)).slice(0, 26)+" n="+String(l.length).padStart(5)+"  méd "+String(Math.round(st.med)).padStart(5)+" ms  p95 "+String(Math.round(st.p95)).padStart(5)+" ms  max "+String(Math.round(st.max)).padStart(6)+" ms"); }
  const sp = stat(tp);
  console.log(("badgeage temps réel"+" ".repeat(26)).slice(0, 26)+" n="+String(tp.length).padStart(5)+"  méd "+String(Math.round(sp.med)).padStart(5)+" ms  p95 "+String(Math.round(sp.p95)).padStart(5)+" ms  max "+String(Math.round(sp.max)).padStart(6)+" ms");
  console.log("débit : "+Math.round(total / sec)+" écrans/s, "+Math.round(pousses / sec)+" badgeages/s ; erreurs : "+erreurs+(erreurs ? " "+JSON.stringify(codes) : ""));
}
/* export des éléments variables (tâche de fond) : un état du paramétrage sur une période, pour tout le personnel */
async function phaseEtat(idEtat, du, au){
  const d = await referentiel(), et = (d.ref.etats||[]).find(x=>x.id === (idEtat || "et3"));
  if (!et) throw new Error("état introuvable");
  const t0 = performance.now(), r = await appel("POST", "/api/v1/travaux", {type:"etat", etat:et, du, au, filtres:{}});
  if (r.statut !== 200) throw new Error(r.texte);
  let tr = r.j;
  while (tr.etat === "attente" || tr.etat === "en_cours"){ await new Promise(ok=>setTimeout(ok, 1000)); tr = ((await appel("GET", "/api/v1/travaux")).j.travaux || []).find(x=>x.id === tr.id) || tr; }
  console.log("export « "+et.nom+" » "+du+" → "+au+" : "+tr.etat+", "+tr.lignes+" lignes, "+Math.round((performance.now() - t0) / 1000)+" s"+(tr.motif ? " — "+tr.motif : ""));
}
/* modules : toutes les routes de lecture (BI, formation, médical, HSE, recrutement, compétences, évaluation,
   intégration, visiteurs), appel à froid puis à chaud */
const ROUTES_MODULES = ["/api/v1/bi/filtres", "/api/v1/bi/tableau?du={d30}&au={hier}", "/api/v1/bi/tableau?du={d30}&au={hier}&site=bs1",
  "/api/v1/formation/catalogue", "/api/v1/formation/sessions", "/api/v1/formation/besoins", "/api/v1/formation/habilitations",
  "/api/v1/medical/visites", "/api/v1/medical/aptitudes", "/api/v1/medical/maladies-pro", "/api/v1/medical/parametres",
  "/api/v1/hse/evenements", "/api/v1/hse/actions", "/api/v1/hse/risques", "/api/v1/hse/epi", "/api/v1/hse/indicateurs?du={d30}&au={hier}",
  "/api/v1/recrutement/postes", "/api/v1/recrutement/candidats", "/api/v1/recrutement/candidatures",
  "/api/v1/competences/catalogue", "/api/v1/competences/matrice", "/api/v1/competences/ecarts",
  "/api/v1/evaluation/campagnes", "/api/v1/evaluation/evaluations", "/api/v1/onboarding/modeles", "/api/v1/onboarding/parcours",
  "/api/v1/visiteurs/visites", "/api/v1/visiteurs/loge", "/api/v1/visiteurs/hotes"];
async function phaseModules(){
  const p2 = x => String(x).padStart(2, "0"), j = d => d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());
  const h = new Date(); h.setDate(h.getDate() - 1); const d30 = new Date(h); d30.setDate(d30.getDate() - 29);
  for (const r of ROUTES_MODULES){ const url = r.replace("{hier}", j(h)).replace("{d30}", j(d30));
    const froid = await appel("GET", url); const s = await mesurer(url.replace(/\?.*/, m=>m.length > 30 ? m.slice(0, 30)+"…" : m)+" [froid "+Math.round(froid.ms)+" ms]", ()=>appel("GET", url), 3);
    if (froid.statut !== 200) console.log("   → "+froid.statut+" "+froid.texte.slice(0, 120)); }
}
(async ()=>{
  const [phase, a, b, c] = process.argv.slice(2);
  await connexion();
  if (phase === "referentiel") await phaseReferentiel();
  else if (phase === "employes") await phaseEmployes(Number(a) || 50000);
  else if (phase === "push") await phasePush(Number(a) || 100000, Number(b) || 1, Number(c) || 50000);
  else if (phase === "mesures") await phaseMesures();
  else if (phase === "mesures-chef"){ await connexionChef(); await phaseMesuresChef(); }
  else if (phase === "concurrence") await phaseConcurrence(Number(a) || 100, Number(b) || 60, Number(c) || 0);
  else if (phase === "etat") await phaseEtat(a, b || "2026-09-01", c || "2026-09-30");
  else if (phase === "modules") await phaseModules();
  else if (phase === "modules-chef"){ await connexionChef(); await phaseModules(); }
  else if (phase === "comptes") await phaseComptes(Number(a) || 50000);
  else console.log("phase inconnue");
})().catch(e=>{ console.error(e); process.exit(1); });
