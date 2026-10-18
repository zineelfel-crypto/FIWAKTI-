/* FIWAKTI v56.30 — import renforcé (cahier des charges § 6) : extension chargée à la première ouverture de l'étape de
   contrôle de l'import (aucun poids ajouté au socle). Synthèse, référentiels manquants sur décision explicite, table de
   correspondance, comptes par ligne, rapport. Les libellés sont enregistrés à la première utilisation. */
function irInit(){ if (irInit.fait) return; irInit.fait = true;
Object.assign(T.fr, {irProfSens:"{n} compte(s) demandent un profil d'administration : l'import ne l'attribue pas (profil par défaut). Attribuez-le ensuite dans Utilisateurs.", irCompteCol:"Créer le compte (Oui / Non)", irSynth:"Synthèse avant import", irCreer:"Salariés à créer", irMaj:"Salariés à mettre à jour", irCols:"Colonnes non reconnues", irSites:"Sites inconnus",
    irDepts:"Services inconnus", irCals:"Calendriers inconnus", irProfils:"Profils inconnus", irComptes:"Comptes à créer", irErr:"Erreurs bloquantes", irRefs:"Éléments de référentiel à traiter",
    irRefsH:"Rien n'est créé sans votre choix. Un calendrier ou un profil n'est jamais créé par l'import : choisissez un élément existant ou laissez vide.",
    irChoisir:"— à traiter —", irVide:"Ne pas renseigner", irIgnorer:"Ignorer la colonne", irCreerX:"Créer « {v} »", irCreerChamp:"Créer le champ personnalisé « {v} » — saisie libre", irCreerChampL:"Créer le champ personnalisé « {v} » — liste des valeurs du fichier", irTousChamps:"Créer toutes les colonnes non reconnues comme champs personnalisés ({n})", irTousChampsH:"Le type (saisie libre ou liste) est proposé d'après les valeurs du fichier ; il reste modifiable colonne par colonne, puis dans Paramétrage > Champs.",
    irCode:"Code", irLib:"Libellé", irParent:"Rattaché à", irRacine:"(premier niveau)", irMemo:"Retenir ces choix pour les prochains imports",
    irBloque:"{n} élément(s) à traiter avant l'import.", irHorsPerim:"Matricule existant hors de votre périmètre", irChargement:"Chargement des fiches concernées…",
    irRapport:"Rapport d'import", irRapDl:"Télécharger le rapport", irRefCrees:"Référentiels créés", irAucun:"aucun", irComptesCrees:"Comptes créés",
    irNonHabil:"Seule une personne habilitée au paramétrage peut créer des éléments de référentiel.", irExclu:"Le retour arrière couvre les salariés, badgeages, services, sites, champs et comptes créés par cet import."});
  Object.assign(T.en, {irProfSens:"{n} account(s) request an administration profile: the import does not assign it (default profile). Assign it afterwards in Users.", irCompteCol:"Create the account (Yes / No)", irSynth:"Summary before import", irCreer:"Employees to create", irMaj:"Employees to update", irCols:"Unrecognised columns", irSites:"Unknown sites",
    irDepts:"Unknown departments", irCals:"Unknown calendars", irProfils:"Unknown profiles", irComptes:"Accounts to create", irErr:"Blocking errors", irRefs:"Reference items to handle",
    irRefsH:"Nothing is created without your choice. The import never creates a calendar or a profile: pick an existing one or leave empty.",
    irChoisir:"— to handle —", irVide:"Leave empty", irIgnorer:"Ignore the column", irCreerX:"Create “{v}”", irCreerChamp:"Create the custom field “{v}” — free text", irCreerChampL:"Create the custom field “{v}” — list of the file's values", irTousChamps:"Create every unrecognised column as a custom field ({n})", irTousChampsH:"The type (free text or list) is suggested from the file's values; it can be changed column by column, then in Settings > Fields.",
    irCode:"Code", irLib:"Label", irParent:"Attached to", irRacine:"(top level)", irMemo:"Remember these choices for future imports",
    irBloque:"{n} item(s) to handle before importing.", irHorsPerim:"Employee number exists outside your scope", irChargement:"Loading the records concerned…",
    irRapport:"Import report", irRapDl:"Download the report", irRefCrees:"Reference items created", irAucun:"none", irComptesCrees:"Accounts created",
    irNonHabil:"Only a person authorised for settings can create reference items.", irExclu:"Rollback covers employees, punches, departments, sites, fields and accounts created by this import."});
  Object.assign(T.ar, {irProfSens:"{n} حساب يطلب ملف صلاحيات إدارة: لا يمنحه الاستيراد (الملف الافتراضي). امنحه لاحقا في المستخدمين.", irCompteCol:"إنشاء الحساب (نعم / لا)", irSynth:"ملخص قبل الاستيراد", irCreer:"أعوان للإنشاء", irMaj:"أعوان للتحديث", irCols:"أعمدة غير معروفة", irSites:"مواقع غير معروفة",
    irDepts:"مصالح غير معروفة", irCals:"رزنامات غير معروفة", irProfils:"ملفات صلاحيات غير معروفة", irComptes:"حسابات للإنشاء", irErr:"أخطاء مانعة", irRefs:"عناصر مرجعية للمعالجة",
    irRefsH:"لا يُنشأ شيء دون اختياركم. لا ينشئ الاستيراد أبدا رزنامة أو ملف صلاحيات: اختاروا عنصرا موجودا أو اتركوه فارغا.",
    irChoisir:"— للمعالجة —", irVide:"عدم التعبئة", irIgnorer:"تجاهل العمود", irCreerX:"إنشاء «{v}»", irCreerChamp:"إنشاء الحقل الخاص «{v}» — إدخال حر", irCreerChampL:"إنشاء الحقل الخاص «{v}» — قائمة قيم الملف", irTousChamps:"إنشاء كل الأعمدة غير المعروفة كحقول خاصة ({n})", irTousChampsH:"يُقترح النوع (إدخال حر أو قائمة) حسب قيم الملف؛ ويمكن تغييره لكل عمود ثم في الإعدادات > الحقول.",
    irCode:"الرمز", irLib:"التسمية", irParent:"تابع لـ", irRacine:"(المستوى الأول)", irMemo:"حفظ هذه الاختيارات للاستيرادات القادمة",
    irBloque:"{n} عنصر للمعالجة قبل الاستيراد.", irHorsPerim:"رقم تسجيل موجود خارج نطاقكم", irChargement:"جارٍ تحميل البطاقات المعنية…",
    irRapport:"تقرير الاستيراد", irRapDl:"تنزيل التقرير", irRefCrees:"عناصر مرجعية منشأة", irAucun:"لا شيء", irComptesCrees:"حسابات منشأة",
    irNonHabil:"وحده الشخص المؤهل للإعدادات يمكنه إنشاء عناصر مرجعية.", irExclu:"يشمل التراجع الأعوان والتسجيلات والمصالح والمواقع والحقول والحسابات التي أنشأها هذا الاستيراد."});
  
  }
