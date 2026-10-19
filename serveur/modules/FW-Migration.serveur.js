/* FW-Migration — assistant de migration vers FIWAKTI (v56.30).
   Lit des fichiers (CSV, TXT, Excel, JSON, XML), des dossiers (archive ZIP), des formulaires PDF à champs et des bases de
   données (PostgreSQL, MySQL / MariaDB, SQLite, SQL Server avec le composant optionnel), puis : aperçu → correspondance
   des colonnes → analyse sans écriture → import par lots → rapport → annulation possible.
   Règles : lecture seule sur la source ; aucune donnée métier inventée (calendrier, journée, formule, profil) ;
   référentiels inconnus mis en correspondance ou créés seulement sur décision explicite (sites, services) ;
   périodes clôturées jamais modifiées ; tout est tracé ; mots de passe des sources jamais conservés. */
"use strict";
const crypto = require("crypto"), path = require("path"), fs = require("fs");
const DDL = [
  "CREATE TABLE IF NOT EXISTS mig_profils (id TEXT PRIMARY KEY, nom TEXT NOT NULL, cible TEXT NOT NULL, signature TEXT, config TEXT NOT NULL, cree TEXT NOT NULL, par TEXT)",
  "CREATE TABLE IF NOT EXISTS mig_lots (id TEXT PRIMARY KEY, cible TEXT NOT NULL, source TEXT, statut TEXT NOT NULL, stats TEXT, cree TEXT NOT NULL, par TEXT, annule_le TEXT)",
  "CREATE TABLE IF NOT EXISTS mig_journal (lot TEXT NOT NULL, n INTEGER NOT NULL, coll TEXT NOT NULL, id TEXT NOT NULL, avant TEXT, PRIMARY KEY(lot, n))"];
const ddl = {pg:DDL, sqlite:DDL};
/* 56.33.11 : clé complète (lot, n) — la sauvegarde avance par clé ; « lot » seul sautait des lignes à une frontière de page */
const tables = {mig_profils:"id", mig_lots:"id", mig_journal:"lot, n"};
/* champs cibles (obligatoires marqués) et alias reconnus automatiquement dans les en-têtes */
const CIBLES = {
  salaries:[["mat",1,"رقم التسجيل|المعرف|المعرّف|الرقم|matricule|mat|id employe|code employe|employee id|personnel|n°|numero|codigo|cod empleado|idempleado|id empleado|nempleado"],["nom",1,"اللقب|الاسم العائلي|nom|last name|surname|nom de famille|apellidos|apellido|apellido1"],["prenom",1,"الاسم|prenom|prénom|first name|given name|nombre"],
    ["cin",0,"بطاقة التعريف|رقم بطاقة التعريف|cin|cni|piece identite|id card|dni|nif|documento"],["naissance",0,"تاريخ الولادة|naissance|date de naissance|birth|ddn|birthday|fechanacimiento|fecha nacimiento"],["entree",0,"تاريخ الانتداب|تاريخ الدخول|entree|entrée|date entree|embauche|hire date|date d'embauche|fechaalta|fecha alta|alta"],
    ["sortie",0,"تاريخ الخروج|تاريخ المغادرة|sortie|date sortie|date de depart|date de départ|leave date|fechabaja|fecha baja|baja"],["email",0,"البريد الإلكتروني|البريد|email|e-mail|mail|courriel"],["tel",0,"الهاتف|tel|telephone|téléphone|phone|mobile|telefono|movil"],["badge",0,"الشارة|رقم الشارة|badge|carte|card|num badge|tarjeta|ntarjeta"],
    ["pin",0,"pin|code pin"],["site",0,"الموقع|الفرع|site|etablissement|établissement|usine|location"],["dept",0,"القسم|المصلحة|service|departement|département|department|section|atelier|departamento|seccion"],
    ["calendrier",0,"الرزنامة|التوقيت|calendrier|horaire|planning|cycle|calendar|schedule|calendario|horario"],["poste",0,"الوظيفة|الخطة|poste|fonction|emploi|job|titre|puesto|cargo|categoria"]],
  badgeages:[["mat",1,"matricule|mat|id employe|employee id|user id|userid|badge|codigo|idempleado|id empleado|tarjeta|empleado"],["horodatage",0,"horodatage|date heure|datetime|timestamp|punch time|checktime"],["date",0,"date|jour|day|fecha"],
    ["heure",0,"heure|time|hour|hora"],["sens",0,"sens|type|direction|in out|entree sortie|checktype|state|tipo|sentido|entrada salida"],["terminal",0,"terminal|pointeuse|lecteur|device|reader|sn|lector|terminal id"]],
  /* v56.31 : paramétrage du temps repris de n'importe quelle source (jamais inventé : chaque valeur vient du fichier ou de la base) */
  journees:[["code",1,"code|code journee|code horaire|id|shift code|reference"],["nom",1,"nom|libelle|libellé|designation|désignation|journee|journée|horaire|shift|name|description"],
    ["plages",0,"plages|horaires|plages horaires|intervalles|time ranges|schedule|creneaux|créneaux"],["debut",0,"debut|début|heure debut|heure début|start|entree|entrée|from"],
    ["fin",0,"fin|heure fin|end|sortie|to"],["pause",0,"pause|pause dejeuner|pause déjeuner|break|repas"],["theorique",0,"theorique|théorique|duree|durée|heures|duree theorique|durée théorique|hours|duration"],
    ["tolEntree",0,"tolerance entree|tolérance entrée|tolerance retard|tolérance retard|tol in|grace in"],["tolSortie",0,"tolerance sortie|tolérance sortie|tol out|grace out"],["nuit",0,"nuit|night|de nuit"]],
  calendriers:[["calendrier",1,"calendrier|code calendrier|nom calendrier|cycle|planning|calendar|horaire|regime|régime"],["site",0,"site|etablissement|établissement|usine"],
    ["lundi",0,"lundi|lun|monday|mon|l"],["mardi",0,"mardi|mar|tuesday|tue"],["mercredi",0,"mercredi|mer|wednesday|wed"],["jeudi",0,"jeudi|jeu|thursday|thu"],
    ["vendredi",0,"vendredi|ven|friday|fri"],["samedi",0,"samedi|sam|saturday|sat"],["dimanche",0,"dimanche|dim|sunday|sun"],["date",0,"date|jour|day|fecha"],["journee",0,"journee|journée|code journee|code journée|horaire du jour|shift|code horaire"]],
  formules:[["code",1,"code|code formule|variable|compteur|code compteur|name|nom court"],["formule",1,"formule|expression|calcul|formula|definition|définition|regle|règle"],
    ["nom",0,"nom|libelle|libellé|designation|désignation|description|intitule|intitulé"],["unite",0,"unite|unité|unit"],["periode",0,"periode|période|period|frequence|fréquence"],["agregation",0,"agregation|agrégation|cumul|aggregation|mode"]]};
const JOURS_SEM = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
/* variables connues du moteur de formules (en plus des codes de formules et des types de temps TT_…) */
const VARS_BASE = ["THEORIQUE","PRESENCE","RETARD","RETARD_PAUSE","ABS_PAUSE","PENALITE","PAUSE_NON_BADGEE","AVANCE","PAVH","PAPH","NB_MARQ","SORTIE_MANQUANTE","JOUROUVRE","JOURSEM","FERIE","REPOS",
  "BASEJOUR","SEUIL1","HEBDO","ABSJUST","ABS_NON_PAYEE","ABS_PAYEE","DIMANCHE_ACTIF","DIMANCHE_MAJ","DIMANCHE_TRAV","FERIE_ACTIF","FERIE_MAJ","FERIE_TRAV","HS_REGLE","HS_REGLE_1","HS_REGLE_2","HS_SEUIL_2",
  "HS_SEUIL_JOUR","HS_TAUX_1","HS_TAUX_2","NUIT","NUIT_FENETRE","NUIT_MAJ","PAUSE_DEDUITE","PAUSE_DUREE","PAUSE_FENETRE","PAUSE_SEUIL","PAUSE_TYPE","PRESENCE_NETTE","RECUP","RECUP_MODE","REGLE_CAT","TEMPS_REGULIER"];
const hm = v => { const m = /^(\d{1,2})[:hH.](\d{2})/.exec(String(v||"").trim()); return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0")+":"+m[2] : null; };
const mn = h => +h.slice(0, 2) * 60 + +h.slice(3);
/* « 08:00-12:00 ; 13:00-17:00 », « 8h-12h / 13h-17h » → [{a, b}] */
function plagesDe(txt){ const out = []; String(txt||"").replace(/(\d{1,2}[:hH.]\d{2}|\d{1,2}\s*[hH])\s*(?:-|–|à|a|to|>)\s*(\d{1,2}[:hH.]\d{2}|\d{1,2}\s*[hH])/g, (m, x, y)=>{
  const f = z => hm(/[hH]\s*$/.test(z.trim()) ? z.replace(/\s*[hH]\s*$/, ":00") : z); const a = f(x), b = f(y); out.push(a && b ? {a, b} : {err:m}); return m; }); return out; }
/* durée : « 8:00 », « 8h30 », « 8 », « 8,5 », « 480 » (minutes) → minutes */
function dureeMin(v){ v = String(v||"").trim().replace(",", "."); if (!v) return null; const h = hm(v); if (h) return mn(h); const m = /^(\d+)\s*[hH]\s*(\d{0,2})$/.exec(v); if (m) return +m[1]*60 + (+m[2]||0);
  const n = Number(v); if (!isNaN(n)) return n > 24 ? Math.round(n) : Math.round(n*60); return null; }
/* correctif 33 : lettres de toutes les écritures (des en-têtes arabes donnaient une signature vide « ||| » : un profil
   enregistré s'appliquait à n'importe quel autre fichier arabe) */
const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f\u064B-\u0652]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function proposer(cible, colonnes){
  const m = {};
  /* 1.1.6 : d'abord les correspondances exactes pour tous les champs, ensuite seulement les ressemblances — avant, la
     colonne « Departement » était prise pour la date de sortie (« départ ») et toutes les lignes tombaient en erreur */
  const champs = CIBLES[cible].map(([k, , al])=>[k, al.split("|").map(norm)]), prise = c => Object.values(m).indexOf(c) >= 0;
  for (const [k, alias] of champs){ const c = colonnes.find(x=>!prise(x) && alias.indexOf(norm(x)) >= 0); if (c) m[k] = c; }
  for (const [k, alias] of champs){ if (m[k]) continue; const c = colonnes.find(x=>!prise(x) && alias.some(a=>a.length > 3 && norm(x).indexOf(a) >= 0)); if (c) m[k] = c; }
  return m;
}
/* ---------- lecteurs ---------- */
/* correctif 33 : encodages — UTF-16 (« Texte Unicode » d'Excel) reconnu à sa marque ; hors UTF-8 : arabe Windows (1256)
   ou occidental Windows (1252, « œ », « € »), au choix explicite ou d'après le texte (avant : latin1, arabe illisible) */
