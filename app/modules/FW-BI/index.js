/* FW-BI — pilotage transverse, chargé à la demande : indicateurs agrégés de tous les modules accordés, filtres serveur. */
(function(){
"use strict";
const L = {
  fr:{vsPrec:"Tendances comparées à la période précédente de même durée.", chargementPrec:"Calcul des tendances…", vCartes:"Tableau", vGraphes:"Graphiques", personnaliser:"Personnaliser", persoAide:"Cochez les indicateurs à afficher, réglez leur ordre et fixez un objectif : la carte passe au vert ou au rouge selon l'objectif.", objectif:"Objectif", monter:"Monter", descendre:"Descendre", persoReinit:"Revenir aux indicateurs par défaut", termine:"Terminé", effectifs:"Effectifs", temps:"Temps et présence", medical:"Suivi médical", perAJour:"Visites périodiques à jour", perio:"périodicité {n} mois", perRealisees:"Visites périodiques réalisées", embVisite:"Visites d'embauche réalisées", embauchesP:"embauche(s) sur la période", mpDecl:"Maladies professionnelles déclarées", reconnues:"reconnue(s)", effectif:"Effectif", masque:"Masqué (moins de {n} salariés)", medNote:"Indicateurs agrégés seulement, aucun détail médical ; un service de moins de {n} salariés est masqué pour éviter toute identification.", titre:"Pilotage transverse", lede:"Indicateurs consolidés des modules actifs, calculés par le serveur sur votre périmètre (aucune liste nominative, aucun détail médical : seulement des taux par service).",
    periode:"Période", p30:"30 derniers jours", p90:"3 derniers mois", p365:"12 derniers mois", site:"Site", service:"Service", fonction:"Fonction", tous:"Tous", actualiser:"Actualiser",
    effectifs:"Effectifs", actifs:"Salariés actifs", entrees:"Entrées", sorties:"Sorties", temps:"Temps et présence", tauxPresence:"Taux de présence", heuresSup:"Heures supplémentaires",
    absenteisme:"Taux d'absentéisme", joursRetard:"Jours avec retard", competences:"Compétences", couverture:"Couverture des niveaux requis", enEcart:"Salariés en écart",
    formation:"Formation", participations:"Participations", heures:"Heures de formation", reussite:"Taux de réussite", besoins:"Besoins ouverts", habValides:"Habilitations valides", habExpirees:"Habilitations expirées",
    evaluation:"Évaluations", realisation:"Taux de réalisation", noteMoyenne:"Note moyenne", hse:"Santé et sécurité", accidents:"Accidents", avecArret:"avec arrêt", tf:"Taux de fréquence", tg:"Taux de gravité", presque:"Presque-accidents",
    recrutement:"Recrutement", postes:"Postes ouverts", candidatures:"Candidatures", embauches:"Embauches", mois:"Mois", sources:"Sources : {s}", calcule:"Calculé en {n} ms", cache:"depuis le cache (5 min)",
    exporter:"Exporter (CSV)", chargement:"Calcul en cours…"},
  en:{vsPrec:"Trends compared with the previous period of the same length.", chargementPrec:"Computing trends…", vCartes:"Table", vGraphes:"Charts", personnaliser:"Customise", persoAide:"Tick the indicators to show, set their order and a target: the card turns green or red against the target.", objectif:"Target", monter:"Move up", descendre:"Move down", persoReinit:"Back to default indicators", termine:"Done", effectifs:"Headcount", temps:"Time and attendance", medical:"Medical follow-up", perAJour:"Periodic visits up to date", perio:"interval {n} months", perRealisees:"Periodic visits done", embVisite:"Pre-employment visits done", embauchesP:"hire(s) in period", mpDecl:"Occupational diseases declared", reconnues:"recognised", effectif:"Headcount", masque:"Hidden (fewer than {n} employees)", medNote:"Aggregated indicators only, no medical details; departments under {n} employees are hidden to prevent identification.", titre:"Cross-module dashboard", lede:"Consolidated indicators from active modules, computed by the server on your scope (no individual lists, no medical details: only rates per department).",
    periode:"Period", p30:"Last 30 days", p90:"Last 3 months", p365:"Last 12 months", site:"Site", service:"Department", fonction:"Job", tous:"All", actualiser:"Refresh",
    effectifs:"Headcount", actifs:"Active employees", entrees:"Hires", sorties:"Leavers", temps:"Time and attendance", tauxPresence:"Attendance rate", heuresSup:"Overtime hours",
    absenteisme:"Absenteeism rate", joursRetard:"Days late", competences:"Skills", couverture:"Required levels met", enEcart:"Employees with gaps",
    formation:"Training", participations:"Participations", heures:"Training hours", reussite:"Pass rate", besoins:"Open needs", habValides:"Valid authorisations", habExpirees:"Expired authorisations",
    evaluation:"Evaluations", realisation:"Completion rate", noteMoyenne:"Average score", hse:"Health and safety", accidents:"Accidents", avecArret:"with lost time", tf:"Frequency rate", tg:"Severity rate", presque:"Near misses",
    recrutement:"Recruitment", postes:"Open positions", candidatures:"Applications", embauches:"Hires (recruitment)", mois:"Month", sources:"Sources: {s}", calcule:"Computed in {n} ms", cache:"from cache (5 min)",
    exporter:"Export (CSV)", chargement:"Computing…"},
  ar:{vsPrec:"الاتجاهات مقارنة بالفترة السابقة من نفس المدة.", chargementPrec:"جارٍ حساب الاتجاهات…", vCartes:"جدول", vGraphes:"رسوم بيانية", personnaliser:"تخصيص", persoAide:"اختاروا المؤشرات المعروضة وترتيبها وحددوا هدفا: تصبح البطاقة خضراء أو حمراء حسب الهدف.", objectif:"الهدف", monter:"إلى الأعلى", descendre:"إلى الأسفل", persoReinit:"العودة إلى المؤشرات الافتراضية", termine:"تم", effectifs:"التعداد", temps:"الوقت والحضور", medical:"المتابعة الطبية", perAJour:"الزيارات الدورية المحينة", perio:"دورية {n} أشهر", perRealisees:"الزيارات الدورية المنجزة", embVisite:"زيارات الانتداب المنجزة", embauchesP:"انتداب في الفترة", mpDecl:"الأمراض المهنية المصرح بها", reconnues:"معترف بها", effectif:"العدد", masque:"مخفي (أقل من {n} أجراء)", medNote:"مؤشرات مجمعة فقط دون تفاصيل طبية؛ تخفى المصالح التي تضم أقل من {n} أجراء.", titre:"القيادة الشاملة", lede:"مؤشرات موحدة للوحدات المفعلة، يحسبها الخادم على نطاقك (دون قوائم اسمية ودون تفاصيل طبية).",
    periode:"الفترة", p30:"آخر 30 يوما", p90:"آخر 3 أشهر", p365:"آخر 12 شهرا", site:"الموقع", service:"المصلحة", fonction:"الوظيفة", tous:"الكل", actualiser:"تحديث",
    effectifs:"الأعداد", actifs:"الأجراء النشطون", entrees:"الالتحاقات", sorties:"المغادرات", temps:"الوقت والحضور", tauxPresence:"نسبة الحضور", heuresSup:"الساعات الإضافية",
    absenteisme:"نسبة الغياب", joursRetard:"أيام التأخير", competences:"الكفاءات", couverture:"تغطية المستويات المطلوبة", enEcart:"أجراء بفارق",
    formation:"التكوين", participations:"المشاركات", heures:"ساعات التكوين", reussite:"نسبة النجاح", besoins:"حاجيات مفتوحة", habValides:"تأهيلات صالحة", habExpirees:"تأهيلات منتهية",
    evaluation:"التقييمات", realisation:"نسبة الإنجاز", noteMoyenne:"المعدل", hse:"الصحة والسلامة", accidents:"الحوادث", avecArret:"مع توقف", tf:"معدل التواتر", tg:"معدل الخطورة", presque:"حوادث وشيكة",
    recrutement:"الانتداب", postes:"مناصب مفتوحة", candidatures:"الترشحات", embauches:"الانتدابات", mois:"الشهر", sources:"المصادر: {s}", calcule:"حسب في {n} م.ث", cache:"من الذاكرة المؤقتة",
    exporter:"تصدير (CSV)", chargement:"جار الحساب…"}
};
/* 56.33.11 : périodes, ventilation, nouveaux domaines, objectifs partagés */
Object.assign(L.fr, {pMois:"Mois en cours", pMoisPrec:"Mois précédent", pAnnee:"Année en cours", pPerso:"Dates choisies", du:"Du", au:"Au",
  ferTrav:"Jours fériés travaillés", hFer:"Heures les jours fériés", repTrav:"Jours de repos travaillés", hRep:"Heures les jours de repos", oublis:"Oublis de badgeage", anomalies:"Journées en anomalie",
  absences:"Absences par type", absTotal:"Jours d'absence saisis", jours:"Jours", type:"Type",
  visiteurs:"Visiteurs", visites:"Visites prévues", visReal:"Visites réalisées", visAnn:"Visites annulées", visEnt:"Entreprises reçues",
  integration:"Intégration", parcours:"Parcours en cours", tachesRetard:"Tâches en retard", tachesTemps:"Tâches faites à temps",
  biometrie:"Règles biométriques", bloques:"Salariés bloqués (absence)", retraitsAtt:"Retraits en attente", retraitsEch:"Retraits en échec",
  ventilation:"Comparer par", vSite:"Site", vDept:"Service", vFonction:"Fonction", effectif:"Effectif", groupe:"Groupe", plusGroupes:"{n} groupes au total : les 300 plus grands sont affichés.",
  partage:"Enregistrer pour tous les utilisateurs", partageOk:"Objectifs et indicateurs enregistrés pour tous les utilisateurs.", objEntreprise:"Objectif de l'entreprise : {v}",
  cache:"depuis le cache (30 min)", termine:L.fr.termine||"Terminé"});
Object.assign(L.en, {pMois:"This month", pMoisPrec:"Last month", pAnnee:"Year to date", pPerso:"Custom dates", du:"From", au:"To",
  ferTrav:"Public holidays worked", hFer:"Hours on public holidays", repTrav:"Rest days worked", hRep:"Hours on rest days", oublis:"Missed clockings", anomalies:"Days with anomalies",
  absences:"Absences by type", absTotal:"Absence days recorded", jours:"Days", type:"Type",
  visiteurs:"Visitors", visites:"Planned visits", visReal:"Visits held", visAnn:"Cancelled visits", visEnt:"Companies received",
  integration:"Onboarding", parcours:"Onboarding in progress", tachesRetard:"Overdue tasks", tachesTemps:"Tasks done on time",
  biometrie:"Biometric rules", bloques:"Employees blocked (absence)", retraitsAtt:"Pending removals", retraitsEch:"Failed removals",
  ventilation:"Compare by", vSite:"Site", vDept:"Department", vFonction:"Job", effectif:"Headcount", groupe:"Group", plusGroupes:"{n} groups in total: the 300 largest are shown.",
  partage:"Save for all users", partageOk:"Targets and indicators saved for all users.", objEntreprise:"Company target: {v}",
  cache:"from cache (30 min)", termine:L.en.termine||"Done"});
Object.assign(L.ar, {pMois:"الشهر الحالي", pMoisPrec:"الشهر السابق", pAnnee:"السنة الحالية", pPerso:"تواريخ مختارة", du:"من", au:"إلى",
  ferTrav:"أيام عطل مشتغلة", hFer:"ساعات أيام العطل", repTrav:"أيام راحة مشتغلة", hRep:"ساعات أيام الراحة", oublis:"تسجيلات منسية", anomalies:"أيام بها خلل",
  absences:"الغيابات حسب النوع", absTotal:"أيام الغياب المسجلة", jours:"الأيام", type:"النوع",
  visiteurs:"الزوار", visites:"زيارات مبرمجة", visReal:"زيارات منجزة", visAnn:"زيارات ملغاة", visEnt:"شركات مستقبلة",
  integration:"الإدماج", parcours:"مسارات جارية", tachesRetard:"مهام متأخرة", tachesTemps:"مهام منجزة في الوقت",
  biometrie:"قواعد البيومترية", bloques:"أجراء محجوبون (غياب)", retraitsAtt:"عمليات حذف معلقة", retraitsEch:"عمليات حذف فاشلة",
  ventilation:"المقارنة حسب", vSite:"الموقع", vDept:"المصلحة", vFonction:"الوظيفة", effectif:"العدد", groupe:"المجموعة", plusGroupes:"{n} مجموعة في المجموع: تُعرض أكبر 300.",
  partage:"حفظ لجميع المستخدمين", partageOk:"تم حفظ الأهداف والمؤشرات لجميع المستخدمين.", objEntreprise:"هدف المؤسسة: {v}",
  cache:"من الذاكرة المؤقتة (30 د)", termine:L.ar.termine||"تم"});
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const jour = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0");
/* bornes de la période choisie et de la période précédente de même durée */
function bornes(E){ const a = new Date(); let du, au = iso(a);
  if (E.per === "mois") du = iso(new Date(a.getFullYear(), a.getMonth(), 1));
  else if (E.per === "moisPrec"){ du = iso(new Date(a.getFullYear(), a.getMonth()-1, 1)); au = iso(new Date(a.getFullYear(), a.getMonth(), 0)); }
  else if (E.per === "annee") du = iso(new Date(a.getFullYear(), 0, 1));
  else if (E.per === "perso"){ du = /^\d{4}-\d{2}-\d{2}$/.test(E.du||"") ? E.du : jour(29); au = /^\d{4}-\d{2}-\d{2}$/.test(E.au||"") && E.au >= du ? E.au : au; }
  else { du = jour(Number(E.per) - 1); }
  const n = Math.round((new Date(au) - new Date(du)) / 86400000) + 1, f = new Date(du); f.setDate(f.getDate() - 1); const d0 = new Date(f); d0.setDate(d0.getDate() - n + 1);
  return {du, au, pdu:iso(d0), pau:iso(f)}; }
const filtresQ = E => "&site="+encodeURIComponent(E.site)+"&dept="+encodeURIComponent(E.dept)+"&fonction="+encodeURIComponent(E.fonction);
function charger(ctx, frais){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, per:"30", site:"", dept:"", fonction:"", F:null, D:null, axe:"site"});
  if (!E.cfg && !E.cEn){ E.cEn = true; ctx.api("api/v1/bi/config").then(j=>{ E.cfg = j; E.cEn = false; ctx.rendre(); }).catch(()=>{ E.cEn = false; E.cfg = {objectifs:{}, choix:null}; }); }
  const B = bornes(E);
  if (E.axe && (!E.V || frais) && !E.vEn && E.D){ E.vEn = true;
    ctx.api("api/v1/bi/ventilation?axe="+E.axe+"&du="+B.du+"&au="+B.au+filtresQ(E)+(frais ? "&frais=1" : "")).then(j=>{ E.V = j; E.vEn = false; ctx.rendre(); }).catch(()=>{ E.vEn = false; }); }
  if (!E.F && !E.fEn){ E.fEn = true; ctx.api("api/v1/bi/filtres").then(j=>{ E.F = j; E.fEn = false; ctx.rendre(); }).catch(()=>{ E.fEn = false; }); }
  if ((!E.D || frais) && !E.dEn){ E.dEn = true;
    const q = "du="+B.du+"&au="+B.au+filtresQ(E)+(frais ? "&frais=1" : "");
    ctx.api("api/v1/bi/tableau?"+q).then(j=>{ E.D = j; E.dEn = false; ctx.rendre();
      /* 56.31.1 : période précédente de même durée, pour les tendances (calcul serveur, mis en cache) */
      const qp = "du="+B.pdu+"&au="+B.pau+filtresQ(E);
      ctx.api("api/v1/bi/tableau?"+qp).then(p=>{ E.P = p; ctx.rendre(); }).catch(()=>{}); }).catch(e=>{ E.dEn = false; ctx.flash(e.message, "err"); }); }
}
/* 56.31.1 : catalogue des indicateurs (identifiant, domaine, libellé, valeur, unité, sens favorable, seuils) */
function indicateurs(ctx, D, P){
  const L = [], add = (id, dom, l, f, o) => { const val = f(D); if (val === undefined) return; let prec = null; try { prec = P ? f(P) : null; } catch(e){}
    L.push(Object.assign({id, dom, l:T(ctx,l), v:val, prec:prec == null ? null : prec}, o||{})); };
  add("actifs", "effectifs", "actifs", d=>d.effectifs.actifs, {ico:"emp"}); add("entrees", "effectifs", "entrees", d=>d.effectifs.entrees, {ico:"emp"}); add("sorties", "effectifs", "sorties", d=>d.effectifs.sorties, {ico:"emp", inverse:true});
  if (D.temps){ add("presence", "temps", "tauxPresence", d=>d.temps && d.temps.tauxPresence, {unite:"%", ico:"ptg", seuil:[95, 90]}); add("absenteisme", "temps", "absenteisme", d=>d.temps && d.temps.tauxAbsenteisme, {unite:"%", ico:"cal", inverse:true, seuilInv:[4, 7]});
    add("heuresSup", "temps", "heuresSup", d=>d.temps && d.temps.heuresSup, {unite:"h", ico:"ptg", inverse:true}); add("retards", "temps", "joursRetard", d=>d.temps && d.temps.joursRetard, {ico:"alerte", inverse:true}); }
  if (D.competences){ add("couverture", "competences", "couverture", d=>d.competences && d.competences.couverture, {unite:"%", ico:"comp", seuil:[90, 75]}); add("enEcart", "competences", "enEcart", d=>d.competences && d.competences.salariesEnEcart, {ico:"comp", inverse:true}); }
  if (D.formation){ add("heuresForm", "formation", "heures", d=>d.formation && d.formation.heures, {unite:"h", ico:"forma"}); add("reussite", "formation", "reussite", d=>d.formation && d.formation.tauxReussite, {unite:"%", ico:"forma", seuil:[90, 75]});
    add("habExp", "formation", "habExpirees", d=>d.formation && d.formation.habilitationsExpirees, {ico:"habil", inverse:true, seuilInv:[0, 5]}); add("besoins", "formation", "besoins", d=>d.formation && d.formation.besoinsOuverts, {ico:"forma", inverse:true}); }
  if (D.evaluation){ add("realisation", "evaluation", "realisation", d=>d.evaluation && d.evaluation.tauxRealisation, {unite:"%", ico:"eval", seuil:[90, 70]}); add("note", "evaluation", "noteMoyenne", d=>d.evaluation && d.evaluation.noteMoyenne, {unite:"/ 5", ico:"eval", dec:2}); }
  if (D.hse){ add("accidents", "hse", "accidents", d=>d.hse && d.hse.accidents, {ico:"hse", inverse:true, seuilInv:[0, 2]}); add("tf", "hse", "tf", d=>d.hse && d.hse.tf, {ico:"hse", inverse:true, dec:2}); add("tg", "hse", "tg", d=>d.hse && d.hse.tg, {ico:"hse", inverse:true, dec:2}); }
  if (D.recrutement){ add("postes", "recrutement", "postes", d=>d.recrutement && d.recrutement.postesOuverts, {ico:"recrut"}); add("candidatures", "recrutement", "candidatures", d=>d.recrutement && d.recrutement.candidaturesPeriode, {ico:"recrut"}); add("embauches", "recrutement", "embauches", d=>d.recrutement && d.recrutement.embauches, {ico:"recrut"}); }
  if (D.temps && D.temps.joursFeriesTravailles !== undefined){ add("ferTrav", "temps", "ferTrav", d=>d.temps && d.temps.joursFeriesTravailles, {ico:"cal"}); add("hFer", "temps", "hFer", d=>d.temps && d.temps.heuresFeriees, {unite:"h", ico:"cal"});
    add("repTrav", "temps", "repTrav", d=>d.temps && d.temps.joursReposTravailles, {ico:"cal", inverse:true}); add("hRep", "temps", "hRep", d=>d.temps && d.temps.heuresRepos, {unite:"h", ico:"cal", inverse:true});
    add("oublis", "temps", "oublis", d=>d.temps && d.temps.oublisBadgeage, {ico:"alerte", inverse:true}); add("anomalies", "temps", "anomalies", d=>d.temps && d.temps.journeesAnomalie, {ico:"alerte", inverse:true}); }
  if (D.absences){ add("absTotal", "temps", "absTotal", d=>d.absences && d.absences.total, {ico:"cal", inverse:true}); }
  if (D.visiteurs){ add("visites", "visiteurs", "visites", d=>d.visiteurs && d.visiteurs.visites, {ico:"emp"}); add("visReal", "visiteurs", "visReal", d=>d.visiteurs && d.visiteurs.realisees, {ico:"emp"});
    add("visAnn", "visiteurs", "visAnn", d=>d.visiteurs && d.visiteurs.annulees, {ico:"emp", inverse:true}); add("visEnt", "visiteurs", "visEnt", d=>d.visiteurs && d.visiteurs.entreprises, {ico:"emp"}); }
  if (D.integration){ add("parcours", "integration", "parcours", d=>d.integration && d.integration.parcoursEnCours, {ico:"emp"}); add("tachesRetard", "integration", "tachesRetard", d=>d.integration && d.integration.tachesEnRetard, {ico:"alerte", inverse:true, seuilInv:[0, 5]});
    add("tachesTemps", "integration", "tachesTemps", d=>d.integration && d.integration.tachesATemps, {unite:"%", ico:"emp", seuil:[90, 75]}); }
  if (D.biometrie){ add("bloques", "biometrie", "bloques", d=>d.biometrie && d.biometrie.bloques, {ico:"habil"}); add("retraitsAtt", "biometrie", "retraitsAtt", d=>d.biometrie && d.biometrie.retraitsEnAttente, {ico:"habil", inverse:true});
    add("retraitsEch", "biometrie", "retraitsEch", d=>d.biometrie && d.biometrie.retraitsEnEchec, {ico:"alerte", inverse:true, seuilInv:[0, 0]}); }
  if (D.medical && D.medical.total && !D.medical.total.masque){ add("perAJour", "medical", "perAJour", d=>d.medical && d.medical.total && d.medical.total.tauxPeriodiquesAJour, {unite:"%", ico:"medic", seuil:[95, 80]}); }
  return L;
}
/* préférences par utilisateur (navigateur) : indicateurs retenus et leur ordre, objectifs, affichage */
function objectifsEff(ctx){ const PR = prefs(ctx), cf = (ctx.etat.cfg||{}).objectifs || {}; return Object.assign({}, cf, PR.objectifs || {}); }
function prefs(ctx){ const E = ctx.etat; if (!E.pref){ try { E.pref = JSON.parse(localStorage.getItem("fwk-bi-pref") || "null"); } catch(e){} E.pref = E.pref || {choix:null, objectifs:{}, vue:"cartes"}; } return E.pref; }
function prefsSauver(ctx){ try { localStorage.setItem("fwk-bi-pref", JSON.stringify(ctx.etat.pref)); } catch(e){} }
function ton(k, obj){ if (k.v == null) return "info"; const v = +k.v;
  if (obj != null && obj !== "") return (k.inverse ? v <= +obj : v >= +obj) ? "ok" : "alerte";
  if (k.seuil) return v >= k.seuil[0] ? "ok" : v >= k.seuil[1] ? "att" : "alerte";
  if (k.seuilInv) return v <= k.seuilInv[0] ? "ok" : v <= k.seuilInv[1] ? "att" : "alerte";
  return "info"; }