window.FWK_IMP = true;
function irHabilite(){ return !SESS || droit("PAR") === "config" || droit("SYS") === "config"; }
function irNorm(v){ return String(v||"").trim(); }
function irCorresp(){ return db.impCorresp || (db.impCorresp = {site:{}, dept:{}, cal:{}, profil:{}}); }
function irSiteExistant(v){ const n = irNorm(v).toLowerCase(); const s = (db.sites||[]).find(x=>String(x.code||"").toLowerCase() === n || String(x.nom||"").toLowerCase() === n); return s ? s.id : null; }
function irDeptExistant(chemin){ let parent = null, id = null;
  for (const nom of String(chemin).split("/").map(x=>x.trim()).filter(Boolean)){ const d = (db.depts||[]).find(x=>x.nom === nom && (x.parent||null) === parent); if (!d) return null; parent = d.id; id = d.id; } return id; }
function irCalExistant(v){ const n = irNorm(v).toLowerCase(); const c = (db.cals||[]).find(x=>String(x.nom||"").toLowerCase() === n || String(x.id) === irNorm(v)); return c ? c.id : null; }
function irProfilExistant(v){ const n = irNorm(v).toLowerCase(); const p = (db.profils||[]).find(x=>String(x.nom||"").toLowerCase() === n || String(x.id) === irNorm(v)); return p ? p.id : null; }
const IR_EXIST = {site:irSiteExistant, dept:irDeptExistant, cal:irCalExistant, profil:irProfilExistant};
const IR_COL = {site:"SITE", dept:"DEPARTEMENT", cal:"CALENDRIER", profil:"PROFIL"};
/* décision pour une valeur inconnue : {m:"ex", id} | {m:"creer", code, nom, parent} | {m:"vide"} ; null = à traiter */
function irDecision(type, v){ const w = ui.imp, d = ((w.dec||{})[type]||{})[v]; if (d) return d;
  const c = irCorresp()[type] && irCorresp()[type][v]; if (c && (type === "dept" ? (db.depts||[]).some(x=>x.id === c) : type === "site" ? (db.sites||[]).some(x=>x.id === c) : type === "cal" ? (db.cals||[]).some(x=>x.id === c) : (db.profils||[]).some(x=>x.id === c))) return {m:"ex", id:c, memo:true};
  return null; }
