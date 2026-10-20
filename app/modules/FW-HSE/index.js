/* FW-HSE — interface chargée à la demande : indicateurs, événements (déclaration, analyse, actions, clôture), actions
   correctives, évaluation des risques, équipements de protection.
   Correctif 40 : droits renvoyés par le serveur appliqués, saisie conservée au rendu et après une erreur, pagination,
   site de l'événement, accident de trajet, déclaration CNAM, modification et réouverture, actions modifiables et
   annulables, risques par site et révisables, historique des dotations, registre exportable, heures non significatives
   signalées, onglets accessibles, focus rétabli, flèches inversées en arabe, jour local. */
(function(){
"use strict";
const L = {
  fr:{evolution:"Évolution mensuelle des événements", pyramide:"Pyramide de sécurité", pyramideAide:"Chaque presque-accident déclaré est une occasion d'éviter un accident : plus la base est large, plus la prévention est active.", avecArretL:"Avec arrêt", aucunEvt:"Aucun événement déclaré sur la période.", titre:"Santé et sécurité", lede:"Accidents, incidents et presque-accidents, actions correctives, évaluation des risques et équipements de protection ; taux calculés sur les heures réellement travaillées.",
    bord:"Tableau de bord", evenements:"Événements", actions:"Actions", risques:"Risques", epi:"Équipements", periode:"12 derniers mois", accidents:"Accidents du travail", avecArret:"dont avec arrêt",
    joursArret:"Jours d'arrêt", tf:"Taux de fréquence", tg:"Taux de gravité", tfAide:"accidents du travail avec arrêt × 1 000 000 / heures travaillées", tgAide:"jours d'arrêt × 1 000 / heures travaillées",
    heures:"Heures travaillées", presque:"Presque-accidents", incidents:"Incidents", trajets:"Accidents de trajet", actionsOuv:"Actions ouvertes", retard:"en retard", mois:"Mois", declarer:"Déclarer", type:"Type",
    t_accident:"Accident du travail", t_accident_trajet:"Accident de trajet", t_incident:"Incident", t_presque_accident:"Presque-accident", date:"Date", heure:"Heure", lieu:"Lieu", site:"Site", siteAuto:"Site du salarié", victime:"Salarié concerné (matricule)", gravite:"Gravité (1 à 4)",
    arret:"Avec arrêt de travail", jours:"Jours d'arrêt", description:"Description des faits", cause:"Cause identifiée", statut:"Statut", s_ouvert:"Ouvert", s_en_analyse:"En analyse", s_clos:"Clos",
    enCours:"En cours", clos:"Clos", tous:"Tous", retour:"Retour", analyser:"Enregistrer l'analyse", cloturer:"Clore l'événement", ajoutAction:"Ajouter une action corrective", titreAction:"Action",
    responsable:"Responsable", echeance:"Échéance", faite:"Faite", annulee:"Annulée", marquerFaite:"Marquer faite", unite:"Unité de travail", danger:"Danger", probabilite:"Probabilité (1 à 4)", criticite:"Criticité",
    mesures:"Mesures de prévention", ajoutRisque:"Ajouter le risque", salarie:"Salarié", equipement:"Équipement", remis:"Remis le", renouveler:"À renouveler le", ajoutEpi:"Enregistrer la dotation",
    aRenouveler:"À renouveler (30 jours)", historiqueEpi:"Historique (dotations remplacées comprises)", enCoursEpi:"Dotations en cours", aucune:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", origine:"Origine", sansDonneeMedicale:"Aucune donnée médicale n'est enregistrée ici : seulement le nombre de jours d'arrêt.",
    plage:"{a}–{b} sur {n}", precedent:"Page précédente", suivant:"Page suivante", reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", reessayer:"Réessayer", lectureNote:"Écran en lecture seule pour votre profil.",
    masqueNote:"Votre profil n'a pas accès aux données sensibles : salarié et faits masqués.", heuresKo:"Heures travaillées indisponibles (module Temps inactif ou calcul en échec) : taux non calculés.",
    nonSig:"Moins de {n} heures travaillées sur la période : taux non significatifs.", modifier:"Modifier", enregistrer:"Enregistrer", fermer:"Fermer", rouvrir:"Rouvrir", rouvrirQ:"Rouvrir l'événement ? Indiquez le motif (ex. prolongation de l'arrêt).", motif:"Motif",
    cnam:"Déclaration CNAM", cnamLe:"Déclarée le", cnamRef:"Référence", cnamEnr:"Enregistrer la déclaration", cnamManque:"Accident non déclaré à la CNAM (délai légal : 48 heures).", cnamRetard:"Délai de 48 heures dépassé.",
    annulerAction:"Annuler", annulerActionQ:"Annuler l'action « {n} » ? Indiquez le motif.", s_a_faire:"À faire", ouvertes:"Ouvertes", faites:"Faites", annulees:"Annulées", revision:"Révisé le", reviser:"Réviser", commun:"Tous sites",
    exporter:"Exporter le registre (CSV, tracé)", historique:"Historique", n_reouverture:"Réouverture", n_annulation:"Annulation", actionDe:"{a} — {n}", sorti:"sorti", detailDe:"Ouvrir l'événement du {d}",
    epiL:["Chaussures de sécurité","Casque","Gants","Lunettes de protection","Protection auditive","Gilet haute visibilité","Masque respiratoire","Blouse ESD","Harnais antichute"]},
  en:{evolution:"Monthly events", pyramide:"Safety pyramid", pyramideAide:"Each near-miss reported is a chance to prevent an accident: the wider the base, the more active the prevention.", avecArretL:"With lost time", aucunEvt:"No event reported for the period.", titre:"Health and safety", lede:"Accidents, incidents and near misses, corrective actions, risk assessment and protective equipment; rates computed on hours actually worked.",
    bord:"Dashboard", evenements:"Events", actions:"Actions", risques:"Risks", epi:"Equipment", periode:"Last 12 months", accidents:"Work accidents", avecArret:"with lost time",
    joursArret:"Days lost", tf:"Frequency rate", tg:"Severity rate", tfAide:"lost-time work accidents × 1,000,000 / hours worked", tgAide:"days lost × 1,000 / hours worked",
    heures:"Hours worked", presque:"Near misses", incidents:"Incidents", trajets:"Commuting accidents", actionsOuv:"Open actions", retard:"overdue", mois:"Month", declarer:"Report", type:"Type",
    t_accident:"Work accident", t_accident_trajet:"Commuting accident", t_incident:"Incident", t_presque_accident:"Near miss", date:"Date", heure:"Time", lieu:"Place", site:"Site", siteAuto:"Employee's site", victime:"Employee concerned (ID)", gravite:"Severity (1 to 4)",
    arret:"Lost time", jours:"Days lost", description:"Description", cause:"Root cause", statut:"Status", s_ouvert:"Open", s_en_analyse:"Under analysis", s_clos:"Closed",
    enCours:"Open", clos:"Closed", tous:"All", retour:"Back", analyser:"Save analysis", cloturer:"Close event", ajoutAction:"Add corrective action", titreAction:"Action",
    responsable:"Owner", echeance:"Due", faite:"Done", annulee:"Cancelled", marquerFaite:"Mark done", unite:"Work unit", danger:"Hazard", probabilite:"Likelihood (1 to 4)", criticite:"Criticality",
    mesures:"Preventive measures", ajoutRisque:"Add risk", salarie:"Employee", equipement:"Equipment", remis:"Issued", renouveler:"Renew on", ajoutEpi:"Save issue",
    aRenouveler:"To renew (30 days)", historiqueEpi:"History (including replaced issues)", enCoursEpi:"Current issues", aucune:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", origine:"Origin", sansDonneeMedicale:"No medical data is stored here: only the number of days lost.",
    plage:"{a}–{b} of {n}", precedent:"Previous page", suivant:"Next page", reseau:"Server unreachable: check the connection and try again.", reessayer:"Try again", lectureNote:"Read-only screen for your profile.",
    masqueNote:"Your profile has no access to sensitive data: employee and facts hidden.", heuresKo:"Hours worked unavailable (Time module inactive or calculation failed): rates not computed.",
    nonSig:"Fewer than {n} hours worked in the period: rates not significant.", modifier:"Edit", enregistrer:"Save", fermer:"Close", rouvrir:"Reopen", rouvrirQ:"Reopen the event? Give the reason (e.g. extended sick leave).", motif:"Reason",
    cnam:"CNAM declaration", cnamLe:"Declared on", cnamRef:"Reference", cnamEnr:"Save declaration", cnamManque:"Accident not declared to the CNAM (legal deadline: 48 hours).", cnamRetard:"48-hour deadline exceeded.",
    annulerAction:"Cancel", annulerActionQ:"Cancel the action “{n}”? Give the reason.", s_a_faire:"To do", ouvertes:"Open", faites:"Done", annulees:"Cancelled", revision:"Reviewed on", reviser:"Review", commun:"All sites",
    exporter:"Export the register (CSV, logged)", historique:"History", n_reouverture:"Reopened", n_annulation:"Cancelled", actionDe:"{a} — {n}", sorti:"left", detailDe:"Open the event of {d}",
    epiL:["Safety shoes","Helmet","Gloves","Safety glasses","Hearing protection","High-visibility vest","Respirator","ESD coat","Fall-arrest harness"]},
  ar:{evolution:"تطور الأحداث شهريا", pyramide:"هرم السلامة", pyramideAide:"كل حادث وشيك مُبلّغ عنه فرصة لتفادي حادث: كلما اتسعت القاعدة كانت الوقاية أنشط.", avecArretL:"مع توقف", aucunEvt:"لا أحداث مصرح بها خلال الفترة.", titre:"الصحة والسلامة", lede:"الحوادث والحوادث الوشيكة والإجراءات التصحيحية وتقييم المخاطر ومعدات الوقاية.",
    bord:"لوحة القيادة", evenements:"الأحداث", actions:"الإجراءات", risques:"المخاطر", epi:"المعدات", periode:"آخر 12 شهرا", accidents:"حوادث الشغل", avecArret:"منها مع توقف",
    joursArret:"أيام التوقف", tf:"معدل التواتر", tg:"معدل الخطورة", tfAide:"حوادث شغل مع توقف × 1000000 / ساعات العمل", tgAide:"أيام التوقف × 1000 / ساعات العمل",
    heures:"ساعات العمل", presque:"حوادث وشيكة", incidents:"حوادث عرضية", trajets:"حوادث الطريق", actionsOuv:"إجراءات مفتوحة", retard:"متأخرة", mois:"الشهر", declarer:"تصريح", type:"النوع",
    t_accident:"حادث شغل", t_accident_trajet:"حادث طريق", t_incident:"حادث عرضي", t_presque_accident:"حادث وشيك", date:"التاريخ", heure:"الساعة", lieu:"المكان", site:"الموقع", siteAuto:"موقع الأجير", victime:"الأجير المعني (المعرف)", gravite:"الخطورة (1 إلى 4)",
    arret:"مع توقف عن العمل", jours:"أيام التوقف", description:"وصف الوقائع", cause:"السبب", statut:"الحالة", s_ouvert:"مفتوح", s_en_analyse:"قيد التحليل", s_clos:"مغلق",
    enCours:"جارية", clos:"مغلقة", tous:"الكل", retour:"رجوع", analyser:"حفظ التحليل", cloturer:"إغلاق الحدث", ajoutAction:"إضافة إجراء تصحيحي", titreAction:"الإجراء",
    responsable:"المسؤول", echeance:"الأجل", faite:"منجز", annulee:"ملغى", marquerFaite:"تأشير كمنجز", unite:"وحدة العمل", danger:"الخطر", probabilite:"الاحتمال (1 إلى 4)", criticite:"الحرجية",
    mesures:"إجراءات الوقاية", ajoutRisque:"إضافة الخطر", salarie:"الأجير", equipement:"المعدات", remis:"تاريخ التسليم", renouveler:"تاريخ التجديد", ajoutEpi:"حفظ التسليم",
    aRenouveler:"للتجديد (30 يوما)", historiqueEpi:"السجل (مع التسليمات المعوضة)", enCoursEpi:"التسليمات الجارية", aucune:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", origine:"المصدر", sansDonneeMedicale:"لا تسجل هنا أي بيانات طبية: فقط عدد أيام التوقف.",
    plage:"{a}–{b} من {n}", precedent:"الصفحة السابقة", suivant:"الصفحة التالية", reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة.", reessayer:"إعادة المحاولة", lectureNote:"الشاشة للاطلاع فقط حسب ملفك.",
    masqueNote:"ملفك لا يخول الاطلاع على المعطيات الحساسة: الأجير والوقائع مخفية.", heuresKo:"ساعات العمل غير متاحة: المعدلات غير محسوبة.",
    nonSig:"أقل من {n} ساعة عمل خلال الفترة: المعدلات غير دالة.", modifier:"تعديل", enregistrer:"حفظ", fermer:"إغلاق", rouvrir:"إعادة فتح", rouvrirQ:"إعادة فتح الحدث؟ اذكر التعليل.", motif:"التعليل",
    cnam:"التصريح للصندوق الوطني للتأمين على المرض", cnamLe:"تاريخ التصريح", cnamRef:"المرجع", cnamEnr:"حفظ التصريح", cnamManque:"حادث غير مصرح به (الأجل القانوني: 48 ساعة).", cnamRetard:"تجاوز أجل 48 ساعة.",
    annulerAction:"إلغاء", annulerActionQ:"إلغاء الإجراء «{n}»؟ اذكر التعليل.", s_a_faire:"للإنجاز", ouvertes:"مفتوحة", faites:"منجزة", annulees:"ملغاة", revision:"روجع في", reviser:"مراجعة", commun:"كل المواقع",
    exporter:"تصدير السجل (مسجل)", historique:"السجل", n_reouverture:"إعادة فتح", n_annulation:"إلغاء", actionDe:"{a} — {n}", sorti:"غادر", detailDe:"فتح حدث {d}",
    epiL:["حذاء السلامة","خوذة","قفازات","نظارات واقية","واقي السمع","سترة عاكسة","كمامة تنفس","ميدعة مضادة للكهرباء الساكنة","حزام الأمان"]}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "→" ? "←" : g === "←" ? "→" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const PAS = 50;
const pager = (ctx, act, off, total) => total <= PAS && !off ? '' : '<div class="fw-toolbar"><span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", total ? off+1 : 0).replace("{b}", Math.min(off+PAS, total)).replace("{n}", total))+'</span><button class="fw-btn sm" data-act="fwm:page" data-k="'+act+'" data-d="-'+PAS+'"'+(off ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"precedent"))+'">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:page" data-k="'+act+'" data-d="'+PAS+'"'+(off+PAS < total ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"suivant"))+'">'+fl(ctx, "›")+'</button></div>';
const champ = (ctx, l, h) => '<label class="fwh-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
const fv = (ctx, id, def) => ctx.etat.form[id] != null ? ctx.etat.form[id] : (def == null ? "" : def);
const inp = (ctx, id, attrs, def) => '<input id="'+id+'" data-fwmc="f:'+id+'" value="'+ctx.esc(fv(ctx, id, def))+'"'+(attrs||"")+'>';
const zone = (ctx, id, def) => '<textarea id="'+id+'" data-fwmc="f:'+id+'" rows="2">'+ctx.esc(fv(ctx, id, def))+'</textarea>';
const sel = (ctx, id, opts, def) => { const v = String(fv(ctx, id, def)); return '<select id="'+id+'" data-fwmc="f:'+id+'">'+opts.map(([k, l])=>'<option value="'+ctx.esc(k)+'"'+(String(k) === v ? ' selected' : '')+'>'+ctx.esc(l)+'</option>').join("")+'</select>'; };
const coche = (ctx, id, l, def) => { const v = ctx.etat.form[id] != null ? ctx.etat.form[id] : !!def; return '<label class="fwh-chk"><input type="checkbox" id="'+id+'" data-fwmc="f:'+id+'"'+(v ? ' checked' : '')+'> '+ctx.esc(l)+'</label>'; };
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const coch = id => !!(document.getElementById(id)||{}).checked;
/* correctif 40 : jour local (toISOString donnait la veille entre minuit et 1 h en Tunisie) */
const auj = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
const TYPES = ["accident","accident_trajet","incident","presque_accident"], ACC = ["accident","accident_trajet"];
const G4 = [1,2,3,4].map(n=>[n, String(n)]);
const droits = ctx => { const E = ctx.etat; return (E.detail||{}).droits || (E.EV||{}).droits || (E.A||{}).droits || (E.R||{}).droits || (E.P||{}).droits || (E.I||{}).droits || {}; };
const tete = (ctx, leg, cols) => '<caption class="fw-sr">'+ctx.esc(T(ctx,leg))+'</caption><thead><tr>'+cols.map(c=>'<th scope="col"'+(c[0] === "#" ? ' class="fw-numh"' : '')+'>'+ctx.esc(c ? (c[0] === "#" ? c.slice(1) : T(ctx,c)) : "")+'</th>').join("")+'</tr></thead>';
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"bord", I:null, EV:null, stE:"", offE:0, A:null, stA:"", offA:0, R:null, offR:0, P:null, filtreP:"", offP:0, detail:null, form:{}, edit:false, editR:null, editA:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"] && !E[k+"Err"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false; ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; E[k+"Err"] = msgErr(ctx, e); ctx.rendre(); }); } };
  if (E.onglet === "bord") get("I", "api/v1/hse/indicateurs");
  if (E.onglet === "evenements" && !E.detail) get("EV", "api/v1/hse/evenements?limit="+PAS+"&offset="+E.offE+"&statut="+(E.stE || ""));
  if (E.onglet === "actions") get("A", "api/v1/hse/actions?limit="+PAS+"&offset="+E.offA+"&statut="+E.stA);
  if (E.onglet === "risques") get("R", "api/v1/hse/risques?limit="+PAS+"&offset="+E.offR);
  if (E.onglet === "epi") get("P", "api/v1/hse/epi?limit="+PAS+"&offset="+E.offP+"&filtre="+E.filtreP);
}
function erreurOuCharge(ctx, k){ const E = ctx.etat; return E[k+"Err"] ? '<div class="fw-note warn" role="alert">'+ctx.esc(E[k+"Err"])+' <button class="fw-btn sm" data-act="fwm:reessayer" data-k="'+k+'">'+ctx.esc(T(ctx,"reessayer"))+'</button></div>' : '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
function vueBord(ctx){
  const I = ctx.etat.I; if (!I) return erreurOuCharge(ctx, "I");
  /* 56.31.1 : indicateurs colorés selon les seuils, évolution mensuelle en graphique, tableau lisible */
  const V = ctx.viz, M = I.parMois || [], p6 = M.slice(-12, -6), som = (l, k) => l.reduce((x, m)=>x + (+m[k]||0), 0), dr = droits(ctx);
  const kp = V.kpi.bind(V), vide = !M.some(m=>m.accident || m.accident_trajet || m.incident || m.presque_accident);
  return '<p class="fw-hint">'+ctx.esc(T(ctx,"periode")+" · "+ctx.dateAff(I.du)+" "+fl(ctx, "→")+" "+ctx.dateAff(I.au)+" · "+T(ctx,"heures")+" : "+V.nombre(I.heures, 0))+'</p>'+
    (I.heuresIndisponibles ? '<p class="fw-note warn" role="status">'+ctx.esc(T(ctx,"heuresKo"))+'</p>' : I.nonSignificatif ? '<p class="fw-note warn" role="status">'+ctx.esc(T(ctx,"nonSig").replace("{n}", V.nombre(I.seuilHeures, 0)))+'</p>' : '')+
    '<div class="fw-vkpis">'+
    kp({v:I.accidents, l:T(ctx,"accidents"), aide:I.avecArret+" "+T(ctx,"avecArret"), ico:"hse", ton:I.avecArret ? "alerte" : I.accidents ? "att" : "ok", spark:M.map(m=>m.accident), inverse:true,
      prec:p6.length ? som(p6, "accident") : null, v6:null})+
    kp({v:I.tf, dec:2, l:T(ctx,"tf"), aide:T(ctx,"tfAide"), ico:"etats", ton:I.tf == null ? "info" : I.tf > 20 ? "alerte" : I.tf > 0 ? "att" : "ok"})+
    kp({v:I.tg, dec:2, l:T(ctx,"tg"), aide:T(ctx,"tgAide"), ico:"etats", ton:I.tg == null ? "info" : I.tg > 1 ? "alerte" : I.tg > 0 ? "att" : "ok"})+
    kp({v:I.joursArret, l:T(ctx,"joursArret"), ico:"cal", ton:I.joursArret ? "att" : "ok"})+
    kp({v:I.trajets, l:T(ctx,"trajets"), ico:"hse", ton:I.trajets ? "att" : "ok"})+
    kp({v:I.presqueAccidents, l:T(ctx,"presque"), ico:"alerte", ton:"info", spark:M.map(m=>m.presque_accident)})+
    kp({v:I.actionsOuvertes, l:T(ctx,"actionsOuv"), aide:I.actionsRetard+" "+T(ctx,"retard"), ico:"succes", ton:I.actionsRetard ? "alerte" : "ok", act:"fwm:ongletV", data:"actions"})+'</div>'+
    (dr.exporter ? '<div class="fw-toolbar"><a class="fw-btn" href="api/v1/hse/export" download>'+ctx.esc(T(ctx,"exporter"))+'</a></div>' : '')+
    (!vide ? '<div class="fw-vgrille">'+
      V.graphe({titre:T(ctx,"evolution"), type:"barres", etiquettes:M.map(m=>V.mois(m.mois, true)),
        series:[{nom:T(ctx,"accidents"), valeurs:M.map(m=>+m.accident||0), couleur:"#e11d48"}, {nom:T(ctx,"trajets"), valeurs:M.map(m=>+m.accident_trajet||0), couleur:"#a855f7"}, {nom:T(ctx,"incidents"), valeurs:M.map(m=>+m.incident||0), couleur:"#f59e0b"},
          {nom:T(ctx,"presque"), valeurs:M.map(m=>+m.presque_accident||0), couleur:"#3b82f6"}]})+
      '<div class="fw-vgraphe"><div class="fw-vgt">'+ctx.esc(T(ctx,"pyramide"))+'</div>'+pyramide(ctx, I)+'</div></div>'+
      '<table class="fw-tbl fwh-mois">'+tete(ctx, "evolution", ["mois","#"+T(ctx,"accidents"),"#"+T(ctx,"trajets"),"#"+T(ctx,"incidents"),"#"+T(ctx,"presque")])+'<tbody>'+
      M.slice().reverse().map(m=>'<tr><td>'+ctx.esc(V.mois(m.mois))+'</td><td class="fw-num'+(+m.accident ? ' fwh-ko' : '')+'">'+V.nombre(m.accident, 0)+'</td><td class="fw-num">'+V.nombre(m.accident_trajet||0, 0)+'</td><td class="fw-num">'+V.nombre(m.incident, 0)+'</td><td class="fw-num">'+V.nombre(m.presque_accident, 0)+'</td></tr>').join("")+'</tbody></table>' :
      '<div class="fw-empty">'+ctx.esc(T(ctx,"aucunEvt"))+'</div>');
}
/* pyramide de sécurité : accidents avec arrêt › accidents › incidents › presque-accidents */
function pyramide(ctx, I){
  const nv = [[T(ctx,"avecArretL"), I.avecArret||0, "#be123c"], [T(ctx,"accidents"), I.accidents||0, "#e11d48"], [T(ctx,"incidents"), I.incidents||0, "#f59e0b"], [T(ctx,"presque"), I.presqueAccidents||0, "#3b82f6"]];
  return '<div class="fwh-pyr">'+nv.map((n, i)=>'<div class="niv" style="width:'+(34 + i*22)+'%;background:'+n[2]+'"><b>'+ctx.viz.nombre(n[1], 0)+'</b><span>'+ctx.esc(n[0])+'</span></div>').join("")+'</div>'+
    '<p class="fw-hint" style="margin:8px 0 0">'+ctx.esc(T(ctx,"pyramideAide"))+'</p>';
}
const sitesOpts = (ctx, sites, vide) => [["", vide]].concat((sites||[]).map(s=>[s.id, s.nom]));
/* formulaire de déclaration (pre : fwh = nouvelle, fwhE = modification ; e : valeurs actuelles) */
function formEvenement(ctx, pre, sites, e){
  const x = e || {}, dis = ctx.etat.envoi ? ' disabled aria-busy="true"' : '';
  return champ(ctx, T(ctx,"type"), sel(ctx, pre+"Type", TYPES.map(t=>[t, T(ctx,"t_"+t)]), x.type || "accident"))+
    champ(ctx, T(ctx,"date"), inp(ctx, pre+"D", ' type="date" max="'+auj()+'"', x.d || auj()))+champ(ctx, T(ctx,"heure"), inp(ctx, pre+"H", ' type="time"', x.heure || ""))+
    champ(ctx, T(ctx,"site"), sel(ctx, pre+"S", sitesOpts(ctx, sites, T(ctx,"siteAuto")), x.site_id || ""))+champ(ctx, T(ctx,"lieu"), inp(ctx, pre+"L", ' maxlength="120"', x.lieu || ""))+
    champ(ctx, T(ctx,"victime"), inp(ctx, pre+"M", ' maxlength="40" autocomplete="off"', x.mat || ""))+champ(ctx, T(ctx,"gravite"), sel(ctx, pre+"G", G4, x.gravite || 1))+
    coche(ctx, pre+"A", T(ctx,"arret"), x.arret)+champ(ctx, T(ctx,"jours"), inp(ctx, pre+"J", ' type="number" min="0" max="3650" step="1"', x.jours_arret != null ? x.jours_arret : 0))+
    champ(ctx, T(ctx,"description"), zone(ctx, pre+"Desc", x.description || ""))+
    '<button class="fw-btn pri" data-act="fwm:'+(e ? "majEvt" : "declarer")+'"'+dis+'>'+ctx.esc(T(ctx, e ? "enregistrer" : "declarer"))+'</button>'+(e ? '<button class="fw-btn" data-act="fwm:finEdit">'+ctx.esc(T(ctx,"fermer"))+'</button>' : '');
}
const corpsEvt = pre => ({type:val(pre+"Type"), d:val(pre+"D"), heure:val(pre+"H"), siteId:val(pre+"S"), lieu:val(pre+"L"), mat:val(pre+"M"), gravite:val(pre+"G"), arret:coch(pre+"A"), joursArret:val(pre+"J"), description:val(pre+"Desc")});
const CHAMPS_EVT = pre => ["Type","D","H","S","L","M","G","A","J","Desc"].map(k=>pre+k);
function vueEvenements(ctx){
  const E = ctx.etat; if (E.detail) return vueDetail(ctx);
  const X = E.EV, dr = droits(ctx);
  return (X && !dr.sensibles ? '<p class="fw-note warn">'+ctx.esc(T(ctx,"masqueNote"))+'</p>' : '')+
    (dr.creer ? '<div class="fw-card fw-u-p fwh-form">'+formEvenement(ctx, "fwh", (X||{}).sites)+'<p class="fw-hint" style="flex-basis:100%">'+ctx.esc(T(ctx,"sansDonneeMedicale"))+'</p></div>' : X ? '<p class="fw-note">'+ctx.esc(T(ctx,"lectureNote"))+'</p>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="stE" aria-label="'+ctx.esc(T(ctx,"statut"))+'"><option value="">'+ctx.esc(T(ctx,"enCours"))+'</option><option value="clos"'+(E.stE === "clos" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"clos"))+'</option><option value="tous"'+(E.stE === "tous" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"tous"))+'</option></select></div>'+
    (!X ? erreurOuCharge(ctx, "EV") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "evenements", ["date","type","description","salarie","statut"])+'<tbody>'+
      X.lignes.map(e=>'<tr><td>'+ctx.esc(ctx.dateAff(e.d)+(e.heure ? " "+e.heure : ""))+'</td><td><span class="fwh-t fwh-'+e.type+'">'+ctx.esc(T(ctx,"t_"+e.type))+'</span></td>'+
        '<td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(e.id)+'" aria-label="'+ctx.esc(T(ctx,"detailDe").replace("{d}", ctx.dateAff(e.d)))+'">'+ctx.esc(String(e.description).slice(0, 80))+'</button></td><td>'+ctx.esc(e.victime || "—")+'</td><td>'+ctx.esc(T(ctx,"s_"+e.statut))+
        (ACC.indexOf(e.type) >= 0 && e.mat && !e.cnam ? ' <span class="fwh-ko" title="'+ctx.esc(T(ctx,"cnamManque"))+'">· '+ctx.esc(T(ctx,"cnam"))+'</span>' : '')+'</td></tr>').join("")+'</tbody></table>'+pager(ctx, "offE", E.offE, X.total));
}
function vueDetail(ctx){
  const E = ctx.etat, D = E.detail, e = D.evenement, dr = droits(ctx), ouvert = e.statut !== "clos", val3 = dr.valider && ouvert, dis = E.envoi ? ' disabled aria-busy="true"' : '';
  const nomSite = ((D.sites||[]).find(s=>s.id === e.site_id) || {}).nom || "";
  const hDecl = e.cnam ? null : (Date.now() - new Date(e.d+"T"+(e.heure || "00:00")+":00").getTime()) / 36e5;
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><span class="fwh-t fwh-'+e.type+'">'+ctx.esc(T(ctx,"t_"+e.type))+'</span><strong id="fwhDT" tabindex="-1">'+ctx.esc(ctx.dateAff(e.d)+(e.heure ? " "+e.heure : "")+(nomSite ? " · "+nomSite : "")+(e.lieu ? " · "+e.lieu : ""))+'</strong><span class="fw-tag">'+ctx.esc(T(ctx,"s_"+e.statut))+'</span>'+
      (dr.modifier && ouvert && !E.edit && !e.masque ? '<button class="fw-btn sm" data-act="fwm:edit">'+ctx.esc(T(ctx,"modifier"))+'</button>' : '')+(dr.valider && !ouvert ? '<button class="fw-btn sm" data-act="fwm:rouvrir"'+dis+'>'+ctx.esc(T(ctx,"rouvrir"))+'</button>' : '')+'</div>'+
    (E.edit ? '<div class="fw-card fw-u-p fwh-form">'+formEvenement(ctx, "fwhE", D.sites, e)+'</div>' :
    '<div class="fw-card fw-u-p"><p>'+ctx.esc(e.description)+'</p><p class="fw-hint">'+ctx.esc((e.victime ? T(ctx,"salarie")+" : "+e.victime+" · " : "")+T(ctx,"gravite")+" : "+(e.gravite || "—")+(e.arret && e.jours_arret != null ? " · "+T(ctx,"jours")+" : "+e.jours_arret : ""))+'</p>'+
      (val3 ? '<div class="fwh-form">'+champ(ctx, T(ctx,"cause"), zone(ctx, "fwhCause", e.masque ? "" : e.cause || ""))+(e.arret && !e.masque ? champ(ctx, T(ctx,"jours"), inp(ctx, "fwhJ2", ' type="number" min="0" max="3650" step="1"', e.jours_arret)) : '')+
        '<button class="fw-btn" data-act="fwm:analyser"'+dis+'>'+ctx.esc(T(ctx,"analyser"))+'</button></div>' : (e.cause ? '<p><strong>'+ctx.esc(T(ctx,"cause"))+' :</strong> '+ctx.esc(e.cause)+'</p>' : ''))+'</div>')+
    (ACC.indexOf(e.type) >= 0 && e.mat ? '<div class="fw-sec">'+ctx.esc(T(ctx,"cnam"))+'</div>'+(e.cnam ? '<p class="fw-hint">'+ctx.esc(T(ctx,"cnamLe")+" "+ctx.dateAff(e.cnam.declaree_le)+(e.cnam.reference ? " · "+T(ctx,"cnamRef")+" "+e.cnam.reference : ""))+'</p>' :
      '<p class="fw-note warn">'+ctx.esc(T(ctx,"cnamManque")+(hDecl > 48 ? " "+T(ctx,"cnamRetard") : ""))+'</p>')+
      (dr.modifier ? '<div class="fwh-form">'+champ(ctx, T(ctx,"cnamLe"), inp(ctx, "fwhCL", ' type="date" min="'+ctx.esc(e.d)+'" max="'+auj()+'"', e.cnam ? e.cnam.declaree_le : auj()))+champ(ctx, T(ctx,"cnamRef"), inp(ctx, "fwhCR", ' maxlength="60"', e.cnam ? e.cnam.reference || "" : ""))+
        '<button class="fw-btn" data-act="fwm:cnam"'+dis+'>'+ctx.esc(T(ctx,"cnamEnr"))+'</button></div>' : '') : '')+
    '<div class="fw-sec">'+ctx.esc(T(ctx,"actions"))+'</div>'+
    (D.actions.length ? '<table class="fw-tbl">'+tete(ctx, "actions", ["titreAction","responsable","echeance","statut",""])+'<tbody>'+D.actions.map(a=>ligneAction(ctx, a, ouvert)).join("")+'</tbody></table>' : '<div class="fw-hint">—</div>')+
    (val3 ? '<div class="fwh-form" style="margin-top:8px">'+champ(ctx, T(ctx,"titreAction"), inp(ctx, "fwhAT", ' maxlength="200"'))+champ(ctx, T(ctx,"responsable"), inp(ctx, "fwhAR", ' maxlength="80"'))+champ(ctx, T(ctx,"echeance"), inp(ctx, "fwhAE", ' type="date" min="'+auj()+'"'))+
      '<button class="fw-btn" data-act="fwm:action"'+dis+'>'+ctx.esc(T(ctx,"ajoutAction"))+'</button></div><div class="fw-toolbar"><button class="fw-btn pri" data-act="fwm:cloturer"'+dis+'>'+ctx.esc(T(ctx,"cloturer"))+'</button></div>' : '')+
    ((D.journal||[]).length ? '<div class="fw-sec">'+ctx.esc(T(ctx,"historique"))+'</div><table class="fw-tbl">'+tete(ctx, "historique", ["", "motif", ""])+'<tbody>'+D.journal.map(j=>'<tr><td>'+ctx.esc(T(ctx,"n_"+j.nature))+'</td><td>'+ctx.esc(j.motif || "—")+'</td><td class="fw-hint">'+ctx.esc(ctx.dateAff(String(j.le).slice(0, 10))+" · "+(j.par||""))+'</td></tr>').join("")+'</tbody></table>' : '');
}
/* ligne d'action (détail d'un événement ou onglet Actions) ; modification en place pour le valideur */
function ligneAction(ctx, a, ouvert, origine){
  const E = ctx.etat, dr = droits(ctx), enCours = a.statut !== "faite" && a.statut !== "annulee" && ouvert !== false, dis = E.envoi ? ' disabled' : '';
  if (E.editA === a.id) return '<tr><td colspan="'+(origine ? 6 : 5)+'"><div class="fwh-form">'+champ(ctx, T(ctx,"titreAction"), inp(ctx, "fwhXT", ' maxlength="200"', a.titre))+champ(ctx, T(ctx,"responsable"), inp(ctx, "fwhXR", ' maxlength="80"', a.responsable || ""))+
    champ(ctx, T(ctx,"echeance"), inp(ctx, "fwhXE", ' type="date"', a.echeance))+'<button class="fw-btn pri" data-act="fwm:majAction" data-id="'+ctx.esc(a.id)+'"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn" data-act="fwm:finEditA">'+ctx.esc(T(ctx,"fermer"))+'</button></div></td></tr>';
  const st = a.statut === "faite" ? T(ctx,"faite") : a.statut === "annulee" ? T(ctx,"annulee") : T(ctx,"s_a_faire");
  return '<tr><td>'+ctx.esc(a.titre)+'</td>'+(origine ? '<td>'+ctx.esc(a.evtype ? T(ctx,"t_"+a.evtype)+" "+ctx.dateAff(a.evd) : (a.danger || "—"))+'</td>' : '')+'<td>'+ctx.esc(a.responsable||"")+'</td>'+
    '<td'+(enCours && a.echeance < auj() ? ' class="fwh-ko"' : '')+'>'+ctx.esc(ctx.dateAff(a.echeance))+'</td><td>'+ctx.esc(st)+'</td><td>'+
    (enCours && dr.modifier ? '<button class="fw-btn sm" data-act="fwm:faite" data-id="'+ctx.esc(a.id)+'" aria-label="'+ctx.esc(T(ctx,"actionDe").replace("{a}", T(ctx,"marquerFaite")).replace("{n}", a.titre))+'"'+dis+'>'+ctx.esc(T(ctx,"marquerFaite"))+'</button>' : '')+
    (enCours && dr.valider ? ' <button class="fw-btn sm" data-act="fwm:editA" data-id="'+ctx.esc(a.id)+'" aria-label="'+ctx.esc(T(ctx,"actionDe").replace("{a}", T(ctx,"modifier")).replace("{n}", a.titre))+'">'+ctx.esc(T(ctx,"modifier"))+'</button> <button class="fw-btn sm" data-act="fwm:annulerA" data-id="'+ctx.esc(a.id)+'" data-n="'+ctx.esc(a.titre)+'" aria-label="'+ctx.esc(T(ctx,"actionDe").replace("{a}", T(ctx,"annulerAction")).replace("{n}", a.titre))+'"'+dis+'>'+ctx.esc(T(ctx,"annulerAction"))+'</button>' : '')+'</td></tr>';
}
function vueActions(ctx){
  const E = ctx.etat, X = E.A;
  return '<div class="fw-toolbar"><select data-fwmc="stA" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+[["","ouvertes"],["faite","faites"],["annulee","annulees"]].map(([v, k])=>'<option value="'+v+'"'+(E.stA === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select></div>'+
    (!X ? erreurOuCharge(ctx, "A") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "actions", ["titreAction","origine","responsable","echeance","statut",""])+'<tbody>'+X.lignes.map(a=>ligneAction(ctx, a, true, true)).join("")+'</tbody></table>'+pager(ctx, "offA", E.offA, X.total));
}
function vueRisques(ctx){
  const E = ctx.etat, X = E.R, dr = droits(ctx), dis = E.envoi ? ' disabled aria-busy="true"' : '', sites = (X||{}).sites || [];
  const ed = E.editR && X ? X.lignes.find(r=>r.id === E.editR) : null, nomSite = id => id ? ((sites.find(s=>s.id === id) || {}).nom || id) : T(ctx,"commun");
  return (dr.valider ? '<div class="fw-card fw-u-p fwh-form">'+champ(ctx, T(ctx,"unite"), inp(ctx, "fwhRU", ' maxlength="120"', ed ? ed.unite : ""))+champ(ctx, T(ctx,"danger"), inp(ctx, "fwhRD", ' maxlength="200"', ed ? ed.danger : ""))+
      champ(ctx, T(ctx,"site"), sel(ctx, "fwhRS", sitesOpts(ctx, sites, T(ctx,"commun")), ed ? ed.site_id || "" : ""))+
      champ(ctx, T(ctx,"gravite"), sel(ctx, "fwhRG", G4, ed ? ed.gravite : 1))+champ(ctx, T(ctx,"probabilite"), sel(ctx, "fwhRP", G4, ed ? ed.probabilite : 1))+
      champ(ctx, T(ctx,"mesures"), inp(ctx, "fwhRM", ' maxlength="2000"', ed ? ed.mesures || "" : ""))+'<button class="fw-btn pri" data-act="fwm:risque"'+dis+'>'+ctx.esc(T(ctx, ed ? "enregistrer" : "ajoutRisque"))+'</button>'+(ed ? '<button class="fw-btn" data-act="fwm:finEditR">'+ctx.esc(T(ctx,"fermer"))+'</button>' : '')+'</div>' : '')+
    (!X ? erreurOuCharge(ctx, "R") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "risques", ["unite","danger","site","#G","#P","#"+T(ctx,"criticite"),"mesures","revision",""])+'<tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc(r.unite)+'</td><td>'+ctx.esc(r.danger)+'</td><td>'+ctx.esc(nomSite(r.site_id))+'</td><td class="fw-num">'+r.gravite+'</td><td class="fw-num">'+r.probabilite+'</td><td class="fw-num"><span class="fwh-crit fwh-c'+(r.criticite >= 9 ? 3 : r.criticite >= 4 ? 2 : 1)+'">'+r.criticite+'</span></td><td>'+ctx.esc(r.mesures||"")+'</td>'+
        '<td>'+ctx.esc(r.revise_le ? ctx.dateAff(r.revise_le) : ctx.dateAff(String(r.maj||"").slice(0, 10)))+'</td><td>'+(dr.valider ? '<button class="fw-btn sm" data-act="fwm:editR" data-id="'+ctx.esc(r.id)+'" aria-label="'+ctx.esc(T(ctx,"actionDe").replace("{a}", T(ctx,"reviser")).replace("{n}", r.danger))+'">'+ctx.esc(T(ctx,"reviser"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>'+pager(ctx, "offR", E.offR, X.total));
}
function vueEpi(ctx){
  const E = ctx.etat, X = E.P, dr = droits(ctx), dis = E.envoi ? ' disabled aria-busy="true"' : '';
  return (dr.creer ? '<div class="fw-card fw-u-p fwh-form">'+champ(ctx, T(ctx,"victime"), inp(ctx, "fwhPM", ' maxlength="40" autocomplete="off"'))+champ(ctx, T(ctx,"equipement"), inp(ctx, "fwhPT", ' list="fwhEpiL" maxlength="80"')+'<datalist id="fwhEpiL">'+T(ctx,"epiL").map(x=>'<option value="'+ctx.esc(x)+'">').join("")+'</datalist>')+
      champ(ctx, T(ctx,"remis"), inp(ctx, "fwhPR", ' type="date" max="'+auj()+'"', auj()))+champ(ctx, T(ctx,"renouveler"), inp(ctx, "fwhPN", ' type="date"'))+'<button class="fw-btn pri" data-act="fwm:epi"'+dis+'>'+ctx.esc(T(ctx,"ajoutEpi"))+'</button></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="filtreP" aria-label="'+ctx.esc(T(ctx,"equipement"))+'">'+[["","enCoursEpi"],["renouveler","aRenouveler"],["historique","historiqueEpi"]].map(([v, k])=>'<option value="'+v+'"'+(E.filtreP === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select></div>'+
    (!X ? erreurOuCharge(ctx, "P") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "epi", ["salarie","equipement","remis","renouveler"])+'<tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat+(r.sorti ? " ("+T(ctx,"sorti")+")" : ""))+'</td><td>'+ctx.esc(r.type)+'</td><td>'+ctx.esc(ctx.dateAff(r.remis_le))+'</td><td'+(r.aRenouveler && !r.sorti ? ' class="fwh-ko"' : '')+'>'+ctx.esc(r.renouveler_le ? ctx.dateAff(r.renouveler_le) : "—")+'</td></tr>').join("")+'</tbody></table>'+pager(ctx, "offP", E.offP, X.total));
}
function focusSur(id){ setTimeout(()=>{ const x = document.getElementById(id); if (x) x.focus(); }, 80); }
function ouvrir(ctx, id, focus){ return ctx.api("api/v1/hse/evenements/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre(); focusSur(focus || "fwhDT"); }); }
const LISTES = {offE:"EV", offA:"A", offR:"R", offP:"P"};
FIWAKTI_MODULES.enregistrer({
  id:"FW-HSE",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["bord","bord"],["evenements","evenements"],["actions","actions"],["risques","risques"],["epi","epi"]];
    const corps = E.onglet === "evenements" ? vueEvenements(ctx) : E.onglet === "actions" ? vueActions(ctx) : E.onglet === "risques" ? vueRisques(ctx) : E.onglet === "epi" ? vueEpi(ctx) : vueBord(ctx);
    return '<div class="fw-module fwh"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l])=>'<button type="button" role="tab" id="fwhTab-'+k+'" aria-controls="fwhPan" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwhPan" role="tabpanel" aria-labelledby="fwhTab-'+E.onglet+'">'+corps+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err"), tout = () => { E.I = E.EV = E.A = E.R = E.P = null; E.IErr = E.EVErr = E.AErr = E.RErr = E.PErr = null; };
    /* f est appelée AVANT le rendu (les champs sont lus avant d'être redessinés) ; saisie vidée seulement après un succès */
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const vider = l => l.forEach(k=>{ delete E.form[k]; });
    const eid = () => E.detail.evenement.id;
    if (a === "onglet" || a === "ongletV"){ E.onglet = el.dataset.o || el.dataset.v; E.detail = null; E.edit = false; E.editR = E.editA = null; tout(); ctx.rendre(); return focusSur("fwhTab-"+E.onglet); }
    if (a === "reessayer"){ E[el.dataset.k+"Err"] = null; return ctx.rendre(); }
    if (a === "page"){ const k = el.dataset.k; E[k] = Math.max(0, E[k] + Number(el.dataset.d)); E[LISTES[k]] = null; return ctx.rendre(); }
    if (a === "voir") return ouvrir(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.detail = null; E.edit = false; E.editA = null; vider(CHAMPS_EVT("fwhE").concat(["fwhCause","fwhJ2","fwhAT","fwhAR","fwhAE","fwhCL","fwhCR"])); tout(); return ctx.rendre(); }
    if (a === "declarer"){ const corps = corpsEvt("fwh");
      return verrou(()=>ctx.api("api/v1/hse/evenements", {corps}).then(j=>{ ok(); vider(CHAMPS_EVT("fwh")); tout(); return ouvrir(ctx, j.id); })); }
    if (a === "edit"){ E.edit = true; vider(CHAMPS_EVT("fwhE")); ctx.rendre(); return focusSur("fwhEType"); }
    if (a === "finEdit"){ E.edit = false; vider(CHAMPS_EVT("fwhE")); return ctx.rendre(); }
    if (a === "majEvt"){ const corps = corpsEvt("fwhE");
      return verrou(()=>ctx.api("api/v1/hse/evenements/"+encodeURIComponent(eid()), {corps}).then(()=>{ ok(); E.edit = false; vider(CHAMPS_EVT("fwhE")); return ouvrir(ctx, eid()); })); }
    if (a === "analyser"){ const corps = {cause:val("fwhCause")}; if (document.getElementById("fwhJ2")) corps.joursArret = val("fwhJ2");
      return verrou(()=>ctx.api("api/v1/hse/evenements/"+encodeURIComponent(eid())+"/analyse", {corps}).then(()=>{ ok(); vider(["fwhCause","fwhJ2"]); return ouvrir(ctx, eid()); })); }
    if (a === "cnam"){ const corps = {declareeLe:val("fwhCL"), reference:val("fwhCR")};
      return verrou(()=>ctx.api("api/v1/hse/evenements/"+encodeURIComponent(eid())+"/cnam", {corps}).then(()=>{ ok(); vider(["fwhCL","fwhCR"]); return ouvrir(ctx, eid()); })); }
    if (a === "action"){ const corps = {evenementId:eid(), titre:val("fwhAT"), responsable:val("fwhAR"), echeance:val("fwhAE")};
      return verrou(()=>ctx.api("api/v1/hse/actions", {corps}).then(()=>{ ok(); vider(["fwhAT","fwhAR","fwhAE"]); return ouvrir(ctx, eid(), "fwhAT"); })); }
    const apresAction = () => { if (E.detail) return ouvrir(ctx, eid()); E.A = null; };
    if (a === "faite"){ const idA = el.dataset.id; return verrou(()=>ctx.api("api/v1/hse/actions/"+encodeURIComponent(idA)+"/faite", {corps:{}}).then(()=>{ ok(); return apresAction(); })); }
    if (a === "editA"){ E.editA = el.dataset.id; vider(["fwhXT","fwhXR","fwhXE"]); ctx.rendre(); return focusSur("fwhXT"); }
    if (a === "finEditA"){ E.editA = null; vider(["fwhXT","fwhXR","fwhXE"]); return ctx.rendre(); }
    if (a === "majAction"){ const idA = el.dataset.id, corps = {titre:val("fwhXT"), responsable:val("fwhXR"), echeance:val("fwhXE")};
      return verrou(()=>ctx.api("api/v1/hse/actions/"+encodeURIComponent(idA), {corps}).then(()=>{ ok(); E.editA = null; vider(["fwhXT","fwhXR","fwhXE"]); return apresAction(); })); }
    if (a === "annulerA"){ const idA = el.dataset.id;
      return ctx.confirmer({titre:T(ctx,"annulerAction"), message:T(ctx,"annulerActionQ").replace("{n}", el.dataset.n || ""), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif"), danger:true}).then(r=>{ if (!r.ok) return;
        return verrou(()=>ctx.api("api/v1/hse/actions/"+encodeURIComponent(idA)+"/annuler", {corps:{motif:r.motif || ""}}).then(()=>{ ok(); return apresAction(); })); }); }
    if (a === "cloturer") return ctx.confirmer({titre:T(ctx,"cloturer"), message:String(E.detail.evenement.description).slice(0, 120)}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/hse/evenements/"+encodeURIComponent(eid())+"/cloturer", {corps:{}}).then(()=>{ ok(); return ouvrir(ctx, eid()); })); });
    if (a === "rouvrir") return ctx.confirmer({titre:T(ctx,"rouvrir"), message:T(ctx,"rouvrirQ"), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif")}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/hse/evenements/"+encodeURIComponent(eid())+"/rouvrir", {corps:{motif:r.motif || ""}}).then(()=>{ ok(); return ouvrir(ctx, eid()); })); });
    const CHR = ["fwhRU","fwhRD","fwhRS","fwhRG","fwhRP","fwhRM"];
    if (a === "editR"){ E.editR = el.dataset.id; vider(CHR); ctx.rendre(); return focusSur("fwhRU"); }
    if (a === "finEditR"){ E.editR = null; vider(CHR); return ctx.rendre(); }
    if (a === "risque"){ const corps = {unite:val("fwhRU"), danger:val("fwhRD"), siteId:val("fwhRS"), gravite:Number(val("fwhRG")), probabilite:Number(val("fwhRP")), mesures:val("fwhRM")}, idR = E.editR;
      return verrou(()=>ctx.api("api/v1/hse/risques"+(idR ? "/"+encodeURIComponent(idR) : ""), {corps}).then(()=>{ ok(); E.editR = null; vider(CHR); E.R = null; focusSur("fwhRU"); })); }
    if (a === "epi"){ const corps = {mat:val("fwhPM"), type:val("fwhPT"), remisLe:val("fwhPR"), renouvelerLe:val("fwhPN")};
      return verrou(()=>ctx.api("api/v1/hse/epi", {corps}).then(()=>{ ok(); vider(["fwhPM","fwhPT","fwhPR","fwhPN"]); E.P = null; focusSur("fwhPM"); })); }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.type === "checkbox" ? el.checked : el.value; return; }
    if (k === "stE"){ E.stE = el.value; E.offE = 0; E.EV = null; E.EVErr = null; return ctx.rendre(); }
    if (k === "stA"){ E.stA = el.value; E.offA = 0; E.A = null; E.AErr = null; return ctx.rendre(); }
    if (k === "filtreP"){ E.filtreP = el.value; E.offP = 0; E.P = null; E.PErr = null; return ctx.rendre(); }
  }
});
})();
