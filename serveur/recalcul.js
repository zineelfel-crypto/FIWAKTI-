/* FIWAKTI — recalcul demandé (v53, lot P0-D du cahier des charges v50/v51, §23 et REC-18).
   Un recalcul (salarié, équipe, service, département, site ou tout le personnel, sur une période ouverte) s'exécute
   en arrière-plan et produit un rapport AVANT / APRÈS / ÉCART par compteur. « Avant » est la dernière référence
   validée de ces compteurs pour ce salarié et cette période ; rien n'est appliqué sans validation. La validation
   enregistre une nouvelle version de la référence (les précédentes restent) et relance les calculs de la période. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
function creer(o){
  const {B, D, K, audit, journal, dossier} = o;
  const maintenant = () => new Date().toISOString();
  const plage = (du, au) => { const l = []; let d = new Date(du+"T12:00:00Z"); const f = new Date(au+"T12:00:00Z"); while (d <= f && l.length < 400){ l.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return l; };
  const fichier = id => path.join(dossier, "recalcul-"+id+".json");
  async function clot(){ const ref = await D.referentielLecture() || {}; return (ref.clotures||[]).reduce((x, c)=>c.jusqu > x ? c.jusqu : x, ""); }
  async function salaries(portee, cible, dansPerim){
    const ref = await D.referentielLecture() || {}, emps = (await D.employes()).filter(e=>dansPerim(e.mat));
    const desc = id => { const s = new Set([id]); let n = -1; while (s.size !== n){ n = s.size; (ref.depts||[]).forEach(d=>{ if (d.parent && s.has(d.parent)) s.add(d.id); }); } return s; };
    switch (portee){
      case "salarie": return emps.filter(e=>String(e.mat) === String(cible));
      case "equipe": return emps.filter(e=>String(e.chefMat||"") === String(cible));
      case "departement": case "service": { const s = desc(String(cible)); return emps.filter(e=>s.has(e.deptId)); }
      case "site": return emps.filter(e=>e.siteId === cible);
      case "tous": return emps;
    }
    return [];
  }
  async function lancer(login, q, dansPerim){
    const du = String(q.du||""), au = String(q.au||""), c = await clot();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au) || au < du) throw Object.assign(new Error("Période invalide."), {code:400});
    if (plage(du, au).length > 366) throw Object.assign(new Error("Période limitée à un an."), {code:400});
    /* v54 : une simulation ne modifie rien : elle est permise sur toute période, y compris clôturée */
    const sim = Array.isArray(q.simulation) && q.simulation.length ? q.simulation.slice(0, 50) : null;
    if (!sim && c && du <= c) throw Object.assign(new Error("La période commence dans une période clôturée (jusqu'au "+c+") : utilisez un ajustement de période antérieure."), {code:409});
    const emps = await salaries(q.portee, q.cible, dansPerim);
    if (!emps.length) throw Object.assign(new Error("Aucun salarié dans cette portée."), {code:400});
    const enCours = await B.get("SELECT COUNT(*) n FROM recalculs WHERE statut='en_cours'");
    if (Number(enCours.n) >= 2) throw Object.assign(new Error("Deux recalculs sont déjà en cours : patientez."), {code:429});
    const id = "rc-"+crypto.randomBytes(8).toString("hex"), mats = emps.map(e=>String(e.mat)), nbJ = plage(du, au).length;
    await B.run("INSERT INTO recalculs(id,portee,cible,du,au,statut,progression,nb_emps,nb_jours,cree,par) VALUES(?,?,?,?,?,?,?,?,?,?,?)", id, (sim ? "simulation:" : "")+q.portee, q.cible == null ? null : String(q.cible), du, au, "en_cours", 0, mats.length, nbJ, maintenant(), login);
    await audit(login, sim ? "simulation.lancee" : "recalcul.lance", (sim ? sim.map(x=>x.code+"="+JSON.stringify(x.valeur)+" ("+x.niveau+")").join(", ")+" ; " : "")+ q.portee+(q.cible ? " "+q.cible : "")+" du "+du+" au "+au+" : "+mats.length+" salarié(s)");
    B.enTravail(async ()=>{
      try {
        const t0 = Date.now();
        const brut = await K.compteursPeriode(mats, du, au, (n, tot)=>{ B.run("UPDATE recalculs SET progression=? WHERE id=?", Math.round(100*n/tot), id).catch(()=>{}); }, sim);
        const apres = {}, avantSim = {};
        if (sim) Object.keys(brut).forEach(k=>{ apres[k] = brut[k].apres; avantSim[k] = brut[k].avant; }); else Object.assign(apres, brut);
        const lignes = [], tot = {};
        let ecarts = 0, sansRef = 0;
        for (const mat of mats){
          /* simulation : « avant » = règles actuelles, « après » = avec les règles candidates ; recalcul : dernière référence */
          const ref = sim ? null : await B.get("SELECT valeurs, version FROM counter_snapshots WHERE mat=? AND du=? AND au=? ORDER BY version DESC LIMIT 1", mat, du, au);
          const av = sim ? (avantSim[mat] || null) : (ref ? JSON.parse(ref.valeurs) : null), ap = apres[mat] || {}, det = {};
          let diff = false;
          Object.keys(Object.assign({}, av || {}, ap)).forEach(k=>{
            const a = av ? av[k] : null, b = ap[k], d = (Number(b)||0) - (Number(a)||0);
            if (!tot[k]) tot[k] = {avant:0, apres:0, ecart:0};
            tot[k].avant += Number(a)||0; tot[k].apres += Number(b)||0; tot[k].ecart += d;
            if (av && Math.abs(d) > 1e-6){ det[k] = {avant:a, apres:b, ecart:Math.round(d*10000)/10000}; diff = true; }
          });
          if (!av) sansRef++;
          if (diff) ecarts++;
          lignes.push({mat, version:ref ? ref.version : 0, avant:av, apres:ap, ecarts:det});
        }
        Object.values(tot).forEach(x=>{ ["avant","apres","ecart"].forEach(k=>{ x[k] = Math.round(x[k]*100)/100; }); });
        fs.writeFileSync(fichier(id), JSON.stringify({id, du, au, lignes}), {mode:0o600});
        const resume = {compteurs:tot, sansReference:sansRef, dureeMs:Date.now()-t0, simulation:sim || undefined};
        await B.run("UPDATE recalculs SET statut=?, progression=100, nb_ecarts=?, resume=? WHERE id=?", sim ? "simulation" : "a_valider", ecarts, JSON.stringify(resume), id);
        await audit(login, "recalcul.termine", id+" : "+mats.length+" salarié(s) × "+nbJ+" jour(s), "+ecarts+" avec écart, "+sansRef+" sans référence ("+Math.round(resume.dureeMs/1000)+" s)");
      } catch(e){ await B.run("UPDATE recalculs SET statut='erreur', erreur=? WHERE id=?", String(e.message).slice(0, 500), id); journal("recalcul "+id+" : "+e.message); }
    });
    return B.get("SELECT * FROM recalculs WHERE id=?", id);
  }
  /* 56.33.11 : un recalcul n'est visible et applicable que par son auteur ou par un valideur dont le périmètre couvre
     tous ses salariés (avant : liste, détail nominatif et validation ouverts à tout valideur, quel que soit le site) */
  const COUVRE = new Map();
  async function accessible(r, acces){
    if (!acces || acces.global) return true;
    if (r.par === acces.login) return true;
    if (r.statut === "en_cours" || r.statut === "erreur") return false;
    if (!COUVRE.has(r.id)){ let l = []; try { l = JSON.parse(fs.readFileSync(fichier(r.id), "utf8")).lignes; } catch(e){ return false; }
      if (COUVRE.size > 200) COUVRE.clear(); COUVRE.set(r.id, l.map(x=>String(x.mat))); }
    return COUVRE.get(r.id).every(m=>acces.dansPerim(m));
  }
  async function lire(id, seulementEcarts, offset, limit, acces){
    const r = await B.get("SELECT * FROM recalculs WHERE id=?", id); if (!r || !(await accessible(r, acces))) return null;
    r.resume = r.resume ? JSON.parse(r.resume) : null;
    let lignes = [];
    try { lignes = JSON.parse(fs.readFileSync(fichier(id), "utf8")).lignes; } catch(e){}
    if (seulementEcarts) lignes = lignes.filter(x=>!x.avant || Object.keys(x.ecarts).length);
    const emps = new Map((await D.employes()).map(e=>[String(e.mat), e]));
    r.total = lignes.length;
    r.lignes = lignes.slice(offset||0, (offset||0) + (limit||100)).map(x=>Object.assign({}, x, {nom:((emps.get(x.mat)||{}).nom||"")+" "+((emps.get(x.mat)||{}).prenom||"")}));
    return r;
  }
  async function valider(login, id, decision, acces){
    const r = await B.get("SELECT * FROM recalculs WHERE id=?", id);
    if (!r || !(await accessible(r, acces))) throw Object.assign(new Error("Recalcul introuvable."), {code:404});
    /* règle des quatre yeux : l'auteur ne valide pas son propre recalcul (sauf administrateur, seul habilité dans les petites structures) */
    if (decision !== "rejet" && acces && !acces.admin && r.par === login) throw Object.assign(new Error("Un recalcul est validé par une autre personne que son auteur."), {code:403});
    if (r.statut !== "a_valider") throw Object.assign(new Error("Recalcul "+r.statut+"."), {code:409});
    const c = await clot();
    if (decision !== "rejet" && c && r.du <= c) throw Object.assign(new Error("La période a été clôturée depuis : recalcul non applicable."), {code:409});
    if (decision === "rejet"){ await B.run("UPDATE recalculs SET statut='rejete', valide_par=?, valide_le=? WHERE id=?", login, maintenant(), id); await audit(login, "recalcul.rejete", id); return {ok:true, statut:"rejete"}; }
    const lignes = JSON.parse(fs.readFileSync(fichier(id), "utf8")).lignes, cree = maintenant();
    await B.transaction(async ()=>{
      for (const x of lignes) await B.run("INSERT INTO counter_snapshots(mat,du,au,version,valeurs,recalcul_id,cree) VALUES(?,?,?,?,?,?,?)", x.mat, r.du, r.au, (x.version||0) + 1, JSON.stringify(x.apres||{}), id, cree);
      await B.run("UPDATE recalculs SET statut='applique', valide_par=?, valide_le=? WHERE id=?", login, cree, id);
    });
    /* les journées de la période sont recalculées (cache) pour que tous les écrans reflètent la référence validée */
    const touches = []; lignes.forEach(x=>plage(r.du, r.au).forEach(d=>touches.push(x.mat+"|"+d)));
    try { await K.invalider(touches, []); } catch(e){}
    await audit(login, "recalcul.applique", id+" : nouvelle référence pour "+lignes.length+" salarié(s), "+r.nb_ecarts+" avec écart");
    return {ok:true, statut:"applique", references:lignes.length};
  }
  async function liste(acces){ const out = [];
    for (const r of await B.all("SELECT * FROM recalculs ORDER BY cree DESC LIMIT 50")) if (await accessible(r, acces)) out.push(Object.assign(r, {resume:r.resume ? JSON.parse(r.resume) : null}));
    return out; }
  return {lancer, lire, valider, liste};
}
module.exports = {creer};
