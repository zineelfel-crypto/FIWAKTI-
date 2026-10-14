/* FW-Medicale — interface chargée à la demande. Service médical : visites, dossier (consultation tracée), maladies
   professionnelles, export. RH et responsables : aptitude et prochaine visite uniquement. */
(function(){
"use strict";
const L = {
  fr:{statut:"Statut", e_retard:"En retard", e_proche:"Cette semaine", e_ok:"À venir", c_retard:"Visites en retard", c_semaine:"Dans les 7 jours", c_mois:"Ce mois-ci", c_total:"Planifiées", filtreActif:"Filtre actif.", tout:"Tout afficher", titre:"Suivi médical", lede:"Visites d'embauche, périodiques et de reprise, aptitudes, maladies professionnelles. Le détail médical est réservé au service médical ; chaque consultation est tracée.",
    rhNote:"Vous voyez uniquement l'aptitude et la date de la prochaine visite : le détail médical est réservé au service médical.",
    visites:"Visites", planifier:"Planifier", dossier:"Dossier médical", aptitudes:"Aptitudes", parametres:"Paramètres", planifiees:"Planifiées", realisees:"Réalisées", annulees:"Annulées",
    matricule:"Matricule", salarie:"Salarié", type:"Type", t_embauche:"Embauche", t_periodique:"Périodique", t_reprise:"Reprise", t_pre_reprise:"Pré-reprise", t_demande:"À la demande",
    prevue:"Prévue le", realisee:"Réalisée le", aptitude:"Aptitude", a_apte:"Apte", a_apte_restriction:"Apte avec restriction", a_inapte:"Inapte", prochaine:"Prochaine visite",
    restrictions:"Restrictions", observations:"Observations (confidentielles)", enregistrerVisite:"Enregistrer la visite", annuler:"Annuler", ouvrir:"Ouvrir le dossier", planifierVisite:"Planifier la visite",
    mp:"Maladies professionnelles", declarer:"Déclarer", tableau:"Tableau", declaree:"Déclarée le", statut:"Statut", s_declaree:"Déclarée", s_reconnue:"Reconnue", s_refusee:"Refusée",
    periodicite:"Périodicité des visites périodiques", mois:"{n} mois", exporter:"Exporter le suivi (CSV, tracé)", rechercher:"Matricule ou nom…", tous:"Tous", restr:"Avec restriction ou inapte", echue:"Visite échue ou absente",
    aucune:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}", trace:"Consultation enregistrée dans le journal d'audit."},
  en:{statut:"Status", e_retard:"Overdue", e_proche:"This week", e_ok:"Upcoming", c_retard:"Overdue visits", c_semaine:"Within 7 days", c_mois:"This month", c_total:"Planned", filtreActif:"Filter on.", tout:"Show all", titre:"Medical follow-up", lede:"Pre-employment, periodic and return-to-work visits, fitness, occupational diseases. Medical details are restricted to the medical service; every access is logged.",
    rhNote:"You only see fitness status and next visit date: medical details are restricted to the medical service.",
    visites:"Visits", planifier:"Schedule", dossier:"Medical file", aptitudes:"Fitness", parametres:"Settings", planifiees:"Scheduled", realisees:"Done", annulees:"Cancelled",
    matricule:"Employee ID", salarie:"Employee", type:"Type", t_embauche:"Pre-employment", t_periodique:"Periodic", t_reprise:"Return to work", t_pre_reprise:"Pre-return", t_demande:"On request",
    prevue:"Planned", realisee:"Done on", aptitude:"Fitness", a_apte:"Fit", a_apte_restriction:"Fit with restrictions", a_inapte:"Unfit", prochaine:"Next visit",
    restrictions:"Restrictions", observations:"Notes (confidential)", enregistrerVisite:"Record visit", annuler:"Cancel", ouvrir:"Open file", planifierVisite:"Schedule visit",
    mp:"Occupational diseases", declarer:"Declare", tableau:"Table", declaree:"Declared on", statut:"Status", s_declaree:"Declared", s_reconnue:"Recognised", s_refusee:"Refused",
    periodicite:"Periodic visit interval", mois:"{n} months", exporter:"Export (CSV, logged)", rechercher:"ID or name…", tous:"All", restr:"With restrictions or unfit", echue:"Visit overdue or missing",
    aucune:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}", trace:"Access recorded in the audit log."},
  ar:{statut:"الحالة", e_retard:"متأخرة", e_proche:"هذا الأسبوع", e_ok:"قادمة", c_retard:"زيارات متأخرة", c_semaine:"خلال 7 أيام", c_mois:"هذا الشهر", c_total:"مبرمجة", filtreActif:"تصفية مفعلة.", tout:"عرض الكل", titre:"المتابعة الطبية", lede:"زيارات الانتداب والدورية والاستئناف، الأهلية، الأمراض المهنية. التفاصيل الطبية حكر على المصلحة الطبية وكل اطلاع مسجل.",
    rhNote:"ترى فقط الأهلية وتاريخ الزيارة القادمة: التفاصيل الطبية حكر على المصلحة الطبية.",
    visites:"الزيارات", planifier:"برمجة", dossier:"الملف الطبي", aptitudes:"الأهلية", parametres:"الإعدادات", planifiees:"مبرمجة", realisees:"منجزة", annulees:"ملغاة",
    matricule:"المعرف", salarie:"الأجير", type:"النوع", t_embauche:"انتداب", t_periodique:"دورية", t_reprise:"استئناف", t_pre_reprise:"ما قبل الاستئناف", t_demande:"بطلب",
    prevue:"مبرمجة في", realisee:"أنجزت في", aptitude:"الأهلية", a_apte:"أهل", a_apte_restriction:"أهل مع قيود", a_inapte:"غير أهل", prochaine:"الزيارة القادمة",
    restrictions:"القيود", observations:"ملاحظات (سرية)", enregistrerVisite:"تسجيل الزيارة", annuler:"إلغاء", ouvrir:"فتح الملف", planifierVisite:"برمجة الزيارة",
    mp:"الأمراض المهنية", declarer:"تصريح", tableau:"الجدول", declaree:"تاريخ التصريح", statut:"الحالة", s_declaree:"مصرح بها", s_reconnue:"معترف بها", s_refusee:"مرفوضة",
    periodicite:"دورية الزيارات", mois:"{n} أشهر", exporter:"تصدير (مسجل)", rechercher:"المعرف أو الاسم…", tous:"الكل", restr:"مع قيود أو غير أهل", echue:"زيارة متأخرة أو غائبة",
    aucune:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}", trace:"سجل الاطلاع في سجل التدقيق."}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const champ = (ctx, l, h) => '<label class="fwm-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
const auj = () => new Date().toISOString().slice(0, 10);
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"aptitudes", A:null, q:"", filtre:"", V:null, stV:"planifiee", D:null, par:null, med:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false; if (k === "A" && E.med === null){ E.med = !!j.roleMedical; if (E.med) E.onglet = "visites"; } ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; ctx.flash(e.message, "err"); }); } };
  get("A", "api/v1/medical/aptitudes?limit=100&q="+encodeURIComponent(E.q)+"&filtre="+E.filtre);
  if (E.med && E.onglet === "visites") get("V", "api/v1/medical/visites?limit=100&statut="+E.stV);
  if (E.med && E.onglet === "parametres") get("par", "api/v1/medical/parametres");
}
const apt = (ctx, a) => a ? '<span class="fwm-a fwm-'+a+'">'+ctx.esc(T(ctx,"a_"+a))+'</span>' : '—';
function vueAptitudes(ctx){
  const E = ctx.etat, X = E.A;
  return (E.med ? '' : '<p class="fw-note">'+ctx.esc(T(ctx,"rhNote"))+'</p>')+
    '<div class="fw-toolbar"><input type="search" data-fwmc="q" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx,"rechercher"))+'" aria-label="'+ctx.esc(T(ctx,"rechercher"))+'">'+
    '<select data-fwmc="filtre"><option value="">'+ctx.esc(T(ctx,"tous"))+'</option><option value="restriction"'+(E.filtre === "restriction" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"restr"))+'</option><option value="echue"'+(E.filtre === "echue" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"echue"))+'</option></select></div>'+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"salarie"))+'</th><th>'+ctx.esc(T(ctx,"aptitude"))+'</th><th>'+ctx.esc(T(ctx,"prochaine"))+'</th>'+(E.med ? '<th></th>' : '')+'</tr></thead><tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</td><td>'+apt(ctx, r.aptitude)+'</td><td'+(!r.prochaine || r.prochaine <= auj() ? ' class="fwm-ko"' : '')+'>'+ctx.esc(r.prochaine ? ctx.dateAff(r.prochaine) : "—")+'</td>'+
        (E.med ? '<td><button class="fw-btn sm" data-act="fwm:dossier" data-m="'+ctx.esc(r.mat)+'">'+ctx.esc(T(ctx,"ouvrir"))+'</button></td>' : '')+'</tr>').join("")+'</tbody></table>'+
      (X.total > X.lignes.length ? '<p class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", 1).replace("{b}", X.lignes.length).replace("{n}", X.total))+'</p>' : ''));
}
function vueVisites(ctx){
  const E = ctx.etat, X = E.V;
  return '<div class="fw-card fw-u-p fwm-form">'+champ(ctx, T(ctx,"matricule"), '<input id="fwmM">')+champ(ctx, T(ctx,"type"), '<select id="fwmT">'+["embauche","periodique","reprise","pre_reprise","demande"].map(t=>'<option value="'+t+'">'+ctx.esc(T(ctx,"t_"+t))+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"prevue"), '<input id="fwmP" type="date" value="'+auj()+'">')+'<button class="fw-btn pri" data-act="fwm:planifier">'+ctx.esc(T(ctx,"planifierVisite"))+'</button></div>'+
    '<div class="fw-toolbar"><select data-fwmc="stV">'+[["planifiee","planifiees"],["realisee","realisees"],["annulee","annulees"]].map(([v, k])=>'<option value="'+v+'"'+(E.stV === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select></div>'+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    (E.stV === "planifiee" ? compteurs(ctx, X.lignes) : '')+
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"salarie"))+'</th><th>'+ctx.esc(T(ctx,"type"))+'</th><th>'+ctx.esc(T(ctx,E.stV === "realisee" ? "realisee" : "prevue"))+'</th><th>'+ctx.esc(T(ctx,"statut"))+'</th><th>'+ctx.esc(T(ctx,"aptitude"))+'</th><th></th></tr></thead><tbody>'+
      X.lignes.filter(v=>!E.filtreV || etatV(v) === E.filtreV).map(v=>'<tr><td><b>'+ctx.esc(v.nom || v.mat)+'</b> <span class="fw-hint">· '+ctx.esc(v.mat)+'</span></td><td>'+ctx.esc(T(ctx,"t_"+v.type))+'</td><td>'+ctx.esc(ctx.dateAff(v.realisee_le || v.prevue_le))+'</td>'+
        '<td>'+(E.stV === "planifiee" ? '<span class="fw-pill '+etatV(v)+'">'+ctx.esc(T(ctx,"e_"+etatV(v)))+'</span>' : '')+'</td><td>'+apt(ctx, v.aptitude)+'</td>'+
        '<td><button class="fw-btn sm" data-act="fwm:dossier" data-m="'+ctx.esc(v.mat)+'">'+ctx.esc(T(ctx,"ouvrir"))+'</button></td></tr>').join("")+'</tbody></table>');
}
/* 56.31.1 : visites en retard mises en évidence, compteurs cliquables (filtre) */
function etatV(v){ const a = auj(), d = String(v.prevue_le||""); if (!d) return "ok"; if (d < a) return "retard";
  const s = new Date(); s.setDate(s.getDate()+7); const s7 = s.toISOString().slice(0, 10); return d <= s7 ? "proche" : "ok"; }
