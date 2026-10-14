/* FW-Visiteurs — interface chargée à la demande. Parcours rapide : société (proposée dès la saisie) → visiteurs connus
   (un clic) → visite unique ou série avec horaires propres à chaque jour → hôte, site, zone, motif. Écran Loge actualisé
   seulement lorsqu'il est ouvert (minuterie du module, arrêtée en le quittant). */
(function(){
"use strict";
const L = {
  fr:{jours_u:"jours", motifs:"Motifs de visite", actif:"Actif", retirer:"Retirer", hotesCoches:"{n} compte(s) cochés « Reçoit des visites » : seuls ces salariés sont proposés comme hôtes.", hotesAucun:"Aucun compte coché « Reçoit des visites » : tous les salariés actifs sont proposés comme hôtes. Cochez la case dans la fiche des comptes concernés (Administration › Utilisateurs).", titre:"Visiteurs et interventions", lede:"Sociétés et visiteurs connus réutilisés en un clic, visites uniques ou programmées par jour, écran de la loge.",
    loge:"Loge", nouvelle:"Nouvelle visite", progs:"Programmations", histo:"Historique", params:"Paramètres", mesVisites:"Mes visiteurs",
    f_tous:"Aujourd'hui", f_attendus:"Attendus", f_retard:"En retard", f_presents:"Présents", f_partis:"Partis", f_annules:"Annulés", f_noshow:"Non présentés", f_interventions:"Interventions",
    visiteur:"Visiteur", societe:"Société", hote:"Hôte", service:"Service", zone:"Zone", debutPrevu:"Début prévu", finPrevue:"Fin prévue", statut:"Statut", entree:"Entrée", actions:"Actions",
    s_ANNONCEE:"Attendu", s_ARRIVEE:"Arrivé", s_EN_VISITE:"En visite", s_PARTIE:"Parti", s_ANNULEE:"Annulé", s_NO_SHOW:"Non présenté",
    a_arrivee:"Arrivée", a_debut:"Début", a_depart:"Départ", a_annuler:"Annuler", maj:"Actualisé à {h}", rien:"Aucune visite.",
    etape1:"1. Société", etape2:"2. Visiteurs", etape3:"3. Quand", etape4:"4. Hôte, lieu et motif", saisirSociete:"Nom de la société…", creerSociete:"Créer la société « {n} »",
    changer:"Changer", nouveauVisiteur:"Nouveau visiteur", nom:"Nom", prenom:"Prénom", tel:"Téléphone", ajouter:"Ajouter", aucunVisiteur:"Aucun visiteur connu pour cette société : créez-le ci-dessous.",
    reprendre:"Reprendre la dernière programmation", unique:"Visite unique", serie:"Série de visites", date:"Date", debut:"Début", fin:"Fin", du:"Du", au:"Au", arriveeMaintenant:"Arrivée maintenant",
    j1:"Lundi", j2:"Mardi", j3:"Mercredi", j4:"Jeudi", j5:"Vendredi", j6:"Samedi", j0:"Dimanche", memesHoraires:"Mêmes horaires pour tous les jours cochés",
    chercherHote:"Nom ou matricule de l'hôte…", site:"Site", motif:"Motif", nature:"Nature", n_visite:"Visite", n_intervention:"Intervention / travaux", notes:"Notes d'accueil",
    enregistrer:"Enregistrer", genere:"{n} visite(s) enregistrée(s).", periode:"Période", jours:"Jours et horaires", suspendre:"Suspendre", reprendreProg:"Reprendre", annulerProg:"Annuler la programmation",
    st_active:"Active", st_suspendue:"Suspendue", st_annulee:"Annulée", exporter:"Exporter (CSV)", rechercher:"Rechercher…", conservation:"Conservation de l'historique (jours)", delaiNoShow:"Non présenté après (minutes)",
    hoteProgramme:"Les hôtes peuvent programmer leurs propres visiteurs", nouveauMotif:"Nouveau motif", chargement:"Chargement…", enregistre:"Enregistré.", plage:"{a}–{b} sur {n}", existeDeja:"Déjà connu : sélectionné.",
    choisirSociete:"Choisissez d'abord une société.", aucunBio:"Aucune donnée biométrique n'est enregistrée pour les visiteurs."},
  en:{jours_u:"days", motifs:"Visit purposes", actif:"Active", retirer:"Remove", hotesCoches:"{n} account(s) ticked “Receives visitors”: only these employees are offered as hosts.", hotesAucun:"No account ticked “Receives visitors”: all active employees are offered as hosts. Tick the box on the relevant accounts (Administration › Users).", titre:"Visitors and contractor work", lede:"Known companies and visitors reused in one click, single or scheduled visits with per-day hours, gatehouse screen.",
    loge:"Gatehouse", nouvelle:"New visit", progs:"Schedules", histo:"History", params:"Settings", mesVisites:"My visitors",
    f_tous:"Today", f_attendus:"Expected", f_retard:"Late", f_presents:"On site", f_partis:"Left", f_annules:"Cancelled", f_noshow:"No-show", f_interventions:"Contractor work",
    visiteur:"Visitor", societe:"Company", hote:"Host", service:"Department", zone:"Zone", debutPrevu:"Planned start", finPrevue:"Planned end", statut:"Status", entree:"Arrival", actions:"Actions",
    s_ANNONCEE:"Expected", s_ARRIVEE:"Arrived", s_EN_VISITE:"In visit", s_PARTIE:"Left", s_ANNULEE:"Cancelled", s_NO_SHOW:"No-show",
    a_arrivee:"Arrival", a_debut:"Start", a_depart:"Departure", a_annuler:"Cancel", maj:"Updated at {h}", rien:"No visits.",
    etape1:"1. Company", etape2:"2. Visitors", etape3:"3. When", etape4:"4. Host, place and purpose", saisirSociete:"Company name…", creerSociete:"Create company “{n}”",
    changer:"Change", nouveauVisiteur:"New visitor", nom:"Last name", prenom:"First name", tel:"Phone", ajouter:"Add", aucunVisiteur:"No known visitor for this company: create one below.",
    reprendre:"Reuse the last schedule", unique:"Single visit", serie:"Series of visits", date:"Date", debut:"Start", fin:"End", du:"From", au:"To", arriveeMaintenant:"Arriving now",
    j1:"Monday", j2:"Tuesday", j3:"Wednesday", j4:"Thursday", j5:"Friday", j6:"Saturday", j0:"Sunday", memesHoraires:"Same hours for all selected days",
    chercherHote:"Host name or ID…", site:"Site", motif:"Purpose", nature:"Type", n_visite:"Visit", n_intervention:"Contractor work", notes:"Reception notes",
    enregistrer:"Save", genere:"{n} visit(s) saved.", periode:"Period", jours:"Days and hours", suspendre:"Suspend", reprendreProg:"Resume", annulerProg:"Cancel schedule",
    st_active:"Active", st_suspendue:"Suspended", st_annulee:"Cancelled", exporter:"Export (CSV)", rechercher:"Search…", conservation:"History retention (days)", delaiNoShow:"No-show after (minutes)",
    hoteProgramme:"Hosts may schedule their own visitors", nouveauMotif:"New purpose", chargement:"Loading…", enregistre:"Saved.", plage:"{a}–{b} of {n}", existeDeja:"Already known: selected.",
    choisirSociete:"Choose a company first.", aucunBio:"No biometric data is stored for visitors."},
  ar:{jours_u:"أيام", motifs:"أسباب الزيارة", actif:"نشط", retirer:"سحب", hotesCoches:"{n} حساب مؤشر «يستقبل زوارا»: فقط هؤلاء الأجراء يقترحون كمستضيفين.", hotesAucun:"لا حساب مؤشر «يستقبل زوارا»: كل الأجراء النشطين يقترحون. أشر الخانة في الحسابات المعنية.", titre:"الزوار والتدخلات", lede:"إعادة استعمال الشركات والزوار المعروفين بنقرة، زيارات فردية أو مبرمجة بأوقات لكل يوم، شاشة الحراسة.",
    loge:"الحراسة", nouvelle:"زيارة جديدة", progs:"البرمجات", histo:"السجل", params:"الإعدادات", mesVisites:"زواري",
    f_tous:"اليوم", f_attendus:"منتظرون", f_retard:"متأخرون", f_presents:"حاضرون", f_partis:"غادروا", f_annules:"ملغاة", f_noshow:"لم يحضروا", f_interventions:"التدخلات",
    visiteur:"الزائر", societe:"الشركة", hote:"المستضيف", service:"المصلحة", zone:"المنطقة", debutPrevu:"البداية المبرمجة", finPrevue:"النهاية المبرمجة", statut:"الحالة", entree:"الدخول", actions:"إجراءات",
    s_ANNONCEE:"منتظر", s_ARRIVEE:"وصل", s_EN_VISITE:"في الزيارة", s_PARTIE:"غادر", s_ANNULEE:"ملغاة", s_NO_SHOW:"لم يحضر",
    a_arrivee:"وصول", a_debut:"بداية", a_depart:"مغادرة", a_annuler:"إلغاء", maj:"حدّث على {h}", rien:"لا زيارات.",
    etape1:"1. الشركة", etape2:"2. الزوار", etape3:"3. الموعد", etape4:"4. المستضيف والمكان والسبب", saisirSociete:"اسم الشركة…", creerSociete:"إنشاء الشركة «{n}»",
    changer:"تغيير", nouveauVisiteur:"زائر جديد", nom:"اللقب", prenom:"الاسم", tel:"الهاتف", ajouter:"إضافة", aucunVisiteur:"لا زائر معروف لهذه الشركة: أنشئه أدناه.",
    reprendre:"استئناف آخر برمجة", unique:"زيارة فردية", serie:"سلسلة زيارات", date:"التاريخ", debut:"البداية", fin:"النهاية", du:"من", au:"إلى", arriveeMaintenant:"وصل الآن",
    j1:"الاثنين", j2:"الثلاثاء", j3:"الأربعاء", j4:"الخميس", j5:"الجمعة", j6:"السبت", j0:"الأحد", memesHoraires:"نفس الأوقات لكل الأيام المحددة",
    chercherHote:"اسم أو معرف المستضيف…", site:"الموقع", motif:"السبب", nature:"النوع", n_visite:"زيارة", n_intervention:"تدخل / أشغال", notes:"ملاحظات الاستقبال",
    enregistrer:"حفظ", genere:"سجلت {n} زيارة.", periode:"الفترة", jours:"الأيام والأوقات", suspendre:"تعليق", reprendreProg:"استئناف", annulerProg:"إلغاء البرمجة",
    st_active:"نشطة", st_suspendue:"معلقة", st_annulee:"ملغاة", exporter:"تصدير (CSV)", rechercher:"بحث…", conservation:"مدة حفظ السجل (أيام)", delaiNoShow:"عدم الحضور بعد (دقائق)",
    hoteProgramme:"يمكن للمستضيفين برمجة زوارهم", nouveauMotif:"سبب جديد", chargement:"جار التحميل…", enregistre:"تم الحفظ.", plage:"{a}–{b} من {n}", existeDeja:"معروف مسبقا: تم اختياره.",
    choisirSociete:"اختر الشركة أولا.", aucunBio:"لا تسجل أي بيانات بيومترية للزوار."}
};
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const coche = id => !!(document.getElementById(id)||{}).checked;
const auj = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];
function F(ctx){ const E = ctx.etat; return E.f || (E.f = {ent:null, vis:[], visiteurs:null, mode:"unique", hote:null, jours:{1:{on:true, debut:"08:00", fin:"17:00"}, 2:{on:true, debut:"08:00", fin:"17:00"}, 3:{on:true, debut:"08:00", fin:"17:00"}, 4:{on:true, debut:"08:00", fin:"17:00"}, 5:{on:true, debut:"08:00", fin:"17:00"}, 6:{on:false, debut:"08:00", fin:"12:00"}, 0:{on:false, debut:"08:00", fin:"12:00"}}, derniere:undefined}); }
function charger(ctx){
  const E = ctx.etat;
  if (!E.init){ Object.assign(E, {init:true, onglet:null, filtre:"tous", L:null, P:null, H:null, stP:"active", offH:0, qH:""});
    /* saisie : propositions de sociétés, de visiteurs et d'hôtes dès la frappe (une requête serveur limitée) */
    ctx.ecouter(document, "input", ev=>{ const el = ev.target; if (!el || !el.dataset || !el.dataset.fwv) return; clearTimeout(E.tSaisie);
      E.tSaisie = setTimeout(()=>proposer(ctx, el.dataset.fwv, el.value), 180); }); }
  if (!E.par && !E.parEn){ E.parEn = true; ctx.api("api/v1/visiteurs/parametres").then(j=>{ E.par = j; E.parEn = false; if (!E.onglet) E.onglet = j.rang >= 1 ? "loge" : "loge"; ctx.rendre(); }).catch(e=>{ E.parEn = false; ctx.flash(e.message, "err"); }); }
  if (E.onglet === "loge" && !E.L && !E.lEn) chargerLoge(ctx);
  if (E.onglet === "progs" && !E.P && !E.pEn){ E.pEn = true; ctx.api("api/v1/visiteurs/programmations?limit=100&statut="+E.stP).then(j=>{ E.P = j; E.pEn = false; ctx.rendre(); }).catch(e=>{ E.pEn = false; ctx.flash(e.message, "err"); }); }
  if (E.onglet === "histo" && !E.H && !E.hEn){ E.hEn = true; ctx.api("api/v1/visiteurs/historique?limit=50&offset="+E.offH+"&q="+encodeURIComponent(E.qH)).then(j=>{ E.H = j; E.hEn = false; ctx.rendre(); }).catch(e=>{ E.hEn = false; ctx.flash(e.message, "err"); }); }
}
function chargerLoge(ctx){
  const E = ctx.etat; E.lEn = true;
  return ctx.api("api/v1/visiteurs/loge?filtre="+E.filtre).then(j=>{ E.L = j; E.lEn = false; E.lH = new Date(); ctx.rendre(); }).catch(e=>{ E.lEn = false; ctx.flash(e.message, "err"); });
}
/* propositions : sociétés, visiteurs (de la société choisie), hôtes — mises à jour sans redessiner l'écran */
function proposer(ctx, quoi, texte){
  const F0 = F(ctx), box = document.getElementById("fwvSug-"+quoi); if (!box) return;
  const url = quoi === "ent" ? "api/v1/visiteurs/entreprises?q="+encodeURIComponent(texte) : quoi === "hote" ? "api/v1/visiteurs/hotes?q="+encodeURIComponent(texte) : null;
  if (!url) return;
  ctx.api(url).then(j=>{ const l = j.lignes || [];
    if (quoi === "ent"){ const exact = l.some(x=>x.nom.toLowerCase() === texte.trim().toLowerCase());
      box.innerHTML = l.map(x=>'<button type="button" class="fwv-sug" data-act="fwm:choisir-ent" data-id="'+ctx.esc(x.id)+'" data-nom="'+ctx.esc(x.nom)+'"><strong>'+ctx.esc(x.nom)+'</strong>'+(x.visiteurs ? ' <span class="fw-hint">· '+x.visiteurs+'</span>' : '')+'</button>').join("")+
        (texte.trim() && !exact ? '<button type="button" class="fwv-sug fwv-creer" data-act="fwm:creer-ent">'+ctx.esc(T(ctx,"creerSociete").replace("{n}", texte.trim()))+'</button>' : ''); }
    else box.innerHTML = l.map(x=>'<button type="button" class="fwv-sug" data-act="fwm:choisir-hote" data-m="'+ctx.esc(x.mat)+'" data-nom="'+ctx.esc(x.nom)+'" data-s="'+ctx.esc(x.service||"")+'"><strong>'+ctx.esc(x.nom)+'</strong> <span class="fw-hint">'+ctx.esc(x.mat+(x.service ? " · "+x.service : "")+(x.poste ? " · "+x.poste : ""))+'</span></button>').join("");
  }).catch(()=>{}); void F0;
}
const pastille = (ctx, s) => '<span class="fwv-st fwv-'+s+'">'+ctx.esc(T(ctx,"s_"+s))+'</span>';
const heure = iso => iso ? new Date(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", hour12:false}) : "—";
function vueLoge(ctx){
  const E = ctx.etat, X = E.L, c = (X && X.comptes) || {};
  const nb = k => k === "tous" ? Object.values(c).reduce((s, n)=>s + n, 0) : k === "attendus" ? c.ANNONCEE||0 : k === "presents" ? (c.ARRIVEE||0) + (c.EN_VISITE||0) : k === "partis" ? c.PARTIE||0 : k === "annules" ? c.ANNULEE||0 : k === "noshow" ? c.NO_SHOW||0 : null;
  return '<div class="fwv-filtres" role="tablist">'+["tous","attendus","retard","presents","partis","annules","noshow","interventions"].map(f=>{ const n = nb(f);
      return '<button type="button" class="fwv-f'+(E.filtre === f ? ' on' : '')+'" data-act="fwm:filtre" data-f="'+f+'" aria-pressed="'+(E.filtre === f)+'">'+ctx.esc(T(ctx,"f_"+f))+(n != null ? ' <b>'+n+'</b>' : '')+'</button>'; }).join("")+
    '<span class="fw-hint fwv-maj">'+(E.lH ? ctx.esc(T(ctx,"maj").replace("{h}", E.lH.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}))) : "")+'</span></div>'+
    (!X ? '<div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+ctx.esc(T(ctx,"rien"))+'</div>' :
    '<div class="fw-tablewrap"><table class="fw-tbl fwv-loge"><thead><tr><th>'+ctx.esc(T(ctx,"visiteur"))+'</th><th>'+ctx.esc(T(ctx,"societe"))+'</th><th>'+ctx.esc(T(ctx,"hote"))+'</th><th>'+ctx.esc(T(ctx,"service"))+'</th><th>'+ctx.esc(T(ctx,"zone"))+'</th><th>'+ctx.esc(T(ctx,"debutPrevu"))+'</th><th>'+ctx.esc(T(ctx,"finPrevue"))+'</th><th>'+ctx.esc(T(ctx,"statut"))+'</th><th>'+ctx.esc(T(ctx,"entree"))+'</th><th>'+ctx.esc(T(ctx,"actions"))+'</th></tr></thead><tbody>'+
      X.lignes.map(v=>'<tr'+(v.nature === "intervention" ? ' class="fwv-inter"' : '')+'><td><strong>'+ctx.esc(v.nom+" "+(v.prenom||""))+'</strong>'+(v.motif ? '<div class="fw-hint">'+ctx.esc(v.motif)+'</div>' : '')+'</td><td>'+ctx.esc(v.entreprise)+'</td>'+
        '<td>'+ctx.esc(v.hote.nom)+(v.hote.tel ? '<div class="fw-hint">'+ctx.esc(v.hote.tel)+'</div>' : '')+'</td><td>'+ctx.esc(v.hote.service||"—")+'</td><td>'+ctx.esc(v.zone||v.site||"—")+'</td>'+
        '<td class="fw-mono">'+ctx.esc(v.debut_prevu)+'</td><td class="fw-mono">'+ctx.esc(v.fin_prevu)+'</td><td>'+pastille(ctx, v.statut)+'</td><td class="fw-mono">'+ctx.esc(heure(v.arrivee_le))+'</td>'+
        '<td class="fwv-act">'+v.suites.filter(s=>s !== "NO_SHOW").map(s=>{ const a = {ARRIVEE:"arrivee", EN_VISITE:"debut", PARTIE:"depart", ANNULEE:"annuler"}[s];
          return (a === "annuler" && E.par.rang < 2) ? '' : '<button class="fw-btn sm'+(a === "arrivee" || a === "depart" ? ' pri' : '')+'" data-act="fwm:statut" data-id="'+ctx.esc(v.id)+'" data-a="'+a+'">'+ctx.esc(T(ctx,"a_"+a))+'</button>'; }).join("")+'</td></tr>').join("")+'</tbody></table></div>');
}
function vueNouvelle(ctx){
  const E = ctx.etat, P = E.par, f = F(ctx), h = s => ctx.esc(s);
  let o = '<div class="fwv-form"><section><h2>'+h(T(ctx,"etape1"))+'</h2>';
  o += f.ent ? '<div class="fwv-choix"><strong>'+h(f.ent.nom)+'</strong> <button class="fw-btn sm" data-act="fwm:changer-ent">'+h(T(ctx,"changer"))+'</button>'+(f.derniere ? ' <button class="fw-btn sm" data-act="fwm:reprendre">'+h(T(ctx,"reprendre"))+'</button>' : '')+'</div>'
    : '<input id="fwvEnt" data-fwv="ent" autocomplete="off" placeholder="'+h(T(ctx,"saisirSociete"))+'" aria-label="'+h(T(ctx,"saisirSociete"))+'"><div id="fwvSug-ent" class="fwv-sugs" role="listbox"></div>';
  o += '</section>';
  if (f.ent){
    o += '<section><h2>'+h(T(ctx,"etape2"))+'</h2>'+(!f.visiteurs ? '<div class="fw-hint">'+h(T(ctx,"chargement"))+'</div>' : !f.visiteurs.length ? '<p class="fw-hint">'+h(T(ctx,"aucunVisiteur"))+'</p>' :
      '<div class="fwv-chips">'+f.visiteurs.map(v=>'<button type="button" class="fwv-chip'+(f.vis.indexOf(v.id) >= 0 ? ' on' : '')+'" data-act="fwm:basculer-vis" data-id="'+h(v.id)+'" aria-pressed="'+(f.vis.indexOf(v.id) >= 0)+'">'+h(v.nom+" "+(v.prenom||""))+'</button>').join("")+'</div>')+
      '<details class="fwv-nouveau"'+(f.visiteurs && !f.visiteurs.length ? ' open' : '')+'><summary>'+h(T(ctx,"nouveauVisiteur"))+'</summary><div class="fwv-ligne"><input id="fwvVN" placeholder="'+h(T(ctx,"nom"))+'" aria-label="'+h(T(ctx,"nom"))+'"><input id="fwvVP" placeholder="'+h(T(ctx,"prenom"))+'" aria-label="'+h(T(ctx,"prenom"))+'"><input id="fwvVT" placeholder="'+h(T(ctx,"tel"))+'" aria-label="'+h(T(ctx,"tel"))+'"><button class="fw-btn" data-act="fwm:creer-vis">'+h(T(ctx,"ajouter"))+'</button></div></details></section>';
    o += '<section><h2>'+h(T(ctx,"etape3"))+'</h2><div class="fwv-modes"><button type="button" class="fwv-f'+(f.mode === "unique" ? ' on' : '')+'" data-act="fwm:mode" data-m="unique">'+h(T(ctx,"unique"))+'</button><button type="button" class="fwv-f'+(f.mode === "serie" ? ' on' : '')+'" data-act="fwm:mode" data-m="serie">'+h(T(ctx,"serie"))+'</button></div>';
    o += f.mode === "unique"
      ? '<div class="fwv-ligne"><label>'+h(T(ctx,"date"))+' <input type="date" id="fwvD" value="'+auj()+'" min="'+auj()+'"></label><label>'+h(T(ctx,"debut"))+' <input type="time" id="fwvHD" value="'+(f.hd||"09:00")+'"></label><label>'+h(T(ctx,"fin"))+' <input type="time" id="fwvHF" value="'+(f.hf||"12:00")+'"></label>'+(P.rang >= 1 ? '<label class="fwv-chk"><input type="checkbox" id="fwvImm"> '+h(T(ctx,"arriveeMaintenant"))+'</label>' : '')+'</div>'
      : '<div class="fwv-ligne"><label>'+h(T(ctx,"du"))+' <input type="date" id="fwvDu" value="'+(f.du||auj())+'" min="'+auj()+'"></label><label>'+h(T(ctx,"au"))+' <input type="date" id="fwvAu" value="'+(f.au||"")+'"></label></div>'+
        '<table class="fwv-jours"><tbody>'+ORDRE_JOURS.map(j=>{ const x = f.jours[j]; return '<tr><td><label class="fwv-chk"><input type="checkbox" data-fwmc="jour-on" data-j="'+j+'"'+(x.on ? ' checked' : '')+'> '+h(T(ctx,"j"+j))+'</label></td><td><input type="time" data-fwmc="jour-debut" data-j="'+j+'" value="'+x.debut+'"'+(x.on ? '' : ' disabled')+' aria-label="'+h(T(ctx,"j"+j)+" "+T(ctx,"debut"))+'"></td><td><input type="time" data-fwmc="jour-fin" data-j="'+j+'" value="'+x.fin+'"'+(x.on ? '' : ' disabled')+' aria-label="'+h(T(ctx,"j"+j)+" "+T(ctx,"fin"))+'"></td></tr>'; }).join("")+'</tbody></table>'+
        '<button class="fw-btn sm" data-act="fwm:memes">'+h(T(ctx,"memesHoraires"))+'</button>';
    o += '</section><section><h2>'+h(T(ctx,"etape4"))+'</h2>';
    o += f.hote ? '<div class="fwv-choix"><strong>'+h(f.hote.nom)+'</strong> <span class="fw-hint">'+h(f.hote.mat+(f.hote.service ? " · "+f.hote.service : ""))+'</span> <button class="fw-btn sm" data-act="fwm:changer-hote">'+h(T(ctx,"changer"))+'</button></div>'
      : '<input id="fwvHote" data-fwv="hote" autocomplete="off" placeholder="'+h(T(ctx,"chercherHote"))+'" aria-label="'+h(T(ctx,"chercherHote"))+'"><div id="fwvSug-hote" class="fwv-sugs" role="listbox"></div>';
    const sel = (id, l, opts, cur) => '<label>'+h(l)+' <select id="'+id+'">'+opts.map(x=>'<option value="'+h(x.id)+'"'+(x.id === cur ? ' selected' : '')+'>'+h(x.nom)+'</option>').join("")+'</select></label>';
    o += '<div class="fwv-ligne">'+sel("fwvSite", T(ctx,"site"), P.sites, f.site)+(P.accesActif ? sel("fwvZone", T(ctx,"zone"), P.zones.filter(z=>!z.siteId || !f.site || z.siteId === f.site), f.zone) : '')+
      sel("fwvMotif", T(ctx,"motif"), P.motifs.map(m=>({id:m.id, nom:m.libelle+(m.nature === "intervention" ? " ⚒" : "")})), f.motif)+'</div>'+
      '<div class="fwv-ligne"><label class="fwv-grand">'+h(T(ctx,"notes"))+' <input id="fwvNotes" value="'+h(f.notes||"")+'"></label></div></section>'+
      '<div class="fw-toolbar"><button class="fw-btn pri" data-act="fwm:enregistrer">'+h(T(ctx,"enregistrer"))+'</button><span class="fw-hint">'+h(T(ctx,"aucunBio"))+'</span></div>';
  }
  return o+'</div>';
}
function vueProgs(ctx){
  const E = ctx.etat, X = E.P, h = s => ctx.esc(s);
  return '<div class="fw-toolbar"><select data-fwmc="stP">'+["active","suspendue","annulee"].map(s=>'<option value="'+s+'"'+(E.stP === s ? ' selected' : '')+'>'+h(T(ctx,"st_"+s))+'</option>').join("")+'</select></div>'+
    (!X ? '<div class="fw-hint">'+h(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+h(T(ctx,"rien"))+'</div>' :
    '<div class="fw-tablewrap"><table class="fw-tbl"><thead><tr><th>'+h(T(ctx,"societe"))+'</th><th>'+h(T(ctx,"visiteur"))+'</th><th>'+h(T(ctx,"periode"))+'</th><th>'+h(T(ctx,"jours"))+'</th><th>'+h(T(ctx,"hote"))+'</th><th>'+h(T(ctx,"motif"))+'</th><th></th></tr></thead><tbody>'+
      X.lignes.map(p=>'<tr><td><strong>'+h(p.entreprise)+'</strong>'+(p.nature === "intervention" ? ' <span class="fw-tag">'+h(T(ctx,"n_intervention"))+'</span>' : '')+'</td><td>'+h(p.visiteurs.map(v=>v.nom).join(", "))+'</td><td>'+h(ctx.dateAff(p.du)+" → "+ctx.dateAff(p.au))+'</td>'+
        '<td class="fw-sm">'+ORDRE_JOURS.filter(j=>p.jours[j]).map(j=>h(T(ctx,"j"+j).slice(0, 3)+" "+p.jours[j].debut+"–"+p.jours[j].fin)).join("<br>")+'</td><td>'+h(p.hote.nom)+'</td><td>'+h(p.motif||"")+'</td>'+
        '<td class="fwv-act">'+(E.par.rang >= 2 || p.hote_mat === E.par.hote ? (p.statut === "active" ? '<button class="fw-btn sm" data-act="fwm:prog" data-id="'+h(p.id)+'" data-a="suspendre">'+h(T(ctx,"suspendre"))+'</button>' : p.statut === "suspendue" ? '<button class="fw-btn sm" data-act="fwm:prog" data-id="'+h(p.id)+'" data-a="reprendre">'+h(T(ctx,"reprendreProg"))+'</button>' : '')+
          (p.statut !== "annulee" ? '<button class="fw-btn sm" data-act="fwm:prog" data-id="'+h(p.id)+'" data-a="annuler">'+h(T(ctx,"annulerProg"))+'</button>' : '') : '')+'</td></tr>').join("")+'</tbody></table></div>');
}
function vueHisto(ctx){
  const E = ctx.etat, X = E.H, h = s => ctx.esc(s);
  return '<div class="fw-toolbar"><input type="search" data-fwmc="qH" value="'+h(E.qH)+'" placeholder="'+h(T(ctx,"rechercher"))+'" aria-label="'+h(T(ctx,"rechercher"))+'">'+
    (X ? '<span class="fw-hint">'+h(T(ctx,"plage").replace("{a}", X.total ? E.offH+1 : 0).replace("{b}", Math.min(E.offH+50, X.total)).replace("{n}", X.total))+'</span><button class="fw-btn sm" data-act="fwm:hprec"'+(E.offH ? '' : ' disabled')+'>‹</button><button class="fw-btn sm" data-act="fwm:hsuiv"'+(E.offH+50 < X.total ? '' : ' disabled')+'>›</button>' : '')+
    (E.par.rang >= 3 ? '<a class="fw-btn" href="api/v1/visiteurs/export">'+h(T(ctx,"exporter"))+'</a>' : '')+'</div>'+
    (!X ? '<div class="fw-hint">'+h(T(ctx,"chargement"))+'</div>' : !X.lignes.length ? '<div class="fw-empty">'+h(T(ctx,"rien"))+'</div>' :
    '<div class="fw-tablewrap"><table class="fw-tbl"><thead><tr><th>'+h(T(ctx,"date"))+'</th><th>'+h(T(ctx,"visiteur"))+'</th><th>'+h(T(ctx,"societe"))+'</th><th>'+h(T(ctx,"hote"))+'</th><th>'+h(T(ctx,"statut"))+'</th><th>'+h(T(ctx,"entree"))+'</th></tr></thead><tbody>'+
      X.lignes.map(v=>'<tr><td>'+h(ctx.dateAff(v.d)+" "+v.debut_prevu)+'</td><td>'+h(v.nom+" "+(v.prenom||""))+'</td><td>'+h(v.entreprise)+'</td><td>'+h(v.hote.nom)+'</td><td>'+pastille(ctx, v.statut)+'</td><td class="fw-mono">'+h(heure(v.arrivee_le))+'</td></tr>').join("")+'</tbody></table></div>');
}
function vueParams(ctx){
  const P = ctx.etat.par, h = s => ctx.esc(s), sel = (id, l, vals, cur, unite) => '<label>'+h(l)+' <select id="'+id+'">'+vals.map(v=>'<option value="'+v+'"'+(v === cur ? ' selected' : '')+'>'+h(v+" "+unite)+'</option>').join("")+'</select></label>';
  const nat = (id, cur) => '<select id="'+id+'" aria-label="'+h(T(ctx,"nature"))+'"><option value="visite"'+(cur === "visite" ? ' selected' : '')+'>'+h(T(ctx,"n_visite"))+'</option><option value="intervention"'+(cur === "intervention" ? ' selected' : '')+'>'+h(T(ctx,"n_intervention"))+'</option></select>';
  return '<div class="fw-card fw-u-p fwv-ligne">'+sel("fwvCons", T(ctx,"conservation"), P.conservations, P.conservationJours, T(ctx,"jours_u"))+sel("fwvNs", T(ctx,"delaiNoShow"), P.delaisNoShow, P.delaiNoShowMin, "min")+
      '<label class="fwv-chk"><input type="checkbox" id="fwvHp"'+(P.hoteProgramme ? ' checked' : '')+'> '+h(T(ctx,"hoteProgramme"))+'</label><button class="fw-btn pri" data-act="fwm:params">'+h(T(ctx,"enregistrer"))+'</button></div>'+
    '<p class="fw-hint">'+h(P.hotesCoches ? T(ctx,"hotesCoches").replace("{n}", P.hotesCoches) : T(ctx,"hotesAucun"))+'</p>'+
    '<div class="fw-sec">'+h(T(ctx,"motifs"))+'</div><div class="fw-tablewrap"><table class="fw-tbl"><tbody>'+(P.motifsTous||[]).map(m=>'<tr'+(m.actif ? '' : ' class="fw-muted"')+'><td><input id="fwvML-'+h(m.id)+'" value="'+h(m.libelle)+'" aria-label="'+h(T(ctx,"motif"))+'"></td><td>'+nat("fwvMN-"+m.id, m.nature)+'</td>'+
      '<td><label class="fwv-chk"><input type="checkbox" id="fwvMA-'+h(m.id)+'"'+(m.actif ? ' checked' : '')+'> '+h(T(ctx,"actif"))+'</label></td><td class="fwv-act"><button class="fw-btn sm" data-act="fwm:motif" data-id="'+h(m.id)+'">'+h(T(ctx,"enregistrer"))+'</button><button class="fw-btn sm" data-act="fwm:motif-retirer" data-id="'+h(m.id)+'">'+h(T(ctx,"retirer"))+'</button></td></tr>').join("")+
      '<tr><td><input id="fwvMl" placeholder="'+h(T(ctx,"nouveauMotif"))+'" aria-label="'+h(T(ctx,"nouveauMotif"))+'"></td><td>'+nat("fwvMn", "visite")+'</td><td></td><td><button class="fw-btn sm" data-act="fwm:motif-ajout">'+h(T(ctx,"ajouter"))+'</button></td></tr></tbody></table></div>'+
    '<p class="fw-hint">'+h(T(ctx,"aucunBio"))+'</p>';
}
function choisirEnt(ctx, ent){
  const f = F(ctx); f.ent = ent; f.vis = []; f.visiteurs = null; f.derniere = undefined; ctx.rendre();
  ctx.api("api/v1/visiteurs/visiteurs?entreprise="+encodeURIComponent(ent.id)).then(j=>{ f.visiteurs = j.lignes; ctx.rendre(); });
  ctx.api("api/v1/visiteurs/derniere-programmation?entreprise="+encodeURIComponent(ent.id)).then(j=>{ f.derniere = j.programmation; ctx.rendre(); }).catch(()=>{});
}
function lireForm(ctx){
  const f = F(ctx); f.site = val("fwvSite") || f.site; f.zone = val("fwvZone") || f.zone; f.motif = val("fwvMotif") || f.motif; f.notes = val("fwvNotes");
  if (f.mode === "unique"){ f.hd = val("fwvHD") || f.hd; f.hf = val("fwvHF") || f.hf; } else { f.du = val("fwvDu") || f.du; f.au = val("fwvAu") || f.au; }
}
FIWAKTI_MODULES.enregistrer({
  id:"FW-Visiteurs",
  mount(ctx){ charger(ctx);
    /* actualisation de la loge : seulement tant que l'écran Loge est ouvert ; minuterie arrêtée en quittant le module */
    ctx.minuterie(()=>{ const E = ctx.etat; if (E.onglet === "loge" && !document.hidden && !E.lEn && document.querySelector(".fwv-loge, .fwv-filtres")) chargerLoge(ctx); }, ((ctx.etat.par && ctx.etat.par.rafraichissementSec) || 45) * 1000, true); },
  unmount(ctx){ clearTimeout(ctx.etat.tSaisie); },
  render(vue, ctx){
    charger(ctx); const E = ctx.etat, P = E.par;
    if (!P) return '<div class="fw-module fwv"><div class="fw-hint">'+ctx.esc(T(ctx,"chargement"))+'</div></div>';
    const ong = [["loge", P.rang >= 1 ? "loge" : "mesVisites"], ["nouvelle","nouvelle"], ["progs","progs"]].concat(P.rang >= 2 ? [["histo","histo"]] : []).concat(P.rang >= 4 ? [["params","params"]] : []);
    const corps = E.onglet === "nouvelle" ? vueNouvelle(ctx) : E.onglet === "progs" ? vueProgs(ctx) : E.onglet === "histo" ? vueHisto(ctx) : E.onglet === "params" ? vueParams(ctx) : vueLoge(ctx);
    return '<div class="fw-module fwv"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+ctx.esc(T(ctx,"titre"))+'</h1><p class="fw-hero-lede">'+ctx.esc(T(ctx,"lede"))+'</p></div></div>'+
      '<div class="fw-stabs" role="tablist">'+ong.map(([k, l], i)=>'<button type="button" role="tab" class="'+k+(E.onglet === k ? ' on' : '')+'" aria-selected="'+(E.onglet === k)+'" data-act="fwm:onglet" data-o="'+k+'">'+ctx.esc(T(ctx,l))+'</button>').join("")+'</div>'+
      '<div style="margin-top:12px">'+corps+'</div></div>';
  },
  action(a, el, ctx){
    const E = ctx.etat, f = F(ctx), ko = e => ctx.flash(e.message, "err");
    if (a === "onglet"){ E.onglet = el.dataset.o; E.L = E.P = E.H = null; return ctx.rendre(); }
    if (a === "filtre"){ E.filtre = el.dataset.f; E.L = null; return ctx.rendre(); }
    if (a === "statut") return ctx.api("api/v1/visiteurs/visites/"+encodeURIComponent(el.dataset.id)+"/"+el.dataset.a, {corps:{}}).then(()=>chargerLoge(ctx)).catch(ko);
    if (a === "choisir-ent") return choisirEnt(ctx, {id:el.dataset.id, nom:el.dataset.nom});
    if (a === "creer-ent") return ctx.api("api/v1/visiteurs/entreprises", {corps:{nom:val("fwvEnt")}}).then(j=>choisirEnt(ctx, {id:j.id, nom:j.nom}))
      .catch(e=>{ if (e.statut === 409 || /existe déjà|already/i.test(e.message)){ ctx.api("api/v1/visiteurs/entreprises?q="+encodeURIComponent(val("fwvEnt"))).then(j=>{ if (j.lignes[0]){ ctx.flash(T(ctx,"existeDeja"), "ok"); choisirEnt(ctx, j.lignes[0]); } }); } else ko(e); });
    if (a === "changer-ent"){ lireForm(ctx); f.ent = null; f.vis = []; f.visiteurs = null; return ctx.rendre(); }
    if (a === "basculer-vis"){ const i = f.vis.indexOf(el.dataset.id); if (i >= 0) f.vis.splice(i, 1); else f.vis.push(el.dataset.id); lireForm(ctx); return ctx.rendre(); }
    if (a === "creer-vis") return ctx.api("api/v1/visiteurs/visiteurs", {corps:{entreprise:f.ent.id, nom:val("fwvVN"), prenom:val("fwvVP"), tel:val("fwvVT")}})
      .then(j=>{ lireForm(ctx); f.vis.push(j.id); return ctx.api("api/v1/visiteurs/visiteurs?entreprise="+encodeURIComponent(f.ent.id)).then(k=>{ f.visiteurs = k.lignes; ctx.rendre(); }); })
      .catch(e=>{ if (/existe déjà|already/i.test(e.message) && f.visiteurs){ const n = (val("fwvVN")+" "+val("fwvVP")).toLowerCase(); const x = f.visiteurs.find(v=>(v.nom+" "+(v.prenom||"")).toLowerCase() === n); if (x && f.vis.indexOf(x.id) < 0) f.vis.push(x.id); ctx.flash(T(ctx,"existeDeja"), "ok"); ctx.rendre(); } else ko(e); });
    if (a === "mode"){ lireForm(ctx); f.mode = el.dataset.m; return ctx.rendre(); }
    if (a === "memes"){ const ref = ORDRE_JOURS.find(j=>f.jours[j].on); if (ref === undefined) return; ORDRE_JOURS.forEach(j=>{ if (f.jours[j].on){ f.jours[j].debut = f.jours[ref].debut; f.jours[j].fin = f.jours[ref].fin; } }); lireForm(ctx); return ctx.rendre(); }
    if (a === "choisir-hote"){ lireForm(ctx); f.hote = {mat:el.dataset.m, nom:el.dataset.nom, service:el.dataset.s}; return ctx.rendre(); }
    if (a === "changer-hote"){ lireForm(ctx); f.hote = null; return ctx.rendre(); }
    if (a === "reprendre" && f.derniere){ const d = f.derniere; lireForm(ctx);
      f.vis = d.visiteurs.filter(v=>(f.visiteurs||[]).some(x=>x.id === v)); f.mode = "serie"; f.site = d.site_id; f.zone = d.zone_id; f.motif = d.motif_id; f.notes = d.notes || ""; f.hote = d.hote && d.hote.nom ? d.hote : null;
      ORDRE_JOURS.forEach(j=>{ const x = d.jours[j]; f.jours[j] = x ? {on:true, debut:x.debut, fin:x.fin} : Object.assign({}, f.jours[j], {on:false}); }); return ctx.rendre(); }
    if (a === "enregistrer"){
      lireForm(ctx);
      if (!f.ent) return ctx.flash(T(ctx,"choisirSociete"), "err");
      const commun = {visiteurs:f.vis, site:f.site || val("fwvSite"), zone:f.zone || null, hote:f.hote ? f.hote.mat : "", motif:f.motif || val("fwvMotif"), notes:f.notes,
        nature:((E.par.motifs.find(m=>m.id === (f.motif || val("fwvMotif")))||{}).nature) || "visite"};
      const req = f.mode === "unique" ? ctx.api("api/v1/visiteurs/visites", {corps:Object.assign({}, commun, {d:val("fwvD"), debut:val("fwvHD"), fin:val("fwvHF"), arriveeImmediate:coche("fwvImm")})})
        : ctx.api("api/v1/visiteurs/programmations", {corps:Object.assign({}, commun, {du:f.du, au:f.au, jours:Object.fromEntries(ORDRE_JOURS.filter(j=>f.jours[j].on).map(j=>[j, {debut:f.jours[j].debut, fin:f.jours[j].fin}]))})});
      return req.then(j=>{ ctx.flash(T(ctx,"genere").replace("{n}", j.visites != null ? j.visites : (j.ids||[]).length), "ok"); E.f = null; E.onglet = f.mode === "unique" ? "loge" : "progs"; E.L = E.P = null; ctx.rendre(); }).catch(ko);
    }
    if (a === "prog") return ctx.confirmer({titre:el.textContent, message:""}).then(r=>{ if (!r.ok) return;
      ctx.api("api/v1/visiteurs/programmations/"+encodeURIComponent(el.dataset.id)+"/"+el.dataset.a, {corps:{}}).then(j=>{ ctx.flash(T(ctx,"genere").replace("{n}", j.visites), "ok"); E.P = null; ctx.rendre(); }).catch(ko); });
    if (a === "hprec" || a === "hsuiv"){ E.offH = Math.max(0, E.offH + (a === "hsuiv" ? 50 : -50)); E.H = null; return ctx.rendre(); }
    const relire = () => { ctx.flash(T(ctx,"enregistre"), "ok"); E.par = null; ctx.rendre(); };
    if (a === "params") return ctx.api("api/v1/visiteurs/parametres", {corps:{conservationJours:Number(val("fwvCons")), delaiNoShowMin:Number(val("fwvNs")), hoteProgramme:coche("fwvHp")}}).then(relire).catch(ko);
    if (a === "motif-ajout") return val("fwvMl") ? ctx.api("api/v1/visiteurs/parametres", {corps:{motif:{libelle:val("fwvMl"), nature:val("fwvMn")}}}).then(relire).catch(ko) : undefined;
    if (a === "motif") return ctx.api("api/v1/visiteurs/motifs/"+encodeURIComponent(el.dataset.id), {corps:{libelle:val("fwvML-"+el.dataset.id), nature:val("fwvMN-"+el.dataset.id), actif:coche("fwvMA-"+el.dataset.id)}}).then(relire).catch(ko);
    if (a === "motif-retirer") return ctx.confirmer({titre:T(ctx,"retirer"), message:val("fwvML-"+el.dataset.id)}).then(r=>{ if (r.ok) ctx.api("api/v1/visiteurs/motifs/"+encodeURIComponent(el.dataset.id), {corps:{supprimer:true}}).then(relire).catch(ko); });
  },
  change(k, el, ctx){
    const E = ctx.etat, f = F(ctx);
    if (k === "jour-on"){ lireForm(ctx); f.jours[el.dataset.j].on = el.checked; return ctx.rendre(); }
    if (k === "jour-debut" || k === "jour-fin"){ f.jours[el.dataset.j][k === "jour-debut" ? "debut" : "fin"] = el.value; return; }
    if (k === "stP"){ E.stP = el.value; E.P = null; return ctx.rendre(); }
    if (k === "qH"){ E.qH = el.value.trim(); E.offH = 0; E.H = null; return ctx.rendre(); }
  }
});
})();
