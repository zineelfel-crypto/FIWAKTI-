/* FW-Medicale — interface chargée à la demande. Service médical : visites, dossier (consultation tracée), maladies
   professionnelles, export. RH et responsables : aptitude et prochaine visite uniquement.
   Correctif 40 : droits renvoyés par le serveur appliqués (boutons masqués ou désactivés), saisie conservée au rendu et
   après une erreur, pagination, compteurs calculés par le serveur, report et annulation motivés, rectification d'une
   visite réalisée, visite planifiée la plus ancienne proposée, onglets accessibles, focus rétabli, jour local. */
(function(){
"use strict";
const L = {
  fr:{statut:"Statut", e_retard:"En retard", e_proche:"Cette semaine", e_ok:"À venir", c_retard:"Visites en retard", c_semaine:"Dans les 7 jours", c_mois:"Ce mois-ci", c_total:"Planifiées", filtreActif:"Filtre actif.", tout:"Tout afficher", titre:"Suivi médical", lede:"Visites d'embauche, périodiques et de reprise, aptitudes, maladies professionnelles. Le détail médical est réservé au service médical ; chaque consultation est tracée.",
    rhNote:"Vous voyez uniquement l'aptitude et la date de la prochaine visite : le détail médical est réservé au service médical.",
    sensNote:"Votre profil n'a pas accès aux données sensibles : seules les aptitudes sont affichées.", lectureNote:"Écran en lecture seule pour votre profil.",
    visites:"Visites", planifier:"Planifier", dossier:"Dossier médical", aptitudes:"Aptitudes", parametres:"Paramètres", planifiees:"Planifiées", realisees:"Réalisées", annulees:"Annulées",
    matricule:"Matricule", salarie:"Salarié", type:"Type", t_embauche:"Embauche", t_periodique:"Périodique", t_reprise:"Reprise", t_pre_reprise:"Pré-reprise", t_demande:"À la demande",
    prevue:"Prévue le", realisee:"Réalisée le", aptitude:"Aptitude", a_apte:"Apte", a_apte_restriction:"Apte avec restriction", a_inapte:"Inapte", prochaine:"Prochaine visite",
    restrictions:"Restrictions", observations:"Observations (confidentielles)", enregistrerVisite:"Enregistrer la visite", annuler:"Annuler la visite", ouvrir:"Ouvrir le dossier", planifierVisite:"Planifier la visite",
    mp:"Maladies professionnelles", declarer:"Déclarer", tableau:"Tableau", declaree:"Déclarée le", s_declaree:"Déclarée", s_reconnue:"Reconnue", s_refusee:"Refusée",
    periodicite:"Périodicité des visites périodiques", mois:"{n} mois", exporter:"Exporter le suivi (CSV, tracé)", rechercher:"Matricule ou nom…", tous:"Tous", restr:"Avec restriction ou inapte", inaptes:"Inaptes", echue:"Visite échue ou absente",
    aucune:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}", trace:"Consultation enregistrée dans le journal d'audit.",
    precedent:"Page précédente", suivant:"Page suivante", reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", reessayer:"Réessayer",
    reporter:"Reporter", nouvelleDate:"Nouvelle date", motif:"Motif", confirmerReport:"Confirmer le report", fermer:"Fermer",
    annulerQ:"Annuler la visite « {t} » du {d} ? Indiquez le motif.", rectifier:"Rectifier", motifRect:"Motif de la rectification", enregistrerRect:"Enregistrer la rectification",
    historique:"Historique", n_report:"Report", n_annulation:"Annulation", n_rectification:"Rectification", planifieeLe:"Planifiée le {d}",
    autresPlan:"{n} autre(s) visite(s) planifiée(s).", illisible:"{n} donnée(s) chiffrée(s) illisible(s) : vérifiez le coffre de clés.", prochaineAuto:"vide : calculée selon la périodicité",
    retour:"Changer de salarié", inapteNote:"Inapte : pas de prochaine visite périodique.", sorti:"Sorti le {d}", aptActuelle:"Aptitude actuelle"},
  en:{statut:"Status", e_retard:"Overdue", e_proche:"This week", e_ok:"Upcoming", c_retard:"Overdue visits", c_semaine:"Within 7 days", c_mois:"This month", c_total:"Planned", filtreActif:"Filter on.", tout:"Show all", titre:"Medical follow-up", lede:"Pre-employment, periodic and return-to-work visits, fitness, occupational diseases. Medical details are restricted to the medical service; every access is logged.",
    rhNote:"You only see fitness status and next visit date: medical details are restricted to the medical service.",
    sensNote:"Your profile has no access to sensitive data: only fitness status is shown.", lectureNote:"Read-only screen for your profile.",
    visites:"Visits", planifier:"Schedule", dossier:"Medical file", aptitudes:"Fitness", parametres:"Settings", planifiees:"Scheduled", realisees:"Done", annulees:"Cancelled",
    matricule:"Employee ID", salarie:"Employee", type:"Type", t_embauche:"Pre-employment", t_periodique:"Periodic", t_reprise:"Return to work", t_pre_reprise:"Pre-return", t_demande:"On request",
    prevue:"Planned", realisee:"Done on", aptitude:"Fitness", a_apte:"Fit", a_apte_restriction:"Fit with restrictions", a_inapte:"Unfit", prochaine:"Next visit",
    restrictions:"Restrictions", observations:"Notes (confidential)", enregistrerVisite:"Record visit", annuler:"Cancel the visit", ouvrir:"Open file", planifierVisite:"Schedule visit",
    mp:"Occupational diseases", declarer:"Declare", tableau:"Table", declaree:"Declared on", s_declaree:"Declared", s_reconnue:"Recognised", s_refusee:"Refused",
    periodicite:"Periodic visit interval", mois:"{n} months", exporter:"Export (CSV, logged)", rechercher:"ID or name…", tous:"All", restr:"With restrictions or unfit", inaptes:"Unfit", echue:"Visit overdue or missing",
    aucune:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}", trace:"Access recorded in the audit log.",
    precedent:"Previous page", suivant:"Next page", reseau:"Server unreachable: check the connection and try again.", reessayer:"Try again",
    reporter:"Postpone", nouvelleDate:"New date", motif:"Reason", confirmerReport:"Confirm postponement", fermer:"Close",
    annulerQ:"Cancel the “{t}” visit of {d}? Give the reason.", rectifier:"Correct", motifRect:"Reason for correction", enregistrerRect:"Save correction",
    historique:"History", n_report:"Postponed", n_annulation:"Cancelled", n_rectification:"Corrected", planifieeLe:"Scheduled on {d}",
    autresPlan:"{n} other scheduled visit(s).", illisible:"{n} encrypted item(s) unreadable: check the key vault.", prochaineAuto:"empty: computed from the interval",
    retour:"Change employee", inapteNote:"Unfit: no periodic visit scheduled.", sorti:"Left on {d}", aptActuelle:"Current fitness"},
  ar:{statut:"الحالة", e_retard:"متأخرة", e_proche:"هذا الأسبوع", e_ok:"قادمة", c_retard:"زيارات متأخرة", c_semaine:"خلال 7 أيام", c_mois:"هذا الشهر", c_total:"مبرمجة", filtreActif:"تصفية مفعلة.", tout:"عرض الكل", titre:"المتابعة الطبية", lede:"زيارات الانتداب والدورية والاستئناف، الأهلية، الأمراض المهنية. التفاصيل الطبية حكر على المصلحة الطبية وكل اطلاع مسجل.",
    rhNote:"ترى فقط الأهلية وتاريخ الزيارة القادمة: التفاصيل الطبية حكر على المصلحة الطبية.",
    sensNote:"ملفك لا يخول الاطلاع على المعطيات الحساسة: تعرض الأهلية فقط.", lectureNote:"الشاشة للاطلاع فقط حسب ملفك.",
    visites:"الزيارات", planifier:"برمجة", dossier:"الملف الطبي", aptitudes:"الأهلية", parametres:"الإعدادات", planifiees:"مبرمجة", realisees:"منجزة", annulees:"ملغاة",
    matricule:"المعرف", salarie:"الأجير", type:"النوع", t_embauche:"انتداب", t_periodique:"دورية", t_reprise:"استئناف", t_pre_reprise:"ما قبل الاستئناف", t_demande:"بطلب",
    prevue:"مبرمجة في", realisee:"أنجزت في", aptitude:"الأهلية", a_apte:"أهل", a_apte_restriction:"أهل مع قيود", a_inapte:"غير أهل", prochaine:"الزيارة القادمة",
    restrictions:"القيود", observations:"ملاحظات (سرية)", enregistrerVisite:"تسجيل الزيارة", annuler:"إلغاء الزيارة", ouvrir:"فتح الملف", planifierVisite:"برمجة الزيارة",
    mp:"الأمراض المهنية", declarer:"تصريح", tableau:"الجدول", declaree:"تاريخ التصريح", s_declaree:"مصرح بها", s_reconnue:"معترف بها", s_refusee:"مرفوضة",
    periodicite:"دورية الزيارات", mois:"{n} أشهر", exporter:"تصدير (مسجل)", rechercher:"المعرف أو الاسم…", tous:"الكل", restr:"مع قيود أو غير أهل", inaptes:"غير أهل", echue:"زيارة متأخرة أو غائبة",
    aucune:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}", trace:"سجل الاطلاع في سجل التدقيق.",
    precedent:"الصفحة السابقة", suivant:"الصفحة التالية", reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة.", reessayer:"إعادة المحاولة",
    reporter:"تأجيل", nouvelleDate:"التاريخ الجديد", motif:"التعليل", confirmerReport:"تأكيد التأجيل", fermer:"إغلاق",
    annulerQ:"إلغاء زيارة «{t}» بتاريخ {d}؟ اذكر التعليل.", rectifier:"تصحيح", motifRect:"تعليل التصحيح", enregistrerRect:"حفظ التصحيح",
    historique:"السجل", n_report:"تأجيل", n_annulation:"إلغاء", n_rectification:"تصحيح", planifieeLe:"مبرمجة في {d}",
    autresPlan:"{n} زيارة أخرى مبرمجة.", illisible:"{n} معطى مشفر غير مقروء: تحقق من خزنة المفاتيح.", prochaineAuto:"فارغ: تحسب حسب الدورية",
    retour:"تغيير الأجير", inapteNote:"غير أهل: لا زيارة دورية.", sorti:"غادر في {d}", aptActuelle:"الأهلية الحالية"}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "→" ? "←" : g === "←" ? "→" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const PAS = 50;
