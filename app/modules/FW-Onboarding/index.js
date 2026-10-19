/* FW-Onboarding — interface chargée à la demande. Parcours d'intégration (tâches datées, responsables, cases signées),
   modèles de parcours, fin de période d'essai. */
(function(){
"use strict";
const L = {
  fr:{titre:"Intégration", lede:"Parcours d'intégration des nouveaux collaborateurs : tâches datées par responsable, points d'étape à 30, 60 et 90 jours, fin de période d'essai.",
    parcours:"Parcours", modeles:"Modèles", enCours:"En cours", termines:"Terminés", annules:"Annulés", demarrer:"Démarrer un parcours", matricule:"Matricule", debut:"Début",
    finEssai:"Fin de période d'essai", modele:"Modèle", salarie:"Salarié", progression:"Progression", retard:"En retard", prochaine:"Prochaine échéance", aucun:"Aucun parcours.",
    taches:"Tâches", responsable:"Responsable", echeance:"Échéance", faite:"Faite", terminer:"Terminer le parcours", annuler:"Annuler", retour:"Retour", nom:"Nom", fonction:"Fonction",
    ajoutModele:"Enregistrer le modèle", jour:"Jour", tacheL:"Tâche", ajoutLigne:"Ajouter une tâche", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}",
    r_rh:"RH", r_manager:"Responsable", r_salarie:"Salarié", r_it:"Informatique", r_hse:"HSE", par:"par {p}", jours:"J+{n}"},
  en:{titre:"Onboarding", lede:"Onboarding paths for new hires: dated tasks per owner, 30, 60 and 90-day check-ins, end of probation.",
    parcours:"Paths", modeles:"Templates", enCours:"In progress", termines:"Completed", annules:"Cancelled", demarrer:"Start a path", matricule:"Employee ID", debut:"Start",
    finEssai:"End of probation", modele:"Template", salarie:"Employee", progression:"Progress", retard:"Overdue", prochaine:"Next due", aucun:"No path.",
    taches:"Tasks", responsable:"Owner", echeance:"Due", faite:"Done", terminer:"Complete the path", annuler:"Cancel", retour:"Back", nom:"Name", fonction:"Job",
    ajoutModele:"Save template", jour:"Day", tacheL:"Task", ajoutLigne:"Add a task", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}",
    r_rh:"HR", r_manager:"Manager", r_salarie:"Employee", r_it:"IT", r_hse:"HSE", par:"by {p}", jours:"D+{n}"},
  ar:{titre:"الإدماج", lede:"مسارات إدماج الوافدين الجدد: مهام مؤرخة حسب المسؤول، نقاط مرحلية، نهاية فترة التجربة.",
    parcours:"المسارات", modeles:"النماذج", enCours:"جارية", termines:"منتهية", annules:"ملغاة", demarrer:"بدء مسار", matricule:"المعرف", debut:"البداية",
    finEssai:"نهاية فترة التجربة", modele:"النموذج", salarie:"الأجير", progression:"التقدم", retard:"متأخرة", prochaine:"الأجل القادم", aucun:"لا مسارات.",
    taches:"المهام", responsable:"المسؤول", echeance:"الأجل", faite:"منجزة", terminer:"إنهاء المسار", annuler:"إلغاء", retour:"رجوع", nom:"الاسم", fonction:"الوظيفة",
    ajoutModele:"حفظ النموذج", jour:"اليوم", tacheL:"المهمة", ajoutLigne:"إضافة مهمة", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}",
    r_rh:"الموارد البشرية", r_manager:"المسؤول", r_salarie:"الأجير", r_it:"الإعلامية", r_hse:"السلامة", par:"بواسطة {p}", jours:"ي+{n}"}
};
/* correctif 34 : erreurs réseau traduites, retrait d'un modèle, flèches selon le sens de lecture */
Object.assign(L.fr, {reseau:"Serveur injoignable : vérifiez la connexion puis réessayez.", retirer:"Retirer", retirerQ:"Retirer le modèle « {n} » ? Il ne sera plus proposé ; les parcours existants ne changent pas.", liste:"Parcours d'intégration", envoi:"Enregistrement…"});
Object.assign(L.en, {reseau:"Server unreachable: check the connection and try again.", retirer:"Remove", retirerQ:"Remove the template “{n}”? It will no longer be offered; existing paths are unchanged.", liste:"Onboarding paths", envoi:"Saving…"});
Object.assign(L.ar, {reseau:"تعذّر الوصول إلى الخادم: تحقّق من الاتصال ثم أعد المحاولة.", retirer:"سحب", retirerQ:"سحب النموذج «{n}»؟ لن يُقترح بعد الآن؛ ولا تتغير المسارات الحالية.", liste:"مسارات الإدماج", envoi:"جارٍ الحفظ…"});
/* correctif 36 */
Object.assign(L.fr, {tous:"Tous", statut:"Statut", rechercher:"Matricule ou nom…", enRetardSeul:"En retard seulement", precedent:"Page précédente", suivant:"Page suivante",
  progressionL:"Progression {f} sur {t}", retardT:"En retard", rouvrir:"Rouvrir", motif:"Motif", terminerQ:"Terminer le parcours de {n} ?", terminerNf:"{k} tâche(s) ne sont pas faites.",
  annulerQ:"Annuler le parcours de {n} ? Indiquez le motif (conservé dans le journal).", rouvrirQ:"Rouvrir le parcours de {n} ? Indiquez le motif.", commentaire:"Commentaire", commenter:"Enregistrer le commentaire",
  modifier:"Modifier", supprimerLigne:"Supprimer la tâche", nouveauModele:"Nouveau modèle", propose:"Proposé au premier usage", annulerEd:"Annuler", statut_en_cours:"En cours", statut_termine:"Terminé", statut_annule:"Annulé",
  debutDefaut:"Vide = date d'entrée du salarié", cocherT:"{t} — {n}", aucunModele:"Aucun modèle actif : créez-en un dans l'onglet Modèles."});
