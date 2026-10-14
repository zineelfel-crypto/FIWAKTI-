"use strict";
(function(){
  const $ = s => document.querySelector(s);
  /* v46 : depuis un autre poste que le serveur, l'assistant exige le code d'installation */
  let jeton = new URLSearchParams(location.search).get("jeton") || sessionStorage.getItem("fwkJeton") || "";
  const fetchOrig = window.fetch.bind(window);
  window.fetch = (u, o) => { o = o || {}; const h = new Headers(o.headers || {}); if (jeton) h.set("X-Jeton-Installation", jeton);
    return fetchOrig(u, Object.assign({}, o, {headers:h})).then(r=>{ if (r.status === 403) r.clone().json().then(x=>{ if (x && x.jeton) $("#jetonBloc").hidden = false; }).catch(()=>{}); return r; }); };
  let etape = 1, licOk = false, baseOk = false, pgPre = false;
  const sections = [...document.querySelectorAll("section[data-etape]")];
  function voir(n){
    etape = n;
    sections.forEach(s=>{ s.hidden = +s.dataset.etape !== n; });
    [...$("#barre").children].forEach((b,i)=>b.classList.toggle("fait", i < n));
    if (n === 3) controler();
    const sec = sections.find(s=>+s.dataset.etape === n), f = sec && sec.querySelector("input,textarea,button.pri"); if (f) setTimeout(()=>f.focus(), 50);
  }
  document.addEventListener("click", e=>{
    if (e.target.closest("[data-suivant]")){
      if (etape === 2 && document.querySelector("input[name=mode]:checked").value === "demo"){ location.href = "/?demo"; return; }
      /* reprise : contrôles, puis base de destination, puis restauration (ni licence ni nouveau compte : ils viennent de la sauvegarde) */
      if (document.querySelector("input[name=mode]:checked").value === "reprise"){
        if (etape === 3){ voir(5); return; }
        if (etape === 5){ voir(8); return; }
      }
      voir(etape+1);
    }
    if (e.target.closest("[data-precedent]")){
      if (document.querySelector("input[name=mode]:checked").value === "reprise"){ if (etape === 8){ voir(5); return; } if (etape === 5){ voir(3); return; } }
      voir(etape-1);
    }
  });
  /* 56.33.11 : btoa() code en Latin-1 alors que le serveur lit de l'UTF-8 */
  const b64Utf8 = t => { let b = ""; new TextEncoder().encode(t).forEach(x=>{ b += String.fromCharCode(x); }); return btoa(b); };
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const ICO = {ok:"🟢", verifier:"🟠", bloquant:"🔴"};
  async function controler(){
    $("#controles").innerHTML = "<li>Vérification en cours…</li>";
    $("#apresCtl").disabled = true;
    try {
      const r = await fetch("/api/installation/controles", {cache:"no-store"}); const j = await r.json();
      $("#empreinte").textContent = j.empreinte || "";
      pgPre = !!j.pgPreconfigure; majBase();
      $("#controles").innerHTML = j.controles.map(c=>'<li><span class="ic">'+ICO[c.etat]+'</span><span><strong>'+esc(c.titre)+'</strong>'+
        (c.detail ? '<div class="d">'+esc(c.detail)+'</div>' : '')+(c.solution && c.etat !== "ok" ? '<div class="s">Solution : '+esc(c.solution)+'</div>' : '')+'</span></li>').join("");
      $("#apresCtl").disabled = j.controles.some(c=>c.etat === "bloquant");
    } catch(e){ $("#controles").innerHTML = '<li><span class="ic">🔴</span><span><strong>Le serveur FIWAKTI ne répond pas</strong><div class="s">Solution : vérifier que le service FIWAKTI est démarré.</div></span></li>'; }
  }
  $("#relancer").addEventListener("click", controler);
  $("#jetonOk").addEventListener("click", ()=>{ jeton = $("#jetonSaisie").value.trim(); try { sessionStorage.setItem("fwkJeton", jeton); } catch(e){} $("#jetonBloc").hidden = true; if (etape === 3) controler(); });
  let minuterie = null;
  $("#licence").addEventListener("input", ()=>{
    clearTimeout(minuterie); licOk = false; $("#apresLic").disabled = true;
    minuterie = setTimeout(async ()=>{
      const cle = $("#licence").value.trim(); if (!cle){ $("#licMsg").innerHTML = ""; return; }
      const r = await fetch("/api/installation/licence", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({cle})});
      const j = await r.json().catch(()=>({}));
      if (j.ok){
        licOk = true; $("#apresLic").disabled = false;
        $("#licMsg").innerHTML = '<div class="msg ok">✓ Licence valide — <strong>'+esc(j.client)+'</strong> — modules : '+(j.fw && j.fw.length ? esc(j.fw.join(", ")) : j.modules === "PA" ? "Pointage + Contrôle d'accès" : j.modules === "P" ? "Pointage" : "Contrôle d'accès")+(j.expire ? " — jusqu'au "+esc(j.expire) : " — définitive")+'</div>';
        if (!$("#entreprise").value) $("#entreprise").value = j.client;
      } else $("#licMsg").innerHTML = '<div class="msg err">'+esc(j.motif || j.message || "Vérification impossible.")+'</div>';
    }, 350);
  });
  function majBase(){
    const pg = document.querySelector("input[name=base]:checked").value === "pg";
    $("#pgChamps").hidden = !pg; $("#pgPre").hidden = !pgPre; $("#pgForm").hidden = pgPre;
    baseOk = !pg || pgPre || baseOk === "pg";
    $("#apresBase").disabled = !(baseOk === true || baseOk === "pg");
  }
  document.querySelectorAll("input[name=base]").forEach(r=>r.addEventListener("change", ()=>{ baseOk = false; $("#pgMsg").innerHTML = ""; majBase(); }));
  ["pgHote","pgPort","pgNom","pgUtil","pgMdp"].forEach(id=>$("#"+id).addEventListener("input", ()=>{ baseOk = false; majBase(); }));
  function baseChoisie(){
    const pg = document.querySelector("input[name=base]:checked").value === "pg";
    if (!pg) return {type:"sqlite"};
    if (pgPre) return null;
    return {type:"pg", hote:$("#pgHote").value.trim(), port:$("#pgPort").value.trim(), nom:$("#pgNom").value.trim(), utilisateur:$("#pgUtil").value.trim(), mdp:$("#pgMdp").value};
  }
  $("#pgTester").addEventListener("click", async ()=>{
    $("#pgMsg").innerHTML = '<div class="msg info">Test de la connexion…</div>';
    const r = await fetch("/api/installation/base", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(baseChoisie())});
    const j2 = await r.json();
    if (j2.ok){ baseOk = "pg"; $("#pgMsg").innerHTML = '<div class="msg ok">✓ Connexion réussie — '+esc(j2.version||"PostgreSQL")+'</div>'; }
    else { baseOk = false; $("#pgMsg").innerHTML = '<div class="msg err">'+esc(j2.motif)+'</div>'; }
    majBase();
  });
  function regles(){
    const v = $("#mdp").value, c = $("#confirmation").value, l = $("#login").value.trim().toLowerCase();
    const R = [[v.length >= 12, "Au moins 12 caractères"], [/[A-ZÀ-Þ]/.test(v), "Au moins une majuscule"], [/[0-9]/.test(v), "Au moins un chiffre"],
               [!!v && (l.length < 3 || v.toLowerCase().indexOf(l) < 0), "Ne contient pas l'identifiant"], [!!v && v === c, "Confirmation identique"]];
    $("#regles").innerHTML = R.map(r=>'<li class="'+(r[0]?"ok":"")+'">'+(r[0]?"✓":"○")+" "+r[1]+'</li>').join("");
    $("#installer").disabled = !R.every(r=>r[0]) || !licOk || !$("#entreprise").value.trim() || !/^[A-Za-z0-9._@-]{3,60}$/.test($("#login").value.trim());
  }
  ["mdp","confirmation","login","entreprise"].forEach(id=>$("#"+id).addEventListener("input", regles));
  regles();
  $("#installer").addEventListener("click", async ()=>{
    $("#installer").disabled = true; $("#instMsg").innerHTML = '<div class="msg info">Installation en cours…</div>';
    const corps = {mode:document.querySelector("input[name=mode]:checked").value, base:baseChoisie(), licence:$("#licence").value.trim(), entreprise:$("#entreprise").value.trim(),
      nom:$("#nom").value.trim(), login:$("#login").value.trim(), mdp:$("#mdp").value, confirmation:$("#confirmation").value, heureSauvegarde:$("#heure").value};
    try {
      const r = await fetch("/api/installation", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(corps)});
      const j = await r.json();
      if (!r.ok){ $("#instMsg").innerHTML = '<div class="msg err">'+esc(j.message)+'</div>'; regles(); return; }
      $("#adresse").textContent = location.origin + "/";
      /* 56.33.11 : sans certificat, FIWAKTI n'écoute que sur ce poste — ne pas présenter « localhost » comme adresse réseau */
      if (j.ecouteLocale && corps.mode !== "local") $("#adresse").textContent = "aucune pour l'instant : sans certificat HTTPS, FIWAKTI n'accepte que les connexions de ce serveur. Déposez cert.pem et cle.pem dans donnees/certificats puis redémarrez le service pour l'ouvrir au réseau.";
      if (!j.sauvegarde) $("#finTexte").textContent = "FIWAKTI est prêt. Attention : la première sauvegarde n'a pas pu être vérifiée — consultez l'écran État du système.";
      voir(7);
    } catch(e){ $("#instMsg").innerHTML = '<div class="msg err">Le serveur ne répond pas.</div>'; regles(); }
  });
  $("#repGo").addEventListener("click", async ()=>{
    const cle = $("#repCle").files[0], f = $("#repFichier").files[0];
    if (!f){ $("#repMsg").innerHTML = '<div class="msg err">Choisissez la sauvegarde.</div>'; return; }
    $("#repGo").disabled = true;
    try {
      if (cle){
        const txt = (await cle.text()).trim();
        const r = await fetch("/api/installation/cle-sauvegarde", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({cle:txt})});
        const j = await r.json(); if (!r.ok) throw new Error(j.message);
        $("#repMsg").innerHTML = '<div class="msg info">Clé installée ('+esc(j.empreinte)+'). Restauration en cours…</div>';
      }
      const base = baseChoisie();
      const r = await fetch("/api/installation/restaurer", {method:"POST", headers:{"X-Nom-Fichier":f.name.replace(/[^\x20-\x7e]/g, "_"), "X-Base":b64Utf8(JSON.stringify(base||{}))}, body:f});
      const j = await r.json(); if (!r.ok) throw new Error(j.message);
      const b = j.bilan;
      $("#repMsg").innerHTML = '<div class="msg ok">✓ Reprise terminée en '+Math.round(j.dureeMs/1000)+' s : '+b.comptes+' comptes, '+b.employes+' employés, '+b.badgeages+' badgeages, '+b.clotures+' clôtures, '+b.audit+' entrées d\'audit'+
        (j.audit ? ' (chaîne intègre)' : ' (chaîne d\'audit à vérifier)')+'.'+(j.licenceValide ? '' : ' La licence doit être réactivée pour cette machine (écran Sécurité).')+'</div><a class="bouton pri" href="/connexion.html">Se connecter</a>';
    } catch(e){ $("#repMsg").innerHTML = '<div class="msg err">'+esc(e.message)+'</div>'; $("#repGo").disabled = false; }
  });
  fetch("/api/sante").then(r=>r.json()).then(j=>{ $("#version").textContent = "version "+j.version; $("#pied").textContent = "v"+j.version; }).catch(()=>{});
  voir(1);
})();
