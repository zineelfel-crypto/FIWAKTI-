"use strict";
(function(){
  const $ = s => document.querySelector(s);
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let login = "", jeton = "";
  /* correctif 24 : page trilingue (fr, en, ar — de droite à gauche), choix mémorisé sur le poste */
  const T = {
    fr:{vitT:"Temps, RH et sécurité,<br>au même endroit.", vit1:"<b>Pointage fiable</b>Badgeages, anomalies et validations en temps réel.", vit2:"<b>Accès maîtrisés</b>Zones, droits et pointeuses synchronisés.", vit3:"<b>Équipes suivies</b>Absences, compétences, formation et santé.", vitPied:"Vos données restent sur votre serveur, chiffrées et sauvegardées chaque nuit.",
      cnxT:"Connexion", login:"Identifiant ou matricule", mdp:"Mot de passe", afficher:"Afficher", masquer:"Masquer", aidePortail:"Première connexion : salarié, identifiant et mot de passe = votre matricule ; autre compte, mot de passe temporaire remis par l'administrateur.", memoriser:"Rester connecté sur ce poste", oubli:"Mot de passe oublié ? Adressez-vous au service RH.", seConnecter:"Se connecter", fournisseur:"Intervention du fournisseur",
      jetonH:"Collez le jeton d'intervention remis par votre fournisseur. Valable une heure, pour ce serveur seulement, il n'ouvre que l'écran de licence.", jeton:"Jeton d'intervention", retour:"Retour", ouvrirLic:"Ouvrir l'écran de licence",
      a2fT:"Vérification en deux étapes", a2fH:"Votre profil exige un code de vérification. Dans votre application d'authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…), ajoutez un compte avec cette clé :", a2fLien:"Ou ouvrez ce lien sur le téléphone :", a2fAjout:"ajouter à l'application", a2fConf:"Gardez cette clé confidentielle.", a2fCode:"Code à 6 chiffres affiché par l'application", annuler:"Annuler", verifier:"Vérifier",
      chgT:"Changement de mot de passe", actuel:"Mot de passe actuel", aideActuel:"À la première connexion, c'est votre matricule (ou le mot de passe temporaire remis par l'administrateur).", nouveau:"Nouveau mot de passe", conf:"Confirmation", valider:"Valider et accéder",
      rPremiere:"Première connexion : choisissez votre mot de passe personnel. L'accès à l'application s'ouvre ensuite.", rReinit:"Votre mot de passe a été réinitialisé. Choisissez un nouveau mot de passe personnel.", rExpire:"Votre mot de passe a expiré. Choisissez un nouveau mot de passe.", rInvitation:"Choisissez votre mot de passe personnel.", rForce:"Votre administrateur vous demande de changer votre mot de passe.",
      gMat:"Différent du matricule, de l'identifiant et du nom (sans les contenir)", gLong:"Au moins {n} caractères", gMaj:"Au moins une majuscule", gChif:"Au moins un chiffre", gMin:"Au moins une minuscule", gSpec:"Au moins un caractère spécial", gActuel:"Différent du mot de passe actuel", gConf:"Confirmation identique", gCourant:"Pas un mot de passe courant (prénom, ville, « azerty »…) ni le nom de l'entreprise", gHisto:"Différent de vos {n} derniers mots de passe (vérifié à la validation)",
      pasServeur:"Le serveur ne répond pas.", jetonRefus:"Jeton refusé.", pasServeur2:"Le serveur FIWAKTI ne répond pas."},
    en:{vitT:"Time, HR and security,<br>in one place.", vit1:"<b>Reliable time tracking</b>Clockings, anomalies and approvals in real time.", vit2:"<b>Controlled access</b>Zones, rights and synchronised terminals.", vit3:"<b>Teams followed</b>Absences, skills, training and health.", vitPied:"Your data stays on your server, encrypted and backed up every night.",
      cnxT:"Sign in", login:"Login or employee number", mdp:"Password", afficher:"Show", masquer:"Hide", aidePortail:"First sign-in: employees, login and password = your employee number; other accounts, the temporary password given by the administrator.", memoriser:"Keep me signed in on this computer", oubli:"Forgot your password? Contact the HR department.", seConnecter:"Sign in", fournisseur:"Supplier intervention",
      jetonH:"Paste the intervention token given by your supplier. Valid for one hour, for this server only, it opens the licence screen only.", jeton:"Intervention token", retour:"Back", ouvrirLic:"Open the licence screen",
      a2fT:"Two-step verification", a2fH:"Your profile requires a verification code. In your authenticator app (Google Authenticator, Microsoft Authenticator, FreeOTP…), add an account with this key:", a2fLien:"Or open this link on your phone:", a2fAjout:"add to the app", a2fConf:"Keep this key confidential.", a2fCode:"6-digit code shown by the app", annuler:"Cancel", verifier:"Verify",
      chgT:"Change password", actuel:"Current password", aideActuel:"At first sign-in, it is your employee number (or the temporary password given by the administrator).", nouveau:"New password", conf:"Confirmation", valider:"Confirm and continue",
      rPremiere:"First sign-in: choose your personal password. The application then opens.", rReinit:"Your password has been reset. Choose a new personal password.", rExpire:"Your password has expired. Choose a new password.", rInvitation:"Choose your personal password.", rForce:"Your administrator asks you to change your password.",
      gMat:"Different from the employee number, login and name (not containing them)", gLong:"At least {n} characters", gMaj:"At least one capital letter", gChif:"At least one digit", gMin:"At least one lower-case letter", gSpec:"At least one special character", gActuel:"Different from the current password", gConf:"Confirmation matches", gCourant:"Not a common password (first name, city, \"qwerty\"…) nor the company name", gHisto:"Different from your last {n} passwords (checked on confirmation)",
      pasServeur:"The server does not respond.", jetonRefus:"Token refused.", pasServeur2:"The FIWAKTI server does not respond."},
    ar:{vitT:"الوقت والموارد البشرية والأمان<br>في مكان واحد.", vit1:"<b>تسجيل حضور موثوق</b>التسجيلات والإخلالات والمصادقات في الوقت الحقيقي.", vit2:"<b>نفاذ مضبوط</b>مناطق وصلاحيات وأجهزة تسجيل متزامنة.", vit3:"<b>متابعة الفرق</b>الغيابات والكفاءات والتكوين والصحة.", vitPied:"تبقى بياناتك على خادمك، مشفرة ومحفوظة كل ليلة.",
      cnxT:"تسجيل الدخول", login:"المعرّف أو الرقم الوظيفي", mdp:"كلمة السر", afficher:"إظهار", masquer:"إخفاء", aidePortail:"الدخول الأول: للأجير، المعرّف وكلمة السر = رقمك الوظيفي؛ لبقية الحسابات، كلمة السر المؤقتة التي سلمها المسؤول.", memoriser:"البقاء متصلا على هذا الجهاز", oubli:"نسيت كلمة السر؟ اتصل بمصلحة الموارد البشرية.", seConnecter:"دخول", fournisseur:"تدخل المزوّد",
      jetonH:"الصق رمز التدخل الذي سلمه لك المزوّد. صالح لمدة ساعة ولهذا الخادم فقط، ولا يفتح إلا شاشة الترخيص.", jeton:"رمز التدخل", retour:"رجوع", ouvrirLic:"فتح شاشة الترخيص",
      a2fT:"التحقق بخطوتين", a2fH:"يتطلب ملفك رمز تحقق. في تطبيق المصادقة (Google Authenticator، Microsoft Authenticator، FreeOTP…)، أضف حسابا بهذا المفتاح:", a2fLien:"أو افتح هذا الرابط على الهاتف:", a2fAjout:"إضافة إلى التطبيق", a2fConf:"احتفظ بهذا المفتاح سرّيا.", a2fCode:"الرمز المكوّن من 6 أرقام الذي يعرضه التطبيق", annuler:"إلغاء", verifier:"تحقق",
      chgT:"تغيير كلمة السر", actuel:"كلمة السر الحالية", aideActuel:"عند الدخول الأول، هي رقمك الوظيفي (أو كلمة السر المؤقتة التي سلمها المسؤول).", nouveau:"كلمة السر الجديدة", conf:"التأكيد", valider:"تأكيد والدخول",
      rPremiere:"الدخول الأول: اختر كلمة السر الخاصة بك. يُفتح التطبيق بعد ذلك.", rReinit:"تمت إعادة تعيين كلمة السر. اختر كلمة سر شخصية جديدة.", rExpire:"انتهت صلاحية كلمة السر. اختر كلمة سر جديدة.", rInvitation:"اختر كلمة السر الخاصة بك.", rForce:"يطلب منك المسؤول تغيير كلمة السر.",
      gMat:"مختلفة عن الرقم الوظيفي والمعرّف والاسم (ولا تحتويها)", gLong:"{n} أحرف على الأقل", gMaj:"حرف كبير على الأقل", gChif:"رقم على الأقل", gMin:"حرف صغير على الأقل", gSpec:"رمز خاص على الأقل", gActuel:"مختلفة عن كلمة السر الحالية", gConf:"التأكيد مطابق", gCourant:"ليست كلمة سر شائعة (اسم، مدينة، «azerty»…) ولا اسم المؤسسة", gHisto:"مختلفة عن آخر {n} كلمات سر (يُتحقق عند التأكيد)",
      pasServeur:"الخادم لا يستجيب.", jetonRefus:"الرمز مرفوض.", pasServeur2:"خادم FIWAKTI لا يستجيب."}};
  /* messages du serveur les plus fréquents (rédigés en français par le serveur) */
  const MSG = {"Identifiant ou mot de passe incorrect.":{en:"Incorrect login or password.", ar:"المعرّف أو كلمة السر غير صحيحة."},
    "Trop de tentatives depuis ce poste. Réessayez dans quelques minutes.":{en:"Too many attempts from this computer. Try again in a few minutes.", ar:"محاولات كثيرة من هذا الجهاز. أعد المحاولة بعد دقائق."},
    "Ce mot de passe temporaire a déjà servi : il n'ouvre qu'une seule connexion, et le mot de passe personnel n'a pas été choisi. Demandez-en un nouveau à l'administrateur.":{en:"This temporary password has already been used: it opens a single sign-in, and no personal password was chosen. Ask the administrator for a new one.", ar:"سبق استعمال كلمة السر المؤقتة هذه: فهي تفتح دخولا واحدا ولم تُختر كلمة سر شخصية. اطلب كلمة جديدة من المسؤول."},
    "Code incorrect ou déjà utilisé.":{en:"Incorrect or already used code.", ar:"رمز غير صحيح أو مستعمل."},
    "Mot de passe actuel incorrect.":{en:"Current password is incorrect.", ar:"كلمة السر الحالية غير صحيحة."},
    "Mot de passe trop courant ou trop facile à deviner.":{en:"Password too common or too easy to guess.", ar:"كلمة سر شائعة أو سهلة التخمين."}};
  let L = "fr"; try { L = localStorage.getItem("fiwakti:cnx:lang") || ""; } catch(e){}
  if (!T[L]) L = /^ar/i.test(navigator.language || "") ? "ar" : /^en/i.test(navigator.language || "") ? "en" : "fr";
  const t = k => (T[L] && T[L][k]) || T.fr[k] || k;
  const trad = m => { m = String(m == null ? "" : m); if (L === "fr") return m; const x = MSG[m]; if (x && x[L]) return x[L];
    const v = /^Compte verrouillé jusqu'à (.+)\.$/.exec(m); if (v) return (L === "en" ? "Account locked until " : "الحساب مقفل إلى غاية ")+v[1]+"."; return m; };
  function appliquerLangue(){ document.documentElement.lang = L; document.documentElement.dir = L === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i]").forEach(el=>{ const v = t(el.dataset.i); if (/<b>|<br>/.test(v)) el.innerHTML = v; else el.textContent = v; });
    const sel = document.querySelector("#langue"); if (sel) sel.value = L; document.title = t("cnxT")+" — FIWAKTI"; }
  /* jeton anti-falsification de la session, exigé par le serveur pour toute modification */
  async function lireJeton(){ try { const r = await fetch("/api/v1/session", {credentials:"same-origin", cache:"no-store"}); if (r.ok){ const s = await r.json(); jeton = s.csrf || ""; return s; } } catch(e){} return null; }
  appliquerLangue();
  $("#langue").addEventListener("change", e=>{ L = T[e.target.value] ? e.target.value : "fr"; try { localStorage.setItem("fiwakti:cnx:lang", L); } catch(x){} appliquerLangue(); ["#msg","#msg2","#msg3"].forEach(x=>{ $(x).innerHTML = ""; }); if (!$("#fChanger").hidden) regles(); });
  let OPTS = {minLen:12, exigerMix:false, memoriser:false, aideConnexion:true, interdireCourants:true, historique:0, majChiffre:true};
  fetch("/api/v1/connexion/options", {cache:"no-store"}).then(r=>r.json()).then(o=>{ OPTS = Object.assign(OPTS, o); $("#memoriserBloc").hidden = !OPTS.memoriser; $("#aidePortail").hidden = OPTS.aideConnexion === false; if (o.entreprise) $("#entreprise").textContent = o.entreprise; }).catch(()=>{});
  /* double authentification : configuration au premier passage, puis code à chaque connexion */
  async function a2f(mode){
    $("#fConnexion").hidden = true; $("#fChanger").hidden = true; $("#fA2f").hidden = false;
    if (!jeton) await lireJeton();
    if (mode === "enrolement"){
      const r = await fetch("/api/v1/a2f/enrolement", {method:"POST", credentials:"same-origin", headers:{"X-CSRF":jeton}});
      const j = await r.json();
      if (r.ok){ $("#a2fEnrol").hidden = false; $("#a2fCle").textContent = j.secret; $("#a2fUri").href = j.uri; }
      else $("#msg3").innerHTML = '<div class="msg err">'+esc(trad(j.message))+'</div>';
    }
    setTimeout(()=>$("#a2fCode").focus(), 30);
  }
  $("#fA2f").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg3").innerHTML = "";
    const r = await fetch("/api/v1/a2f/verifier", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json", "X-CSRF":jeton}, body:JSON.stringify({code:$("#a2fCode").value})});
    const j = await r.json();
    if (!r.ok){ $("#msg3").innerHTML = '<div class="msg err">'+esc(trad(j.message))+'</div>'; $("#a2fCode").value = ""; if (r.status === 401 && /déjà|incorrect/.test(j.message)) return; location.href = "/connexion.html"; return; }
    if (j.changer){ $("#fA2f").hidden = true; return changer(j.raison); }
    location.href = "/";
  });
  $("#a2fAnnuler").addEventListener("click", async ()=>{ await fetch("/api/v1/deconnexion", {method:"POST", credentials:"same-origin", headers:{"X-CSRF":jeton}}); location.href = "/connexion.html"; });
  const RAISONS = {premiere:"rPremiere", reinit:"rReinit", expire:"rExpire", invitation:"rInvitation", force:"rForce"};
  function changer(raison){
    $("#fConnexion").hidden = true; $("#fChanger").hidden = false;
    $("#raison").textContent = t(RAISONS[raison] || RAISONS.premiere);
    setTimeout(()=>$("#actuel").focus(), 30); regles();
  }
  $("#fConnexion").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg").innerHTML = "";
    login = $("#login").value.trim();
    try {
      const r = await fetch("/api/v1/connexion", {method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body:JSON.stringify({login, mdp:$("#mdp").value, memoriser:$("#memoriser").checked})});
      const j = await r.json();
      if (!r.ok){ $("#msg").innerHTML = '<div class="msg err">'+esc(trad(j.message))+'</div>'; $("#mdp").value = ""; return; }
      if (j.a2f){ await lireJeton(); return a2f(j.a2f); }
      if (j.changer){ await lireJeton(); return changer(j.raison); }
      location.href = "/";
    } catch(x){ $("#msg").innerHTML = '<div class="msg err">'+esc(t("pasServeur"))+'</div>'; }
  });
  function regles(){
    const v = $("#nouveau").value, c = $("#conf").value, a = $("#actuel").value, l = (login||"").toLowerCase();
    const min = Math.max(8, Number(OPTS.minLen)||12);
    /* correctif 24 : mêmes règles que le serveur (mots courants, nom de l'entreprise, historique annoncé) */
    const racine = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, ""), ent = String(OPTS.entreprise || "").toLowerCase().replace(/[^a-z]/g, "");
    const courant = !!racine && ((OPTS.courants || []).indexOf(racine) >= 0 || (ent.length >= 4 && racine.indexOf(ent) >= 0) || /^(.)\1+$/.test(racine));
    const R = [[!!v && (a.length < 3 || v.toLowerCase().indexOf(a.toLowerCase()) < 0) && (l.length < 3 || v.toLowerCase().indexOf(l) < 0), t("gMat")],
               [v.length >= min, t("gLong").replace("{n}", min)], ...(OPTS.majChiffre !== false || OPTS.exigerMix ? [[/[A-ZÀ-Þ]/.test(v), t("gMaj")], [/[0-9]/.test(v), t("gChif")]] : []),
               ...(OPTS.exigerMix ? [[/[a-zà-ÿ]/.test(v), t("gMin")], [/[^A-Za-z0-9À-ÿ]/.test(v), t("gSpec")]] : []),
               ...(OPTS.interdireCourants !== false ? [[!!v && !courant, t("gCourant")]] : []),
               [!!v && v !== a, t("gActuel")], [!!v && v === c, t("gConf")]];
    $("#regles").innerHTML = R.map(r=>'<li class="'+(r[0]?"ok":"")+'">'+(r[0]?"✓":"○")+" "+esc(r[1])+'</li>').join("")+(Number(OPTS.historique) > 0 ? '<li class="info">ⓘ '+esc(t("gHisto").replace("{n}", OPTS.historique))+'</li>' : "");
    $("#valider").disabled = !a || !R.every(r=>r[0]);
  }
  ["actuel","nouveau","conf"].forEach(id=>$("#"+id).addEventListener("input", regles));
  $("#fChanger").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg2").innerHTML = "";
    if (!jeton) await lireJeton();
    const r = await fetch("/api/v1/mot-de-passe", {method:"POST", headers:{"Content-Type":"application/json", "X-CSRF":jeton}, credentials:"same-origin",
      body:JSON.stringify({actuel:$("#actuel").value, nouveau:$("#nouveau").value})});
    const j = await r.json();
    if (!r.ok){ $("#msg2").innerHTML = '<div class="msg err">'+esc(trad(j.message))+'</div>'; return; }
    location.href = "/";
  });
  $("#annuler").addEventListener("click", async ()=>{ await fetch("/api/v1/deconnexion", {method:"POST", credentials:"same-origin", headers:{"X-CSRF":jeton}}); location.href = "/connexion.html"; });
  lireJeton().then(async s=>{
    if (!s){
      /* session ouverte mais code de vérification attendu */
      if (/a2f=1/.test(location.search)){ const r = await fetch("/api/v1/a2f/etat", {credentials:"same-origin"}); if (r.ok){ const j = await r.json(); jeton = j.csrf || jeton; a2f(j.a2f); } }
      return;
    }
    login = s.login;
    if (s.a2f_attendu) return a2f(s.a2f);
    if (s.must_change_password || /changer=1/.test(location.search)) changer(s.raison); else location.href = "/";
  }).catch(()=>{});

  /* v56.30 : intervention du fournisseur (jeton d'une heure, lié à ce serveur) */
  $("#lienJeton").addEventListener("click", e=>{ e.preventDefault(); $("#fConnexion").hidden = true; $("#fJeton").hidden = false; $("#jetonF").focus(); });
  $("#jetonAnnuler").addEventListener("click", ()=>{ $("#fJeton").hidden = true; $("#fConnexion").hidden = false; });
  $("#fJeton").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg4").textContent = "";
    try { const r = await fetch("/api/v1/licence/jeton", {method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body:JSON.stringify({jeton:$("#jetonF").value.trim()})});
      const j = await r.json().catch(()=>({})); if (!r.ok){ $("#msg4").textContent = j.message || t("jetonRefus"); return; } location.href = "/"; }
    catch(x){ $("#msg4").textContent = t("pasServeur2"); }
  });
  /* v56.31 : afficher / masquer le mot de passe */
  $("#voirMdp").addEventListener("click", ()=>{ const i = $("#mdp"), v = i.type === "password"; i.type = v ? "text" : "password"; $("#voirMdp").textContent = t(v ? "masquer" : "afficher"); $("#voirMdp").setAttribute("aria-pressed", String(v)); i.focus(); });
})();
