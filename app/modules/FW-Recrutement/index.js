/* FW-Recrutement — interface chargée à la demande. Postes ouverts, candidatures par étape, candidats, CV, entretiens,
   décisions motivées (droit de validation). Toutes les listes viennent du serveur, par page. */
(function(){
"use strict";
const L = {
  fr:{embaucher:"Créer la fiche salarié", salarieCree:"Salarié {m}", embaucheOk:"Fiche {m} créée et rattachée à la candidature.", embaucheDroit:"Création de fiche salarié : droit de saisie sur les salariés requis.", conservation:"Conservation des candidats non retenus", mois:"{n} mois", conservationH:"À l'échéance : identité, coordonnées, CV et entretiens effacés ; étapes conservées anonymes. Les candidats embauchés ne sont jamais effacés.", conservationConf:"Conserver les candidats non retenus {n} mois ? Ceux dont l'échéance est dépassée seront effacés tout de suite.", conservationOk:"Durée enregistrée ; {e} candidat(s) effacé(s).", titre:"Recrutement", lede:"Postes ouverts, candidatures par étape, entretiens et décisions motivées. Les CV sont chiffrés ; chaque consultation est tracée.",
    postes:"Postes", candidatures:"Candidatures", candidats:"Candidats", intitule:"Intitulé", fonction:"Fonction", nb:"Postes à pourvoir", description:"Description",
    ouvrir:"Ouvrir le poste", ouverts:"Ouverts", clos:"Clos", tous:"Tous", clore:"Clore", rouvrir:"Rouvrir", nbCand:"Candidatures", retenus:"Retenus", aucunPoste:"Aucun poste : ouvrez-en un.",
    choisirPoste:"Choisir un poste…", nom:"Nom", prenom:"Prénom", email:"Courriel", tel:"Téléphone", source:"Source", cv:"CV (PDF, PNG, JPEG — 5 Mo)", ajouterCand:"Ajouter la candidature",
    recue:"Reçue", preselection:"Présélection", entretien:"Entretien", decision:"Décision", retenu:"Retenu", refuse:"Refusé", vers:"→ {e}", historique:"Historique",
    motifDecision:"Motif de la décision (obligatoire, conservé dans l'historique)", confirmerT:"Décision", entretienAjout:"Ajouter un entretien", date:"Date", intervenant:"Intervenant",
    avis:"Avis", note:"Note (0 à 5)", rechercher:"Rechercher un candidat…", voirCv:"CV", aucun:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}",
    rappelDecision:"La décision finale est prise par une personne habilitée ; aucune décision n'est automatique.",
    site:"Site", service:"Service", choisir:"Choisir…", aucunService:"—", reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", envoi:"Envoi en cours…",
    cloreQ:"Clore le poste « {p} » ? Les candidatures en cours restent consultables mais n'avancent plus.", rouvrirQ:"Rouvrir le poste « {p} » ?", plus:"Voir {n} de plus",
    doublonQ:"Un candidat portant ce courriel (ou ces nom, prénom et téléphone) existe déjà. Rattacher cette candidature à sa fiche existante ?", rattacher:"Rattacher",
    effacer:"Effacer", effacerQ:"Effacer les données de « {n} » à sa demande ? Identité, coordonnées, CV et entretiens sont supprimés ; les étapes restent, anonymes. Action définitive.",
    effaceOk:"Données du candidat effacées.", efface:"(effacé)", posteClos:"Poste clos", liste:"Liste des {x}",
    modifier:"Modifier", enregistrer:"Enregistrer", annuler:"Annuler", statut:"Statut", ouvert:"Ouvert", fiche:"Fiche du candidat", rectifier:"Rectifier les données",
    candidaturesDe:"Candidatures", autres:"{n} autre(s) candidature(s) hors de votre périmètre.", rattacherPoste:"Rattacher à un poste ouvert", rattacherOk:"Candidature ajoutée.",
    cvRemplacer:"Remplacer le CV", cvSupprimer:"Supprimer le CV", cvSupprimerQ:"Supprimer le CV de ce candidat ?", cvTropGros:"CV trop volumineux : 5 Mo au plus.", cvIgnore:"Le candidat avait déjà un CV : il est conservé (remplacement depuis sa fiche).",
    exporter:"Exporter (CSV)", relier:"Relier une fiche existante", matricule:"Matricule", fermer:"Fermer", desister:"Désistement",
    precedent:"Page précédente", suivant:"Page suivante", motifSaisie:"Pas de donnée personnelle (santé, famille…) dans le motif.", quotaAtteint:"Tous les postes sont pourvus.",
    ms_cand:"candidature enregistrée", ms_fiche:"fiche salarié créée : {m}", actEtape:"{e} — {n}", voirFiche:"Voir la fiche de {n}",
    integration:"Intégration", integrationQ:"Démarrer le parcours d'intégration du salarié {m} (à partir de sa date d'entrée) ?", integrationOk:"Démarrer", integrationFait:"Parcours d'intégration démarré pour {m}."},
  en:{embaucher:"Create employee record", salarieCree:"Employee {m}", embaucheOk:"Record {m} created and linked to the application.", embaucheDroit:"Creating an employee record requires the employee entry right.", conservation:"Retention of unsuccessful candidates", mois:"{n} months", conservationH:"After that: identity, contact details, CV and interviews erased; stages kept anonymously. Candidates with an employee record are never erased.", conservationConf:"Keep unsuccessful candidates for {n} months? Those past due are erased now.", conservationOk:"Saved; {e} candidate(s) erased.", titre:"Recruitment", lede:"Open positions, applications by stage, interviews and justified decisions. CVs are encrypted; every access is logged.",
    postes:"Positions", candidatures:"Applications", candidats:"Candidates", intitule:"Title", fonction:"Job", nb:"Openings", description:"Description",
    ouvrir:"Open position", ouverts:"Open", clos:"Closed", tous:"All", clore:"Close", rouvrir:"Reopen", nbCand:"Applications", retenus:"Hired", aucunPoste:"No position: open one.",
    choisirPoste:"Choose a position…", nom:"Last name", prenom:"First name", email:"Email", tel:"Phone", source:"Source", cv:"CV (PDF, PNG, JPEG — 5 MB)", ajouterCand:"Add application",
    recue:"Received", preselection:"Shortlist", entretien:"Interview", decision:"Decision", retenu:"Hired", refuse:"Rejected", vers:"→ {e}", historique:"History",
    motifDecision:"Reason for the decision (required, kept in history)", confirmerT:"Decision", entretienAjout:"Add an interview", date:"Date", intervenant:"Interviewer",
    avis:"Opinion", note:"Score (0 to 5)", rechercher:"Search a candidate…", voirCv:"CV", aucun:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}",
    rappelDecision:"The final decision is made by an authorised person; no decision is automatic.",
    site:"Site", service:"Department", choisir:"Choose…", aucunService:"—", reseau:"Server unreachable: check the connection and try again.", envoi:"Sending…",
    cloreQ:"Close position “{p}”? Ongoing applications stay visible but no longer move.", rouvrirQ:"Reopen position “{p}”?", plus:"Show {n} more",
    doublonQ:"A candidate with this email (or these names and phone) already exists. Link this application to the existing record?", rattacher:"Link",
    effacer:"Erase", effacerQ:"Erase the data of “{n}” at their request? Identity, contact details, CV and interviews are deleted; stages remain anonymously. This cannot be undone.",
    effaceOk:"Candidate data erased.", efface:"(erased)", posteClos:"Closed position", liste:"List of {x}",
    modifier:"Edit", enregistrer:"Save", annuler:"Cancel", statut:"Status", ouvert:"Open", fiche:"Candidate record", rectifier:"Correct the data",
    candidaturesDe:"Applications", autres:"{n} other application(s) outside your scope.", rattacherPoste:"Link to an open position", rattacherOk:"Application added.",
    cvRemplacer:"Replace CV", cvSupprimer:"Delete CV", cvSupprimerQ:"Delete this candidate's CV?", cvTropGros:"CV too large: 5 MB max.", cvIgnore:"The candidate already had a CV: it is kept (replace it from the record).",
    exporter:"Export (CSV)", relier:"Link an existing record", matricule:"Employee ID", fermer:"Close", desister:"Withdrawal",
    precedent:"Previous page", suivant:"Next page", motifSaisie:"No personal data (health, family…) in the reason.", quotaAtteint:"All openings are filled.",
    ms_cand:"application recorded", ms_fiche:"employee record created: {m}", actEtape:"{e} — {n}", voirFiche:"Open the record of {n}",
    integration:"Onboarding", integrationQ:"Start the onboarding path of employee {m} (from the hire date)?", integrationOk:"Start", integrationFait:"Onboarding path started for {m}."},
  ar:{embaucher:"إنشاء ملف الأجير", salarieCree:"الأجير {m}", embaucheOk:"أنشئ الملف {m} وربط بالترشح.", embaucheDroit:"إنشاء ملف أجير يتطلب حق الإدخال.", conservation:"مدة حفظ المترشحين غير المقبولين", mois:"{n} شهرا", conservationH:"عند الأجل تمحى الهوية والبيانات والسيرة والمقابلات؛ تبقى المراحل مجهولة. لا يُمحى المترشحون المنتدبون.", conservationConf:"حفظ المترشحين غير المقبولين {n} شهرا؟ من تجاوز الأجل يُمحى فورا.", conservationOk:"تم الحفظ؛ محي {e} مترشح.", titre:"الانتداب", lede:"المناصب الشاغرة والترشحات حسب المرحلة والمقابلات والقرارات المعللة. السير الذاتية مشفرة.",
    postes:"المناصب", candidatures:"الترشحات", candidats:"المترشحون", intitule:"التسمية", fonction:"الوظيفة", nb:"عدد المناصب", description:"الوصف",
    ouvrir:"فتح المنصب", ouverts:"مفتوحة", clos:"مغلقة", tous:"الكل", clore:"إغلاق", rouvrir:"إعادة الفتح", nbCand:"الترشحات", retenus:"المقبولون", aucunPoste:"لا مناصب: افتح منصبا.",
    choisirPoste:"اختر منصبا…", nom:"اللقب", prenom:"الاسم", email:"البريد", tel:"الهاتف", source:"المصدر", cv:"السيرة الذاتية (PDF، PNG، JPEG — 5 م.ب)", ajouterCand:"إضافة الترشح",
    recue:"مستلم", preselection:"انتقاء أولي", entretien:"مقابلة", decision:"قرار", retenu:"مقبول", refuse:"مرفوض", vers:"← {e}", historique:"السجل",
    motifDecision:"تعليل القرار (إجباري، يحفظ في السجل)", confirmerT:"قرار", entretienAjout:"إضافة مقابلة", date:"التاريخ", intervenant:"المحاور",
    avis:"الرأي", note:"العدد (0 إلى 5)", rechercher:"بحث عن مترشح…", voirCv:"السيرة", aucun:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}",
    rappelDecision:"يتخذ القرار النهائي شخص مؤهل؛ لا قرار آلي.",
    site:"الموقع", service:"المصلحة", choisir:"اختر…", aucunService:"—", reseau:"تعذر الاتصال بالخادم: تحقق من الاتصال ثم أعد المحاولة.", envoi:"جار الإرسال…",
    cloreQ:"إغلاق المنصب «{p}»؟ تبقى الترشحات الجارية قابلة للاطلاع ولكنها لا تتقدم.", rouvrirQ:"إعادة فتح المنصب «{p}»؟", plus:"عرض {n} إضافية",
    doublonQ:"يوجد مترشح بنفس البريد (أو نفس الاسم واللقب والهاتف). ربط هذا الترشح بملفه الحالي؟", rattacher:"ربط",
    effacer:"محو", effacerQ:"محو بيانات «{n}» بطلب منه؟ تحذف الهوية والبيانات والسيرة والمقابلات؛ تبقى المراحل مجهولة. إجراء نهائي.",
    effaceOk:"محيت بيانات المترشح.", efface:"(ممحو)", posteClos:"منصب مغلق", liste:"قائمة {x}",
    modifier:"تعديل", enregistrer:"حفظ", annuler:"إلغاء", statut:"الحالة", ouvert:"مفتوح", fiche:"ملف المترشح", rectifier:"تصحيح البيانات",
    candidaturesDe:"الترشحات", autres:"{n} ترشح(ات) أخرى خارج نطاقك.", rattacherPoste:"ربط بمنصب مفتوح", rattacherOk:"أضيف الترشح.",
    cvRemplacer:"تعويض السيرة", cvSupprimer:"حذف السيرة", cvSupprimerQ:"حذف سيرة هذا المترشح؟", cvTropGros:"السيرة كبيرة جدا: 5 م.ب كحد أقصى.", cvIgnore:"للمترشح سيرة سابقة: حُفظت (يمكن تعويضها من ملفه).",
    exporter:"تصدير (CSV)", relier:"ربط ملف موجود", matricule:"الرقم", fermer:"إغلاق", desister:"انسحاب",
    precedent:"الصفحة السابقة", suivant:"الصفحة التالية", motifSaisie:"لا بيانات شخصية (صحة، عائلة…) في التعليل.", quotaAtteint:"كل المناصب مشغولة.",
    ms_cand:"سُجل الترشح", ms_fiche:"أنشئ ملف الأجير: {m}", actEtape:"{e} — {n}", voirFiche:"فتح ملف {n}",
    integration:"الإدماج", integrationQ:"بدء مسار إدماج الأجير {m} (من تاريخ دخوله)؟", integrationOk:"بدء", integrationFait:"بدأ مسار الإدماج لـ {m}."}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const ETAPES = ["recue","preselection","entretien","decision","retenu","refuse"];
