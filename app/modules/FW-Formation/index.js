/* FW-Formation — interface chargée à la demande : besoins (écarts, échéances), sessions (inscription, présence,
   résultat, clôture), habilitations et catalogue. */
(function(){
"use strict";
const L = {
  fr:{titre:"Formation et habilitations", lede:"Des écarts de compétences et des échéances d'habilitation jusqu'à la session, la présence, le résultat et le nouveau niveau dans la matrice.",
    besoins:"Besoins", sessions:"Sessions", habilitations:"Habilitations", catalogue:"Catalogue", generer:"Générer les besoins (écarts et échéances)", generes:"{n} besoin(s) créé(s).",
    salarie:"Salarié", formation:"Formation", origine:"Origine", o_ecart:"Écart de compétence", o_echeance:"Échéance d'habilitation", o_evaluation:"Évaluation", o_manuel:"Saisie",
    s_ouvert:"Ouverts", s_planifie:"Planifiés", s_realise:"Réalisés", s_annule:"Annulés", planifier:"Planifier une session", debut:"Début", fin:"Fin", lieu:"Lieu", formateur:"Formateur", places:"Places",
    inscrireBesoins:"Inscrire les besoins ouverts", creerSession:"Créer la session", inscrits:"Inscrits", statut:"Statut", ss_planifiee:"Planifiée", ss_realisee:"Réalisée", ss_annulee:"Annulée",
    retour:"Retour", presence:"Présence", resultat:"Résultat", p_inscrit:"Inscrit", p_present:"Présent", p_absent:"Absent", r_acquis:"Acquis", r_non_acquis:"Non acquis", cloturer:"Clôturer la session",
    clotureOk:"Session clôturée : {n} niveau(x) reporté(s), {h} habilitation(s).", matricule:"Matricule", inscrire:"Inscrire", echeance:"Échéance", obtenue:"Obtenue le", e_valide:"Valide", e_j90:"Sous 90 jours", e_j30:"Sous 30 jours", e_expiree:"Expirée",
    toutes:"Toutes", aEcheance:"À échéance (90 jours)", code:"Code", intitule:"Intitulé", type:"Type", t_formation:"Formation", t_habilitation:"Habilitation", duree:"Durée (h)", validite:"Validité (mois)",
    competence:"Compétence développée", niveau:"Niveau visé", organisme:"Organisme", ajouter:"Ajouter au catalogue", aucune:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}", sans:"—"},
  en:{titre:"Training and authorisations", lede:"From skill gaps and authorisation expiries to session, attendance, result and the new level in the matrix.",
    besoins:"Needs", sessions:"Sessions", habilitations:"Authorisations", catalogue:"Catalogue", generer:"Generate needs (gaps and expiries)", generes:"{n} need(s) created.",
    salarie:"Employee", formation:"Training", origine:"Origin", o_ecart:"Skill gap", o_echeance:"Authorisation expiry", o_evaluation:"Evaluation", o_manuel:"Manual",
    s_ouvert:"Open", s_planifie:"Planned", s_realise:"Done", s_annule:"Cancelled", planifier:"Plan a session", debut:"Start", fin:"End", lieu:"Place", formateur:"Trainer", places:"Seats",
    inscrireBesoins:"Enrol open needs", creerSession:"Create session", inscrits:"Enrolled", statut:"Status", ss_planifiee:"Planned", ss_realisee:"Done", ss_annulee:"Cancelled",
    retour:"Back", presence:"Attendance", resultat:"Result", p_inscrit:"Enrolled", p_present:"Present", p_absent:"Absent", r_acquis:"Passed", r_non_acquis:"Not passed", cloturer:"Close session",
    clotureOk:"Session closed: {n} level(s) recorded, {h} authorisation(s).", matricule:"Employee ID", inscrire:"Enrol", echeance:"Expiry", obtenue:"Obtained", e_valide:"Valid", e_j90:"Within 90 days", e_j30:"Within 30 days", e_expiree:"Expired",
    toutes:"All", aEcheance:"Expiring (90 days)", code:"Code", intitule:"Title", type:"Type", t_formation:"Training", t_habilitation:"Authorisation", duree:"Duration (h)", validite:"Validity (months)",
    competence:"Skill developed", niveau:"Target level", organisme:"Provider", ajouter:"Add to catalogue", aucune:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}", sans:"—"},
  ar:{titre:"التكوين والتأهيلات", lede:"من فوارق الكفاءات وآجال التأهيلات إلى الدورة والحضور والنتيجة والمستوى الجديد.",
    besoins:"الحاجيات", sessions:"الدورات", habilitations:"التأهيلات", catalogue:"الدليل", generer:"توليد الحاجيات", generes:"أنشئ {n} حاجة.",
    salarie:"الأجير", formation:"التكوين", origine:"المصدر", o_ecart:"فارق كفاءة", o_echeance:"أجل تأهيل", o_evaluation:"تقييم", o_manuel:"إدخال",
    s_ouvert:"مفتوحة", s_planifie:"مبرمجة", s_realise:"منجزة", s_annule:"ملغاة", planifier:"برمجة دورة", debut:"البداية", fin:"النهاية", lieu:"المكان", formateur:"المكون", places:"المقاعد",
    inscrireBesoins:"تسجيل الحاجيات المفتوحة", creerSession:"إنشاء الدورة", inscrits:"المسجلون", statut:"الحالة", ss_planifiee:"مبرمجة", ss_realisee:"منجزة", ss_annulee:"ملغاة",
    retour:"رجوع", presence:"الحضور", resultat:"النتيجة", p_inscrit:"مسجل", p_present:"حاضر", p_absent:"غائب", r_acquis:"مكتسب", r_non_acquis:"غير مكتسب", cloturer:"إغلاق الدورة",
    clotureOk:"أغلقت الدورة: {n} مستوى، {h} تأهيل.", matricule:"المعرف", inscrire:"تسجيل", echeance:"الأجل", obtenue:"تاريخ الحصول", e_valide:"صالح", e_j90:"خلال 90 يوما", e_j30:"خلال 30 يوما", e_expiree:"منته",
    toutes:"الكل", aEcheance:"قريبة الأجل", code:"الرمز", intitule:"التسمية", type:"النوع", t_formation:"تكوين", t_habilitation:"تأهيل", duree:"المدة (س)", validite:"الصلاحية (أشهر)",
    competence:"الكفاءة المطورة", niveau:"المستوى المستهدف", organisme:"الهيكل", ajouter:"إضافة إلى الدليل", aucune:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}", sans:"—"}
};
/* correctif 34 : annulation de session, présence en lot, retrait du catalogue, pagination, erreurs réseau, sens de lecture */
Object.assign(L.fr, {reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", reessayer:"Réessayer", annulerSession:"Annuler la session", annulerSessionQ:"Annuler la session « {n} » ? Les besoins des inscrits seront rouverts.", tousPresents:"Tous présents (acquis)", tousAbsents:"Tous absents", retirer:"Retirer", retirerQ:"Retirer « {n} » du catalogue ? Ses besoins ouverts sont annulés.", cloturerQ:"Clôturer « {n} » ? Niveaux de compétence et habilitations des présents « acquis » seront reportés ; la session ne pourra plus être modifiée.", envoi:"Enregistrement…", liste:"Liste"});
Object.assign(L.en, {reseau:"Server unreachable: check the connection and try again.", reessayer:"Try again", annulerSession:"Cancel the session", annulerSessionQ:"Cancel the session “{n}”? Attendees' needs will be reopened.", tousPresents:"All present (passed)", tousAbsents:"All absent", retirer:"Remove", retirerQ:"Remove “{n}” from the catalogue? Its open needs are cancelled.", cloturerQ:"Close “{n}”? Skill levels and authorisations of attendees who passed will be recorded; the session can no longer be changed.", envoi:"Saving…", liste:"List"});
Object.assign(L.ar, {reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة.", reessayer:"إعادة المحاولة", annulerSession:"إلغاء الدورة", annulerSessionQ:"إلغاء الدورة «{n}»؟ ستُعاد فتح احتياجات المسجلين.", tousPresents:"الجميع حاضرون (مكتسب)", tousAbsents:"الجميع غائبون", retirer:"سحب", retirerQ:"سحب «{n}» من الدليل؟ تُلغى احتياجاته المفتوحة.", cloturerQ:"إغلاق «{n}»؟ تُسجّل مستويات الكفاءة والتأهيلات للحاضرين الناجحين؛ ولا يمكن بعدها تعديل الدورة.", envoi:"جارٍ الحفظ…", liste:"القائمة"});
/* correctif 37 */
Object.assign(L.fr, {precedent:"Page précédente", suivant:"Page suivante", tous:"Tous", site:"Site", aucunSite:"—", p_excuse:"Excusé", modifier:"Modifier", enregistrer:"Enregistrer", annuler:"Annuler",
  desinscrire:"Désinscrire", desinscrireQ:"Désinscrire {n} de la session ?", emargement:"Feuille d'émargement (CSV)", generesQ:"{n} besoin(s) vont être créés. Continuer ?", aucunBesoinGen:"Aucun nouveau besoin à créer.",
  lotQ:"Marquer les {n} inscrit(s) restants « {p} » ?", besoinManuel:"Ajouter un besoin", annulerBesoin:"Annuler", annulerBesoinQ:"Annuler le besoin « {n} » ? Indiquez le motif.", motif:"Motif",
  habManuelle:"Saisir une habilitation obtenue", obtenueLe:"Obtenue le", historique:"Historique d'un salarié", voirHist:"Afficher", horsPerim:"{n} inscrit(s) hors de votre périmètre.",
  l_besoins:"Besoins de formation", l_sessions:"Sessions", l_inscrits:"Inscrits", l_habilitations:"Habilitations", l_catalogue:"Catalogue", actions:"Actions", retiree:"(retirée du catalogue)",
  presenceDe:"Présence — {n}", resultatDe:"Résultat — {n}", nonCommencee:"Présence saisissable à partir du {d}."});
Object.assign(L.en, {precedent:"Previous page", suivant:"Next page", tous:"All", site:"Site", aucunSite:"—", p_excuse:"Excused", modifier:"Edit", enregistrer:"Save", annuler:"Cancel",
  desinscrire:"Unenrol", desinscrireQ:"Unenrol {n} from the session?", emargement:"Attendance sheet (CSV)", generesQ:"{n} need(s) will be created. Continue?", aucunBesoinGen:"No new need to create.",
  lotQ:"Mark the {n} remaining attendee(s) “{p}”?", besoinManuel:"Add a need", annulerBesoin:"Cancel", annulerBesoinQ:"Cancel the need “{n}”? Give the reason.", motif:"Reason",
  habManuelle:"Record an authorisation obtained", obtenueLe:"Obtained on", historique:"Employee history", voirHist:"Show", horsPerim:"{n} attendee(s) outside your scope.",
  l_besoins:"Training needs", l_sessions:"Sessions", l_inscrits:"Attendees", l_habilitations:"Authorisations", l_catalogue:"Catalogue", actions:"Actions", retiree:"(removed from catalogue)",
  presenceDe:"Attendance — {n}", resultatDe:"Result — {n}", nonCommencee:"Attendance can be recorded from {d}."});
Object.assign(L.ar, {precedent:"الصفحة السابقة", suivant:"الصفحة التالية", tous:"الكل", site:"الموقع", aucunSite:"—", p_excuse:"معذور", modifier:"تعديل", enregistrer:"حفظ", annuler:"إلغاء",
  desinscrire:"إلغاء التسجيل", desinscrireQ:"إلغاء تسجيل {n} من الدورة؟", emargement:"ورقة الإمضاء (CSV)", generesQ:"ستُنشأ {n} حاجة. متابعة؟", aucunBesoinGen:"لا حاجة جديدة.",
  lotQ:"تسجيل {n} مسجل متبقٍ «{p}»؟", besoinManuel:"إضافة حاجة", annulerBesoin:"إلغاء", annulerBesoinQ:"إلغاء الحاجة «{n}»؟ اذكر التعليل.", motif:"التعليل",
  habManuelle:"تسجيل تأهيل محصل", obtenueLe:"تاريخ الحصول", historique:"سجل أجير", voirHist:"عرض", horsPerim:"{n} مسجل خارج نطاقك.",
  l_besoins:"حاجيات التكوين", l_sessions:"الدورات", l_inscrits:"المسجلون", l_habilitations:"التأهيلات", l_catalogue:"الدليل", actions:"الإجراءات", retiree:"(مسحوب من الدليل)",
  presenceDe:"الحضور — {n}", resultatDe:"النتيجة — {n}", nonCommencee:"يُسجل الحضور ابتداء من {d}."});
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "→" ? "←" : g === "←" ? "→" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const pager = (ctx, act, off, total) => '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", total ? off+1 : 0).replace("{b}", Math.min(off+50, total)).replace("{n}", total))+'</span><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="-50"'+(off ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"precedent"))+'">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="50"'+(off+50 < total ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"suivant"))+'">'+fl(ctx, "›")+'</button>';
const tete = (ctx, leg, cols) => '<caption class="fw-sr">'+ctx.esc(T(ctx,leg))+'</caption><thead><tr>'+cols.map(c=>'<th scope="col">'+ctx.esc(T(ctx,c))+'</th>').join("")+'</tr></thead>';
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const champ = (ctx, l, h) => '<label class="fwf-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
/* correctif 37 : saisie conservée au rendu et après une erreur (E.form) ; droits renvoyés par le serveur */
const inp = (ctx, id, attrs, def) => '<input id="'+id+'" data-fwmc="f:'+id+'" value="'+ctx.esc(ctx.etat.form[id] != null ? ctx.etat.form[id] : (def == null ? "" : def))+'"'+(attrs||"")+'>';
const sel = (ctx, id, opts, vide, def) => { const v = ctx.etat.form[id] != null ? ctx.etat.form[id] : (def == null ? "" : String(def)); return '<select id="'+id+'" data-fwmc="f:'+id+'">'+(vide != null ? '<option value="">'+ctx.esc(vide)+'</option>' : '')+opts.map(([k, l])=>'<option value="'+ctx.esc(k)+'"'+(String(k) === v ? ' selected' : '')+'>'+ctx.esc(l)+'</option>').join("")+'</select>'; };
const droits = ctx => { const E = ctx.etat, d = (E.cat||{}).droits || (E.B||{}).droits || (E.S||{}).droits || (E.H||{}).droits || (E.session||{}).droits, r = ctx.rang("EMP"); return d || {creer:r >= 2, modifier:r >= 2, valider:r >= 3, parametrer:r >= 4, exporter:r >= 2}; };
const aujL = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"besoins", stB:"ouvert", stS:"", offB:0, offS:0, offH:0, B:null, S:null, cat:null, H:null, filtreH:"", session:null, form:{}, editS:null, editC:null, hist:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"] && !E[k+"Err"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false; ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; E[k+"Err"] = msgErr(ctx, e); ctx.rendre(); }); } };
  get("cat", "api/v1/formation/catalogue");
  if (E.onglet === "besoins") get("B", "api/v1/formation/besoins?limit=50&offset="+E.offB+"&statut="+E.stB);
  if (E.onglet === "sessions" && !E.session) get("S", "api/v1/formation/sessions?limit=50&offset="+E.offS+"&statut="+E.stS);
  if (E.onglet === "habilitations") get("H", "api/v1/formation/habilitations?limit=50&offset="+E.offH+"&filtre="+E.filtreH);
}
const optsCat = (ctx, type) => ((ctx.etat.cat||{}).catalogue||[]).filter(c=>!type || c.type === type).map(c=>[c.id, c.code+" — "+c.titre]);
function erreurOuCharge(ctx, k){ const E = ctx.etat; return E[k+"Err"] ? '<div class="fw-note warn" role="alert">'+ctx.esc(E[k+"Err"])+' <button class="fw-btn sm" data-act="fwm:reessayer" data-k="'+k+'">'+ctx.esc(T(ctx,"reessayer"))+'</button></div>' : '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
function vueBesoins(ctx){
  const E = ctx.etat, X = E.B, dr = droits(ctx), dis = E.envoi ? ' disabled' : '';
  return (dr.creer ? '<div class="fw-card fw-u-p fwf-form">'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwfBMat", ' maxlength="40"'))+champ(ctx, T(ctx,"formation"), sel(ctx, "fwfBCat", optsCat(ctx), "—"))+
      '<button class="fw-btn" data-act="fwm:besoin"'+dis+'>'+ctx.esc(T(ctx,"besoinManuel"))+'</button></div>' : '')+
    '<div class="fw-toolbar">'+(dr.valider ? '<button class="fw-btn pri" data-act="fwm:generer"'+dis+'>'+ctx.esc(T(ctx,"generer"))+'</button>' : '')+
    '<select data-fwmc="stB" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+["ouvert","planifie","realise","annule"].map(s=>'<option value="'+s+'"'+(E.stB === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select>'+
    (X ? pager(ctx, "pageB", E.offB, X.total) : '')+'</div>'+
    (!X ? erreurOuCharge(ctx, "B") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "l_besoins", ["salarie","formation","origine"].concat(dr.valider && E.stB === "ouvert" ? ["actions"] : []))+'<tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</td><td>'+ctx.esc(r.code+" — "+r.titre)+'</td><td>'+ctx.esc(T(ctx,"o_"+r.origine))+'</td>'+
        (dr.valider && E.stB === "ouvert" ? '<td><button class="fw-btn sm" data-act="fwm:annulerBesoin" data-id="'+ctx.esc(r.id)+'" data-nom="'+ctx.esc((r.nom || r.mat)+" — "+r.code)+'" aria-label="'+ctx.esc(T(ctx,"annulerBesoin")+" : "+(r.nom || r.mat)+" — "+r.code)+'"'+dis+'>'+ctx.esc(T(ctx,"annulerBesoin"))+'</button></td>' : '')+'</tr>').join("")+'</tbody></table>');
}
function formSession(ctx, s){
  const E = ctx.etat, sites = (E.cat||{}).sites || [], k = s ? "fwfE" : "fwf", dis = E.envoi ? ' disabled aria-busy="true"' : '';
  return '<div class="fw-card fw-u-p fwf-form">'+(s ? '' : champ(ctx, T(ctx,"formation"), sel(ctx, k+"Cat", optsCat(ctx), null)))+champ(ctx, T(ctx,"debut"), inp(ctx, k+"Deb", ' type="date"', s && s.debut))+
    champ(ctx, T(ctx,"fin"), inp(ctx, k+"Fin", ' type="date"', s && s.fin))+champ(ctx, T(ctx,"lieu"), inp(ctx, k+"Lieu", ' maxlength="80"', s && s.lieu))+champ(ctx, T(ctx,"formateur"), inp(ctx, k+"Form", ' maxlength="80"', s && s.formateur))+
    champ(ctx, T(ctx,"places"), inp(ctx, k+"Pl", ' type="number" min="1" max="500" step="1"', s ? s.places : 12))+(sites.length ? champ(ctx, T(ctx,"site"), sel(ctx, k+"Site", sites.map(z=>[z.id, z.nom]), T(ctx,"aucunSite"), s && s.site_id)) : '')+
    (s ? '<button class="fw-btn pri" data-act="fwm:majSession"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn" data-act="fwm:finEditS">'+ctx.esc(T(ctx,"annuler"))+'</button>'
      : '<label class="fwf-chk"><input type="checkbox" id="fwfBes" data-fwmc="f:fwfBes"'+(E.form.fwfBes === false ? '' : ' checked')+'> '+ctx.esc(T(ctx,"inscrireBesoins"))+'</label><button class="fw-btn pri" data-act="fwm:session"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "creerSession"))+'</button>')+'</div>';
}
function vueSessions(ctx){
  const E = ctx.etat, dr = droits(ctx);
  if (E.session) return vueSession(ctx);
  const S = (E.S||{}).sessions;
  return (dr.valider ? formSession(ctx, null) : '')+
    '<div class="fw-toolbar"><select data-fwmc="stS" aria-label="'+ctx.esc(T(ctx,"statut"))+'"><option value="">'+ctx.esc(T(ctx,"tous"))+'</option>'+["planifiee","realisee","annulee"].map(s=>'<option value="'+s+'"'+(E.stS === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"ss_"+s))+'</option>').join("")+'</select>'+(E.S ? pager(ctx, "pageS", E.offS, E.S.total) : '')+'</div>'+
    (!S ? erreurOuCharge(ctx, "S") : !S.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "l_sessions", ["formation","debut","fin","inscrits","statut"])+'<tbody>'+
      S.map(s=>'<tr><td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(s.id)+'">'+ctx.esc(s.code+" — "+s.titre)+'</button></td><td>'+ctx.esc(ctx.dateAff(s.debut))+'</td><td>'+ctx.esc(ctx.dateAff(s.fin))+'</td><td class="fw-num">'+s.inscrits+' / '+s.places+'</td><td>'+ctx.esc(T(ctx,"ss_"+s.statut))+'</td></tr>').join("")+'</tbody></table>');
}
function vueSession(ctx){
  const E = ctx.etat, D = E.session, s = D.session, dr = droits(ctx), ouverte = s.statut === "planifiee", commencee = s.debut <= aujL(), saisie = ouverte && dr.modifier && commencee, dis = E.envoi ? ' disabled' : '';
  const restants = D.inscriptions.filter(i=>i.presence === "inscrit").length;
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong>'+ctx.esc(s.titre)+'</strong><span class="fw-hint">'+ctx.esc(ctx.dateAff(s.debut)+" "+fl(ctx, "→")+" "+ctx.dateAff(s.fin)+(s.lieu ? " · "+s.lieu : "")+(s.formateur ? " · "+s.formateur : "")+" · "+(s.inscrits || 0)+" / "+s.places)+'</span><span class="fw-tag">'+ctx.esc(T(ctx,"ss_"+s.statut))+'</span>'+
    (dr.exporter ? '<a class="fw-btn sm" href="api/v1/formation/sessions/'+encodeURIComponent(s.id)+'/emargement">'+ctx.esc(T(ctx,"emargement"))+'</a>' : '')+
    (ouverte && dr.valider && !E.editS ? '<button class="fw-btn sm" data-act="fwm:editS">'+ctx.esc(T(ctx,"modifier"))+'</button>' : '')+'</div>'+
    (E.editS ? formSession(ctx, s) : '')+
    (D.horsPerimetre ? '<p class="fw-hint">'+ctx.esc(T(ctx,"horsPerim").replace("{n}", D.horsPerimetre))+'</p>' : '')+
    (ouverte && !commencee ? '<p class="fw-hint">'+ctx.esc(T(ctx,"nonCommencee").replace("{d}", ctx.dateAff(s.debut)))+'</p>' : '')+
    (ouverte && dr.creer && s.fin >= aujL() ? '<div class="fwf-form">'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwfMat", ' maxlength="40"'))+'<button class="fw-btn" data-act="fwm:inscrire"'+dis+'>'+ctx.esc(T(ctx,"inscrire"))+'</button></div>' : '')+
    (saisie && restants ? '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:lot" data-p="present"'+dis+'>'+ctx.esc(T(ctx,"tousPresents"))+'</button><button class="fw-btn" data-act="fwm:lot" data-p="absent"'+dis+'>'+ctx.esc(T(ctx,"tousAbsents"))+'</button></div>' : '')+
    (!D.inscriptions.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "l_inscrits", ["salarie","presence","resultat"].concat(ouverte && dr.modifier ? ["actions"] : []))+'<tbody>'+
      D.inscriptions.map(i=>{ const n = (i.nom || i.mat)+" · "+i.mat; return '<tr><td>'+ctx.esc(n)+'</td><td><select id="fwfP-'+ctx.esc(i.id)+'" data-fwmc="presence" data-id="'+ctx.esc(i.id)+'"'+(saisie && !E.envoi ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"presenceDe").replace("{n}", n))+'">'+["inscrit","present","absent","excuse"].map(x=>'<option value="'+x+'"'+(i.presence === x ? ' selected' : '')+'>'+ctx.esc(T(ctx,"p_"+x))+'</option>').join("")+'</select></td>'+
        '<td><select id="fwfR-'+ctx.esc(i.id)+'" data-fwmc="resultat" data-id="'+ctx.esc(i.id)+'"'+(saisie && !E.envoi && i.presence === "present" ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"resultatDe").replace("{n}", n))+'"><option value="">'+ctx.esc(T(ctx,"sans"))+'</option>'+["acquis","non_acquis"].map(x=>'<option value="'+x+'"'+(i.resultat === x ? ' selected' : '')+'>'+ctx.esc(T(ctx,"r_"+x))+'</option>').join("")+'</select></td>'+
        (ouverte && dr.modifier ? '<td><button class="fw-btn sm" data-act="fwm:desinscrire" data-id="'+ctx.esc(i.id)+'" data-nom="'+ctx.esc(n)+'" aria-label="'+ctx.esc(T(ctx,"desinscrire")+" : "+n)+'"'+dis+'>'+ctx.esc(T(ctx,"desinscrire"))+'</button></td>' : '')+'</tr>'; }).join("")+'</tbody></table>')+
    (ouverte && dr.valider ? '<div class="fw-toolbar" style="margin-top:10px"><button class="fw-btn pri" data-act="fwm:cloturer"'+dis+'>'+ctx.esc(T(ctx,"cloturer"))+'</button><button class="fw-btn dgr" data-act="fwm:annulerSession"'+dis+'>'+ctx.esc(T(ctx,"annulerSession"))+'</button></div>' : '');
}
function vueHabilitations(ctx){
  const E = ctx.etat, X = E.H, dr = droits(ctx), dis = E.envoi ? ' disabled' : '', H = E.hist;
  return (dr.valider ? '<div class="fw-card fw-u-p fwf-form"><strong>'+ctx.esc(T(ctx,"habManuelle"))+'</strong>'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwfHMat", ' maxlength="40"'))+champ(ctx, T(ctx,"habilitations"), sel(ctx, "fwfHCat", optsCat(ctx, "habilitation"), "—"))+
      champ(ctx, T(ctx,"obtenueLe"), inp(ctx, "fwfHLe", ' type="date"'))+'<button class="fw-btn" data-act="fwm:habManuelle"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="filtreH" aria-label="'+ctx.esc(T(ctx,"habilitations"))+'"><option value="">'+ctx.esc(T(ctx,"toutes"))+'</option><option value="echeance"'+(E.filtreH === "echeance" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"aEcheance"))+'</option></select>'+(X ? pager(ctx, "pageH", E.offH, X.total) : '')+
    champ(ctx, T(ctx,"historique"), inp(ctx, "fwfHist", ' maxlength="40" placeholder="'+ctx.esc(T(ctx,"matricule"))+'"'))+'<button class="fw-btn sm" data-act="fwm:hist">'+ctx.esc(T(ctx,"voirHist"))+'</button></div>'+
    (H ? '<div class="fw-card fw-u-p" style="margin-bottom:10px"><strong>'+ctx.esc(T(ctx,"historique")+" — "+H.mat)+'</strong><ul class="fw-sm">'+H.sessions.map(z=>'<li>'+ctx.esc(ctx.dateAff(z.debut)+" — "+z.code+" "+z.titre+" — "+T(ctx,"ss_"+z.statut)+" — "+T(ctx,"p_"+z.presence)+(z.resultat ? " / "+T(ctx,"r_"+z.resultat) : ""))+'</li>').join("")+
      H.habilitations.map(z=>'<li>'+ctx.esc(z.code+" "+z.titre+" — "+T(ctx,"obtenue")+" "+ctx.dateAff(z.obtenue_le)+(z.expire_le ? " · "+T(ctx,"echeance")+" "+ctx.dateAff(z.expire_le) : ""))+'</li>').join("")+
      H.besoins.map(z=>'<li>'+ctx.esc(z.code+" "+z.titre+" — "+T(ctx,"s_"+z.statut)+" ("+T(ctx,"o_"+z.origine)+")")+'</li>').join("")+'</ul></div>' : '')+
    (!X ? erreurOuCharge(ctx, "H") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "l_habilitations", ["salarie","habilitations","obtenue","echeance","statut"])+'<tbody>'+
      X.lignes.map(h=>'<tr><td>'+ctx.esc((h.nom || h.mat)+" · "+h.mat)+'</td><td>'+ctx.esc(h.code+" — "+h.titre+(h.actif === 0 ? " "+T(ctx,"retiree") : ""))+'</td><td>'+ctx.esc(ctx.dateAff(h.obtenue_le))+'</td><td>'+ctx.esc(h.expire_le ? ctx.dateAff(h.expire_le) : "—")+'</td><td><span class="fwf-e fwf-'+h.etat+'">'+ctx.esc(T(ctx,"e_"+h.etat))+'</span></td></tr>').join("")+'</tbody></table>');
}
function vueCatalogue(ctx){
  const E = ctx.etat, C = E.cat, peut = droits(ctx).parametrer, ed = E.editC && C ? C.catalogue.find(c=>c.id === E.editC) : null, dis = E.envoi ? ' disabled aria-busy="true"' : '';
  const f = (k, def) => ed ? def : undefined;
  return (peut ? '<div class="fw-card fw-u-p fwf-form">'+(ed ? '<strong>'+ctx.esc(T(ctx,"modifier")+" : "+ed.code)+'</strong>' : '')+champ(ctx, T(ctx,"code"), inp(ctx, "fwfCode", ' maxlength="20"', f(0, ed && ed.code)))+champ(ctx, T(ctx,"intitule"), inp(ctx, "fwfTit", ' maxlength="120"', f(0, ed && ed.titre)))+
      champ(ctx, T(ctx,"type"), sel(ctx, "fwfType", [["formation", T(ctx,"t_formation")], ["habilitation", T(ctx,"t_habilitation")]], null, ed && ed.type))+
      champ(ctx, T(ctx,"duree"), inp(ctx, "fwfDur", ' type="number" min="0" step="0.5"', f(0, ed && ed.duree_h)))+champ(ctx, T(ctx,"validite"), inp(ctx, "fwfVal", ' type="number" min="1" max="240" step="1"', f(0, ed && ed.validite_mois)))+
      champ(ctx, T(ctx,"competence"), sel(ctx, "fwfComp", ((C||{}).competences||[]).map(c=>[c.id, c.code+" — "+c.nom]), T(ctx,"sans"), ed && ed.competence_id))+
      champ(ctx, T(ctx,"niveau"), sel(ctx, "fwfNiv", [1,2,3,4].map(n=>[String(n), String(n)]), null, ed ? ed.niveau_vise || 1 : 1))+champ(ctx, T(ctx,"organisme"), inp(ctx, "fwfOrg", ' maxlength="80"', f(0, ed && ed.organisme)))+
      (ed ? '<button class="fw-btn pri" data-act="fwm:majCatalogue"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn" data-act="fwm:finEditC">'+ctx.esc(T(ctx,"annuler"))+'</button>'
        : '<button class="fw-btn pri" data-act="fwm:catalogue"'+dis+'>'+ctx.esc(T(ctx,"ajouter"))+'</button>')+'</div>' : '')+
    (!C ? erreurOuCharge(ctx, "cat") : !C.catalogue.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, "l_catalogue", ["code","intitule","type","competence","validite"].concat(peut ? ["actions"] : []))+'<tbody>'+
      C.catalogue.map(c=>{ const k = (C.competences||[]).find(x=>x.id === c.competence_id); return '<tr><td>'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.titre)+'</td><td>'+ctx.esc(T(ctx,"t_"+c.type))+'</td><td>'+ctx.esc(k ? k.code+" "+fl(ctx, "→")+" "+c.niveau_vise : "—")+'</td><td>'+ctx.esc(c.validite_mois ? String(c.validite_mois) : "—")+'</td>'+
        (peut ? '<td><button class="fw-btn sm" data-act="fwm:editC" data-id="'+ctx.esc(c.id)+'" aria-label="'+ctx.esc(T(ctx,"modifier")+" : "+c.code)+'">'+ctx.esc(T(ctx,"modifier"))+'</button> <button class="fw-btn sm" data-act="fwm:retirerCat" data-id="'+ctx.esc(c.id)+'" data-nom="'+ctx.esc(c.code+" — "+c.titre)+'" aria-label="'+ctx.esc(T(ctx,"retirer")+" : "+c.code)+'">'+ctx.esc(T(ctx,"retirer"))+'</button></td>' : '')+'</tr>'; }).join("")+'</tbody></table>');
}
function ouvrir(ctx, id, focus){ return ctx.api("api/v1/formation/sessions/"+encodeURIComponent(id)).then(j=>{ ctx.etat.session = j; ctx.rendre(); if (focus) setTimeout(()=>{ const x = document.getElementById(focus); if (x) x.focus(); }, 80); }); }
const nb = v => v === "" ? undefined : Number(v);
FIWAKTI_MODULES.enregistrer({
  id:"FW-Formation",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["besoins","besoins"],["sessions","sessions"],["habilitations","habilitations"],["catalogue","catalogue"]];
    return '<div class="fw-module fwf"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l])=>'<button type="button" role="tab" id="fwfT-'+k+'" aria-controls="fwfP" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwfP" role="tabpanel" aria-labelledby="fwfT-'+E.onglet+'">'+(E.onglet === "sessions" ? vueSessions(ctx) : E.onglet === "habilitations" ? vueHabilitations(ctx) : E.onglet === "catalogue" ? vueCatalogue(ctx) : vueBesoins(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    /* correctif 36 : f est appelée AVANT le rendu ; correctif 37 : la saisie est vidée seulement après un succès */
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const vider = pre => Object.keys(E.form).forEach(k=>{ if (k.indexOf(pre) === 0) delete E.form[k]; });
    const sid = () => E.session.session.id;
    if (a === "onglet"){ E.onglet = el.dataset.o; E.session = null; E.editS = null; E.B = E.S = E.H = null; E.BErr = E.SErr = E.HErr = null; ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fwfT-"+el.dataset.o); if (x) x.focus(); }, 80); }
    if (a === "reessayer"){ E[el.dataset.k+"Err"] = null; return ctx.rendre(); }
    if (a === "pageB" || a === "pageS" || a === "pageH"){ const k = a.slice(4), o = "off"+k; E[o] = Math.max(0, E[o] + Number(el.dataset.d)); E[k] = null; return ctx.rendre(); }
    if (a === "lot"){ const n = E.session.inscriptions.filter(i=>i.presence === "inscrit").length, pl = el.dataset.p;
      return ctx.confirmer({titre:T(ctx, pl === "present" ? "tousPresents" : "tousAbsents"), message:T(ctx,"lotQ").replace("{n}", n).replace("{p}", T(ctx, pl === "present" ? "tousPresents" : "tousAbsents"))}).then(r=>{ if (!r.ok) return;
        return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid())+"/presence-lot", {corps:{presence:pl, resultat:pl === "present" ? "acquis" : undefined}}).then(()=>ouvrir(ctx, sid()))); }); }
    if (a === "annulerSession") return ctx.confirmer({titre:T(ctx,"annulerSession"), message:T(ctx,"annulerSessionQ").replace("{n}", E.session.session.titre), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid())+"/annuler", {corps:{}}).then(()=>{ ok(); return ouvrir(ctx, sid()); })); });
    if (a === "retirerCat") return ctx.confirmer({titre:T(ctx,"retirer"), message:T(ctx,"retirerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/catalogue/"+encodeURIComponent(el.dataset.id)+"/retirer", {corps:{}}).then(()=>{ ok(); E.cat = null; })); });
    /* correctif 37 : aperçu du nombre de besoins avant de les créer */
    if (a === "generer") return verrou(()=>ctx.api("api/v1/formation/besoins/generer", {corps:{apercu:true}}).then(j=>{ if (!j.apercu){ ctx.flash(T(ctx,"aucunBesoinGen"), "ok"); return; }
      return ctx.confirmer({titre:T(ctx,"generer"), message:T(ctx,"generesQ").replace("{n}", j.apercu)}).then(r=>{ if (!r.ok) return;
        return ctx.api("api/v1/formation/besoins/generer", {corps:{}}).then(k=>{ ctx.flash(T(ctx,"generes").replace("{n}", k.crees || 0), "ok"); E.B = null; }); }); }));
    if (a === "besoin"){ const corps = {mat:val("fwfBMat"), catalogueId:val("fwfBCat")};
      return verrou(()=>ctx.api("api/v1/formation/besoins", {corps}).then(()=>{ ok(); vider("fwfB"); E.B = null; })); }
    if (a === "annulerBesoin") return ctx.confirmer({titre:T(ctx,"annulerBesoin"), message:T(ctx,"annulerBesoinQ").replace("{n}", el.dataset.nom || ""), motif:true, motifObligatoire:true, motifLabel:T(ctx,"motif"), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/besoins/"+encodeURIComponent(el.dataset.id)+"/annuler", {corps:{motif:r.motif || ""}}).then(()=>{ ok(); E.B = null; })); });
    const corpsSession = k => ({debut:val(k+"Deb"), fin:val(k+"Fin"), lieu:val(k+"Lieu"), formateur:val(k+"Form"), places:nb(val(k+"Pl")), siteId:val(k+"Site") || null});
    if (a === "session"){ const corps = Object.assign(corpsSession("fwf"), {catalogueId:val("fwfCat"), besoins:!!(document.getElementById("fwfBes")||{}).checked});
      return verrou(()=>ctx.api("api/v1/formation/sessions", {corps}).then(j=>{ ok(); ["fwfDeb","fwfFin","fwfLieu","fwfForm","fwfPl","fwfSite"].forEach(k=>{ delete E.form[k]; }); E.S = null; return ouvrir(ctx, j.id); })); }
    if (a === "editS"){ E.editS = true; vider("fwfE"); return ctx.rendre(); }
    if (a === "finEditS"){ E.editS = null; vider("fwfE"); return ctx.rendre(); }
    if (a === "majSession"){ const corps = corpsSession("fwfE");
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid()), {corps}).then(()=>{ ok(); E.editS = null; vider("fwfE"); E.S = null; return ouvrir(ctx, sid()); })); }
    if (a === "voir") return ouvrir(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.session = null; E.editS = null; E.S = null; return ctx.rendre(); }
    if (a === "inscrire"){ const corps = {mat:val("fwfMat")};
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid())+"/inscrire", {corps}).then(()=>{ ok(); delete E.form.fwfMat; return ouvrir(ctx, sid(), "fwfMat"); })); }
    if (a === "desinscrire") return ctx.confirmer({titre:T(ctx,"desinscrire"), message:T(ctx,"desinscrireQ").replace("{n}", el.dataset.nom || "")}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid())+"/desinscrire", {corps:{inscriptionId:el.dataset.id}}).then(()=>{ ok(); return ouvrir(ctx, sid()); })); });
    if (a === "cloturer") return ctx.confirmer({titre:T(ctx,"cloturer"), message:T(ctx,"cloturerQ").replace("{n}", E.session.session.titre)}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(sid())+"/cloturer", {corps:{}}).then(j=>{ ctx.flash(T(ctx,"clotureOk").replace("{n}", j.niveaux || 0).replace("{h}", j.habilitations || 0), "ok"); return ouvrir(ctx, sid()); })); });
    const corpsCat = () => ({code:val("fwfCode"), titre:val("fwfTit"), type:val("fwfType") || "formation", dureeH:nb(val("fwfDur")), validiteMois:val("fwfType") === "habilitation" ? nb(val("fwfVal")) : undefined, competenceId:val("fwfComp") || null, niveauVise:nb(val("fwfNiv")), organisme:val("fwfOrg")});
    if (a === "catalogue"){ const corps = corpsCat();
      return verrou(()=>ctx.api("api/v1/formation/catalogue", {corps}).then(()=>{ ok(); ["fwfCode","fwfTit","fwfType","fwfDur","fwfVal","fwfComp","fwfNiv","fwfOrg"].forEach(k=>{ delete E.form[k]; }); E.cat = null; })); }
    if (a === "editC"){ E.editC = el.dataset.id; ["fwfCode","fwfTit","fwfType","fwfDur","fwfVal","fwfComp","fwfNiv","fwfOrg"].forEach(k=>{ delete E.form[k]; }); ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fwfCode"); if (x) x.focus(); }, 80); }
    if (a === "finEditC"){ E.editC = null; ["fwfCode","fwfTit","fwfType","fwfDur","fwfVal","fwfComp","fwfNiv","fwfOrg"].forEach(k=>{ delete E.form[k]; }); return ctx.rendre(); }
    if (a === "majCatalogue"){ const corps = corpsCat(), idc = E.editC;
      return verrou(()=>ctx.api("api/v1/formation/catalogue/"+encodeURIComponent(idc), {corps}).then(()=>{ ok(); E.editC = null; ["fwfCode","fwfTit","fwfType","fwfDur","fwfVal","fwfComp","fwfNiv","fwfOrg"].forEach(k=>{ delete E.form[k]; }); E.cat = null; })); }
    if (a === "habManuelle"){ const corps = {mat:val("fwfHMat"), catalogueId:val("fwfHCat"), obtenueLe:val("fwfHLe")};
      return verrou(()=>ctx.api("api/v1/formation/habilitations", {corps}).then(()=>{ ok(); vider("fwfH"); E.H = null; })); }
    if (a === "hist"){ const mat = val("fwfHist"); if (!mat) return; return ctx.api("api/v1/formation/historique?mat="+encodeURIComponent(mat)).then(j=>{ E.hist = j; ctx.rendre(); }).catch(ko); }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.type === "checkbox" ? el.checked : el.value; return; }
    if (k === "stB"){ E.stB = el.value; E.offB = 0; E.B = null; return ctx.rendre(); }
    if (k === "stS"){ E.stS = el.value; E.offS = 0; E.S = null; return ctx.rendre(); }
    if (k === "filtreH"){ E.filtreH = el.value; E.offH = 0; E.H = null; return ctx.rendre(); }
    /* correctif 37 : le focus revient sur la liste modifiée */
    if (k === "presence" || k === "resultat"){ if (E.envoi) return; const corps = {inscriptionId:el.dataset.id}; corps[k] = el.value; const focus = el.id; E.envoi = true;
      return ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/presence", {corps}).catch(e=>ctx.flash(msgErr(ctx, e), "err")).then(()=>{ E.envoi = false; return ouvrir(ctx, E.session.session.id, focus); }); }
  }
});
})();
