/* FIWAKTI v56.16 — FW-Scheduler : planificateur central des tâches de fond.
   Une seule minuterie pour tout le serveur (au lieu d'une par tâche) ; chaque tâche est déclarée avec un nom, un
   intervalle, une priorité et un délai maximal ; jamais deux exécutions simultanées d'une même tâche ; au plus deux
   tâches à la fois. Chaque tâche garde sa dernière exécution, sa durée, son résultat, sa dernière erreur et le
   nombre d'exécutions — visibles dans État du système. Une tâche d'un module inactif est simplement ignorée. */
"use strict";
function creer(o){
  const journal = o.journal || (()=>{}), TACHES = new Map(), MAX = o.simultanees || 2;
  let enCours = 0, minuteur = null;
  /* planifier(nom, {intervalle (ms, 0 = une seule fois), premier (ms avant la 1re exécution), priorite (1 haute … 3 basse),
     delai (ms, délai maximal), actif() (facultatif), fn}) */
  function planifier(nom, opts){
    const t = Object.assign({intervalle:60000, premier:null, priorite:2, delai:120000, actif:null}, opts, {nom});
    t.prochaine = Date.now() + (t.premier != null ? t.premier : t.intervalle);
    Object.assign(t, {executions:0, echecs:0, derniere:null, duree:null, resultat:null, erreur:null, enCours:false, delaiDepasse:0});
    TACHES.set(nom, t); return t;
  }
  function retirer(nom){ TACHES.delete(nom); }
  async function executer(t){
    t.enCours = true; enCours++; const t0 = Date.now(); let fini = false;
    const garde = setTimeout(()=>{ if (!fini){ t.delaiDepasse++; t.erreur = "délai de "+Math.round(t.delai/1000)+" s dépassé"; journal("tâche « "+t.nom+" » : délai de "+Math.round(t.delai/1000)+" s dépassé"); } }, t.delai);
    try { const r = await (o.enveloppe ? o.enveloppe(()=>t.fn()) : t.fn()); t.resultat = r == null ? "ok" : (typeof r === "object" ? JSON.stringify(r).slice(0, 200) : String(r).slice(0, 200)); if (!t.delaiDepasse || t.erreur === null) t.erreur = null; }
    catch(e){ t.echecs++; t.erreur = String(e && e.message || e).slice(0, 300); journal("tâche « "+t.nom+" » : "+t.erreur); }
    finally { fini = true; clearTimeout(garde); t.executions++; t.derniere = new Date(t0).toISOString(); t.duree = Date.now() - t0; t.enCours = false; enCours--;
      t.prochaine = t.intervalle > 0 ? Date.now() + t.intervalle : Infinity; }
  }
  function tic(){
    const n = Date.now();
    const dues = Array.from(TACHES.values()).filter(t=>!t.enCours && t.prochaine <= n).sort((a, b)=>a.priorite - b.priorite || a.prochaine - b.prochaine);
    for (const t of dues){
      if (enCours >= MAX) break;
      if (t.actif && !t.actif()){ t.prochaine = t.intervalle > 0 ? n + t.intervalle : Infinity; t.resultat = "inactive"; continue; }
      executer(t);
    }
  }
  function demarrer(){ if (!minuteur){ minuteur = setInterval(tic, 1000); if (minuteur.unref) minuteur.unref(); } }
  function arreter(){ if (minuteur){ clearInterval(minuteur); minuteur = null; } }
  function etat(){
    return Array.from(TACHES.values()).sort((a, b)=>a.priorite - b.priorite || a.nom.localeCompare(b.nom)).map(t=>({nom:t.nom, priorite:t.priorite,
      intervalleS:Math.round(t.intervalle/1000), delaiS:Math.round(t.delai/1000), executions:t.executions, echecs:t.echecs, delaiDepasse:t.delaiDepasse,
      derniere:t.derniere, dureeMs:t.duree, resultat:t.resultat, erreur:t.erreur, enCours:t.enCours, prochaine:Number.isFinite(t.prochaine) ? new Date(t.prochaine).toISOString() : null}));
  }
  /* exécution immédiate à la demande (administrateur) */
  async function lancer(nom){ const t = TACHES.get(nom); if (!t) throw Object.assign(new Error("Tâche inconnue."), {code:404}); if (t.enCours) throw Object.assign(new Error("Tâche déjà en cours."), {code:409}); await executer(t); return etat().find(x=>x.nom === nom); }
  return {planifier, retirer, demarrer, arreter, etat, lancer, minuteries:()=>minuteur ? 1 : 0};
}
module.exports = {creer};