const v = (x, suf) => x == null ? "—" : (typeof x === "number" ? x.toLocaleString("fr-FR") : String(x))+(suf || "");
function bloc(ctx, titre, cartes){ return '<section class="fwb-bloc"><h2>'+ctx.esc(titre)+'</h2><div class="fwb-cartes">'+cartes.map(([l, val, aide])=>'<div class="fw-card fwb-k"><b>'+ctx.esc(val)+'</b><span>'+ctx.esc(l)+'</span>'+(aide ? '<small>'+ctx.esc(aide)+'</small>' : '')+'</div>').join("")+'</div></section>'; }
function lignesCsv(ctx, D){
  const l = [["Indicateur", "Valeur"]], ajout = (k, x) => l.push([k, x == null ? "" : String(x)]);
  ajout(T(ctx,"actifs"), D.effectifs.actifs); ajout(T(ctx,"entrees"), D.effectifs.entrees); ajout(T(ctx,"sorties"), D.effectifs.sorties);
  if (D.temps){ ajout(T(ctx,"tauxPresence"), D.temps.tauxPresence); ajout(T(ctx,"heuresSup"), D.temps.heuresSup); ajout(T(ctx,"absenteisme"), D.temps.tauxAbsenteisme); }
  if (D.competences){ ajout(T(ctx,"couverture"), D.competences.couverture); ajout(T(ctx,"enEcart"), D.competences.salariesEnEcart); }
  if (D.formation){ ajout(T(ctx,"heures"), D.formation.heures); ajout(T(ctx,"reussite"), D.formation.tauxReussite); ajout(T(ctx,"habExpirees"), D.formation.habilitationsExpirees); }
  if (D.evaluation){ ajout(T(ctx,"realisation"), D.evaluation.tauxRealisation); ajout(T(ctx,"noteMoyenne"), D.evaluation.noteMoyenne); }
  if (D.hse){ ajout(T(ctx,"accidents"), D.hse.accidents); ajout(T(ctx,"tf"), D.hse.tf); ajout(T(ctx,"tg"), D.hse.tg); }
  if (D.recrutement){ ajout(T(ctx,"postes"), D.recrutement.postesOuverts); ajout(T(ctx,"embauches"), D.recrutement.embauches); }
  if (D.medical && D.medical.total && !D.medical.total.masque){ const M = D.medical.total; ajout(T(ctx,"perAJour"), M.tauxPeriodiquesAJour); ajout(T(ctx,"embVisite"), M.tauxVisitesEmbauche); ajout(T(ctx,"mpDecl"), M.mpDeclarees);
    (D.medical.parService||[]).forEach(x=>{ if (!x.masque){ ajout(T(ctx,"perAJour")+" — "+x.service, x.tauxPeriodiquesAJour); ajout(T(ctx,"embVisite")+" — "+x.service, x.tauxVisitesEmbauche); ajout(T(ctx,"mpDecl")+" — "+x.service, x.mpDeclarees); } }); }
  if (D.temps && D.temps.joursFeriesTravailles !== undefined){ ajout(T(ctx,"ferTrav"), D.temps.joursFeriesTravailles); ajout(T(ctx,"hFer"), D.temps.heuresFeriees); ajout(T(ctx,"repTrav"), D.temps.joursReposTravailles); ajout(T(ctx,"hRep"), D.temps.heuresRepos); ajout(T(ctx,"oublis"), D.temps.oublisBadgeage); }
  if (D.absences) D.absences.parType.forEach(x=>ajout(T(ctx,"absences")+" — "+x.nom, x.jours));
  if (D.visiteurs){ ajout(T(ctx,"visites"), D.visiteurs.visites); ajout(T(ctx,"visReal"), D.visiteurs.realisees); }
  if (D.integration){ ajout(T(ctx,"parcours"), D.integration.parcoursEnCours); ajout(T(ctx,"tachesRetard"), D.integration.tachesEnRetard); }
  if (D.biometrie){ ajout(T(ctx,"bloques"), D.biometrie.bloques); ajout(T(ctx,"retraitsEch"), D.biometrie.retraitsEnEchec); }
  const V = ctx.etat.V; if (V && V.lignes.length){ l.push([]); l.push([T(ctx,"groupe"), T(ctx,"effectif"), T(ctx,"tauxPresence"), T(ctx,"absenteisme"), T(ctx,"heuresSup"), T(ctx,"joursRetard"), T(ctx,"accidents")]);
    V.lignes.forEach(x=>l.push([x.nom, x.effectif, x.tauxPresence, x.absenteisme, x.heuresSup, x.joursRetard, x.accidents].map(c=>c == null ? "" : c))); }
  /* cellule neutralisée : = + - @ en tête ne deviennent pas une formule dans le tableur (nombres négatifs gardés) */
  const cel = c => { let x = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(x) && !/^-?\d+([.,]\d+)?$/.test(x)) x = "'"+x; return '"'+x.replace(/"/g, '""')+'"'; };
  return l.map(r=>r.map(cel).join(";")).join("\r\n");
}
function persoHTML(ctx, K, choix){
  const PR = prefs(ctx), ob = PR.objectifs || {};
  const ligne = (k, on, i) => '<div class="fwb-pl'+(on ? '' : ' off')+'"><label><input type="checkbox" data-fwmc="pchoix" data-id="'+k.id+'"'+(on ? ' checked' : '')+'> '+ctx.esc(k.l)+' <span class="fw-hint">· '+ctx.esc(T(ctx,k.dom === "hse" ? "hse" : k.dom))+'</span></label>'+
    (on ? '<span class="fwb-pa">'+(((ctx.etat.cfg||{}).objectifs||{})[k.id] != null ? '<span class="fw-hint fwb-obje">'+ctx.esc(T(ctx,"objEntreprise").replace("{v}", ctx.etat.cfg.objectifs[k.id]))+'</span>' : '')+'<input type="number" step="any" data-fwmc="pobj" data-id="'+k.id+'" value="'+ctx.esc(ob[k.id] == null ? "" : ob[k.id])+'" placeholder="'+ctx.esc(((ctx.etat.cfg||{}).objectifs||{})[k.id] != null ? String(ctx.etat.cfg.objectifs[k.id]) : T(ctx,"objectif"))+'" title="'+ctx.esc(((ctx.etat.cfg||{}).objectifs||{})[k.id] != null ? T(ctx,"objEntreprise").replace("{v}", ctx.etat.cfg.objectifs[k.id]) : T(ctx,"objectif"))+'" aria-label="'+ctx.esc(T(ctx,"objectif")+" — "+k.l)+'">'+
      '<button type="button" class="fw-iconb" data-act="fwm:monter" data-v="'+k.id+'" aria-label="'+ctx.esc(T(ctx,"monter"))+'"'+(i === 0 ? ' disabled' : '')+'>↑</button>'+
      '<button type="button" class="fw-iconb" data-act="fwm:descendre" data-v="'+k.id+'" aria-label="'+ctx.esc(T(ctx,"descendre"))+'"'+(i === choix.length-1 ? ' disabled' : '')+'>↓</button></span>' : '')+'</div>';
  return '<div class="fw-card fw-u-p-lg fwb-perso"><div class="fw-sec" style="margin-top:0">'+ctx.esc(T(ctx,"personnaliser"))+'</div><p class="fw-hint">'+ctx.esc(T(ctx,"persoAide"))+'</p>'+
    choix.map((id, i)=>ligne(K.find(k=>k.id === id), true, i)).join("")+K.filter(k=>choix.indexOf(k.id) < 0).map(k=>ligne(k, false, 0)).join("")+
    '<div class="fw-u-row" style="gap:8px;margin-top:10px;justify-content:flex-end"><button type="button" class="fw-btn" data-act="fwm:persoReinit">'+ctx.esc(T(ctx,"persoReinit"))+'</button>'+((ctx.etat.cfg||{}).modifiable ? '<button type="button" class="fw-btn" data-act="fwm:partager">'+ctx.esc(T(ctx,"partage"))+'</button>' : '')+'<button type="button" class="fw-btn pri" data-act="fwm:perso">'+ctx.esc(T(ctx,"termine"))+'</button></div></div>';
}
FIWAKTI_MODULES.enregistrer({
  id:"FW-BI",
  mount(ctx){ charger(ctx); },
  unmount(ctx){ if (ctx.etat.url){ URL.revokeObjectURL(ctx.etat.url); ctx.etat.url = null; } },
  render(vue, ctx){
    charger(ctx); const E = ctx.etat, F = E.F || {sites:[], depts:[], fonctions:[]}, D = E.D;
    const sel = (k, l, opts) => '<label class="fwb-c"><span>'+ctx.esc(l)+'</span><select data-fwmc="'+k+'">'+opts+'</select></label>';
    const opt = (val, lib, cur) => '<option value="'+ctx.esc(val)+'"'+(cur === val ? ' selected' : '')+'>'+ctx.esc(lib)+'</option>';
    let h = '<div class="fw-module fwb"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-toolbar fwb-filtres">'+sel("per", T(ctx,"periode"), [["30","p30"],["90","p90"],["365","p365"],["mois","pMois"],["moisPrec","pMoisPrec"],["annee","pAnnee"],["perso","pPerso"]].map(([x, k])=>opt(x, T(ctx,k), E.per)).join(""))+
        (E.per === "perso" ? '<label class="fwb-c"><span>'+ctx.esc(T(ctx,"du"))+'</span><input type="date" data-fwmc="du" value="'+ctx.esc(E.du||jour(29))+'"></label><label class="fwb-c"><span>'+ctx.esc(T(ctx,"au"))+'</span><input type="date" data-fwmc="au" value="'+ctx.esc(E.au||jour(0))+'"></label>' : '')+
        sel("site", T(ctx,"site"), opt("", T(ctx,"tous"), E.site)+F.sites.map(s=>opt(s.id, s.nom, E.site)).join(""))+
        sel("dept", T(ctx,"service"), opt("", T(ctx,"tous"), E.dept)+F.depts.map(s=>opt(s.id, s.nom, E.dept)).join(""))+
        sel("fonction", T(ctx,"fonction"), opt("", T(ctx,"tous"), E.fonction)+F.fonctions.map(f=>opt(f, f, E.fonction)).join(""))+
        '<button class="fw-btn" data-act="fwm:actualiser">'+ctx.esc(T(ctx,"actualiser"))+'</button>'+(D ? '<button class="fw-btn" data-act="fwm:exporter">'+ctx.esc(T(ctx,"exporter"))+'</button>' : '')+'</div>';
    if (!D) return h+'<div class="fw-hint" aria-busy="true">'+ctx.esc(T(ctx,"chargement"))+'</div></div>';
    const PR = prefs(ctx), K = indicateurs(ctx, D, E.P), parId = {}; K.forEach(k=>{ parId[k.id] = k; });
    const choix = (PR.choix || (E.cfg && E.cfg.choix) || K.map(k=>k.id)).filter(id=>parId[id]);
    h += '<div class="fwb-barre"><span class="fw-hint">'+ctx.esc(E.P ? T(ctx,"vsPrec") : T(ctx,"chargementPrec"))+'</span><div class="fw-spacer"></div>'+
      '<div class="fw-seg sm">'+[["cartes","vCartes"],["graphes","vGraphes"]].map(([x, l])=>'<button type="button" data-act="fwm:vue" data-v="'+x+'"'+(PR.vue === x ? ' class="on"' : '')+'>'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<button type="button" class="fw-btn" data-act="fwm:perso">'+ctx.esc(T(ctx,"personnaliser"))+'</button></div>';
    if (E.perso) h += persoHTML(ctx, K, choix);
    const doms = []; choix.forEach(id=>{ const d = parId[id].dom; if (doms.indexOf(d) < 0) doms.push(d); });
    doms.forEach(d=>{ h += '<section class="fwb-bloc"><h2>'+ctx.esc(T(ctx,d === "hse" ? "hse" : d))+'</h2><div class="fw-vkpis">'+
      choix.filter(id=>parId[id].dom === d).map(id=>{ const k = parId[id], obj = objectifsEff(ctx)[id];
        return ctx.viz.kpi({v:k.v, prec:k.prec, inverse:k.inverse, l:k.l, unite:k.unite, dec:k.dec, ico:k.ico, ton:ton(k, obj), aide:obj != null && obj !== "" ? T(ctx,"objectif")+" : "+obj+(k.unite ? " "+k.unite : "") : ""}); }).join("")+'</div></section>'; });
    if (D.temps && D.temps.parMois.length > 1){ const M = D.temps.parMois, et = M.map(m=>ctx.viz.mois(m.mois, true));
      h += PR.vue === "graphes" ? '<div class="fw-vgrille">'+ctx.viz.graphe({titre:T(ctx,"tauxPresence")+" / "+T(ctx,"absenteisme"), type:"courbe", etiquettes:et, objectif:objectifsEff(ctx).presence != null ? +objectifsEff(ctx).presence : null,
          series:[{nom:T(ctx,"tauxPresence"), valeurs:M.map(m=>m.tauxPresence||0)}, {nom:T(ctx,"absenteisme"), valeurs:M.map(m=>m.absenteisme||0), couleur:"#e11d48"}]})+
        ctx.viz.graphe({titre:T(ctx,"heuresSup"), type:"barres", etiquettes:et, series:[{nom:T(ctx,"heuresSup"), valeurs:M.map(m=>m.heuresSup||0), couleur:"#2563eb"}]})+'</div>' :
        '<table class="fw-tbl fwb-mois"><thead><tr><th>'+ctx.esc(T(ctx,"mois"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"tauxPresence"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"absenteisme"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"heuresSup"))+'</th></tr></thead><tbody>'+
        M.slice().reverse().map(m=>'<tr><td>'+ctx.esc(ctx.viz.mois(m.mois))+'</td><td class="fw-num">'+v(m.tauxPresence, " %")+'</td><td class="fw-num">'+v(m.absenteisme, " %")+'</td><td class="fw-num">'+v(m.heuresSup, " h")+'</td></tr>').join("")+'</tbody></table>'; }
    /* 56.33.11 : absences par type */
    if (D.absences && D.absences.parType.length) h += '<section class="fwb-bloc"><h2>'+ctx.esc(T(ctx,"absences"))+'</h2><table class="fw-tbl fwb-mois"><thead><tr><th>'+ctx.esc(T(ctx,"type"))+'</th><th class="fw-num">'+ctx.esc(T(ctx,"jours"))+'</th><th class="fw-num">%</th></tr></thead><tbody>'+
      D.absences.parType.map(x=>'<tr><td>'+ctx.esc(x.nom)+' <span class="fw-hint">'+ctx.esc(x.code)+'</span></td><td class="fw-num">'+v(x.jours)+'</td><td class="fw-num">'+v(D.absences.total ? Math.round(1000 * x.jours / D.absences.total) / 10 : null, " %")+'</td></tr>').join("")+'</tbody></table></section>';
    /* 56.33.11 : ventilation par site, service ou fonction */
    h += '<section class="fwb-bloc"><div class="fwb-barre"><h2 style="margin:0">'+ctx.esc(T(ctx,"ventilation"))+'</h2><div class="fw-seg sm">'+[["site","vSite"],["dept","vDept"],["fonction","vFonction"]].map(([x, l])=>'<button type="button" data-act="fwm:axe" data-v="'+x+'"'+(E.axe === x ? ' class="on"' : '')+'>'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div></div>';
    if (!E.V) h += '<div class="fw-hint" aria-busy="true">'+ctx.esc(T(ctx,"chargement"))+'</div>';
    else { const tri = E.tri || "effectif", col = (k, l) => '<th class="fw-num"><button type="button" class="fwb-tri'+(tri === k ? ' on' : '')+'" data-act="fwm:tri" data-v="'+k+'">'+ctx.esc(T(ctx,l))+'</button></th>';
      const L2 = E.V.lignes.slice().sort((a, b)=>tri === "nom" ? String(a.nom).localeCompare(String(b.nom)) : (b[tri] == null ? -1 : a[tri] == null ? 1 : b[tri] - a[tri]));
      h += '<div class="fw-tablewrap"><table class="fw-tbl fwb-vent"><thead><tr><th><button type="button" class="fwb-tri'+(tri === "nom" ? ' on' : '')+'" data-act="fwm:tri" data-v="nom">'+ctx.esc(T(ctx,"groupe"))+'</button></th>'+col("effectif", "effectif")+(D.temps ? col("tauxPresence", "tauxPresence")+col("absenteisme", "absenteisme")+col("heuresSup", "heuresSup")+col("joursRetard", "joursRetard") : '')+(D.hse ? col("accidents", "accidents") : '')+'</tr></thead><tbody>'+
        L2.map(x=>'<tr><td>'+ctx.esc(x.nom)+'</td><td class="fw-num">'+v(x.effectif)+'</td>'+(D.temps ? '<td class="fw-num">'+v(x.tauxPresence, " %")+'</td><td class="fw-num">'+v(x.absenteisme, " %")+'</td><td class="fw-num">'+v(x.heuresSup, " h")+'</td><td class="fw-num">'+v(x.joursRetard)+'</td>' : '')+(D.hse ? '<td class="fw-num">'+v(x.accidents)+'</td>' : '')+'</tr>').join("")+'</tbody></table></div>'+
        (E.V.groupes > E.V.lignes.length ? '<p class="fw-hint">'+ctx.esc(T(ctx,"plusGroupes").replace("{n}", E.V.groupes))+'</p>' : ''); }
    h += '</section>';
    /* v56.21 : suivi médical par service (taux et nombres, masqués sous le seuil) */
    if (D.medical){ const M = D.medical, t0 = M.total || {};
      if (false) h += bloc(ctx, T(ctx,"medical"), t0.masque ? [[T(ctx,"masque"), "—"]] : [[T(ctx,"perAJour"), v(t0.tauxPeriodiquesAJour, " %"), T(ctx,"perio").replace("{n}", M.periodiciteMois)], [T(ctx,"perRealisees"), v(t0.periodiquesPeriode)],
        [T(ctx,"embVisite"), v(t0.tauxVisitesEmbauche, " %"), v(t0.embauches)+" "+T(ctx,"embauchesP")], [T(ctx,"mpDecl"), v(t0.mpDeclarees), v(t0.mpReconnues)+" "+T(ctx,"reconnues")]]);
      if (M.parService.length) h += '<table class="fw-tbl fwb-mois"><thead><tr><th>'+ctx.esc(T(ctx,"service"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"effectif"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"perAJour"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"perRealisees"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"embVisite"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"mpDecl"))+'</th></tr></thead><tbody>'+
        M.parService.map(x=>'<tr><td>'+ctx.esc(x.service)+'</td><td class="fw-num">'+x.effectif+'</td>'+(x.masque ? '<td class="fw-num" colspan="4">'+ctx.esc(T(ctx,"masque").replace("{n}", M.seuilMasquage))+'</td>' :
          '<td class="fw-num">'+v(x.tauxPeriodiquesAJour, " %")+'</td><td class="fw-num">'+v(x.periodiquesPeriode)+'</td><td class="fw-num">'+(x.embauches ? v(x.tauxVisitesEmbauche, " %")+' <span class="fw-hint">('+x.embauches+')</span>' : "—")+'</td><td class="fw-num">'+v(x.mpDeclarees)+(x.mpReconnues ? ' <span class="fw-hint">('+x.mpReconnues+')</span>' : '')+'</td>')+'</tr>').join("")+'</tbody></table>';
      h += '<p class="fw-hint">'+ctx.esc(T(ctx,"medNote").replace("{n}", M.seuilMasquage))+'</p>'; }
    return h+'<p class="fw-hint">'+ctx.esc(T(ctx,"sources").replace("{s}", D.sources.join(", "))+" · "+ctx.dateAff(D.du)+" → "+ctx.dateAff(D.au)+" · "+(D.cache ? T(ctx,"cache") : T(ctx,"calcule").replace("{n}", D.calculeEnMs)))+'</p></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat;
    if (a === "actualiser"){ E.D = null; E.P = null; E.V = null; charger(ctx, true); return ctx.rendre(); }
    if (a === "axe"){ E.axe = el.dataset.v; E.V = null; charger(ctx); return ctx.rendre(); }
    if (a === "tri"){ E.tri = el.dataset.v; return ctx.rendre(); }
    if (a === "partager"){ const PR0 = prefs(ctx);
      ctx.api("api/v1/bi/config", {methode:"PUT", corps:{objectifs:objectifsEff(ctx), choix:PR0.choix || (E.cfg && E.cfg.choix) || null}})
        .then(j=>{ E.cfg = j; ctx.flash(T(ctx,"partageOk"), "ok"); ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err")); return; }
    const PR = prefs(ctx), ids = () => (PR.choix || indicateurs(ctx, E.D, E.P).map(k=>k.id));
    if (a === "vue"){ PR.vue = el.dataset.v; prefsSauver(ctx); return ctx.rendre(); }
    if (a === "perso"){ E.perso = !E.perso; return ctx.rendre(); }
    if (a === "persoReinit"){ E.pref = {choix:null, objectifs:{}, vue:PR.vue}; prefsSauver(ctx); return ctx.rendre(); }
    if (a === "monter" || a === "descendre"){ const l = ids().slice(), i = l.indexOf(el.dataset.v), j = a === "monter" ? i-1 : i+1; if (i < 0 || j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]]; PR.choix = l; prefsSauver(ctx); return ctx.rendre(); }
    if (a === "exporter" && E.D){ if (E.url) URL.revokeObjectURL(E.url);
      E.url = URL.createObjectURL(new Blob(["\ufeff"+lignesCsv(ctx, E.D)], {type:"text/csv;charset=utf-8"}));
      const l = document.createElement("a"); l.href = E.url; l.download = "fiwakti-pilotage-"+E.D.du+"-"+E.D.au+".csv"; document.body.appendChild(l); l.click(); l.remove(); }
  },
  change(k, el, ctx){ const E = ctx.etat; if (["per","site","dept","fonction","du","au"].indexOf(k) >= 0){ E[k] = el.value; E.D = null; E.P = null; E.V = null; return ctx.rendre(); }
    const PR = prefs(ctx);
    if (k === "pchoix"){ const l = (PR.choix || indicateurs(ctx, E.D, E.P).map(x=>x.id)).filter(x=>x !== el.dataset.id); if (el.checked) l.push(el.dataset.id); PR.choix = l; prefsSauver(ctx); return ctx.rendre(); }
    if (k === "pobj"){ PR.objectifs = PR.objectifs || {}; if (el.value === "") delete PR.objectifs[el.dataset.id]; else PR.objectifs[el.dataset.id] = +el.value; prefsSauver(ctx); return ctx.rendre(); } }
});
})();
