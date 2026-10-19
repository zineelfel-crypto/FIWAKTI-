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
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const fl = (ctx, g) => ctx.lang === "ar" ? (g === "‹" ? "›" : g === "›" ? "‹" : "→") : g;
const msgErr = (ctx, e) => (e && (e.name === "TypeError" || /Failed to fetch|NetworkError/i.test(e.message))) ? T(ctx, "reseau") : (e && e.message) || "";
const val = id => ((document.getElementById(id)||{}).value || "").trim();
function charger(ctx){
  const E = ctx.etat;
  if (!E.init) Object.assign(E, {init:true, onglet:"parcours", statut:"en_cours", off:0, liste:null, mods:null, detail:null, lignes:[{titre:"", responsable:"rh", jour:0}]});
  if (!E.mods && !E.mEnCours){ E.mEnCours = true; ctx.api("api/v1/onboarding/modeles").then(j=>{ E.mods = j; E.mEnCours = false; ctx.rendre(); }).catch(e=>{ E.mEnCours = false; ctx.flash(e.message, "err"); }); }
  if (!E.liste && !E.lEnCours){ E.lEnCours = true; ctx.api("api/v1/onboarding/parcours?limit=50&offset="+E.off+"&statut="+E.statut).then(j=>{ E.liste = j; E.lEnCours = false; ctx.rendre(); }).catch(e=>{ E.lEnCours = false; ctx.flash(e.message, "err"); }); }
}
const champ = (ctx, l, h) => '<label class="fwo-c"><span>'+ctx.esc(l)+'</span>'+h+'</label>';
function barre(g){ const p = g.total ? Math.round(100*g.faites/g.total) : 0; return '<div class="fwo-barre" role="progressbar" aria-valuenow="'+p+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+p+'%"></span></div>'; }
function vueParcours(ctx){
  const E = ctx.etat, peut = ctx.rang("EMP") >= 2, M = (E.mods||{}).modeles || [];
  if (E.detail) return vueDetail(ctx);
  const Lp = E.liste;
  return (peut ? '<div class="fw-card fw-u-p fwo-form">'+champ(ctx, T(ctx,"matricule"), '<input id="fwoMat">')+champ(ctx, T(ctx,"debut"), '<input id="fwoDeb" type="date">')+
      champ(ctx, T(ctx,"finEssai"), '<input id="fwoEssai" type="date">')+champ(ctx, T(ctx,"modele"), '<select id="fwoMod">'+M.map(m=>'<option value="'+ctx.esc(m.id)+'">'+ctx.esc(m.nom)+'</option>').join("")+'</select>')+
      '<button class="fw-btn pri" data-act="fwm:demarrer"'+(E.envoi ? ' disabled aria-busy="true"' : '')+'>'+ctx.esc(T(ctx, E.envoi ? "envoi" : "demarrer"))+'</button></div>' : '')+
    '<div class="fw-toolbar"><select data-fwmc="statut">'+[["en_cours","enCours"],["termine","termines"],["annule","annules"]].map(([v,k])=>'<option value="'+v+'"'+(E.statut === v ? ' selected' : '')+'>'+ctx.esc(T(ctx,k))+'</option>').join("")+'</select>'+
    (Lp ? '<span class="fw-hint">'+ctx.esc(T(ctx,"plage").replace("{a}", Lp.total ? E.off+1 : 0).replace("{b}", Math.min(E.off+50, Lp.total)).replace("{n}", Lp.total))+'</span><button class="fw-btn sm" data-act="fwm:prec"'+(E.off ? '' : ' disabled')+' aria-label="‹">'+fl(ctx, "‹")+'</button><button class="fw-btn sm" data-act="fwm:suiv"'+(E.off+50 < Lp.total ? '' : ' disabled')+' aria-label="›">'+fl(ctx, "›")+'</button>' : '')+'</div>'+
    (!Lp ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !Lp.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"aucun"))+'</div>' :
    '<table class="fw-tbl"><caption class="fw-sr">'+ctx.esc(T(ctx,"liste"))+'</caption><thead><tr><th scope="col">'+ctx.esc(T(ctx,"salarie"))+'</th><th scope="col">'+ctx.esc(T(ctx,"debut"))+'</th><th scope="col">'+ctx.esc(T(ctx,"progression"))+'</th><th scope="col" class="fw-numh">'+ctx.esc(T(ctx,"retard"))+'</th><th scope="col">'+ctx.esc(T(ctx,"prochaine"))+'</th><th scope="col">'+ctx.esc(T(ctx,"finEssai"))+'</th></tr></thead><tbody>'+
      Lp.lignes.map(r=>'<tr><td><button class="fw-link" data-act="fwm:voir" data-id="'+ctx.esc(r.id)+'">'+ctx.esc(r.mat+(r.nom ? " — "+r.nom : ""))+'</button></td><td>'+ctx.esc(ctx.dateAff(r.debut))+'</td><td>'+barre(r.progression)+' <span class="fw-hint">'+r.progression.faites+' / '+r.progression.total+'</span></td>'+
        '<td class="fw-num'+(r.progression.retard ? ' fwo-ko' : '')+'">'+r.progression.retard+'</td><td>'+ctx.esc(r.progression.prochaine ? ctx.dateAff(r.progression.prochaine) : "—")+'</td><td>'+ctx.esc(r.fin_essai ? ctx.dateAff(r.fin_essai) : "—")+'</td></tr>').join("")+'</tbody></table>');
}
function vueDetail(ctx){
  const E = ctx.etat, D = E.detail, peut = ctx.rang("EMP") >= 2 && D.parcours.statut === "en_cours", dec = ctx.rang("EMP") >= 3 && D.parcours.statut === "en_cours", auj = new Date().toISOString().slice(0, 10);
  return '<div class="fw-toolbar"><button class="fw-btn sm" data-act="fwm:retour">'+fl(ctx, "←")+' '+ctx.esc(T(ctx,"retour"))+'</button><strong>'+ctx.esc(D.parcours.mat)+'</strong><span class="fw-hint">'+ctx.esc(T(ctx,"debut")+" "+ctx.dateAff(D.parcours.debut)+" · "+T(ctx,"finEssai")+" "+ctx.dateAff(D.parcours.fin_essai))+'</span>'+
    (dec ? '<button class="fw-btn sm" data-act="fwm:terminer">'+ctx.esc(T(ctx,"terminer"))+'</button><button class="fw-btn sm" data-act="fwm:annuler">'+ctx.esc(T(ctx,"annuler"))+'</button>' : '')+'</div>'+
    '<div class="fwo-liste">'+D.taches.map(t=>'<label class="fwo-t'+(!t.faite_le && t.echeance < auj ? ' fwo-retard' : '')+'"><input type="checkbox" data-fwmc="tache" data-id="'+ctx.esc(t.id)+'"'+(t.faite_le ? ' checked' : '')+(peut && !E.envoi ? '' : ' disabled')+'>'+
      '<span class="fwo-tt"><strong>'+ctx.esc(t.titre)+'</strong><span class="fw-hint">'+ctx.esc(T(ctx,"r_"+t.responsable)+" · "+T(ctx,"echeance")+" "+ctx.dateAff(t.echeance)+(t.faite_le ? " · "+T(ctx,"faite")+" "+ctx.dateAff(t.faite_le.slice(0,10))+" "+T(ctx,"par").replace("{p}", t.faite_par||"") : ""))+'</span></span></label>').join("")+'</div>';
}
function vueModeles(ctx){
  const E = ctx.etat, M = (E.mods||{}).modeles, R = (E.mods||{}).responsables || ["rh"], peut = ctx.rang("EMP") >= 4;
  if (!M) return '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>';
  return M.map(m=>'<div class="fw-card fw-u-p" style="margin-bottom:10px"><strong>'+ctx.esc(m.nom)+'</strong>'+(peut ? ' <button class="fw-btn sm" data-act="fwm:retirerModele" data-id="'+ctx.esc(m.id)+'" data-nom="'+ctx.esc(m.nom)+'" aria-label="'+ctx.esc(T(ctx,"retirer")+" : "+m.nom)+'">'+ctx.esc(T(ctx,"retirer"))+'</button>' : '')+'<ul class="fw-sm">'+m.taches.map(t=>'<li>'+ctx.esc(T(ctx,"jours").replace("{n}", t.jour)+" — "+t.titre+" ("+T(ctx,"r_"+t.responsable)+")")+'</li>').join("")+'</ul></div>').join("")+
    (peut ? '<div class="fw-card fw-u-p"><div class="fwo-form">'+champ(ctx, T(ctx,"nom"), '<input id="fwoNom">')+champ(ctx, T(ctx,"fonction"), '<input id="fwoFonc">')+'</div>'+
      E.lignes.map((l, i)=>'<div class="fwo-form">'+champ(ctx, T(ctx,"tacheL"), '<input data-fwmc="ligne" data-i="'+i+'" data-k="titre" value="'+ctx.esc(l.titre)+'">')+
        champ(ctx, T(ctx,"responsable"), '<select data-fwmc="ligne" data-i="'+i+'" data-k="responsable">'+R.map(r=>'<option value="'+r+'"'+(l.responsable === r ? ' selected' : '')+'>'+ctx.esc(T(ctx,"r_"+r))+'</option>').join("")+'</select>')+
        champ(ctx, T(ctx,"jour"), '<input type="number" min="0" max="365" data-fwmc="ligne" data-i="'+i+'" data-k="jour" value="'+l.jour+'">')+'</div>').join("")+
      '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:ligne">'+ctx.esc(T(ctx,"ajoutLigne"))+'</button><button class="fw-btn pri" data-act="fwm:modele">'+ctx.esc(T(ctx,"ajoutModele"))+'</button></div></div>' : '');
}
function rechargerDetail(ctx, id){ return ctx.api("api/v1/onboarding/parcours/"+encodeURIComponent(id)).then(j=>{ ctx.etat.detail = j; ctx.rendre(); }); }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Onboarding",
  mount(ctx){ charger(ctx); },
  unmount(ctx){},
  render(vue, ctx){
    charger(ctx); const E = ctx.etat;
    return '<div class="fw-module fwo"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+[["parcours","parcours"],["modeles","modeles"]].map(([k, l], i)=>'<button type="button" role="tab" id="fwoT-'+k+'" aria-controls="fwoP" tabindex="'+((E.onglet || "parcours") === k ? 0 : -1)+'" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px" id="fwoP" role="tabpanel" aria-labelledby="fwoT-'+(E.onglet || "parcours")+'">'+(E.onglet === "modeles" ? vueModeles(ctx) : vueParcours(ctx))+'</div></div>';
  },
  action(a, el, ctx){
    /* correctif 34 : un seul envoi à la fois (le double clic créait deux demandes) ; erreurs réseau traduites */
    const E = ctx.etat, ok = () => ctx.flash(T(ctx,"enregistre"), "ok"), ko = e => ctx.flash(msgErr(ctx, e), "err");
    const verrou = f => { if (E.envoi) return; E.envoi = true; ctx.rendre(); return Promise.resolve().then(f).finally(()=>{ E.envoi = false; ctx.rendre(); }); };
    if (a === "retirerModele") return ctx.confirmer({titre:T(ctx,"retirer"), message:T(ctx,"retirerQ").replace("{n}", el.dataset.nom || ""), danger:true}).then(r=>{ if (!r.ok) return;
      return verrou(()=>ctx.api("api/v1/onboarding/modeles/"+encodeURIComponent(el.dataset.id)+"/retirer", {corps:{}}).then(()=>{ ok(); E.mods = null; }).catch(ko)); });
    if (a === "onglet"){ E.onglet = el.dataset.o; E.detail = null; return ctx.rendre(); }
    if (a === "prec" || a === "suiv"){ E.off = Math.max(0, E.off + (a === "suiv" ? 50 : -50)); E.liste = null; return ctx.rendre(); }
    if (a === "voir") return rechargerDetail(ctx, el.dataset.id).catch(ko);
    if (a === "retour"){ E.detail = null; E.liste = null; return ctx.rendre(); }
    if (a === "demarrer") return verrou(()=>ctx.api("api/v1/onboarding/parcours", {corps:{mat:val("fwoMat"), debut:val("fwoDeb"), finEssai:val("fwoEssai"), modeleId:val("fwoMod")}}).then(j=>{ ok(); E.liste = null; return rechargerDetail(ctx, j.id); }).catch(ko));
    if (a === "terminer" || a === "annuler") return ctx.confirmer({titre:T(ctx, a === "terminer" ? "terminer" : "annuler"), message:E.detail.parcours.mat}).then(r=>{ if (!r.ok) return;
      ctx.api("api/v1/onboarding/parcours/"+encodeURIComponent(E.detail.parcours.id)+"/"+a, {corps:{}}).then(()=>{ ok(); E.detail = null; E.liste = null; ctx.rendre(); }).catch(ko); });
    if (a === "ligne"){ E.lignes.push({titre:"", responsable:"manager", jour:0}); return ctx.rendre(); }
    if (a === "modele") return verrou(()=>ctx.api("api/v1/onboarding/modeles", {corps:{nom:val("fwoNom"), fonction:val("fwoFonc"), taches:E.lignes}}).then(()=>{ ok(); E.mods = null; E.lignes = [{titre:"", responsable:"rh", jour:0}]; }).catch(ko));
  },
  change(k, el, ctx){
    const E = ctx.etat;
    if (k === "statut"){ E.statut = el.value; E.off = 0; E.liste = null; return ctx.rendre(); }
    if (k === "ligne"){ const l = E.lignes[+el.dataset.i]; if (l) l[el.dataset.k] = el.dataset.k === "jour" ? Number(el.value)||0 : el.value; return; }
    if (k === "tache"){ if (E.envoi) return; E.envoi = true; return ctx.api("api/v1/onboarding/taches/"+encodeURIComponent(el.dataset.id), {corps:{faite:el.checked}}).then(()=>{ E.envoi = false; return rechargerDetail(ctx, E.detail.parcours.id); }).catch(e=>{ E.envoi = false; ctx.flash(msgErr(ctx, e), "err"); rechargerDetail(ctx, E.detail.parcours.id); }); }
  }
});
})();
