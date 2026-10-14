"use strict";
(function(){
  const $ = s => document.querySelector(s);
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let login = "", jeton = "";
  /* jeton anti-falsification de la session, exigé par le serveur pour toute modification */
  async function lireJeton(){ try { const r = await fetch("/api/v1/session", {credentials:"same-origin", cache:"no-store"}); if (r.ok){ const s = await r.json(); jeton = s.csrf || ""; return s; } } catch(e){} return null; }
  let OPTS = {minLen:12, exigerMix:false, memoriser:false};
  fetch("/api/v1/connexion/options", {cache:"no-store"}).then(r=>r.json()).then(o=>{ OPTS = Object.assign(OPTS, o); $("#memoriserBloc").hidden = !OPTS.memoriser; if (o.entreprise) $("#entreprise").textContent = o.entreprise; }).catch(()=>{});
  /* double authentification : configuration au premier passage, puis code à chaque connexion */
  async function a2f(mode){
    $("#fConnexion").hidden = true; $("#fChanger").hidden = true; $("#fA2f").hidden = false;
    if (!jeton) await lireJeton();
    if (mode === "enrolement"){
      const r = await fetch("/api/v1/a2f/enrolement", {method:"POST", credentials:"same-origin", headers:{"X-CSRF":jeton}});
      const j = await r.json();
      if (r.ok){ $("#a2fEnrol").hidden = false; $("#a2fCle").textContent = j.secret; $("#a2fUri").href = j.uri; }
      else $("#msg3").innerHTML = '<div class="msg err">'+esc(j.message)+'</div>';
    }
    setTimeout(()=>$("#a2fCode").focus(), 30);
  }
  $("#fA2f").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg3").innerHTML = "";
    const r = await fetch("/api/v1/a2f/verifier", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json", "X-CSRF":jeton}, body:JSON.stringify({code:$("#a2fCode").value})});
    const j = await r.json();
    if (!r.ok){ $("#msg3").innerHTML = '<div class="msg err">'+esc(j.message)+'</div>'; $("#a2fCode").value = ""; if (r.status === 401 && /déjà|incorrect/.test(j.message)) return; location.href = "/connexion.html"; return; }
    if (j.changer){ $("#fA2f").hidden = true; return changer(j.raison); }
    location.href = "/";
  });
  $("#a2fAnnuler").addEventListener("click", async ()=>{ await fetch("/api/v1/deconnexion", {method:"POST", credentials:"same-origin", headers:{"X-CSRF":jeton}}); location.href = "/connexion.html"; });
  const RAISONS = {premiere:"Première connexion : choisissez votre mot de passe personnel. L'accès à l'application s'ouvre ensuite.",
    reinit:"Votre mot de passe a été réinitialisé. Choisissez un nouveau mot de passe personnel.",
    expire:"Votre mot de passe a expiré. Choisissez un nouveau mot de passe.",
    invitation:"Choisissez votre mot de passe personnel.", force:"Votre administrateur vous demande de changer votre mot de passe."};
  function changer(raison){
    $("#fConnexion").hidden = true; $("#fChanger").hidden = false;
    $("#raison").textContent = RAISONS[raison] || RAISONS.premiere;
    setTimeout(()=>$("#actuel").focus(), 30); regles();
  }
  $("#fConnexion").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg").innerHTML = "";
    login = $("#login").value.trim();
    try {
      const r = await fetch("/api/v1/connexion", {method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body:JSON.stringify({login, mdp:$("#mdp").value, memoriser:$("#memoriser").checked})});
      const j = await r.json();
      if (!r.ok){ $("#msg").innerHTML = '<div class="msg err">'+esc(j.message)+'</div>'; $("#mdp").value = ""; return; }
      if (j.a2f){ await lireJeton(); return a2f(j.a2f); }
      if (j.changer){ await lireJeton(); return changer(j.raison); }
      location.href = "/";
    } catch(x){ $("#msg").innerHTML = '<div class="msg err">Le serveur ne répond pas.</div>'; }
  });
  function regles(){
    const v = $("#nouveau").value, c = $("#conf").value, a = $("#actuel").value, l = (login||"").toLowerCase();
    const min = Math.max(8, Number(OPTS.minLen)||12);
    const R = [[!!v && (a.length < 3 || v.toLowerCase().indexOf(a.toLowerCase()) < 0) && (l.length < 3 || v.toLowerCase().indexOf(l) < 0), "Différent du matricule et de l'identifiant (sans les contenir)"],
               [v.length >= min, "Au moins "+min+" caractères"], [/[A-ZÀ-Þ]/.test(v), "Au moins une majuscule"], [/[0-9]/.test(v), "Au moins un chiffre"],
               ...(OPTS.exigerMix ? [[/[a-zà-ÿ]/.test(v), "Au moins une minuscule"], [/[^A-Za-z0-9À-ÿ]/.test(v), "Au moins un caractère spécial"]] : []),
               [!!v && v !== a, "Différent du mot de passe actuel"], [!!v && v === c, "Confirmation identique"]];
    $("#regles").innerHTML = R.map(r=>'<li class="'+(r[0]?"ok":"")+'">'+(r[0]?"✓":"○")+" "+r[1]+'</li>').join("");
    $("#valider").disabled = !a || !R.every(r=>r[0]);
  }
  ["actuel","nouveau","conf"].forEach(id=>$("#"+id).addEventListener("input", regles));
  $("#fChanger").addEventListener("submit", async e=>{
    e.preventDefault(); $("#msg2").innerHTML = "";
    if (!jeton) await lireJeton();
    const r = await fetch("/api/v1/mot-de-passe", {method:"POST", headers:{"Content-Type":"application/json", "X-CSRF":jeton}, credentials:"same-origin",
      body:JSON.stringify({actuel:$("#actuel").value, nouveau:$("#nouveau").value})});
    const j = await r.json();
    if (!r.ok){ $("#msg2").innerHTML = '<div class="msg err">'+esc(j.message)+'</div>'; return; }
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
      const j = await r.json().catch(()=>({})); if (!r.ok){ $("#msg4").textContent = j.message || "Jeton refusé."; return; } location.href = "/"; }
    catch(x){ $("#msg4").textContent = "Le serveur FIWAKTI ne répond pas."; }
  });
  /* v56.31 : afficher / masquer le mot de passe */
  $("#voirMdp").addEventListener("click", ()=>{ const i = $("#mdp"), v = i.type === "password"; i.type = v ? "text" : "password"; $("#voirMdp").textContent = v ? "Masquer" : "Afficher"; $("#voirMdp").setAttribute("aria-pressed", String(v)); i.focus(); });
})();