/* analyse complète : comptes, inconnus, colonnes non reconnues, éléments à traiter */
function irAnalyse(){
  const w = ui.imp, R = {site:new Set(), dept:new Set(), cal:new Set(), profil:new Set(), comptes:0, cols:[]};
  if (!w || w.cible === "badge" || !w.lignes) return R;
  const mats = new Set((db.emps||[]).map(e=>e.mat)), auto = typeof pcCfg === "function" && pcCfg().auto;
  w.lignes.forEach(r=>{ const o = impLigne(r); if (!o.MATRICULE || (w.hors||{})[o.MATRICULE]) return;
    Object.keys(IR_COL).forEach(ty=>{ const v = irNorm(o[IR_COL[ty]]); if (v && !IR_EXIST[ty](v)) R[ty].add(v); });
    const neuf = !mats.has(o.MATRICULE), oui = /^(1|o|oui|y|yes|x|نعم)$/i.test(irNorm(o.COMPTE));
    if ((oui || (auto && neuf && irNorm(o.COMPTE) === "")) && !(db.users||[]).some(u=>u.login === o.MATRICULE)){ R.comptes++;
      const pv = irNorm(o.PROFIL), d = pv ? irDecision("profil", pv) : null, pid = pv ? (IR_EXIST.profil(pv) || (d && d.m === "ex" ? d.id : null)) : null;
      if (pid && irProfilSensible((db.profils||[]).find(p=>p.id === pid))) R.profSens = (R.profSens || 0) + 1; } });
  (w.entetes||[]).forEach((h, i)=>{ if (irNorm(h) && !w.map[i]) R.cols.push({i, nom:irNorm(h)}); });
  return R;
}
/* valeurs distinctes d'une colonne ; liste conseillée si les valeurs se répètent, sont courtes et peu nombreuses */
const IR_RESERVES = ["MATRICULE","NOM","PRENOM","CIN","SITE","DEPARTEMENT","CHEF","ENTREE","SORTIE","EMAIL","TELEPHONE","BADGE","CALENDRIER","PORTAIL","COMPTE","PROFIL"];
function irValeurs(i){ return Array.from(new Set((ui.imp.lignes||[]).map(r=>irNorm(r[+i])).filter(Boolean))); }
function irListeConseillee(i){ const v = irValeurs(i), n = (ui.imp.lignes||[]).filter(r=>irNorm(r[+i])).length;
  return v.length >= 2 && v.length <= 30 && n >= 2 * v.length && v.every(x=>x.length <= 40 && !/\d{4,}/.test(x.replace(/[\s.\-+]/g, ""))); }