function compteurs(ctx, l){ const n = k => l.filter(v=>etatV(v) === k).length, m = auj().slice(0, 7), E = ctx.etat;
  const k = (cle, ton, ico, filtre, v) => ctx.viz.kpi({v, l:T(ctx,cle), ton, ico, act:"fwm:filtreV", data:filtre});
  return '<div class="fw-vkpis">'+k("c_retard", n("retard") ? "alerte" : "ok", "alerte", "retard", n("retard"))+k("c_semaine", "att", "cal", "proche", n("proche"))+
    k("c_mois", "info", "cal", "", l.filter(v=>String(v.prevue_le||"").slice(0, 7) === m).length)+k("c_total", "info", "medic", "", l.length)+'</div>'+
    (E.filtreV ? '<p class="fw-hint">'+ctx.esc(T(ctx,"filtreActif"))+' <button class="fw-btn sm" data-act="fwm:filtreV" data-v="">'+ctx.esc(T(ctx,"tout"))+'</button></p>' : ''); }
function vueDossier(ctx){
  const E = ctx.etat, D = E.D;
  if (!D) return '<div class="fw-toolbar"><input id="fwmDM" placeholder="'+ctx.esc(T(ctx,"matricule"))+'"><button class="fw-btn pri" data-act="fwm:dossierM">'+ctx.esc(T(ctx,"ouvrir"))+'</button></div>';
  const plan = D.visites.find(v=>v.statut === "planifiee");
  return '<div class="fw-toolbar"><strong>'+ctx.esc(D.salarie.nom+" · "+D.salarie.mat)+'</strong><span class="fw-hint">'+ctx.esc((D.salarie.poste||"")+(D.salarie.entree ? " · "+ctx.dateAff(D.salarie.entree) : ""))+'</span><span class="fw-tag">'+ctx.esc(T(ctx,"trace"))+'</span></div>'+
    (plan ? '<div class="fw-card fw-u-p fwm-form"><strong style="flex-basis:100%">'+ctx.esc(T(ctx,"t_"+plan.type)+" · "+T(ctx,"prevue")+" "+ctx.dateAff(plan.prevue_le))+'</strong>'+
      champ(ctx, T(ctx,"realisee"), '<input id="fwmR" type="date" value="'+auj()+'">')+champ(ctx, T(ctx,"aptitude"), '<select id="fwmA">'+["apte","apte_restriction","inapte"].map(a=>'<option value="'+a+'">'+ctx.esc(T(ctx,"a_"+a))+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"restrictions"), '<input id="fwmRe">')+champ(ctx, T(ctx,"observations"), '<textarea id="fwmO" rows="2"></textarea>')+champ(ctx, T(ctx,"prochaine"), '<input id="fwmN" type="date">')+
      '<button class="fw-btn pri" data-act="fwm:realiser" data-id="'+ctx.esc(plan.id)+'">'+ctx.esc(T(ctx,"enregistrerVisite"))+'</button><button class="fw-btn" data-act="fwm:annuler" data-id="'+ctx.esc(plan.id)+'">'+ctx.esc(T(ctx,"annuler"))+'</button></div>' : '')+
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"type"))+'</th><th>'+ctx.esc(T(ctx,"realisee"))+'</th><th>'+ctx.esc(T(ctx,"aptitude"))+'</th><th>'+ctx.esc(T(ctx,"restrictions"))+'</th><th>'+ctx.esc(T(ctx,"observations"))+'</th><th>'+ctx.esc(T(ctx,"prochaine"))+'</th></tr></thead><tbody>'+
      D.visites.filter(v=>v.statut === "realisee").map(v=>'<tr><td>'+ctx.esc(T(ctx,"t_"+v.type))+'</td><td>'+ctx.esc(ctx.dateAff(v.realisee_le))+'</td><td>'+apt(ctx, v.aptitude)+'</td><td>'+ctx.esc(v.restrictions||"—")+'</td><td>'+ctx.esc(v.observations||"—")+'</td><td>'+ctx.esc(v.prochaine_le ? ctx.dateAff(v.prochaine_le) : "—")+'</td></tr>').join("")+'</tbody></table>'+
    '<div class="fw-sec">'+ctx.esc(T(ctx,"mp"))+'</div><div class="fwm-form">'+champ(ctx, T(ctx,"declaree"), '<input id="fwmMD" type="date" value="'+auj()+'">')+champ(ctx, T(ctx,"tableau"), '<input id="fwmMT">')+
      champ(ctx, T(ctx,"observations"), '<input id="fwmMO">')+'<button class="fw-btn" data-act="fwm:mp">'+ctx.esc(T(ctx,"declarer"))+'</button></div>'+
    (D.maladiesPro.length ? '<table class="fw-tbl"><tbody>'+D.maladiesPro.map(m=>'<tr><td>'+ctx.esc(ctx.dateAff(m.declaree_le))+'</td><td>'+ctx.esc(m.tableau||"—")+'</td><td><select data-fwmc="mpst" data-id="'+ctx.esc(m.id)+'" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+["declaree","reconnue","refusee"].map(s=>'<option value="'+s+'"'+(m.statut === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select></td><td>'+ctx.esc(m.observations||"")+'</td></tr>').join("")+'</tbody></table>' : '');
}
function vueParametres(ctx){
  const P = ctx.etat.par;
  return (P ? '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx,"periodicite"))+' <select data-fwmc="per">'+[6,12,24,36].map(n=>'<option value="'+n+'"'+(n === P.periodiciteMois ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mois").replace("{n}", n))+'</option>').join("")+'</select></label></div>' : '')+
    '<div class="fw-toolbar"><a class="fw-btn" href="api/v1/medical/export">'+ctx.esc(T(ctx,"exporter"))+'</a></div>';
}
function dossier(ctx, mat){ return ctx.api("api/v1/medical/dossier/"+encodeURIComponent(mat)).then(j=>{ ctx.etat.D = j; ctx.etat.onglet = "dossier"; ctx.rendre(); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Medicale",
  mount(ctx){ charger(ctx); },
  unmount(ctx){ ctx.etat.D = null; },
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = E.med ? [["visites","visites"],["dossier","dossier"],["aptitudes","aptitudes"],["parametres","parametres"]] : [["aptitudes","aptitudes"]];
    const corps = E.onglet === "visites" ? vueVisites(ctx) : E.onglet === "dossier" ? vueDossier(ctx) : E.onglet === "parametres" ? vueParametres(ctx) : vueAptitudes(ctx);
    return '<div class="fw-module fwm"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      (ong.length > 1 ? '<div class="fw-stabs" role="tablist">'+ong.map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>' : '')+
      '<div style="margin-top:12px">'+corps+'</div></div>';
  },
  action(a, el, ctx){
    if (a === "filtreV"){ ctx.etat.filtreV = el.dataset.v || ""; return ctx.rendre(); }
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(e.message, "err");
    if (a === "onglet"){ E.onglet = el.dataset.o; if (E.onglet !== "dossier") E.D = null; E.V = E.A = E.par = null; return ctx.rendre(); }
    if (a === "dossier") return dossier(ctx, el.dataset.m).catch(ko);
    if (a === "dossierM") return dossier(ctx, val("fwmDM")).catch(ko);
    if (a === "planifier") return ctx.api("api/v1/medical/visites", {corps:{mat:val("fwmM"), type:val("fwmT"), prevueLe:val("fwmP")}}).then(()=>{ ok(); E.V = null; ctx.rendre(); }).catch(ko);
    if (a === "realiser") return ctx.api("api/v1/medical/visites/"+encodeURIComponent(el.dataset.id)+"/realiser", {corps:{realiseeLe:val("fwmR"), aptitude:val("fwmA"), restrictions:val("fwmRe"), observations:val("fwmO"), prochaineLe:val("fwmN")}})
      .then(()=>{ ok(); E.A = null; return dossier(ctx, E.D.salarie.mat); }).catch(ko);
    if (a === "annuler") return ctx.api("api/v1/medical/visites/"+encodeURIComponent(el.dataset.id)+"/annuler", {corps:{}}).then(()=>dossier(ctx, E.D.salarie.mat)).catch(ko);
    if (a === "mp") return ctx.api("api/v1/medical/maladies-pro", {corps:{mat:E.D.salarie.mat, declareeLe:val("fwmMD"), tableau:val("fwmMT"), observations:val("fwmMO")}}).then(()=>{ ok(); return dossier(ctx, E.D.salarie.mat); }).catch(ko);
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "q" || k === "filtre"){ E[k] = el.value.trim(); E.A = null; return ctx.rendre(); }
    if (k === "stV"){ E.stV = el.value; E.V = null; return ctx.rendre(); }
    if (k === "per") return ctx.api("api/v1/medical/parametres", {corps:{periodiciteMois:Number(el.value)}}).then(()=>{ ctx.flash(T(ctx,"enregistre"), "ok"); E.par = null; ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err"));
    if (k === "mpst") return ctx.api("api/v1/medical/maladies-pro/"+encodeURIComponent(el.dataset.id)+"/statut", {corps:{statut:el.value}}).then(()=>dossier(ctx, E.D.salarie.mat)).catch(e=>ctx.flash(e.message, "err"));
  }
});
})();
