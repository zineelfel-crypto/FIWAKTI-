/* FW-Recrutement — interface chargée à la demande. Postes ouverts, candidatures par étape, candidats, CV, entretiens,
   décisions motivées (droit de validation). Toutes les listes viennent du serveur, par page. */
(function(){
"use strict";
const L = {
  fr:{embaucher:"Créer la fiche salarié", salarieCree:"Salarié {m}", embaucheOk:"Fiche {m} créée et rattachée à la candidature.", embaucheDroit:"Création de fiche salarié : droit de saisie sur les salariés requis.", conservation:"Conservation des candidats non retenus", mois:"{n} mois", conservationH:"À l'échéance : identité, coordonnées, CV et entretiens effacés ; étapes conservées anonymes. Les candidats retenus ne sont jamais effacés.", conservationConf:"Conserver les candidats non retenus {n} mois ? Ceux dont l'échéance est dépassée seront effacés tout de suite.", conservationOk:"Durée enregistrée ; {e} candidat(s) effacé(s).", titre:"Recrutement", lede:"Postes ouverts, candidatures par étape, entretiens et décisions motivées. Les CV sont chiffrés ; chaque consultation est tracée.",
    postes:"Postes", candidatures:"Candidatures", candidats:"Candidats", intitule:"Intitulé", fonction:"Fonction", nb:"Postes à pourvoir", description:"Description",
    ouvrir:"Ouvrir le poste", ouverts:"Ouverts", clos:"Clos", tous:"Tous", clore:"Clore", rouvrir:"Rouvrir", nbCand:"Candidatures", retenus:"Retenus", aucunPoste:"Aucun poste : ouvrez-en un.",
    choisirPoste:"Choisir un poste…", nom:"Nom", prenom:"Prénom", email:"Courriel", tel:"Téléphone", source:"Source", cv:"CV (PDF, PNG, JPEG — 5 Mo)", ajouterCand:"Ajouter la candidature",
    recue:"Reçue", preselection:"Présélection", entretien:"Entretien", decision:"Décision", retenu:"Retenu", refuse:"Refusé", vers:"→ {e}", historique:"Historique",
    motifDecision:"Motif de la décision (obligatoire, conservé dans l'historique)", confirmerT:"Décision", entretienAjout:"Ajouter un entretien", date:"Date", intervenant:"Intervenant",
    avis:"Avis", note:"Note (0 à 5)", rechercher:"Rechercher un candidat…", voirCv:"CV", aucun:"Aucun élément.", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}",
    rappelDecision:"La décision finale est prise par une personne habilitée ; aucune décision n'est automatique."},
  en:{embaucher:"Create employee record", salarieCree:"Employee {m}", embaucheOk:"Record {m} created and linked to the application.", embaucheDroit:"Creating an employee record requires the employee entry right.", conservation:"Retention of unsuccessful candidates", mois:"{n} months", conservationH:"After that: identity, contact details, CV and interviews erased; stages kept anonymously. Hired candidates are never erased.", conservationConf:"Keep unsuccessful candidates for {n} months? Those past due are erased now.", conservationOk:"Saved; {e} candidate(s) erased.", titre:"Recruitment", lede:"Open positions, applications by stage, interviews and justified decisions. CVs are encrypted; every access is logged.",
    postes:"Positions", candidatures:"Applications", candidats:"Candidates", intitule:"Title", fonction:"Job", nb:"Openings", description:"Description",
    ouvrir:"Open position", ouverts:"Open", clos:"Closed", tous:"All", clore:"Close", rouvrir:"Reopen", nbCand:"Applications", retenus:"Hired", aucunPoste:"No position: open one.",
    choisirPoste:"Choose a position…", nom:"Last name", prenom:"First name", email:"Email", tel:"Phone", source:"Source", cv:"CV (PDF, PNG, JPEG — 5 MB)", ajouterCand:"Add application",
    recue:"Received", preselection:"Shortlist", entretien:"Interview", decision:"Decision", retenu:"Hired", refuse:"Rejected", vers:"→ {e}", historique:"History",
    motifDecision:"Reason for the decision (required, kept in history)", confirmerT:"Decision", entretienAjout:"Add an interview", date:"Date", intervenant:"Interviewer",
    avis:"Opinion", note:"Score (0 to 5)", rechercher:"Search a candidate…", voirCv:"CV", aucun:"Nothing yet.", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}",
    rappelDecision:"The final decision is made by an authorised person; no decision is automatic."},
  ar:{embaucher:"إنشاء ملف الأجير", salarieCree:"الأجير {m}", embaucheOk:"أنشئ الملف {m} وربط بالترشح.", embaucheDroit:"إنشاء ملف أجير يتطلب حق الإدخال.", conservation:"مدة حفظ المترشحين غير المقبولين", mois:"{n} شهرا", conservationH:"عند الأجل تمحى الهوية والسيرة والمقابلات.", conservationConf:"حفظ المترشحين {n} شهرا؟", conservationOk:"تم الحفظ؛ محي {e} مترشح.", titre:"الانتداب", lede:"المناصب الشاغرة والترشحات حسب المرحلة والمقابلات والقرارات المعللة. السير الذاتية مشفرة.",
    postes:"المناصب", candidatures:"الترشحات", candidats:"المترشحون", intitule:"التسمية", fonction:"الوظيفة", nb:"عدد المناصب", description:"الوصف",
    ouvrir:"فتح المنصب", ouverts:"مفتوحة", clos:"مغلقة", tous:"الكل", clore:"إغلاق", rouvrir:"إعادة الفتح", nbCand:"الترشحات", retenus:"المقبولون", aucunPoste:"لا مناصب: افتح منصبا.",
    choisirPoste:"اختر منصبا…", nom:"اللقب", prenom:"الاسم", email:"البريد", tel:"الهاتف", source:"المصدر", cv:"السيرة الذاتية (PDF، PNG، JPEG — 5 م.ب)", ajouterCand:"إضافة الترشح",
    recue:"مستلم", preselection:"انتقاء أولي", entretien:"مقابلة", decision:"قرار", retenu:"مقبول", refuse:"مرفوض", vers:"← {e}", historique:"السجل",
    motifDecision:"تعليل القرار (إجباري)", confirmerT:"قرار", entretienAjout:"إضافة مقابلة", date:"التاريخ", intervenant:"المحاور",
    avis:"الرأي", note:"العدد (0 إلى 5)", rechercher:"بحث عن مترشح…", voirCv:"السيرة", aucun:"لا عناصر.", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}",
    rappelDecision:"يتخذ القرار النهائي شخص مؤهل؛ لا قرار آلي."}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const ETAPES = ["recue","preselection","entretien","decision","retenu","refuse"];
