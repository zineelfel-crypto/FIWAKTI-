/* FIWAKTI 56.33.11 — lecture directe des classeurs Excel (.xlsx, .xlsm) pour l'import, sans bibliothèque :
   archive ZIP lue ici, décompression par le navigateur (DecompressionStream), première feuille convertie en texte
   « ; » que l'import lit comme un CSV. Chargé seulement au dépôt d'un classeur (aucun poids ajouté au socle).
   Les cellules au format date deviennent JJ/MM/AAAA (et HH:MM si l'heure est renseignée). */
(function(){
"use strict";
const LIMITE = 150 * 1024 * 1024;   /* taille décompressée maximale d'un élément : protège d'une archive piégée */
function u16(v, o){ return v.getUint16(o, true); }
function u32(v, o){ return v.getUint32(o, true); }
function entrees(buf){
  const v = new DataView(buf); let fin = -1;
  for (let o = buf.byteLength - 22; o >= Math.max(0, buf.byteLength - 65557); o--) if (u32(v, o) === 0x06054b50){ fin = o; break; }
  if (fin < 0) throw new Error("classeur illisible (archive ZIP introuvable)");
  const n = u16(v, fin + 10), dec = new TextDecoder(), E = {};
  let o = u32(v, fin + 16);
  for (let i = 0; i < n; i++){
    if (u32(v, o) !== 0x02014b50) throw new Error("classeur illisible (répertoire ZIP)");
    const methode = u16(v, o + 10), taille = u32(v, o + 20), lnom = u16(v, o + 28), lext = u16(v, o + 30), lcom = u16(v, o + 32), local = u32(v, o + 42);
    const nom = dec.decode(new Uint8Array(buf, o + 46, lnom));
    E[nom] = {methode, taille, local};
    o += 46 + lnom + lext + lcom;
  }
  return E;
}
async function lire(buf, E, nom){
  const e = E[nom]; if (!e) return null;
  const v = new DataView(buf);
  if (u32(v, e.local) !== 0x04034b50) throw new Error("classeur illisible ("+nom+")");
  const debut = e.local + 30 + u16(v, e.local + 26) + u16(v, e.local + 28), brut = new Uint8Array(buf, debut, e.taille);
  if (e.methode === 0) return new TextDecoder().decode(brut);
  if (e.methode !== 8) throw new Error("compression non prise en charge ("+nom+")");
  const lecteur = new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const morceaux = []; let total = 0;
  for (;;){ const r = await lecteur.read(); if (r.done) break; total += r.value.length;
    if (total > LIMITE){ lecteur.cancel().catch(()=>{}); throw new Error("classeur trop volumineux une fois décompressé"); }
    morceaux.push(r.value); }
  return new TextDecoder().decode(await new Blob(morceaux).arrayBuffer());
}
function xml(txt){ const d = new DOMParser().parseFromString(txt, "application/xml"); if (d.getElementsByTagName("parsererror").length) throw new Error("classeur illisible (XML)"); return d; }
const tags = (n, t) => Array.from(n.getElementsByTagNameNS("*", t));
/* formats date : identifiants intégrés 14-22 et 45-47, ou format personnalisé contenant j/m/a */
function formatsDate(stylesTxt){
  const R = {xf:[], dates:new Set([14,15,16,17,22]), heures:new Set([18,19,20,21,45,46,47])};
  if (!stylesTxt) return R;
  const d = xml(stylesTxt);
  tags(d, "numFmt").forEach(f=>{ const id = +f.getAttribute("numFmtId"), c = String(f.getAttribute("formatCode")||"").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "").toLowerCase();
    if (/[dy]/.test(c) || /m.*[dy]|[dy].*m/.test(c)) R.dates.add(id); else if (/h|s/.test(c)) R.heures.add(id); });
  const cx = tags(d, "cellXfs")[0];
  if (cx) R.xf = tags(cx, "xf").map(x=>+x.getAttribute("numFmtId") || 0);
  return R;
}
const p2 = n => (n < 10 ? "0" : "")+n;
function dateExcel(serie, avecDate, avecHeure){
  const ms = Math.round((serie - 25569) * 86400000), d = new Date(ms);
  const j = p2(d.getUTCDate())+"/"+p2(d.getUTCMonth()+1)+"/"+d.getUTCFullYear(), h = p2(d.getUTCHours())+":"+p2(d.getUTCMinutes());
  if (!avecDate) return h;
  return avecHeure && (d.getUTCHours() || d.getUTCMinutes()) ? j+" "+h : j;
}
const colonne = ref => { let n = 0; for (const c of String(ref).replace(/\d+/g, "")) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
function cellule(v){ v = String(v == null ? "" : v).replace(/\r?\n/g, " "); return /[;"]/.test(v) ? '"'+v.replace(/"/g, '""')+'"' : v; }

window.FWK_XLSX = async function(fichier){
  const buf = await fichier.arrayBuffer(), E = entrees(buf);
  /* première feuille dans l'ordre du classeur */
  let chemin = "xl/worksheets/sheet1.xml";
  try {
    const wb = xml(await lire(buf, E, "xl/workbook.xml")), rels = xml(await lire(buf, E, "xl/_rels/workbook.xml.rels"));
    const s = tags(wb, "sheet")[0], rid = s && (s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const r = tags(rels, "Relationship").find(x=>x.getAttribute("Id") === rid);
    if (r){ const cible = String(r.getAttribute("Target")||""); chemin = cible.charAt(0) === "/" ? cible.slice(1) : "xl/"+cible.replace(/^\.\//, ""); }
  } catch(e){}
  const feuille = await lire(buf, E, chemin);
  if (!feuille) throw new Error("aucune feuille trouvée dans le classeur");
  const partages = [], ss = await lire(buf, E, "xl/sharedStrings.xml");
  if (ss) tags(xml(ss), "si").forEach(si=>partages.push(tags(si, "t").map(t=>t.textContent).join("")));
  const F = formatsDate(await lire(buf, E, "xl/styles.xml"));
  const lignes = [];
  tags(xml(feuille), "row").forEach(row=>{
    const ligne = [];
    tags(row, "c").forEach((c, k)=>{
      const ref = c.getAttribute("r"), i = ref ? colonne(ref) : k, type = c.getAttribute("t") || "n";
      const vN = tags(c, "v")[0], v = vN ? vN.textContent : "";
      let val = "";
      if (type === "s") val = partages[+v] || "";
      else if (type === "inlineStr") val = tags(c, "t").map(t=>t.textContent).join("");
      else if (type === "b") val = v === "1" ? "1" : "0";
      else if (type === "str" || type === "e") val = v;
      else if (v !== ""){
        const fmt = F.xf[+(c.getAttribute("s") || 0)] || 0, n = Number(v);
        if (F.dates.has(fmt) && isFinite(n)) val = dateExcel(n, true, true);
        else if (F.heures.has(fmt) && isFinite(n)) val = dateExcel(n, n >= 1, true);
        else val = isFinite(n) ? String(+n.toPrecision(15)) : v;
      }
      while (ligne.length < i) ligne.push("");
      ligne[i] = val;
    });
    if (ligne.some(x=>String(x).trim())) lignes.push(ligne.map(cellule).join(";"));
  });
  if (!lignes.length) throw new Error("la première feuille est vide");
  return lignes.join("\n");
};
})();
