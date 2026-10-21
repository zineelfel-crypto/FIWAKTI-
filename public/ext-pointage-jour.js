/* FIWAKTI v56.27 — éditeur des pointages d'une journée (extension chargée à la première utilisation).
   Utilise les fonctions du socle de la même page. */
(function(){
"use strict";
/* libellés propres à l'extension (aucun poids ajouté au socle) */
var LX = {fr:{avant:"Avant", apres:"Après", resume:"Ce qui va être enregistré", ajoute:"Ajout", supprime:"Suppression", modifie:"Modification", aucun:"Aucun changement pour l'instant.", btn:"Enregistrer la correction"},
  en:{avant:"Before", apres:"After", resume:"What will be saved", ajoute:"Addition", supprime:"Deletion", modifie:"Change", aucun:"No change yet.", btn:"Save the correction"},
  ar:{avant:"قبل", apres:"بعد", resume:"ما سيتم حفظه", ajoute:"إضافة", supprime:"حذف", modifie:"تعديل", aucun:"لا تغيير بعد.", btn:"حفظ التصحيح"}};
function lx(k){ return (LX[ui.lang] || LX.fr)[k]; }
/* résumé avant / après des changements en cours (l'utilisateur voit exactement ce qui va changer) */
function pjResume(l){
  var o = [], sensL = function(x){ return x === "E" ? t.sEntree : t.sSortie; }, j1 = function(x){ return x.j ? " (+1)" : ""; };
  l.forEach(function(x){
    if (x.id && x.suppr) o.push('<li><strong>'+esc(lx("supprime"))+'</strong> · '+esc(x.h+" "+sensL(x.sens))+'</li>');
    else if (!x.id && x.h) o.push('<li><strong>'+esc(lx("ajoute"))+'</strong> · '+esc(x.h+j1(x)+" "+sensL(x.sens))+'</li>');
    else if (x.id && (x.h !== String(x.orig.ts).slice(11, 16) || x.sens !== x.orig.sens || pjDate(x) !== String(x.orig.ts).slice(0, 10))) o.push('<li><strong>'+esc(lx("modifie"))+'</strong> · '+esc(lx("avant"))+' <span class="fw-mono">'+esc(String(x.orig.ts).slice(11, 16)+" "+sensL(x.orig.sens))+'</span> → '+esc(lx("apres"))+' <span class="fw-mono">'+esc(x.h+j1(x)+" "+sensL(x.sens))+'</span></li>');
  });
  return '<div class="fw-pj-resume" aria-live="polite"><strong>'+esc(lx("resume"))+'</strong>'+(o.length ? '<ul>'+o.join("")+'</ul>' : '<div class="fw-hint">'+esc(lx("aucun"))+'</div>')+'</div>';
}
/* ==================== v56.27 — modification directe des pointages d'une journée ====================
   Depuis le journal, la loge des journées ou le suivi : modifier l'heure ou le type, ajouter un mouvement manquant,
   supprimer un mouvement erroné. Motif obligatoire, droits (saisie des pointages), périmètre et périodes clôturées
   contrôlés par le serveur, audit avant / après avec motif, recalcul immédiat de la journée. */
function pjOuvrir(mat, d){
  ui.pj = {mat:String(mat), d:String(d).slice(0, 10), lignes:null, motif:"", err:"", recap:null, enCours:false};
  ui.pj.lend = dAjout(ui.pj.d, 1); ui.pj.nuit = pjNuit(ui.pj.mat, ui.pj.d);
  pjCharger(); pjRendre();
  /* grand effectif : fiche chargée à la demande pour connaître le jour type (poste de nuit) */
  if (!(db.emps||[]).some(x=>String(x.mat) === String(mat)) && typeof empCharger === "function"){ const p = ui.pj;
    empCharger(p.mat).then(e=>{ if (ui.pj !== p || !e) return; let n = false; try { const jv = jourVars(e, p.d); n = !!(jv && jv.inf && jourEstNuit(jv.inf.jour)); } catch(x){}
      if (n && !p.nuit){ p.nuit = true; if (!(p.lignes||[]).some(x=>!x.id)) pjCharger(); else pjRendre(); } }).catch(()=>{}); }
}
/* correctif 46 : poste de nuit — le moteur rattache à la journée J les badgeages de J après 12:00 et ceux du lendemain
   avant 12:00 ; l'éditeur affiche donc aussi le lendemain matin, et chaque pointage a son jour (J ou J+1) */
function pjNuit(mat, d){ try { const e = (db.emps||[]).find(x=>String(x.mat) === String(mat)); if (!e) return false; const jv = jourVars(e, d); return !!(jv && jv.inf && jourEstNuit(jv.inf.jour)); } catch(x){ return false; } }
function pjDate(x){ const p = ui.pj; return x.j ? p.lend : p.d; }
function pjCle(x){ return (x.j ? 1440 : 0) + toMin(x.h || "00:00"); }
function pjCharger(){
  const p = ui.pj; if (!p) return;
  const prendre = l => { p.lignes = l.filter(x=>{ const k = String(x.ts).slice(0, 10); return String(x.mat) === p.mat && (k === p.d || (p.nuit && k === p.lend && String(x.ts).slice(11, 16) < "12:00")); })
    .sort((a, b)=>String(a.ts).localeCompare(String(b.ts)))
    .map(x=>({id:x.id, h:String(x.ts).slice(11, 16), j:String(x.ts).slice(0, 10) === p.lend ? 1 : 0, sens:x.sens, dev:x.dev || "", src:x.src || "", motif:x.motif || "", orig:x, suppr:false})); pjRendre(); };
  if (ANNUAIRE_PAGINE) fetch("api/v1/pointages?complet=1&limit=200&q="+encodeURIComponent(p.mat)+"&du="+p.d+"&au="+p.lend, {credentials:"same-origin", cache:"no-store"})
    .then(r=>r.ok ? r.json() : {lignes:[]}).then(j=>{ p.nom = ((j.lignes||[])[0]||{}).nom || ""; prendre(j.lignes || []); }).catch(()=>prendre([]));
  else prendre(db.ptg || []);
}
function pjEcrire(){
  const p = ui.pj; if (!p || !p.lignes) return null;
  /* lecture des champs (sans redessiner pendant la saisie) */
  document.querySelectorAll("#fwPj [data-pj]").forEach(el=>{ const i = Number(el.dataset.i), l = p.lignes[i]; if (!l) return;
    if (el.dataset.pj === "h") l.h = el.value; else if (el.dataset.pj === "j") l.j = Number(el.value) ? 1 : 0; else if (el.dataset.pj === "sens") l.sens = el.value; else if (el.dataset.pj === "suppr") l.suppr = el.checked; });
  const m = document.getElementById("pjMotif"); if (m) p.motif = m.value.trim();
}
/* séquence cohérente : alternance Entrée / Sortie commençant par une entrée et se terminant par une sortie */
function pjSequence(l){ const v = l.filter(x=>!x.suppr && x.h).sort((a, b)=>pjCle(a) - pjCle(b)); for (let i = 1; i < v.length; i++) if (v[i].sens === v[i-1].sens) return false; return !v.length || (v[0].sens === "E" && v[v.length-1].sens === "S"); }
function pjRendre(){
  let hote = document.getElementById("fwPj");
  const p = ui.pj;
  if (!p){ if (hote) hote.remove(); return; }
  if (!hote){ hote = document.createElement("div"); hote.id = "fwPj"; document.body.appendChild(hote); }
  const e = (db.emps||[]).find(x=>x.mat === p.mat), nom = e ? e.prenom+" "+e.nom : (p.nom || p.mat);
  const clot = jourCloture(p.d), droitOk = nivRang(droit("PTG")) >= 2, ro = clot || !droitOk;
  const l = p.lignes;
  hote.innerHTML = '<div class="fw-ovl" role="presentation"><div class="fw-mdl fw-pj" role="dialog" aria-modal="true" aria-labelledby="pjTitre" tabindex="-1">'+
    '<h3 id="pjTitre">'+esc(t.pjTitre)+'</h3><div class="body">'+
    '<p class="fw-pj-qui"><strong>'+esc(nom)+'</strong> · '+esc(p.mat)+' · '+esc(dateAff(p.d))+'</p>'+
    (clot ? '<div class="fw-note warn">'+esc(t.pjCloture)+'</div>' : !droitOk ? '<div class="fw-note">'+esc(t.pjLecture)+'</div>' : '')+
    (!l ? '<div class="fw-hint" aria-busy="true">…</div>' :
      '<table class="fw-tbl fw-pj-tbl"><thead><tr><th>'+esc(t.pjJour)+'</th><th>'+esc(t.heure)+'</th><th>'+esc(t.sens)+'</th><th>'+esc(t.source)+'</th><th>'+esc(t.pjSupprimer)+'</th></tr></thead><tbody>'+
      (l.length ? l.map((x, i)=>'<tr'+(x.suppr ? ' class="fw-pj-suppr"' : '')+'><td><select data-pj="j" data-i="'+i+'"'+(ro ? ' disabled' : '')+' aria-label="'+esc(t.pjJour)+'"><option value="0"'+(x.j ? '' : ' selected')+'>'+esc(dateAff(p.d))+'</option><option value="1"'+(x.j ? ' selected' : '')+'>'+esc(dateAff(p.lend))+' (+1)</option></select></td><td><input type="time" data-pj="h" data-i="'+i+'" value="'+esc(x.h)+'"'+(ro ? ' disabled' : '')+' aria-label="'+esc(t.heure)+'"></td>'+
        '<td><select data-pj="sens" data-i="'+i+'"'+(ro ? ' disabled' : '')+' aria-label="'+esc(t.sens)+'"><option value="E"'+(x.sens === "E" ? ' selected' : '')+'>'+esc(t.sEntree)+'</option><option value="S"'+(x.sens === "S" ? ' selected' : '')+'>'+esc(t.sSortie)+'</option></select></td>'+
        '<td class="fw-sm">'+esc(x.id ? (x.src || "—")+(x.dev ? " · "+x.dev : "")+(x.motif ? " · "+x.motif : "") : t.pjNouveau)+'</td>'+
        '<td>'+(x.id ? '<input type="checkbox" data-pj="suppr" data-i="'+i+'"'+(x.suppr ? ' checked' : '')+(ro ? ' disabled' : '')+' aria-label="'+esc(t.pjSupprimer)+'">' : '')+'</td></tr>').join("")
        : '<tr><td colspan="5" class="fw-hint">'+esc(t.pjAucun)+'</td></tr>')+'</tbody></table>'+
      (p.nuit ? '<div class="fw-hint">'+esc(t.pjNuitH.replace("{d}", dateAff(p.lend)))+'</div>' : '')+
      (!pjSequence(l) ? '<div class="fw-note warn">'+esc(t.pjSequence)+(p.nuit ? '' : ' '+t.pjSequenceNuit)+'</div>' : '')+
      (ro ? '' : '<button type="button" class="fw-btn sm" data-act="pj-ajout">'+esc(t.pjAjouter)+'</button>'+pjResume(l)+
        '<label class="fw-pj-motif">'+esc(t.pjMotif)+' <input id="pjMotif" value="'+esc(p.motif)+'" maxlength="200" required aria-required="true" placeholder="'+esc(t.pjMotifH)+'"></label>'))+
    (p.err ? '<div class="fw-note warn" role="alert">'+esc(p.err)+'</div>' : '')+
    (p.recap ? '<div class="fw-note ok" role="status">'+esc(p.recap)+'</div>' : '')+
    '</div><div class="foot"><button type="button" class="fw-btn" data-act="pj-fermer">'+esc(t.pjFermer)+'</button>'+
    (ro || !l ? '' : '<button type="button" class="fw-btn pri" data-act="pj-enregistrer"'+(p.enCours ? ' disabled' : '')+'>'+esc(lx("btn"))+'</button>')+'</div></div></div>';
  const f = hote.querySelector(".fw-mdl"); if (f && !hote.contains(document.activeElement)) f.focus();
}
function pjEnregistrer(){
  const p = ui.pj; pjEcrire(); p.err = ""; p.recap = null;
  const mods = [], ajouts = [], suppr = [], horo = new Date().toISOString().slice(0, 16).replace("T", " ");
  for (const x of p.lignes){
    if (x.id && x.suppr){ suppr.push(x); continue; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.h||"")){ if (!x.id && !x.h) continue; p.err = t.pjHeure; return pjRendre(); }
    if (!x.id) ajouts.push(x); else if (x.h !== String(x.orig.ts).slice(11, 16) || x.sens !== x.orig.sens || pjDate(x) !== String(x.orig.ts).slice(0, 10)) mods.push(x);
  }
  if (!mods.length && !ajouts.length && !suppr.length){ ui.pj = null; return pjRendre(); }
  if (p.motif.length < 3){ p.err = t.pjMotifRequis; pjRendre(); const m = document.getElementById("pjMotif"); if (m) m.focus(); return; }
  const corr = (moi()||{}).login+" · "+horo;
  const rec = x => Object.assign({}, x.orig, {ts:pjDate(x)+" "+x.h+":00", sens:x.sens, motif:p.motif, corr});
  const nouveaux = ajouts.map(x=>({id:uid("pm"), mat:p.mat, ts:pjDate(x)+" "+x.h+":00", sens:x.sens, dev:"", src:"manuel", motif:p.motif, corr}));
  if (!LIC.serveur){
    /* démonstration / version autonome : écriture locale (mêmes règles de motif) */
    mods.forEach(x=>{ const i = db.ptg.findIndex(z=>z.id === x.id); if (i >= 0) db.ptg[i] = rec(x); });
    nouveaux.forEach(x=>db.ptg.push(x)); const ids = new Set(suppr.map(x=>x.id)); db.ptg = db.ptg.filter(z=>!ids.has(z.id));
    ptgTouch(); save(); return pjApres(p);
  }
  /* serveur : un seul envoi ; la suppression trace d'abord le motif, puis supprime (versions contrôlées) */
  const put = mods.map(rec).concat(nouveaux).concat(suppr.map(x=>Object.assign({}, x.orig, {motifSuppression:p.motif, corr})));
  const delv = {}; suppr.forEach(x=>{ delv[x.id] = Number(x.orig.__v||0) + 1; });
  p.enCours = true; pjRendre();
  fetch("api/v1/donnees/sync", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({colls:{ptg:{put, del:suppr.map(x=>x.id), delv}}})})
    .then(r=>r.json().then(j=>({r, j}))).then(({r, j})=>{
      p.enCours = false;
      const refus = (j.ignores||[]).filter(x=>/^ptg/.test(x)), conf = (j.conflits||[]).length;
      if (!r.ok || refus.length || conf){ p.err = !r.ok ? (j.message || t.svcErreur) : conf ? t.pjConflit : (/clôtur/i.test(refus.join(" ")) ? t.pjCloture : refus.join(" ; ")); return pjRendre(); }
      /* mise à jour locale (versions renvoyées par le serveur) pour les écrans déjà chargés */
      if (!ANNUAIRE_PAGINE){ const v = ((j.versions||{}).colls||{}).ptg || {}, ids = new Set(suppr.map(x=>x.id));
        mods.map(rec).concat(nouveaux).forEach(x=>{ const y = Object.assign({}, x, {__v:v[x.id] != null ? v[x.id] : x.__v}); const i = db.ptg.findIndex(z=>z.id === y.id); if (i >= 0) db.ptg[i] = y; else db.ptg.push(y); });
        db.ptg = db.ptg.filter(z=>!ids.has(z.id)); ptgTouch(); }
      pjApres(p);
    }).catch(e=>{ p.enCours = false; p.err = e.message; pjRendre(); });
}
function pjApres(p){
  /* recalcul immédiat : présence, retard et anomalies de la journée */
  let recap = t.pjRecalcule;
  try { const e = (db.emps||[]).find(x=>x.mat === p.mat); if (e && !ANNUAIRE_PAGINE){ const r = (suiviJours(p.d, p.d, [e])||[])[0];
    if (r && r.d) recap = t.pjRecap.replace("{hp}", hh(r.d.HP||0)).replace("{st}", (statutJour(r)||{}).l || (statutJour(r)||{}).c || "—"); } } catch(x){}
  p.recap = recap; p.motif = ""; flash(t.pjEnregistre, "ok"); pjCharger(); render();
}