/* correctif 34 : flèches selon le sens de lecture, message « réseau », droits renvoyés par le serveur (matrice de l'écran) */
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "→" ? "←" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const droits = ctx => { const d = (ctx.etat.postes || {}).droits; return d || {creer:ctx.rang("EMP") >= 2, modifier:ctx.rang("EMP") >= 2, valider:ctx.rang("EMP") >= 3, perso:ctx.rang("EMP") >= 2, parametrer:ctx.rang("EMP") >= 4, exporter:ctx.rang("EMP") >= 2}; };
const CV_MAX = 5*1024*1024;
const jj = d => /^\d{4}-\d{2}-\d{2}/.test(String(d||"")) ? String(d).slice(0, 10).split("-").reverse().join("/") : String(d||"");
const jjh = ts => { const d = new Date(ts); if (isNaN(d)) return String(ts||""); const z = n => String(n).padStart(2, "0"); return z(d.getDate())+"/"+z(d.getMonth()+1)+"/"+d.getFullYear()+" "+z(d.getHours())+":"+z(d.getMinutes()); };
const nomDe = (ctx, x) => x.nom === "—" ? T(ctx, "efface") : (x.nom+" "+(x.prenom||"")).trim();
/* motifs écrits par le système, traduits à l'affichage */
const motifTr = (ctx, m) => m === "candidature enregistrée" ? T(ctx, "ms_cand") : /^fiche salarié créée : /.test(m||"") ? T(ctx, "ms_fiche").replace("{m}", m.slice(22)) : (m || "");
function charger(ctx){
  const E = ctx.etat;
  if (!E.init){ const r = E.recherche; Object.assign(E, {init:true, onglet:"postes", statut:"ouvert", offP:0, postes:null, poste:"", pipe:null, q:"", offC:0, cands:null, histo:null, conserv:null, ouverts:null, form:{}, edit:null, fiche:null});
    if (r){ E.onglet = "cands"; E.q = r; delete E.recherche; } }
  if (ctx.rang("EMP") >= 4 && (!E.postes || (E.postes.droits || {parametrer:true}).parametrer) && !E.conserv && !E.coEnCours){ E.coEnCours = true; ctx.api("api/v1/recrutement/parametres").then(j=>{ E.conserv = j; E.coEnCours = false; ctx.rendre(); }).catch(()=>{ E.coEnCours = false; }); }
  if (!E.postes && !E.pEnCours){ E.pEnCours = true; ctx.api("api/v1/recrutement/postes?limit=50&offset="+E.offP+"&statut="+E.statut).then(j=>{ E.postes = j; E.pEnCours = false; ctx.rendre(); }).catch(e=>{ E.pEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
  /* correctif 35 : liste autonome des postes ouverts pour l'onglet Candidatures et le rattachement (indépendante du filtre) */
  if (!E.ouverts && !E.oEnCours && (E.onglet === "pipe" || E.fiche)){ E.oEnCours = true; ctx.api("api/v1/recrutement/postes?limit=200&statut=ouvert").then(j=>{ E.ouverts = j.lignes; E.oEnCours = false; ctx.rendre(); }).catch(()=>{ E.oEnCours = false; }); }
}
function recharger(ctx, quoi){ const E = ctx.etat; (quoi||["postes","pipe","cands","histo","ouverts"]).forEach(k=>{ E[k] = null; }); ctx.rendre(); }
const champ = (ctx, l, h) => '<label class="fwr-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
/* correctif 35 : la saisie survit à une erreur (valeurs gardées dans E.form, réinjectées au rendu) */
const inp = (ctx, id, attrs) => '<input id="'+id+'" data-fwmc="f:'+id+'" value="'+ctx.esc(ctx.etat.form[id] == null ? "" : ctx.etat.form[id])+'"'+(attrs||"")+'>';
const zone = (ctx, id, attrs) => '<textarea id="'+id+'" data-fwmc="f:'+id+'" rows="3" style="min-width:260px"'+(attrs||"")+'>'+ctx.esc(ctx.etat.form[id] == null ? "" : ctx.etat.form[id])+'</textarea>';
const sel = (ctx, id, l, vide, v) => '<select id="'+id+'" data-fwmc="f:'+id+'">'+(vide !== null ? '<option value="">'+ctx.esc(vide)+'</option>' : '')+l.map(z=>'<option value="'+ctx.esc(z.id)+'"'+(String(v == null ? (ctx.etat.form[id] || "") : v) === String(z.id) ? ' selected' : '')+'>'+ctx.esc(z.nom)+'</option>').join("")+'</select>';
const val = id => { const x = document.getElementById(id); return x ? String(x.value || "").trim() : ""; };
const pager = (ctx, pre, off, total) => '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", total ? off+1 : 0).replace("{b}", Math.min(off+50, total)).replace("{n}", total))+'</span>'+
  '<button class="fw-btn sm" data-act="fwm:'+pre+'-prec" aria-label="'+ctx.esc(T(ctx,"precedent"))+'"'+(off ? '' : ' disabled')+'>'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:'+pre+'-suiv" aria-label="'+ctx.esc(T(ctx,"suivant"))+'"'+(off+50 < total ? '' : ' disabled')+'>'+fl(ctx, "›")+'</button>';
function formPoste(ctx, po){
  const E = ctx.etat, ch = (E.postes || {}).choix || {sites:[], depts:[]}, k = po ? "fwrM" : "fwr";
  if (po && !E.form[k+"Intit"] && E.form[k+"Intit"] !== ""){ Object.assign(E.form, {[k+"Intit"]:po.intitule, [k+"Fonc"]:po.fonction || "", [k+"Nb"]:String(po.nb), [k+"Desc"]:po.description || "", [k+"Site"]:po.site_id || "", [k+"Dept"]:po.dept_id || ""}); }
  if (!po && E.form.fwrNb == null) E.form.fwrNb = "1";
  return '<div class="fw-card fw-u-p fwr-form">'+champ(ctx, T(ctx,"intitule"), inp(ctx, k+"Intit", ' maxlength="120"'))+champ(ctx, T(ctx,"fonction"), inp(ctx, k+"Fonc", ' maxlength="80"'))+champ(ctx, T(ctx,"nb"), inp(ctx, k+"Nb", ' type="number" min="1" max="500" step="1"'))+
    (ch.sites.length ? champ(ctx, T(ctx,"site"), sel(ctx, k+"Site", ch.sites, ch.sites.length > 1 || po ? T(ctx,"choisir") : null)) : '')+(ch.depts.length ? champ(ctx, T(ctx,"service"), sel(ctx, k+"Dept", ch.depts, T(ctx,"aucunService"))) : '')+
    champ(ctx, T(ctx,"description"), zone(ctx, k+"Desc", ' maxlength="4000"'))+
    (po ? '<button class="fw-btn pri" data-act="fwm:poste-maj" data-id="'+ctx.esc(po.id)+'"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button><button class="fw-btn" data-act="fwm:poste-edit-fin">'+ctx.esc(T(ctx,"annuler"))+'</button>'
      : '<button class="fw-btn pri" data-act="fwm:poste-ajout"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "ouvrir"))+'</button>')+'</div>';
}
function vuePostes(ctx){
  const E = ctx.etat, P = E.postes, dr = droits(ctx), ch = (P || {}).choix || {sites:[]}, nomSite = id => ((ch.sites || []).find(z=>z.id === id) || {nom:id || "—"}).nom;
  const ed = E.edit && P && P.lignes.find(x=>x.id === E.edit);
  return (dr.creer && P && !ed ? formPoste(ctx, null) : '')+(ed ? formPoste(ctx, ed) : '')+
    (E.conserv ? '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx,"conservation"))+' <select data-fwmc="conserv">'+E.conserv.durees.map(n=>'<option value="'+n+'"'+(n === E.conserv.conservationMois ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mois").replace("{n}", n))+'</option>').join("")+'</select></label><span class="fw-hint">'+ctx.esc(T(ctx,"conservationH"))+'</span></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="statut" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+[["ouvert","ouverts"],["clos","clos"],["tous","tous"]].map(([v,k])=>'<option value="'+v+'"'+(E.statut === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>'+(P ? pager(ctx, "p", E.offP, P.total) : '')+'</div>'+
    (!P ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !P.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucunPoste"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"liste").replace("{x}", T(ctx,"postes")))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"intitule"))+'</th><th scope="col">'+ctx.esc(T(ctx,"fonction"))+'</th><th scope="col">'+ctx.esc(T(ctx,"site"))+'</th><th scope="col">'+ctx.esc(T(ctx,"statut"))+'</th><th class="fw-numh" scope="col">'+ctx.esc(T(ctx,"nb"))+'</th><th class="fw-numh" scope="col">'+ctx.esc(T(ctx,"nbCand"))+'</th><th class="fw-numh" scope="col">'+ctx.esc(T(ctx,"retenus"))+'</th><th></th></tr></thead><tbody>'+
      P.lignes.map(x=>'<tr><td><button class="fw-link" data-act="fwm:voir-poste" data-id="'+ctx.esc(x.id)+'">'+ctx.esc(x.intitule)+'</button></td><td>'+ctx.esc(x.fonction||"")+'</td><td>'+ctx.esc(nomSite(x.site_id))+'</td><td>'+ctx.esc(T(ctx, x.statut === "ouvert" ? "ouvert" : "posteClos"))+'</td><td class="fw-num">'+x.nb+'</td><td class="fw-num">'+x.candidatures+'</td><td class="fw-num">'+x.retenus+'</td><td>'+
        (dr.modifier ? '<button class="fw-btn sm" data-act="fwm:poste-edit" data-id="'+ctx.esc(x.id)+'" aria-label="'+ctx.esc(T(ctx,"modifier")+" — "+x.intitule)+'">'+ctx.esc(T(ctx,"modifier"))+'</button> ' : '')+
        (dr.valider ? '<button class="fw-btn sm" data-act="fwm:'+(x.statut === "ouvert" ? "clore" : "rouvrir")+'" data-id="'+ctx.esc(x.id)+'" aria-label="'+ctx.esc(T(ctx, x.statut === "ouvert" ? "clore" : "rouvrir")+" — "+x.intitule)+'"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx, x.statut === "ouvert" ? "clore" : "rouvrir"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>');
}
function vuePipe(ctx){
  const E = ctx.etat, dr = droits(ctx);
  /* correctif 34 : le poste consulté figure dans la liste même s'il est clos ; rien ne bouge sur un poste clos */
  const po = (E.pipe && E.pipe.poste) || null, opts = (E.ouverts || []).slice();
  if (po && !opts.some(x=>x.id === po.id)) opts.unshift(po);
  let h = '<div class="fw-toolbar"><select data-fwmc="poste" aria-label="'+ctx.esc(T(ctx,"choisirPoste"))+'"><option value="">'+ctx.esc(T(ctx,"choisirPoste"))+'</option>'+opts.map(x=>'<option value="'+ctx.esc(x.id)+'"'+(E.poste === x.id ? ' selected' : '')+'>'+ctx.esc(x.intitule+(x.statut === "clos" ? " — "+T(ctx,"posteClos") : ""))+'</option>').join("")+'</select>'+
    (E.poste && dr.exporter ? '<a class="fw-btn sm" href="api/v1/recrutement/export?lang='+encodeURIComponent(ctx.lang||"fr")+'&poste='+encodeURIComponent(E.poste)+'">'+ctx.esc(T(ctx,"exporter"))+'</a>' : '')+'</div>';
  if (!E.poste) return h;
  if (!E.pipe){ if (!E.piEnCours){ E.piEnCours = true; ctx.api("api/v1/recrutement/candidatures?limit=200&poste="+encodeURIComponent(E.poste)).then(j=>{ E.pipe = j; E.piEnCours = false; ctx.rendre(); }).catch(e=>{ E.piEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); } return h+'<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
  const P = E.pipe.poste || {}, ouvert = !E.pipe.poste || P.statut === "ouvert", peut = dr.modifier && ouvert, dis = E.envoi ? ' disabled' : '';
  const quota = P.nb != null && (E.pipe.comptes.retenu || 0) >= P.nb;
  if (dr.creer && ouvert) h += '<div class="fw-card fw-u-p fwr-form">'+["nom","prenom","email","tel","source"].map(k=>champ(ctx, T(ctx,k), inp(ctx, "fwr_"+k, k === "email" ? ' type="email" maxlength="120"' : k === "tel" ? ' type="tel" maxlength="30"' : ' maxlength="80"'))).join("")+champ(ctx, T(ctx,"cv"), '<input id="fwr_cv" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg">')+
    '<button class="fw-btn pri" data-act="fwm:cand-ajout"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "ajouterCand"))+'</button></div>';
  h += '<p class="fw-hint">'+ctx.esc(T(ctx,"rappelDecision"))+(quota ? ' '+ctx.esc(T(ctx,"quotaAtteint")) : '')+'</p><div class="fwr-pipe">'+ETAPES.map(et=>{ const l = E.pipe.lignes.filter(x=>x.etape === et), reste = (E.pipe.comptes[et]||0) - l.length;
    return '<div class="fwr-col" role="group" aria-label="'+ctx.esc(T(ctx,et)+" ("+(E.pipe.comptes[et]||0)+")")+'"><div class="fwr-tete">'+ctx.esc(T(ctx,et))+' <span class="fw-tag">'+(E.pipe.comptes[et]||0)+'</span></div>'+
    l.map(x=>{ const n = nomDe(ctx, x), ef = x.nom === "—";
      const suiv = ef ? [] : (E.pipe.suivantes[et]||[]).filter(v=>(dr.valider || !(v === "retenu" || v === "refuse" || et === "refuse")) && !(v === "retenu" && quota) && !(et === "retenu" && x.salarie));
      return '<div class="fwr-carte"><strong>'+ctx.esc(n)+'</strong>'+(x.note != null ? ' <span class="fw-hint">'+x.note+'/5</span>' : '')+
      '<div class="fwr-act">'+(Number(x.cv) && dr.perso ? '<a class="fw-btn sm" href="api/v1/recrutement/candidats/'+encodeURIComponent(x.candidat_id)+'/cv" aria-label="'+ctx.esc(T(ctx,"voirCv")+" — "+n)+'">'+ctx.esc(T(ctx,"voirCv"))+'</a>' : '')+
      (dr.perso ? '<button class="fw-btn sm" data-act="fwm:histo" data-id="'+ctx.esc(x.id)+'" aria-label="'+ctx.esc(T(ctx,"historique")+" — "+n)+'">'+ctx.esc(T(ctx,"historique"))+'</button>' : '')+
      (!ef ? '<button class="fw-btn sm" data-act="fwm:fiche" data-id="'+ctx.esc(x.candidat_id)+'" aria-label="'+ctx.esc(T(ctx,"voirFiche").replace("{n}", n))+'">'+ctx.esc(T(ctx,"fiche"))+'</button>' : '')+
      (et === "retenu" && !ef ? (x.salarie ? '<span class="fw-tag">'+ctx.esc(T(ctx,"salarieCree").replace("{m}", x.salarie))+'</span>' :
        (dr.modifier ? '<button class="fw-btn sm pri" data-act="fwm:embaucher" data-id="'+ctx.esc(x.id)+'"'+dis+'>'+ctx.esc(T(ctx,"embaucher"))+'</button>'+
          '<span class="fwr-relier"><input id="fwrMat-'+ctx.esc(x.id)+'" data-fwmc="f:fwrMat-'+ctx.esc(x.id)+'" value="'+ctx.esc(E.form["fwrMat-"+x.id] || "")+'" size="8" aria-label="'+ctx.esc(T(ctx,"matricule")+" — "+n)+'" placeholder="'+ctx.esc(T(ctx,"matricule"))+'"><button class="fw-btn sm" data-act="fwm:relier" data-id="'+ctx.esc(x.id)+'"'+dis+'>'+ctx.esc(T(ctx,"relier"))+'</button></span>' : '')) : '')+
      (peut ? suiv.map(v=>'<button class="fw-btn sm" data-act="fwm:etape" data-id="'+ctx.esc(x.id)+'" data-vers="'+v+'" aria-label="'+ctx.esc(T(ctx,"actEtape").replace("{e}", et === "retenu" ? T(ctx,"desister") : T(ctx,v)).replace("{n}", n))+'"'+dis+'>'+ctx.esc(et === "retenu" ? T(ctx,"desister") : T(ctx,"vers").replace("{e}", T(ctx,v)))+'</button>').join("") : '')+'</div></div>'; }).join("")+
      (reste > 0 ? '<button class="fw-btn sm" data-act="fwm:plus" data-e="'+et+'"'+(E.plusEnCours ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"plus").replace("{n}", Math.min(200, reste)))+'</button>' : '')+'</div>'; }).join("")+'</div>';
  if (E.histo){ const c = E.pipe.lignes.find(z=>z.id === E.histo.id) || {}, decide = c.etape === "retenu" || c.etape === "refuse";
    h += '<div class="fw-card fw-u-p" style="margin-top:12px"><div class="fw-sec" style="margin-top:0">'+ctx.esc(T(ctx,"historique")+(c.nom ? " — "+nomDe(ctx, c) : ""))+'</div><ul class="fw-sm">'+
    E.histo.historique.map(x=>'<li>'+ctx.esc(jjh(x.ts)+" — "+(x.de ? T(ctx,x.de)+" "+fl(ctx, "→")+" " : "")+T(ctx,x.vers)+" — "+(x.par||"")+(x.motif ? " : "+motifTr(ctx, x.motif) : ""))+'</li>').join("")+
    E.histo.entretiens.map(x=>'<li>'+ctx.esc(jj(x.d)+" — "+T(ctx,"entretien")+" "+(x.intervenant||"")+(x.note != null ? " ("+x.note+"/5)" : "")+(x.avis ? " : "+x.avis : ""))+'</li>').join("")+'</ul>'+
    (peut && !decide && c.nom !== "—" ? '<div class="fwr-form">'+champ(ctx, T(ctx,"date"), inp(ctx, "fwrEd", ' type="date"'))+champ(ctx, T(ctx,"intervenant"), inp(ctx, "fwrEi", ' maxlength="80"'))+champ(ctx, T(ctx,"note"), inp(ctx, "fwrEn", ' type="number" min="0" max="5" step="1"'))+
      champ(ctx, T(ctx,"avis"), zone(ctx, "fwrEa", ' maxlength="2000"'))+'<button class="fw-btn" data-act="fwm:entretien" data-id="'+ctx.esc(E.histo.id)+'"'+dis+'>'+ctx.esc(T(ctx,"entretienAjout"))+'</button></div>' : '')+'</div>'; }
  return h;
}
function vueFiche(ctx){
  const E = ctx.etat, F = E.fiche, dr = droits(ctx); if (!F) return '';
  const c = F.candidat, ef = c.nom === "—", dis = E.envoi ? ' disabled' : '', dispo = (E.ouverts || []).filter(o=>!F.candidatures.some(a=>a.poste_id === o.id));
  return '<div id="fwrFiche" tabindex="-1" class="fw-card fw-u-p" style="margin-top:12px" role="region" aria-label="'+ctx.esc(T(ctx,"fiche"))+'"><div class="fw-sec" style="margin-top:0">'+ctx.esc(T(ctx,"fiche")+" — "+nomDe(ctx, c))+' <button class="fw-btn sm" data-act="fwm:fiche-fin">'+ctx.esc(T(ctx,"fermer"))+'</button></div>'+
    (dr.perso ? '<p class="fw-sm">'+ctx.esc([c.email, c.tel, c.source].filter(Boolean).join(" · "))+(c.cv_nom ? ' · <a href="api/v1/recrutement/candidats/'+encodeURIComponent(c.id)+'/cv">'+ctx.esc(c.cv_nom)+'</a>' : '')+'</p>' : '')+
    '<div class="fw-sec">'+ctx.esc(T(ctx,"candidaturesDe"))+'</div><ul class="fw-sm">'+F.candidatures.map(a=>'<li>'+ctx.esc(a.intitule+" — "+T(ctx, a.etape)+" — "+jj(a.maj)+(a.poste_statut === "clos" ? " ("+T(ctx,"posteClos")+")" : ""))+'</li>').join("")+'</ul>'+
    (F.autres > 0 ? '<p class="fw-hint">'+ctx.esc(T(ctx,"autres").replace("{n}", F.autres))+'</p>' : '')+
    (!ef && dr.creer && dispo.length ? '<div class="fwr-form">'+champ(ctx, T(ctx,"rattacherPoste"), sel(ctx, "fwrRatt", dispo.map(o=>({id:o.id, nom:o.intitule})), T(ctx,"choisirPoste")))+'<button class="fw-btn" data-act="fwm:rattacher" data-id="'+ctx.esc(c.id)+'"'+dis+'>'+ctx.esc(T(ctx,"rattacher"))+'</button></div>' : '')+
    (!ef && dr.modifier && dr.perso ? '<div class="fw-sec">'+ctx.esc(T(ctx,"rectifier"))+'</div><div class="fwr-form">'+["nom","prenom","email","tel","source"].map(k=>champ(ctx, T(ctx,k), inp(ctx, "fwrR_"+k, ' maxlength="120"'))).join("")+
      '<button class="fw-btn pri" data-act="fwm:rectifier" data-id="'+ctx.esc(c.id)+'"'+dis+'>'+ctx.esc(T(ctx,"enregistrer"))+'</button></div>'+
      '<div class="fwr-form">'+champ(ctx, T(ctx,"cvRemplacer"), '<input id="fwrRcv" type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg">')+'<button class="fw-btn" data-act="fwm:cv-remplacer" data-id="'+ctx.esc(c.id)+'"'+dis+'>'+ctx.esc(T(ctx,"cvRemplacer"))+'</button>'+
      (c.cv_nom ? '<button class="fw-btn" data-act="fwm:cv-supprimer" data-id="'+ctx.esc(c.id)+'"'+dis+'>'+ctx.esc(T(ctx,"cvSupprimer"))+'</button>' : '')+'</div>' : '')+
    (!ef && dr.valider ? '<button class="fw-btn sm dgr" data-act="fwm:effacer" data-id="'+ctx.esc(c.id)+'" data-n="'+ctx.esc(nomDe(ctx, c))+'"'+dis+'>'+ctx.esc(T(ctx,"effacer"))+'</button>' : '')+'</div>';
}
function vueCands(ctx){
  const E = ctx.etat;
  if (!E.cands){ if (!E.cEnCours){ E.cEnCours = true; ctx.api("api/v1/recrutement/candidats?limit=50&offset="+E.offC+"&q="+encodeURIComponent(E.q)).then(j=>{ E.cands = j; E.cEnCours = false; ctx.rendre(); }).catch(e=>{ E.cEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); } }
  const C = E.cands, dr = droits(ctx);
  return '<div class="fw-toolbar"><input type="search" data-fwmc="q" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx,"rechercher"))+'" aria-label="'+ctx.esc(T(ctx,"rechercher"))+'">'+(C ? pager(ctx, "c", E.offC, C.total) : '')+'</div>'+
    (!C ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !C.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucun"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"liste").replace("{x}", T(ctx,"candidats")))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"nom"))+'</th><th scope="col">'+ctx.esc(T(ctx,"email"))+'</th><th scope="col">'+ctx.esc(T(ctx,"source"))+'</th><th></th></tr></thead><tbody>'+
      C.lignes.map(x=>{ const ef = x.nom === "—", n = nomDe(ctx, x); return '<tr><td>'+(ef ? ctx.esc(n) : '<button class="fw-link" data-act="fwm:fiche" data-id="'+ctx.esc(x.id)+'" aria-label="'+ctx.esc(T(ctx,"voirFiche").replace("{n}", n))+'">'+ctx.esc(n)+'</button>')+'</td><td>'+ctx.esc(x.email||"")+'</td><td>'+ctx.esc(x.source||"")+'</td><td>'+(Number(x.cv) && dr.perso ? '<a class="fw-btn sm" href="api/v1/recrutement/candidats/'+encodeURIComponent(x.id)+'/cv" aria-label="'+ctx.esc(T(ctx,"voirCv")+" — "+n)+'">'+ctx.esc(T(ctx,"voirCv"))+'</a>' : '')+
        (dr.valider && !ef && !Number(x.embauche) ? ' <button class="fw-btn sm dgr" data-act="fwm:effacer" data-id="'+ctx.esc(x.id)+'" data-n="'+ctx.esc(n)+'"'+(E.envoi ? ' disabled' : '')+'>'+ctx.esc(T(ctx,"effacer"))+'</button>' : '')+'</td></tr>'; }).join("")+'</tbody></table>')+vueFiche(ctx);
}
/* lecture d'un fichier choisi (CV) : taille contrôlée avant envoi (au-delà, la connexion était coupée) */
const lireFichier = (ctx, id) => new Promise((ok, ko) => { const f = (document.getElementById(id)||{}).files; if (!f || !f[0]) return ok(null);
  if (f[0].size > CV_MAX) return ko(new Error(T(ctx,"cvTropGros")));
  const rd = new FileReader(); rd.onload = () => ok({nom:f[0].name, type:f[0].type, donnees:String(rd.result).split(",")[1]}); rd.onerror = () => ko(new Error(T(ctx,"reseau"))); rd.readAsDataURL(f[0]); });
FIWAKTI_MODULES.enregistrer({
  id:"FW-Recrutement",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["postes", T(ctx,"postes")], ["pipe", T(ctx,"candidatures")], ["cands", T(ctx,"candidats")]];
    return '<div class="fw-module fwr"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l])=>'<button type="button" role="tab" id="fwrT-'+k+'" aria-controls="fwrP" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(l)+'</button>').join("")+'</div>'+
      '<div id="fwrP" role="tabpanel" aria-labelledby="fwrT-'+E.onglet+'" style="margin-top:12px">'+(E.onglet === "pipe" ? vuePipe(ctx) : E.onglet === "cands" ? vueCands(ctx) : vuePostes(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    /* correctif 34 : un envoi à la fois ; correctif 35 : le focus revient sur l'élément d'origine après le rendu */
    const cible = el && el.dataset ? '[data-act="'+el.dataset.act+'"]'+(el.dataset.id ? '[data-id="'+CSS.escape(el.dataset.id)+'"]' : '') : null;
    const refocus = () => { setTimeout(()=>{ const x = cible && document.querySelector(cible); if (x) x.focus(); else { const p = document.getElementById("fwrP"); if (p){ p.setAttribute("tabindex", "-1"); p.focus(); } } }, 80); };
    /* correctif 36 : f est appelée AVANT le rendu (le fichier choisi pour le CV était perdu au rendu) */
    const envoi = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).then(()=>{ E.envoi = false; ctx.rendre(); refocus(); }); };
    /* correctif 36 : après l'embauche, le parcours d'intégration est proposé (module Intégration actif) */
    const integration = mat => { let actif = false; try { actif = typeof FW_MODULES !== "undefined" && !!(FW_MODULES.cat || {})["FW-Onboarding"]; } catch(e){}
      if (!actif) return; setTimeout(()=>ctx.confirmer({titre:T(ctx,"integration"), message:T(ctx,"integrationQ").replace("{m}", mat), okLabel:T(ctx,"integrationOk")}).then(r=>{ if (!r.ok) return;
        ctx.api("api/v1/onboarding/parcours", {corps:{mat}}).then(()=>ctx.flash(T(ctx,"integrationFait").replace("{m}", mat), "ok")).catch(ko); }), 300); };
    const vider = pre => Object.keys(E.form).forEach(k=>{ if (k.indexOf(pre) === 0) delete E.form[k]; });
    const rafraichirFiche = id => ctx.api("api/v1/recrutement/candidats/"+encodeURIComponent(id)).then(j=>{ E.fiche = j; ["nom","prenom","email","tel","source"].forEach(k=>{ E.form["fwrR_"+k] = j.candidat[k] || ""; }); });
    if (a === "onglet"){ E.onglet = el.dataset.o; return ctx.rendre(); }
    if (a === "p-prec" || a === "p-suiv"){ E.offP = Math.max(0, E.offP + (a === "p-suiv" ? 50 : -50)); return recharger(ctx, ["postes"]); }
    if (a === "c-prec" || a === "c-suiv"){ E.offC = Math.max(0, E.offC + (a === "c-suiv" ? 50 : -50)); return recharger(ctx, ["cands"]); }
    if (a === "voir-poste"){ E.poste = el.dataset.id; E.onglet = "pipe"; return recharger(ctx, ["pipe","histo"]); }
    if (a === "poste-edit"){ E.edit = el.dataset.id; vider("fwrM"); E.form.fwrMIntit = undefined; delete E.form.fwrMIntit; ctx.rendre(); return setTimeout(()=>{ const x = document.getElementById("fwrMIntit"); if (x) x.focus(); }, 0); }
    if (a === "poste-edit-fin"){ E.edit = null; vider("fwrM"); return ctx.rendre(); }
    const corpsPoste = k => ({intitule:val(k+"Intit"), fonction:val(k+"Fonc"), nb:val(k+"Nb") === "" ? 1 : Number(val(k+"Nb")), description:val(k+"Desc"), siteId:val(k+"Site") || null, deptId:val(k+"Dept") || null});
    if (a === "poste-ajout"){ const corps = corpsPoste("fwr");
      return envoi(()=>ctx.api("api/v1/recrutement/postes", {corps}).then(()=>{ ok(); vider("fwr"); E.form.fwrNb = "1"; E.postes = null; E.ouverts = null; })); }
    if (a === "poste-maj"){ const corps = corpsPoste("fwrM");
      return envoi(()=>ctx.api("api/v1/recrutement/postes/"+encodeURIComponent(el.dataset.id), {corps}).then(()=>{ ok(); E.edit = null; vider("fwrM"); E.postes = null; E.ouverts = null; E.pipe = null; })); }
    if (a === "clore" || a === "rouvrir"){ const x = ((E.postes||{}).lignes||[]).find(z=>z.id === el.dataset.id) || {intitule:""};
      return ctx.confirmer({titre:T(ctx, a), message:T(ctx, a+"Q").replace("{p}", x.intitule), okLabel:T(ctx, a)}).then(r=>{ if (r.ok) envoi(()=>ctx.api("api/v1/recrutement/postes/"+encodeURIComponent(el.dataset.id)+"/"+a, {corps:{}}).then(()=>{ ok(); E.postes = null; E.pipe = null; E.ouverts = null; })); }); }
    if (a === "plus"){ const et = el.dataset.e, n = E.pipe.lignes.filter(x=>x.etape === et).length; if (E.plusEnCours) return; E.plusEnCours = true;
      return ctx.api("api/v1/recrutement/candidatures?limit=200&poste="+encodeURIComponent(E.poste)+"&etape="+et+"&offset="+n).then(j=>{ const vus = new Set(E.pipe.lignes.map(x=>x.id)); j.lignes.forEach(x=>{ if (!vus.has(x.id)) E.pipe.lignes.push(x); }); E.pipe.comptes = j.comptes; }).catch(ko).then(()=>{ E.plusEnCours = false; ctx.rendre(); refocus(); }); }
    if (a === "fiche"){ E.onglet = "cands"; return rafraichirFiche(el.dataset.id).then(()=>{ ctx.rendre(); setTimeout(()=>{ const r = document.getElementById("fwrFiche"); if (r) r.focus(); }, 80); }).catch(ko); }
    if (a === "fiche-fin"){ E.fiche = null; vider("fwrR_"); return ctx.rendre(); }
    if (a === "rattacher"){ const pid = val("fwrRatt"); if (!pid) return;
      return envoi(()=>ctx.api("api/v1/recrutement/candidatures", {corps:{posteId:pid, candidatId:el.dataset.id}}).then(()=>{ ctx.flash(T(ctx,"rattacherOk"), "ok"); delete E.form.fwrRatt; E.pipe = null; E.postes = null; E.ouverts = null; return rafraichirFiche(el.dataset.id); })); }
    if (a === "rectifier"){ const corps = {}; ["nom","prenom","email","tel","source"].forEach(k=>{ corps[k] = val("fwrR_"+k); });
      return envoi(()=>ctx.api("api/v1/recrutement/candidats/"+encodeURIComponent(el.dataset.id), {corps}).then(()=>{ ok(); E.cands = null; E.pipe = null; return rafraichirFiche(el.dataset.id); })); }
    if (a === "cv-remplacer") return envoi(()=>lireFichier(ctx, "fwrRcv").then(cv=>{ if (!cv) return; return ctx.api("api/v1/recrutement/candidats/"+encodeURIComponent(el.dataset.id)+"/cv", {corps:{cv}}).then(()=>{ ok(); E.cands = null; E.pipe = null; return rafraichirFiche(el.dataset.id); }); }));
    if (a === "cv-supprimer") return ctx.confirmer({titre:T(ctx,"cvSupprimer"), message:T(ctx,"cvSupprimerQ"), okLabel:T(ctx,"cvSupprimer"), danger:true}).then(r=>{ if (r.ok) envoi(()=>ctx.api("api/v1/recrutement/candidats/"+encodeURIComponent(el.dataset.id)+"/cv/supprimer", {corps:{}}).then(()=>{ ok(); E.cands = null; E.pipe = null; return rafraichirFiche(el.dataset.id); })); });
    if (a === "effacer") return ctx.confirmer({titre:T(ctx,"effacer"), message:T(ctx,"effacerQ").replace("{n}", el.dataset.n), okLabel:T(ctx,"effacer"), danger:true}).then(r=>{ if (r.ok) envoi(()=>ctx.api("api/v1/recrutement/candidats/"+encodeURIComponent(el.dataset.id)+"/effacer", {corps:{}}).then(()=>{ ctx.flash(T(ctx,"effaceOk"), "ok"); E.cands = null; E.pipe = null; E.fiche = null; vider("fwrR_"); })); });
    if (a === "histo") return ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/historique").then(j=>{ E.histo = Object.assign(j, {id:el.dataset.id}); ctx.rendre(); refocus(); }).catch(ko);
    if (a === "entretien"){ const corps = {d:val("fwrEd"), intervenant:val("fwrEi"), note:val("fwrEn") === "" ? null : val("fwrEn"), avis:val("fwrEa")};
      return envoi(()=>ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/entretien", {corps})
      .then(()=>{ ok(); ["fwrEd","fwrEi","fwrEn","fwrEa"].forEach(k=>{ delete E.form[k]; }); return ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/historique"); }).then(j=>{ E.histo = Object.assign(j, {id:el.dataset.id}); })); }
    if (a === "etape"){
      const vers = el.dataset.vers, de = (((E.pipe||{}).lignes||[]).find(z=>z.id === el.dataset.id) || {}).etape;
      const envoyer = motif => envoi(()=>ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/etape", {corps:{vers, motif}}).then(()=>{ ok(); ["pipe","postes","histo"].forEach(k=>{ E[k] = null; }); }));
      /* le libellé du motif (ignoré par la boîte de confirmation) est repris dans le message */
      if (vers === "retenu" || vers === "refuse" || de === "refuse") return ctx.confirmer({titre:T(ctx,"confirmerT")+" : "+(de === "retenu" ? T(ctx,"desister") : T(ctx,vers)), message:T(ctx,"rappelDecision")+" "+T(ctx,"motifDecision")+". "+T(ctx,"motifSaisie"), motif:true, motifLabel:T(ctx,"motifDecision"), motifObligatoire:true, okLabel:de === "retenu" ? T(ctx,"desister") : T(ctx,vers)}).then(r=>{ if (r.ok) envoyer(r.motif); });
      return envoyer("");
    }
    /* embauche : la fiche salarié s'ouvre pré-remplie (identité, coordonnées, fonction, site et service du poste) ;
       une fois enregistrée, la candidature y est rattachée — aucune double saisie */
    if (a === "embaucher"){
      const c = (E.pipe.lignes||[]).find(z=>z.id === el.dataset.id), po = E.pipe.poste || ((E.postes||{}).lignes||[]).find(z=>z.id === E.poste) || {};
      if (!c) return;
      const pre = {nom:c.nom||"", prenom:c.prenom||"", email:c.email||"", tel:c.tel||"", poste:po.fonction || po.intitule || "", entree:new Date().toISOString().slice(0, 10)};
      if (po.site_id) pre.siteId = po.site_id; if (po.dept_id) pre.deptId = po.dept_id;
      /* correctif 35 : si la liaison échoue (fiche enregistrée ailleurs, nom modifié…), le matricule est gardé dans
         « Relier une fiche existante » au lieu de reproposer une création (second salarié) */
      const lancer = ctx.nouveauSalarie && ctx.nouveauSalarie(pre, mat=>ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(c.id)+"/embauche", {corps:{mat}})
        .then(()=>{ ctx.flash(T(ctx,"embaucheOk").replace("{m}", mat), "ok"); E.pipe = null; ctx.rendre(); integration(mat); }).catch(e=>{ E.form["fwrMat-"+c.id] = mat; ko(e); ctx.rendre(); }));
      if (!lancer) ctx.flash(T(ctx,"embaucheDroit"), "err");
      return;
    }
    if (a === "relier"){ const mat = val("fwrMat-"+el.dataset.id); if (!mat) return;
      return envoi(()=>ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/embauche", {corps:{mat}}).then(()=>{ ctx.flash(T(ctx,"embaucheOk").replace("{m}", mat), "ok"); delete E.form["fwrMat-"+el.dataset.id]; E.pipe = null; integration(mat); })); }
    if (a === "cand-ajout"){
      if (E.envoi) return;
      const corps = {posteId:E.poste}; ["nom","prenom","email","tel","source"].forEach(k=>{ corps[k] = val("fwr_"+k); });
      const fin = j => { ok(); if (j && j.cvIgnore) ctx.flash(T(ctx,"cvIgnore"), "ok"); ["nom","prenom","email","tel","source"].forEach(k=>{ delete E.form["fwr_"+k]; }); ["pipe","cands","postes"].forEach(k=>{ E[k] = null; }); };
      /* candidat déjà enregistré (visible) : rattachement confirmé au lieu d'un doublon */
      return envoi(()=>lireFichier(ctx, "fwr_cv").then(cv=>{ if (cv) corps.cv = cv;
        return ctx.api("api/v1/recrutement/candidats", {corps}).then(j=>{ if (!j || !j.doublon) return fin(j);
          return ctx.confirmer({titre:T(ctx,"rattacher"), message:T(ctx,"doublonQ"), okLabel:T(ctx,"rattacher")}).then(r=>{ if (r.ok) return ctx.api("api/v1/recrutement/candidats", {corps:Object.assign({}, corps, {doublonAccepte:true})}).then(fin); }); }); }));
    }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.value; return; }
    if (k === "statut"){ E.statut = el.value; E.offP = 0; return recharger(ctx, ["postes"]); }
    if (k === "poste"){ E.poste = el.value; return recharger(ctx, ["pipe","histo"]); }
    if (k === "q"){ E.q = el.value.trim(); E.offC = 0; return recharger(ctx, ["cands"]); }
    if (k === "conserv") return ctx.confirmer({titre:T(ctx,"conservation"), message:T(ctx,"conservationConf").replace("{n}", el.value)}).then(r=>{ if (!r.ok){ ctx.rendre(); return; }
      ctx.api("api/v1/recrutement/parametres", {corps:{conservationMois:Number(el.value)}}).then(j=>{ E.conserv.conservationMois = j.conservationMois; ctx.flash(T(ctx,"conservationOk").replace("{e}", j.effaces != null ? j.effaces : 0), "ok"); recharger(ctx, ["cands","pipe"]); }).catch(e=>{ ctx.flash(msgErr(ctx, e), "err"); ctx.rendre(); }); });
  }
});
})();