Object.assign(L.en, {tous:"All", statut:"Status", rechercher:"Employee ID or name…", enRetardSeul:"Overdue only", precedent:"Previous page", suivant:"Next page",
  progressionL:"Progress {f} of {t}", retardT:"Overdue", rouvrir:"Reopen", motif:"Reason", terminerQ:"Complete the path of {n}?", terminerNf:"{k} task(s) are not done.",
  annulerQ:"Cancel the path of {n}? Give the reason (kept in the log).", rouvrirQ:"Reopen the path of {n}? Give the reason.", commentaire:"Comment", commenter:"Save comment",
  modifier:"Edit", supprimerLigne:"Remove task", nouveauModele:"New template", propose:"Offered on first use", annulerEd:"Cancel", statut_en_cours:"In progress", statut_termine:"Completed", statut_annule:"Cancelled",
  debutDefaut:"Empty = employee's hire date", cocherT:"{t} — {n}", aucunModele:"No active template: create one in the Templates tab."});
Object.assign(L.ar, {tous:"الكل", statut:"الحالة", rechercher:"المعرف أو الاسم…", enRetardSeul:"المتأخرة فقط", precedent:"الصفحة السابقة", suivant:"الصفحة التالية",
  progressionL:"التقدم {f} من {t}", retardT:"متأخرة", rouvrir:"إعادة الفتح", motif:"التعليل", terminerQ:"إنهاء مسار {n}؟", terminerNf:"{k} مهمة غير منجزة.",
  annulerQ:"إلغاء مسار {n}؟ اذكر التعليل (يحفظ في السجل).", rouvrirQ:"إعادة فتح مسار {n}؟ اذكر التعليل.", commentaire:"تعليق", commenter:"حفظ التعليق",
  modifier:"تعديل", supprimerLigne:"حذف المهمة", nouveauModele:"نموذج جديد", propose:"مقترح عند أول استعمال", annulerEd:"إلغاء", statut_en_cours:"جار", statut_termine:"منته", statut_annule:"ملغى",
  debutDefaut:"فارغ = تاريخ دخول الأجير", cocherT:"{t} — {n}", aucunModele:"لا نموذج نشط: أنشئ نموذجا في علامة النماذج."});
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : g === "←" ? "→" : g) : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const val = id => ((document.getElementById(id)||{}).value || "").trim();
/* correctif 36 : jour LOCAL (l'heure UTC décalait le marquage « en retard » entre minuit et 1 h) */
const aujL = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2, "0")+"-"+String(d.getDate()).padStart(2, "0"); };
/* droits renvoyés par le serveur (matrice de l'écran), sinon déduits du rang */
const droits = ctx => { const E = ctx.etat, d = (E.liste || {}).droits || (E.mods || {}).droits || (E.detail || {}).droits; const r = ctx.rang("EMP"); return d || {creer:r >= 2, modifier:r >= 2, valider:r >= 3, parametrer:r >= 4}; };
const LIGNE0 = () => [{titre:"", responsable:"rh", jour:0}];
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"parcours", statut:"en_cours", off:0, q:"", retard:false, liste:null, mods:null, detail:null, lignes:LIGNE0(), edition:null, form:{}});
  if (!E.mods && !E.mEnCours){ E.mEnCours = true; ctx.api("api/v1/onboarding/modeles").then(j=>{ E.mods = j; E.mEnCours = false; ctx.rendre(); }).catch(e=>{ E.mEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
  if (!E.liste && !E.lEnCours){ E.lEnCours = true; ctx.api("api/v1/onboarding/parcours?limit=50&offset="+E.off+"&statut="+E.statut+"&q="+encodeURIComponent(E.q)+(E.retard ? "&retard=1" : "")).then(j=>{ E.liste = j; E.lEnCours = false; ctx.rendre(); }).catch(e=>{ E.lEnCours = false; ctx.flash(msgErr(ctx, e), "err"); }); }
}
const champ = (ctx, l, h) => '<label class="fwo-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
/* correctif 36 : la saisie survit au rendu et aux erreurs (E.form) */
const inp = (ctx, id, attrs) => '<input id="'+id+'" data-fwmc="f:'+id+'" value="'+ctx.esc(ctx.etat.form[id] == null ? "" : ctx.etat.form[id])+'"'+(attrs||"")+'>';
function barre(ctx, g){ const p = g.total ? Math.round(100*g.faites/g.total) : 0; return '<div class="fwo-barre" role="progressbar" aria-label="'+ctx.esc(T(ctx,"progressionL").replace("{f}", g.faites).replace("{t}", g.total))+'" aria-valuenow="'+p+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+p+'%"></span></div>'; }
function vueParcours(ctx){
  const E = ctx.etat, dr = droits(ctx), M = (E.mods||{}).modeles || [];
  if (E.detail) return vueDetail(ctx);
  const Lp = E.liste, dis = E.envoi ? ' disabled aria-busy="true"' : '';
  return (dr.creer ? '<div class="fw-card fw-u-p fwo-form">'+champ(ctx, T(ctx,"matricule"), inp(ctx, "fwoMat", ' maxlength="40" autocomplete="off"'))+champ(ctx, T(ctx,"debut"), inp(ctx, "fwoDeb", ' type="date" title="'+ctx.esc(T(ctx,"debutDefaut"))+'"'))+
      champ(ctx, T(ctx,"finEssai"), inp(ctx, "fwoEssai", ' type="date"'))+champ(ctx, T(ctx,"modele"), M.length ? '<select id="fwoMod" data-fwmc="f:fwoMod">'+M.map(m=>'<option value="'+ctx.esc(m.id)+'"'+(E.form.fwoMod === m.id ? ' selected' : '')+'>'+ctx.esc(m.nom)+'</option>').join("")+'</select>' : '<span class="fw-hint">'+ctx.esc(T(ctx,"aucunModele"))+'</span>')+
      '<button class="fw-btn pri" data-act="fwm:demarrer"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "demarrer"))+'</button><span class="fw-hint">'+ctx.esc(T(ctx,"debutDefaut"))+'</span></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="statut" aria-label="'+ctx.esc(T(ctx,"statut"))+'">'+[["en_cours","enCours"],["termine","termines"],["annule","annules"],["tous","tous"]].map(([v,k])=>'<option value="'+v+'"'+(E.statut === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>'+
    '<input type="search" data-fwmc="q" value="'+ctx.esc(E.q)+'" placeholder="'+ctx.esc(T(ctx,"rechercher"))+'" aria-label="'+ctx.esc(T(ctx,"rechercher"))+'">'+
    '<label class="fw-hint"><input type="checkbox" data-fwmc="retard"'+(E.retard ? ' checked' : '')+'> '+ctx.esc(T(ctx,"enRetardSeul"))+'</label>'+
    (Lp ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", Lp.total ? E.off+1 : 0).replace("{b}", Math.min(E.off+50, Lp.total)).replace("{n}", Lp.total))+'</span><button class="fw-btn sm" data-act="fwm:prec"'+(E.off ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"precedent"))+'">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:suiv"'+(E.off+50 < Lp.total ? '' : ' disabled')+' aria-label="'+ctx.esc(T(ctx,"suivant"))+'">'+fl(ctx, "›")+'</button>' : '')+'</div>'+
    (!Lp ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !Lp.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucun"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"liste"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"salarie"))+'</th><th scope="col">'+ctx.esc(T(ctx,"debut"))+'</th><th scope="col">'+ctx.esc(T(ctx,"progression"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx,"retard"))+'</th><th scope="col">'+ctx.esc(T(ctx,"prochaine"))+'</th><th scope="col">'+ctx.esc(T(ctx,"finEssai"))+'</th>'+(E.statut === "tous" ? '<th scope="col">'+ctx.esc(T(ctx,"statut"))+'</th>' : '')+'</tr></thead><tbody>'+
      Lp.lignes.map(r=>{ const g = r.progression || {total:0, faites:0, retard:0}; return '<tr><td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(r.id)+'">'+ctx.esc(r.mat+(r.nom ? " — "+r.nom : ""))+'</button></td><td>'+ctx.esc(ctx.dateAff(r.debut))+'</td><td>'+barre(ctx, g)+' <span class="fw-hint">'+g.faites+' / '+g.total+'</span></td>'+
        '<td class="fw-num'+(g.retard ? ' fwo-ko' : '')+'">'+g.retard+'</td><td>'+ctx.esc(g.prochaine ? ctx.dateAff(g.prochaine) : "—")+'</td><td>'+ctx.esc(r.fin_essai ? ctx.dateAff(r.fin_essai) : "—")+'</td>'+(E.statut === "tous" ? '<td>'+ctx.esc(T(ctx,"statut_"+r.statut))+'</td>' : '')+'</tr>'; }).join("")+'</tbody></table>');
}
function vueDetail(ctx){
  const E = ctx.etat, D = E.detail, dr = droits(ctx), enc = D.parcours.statut === "en_cours", dec = dr.valider, auj = aujL(), dis = E.envoi ? ' disabled' : '';
  const nom = D.parcours.mat+(D.parcours.nom ? " — "+D.parcours.nom : "");
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong>'+ctx.esc(nom)+'</strong><span class="fw-tag">'+ctx.esc(T(ctx,"statut_"+D.parcours.statut))+'</span><span class="fw-hint">'+ctx.esc((D.parcours.modele ? D.parcours.modele+" · " : "")+T(ctx,"debut")+" "+ctx.dateAff(D.parcours.debut)+" · "+T(ctx,"finEssai")+" "+ctx.dateAff(D.parcours.fin_essai))+'</span>'+
    (dec && enc ? '<button class="fw-btn sm" data-act="fwm:terminer"'+dis+'>'+ctx.esc(T(ctx,"terminer"))+'</button><button class="fw-btn sm dgr" data-act="fwm:annuler"'+dis+'>'+ctx.esc(T(ctx,"annuler"))+'</button>' : '')+
    (dec && !enc ? '<button class="fw-btn sm" data-act="fwm:rouvrir"'+dis+'>'+ctx.esc(T(ctx,"rouvrir"))+'</button>' : '')+'</div>'+
    '<div class="fwo-liste">'+D.taches.map(t=>{ const ret = !t.faite_le && t.echeance < auj, k = "fwoCom-"+t.id;
      return '<div class="fwo-t'+(ret ? ' fwo-retard' : '')+'"><input type="checkbox" id="fwoT-'+ctx.esc(t.id)+'" data-fwmc="tache" data-id="'+ctx.esc(t.id)+'"'+(t.faite_le ? ' checked' : '')+(t.peut && !E.envoi ? '' : ' disabled')+'>'+
      '<span class="fwo-tt"><label for="fwoT-'+ctx.esc(t.id)+'"><strong>'+ctx.esc(t.titre)+'</strong></label><span class="fw-hint">'+ctx.esc(T(ctx,"r_"+t.responsable)+" · "+T(ctx,"echeance")+" "+ctx.dateAff(t.echeance)+(ret ? " · "+T(ctx,"retardT") : "")+(t.faite_le ? " · "+T(ctx,"faite")+" "+ctx.dateAff(t.faite_le.slice(0,10))+" "+T(ctx,"par").replace("{p}", t.faite_par||"") : ""))+'</span>'+
      (t.commentaire && !(t.peut) ? '<span class="fw-sm">'+ctx.esc(t.commentaire)+'</span>' : '')+
      (t.peut ? '<span class="fwo-form" style="margin:4px 0 0">'+'<input id="'+k+'" data-fwmc="f:'+k+'" maxlength="500" value="'+ctx.esc(E.form[k] != null ? E.form[k] : (t.commentaire || ""))+'" aria-label="'+ctx.esc(T(ctx,"commentaire")+" — "+t.titre)+'" placeholder="'+ctx.esc(T(ctx,"commentaire"))+'"><button class="fw-btn sm" data-act="fwm:commenter" data-id="'+ctx.esc(t.id)+'"'+dis+'>'+ctx.esc(T(ctx,"commenter"))+'</button></span>' : '')+
      '</span></div>'; }).join("")+'</div>';
}
function vueModeles(ctx){
  const E = ctx.etat, M = (E.mods||{}).modeles, R = (E.mods||{}).responsables || ["rh"], peut = droits(ctx).parametrer, dis = E.envoi ? ' disabled' : '';
  if (!M) return '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>';
  return M.map(m=>'<div class="fw-card fw-u-p" style="margin-bottom:10px"><strong>'+ctx.esc(m.nom)+'</strong>'+(m.propose ? ' <span class="fw-tag">'+ctx.esc(T(ctx,"propose"))+'</span>' : '')+(m.fonction ? ' <span class="fw-hint">'+ctx.esc(m.fonction)+'</span>' : '')+
      (peut ? ' <button class="fw-btn sm" data-act="fwm:editerModele" data-id="'+ctx.esc(m.id)+'" aria-label="'+ctx.esc(T(ctx,"modifier")+" : "+m.nom)+'">'+ctx.esc(T(ctx,"modifier"))+'</button>'+(m.propose ? '' : ' <button class="fw-btn sm" data-act="fwm:retirerModele" data-id="'+ctx.esc(m.id)+'" data-nom="'+ctx.esc(m.nom)+'" aria-label="'+ctx.esc(T(ctx,"retirer")+" : "+m.nom)+'">'+ctx.esc(T(ctx,"retirer"))+'</button>') : '')+
      '<ul class="fw-sm">'+m.taches.map(t=>'<li>'+ctx.esc(T(ctx,"jours").replace("{n}", t.jour)+" — "+t.titre+" ("+T(ctx,"r_"+t.responsable)+")")+'</li>').join("")+'</ul></div>').join("")+
    (peut ? '<div class="fw-card fw-u-p"><div class="fw-sec" style="margin-top:0">'+ctx.esc(E.edition ? T(ctx,"modifier")+" : "+(E.form.fwoNom || "") : T(ctx,"nouveauModele"))+'</div><div class="fwo-form">'+champ(ctx, T(ctx,"nom"), inp(ctx, "fwoNom", ' maxlength="80"'))+champ(ctx, T(ctx,"fonction"), inp(ctx, "fwoFonc", ' maxlength="80"'))+'</div>'+
      E.lignes.map((l, i)=>'<div class="fwo-form">'+champ(ctx, T(ctx,"tacheL"), '<input data-fwmc="ligne" data-i="'+i+'" data-k="titre" maxlength="120" value="'+ctx.esc(l.titre)+'">')+
        champ(ctx, T(ctx,"responsable"), '<select data-fwmc="ligne" data-i="'+i+'" data-k="responsable">'+R.map(r=>'<option value="'+r+'"'+(l.responsable === r ? ' selected' : '')+'>'+ctx.esc(T(ctx,"r_"+r))+'</option>').join("")+'</select>')+
        champ(ctx, T(ctx,"jour"), '<input type="number" min="0" max="365" step="1" data-fwmc="ligne" data-i="'+i+'" data-k="jour" value="'+ctx.esc(String(l.jour))+'">')+
        (E.lignes.length > 1 ? '<button class="fw-btn sm" data-act="fwm:retirerLigne" data-i="'+i+'" aria-label="'+ctx.esc(T(ctx,"supprimerLigne")+" "+(i+1))+'">✕</button>' : '')+'</div>').join("")+
      '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:ligne">'+ctx.esc(T(ctx,"ajoutLigne"))+'</button><button class="fw-btn pri" data-act="fwm:modele"'+dis+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "ajoutModele"))+'</button>'+(E.edition ? '<button class="fw-btn" data-act="fwm:finEdition">'+ctx.esc(T(ctx,"annulerEd"))+'</button>' : '')+'</div></div>' : '');
}
function rechargerDetail(ctx, id, focus){ return ctx.api("api/v1/onboarding/parcours/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre();
  /* correctif 36 : le focus revient sur la case cochée (il tombait sur la page) */
  if (focus) setTimeout(()=>{ const x = document.getElementById(focus); if (x) x.focus(); }, 80); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Onboarding",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    return '<div class="fw-module fwo"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+[["parcours","parcours"],["modeles","modeles"]].map(([k, l])=>'<button type="button" role="tab" id="fwoT-'+k+'" aria-controls="fwoP" tabindex="'+((E.onglet || "parcours") === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwoP" role="tabpanel" aria-labelledby="fwoT-'+(E.onglet || "parcours")+'">'+(E.onglet === "modeles" ? vueModeles(ctx) : vueParcours(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    /* correctif 34 : un seul envoi à la fois ; correctif 36 : f est appelée AVANT le rendu (le rendu recréait les
       champs : « Démarrer » et « Enregistrer le modèle » envoyaient une requête vide) */
    const verrou = f => { if (E.envoi) return; E.envoi = true; let pr; try { pr = Promise.resolve(f()); } catch(e){ pr = Promise.reject(e); } ctx.rendre(); return pr.catch(ko).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    const vider = l => l.forEach(k=>{ delete E.form[k]; });
    if (a === "retirerModele") return ctx.confirmer({titre:T(ctx,"retirer"), message:T(ctx,"retirerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/onboarding/modeles/"+encodeURIComponent(el.dataset.id)+"/retirer", {corps:{}}).then(()=>{ ok(); E.mods = null; })); });
    if (a === "onglet"){ E.onglet = el.dataset.o; E.detail = null; return ctx.rendre(); }
    if (a === "prec" || a === "suiv"){ E.off = Math.max(0, E.off + (a === "suiv" ? 50 : -50)); E.liste = null; return ctx.rendre(); }
    if (a === "voir") return rechargerDetail(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.detail = null; E.liste = null; return ctx.rendre(); }
    if (a === "demarrer"){ const corps = {mat:val("fwoMat"), debut:val("fwoDeb"), finEssai:val("fwoEssai"), modeleId:val("fwoMod")};
      return verrou(()=>ctx.api("api/v1/onboarding/parcours", {corps}).then(j=>{ ok(); vider(["fwoMat","fwoDeb","fwoEssai"]); E.liste = null; E.mods = null; return rechargerDetail(ctx, j.id); })); }
    if (a === "terminer" || a === "annuler" || a === "rouvrir"){
      const P = E.detail.parcours, nom = P.mat+(P.nom ? " — "+P.nom : ""), nf = E.detail.taches.filter(t=>!t.faite_le).length, avecMotif = a !== "terminer";
      const msg = T(ctx, a+"Q").replace("{n}", nom)+(a === "terminer" && nf ? " "+T(ctx,"terminerNf").replace("{k}", nf) : "");
      return ctx.confirmer({titre:T(ctx, a), message:msg, danger:a === "annuler", motif:avecMotif, motifObligatoire:avecMotif, motifLabel:T(ctx,"motif"), okLabel:T(ctx, a)}).then(r=>{ if (!r.ok) return;
        return verrou(()=>ctx.api("api/v1/onboarding/parcours/"+encodeURIComponent(P.id)+"/"+a, {corps:{motif:r.motif || ""}}).then(()=>{ ok(); E.liste = null; return rechargerDetail(ctx, P.id); })); }); }
    if (a === "commenter"){ const k = "fwoCom-"+el.dataset.id, commentaire = val(k);
      return verrou(()=>ctx.api("api/v1/onboarding/taches/"+encodeURIComponent(el.dataset.id), {corps:{commentaire}}).then(()=>{ ok(); delete E.form[k]; return rechargerDetail(ctx, E.detail.parcours.id, k); })); }
    if (a === "ligne"){ E.lignes.push({titre:"", responsable:"manager", jour:0}); return ctx.rendre(); }
    if (a === "retirerLigne"){ E.lignes.splice(+el.dataset.i, 1); if (!E.lignes.length) E.lignes = LIGNE0(); return ctx.rendre(); }
    if (a === "editerModele"){ const m = ((E.mods||{}).modeles||[]).find(z=>z.id === el.dataset.id); if (!m) return;
      E.edition = m.id; E.form.fwoNom = m.nom; E.form.fwoFonc = m.fonction || ""; E.lignes = m.taches.map(t=>Object.assign({}, t)); ctx.rendre();
      return setTimeout(()=>{ const x = document.getElementById("fwoNom"); if (x) x.focus(); }, 80); }
    if (a === "finEdition"){ E.edition = null; vider(["fwoNom","fwoFonc"]); E.lignes = LIGNE0(); return ctx.rendre(); }
    if (a === "modele"){ const corps = {nom:val("fwoNom"), fonction:val("fwoFonc"), taches:E.lignes.map(l=>({titre:String(l.titre||"").trim(), responsable:l.responsable, jour:l.jour === "" ? 0 : Number(l.jour)}))};
      const url = "api/v1/onboarding/modeles"+(E.edition ? "/"+encodeURIComponent(E.edition) : "");
      return verrou(()=>ctx.api(url, {corps}).then(()=>{ ok(); E.mods = null; E.edition = null; vider(["fwoNom","fwoFonc"]); E.lignes = LIGNE0(); })); }
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k.indexOf("f:") === 0){ E.form[k.slice(2)] = el.value; return; }
    if (k === "statut"){ E.statut = el.value; E.off = 0; E.liste = null; return ctx.rendre(); }
    if (k === "q"){ E.q = el.value.trim(); E.off = 0; E.liste = null; return ctx.rendre(); }
    if (k === "retard"){ E.retard = el.checked; E.off = 0; E.liste = null; return ctx.rendre(); }
    if (k === "ligne"){ const l = E.lignes[+el.dataset.i]; if (l) l[el.dataset.k] = el.dataset.k === "jour" ? (el.value === "" ? "" : Number(el.value)) : el.value; return; }
    /* correctif 36 : pendant l'envoi d'une coche, les autres cases sont désactivées (les clics étaient ignorés en silence) */
    if (k === "tache"){ if (E.envoi){ el.checked = !el.checked; return; } E.envoi = true; const focus = el.id; ctx.rendre();
      return ctx.api("api/v1/onboarding/taches/"+encodeURIComponent(el.dataset.id), {corps:{faite:el.checked}}).catch(e=>ctx.flash(msgErr(ctx, e), "err")).then(()=>{ E.envoi = false; E.liste = null; return rechargerDetail(ctx, E.detail.parcours.id, focus); }); }
  }
});
})();