document.addEventListener("input", function(ev){ var el = ev.target; if (!ui.pj || !el || !el.closest || !el.closest("#fwPj") || !el.dataset || !el.dataset.pj) return;
  pjEcrire(); var r = document.querySelector("#fwPj .fw-pj-resume"); if (r) r.outerHTML = pjResume(ui.pj.lignes); });
document.addEventListener("change", function(ev){ var el = ev.target; if (!ui.pj || !el || !el.closest || !el.closest("#fwPj") || !el.dataset || !el.dataset.pj) return;
  pjEcrire(); var r = document.querySelector("#fwPj .fw-pj-resume"); if (r) r.outerHTML = pjResume(ui.pj.lignes); });
window.FWK_PJ = {
  ouvrir:pjOuvrir,
  fermer:function(){ ui.pj = null; pjRendre(); },
  ajout:function(){ if (!ui.pj) return; pjEcrire(); var sens = (ui.pj.lignes.filter(function(x){ return !x.suppr; }).length % 2) ? "S" : "E";
    ui.pj.lignes.push({id:null, h:"", j:(ui.pj.nuit && sens === "S") ? 1 : 0, sens:sens}); pjRendre();
    var n = document.querySelectorAll('#fwPj [data-pj="h"]'); if (n.length) n[n.length-1].focus(); },
  enregistrer:function(){ if (ui.pj) pjEnregistrer(); }
};
})();
