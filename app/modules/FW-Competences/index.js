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
function T(ctx, k, n){ const s = (L[ctx.lang] || L.fr)[k] || L.fr[k] || k; return n === undefined ? s : s.replace("{n}", n); }
function charger(ctx){
  const E = ctx.etat;
  if (!E.init){ Object.assign(E, {init:true, onglet:"matrice", q:"", fonction:"", total:null, comps:[], lignes:{}, pages:{}, cat:null, ecarts:null, fonctionEx:""}); }
  if (!E.cat && !E.catEnCours){ E.catEnCours = true; ctx.api("api/v1/competences/catalogue").then(j=>{ E.cat = j; E.catEnCours = false; ctx.rendre(); }).catch(e=>{ E.catEnCours = false; ctx.flash(e.message, "err"); }); }
}
function page(ctx, n){
  const E = ctx.etat; if (E.pages[n]) return;
  E.pages[n] = "encours";
  const q = "offset="+(n*PAGE)+"&limit="+PAGE+"&q="+encodeURIComponent(E.q)+"&fonction="+encodeURIComponent(E.fonction);
  ctx.api("api/v1/competences/matrice?"+q).then(j=>{
    if (ctx.etat !== E) return;
    const premier = E.total === null; E.total = j.total; E.comps = j.competences; j.lignes.forEach((l, i)=>{ E.lignes[n*PAGE + i] = l; }); E.pages[n] = "ok";
    /* première page : en-têtes et colonnes connus → rendu complet ; ensuite : seules les lignes visibles sont redessinées */
    const g = document.getElementById("fwcGrille"); if (g && g.dataset.pret && !premier) dessiner(ctx); else ctx.rendre();
  }).catch(e=>{ E.pages[n] = null; ctx.flash(e.message, "err"); });
}
function reinitialiser(ctx){ const E = ctx.etat; E.total = null; E.lignes = {}; E.pages = {}; }
/* correctif 34 : cellule nommée (salarié, compétence, niveau, requis), inactive en consultation ou pendant l'envoi */
function cellules(ctx, l){
  const lecture = ctx.rang("EMP") < 2, occ = ctx.etat.occ || {};
  return ctx.etat.comps.map(c=>{ const n = l.niveaux[c.id] || 0, r = l.requis[c.id] || 0, lib = l.nom+" — "+c.code+" : "+T(ctx, "niveau", n)+(r ? " · "+T(ctx, "requis", r) : "");
    return '<button type="button" role="gridcell" class="fwc-n fwc-n'+n+(r && n < r ? ' fwc-ecart' : '')+'" data-act="fwm:niveau" data-mat="'+ctx.esc(l.mat)+'" data-cid="'+ctx.esc(c.id)+'" title="'+ctx.esc(lib)+'" aria-label="'+ctx.esc(lib)+'"'+(lecture || occ[l.mat+"|"+c.id] ? ' disabled' : '')+'>'+n+(r ? '<small>/'+r+'</small>' : '')+'</button>'; }).join("");
}
/* dessin des seules lignes visibles (virtualisation) */
function dessiner(ctx){
  const E = ctx.etat, g = document.getElementById("fwcGrille"); if (!g || E.total === null) return;
  const debut = Math.max(0, Math.floor(g.scrollTop / HAUTEUR) - MARGE), fin = Math.min(E.total, Math.ceil((g.scrollTop + g.clientHeight) / HAUTEUR) + MARGE);
  for (let p = Math.floor(debut / PAGE); p <= Math.floor(Math.max(debut, fin - 1) / PAGE); p++) page(ctx, p);
  let h = "";
  for (let i = debut; i < fin; i++){ const l = E.lignes[i];
    h += '<div class="fwc-l" role="row" style="top:'+(i*HAUTEUR)+'px">'+(l ? '<span class="fwc-nom" role="rowheader" title="'+ctx.esc(l.mat)+'">'+ctx.esc(l.nom)+'</span><span class="fwc-f">'+ctx.esc(l.fonction||"—")+'</span><span class="fwc-e'+(l.ecarts ? ' fwc-ko' : '')+'">'+l.ecarts+'</span>'+cellules(ctx, l)
      : '<span class="fwc-nom fwc-att">'+ctx.esc(T(ctx, "chargement"))+'</span>')+'</div>'; }
  const z = g.querySelector(".fwc-zone"); if (z){ z.style.height = (E.total*HAUTEUR)+"px"; z.innerHTML = h; }
}
function vueMatrice(ctx){
  const E = ctx.etat;
  if (E.cat && !E.cat.competences.length) return '<div class="fw-empty">'+ctx.esc(T(ctx, "aucuneComp"))+'</div>';
  if (E.total === null) page(ctx, 0);
  const fn = (E.cat && E.cat.fonctions) || [];
  return '<div class="fw-toolbar"><input type="search" data-fwmc="recherche" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx, "recherche"))+'" aria-label="'+ctx.esc(T(ctx, "recherche"))+'">'+
    '<select data-fwmc="fonction" aria-label="'+ctx.esc(T(ctx, "fonction"))+'"><option value="">'+ctx.esc(T(ctx, "toutesFonctions"))+'</option>'+fn.map(f=>'<option'+(E.fonction === f ? ' selected' : '')+'>'+ctx.esc(f)+'</option>').join("")+'</select>'+
    '<span class="fw-hint">'+(E.total === null ? ctx.esc(T(ctx, "chargement")) : ctx.esc(T(ctx, "salaries", E.total)))+' · '+ctx.esc(T(ctx, "legende"))+'</span></div>'+
    '<div id="fwcGrille" class="fwc-grille" role="grid" tabindex="0" aria-label="'+ctx.esc(T(ctx, "matrice"))+'" style="--fwc-n:'+Math.max(1, E.comps.length)+'"><div class="fwc-tete"><span class="fwc-nom">'+ctx.esc(T(ctx, "salarie"))+'</span><span class="fwc-f">'+ctx.esc(T(ctx, "fonction"))+'</span><span class="fwc-e">'+ctx.esc(T(ctx, "ecartsN"))+'</span>'+
      E.comps.map(c=>'<span class="fwc-c" title="'+ctx.esc(c.nom)+'">'+ctx.esc(c.code)+'</span>').join("")+'</div>'+
    '<div class="fwc-zone"></div></div>';
}
function vueEcarts(ctx){
  const E = ctx.etat;
  if (!E.ecarts){ if (!E.ecEnCours){ E.ecEnCours = true; ctx.api("api/v1/competences/ecarts").then(j=>{ E.ecarts = j; E.ecEnCours = false; ctx.rendre(); }).catch(e=>{ E.ecEnCours = false; ctx.flash(e.message, "err"); }); } return '<div class="fw-hint">'+ctx.esc(T(ctx, "chargement"))+'</div>'; }
  const l = E.ecarts.competences.filter(c=>c.concernes);
  if (!l.length) return '<div class="fw-empty">'+ctx.esc(T(ctx, "aucunEcart"))+'</div>';
  return '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx, "code"))+'</th><th>'+ctx.esc(T(ctx, "nom"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx, "concernes"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx, "conformes"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx, "enEcart"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx, "taux"))+'</th></tr></thead><tbody>'+
    l.map(c=>'<tr><td class="fw-mono">'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.nom)+'</td><td class="fw-num">'+c.concernes+'</td><td class="fw-num">'+c.conformes+'</td><td class="fw-num'+(c.ecarts ? ' fwc-ko' : '')+'">'+c.ecarts+'</td><td class="fw-num">'+(c.taux == null ? "—" : c.taux+" %")+'</td></tr>').join("")+'</tbody></table>';
}
function vueCatalogue(ctx){
  const E = ctx.etat, cat = E.cat; if (!cat) return '<div class="fw-hint">'+ctx.esc(T(ctx, "chargement"))+'</div>';
  const peut = ctx.rang("EMP") >= 4, f = E.fonctionEx;
  const req = {}; (cat.exigences||[]).filter(x=>x.fonction === f).forEach(x=>{ req[x.competence_id] = x.niveau; });
  return (peut ? '<div class="fw-card fw-u-p" style="margin-bottom:12px"><div class="fw-toolbar" style="margin:0"><input id="fwcCode" placeholder="'+ctx.esc(T(ctx, "code"))+'" aria-label="'+ctx.esc(T(ctx, "code"))+'" style="max-width:110px"><input id="fwcNom" placeholder="'+ctx.esc(T(ctx, "nom"))+'" aria-label="'+ctx.esc(T(ctx, "nom"))+'"><input id="fwcDomaine" placeholder="'+ctx.esc(T(ctx, "domaine"))+'" aria-label="'+ctx.esc(T(ctx, "domaine"))+'"><button type="button" class="fw-btn pri" data-act="fwm:ajouter">'+ctx.esc(T(ctx, "ajouter"))+'</button></div></div>' : '')+
    '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx, "exigencesPour"))+' <select data-fwmc="fonctionEx"><option value="">'+ctx.esc(T(ctx, "choisirFonction"))+'</option>'+(cat.fonctions||[]).map(x=>'<option'+(x === f ? ' selected' : '')+'>'+ctx.esc(x)+'</option>').join("")+'</select></label></div>'+
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx, "code"))+'</th><th>'+ctx.esc(T(ctx, "nom"))+'</th><th>'+ctx.esc(T(ctx, "domaine"))+'</th>'+(f ? '<th>'+ctx.esc(T(ctx, "requis", ""))+'</th>' : '')+'</tr></thead><tbody>'+
    cat.competences.map(c=>'<tr><td class="fw-mono">'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.nom)+'</td><td>'+ctx.esc(c.domaine||"")+'</td>'+
      (f ? '<td><select data-fwmc="exigence" data-cid="'+ctx.esc(c.id)+'"'+(peut ? '' : ' disabled')+' aria-label="'+ctx.esc(c.nom)+'">'+[0,1,2,3,4].map(n=>'<option value="'+n+'"'+((req[c.id]||0) === n ? ' selected' : '')+'>'+n+'</option>').join("")+'</select></td>' : '')+'</tr>').join("")+'</tbody></table>';
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
      '<div class="fw-stabs" role="tablist">'+onglets.map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(l)+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px">'+(E.onglet === "ecarts" ? vueEcarts(ctx) : E.onglet === "catalogue" ? vueCatalogue(ctx) : vueMatrice(ctx))+'</div></div>';
  },
  afterRender(ctx){
    const g = document.getElementById("fwcGrille"); if (!g) return;
    let prevu = false;
    ctx.ecouter(g, "scroll", ()=>{ if (prevu) return; prevu = true; requestAnimationFrame(()=>{ prevu = false; dessiner(ctx); }); }, {passive:true});
    g.dataset.pret = "1"; dessiner(ctx);
  },
  action(a, el, ctx){
    const E = ctx.etat;
    if (a === "onglet"){ E.onglet = el.dataset.o; if (E.onglet === "ecarts") E.ecarts = null; return ctx.rendre(); }
    if (a === "niveau"){
      if (ctx.rang("EMP") < 2) return;
      const idx = Object.keys(E.lignes).find(i=>E.lignes[i] && E.lignes[i].mat === el.dataset.mat), l = idx !== undefined ? E.lignes[idx] : null; if (!l) return;
      /* correctif 34 : une seule écriture par cellule à la fois (double clic : deux écritures) */
      const k = l.mat+"|"+el.dataset.cid; E.occ = E.occ || {}; if (E.occ[k]) return; E.occ[k] = true; el.disabled = true;
      const n = ((l.niveaux[el.dataset.cid] || 0) + 1) % 5;
      ctx.api("api/v1/competences/niveau", {corps:{mat:l.mat, competenceId:el.dataset.cid, niveau:n}}).then(()=>{ delete E.occ[k];
        l.niveaux[el.dataset.cid] = n; l.ecarts = Object.keys(l.requis).filter(c=>(l.niveaux[c]||0) < l.requis[c]).length; E.ecarts = null; dessiner(ctx);
      }).catch(e=>{ delete E.occ[k]; dessiner(ctx); ctx.flash((e && (e.name === "TypeError" || /Failed to fetch/i.test(e.message))) ? T(ctx, "reseau") : e.message, "err"); });
      return;
    }
    if (a === "ajouter"){
      const v = id => (document.getElementById(id)||{}).value || "";
      ctx.api("api/v1/competences/catalogue", {corps:{code:v("fwcCode"), nom:v("fwcNom"), domaine:v("fwcDomaine")}}).then(()=>{ ctx.flash(T(ctx, "ajoute"), "ok"); E.cat = null; reinitialiser(ctx); ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err"));
    }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "recherche"){ E.q = el.value.trim(); reinitialiser(ctx); return ctx.rendre(); }
    if (k === "fonction"){ E.fonction = el.value; reinitialiser(ctx); return ctx.rendre(); }
    if (k === "fonctionEx"){ E.fonctionEx = el.value; return ctx.rendre(); }
    if (k === "exigence"){ ctx.api("api/v1/competences/exigence", {corps:{fonction:E.fonctionEx, competenceId:el.dataset.cid, niveau:Number(el.value)}}).then(()=>{ ctx.flash(T(ctx, "exigenceOk"), "ok"); E.cat = null; E.ecarts = null; reinitialiser(ctx); ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err")); }
  }
});
})();
