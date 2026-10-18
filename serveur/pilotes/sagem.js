/* FIWAKTI 56.31 — pilote Sagem / Morpho (IDEMIA) : MorphoAccess (série J, 100, 500, VP), Sigma, MorphoWave, VisionPass.
   Ces terminaux sont exploités en entreprise au travers de leur logiciel de gestion (MorphoManager, MEMS, BioBridge) qui
   exporte les journaux de passages en fichiers texte (CSV, TXT) — c'est la méthode documentée et stable retenue ici :
   FIWAKTI lit les fichiers déposés dans un dossier (local ou partage réseau monté), une seule fois chacun, et les range
   dans « integres/ ». La liaison directe au terminal (MA SDK / API Thrift d'IDEMIA) nécessite le kit de développement du
   constructeur : elle se branche plus tard dans donnees/pilotes/ sans changer FIWAKTI.
   Format lu (réglable) : une ligne par passage ; colonnes repérées par leur en-tête ou par leur position. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ALIAS = {identifiant:/^(user ?id|id ?utilisateur|identifiant|matricule|employee|badge|card ?id|userid|id)$/i,
  horodatage:/^(date ?time|horodatage|timestamp|date et heure|event ?time)$/i, date:/^(date|jour|day)$/i, heure:/^(heure|time|hour)$/i,
  sens:/^(sens|direction|in ?out|type|event|evenement|événement|function|key|touche)$/i, terminal:/^(terminal|device|reader|lecteur|sn|serial)$/i};
function decouper(l, sep){ const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++){ const c = l[i]; if (q){ if (c === '"'){ if (l[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep){ out.push(cur.trim()); cur = ""; } else cur += c; }
  out.push(cur.trim()); return out; }
function lireTexte(buf){ if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.slice(2).toString("utf16le"); const t = buf.toString("utf8"); return /\uFFFD/.test(t) ? buf.toString("latin1") : t.replace(/^\uFEFF/, ""); }
function dateISO(v, fmt){ v = String(v||"").trim(); let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v))) return m[1]+"-"+m[2].padStart(2, "0")+"-"+m[3].padStart(2, "0");
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(v))){ const y = m[3].length === 2 ? "20"+m[3] : m[3]; const [j, mo] = fmt === "mdy" ? [m[2], m[1]] : [m[1], m[2]];
    return y+"-"+String(mo).padStart(2, "0")+"-"+String(j).padStart(2, "0"); }
  return null; }
/* 56.33.11 : heure 0–23 (rejet au-delà), secondes 0–59, AM/PM pris en compte (« 6:30:00 PM » donnait « 30:00:00 ») */
function heure(v){ const m = /(\d{1,2})[:hH.](\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/.exec(String(v||"")); if (!m) return null;
  let h = +m[1]; const mi = +m[2], s = +(m[3]||0), ap = (m[4]||"").toUpperCase();
  if (ap){ if (h < 1 || h > 12) return null; h = h % 12 + (ap === "PM" ? 12 : 0); }
  if (h > 23 || mi > 59 || s > 59) return null;
  return String(h).padStart(2, "0")+":"+String(mi).padStart(2, "0")+":"+String(s).padStart(2, "0"); }
/* date et heure dans une même colonne : l'heure est lue après la date reconnue (avant : à partir du 11e caractère,
   faux pour « 4/1/2026 18:30 » ou « 2026-1-5 18:30 », lus 08:30) */
const DATE_RE = /^\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/;
function heureApresDate(v){ const m = DATE_RE.exec(String(v||"")); return heure(m ? String(v).slice(m[0].length) : v); }
/* sens : codes texte usuels (IN / OUT, Entrée / Sortie) et touches de fonction réglables (ex. « F1=E;F2=S ») */
function sensDe(v, table){ const s = String(v||"").trim(); if (!s) return "";
  if (table && Object.prototype.hasOwnProperty.call(table, s.toUpperCase())) return table[s.toUpperCase()];
  if (/^(in|entr|e$|check ?in|arriv|0$)/i.test(s)) return "E"; if (/^(out|sort|s$|check ?out|depart|départ|1$)/i.test(s)) return "S"; return ""; }
function analyser(texte, T, nomFichier){
  const sep = T.separateur === "tab" ? "\t" : (T.separateur || (texte.split("\n")[0].split(";").length > 1 ? ";" : texte.split("\n")[0].split("\t").length > 1 ? "\t" : ","));
  const lignes = texte.split(/\r?\n/).filter(l=>l.trim()); if (!lignes.length) return {passages:[], rejets:0};
  const tete = decouper(lignes[0], sep), aEntete = tete.some(h=>Object.values(ALIAS).some(re=>re.test(h)));
  /* colonnes : réglage « identifiant=1;date=2;heure=3;sens=4 » (positions à partir de 1), sinon en-têtes reconnus */
  const col = {}; String(T.colonnes||"").split(/[;,]/).forEach(x=>{ const m = /^\s*(\w+)\s*=\s*(\d+)\s*$/.exec(x); if (m) col[m[1]] = +m[2] - 1; });
  if (aEntete) Object.keys(ALIAS).forEach(k=>{ if (col[k] === undefined){ const i = tete.findIndex(h=>ALIAS[k].test(h)); if (i >= 0) col[k] = i; } });
  const table = {}; String(T.codesSens||"").split(/[;,]/).forEach(x=>{ const m = /^\s*([^=]+)=\s*([ES])\s*$/i.exec(x); if (m) table[m[1].trim().toUpperCase()] = m[2].toUpperCase(); });
  if (col.identifiant === undefined || (col.horodatage === undefined && (col.date === undefined || col.heure === undefined)))
    throw new Error("Colonnes non reconnues dans "+nomFichier+" : réglez « Colonnes du fichier » (ex. identifiant=1;date=2;heure=3;sens=4).");
  const passages = []; let rejets = 0;
  lignes.slice(aEntete ? 1 : 0).forEach(l=>{ const c = decouper(l, sep), id = String(c[col.identifiant]||"").trim();
    let d = null, h = null; if (col.horodatage !== undefined){ const v = String(c[col.horodatage]||""); d = dateISO(v, T.formatDate); h = heureApresDate(v); } else { d = dateISO(c[col.date], T.formatDate); h = heure(c[col.heure]); }
    if (!id || !d || !h){ rejets++; return; }
    passages.push({utilisateur:id, horodatage:d+" "+h, sens:col.sens !== undefined ? sensDe(c[col.sens], table) : "",
      source_event_id:"sagem:"+crypto.createHash("sha1").update(String(T.id)+"|"+l.trim()).digest("hex").slice(0, 24),
      payload:{fichier:nomFichier, ligne:l.slice(0, 300), terminal:col.terminal !== undefined ? c[col.terminal] : ""}}); });
  return {passages, rejets};
}
function dossierDe(T){ const d = String(T.dossier||"").trim();
  if (!d || !path.isAbsolute(d)) throw new Error("Indiquez le dossier (chemin complet) où MorphoManager / MEMS dépose les journaux de passages.");
  /* correctif 10 : jamais dans l'installation de FIWAKTI (programmes, données, sauvegardes, clés) */
  { const rac = path.resolve(process.env.FIWAKTI_RACINE || path.join(__dirname, "..", "..", "..", "..")), ici = path.resolve(path.join(__dirname, "..", "..")), r = path.resolve(d);
    const dans = (p, b) => p === b || p.startsWith(b + path.sep);
    if (dans(r, rac) || dans(r, ici) || dans(rac, r)) throw new Error("Dossier refusé : il ne peut pas se trouver dans l'installation de FIWAKTI (ni la contenir). Indiquez le dossier d'export de MorphoManager / MEMS."); }
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error("Dossier introuvable ou inaccessible depuis le serveur FIWAKTI : "+d);
  return d; }
const motifRe = T => new RegExp("^"+String(T.motif || "*.csv;*.txt;*.dat").split(/[;,]/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")).join("$|^")+"$", "i");
module.exports = {
  id:"sagem", nom:"Sagem / Morpho (IDEMIA) — journaux exportés",
  marques:["Sagem", "Morpho", "Safran Morpho", "IDEMIA"], modeles:"MorphoAccess (J, 100, 500, VP), Sigma, MorphoWave, VisionPass — via MorphoManager, MEMS ou BioBridge",
  capacites:["diagnostic", "info", "collecte", "utilisateurs-envoyer", "utilisateurs-retirer"],
  champs:[{k:"dossier", l:"Dossier des journaux exportés (chemin complet sur le serveur)", public:true},
    {k:"motif", l:"Fichiers à lire (ex. *.csv;*.txt)", public:true},
    {k:"colonnes", l:"Colonnes du fichier si sans en-tête (ex. identifiant=1;date=2;heure=3;sens=4)", public:true},
    {k:"codesSens", l:"Codes de sens (ex. F1=E;F2=S;IN=E;OUT=S)", public:true},
    {k:"formatDate", l:"Format des dates (dmy ou mdy)", public:true}],
  async executer(action, T, S, ctx){
    if (action === "diagnostic" || action === "info"){
      const d = dossierDe(T), re = motifRe(T), f = fs.readdirSync(d).filter(n=>re.test(n));
      const der = f.map(n=>fs.statSync(path.join(d, n)).mtime).sort((a, b)=>b - a)[0];
      let ecriture = true; try { fs.accessSync(d, fs.constants.W_OK); } catch(e){ ecriture = false; }
      return {enLigne:true, info:{dossier:d, enAttente:f.length, dernierFichier:der ? der.toISOString().slice(0, 16).replace("T", " ") : "aucun", rangementPossible:ecriture}};
    }
    if (action === "collecte"){
      const d = dossierDe(T), re = motifRe(T), fait = path.join(d, "integres"), tous = [], lus = []; let rejets = 0, fichiers = 0; const erreurs = [];
      for (const n of fs.readdirSync(d).filter(x=>re.test(x)).sort()){
        const p = path.join(d, n); if (!fs.statSync(p).isFile()) continue;
        if (Date.now() - fs.statSync(p).mtimeMs < 15000) continue;                 /* fichier peut-être encore en cours d'écriture */
        try { const r = analyser(lireTexte(fs.readFileSync(p)), T, n); r.passages.forEach(x=>tous.push(x)); rejets += r.rejets; fichiers++; lus.push(n);
        } catch(e){ erreurs.push(e.message); continue; }
      }
      const res = tous.length ? await ctx.integrer(tous) : {integres:0, doublons:0};
      /* rangement après intégration réussie, des seuls fichiers lus (56.33.11 : avant, tout fichier du dossier était rangé,
         y compris un fichier illisible ou arrivé pendant la lecture — ses passages n'étaient jamais intégrés) */
      if (res.ok !== false) try { fs.mkdirSync(fait, {recursive:true}); for (const n of lus){ const p = path.join(d, n);
        if (fs.existsSync(p)) fs.renameSync(p, path.join(fait, new Date().toISOString().slice(0, 10)+"_"+n)); } }
      catch(e){ erreurs.push("Fichiers non rangés (droit d'écriture sur le dossier ?) : ils seront relus sans créer de doublon."); }
      if (erreurs.length) erreurs.push("Les fichiers en erreur restent dans le dossier : ils seront relus après correction du réglage.");
      return Object.assign({fichiers, lus:tous.length, rejets, erreurs}, res);
    }
    if (action === "utilisateurs-envoyer"){
      /* liste des utilisateurs au format d'import de MorphoManager (fichier CSV dans « a-importer/ ») */
      const d = dossierDe(T), liste = await ctx.utilisateursPour(T), dst = path.join(d, "a-importer"); fs.mkdirSync(dst, {recursive:true});
      const q = v => '"'+String(v == null ? "" : v).replace(/"/g, '""')+'"';
      const f = path.join(dst, "utilisateurs-"+new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")+".csv");
      fs.writeFileSync(f, "\uFEFF"+["User ID;Last Name;First Name;Card Number"].concat(liste.map(u=>{ const p = String(u.nom||"").split(" "); return [q(u.id), q(p.slice(1).join(" ")), q(p[0]), q(u.carte)].join(";"); })).join("\r\n"));
      return {envoyes:liste.length, fichier:f, consigne:"Importez ce fichier dans MorphoManager (Utilisateurs › Importer), puis synchronisez les terminaux."};
    }
    /* 56.33.11 : salariés sortis ou bloqués (congé, maladie…) — fichier de suppression pour MorphoManager / MEMS dans
       « a-supprimer/ » (avant : retrait ignoré, l'empreinte restait active sur le terminal) */
    if (action === "utilisateurs-retirer"){
      const d = dossierDe(T), ids = (ctx.options.ids || []).map(String).filter(Boolean), dst = path.join(d, "a-supprimer"); fs.mkdirSync(dst, {recursive:true});
      if (!ids.length) return {retires:0};
      const f = path.join(dst, "utilisateurs-a-supprimer-"+new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")+"-"+crypto.randomBytes(3).toString("hex")+".csv");
      fs.writeFileSync(f, "\uFEFF"+["User ID"].concat(ids.map(v=>'"'+v.replace(/"/g, '""')+'"')).join("\r\n"));
      return {retires:ids.length, fichier:f, note:"Fichier de suppression déposé : MorphoManager › Utilisateurs › Supprimer par fichier, puis synchroniser les terminaux."};
    }
    throw new Error("Action non prise en charge par ce pilote : "+action);
  },
  _interne:{analyser, sensDe, dateISO, heure, heureApresDate}
};
