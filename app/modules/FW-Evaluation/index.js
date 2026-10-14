/* FW-Evaluation — interface chargée à la demande : campagnes, évaluations (objectifs, compétences, note), validation
   avec report des niveaux dans la matrice des compétences. */
(function(){
"use strict";
const L = {
  fr:{titre:"Évaluations", lede:"Campagnes d'évaluation, objectifs et compétences ; à la validation, les niveaux sont reportés dans la matrice des compétences.",
    campagnes:"Campagnes", evaluations:"Évaluations", mes:"Mes évaluations", nom:"Nom", type:"Type", debut:"Début", fin:"Fin", fonction:"Fonction (vide : toutes)", objectifs:"Objectifs (un par ligne)",
    lancer:"Lancer la campagne", annuelle:"Annuelle", essai:"Fin de période d'essai", habil:"Habilitations", total:"Évaluations", validees:"Validées", clore:"Clore", ouverte:"Ouverte", close:"Close",
    tous:"Tous les statuts", s_a_faire:"À faire", s_en_cours:"En cours", s_terminee:"Terminée", s_validee:"Validée", salarie:"Salarié", evaluateur:"Évaluateur", statut:"Statut", note:"Note globale (1 à 5)",
    atteinte:"Atteinte (%)", competences:"Compétences de la fonction", requis:"requis {n}", actuel:"actuel {n}", commentaire:"Commentaire", enregistrer:"Enregistrer", terminer:"Terminer l'évaluation",
    valider:"Valider", rouvrir:"Rouvrir", retour:"Retour", aucune:"Aucune évaluation.", chargement:"Chargement…", enregistre:"Enregistré.", lance:"Campagne lancée : {n} évaluation(s).", reportes:"Validée : {n} niveau(x) reporté(s) dans la matrice.",
    plage:"{a}–{b} sur {n}", sansComp:"Aucune exigence de compétence pour cette fonction (ou module Compétences inactif).", campagne:"Campagne", toutes:"Toutes les campagnes"},
  en:{titre:"Evaluations", lede:"Evaluation campaigns, objectives and skills; on approval, levels are written to the skills matrix.",
    campagnes:"Campaigns", evaluations:"Evaluations", mes:"My evaluations", nom:"Name", type:"Type", debut:"Start", fin:"End", fonction:"Job (empty: all)", objectifs:"Objectives (one per line)",
    lancer:"Launch campaign", annuelle:"Annual", essai:"End of probation", habil:"Authorisations", total:"Evaluations", validees:"Approved", clore:"Close", ouverte:"Open", close:"Closed",
    tous:"All statuses", s_a_faire:"To do", s_en_cours:"In progress", s_terminee:"Completed", s_validee:"Approved", salarie:"Employee", evaluateur:"Evaluator", statut:"Status", note:"Overall score (1 to 5)",
    atteinte:"Achievement (%)", competences:"Job skills", requis:"required {n}", actuel:"current {n}", commentaire:"Comment", enregistrer:"Save", terminer:"Complete evaluation",
    valider:"Approve", rouvrir:"Reopen", retour:"Back", aucune:"No evaluation.", chargement:"Loading…", enregistre:"Saved.", lance:"Campaign launched: {n} evaluation(s).", reportes:"Approved: {n} level(s) written to the matrix.",
    plage:"{a}–{b} of {n}", sansComp:"No skill requirement for this job (or Skills module inactive).", campagne:"Campaign", toutes:"All campaigns"},
  ar:{titre:"التقييمات", lede:"حملات التقييم والأهداف والكفاءات؛ عند المصادقة تنقل المستويات إلى مصفوفة الكفاءات.",
    campagnes:"الحملات", evaluations:"التقييمات", mes:"تقييماتي", nom:"الاسم", type:"النوع", debut:"البداية", fin:"النهاية", fonction:"الوظيفة (فارغ: الكل)", objectifs:"الأهداف (هدف في كل سطر)",
    lancer:"إطلاق الحملة", annuelle:"سنوية", essai:"نهاية فترة التجربة", habil:"التأهيلات", total:"التقييمات", validees:"المصادق عليها", clore:"إغلاق", ouverte:"مفتوحة", close:"مغلقة",
    tous:"كل الحالات", s_a_faire:"للإنجاز", s_en_cours:"جارية", s_terminee:"منتهية", s_validee:"مصادق عليها", salarie:"الأجير", evaluateur:"المقيم", statut:"الحالة", note:"العدد الإجمالي (1 إلى 5)",
    atteinte:"نسبة الإنجاز (%)", competences:"كفاءات الوظيفة", requis:"المطلوب {n}", actuel:"الحالي {n}", commentaire:"ملاحظة", enregistrer:"حفظ", terminer:"إنهاء التقييم",
    valider:"مصادقة", rouvrir:"إعادة الفتح", retour:"رجوع", aucune:"لا تقييمات.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", lance:"أطلقت الحملة: {n} تقييم.", reportes:"تمت المصادقة: نقل {n} مستوى.",
    plage:"{a}–{b} من {n}", sansComp:"لا متطلبات كفاءات لهذه الوظيفة.", campagne:"الحملة", toutes:"كل الحملات"}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const val = id => ((document.getElementById(id)||{}).value || "").trim();
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"evaluations", camp:null, liste:null, f:{campagne:"", statut:"", mes:"1"}, off:0, detail:null});
  if (!E.camp && !E.cEnCours){ E.cEnCours = true; ctx.api("api/v1/evaluation/campagnes").then(j=>{ E.camp = j; E.cEnCours = false; ctx.rendre(); }).catch(e=>{ E.cEnCours = false; ctx.flash(e.message, "err"); }); }
  if (!E.liste && !E.lEnCours && E.onglet === "evaluations" && !E.detail){ E.lEnCours = true;
    ctx.api("api/v1/evaluation/evaluations?limit=50&offset="+E.off+"&campagne="+encodeURIComponent(E.f.campagne)+"&statut="+E.f.statut+"&mes="+E.f.mes).then(j=>{ E.liste = j; E.lEnCours = false; ctx.rendre(); }).catch(e=>{ E.lEnCours = false; ctx.flash(e.message, "err"); }); }
}
const champ = (ctx, l, h) => '<label class="fwe-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
function vueCampagnes(ctx){
  const E = ctx.etat, C = (E.camp||{}).campagnes, peut = ctx.rang("EMP") >= 4;
  return (peut ? '<div class="fw-card fw-u-p fwe-form">'+champ(ctx, T(ctx,"nom"), '<input id="fweNom">')+champ(ctx, T(ctx,"type"), '<select id="fweType">'+["annuelle","essai","habil"].map(k=>'<option value="'+k+'">'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"debut"), '<input id="fweDeb" type="date">')+champ(ctx, T(ctx,"fin"), '<input id="fweFin" type="date">')+champ(ctx, T(ctx,"fonction"), '<input id="fweFonc">')+
      champ(ctx, T(ctx,"objectifs"), '<textarea id="fweObj" rows="3"></textarea>')+'<button class="fw-btn pri" data-act="fwm:lancer">'+ctx.esc(T(ctx,"lancer"))+'</button></div>' : '')+
    (!C ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !C.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"nom"))+'</th><th>'+ctx.esc(T(ctx,"type"))+'</th><th>'+ctx.esc(T(ctx,"debut"))+'</th><th>'+ctx.esc(T(ctx,"fin"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"total"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"validees"))+'</th><th>'+ctx.esc(T(ctx,"statut"))+'</th><th></th></tr></thead><tbody>'+
      C.map(c=>'<tr><td><button class="fw-link" data-act="fwm:voir-camp" data-id="'+ctx.esc(c.id)+'">'+ctx.esc(c.nom)+'</button></td><td>'+ctx.esc(T(ctx,c.type))+'</td><td>'+ctx.esc(ctx.dateAff(c.debut))+'</td><td>'+ctx.esc(ctx.dateAff(c.fin))+'</td><td class="fw-num">'+c.total+'</td><td class="fw-num">'+c.validees+'</td><td>'+ctx.esc(T(ctx,c.statut))+'</td><td>'+
        (peut && c.statut === "ouverte" ? '<button class="fw-btn sm" data-act="fwm:clore" data-id="'+ctx.esc(c.id)+'">'+ctx.esc(T(ctx,"clore"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>');
}
function vueListe(ctx){
  const E = ctx.etat, Lx = E.liste, C = (E.camp||{}).campagnes || [];
  return '<div class="fw-toolbar"><select data-fwmc="f" data-k="mes"><option value="1"'+(E.f.mes === "1" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mes"))+'</option><option value=""'+(E.f.mes === "" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"evaluations"))+'</option></select>'+
    '<select data-fwmc="f" data-k="campagne"><option value="">'+ctx.esc(T(ctx,"toutes"))+'</option>'+C.map(c=>'<option value="'+ctx.esc(c.id)+'"'+(E.f.campagne === c.id ? ' selected' : '')+'>'+ctx.esc(c.nom)+'</option>').join("")+'</select>'+
    '<select data-fwmc="f" data-k="statut"><option value="">'+ctx.esc(T(ctx,"tous"))+'</option>'+["a_faire","en_cours","terminee","validee"].map(s=>'<option value="'+s+'"'+(E.f.statut === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select>'+
    (Lx ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", Lx.total ? E.off+1 : 0).replace("{b}", Math.min(E.off+50, Lx.total)).replace("{n}", Lx.total))+'</span><button class="fw-btn sm" data-act="fwm:prec"'+(E.off ? '' : ' disabled')+'>‹</button><button class="fw-btn sm" data-act="fwm:suiv"'+(E.off+50 < Lx.total ? '' : ' disabled')+'>›</button>' : '')+'</div>'+
    (!Lx ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !Lx.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"salarie"))+'</th><th>'+ctx.esc(T(ctx,"campagne"))+'</th><th>'+ctx.esc(T(ctx,"evaluateur"))+'</th><th>'+ctx.esc(T(ctx,"statut"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"note"))+'</th></tr></thead><tbody>'+
      Lx.lignes.map(r=>'<tr><td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(r.id)+'">'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</button><div class="fw-hint">'+ctx.esc(r.fonction||"")+'</div></td><td>'+ctx.esc(r.campagne)+'</td><td>'+ctx.esc(r.evaluateur||"—")+'</td>'+
        '<td><span class="fwe-s fwe-'+r.statut+'">'+ctx.esc(T(ctx,"s_"+r.statut))+'</span></td><td class="fw-num">'+(r.note == null ? "—" : r.note)+'</td></tr>').join("")+'</tbody></table>');
}
function vueDetail(ctx){
  const E = ctx.etat, D = E.detail, ev = D.evaluation, ferme = ev.statut === "validee" || ev.cstatut !== "ouverte", val3 = ctx.rang("EMP") >= 3;
  const cp = {}; (ev.competences||[]).forEach(z=>{ cp[z.competence_id] = z.niveau; });
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">← '+ctx.esc(T(ctx,"retour"))+'</button><strong>'+ctx.esc(D.salarie.nom+" · "+D.salarie.mat)+'</strong><span class="fw-hint">'+ctx.esc(ev.campagne+" · "+(D.salarie.fonction||""))+'</span>'+
      '<span class="fwe-s fwe-'+ev.statut+'">'+ctx.esc(T(ctx,"s_"+ev.statut))+'</span></div>'+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><legend>'+ctx.esc(T(ctx,"objectifs").replace(/ \(.*\)$/, ""))+'</legend>'+
      ((ev.objectifs||[]).length ? ev.objectifs.map((o, k)=>'<div class="fwe-l"><span>'+ctx.esc(o.libelle)+'</span>'+champ(ctx, T(ctx,"atteinte"), '<input type="number" min="0" max="100" class="fwe-obj" data-k="'+k+'" value="'+(o.atteinte == null ? "" : o.atteinte)+'">')+'</div>').join("") : '<div class="fw-hint">—</div>')+'</fieldset>'+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><legend>'+ctx.esc(T(ctx,"competences"))+'</legend>'+
      (D.exigences.length ? D.exigences.map(x=>'<div class="fwe-l"><span>'+ctx.esc(x.code+" — "+x.nom)+' <span class="fw-hint">'+ctx.esc(T(ctx,"requis").replace("{n}", x.requis)+" · "+T(ctx,"actuel").replace("{n}", x.actuel == null ? 0 : x.actuel))+'</span></span>'+
        '<select class="fwe-cp" data-id="'+ctx.esc(x.competence_id)+'" aria-label="'+ctx.esc(x.nom)+'">'+[0,1,2,3,4].map(n=>'<option value="'+n+'"'+((cp[x.competence_id] != null ? cp[x.competence_id] : (x.actuel||0)) === n ? ' selected' : '')+'>'+n+'</option>').join("")+'</select></div>').join("") : '<div class="fw-hint">'+ctx.esc(T(ctx,"sansComp"))+'</div>')+'</fieldset>'+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><div class="fwe-form">'+champ(ctx, T(ctx,"note"), '<input id="fweNote" type="number" min="1" max="5" value="'+(ev.note == null ? "" : ev.note)+'">')+
      champ(ctx, T(ctx,"commentaire"), '<textarea id="fweCom" rows="3">'+ctx.esc(ev.commentaire||"")+'</textarea>')+'</div></fieldset>'+
    '<div class="fw-toolbar">'+(!ferme ? '<button class="fw-btn" data-act="fwm:enreg">'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn pri" data-act="fwm:terminer">'+ctx.esc(T(ctx,"terminer"))+'</button>' : '')+
      (val3 && ev.statut === "terminee" && ev.cstatut === "ouverte" ? '<button class="fw-btn pri" data-act="fwm:valider">'+ctx.esc(T(ctx,"valider"))+'</button><button class="fw-btn" data-act="fwm:rouvrir">'+ctx.esc(T(ctx,"rouvrir"))+'</button>' : '')+'</div>';
}
function saisie(ctx, terminer){
  const E = ctx.etat, ev = E.detail.evaluation;
  const corps = {note:val("fweNote"), commentaire:val("fweCom"), terminer:!!terminer,
    objectifs:[...document.querySelectorAll(".fwe-obj")].map(x=>x.value), competences:[...document.querySelectorAll(".fwe-cp")].map(x=>({competence_id:x.dataset.id, niveau:Number(x.value)}))};
  return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(ev.id), {corps});
}
function ouvrir(ctx, id){ return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre(); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Evaluation",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    return '<div class="fw-module fwe"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+[["evaluations","evaluations"],["campagnes","campagnes"]].map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px">'+(E.onglet === "campagnes" ? vueCampagnes(ctx) : E.detail ? vueDetail(ctx) : vueListe(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ko = e => ctx.flash(e.message, "err");
    if (a === "onglet"){ E.onglet = el.dataset.o; E.detail = null; E.liste = null; return ctx.rendre(); }
    if (a === "prec" || a === "suiv"){ E.off = Math.max(0, E.off + (a === "suiv" ? 50 : -50)); E.liste = null; return ctx.rendre(); }
    if (a === "voir") return ouvrir(ctx, el.dataset.id).catch(ko);
    if (a === "voir-camp"){ E.onglet = "evaluations"; E.f = {campagne:el.dataset.id, statut:"", mes:""}; E.off = 0; E.liste = null; E.detail = null; return ctx.rendre(); }
    if (a === "retour"){ E.detail = null; E.liste = null; return ctx.rendre(); }
    if (a === "lancer") return ctx.api("api/v1/evaluation/campagnes", {corps:{nom:val("fweNom"), type:val("fweType"), debut:val("fweDeb"), fin:val("fweFin"), fonction:val("fweFonc"), objectifs:val("fweObj").split("\n").map(s=>s.trim()).filter(Boolean)}})
      .then(j=>{ ctx.flash(T(ctx,"lance").replace("{n}", j.evaluations), "ok"); E.camp = null; ctx.rendre(); }).catch(ko);
    if (a === "clore") return ctx.confirmer({titre:T(ctx,"clore"), message:T(ctx,"clore")+" ?"}).then(r=>{ if (r.ok) ctx.api("api/v1/evaluation/campagnes/"+encodeURIComponent(el.dataset.id)+"/clore", {corps:{}}).then(()=>{ E.camp = null; ctx.rendre(); }).catch(ko); });
    if (a === "enreg" || a === "terminer") return saisie(ctx, a === "terminer").then(()=>{ ctx.flash(T(ctx,"enregistre"), "ok"); return ouvrir(ctx, E.detail.evaluation.id); }).catch(ko);
    if (a === "valider") return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(E.detail.evaluation.id)+"/valider", {corps:{}}).then(j=>{ ctx.flash(T(ctx,"reportes").replace("{n}", j.reportes), "ok"); E.camp = null; return ouvrir(ctx, E.detail.evaluation.id); }).catch(ko);
    if (a === "rouvrir") return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(E.detail.evaluation.id)+"/rouvrir", {corps:{}}).then(()=>ouvrir(ctx, E.detail.evaluation.id)).catch(ko);
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "f"){ E.f[el.dataset.k] = el.value; E.off = 0; E.liste = null; return ctx.rendre(); }
  }
});
})();