function decoder(buf, enc){
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  if (enc === "windows-1252") return dec1252(buf);
  if (enc && ["utf-8", "windows-1256"].indexOf(enc) >= 0) return new TextDecoder(enc).decode(buf).replace(/^\uFEFF/, "");
  const t = buf.toString("utf8"); if (t.indexOf("\uFFFD") < 0) return t.replace(/^\uFEFF/, "");
  /* lettres françaises accentuées (à â ç è é ê ë î ï ô ù û ü, identiques en 1252 et 1256) contre lettres arabes de 1256 */
  const fr = new Set([0xE0,0xE2,0xE7,0xE8,0xE9,0xEA,0xEB,0xEE,0xEF,0xF4,0xF9,0xFB,0xFC]), ar = new Set([0xE1,0xE3,0xE4,0xE5,0xE6,0xEC,0xED,0xF0,0xF1,0xF2,0xF3,0xF5,0xF6,0xF8,0xFA]);
  let nAr = 0, nFr = 0; for (const o of buf){ if (fr.has(o)) nFr++; else if ((o >= 0xC1 && o <= 0xDF) || ar.has(o)) nAr++; }
  return nAr > nFr ? new TextDecoder("windows-1256").decode(buf) : dec1252(buf);
}
/* 0x80-0x9F de windows-1252 (€, œ, Œ, guillemets…) : le décodeur de Node les lit comme latin1 */
const W1252 = "\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178";
function dec1252(buf){ return new TextDecoder("latin1").decode(buf).replace(/[\u0080-\u009F]/g, c=>W1252[c.charCodeAt(0) - 0x80]); }
/* correctif 33 : en-têtes en double renommés « Nom (2) » (la première colonne était perdue sans avertissement) */
function entetes(l){ const vus = {}; return l.map((h, i)=>{ let n = String(h == null ? "" : h).trim() || "Colonne "+(i+1); const b = n; let k = 1; while (vus[n]) n = b+" ("+(++k)+")"; vus[n] = 1; return n; }); }
function lireCSV(txt){
  const l1 = txt.split(/\r?\n/, 1)[0] || "", seps = [";", ",", "\t", "|"], sep = seps.map(s=>[s, l1.split(s).length]).sort((a, b)=>b[1] - a[1])[0][0];
  /* correctif 33 : guillemet ouvrant seulement en début de cellule (« Ecran 12" » avalait les lignes suivantes) ; numéro de
     ligne d'origine gardé pour le rapport ; guillemet jamais refermé signalé */
  const rows = [], nums = []; let row = [], cell = "", q = false, ligne = 1, debut = 1, debutQ = 0;
  for (let i = 0; i < txt.length; i++){ const c = txt[i];
    if (q){ if (c === '"'){ if (txt[i+1] === '"'){ cell += '"'; i++; } else q = false; } else { if (c === "\n") ligne++; cell += c; } continue; }
    if (c === '"' && cell === ""){ q = true; debutQ = ligne; } else if (c === sep){ row.push(cell); cell = ""; } else if (c === "\n" || c === "\r"){ if (c === "\r" && txt[i+1] === "\n") i++; row.push(cell); rows.push(row); nums.push(debut); row = []; cell = ""; ligne++; debut = ligne; } else cell += c; }
  if (cell !== "" || row.length){ row.push(cell); rows.push(row); nums.push(debut); }
  const ent = entetes(rows.shift() || []); nums.shift();
  const lignes = []; rows.forEach((r, k)=>{ if (!r.some(x=>String(x).trim() !== "")) return; const o = Object.fromEntries(ent.map((h, i)=>[h, (r[i] == null ? "" : String(r[i])).trim()])); Object.defineProperty(o, "__ligne", {value:nums[k], enumerable:false}); lignes.push(o); });
  return {colonnes:ent, lignes, avertissements:q ? ["guillemet ouvert ligne "+debutQ+" jamais refermé : vérifiez le fichier"] : []};
}
/* 1.1.3 : lecteur XML robuste (exports .NET « DataSet » de Netime avec schéma xs:schema, balises vides <TARJETA />,
   enregistrements en attributs <PERSONAL CODIGO="1" … />) : un enregistrement = l'élément le plus fréquent dont les
   enfants sont des valeurs simples ; colonnes = attributs + enfants */
