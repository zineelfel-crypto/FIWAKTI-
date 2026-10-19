/* FW-Migration — assistant de migration (chargé à la première ouverture, administrateurs seulement).
   1 Source (fichiers, dossier, formulaires PDF, base de données) → 2 Données lues → 3 Correspondance des colonnes →
   4 Analyse sans écriture (référentiels inconnus, codes, erreurs) → 5 Import, rapport et annulation. */
(function(){
"use strict";
const L = {
  fr:{cleSal:"Identifier le salarié par", cleMat:"son matricule", cleBadge:"son numéro de badge", cleH:"Badge : la colonne reliée au « Matricule » contient le numéro de carte ; les zéros de tête sont ignorés (000710103 = 710103).", rienImporte:"Aucune donnée n'a été importée", revoirCorresp:"Revoir la correspondance", voirDonnees:"Voir les données importées", rechargerH:"L'application se recharge (quelques secondes) : ouvrez ensuite RH › Employés ou Temps › Pointages.", toutCreer:"Tout créer dans FIWAKTI ({n})", toutIgnorer:"Tout ignorer", toutAffecter:"Affecter toutes les valeurs à…", cheminH:"Les chemins « A\\B\\C » ou « A / B / C » créent l'organigramme niveau par niveau.", detailVal:"Voir et ajuster valeur par valeur", toutCreerOk:"{n} valeur(s) seront créées à l'import.", toutIgnorerOk:"{n} valeur(s) ignorées.", choisirJeu:"Plusieurs jeux de données ont été lus : cliquez sur celui à importer.", formatInconnu:"« {n} » : ce n'est ni un fichier de données reconnu (CSV, Excel, JSON, XML, PDF), ni une base SQLite, ni une archive ZIP. Exportez ces données depuis le logiciel d'origine (Excel ou CSV).", baseDeposee:"Base « {n} » déposée ({t} Mo) : choisissez la table à reprendre.", defauts:"Nouveaux salariés sans valeur dans la source", defautsH:"Choisissez explicitement le calendrier (obligatoire) et, si vous le souhaitez, le site et le service des nouveaux salariés dont la source ne les précise pas, puis relancez l'analyse.", defautChoisir:"— à choisir —", defautVide:"Laisser vide", defCal:"Calendrier", defSite:"Site", defDept:"Service", c_journees:"Journées types", c_calendriers:"Calendriers", c_formules:"Formules arithmétiques", r_journee:"Journées", repos:"Repos", elements:"Éléments repris", et_creer:"À créer", et_maj:"À mettre à jour", et_conflit:"Existe déjà avec une autre formule : non remplacée", remplacer:"Remplacer les formules existantes de même code", ordre:"Ordre conseillé : journées types, puis calendriers, puis salariés, puis badgeages ; les formules à tout moment.", titre:"Migration des données", lede:"Reprenez les données de votre logiciel actuel : fichiers, dossiers, formulaires PDF ou base de données, avec une analyse complète avant toute écriture.",
    e1:"Source", e2:"Données lues", e3:"Correspondance", e4:"Analyse", e5:"Import", histo:"Historique des imports",
    fichiers:"Fichiers, dossier ou formulaires", base:"Base de données", choisirFichiers:"Choisir des fichiers", choisirDossier:"Choisir un dossier", formats:"CSV, TXT, Excel, JSON, XML, PDF à champs, SQLite, ou une archive ZIP d'un dossier complet. Aucune donnée n'est écrite à cette étape.",
    lecture:"Lecture en cours…", type:"Type de base", hote:"Serveur", port:"Port", nomBase:"Base", utilisateur:"Utilisateur", mdp:"Mot de passe", ssl:"Connexion chiffrée", tester:"Se connecter et lister les tables",
    table:"Table", requete:"ou requête de lecture (SELECT)", limite:"Lignes au plus", lire:"Lire les données", mdpNonGarde:"Le mot de passe sert à la lecture et n'est jamais conservé. Seules les requêtes de lecture sont acceptées.",
    sqlAbsent:"Composant SQL Server non installé : déposez le dossier « connecteurs » fourni à la racine de FIWAKTI.", lignes:"lignes", colonnes:"colonnes", cible:"Ces données sont des", c_salaries:"Salariés", c_badgeages:"Badgeages",
    continuer:"Continuer", retour:"Retour", apercu:"Aperçu", champ:"Champ FIWAKTI", colonneSource:"Colonne de la source", aucune:"— non repris —", obligatoire:"obligatoire",
    fmtDate:"Format des dates", auto:"Automatique", dmy:"JJ/MM/AAAA", mdy:"MM/JJ/AAAA", excel:"Nombre Excel", zeros:"Compléter le matricule à (chiffres)", analyser:"Analyser (aucune écriture)",
    a_creer:"À créer", a_maj:"À mettre à jour", a_inch:"Inchangés", a_err:"En erreur", a_ign:"Doublons ignorés", a_clot:"Période clôturée", refsInconnues:"Valeurs inconnues de FIWAKTI",
    r_site:"Sites", r_dept:"Services", r_calendrier:"Calendriers", ignorer:"Ignorer cette valeur", creerRef:"Créer dans FIWAKTI", choisirExistant:"Correspond à…", calInfo:"« Créer » ajoute le calendrier avec son nom seulement, sans horaire (à compléter) : saisissez ensuite ses horaires dans Temps et présence › Calendriers ; les calculs des salariés se mettent à jour aussitôt. Vous pouvez aussi l'associer à un calendrier existant.",
    sensInconnus:"Codes de sens non reconnus", entree:"Entrée", sortie:"Sortie", erreurs:"Exemples d'erreurs", ligne:"Ligne", cause:"Cause", accepter:"Importer seulement les lignes valides",
    profil:"Enregistrer cette correspondance sous le nom", relancer:"Relancer l'analyse", importer:"Importer", confirmer:"Confirmer l'import de {n} élément(s) ? Il pourra être annulé depuis l'historique.",
    termine:"Import terminé", lot:"Lot", annulerLot:"Annuler cet import", nouveau:"Nouvel import", annule:"Import annulé : {n} élément(s) rétabli(s).", statut:"Statut", date:"Date", source:"Source", par:"Par",
    s_termine:"Terminé", s_annule:"Annulé", s_en_cours:"En cours", rien:"Aucun import pour l'instant.", profilTrouve:"Correspondance « {n} » reprise automatiquement.", formulaire:"Formulaires"},
  en:{cleSal:"Identify the employee by", cleMat:"employee number", cleBadge:"badge number", cleH:"Badge: the column mapped to “Employee number” holds the card number; leading zeros are ignored (000710103 = 710103).", rienImporte:"No data was imported", revoirCorresp:"Review the mapping", voirDonnees:"See the imported data", rechargerH:"The application reloads (a few seconds): then open HR › Employees or Time › Punches.", toutCreer:"Create all in FIWAKTI ({n})", toutIgnorer:"Ignore all", toutAffecter:"Assign all values to…", cheminH:"Paths “A\\B\\C” or “A / B / C” build the org chart level by level.", detailVal:"See and adjust value by value", toutCreerOk:"{n} value(s) will be created on import.", toutIgnorerOk:"{n} value(s) ignored.", choisirJeu:"Several data sets were read: click the one to import.", formatInconnu:"“{n}”: not a recognised data file (CSV, Excel, JSON, XML, PDF), SQLite database or ZIP archive. Export the data from the original software (Excel or CSV).", baseDeposee:"Database “{n}” uploaded ({t} MB): choose the table to import.", defauts:"New employees without a value in the source", defautsH:"Explicitly choose the calendar (required) and, if you wish, the site and department of new employees whose source does not specify them, then rerun the analysis.", defautChoisir:"— choose —", defautVide:"Leave empty", defCal:"Calendar", defSite:"Site", defDept:"Department", c_journees:"Day types", c_calendriers:"Calendars", c_formules:"Arithmetic formulas", r_journee:"Day types", repos:"Rest", elements:"Items imported", et_creer:"To create", et_maj:"To update", et_conflit:"Already exists with another formula: not replaced", remplacer:"Replace existing formulas with the same code", ordre:"Suggested order: day types, then calendars, then employees, then clockings; formulas at any time.", titre:"Data migration", lede:"Bring in data from your current software: files, folders, PDF forms or a database, with a full analysis before anything is written.",
    e1:"Source", e2:"Data read", e3:"Mapping", e4:"Analysis", e5:"Import", histo:"Import history",
    fichiers:"Files, folder or forms", base:"Database", choisirFichiers:"Choose files", choisirDossier:"Choose a folder", formats:"CSV, TXT, Excel, JSON, XML, fillable PDF, SQLite, or a ZIP of a whole folder. Nothing is written at this step.",
    lecture:"Reading…", type:"Database type", hote:"Server", port:"Port", nomBase:"Database", utilisateur:"User", mdp:"Password", ssl:"Encrypted connection", tester:"Connect and list tables",
    table:"Table", requete:"or read query (SELECT)", limite:"Max rows", lire:"Read data", mdpNonGarde:"The password is used for reading only and is never stored. Only read queries are accepted.",
    sqlAbsent:"SQL Server component not installed: put the supplied “connecteurs” folder at the FIWAKTI root.", lignes:"rows", colonnes:"columns", cible:"This data contains", c_salaries:"Employees", c_badgeages:"Clockings",
    continuer:"Continue", retour:"Back", apercu:"Preview", champ:"FIWAKTI field", colonneSource:"Source column", aucune:"— not imported —", obligatoire:"required",
    fmtDate:"Date format", auto:"Automatic", dmy:"DD/MM/YYYY", mdy:"MM/DD/YYYY", excel:"Excel number", zeros:"Pad employee ID to (digits)", analyser:"Analyse (nothing written)",
    a_creer:"To create", a_maj:"To update", a_inch:"Unchanged", a_err:"Errors", a_ign:"Duplicates skipped", a_clot:"Closed period", refsInconnues:"Values unknown to FIWAKTI",
    r_site:"Sites", r_dept:"Departments", r_calendrier:"Calendars", ignorer:"Ignore this value", creerRef:"Create in FIWAKTI", choisirExistant:"Matches…", calInfo:"“Create” adds the calendar by name only, with no schedule (to be completed): then enter its schedules in Time and attendance › Calendars; employees' calculations update immediately. You can also match it to an existing calendar.",
    sensInconnus:"Unrecognised direction codes", entree:"In", sortie:"Out", erreurs:"Error examples", ligne:"Row", cause:"Cause", accepter:"Import valid rows only",
    profil:"Save this mapping as", relancer:"Analyse again", importer:"Import", confirmer:"Import {n} item(s)? It can be undone from the history.",
    termine:"Import complete", lot:"Batch", annulerLot:"Undo this import", nouveau:"New import", annule:"Import undone: {n} item(s) restored.", statut:"Status", date:"Date", source:"Source", par:"By",
    s_termine:"Completed", s_annule:"Undone", s_en_cours:"Running", rien:"No import yet.", profilTrouve:"Mapping “{n}” reused automatically.", formulaire:"Forms"},
  ar:{cleSal:"تحديد العون بواسطة", cleMat:"رقم تسجيله", cleBadge:"رقم شارته", cleH:"الشارة: العمود المربوط بـ«رقم التسجيل» يحتوي رقم البطاقة، وتُهمل الأصفار في البداية (000710103 = 710103).", rienImporte:"لم يتم استيراد أي بيانات", revoirCorresp:"مراجعة المطابقة", voirDonnees:"عرض البيانات المستوردة", rechargerH:"يُعاد تحميل التطبيق لعرض البيانات المستوردة (بضع ثوان).", toutCreer:"إنشاء الكل في FIWAKTI ({n})", toutIgnorer:"تجاهل الكل", toutAffecter:"إسناد كل القيم إلى…", cheminH:"المسارات «A\\B\\C» أو «A / B / C» تبني الهيكل التنظيمي مستوى بمستوى.", detailVal:"عرض وتعديل كل قيمة", toutCreerOk:"سيتم إنشاء {n} قيمة عند الاستيراد.", toutIgnorerOk:"تم تجاهل {n} قيمة.", choisirJeu:"تمت قراءة عدة مجموعات بيانات: انقروا على المجموعة المراد استيرادها.", formatInconnu:"«{n}»: ليس ملف بيانات معروفا ولا قاعدة SQLite ولا أرشيف ZIP. صدّروا البيانات من البرنامج الأصلي (Excel أو CSV).", baseDeposee:"تم إيداع القاعدة «{n}» ({t} م.ب): اختاروا الجدول المراد استرجاعه.", defauts:"أعوان جدد دون قيمة في المصدر", defautsH:"اختاروا صراحة الرزنامة (إلزامي) وإن شئتم الموقع والمصلحة للأعوان الجدد الذين لا يحددها المصدر، ثم أعيدوا التحليل.", defautChoisir:"— للاختيار —", defautVide:"اتركه فارغا", defCal:"الرزنامة", defSite:"الموقع", defDept:"المصلحة", c_journees:"أنواع الأيام", c_calendriers:"التقاويم", c_formules:"الصيغ الحسابية", r_journee:"أنواع الأيام", repos:"راحة", elements:"العناصر المستوردة", et_creer:"للإنشاء", et_maj:"للتحديث", et_conflit:"موجودة بصيغة أخرى: لم تستبدل", remplacer:"استبدال الصيغ الموجودة بنفس الرمز", ordre:"الترتيب المقترح: أنواع الأيام ثم التقاويم ثم الأجراء ثم التسجيلات.", titre:"ترحيل البيانات", lede:"استرجع بيانات برنامجك الحالي: ملفات أو مجلدات أو استمارات PDF أو قاعدة بيانات، مع تحليل كامل قبل أي كتابة.",
    e1:"المصدر", e2:"البيانات المقروءة", e3:"المطابقة", e4:"التحليل", e5:"الاستيراد", histo:"سجل الاستيراد",
    fichiers:"ملفات أو مجلد أو استمارات", base:"قاعدة بيانات", choisirFichiers:"اختيار ملفات", choisirDossier:"اختيار مجلد", formats:"CSV أو Excel أو JSON أو XML أو PDF بحقول أو SQLite أو أرشيف ZIP لمجلد كامل. لا تتم أي كتابة في هذه المرحلة.",
    lecture:"جار القراءة…", type:"نوع القاعدة", hote:"الخادم", port:"المنفذ", nomBase:"القاعدة", utilisateur:"المستخدم", mdp:"كلمة المرور", ssl:"اتصال مشفر", tester:"الاتصال وعرض الجداول",
    table:"الجدول", requete:"أو استعلام قراءة (SELECT)", limite:"أقصى عدد أسطر", lire:"قراءة البيانات", mdpNonGarde:"تستعمل كلمة المرور للقراءة فقط ولا تحفظ أبدا.",
    sqlAbsent:"مكون SQL Server غير مثبت.", lignes:"سطر", colonnes:"عمود", cible:"هذه البيانات هي", c_salaries:"الأجراء", c_badgeages:"التسجيلات",
    continuer:"متابعة", retour:"رجوع", apercu:"معاينة", champ:"حقل FIWAKTI", colonneSource:"عمود المصدر", aucune:"— غير مستورد —", obligatoire:"إلزامي",
    fmtDate:"صيغة التواريخ", auto:"تلقائي", dmy:"يي/شش/سسسس", mdy:"شش/يي/سسسس", excel:"رقم Excel", zeros:"إكمال المعرف إلى (أرقام)", analyser:"تحليل (بدون كتابة)",
    a_creer:"للإنشاء", a_maj:"للتحديث", a_inch:"دون تغيير", a_err:"أخطاء", a_ign:"مكررات متجاهلة", a_clot:"فترة مغلقة", refsInconnues:"قيم غير معروفة في FIWAKTI",
    r_site:"المواقع", r_dept:"المصالح", r_calendrier:"التقاويم", ignorer:"تجاهل هذه القيمة", creerRef:"إنشاء في FIWAKTI", choisirExistant:"يطابق…", calInfo:"«إنشاء» يضيف التقويم باسمه فقط ودون أوقات عمل (للإكمال): أدخلوا أوقاته لاحقا في الوقت والحضور › التقاويم، وتُحدَّث حسابات الأعوان فورا. يمكنكم أيضا ربطه بتقويم موجود.",
    sensInconnus:"رموز اتجاه غير معروفة", entree:"دخول", sortie:"خروج", erreurs:"أمثلة الأخطاء", ligne:"السطر", cause:"السبب", accepter:"استيراد الأسطر الصحيحة فقط",
    profil:"حفظ هذه المطابقة باسم", relancer:"إعادة التحليل", importer:"استيراد", confirmer:"تأكيد استيراد {n} عنصر؟ يمكن إلغاؤه من السجل.",
    termine:"انتهى الاستيراد", lot:"الدفعة", annulerLot:"إلغاء هذا الاستيراد", nouveau:"استيراد جديد", annule:"ألغي الاستيراد: استرجع {n} عنصر.", statut:"الحالة", date:"التاريخ", source:"المصدر", par:"بواسطة",
    s_termine:"منتهي", s_annule:"ملغى", s_en_cours:"جار", rien:"لا استيراد بعد.", profilTrouve:"استعملت المطابقة «{n}» تلقائيا.", formulaire:"استمارات"}
};
/* correctif 33 : libellés des champs, encodage, rapport, annulation, statuts */
Object.assign(L.fr, {champ_mat:"Matricule", champ_nom:"Nom", champ_prenom:"Prénom", champ_cin:"CIN", champ_naissance:"Date de naissance", champ_entree:"Date d'entrée", champ_sortie:"Date de sortie", champ_email:"Adresse électronique", champ_tel:"Téléphone", champ_badge:"Badge", champ_pin:"Code PIN", champ_site:"Site", champ_dept:"Service", champ_calendrier:"Calendrier", champ_poste:"Poste", champ_horodatage:"Date et heure", champ_date:"Date", champ_heure:"Heure", champ_sens:"Sens", champ_terminal:"Terminal", champ_code:"Code", champ_plages:"Plages", champ_debut:"Début", champ_fin:"Fin", champ_pause:"Pause", champ_theorique:"Durée théorique", champ_tolEntree:"Tolérance entrée", champ_tolSortie:"Tolérance sortie", champ_nuit:"Nuit", champ_lundi:"Lundi", champ_mardi:"Mardi", champ_mercredi:"Mercredi", champ_jeudi:"Jeudi", champ_vendredi:"Vendredi", champ_samedi:"Samedi", champ_dimanche:"Dimanche", champ_journee:"Journée", champ_formule:"Formule", champ_unite:"Unité", champ_periode:"Période", champ_agregation:"Agrégation",
  encodage:"Encodage des fichiers texte", enc_auto:"Automatique", enc_1256:"Arabe Windows (1256)", enc_1252:"Occidental Windows (1252)", vider:"Vider un champ existant quand la cellule de la source est vide", importEnCours:"Import en cours…", ecrits:"Écrits", refusImport:"Refusés par les contrôles", rapportCsv:"Télécharger le rapport (CSV)", annuleTitre:"Import annulé", annuleMsg:"{n} élément(s) rétabli(s), {c} conservé(s).", annulerConf:"Annuler l'import « {s} » du {d} ({t}) ? Les éléments créés seront supprimés (via la corbeille) et les fiches modifiées rétablies ; une fiche modifiée depuis l'import est conservée telle quelle.", annulerOk:"Annuler l'import", fermer:"Fermer", s_interrompu:"Interrompu", s_annule_partiel:"Annulé en partie", s_echec:"Refusé", demoMig:"Démonstration : la migration des données nécessite le serveur FIWAKTI.", expire:"Les données lues ont expiré (2 h) ou le serveur a redémarré : relisez la source.", conserves:"Conservés"});
Object.assign(L.en, {champ_mat:"Employee ID", champ_nom:"Last name", champ_prenom:"First name", champ_cin:"ID card", champ_naissance:"Date of birth", champ_entree:"Hire date", champ_sortie:"Leave date", champ_email:"Email", champ_tel:"Phone", champ_badge:"Badge", champ_pin:"PIN", champ_site:"Site", champ_dept:"Department", champ_calendrier:"Calendar", champ_poste:"Position", champ_horodatage:"Date and time", champ_date:"Date", champ_heure:"Time", champ_sens:"Direction", champ_terminal:"Terminal", champ_code:"Code", champ_plages:"Time ranges", champ_debut:"Start", champ_fin:"End", champ_pause:"Break", champ_theorique:"Expected duration", champ_tolEntree:"Late tolerance", champ_tolSortie:"Early-leave tolerance", champ_nuit:"Night", champ_lundi:"Monday", champ_mardi:"Tuesday", champ_mercredi:"Wednesday", champ_jeudi:"Thursday", champ_vendredi:"Friday", champ_samedi:"Saturday", champ_dimanche:"Sunday", champ_journee:"Day type", champ_formule:"Formula", champ_unite:"Unit", champ_periode:"Period", champ_agregation:"Aggregation",
  encodage:"Text file encoding", enc_auto:"Automatic", enc_1256:"Arabic Windows (1256)", enc_1252:"Western Windows (1252)", vider:"Clear an existing field when the source cell is empty", importEnCours:"Import running…", ecrits:"Written", refusImport:"Refused by checks", rapportCsv:"Download the report (CSV)", annuleTitre:"Import undone", annuleMsg:"{n} item(s) restored, {c} kept.", annulerConf:"Undo the import “{s}” of {d} ({t})? Created items are deleted (via the recycle bin) and modified records restored; a record changed since the import is kept as is.", annulerOk:"Undo the import", fermer:"Close", s_interrompu:"Interrupted", s_annule_partiel:"Partly undone", s_echec:"Refused", demoMig:"Demo: data migration needs the FIWAKTI server.", expire:"The data read has expired (2 h) or the server restarted: read the source again.", conserves:"Kept"});
Object.assign(L.ar, {champ_mat:"المعرّف", champ_nom:"اللقب", champ_prenom:"الاسم", champ_cin:"بطاقة التعريف", champ_naissance:"تاريخ الولادة", champ_entree:"تاريخ الانتداب", champ_sortie:"تاريخ الخروج", champ_email:"البريد الإلكتروني", champ_tel:"الهاتف", champ_badge:"الشارة", champ_pin:"الرمز السري", champ_site:"الموقع", champ_dept:"المصلحة", champ_calendrier:"الرزنامة", champ_poste:"الوظيفة", champ_horodatage:"التاريخ والساعة", champ_date:"التاريخ", champ_heure:"الساعة", champ_sens:"الاتجاه", champ_terminal:"آلة التأشير", champ_code:"الرمز", champ_plages:"الفترات", champ_debut:"البداية", champ_fin:"النهاية", champ_pause:"الاستراحة", champ_theorique:"المدة النظرية", champ_tolEntree:"تسامح الدخول", champ_tolSortie:"تسامح الخروج", champ_nuit:"ليلي", champ_lundi:"الاثنين", champ_mardi:"الثلاثاء", champ_mercredi:"الأربعاء", champ_jeudi:"الخميس", champ_vendredi:"الجمعة", champ_samedi:"السبت", champ_dimanche:"الأحد", champ_journee:"اليوم النموذجي", champ_formule:"الصيغة", champ_unite:"الوحدة", champ_periode:"الفترة", champ_agregation:"التجميع",
  encodage:"ترميز الملفات النصية", enc_auto:"آلي", enc_1256:"عربي ويندوز (1256)", enc_1252:"غربي ويندوز (1252)", vider:"إفراغ حقل موجود عندما تكون خانة المصدر فارغة", importEnCours:"جارٍ التوريد…", ecrits:"المكتوبة", refusImport:"مرفوضة من المراقبة", rapportCsv:"تنزيل التقرير (CSV)", annuleTitre:"تم إلغاء التوريد", annuleMsg:"تمت استعادة {n} عنصر، والإبقاء على {c}.", annulerConf:"إلغاء توريد «{s}» بتاريخ {d} ({t})؟ تُحذف العناصر المنشأة (عبر سلة المحذوفات) وتُستعاد البطاقات المعدّلة؛ وتبقى البطاقة المعدّلة منذ التوريد كما هي.", annulerOk:"إلغاء التوريد", fermer:"إغلاق", s_interrompu:"متوقف", s_annule_partiel:"ملغى جزئيا", s_echec:"مرفوض", demoMig:"عرض توضيحي: ترحيل البيانات يتطلب خادم FIWAKTI.", expire:"انتهت صلاحية البيانات المقروءة (ساعتان) أو أعيد تشغيل الخادم: أعد قراءة المصدر.", conserves:"المُبقاة"});
const T = (c, k) => (L[c.lang] || L.fr)[k] || L.fr[k] || k;
const dateHeure = (ctx, iso) => { const d = new Date(iso); if (isNaN(d)) return String(iso || ""); const z = n => String(n).padStart(2, "0"); return ctx.dateAff(d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate()))+" "+z(d.getHours())+":"+z(d.getMinutes()); };
const enDemo = () => { try { return typeof DEMO !== "undefined" && !!DEMO; } catch(e){ return false; } };
/* progression gardée pendant la session (changer d'écran ou recharger ne ramène plus à l'étape 1) */
const CLE_ETAT = "fwm-etat-v1", GARDE = ["etape", "onglet", "jeux", "jeu", "cible", "mapping", "tr", "corr", "creer", "defauts", "cleSalarie", "remplacer", "accepter", "profil", "enc"];
const val = id => ((document.getElementById(id)||{}).value || "").trim();
const lireB64 = f => new Promise((ok, ko)=>{ const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => ko(new Error(f.name)); r.readAsDataURL(f); });
const EXT = /\.(csv|txt|tsv|xlsx|xls|xlsm|ods|json|xml|pdf|zip|sqlite|sqlite3|db|sl3|s3db|db3|sdb)$/i, BASE = /\.(sqlite|sqlite3|db|sl3|s3db|db3|sdb)$/i;
function S(ctx){ const E = ctx.etat; if (!E.init){ Object.assign(E, {init:true, etape:1, onglet:"fichiers", jeux:[], cible:"salaries", mapping:{}, tr:{date:"", zeros:"", sens:{}}, corr:{site:{}, dept:{}, calendrier:{}, journee:{}}, creer:{site:[], dept:[]},
  base:{type:"postgres", hote:"", port:"", base:"", utilisateur:"", ssl:false, limite:"200000"}, tables:null, bases:[], erreurs:[]});
  try { const g = JSON.parse(sessionStorage.getItem(CLE_ETAT) || "null"); if (g && g.etape >= 2 && g.etape <= 4 && g.jeu) Object.assign(E, g, {etape:g.etape === 4 ? 3 : g.etape}); } catch(e){} } return E; }
function garderEtat(E){ try { const g = {}; GARDE.forEach(k=>{ if (E[k] !== undefined) g[k] = E[k]; }); sessionStorage.setItem(CLE_ETAT, JSON.stringify(g)); } catch(e){} }
/* 1.1.2 : un fichier d'extension inconnue (.bck, .mov de Netime…) est reconnu à sa signature : base SQLite ou archive ZIP */
const signature = f => new Promise(ok=>{ const r = new FileReader(); r.onload = () => { const b = new Uint8Array(r.result), t = String.fromCharCode.apply(null, Array.from(b));
  ok(t.indexOf("SQLite format 3") === 0 ? "sqlite" : (b[0] === 0x50 && b[1] === 0x4B) ? "zip" : ""); }; r.onerror = () => ok(""); r.readAsArrayBuffer(f.slice(0, 16)); });
async function envoyerFichiers(ctx, liste){
  const E = S(ctx), tous = Array.from(liste), fs = [];
  for (const f of tous){ if (EXT.test(f.name)){ fs.push(f); continue; } const sg = await signature(f);
    if (sg === "sqlite") fs.push(new File([f], f.name+".sqlite")); else if (sg === "zip") fs.push(new File([f], f.name+".zip")); }
  if (!fs.length) return ctx.flash(T(ctx, "formatInconnu").replace("{n}", tous.map(f=>f.name).join(", ")), "err");
  if (enDemo()) return ctx.flash(T(ctx, "demoMig"), "warn");
  E.charge = true; ctx.rendre();
  /* 56.33.3 : une base SQLite (.sl3 Netime, .sqlite, .db…) est envoyée telle quelle, sans limite de 60 Mo */
  const base = fs.find(f=>BASE.test(f.name));
  if (base) { try { const r = await fetch("api/v1/migration/depot-base", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/octet-stream", "X-Nom-Fichier":encodeURIComponent(base.name), "X-CSRF":(window.CSRF_JETON||"")}, body:base});
      const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j.message || ("HTTP "+r.status));
      E.bases = j.basesSqlite; E.erreurs = []; E.charge = false; E.onglet = "base"; E.base = Object.assign({}, E.base, {type:"sqlite", fichier:E.bases[0], nomOrigine:base.name}); E.tables = null; ctx.flash(T(ctx, "baseDeposee").replace("{n}", base.name).replace("{t}", Math.round(j.taille/1048576)), "ok"); return ctx.rendre(); }
    catch(e){ E.charge = false; ctx.flash(e.message, "err"); return ctx.rendre(); } }
  try { const fichiers = []; for (const f of fs) fichiers.push({nom:f.webkitRelativePath || f.name, contenu:await lireB64(f)});
    const j = await ctx.api("api/v1/migration/fichiers", {corps:{fichiers, encodage:E.enc || ""}});
    E.jeux = j.jeux; E.erreurs = j.erreurs || []; E.bases = j.basesSqlite || []; E.charge = false;
    /* 1.1.5 : un seul jeu lu → il est sélectionné d'office (l'écran semblait bloqué en attendant un clic sur la carte) */
    E.jeu = E.jeux.length === 1 ? E.jeux[0] : null;
    if (E.bases.length){ E.onglet = "base"; E.base = Object.assign({}, E.base, {type:"sqlite", fichier:E.bases[0]}); E.tables = null; }
    else E.etape = 2; ctx.rendre();
  } catch(e){ E.charge = false; ctx.flash(e.message, "err"); ctx.rendre(); }
}
function vueSource(ctx){
  const E = S(ctx), h = s => ctx.esc(s), P = E.par || {};
  const tabs = '<div class="fwm-modes">'+["fichiers", "base", "histo"].map(o=>'<button type="button" class="fwm-f'+(E.onglet === o ? ' on' : '')+'" data-act="fwm:onglet" data-o="'+o+'">'+h(T(ctx, o))+'</button>').join("")+'</div>';
  if (E.onglet === "histo") return tabs+vueHisto(ctx);
  if (E.onglet === "fichiers") return tabs+'<div class="fw-card fw-u-p fwm-depot"><p>'+h(T(ctx, "formats"))+'</p>'+
    '<button type="button" class="fw-btn pri" data-act="fwm:choisir" data-i="fwmIn1">'+h(T(ctx, "choisirFichiers"))+'</button><input id="fwmIn1" type="file" multiple hidden data-fwmc="fichiers" accept="*/*"> '+
    '<button type="button" class="fw-btn" data-act="fwm:choisir" data-i="fwmIn2">'+h(T(ctx, "choisirDossier"))+'</button><input id="fwmIn2" type="file" hidden webkitdirectory data-fwmc="fichiers">'+
    ' <label>'+h(T(ctx, "encodage"))+' <select id="fwmEnc" data-fwmc="enc">'+[["", "enc_auto"], ["utf-8", "UTF-8"], ["windows-1256", "enc_1256"], ["windows-1252", "enc_1252"]].map(([v, l])=>'<option value="'+v+'"'+((E.enc||"") === v ? ' selected' : '')+'>'+h(T(ctx, l))+'</option>').join("")+'</select></label>'+
    (E.charge ? '<p class="fw-hint" aria-busy="true">'+h(T(ctx, "lecture"))+'</p>' : '')+
    (E.erreurs.length ? '<div class="fw-note warn">'+E.erreurs.map(h).join("<br>")+'</div>' : '')+'</div>';
  const b = E.base, champ = (k, lab, type) => '<label>'+h(T(ctx, lab))+' <input id="fwmB-'+k+'" type="'+(type||"text")+'" value="'+h(b[k]||"")+'" autocomplete="off"></label>';
  return tabs+'<div class="fw-card fw-u-p"><div class="fwm-ligne"><label>'+h(T(ctx, "type"))+' <select id="fwmB-type" data-fwmc="btype">'+[["postgres", "PostgreSQL"], ["mysql", "MySQL / MariaDB"], ["mssql", "SQL Server"], ["sqlite", "SQLite"]]
      .map(([v, l])=>'<option value="'+v+'"'+(b.type === v ? ' selected' : '')+'>'+l+'</option>').join("")+'</select></label>'+
    (b.type === "sqlite" ? '<span class="fw-hint">'+h(b.nomOrigine || (b.fichier ? b.fichier.split(/[\\/]/).pop() : T(ctx, "formats")))+'</span>' : champ("hote", "hote")+champ("port", "port")+champ("base", "nomBase")+champ("utilisateur", "utilisateur")+champ("mdp", "mdp", "password")+
      '<label class="fwm-chk"><input type="checkbox" id="fwmB-ssl"'+(b.ssl ? ' checked' : '')+'> '+h(T(ctx, "ssl"))+'</label>')+'</div>'+
    (b.type === "mssql" && P.sqlserver === false ? '<div class="fw-note warn">'+h(T(ctx, "sqlAbsent"))+'</div>' : '')+
    '<p class="fw-hint">'+h(T(ctx, "mdpNonGarde"))+'</p><button class="fw-btn" data-act="fwm:tables">'+h(T(ctx, "tester"))+'</button>'+
    (E.tables ? '<div class="fwm-ligne"><label>'+h(T(ctx, "table"))+' <select id="fwmB-table" data-fwmc="table"><option value=""></option>'+E.tables.map(x=>'<option value="'+h(x)+'"'+(b.table === x ? ' selected' : '')+'>'+h(x)+'</option>').join("")+'</select></label>'+
      '<label class="fwm-grand">'+h(T(ctx, "requete"))+' <textarea id="fwmB-req" data-fwmc="req" rows="2">'+h(b.req||"")+'</textarea></label><label>'+h(T(ctx, "limite"))+' <input id="fwmB-limite" type="number" value="'+h(b.limite)+'"></label></div>'+
      '<button class="fw-btn pri" data-act="fwm:lire">'+h(T(ctx, "lire"))+'</button>' : '')+(E.charge ? '<p class="fw-hint" aria-busy="true">'+h(T(ctx, "lecture"))+'</p>' : '')+'</div>';
}
function vueJeux(ctx){
  const E = S(ctx), h = s => ctx.esc(s);
  return (!E.jeu && E.jeux.length > 1 ? '<p class="fw-note">'+h(T(ctx, "choisirJeu"))+'</p>' : '')+'<div class="fwm-jeux">'+E.jeux.map(j=>'<button type="button" class="fwm-jeu'+(E.jeu && E.jeu.id === j.id ? ' on' : '')+'" data-act="fwm:jeu" data-id="'+h(j.id)+'"><strong>'+h(j.nom)+'</strong>'+
    '<span class="fw-hint">'+j.nb+' '+h(T(ctx, "lignes"))+' · '+j.colonnes.length+' '+h(T(ctx, "colonnes"))+(j.formulaire ? ' · '+h(T(ctx, "formulaire")) : '')+'</span></button>').join("")+'</div>'+
    (E.jeu ? '<div class="fwm-ligne"><label>'+h(T(ctx, "cible"))+' <select id="fwmCible">'+["salaries", "badgeages", "journees", "calendriers", "formules"].map(c=>'<option value="'+c+'"'+(E.cible === c ? ' selected' : '')+'>'+h(T(ctx, "c_"+c))+'</option>').join("")+'</select></label><span class="fw-hint">'+h(T(ctx, "ordre"))+'</span></div>'+apercu(ctx, E.jeu)+
      '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:etape" data-e="1">'+h(T(ctx, "retour"))+'</button><button class="fw-btn pri" data-act="fwm:vers3">'+h(T(ctx, "continuer"))+'</button></div>' : '');
}
function apercu(ctx, j){ const h = s => ctx.esc(s), cols = j.colonnes.slice(0, 12);
  return '<div class="fw-sec">'+h(T(ctx, "apercu"))+'</div><div class="fw-tablewrap"><table class="fw-tbl fwm-ap"><thead><tr>'+cols.map(c=>'<th>'+h(c)+'</th>').join("")+'</tr></thead><tbody>'+
    j.apercu.slice(0, 8).map(r=>'<tr>'+cols.map(c=>'<td>'+h(r[c])+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'; }
function vueMapping(ctx){
  const E = S(ctx), h = s => ctx.esc(s), champs = (E.par.cibles||{})[E.cible] || [];
  return (E.profilNom ? '<div class="fw-note ok">'+h(T(ctx, "profilTrouve").replace("{n}", E.profilNom))+'</div>' : '')+
    '<div class="fw-tablewrap"><table class="fw-tbl"><thead><tr><th>'+h(T(ctx, "champ"))+'</th><th>'+h(T(ctx, "colonneSource"))+'</th><th>'+h(T(ctx, "apercu"))+'</th></tr></thead><tbody>'+
    champs.map(c=>{ const col = E.mapping[c.champ] || "", lib = T(ctx, "champ_"+c.champ); return '<tr><td><strong>'+h(lib)+'</strong>'+(c.obligatoire ? ' <span class="fw-tag">'+h(T(ctx, "obligatoire"))+'</span>' : '')+'</td>'+
      '<td><select data-fwmc="map" data-c="'+h(c.champ)+'" aria-label="'+h(T(ctx, "colonneSource")+" — "+lib)+'"><option value="">'+h(T(ctx, "aucune"))+'</option>'+E.jeu.colonnes.map(x=>'<option'+(x === col ? ' selected' : '')+'>'+h(x)+'</option>').join("")+'</select></td>'+
      '<td class="fw-sm">'+h(col ? E.jeu.apercu.slice(0, 3).map(r=>r[col]).filter(Boolean).join(" · ") : "")+'</td></tr>'; }).join("")+'</tbody></table></div>'+
    '<div class="fwm-ligne"><label>'+h(T(ctx, "fmtDate"))+' <select id="fwmDate">'+[["", "auto"], ["dmy", "dmy"], ["mdy", "mdy"], ["excel", "excel"]].map(([v, l])=>'<option value="'+v+'"'+(E.tr.date === v ? ' selected' : '')+'>'+h(T(ctx, l))+'</option>').join("")+'</select></label>'+
    '<label>'+h(T(ctx, "zeros"))+' <input id="fwmZeros" type="number" min="0" max="20" value="'+h(E.tr.zeros||"")+'"></label>'+
    (E.cible === "salaries" ? '<label class="fwm-chk"><input type="checkbox" id="fwmVider"'+(E.tr.vider ? ' checked' : '')+'> '+h(T(ctx, "vider"))+'</label>' : '')+'</div>'+
    '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:etape" data-e="2">'+h(T(ctx, "retour"))+'</button><button class="fw-btn pri" data-act="fwm:analyser">'+h(T(ctx, "analyser"))+'</button></div>';
}
function vueAnalyse(ctx){
  const E = S(ctx), A = E.analyse, h = s => ctx.esc(s), P = E.par;
  if (!A) return '<p class="fw-hint" aria-busy="true">'+h(T(ctx, "lecture"))+'</p>';
  const tuile = (k, n, cl) => '<div class="fwm-t '+(cl||"")+'"><b>'+n+'</b><span>'+h(T(ctx, k))+'</span></div>';
  let o = '<div class="fwm-tuiles">'+tuile("a_creer", A.creer, "ok")+tuile("a_maj", A.maj)+tuile("a_inch", A.inchanges)+tuile("a_ign", A.ignores)+tuile("a_clot", A.cloture, A.cloture ? "warn" : "")+tuile("a_err", A.erreurs, A.erreurs ? "err" : "")+'</div>';
  if ((A.elements||[]).length) o += '<div class="fw-sec">'+h(T(ctx, "elements"))+'</div><div class="fw-tablewrap"><table class="fw-tbl"><tbody>'+A.elements.map(x=>'<tr><td><strong>'+h(x.code)+'</strong>'+(x.nom && x.nom !== x.code ? '<div class="fw-hint">'+h(x.nom)+'</div>' : '')+'</td><td class="fw-mono fw-sm">'+h(x.detail)+'</td><td><span class="fwm-et fwm-et-'+x.etat+'">'+h(T(ctx, "et_"+x.etat))+'</span></td></tr>').join("")+'</tbody></table></div>';
  const refs = ["site", "dept", "calendrier", "journee"].filter(k=>(A.refsInconnues[k]||[]).length);
  if (refs.length){ o += '<div class="fw-sec">'+h(T(ctx, "refsInconnues"))+'</div>';
    refs.forEach(k=>{ const coll = {site:"sites", dept:"depts", calendrier:"cals", journee:"jours"}[k], ex = ((P.ref && P.ref[coll]) || []).concat(k === "journee" ? [{id:"repos", nom:T(ctx, "repos")}] : []);
      const nv = A.refsInconnues[k].length;
      o += '<h3 class="fwm-h3">'+h(T(ctx, "r_"+k))+' <span class="fw-hint">('+nv+')</span></h3>'+(k === "calendrier" ? '<p class="fw-hint">'+h(T(ctx, "calInfo"))+'</p>' : '')+
        /* 1.1.6 : une seule décision pour toutes les valeurs d'un même type (avant : une liste à régler valeur par valeur) */
        '<div class="fwm-ligne" style="gap:6px">'+(k !== "journee" ? '<button type="button" class="fw-btn sm pri" data-act="fwm:toutCreer" data-k="'+k+'">'+h(T(ctx, "toutCreer").replace("{n}", nv))+'</button>' : '')+
        (k === "calendrier" && ex.length ? '<select data-fwmc="toutCal" data-k="'+k+'"><option value="">'+h(T(ctx, "toutAffecter"))+'</option>'+ex.map(x=>'<option value="'+h(x.id)+'">'+h(x.nom)+'</option>').join("")+'</select>' : '')+
        '<button type="button" class="fw-btn sm" data-act="fwm:toutIgnorer" data-k="'+k+'">'+h(T(ctx, "toutIgnorer"))+'</button>'+(k === "dept" ? '<span class="fw-hint">'+h(T(ctx, "cheminH"))+'</span>' : '')+'</div>'+
        '<details'+(nv <= 15 ? ' open' : '')+'><summary class="fw-hint">'+h(T(ctx, "detailVal"))+'</summary><table class="fw-tbl"><tbody>'+A.refsInconnues[k].map(r=>{ const cur = E.corr[k][r.valeur] || (E.creer[k]||[]).indexOf(r.valeur) >= 0 && "__creer" || "";
        return '<tr><td><strong>'+h(r.valeur)+'</strong> <span class="fw-hint">('+r.lignes+')</span></td><td><select data-fwmc="corr" data-k="'+k+'" data-v="'+h(r.valeur)+'"><option value="">'+h(T(ctx, "choisirExistant"))+'</option>'+
          ex.map(x=>'<option value="'+h(x.id)+'"'+(cur === x.id ? ' selected' : '')+'>'+h(x.nom)+'</option>').join("")+(k !== "journee" ? '<option value="__creer"'+(cur === "__creer" ? ' selected' : '')+'>'+h(T(ctx, "creerRef"))+'</option>' : '')+
          '<option value="__ignorer"'+(cur === "__ignorer" ? ' selected' : '')+'>'+h(T(ctx, "ignorer"))+'</option></select></td></tr>'; }).join("")+'</tbody></table></details>'; }); }
  if ((A.sensInconnus||[]).length){ o += '<div class="fw-sec">'+h(T(ctx, "sensInconnus"))+'</div><table class="fw-tbl"><tbody>'+A.sensInconnus.map(r=>'<tr><td><strong>'+h(r.valeur)+'</strong> <span class="fw-hint">('+r.lignes+')</span></td><td><select data-fwmc="sens" data-v="'+h(r.valeur)+'"><option value=""></option><option value="E"'+(E.tr.sens[r.valeur] === "E" ? ' selected' : '')+'>'+h(T(ctx, "entree"))+'</option><option value="S"'+(E.tr.sens[r.valeur] === "S" ? ' selected' : '')+'>'+h(T(ctx, "sortie"))+'</option></select></td></tr>').join("")+'</tbody></table>'; }
  if (A.exemplesErreurs && A.exemplesErreurs.length) o += '<details class="fwm-err"><summary>'+h(T(ctx, "erreurs"))+' ('+A.erreurs+')</summary><table class="fw-tbl"><thead><tr><th>'+h(T(ctx, "ligne"))+'</th><th>'+h(T(ctx, "cause"))+'</th></tr></thead><tbody>'+
    A.exemplesErreurs.map(x=>'<tr><td class="fw-mono">'+x.ligne+'</td><td>'+h(x.cause)+'</td></tr>').join("")+'</tbody></table></details>';
  /* 1.1.9 : badgeages — salarié identifié par son matricule ou par son numéro de badge */
  if (E.cible === "badgeages") o += '<div class="fw-sec">'+h(T(ctx, "cleSal"))+'</div><div class="fwm-ligne"><select data-fwmc="cleSalarie">'+
    [["matricule", T(ctx, "cleMat")], ["badge", T(ctx, "cleBadge")]].map(([v, l])=>'<option value="'+v+'"'+((E.cleSalarie||"matricule") === v ? ' selected' : '')+'>'+h(l)+'</option>').join("")+'</select><span class="fw-hint">'+h(T(ctx, "cleH"))+'</span></div>';
  /* v56.31 : nouveaux salariés sans calendrier, site ou service dans la source : choix explicite (rien n'est deviné) */
  if (E.cible === "salaries" && A.choix){ const D0 = E.defauts || (E.defauts = {});
    const sel = (k, l, lib) => '<label>'+h(lib)+' <select data-fwmc="defaut" data-k="'+k+'"><option value="">'+h(T(ctx, k === "calId" ? "defautChoisir" : "defautVide"))+'</option>'+
      l.map(x=>'<option value="'+h(x.id)+'"'+(D0[k] === x.id ? ' selected' : '')+'>'+h(x.nom)+'</option>').join("")+'</select></label>';
    o += '<div class="fw-sec">'+h(T(ctx, "defauts"))+'</div><p class="fw-hint">'+h(T(ctx, "defautsH"))+'</p><div class="fwm-ligne">'+
      sel("calId", A.choix.cals, T(ctx, "defCal"))+sel("siteId", A.choix.sites, T(ctx, "defSite"))+sel("deptId", A.choix.depts, T(ctx, "defDept"))+'</div>'; }
  const n = A.creer + A.maj;
  if (E.cible === "formules") o += '<div class="fwm-ligne"><label class="fwm-chk"><input type="checkbox" id="fwmRemplacer"'+(E.remplacer ? ' checked' : '')+' data-fwmc="remplacer"> '+h(T(ctx, "remplacer"))+'</label></div>';
  return o+'<div class="fwm-ligne"><label class="fwm-chk"><input type="checkbox" id="fwmAccepter"'+(E.accepter ? ' checked' : '')+'> '+h(T(ctx, "accepter"))+'</label><label>'+h(T(ctx, "profil"))+' <input id="fwmProfil" value="'+h(E.profil||"")+'"></label></div>'+
    '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:etape" data-e="3">'+h(T(ctx, "retour"))+'</button><button class="fw-btn" data-act="fwm:analyser">'+h(T(ctx, "relancer"))+'</button>'+
    '<button class="fw-btn pri" data-act="fwm:importer"'+(n && !E.charge ? '' : ' disabled')+(E.charge ? ' aria-busy="true"' : '')+'>'+h(E.charge ? T(ctx, "importEnCours") : T(ctx, "importer")+' ('+n+')')+'</button></div>';
}
function vueRapport(ctx){ const E = S(ctx), R = E.rapport, h = s => ctx.esc(s);
  if (R.annule) return '<div class="fw-note" role="status"><strong>'+h(T(ctx, "annuleTitre"))+'</strong> — '+h(T(ctx, "annuleMsg").replace("{n}", R.annule.retablis).replace("{c}", R.annule.conserves))+
    ((R.annule.motifs||[]).length ? '<ul>'+R.annule.motifs.slice(0, 10).map(x=>'<li>'+h(x)+'</li>').join("")+'</ul>' : '')+'</div><div class="fw-toolbar"><button class="fw-btn pri" data-act="fwm:nouveau">'+h(T(ctx, "nouveau"))+'</button></div>';
  /* 1.1.6 : rien n'avait été importé (aucun lot) → message clair au lieu d'un rapport « terminé » trompeur */
  if (!R.lot) return '<div class="fw-note warn" role="status"><strong>'+h(T(ctx, "rienImporte"))+'</strong> — '+h(T(ctx, "a_err"))+' : '+(R.erreurs||0)+
    ((R.exemplesErreurs||[]).length ? '<ul>'+R.exemplesErreurs.slice(0, 5).map(x=>'<li>'+h(T(ctx, "ligne"))+' '+x.ligne+' : '+h(x.cause)+'</li>').join("")+'</ul>' : '')+'</div>'+
    '<div class="fw-toolbar"><button class="fw-btn" data-act="fwm:etape" data-e="3">'+h(T(ctx, "revoirCorresp"))+'</button><button class="fw-btn pri" data-act="fwm:nouveau">'+h(T(ctx, "nouveau"))+'</button></div>';
  return '<div class="fw-note '+(R.refusImport ? 'warn' : 'ok')+'" role="status"><strong>'+h(T(ctx, "termine"))+'</strong> — '+h(T(ctx, "ecrits"))+' : '+(R.ecrits != null ? R.ecrits : R.creer + R.maj)+' · '+h(T(ctx, "refusImport"))+' : '+(R.refusImport||0)+' · '+h(T(ctx, "a_err"))+' : '+R.erreurs+(R.lot ? ' · '+h(T(ctx, "lot"))+' '+h(R.lot) : '')+'</div>'+
    ((R.exemplesErreurs||[]).length ? '<details class="fwm-err"><summary>'+h(T(ctx, "erreurs"))+' ('+R.exemplesErreurs.length+')</summary><table class="fw-tbl"><thead><tr><th>'+h(T(ctx, "ligne"))+'</th><th>'+h(T(ctx, "cause"))+'</th></tr></thead><tbody>'+R.exemplesErreurs.slice(0, 200).map(x=>'<tr><td class="fw-mono">'+(x.ligne||"")+'</td><td>'+h(x.cause)+'</td></tr>').join("")+'</tbody></table></details>' : '')+
    '<div class="fw-toolbar">'+(R.lot ? '<a class="fw-btn" href="api/v1/migration/lots/'+encodeURIComponent(R.lot)+'/rapport" download>'+h(T(ctx, "rapportCsv"))+'</a><button class="fw-btn" data-act="fwm:annuler" data-id="'+h(R.lot)+'" data-s="'+h((E.jeu||{}).nom||"")+'" data-t="'+h(T(ctx, "c_"+E.cible))+'">'+h(T(ctx, "annulerLot"))+'</button>' : '')+'<button class="fw-btn" data-act="fwm:nouveau">'+h(T(ctx, "nouveau"))+'</button>'+
    /* 1.1.6 : les données importées n'apparaissaient dans les écrans qu'après un rechargement que rien n'indiquait */
    '<button class="fw-btn pri" data-act="fwm:recharger">'+h(T(ctx, "voirDonnees"))+'</button></div><p class="fw-hint">'+h(T(ctx, "rechargerH"))+'</p>'; }
function vueHisto(ctx){ const E = S(ctx), h = s => ctx.esc(s);
  if (!E.lots){ ctx.api("api/v1/migration/lots").then(j=>{ E.lots = j.lignes; ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err")); return '<p class="fw-hint">…</p>'; }
  if (!E.lots.length) return '<div class="fw-empty">'+h(T(ctx, "rien"))+'</div>';
  return '<div class="fw-tablewrap"><table class="fw-tbl"><thead><tr><th>'+h(T(ctx, "date"))+'</th><th>'+h(T(ctx, "source"))+'</th><th>'+h(T(ctx, "cible"))+'</th><th>'+h(T(ctx, "a_creer"))+' / '+h(T(ctx, "a_maj"))+'</th><th>'+h(T(ctx, "statut"))+'</th><th>'+h(T(ctx, "par"))+'</th><th></th></tr></thead><tbody>'+
    E.lots.map(l=>'<tr><td>'+h(dateHeure(ctx, l.cree))+'</td><td>'+h(l.source||"")+'</td><td>'+h(T(ctx, "c_"+l.cible))+'</td><td class="fw-mono">'+h(l.stats ? l.stats.creer+" / "+l.stats.maj : "")+'</td><td>'+h(T(ctx, "s_"+l.statut))+'</td><td>'+h(l.par||"")+'</td>'+
      '<td style="white-space:nowrap">'+(l.statut !== "echec" ? '<a class="fw-btn sm" href="api/v1/migration/lots/'+encodeURIComponent(l.id)+'/rapport" download aria-label="'+h(T(ctx, "rapportCsv")+" — "+(l.source||""))+'">CSV</a> ' : '')+(l.statut === "termine" || l.statut === "interrompu" ? '<button class="fw-btn sm" data-act="fwm:annuler" data-id="'+h(l.id)+'" data-s="'+h(l.source||"")+'" data-d="'+h(dateHeure(ctx, l.cree))+'" data-t="'+h(T(ctx, "c_"+l.cible))+'" aria-label="'+h(T(ctx, "annulerLot")+" — "+(l.source||""))+'">'+h(T(ctx, "annulerLot"))+'</button>' : '')+'</td></tr>').join("")+'</tbody></table></div>'; }
function lireMapping(ctx){ const E = S(ctx); document.querySelectorAll('[data-fwmc="map"]').forEach(el=>{ if (el.value) E.mapping[el.dataset.c] = el.value; else delete E.mapping[el.dataset.c]; });
  if (document.getElementById("fwmDate")) E.tr.date = val("fwmDate"); if (document.getElementById("fwmZeros")) E.tr.zeros = val("fwmZeros"); if (document.getElementById("fwmVider")) E.tr.vider = !!document.getElementById("fwmVider").checked; }
function corpsAnalyse(ctx){ const E = S(ctx); return {jeu:E.jeu.id, cible:E.cible, mapping:E.mapping, transformations:E.tr, correspondances:E.corr, creerRefs:E.creer, remplacer:!!E.remplacer, defauts:E.defauts || {}, cleSalarie:E.cible === "badgeages" ? (E.cleSalarie || "matricule") : undefined}; }
FIWAKTI_MODULES.enregistrer({
  id:"FW-Migration",
  mount(ctx){ const E = S(ctx); ctx.api("api/v1/migration/cibles").then(j=>{ E.par = Object.assign({}, E.par, j); ctx.rendre(); }).catch(e=>ctx.flash(e.message, "err"));
    ctx.api("api/v1/donnees").then(d=>{ E.par = Object.assign({}, E.par, {ref:{sites:(d.ref||{}).sites||[], depts:(d.ref||{}).depts||[], cals:(d.ref||{}).cals||[], jours:(d.ref||{}).jours||[]}}); }).catch(()=>{}); },
  unmount(){},
  render(vue, ctx){
    const E = S(ctx), h = s => ctx.esc(s); garderEtat(E);
    const etapes = [1, 2, 3, 4, 5].map(n=>'<li class="'+(E.etape === n ? 'on' : E.etape > n ? 'fait' : '')+'"'+(E.etape === n ? ' aria-current="step"' : '')+'><span>'+n+'</span>'+h(T(ctx, "e"+n))+'</li>').join("");
    const corps = !E.par ? '<p class="fw-hint">…</p>' : E.etape === 1 ? vueSource(ctx) : E.etape === 2 ? vueJeux(ctx) : E.etape === 3 ? (apercu(ctx, E.jeu)+vueMapping(ctx)) : E.etape === 4 ? vueAnalyse(ctx) : vueRapport(ctx);
    return '<div class="fw-module fwm"><div class="fw-hero fw-hero-mod"><div class="fw-hero-main"><div class="fw-hero-kicker">'+ctx.esc(window.HERO_KICKER || "FIWAKTI")+'</div><h1>'+h(T(ctx, "titre"))+'</h1><p class="fw-hero-lede">'+h(T(ctx, "lede"))+'</p></div></div>'+
      '<ol class="fwm-etapes">'+etapes+'</ol><div class="fwm-corps">'+corps+'</div></div>';
  },
  async action(a, el, ctx){
    if (a === "choisir"){ const i = document.getElementById(el.dataset.i); if (i) i.click(); return; }
    if (a === "recharger"){ try { sessionStorage.setItem("fwk-vue-apres", S(ctx).cible === "badgeages" ? "ptg" : "emp"); } catch(e){} location.reload(); return; }
    if (a === "toutCreer" || a === "toutIgnorer"){ const E = S(ctx), k = el.dataset.k; if (document.getElementById("fwmAccepter")){ E.accepter = !!document.getElementById("fwmAccepter").checked; E.profil = val("fwmProfil"); } const l = ((E.analyse||{}).refsInconnues||{})[k] || []; E.creer[k] = E.creer[k] || []; E.corr[k] = E.corr[k] || {};
      l.forEach(r=>{ if (a === "toutCreer"){ E.corr[k][r.valeur] = "__creer"; if (E.creer[k].indexOf(r.valeur) < 0) E.creer[k].push(r.valeur); } else { E.corr[k][r.valeur] = "__ignorer"; E.creer[k] = E.creer[k].filter(x=>x !== r.valeur); } });
      ctx.flash(T(ctx, a === "toutCreer" ? "toutCreerOk" : "toutIgnorerOk").replace("{n}", l.length), "ok");
      /* nouvelle analyse aussitôt : le bouton « Importer » reflète les décisions prises */
      try { E.analyse = await ctx.api("api/v1/migration/analyser", {corps:corpsAnalyse(ctx)}); } catch(e){ ctx.flash(e.message, "err"); } return ctx.rendre(); }
    const E = S(ctx), ko = e => { E.charge = false; if (/expir/i.test(e.message)){ Object.assign(E, {etape:1, jeu:null, jeux:[], analyse:null}); try { sessionStorage.removeItem(CLE_ETAT); } catch(x){} ctx.flash(T(ctx, "expire"), "err"); return ctx.rendre(); } ctx.flash(e.message, "err"); ctx.rendre(); };
    if (a === "onglet"){ E.onglet = el.dataset.o; E.lots = null; return ctx.rendre(); }
    if (a === "etape"){ if (E.etape === 3) lireMapping(ctx); E.etape = Number(el.dataset.e); return ctx.rendre(); }
    if (a === "jeu"){ E.jeu = E.jeux.find(j=>j.id === el.dataset.id); return ctx.rendre(); }
    if (a === "tables" || a === "lire"){
      const b = E.base; ["hote", "port", "base", "utilisateur"].forEach(k=>{ if (document.getElementById("fwmB-"+k)) b[k] = val("fwmB-"+k); }); b.ssl = !!(document.getElementById("fwmB-ssl")||{}).checked;
      const c = Object.assign({}, b, {mdp:val("fwmB-mdp")}); if (a === "lire") b.limite = val("fwmB-limite") || b.limite;
      E.charge = true; ctx.rendre();
      try { const j = await ctx.api("api/v1/migration/base", {corps:a === "tables" ? {connexion:c, action:"tables"} : {connexion:Object.assign(c, {limite:b.limite}), table:val("fwmB-table") || b.table || "", requete:val("fwmB-req") || b.req || ""}});
        E.charge = false; if (a === "tables") E.tables = j.tables; else { E.jeux = j.jeux; E.jeu = j.jeux[0]; E.etape = 2; } ctx.rendre(); } catch(e){ ko(e); }
      return;
    }
    if (a === "vers3"){ E.cible = val("fwmCible") || E.cible;
      try { const j = await ctx.api("api/v1/migration/proposer", {corps:{jeu:E.jeu.id, cible:E.cible}}); E.mapping = j.mapping || {}; E.profilNom = j.profil ? j.profil.nom : "";
        if (j.profil){ E.tr = Object.assign({date:"", zeros:"", sens:{}}, j.profil.config.transformations || {}); E.corr = Object.assign({site:{}, dept:{}, calendrier:{}, journee:{}}, j.profil.config.correspondances || {}); }
        E.etape = 3; ctx.rendre(); } catch(e){ ko(e); }
      return;
    }
    if (a === "analyser"){ if (E.etape === 3) lireMapping(ctx); E.analyse = null; E.etape = 4; ctx.rendre();
      try { E.analyse = await ctx.api("api/v1/migration/analyser", {corps:corpsAnalyse(ctx)}); ctx.rendre(); } catch(e){ E.etape = 3; ko(e); }
      return;
    }
    if (a === "importer"){ if (E.charge) return; E.accepter = !!(document.getElementById("fwmAccepter")||{}).checked; E.profil = val("fwmProfil"); const n = E.analyse.creer + E.analyse.maj;
      const r = await ctx.confirmer({titre:T(ctx, "importer"), message:T(ctx, "confirmer").replace("{n}", n)}); if (!r.ok) return;
      E.charge = true; ctx.rendre();
      try { E.rapport = await ctx.api("api/v1/migration/importer", {corps:Object.assign(corpsAnalyse(ctx), {accepterErreurs:E.accepter, profil:E.profil || undefined})}); E.charge = false; E.etape = 5; E.lots = null; ctx.rendre(); } catch(e){ ko(e); }
      return;
    }
    if (a === "annuler"){ if (E.charge) return; const r = await ctx.confirmer({titre:T(ctx, "annulerLot"), message:T(ctx, "annulerConf").replace("{s}", el.dataset.s || el.dataset.id).replace("{d}", el.dataset.d || dateHeure(ctx, new Date().toISOString())).replace("{t}", el.dataset.t || ""), okLabel:T(ctx, "annulerOk"), danger:true}); if (!r.ok) return;
      E.charge = true; ctx.rendre();
      try { const j = await ctx.api("api/v1/migration/lots/"+encodeURIComponent(el.dataset.id)+"/annuler", {corps:{}}); E.charge = false; ctx.flash(T(ctx, "annuleMsg").replace("{n}", j.retablis).replace("{c}", j.conserves || 0), j.conserves ? "warn" : "ok"); E.lots = null; if (E.rapport && E.rapport.lot === el.dataset.id) E.rapport.annule = j; ctx.rendre(); } catch(e){ ko(e); }
      return;
    }
    if (a === "nouveau"){ const par = E.par; try { sessionStorage.removeItem(CLE_ETAT); } catch(e){} Object.keys(E).forEach(k=>delete E[k]); S(ctx); E.par = par; return ctx.rendre(); }
  },
  async change(k, el, ctx){
    if (k === "cleSalarie"){ const E = S(ctx); E.cleSalarie = el.value; E.analyse = null; ctx.rendre(); try { E.analyse = await ctx.api("api/v1/migration/analyser", {corps:corpsAnalyse(ctx)}); } catch(e){ ctx.flash(e.message, "err"); } return ctx.rendre(); }
    if (k === "toutCal"){ const E = S(ctx), l = ((E.analyse||{}).refsInconnues||{}).calendrier || []; E.corr.calendrier = E.corr.calendrier || {}; if (el.value) l.forEach(r=>{ E.corr.calendrier[r.valeur] = el.value; }); return ctx.rendre(); }
    /* 1.1.1 : table et requête retenues (un nouvel affichage de l'écran effaçait le choix : « Choisissez une table… ») */
    if (k === "table"){ S(ctx).base.table = el.value; return; }
    if (k === "req"){ S(ctx).base.req = el.value; return; }
    const E = S(ctx);
    if (k === "fichiers"){ const l = Array.from(el.files || []); el.value = ""; return envoyerFichiers(ctx, l); }
    if (k === "enc"){ E.enc = el.value; return; }
    if (k === "btype"){ E.base.type = el.value; E.tables = null; return ctx.rendre(); }
    if (k === "map"){ lireMapping(ctx); return ctx.rendre(); }
    if (k === "corr"){ const kk = el.dataset.k, v = el.dataset.v; E.creer[kk] = (E.creer[kk]||[]).filter(x=>x !== v); delete E.corr[kk][v];
      if (el.value === "__creer"){ E.creer[kk].push(v); E.corr[kk][v] = "__creer"; } else if (el.value) E.corr[kk][v] = el.value; return; }
    if (k === "remplacer"){ E.remplacer = el.checked; return; }
    if (k === "defaut"){ const D0 = E.defauts || (E.defauts = {}); if (el.value) D0[el.dataset.k] = el.value; else delete D0[el.dataset.k]; return; }
    if (k === "sens"){ if (el.value) E.tr.sens[el.dataset.v] = el.value; else delete E.tr.sens[el.dataset.v]; return; }
  }
});
})();
