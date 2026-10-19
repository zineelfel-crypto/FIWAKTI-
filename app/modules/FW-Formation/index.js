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
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : "→") : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const pager = (ctx, act, off, total) => '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", total ? off+1 : 0).replace("{b}", Math.min(off+50, total)).replace("{n}", total))+'</span><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="-50"'+(off ? '' : ' disabled')+' aria-label="‹">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:'+act+'" data-d="50"'+(off+50 < total ? '' : ' disabled')+' aria-label="›">'+fl(ctx, "›")+'</button>';
const tete = (ctx, cols) => '<caption class="fw-sr">'+ctx.esc(T(ctx,"liste"))+'</caption><thead><tr>'+cols.map(c=>'<th scope="col">'+ctx.esc(T(ctx,c))+'</th>').join("")+'</tr></thead>';
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const champ = (ctx, l, h) => '<label class="fwf-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"besoins", stB:"ouvert", offB:0, offS:0, offH:0, B:null, S:null, cat:null, H:null, filtreH:"", session:null});
  const get = (k, url) => { if (!E[k] && !E[k+"En"] && !E[k+"Err"]){ E[k+"En"] = true; ctx.api(url).then(j=>{ E[k] = j; E[k+"En"] = false; ctx.rendre(); }).catch(e=>{ E[k+"En"] = false; E[k+"Err"] = msgErr(ctx, e); ctx.rendre(); }); } };
  get("cat", "api/v1/formation/catalogue");
  if (E.onglet === "besoins") get("B", "api/v1/formation/besoins?limit=50&offset="+E.offB+"&statut="+E.stB);
  if (E.onglet === "sessions" && !E.session) get("S", "api/v1/formation/sessions?limit=50&offset="+E.offS);
  if (E.onglet === "habilitations") get("H", "api/v1/formation/habilitations?limit=50&offset="+E.offH+"&filtre="+E.filtreH);
}
function optionsCat(ctx, type){ return ((ctx.etat.cat||{}).catalogue||[]).filter(c=>!type || c.type === type).map(c=>'<option value="'+ctx.esc(c.id)+'">'+ctx.esc(c.code+" — "+c.titre)+'</option>').join(""); }
function vueBesoins(ctx){
  const E = ctx.etat, X = E.B, val3 = ctx.rang("EMP") >= 3;
  return '<div class="fw-toolbar">'+(val3 ? '<button class="fw-btn pri" data-act="fwm:generer">'+ctx.esc(T(ctx,"generer"))+'</button>' : '')+
    '<select data-fwmc="stB">'+["ouvert","planifie","realise","annule"].map(s=>'<option value="'+s+'"'+(E.stB === s ? ' selected' : '')+'>'+ctx.esc(T(ctx,"s_"+s))+'</option>').join("")+'</select>'+
    (X ? pager(ctx, "pageB", E.offB, X.total) : '')+'</div>'+
    (!X ? erreurOuCharge(ctx, "B") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, ["salarie","formation","origine"])+'<tbody>'+
      X.lignes.map(r=>'<tr><td>'+ctx.esc((r.nom || r.mat)+" · "+r.mat)+'</td><td>'+ctx.esc(r.code+" — "+r.titre)+'</td><td>'+ctx.esc(T(ctx,"o_"+r.origine))+'</td></tr>').join("")+'</tbody></table>');
}
function erreurOuCharge(ctx, k){ const E = ctx.etat; return E[k+"Err"] ? '<div class="fw-note warn" role="alert">'+ctx.esc(E[k+"Err"])+' <button class="fw-btn sm" data-act="fwm:reessayer" data-k="'+k+'">'+ctx.esc(T(ctx,"reessayer"))+'</button></div>' : '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
function vueSessions(ctx){
  const E = ctx.etat, val3 = ctx.rang("EMP") >= 3;
  if (E.session) return vueSession(ctx);
  const S = (E.S||{}).sessions;
  return (val3 ? '<div class="fw-card fw-u-p fwf-form">'+champ(ctx, T(ctx,"formation"), '<select id="fwfCat">'+optionsCat(ctx)+'</select>')+champ(ctx, T(ctx,"debut"), '<input id="fwfDeb" type="date">')+
      champ(ctx, T(ctx,"fin"), '<input id="fwfFin" type="date">')+champ(ctx, T(ctx,"lieu"), '<input id="fwfLieu">')+champ(ctx, T(ctx,"formateur"), '<input id="fwfForm">')+
      champ(ctx, T(ctx,"places"), '<input id="fwfPl" type="number" min="1" value="12">')+'<label class="fwf-chk"><input type="checkbox" id="fwfBes" checked> '+ctx.esc(T(ctx,"inscrireBesoins"))+'</label>'+
      '<button class="fw-btn pri" data-act="fwm:session"'+(E.envoi ? ' disabled aria-busy="true"' : '')+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "creerSession"))+'</button></div>' : '')+
    (E.S && E.S.total > 50 ? '<div class="fw-toolbar">'+pager(ctx, "pageS", E.offS, E.S.total)+'</div>' : '')+
    (!S ? erreurOuCharge(ctx, "S") : !S.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, ["formation","debut","fin","inscrits","statut"])+'<tbody>'+
      S.map(s=>'<tr><td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(s.id)+'">'+ctx.esc(s.code+" — "+s.titre)+'</button></td><td>'+ctx.esc(ctx.dateAff(s.debut))+'</td><td>'+ctx.esc(ctx.dateAff(s.fin))+'</td><td class="fw-num">'+s.inscrits+' / '+s.places+'</td><td>'+ctx.esc(T(ctx,"ss_"+s.statut))+'</td></tr>').join("")+'</tbody></table>');
}
function vueSession(ctx){
  const E = ctx.etat, D = E.session, s = D.session, ouverte = s.statut === "planifiee", saisie = ouverte && ctx.rang("EMP") >= 2, val3 = ouverte && ctx.rang("EMP") >= 3;
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong>'+ctx.esc(s.titre)+'</strong><span class="fw-hint">'+ctx.esc(ctx.dateAff(s.debut)+" → "+ctx.dateAff(s.fin)+(s.lieu ? " · "+s.lieu : ""))+'</span><span class="fw-tag">'+ctx.esc(T(ctx,"ss_"+s.statut))+'</span></div>'+
    (saisie ? '<div class="fwf-form">'+champ(ctx, T(ctx,"matricule"), '<input id="fwfMat">')+'<button class="fw-btn" data-act="fwm:inscrire"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"inscrire"))+'</button>'+
      (D.inscriptions.some(i=>i.presence === "inscrit") ? '<button class="fw-btn" data-act="fwm:lot" data-p="present"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"tousPresents"))+'</button><button class="fw-btn" data-act="fwm:lot" data-p="absent"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"tousAbsents"))+'</button>' : '')+'</div>' : '')+
    (!D.inscriptions.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, ["salarie","presence","resultat"])+'<tbody>'+
      D.inscriptions.map(i=>'<tr><td>'+ctx.esc((i.nom || i.mat)+" · "+i.mat)+'</td><td><select data-fwmc="presence" data-id="'+ctx.esc(i.id)+'"'+(saisie ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"presence"))+'">'+["inscrit","present","absent"].map(x=>'<option value="'+x+'"'+(i.presence === x ? ' selected' : '')+'>'+ctx.esc(T(ctx,"p_"+x))+'</option>').join("")+'</select></td>'+
        '<td><select data-fwmc="resultat" data-id="'+ctx.esc(i.id)+'"'+(saisie && i.presence === "present" ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"resultat"))+'"><option value="">'+ctx.esc(T(ctx,"sans"))+'</option>'+["acquis","non_acquis"].map(x=>'<option value="'+x+'"'+(i.resultat === x ? ' selected' : '')+'>'+ctx.esc(T(ctx,"r_"+x))+'</option>').join("")+'</select></td></tr>').join("")+'</tbody></table>')+
    (val3 ? '<div class="fw-toolbar" style="margin-top:10px"><button class="fw-btn pri" data-act="fwm:cloturer"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"cloturer"))+'</button><button class="fw-btn dgr" data-act="fwm:annulerSession"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"annulerSession"))+'</button></div>' : '');
}
function vueHabilitations(ctx){
  const E = ctx.etat, X = E.H;
  return '<div class="fw-toolbar"><select data-fwmc="filtreH" aria-label="'+ctx.esc(T(ctx,"habilitations"))+'"><option value="">'+ctx.esc(T(ctx,"toutes"))+'</option><option value="echeance"'+(E.filtreH === "echeance" ? ' selected' : '')+'>'+ctx.esc(T(ctx,"aEcheance"))+'</option></select>'+(X ? pager(ctx, "pageH", E.offH, X.total) : '')+'</div>'+
    (!X ? erreurOuCharge(ctx, "H") : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, ["salarie","habilitations","obtenue","echeance","statut"])+'<tbody>'+
      X.lignes.map(h=>'<tr><td>'+ctx.esc((h.nom || h.mat)+" · "+h.mat)+'</td><td>'+ctx.esc(h.code+" — "+h.titre)+'</td><td>'+ctx.esc(ctx.dateAff(h.obtenue_le))+'</td><td>'+ctx.esc(h.expire_le ? ctx.dateAff(h.expire_le) : "—")+'</td><td><span class="fwf-e fwf-'+h.etat+'">'+ctx.esc(T(ctx,"e_"+h.etat))+'</span></td></tr>').join("")+'</tbody></table>');
}
function vueCatalogue(ctx){
  const E = ctx.etat, C = E.cat, peut = ctx.rang("EMP") >= 4;
  return (peut ? '<div class="fw-card fw-u-p fwf-form">'+champ(ctx, T(ctx,"code"), '<input id="fwfCode">')+champ(ctx, T(ctx,"intitule"), '<input id="fwfTit">')+
      champ(ctx, T(ctx,"type"), '<select id="fwfType"><option value="formation">'+ctx.esc(T(ctx,"t_formation"))+'</option><option value="habilitation">'+ctx.esc(T(ctx,"t_habilitation"))+'</option></select>')+
      champ(ctx, T(ctx,"duree"), '<input id="fwfDur" type="number" min="0" step="0.5">')+champ(ctx, T(ctx,"validite"), '<input id="fwfVal" type="number" min="1">')+
      champ(ctx, T(ctx,"competence"), '<select id="fwfComp"><option value="">'+ctx.esc(T(ctx,"sans"))+'</option>'+((C||{}).competences||[]).map(c=>'<option value="'+ctx.esc(c.id)+'">'+ctx.esc(c.code+" — "+c.nom)+'</option>').join("")+'</select>')+
      champ(ctx, T(ctx,"niveau"), '<select id="fwfNiv">'+[1,2,3,4].map(n=>'<option>'+n+'</option>').join("")+'</select>')+champ(ctx, T(ctx,"organisme"), '<input id="fwfOrg">')+
      '<button class="fw-btn pri" data-act="fwm:catalogue"'+(E.envoi ? ' disabled aria-busy="true"' : '')+'>'+ctx.esc(T(ctx,"ajouter"))+'</button></div>' : '')+
    (!C ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !C.catalogue.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucune"))+'</div>' :
    '<table class="fw-tbl">'+tete(ctx, ["code","intitule","type","competence","validite"])+'<tbody>'+
      C.catalogue.map(c=>{ const k = (C.competences||[]).find(x=>x.id === c.competence_id); return '<tr><td>'+ctx.esc(c.code)+'</td><td>'+ctx.esc(c.titre)+'</td><td>'+ctx.esc(T(ctx,"t_"+c.type))+'</td><td>'+ctx.esc(k ? k.code+" → "+c.niveau_vise : "—")+'</td><td>'+ctx.esc(c.validite_mois ? String(c.validite_mois) : "—")+(peut ? ' <button class="fw-btn sm" data-act="fwm:retirerCat" data-id="'+ctx.esc(c.id)+'" data-nom="'+ctx.esc(c.code+" — "+c.titre)+'" aria-label="'+ctx.esc(T(ctx,"retirer")+" : "+c.code)+'">'+ctx.esc(T(ctx,"retirer"))+'</button>' : '')+'</td></tr>'; }).join("")+'</tbody></table>');
}
function ouvrir(ctx, id){ return ctx.api("api/v1/formation/sessions/"+encodeURIComponent(id)).then(j=>{ ctx.etat.session = j; ctx.rendre(); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Formation",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["besoins","besoins"],["sessions","sessions"],["habilitations","habilitations"],["catalogue","catalogue"]];
    return '<div class="fw-module fwf"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l], i)=>'<button type="button" role="tab" id="fwfT-'+k+'" aria-controls="fwfP" tabindex="'+(E.onglet === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwfP" role="tabpanel" aria-labelledby="fwfT-'+E.onglet+'">'+(E.onglet === "sessions" ? vueSessions(ctx) : E.onglet === "habilitations" ? vueHabilitations(ctx) : E.onglet === "catalogue" ? vueCatalogue(ctx) : vueBesoins(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    /* correctif 34 : un seul envoi à la fois (le double clic créait deux sessions) */
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    const verrou = f => { if (E.envoi) return; E.envoi = true; ctx.rendre(); return Promise.resolve().then(f).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    if (a === "onglet"){ E.onglet = el.dataset.o; E.session = null; E.B = E.S = E.H = null; E.BErr = E.SErr = E.HErr = null; return ctx.rendre(); }
    if (a === "reessayer"){ E[el.dataset.k+"Err"] = null; return ctx.rendre(); }
    if (a === "pageB" || a === "pageS" || a === "pageH"){ const k = a.slice(4), o = "off"+k; E[o] = Math.max(0, E[o] + Number(el.dataset.d)); E[k] = null; return ctx.rendre(); }
    if (a === "lot") return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/presence-lot", {corps:{presence:el.dataset.p, resultat:el.dataset.p === "present" ? "acquis" : undefined}}).then(()=>ouvrir(ctx, E.session.session.id)).catch(ko));
    if (a === "annulerSession") return ctx.confirmer({titre:T(ctx,"annulerSession"), message:T(ctx,"annulerSessionQ").replace("{n}", E.session.session.titre), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/annuler", {corps:{}}).then(()=>{ ok(); return ouvrir(ctx, E.session.session.id); }).catch(ko)); });
    if (a === "retirerCat") return ctx.confirmer({titre:T(ctx,"retirer"), message:T(ctx,"retirerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/catalogue/"+encodeURIComponent(el.dataset.id)+"/retirer", {corps:{}}).then(()=>{ ok(); E.cat = null; }).catch(ko)); });
    if (a === "generer") return verrou(()=>ctx.api("api/v1/formation/besoins/generer", {corps:{}}).then(j=>{ ctx.flash(T(ctx,"generes").replace("{n}", j.crees || 0), "ok"); E.B = null; }).catch(ko));
    if (a === "session") return verrou(()=>ctx.api("api/v1/formation/sessions", {corps:{catalogueId:val("fwfCat"), debut:val("fwfDeb"), fin:val("fwfFin"), lieu:val("fwfLieu"), formateur:val("fwfForm"), places:Number(val("fwfPl"))||12, besoins:!!(document.getElementById("fwfBes")||{}).checked}})
      .then(j=>{ ok(); E.S = null; return ouvrir(ctx, j.id); }).catch(ko));
    if (a === "voir") return ouvrir(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.session = null; E.S = null; return ctx.rendre(); }
    if (a === "inscrire") return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/inscrire", {corps:{mat:val("fwfMat")}}).then(()=>{ ok(); return ouvrir(ctx, E.session.session.id); }).catch(ko));
    if (a === "cloturer") return ctx.confirmer({titre:T(ctx,"cloturer"), message:T(ctx,"cloturerQ").replace("{n}", E.session.session.titre)}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/cloturer", {corps:{}}).then(j=>{ ctx.flash(T(ctx,"clotureOk").replace("{n}", j.niveaux || 0).replace("{h}", j.habilitations || 0), "ok"); return ouvrir(ctx, E.session.session.id); }).catch(ko)); });
    if (a === "catalogue") return verrou(()=>ctx.api("api/v1/formation/catalogue", {corps:{code:val("fwfCode"), titre:val("fwfTit"), type:val("fwfType"), dureeH:Number(val("fwfDur"))||0, validiteMois:Number(val("fwfVal"))||0, competenceId:val("fwfComp") || null, niveauVise:Number(val("fwfNiv"))||1, organisme:val("fwfOrg")}})
      .then(()=>{ ok(); E.cat = null; }).catch(ko));
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "stB"){ E.stB = el.value; E.offB = 0; E.B = null; return ctx.rendre(); }
    if (k === "filtreH"){ E.filtreH = el.value; E.offH = 0; E.H = null; return ctx.rendre(); }
    if (k === "presence" || k === "resultat"){ const corps = {inscriptionId:el.dataset.id}; corps[k] = el.value;
      return ctx.api("api/v1/formation/sessions/"+encodeURIComponent(E.session.session.id)+"/presence", {corps}).then(()=>ouvrir(ctx, E.session.session.id)).catch(e=>ctx.flash(msgErr(ctx, e), "err")); }
  }
});
})();