function lireXML(txt){
  txt = String(txt).replace(/^\uFEFF/, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, c)=>c.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .replace(/<(\w+:)?schema[\s\S]*?<\/(\w+:)?schema>/g, "");
  const dec = v => String(v).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n)=>String.fromCharCode(+n)).replace(/&amp;/g, "&");
  const nomSimple = n => n.indexOf(":") >= 0 ? n.split(":").pop() : n;
  const racine = {nom:"", enfants:[], attrs:{}, texte:""}, pile = [racine], re = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g; let m;
  while ((m = re.exec(txt))){
    if (m[5] !== undefined){ if (m[5].trim()) pile[pile.length-1].texte += m[5]; continue; }
    if (m[1]){ if (pile.length > 1) pile.pop(); continue; }
    const n = {nom:nomSimple(m[2]), enfants:[], attrs:{}, texte:""}; (m[3]||"").replace(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, a, b)=>{ if (!/^xmlns/.test(k)) n.attrs[nomSimple(k)] = dec(a != null ? a : b); return x; });
    pile[pile.length-1].enfants.push(n); if (!m[4]) pile.push(n);
  }
  const feuille = n => !n.enfants.length;
  const cand = {}; (function parcourir(n){ n.enfants.forEach(c=>{ const simple = c.enfants.length ? c.enfants.every(feuille) : Object.keys(c.attrs).length > 0;
    if (simple) cand[c.nom] = (cand[c.nom]||0) + 1; parcourir(c); }); })(racine);
  const t = Object.entries(cand).sort((a, b)=>b[1] - a[1])[0]; if (!t) return {colonnes:[], lignes:[]};
  const lignes = [], cols = new Set();
  (function collecter(n){ n.enfants.forEach(c=>{ if (c.nom === t[0]){ const o = Object.assign({}, c.attrs); c.enfants.forEach(e=>{ o[e.nom] = dec(e.texte.trim()); }); Object.keys(o).forEach(k=>cols.add(k)); lignes.push(o); } else collecter(c); }); })(racine);
  return {colonnes:Array.from(cols), lignes:lignes.map(o=>{ const r = {}; cols.forEach(k=>{ r[k] = o[k] == null ? "" : o[k]; }); return r; })};
}
function estSqlite(buf){ return Buffer.isBuffer(buf) && buf.length >= 16 && buf.slice(0, 16).toString("latin1") === "SQLite format 3\u0000"; }
async function lireFichier(nom, buf, enc){
  const ext = (path.extname(nom).slice(1) || "").toLowerCase(), jeux = [];
  if (["csv", "txt", "tsv"].indexOf(ext) >= 0) jeux.push(Object.assign({nom}, lireCSV(decoder(buf, enc))));
  /* v56.31 : classeur lu dans un fil isolé (mémoire et durée bornées) — la bibliothèque xlsx 0.18 a des failles connues
     (pollution de prototype, expressions régulières coûteuses) sur fichiers piégés : elles ne peuvent plus toucher au serveur */
  else if (["xlsx", "xls", "xlsm", "ods"].indexOf(ext) >= 0){ (await lireClasseurIsole(buf)).forEach(f=>{ if (!f.aoa.length) return;
      const ent = entetes(f.aoa[0]); jeux.push({nom:nom+" › "+f.nom, colonnes:ent, lignes:f.aoa.slice(1).map((r, k)=>{ if (!r.some(x=>String(x).trim() !== "")) return null; const o = Object.fromEntries(ent.map((h, i)=>[h, String(r[i] == null ? "" : r[i]).trim()])); Object.defineProperty(o, "__ligne", {value:k+2, enumerable:false}); return o; }).filter(Boolean)}); }); }
  else if (ext === "json"){ let d = JSON.parse(decoder(buf, enc)); if (!Array.isArray(d)) d = (Object.values(d).find(Array.isArray)) || [d];
    const cols = new Set(); d.forEach(o=>Object.keys(o||{}).forEach(k=>cols.add(k))); jeux.push({nom, colonnes:Array.from(cols), lignes:d.map(o=>Object.fromEntries(Array.from(cols).map(k=>[k, o && o[k] != null && typeof o[k] !== "object" ? String(o[k]) : ""])))}); }
  else if (ext === "xml") jeux.push(Object.assign({nom}, lireXML(decoder(buf, enc))));
  else if (ext === "pdf"){ const r = await lireFormulaire(buf); jeux.push({nom, colonnes:Object.keys(r), lignes:[r], formulaire:true}); }
  /* 56.33.3 : toute base SQLite, quelle que soit son extension (.sl3 de Netime, .s3db, .db3…), reconnue à sa signature */
  else if (["sqlite", "db", "sqlite3", "sl3", "s3db", "db3", "sdb"].indexOf(ext) >= 0 || estSqlite(buf)) jeux.push({nom, baseSqlite:true, buf});
  else throw Object.assign(new Error("Format non pris en charge : ."+ext+" (CSV, TXT, Excel, JSON, XML, PDF à champs, SQLite, ZIP)."), {code:400});
  return jeux;
}
function lireClasseurIsole(buf){
  const {Worker} = require("worker_threads");
  const code = `const {parentPort, workerData} = require("worker_threads"); const X = require(workerData.mod);
    const wb = X.read(Buffer.from(workerData.buf), {type:"buffer", cellDates:false, cellNF:true}); const out = [];
    /* correctif 33 : vraie cellule date écrite en AAAA-MM-JJ (le texte affiché « m/d/yy » inversait jour et mois) */
    for (const f of wb.SheetNames){ const ws = wb.Sheets[f]; for (const a in ws){ if (a[0] === "!") continue; const c = ws[a];
        if (c && c.t === "n" && c.z && X.SSF.is_date(c.z)) c.w = X.SSF.format(c.v % 1 ? (c.v < 1 ? "hh:mm:ss" : "yyyy-mm-dd hh:mm:ss") : "yyyy-mm-dd", c.v); }
      out.push({nom:f, aoa:X.utils.sheet_to_json(ws, {header:1, raw:false, defval:""}).slice(0, 2000001)}); }
    parentPort.postMessage(out);`;
  return new Promise((ok, ko)=>{
    const w = new Worker(code, {eval:true, workerData:{buf, mod:require.resolve("xlsx")}, resourceLimits:{maxOldGenerationSizeMb:1536}});
    const t = setTimeout(()=>{ w.terminate(); ko(Object.assign(new Error("Classeur trop long à lire (plus de 2 min) : enregistrez-le en CSV."), {code:400})); }, 120000);
    w.once("message", r=>{ clearTimeout(t); w.terminate(); ok(r); });
    w.once("error", e=>{ clearTimeout(t); ko(Object.assign(new Error("Classeur illisible : "+String(e.message||e).slice(0, 120)), {code:400})); });
  });
}
async function lireFormulaire(buf){
  const {PDFDocument} = require("pdf-lib"), doc = await PDFDocument.load(buf, {ignoreEncryption:true}), o = {};
  let champs = []; try { champs = doc.getForm().getFields(); } catch(e){}
  if (!champs.length) throw Object.assign(new Error("Ce PDF ne contient pas de champs de formulaire (un formulaire scanné doit d'abord être ressaisi ou exporté)."), {code:400});
  for (const f of champs){ const n = f.getName(), t = f.constructor.name; let v = "";
    try { if (t === "PDFTextField") v = f.getText() || ""; else if (t === "PDFCheckBox") v = f.isChecked() ? "Oui" : "Non"; else if (t === "PDFDropdown" || t === "PDFOptionList") v = (f.getSelected()||[]).join(", "); else if (t === "PDFRadioGroup") v = f.getSelected() || ""; } catch(e){}
    o[n] = String(v).trim(); }
  return o;
}
async function lireZip(buf, enc){
  /* v56.31 : archive bornée (2 000 fichiers, 200 Mo par fichier, 600 Mo au total) — une archive piégée ne sature plus la mémoire */
  let total = 0, nb = 0; const ignores = [];
  const {unzipSync} = require("fflate"), fichiers = unzipSync(new Uint8Array(buf), {filter:f=>{ nb++; total += f.originalSize || 0;
    if (nb > 2000 || (f.originalSize || 0) > 200e6 || total > 600e6){ ignores.push(f.name); return false; } return true; }}), jeux = [], formulaires = [], erreurs = [];
  if (ignores.length) erreurs.push(ignores.length+" fichier(s) ignoré(s) : archive trop volumineuse (au plus 2 000 fichiers, 200 Mo par fichier, 600 Mo au total).");
  for (const [nom, contenu] of Object.entries(fichiers)){ if (nom.endsWith("/") || /(^|\/)(__MACOSX|\.)/.test(nom)) continue; const b = Buffer.from(contenu);
    try { if (/\.pdf$/i.test(nom)) formulaires.push(Object.assign({"Fichier":path.basename(nom)}, await lireFormulaire(b))); else (await lireFichier(path.basename(nom), b, enc)).forEach(j=>jeux.push(j)); }
    catch(e){ erreurs.push(nom+" : "+e.message); } }
  if (formulaires.length){ const cols = new Set(); formulaires.forEach(o=>Object.keys(o).forEach(k=>cols.add(k))); jeux.push({nom:"Formulaires PDF ("+formulaires.length+")", colonnes:Array.from(cols), lignes:formulaires.map(o=>Object.fromEntries(Array.from(cols).map(k=>[k, o[k] || ""]))), formulaire:true}); }
  return {jeux, erreurs};
}
/* ---------- bases de données (lecture seule) ---------- */
function exigerLecture(q){
  const s = String(q||"").trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(s) || /;/.test(s) || /\b(insert|update|delete|drop|alter|create|truncate|merge|grant|exec|execute|call|into)\b/i.test(s.replace(/'[^']*'/g, "")))
    throw Object.assign(new Error("Seules les requêtes de lecture (SELECT) sont acceptées."), {code:400});
  return s;
}
/* 1.1.4 : requête nettoyée avant d'être encapsulée (point-virgule final) — la clause LIMIT de l'utilisateur ne provoque
   plus d'erreur de syntaxe (« near "LIMIT" ») : la limite de l'écran s'applique en plus, à l'extérieur */
const propre = sql => String(sql||"").trim().replace(/;+\s*$/, "");
/* 1.1.6 : chemins de services (« MAT D\OP2A2\Assembly_3320 », « Usine / Atelier / Ligne ») — l'organigramme est construit
   niveau par niveau ; un niveau déjà présent (même nom, même parent) est réutilisé */
const segments = v => String(v||"").split(/\s*[\\/>|]\s*/).map(x=>x.trim()).filter(Boolean);
function deptParChemin(depts, chemin){ const seg = segments(chemin); if (seg.length < 2) return null; let parent = null, id = null;
  for (const nom of seg){ const d = depts.find(z=>norm(z.nom) === norm(nom) && (z.parent || null) === parent); if (!d) return null; parent = d.id; id = d.id; } return id; }
function creerChemin(depts, chemin, journal){ const seg = segments(chemin); let parent = null, id = null;
  for (const nom of (seg.length ? seg : [String(chemin)])){ let d = depts.find(z=>norm(z.nom) === norm(nom) && (z.parent || null) === parent);
    if (!d){ d = {id:"d"+crypto.randomBytes(4).toString("hex"), nom:nom.slice(0, 80), parent}; depts.push(d); journal(d); } parent = d.id; id = d.id; }
  return id; }
function creerBases(o){
  const racine = o.racine || process.cwd();
  function exiger(nom){ try { return require(nom); } catch(e){
    try { return require(path.join(racine, "connecteurs", "node_modules", nom)); } catch(e2){
      throw Object.assign(new Error(nom === "mssql" ? "Composant SQL Server absent : déposez le dossier « connecteurs » fourni (FIWAKTI-connecteur-sqlserver.zip) à la racine de FIWAKTI, puis relancez." : "Pilote "+nom+" indisponible."), {code:501}); } } }
  async function ouvrir(c){
    const t = c.type, lim = Math.min(2000000, Math.max(1, +c.limite || 200000));
    if (t === "postgres"){ const {Client} = exiger("pg"), cl = new Client({host:c.hote, port:+c.port || 5432, database:c.base, user:c.utilisateur, password:c.mdp, connectionTimeoutMillis:10000, statement_timeout:120000, ssl:c.ssl ? {rejectUnauthorized:false} : undefined});
      await cl.connect(); await cl.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
      return {tables:async ()=>(await cl.query("SELECT table_schema||'.'||table_name t FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1")).rows.map(r=>r.t),
        lire:async (sql)=>(await cl.query("SELECT * FROM ("+propre(sql)+") AS fiwakti_src LIMIT "+lim)).rows, fermer:()=>cl.end()}; }
    if (t === "mysql"){ const my = exiger("mysql2/promise"), cn = await my.createConnection({host:c.hote, port:+c.port || 3306, database:c.base, user:c.utilisateur, password:c.mdp, connectTimeout:10000});
      await cn.query("SET SESSION TRANSACTION READ ONLY");
      return {tables:async ()=>(await cn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY 1"))[0].map(r=>r.t || r.T || r.TABLE_NAME),
        lire:async (sql)=>(await cn.query("SELECT * FROM ("+propre(sql)+") AS fiwakti_src LIMIT "+lim))[0], fermer:()=>cn.end()}; }
    if (t === "mssql"){ const ms = exiger("mssql"), pool = await ms.connect({server:c.hote, port:+c.port || 1433, database:c.base, user:c.utilisateur, password:c.mdp, options:{encrypt:!!c.ssl, trustServerCertificate:true, readOnlyIntent:true}, connectionTimeout:10000, requestTimeout:120000});
      return {tables:async ()=>(await pool.request().query("SELECT TABLE_SCHEMA+'.'+TABLE_NAME t FROM INFORMATION_SCHEMA.TABLES ORDER BY 1")).recordset.map(r=>r.t),
        lire:async (sql)=>(await pool.request().query("SELECT TOP "+lim+" * FROM ("+propre(sql)+") AS fiwakti_src")).recordset, fermer:()=>pool.close()}; }
    /* v56.31 : uniquement une base déposée dans l'assistant (dossier donnees/migration) — jamais un fichier quelconque du
       serveur (dont la base de FIWAKTI elle-même) */
    if (t === "sqlite"){ const {DatabaseSync} = require("node:sqlite"), dm = path.resolve(o.dossierDonnees || ".", "migration"), fc = path.join(dm, path.basename(String(c.fichier||"")));
      if (!c.fichier || path.dirname(fc) !== dm || !fs.existsSync(fc)) throw Object.assign(new Error("Base SQLite introuvable : déposez le fichier .sqlite dans l'assistant."), {code:400});
      c.fichier = fc;
      const db = new DatabaseSync(c.fichier, {readOnly:true});
      /* correctif 33 : requête lue dans un fil séparé, arrêtée après 2 min (une requête récursive figeait tout le serveur) */
      const lireIsole = sql => new Promise((ok, ko)=>{ const {Worker} = require("worker_threads");
        const w = new Worker("const {parentPort, workerData} = require('worker_threads'); const {DatabaseSync} = require('node:sqlite'); const d = new DatabaseSync(workerData.f, {readOnly:true}); try { parentPort.postMessage({r:d.prepare(workerData.q).all()}); } catch(e){ parentPort.postMessage({e:String(e.message || e)}); } finally { d.close(); }",
          {eval:true, workerData:{f:c.fichier, q:"SELECT * FROM ("+propre(sql)+") AS fiwakti_src LIMIT "+lim}, resourceLimits:{maxOldGenerationSizeMb:1536}});
        const t = setTimeout(()=>{ w.terminate(); ko(Object.assign(new Error("Requête trop longue (plus de 2 min) : simplifiez-la ou limitez le nombre de lignes."), {code:400})); }, 120000);
        w.once("message", m=>{ clearTimeout(t); w.terminate(); m.e !== undefined ? ko(Object.assign(new Error(m.e), {code:400})) : ok(m.r); });
        w.once("error", e=>{ clearTimeout(t); ko(Object.assign(new Error("Lecture impossible : "+String(e.message || e).slice(0, 160)), {code:400})); }); });
      return {tables:async ()=>db.prepare("SELECT name t FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY 1").all().map(r=>r.t),
        lire:lireIsole, fermer:()=>db.close()}; }
    throw Object.assign(new Error("Type de base non pris en charge (PostgreSQL, MySQL / MariaDB, SQL Server, SQLite). Access : exportez les tables en Excel ou CSV."), {code:400});
  }
  return {ouvrir};
}
/* ---------- transformations ---------- */
/* correctif 33 : date réelle exigée (31/02, mois 13, 0000-00-00 refusés) ; plus de lecture « au hasard » par new Date
   (« 0 » donnait 2000-01-01, « 2024 » le 01/01/2024) */
const jourVrai = (y, m, d) => { const t = new Date(Date.UTC(+y, +m - 1, +d)); return +y >= 1900 && +y <= 2100 && t.getUTCFullYear() === +y && t.getUTCMonth() === +m - 1 && t.getUTCDate() === +d; };
function dateISO(v, fmt){ const r = dateISO0(v, fmt); if (!r || r[0] === "!") return r; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r); return m && jourVrai(m[1], m[2], m[3]) ? r : "!"+String(v).trim(); }
function dateISO0(v, fmt){
  v = String(v == null ? "" : v).trim(); if (!v) return "";
  if (/^\d{4,5}(\.\d+)?$/.test(v) && (fmt === "excel" || (!fmt && +v > 20000 && +v < 80000))){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+v * 86400000)); return d.toISOString().slice(0, 10); }
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v))) return m[1]+"-"+m[2].padStart(2, "0")+"-"+m[3].padStart(2, "0");
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v))){ const y = m[3].length === 2 ? (+m[3] > (new Date().getFullYear() % 100) + 5 ? "19" : "20")+m[3] : m[3];   /* v56.31 : « 75 » → 1975 */ const [j, mo] = fmt === "mdy" ? [m[2], m[1]] : [m[1], m[2]];
    return y+"-"+String(mo).padStart(2, "0")+"-"+String(j).padStart(2, "0"); }
  return "!"+v;
}
function heureHM(v){ v = String(v == null ? "" : v).trim(); const m = /(\d{1,2})[:hH.](\d{2})(?::(\d{2}))?/.exec(v); if (m) return +m[1] < 24 && +m[2] < 60 && +(m[3]||0) < 60 ? m[1].padStart(2, "0")+":"+m[2]+":"+(m[3]||"00") : "!"+v;
  if (/^\d{3,4}$/.test(v)){ const p = v.padStart(4, "0"); return p.slice(0, 2)+":"+p.slice(2)+":00"; } if (/^0?\.\d+$/.test(v)){ const s = Math.round(+v * 86400); return [s/3600|0, (s%3600)/60|0, s%60].map(x=>String(x).padStart(2, "0")).join(":"); } return "!"+v; }
function horodatage(v, fmt){ v = String(v == null ? "" : v).trim(); if (!v) return ""; if (/^\d{4,5}\.\d+$/.test(v)){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(+v * 86400000)); return d.toISOString().slice(0, 19).replace("T", " "); }
  const d = dateISO(v, fmt), h = (/[T\s](\d{1,2}[:hH]\d{2}(?::\d{2})?)/.exec(v)||[])[1]; return d && h ? d+" "+heureHM(h) : "!"+v; }
