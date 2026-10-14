/* FIWAKTI — « FIWAKTI vous souhaite joyeux anniversaire » (v56.26).
   Chargé uniquement le jour de l'anniversaire de l'utilisateur (fichier séparé, jamais au démarrage ordinaire).
   Animation native légère (canevas, ~120 confettis), 60 s au plus, fermable aussitôt, n'intercepte aucun clic :
   l'utilisateur continue à travailler. Mouvement réduit demandé par le système : message seul, sans animation. */
(function(){
  "use strict";
  var MSG = {fr:"🎉 FIWAKTI vous souhaite un très joyeux anniversaire !", ar:"🎉 FIWAKTI تتمنى لكم عيد ميلاد سعيدًا!", en:"🎉 FIWAKTI wishes you a very Happy Birthday!"};
  var FERMER = {fr:"Fermer", ar:"إغلاق", en:"Close"}, NEPLUS = {fr:"Ne plus afficher", ar:"عدم العرض مجددا", en:"Don't show again"};
  window.FWK_ANNIVERSAIRE = function(o){
    o = o || {}; var lang = MSG[o.lang] ? o.lang : null, nom = String(o.prenom || "").slice(0, 40);
    var reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches, fin = Date.now() + 60000, raf = 0;
    var bandeau = document.createElement("div");
    bandeau.setAttribute("role", "status"); bandeau.setAttribute("aria-live", "polite");
    bandeau.style.cssText = "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483000;max-width:min(560px,92vw);background:#fff;color:#0F172A;border:1px solid #E2E8F0;" +
      "border-radius:14px;box-shadow:0 20px 48px rgba(15,23,42,.18);padding:14px 16px;display:flex;gap:12px;align-items:center;font:15px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;" +
      "border-top:4px solid #059669;opacity:0;transition:opacity .2s ease, transform .2s ease;";
    var texte = document.createElement("div"); texte.style.flex = "1";
    var lignes = lang ? [MSG[lang]] : [MSG.fr, MSG.ar, MSG.en];
    lignes.forEach(function(l, i){ var p = document.createElement("div"); p.textContent = (i === 0 && nom && lang !== "ar" ? l.replace(/\s?!$/, lang === "en" ? ", "+nom+"!" : ", "+nom+" !") : l); if (i === 0 && lang !== "ar") p.style.fontWeight = "600";
      if (/[\u0600-\u06ff]/.test(l)) { p.dir = "rtl"; } texte.appendChild(p); });
    var actions = document.createElement("div"); actions.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    var bFermer = document.createElement("button"); bFermer.type = "button"; bFermer.textContent = FERMER[lang || "fr"];
    bFermer.style.cssText = "background:#047857;color:#fff;border:0;border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;";
    var bJamais = document.createElement("button"); bJamais.type = "button"; bJamais.textContent = NEPLUS[lang || "fr"];
    bJamais.style.cssText = "background:none;border:0;color:#596779;font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;";
    actions.appendChild(bFermer); actions.appendChild(bJamais); bandeau.appendChild(texte); bandeau.appendChild(actions);
    document.body.appendChild(bandeau); requestAnimationFrame(function(){ bandeau.style.opacity = "1"; });
    var toile = null, ctx = null, parts = [];
    if (!reduit){
      toile = document.createElement("canvas"); toile.setAttribute("aria-hidden", "true");
      toile.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482999;";
      document.body.appendChild(toile); ctx = toile.getContext("2d");
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0;
      var taille = function(){ W = window.innerWidth; H = window.innerHeight; toile.width = W * dpr; toile.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
      taille(); window.addEventListener("resize", taille);
      var couleurs = ["#059669", "#10B981", "#34D399", "#F59E0B", "#0EA5E9", "#F43F5E", "#A78BFA"];
      for (var i = 0; i < 120; i++) parts.push({x:Math.random() * W, y:-20 - Math.random() * H, v:1.2 + Math.random() * 2.2, a:Math.random() * 6.28, r:0.02 + Math.random() * 0.06,
        w:5 + Math.random() * 6, h:8 + Math.random() * 8, c:couleurs[i % couleurs.length], d:Math.random() * 1.5 - 0.75});
      var dernier = 0;
      var pas = function(t){
        if (Date.now() > fin) return fermer();
        if (t - dernier < 30){ raf = requestAnimationFrame(pas); return; } dernier = t;   /* ~30 images/s : sobre */
        ctx.clearRect(0, 0, W, H); var reste = Date.now() > fin - 50000;               /* pluie de 10 s, puis fin de chute */
        for (var k = 0; k < parts.length; k++){ var q = parts[k]; q.y += q.v; q.x += q.d + Math.sin(q.a) * 0.6; q.a += q.r;
          if (q.y > H + 20){ if (reste) continue; q.y = -20; q.x = Math.random() * W; }
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); ctx.restore(); }
        raf = requestAnimationFrame(pas); };
      raf = requestAnimationFrame(pas);
    } else setTimeout(function(){ fermer(); }, 60000);
    var ferme = false;
    function fermer(){ if (ferme) return; ferme = true; cancelAnimationFrame(raf); if (toile && toile.parentNode) toile.parentNode.removeChild(toile);
      bandeau.style.opacity = "0"; setTimeout(function(){ if (bandeau.parentNode) bandeau.parentNode.removeChild(bandeau); }, 220); }
    bFermer.addEventListener("click", fermer);
    bJamais.addEventListener("click", function(){ try { localStorage.setItem("fwk_anniv_non", "1"); } catch(e){} if (o.desactiver) o.desactiver(); fermer(); });
    return {fermer:fermer};
  };
})();
