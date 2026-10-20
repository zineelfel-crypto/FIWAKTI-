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
/* correctif 34 : confidentialité, confirmation de la validation, suppression de campagne, erreurs réseau, sens de lecture */
Object.assign(L.fr, {reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", confidentiel:"Contenu de l'évaluation confidentiel : réservé à l'évaluateur et aux valideurs ayant accès aux données sensibles.", validerQ:"Valider l'évaluation de {n} ? Elle ne pourra plus être modifiée et les niveaux de compétence seront reportés dans la matrice.", cloreQ:"Clore la campagne « {n} » ? Les évaluations non validées ne pourront plus être saisies.", supprimer:"Supprimer", supprimerQ:"Supprimer la campagne « {n} » ? Aucune évaluation n'a commencé ; cette action est irréversible.", envoi:"Enregistrement…", liste:"Liste"});
Object.assign(L.en, {reseau:"Server unreachable: check the connection and try again.", confidentiel:"Appraisal content is confidential: reserved for the appraiser and approvers with access to sensitive data.", validerQ:"Approve {n}'s appraisal? It can no longer be changed and skill levels will be recorded in the matrix.", cloreQ:"Close the campaign “{n}”? Appraisals not approved can no longer be entered.", supprimer:"Delete", supprimerQ:"Delete the campaign “{n}”? No appraisal has started; this cannot be undone.", envoi:"Saving…", liste:"List"});
Object.assign(L.ar, {reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة.", confidentiel:"محتوى التقييم سري: مخصص للمقيّم وللمصادقين المخوّل لهم الاطلاع على المعطيات الحساسة.", validerQ:"المصادقة على تقييم {n}؟ لن يمكن تعديله بعد ذلك وستُسجَّل مستويات الكفاءة في المصفوفة.", cloreQ:"إغلاق الحملة «{n}»؟ لن يمكن إدخال التقييمات غير المصادق عليها.", supprimer:"حذف", supprimerQ:"حذف الحملة «{n}»؟ لم يبدأ أي تقييم؛ لا يمكن التراجع عن ذلك.", envoi:"جارٍ الحفظ…", liste:"القائمة"});
/* correctif 38 */
Object.assign(L.fr, {precedent:"Page précédente", suivant:"Page suivante", rouvrirQ:"Rouvrir l'évaluation de {n} ? Indiquez le motif (conservé dans le journal).", motif:"Motif",
  reassigner:"Réassigner", nouvelEvaluateur:"Nouvel évaluateur (identifiant)", reassigneOk:"Évaluateur modifié.", exporter:"Exporter (CSV)", conflits:"{n} niveau(x) non reporté(s) : modifié(s) dans la matrice depuis la saisie.",
  sorti:"(sorti)", statutFiltre:"Statut", campagneFiltre:"Campagne", vueFiltre:"Évaluations affichées", l_campagnes:"Campagnes d'évaluation", l_evaluations:"Évaluations", actions:"Actions", niveauDe:"Niveau — {n}", atteinteDe:"Atteinte — {n}"});
Object.assign(L.en, {precedent:"Previous page", suivant:"Next page", rouvrirQ:"Reopen {n}'s evaluation? Give the reason (kept in the log).", motif:"Reason",
  reassigner:"Reassign", nouvelEvaluateur:"New evaluator (login)", reassigneOk:"Evaluator changed.", exporter:"Export (CSV)", conflits:"{n} level(s) not recorded: changed in the matrix since the entry.",
  sorti:"(left)", statutFiltre:"Status", campagneFiltre:"Campaign", vueFiltre:"Evaluations shown", l_campagnes:"Evaluation campaigns", l_evaluations:"Evaluations", actions:"Actions", niveauDe:"Level — {n}", atteinteDe:"Achievement — {n}"});
Object.assign(L.ar, {precedent:"الصفحة السابقة", suivant:"الصفحة التالية", rouvrirQ:"إعادة فتح تقييم {n}؟ اذكر التعليل (يحفظ في السجل).", motif:"التعليل",
  reassigner:"إعادة التعيين", nouvelEvaluateur:"المقيم الجديد (المعرف)", reassigneOk:"تم تغيير المقيم.", exporter:"تصدير (CSV)", conflits:"{n} مستوى لم ينقل: تغير في المصفوفة منذ الإدخال.",
  sorti:"(غادر)", statutFiltre:"الحالة", campagneFiltre:"الحملة", vueFiltre:"التقييمات المعروضة", l_campagnes:"حملات التقييم", l_evaluations:"التقييمات", actions:"الإجراءات", niveauDe:"المستوى — {n}", atteinteDe:"الإنجاز — {n}"});
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "←" ? "→" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const val = id => ((document.getElementById(id)||{}).value || "").trim();
/* correctif 38 : droits renvoyés par le serveur (matrice de l'écran) ; saisie conservée (E.form) */
const droits = ctx => { const E = ctx.etat, d = (E.camp||{}).droits || (E.liste||{}).droits, r = ctx.rang("EMP"); return d || {modifier:r >= 2, valider:r >= 3, parametrer:r >= 4, supprimer:r >= 4, exporter:r >= 3}; };
const fv = (ctx, k, def) => ctx.etat.form[k] != null ? ctx.etat.form[k] : (def == null ? "" : def);
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"evaluations", camp:null, liste:null, f:{campagne:"", statut:"", mes:ctx.rang("EMP") >= 3 ? "" : "1"}, off:0, detail:null, form:{}});
  if (!E.camp && !E.cEnCours){ E.cEnCours = true; ctx.api("api/v1/evaluation/campagnes").then(j=>{ E.camp = j; E.cEnCours = false; ctx.rendre(); }).catch(e=>{ E.cEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
  if (!E.liste && !E.lEnCours && E.onglet === "evaluations" && !E.detail){ E.lEnCours = true;
    ctx.api("api/v1/evaluation/evaluations?limit=50&offset="+E.off+"&campagne="+encodeURIComponent(E.f.campagne)+"&statut="+E.f.statut+"&mes="+E.f.mes).then(j=>{ E.liste = j; E.lEnCours = false; ctx.rendre(); }).catch(e=>{ E.lEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
}
const champ = (ctx, l, h) => '<label class="fwe-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
function vueCampagnes(ctx){
  const E = ctx.etat, C = (E.camp||{}).campagnes, dr = droits(ctx), dis = E.envoi ? ' disabled aria-busy="true"' : '';
  return (dr.parametrer ? '<div class="fw-card fw-u-p fwe-form">'+champ(ctx, T(ctx,"nom"), '<input id="fweNom" data-fwmc="g:fweNom" maxlength="100" value="'+ctx.esc(fv(ctx,"fweNom"))+'">')+
      champ(ctx, T(ctx,"type"), '<select id="fweType" data-fwmc="g:fweType">'+["annuelle","essai","habil"].map(k=>'<option value="'+k+'"'+(fv(ctx,"fweType","annuelle") === k ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"debut"), '<input id="fweDeb" data-fwmc="g:fweDeb" type="date" value="'+ctx.esc(fv(ctx,"fweDeb"))+'">')+champ(ctx, T(ctx,"fin"), '<input id="fweFin" data-fwmc="g:fweFin" type="date" value="'+ctx.esc(fv(ctx,"fweFin"))+'">')+
      champ(ctx, T(ctx,"fonction"), '<input id="fweFonc" data-fwmc="g:fweFonc" maxlength="80" value="'+ctx.esc(fv(ctx,"fweFonc"))+'">')+
      champ(ctx, T(ctx,"objectifs"), '<textarea id="fweObj" data-fwmc="g:fweObj" rows="3">'+ctx.esc(fv(ctx,"fweObj"))+'</textarea>')+'<button class="fw-btn pri" data-act="fwm:lancer"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "lancer"))+'</button></div>' : '')+
    (!C ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !C.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"l_campagnes"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"nom"))+'</th><th scope="col">'+ctx.esc(T(ctx,"type"))+'</th><th scope="col">'+ctx.esc(T(ctx,"debut"))+'</th><th scope="col">'+ctx.esc(T(ctx,"fin"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx,"total"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx,"validees"))+'</th><th scope="col">'+ctx.esc(T(ctx,"statut"))+'</th><th scope="col">'+ctx.esc(T(ctx,"actions"))+'</th></tr></thead><tbody>'+
      C.map(c=>'<tr><td><button class="fw-link" data-act="fwm:voir-camp" data-id="'+ctx.esc(c.id)+'">'+ctx.esc(c.nom)+'</button></td><td>'+ctx.esc(T(ctx,c.type))+'</td><td>'+ctx.esc(ctx.dateAff(c.debut))+'</td><td>'+ctx.esc(ctx.dateAff(c.fin))+'</td><td class="fw-num">'+c.total+'</td><td class="fw-num">'+c.validees+'</td><td>'+ctx.esc(T(ctx,c.statut))+'</td><td>'+
        (dr.exporter ? '<a class="fw-btn sm" href="api/v1/evaluation/campagnes/'+encodeURIComponent(c.id)+'/export" aria-label="'+ctx.esc(T(ctx,"exporter")+" : "+c.nom)+'">'+ctx.esc(T(ctx,"exporter"))+'</a> ' : '')+
        (dr.parametrer && c.statut === "ouverte" ? '<button class="fw-btn sm" data-act="fwm:clore" data-id="'+ctx.esc(c.id)+'" data-nom="'+ctx.esc(c.nom)+'" aria-label="'+ctx.esc(T(ctx,"clore")+" : "+c.nom)+'"'+dis+'>'+ctx.esc(T(ctx,"clore"))+'</button> ' : '')+
        (dr.supprimer && c.statut === "ouverte" ? '<button class="fw-btn sm dgr" data-act="fwm:supprimer" data-id="'+ctx.esc(c.id)+'" data-nom="'+ctx.esc(c.nom)+'" aria-label="'+ctx.esc(T(ctx,"supprimer")+" : "+c.nom)+'"'+dis+'>'+ctx.esc(T(ctx,"supprimer"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>');
}
function vueListe(ctx){
  const E = ctx.etat, Lx = E.liste, C = (E.camp||{}).campagnes || [];
  return '<div class="fw-toolbar"><select data-fwmc="f" data-k="mes" aria-label="'+ctx.esc(T(ctx,"vueFiltre"))+'"><option value="1"'+(E.f.mes === "1" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mes"))+'</option><option value=""'+(E.f.mes === "" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"evaluations"))+'</option></select>'+
    '<select data-fwmc="f" data-k="campagne" aria-label="'+ctx.esc(T(ctx,"campagneFiltre"))+'"><option value="">'+ctx.esc(T(ctx,"toutes"))+'</option>'+C.map(c=>'<option value="'+ctx.esc(c.id)+'"'+(E.f.campagne === c.id ? ' selected' : '')+'>'+ctx.esc(c.nom)+'</option>').join("")+'</select>'+
    '<select data-fwmc="f" data-k="statut" aria-label="'+ctx.esc(T(ctx,"statutFiltre"))+'"><option value="">'+ctx.esc(T(ctx,"tous"))+'</option>'+["a_faire","en_cours","terminee","validee"].map(s=>'<option value="'+s+'"'+(E.f.statut === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select>'+
    (Lx ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", Lx.total ? E.off+1 : 0).replace("{b}", Math.min(E.off+50, Lx.total)).replace("{n}", Lx.total))+'</span><button class="fw-btn sm" data-act="fwm:prec"'+(E.off ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"precedent"))+'">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:suiv"'+(E.off+50 < Lx.total ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"suivant"))+'">'+fl(ctx, "›")+'</button>' : '')+'</div>'+
    (!Lx ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !Lx.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"l_evaluations"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"salarie"))+'</th><th scope="col">'+ctx.esc(T(ctx,"campagne"))+'</th><th scope="col">'+ctx.esc(T(ctx,"evaluateur"))+'</th><th scope="col">'+ctx.esc(T(ctx,"statut"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx,"note"))+'</th></tr></thead><tbody>'+
      Lx.lignes.map(r=>'<tr><td><button class="fw-link" id="fweL-'+ctx.esc(r.id)+'" data-act="fwm:voir" data-id="'+ctx.esc(r.id)+'">'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</button>'+(r.sorti ? ' <span class="fw-hint">'+ctx.esc(T(ctx,"sorti"))+'</span>' : '')+'<div class="fw-hint">'+ctx.esc(r.fonction||"")+'</div></td><td>'+ctx.esc(r.campagne)+'</td><td>'+ctx.esc(r.evaluateur||"—")+'</td>'+
        '<td><span class="fwe-s fwe-'+r.statut+'">'+ctx.esc(T(ctx,"s_"+r.statut))+'</span></td><td class="fw-num">'+(r.note == null ? "—" : r.note)+'</td></tr>').join("")+'</tbody></table>');
}
function vueDetail(ctx){
  const E = ctx.etat, D = E.detail, ev = D.evaluation, dd = D.droits || {}, ferme = !dd.saisir, k = "e"+ev.id+":", dis = E.envoi ? ' disabled' : '';
  const cp = {}; (ev.competences||[]).forEach(z=>{ cp[z.competence_id] = z.niveau; });
  const nomS = D.salarie.nom || D.salarie.mat;
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong id="fweTitre" tabindex="-1">'+ctx.esc(D.salarie.nom+" · "+D.salarie.mat)+(D.salarie.sorti ? " "+T(ctx,"sorti") : "")+'</strong><span class="fw-hint">'+ctx.esc(ev.campagne+" · "+(D.salarie.fonction||"")+" · "+T(ctx,"evaluateur")+" : "+(ev.evaluateur || "—"))+'</span>'+
      '<span class="fwe-s fwe-'+ev.statut+'">'+ctx.esc(T(ctx,"s_"+ev.statut))+'</span></div>'+(ev.confidentiel ? '<div class="fw-note" role="status">'+ctx.esc(T(ctx,"confidentiel"))+'</div>' : '')+
    (dd.reassigner ? '<div class="fwe-form">'+champ(ctx, T(ctx,"nouvelEvaluateur"), '<input id="fweEvl" data-fwmc="g:fweEvl" maxlength="80" value="'+ctx.esc(fv(ctx,"fweEvl"))+'">')+'<button class="fw-btn sm" data-act="fwm:reassigner"'+dis+'>'+ctx.esc(T(ctx,"reassigner"))+'</button></div>' : '')+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><legend>'+ctx.esc(T(ctx,"objectifs").replace(/ \(.*\)$/, ""))+'</legend>'+
      ((ev.objectifs||[]).length ? ev.objectifs.map((o, j)=>'<div class="fwe-l"><span>'+ctx.esc(o.libelle)+'</span>'+champ(ctx, T(ctx,"atteinte"), '<input type="number" min="0" max="100" step="1" class="fwe-obj" data-fwmc="g:'+k+'o'+j+'" data-k="'+j+'" aria-label="'+ctx.esc(T(ctx,"atteinteDe").replace("{n}", o.libelle))+'" value="'+ctx.esc(fv(ctx, k+"o"+j, o.atteinte == null ? "" : o.atteinte))+'">')+'</div>').join("") : '<div class="fw-hint">—</div>')+'</fieldset>'+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><legend>'+ctx.esc(T(ctx,"competences"))+'</legend>'+
      (D.exigences.length ? D.exigences.map(x=>{ const def = cp[x.competence_id] != null ? cp[x.competence_id] : (x.actuel||0), v = Number(fv(ctx, k+"c"+x.competence_id, def));
        return '<div class="fwe-l"><span>'+ctx.esc(x.code+" — "+x.nom)+' <span class="fw-hint">'+ctx.esc(T(ctx,"requis").replace("{n}", x.requis)+" · "+T(ctx,"actuel").replace("{n}", x.actuel == null ? 0 : x.actuel))+'</span></span>'+
        '<select class="fwe-cp" data-fwmc="g:'+k+'c'+ctx.esc(x.competence_id)+'" data-id="'+ctx.esc(x.competence_id)+'" data-actuel="'+(x.actuel == null ? 0 : x.actuel)+'" data-saisi="'+(cp[x.competence_id] != null ? 1 : 0)+'" aria-label="'+ctx.esc(T(ctx,"niveauDe").replace("{n}", x.nom))+'">'+[0,1,2,3,4].map(n=>'<option value="'+n+'"'+(v === n ? ' selected' : '')+'>'+n+'</option>').join("")+'</select></div>'; }).join("") : '<div class="fw-hint">'+ctx.esc(T(ctx,"sansComp"))+'</div>')+'</fieldset>'+
    '<fieldset class="fwe-bloc"'+(ferme ? ' disabled' : '')+'><div class="fwe-form">'+champ(ctx, T(ctx,"note"), '<input id="fweNote" data-fwmc="g:'+k+'note" type="number" min="1" max="5" step="1" value="'+ctx.esc(fv(ctx, k+"note", ev.note == null ? "" : ev.note))+'">')+
      champ(ctx, T(ctx,"commentaire"), '<textarea id="fweCom" data-fwmc="g:'+k+'com" rows="3" maxlength="4000">'+ctx.esc(fv(ctx, k+"com", ev.commentaire||""))+'</textarea>')+'</div></fieldset>'+
    '<div class="fw-toolbar">'+(!ferme ? '<button class="fw-btn" data-act="fwm:enreg"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn pri" data-act="fwm:terminer"'+dis+'>'+ctx.esc(T(ctx,"terminer"))+'</button>' : '')+
      (dd.validerCelle ? '<button class="fw-btn pri" data-act="fwm:valider"'+dis+' aria-label="'+ctx.esc(T(ctx,"valider")+" : "+nomS)+'">'+ctx.esc(T(ctx,"valider"))+'</button>' : '')+
      (dd.valider && ev.statut === "terminee" && ev.cstatut === "ouverte" && !ev.confidentiel ? '<button class="fw-btn" data-act="fwm:rouvrir"'+dis+'>'+ctx.esc(T(ctx,"rouvrir"))+'</button>' : '')+'</div>';
}
/* n'envoie que les niveaux modifiés (ou déjà saisis) : le niveau courant n'est plus reporté à l'identique */
function saisie(ctx, terminer){
  const E = ctx.etat, ev = E.detail.evaluation;
  const corps = {note:val("fweNote"), commentaire:val("fweCom"), terminer:!!terminer,
    objectifs:[...document.querySelectorAll(".fwe-obj")].map(x=>x.value), competences:[...document.querySelectorAll(".fwe-cp")].filter(x=>Number(x.value) !== Number(x.dataset.actuel) || x.dataset.saisi === "1").map(x=>({competence_id:x.dataset.id, niveau:Number(x.value)}))};
  return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(ev.id), {corps});
}
function ouvrir(ctx, id){ return ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre(); setTimeout(()=>{ const x = document.getElementById("fweTitre"); if (x) x.focus(); }, 80); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Evaluation",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    return '<div class="fw-module fwe"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+[["evaluations","evaluations"],["campagnes","campagnes"]].map(([k, l])=>'<button type="button" role="tab" id="fweT-'+k+'" aria-controls="fweP" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fweP" role="tabpanel" aria-labelledby="fweT-'+E.onglet+'">'+(E.onglet === "campagnes" ? vueCampagnes(ctx) : E.detail ? vueDetail(ctx) : vueListe(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ko = e => ctx.flash(msgErr(ctx, e), "err");
    /* correctif 36 : f est appelée AVANT le rendu ; correctif 38 : saisie vidée seulement après un succès */
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const vider = pre => Object.keys(E.form).forEach(k=>{ if (k.indexOf(pre) === 0) delete E.form[k]; });
    if (a === "supprimer") return ctx.confirmer({titre:T(ctx,"supprimer"), message:T(ctx,"supprimerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/evaluation/campagnes/"+encodeURIComponent(el.dataset.id)+"/supprimer", {corps:{}}).then(()=>{ E.camp = null; })); });
    if (a === "onglet"){ E.onglet = el.dataset.o; E.detail = null; E.liste = null; ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fweT-"+el.dataset.o); if (x) x.focus(); }, 80); }
    if (a === "prec" || a === "suiv"){ E.off = Math.max(0, E.off + (a === "suiv" ? 50 : -50)); E.liste = null; return ctx.rendre(); }
    if (a === "voir"){ E.retourId = el.dataset.id; return ouvrir(ctx, el.dataset.id).catch(ko); }
    if (a === "voir-camp"){ E.onglet = "evaluations"; E.f = {campagne:el.dataset.id, statut:"", mes:""}; E.off = 0; E.liste = null; E.detail = null; return ctx.rendre(); }
    if (a === "retour"){ E.detail = null; E.liste = null; ctx.rendre(); const r = E.retourId; return setTimeout(()=>{ const x = document.getElementById("fweL-"+r); if (x) x.focus(); }, 400); }
    if (a === "lancer"){ const corps = {nom:val("fweNom"), type:val("fweType"), debut:val("fweDeb"), fin:val("fweFin"), fonction:val("fweFonc"), objectifs:val("fweObj").split("\n").map(s=>s.trim()).filter(Boolean)};
      return verrou(()=>ctx.api("api/v1/evaluation/campagnes", {corps}).then(j=>{ ctx.flash(T(ctx,"lance").replace("{n}", j.evaluations), "ok"); ["fweNom","fweType","fweDeb","fweFin","fweFonc","fweObj"].forEach(k=>{ delete E.form[k]; }); E.camp = null; })); }
    if (a === "clore") return ctx.confirmer({titre:T(ctx,"clore"), message:T(ctx,"cloreQ").replace("{n}", el.dataset.nom || "")}).then(r=>{ if (r.ok) return verrou(()=>ctx.api("api/v1/evaluation/campagnes/"+encodeURIComponent(el.dataset.id)+"/clore", {corps:{}}).then(()=>{ E.camp = null; })); });
    if (a === "enreg" || a === "terminer"){ const id = E.detail.evaluation.id;
      return verrou(()=>saisie(ctx, a === "terminer").then(()=>{ ctx.flash(T(ctx,"enregistre"), "ok"); vider("e"+id+":"); return ouvrir(ctx, id); })); }
    if (a === "reassigner"){ const login = val("fweEvl"), id = E.detail.evaluation.id; if (!login) return;
      return verrou(()=>ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(id)+"/evaluateur", {corps:{login}}).then(()=>{ ctx.flash(T(ctx,"reassigneOk"), "ok"); delete E.form.fweEvl; return ouvrir(ctx, id); })); }
    if (a === "valider") return ctx.confirmer({titre:T(ctx,"valider"), message:T(ctx,"validerQ").replace("{n}", E.detail.salarie.nom || E.detail.salarie.mat)}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(E.detail.evaluation.id)+"/valider", {corps:{}}).then(j=>{ ctx.flash(T(ctx,"reportes").replace("{n}", j.reportes || 0)+(j.conflits ? " "+T(ctx,"conflits").replace("{n}", j.conflits) : ""), "ok"); E.camp = null; return ouvrir(ctx, E.detail.evaluation.id); })); });
    /* correctif 38 : réouverture confirmée, avec motif */
    if (a === "rouvrir") return ctx.confirmer({titre:T(ctx,"rouvrir"), message:T(ctx,"rouvrirQ").replace("{n}", E.detail.salarie.nom || E.detail.salarie.mat), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif"), okLabel:T(ctx,"rouvrir")}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/evaluation/evaluations/"+encodeURIComponent(E.detail.evaluation.id)+"/rouvrir", {corps:{motif:r.motif || ""}}).then(()=>ouvrir(ctx, E.detail.evaluation.id))); });
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("g:") === 0){ E.form[k.slice(2)] = el.value; return; }
    if (k === "f"){ E.f[el.dataset.k] = el.value; E.off = 0; E.liste = null; return ctx.rendre(); }
  }
});
})();