function charger(ctx){
  const E = ctx.etat;
  if (!E.init){ const r = E.recherche; Object.assign(E, {init:true, onglet:"postes", statut:"ouvert", offP:0, postes:null, poste:"", pipe:null, q:"", offC:0, cands:null, histo:null, conserv:null});
    if (r){ E.onglet = "cands"; E.q = r; delete E.recherche; } }
  if (ctx.rang("EMP") >= 4 && !E.conserv && !E.coEnCours){ E.coEnCours = true; ctx.api("api/v1/recrutement/parametres").then(j=>{ E.conserv = j; E.coEnCours = false; ctx.rendre(); }).catch(()=>{ E.coEnCours = false; }); }
  if (!E.postes && !E.pEnCours){ E.pEnCours = true; ctx.api("api/v1/recrutement/postes?limit=50&offset="+E.offP+"&statut="+E.statut).then(j=>{ E.postes = j; E.pEnCours = false; ctx.rendre(); }).catch(e=>{ E.pEnCours = false; ctx.flash(e.message, "err"); }); }
}
function recharger(ctx, quoi){ const E = ctx.etat; (quoi||["postes","pipe","cands","histo"]).forEach(k=>{ E[k] = null; }); ctx.rendre(); }
const champ = (ctx, l, h) => '<label class="fwr-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
function vuePostes(ctx){
  const E = ctx.etat, P = E.postes, peut = ctx.rang("EMP") >= 2, dec = ctx.rang("EMP") >= 3;
  return (peut ? '<div class="fw-card fw-u-p fwr-form">'+champ(ctx, T(ctx,"intitule"), '<input id="fwrIntit">')+champ(ctx, T(ctx,"fonction"), '<input id="fwrFonc">')+champ(ctx, T(ctx,"nb"), '<input id="fwrNb" type="number" min="1" value="1">')+
      champ(ctx, T(ctx,"description"), '<input id="fwrDesc">')+'<button class="fw-btn pri" data-act="fwm:poste-ajout">'+ctx.esc(T(ctx,"ouvrir"))+'</button></div>' : '')+
    (E.conserv ? '<div class="fw-toolbar"><label>'+ctx.esc(T(ctx,"conservation"))+' <select data-fwmc="conserv">'+E.conserv.durees.map(n=>'<option value="'+n+'"'+(n === E.conserv.conservationMois ? ' selected' : '')+'>'+ctx.esc(T(ctx,"mois").replace("{n}", n))+'</option>').join("")+'</select></label><span class="fw-hint">'+ctx.esc(T(ctx,"conservationH"))+'</span></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="statut">'+[["ouvert","ouverts"],["clos","clos"],["tous","tous"]].map(([v,k])=>'<option value="'+v+'"'+(E.statut === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>'+
      (P ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", P.total ? E.offP+1 : 0).replace("{b}", Math.min(E.offP+50, P.total)).replace("{n}", P.total))+'</span>'+
      '<button class="fw-btn sm" data-act="fwm:p-prec"'+(E.offP ? '' : ' disabled')+'>‹</button><button class="fw-btn sm" data-act="fwm:p-suiv"'+(E.offP+50 < P.total ? '' : ' disabled')+'>›</button>' : '')+'</div>'+
    (!P ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !P.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucunPoste"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"intitule"))+'</th><th>'+ctx.esc(T(ctx,"fonction"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"nb"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"nbCand"))+'</th><th class="fw-numh">'+ctx.esc(T(ctx,"retenus"))+'</th><th></th></tr></thead><tbody>'+
      P.lignes.map(x=>'<tr><td><button class="fw-link" data-act="fwm:voir-poste" data-id="'+ctx.esc(x.id)+'">'+ctx.esc(x.intitule)+'</button></td><td>'+ctx.esc(x.fonction||"")+'</td><td class="fw-num">'+x.nb+'</td><td class="fw-num">'+x.candidatures+'</td><td class="fw-num">'+x.retenus+'</td><td>'+
        (dec ? '<button class="fw-btn sm" data-act="fwm:'+(x.statut === "ouvert" ? "clore" : "rouvrir")+'" data-id="'+ctx.esc(x.id)+'">'+ctx.esc(T(ctx, x.statut === "ouvert" ? "clore" : "rouvrir"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table>');
}
function vuePipe(ctx){
  const E = ctx.etat, P = E.postes || {lignes:[]}, peut = ctx.rang("EMP") >= 2;
  let h = '<div class="fw-toolbar"><select data-fwmc="poste"><option value="">'+ctx.esc(T(ctx,"choisirPoste"))+'</option>'+P.lignes.filter(x=>x.statut === "ouvert").map(x=>'<option value="'+ctx.esc(x.id)+'"'+(E.poste === x.id ? ' selected' : '')+'>'+ctx.esc(x.intitule)+'</option>').join("")+'</select></div>';
  if (!E.poste) return h;
  if (!E.pipe){ if (!E.piEnCours){ E.piEnCours = true; ctx.api("api/v1/recrutement/candidatures?limit=200&poste="+encodeURIComponent(E.poste)).then(j=>{ E.pipe = j; E.piEnCours = false; ctx.rendre(); }).catch(e=>{ E.piEnCours = false; ctx.flash(e.message, "err"); }); } return h+'<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>'; }
  if (peut) h += '<div class="fw-card fw-u-p fwr-form">'+["nom","prenom","email","tel","source"].map(k=>champ(ctx, T(ctx,k), '<input id="fwr_'+k+'">')).join("")+champ(ctx, T(ctx,"cv"), '<input id="fwr_cv" type="file" accept="application/pdf,image/png,image/jpeg">')+
    '<button class="fw-btn pri" data-act="fwm:cand-ajout">'+ctx.esc(T(ctx,"ajouterCand"))+'</button></div>';
  h += '<p class="fw-hint">'+ctx.esc(T(ctx,"rappelDecision"))+'</p><div class="fwr-pipe">'+ETAPES.map(et=>'<div class="fwr-col"><div class="fwr-tete">'+ctx.esc(T(ctx,et))+' <span class="fw-tag">'+(E.pipe.comptes[et]||0)+'</span></div>'+
    E.pipe.lignes.filter(x=>x.etape === et).map(x=>'<div class="fwr-carte"><strong>'+ctx.esc(x.nom+" "+(x.prenom||""))+'</strong>'+(x.note != null ? ' <span class="fw-hint">'+x.note+'/5</span>' : '')+
      '<div class="fwr-act">'+(x.cv ? '<a class="fw-btn sm" href="api/v1/recrutement/candidats/'+encodeURIComponent(x.candidat_id)+'/cv">'+ctx.esc(T(ctx,"voirCv"))+'</a>' : '')+
      '<button class="fw-btn sm" data-act="fwm:histo" data-id="'+ctx.esc(x.id)+'">'+ctx.esc(T(ctx,"historique"))+'</button>'+
      (et === "retenu" ? (x.salarie ? '<span class="fw-tag">'+ctx.esc(T(ctx,"salarieCree").replace("{m}", x.salarie))+'</span>' :
        (peut ? '<button class="fw-btn sm pri" data-act="fwm:embaucher" data-id="'+ctx.esc(x.id)+'">'+ctx.esc(T(ctx,"embaucher"))+'</button>' : '')) : '')+
      (peut ? (E.pipe.suivantes[et]||[]).map(v=>'<button class="fw-btn sm" data-act="fwm:etape" data-id="'+ctx.esc(x.id)+'" data-vers="'+v+'">'+ctx.esc(T(ctx,"vers").replace("{e}", T(ctx,v)))+'</button>').join("") : '')+'</div></div>').join("")+'</div>').join("")+'</div>';
  if (E.histo) h += '<div class="fw-card fw-u-p" style="margin-top:12px"><div class="fw-sec" style="margin-top:0">'+ctx.esc(T(ctx,"historique"))+'</div><ul class="fw-sm">'+
    E.histo.historique.map(x=>'<li>'+ctx.esc(String(x.ts).slice(0,16).replace("T"," ")+" — "+(x.de ? T(ctx,x.de)+" → " : "")+T(ctx,x.vers)+" — "+(x.par||"")+(x.motif ? " : "+x.motif : ""))+'</li>').join("")+
    E.histo.entretiens.map(x=>'<li>'+ctx.esc(x.d+" — "+T(ctx,"entretien")+" "+(x.intervenant||"")+(x.note != null ? " ("+x.note+"/5)" : "")+(x.avis ? " : "+x.avis : ""))+'</li>').join("")+'</ul>'+
    (peut ? '<div class="fwr-form">'+champ(ctx, T(ctx,"date"), '<input id="fwrEd" type="date">')+champ(ctx, T(ctx,"intervenant"), '<input id="fwrEi">')+champ(ctx, T(ctx,"note"), '<input id="fwrEn" type="number" min="0" max="5">')+
      champ(ctx, T(ctx,"avis"), '<input id="fwrEa">')+'<button class="fw-btn" data-act="fwm:entretien" data-id="'+ctx.esc(E.histo.id)+'">'+ctx.esc(T(ctx,"entretienAjout"))+'</button></div>' : '')+'</div>';
  return h;
}
function vueCands(ctx){
  const E = ctx.etat;
  if (!E.cands){ if (!E.cEnCours){ E.cEnCours = true; ctx.api("api/v1/recrutement/candidats?limit=50&offset="+E.offC+"&q="+encodeURIComponent(E.q)).then(j=>{ E.cands = j; E.cEnCours = false; ctx.rendre(); }).catch(e=>{ E.cEnCours = false; ctx.flash(e.message, "err"); }); } }
  const C = E.cands;
  return '<div class="fw-toolbar"><input type="search" data-fwmc="q" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx,"rechercher"))+'" aria-label="'+ctx.esc(T(ctx,"rechercher"))+'">'+
    (C ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", C.total ? E.offC+1 : 0).replace("{b}", Math.min(E.offC+50, C.total)).replace("{n}", C.total))+'</span><button class="fw-btn sm" data-act="fwm:c-prec"'+(E.offC ? '' : ' disabled')+'>‹</button><button class="fw-btn sm" data-act="fwm:c-suiv"'+(E.offC+50 < C.total ? '' : ' disabled')+'>›</button>' : '')+'</div>'+
    (!C ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !C.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucun"))+'</div>' :
    '<table class="fw-tbl"><thead><tr><th>'+ctx.esc(T(ctx,"nom"))+'</th><th>'+ctx.esc(T(ctx,"email"))+'</th><th>'+ctx.esc(T(ctx,"source"))+'</th><th></th></tr></thead><tbody>'+
      C.lignes.map(x=>'<tr><td>'+ctx.esc(x.nom+" "+(x.prenom||""))+'</td><td>'+ctx.esc(x.email||"")+'</td><td>'+ctx.esc(x.source||"")+'</td><td>'+(x.cv ? '<a class="fw-btn sm" href="api/v1/recrutement/candidats/'+encodeURIComponent(x.id)+'/cv">'+ctx.esc(T(ctx,"voirCv"))+'</a>' : '')+'</td></tr>').join("")+'</tbody></table>');
}
const val = id => ((document.getElementById(id)||{}).value || "").trim();
FIWAKTI_MODULES.enregistrer({
  id:"FW-Recrutement",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    const ong = [["postes", T(ctx,"postes")], ["pipe", T(ctx,"candidatures")], ["cands", T(ctx,"candidats")]];
    return '<div class="fw-module fwr"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(l)+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px">'+(E.onglet === "pipe" ? vuePipe(ctx) : E.onglet === "cands" ? vueCands(ctx) : vuePostes(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(e.message, "err");
    if (a === "onglet"){ E.onglet = el.dataset.o; return ctx.rendre(); }
    if (a === "p-prec" || a === "p-suiv"){ E.offP = Math.max(0, E.offP + (a === "p-suiv" ? 50 : -50)); return recharger(ctx, ["postes"]); }
    if (a === "c-prec" || a === "c-suiv"){ E.offC = Math.max(0, E.offC + (a === "c-suiv" ? 50 : -50)); return recharger(ctx, ["cands"]); }
    if (a === "voir-poste"){ E.poste = el.dataset.id; E.onglet = "pipe"; return recharger(ctx, ["pipe","histo"]); }
    if (a === "poste-ajout") return ctx.api("api/v1/recrutement/postes", {corps:{intitule:val("fwrIntit"), fonction:val("fwrFonc"), nb:Number(val("fwrNb"))||1, description:val("fwrDesc")}}).then(()=>{ ok(); recharger(ctx, ["postes"]); }).catch(ko);
    if (a === "clore" || a === "rouvrir") return ctx.api("api/v1/recrutement/postes/"+encodeURIComponent(el.dataset.id)+"/"+a, {corps:{}}).then(()=>{ ok(); recharger(ctx, ["postes"]); }).catch(ko);
    if (a === "histo") return ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/historique").then(j=>{ E.histo = Object.assign(j, {id:el.dataset.id}); ctx.rendre(); }).catch(ko);
    if (a === "entretien") return ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/entretien", {corps:{d:val("fwrEd"), intervenant:val("fwrEi"), note:val("fwrEn") === "" ? null : Number(val("fwrEn")), avis:val("fwrEa")}})
      .then(()=>{ ok(); return ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/historique"); }).then(j=>{ E.histo = Object.assign(j, {id:el.dataset.id}); ctx.rendre(); }).catch(ko);
    if (a === "etape"){
      const vers = el.dataset.vers, envoyer = motif => ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(el.dataset.id)+"/etape", {corps:{vers, motif}}).then(()=>{ ok(); recharger(ctx, ["pipe","postes","histo"]); }).catch(ko);
      if (vers === "retenu" || vers === "refuse") return ctx.confirmer({titre:T(ctx,"confirmerT")+" : "+T(ctx,vers), message:T(ctx,"rappelDecision"), motif:true, motifLabel:T(ctx,"motifDecision"), motifObligatoire:true, okLabel:T(ctx,vers)}).then(r=>{ if (r.ok) envoyer(r.motif); });
      return envoyer("");
    }
    /* embauche : la fiche salarié s'ouvre pré-remplie (identité, coordonnées, fonction, site et service du poste) ;
       une fois enregistrée, la candidature y est rattachée — aucune double saisie */
    if (a === "embaucher"){
      const c = (E.pipe.lignes||[]).find(z=>z.id === el.dataset.id), po = ((E.postes||{}).lignes||[]).find(z=>z.id === E.poste) || {};
      if (!c) return;
      const pre = {nom:c.nom||"", prenom:c.prenom||"", email:c.email||"", tel:c.tel||"", poste:po.fonction || po.intitule || "", entree:new Date().toISOString().slice(0, 10)};
      if (po.site_id) pre.siteId = po.site_id; if (po.dept_id) pre.deptId = po.dept_id;
      const ok = ctx.nouveauSalarie && ctx.nouveauSalarie(pre, mat=>ctx.api("api/v1/recrutement/candidatures/"+encodeURIComponent(c.id)+"/embauche", {corps:{mat}})
        .then(()=>ctx.flash(T(ctx,"embaucheOk").replace("{m}", mat), "ok")).catch(e=>ctx.flash(e.message, "err")));
      if (!ok) ctx.flash(T(ctx,"embaucheDroit"), "err");
      return;
    }
    if (a === "cand-ajout"){
      const f = (document.getElementById("fwr_cv")||{}).files, corps = {posteId:E.poste}; ["nom","prenom","email","tel","source"].forEach(k=>{ corps[k] = val("fwr_"+k); });
      const go = () => ctx.api("api/v1/recrutement/candidats", {corps}).then(()=>{ ok(); recharger(ctx, ["pipe","cands","postes"]); }).catch(ko);
      if (f && f[0]){ const rd = new FileReader(); rd.onload = () => { corps.cv = {nom:f[0].name, type:f[0].type, donnees:String(rd.result).split(",")[1]}; go(); }; rd.readAsDataURL(f[0]); return; }
      return go();
    }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "statut"){ E.statut = el.value; E.offP = 0; return recharger(ctx, ["postes"]); }
    if (k === "poste"){ E.poste = el.value; return recharger(ctx, ["pipe","histo"]); }
    if (k === "q"){ E.q = el.value.trim(); E.offC = 0; return recharger(ctx, ["cands"]); }
    if (k === "conserv") return ctx.confirmer({titre:T(ctx,"conservation"), message:T(ctx,"conservationConf").replace("{n}", el.value)}).then(r=>{ if (!r.ok){ ctx.rendre(); return; }
      ctx.api("api/v1/recrutement/parametres", {corps:{conservationMois:Number(el.value)}}).then(j=>{ E.conserv.conservationMois = j.conservationMois; ctx.flash(T(ctx,"conservationOk").replace("{e}", j.effaces), "ok"); recharger(ctx, ["cands","pipe"]); }).catch(e=>ctx.flash(e.message, "err")); });
  }
});
})();
