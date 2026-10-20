/* FW-Competences — interface (chargée à la demande par le socle, jamais au démarrage).
   Matrice paginée côté serveur et virtualisée : seules les lignes visibles existent dans le DOM, quel que soit l'effectif. */
(function(){
"use strict";
const L = {
  fr:{titre:"Compétences", lede:"Matrice des compétences du personnel de votre périmètre, écarts avec les niveaux requis par fonction, catalogue.", matrice:"Matrice", ecarts:"Écarts", catalogue:"Catalogue",
    recherche:"Rechercher un salarié…", toutesFonctions:"Toutes les fonctions", salaries:"{n} salarié(s)", salarie:"Salarié", fonction:"Fonction", ecartsN:"Écarts",
    aucuneComp:"Aucune compétence au catalogue : commencez par l'onglet « Catalogue ».", chargement:"Chargement…", niveau:"Niveau {n} — cliquer pour changer",
    requis:"requis {n}", code:"Code", nom:"Nom", domaine:"Domaine", ajouter:"Ajouter", exigencesPour:"Niveaux requis pour la fonction", choisirFonction:"Choisir une fonction…",
    concernes:"Concernés", conformes:"Conformes", taux:"Taux", enEcart:"En écart", aucunEcart:"Aucune exigence définie : fixez les niveaux requis par fonction dans « Catalogue ».",
    enregistre:"Niveau enregistré.", ajoute:"Compétence ajoutée.", exigenceOk:"Niveau requis enregistré.", legende:"0 non évalué · 1 notions · 2 autonome · 3 confirmé · 4 expert"},
  en:{titre:"Skills", lede:"Skills matrix of the staff in your scope, gaps against required levels by job, catalogue.", matrice:"Matrix", ecarts:"Gaps", catalogue:"Catalogue",
    recherche:"Search an employee…", toutesFonctions:"All jobs", salaries:"{n} employee(s)", salarie:"Employee", fonction:"Job", ecartsN:"Gaps",
    aucuneComp:"No skill in the catalogue yet: start with the “Catalogue” tab.", chargement:"Loading…", niveau:"Level {n} — click to change",
    requis:"required {n}", code:"Code", nom:"Name", domaine:"Area", ajouter:"Add", exigencesPour:"Required levels for job", choisirFonction:"Choose a job…",
    concernes:"Concerned", conformes:"Compliant", taux:"Rate", enEcart:"With gap", aucunEcart:"No requirement defined: set required levels per job in “Catalogue”.",
    enregistre:"Level saved.", ajoute:"Skill added.", exigenceOk:"Required level saved.", legende:"0 not assessed · 1 basic · 2 autonomous · 3 proficient · 4 expert"},
  ar:{titre:"الكفاءات", lede:"مصفوفة كفاءات الأعوان في نطاقك، الفوارق مع المستويات المطلوبة حسب الوظيفة، الفهرس.", matrice:"المصفوفة", ecarts:"الفوارق", catalogue:"الفهرس",
    recherche:"بحث عن أجير…", toutesFonctions:"كل الوظائف", salaries:"{n} أجير", salarie:"الأجير", fonction:"الوظيفة", ecartsN:"الفوارق",
    aucuneComp:"لا كفاءات في الفهرس: ابدأ بعلامة «الفهرس».", chargement:"جار التحميل…", niveau:"المستوى {n} — انقر للتغيير",
    requis:"المطلوب {n}", code:"الرمز", nom:"الاسم", domaine:"المجال", ajouter:"إضافة", exigencesPour:"المستويات المطلوبة للوظيفة", choisirFonction:"اختر وظيفة…",
    concernes:"المعنيون", conformes:"المطابقون", taux:"النسبة", enEcart:"بفارق", aucunEcart:"لا متطلبات: حدد المستويات المطلوبة في «الفهرس».",
    enregistre:"تم حفظ المستوى.", ajoute:"أضيفت الكفاءة.", exigenceOk:"تم حفظ المستوى المطلوب.", legende:"0 غير مقيم · 1 مبادئ · 2 مستقل · 3 متمكن · 4 خبير"}
};
const HAUTEUR = 36, PAGE = 100, MARGE = 8;
Object.assign(L.fr, {reseau:"Serveur injoignable : vérifiez la connexion puis réessayez."}); Object.assign(L.en, {reseau:"Server unreachable: check the connection and try again."}); Object.assign(L.ar, {reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة."});
/* correctif 39 */
Object.assign(L.fr, {modifier:"Modifier", enregistrer:"Enregistrer", annuler:"Annuler", retirer:"Retirer", retirerQ:"Retirer la compétence « {n} » du catalogue ? Ses niveaux sont conservés ; elle peut être réactivée.", reactiver:"Réactiver", retirees:"Compétences retirées",
  baisseQ:"Baisser le niveau de {n} de {a} à {b} ? Indiquez le motif (conservé dans l'historique).", motif:"Motif", historique:"Historique", historiqueDe:"Historique — {n}", fermer:"Fermer", aucunHist:"Aucune modification enregistrée.",
  exporter:"Exporter (CSV)", envoi:"Enregistrement…", modifieOk:"Compétence modifiée.", retireOk:"Compétence retirée.", reactiveOk:"Compétence réactivée.", actions:"Actions", liste:"Liste", par:"par {p}", requisCol:"Requis"});
Object.assign(L.en, {modifier:"Edit", enregistrer:"Save", annuler:"Cancel", retirer:"Remove", retirerQ:"Remove the skill “{n}” from the catalogue? Its levels are kept; it can be reactivated.", reactiver:"Reactivate", retirees:"Removed skills",
  baisseQ:"Lower {n}'s level from {a} to {b}? Give the reason (kept in history).", motif:"Reason", historique:"History", historiqueDe:"History — {n}", fermer:"Close", aucunHist:"No change recorded.",
  exporter:"Export (CSV)", envoi:"Saving…", modifieOk:"Skill updated.", retireOk:"Skill removed.", reactiveOk:"Skill reactivated.", actions:"Actions", liste:"List", par:"by {p}", requisCol:"Required"});
Object.assign(L.ar, {modifier:"تعديل", enregistrer:"حفظ", annuler:"إلغاء", retirer:"سحب", retirerQ:"سحب الكفاءة «{n}» من الفهرس؟ تُحفظ مستوياتها ويمكن إعادة تفعيلها.", reactiver:"إعادة التفعيل", retirees:"الكفاءات المسحوبة",
  baisseQ:"خفض مستوى {n} من {a} إلى {b}؟ اذكر التعليل.", motif:"التعليل", historique:"السجل", historiqueDe:"السجل — {n}", fermer:"إغلاق", aucunHist:"لا تعديلات.",
  exporter:"تصدير (CSV)", envoi:"جار الحفظ…", modifieOk:"عُدلت الكفاءة.", retireOk:"سُحبت الكفاءة.", reactiveOk:"أعيد تفعيل الكفاءة.", actions:"الإجراءات", liste:"القائمة", par:"بواسطة {p}", requisCol:"المطلوب"});
function T(ctx, k, n){ const s = (L[ctx.lang] || L.fr)[k] || L.fr[k] || k; return n === undefined ? s : s.replace("{n}", n); }
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
/* correctif 39 : droits renvoyés par le serveur (matrice de l'écran) */
const droits = ctx => { const d = (ctx.etat.cat || {}).droits, r = ctx.rang("EMP"); return d || {modifier:r >= 2, parametrer:r >= 4, exporter:r >= 2}; };
const jjh = ts => { const d = new Date(ts); if (isNaN(d)) return String(ts||""); const z = n => String(n).padStart(2, "0"); return z(d.getDate())+"/"+z(d.getMonth()+1)+"/"+d.getFullYear()+" "+z(d.getHours())+":"+z(d.getMinutes()); };
function charger(ctx){
  const E = ctx.etat;
  if (!E.init){ Object.assign(E, {init:true, onglet:"matrice", q:"", fonction:"", total:null, comps:[], lignes:{}, pages:{}, cat:null, ecarts:null, fonctionEx:"", req:0, focus:{i:0, j:0}, form:{}, editC:null, hist:null}); }
  if (!E.cat && !E.catEnCours){ E.catEnCours = true; ctx.api("api/v1/competences/catalogue").then(j=>{ E.cat = j; E.catEnCours = false; ctx.rendre(); }).catch(e=>{ E.catEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
}
function page(ctx, n){
  const E = ctx.etat; if (E.pages[n]) return;
  E.pages[n] = "encours"; const req = E.req;
  const q = "offset="+(n*PAGE)+"&limit="+PAGE+"&q="+encodeURIComponent(E.q)+"&fonction="+encodeURIComponent(E.fonction);
  ctx.api("api/v1/competences/matrice?"+q).then(j=>{
    /* correctif 39 : réponse d'un filtre précédent ignorée (elle remplissait la grille de lignes obsolètes) */
    if (ctx.etat !== E || req !== E.req) return;
    const premier = E.total === null; E.total = j.total; E.comps = j.competences; j.lignes.forEach((l, i)=>{ E.lignes[n*PAGE + i] = l; }); E.pages[n] = "ok";
    const g = document.getElementById("fwcGrille"); if (g && g.dataset.pret && !premier) dessiner(ctx); else ctx.rendre();
  }).catch(e=>{ if (req === E.req) E.pages[n] = null; ctx.flash(msgErr(ctx, e), "err"); });
}
function reinitialiser(ctx){ const E = ctx.etat; E.total = null; E.lignes = {}; E.pages = {}; E.req++; E.focus = {i:0, j:0}; }
/* correctif 34 : cellule nommée ; correctif 39 : cellule « gridcell » contenant un bouton, une seule cellule dans l'ordre
   de tabulation (flèches pour se déplacer) */
function cellules(ctx, l, i){
  const E = ctx.etat, lecture = !droits(ctx).modifier, occ = E.occ || {};
  return E.comps.map((c, j)=>{ const n = l.niveaux[c.id] || 0, r = l.requis[c.id] || 0, lib = l.nom+" — "+c.code+" : "+T(ctx, "niveau", n)+(r ? " · "+T(ctx, "requis", r) : "");
    return '<span role="gridcell" class="fwc-g"><button type="button" class="fwc-n fwc-n'+n+(r && n < r ? ' fwc-ecart' : '')+'" data-act="fwm:niveau" data-i="'+i+'" data-j="'+j+'" data-mat="'+ctx.esc(l.mat)+'" data-cid="'+ctx.esc(c.id)+'" tabindex="'+(E.focus.i === i && E.focus.j === j ? 0 : -1)+'" title="'+ctx.esc(lib)+'" aria-label="'+ctx.esc(lib)+'"'+(lecture ? ' aria-disabled="true"' : '')+(occ[l.mat+"|"+c.id] ? ' disabled' : '')+'>'+n+(r ? '<small>/'+r+'</small>' : '')+'</button></span>'; }).join("");
}
/* dessin des seules lignes visibles (virtualisation) */
function dessiner(ctx){
  const E = ctx.etat, g = document.getElementById("fwcGrille"); if (!g || E.total === null) return;
  const debut = Math.max(0, Math.floor(g.scrollTop / HAUTEUR) - MARGE), fin = Math.min(E.total, Math.ceil((g.scrollTop + g.clientHeight) / HAUTEUR) + MARGE);
  for (let p = Math.floor(debut / PAGE); p <= Math.floor(Math.max(debut, fin - 1) / PAGE); p++) page(ctx, p);
  let h = "";
  for (let i = debut; i < fin; i++){ const l = E.lignes[i];
    h += '<div class="fwc-l" role="row" aria-rowindex="'+(i+2)+'" style="top:'+(i*HAUTEUR)+'px">'+(l ? '<span class="fwc-nom" role="rowheader"><button type="button" class="fw-link" data-act="fwm:hist" data-mat="'+ctx.esc(l.mat)+'" data-nom="'+ctx.esc(l.nom)+'" tabindex="-1" title="'+ctx.esc(T(ctx,"historique")+" · "+l.mat)+'">'+ctx.esc(l.nom)+'</button></span><span class="fwc-f" role="gridcell">'+ctx.esc(l.fonction||"—")+'</span><span class="fwc-e'+(l.ecarts ? ' fwc-ko' : '')+'" role="gridcell">'+l.ecarts+'</span>'+cellules(ctx, l, i)
      : '<span class="fwc-nom fwc-att">'+ctx.esc(T(ctx, "chargement"))+'</span>')+'</div>'; }
  const z = g.querySelector(".fwc-zone"); if (z){ z.style.height = (E.total*HAUTEUR)+"px"; z.innerHTML = h; }
}
/* correctif 39 : le focus revient sur la cellule (il partait sur la page après chaque saisie ou défilement) */
function focusCellule(ctx){ const E = ctx.etat, x = document.querySelector('#fwcGrille button[data-i="'+E.focus.i+'"][data-j="'+E.focus.j+'"]'); if (x) x.focus({preventScroll:true}); }
function vueHist(ctx){
  const E = ctx.etat, H = E.hist; if (!H) return '';
  return '<div class="fw-card fw-u-p" id="fwcHist" tabindex="-1" role="region" aria-label="'+ctx.esc(T(ctx,"historiqueDe").replace("{n}", H.nom))+'" style="margin-bottom:10px"><div class="fw-toolbar" style="margin:0"><strong>'+ctx.esc(T(ctx,"historiqueDe").replace("{n}", H.nom+" · "+H.mat))+'</strong><button class="fw-btn sm" data-act="fwm:histFin">'+ctx.esc(T(ctx,"fermer"))+'</button></div>'+
    (!H.l ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !H.l.historique.length ? '<div class="fw-hint">'+ctx.esc(T(ctx,"aucunHist"))+'</div>' :
    '<ul class="fw-sm">'+H.l.historique.map(r=>'<li>'+ctx.esc(jjh(r.ts)+" — "+(r.code || r.competence_id)+" : "+(r.avant == null ? "—" : r.avant)+" → "+r.apres+" — "+T(ctx,"par").replace("{p}", r.par || "")+(r.motif ? " — "+r.motif : ""))+'</li>').join("")+'</ul>')+'</div>';
}
function vueMatrice(ctx){
  const E = ctx.etat, dr = droits(ctx);
  if (E.cat && !E.cat.competences.length) return '<div class="fw-empty">'+ctx.esc(T(ctx, "aucuneComp"))+'</div>';
  if (E.total === null) page(ctx, 0);
  const fn = (E.cat && E.cat.fonctions) || [];
  return vueHist(ctx)+'<div class="fw-toolbar"><input type="search" data-fwmc="recherche" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx, "recherche"))+'" aria-label="'+ctx.esc(T(ctx, "recherche"))+'">'+
    '<select data-fwmc="fonction" aria-label="'+ctx.esc(T(ctx, "fonction"))+'"><option value="">'+ctx.esc(T(ctx, "toutesFonctions"))+'</option>'+fn.map(f=>'<option'+(E.fonction === f ? ' selected' : '')+'>'+ctx.esc(f)+'</option>').join("")+'</select>'+
    (dr.exporter ? '<a class="fw-btn sm" href="api/v1/competences/export?lang='+encodeURIComponent(ctx.lang||"fr")+'&q='+encodeURIComponent(E.q)+'&fonction='+encodeURIComponent(E.fonction)+'">'+ctx.esc(T(ctx,"exporter"))+'</a>' : '')+
    '<span class="fw-hint" aria-live="polite">'+(E.total === null ? ctx.esc(T(ctx, "chargement")) : ctx.esc(T(ctx, "salaries", E.total)))+' · '+ctx.esc(T(ctx, "legende"))+'</span></div>'+
    '<div id="fwcGrille" class="fwc-grille" role="grid" aria-rowcount="'+((E.total || 0) + 1)+'" aria-colcount="'+(3 + E.comps.length)+'" aria-label="'+ctx.esc(T(ctx, "matrice"))+'" style="--fwc-n:'+Math.max(1, E.comps.length)+'"><div class="fwc-tete" role="row" aria-rowindex="1"><span class="fwc-nom" role="columnheader">'+ctx.esc(T(ctx, "salarie"))+'</span><span class="fwc-f" role="columnheader">'+ctx.esc(T(ctx, "fonction"))+'</span><span class="fwc-e" role="columnheader">'+ctx.esc(T(ctx, "ecartsN"))+'</span>'+
      E.comps.map(c=>'<span class="fwc-c" role="columnheader" title="'+ctx.esc(c.nom)+'">'+ctx.esc(c.code)+'</span>').join("")+'</div>'+
    '<div class="fwc-zone"></div></div>';
}
function vueEcarts(ctx){
  const E = ctx.etat;
  if (!E.ecarts){ if (!E.ecEnCours){ E.ecEnCours = true; ctx.api("api/v1/competences/ecarts").then(j=>{ E.ecarts = j; E.ecEnCours = false; ctx.rendre(); }).catch(e=>{ E.ecEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); } return '<div class="fw-hint">'+ctx.esc(T(ctx, "chargement"))+'</div>'; }
  const l = E.ecarts.competences.filter(c=>c.concernes);
  if (!l.length) return '<div class="fw-empty">'+ctx.esc(T(ctx, "aucunEcart"))+'</div>';
  return '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"ecarts"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx, "code"))+'</th><th scope="col">'+ctx.esc(T(ctx, "nom"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx, "concernes"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx, "conformes"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx, "enEcart"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx, "taux"))+'</th></tr></thead><tbody>'+
    l.map(c=>'<tr><td class="fw-mono">'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.nom)+'</td><td class="fw-num">'+c.concernes+'</td><td class="fw-num">'+c.conformes+'</td><td class="fw-num'+(c.ecarts ? ' fwc-ko' : '')+'">'+c.ecarts+'</td><td class="fw-num">'+(c.taux == null ? "—" : c.taux+" %")+'</td></tr>').join("")+'</tbody></table>';
}
function vueCatalogue(ctx){
  const E = ctx.etat, cat = E.cat; if (!cat) return '<div class="fw-hint">'+ctx.esc(T(ctx, "chargement"))+'</div>';
  const dr = droits(ctx), peut = dr.parametrer, f = E.fonctionEx, ed = E.editC && cat.competences.find(c=>c.id === E.editC), dis = E.envoi ? ' disabled aria-busy="true"' : '';
  const fv = (k, d) => E.form[k] != null ? E.form[k] : (d || "");
  const req = {}; (cat.exigences||[]).filter(x=>x.fonction === f).forEach(x=>{ req[x.competence_id] = Number(x.niveau); });
  const fonctions = peut && (cat.fonctionsParam || []).length ? cat.fonctionsParam : (cat.fonctions || []);
  return (peut ? '<div class="fw-card fw-u-p" style="margin-bottom:12px"><div class="fw-toolbar" style="margin:0">'+(ed ? '<strong>'+ctx.esc(T(ctx,"modifier")+" : "+ed.code)+'</strong>' : '')+
      '<input id="fwcCode" data-fwmc="f:fwcCode" maxlength="20" value="'+ctx.esc(fv("fwcCode", ed && ed.code))+'" placeholder="'+ctx.esc(T(ctx, "code"))+'" aria-label="'+ctx.esc(T(ctx, "code"))+'" style="max-width:110px"><input id="fwcNom" data-fwmc="f:fwcNom" maxlength="120" value="'+ctx.esc(fv("fwcNom", ed && ed.nom))+'" placeholder="'+ctx.esc(T(ctx, "nom"))+'" aria-label="'+ctx.esc(T(ctx, "nom"))+'"><input id="fwcDomaine" data-fwmc="f:fwcDomaine" maxlength="60" value="'+ctx.esc(fv("fwcDomaine", ed && ed.domaine))+'" placeholder="'+ctx.esc(T(ctx, "domaine"))+'" aria-label="'+ctx.esc(T(ctx, "domaine"))+'">'+
      (ed ? '<button type="button" class="fw-btn pri" data-act="fwm:majComp"'+dis+'>'+ctx.esc(T(ctx, "enregistrer"))+'</button><button type="button" class="fw-btn" data-act="fwm:finEdit">'+ctx.esc(T(ctx, "annuler"))+'</button>'
        : '<button type="button" class="fw-btn pri" data-act="fwm:ajouter"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "ajouter"))+'</button>')+'</div></div>' : '')+
    '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx, "exigencesPour"))+' <select data-fwmc="fonctionEx"><option value="">'+ctx.esc(T(ctx, "choisirFonction"))+'</option>'+fonctions.map(x=>'<option'+(x === f ? ' selected' : '')+'>'+ctx.esc(x)+'</option>').join("")+'</select></label></div>'+
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"catalogue"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx, "code"))+'</th><th scope="col">'+ctx.esc(T(ctx, "nom"))+'</th><th scope="col">'+ctx.esc(T(ctx, "domaine"))+'</th>'+(f ? '<th scope="col">'+ctx.esc(T(ctx, "requisCol"))+'</th>' : '')+(peut ? '<th scope="col">'+ctx.esc(T(ctx, "actions"))+'</th>' : '')+'</tr></thead><tbody>'+
    cat.competences.map(c=>'<tr><td class="fw-mono">'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.nom)+'</td><td>'+ctx.esc(c.domaine||"")+'</td>'+
      (f ? '<td><select data-fwmc="exigence" data-cid="'+ctx.esc(c.id)+'"'+(peut && !E.envoi ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"requisCol")+" — "+c.nom+" — "+f)+'">'+[0,1,2,3,4].map(n=>'<option value="'+n+'"'+((req[c.id]||0) === n ? ' selected' : '')+'>'+n+'</option>').join("")+'</select></td>' : '')+
      (peut ? '<td><button class="fw-btn sm" data-act="fwm:editC" data-id="'+ctx.esc(c.id)+'" aria-label="'+ctx.esc(T(ctx,"modifier")+" : "+c.code)+'">'+ctx.esc(T(ctx,"modifier"))+'</button> <button class="fw-btn sm" data-act="fwm:retirer" data-id="'+ctx.esc(c.id)+'" data-nom="'+ctx.esc(c.code+" — "+c.nom)+'" aria-label="'+ctx.esc(T(ctx,"retirer")+" : "+c.code)+'"'+dis+'>'+ctx.esc(T(ctx,"retirer"))+'</button></td>' : '')+'</tr>').join("")+'</tbody></table>'+
    (peut && (cat.retirees || []).length ? '<div class="fw-sec">'+ctx.esc(T(ctx,"retirees"))+'</div><ul class="fw-sm">'+cat.retirees.map(c=>'<li>'+ctx.esc(c.code+" — "+c.nom)+' <button class="fw-btn sm" data-act="fwm:reactiver" data-id="'+ctx.esc(c.id)+'"'+dis+'>'+ctx.esc(T(ctx,"reactiver"))+'</button></li>').join("")+'</ul>' : '');
}
FIWAKTI_MODULES.enregistrer({
  id:"FW-Competences",
  mount(ctx){ charger(ctx); },
  unmount(ctx){ /* l'état du module est effacé par le socle ; rien d'autre à libérer */ },
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const onglets = [["matrice", T(ctx, "matrice")], ["ecarts", T(ctx, "ecarts")], ["catalogue", T(ctx, "catalogue")]];
    return '<div class="fw-module fwc">'+
      '<div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx, "titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx, "lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+onglets.map(([k, l])=>'<button type="button" role="tab" id="fwcT-'+k+'" aria-controls="fwcP" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(l)+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwcP" role="tabpanel" aria-labelledby="fwcT-'+E.onglet+'">'+(E.onglet === "ecarts" ? vueEcarts(ctx) : E.onglet === "catalogue" ? vueCatalogue(ctx) : vueMatrice(ctx))+'</div></div>';
  },
  afterRender(ctx){
    const g = document.getElementById("fwcGrille"); if (!g) return;
    let prevu = false;
    ctx.ecouter(g, "scroll", ()=>{ if (prevu) return; prevu = true; requestAnimationFrame(()=>{ prevu = false; const a = document.activeElement && g.contains(document.activeElement); dessiner(ctx); if (a) focusCellule(ctx); }); }, {passive:true});
    /* correctif 39 : navigation au clavier dans la grille (flèches, Début, Fin, Page préc./suiv.) */
    ctx.ecouter(g, "keydown", ev=>{
      const E = ctx.etat, nc = E.comps.length; if (!nc || !E.total) return;
      const rtl = ctx.lang === "ar", k = ev.key; let {i, j} = E.focus;
      if (k === "ArrowDown") i++; else if (k === "ArrowUp") i--; else if (k === "ArrowRight") j += rtl ? -1 : 1; else if (k === "ArrowLeft") j += rtl ? 1 : -1;
      else if (k === "Home") j = 0; else if (k === "End") j = nc - 1; else if (k === "PageDown") i += 10; else if (k === "PageUp") i -= 10; else return;
      ev.preventDefault(); E.focus = {i:Math.max(0, Math.min(E.total - 1, i)), j:Math.max(0, Math.min(nc - 1, j))};
      const haut = E.focus.i * HAUTEUR; if (haut < g.scrollTop) g.scrollTop = haut; else if (haut + HAUTEUR > g.scrollTop + g.clientHeight) g.scrollTop = haut + HAUTEUR - g.clientHeight;
      dessiner(ctx); focusCellule(ctx);
    });
    g.dataset.pret = "1"; dessiner(ctx);
  },
  action(a, el, ctx){
    const E = ctx.etat, ko = e => ctx.flash(msgErr(ctx, e), "err");
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(e=>{ ko(e); }).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const viderForm = () => { ["fwcCode","fwcNom","fwcDomaine"].forEach(k=>{ delete E.form[k]; }); };
    if (a === "onglet"){ E.onglet = el.dataset.o; if (E.onglet === "ecarts") E.ecarts = null; ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fwcT-"+el.dataset.o); if (x) x.focus(); }, 80); }
    if (a === "niveau"){
      if (!droits(ctx).modifier) return;
      E.focus = {i:+el.dataset.i, j:+el.dataset.j};
      const idx = Object.keys(E.lignes).find(i=>E.lignes[i] && E.lignes[i].mat === el.dataset.mat), l = idx !== undefined ? E.lignes[idx] : null; if (!l) return;
      /* correctif 34 : une seule écriture par cellule à la fois */
      const k = l.mat+"|"+el.dataset.cid; E.occ = E.occ || {}; if (E.occ[k]) return;
      const cid = el.dataset.cid, avant = l.niveaux[cid] || 0, n = (avant + 1) % 5;
      /* correctif 39 : niveau affiché envoyé (une saisie concurrente n'est plus écrasée) ; une baisse demande un motif */
      const envoyer = motif => { E.occ[k] = true; dessiner(ctx); focusCellule(ctx);
        return ctx.api("api/v1/competences/niveau", {corps:{mat:l.mat, competenceId:cid, niveau:n, avant, motif:motif || ""}}).then(()=>{ delete E.occ[k];
          l.niveaux[cid] = n; l.ecarts = Object.keys(l.requis).filter(c=>(l.niveaux[c]||0) < l.requis[c]).length; E.ecarts = null; dessiner(ctx); focusCellule(ctx);
        }).catch(e=>{ delete E.occ[k]; ko(e); if (e && e.statut === 409){ reinitialiser(ctx); ctx.rendre(); } else { dessiner(ctx); focusCellule(ctx); } }); };
      if (n < avant) return ctx.confirmer({titre:T(ctx,"modifier"), message:T(ctx,"baisseQ").replace("{n}", l.nom).replace("{a}", avant).replace("{b}", n), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif"), danger:true}).then(r=>{ if (r.ok) envoyer(r.motif); else focusCellule(ctx); });
      return envoyer("");
    }
    if (a === "hist"){ E.hist = {mat:el.dataset.mat, nom:el.dataset.nom, l:null}; ctx.rendre();
      return ctx.api("api/v1/competences/historique?limit=100&mat="+encodeURIComponent(el.dataset.mat)).then(j=>{ if (E.hist && E.hist.mat === el.dataset.mat){ E.hist.l = j; ctx.rendre(); setTimeout(()=>{ const x = document.getElementById("fwcHist"); if (x) x.focus(); }, 80); } }).catch(ko); }
    if (a === "histFin"){ E.hist = null; ctx.rendre(); return setTimeout(()=>focusCellule(ctx), 80); }
    if (a === "ajouter"){ const corps = {code:val("fwcCode"), nom:val("fwcNom"), domaine:val("fwcDomaine")};
      return verrou(()=>ctx.api("api/v1/competences/catalogue", {corps}).then(()=>{ ctx.flash(T(ctx, "ajoute"), "ok"); viderForm(); E.cat = null; reinitialiser(ctx); })); }
    if (a === "editC"){ E.editC = el.dataset.id; viderForm(); ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fwcCode"); if (x) x.focus(); }, 80); }
    if (a === "finEdit"){ E.editC = null; viderForm(); return ctx.rendre(); }
    if (a === "majComp"){ const corps = {code:val("fwcCode"), nom:val("fwcNom"), domaine:val("fwcDomaine")}, id = E.editC;
      return verrou(()=>ctx.api("api/v1/competences/catalogue/"+encodeURIComponent(id), {corps}).then(()=>{ ctx.flash(T(ctx, "modifieOk"), "ok"); E.editC = null; viderForm(); E.cat = null; reinitialiser(ctx); })); }
    if (a === "retirer") return ctx.confirmer({titre:T(ctx,"retirer"), message:T(ctx,"retirerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/competences/catalogue/"+encodeURIComponent(el.dataset.id)+"/retirer", {corps:{}}).then(()=>{ ctx.flash(T(ctx, "retireOk"), "ok"); E.cat = null; reinitialiser(ctx); })); });
    if (a === "reactiver") return verrou(()=>ctx.api("api/v1/competences/catalogue/"+encodeURIComponent(el.dataset.id)+"/reactiver", {corps:{}}).then(()=>{ ctx.flash(T(ctx, "reactiveOk"), "ok"); E.cat = null; reinitialiser(ctx); }));
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.value; return; }
    if (k === "recherche"){ E.q = el.value.trim(); reinitialiser(ctx); return ctx.rendre(); }
    if (k === "fonction"){ E.fonction = el.value; reinitialiser(ctx); return ctx.rendre(); }
    if (k === "fonctionEx"){ E.fonctionEx = el.value; return ctx.rendre(); }
    /* correctif 39 : en cas de refus, la valeur affichée est rétablie */
    if (k === "exigence"){ if (E.envoi){ ctx.rendre(); return; } E.envoi = true; const id = "x"; 
      return ctx.api("api/v1/competences/exigence", {corps:{fonction:E.fonctionEx, competenceId:el.dataset.cid, niveau:Number(el.value)}}).then(()=>{ ctx.flash(T(ctx, "exigenceOk"), "ok"); E.cat = null; E.ecarts = null; reinitialiser(ctx); })
        .catch(e=>ctx.flash(msgErr(ctx, e), "err")).then(()=>{ E.envoi = false; ctx.rendre(); const x = document.querySelector('select[data-fwmc="exigence"][data-cid="'+el.dataset.cid+'"]'); if (x) setTimeout(()=>{ const y = document.querySelector('select[data-fwmc="exigence"][data-cid="'+el.dataset.cid+'"]'); if (y) y.focus(); }, 300); }); }
  }
});
const val = id => ((document.getElementById(id)||{}).value || "").trim();
})();