function irATraiter(R){ let n = 0; ["site", "dept", "cal", "profil"].forEach(ty=>R[ty].forEach(v=>{ if (!irDecision(ty, v)) n++; })); return n; }
/* grand effectif : les fiches du fichier sont chargées (complètes) avant l'analyse ; un matricule hors périmètre devient une erreur */
async function irPreparer(){ irInit();
  const w = ui.imp; if (!w || w.cible === "badge" || !w.lignes || !(typeof ANNUAIRE_PAGINE !== "undefined" && ANNUAIRE_PAGINE)) return;
  const mats = Array.from(new Set(w.lignes.map(r=>impLigne(r).MATRICULE).filter(Boolean))).filter(m=>!(db.emps||[]).some(e=>e.mat === m && !e._leger));
  w.hors = w.hors || {};
  for (let i = 0; i < mats.length; i += 1000){
    const r = await fetch("api/v1/employes/complets", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({mats:mats.slice(i, i+1000)})});
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).message || ("HTTP "+r.status));
    const j = await r.json(); (j.lignes||[]).forEach(e=>empIntegrer(e)); (j.hors||[]).forEach(m=>{ w.hors[m] = true; });
  }
}
function irSelect(type, v){
  const d = irDecision(type, v) || {}, val = d.m === "ex" ? "ex:"+d.id : d.m || "", hab = irHabilite();
  const liste = type === "site" ? (db.sites||[]).map(x=>[x.id, x.nom]) : type === "dept" ? (db.depts||[]).map(x=>[x.id, deptPath(x.id)]) :
    type === "cal" ? (db.cals||[]).map(x=>[x.id, x.nom]) : (db.profils||[]).map(x=>[x.id, x.nom]);
  const o = (k, l) => '<option value="'+esc(k)+'"'+(val === k ? " selected" : "")+'>'+esc(l)+'</option>';
  return '<select data-irdec="'+type+'" data-irv="'+esc(v)+'" aria-label="'+esc(v)+'">'+o("", t.irChoisir)+
    ((type === "site" || type === "dept") && hab ? o("creer", t.irCreerX.replace("{v}", v)) : "")+liste.map(x=>o("ex:"+x[0], x[1])).join("")+o("vide", t.irVide)+'</select>'+
    (d.m === "creer" && type === "site" ? ' <input data-irc="'+type+'|'+esc(v)+'|code" value="'+esc(d.code||"")+'" placeholder="'+esc(t.irCode)+'" aria-label="'+esc(t.irCode+" — "+v)+'" size="8"> <input data-irc="'+type+'|'+esc(v)+'|nom" value="'+esc(d.nom||v)+'" placeholder="'+esc(t.irLib)+'" aria-label="'+esc(t.irLib+" — "+v)+'">' : "")+
    (d.m === "creer" && type === "dept" ? ' <span class="fw-hint">'+esc(t.irParent)+' : '+esc((()=>{ const p = String(v).split("/").map(x=>x.trim()).filter(Boolean); p.pop(); return p.length ? p.join(" / ") : t.irRacine; })())+'</span>' : "");
}
function htmlImpRefs(){ irInit();
  const w = ui.imp; if (!w || w.cible === "badge") return "";
  const R = irAnalyse(), aT = irATraiter(R), hab = irHabilite();
  const kv = (l, n, warn) => '<div class="fw-kpi" style="--kc:'+(warn && n ? "#b45309" : "#0f766e")+'"><div class="v">'+n+'</div><div class="l">'+esc(l)+'</div></div>';
  let h = '<div class="fw-card fw-u-p-lg" style="margin:12px 0"><div class="fw-sec" style="margin-top:0">'+esc(t.irSynth)+'</div><div class="fw-kpis">'+
    kv(t.irCols, R.cols.length, 1)+kv(t.irSites, R.site.size, 1)+kv(t.irDepts, R.dept.size, 1)+kv(t.irCals, R.cal.size, 1)+
    (R.profil.size ? kv(t.irProfils, R.profil.size, 1) : "")+kv(t.irComptes, R.comptes)+'</div>'+
    (R.profSens ? '<div class="fw-note" role="alert" style="margin-top:8px">'+esc(t.irProfSens.replace("{n}", R.profSens))+'</div>' : "");
  const lignes = [];
  ["site", "dept", "cal", "profil"].forEach(ty=>R[ty].forEach(v=>lignes.push('<tr><td class="fw-sm">'+esc({site:t.site, dept:t.dept, cal:t.calendar, profil:t.profil}[ty])+'</td><td class="fw-mono fw-sm">'+esc(v)+'</td><td>'+irSelect(ty, v)+'</td></tr>')));
  R.cols.forEach(x=>{ const d = ((w.dec||{}).col||{})[x.i] || {}; lignes.push('<tr><td class="fw-sm">'+esc(t.colonne||"Colonne")+'</td><td class="fw-mono fw-sm">'+esc(x.nom)+'</td><td>'+
    '<select data-irdec="col" data-irv="'+x.i+'" aria-label="'+esc(x.nom)+'"><option value="">'+esc(t.irIgnorer)+'</option>'+(hab ? '<option value="creer"'+(d.m === "creer" ? " selected" : "")+'>'+esc(t.irCreerChamp.replace("{v}", x.nom))+'</option><option value="creerL"'+(d.m === "creerL" ? " selected" : "")+'>'+esc(t.irCreerChampL.replace("{v}", x.nom))+'</option>' : '')+'</select></td></tr>'); });
  /* 56.33.11 : toutes les colonnes non reconnues en un clic (type proposé d'après les valeurs) */
  const sansDec = R.cols.filter(x=>!(((w.dec||{}).col||{})[x.i]));
  if (hab && sansDec.length) lignes.unshift('<tr><td colspan="3"><button type="button" class="fw-btn sm pri" data-irtous>'+esc(t.irTousChamps.replace("{n}", sansDec.length))+'</button> <span class="fw-hint">'+esc(t.irTousChampsH)+'</span></td></tr>');
  if (lignes.length) h += '<div class="fw-sec">'+esc(t.irRefs)+'</div><p class="fw-hint">'+esc(t.irRefsH)+(hab ? "" : " "+t.irNonHabil)+'</p><div style="overflow:auto"><table class="fw-tbl"><tbody>'+lignes.join("")+'</tbody></table></div>'+
    '<label class="fw-check" style="margin-top:8px"><input type="checkbox" data-irmemo'+(w.memo !== false ? " checked" : "")+'><span>'+esc(t.irMemo)+'</span></label>';
  if (aT) h += '<div class="fw-bad" role="status" style="margin-top:8px">'+esc(t.irBloque.replace("{n}", aT))+'</div>';
  return h+'<div class="fw-hint" style="margin-top:8px">'+esc(t.irExclu)+'</div></div>';
}
/* résolution à l'exécution : élément existant, décision, ou création décidée (une seule fois par valeur) */
function irResoudre(type, v){ irInit();
  v = irNorm(v); if (!v) return null; const ex = IR_EXIST[type](v); if (ex) return ex;
  const w = ui.imp, d = irDecision(type, v); if (!d || d.m === "vide") return null; if (d.m === "ex") return d.id;
  if (d.m !== "creer" || !irHabilite()) return null;
  w.crees = w.crees || [];
  if (type === "site"){ let code = (irNorm(d.code) || v.slice(0, 12)).toUpperCase(), k = 2; const base = code;
    while ((db.sites||[]).some(x=>String(x.code||"").toUpperCase() === code)) code = base+"-"+(k++);   /* code de site toujours unique */
    const s = Object.assign(BLANK.sites ? BLANK.sites() : {}, {id:uid("s"), code, nom:irNorm(d.nom) || v});
    db.sites.push(s); w.crees.push(t.site+" : "+s.nom); return s.id; }
  if (type === "dept"){ let parent = null, id = null;
    String(v).split("/").map(x=>x.trim()).filter(Boolean).forEach(nom=>{ let x = (db.depts||[]).find(y=>y.nom === nom && (y.parent||null) === parent);
      if (!x){ x = {id:uid("d"), nom, parent}; db.depts.push(x); w.crees.push(t.dept+" : "+deptPath(x.id)); } parent = x.id; id = x.id; });
    return id; }
  return null;
}
/* champs personnalisés créés depuis des colonnes non reconnues, avant l'écriture des lignes */
function irCreerChamps(){ irInit();
  const w = ui.imp; if (!irHabilite()) return; w.crees = w.crees || [];
  if (!Array.isArray(db.champs)) db.champs = [];
  Object.keys((w.dec||{}).col||{}).forEach(i=>{ const d = w.dec.col[i]; if (!d || (d.m !== "creer" && d.m !== "creerL") || w.map[i]) return;
    const nom = irNorm((w.entetes||[])[i]); if (!nom) return;
    let code = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "CHAMP";
    const base = code; let k = 2; while (db.champs.some(c=>c.code === code) || IR_RESERVES.indexOf(code) >= 0) code = base+"_"+(k++);
    /* liste seulement sur choix explicite (auparavant : liste fermée dès 30 valeurs ou moins, un téléphone devenait une liste) */
    const vals = d.m === "creerL" ? irValeurs(i).slice(0, 200) : [];
    db.champs.push({id:uid("ch"), code, nom, options:vals, filtre:d.m === "creerL"});
    w.map[i] = code; w.crees.push((t.champs||"Champ")+" : "+nom+" ("+code+")"); });
  /* 56.33.11 : champ existant en liste — les nouvelles valeurs du fichier complètent la liste (sinon valeurs hors liste) */
  Object.keys(w.map||{}).forEach(i=>{ const c = db.champs.find(x=>x.code === w.map[i]); if (!c || !Array.isArray(c.options) || !c.options.length) return;
    const neuves = irValeurs(i).filter(v=>c.options.indexOf(v) < 0); if (!neuves.length) return;
    c.options = c.options.concat(neuves); w.crees.push((t.champs||"Champ")+" : "+c.nom+" + "+neuves.join(", ")); });
}
/* comptes demandés par ligne (colonne Créer compte), profil existant seulement */
function irProfilSensible(pr){ if (!pr) return false; const d = pr.droits || {}; return pr.niveauMenu === "admin" || d.SYS === "saisie" || d.SYS === "validation" || d.SYS === "config"; }
function irComptes(e, o){
  const oui = /^(1|o|oui|y|yes|x|نعم)$/i.test(irNorm(o.COMPTE)), non = /^(0|n|non|no|لا)$/i.test(irNorm(o.COMPTE));
  if (non || !oui) return 0; const r = creerCompteEmploye(e); if (!r || !r.u) return 0;
  const pid = irNorm(o.PROFIL) ? irResoudre("profil", o.PROFIL) : null;
  /* correctif 19 : un profil d'administration (niveau admin ou droit Système en écriture) n'est jamais attribué par un
     import : le compte créé garde le profil par défaut, l'administrateur l'élève ensuite à la main (un fichier pouvait
     créer des administrateurs dont le mot de passe provisoire était le matricule) */
  if (pid){ const pr = (db.profils || []).find(p=>p.id === pid); if (irProfilSensible(pr)){ ui.imp.profRefuses = (ui.imp.profRefuses || 0) + 1; } else r.u.profilId = pid; }
  return 1;
}
function irMemoriser(){
  const w = ui.imp; if (w.memo === false) return; const C = irCorresp();
  ["site", "dept", "cal", "profil"].forEach(ty=>Object.keys((w.dec||{})[ty]||{}).forEach(v=>{ const d = w.dec[ty][v];
    const id = d.m === "ex" ? d.id : d.m === "creer" ? IR_EXIST[ty](v) : null; if (id) (C[ty] = C[ty] || {})[v] = id; }));
}
function irRapportCsv(){ irInit();
  const R = ui.impRapport; if (!R) return;
  const l = [csvLine([t.irRapport, R.le]), csvLine([t.irCreer, R.crees]), csvLine([t.irMaj, R.majs]), csvLine([t.ignores||"Ignorés", R.ignores]), csvLine([t.irErr, R.erreurs.length]),
    csvLine([t.irComptesCrees, R.comptes]), csvLine([t.irRefCrees, R.refs.length])].concat(R.refs.map(x=>csvLine(["", x]))).concat([csvLine([]), csvLine(["LIGNE", "MESSAGE"])]).concat(R.erreurs.map(e=>csvLine([e.l, e.m])));
  download("FIWAKTI_rapport_import_"+todayKey()+".csv", l.join("\r\n"));
}
function htmlImpRapport(){ irInit();
  const R = ui.impRapport; if (!R) return "";
  return '<div class="fw-card fw-u-p-lg" style="margin-bottom:12px"><div class="fw-sec" style="margin-top:0">'+esc(t.irRapport)+' — '+esc(R.le)+'</div>'+
    '<div class="fw-hint">'+esc(t.irCreer+" : "+R.crees+" · "+t.irMaj+" : "+R.majs+" · "+(t.ignores||"Ignorés")+" : "+R.ignores+" · "+t.irErr+" : "+R.erreurs.length+" · "+t.irComptesCrees+" : "+R.comptes)+'</div>'+
    '<div class="fw-hint">'+esc(t.irRefCrees+" : "+(R.refs.length ? R.refs.join(" ; ") : t.irAucun))+'</div>'+
    '<div class="fw-u-row" style="gap:8px;margin-top:8px"><button type="button" class="fw-btn sm" data-act="ir-rapport">'+esc(t.irRapDl)+'</button>'+
    '<button type="button" class="fw-iconb" data-act="ir-rapport-fermer" aria-label="'+esc(t.fermer)+'">×</button></div></div>';
}
document.addEventListener("click", function(ev){
  const el = ev.target && ev.target.closest && ev.target.closest("[data-irtous]"); if (!el || !ui.imp || !irHabilite()) return;
  const w = ui.imp; w.dec = w.dec || {}; w.dec.col = w.dec.col || {};
  irAnalyse().cols.forEach(x=>{ if (!w.dec.col[x.i]) w.dec.col[x.i] = {m:irListeConseillee(x.i) ? "creerL" : "creer", nom:x.nom, code:""}; });
  render();
});
document.addEventListener("change", function(ev){
  const el = ev.target; if (!el || !el.dataset || !ui.imp) return; const w = ui.imp;
  if (el.dataset.irdec){ const ty = el.dataset.irdec, v = el.dataset.irv, x = el.value; w.dec = w.dec || {}; w.dec[ty] = w.dec[ty] || {};
    if (!x) delete w.dec[ty][v]; else if (x.indexOf("ex:") === 0) w.dec[ty][v] = {m:"ex", id:x.slice(3)}; else w.dec[ty][v] = {m:x, nom:v, code:""};
    return render(); }
  if (el.dataset.irc){ const p = el.dataset.irc.split("|"), d = ((w.dec||{})[p[0]]||{})[p[1]]; if (d) d[p[2]] = el.value; return; }
  if (el.hasAttribute("data-irmemo")){ w.memo = el.checked; return; }
});