function creer(o){
  const {B, D, audit} = o, BASES = creerBases(o), JEUX = new Map(), maint = () => new Date().toISOString(), id = p => p+"-"+crypto.randomBytes(6).toString("hex");
  let VERROU = null, INIT = false;
  const garder = (jeux, par) => jeux.map(j=>{ const k = id("mj"); JEUX.set(k, {nom:j.nom, colonnes:j.colonnes, lignes:j.lignes, formulaire:!!j.formulaire, par, le:Date.now()}); return {id:k, nom:j.nom, colonnes:j.colonnes, nb:j.lignes.length, apercu:j.lignes.slice(0, 20), formulaire:!!j.formulaire}; });
  function nettoyer(){ const lim = Date.now() - 2 * 3600000; for (const [k, j] of JEUX) if (j.le < lim) JEUX.delete(k);
    /* v56.31 : bases SQLite déposées supprimées après 24 h (elles peuvent contenir des données personnelles) */
    try { const dm = path.join(o.dossierDonnees || ".", "migration"); if (fs.existsSync(dm)) for (const f of fs.readdirSync(dm)){ const p = path.join(dm, f);
      if (fs.statSync(p).mtimeMs < Date.now() - 24 * 3600000) fs.unlinkSync(p); } } catch(e){} }
  /* ligne source → enregistrement FIWAKTI (sans écrire) */
  function transformer(cible, r, map, tr, corr, ref){
    const v = k => map[k] ? String(r[map[k]] == null ? "" : r[map[k]]).trim() : "", err = [];
    if (cible === "journees") return transformerJournee(v, err);
    if (cible === "calendriers") return transformerCalendrier(v, map, err, corr, ref);
    if (cible === "formules") return transformerFormule(v, map, err);
    let mat = v("mat"); if (tr.zeros && mat && /^\d+$/.test(mat)) mat = mat.padStart(Math.min(20, Math.max(0, Math.floor(+tr.zeros) || 0)), "0");
    if (!mat) err.push("matricule vide");
    if (cible === "salaries"){
      const x = {mat, nom:v("nom"), prenom:v("prenom")}; if (!x.nom) err.push("nom vide"); if (!x.prenom) err.push("prénom vide");
      /* correctif 33 : une cellule vide ne vide plus le champ existant (sauf choix explicite « vider ») */
      for (const k of ["cin", "email", "tel", "badge", "pin", "poste"]) if (map[k] && (v(k) !== "" || tr.vider === true)) x[k] = v(k);
      for (const k of ["naissance", "entree", "sortie"]) if (map[k] && v(k)){ x[k] = dateISO(v(k), tr.date); if (x[k][0] === "!"){ err.push(k+" illisible : "+x[k].slice(1)); delete x[k]; } }
      const refs = {};
      for (const [k, coll, champ] of [["site", "sites", "siteId"], ["dept", "depts", "deptId"], ["calendrier", "cals", "calId"]]){ if (!map[k] || !v(k)) continue; const val = v(k);
        const c = corr[k] && corr[k][val]; if (c === "__ignorer" || c === "__creer"){ if (c === "__creer" && k === "calendrier") x.__calCreer = val; continue; }   /* « créer » : résolu à l'import */
        const tr2 = c || ((ref[coll]||[]).find(z=>norm(z.nom) === norm(val) || norm(z.code||"") === norm(val) || z.id === val) || {}).id || (k === "dept" ? deptParChemin(ref.depts||[], val) : null);
        if (tr2) x[champ] = tr2; else refs[k] = val; }
      return {x, err, refs};
    }
    let ts = map.horodatage ? horodatage(v("horodatage"), tr.date) : (v("date") && v("heure") ? dateISO(v("date"), tr.date)+" "+heureHM(v("heure")) : "");
    if (!ts) err.push("date / heure absentes"); else if (ts.indexOf("!") >= 0) err.push("date / heure illisibles : "+ts.replace(/!/g, ""));
    let sens = v("sens"); const cs = (tr.sens||{})[sens]; if (cs) sens = cs; else if (/^(e|in|i|entree|entrée|0|checkin|c\/in)$/i.test(sens)) sens = "E"; else if (/^(s|out|o|sortie|1|checkout|c\/out)$/i.test(sens)) sens = "S"; else sens = map.sens && String(sens == null ? "" : sens).trim() !== "" ? "?" : "";   /* 1.1.10 : sens vide (Netime) → déduit par l'ordre des badgeages, plus une erreur */
    return {x:{mat, ts, sens, dev:v("terminal")}, err, refs:{}};
  }
  /* ---- journée type : plages explicites ou début / fin / pause ; théorique lu ou calculé à partir des plages ---- */
  function transformerJournee(v, err){
    const x = {code:v("code"), nom:v("nom") || v("code")}; if (!x.code) err.push("code vide");
    let pl = [];
    if (v("plages")){ pl = plagesDe(v("plages")); if (!pl.length || pl.some(p=>p.err)) err.push("plages illisibles : « "+v("plages")+" »"); }
    else if (v("debut") || v("fin")){ const a = hm(v("debut")), b = hm(v("fin")); if (!a || !b) err.push("début ou fin illisible"); else pl = [{a, b}]; }
    else err.push("aucune plage (colonnes « plages » ou « début / fin »)");
    /* 1.1.11 : pause donnée en durée seule (« 60 », « 00:30 », « 1h ») = pause de N minutes prise dans la journée ;
       une plage (« 12:00-13:00 ») reste une pause à heures fixes */
    const vp = String(v("pause")||"").trim(), estPlage = /\d\s*[-–]\s*\d/.test(vp);
    const pauseDuree = vp && !estPlage ? (/^\d+$/.test(vp) ? +vp : dureeMin(vp)) : null;
    const pause = vp && estPlage ? plagesDe(vp)[0] : null;
    if (vp && estPlage && (!pause || pause.err)) err.push("pause illisible : « "+vp+" »");
    if (vp && !estPlage && (pauseDuree == null || pauseDuree < 0 || pauseDuree > 600)) err.push("pause illisible : « "+vp+" » (durée en minutes ou plage 12:00-13:00)");
    const plages = []; pl.filter(p=>!p.err).forEach(p=>{
      const nuit = mn(p.b) <= mn(p.a);
      if (pause && !pause.err && !nuit && mn(pause.a) > mn(p.a) && mn(pause.b) < mn(p.b)){ plages.push({t:"oblig", a:p.a, b:pause.a}, {t:"pause", a:pause.a, b:pause.b, duree:mn(pause.b) - mn(pause.a)}, {t:"oblig", a:pause.b, b:p.b}); }
      else plages.push({t:nuit ? "nuit" : "oblig", a:p.a, b:p.b}); });
    /* contrôles : ordre et chevauchements (hors plage de nuit) */
    const jour = plages.filter(p=>p.t !== "nuit" && p.t !== "pause").sort((p, q)=>mn(p.a) - mn(q.a));
    for (let i = 0; i < jour.length; i++){ if (mn(jour[i].b) <= mn(jour[i].a)) err.push("plage incohérente "+jour[i].a+"–"+jour[i].b); if (i && mn(jour[i].a) < mn(jour[i-1].b)) err.push("plages qui se chevauchent"); }
    if (pauseDuree && plages.length){ const p0 = plages[0], pn = plages[plages.length-1]; plages.push({t:"pause", a:p0.a, b:pn.b, duree:pauseDuree}); }
    const travail = plages.filter(p=>p.t !== "pause").reduce((s, p)=>s + ((mn(p.b) - mn(p.a) + 1440) % 1440 || 1440), 0) - (pauseDuree || 0);
    const theo = v("theorique") ? dureeMin(v("theorique")) : travail; if (v("theorique") && theo == null) err.push("durée théorique illisible : « "+v("theorique")+" »");
    x.plages = plages; x.theo = theo || 0; x.nuit = plages.some(p=>p.t === "nuit") || /^(oui|o|1|yes|y|vrai|true|x)$/i.test(v("nuit"));
    /* 1.1.11 : une tolérance donnée en nombre seul est en MINUTES (« 5 » = 5 min ; avant : lue comme 5 heures) */
    const tolMin = w => /^\d+$/.test(String(w).trim()) ? +String(w).trim() : (dureeMin(w) || 0);
    x.tolIn = v("tolEntree") ? tolMin(v("tolEntree")) : 10; x.tolOut = v("tolSortie") ? tolMin(v("tolSortie")) : 10;
    x.calcule = !v("theorique");
    return {x, err, refs:{}};
  }
  /* ---- calendrier : semaine type (lundi … dimanche) ou calendrier daté (date + journée) ---- */
  function valeurJour(val, corr, ref, journeesLot){
    val = String(val||"").trim(); if (!val) return {jid:null};
    if (/^(repos|r|off|-|—|libre|rest|0)$/i.test(val)) return {jid:"repos"};
    if (/^(ferie|férié|f|holiday|jf)$/i.test(val)) return {jid:"ferie"};
    const c = corr.journee && corr.journee[val]; if (c === "__ignorer") return {jid:null}; if (c) return {jid:c};
    const j = (ref.jours||[]).concat(journeesLot||[]).find(z=>norm(z.code||"") === norm(val) || norm(z.nom) === norm(val) || z.id === val);
    return j ? {jid:j.id} : {inconnue:val};
  }
  function transformerCalendrier(v, map, err, corr, ref){
    const x = {calendrier:v("calendrier")}, refs = {}; if (!x.calendrier) err.push("calendrier vide");
    if (map.site && v("site")){ const c = corr.site && corr.site[v("site")]; const s = c && c !== "__ignorer" ? c : ((ref.sites||[]).find(z=>norm(z.nom) === norm(v("site")) || norm(z.code||"") === norm(v("site")))||{}).id; if (s) x.siteId = s; else if (c !== "__ignorer") refs.site = v("site"); }
    if (map.date && map.journee){ const d = dateISO(v("date")); if (!d || d[0] === "!") err.push("date illisible : « "+v("date")+" »"); else x.date = d;
      const r = valeurJour(v("journee"), corr, ref); if (r.inconnue) refs.journee = r.inconnue; else if (r.jid) x.jour = r.jid; else if (!v("journee")) err.push("journée vide"); }
    else { x.hebdo = {}; JOURS_SEM.forEach((k, i)=>{ if (!map[k]) return; const r = valeurJour(v(k), corr, ref); if (r.inconnue){ refs.journee = refs.journee ? refs.journee : r.inconnue; (refs._toutes = refs._toutes || []).push(r.inconnue); } else if (r.jid) x.hebdo[i] = r.jid; });
      if (!JOURS_SEM.some(k=>map[k])) err.push("associez les colonnes des jours (lundi … dimanche) ou « date » et « journée »"); }
    return {x, err, refs};
  }
  /* ---- formule arithmétique : syntaxe, fonctions et variables contrôlées avec l'analyseur de FIWAKTI ---- */
  function transformerFormule(v, map, err){
    const F = require("./FW-Migration.formules.js"), code = v("code").toUpperCase().replace(/[^A-Z0-9_]/g, "_"), f = v("formule").replace(/^=/, "");
    const x = {code, nom:v("nom") || code, f, unite:/^(n|nb|nombre|count|j|jour|jours|days?)$/i.test(v("unite")) ? (/^j/i.test(v("unite")) ? "j" : "n") : "h",
      period:/sem|week/i.test(v("periode")) ? "semainep" : /an|year/i.test(v("periode")) ? "annee" : "ev", agg:/fin|dernier|last|end/i.test(v("agregation")) ? "fin" : "cumul"};
    if (!code) err.push("code vide"); if (!f) err.push("formule vide");
    if (f){ const p = F.parseFormula(f); if (!p.ok) err.push("formule invalide : "+p.err); else x._refs = F.refsOf(p.ast); }
    return {x, err, refs:{}};
  }
  async function analyserParametrage(b, j, ecrire, login, ref, ctx){
    const cible = b.cible, map = b.mapping || {}, tr = b.transformations || {}, corr = b.correspondances || {};
    const st = {lignes:j.lignes.length, creer:0, maj:0, inchanges:0, erreurs:0, ignores:0, cloture:0, exemplesErreurs:[], refsInconnues:{site:{}, dept:{}, calendrier:{}, journee:{}}, sensInconnus:[], matsInconnus:0, elements:[]};
    const coll = {journees:"jours", calendriers:"cals", formules:"arits"}[cible], existants = (ref[coll]||[]).slice(), ops = [], vus = new Map(), graphe = new Map();
    const ko = (i, m) => { st.erreurs++; if (st.exemplesErreurs.length < 200) st.exemplesErreurs.push({ligne:(j.lignes[i] && j.lignes[i].__ligne) || i+2, cause:m}); };
    /* formules : variables connues = variables du moteur + types de temps + codes de formules (existants et du fichier) */
    const connues = new Set(VARS_BASE.concat((ref.tt||[]).map(x=>"TT_"+String(x.code).replace(/[^A-Za-z0-9_]/g, "_"))).concat(existants.map(a=>a.code)));
    if (cible === "formules") j.lignes.forEach(r=>{ const c = String(r[map.code]||"").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"); if (c) connues.add(c); });
    j.lignes.forEach((r, i)=>{
      const t = transformer(cible, r, map, tr, corr, ref);
      Object.entries(t.refs).forEach(([k, v])=>{ if (k === "_toutes") return; (k === "journee" ? (t.refs._toutes || [v]) : [v]).forEach(val=>{ st.refsInconnues[k][val] = (st.refsInconnues[k][val]||0) + 1; }); });
      if (t.err.length) return ko(i, t.err.join(", "));
      if (Object.keys(t.refs).filter(k=>k !== "_toutes").length) return ko(i, "valeur inconnue : "+Object.entries(t.refs).filter(([k])=>k !== "_toutes").map(([k, v])=>(k === "journee" ? "journée" : k)+" « "+v+" »").join(", "));
      const x = t.x;
      if (cible === "formules"){
        const inc = (x._refs.vars.concat(x._refs.cums)).filter(n=>!connues.has(n) && !/^AJ_/.test(n));
        if (inc.length) return ko(i, "variable(s) inconnue(s) de FIWAKTI : "+inc.join(", ")+" (créez-les d'abord ou corrigez la formule)");
        x._deps = x._refs.vars.concat(x._refs.cums); delete x._refs;
        const av = existants.find(a=>a.code === x.code);
        if (vus.has(x.code)) return ko(i, "code en double dans la source : "+x.code); vus.set(x.code, 1);
        /* correctif 33 : code réservé du moteur (« PRESENCE ») et formule qui se cite elle-même refusés */
        if (VARS_BASE.indexOf(x.code) >= 0 || /^TT_/.test(x.code) || /^AJ_/.test(x.code)) return ko(i, "code réservé par FIWAKTI : "+x.code);
        if (x._deps && x._deps.indexOf(x.code) >= 0) return ko(i, "formule qui se cite elle-même : "+x.code);
        const deps = x._deps; delete x._deps; graphe.set(x.code, deps);
        if (!av){ st.creer++; ops.push({type:"creer", x}); st.elements.push({code:x.code, nom:x.nom, detail:x.f, etat:"creer"}); }
        else if (av.f === x.f && av.unite === x.unite && av.period === x.period && av.agg === x.agg){ st.inchanges++; }
        else if (!b.remplacer){ st.ignores++; st.elements.push({code:x.code, nom:x.nom, detail:av.f+"  →  "+x.f, etat:"conflit"}); }
        else { st.maj++; ops.push({type:"maj", avant:av, x:Object.assign({}, av, x)}); st.elements.push({code:x.code, nom:x.nom, detail:av.f+"  →  "+x.f, etat:"maj"}); }
        return;
      }
      if (cible === "journees"){
        if (vus.has(norm(x.code))) return ko(i, "code en double dans la source : "+x.code); vus.set(norm(x.code), 1);
        /* correctif 33 : rapprochement par le code seulement (une journée de même nom mais d'un autre code la remplaçait) */
        if (!(x.theo > 0)) return ko(i, "durée théorique nulle ou négative ("+x.theo+" min) : vérifiez plages et pause");
        const av = existants.find(z=>norm(z.code||"") === norm(x.code));
        const resume = x.plages.map(p=>(p.t === "pause" ? "pause " : "")+p.a+"–"+p.b).join(" · ")+" ; "+Math.floor(x.theo/60)+" h "+String(x.theo%60).padStart(2, "0")+(x.calcule ? " (calculé)" : "");
        const n = Object.assign({}, av || {couleur:["#047857","#0369A1","#B45309","#7C3AED","#BE185D","#0F766E"][st.creer % 6]}, {code:x.code, nom:x.nom, plages:x.plages, theo:x.theo, nuit:x.nuit, tolIn:x.tolIn, tolOut:x.tolOut});
        if (!av){ st.creer++; ops.push({type:"creer", x:n}); st.elements.push({code:x.code, nom:x.nom, detail:resume, etat:"creer"}); }
        else if (JSON.stringify(av.plages) === JSON.stringify(n.plages) && av.theo === n.theo){ st.inchanges++; }
        else { st.maj++; ops.push({type:"maj", avant:av, x:n}); st.elements.push({code:x.code, nom:x.nom, detail:resume, etat:"maj"}); }
        return;
      }
      /* calendriers : les lignes datées d'un même calendrier sont regroupées */
      const cle = norm(x.calendrier); let g = vus.get(cle);
      if (!g){ const av = existants.find(z=>norm(z.nom) === cle || norm(z.code||"") === cle);
        /* correctif 33 : jamais de site attribué d'office (avant : premier site) */
        if (!av && !x.siteId) return ko(i, "site du calendrier « "+x.calendrier+" » non renseigné : associez la colonne « site »");
        g = {av, x:Object.assign({}, av || {nom:x.calendrier, code:x.calendrier, siteId:x.siteId, hebdo:{}, exc:{}})}; g.x.hebdo = Object.assign({}, g.x.hebdo); g.x.exc = Object.assign({}, g.x.exc); vus.set(cle, g); }
      if (x.siteId) g.x.siteId = x.siteId;
      if (x.date) g.x.exc[x.date] = x.jour; else Object.assign(g.x.hebdo, x.hebdo);
    });
    /* correctif 33 : formules circulaires (A = B + 1 et B = A + 1) refusées — un cycle arrêtait tous les compteurs */
    if (cible === "formules"){ const F = require("./FW-Migration.formules.js");
      existants.forEach(a=>{ if (!graphe.has(a.code)) try { const q = F.parseFormula(String(a.f||"")); if (q.ok){ const r0 = F.refsOf(q.ast); graphe.set(a.code, r0.vars.concat(r0.cums)); } } catch(e){} });
      const etat = new Map(), cycle = []; const visiter = (c, pile) => { if (etat.get(c) === 2) return false; if (etat.get(c) === 1){ cycle.push(pile.slice(pile.indexOf(c)).concat([c]).join(" → ")); return true; }
        etat.set(c, 1); pile.push(c); for (const d of graphe.get(c) || []) if (graphe.has(d) && visiter(d, pile)) return true; pile.pop(); etat.set(c, 2); return false; };
      for (const c of graphe.keys()) if (!etat.get(c) && visiter(c, [])) break;
      if (cycle.length){ const enCause = new Set(cycle[0].split(" → ")); for (let k = ops.length - 1; k >= 0; k--) if (enCause.has(ops[k].x.code)){ ops.splice(k, 1); st.erreurs++; if (st.exemplesErreurs.length < 200) st.exemplesErreurs.push({ligne:0, cause:"formules circulaires : "+cycle[0]}); }
        st.creer = ops.filter(o=>o.type === "creer").length; st.maj = ops.filter(o=>o.type === "maj").length; } }
    if (cible === "calendriers") for (const g of vus.values()){
      const nomJ = id => id === "repos" ? "repos" : id === "ferie" ? "férié" : ((ref.jours||[]).find(z=>z.id === id)||{}).nom || id;
      const resume = JOURS_SEM.map((k, i)=>k.slice(0, 3)+" "+(g.x.hebdo[i] ? nomJ(g.x.hebdo[i]) : "—")).join(" · ")+(Object.keys(g.x.exc).length ? " ; "+Object.keys(g.x.exc).length+" jour(s) daté(s)" : "");
      if (!g.av){ st.creer++; ops.push({type:"creer", x:g.x}); st.elements.push({code:g.x.nom, nom:g.x.nom, detail:resume, etat:"creer"}); }
      else if (JSON.stringify(g.av.hebdo) === JSON.stringify(g.x.hebdo) && JSON.stringify(g.av.exc||{}) === JSON.stringify(g.x.exc)){ st.inchanges++; }
      else { st.maj++; ops.push({type:"maj", avant:g.av, x:g.x}); st.elements.push({code:g.x.nom, nom:g.x.nom, detail:resume, etat:"maj"}); }
    }
    ["site", "dept", "calendrier", "journee"].forEach(k=>{ st.refsInconnues[k] = Object.entries(st.refsInconnues[k]).map(([v, n])=>({valeur:v, lignes:n})); });
    st.elements = st.elements.slice(0, 300);
    if (!ecrire) return st;
    if (VERROU) throw Object.assign(new Error("Un import est déjà en cours."), {code:409});
    if (!ops.length) return Object.assign(st, {lot:null});
    if (st.erreurs && !b.accepterErreurs) throw Object.assign(new Error(st.erreurs+" ligne(s) en erreur : corrigez-les ou cochez « Importer les lignes valides seulement »."), {code:400});
    VERROU = login; const lot = id("ml"); let n = 0;
    try {
      await B.run("INSERT INTO mig_lots(id,cible,source,statut,stats,cree,par) VALUES(?,?,?,?,?,?,?)", lot, cible, j.nom, "en_cours", null, maint(), login);
      const liste = existants.slice();
      for (const op of ops){
        if (op.type === "creer"){ const nid = ({jours:"j", cals:"c", arits:"a"})[coll]+crypto.randomBytes(4).toString("hex"); const e = Object.assign({id:nid}, op.x); liste.push(e);
          await B.run("INSERT INTO mig_journal(lot,n,coll,id,avant) VALUES(?,?,?,?,?)", lot, n++, "ref:"+coll, nid, null); }
        else { const i = liste.findIndex(z=>z.id === op.avant.id); liste[i] = Object.assign({}, op.x, {id:op.avant.id}); await B.run("INSERT INTO mig_journal(lot,n,coll,id,avant) VALUES(?,?,?,?,?)", lot, n++, "ref:"+coll, op.avant.id, JSON.stringify(op.avant)); }
      }
      /* correctif 33 : refus de l'enregistrement (clôture, contrôles) remonté — il était annoncé comme un succès */
      const rs = await D.synchroniser(login, {ref:{[coll]:liste}, basesRef:{[coll]:(ref.__versions || {})[coll] || 0}}, {admin:!!(ctx || {}).admin});
      if (!rs || (rs.refCles || []).indexOf(coll) < 0){ const m = "Import refusé par les contrôles de FIWAKTI : "+(((rs && rs.ignores) || []).join(" ; ") || ((rs && rs.conflits || []).length ? "paramétrage modifié entre-temps, relancez l'analyse" : "enregistrement impossible"));
        await B.run("UPDATE mig_lots SET statut='echec', stats=? WHERE id=?", JSON.stringify({erreur:m}), lot); await B.run("DELETE FROM mig_journal WHERE lot=?", lot); throw Object.assign(new Error(m), {code:409}); }
      if (o.invalider) try { await o.invalider([], [coll]); } catch(e){}
      const stats = Object.assign({}, st, {ecrits:n}); delete stats.elements;
      await B.run("UPDATE mig_lots SET statut='termine', stats=? WHERE id=?", JSON.stringify(stats), lot);
      await audit(login, "migration.import", cible+" — "+j.nom+" : "+st.creer+" créé(s), "+st.maj+" mis à jour, "+st.ignores+" conflit(s) non remplacé(s) ; lot "+lot);
      return Object.assign(st, {lot, ecrits:n});
    } finally { VERROU = null; }
  }
  async function analyser(b, ecrire, login, ctx){
    const j = JEUX.get(b.jeu); if (!j) throw Object.assign(new Error("Données expirées : relisez la source."), {code:410});
    const cible = b.cible; if (!CIBLES[cible]) throw Object.assign(new Error("Type de données inconnu."), {code:400});
    const map = b.mapping || {}, tr = b.transformations || {}, corr = b.correspondances || {};
    for (const [k, ob] of CIBLES[cible]) if (ob && !map[k]) throw Object.assign(new Error("Colonne obligatoire non associée : "+k+"."), {code:400});
    if (cible === "calendriers" && !(map.date && map.journee) && !JOURS_SEM.some(k=>map[k])) throw Object.assign(new Error("Associez les colonnes des jours (lundi … dimanche) ou « date » et « journée »."), {code:400});
    if (cible === "journees" && !map.plages && !(map.debut && map.fin)) throw Object.assign(new Error("Associez « plages » ou « début » et « fin »."), {code:400});
    if (cible === "badgeages" && !map.horodatage && !(map.date && map.heure)) throw Object.assign(new Error("Associez soit « horodatage », soit « date » et « heure »."), {code:400});
    /* correctif 33 : chaque colonne associée doit exister dans les données lues */
    for (const [k, c] of Object.entries(map)) if (c && j.colonnes.indexOf(c) < 0) throw Object.assign(new Error("Colonne « "+String(c).slice(0, 60)+" » absente des données lues (champ "+k+")."), {code:400});
    if (["journees", "calendriers", "formules"].indexOf(cible) >= 0) return analyserParametrage(b, j, ecrire, login, await D.referentiel() || {}, ctx);
    const ref = await D.referentiel() || {}, emps = await D.employes(), parMat = new Map(emps.map(e=>[String(e.mat), e]));
    /* 1.1.9 : badgeages rattachés par le NUMÉRO DE BADGE (Netime : colonne TAR « 000710103 » ↔ badge du salarié) ;
       zéros de tête ignorés ; un badge porté par deux salariés est signalé, jamais attribué au hasard */
    const parBadge = new Map(), doublonsBadge = new Set(), nb0 = v => String(v == null ? "" : v).trim().toUpperCase().replace(/^0+(?=.)/, "");
    if (b.cleSalarie === "badge") emps.forEach(e=>{ const k = nb0(e.badge); if (!k) return; if (parBadge.has(k) && parBadge.get(k) !== String(e.mat)) doublonsBadge.add(k); else parBadge.set(k, String(e.mat)); });
    const clot = (ref.clotures||[]).reduce((m, c)=>c.jusqu > m ? c.jusqu : m, "");
    const st = {lignes:j.lignes.length, creer:0, maj:0, inchanges:0, erreurs:0, ignores:0, cloture:0, exemplesErreurs:[], refsInconnues:{site:{}, dept:{}, calendrier:{}}, sensInconnus:{}, matsInconnus:{}};
    const ops = [], vus = new Set(), D0 = b.defauts || {}, vusB = new Map(), vusC = new Map(), DON = require("../donnees.js");
    /* correctif 33 : unicité badge / CIN (fichier et salariés existants), dates, adresse, clôture contrôlées dès l'analyse */
    const nU = v => String(v == null ? "" : v).trim().toLowerCase(), uniB = new Map(), uniC = new Map(); if (cible === "salaries") emps.forEach(e=>{ if (nU(e.badge)) uniB.set(nU(e.badge), String(e.mat)); if (nU(e.cin)) uniC.set(nU(e.cin), String(e.mat)); });
    const jEffet = (()=>{ const a = new Date().toISOString().slice(0, 10); if (!clot || clot < a) return a; const d = new Date(clot+"T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
    st.calParDefaut = 0;
    if (cible === "salaries") st.choix = {cals:(ref.cals||[]).map(c=>({id:c.id, nom:c.nom})), sites:(ref.sites||[]).map(s=>({id:s.id, nom:s.nom})), depts:(ref.depts||[]).map(d=>({id:d.id, nom:d.nom}))};
    /* badgeages existants (anti-doublon) : chargés par matricule et période */
    let existants = null;
    if (cible === "badgeages"){ existants = new Set(); const mats = new Set(), dates = [];
      j.lignes.forEach(r=>{ const t = transformer(cible, r, map, tr, corr, ref); if (t.x.mat) mats.add(t.x.mat); if (t.x.ts && t.x.ts[0] !== "!") dates.push(t.x.ts.slice(0, 10)); });
      if (dates.length){ dates.sort(); const rows = await B.all("SELECT data FROM enreg WHERE coll='ptg' AND d>=? AND d<=?", dates[0], dates[dates.length-1]);
        rows.forEach(r=>{ const x = JSON.parse(r.data); if (mats.has(String(x.mat))) existants.add(x.mat+"|"+String(x.ts).slice(0, 16)+"|"+x.sens); }); } }
    j.lignes.forEach((r, i)=>{
      const t = transformer(cible, r, map, tr, corr, ref), ko = m => { st.erreurs++; if (st.exemplesErreurs.length < 200) st.exemplesErreurs.push({ligne:(r && r.__ligne) || i+2, cause:m}); };
      Object.entries(t.refs).forEach(([k, v])=>{ st.refsInconnues[k][v] = (st.refsInconnues[k][v]||0) + 1; });
      if (t.err.length) return ko(t.err.join(", "));
      if (cible === "salaries"){
        if (vus.has(t.x.mat)) return ko("matricule en double dans la source : "+t.x.mat); vus.add(t.x.mat);
        if (Object.keys(t.refs).length && !b.ignorerRefsInconnues) return ko("référentiel inconnu : "+Object.entries(t.refs).map(([k, v])=>k+" « "+v+" »").join(", "));
        if (/["'<>&`\\]/.test(t.x.mat)) return ko("matricule invalide : "+t.x.mat.slice(0, 30));
        for (const [k, vu, uni, lib] of [["badge", vusB, uniB, "badge"], ["cin", vusC, uniC, "CIN"]]){ const val = nU(t.x[k]); if (!val) continue;
          if (vu.has(val)) return ko(lib+" "+t.x[k]+" en double dans la source (matricules "+vu.get(val)+" et "+t.x.mat+")"); vu.set(val, t.x.mat);
          if (uni.has(val) && uni.get(val) !== t.x.mat) return ko(lib+" "+t.x[k]+" déjà attribué au salarié "+uni.get(val)); }
        if (t.x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.x.email)) return ko("adresse électronique invalide : "+t.x.email.slice(0, 60));
        const av = parMat.get(t.x.mat);
        { const en = t.x.entree || (av && av.entree) || "", so = t.x.sortie || (av && av.sortie) || ""; if (en && so && so < en) return ko("date de sortie antérieure à la date d'entrée"); }
        /* v56.31 : jamais de calendrier attribué en silence — colonne du fichier, ou calendrier choisi explicitement à l'analyse */
        const calCreer = t.x.__calCreer; delete t.x.__calCreer;
        if (!av){ const cal = t.x.calId || D0.calId; if (!calCreer && (!cal || !(ref.cals||[]).some(c=>c.id === cal))) return ko("calendrier non renseigné : associez la colonne « calendrier » ou choisissez le calendrier des nouveaux salariés");
          st.creer++; if (!t.x.calId) st.calParDefaut++; ops.push({type:"creer", x:t.x, ligne:(r && r.__ligne) || i+2}); }
        else { const n = Object.assign({}, av, t.x);
          /* correctif 33 : nouveau calendrier daté du jour (ou du lendemain de la clôture) — l'historique n'est plus réécrit */
          if (t.x.calId && Array.isArray(av.calHist) && av.calHist.length){ const h = av.calHist, der = h[h.length-1]; if (der.calId !== t.x.calId) n.calHist = h.filter(z=>String(z.from || "") < jEffet).concat([{from:jEffet, calId:t.x.calId}]); }
          if (JSON.stringify(Object.assign({}, n, {__v:0})) === JSON.stringify(Object.assign({}, av, {__v:0}))){ st.inchanges++; return; }
          const mc = DON.controleEmpClos(n, av, clot); if (mc) return ko(mc);
          st.maj++; ops.push({type:"maj", avant:av, x:n, ligne:(r && r.__ligne) || i+2}); }
      } else {
        if (b.cleSalarie === "badge"){ const k = nb0(t.x.mat);
          if (doublonsBadge.has(k)) return ko("badge "+t.x.mat+" attribué à plusieurs salariés dans FIWAKTI");
          const m = parBadge.get(k); if (!m){ st.matsInconnus[t.x.mat] = (st.matsInconnus[t.x.mat]||0) + 1; return ko("badge inconnu dans FIWAKTI : "+t.x.mat); }
          t.x.mat = m; }
        if (!parMat.has(t.x.mat)){ st.matsInconnus[t.x.mat] = (st.matsInconnus[t.x.mat]||0) + 1; return ko("matricule inconnu dans FIWAKTI : "+t.x.mat); }
        /* correctif 33 : badgeage futur ou hors de la présence du salarié signalé dès l'analyse */
        { const dP = t.x.ts.slice(0, 10), eP = parMat.get(t.x.mat), demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          if (dP > demain) return ko("badgeage dans le futur ("+dP.split("-").reverse().join("/")+")");
          if (eP && ((eP.entree && dP < eP.entree) || (eP.sortie && dP > eP.sortie))) return ko("badgeage hors de la présence du salarié (entrée "+String(eP.entree || "—").split("-").reverse().join("/")+(eP.sortie ? ", sortie "+eP.sortie.split("-").reverse().join("/") : "")+")"); }
        if (t.x.sens === "?"){ st.sensInconnus[String(r[map.sens])] = (st.sensInconnus[String(r[map.sens])]||0) + 1; return ko("sens non reconnu : « "+r[map.sens]+" »"); }
        /* correctif 33 : badgeage en période close compté une fois (plus en « erreur » en plus) */
        if (clot && t.x.ts.slice(0, 10) <= clot){ st.cloture++; if (st.exemplesErreurs.length < 200) st.exemplesErreurs.push({ligne:(r && r.__ligne) || i+2, cause:"période clôturée (jusqu'au "+clot.split("-").reverse().join("/")+")"}); return; }
        const cle = t.x.mat+"|"+t.x.ts.slice(0, 16)+"|"+t.x.sens; if (existants.has(cle) || vus.has(cle)){ st.ignores++; return; } vus.add(cle);
        st.creer++; ops.push({type:"creer", x:t.x, ligne:(r && r.__ligne) || i+2});
      }
    });
    ["site", "dept", "calendrier"].forEach(k=>{ st.refsInconnues[k] = Object.entries(st.refsInconnues[k]).map(([v, n])=>({valeur:v, lignes:n})); });
    st.sensInconnus = Object.entries(st.sensInconnus).map(([v, n])=>({valeur:v, lignes:n})); st.matsInconnus = Object.keys(st.matsInconnus).length;
    if (!ecrire) return st;
    /* ---- écriture : un import à la fois, par lots de 500, journal pour l'annulation ---- */
    /* correctif 33 : écriture par l'enregistrement normal de FIWAKTI (unicité, dates, clôture, périmètre, matrice des
       droits, traçabilité des badgeages, invalidation des calculs) — l'import écrivait directement en base, sans aucun
       de ces contrôles ; capacité de la licence appliquée ; chaque refus devient une erreur de ligne du rapport */
    if (VERROU) throw Object.assign(new Error("Un import ou une annulation est déjà en cours."), {code:409});
    if (!ops.length) return Object.assign(st, {lot:null});
    if (st.erreurs && !b.accepterErreurs) throw Object.assign(new Error(st.erreurs+" ligne(s) en erreur : corrigez-les ou cochez « Importer les lignes valides seulement »."), {code:400});
    const admin = !!(ctx || {}).admin;
    VERROU = login; const lot = id("ml"); let n = 0;
    try {
      /* référentiels créés sur décision explicite (calendriers à compléter, sites, services) — vérifiés et journalisés */
      const nouveaux = b.creerRefs || {}; let refMaj = false; const crees = (b.__refsCrees || []).slice();
      for (const val of (nouveaux.calendrier || [])){ ref.cals = ref.cals || []; b.correspondances = b.correspondances || {}; b.correspondances.calendrier = Object.assign({}, b.correspondances.calendrier);
        const ex = ref.cals.find(z=>norm(z.nom) === norm(val)); if (ex){ b.correspondances.calendrier[val] = ex.id; continue; }
        const nid = "c"+crypto.randomBytes(4).toString("hex"); b.correspondances.calendrier[val] = nid;
        ref.cals.push({id:nid, nom:String(val).slice(0, 80), siteId:"", hebdo:{0:"", 1:"", 2:"", 3:"", 4:"", 5:"", 6:""}, exc:{}, aCompleter:true, source:"migration"}); refMaj = true; crees.push({coll:"cals", id:nid, nom:val}); }
      const tzRef = ((ref.sites || []).find(z=>z && z.tz) || {}).tz || "Africa/Tunis";
      for (const k of ["site", "dept"]) for (const val of (nouveaux[k] || [])){ const coll = k === "site" ? "sites" : "depts"; ref[coll] = ref[coll] || [];
        b.correspondances = b.correspondances || {}; b.correspondances[k] = Object.assign({}, b.correspondances[k]);
        const ex = ref[coll].find(z=>norm(z.nom) === norm(val)) || null; if (ex){ b.correspondances[k][val] = ex.id; continue; }
        if (k === "dept"){ const cr = []; b.correspondances[k][val] = creerChemin(ref.depts, val, d=>cr.push(d)); if (cr.length){ refMaj = true; cr.forEach(d=>crees.push({coll:"depts", id:d.id, nom:d.nom})); } continue; }
        /* site : code et fuseau exigés par FIWAKTI (le site était refusé et le salarié rattaché à un site inexistant) */
        const base = String(val).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "SITE"; let code = base, q = 1;
        while ((ref.sites || []).some(z=>String(z.code || "").toUpperCase() === code)) code = base.slice(0, 6)+(++q);
        const nid = "s"+crypto.randomBytes(4).toString("hex"); b.correspondances[k][val] = nid;
        ref[coll].push({id:nid, nom:String(val).slice(0, 80), code, tz:tzRef, actif:true}); refMaj = true; crees.push({coll:"sites", id:nid, nom:val}); }
      if (refMaj || Object.keys(nouveaux).some(k=>(nouveaux[k]||[]).length)){
        if (refMaj){ const env = {}, bases = {}; ["sites", "depts", "cals"].forEach(c=>{ if (crees.some(z=>z.coll === c)){ env[c] = ref[c]; bases[c] = (ref.__versions || {})[c] || 0; } });
          const rs = await D.synchroniser(login, {ref:env, basesRef:bases}, {admin});
          const manq = Object.keys(env).filter(c=>(rs.refCles || []).indexOf(c) < 0);
          if (manq.length) throw Object.assign(new Error("Création refusée par les contrôles de FIWAKTI : "+((rs.ignores || []).join(" ; ") || manq.join(", "))+". Créez ces éléments dans le paramétrage, puis relancez l'analyse."), {code:409});
          for (const c of crees) await audit(login, "migration.referentiel", ({sites:"site", depts:"service", cals:"calendrier (à compléter)"})[c.coll]+" créé : "+c.nom); }
        VERROU = null; return analyser(Object.assign({}, b, {creerRefs:{}, __refsCrees:crees}), true, login, ctx); }
      /* capacité de la licence (salariés actifs) */
      const D0b = b.defauts || {}, calDefaut = D0b.calId || "", siteDefaut = D0b.siteId || "", deptDefaut = D0b.deptId || "";
      const puts = ops.map(op=>{
        if (b.cible === "salaries"){
          if (op.type === "creer"){ const e = Object.assign({id:"mg"+crypto.randomBytes(5).toString("hex"), siteId:siteDefaut, deptId:deptDefaut, calId:calDefaut, entree:"", sortie:"", hist:{}, tts:[], rds:[], src:"migration"}, op.x);
            if (e.calId && !Array.isArray(e.calHist)) e.calHist = [{from:e.entree || new Date().toISOString().slice(0, 10), calId:e.calId}]; return e; }
          return Object.assign({}, op.x, {__v:Number(op.avant.__v || 0)}); }
        return Object.assign({id:"pm"+crypto.randomBytes(6).toString("hex"), src:"migration", lot}, op.x); });
      if (b.cible === "salaries" && o.capacite){ const m = await o.capacite(puts); if (m) throw Object.assign(new Error(m), {code:403}); }
      await B.run("INSERT INTO mig_lots(id,cible,source,statut,stats,cree,par) VALUES(?,?,?,?,?,?,?)", lot, b.cible, j.nom, "en_cours", null, maint(), login);
      for (const c of crees) await B.run("INSERT INTO mig_journal(lot,n,coll,id,avant) VALUES(?,?,?,?,?)", lot, n++, "ref:"+c.coll, c.id, JSON.stringify({m2:1, cree:true}));
      const coll = b.cible === "salaries" ? "emps" : "ptg", refusLignes = [];
      for (let i = 0; i < puts.length; i += 500){
        const lotP = puts.slice(i, i + 500), opsP = ops.slice(i, i + 500);
        const r = await D.synchroniser(login, {colls:{[coll]:{put:lotP}}}, {admin});
        const motifs = new Map(); (r.refusEmps || []).concat(((r.refusPar || {})[coll]) || []).forEach(z=>{ if (z && z.id != null) motifs.set(String(z.id), z.message); });
        (r.conflits || []).forEach(c=>{ if (c && c.id != null) motifs.set(String(c.id), "fiche modifiée entre-temps : relancez l'analyse"); });
        await B.transaction(async ()=>{ for (let k = 0; k < lotP.length; k++){ const e = lotP[k], op = opsP[k];
          const cur = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", coll, String(e.id)), x = cur ? JSON.parse(cur.data) : null;
          const ecrit = x && (op.type === "creer" ? !op.avant : Number(x.__v || 0) === Number(op.avant.__v || 0) + 1) && !motifs.has(String(e.id));
          if (!ecrit){ refusLignes.push({ligne:op.ligne || 0, cause:motifs.get(String(e.id)) || ((r.ignores || []).join(" ; ") || "refusé par les contrôles de FIWAKTI")}); continue; }
          await B.run("INSERT INTO mig_journal(lot,n,coll,id,avant) VALUES(?,?,?,?,?)", lot, n++, coll, String(e.id), JSON.stringify({m2:1, avant:op.avant || null, v:Number(x.__v || 0)})); } });
        if (o.invalider && (r.touches || []).length) try { await o.invalider(r.touches, []); } catch(e){}
        await new Promise(z=>setImmediate(z));
      }
      if (b.cible === "salaries") D.oublierEmployes();
      const ecritsNb = n - crees.length;
      st.erreurs += refusLignes.length;
      const stats = Object.assign({}, st, {ecrits:ecritsNb, refusImport:refusLignes.length, erreursDetail:st.exemplesErreurs.concat(refusLignes).slice(0, 5000)});
      await B.run("UPDATE mig_lots SET statut='termine', stats=? WHERE id=?", JSON.stringify(stats), lot);
      await audit(login, "migration.import", b.cible+" — "+j.nom+" : "+ecritsNb+" écrit(s), "+refusLignes.length+" refusé(s) par les contrôles, "+st.erreurs+" erreur(s) au total ; lot "+lot);
      st.exemplesErreurs = st.exemplesErreurs.concat(refusLignes).slice(0, 400);
      return Object.assign(st, {lot, ecrits:ecritsNb, refusImport:refusLignes.length});
    } finally { VERROU = null; }
  }
  /* correctif 33 : annulation sûre — une fiche modifiée depuis l'import est conservée (signalée), suppression par
     l'enregistrement normal (corbeille, clôture, données rattachées), référentiels créés par le lot retirés s'ils ne
     servent plus, calculs invalidés ; une seule opération à la fois */
  async function annuler(lot, login, ctx){
    const l = await B.get("SELECT * FROM mig_lots WHERE id=?", lot); if (!l) throw Object.assign(new Error("Lot introuvable."), {code:404});
    if (l.statut === "annule") throw Object.assign(new Error("Lot déjà annulé."), {code:409});
    if (VERROU) throw Object.assign(new Error("Un import ou une annulation est déjà en cours."), {code:409});
    VERROU = login; const admin = !!(ctx || {}).admin;
    try {
      const ref = await D.referentiel() || {};
      const lignes = await B.all("SELECT coll, id, avant FROM mig_journal WHERE lot=? ORDER BY n DESC", lot); let n = 0, conserves = 0; const motifs = [];
      const meta = r => { let a = null; try { a = r.avant ? JSON.parse(r.avant) : null; } catch(e){} return a && a.m2 ? a : {avant:a, v:null, legacy:true}; };
      /* paramétrage importé (journées, calendriers, formules) */
      const parRef = lignes.filter(r=>r.coll.startsWith("ref:") && !meta(r).cree);
      if (parRef.length){ const cle = parRef[0].coll.slice(4); let liste = (ref[cle]||[]).slice();
        if (cle === "jours"){ const utilises = new Set(); (ref.cals||[]).forEach(c=>{ Object.values(c.hebdo||{}).concat(Object.values(c.exc||{})).forEach(v=>utilises.add(v)); });
          const bloque = parRef.find(r=>!meta(r).avant && utilises.has(r.id)); if (bloque) throw Object.assign(new Error("Annulation impossible : une journée importée est utilisée par un calendrier. Annulez d'abord l'import des calendriers."), {code:409}); }
        if (cle === "cals"){ const emps = await D.employes(); const ut = parRef.find(r=>!meta(r).avant && emps.some(e=>e.calId === r.id)); if (ut) throw Object.assign(new Error("Annulation impossible : un calendrier importé est déjà affecté à des salariés."), {code:409}); }
        for (const r of parRef){ const a = meta(r).avant; if (a){ const i = liste.findIndex(z=>z.id === r.id); if (i >= 0) liste[i] = a; else liste.push(a); } else liste = liste.filter(z=>z.id !== r.id); n++; }
        const rs = await D.synchroniser(login, {ref:{[cle]:liste}, basesRef:{[cle]:(ref.__versions || {})[cle] || 0}}, {admin});
        if (!rs || (rs.refCles || []).indexOf(cle) < 0) throw Object.assign(new Error("Annulation refusée par les contrôles de FIWAKTI : "+(((rs && rs.ignores) || []).join(" ; ") || "paramétrage modifié entre-temps")), {code:409});
        if (o.invalider) try { await o.invalider([], [cle]); } catch(e){} }
      /* salariés et badgeages */
      const lignesColl = lignes.filter(r=>!r.coll.startsWith("ref:")), touches = [];
      for (let i = 0; i < lignesColl.length; i += 500){
        const part = lignesColl.slice(i, i + 500), coll = part[0].coll, puts = [], dels = [], att = [];
        for (const r of part){ const m = meta(r), cur = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", r.coll, r.id), x = cur ? JSON.parse(cur.data) : null;
          if (!x){ if (m.avant){ conserves++; motifs.push(r.id+" : supprimé depuis l'import"); } else n++; continue; }
          if (m.v != null && Number(x.__v || 0) !== Number(m.v)){ conserves++; motifs.push((x.mat || r.id)+" : modifié depuis l'import (conservé tel quel)"); continue; }
          if (m.avant){ puts.push(Object.assign({}, m.avant, {__v:Number(x.__v || 0)})); att.push({id:r.id, type:"put", v:Number(x.__v || 0) + 1, mat:x.mat}); }
          else { dels.push(r.id); att.push({id:r.id, type:"del", mat:x.mat}); } }
        if (!puts.length && !dels.length) continue;
        const rs = await D.synchroniser(login, {colls:{[coll]:{put:puts, del:dels}}}, {admin});
        for (const a of att){ const cur = await B.get("SELECT data FROM enreg WHERE coll=? AND id=?", coll, a.id), x = cur ? JSON.parse(cur.data) : null;
          const ok = a.type === "del" ? !x : x && Number(x.__v || 0) === a.v; if (ok){ n++; if (coll === "emps") touches.push(a.mat+"|*"); } else { conserves++; motifs.push((a.mat || a.id)+" : "+(((rs && rs.ignores) || []).join(" ; ") || "refusé par les contrôles de FIWAKTI")); } }
        if (rs && (rs.touches || []).length) touches.push(...rs.touches);
      }
      if (lignesColl.length) D.oublierEmployes();
      if (touches.length && o.invalider) try { await o.invalider(Array.from(new Set(touches)), []); } catch(e){}
      /* référentiels créés par le lot (sites, services, calendriers à compléter) : retirés s'ils ne servent plus */
      const crees = lignes.filter(r=>r.coll.startsWith("ref:") && meta(r).cree);
      if (crees.length){ const ref2 = await D.referentiel() || {}, emps = await D.employes(), env = {}, bases = {};
        for (const r of crees){ const c = r.coll.slice(4), champ = {sites:"siteId", depts:"deptId", cals:"calId"}[c];
          if (emps.some(e=>e[champ] === r.id) || (c === "depts" && (ref2.depts || []).some(d=>d.parent === r.id && !crees.some(z=>z.id === d.id)))){ conserves++; motifs.push(c+" "+r.id+" : encore utilisé"); continue; }
          env[c] = (env[c] || (ref2[c] || []).slice()).filter(z=>z.id !== r.id); bases[c] = (ref2.__versions || {})[c] || 0; n++; }
        if (Object.keys(env).length){ const rs = await D.synchroniser(login, {ref:env, basesRef:bases}, {admin}); Object.keys(env).forEach(c=>{ if ((rs.refCles || []).indexOf(c) < 0){ conserves++; motifs.push(c+" : retrait refusé ("+((rs.ignores || []).join(" ; ") || "contrôles")+")"); } }); } }
      await B.run("UPDATE mig_lots SET statut=?, annule_le=? WHERE id=?", conserves ? "annule_partiel" : "annule", maint(), lot);
      await audit(login, "migration.annulation", "lot "+lot+" : "+n+" élément(s) rétabli(s)"+(conserves ? ", "+conserves+" conservé(s) : "+motifs.slice(0, 10).join(" ; ") : ""));
      return {retablis:n, conserves, motifs:motifs.slice(0, 200)};
    } finally { VERROU = null; }
  }
  async function traiter(req, res, x){
    const {p, C, admin, P, json, erreur, corpsJson} = x;
    /* 56.33.11 : l'import réécrit des données de tous les sites — paramétrage système ET périmètre global exigés */
    const rang = admin || (((P.profil||{}).droits||{}).SYS === "config" && P.set === null); if (!rang) return erreur(res, 403, "Réservé aux administrateurs (périmètre global).");
    /* correctif 33 : matrice de l'écran Migration des données (masqué : rien ; consultation : lecture et analyse ;
       importer = créer / modifier ; annuler un lot = supprimer ; rapport = exporter) */
    const pr = P.profil || {}, menu = (pr.menus || {}).migration, act = (pr.actions || {}).migration || {};
    if (menu === "masque") return erreur(res, 403, "Écran Migration des données masqué pour votre profil.");
    const lecture = menu === "lecture";
    if ((p === "/api/v1/migration/importer" && (lecture || act.creer === false)) || (/\/annuler$/.test(p) && (lecture || act.supprimer === false)) || (/\/rapport$/.test(p) && act.exporter === false))
      return erreur(res, 403, "Action non permise pour votre profil (écran Migration des données).");
    if (!INIT){ INIT = true; try { await B.run("UPDATE mig_lots SET statut='interrompu' WHERE statut='en_cours'"); } catch(e){} }
    /* 56.33.11 : un jeu lu n'est accessible qu'à son auteur (l'administrateur voit tout) */
    const jeuAutorise = b => { const j = JEUX.get(b && b.jeu); if (j && !admin && j.par !== C.login) throw Object.assign(new Error("Données expirées : relisez la source."), {code:410}); return b; };
    /* erreurs des pilotes (codes texte : ECONNREFUSED, ESOCKET, 28P01…) → message clair, jamais d'erreur interne */
    const err = e => typeof e.code === "number" ? erreur(res, e.code, e.message) : erreur(res, 400, "Source inaccessible : "+String(e.message || e).replace(/password[^,;]*/gi, "").slice(0, 200));
    nettoyer();
    try {
      if (p === "/api/v1/migration/cibles" && req.method === "GET") return json(res, 200, {cibles:Object.fromEntries(Object.entries(CIBLES).map(([k, v])=>[k, v.map(([c, ob])=>({champ:c, obligatoire:!!ob}))])),
        sqlserver:(()=>{ try { require.resolve("mssql"); return true; } catch(e){ return fs.existsSync(path.join(o.racine||"", "connecteurs", "node_modules", "mssql")); } })()});
      /* 56.33.3 : dépôt direct d'une base SQLite (envoyée telle quelle, sans conversion, jusqu'à 4 Go) — l'envoi par la
         route des fichiers était limité à environ 60 Mo ; signature vérifiée, fichier rangé dans donnees/migration */
      if (p === "/api/v1/migration/depot-base" && req.method === "POST"){
        const nom = path.basename(decodeURIComponent(String(req.headers["x-nom-fichier"]||"base"))), dir = path.join(o.dossierDonnees || ".", "migration"); fs.mkdirSync(dir, {recursive:true});
        const fp = path.join(dir, id("sq")+".sqlite"), out = fs.createWriteStream(fp); let n = 0, tete = Buffer.alloc(0), trop = false;
        /* correctif 33 : envoi interrompu → fichier partiel effacé */
        let fini = false;
        try { await new Promise((ok, ko)=>{ req.on("data", c=>{ n += c.length; if (tete.length < 16) tete = Buffer.concat([tete, c.slice(0, 16)]); if (n > 4e9){ trop = true; req.destroy(); } else out.write(c); });
          req.on("end", ()=>{ fini = true; out.end(ok); }); req.on("error", ko); req.on("aborted", ()=>ko(new Error("Envoi interrompu."))); req.on("close", ()=>{ if (trop) out.end(ok); else if (!fini) ko(new Error("Envoi interrompu.")); }); }); }
        catch(e){ try { out.destroy(); fs.unlinkSync(fp); } catch(x){} return erreur(res, 400, "Envoi de la base interrompu : recommencez."); }
        if (trop || !estSqlite(tete)){ try { fs.unlinkSync(fp); } catch(e){}
          return erreur(res, 400, trop ? "Base trop volumineuse (4 Go au plus)." : "« "+nom+" » n'est pas une base SQLite (signature absente). Pour Netime, déposez le fichier .sl3 copié pendant que Netime est fermé."); }
        await audit(C.login, "migration.depot_base", nom+" — "+Math.round(n/1048576)+" Mo");
        return json(res, 200, {ok:true, basesSqlite:[path.basename(fp)], nom, taille:n});
      }
      if (p === "/api/v1/migration/fichiers" && req.method === "POST"){
        const b = await corpsJson(req, 80e6), fichiers = Array.isArray(b.fichiers) ? b.fichiers : []; if (!fichiers.length) return erreur(res, 400, "Aucun fichier.");
        const jeux = [], erreurs = [], formulaires = [], enc = ["utf-8", "windows-1256", "windows-1252"].indexOf(b.encodage) >= 0 ? b.encodage : "";
        const rangerBase = j => { const dir = path.join(o.dossierDonnees || ".", "migration"); fs.mkdirSync(dir, {recursive:true}); const fp = path.join(dir, id("sq")+".sqlite"); fs.writeFileSync(fp, j.buf); erreurs.push("BASE:"+path.basename(fp)); };
        for (const f of fichiers.slice(0, 500)){ const buf = Buffer.from(String(f.contenu||""), "base64"), nom = path.basename(String(f.nom||"fichier"));
          try { if (/\.zip$/i.test(nom)){ const z = await lireZip(buf, enc); z.jeux.forEach(j=>{ if (j.baseSqlite) rangerBase(j); else jeux.push(j); }); z.erreurs.forEach(e=>erreurs.push(e)); }
            else if (/\.pdf$/i.test(nom)) formulaires.push(Object.assign({"Fichier":nom}, await lireFormulaire(buf)));
            else for (const j of await lireFichier(nom, buf, enc)){ if (j.baseSqlite) rangerBase(j); else jeux.push(j); } }
          catch(e){ erreurs.push(nom+" : "+e.message); } }
        jeux.forEach(j=>(j.avertissements || []).forEach(a=>erreurs.push(j.nom+" : "+a)));
        /* correctif 33 : mémoire bornée (3 millions de lignes en attente par compte) */
        { let tot = jeux.reduce((t, j)=>t + j.lignes.length, 0); for (const v of JEUX.values()) if (v.par === C.login) tot += v.lignes.length;
          if (tot > 3e6) return erreur(res, 413, "Trop de lignes en attente ("+tot+") : importez les jeux déjà lus ou attendez leur expiration, puis recommencez."); }
        if (formulaires.length){ const cols = new Set(); formulaires.forEach(f=>Object.keys(f).forEach(k=>cols.add(k))); jeux.push({nom:"Formulaires PDF ("+formulaires.length+")", colonnes:Array.from(cols), lignes:formulaires.map(f=>Object.fromEntries(Array.from(cols).map(k=>[k, f[k]||""]))), formulaire:true}); }
        const bases = erreurs.filter(e=>e.startsWith("BASE:")).map(e=>e.slice(5));
        await audit(C.login, "migration.lecture", fichiers.length+" fichier(s) : "+jeux.length+" jeu(x) de données");
        return json(res, 200, {jeux:garder(jeux, C.login), erreurs:erreurs.filter(e=>!e.startsWith("BASE:")), basesSqlite:bases});
      }
      if (p === "/api/v1/migration/base" && req.method === "POST"){
        const b = await corpsJson(req), c = b.connexion || {};
        if (c.type === "sqlite" && !/^sq-[0-9a-f]{12}\.sqlite$/.test(path.basename(String(c.fichier || "")))) return erreur(res, 400, "Fichier SQLite : déposez-le d'abord comme fichier.");
        const cn = await BASES.ouvrir(c);
        try {
          if (b.action === "tables") return json(res, 200, {tables:await cn.tables()});
          const sql = b.requete ? exigerLecture(b.requete) : (/^[\w.\[\]"`]+$/.test(b.table||"") ? "SELECT * FROM "+b.table : null);
          if (!sql) return erreur(res, 400, "Choisissez une table ou saisissez une requête de lecture.");
          const rows = await cn.lire(sql), cols = rows.length ? Object.keys(rows[0]) : [];
          const lignes = rows.map(r=>Object.fromEntries(cols.map(k=>[k, r[k] == null ? "" : (r[k] instanceof Date ? r[k].toISOString().replace("T", " ").slice(0, 19) : String(r[k]))])));
          await audit(C.login, "migration.lecture", "base "+c.type+" "+(c.hote||c.fichier||"")+" / "+(b.table || "requête")+" : "+lignes.length+" ligne(s)");
          return json(res, 200, {jeux:garder([{nom:(c.base||"base")+" › "+(b.table || "requête"), colonnes:cols, lignes}], C.login)});
        } finally { try { await cn.fermer(); } catch(e){} }
      }
      if (p === "/api/v1/migration/proposer" && req.method === "POST"){ const b = jeuAutorise(await corpsJson(req)), j = JEUX.get(b.jeu); if (!j) return erreur(res, 410, "Données expirées : relisez la source.");
        const sig = j.colonnes.map(norm).sort().join("|"), pr = await B.get("SELECT nom, config FROM mig_profils WHERE cible=? AND signature=? ORDER BY cree DESC LIMIT 1", b.cible, sig);
        return json(res, 200, {mapping:pr ? JSON.parse(pr.config).mapping : proposer(b.cible, j.colonnes), profil:pr ? {nom:pr.nom, config:JSON.parse(pr.config)} : null}); }
      if (p === "/api/v1/migration/analyser" && req.method === "POST") return json(res, 200, await analyser(jeuAutorise(await corpsJson(req)), false, C.login, {admin}));
      if (p === "/api/v1/migration/importer" && req.method === "POST"){ const b = jeuAutorise(await corpsJson(req)), r = await analyser(b, true, C.login, {admin});
        if (b.profil && JEUX.get(b.jeu) && JEUX.get(b.jeu).colonnes.map(norm).filter(Boolean).length){ const j = JEUX.get(b.jeu); await B.run("INSERT INTO mig_profils(id,nom,cible,signature,config,cree,par) VALUES(?,?,?,?,?,?,?)", id("mp"), String(b.profil).slice(0, 80), b.cible, j.colonnes.map(norm).sort().join("|"),
          JSON.stringify({mapping:b.mapping, transformations:b.transformations, correspondances:b.correspondances}), maint(), C.login); }
        return json(res, 200, r); }
      if (p === "/api/v1/migration/lots" && req.method === "GET") return json(res, 200, {lignes:(await B.all("SELECT id, cible, source, statut, stats, cree, par, annule_le FROM mig_lots ORDER BY cree DESC LIMIT 50")).map(l=>Object.assign(l, {stats:l.stats ? JSON.parse(l.stats) : null}))});
      const ma = /^\/api\/v1\/migration\/lots\/([^/]+)\/annuler$/.exec(p);
      if (ma && req.method === "POST") return json(res, 200, await annuler(ma[1], C.login, {admin}));
      /* correctif 33 : rapport du lot (motifs ligne par ligne) téléchargeable */
      const mr = /^\/api\/v1\/migration\/lots\/([^/]+)\/rapport$/.exec(p);
      if (mr && req.method === "GET"){ const l = await B.get("SELECT * FROM mig_lots WHERE id=?", mr[1]); if (!l) return erreur(res, 404, "Lot introuvable.");
        const st = l.stats ? JSON.parse(l.stats) : {}, q = v => '"'+String(v == null ? "" : v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")+'"';
        const lignesR = [["Ligne", "Motif"].map(q).join(";")].concat((st.erreursDetail || st.exemplesErreurs || []).map(e=>[e.ligne || "", e.cause].map(q).join(";")));
        await audit(C.login, "migration.rapport", "lot "+l.id);
        res.writeHead(200, {"Content-Type":"text/csv; charset=utf-8", "Content-Disposition":'attachment; filename="migration-'+l.id+'.csv"'}); return res.end("\uFEFF"+lignesR.join("\r\n")); }
      return erreur(res, 404, "Introuvable.");
    } catch(e){ return err(e); }
  }
  return {traiter, analyser, annuler, _proposer:proposer, _transformer:transformer};
}
module.exports = {ddl, tables, creer, CIBLES, dateISO, heureHM, lireCSV, exigerLecture};
