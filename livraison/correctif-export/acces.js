/* FIWAKTI — contrôle d'accès côté serveur (correctif 5).
   Droits d'un salarié sur une zone à une date : même règle que l'écran (app.js planAt / zonesDe). Un lecteur de porte
   (usage « door ») rattaché à une porte d'une zone n'accueille que les salariés qui ont, ce jour-là, un plan d'accès
   existant, autre que « aucun accès », et dont au moins un jour ouvre une plage horaire existante. Un lecteur non
   rattaché à une zone garde la règle d'avant (rattachement ou site). Les lecteurs de pointage et mixtes ne sont pas
   filtrés : le pointage doit rester possible. */
"use strict";

/* plan en vigueur pour une zone à la date d (dernier droit dont la date d'effet est atteinte) */
function planAt(e, zoneId, d){
  const l = (Array.isArray(e && e.acces) ? e.acces : []).filter(x=>x && x.zoneId === zoneId && String(x.from || "") <= d)
    .sort((a, b)=>a.from < b.from ? -1 : 1);
  return l.length ? String(l[l.length - 1].planId || "") : "";
}

/* contexte calculé une fois par paramétrage : porte → zone, plans qui ouvrent réellement l'accès */
function contexte(ref){
  ref = ref || {};
  const porteZone = new Map();
  (ref.zones || []).forEach(z=>{ if (z && z.id) (z.portes || []).forEach(p=>{ if (p && p.id) porteZone.set(p.id, z.id); }); });
  const plages = new Set((ref.aplages || []).filter(a=>a && a.id && Array.isArray(a.iv) && a.iv.length).map(a=>a.id));
  const ouverts = new Set((ref.aplans || []).filter(p=>p && p.id && ([0, 1, 2, 3, 4, 5, 6].some(i=>plages.has((p.hebdo || {})[i])) || plages.has(p.ferie))).map(p=>p.id));
  const zoneDe = T=>T && T.usage === "door" && T.porteId ? porteZone.get(T.porteId) || null : null;
  const autorise = (e, zoneId, d)=>{ const p = planAt(e, zoneId, d); return !!p && p !== "aucun" && ouverts.has(p); };
  return {zoneDe, autorise, admis:(e, T, d)=>{ const z = zoneDe(T); return !z || autorise(e, z, d); }};
}

module.exports = {planAt, contexte};