const pager = (ctx, act, off, total) => total <= PAS && !off ? '' : '<div class="fw-toolbar"><span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", total ? off+1 : 0).replace("{b}", Math.min(off+PAS, total)).replace("{n}", total))+'</span><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="-'+PAS+'"'+(off ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"precedent"))+'">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="'+PAS+'"'+(off+PAS < total ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"suivant"))+'">'+fl(ctx, "›")+'</button></div>';
const champ = (ctx, l, h) => '<label class="fwm-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
const fv = (ctx, id, def) => ctx.etat.form[id] != null ? ctx.etat.form[id] : (def == null ? "" : def);
const inp = (ctx, id, attrs, def) => '<input id="'+id+'" data-fwmc="f:'+id+'" value="'+ctx.esc(fv(ctx, id, def))+'"'+(attrs||"")+'>';
const zone = (ctx, id, def) => '<textarea id="'+id+'" data-fwmc="f:'+id+'" rows="2">'+ctx.esc(fv(ctx, id, def))+'</textarea>';
const sel = (ctx, id, opts, def, attrs) => { const v = String(fv(ctx, id, def)); return '<select id="'+id+'" data-fwmc="f:'+id+'"'+(attrs||"")+'>'+opts.map(([k, l])=>'<option value="'+ctx.esc(k)+'"'+(String(k) === v ? ' selected' : '')+'>'+ctx.esc(l)+'</option>').join("")+'</select>'; };
const val = id => ((document.getElementById(id)||{}).value || "").trim();
/* correctif 40 : jour local (toISOString donnait la veille entre minuit et 1 h en Tunisie) */
const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0");
const auj = () => iso(new Date());
const TYPES = ["embauche","periodique","reprise","pre_reprise","demande"], APT = ["apte","apte_restriction","inapte"];
const droits = ctx => { const E = ctx.etat; return (E.D||{}).droits || (E.V||{}).droits || (E.A||{}).droits || (E.par||{}).droits || {}; };
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"aptitudes", A:null, q:"", filtre:"", offA:0, V:null, stV:"planifiee", offV:0, etatV:"", D:null, par:null, med:null, form:{}, report:null, rect:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"] && !E[k+"Err"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false;
    if (k === "A" && E.med === null){ E.med = !!j.roleMedical; if (E.med) E.onglet = "visites"; } ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; E[k+"Err"] = msgErr(ctx, e); ctx.rendre(); }); } };
  get("A", "api/v1/medical/aptitudes?limit="+PAS+"&offset="+E.offA+"&q="+encodeURIComponent(E.q)+"&filtre="+E.filtre);
  if (E.med && E.onglet === "visites") get("V", "api/v1/medical/visites?limit="+PAS+"&offset="+E.offV+"&statut="+E.stV+"&etat="+E.etatV);
  if (E.med && E.onglet === "parametres") get("par", "api/v1/medical/parametres");
}
function erreurOuCharge(ctx, k){ const E = ctx.etat; return E[k+"Err"] ? '<div class="fw-note warn" role="alert">'+ctx.esc(E[k+"Err"])+' <button class="fw-btn sm" data-act="fwm:reessayer" data-k="'+k+'">'+ctx.esc(T(ctx,"reessayer"))+'</button></div>' : '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
const apt = (ctx, a) => a ? '<span class="fwm-a fwm-'+a+'">'+ctx.esc(T(ctx,"a_"+a))+'</span>' : '—';
const tete = (ctx, leg, cols) => '<caption class="fw-sr">'+ctx.esc(leg)+'</caption><thead><tr>'+cols.map(c=>'<th scope="col">'+ctx.esc(c ? T(ctx,c) : "")+'</th>').join("")+'</tr></thead>';
function vueAptitudes(ctx){
  const E = ctx.etat, X = E.A, dr = droits(ctx), med = !!dr.sensibles;
  return (dr.medical && !dr.sensibles ? '<p class="fw-note warn">'+ctx.esc(T(ctx,"sensNote"))+'</p>' : med ? '' : '<p class="fw-note">'+ctx.esc(T(ctx,"rhNote"))+'</p>')+
    '<div class="fw-toolbar"><input type="search" id="fwmQ" data-fwmc="q" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx,"rechercher"))+'" aria-label="'+ctx.esc(T(ctx,"rechercher"))+'">'+
    '<select data-fwmc="filtre" aria-label="'+ctx.esc(T(ctx,"aptitude"))+'">'+[["","tous"],["restriction","restr"],["inapte","inaptes"],["echue","echue"]].map(([v, k])=>'<option value="'+v+'"'+(E.filtre === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select></div>'+
    (!X ? erreurOuCharge(ctx, "A") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, T(ctx,"aptitudes"), ["salarie","aptitude","prochaine"].concat(med ? [""] : []))+'<tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</td><td>'+apt(ctx, r.aptitude)+'</td><td'+(r.echue ? ' class="fwm-ko"' : '')+'>'+ctx.esc(r.prochaine ? ctx.dateAff(r.prochaine) : "—")+
        (r.planifiee ? ' <span class="fw-hint">· '+ctx.esc(T(ctx,"planifieeLe").replace("{d}", ctx.dateAff(r.planifiee)))+'</span>' : '')+'</td>'+
        (med ? '<td><button class="fw-btn sm" data-act="fwm:dossier" data-m="'+ctx.esc(r.mat)+'" aria-label="'+ctx.esc(T(ctx,"ouvrir")+" — "+(r.nom || r.mat))+'">'+ctx.esc(T(ctx,"ouvrir"))+'</button></td>' : '')+'</tr>').join("")+'</tbody></table>'+
      pager(ctx, "pageA", E.offA, X.total));
}
function vueVisites(ctx){
  const E = ctx.etat, X = E.V, dr = droits(ctx), dis = E.envoi ? ' disabled aria-busy="true"' : '';
  return (dr.planifier ? '<div class="fw-card fw-u-p fwm-form">'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwmM", ' autocomplete="off"'))+champ(ctx, T(ctx,"type"), sel(ctx, "fwmT", TYPES.map(t=>[t, T(ctx,"t_"+t)]), "periodique"))+
      champ(ctx, T(ctx,"prevue"), inp(ctx, "fwmP", ' type="date" min="'+auj()+'"', auj()))+'<button class="fw-btn pri" data-act="fwm:planifier"'+dis+'>'+ctx.esc(T(ctx,"planifierVisite"))+'</button></div>' : '<p class="fw-note">'+ctx.esc(T(ctx,"lectureNote"))+'</p>')+
    '<div class="fw-toolbar"><select data-fwmc="stV" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+[["planifiee","planifiees"],["realisee","realisees"],["annulee","annulees"]].map(([v, k])=>'<option value="'+v+'"'+(E.stV === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select></div>'+
    (!X ? erreurOuCharge(ctx, "V") : (E.stV === "planifiee" && X.compteurs ? compteurs(ctx, X.compteurs) : '')+(!X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, T(ctx,"visites"), ["salarie","type", E.stV === "realisee" ? "realisee" : "prevue", "statut", "aptitude", ""])+'<tbody>'+
      X.lignes.map(v=>'<tr><td><b>'+ctx.esc(v.nom || v.mat)+'</b> <span class="fw-hint">· '+ctx.esc(v.mat)+'</span></td><td>'+ctx.esc(T(ctx,"t_"+v.type))+'</td><td>'+ctx.esc(ctx.dateAff(v.realisee_le || v.prevue_le))+'</td>'+
        '<td>'+(E.stV === "planifiee" ? '<span class="fw-pill '+etatV(v)+'">'+ctx.esc(T(ctx,"e_"+etatV(v)))+'</span>' : ctx.esc(T(ctx, E.stV === "realisee" ? "realisees" : "annulees")))+'</td><td>'+apt(ctx, v.aptitude)+'</td>'+
        '<td><button class="fw-btn sm" data-act="fwm:dossier" data-m="'+ctx.esc(v.mat)+'" aria-label="'+ctx.esc(T(ctx,"ouvrir")+" — "+(v.nom || v.mat))+'">'+ctx.esc(T(ctx,"ouvrir"))+'</button></td></tr>').join("")+'</tbody></table>'+pager(ctx, "pageV", E.offV, X.total)));
}
/* 56.31.1 : visites en retard mises en évidence, compteurs cliquables (filtre) — correctif 40 : comptés par le serveur */
function etatV(v){ const a = auj(), d = String(v.prevue_le||""); if (!d) return "ok"; if (d < a) return "retard";
  const s = new Date(); s.setDate(s.getDate()+7); return d <= iso(s) ? "proche" : "ok"; }
