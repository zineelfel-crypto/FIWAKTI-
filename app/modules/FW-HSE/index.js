/* FW-HSE — interface chargée à la demande : indicateurs, événements (déclaration, analyse, actions, clôture), actions
   correctives, évaluation des risques, équipements de protection. */
(function(){
"use strict";
const L = {
  fr:{evolution:"Évolution mensuelle des événements", pyramide:"Pyramide de sécurité", pyramideAide:"Chaque presque-accident déclaré est une occasion d'éviter un accident : plus la base est large, plus la prévention est active.", avecArretL:"Avec arrêt", aucunEvt:"Aucun événement déclaré sur la période.", titre:"Santé et sécurité", lede:"Accidents, incidents et presque-accidents, actions correctives, évaluation des risques et équipements de protection ; taux calculés sur les heures réellement travaillées.",
    bord:"Tableau de bord", evenements:"Événements", actions:"Actions", risques:"Risques", epi:"Équipements", periode:"12 derniers mois", accidents:"Accidents", avecArret:"dont avec arrêt",
    joursArret:"Jours d'arrêt", tf:"Taux de fréquence", tg:"Taux de gravité", tfAide:"accidents avec arrêt × 1 000 000 / heures travaillées", tgAide:"jours d'arrêt × 1 000 / heures travaillées",
    heures:"Heures travaillées", presque:"Presque-accidents", incidents:"Incidents", actionsOuv:"Actions ouvertes", retard:"en retard", mois:"Mois", declarer:"Déclarer", type:"Type",
    t_accident:"Accident", t_incident:"Incident", t_presque_accident:"Presque-accident", date:"Date", heure:"Heure", lieu:"Lieu", victime:"Salarié concerné (matricule)", gravite:"Gravité (1 à 4)",
    arret:"Avec arrêt de travail", jours:"Jours d'arrêt", description:"Description des faits", cause:"Cause identifiée", statut:"Statut", s_ouvert:"Ouvert", s_en_analyse:"En analyse", s_clos:"Clos",
    enCours:"En cours", clos:"Clos", tous:"Tous", retour:"Retour", analyser:"Enregistrer l'analyse", cloturer:"Clore l'événement", ajoutAction:"Ajouter une action corrective", titreAction:"Action",
    responsable:"Responsable", echeance:"Échéance", faite:"Faite", marquerFaite:"Marquer faite", unite:"Unité de travail", danger:"Danger", probabilite:"Probabilité (1 à 4)", criticite:"Criticité",
    mesures:"Mesures de prévention", ajoutRisque:"Ajouter le risque", salarie:"Salarié", equipement:"Équipement", remis:"Remis le", renouveler:"À renouveler le", ajoutEpi:"Enregistrer la dotation",
    aRenouveler:"À renouveler (30 jours)", aucune:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", origine:"Origine", sansDonneeMedicale:"Aucune donnée médicale n'est enregistrée ici : seulement le nombre de jours d'arrêt."},
  en:{evolution:"Monthly events", pyramide:"Safety pyramid", pyramideAide:"Each near-miss reported is a chance to prevent an accident: the wider the base, the more active the prevention.", avecArretL:"With lost time", aucunEvt:"No event reported for the period.", titre:"Health and safety", lede:"Accidents, incidents and near misses, corrective actions, risk assessment and protective equipment; rates computed on hours actually worked.",
    bord:"Dashboard", evenements:"Events", actions:"Actions", risques:"Risks", epi:"Equipment", periode:"Last 12 months", accidents:"Accidents", avecArret:"with lost time",
    joursArret:"Days lost", tf:"Frequency rate", tg:"Severity rate", tfAide:"lost-time accidents × 1,000,000 / hours worked", tgAide:"days lost × 1,000 / hours worked",
    heures:"Hours worked", presque:"Near misses", incidents:"Incidents", actionsOuv:"Open actions", retard:"overdue", mois:"Month", declarer:"Report", type:"Type",
    t_accident:"Accident", t_incident:"Incident", t_presque_accident:"Near miss", date:"Date", heure:"Time", lieu:"Place", victime:"Employee concerned (ID)", gravite:"Severity (1 to 4)",
    arret:"Lost time", jours:"Days lost", description:"Description", cause:"Root cause", statut:"Status", s_ouvert:"Open", s_en_analyse:"Under analysis", s_clos:"Closed",
    enCours:"Open", clos:"Closed", tous:"All", retour:"Back", analyser:"Save analysis", cloturer:"Close event", ajoutAction:"Add corrective action", titreAction:"Action",
    responsable:"Owner", echeance:"Due", faite:"Done", marquerFaite:"Mark done", unite:"Work unit", danger:"Hazard", probabilite:"Likelihood (1 to 4)", criticite:"Criticality",
    mesures:"Preventive measures", ajoutRisque:"Add risk", salarie:"Employee", equipement:"Equipment", remis:"Issued", renouveler:"Renew on", ajoutEpi:"Save issue",
    aRenouveler:"To renew (30 days)", aucune:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", origine:"Origin", sansDonneeMedicale:"No medical data is stored here: only the number of days lost."},
  ar:{evolution:"تطور الأحداث شهريا", pyramide:"هرم السلامة", pyramideAide:"كل حادث وشيك مُبلّغ عنه فرصة لتفادي حادث: كلما اتسعت القاعدة كانت الوقاية أنشط.", avecArretL:"مع توقف", aucunEvt:"لا أحداث مصرح بها خلال الفترة.", titre:"الصحة والسلامة", lede:"الحوادث والحوادث الوشيكة والإجراءات التصحيحية وتقييم المخاطر ومعدات الوقاية.",
    bord:"لوحة القيادة", evenements:"الأحداث", actions:"الإجراءات", risques:"المخاطر", epi:"المعدات", periode:"آخر 12 شهرا", accidents:"الحوادث", avecArret:"منها مع توقف",
    joursArret:"أيام التوقف", tf:"معدل التواتر", tg:"معدل الخطورة", tfAide:"حوادث مع توقف × 1000000 / ساعات العمل", tgAide:"أيام التوقف × 1000 / ساعات العمل",
    heures:"ساعات العمل", presque:"حوادث وشيكة", incidents:"حوادث عرضية", actionsOuv:"إجراءات مفتوحة", retard:"متأخرة", mois:"الشهر", declarer:"تصريح", type:"النوع",
    t_accident:"حادث", t_incident:"حادث عرضي", t_presque_accident:"حادث وشيك", date:"التاريخ", heure:"الساعة", lieu:"المكان", victime:"الأجير المعني (المعرف)", gravite:"الخطورة (1 إلى 4)",
    arret:"مع توقف عن العمل", jours:"أيام التوقف", description:"وصف الوقائع", cause:"السبب", statut:"الحالة", s_ouvert:"مفتوح", s_en_analyse:"قيد التحليل", s_clos:"مغلق",
    enCours:"جارية", clos:"مغلقة", tous:"الكل", retour:"رجوع", analyser:"حفظ التحليل", cloturer:"إغلاق الحدث", ajoutAction:"إضافة إجراء تصحيحي", titreAction:"الإجراء",
    responsable:"المسؤول", echeance:"الأجل", faite:"منجز", marquerFaite:"تأشير كمنجز", unite:"وحدة العمل", danger:"الخطر", probabilite:"الاحتمال (1 إلى 4)", criticite:"الحرجية",
    mesures:"إجراءات الوقاية", ajoutRisque:"إضافة الخطر", salarie:"الأجير", equipement:"المعدات", remis:"تاريخ التسليم", renouveler:"تاريخ التجديد", ajoutEpi:"حفظ التسليم",
    aRenouveler:"للتجديد (30 يوما)", aucune:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", origine:"المصدر", sansDonneeMedicale:"لا تسجل هنا أي بيانات طبية: فقط عدد أيام التوقف."}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const champ = (ctx, l, h) => '<label class="fwh-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
const auj = () => new Date().toISOString().slice(0, 10);
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"bord", I:null, EV:null, stE:"", A:null, R:null, P:null, filtreP:"", detail:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false; ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; ctx.flash(e.message, "err"); }); } };
  if (E.onglet === "bord") get("I", "api/v1/hse/indicateurs");
  if (E.onglet === "evenements" && !E.detail) get("EV", "api/v1/hse/evenements?limit=100&statut="+(E.stE || ""));
  if (E.onglet === "actions") get("A", "api/v1/hse/actions?limit=200");
  if (E.onglet === "risques") get("R", "api/v1/hse/risques");
  if (E.onglet === "epi") get("P", "api/v1/hse/epi?limit=200&filtre="+E.filtreP);
}
const kpi = (ctx, v, l, aide) => '<div class="fw-card fwh-kpi"><b>'+ctx.esc(v == null ? "—" : String(v))+'</b><span>'+ctx.esc(l)+'</span>'+(aide ? '<small>'+ctx.esc(aide)+'</small>' : '')+'</div>';
function vueBord(ctx){
  const I = ctx.etat.I; if (!I) return '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>';
  /* 56.31.1 : indicateurs colorés selon les seuils, évolution mensuelle en graphique, tableau lisible */
  const V = ctx.viz, M = I.parMois || [], d6 = M.slice(-6), p6 = M.slice(-12, -6), som = (l, k) => l.reduce((x, m)=>x + (+m[k]||0), 0);
  const kp = V.kpi.bind(V);
  return '<p class="fw-hint">'+ctx.esc(T(ctx,"periode")+" · "+ctx.dateAff(I.du)+" → "+ctx.dateAff(I.au)+" · "+T(ctx,"heures")+" : "+V.nombre(I.heures, 0))+'</p><div class="fw-vkpis">'+
    kp({v:I.accidents, l:T(ctx,"accidents"), aide:I.avecArret+" "+T(ctx,"avecArret"), ico:"hse", ton:I.avecArret ? "alerte" : I.accidents ? "att" : "ok", spark:M.map(m=>m.accident), inverse:true,
      prec:p6.length ? som(p6, "accident") : null, v6:null})+
    kp({v:I.tf, dec:2, l:T(ctx,"tf"), aide:T(ctx,"tfAide"), ico:"etats", ton:I.tf > 20 ? "alerte" : I.tf > 0 ? "att" : "ok"})+
    kp({v:I.tg, dec:2, l:T(ctx,"tg"), aide:T(ctx,"tgAide"), ico:"etats", ton:I.tg > 1 ? "alerte" : I.tg > 0 ? "att" : "ok"})+
    kp({v:I.joursArret, l:T(ctx,"joursArret"), ico:"cal", ton:I.joursArret ? "att" : "ok"})+
    kp({v:I.presqueAccidents, l:T(ctx,"presque"), ico:"alerte", ton:"info", spark:M.map(m=>m.presque_accident)})+
    kp({v:I.actionsOuvertes, l:T(ctx,"actionsOuv"), aide:I.actionsRetard+" "+T(ctx,"retard"), ico:"succes", ton:I.actionsRetard ? "alerte" : "ok", act:"fwm:ongletV", data:"actions"})+'</div>'+
    (M.length ? '<div class="fw-vgrille">'+
      V.graphe({titre:T(ctx,"evolution"), type:"barres", etiquettes:M.map(m=>V.mois(m.mois, true)),
        series:[{nom:T(ctx,"accidents"), valeurs:M.map(m=>+m.accident||0), couleur:"#e11d48"}, {nom:T(ctx,"incidents"), valeurs:M.map(m=>+m.incident||0), couleur:"#f59e0b"},
          {nom:T(ctx,"presque"), valeurs:M.map(m=>+m.presque_accident||0), couleur:"#3b82f6"}]})+
      '<div class="fw-vgraphe"><div class="fw-vgt">'+ctx.esc(T(ctx,"pyramide"))+'</div>'+pyramide(ctx, I)+'</div></div>'+
      '<table class="fw-tbl fwh-mois"><thead><tr><th>'+ctx.esc(T(ctx,"mois"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"accidents"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"incidents"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"presque"))+'</th></tr></thead><tbody>'+
      M.slice().reverse().map(m=>'<tr><td>'+ctx.esc(V.mois(m.mois))+'</td><td class="fw-num'+(+m.accident ? ' fwh-ko' : '')+'">'+V.nombre(m.accident, 0)+'</td><td class="fw-num">'+V.nombre(m.incident, 0)+'</td><td class="fw-num">'+V.nombre(m.presque_accident, 0)+'</td></tr>').join("")+'</tbody></table>' :
      '<div class="fw-empty">'+ctx.esc(T(ctx,"aucunEvt"))+'</div>');
}
/* pyramide de sécurité : accidents avec arrêt › accidents › incidents › presque-accidents */
function pyramide(ctx, I){
  const M = I.parMois || [], inc = M.reduce((x, m)=>x + (+m.incident||0), 0);
  const nv = [[T(ctx,"avecArretL"), I.avecArret||0, "#be123c"], [T(ctx,"accidents"), I.accidents||0, "#e11d48"], [T(ctx,"incidents"), inc, "#f59e0b"], [T(ctx,"presque"), I.presqueAccidents||0, "#3b82f6"]];
  return '<div class="fwh-pyr">'+nv.map((n, i)=>'<div class="niv" style="width:'+(34 + i*22)+'%;background:'+n[2]+'"><b>'+ctx.viz.nombre(n[1], 0)+'</b><span>'+ctx.esc(n[0])+'</span></div>').join("")+'</div>'+
    '<p class="fw-hint" style="margin:8px 0 0">'+ctx.esc(T(ctx,"pyramideAide"))+'</p>';
}
function vueEvenements(ctx){
  const E = ctx.etat; if (E.detail) return vueDetail(ctx);
  const X = E.EV, peut = ctx.rang("EMP") >= 2;
  return (peut ? '<div class="fw-card fw-u-p fwh-form">'+champ(ctx, T(ctx,"type"), '<select id="fwhType">'+["accident","incident","presque_accident"].map(t=>'<option value="'+t+'">'+ctx.esc(T(ctx,"t_"+t))+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"date"), '<input id="fwhD" type="date" value="'+auj()+'" max="'+auj()+'">')+champ(ctx, T(ctx,"heure"), '<input id="fwhH" type="time">')+champ(ctx, T(ctx,"lieu"), '<input id="fwhL">')+
      champ(ctx, T(ctx,"victime"), '<input id="fwhM">')+champ(ctx, T(ctx,"gravite"), '<select id="fwhG">'+[1,2,3,4].map(n=>'<option>'+n+'</option>').join("")+'</select>')+
      '<label class="fwh-chk"><input type="checkbox" id="fwhA"> '+ctx.esc(T(ctx,"arret"))+'</label>'+champ(ctx, T(ctx,"jours"), '<input id="fwhJ" type="number" min="0" value="0">')+
      champ(ctx, T(ctx,"description"), '<textarea id="fwhDesc" rows="2"></textarea>')+'<button class="fw-btn pri" data-act="fwm:declarer">'+ctx.esc(T(ctx,"declarer"))+'</button>'+
      '<p class="fw-hint" style="flex-basis:100%">'+ctx.esc(T(ctx,"sansDonneeMedicale"))+'</p></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="stE"><option value="">'+ctx.esc(T(ctx,"enCours"))+'</option><option value="clos"'+(E.stE === "clos" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"clos"))+'</option><option value="tous"'+(E.stE === "tous" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"tous"))+'</option></select></div>'+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"date"))+'</th><th>'+ctx.esc(T(ctx,"type"))+'</th><th>'+ctx.esc(T(ctx,"description"))+'</th><th>'+ctx.esc(T(ctx,"salarie"))+'</th><th>'+ctx.esc(T(ctx,"statut"))+'</th></tr></thead><tbody>'+
      X.lignes.map(e=>'<tr><td>'+ctx.esc(ctx.dateAff(e.d)+(e.heure ? " "+e.heure : ""))+'</td><td><span class="fwh-t fwh-'+e.type+'">'+ctx.esc(T(ctx,"t_"+e.type))+'</span></td>'+
        '<td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(e.id)+'">'+ctx.esc(String(e.description).slice(0, 80))+'</button></td><td>'+ctx.esc(e.victime || "—")+'</td><td>'+ctx.esc(T(ctx,"s_"+e.statut))+'</td></tr>').join("")+'</tbody></table>');
}
function vueDetail(ctx){
  const D = ctx.etat.detail, e = D.evenement, val3 = ctx.rang("EMP") >= 3 && e.statut !== "clos";
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">← '+ctx.esc(T(ctx,"retour"))+'</button><span class="fwh-t fwh-'+e.type+'">'+ctx.esc(T(ctx,"t_"+e.type))+'</span><strong>'+ctx.esc(ctx.dateAff(e.d)+(e.heure ? " "+e.heure : "")+(e.lieu ? " · "+e.lieu : ""))+'</strong><span class="fw-tag">'+ctx.esc(T(ctx,"s_"+e.statut))+'</span></div>'+
    '<div class="fw-card fw-u-p"><p>'+ctx.esc(e.description)+'</p><p class="fw-hint">'+ctx.esc((e.victime ? T(ctx,"salarie")+" : "+e.victime+" · " : "")+T(ctx,"gravite")+" : "+e.gravite+(e.arret ? " · "+T(ctx,"jours")+" : "+e.jours_arret : ""))+'</p>'+
      (val3 ? '<div class="fwh-form">'+champ(ctx, T(ctx,"cause"), '<textarea id="fwhCause" rows="2">'+ctx.esc(e.cause||"")+'</textarea>')+(e.arret ? champ(ctx, T(ctx,"jours"), '<input id="fwhJ2" type="number" min="0" value="'+e.jours_arret+'">') : '')+
        '<button class="fw-btn" data-act="fwm:analyser">'+ctx.esc(T(ctx,"analyser"))+'</button></div>' : (e.cause ? '<p><strong>'+ctx.esc(T(ctx,"cause"))+' :</strong> '+ctx.esc(e.cause)+'</p>' : ''))+'</div>'+
    '<div class="fw-sec">'+ctx.esc(T(ctx,"actions"))+'</div>'+
    (D.actions.length ? '<table class="fw-tbl"><tbody>'+D.actions.map(a=>'<tr><td>'+ctx.esc(a.titre)+'</td><td>'+ctx.esc(a.responsable||"")+'</td><td>'+ctx.esc(ctx.dateAff(a.echeance))+'</td><td>'+
      (a.statut === "faite" ? ctx.esc(T(ctx,"faite")) : (ctx.rang("EMP") >= 2 ? '<button class="fw-btn sm" data-act="fwm:faite" data-id="'+ctx.esc(a.id)+'">'+ctx.esc(T(ctx,"marquerFaite"))+'</button>' : ''))+'</td></tr>').join("")+'</tbody></table>' : '<div class="fw-hint">—</div>')+
    (val3 ? '<div class="fwh-form" style="margin-top:8px">'+champ(ctx, T(ctx,"titreAction"), '<input id="fwhAT">')+champ(ctx, T(ctx,"responsable"), '<input id="fwhAR">')+champ(ctx, T(ctx,"echeance"), '<input id="fwhAE" type="date">')+
      '<button class="fw-btn" data-act="fwm:action">'+ctx.esc(T(ctx,"ajoutAction"))+'</button></div><div class="fw-toolbar"><button class="fw-btn pri" data-act="fwm:cloturer">'+ctx.esc(T(ctx,"cloturer"))+'</button></div>' : '');
}
function vueActions(ctx){
  const X = ctx.etat.A; if (!X) return '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>';
  if (!X.lignes.length) return '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>';
  return '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"titreAction"))+'</th><th>'+ctx.esc(T(ctx,"origine"))+'</th><th>'+ctx.esc(T(ctx,"responsable"))+'</th><th>'+ctx.esc(T(ctx,"echeance"))+'</th><th></th></tr></thead><tbody>'+
    X.lignes.map(a=>'<tr><td>'+ctx.esc(a.titre)+'</td><td>'+ctx.esc(a.evtype ? T(ctx,"t_"+a.evtype)+" "+ctx.dateAff(a.evd) : (a.danger || "—"))+'</td><td>'+ctx.esc(a.responsable||"")+'</td>'+
      '<td'+(a.echeance < auj() ? ' class="fwh-ko"' : '')+'>'+ctx.esc(ctx.dateAff(a.echeance))+'</td><td>'+(ctx.rang("EMP") >= 2 ? '<button class="fw-btn sm" data-act="fwm:faite" data-id="'+ctx.esc(a.id)+'">'+ctx.esc(T(ctx,"marquerFaite"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>';
}
function vueRisques(ctx){
  const X = ctx.etat.R, peut = ctx.rang("EMP") >= 3;
  return (peut ? '<div class="fw-card fw-u-p fwh-form">'+champ(ctx, T(ctx,"unite"), '<input id="fwhRU">')+champ(ctx, T(ctx,"danger"), '<input id="fwhRD">')+
      champ(ctx, T(ctx,"gravite"), '<select id="fwhRG">'+[1,2,3,4].map(n=>'<option>'+n+'</option>').join("")+'</select>')+champ(ctx, T(ctx,"probabilite"), '<select id="fwhRP">'+[1,2,3,4].map(n=>'<option>'+n+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"mesures"), '<input id="fwhRM">')+'<button class="fw-btn pri" data-act="fwm:risque">'+ctx.esc(T(ctx,"ajoutRisque"))+'</button></div>' : '')+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"unite"))+'</th><th>'+ctx.esc(T(ctx,"danger"))+'</th><th class="fw-numh">G</th><th class="fw-numh">P</th><th class="fw-numh">'+ctx.esc(T(ctx,"criticite"))+'</th><th>'+ctx.esc(T(ctx,"mesures"))+'</th></tr></thead><tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc(r.unite)+'</td><td>'+ctx.esc(r.danger)+'</td><td class="fw-num">'+r.gravite+'</td><td class="fw-num">'+r.probabilite+'</td><td class="fw-num"><span class="fwh-crit fwh-c'+(r.criticite >= 9 ? 3 : r.criticite >= 4 ? 2 : 1)+'">'+r.criticite+'</span></td><td>'+ctx.esc(r.mesures||"")+'</td></tr>').join("")+'</tbody></table>');
}
function vueEpi(ctx){
  const E = ctx.etat, X = E.P, peut = ctx.rang("EMP") >= 2;
  return (peut ? '<div class="fw-card fw-u-p fwh-form">'+champ(ctx, T(ctx,"victime"), '<input id="fwhPM">')+champ(ctx, T(ctx,"equipement"), '<input id="fwhPT" list="fwhEpiL"><datalist id="fwhEpiL"><option>Chaussures de sécurité</option><option>Blouse ESD</option><option>Gants</option><option>Lunettes</option><option>Casque antibruit</option></datalist>')+
      champ(ctx, T(ctx,"remis"), '<input id="fwhPR" type="date" value="'+auj()+'">')+champ(ctx, T(ctx,"renouveler"), '<input id="fwhPN" type="date">')+'<button class="fw-btn pri" data-act="fwm:epi">'+ctx.esc(T(ctx,"ajoutEpi"))+'</button></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="filtreP"><option value="">'+ctx.esc(T(ctx,"tous"))+'</option><option value="renouveler"'+(E.filtreP === "renouveler" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"aRenouveler"))+'</option></select></div>'+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"salarie"))+'</th><th>'+ctx.esc(T(ctx,"equipement"))+'</th><th>'+ctx.esc(T(ctx,"remis"))+'</th><th>'+ctx.esc(T(ctx,"renouveler"))+'</th></tr></thead><tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</td><td>'+ctx.esc(r.type)+'</td><td>'+ctx.esc(ctx.dateAff(r.remis_le))+'</td><td'+(r.aRenouveler ? ' class="fwh-ko"' : '')+'>'+ctx.esc(r.renouveler_le ? ctx.dateAff(r.renouveler_le) : "—")+'</td></tr>').join("")+'</tbody></table>');
}
function ouvrir(ctx, id){ return ctx.api("api/v1/hse/evenements/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre(); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-HSE",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["bord","bord"],["evenements","evenements"],["actions","actions"],["risques","risques"],["epi","epi"]];
    const corps = E.onglet === "evenements" ? vueEvenements(ctx) : E.onglet === "actions" ? vueActions(ctx) : E.onglet === "risques" ? vueRisques(ctx) : E.onglet === "epi" ? vueEpi(ctx) : vueBord(ctx);
    return '<div class="fw-module fwh"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px">'+corps+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(e.message, "err"), tout = () => { E.I = E.EV = E.A = E.R = E.P = null; };
    if (a === "onglet" || a === "ongletV"){ E.onglet = el.dataset.o || el.dataset.v; E.detail = null; tout(); return ctx.rendre(); }
    if (a === "voir") return ouvrir(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.detail = null; tout(); return ctx.rendre(); }
    if (a === "declarer") return ctx.api("api/v1/hse/evenements", {corps:{type:val("fwhType"), d:val("fwhD"), heure:val("fwhH"), lieu:val("fwhL"), mat:val("fwhM"), gravite:Number(val("fwhG"))||1,
      arret:!!(document.getElementById("fwhA")||{}).checked, joursArret:Number(val("fwhJ"))||0, description:val("fwhDesc")}}).then(j=>{ ok(); tout(); return ouvrir(ctx, j.id); }).catch(ko);
    if (a === "analyser") return ctx.api("api/v1/hse/evenements/"+encodeURIComponent(E.detail.evenement.id)+"/analyse", {corps:{cause:val("fwhCause"), joursArret:Number(val("fwhJ2"))||0}}).then(()=>{ ok(); return ouvrir(ctx, E.detail.evenement.id); }).catch(ko);
    if (a === "action") return ctx.api("api/v1/hse/actions", {corps:{evenementId:E.detail.evenement.id, titre:val("fwhAT"), responsable:val("fwhAR"), echeance:val("fwhAE")}}).then(()=>{ ok(); return ouvrir(ctx, E.detail.evenement.id); }).catch(ko);
    if (a === "faite") return ctx.api("api/v1/hse/actions/"+encodeURIComponent(el.dataset.id)+"/faite", {corps:{}}).then(()=>{ ok(); if (E.detail) return ouvrir(ctx, E.detail.evenement.id); E.A = null; ctx.rendre(); }).catch(ko);
    if (a === "cloturer") return ctx.confirmer({titre:T(ctx,"cloturer"), message:E.detail.evenement.description.slice(0, 120)}).then(r=>{ if (!r.ok) return;
      ctx.api("api/v1/hse/evenements/"+encodeURIComponent(E.detail.evenement.id)+"/cloturer", {corps:{}}).then(()=>{ ok(); return ouvrir(ctx, E.detail.evenement.id); }).catch(ko); });
    if (a === "risque") return ctx.api("api/v1/hse/risques", {corps:{unite:val("fwhRU"), danger:val("fwhRD"), gravite:Number(val("fwhRG")), probabilite:Number(val("fwhRP")), mesures:val("fwhRM")}}).then(()=>{ ok(); E.R = null; ctx.rendre(); }).catch(ko);
    if (a === "epi") return ctx.api("api/v1/hse/epi", {corps:{mat:val("fwhPM"), type:val("fwhPT"), remisLe:val("fwhPR"), renouvelerLe:val("fwhPN")}}).then(()=>{ ok(); E.P = null; ctx.rendre(); }).catch(ko);
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "stE"){ E.stE = el.value; E.EV = null; return ctx.rendre(); }
    if (k === "filtreP"){ E.filtreP = el.value; E.P = null; return ctx.rendre(); }
  }
});
})();