function compteurs(ctx, c){ const E = ctx.etat;
  const k = (cle, ton, ico, filtre, v) => ctx.viz.kpi({v, l:T(ctx,cle), ton, ico, act:"fwm:filtreV", data:filtre});
  return '<div class="fw-vkpis">'+k("c_retard", c.retard ? "alerte" : "ok", "alerte", "retard", c.retard)+k("c_semaine", "att", "cal", "proche", c.proche)+
    k("c_mois", "info", "cal", "", c.mois)+k("c_total", "info", "medic", "", c.total)+'</div>'+
    (E.etatV ? '<p class="fw-hint">'+ctx.esc(T(ctx,"filtreActif"))+' <button class="fw-btn sm" data-act="fwm:filtreV" data-v="">'+ctx.esc(T(ctx,"tout"))+'</button></p>' : ''); }
function formResultat(ctx, pre, v, d0){
  /* d0 : valeurs actuelles (rectification) */
  const x = d0 || {};
  return champ(ctx, T(ctx,"realisee"), inp(ctx, pre+"R", ' type="date" max="'+auj()+'"', x.realisee_le || auj()))+champ(ctx, T(ctx,"aptitude"), sel(ctx, pre+"A", APT.map(a=>[a, T(ctx,"a_"+a)]), x.aptitude || "apte"))+
    champ(ctx, T(ctx,"restrictions"), inp(ctx, pre+"Re", ' maxlength="2000"', x.restrictions || ""))+champ(ctx, T(ctx,"observations"), zone(ctx, pre+"O", x.observations || ""))+
    (v.type === "pre_reprise" ? '' : champ(ctx, T(ctx,"prochaine"), inp(ctx, pre+"N", ' type="date" title="'+ctx.esc(T(ctx,"prochaineAuto"))+'"', x.prochaine_le || "")));
}
function vueDossier(ctx){
  const E = ctx.etat, D = E.D, dr = droits(ctx), dis = E.envoi ? ' disabled aria-busy="true"' : '';
  if (!D) return '<div class="fw-toolbar">'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwmDM", ' autocomplete="off"'))+'<button class="fw-btn pri" data-act="fwm:dossierM">'+ctx.esc(T(ctx,"ouvrir"))+'</button></div>';
  /* correctif 40 : visite planifiée la plus ancienne proposée en premier (avant : la plus récente) */
  const plans = D.visites.filter(v=>v.statut === "planifiee").sort((a, b)=>String(a.prevue_le).localeCompare(String(b.prevue_le))), plan = plans[0];
  const S = D.salarie, ap = D.aptitude;
  const nat = j => T(ctx, "n_"+j.nature)+(j.nature === "report" && j.avant ? " ("+ctx.dateAff(j.avant)+" "+fl(ctx, "→")+" "+ctx.dateAff(j.apres)+")" : "");
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:autre">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong id="fwmDT" tabindex="-1">'+ctx.esc(S.nom+" · "+S.mat)+'</strong><span class="fw-hint">'+ctx.esc((S.poste||"")+(S.entree ? " · "+ctx.dateAff(S.entree) : "")+(S.sortie ? " · "+T(ctx,"sorti").replace("{d}", ctx.dateAff(S.sortie)) : ""))+'</span><span class="fw-tag">'+ctx.esc(T(ctx,"trace"))+'</span></div>'+
    (D.illisible ? '<p class="fw-note warn" role="alert">'+ctx.esc(T(ctx,"illisible").replace("{n}", D.illisible))+'</p>' : '')+
    '<p class="fw-hint">'+ctx.esc(T(ctx,"aptActuelle"))+' : '+apt(ctx, ap && ap.aptitude)+(ap && ap.aptitude === "inapte" ? ' · '+ctx.esc(T(ctx,"inapteNote")) : ap && ap.prochaine ? ' · '+ctx.esc(T(ctx,"prochaine")+" "+ctx.dateAff(ap.prochaine)) : '')+'</p>'+
    (plan ? '<div class="fw-card fw-u-p fwm-form"><strong style="flex-basis:100%">'+ctx.esc(T(ctx,"t_"+plan.type)+" · "+T(ctx,"prevue")+" "+ctx.dateAff(plan.prevue_le))+(plans.length > 1 ? ' <span class="fw-hint">'+ctx.esc(T(ctx,"autresPlan").replace("{n}", plans.length - 1))+'</span>' : '')+'</strong>'+
      (dr.modifier ? formResultat(ctx, "fwm", plan)+
      '<button class="fw-btn pri" data-act="fwm:realiser" data-id="'+ctx.esc(plan.id)+'"'+dis+'>'+ctx.esc(T(ctx,"enregistrerVisite"))+'</button><button class="fw-btn" data-act="fwm:reporterO" data-id="'+ctx.esc(plan.id)+'"'+dis+'>'+ctx.esc(T(ctx,"reporter"))+'</button>'+
      '<button class="fw-btn" data-act="fwm:annuler" data-id="'+ctx.esc(plan.id)+'" data-t="'+ctx.esc(T(ctx,"t_"+plan.type))+'" data-d="'+ctx.esc(ctx.dateAff(plan.prevue_le))+'"'+dis+'>'+ctx.esc(T(ctx,"annuler"))+'</button>'+
      (E.report === plan.id ? '<div class="fwm-form" style="flex-basis:100%">'+champ(ctx, T(ctx,"nouvelleDate"), inp(ctx, "fwmRD", ' type="date" min="'+auj()+'"', plan.prevue_le))+champ(ctx, T(ctx,"motif"), inp(ctx, "fwmRM", ' maxlength="500"'))+
        '<button class="fw-btn pri" data-act="fwm:reporter" data-id="'+ctx.esc(plan.id)+'"'+dis+'>'+ctx.esc(T(ctx,"confirmerReport"))+'</button><button class="fw-btn" data-act="fwm:reporterF">'+ctx.esc(T(ctx,"fermer"))+'</button></div>' : '') : '')+'</div>' : '')+
    '<table class="fw-tbl">'+tete(ctx, T(ctx,"visites"), ["type","realisee","aptitude","restrictions","observations","prochaine", ""])+'<tbody>'+
      D.visites.filter(v=>v.statut === "realisee").map(v=>'<tr><td>'+ctx.esc(T(ctx,"t_"+v.type))+'</td><td>'+ctx.esc(ctx.dateAff(v.realisee_le))+'</td><td>'+apt(ctx, v.aptitude)+'</td><td>'+ctx.esc(v.restrictions||"—")+'</td><td>'+ctx.esc(v.observations||"—")+'</td><td>'+ctx.esc(v.prochaine_le ? ctx.dateAff(v.prochaine_le) : "—")+'</td>'+
        '<td>'+(dr.modifier ? '<button class="fw-btn sm" data-act="fwm:rectO" data-id="'+ctx.esc(v.id)+'">'+ctx.esc(T(ctx,"rectifier"))+'</button>' : '')+'</td></tr>'+
        (E.rect === v.id ? '<tr><td colspan="7"><div class="fwm-form">'+formResultat(ctx, "fwmX", v, v)+champ(ctx, T(ctx,"motifRect"), inp(ctx, "fwmXM", ' maxlength="500"'))+
          '<button class="fw-btn pri" data-act="fwm:rectifier" data-id="'+ctx.esc(v.id)+'"'+dis+'>'+ctx.esc(T(ctx,"enregistrerRect"))+'</button><button class="fw-btn" data-act="fwm:rectF">'+ctx.esc(T(ctx,"fermer"))+'</button></div></td></tr>' : '')).join("")+'</tbody></table>'+
    ((D.journal||[]).length ? '<div class="fw-sec">'+ctx.esc(T(ctx,"historique"))+'</div><table class="fw-tbl">'+tete(ctx, T(ctx,"historique"), ["", "motif", ""])+'<tbody>'+D.journal.map(j=>'<tr><td>'+ctx.esc(nat(j))+'</td><td>'+ctx.esc(j.motif || "—")+'</td><td class="fw-hint">'+ctx.esc(ctx.dateAff(String(j.le).slice(0, 10))+" · "+(j.par||""))+'</td></tr>').join("")+'</tbody></table>' : '')+
    '<div class="fw-sec">'+ctx.esc(T(ctx,"mp"))+'</div>'+(dr.declarer ? '<div class="fwm-form">'+champ(ctx, T(ctx,"declaree"), inp(ctx, "fwmMD", ' type="date" max="'+auj()+'"', auj()))+champ(ctx, T(ctx,"tableau"), inp(ctx, "fwmMT", ' maxlength="40"'))+
      champ(ctx, T(ctx,"observations"), inp(ctx, "fwmMO", ' maxlength="4000"'))+'<button class="fw-btn" data-act="fwm:mp"'+dis+'>'+ctx.esc(T(ctx,"declarer"))+'</button></div>' : '')+
    (D.maladiesPro.length ? '<table class="fw-tbl">'+tete(ctx, T(ctx,"mp"), ["declaree","tableau","statut","observations"])+'<tbody>'+D.maladiesPro.map(m=>'<tr><td>'+ctx.esc(ctx.dateAff(m.declaree_le))+'</td><td>'+ctx.esc(m.tableau||"—")+'</td><td><select data-fwmc="mpst" id="fwmS-'+ctx.esc(m.id)+'" data-id="'+ctx.esc(m.id)+'" aria-label="'+ctx.esc(T(ctx,"statut")+" — "+ctx.dateAff(m.declaree_le))+'"'+(dr.modifier && !E.envoi ? '' : ' disabled')+'>'+["declaree","reconnue","refusee"].map(s=>'<option value="'+s+'"'+(m.statut === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select></td><td>'+ctx.esc(m.observations||"")+'</td></tr>').join("")+'</tbody></table>' : '');
}
function vueParametres(ctx){
  const P = ctx.etat.par, dr = droits(ctx);
  return (!P ? erreurOuCharge(ctx, "par") : '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx,"periodicite"))+' <select data-fwmc="per"'+(dr.parametrer ? '' : ' disabled')+'>'+[6,12,24,36].map(n=>'<option value="'+n+'"'+(n === P.periodiciteMois ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mois").replace("{n}", n))+'</option>').join("")+'</select></label></div>')+
    (dr.exporter ? '<div class="fw-toolbar"><a class="fw-btn" href="api/v1/medical/export" download>'+ctx.esc(T(ctx,"exporter"))+'</a></div>' : '');
}
function focusSur(id){ setTimeout(()=>{ const x = document.getElementById(id); if (x) x.focus(); }, 80); }
function dossier(ctx, mat, focus){ return ctx.api("api/v1/medical/dossier/"+encodeURIComponent(mat)).then(j=>{ const E = ctx.etat; if (!E.D || E.D.salarie.mat !== j.salarie.mat){ E.report = E.rect = null; } E.D = j; E.onglet = "dossier"; ctx.rendre(); focusSur(focus || "fwmDT"); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Medicale",
  mount(ctx){ charger(ctx); },
  unmount(ctx){ ctx.etat.D = null; },
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = E.med ? [["visites","visites"],["dossier","dossier"],["aptitudes","aptitudes"],["parametres","parametres"]] : [["aptitudes","aptitudes"]];
    const corps = E.onglet === "visites" ? vueVisites(ctx) : E.onglet === "dossier" ? vueDossier(ctx) : E.onglet === "parametres" ? vueParametres(ctx) : vueAptitudes(ctx);
    return '<div class="fw-module fwm"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      (ong.length > 1 ? '<div class="fw-stabs" role="tablist">'+ong.map(([k, l])=>'<button type="button" role="tab" id="fwmTab-'+k+'" aria-controls="fwmPan" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>' : '')+
      '<div style="margin-top:12px" id="fwmPan"'+(ong.length > 1 ? ' role="tabpanel" aria-labelledby="fwmTab-'+E.onglet+'"' : '')+'>'+corps+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    /* f est appelée AVANT le rendu (les champs sont lus avant d'être redessinés) ; saisie vidée seulement après un succès */
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const vider = l => l.forEach(k=>{ delete E.form[k]; });
    const mat = () => E.D.salarie.mat;
    if (a === "filtreV"){ E.etatV = el.dataset.v || ""; E.offV = 0; E.V = null; return ctx.rendre(); }
    if (a === "reessayer"){ E[el.dataset.k+"Err"] = null; return ctx.rendre(); }
    if (a === "pageA" || a === "pageV"){ const k = a === "pageA" ? "offA" : "offV"; E[k] = Math.max(0, E[k] + Number(el.dataset.d)); E[a === "pageA" ? "A" : "V"] = null; return ctx.rendre(); }
    if (a === "onglet"){ E.onglet = el.dataset.o; E.V = E.A = E.par = null; E.VErr = E.AErr = E.parErr = null; ctx.rendre(); return focusSur("fwmTab-"+el.dataset.o); }
    if (a === "autre"){ E.D = null; E.report = E.rect = null; ctx.rendre(); return focusSur("fwmDM"); }
    if (a === "dossier") return dossier(ctx, el.dataset.m).catch(ko);
    if (a === "dossierM"){ const m = val("fwmDM"); if (!m) return focusSur("fwmDM"); return dossier(ctx, m).then(()=>{ delete E.form.fwmDM; }).catch(ko); }
    if (a === "planifier"){ const corps = {mat:val("fwmM"), type:val("fwmT"), prevueLe:val("fwmP")};
      return verrou(()=>ctx.api("api/v1/medical/visites", {corps}).then(()=>{ ok(); vider(["fwmM","fwmP"]); E.V = E.A = null; focusSur("fwmM"); })); }
    const resultat = pre => ({realiseeLe:val(pre+"R"), aptitude:val(pre+"A"), restrictions:val(pre+"Re"), observations:val(pre+"O"), prochaineLe:val(pre+"N")});
    if (a === "realiser"){ const corps = resultat("fwm"), idv = el.dataset.id;
      return verrou(()=>ctx.api("api/v1/medical/visites/"+encodeURIComponent(idv)+"/realiser", {corps}).then(()=>{ ok(); vider(["fwmR","fwmA","fwmRe","fwmO","fwmN"]); E.A = E.V = null; return dossier(ctx, mat()); })); }
    if (a === "reporterO"){ E.report = el.dataset.id; ctx.rendre(); return focusSur("fwmRD"); }
    if (a === "reporterF"){ E.report = null; vider(["fwmRD","fwmRM"]); return ctx.rendre(); }
    if (a === "reporter"){ const corps = {prevueLe:val("fwmRD"), motif:val("fwmRM")}, idv = el.dataset.id;
      return verrou(()=>ctx.api("api/v1/medical/visites/"+encodeURIComponent(idv)+"/reporter", {corps}).then(()=>{ ok(); E.report = null; vider(["fwmRD","fwmRM"]); E.V = E.A = null; return dossier(ctx, mat()); })); }
    if (a === "annuler"){ const idv = el.dataset.id;
      return ctx.confirmer({titre:T(ctx,"annuler"), message:T(ctx,"annulerQ").replace("{t}", el.dataset.t || "").replace("{d}", el.dataset.d || ""), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif"), danger:true}).then(r=>{ if (!r.ok) return;
        return verrou(()=>ctx.api("api/v1/medical/visites/"+encodeURIComponent(idv)+"/annuler", {corps:{motif:r.motif || ""}}).then(()=>{ ok(); E.V = E.A = null; return dossier(ctx, mat()); })); }); }
    if (a === "rectO"){ E.rect = el.dataset.id; vider(["fwmXR","fwmXA","fwmXRe","fwmXO","fwmXN","fwmXM"]); ctx.rendre(); return focusSur("fwmXR"); }
    if (a === "rectF"){ E.rect = null; vider(["fwmXR","fwmXA","fwmXRe","fwmXO","fwmXN","fwmXM"]); return ctx.rendre(); }
    if (a === "rectifier"){ const corps = Object.assign(resultat("fwmX"), {motif:val("fwmXM")}), idv = el.dataset.id;
      return verrou(()=>ctx.api("api/v1/medical/visites/"+encodeURIComponent(idv)+"/rectifier", {corps}).then(()=>{ ok(); E.rect = null; vider(["fwmXR","fwmXA","fwmXRe","fwmXO","fwmXN","fwmXM"]); E.A = E.V = null; return dossier(ctx, mat()); })); }
    if (a === "mp"){ const corps = {mat:mat(), declareeLe:val("fwmMD"), tableau:val("fwmMT"), observations:val("fwmMO")};
      return verrou(()=>ctx.api("api/v1/medical/maladies-pro", {corps}).then(()=>{ ok(); vider(["fwmMD","fwmMT","fwmMO"]); return dossier(ctx, mat(), "fwmMT"); })); }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.value; return; }
    if (k === "q" || k === "filtre"){ E[k] = el.value.trim(); E.offA = 0; E.A = null; E.AErr = null; ctx.rendre(); return k === "q" ? focusSur("fwmQ") : undefined; }
    if (k === "stV"){ E.stV = el.value; E.offV = 0; E.etatV = ""; E.V = null; E.VErr = null; return ctx.rendre(); }
    if (k === "per") return ctx.api("api/v1/medical/parametres", {corps:{periodiciteMois:Number(el.value)}}).then(()=>{ ctx.flash(T(ctx,"enregistre"), "ok"); E.par = null; E.A = null; ctx.rendre(); }).catch(e=>{ ctx.flash(msgErr(ctx, e), "err"); E.par = null; ctx.rendre(); });
    if (k === "mpst"){ if (E.envoi) return; const f = el.id; E.envoi = true;
      return ctx.api("api/v1/medical/maladies-pro/"+encodeURIComponent(el.dataset.id)+"/statut", {corps:{statut:el.value}}).then(()=>ctx.flash(T(ctx,"enregistre"), "ok")).catch(e=>ctx.flash(msgErr(ctx, e), "err")).then(()=>{ E.envoi = false; return dossier(ctx, E.D.salarie.mat, f); }); }
  }
});
})();
