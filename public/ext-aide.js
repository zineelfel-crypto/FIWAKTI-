/* FIWAKTI 56.31.1 — contenu de l'aide contextuelle (FR / EN / AR), chargé à la première ouverture de l'aide :
   environ 40 Ko de moins au démarrage de l'application. */
window.FWK_AIDE_L = (function(){ return {

fr: {
topics: [
  {id:"accueil", titre:"Démarrage rapide", tags:"start démarrer licence login"},
  {id:"nav", titre:"Navigation", tags:"menu écran module"},
  {id:"raccourcis", titre:"Raccourcis clavier", tags:"clavier ctrl k recherche globale palette"},
  {id:"employes", titre:"Employés & référentiel", tags:"matricule badge site département"},
  {id:"calendriers", titre:"Calendriers & horaires", tags:"journée type cycle repos férié"},
  {id:"pointage", titre:"Pointage", tags:"badgeage entrée sortie anomalie"},
  {id:"formules", titre:"Formules & arithmétiques", tags:"présence théorique HS formule variable"},
  {id:"etats", titre:"États & exports", tags:"rapport csv pdf période"},
  {id:"import", titre:"Import", tags:"excel csv mapping colonnes"},
  {id:"corbeille", titre:"Supprimer & restaurer", tags:"corbeille suppression annuler restaurer"},
  {id:"acces", titre:"Contrôle d'accès", tags:"zone porte planning anti-passback"},
  {id:"circuits", titre:"Demandes & circuits", tags:"congé validation workflow"},
  {id:"regles", titre:"Règles métier", tags:"sortie mutation automatisation"},
  {id:"securite", titre:"Sécurité & droits", tags:"profil mot de passe 2fa"},
  {id:"gaps", titre:"Limites actuelles", tags:"mobile geo erp sms 10000"}
],
ctx: {
  home:"Vue d'ensemble et raccourcis. Utilisez le menu latéral pour les modules.",
  dash:"Indicateurs direction : présence, absents, demandes, terminaux hors ligne.",
  anomalies:"Liste des écarts (badgeage impair, sans calendrier, terminal HS). Bouton Corriger.",
  wizard:"Assistant de premier paramétrage en 6 étapes.",
  emp:"Fiche employé = source de vérité. Une modification peut déclencher des règles métier.",
  sites:"Sites et rattachement aux conventions / périodes d'éléments variables.",
  org:"Organigramme (départements). Type « hors effectif » retire accès/bio automatiquement.",
  cal:"Grille annuelle : affectez journées types, repos, fériés.",
  jou:"Journées types = plages obligatoires, flex, pauses.",
  tt:"Types de temps (présence, absence, HS…) utilisés dans les formules.",
  arit:"Compteurs calculés par formules (variables PRESENCE, THEORIQUE, etc.).",
  etats:"États paramétrables + export CSV / texte / impression PDF.",
  ptg:"Pointages (simulation). Nombre impair de badgeages = sortie manquante.",
  import:"Téléchargez le modèle CSV, déposez le fichier, vérifiez l'aperçu ligne à ligne, associez les colonnes puis importez.",
  circuits:"Circuits de validation multi-niveaux pour les demandes.",
  dmd:"Demandes d'absence / mission en attente de validation.",
  regles:"Automatisations : sortie, mutation, hors effectif → actions modules.",
  journal:"Trace des règles exécutées (audit métier).",
  acces:"Droits d'accès par zones / portes / plannings.",
  zones:"Zones et portes du site.",
  profils:"Profils de droits par écran.",
  users:"Comptes de connexion liés éventuellement à un employé.",
  secu:"Politique de mots de passe, verrouillage, 2FA démo.",
  bio:"Empreintes / templates et files d'envoi/retrait terminaux (simulé).",
  term:"Terminaux de pointage / accès, état de communication.",
  mgr:"Portail manager : équipe du jour et validations rapides.",
  portal:"Espace collaborateur : pointages et demandes.",
  audit:"Qui / quand / quoi sur les automatisations.",
  champs:"Champs personnalisés employé (extensibles).",
  corbeille:"Éléments supprimés, restaurables pendant la durée fixée par l'administrateur (30 jours par défaut).",
  svg:"Sauvegardes et restauration du référentiel."
},
corps: {
  accueil: `<p><strong>FIWAKTI</strong> gère le référentiel RH, le temps de travail, le pointage et le contrôle d'accès.</p>
<ol>
<li>Activez la licence (client + clé) si demandé.</li>
<li>Connectez-vous (ex. <code>admin</code>).</li>
<li>Paramétrez <em>Sites → Organigramme → Employés → Calendriers → Terminaux</em>.</li>
<li>Utilisez l'<strong>Assistant de démarrage</strong> (menu Accueil) pour un parcours guidé.</li>
</ol>
<p>Icône <strong>?</strong> en bas à droite : cet assistant, disponible partout. <strong>Ctrl+K</strong> : recherche globale.</p>`,

  nav: `<p>Menu latéral groupé. <strong>Survol</strong> d'un groupe = sous-menu à côté (desktop). Mode réduit = icônes seules.</p>
<ul>
<li><strong>Accueil</strong> : dashboard, anomalies, wizard, portails, audit</li>
<li><strong>Référentiel</strong> : sites, org, employés, terminaux</li>
<li><strong>Temps</strong> : types, journées, calendriers, formules, états</li>
<li><strong>Accès / Éléments variables / Sécurité</strong> selon vos droits profil</li>
</ul>
<p>Filtre <em>site</em> en haut : restreint listes et indicateurs au site choisi. Pour sauter directement à un écran ou à un employé, ouvrez la recherche globale avec <strong>Ctrl+K</strong>.</p>`,

  raccourcis: `<p>Tout se fait au clavier, depuis n'importe quel écran.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="left">Touche</th><th align="left">Effet</th></tr>
<tr><td><code>Ctrl</code>+<code>K</code></td><td>Recherche globale (employés, sites, terminaux, écrans…)</td></tr>
<tr><td><code>/</code></td><td>Place le curseur dans le filtre de l'écran courant</td></tr>
<tr><td><code>Ctrl</code>+<code>S</code></td><td>Enregistre la fiche ouverte</td></tr>
<tr><td><code>Ctrl</code>+<code>Z</code></td><td>Annule la dernière suppression</td></tr>
<tr><td><code>?</code></td><td>Ouvre cet assistant</td></tr>
<tr><td><code>Échap</code></td><td>Ferme la fenêtre ouverte, puis la fiche en cours</td></tr>
<tr><td><code>↑</code> <code>↓</code> <code>Entrée</code></td><td>Navigue et ouvre dans la recherche globale</td></tr>
</table>
<p>Les raccourcis à modificateur (<code>Ctrl</code>, <code>/</code>, <code>?</code>) ne se déclenchent pas pendant que vous tapez dans un champ, sauf <code>Ctrl+K</code> et <code>Échap</code>.</p>`,

  employes: `<p>Chaque employé porte : identité, site, département, calendrier, badge, accès, portail, dates d'entrée/sortie.</p>
<ul>
<li>Renseigner une <strong>date de sortie</strong> déclenche les règles « employé sortant ».</li>
<li>Changer de site/département = événement <em>mutation</em>.</li>
<li>Champs personnalisés : module Champs + historique possible.</li>
</ul>
<p><strong>Bonne pratique :</strong> une seule fiche à jour ; les modules consomment cette fiche.</p>`,

  calendriers: `<p>Chaîne de paramétrage temps :</p>
<ol>
<li><strong>Types de temps</strong> (codes métier)</li>
<li><strong>Journées types</strong> : plages horaire (oblig / flex / pause / nuit)</li>
<li><strong>Calendrier</strong> : affectation jour par jour ou cycles</li>
<li>Affectation du calendrier à l'employé (avec historique)</li>
</ol>
<p>Sans calendrier, l'employé apparaît dans <em>Anomalies</em>.</p>`,

  pointage: `<p>Les badgeages alimentent les calculs de présence.</p>
<ul>
<li>Sens Entrée / Sortie ; un nombre <strong>impair</strong> de mouvements sur une journée signale souvent une sortie manquante.</li>
<li>Module <em>Pointages</em> : consultation / simulation.</li>
<li>Module <em>Anomalies</em> : file de correction.</li>
<li>Terminaux : état de communication (ok / hors ligne).</li>
</ul>
<p><em>Note expert :</em> la communication physique des terminaux et la géolocalisation mobile ne sont pas encore branchées en prod dans ce prototype — le modèle de données et les écrans sont prêts.</p>`,

  formules: `<p>Module <strong>Arithmétiques</strong> : compteurs calculés sur une période.</p>
<p>Variables usuelles dans les formules :</p>
<ul>
<li><code>PRESENCE</code> — temps de présence calculé</li>
<li><code>THEORIQUE</code> — temps dû selon calendrier</li>
<li>Autres codes selon vos types de temps et compteurs</li>
</ul>
<p>Unités : heures, minutes, jours, nombre. Les <strong>États</strong> agrègent ces compteurs pour export.</p>
<p><strong>Conseil :</strong> créez d'abord les types de temps et journées, puis les formules, puis l'état de sortie des éléments variables.</p>`,

  etats: `<p>Un état = sélection de compteurs + période + regroupement (employé / département / site) + colonnes.</p>
<ul>
<li>Export <strong>CSV</strong> (tableur), <strong>TXT</strong> (chasse fixe), <strong>impression / PDF</strong> via dialogue navigateur</li>
<li>Mode détaillé jour ou cumul période</li>
<li>Filtres sur champs personnalisés possibles</li>
</ul>`,

  import: `<p>Module <strong>Import</strong> — modèle prêt à l'emploi :</p>
<ol>
<li><strong>Télécharger le modèle</strong> CSV (en-têtes et ligne d'exemple, séparateur point-virgule)</li>
<li>Le compléter dans Excel puis l'enregistrer au format CSV (dates JJ/MM/AAAA ou AAAA-MM-JJ, e-mail valide, matricule obligatoire)</li>
<li><strong>Glisser-déposer</strong> le fichier : aperçu des 5 premières lignes avec statut 🟢 / 🔴</li>
<li>Mapper les colonnes si besoin, contrôler créations / mises à jour / erreurs</li>
<li>Lancer l'import (ou mode strict pour bloquer en cas d'erreur)</li>
</ol>
<p>Indicateurs de prévisualisation : <em>Prêt à importer</em>, <em>Format d'email invalide</em>, <em>Matricule manquant</em>. Après import, vérifier <em>Anomalies</em>.</p>
<p>Astuce : utilisez la <strong>visite guidée</strong> (bouton dans l'aide) pour parcourir les 3 étapes de cet écran.</p>`,

  corbeille: `<p>Aucune suppression n'est immédiate et aveugle.</p>
<ol>
<li>Le bouton <em>Supprimer</em> ouvre une fenêtre qui <strong>nomme l'élément</strong> et liste ce qui en dépend (employés rattachés, badgeages, comptes…).</li>
<li>Après confirmation, l'élément part à la <strong>Corbeille</strong> (menu Échanges) et une barre <em>Annuler</em> reste affichée quelques secondes.</li>
<li>Dans la Corbeille : <em>Restaurer</em> remet l'élément tel quel, <em>Effacer définitivement</em> le supprime pour de bon.</li>
</ol>
<p>Rétention : <strong>30 jours</strong>. <code>Ctrl+Z</code> annule la dernière suppression sans passer par l'écran.</p>
<p>La restauration refuse de créer un doublon : si un élément portant le même code a été recréé entre-temps, changez ce code avant de restaurer.</p>`,

  acces: `<p>Enchaînement accès :</p>
<ol>
<li>Zones &amp; portes</li>
<li>Plages et plannings d'accès</li>
<li>Affectation à l'employé (droits)</li>
<li>Anti-passback si activé</li>
</ol>
<p>Les règles métier peuvent <strong>retirer tous les accès</strong> à la sortie ou au passage hors effectif.</p>`,

  circuits: `<p>Circuits = étapes de validation (chef → RH → direction…).</p>
<ul>
<li>Module <em>Circuits</em> : définir les niveaux</li>
<li>Module <em>Demandes</em> : suivre le cycle</li>
<li>Portail <em>Mon équipe</em> : validation rapide manager</li>
</ul>`,

  regles: `<p>Principe CDC : <strong>une saisie → mises à jour en cascade</strong>.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="left">Déclencheur</th><th align="left">Exemples d'actions</th></tr>
<tr><td>Employé sortant</td><td>Compte, portail, badge, accès, bio, archive, notif</td></tr>
<tr><td>Mutation</td><td>Workflows, notification</td></tr>
<tr><td>Hors effectif</td><td>Retrait accès / bio / badge / portail</td></tr>
</table>
<p>Consultez le <em>Journal</em> pour l'audit.</p>`,

  securite: `<p>Profils → droits par écran. Utilisateurs liés ou non à un employé.</p>
<ul>
<li>Politique de mot de passe (longueur, complexité, verrouillage)</li>
<li>2FA en démonstration</li>
<li>Délégations temporaires possibles sur le modèle de données</li>
</ul>`,

  gaps: `<p>Par rapport aux attentes terrain / experts pointage, priorités encore hors prototype navigateur :</p>
<ul>
<li>Application mobile native + pointage GPS</li>
<li>Protocoles réels terminaux (push/pull constructeurs)</li>
<li>Connecteurs éléments variables / ERP / LDAP et notifications e-mail/SMS réelles</li>
<li>Moteur de soldes (CP, RTT) et droit du travail (amplitudes, repos)</li>
<li>Signature électronique des demandes</li>
<li>Charge 10 000+ employés : nécessite API + PostgreSQL (package offline serveur), pas le stockage navigateur seul</li>
</ul>
<p>Déjà différenciants : règles métier, anomalies, assistant démarrage, portails, formules, corbeille annulable, recherche globale.</p>`
}
},

en: {
topics: [
  {id:"accueil", titre:"Quick start", tags:"start licence login setup"},
  {id:"nav", titre:"Navigation", tags:"menu screen module"},
  {id:"raccourcis", titre:"Keyboard shortcuts", tags:"keyboard ctrl k global search palette"},
  {id:"employes", titre:"Employees & reference data", tags:"employee ID badge site department"},
  {id:"calendriers", titre:"Calendars & schedules", tags:"day pattern cycle rest holiday"},
  {id:"pointage", titre:"Clocking", tags:"badge in out anomaly"},
  {id:"formules", titre:"Formulas & counters", tags:"presence theoretical overtime formula variable"},
  {id:"etats", titre:"Reports & exports", tags:"report csv pdf period"},
  {id:"import", titre:"Import", tags:"excel csv mapping columns"},
  {id:"corbeille", titre:"Delete & restore", tags:"trash delete undo restore"},
  {id:"acces", titre:"Access control", tags:"zone door plan anti-passback"},
  {id:"circuits", titre:"Requests & workflows", tags:"leave approval workflow"},
  {id:"regles", titre:"Business rules", tags:"leaver transfer automation"},
  {id:"securite", titre:"Security & rights", tags:"profile password 2fa"},
  {id:"gaps", titre:"Current limits", tags:"mobile geo erp sms 10000"}
],
ctx: {
  home:"Overview and shortcuts. Use the side menu for the modules.",
  dash:"Management indicators: presence, absentees, requests, offline terminals.",
  anomalies:"List of gaps (odd punch count, no calendar, terminal down). Fix button.",
  wizard:"Six-step first-time setup assistant.",
  emp:"The employee record is the source of truth. A change can fire business rules.",
  sites:"Sites and their link to collective agreements / variable items periods.",
  org:"Org chart (departments). The “off headcount” type removes access and biometrics automatically.",
  cal:"Yearly grid: assign day patterns, rest days and public holidays.",
  jou:"Day patterns = mandatory bands, flexible bands, breaks.",
  tt:"Time types (presence, absence, overtime…) used inside formulas.",
  arit:"Counters computed from formulas (PRESENCE, THEORETICAL variables, etc.).",
  etats:"Configurable reports + CSV / text export and PDF printing.",
  ptg:"Clockings (simulation). An odd number of punches means a missing exit.",
  import:"Download the CSV template, drop the file, check the row-by-row preview, map the columns, then import.",
  circuits:"Multi-level approval workflows for requests.",
  dmd:"Absence / assignment requests awaiting approval.",
  regles:"Automations: leaver, transfer, off headcount → module actions.",
  journal:"Trace of the rules that ran (business audit).",
  acces:"Access rights by zone / door / plan.",
  zones:"Zones and doors of the site.",
  profils:"Right profiles, screen by screen.",
  users:"Login accounts, optionally tied to an employee.",
  secu:"Password policy, lockout, demo 2FA.",
  bio:"Fingerprints / templates and terminal enrol/remove queues (simulated).",
  term:"Clocking / access terminals and their communication state.",
  mgr:"Manager portal: today's team and quick approvals.",
  portal:"Employee space: clockings and requests.",
  audit:"Who / when / what on the automations.",
  champs:"Custom employee fields (extensible).",
  corbeille:"Deleted items, restorable for the period set by the administrator (30 days by default).",
  svg:"Backup and restore of the reference data."
},
corps: {
  accueil: `<p><strong>FIWAKTI</strong> handles HR reference data, working time, clocking and access control.</p>
<ol>
<li>Activate the licence (customer + key) if asked.</li>
<li>Sign in (e.g. <code>admin</code>).</li>
<li>Set up <em>Sites → Org chart → Employees → Calendars → Terminals</em>.</li>
<li>Use the <strong>setup assistant</strong> (Home menu) for a guided path.</li>
</ol>
<p>The <strong>?</strong> button at the bottom right opens this assistant anywhere. <strong>Ctrl+K</strong> opens global search.</p>`,

  nav: `<p>Grouped side menu. <strong>Hovering</strong> a group opens its submenu alongside (desktop). Collapsed mode shows icons only.</p>
<ul>
<li><strong>Home</strong>: dashboard, anomalies, wizard, portals, audit</li>
<li><strong>Reference data</strong>: sites, org chart, employees, terminals</li>
<li><strong>Time</strong>: types, day patterns, calendars, formulas, reports</li>
<li><strong>Access / Variable items / Security</strong> depending on your profile rights</li>
</ul>
<p>The <em>site</em> filter at the top narrows lists and indicators to the chosen site. To jump straight to a screen or an employee, open global search with <strong>Ctrl+K</strong>.</p>`,

  raccourcis: `<p>Everything can be reached from the keyboard, on any screen.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="left">Key</th><th align="left">Effect</th></tr>
<tr><td><code>Ctrl</code>+<code>K</code></td><td>Global search (employees, sites, terminals, screens…)</td></tr>
<tr><td><code>/</code></td><td>Put the cursor in the current screen's filter</td></tr>
<tr><td><code>Ctrl</code>+<code>S</code></td><td>Save the open record</td></tr>
<tr><td><code>Ctrl</code>+<code>Z</code></td><td>Undo the last deletion</td></tr>
<tr><td><code>?</code></td><td>Open this assistant</td></tr>
<tr><td><code>Esc</code></td><td>Close the open dialog, then the current record</td></tr>
<tr><td><code>↑</code> <code>↓</code> <code>Enter</code></td><td>Move and open inside global search</td></tr>
</table>
<p>Modifier shortcuts (<code>Ctrl</code>, <code>/</code>, <code>?</code>) stay silent while you are typing in a field, except <code>Ctrl+K</code> and <code>Esc</code>.</p>`,

  employes: `<p>Every employee carries: identity, site, department, calendar, badge, access, portal, hire and leave dates.</p>
<ul>
<li>Filling in a <strong>leave date</strong> fires the “leaver” rules.</li>
<li>Changing site or department raises a <em>transfer</em> event.</li>
<li>Custom fields: the Fields module, with optional history.</li>
</ul>
<p><strong>Good practice:</strong> one record, kept current; every module reads from it.</p>`,

  calendriers: `<p>Working-time setup chain:</p>
<ol>
<li><strong>Time types</strong> (business codes)</li>
<li><strong>Day patterns</strong>: time bands (mandatory / flexible / break / night)</li>
<li><strong>Calendar</strong>: day-by-day assignment or cycles</li>
<li>Assign the calendar to the employee (with history)</li>
</ol>
<p>With no calendar, the employee shows up under <em>Anomalies</em>.</p>`,

  pointage: `<p>Punches feed the presence calculations.</p>
<ul>
<li>Direction In / Out; an <strong>odd</strong> number of movements on a day usually means a missing exit.</li>
<li><em>Clockings</em> module: review and simulation.</li>
<li><em>Anomalies</em> module: correction queue.</li>
<li>Terminals: communication state (ok / offline).</li>
</ul>
<p><em>Expert note:</em> physical terminal communication and mobile geolocation are not wired to production in this prototype — the data model and the screens are ready.</p>`,

  formules: `<p><strong>Counters</strong> module: values computed over a period.</p>
<p>Common variables in formulas:</p>
<ul>
<li><code>PRESENCE</code> — computed attendance time</li>
<li><code>THEORIQUE</code> — time owed according to the calendar</li>
<li>Other codes, depending on your time types and counters</li>
</ul>
<p>Units: hours, minutes, days, count. <strong>Reports</strong> aggregate these counters for export.</p>
<p><strong>Tip:</strong> create time types and day patterns first, then formulas, then the variable items output report.</p>`,

  etats: `<p>A report = chosen counters + period + grouping (employee / department / site) + columns.</p>
<ul>
<li>Export to <strong>CSV</strong> (spreadsheet), <strong>TXT</strong> (fixed width), <strong>print / PDF</strong> via the browser dialog</li>
<li>Daily detail or period total</li>
<li>Filters on custom fields are supported</li>
</ul>`,

  import: `<p><strong>Import</strong> module:</p>
<ol>
<li>Pick a text/CSV file</li>
<li>Set the delimiter and map the columns (employee ID, name, site…)</li>
<li>Dry run: creations / updates / errors</li>
<li>Confirm: written to the reference data</li>
</ol>
<p>Templates and loose header matching (e.g. Dept → Department). After importing, check <em>Anomalies</em> for missing calendars or access.</p>
<p>Advanced formats (native Excel, ERP API) belong to the server package, not the browser alone.</p>`,

  corbeille: `<p>No deletion is immediate and blind.</p>
<ol>
<li>The <em>Delete</em> button opens a dialog that <strong>names the item</strong> and lists what depends on it (linked employees, punches, accounts…).</li>
<li>Once confirmed, the item goes to the <strong>Trash</strong> (Exchanges menu) and an <em>Undo</em> bar stays on screen for a few seconds.</li>
<li>In the Trash: <em>Restore</em> puts the item back as it was, <em>Erase permanently</em> removes it for good.</li>
</ol>
<p>Retention: <strong>30 days</strong>. <code>Ctrl+Z</code> undoes the last deletion without opening the screen.</p>
<p>Restoring refuses to create a duplicate: if an item with the same code was recreated meanwhile, change that code before restoring.</p>`,

  acces: `<p>Access chain:</p>
<ol>
<li>Zones &amp; doors</li>
<li>Access bands and plans</li>
<li>Assignment to the employee (rights)</li>
<li>Anti-passback when enabled</li>
</ol>
<p>Business rules can <strong>remove every access right</strong> when someone leaves or moves off headcount.</p>`,

  circuits: `<p>Workflows = approval steps (manager → HR → management…).</p>
<ul>
<li><em>Workflows</em> module: define the levels</li>
<li><em>Requests</em> module: follow the cycle</li>
<li><em>My team</em> portal: quick manager approval</li>
</ul>`,

  regles: `<p>Core principle: <strong>one entry → cascading updates</strong>.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="left">Trigger</th><th align="left">Example actions</th></tr>
<tr><td>Leaver</td><td>Account, portal, badge, access, biometrics, archive, notification</td></tr>
<tr><td>Transfer</td><td>Workflows, notification</td></tr>
<tr><td>Off headcount</td><td>Remove access / biometrics / badge / portal</td></tr>
</table>
<p>See the <em>Log</em> screen for the audit trail.</p>`,

  securite: `<p>Profiles → rights per screen. Users may or may not be tied to an employee.</p>
<ul>
<li>Password policy (length, complexity, lockout)</li>
<li>2FA shown as a demo</li>
<li>Temporary delegations supported by the data model</li>
</ul>`,

  gaps: `<p>Measured against field and time-and-attendance expert expectations, still outside this browser prototype:</p>
<ul>
<li>Native mobile app + GPS clocking</li>
<li>Real terminal protocols (vendor push/pull)</li>
<li>Variable items / ERP / LDAP connectors and real e-mail/SMS notifications</li>
<li>Leave balance engine (annual leave, time off) and labour-law checks (spans, rest)</li>
<li>Electronic signature on requests</li>
<li>10,000+ employees: needs the API + PostgreSQL server package, not browser storage alone</li>
</ul>
<p>Already distinctive: business rules, anomalies, setup assistant, portals, formulas, undoable trash, global search.</p>`
}
},

ar: {
topics: [
  {id:"accueil", titre:"انطلاقة سريعة", tags:"بداية رخصة دخول تهيئة"},
  {id:"nav", titre:"التنقّل", tags:"قائمة شاشة وحدة"},
  {id:"raccourcis", titre:"اختصارات لوحة المفاتيح", tags:"لوحة المفاتيح بحث شامل"},
  {id:"employes", titre:"الأعوان والمرجع", tags:"رقم التسجيل شارة موقع قسم"},
  {id:"calendriers", titre:"الرزنامات والأوقات", tags:"يوم نموذجي دورة راحة عطلة"},
  {id:"pointage", titre:"التسجيل", tags:"دخول خروج اختلال"},
  {id:"formules", titre:"الصيغ والعدّادات", tags:"حضور نظري ساعات إضافية متغيّر"},
  {id:"etats", titre:"التقارير والتصدير", tags:"تقرير csv pdf فترة"},
  {id:"import", titre:"الاستيراد", tags:"excel csv أعمدة ربط"},
  {id:"corbeille", titre:"الحذف والاستعادة", tags:"سلة مهملات حذف تراجع استعادة"},
  {id:"acces", titre:"مراقبة النفاذ", tags:"منطقة باب برنامج"},
  {id:"circuits", titre:"المطالب والمسارات", tags:"عطلة مصادقة مسار"},
  {id:"regles", titre:"قواعد العمل", tags:"مغادرة نقلة أتمتة"},
  {id:"securite", titre:"الأمن والحقوق", tags:"ملف حقوق كلمة سر"},
  {id:"gaps", titre:"الحدود الحالية", tags:"هاتف تموقع erp sms"}
],
ctx: {
  home:"نظرة عامة واختصارات. استعمل القائمة الجانبية للوحدات.",
  dash:"مؤشرات الإدارة: الحضور، الغيابات، المطالب، الأجهزة غير المتصلة.",
  anomalies:"قائمة الاختلالات (عدد تسجيلات فردي، دون رزنامة، جهاز خارج الخدمة). زر التصحيح.",
  wizard:"مساعد التهيئة الأولى في ست مراحل.",
  emp:"بطاقة العون هي المرجع. أي تعديل قد يُطلق قواعد العمل.",
  sites:"المواقع وربطها بالاتفاقيات وفترات العناصر المتغيرة.",
  org:"الهيكل التنظيمي (الأقسام). نوع «خارج العدد» يسحب النفاذ والبيومتري آليا.",
  cal:"شبكة سنوية: أسنِد الأيام النموذجية والراحة والعطل.",
  jou:"الأيام النموذجية = فترات إجبارية، مرنة، استراحة.",
  tt:"أنواع الوقت (حضور، غياب، ساعات إضافية…) المستعملة في الصيغ.",
  arit:"عدّادات محسوبة بالصيغ (متغيّرات PRESENCE وTHEORIQUE…).",
  etats:"تقارير قابلة للضبط + تصدير CSV / نص وطباعة PDF.",
  ptg:"التسجيلات (محاكاة). عدد فردي من التسجيلات = خروج ناقص.",
  import:"استيراد CSV: ربط الأعمدة، تحليل مسبق، إحداث أو تحيين.",
  circuits:"مسارات مصادقة متعدّدة المستويات للمطالب.",
  dmd:"مطالب الغياب والمهمّات في انتظار المصادقة.",
  regles:"الأتمتة: مغادرة، نقلة، خارج العدد ← إجراءات على الوحدات.",
  journal:"أثر القواعد المنفَّذة (تدقيق).",
  acces:"حقوق النفاذ حسب المناطق والأبواب والبرامج.",
  zones:"مناطق وأبواب الموقع.",
  profils:"ملفات الحقوق شاشة بشاشة.",
  users:"حسابات الدخول، مرتبطة أو غير مرتبطة بعون.",
  secu:"سياسة كلمات السر، القفل، التثبّت المزدوج (عرض).",
  bio:"البصمات والنماذج وطوابير الإرسال والسحب نحو الأجهزة (محاكاة).",
  term:"أجهزة التسجيل والنفاذ وحالة الاتصال.",
  mgr:"فضاء المسؤول: فريق اليوم والمصادقات السريعة.",
  portal:"فضاء العون: التسجيلات والمطالب.",
  audit:"من ومتى وماذا في الأتمتة.",
  champs:"حقول مخصّصة للعون (قابلة للتوسيع).",
  corbeille:"العناصر المحذوفة، قابلة للاستعادة خلال المدة التي يحددها المسؤول (30 يوما افتراضيا).",
  svg:"النسخ الاحتياطي واستعادة المرجع."
},
corps: {
  accueil: `<p><strong>FIWAKTI</strong> يدير مرجع الموارد البشرية ووقت العمل والتسجيل ومراقبة النفاذ.</p>
<ol>
<li>فعّل الرخصة (الحريف + المفتاح) عند الطلب.</li>
<li>اتصل بالحساب (مثلا <code>admin</code>).</li>
<li>اضبط <em>المواقع ← الهيكل ← الأعوان ← الرزنامات ← الأجهزة</em>.</li>
<li>استعمل <strong>مساعد الانطلاق</strong> (قائمة الاستقبال) لمسار موجَّه.</li>
</ol>
<p>زر <strong>؟</strong> أسفل اليسار يفتح هذا المساعد في كل مكان. و<strong>Ctrl+K</strong> يفتح البحث الشامل.</p>`,

  nav: `<p>قائمة جانبية مجمّعة. المرور فوق مجموعة يفتح قائمتها الفرعية (على الحاسوب). الوضع المضغوط يعرض الأيقونات فقط.</p>
<ul>
<li><strong>الاستقبال</strong>: لوحة القيادة، الاختلالات، المساعد، الفضاءات، التدقيق</li>
<li><strong>المرجع</strong>: المواقع، الهيكل، الأعوان، الأجهزة</li>
<li><strong>الوقت</strong>: الأنواع، الأيام، الرزنامات، الصيغ، التقارير</li>
<li><strong>النفاذ / العناصر المتغيرة / الأمن</strong> حسب حقوق ملفك</li>
</ul>
<p>مُصفّي <em>الموقع</em> في الأعلى يحصر القوائم والمؤشرات في الموقع المختار. وللانتقال مباشرة إلى شاشة أو إلى عون، افتح البحث الشامل بـ<strong>Ctrl+K</strong>.</p>`,

  raccourcis: `<p>كل شيء متاح من لوحة المفاتيح، من أي شاشة.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="right">المفتاح</th><th align="right">الأثر</th></tr>
<tr><td><code>Ctrl</code>+<code>K</code></td><td>البحث الشامل (أعوان، مواقع، أجهزة، شاشات…)</td></tr>
<tr><td><code>/</code></td><td>وضع المؤشّر في مُصفّي الشاشة الحالية</td></tr>
<tr><td><code>Ctrl</code>+<code>S</code></td><td>حفظ البطاقة المفتوحة</td></tr>
<tr><td><code>Ctrl</code>+<code>Z</code></td><td>التراجع عن آخر حذف</td></tr>
<tr><td><code>؟</code></td><td>فتح هذا المساعد</td></tr>
<tr><td><code>Esc</code></td><td>إغلاق النافذة المفتوحة، ثم البطاقة الجارية</td></tr>
<tr><td><code>↑</code> <code>↓</code> <code>Enter</code></td><td>التنقّل والفتح داخل البحث الشامل</td></tr>
</table>
<p>الاختصارات ذات المُعدِّل (<code>Ctrl</code> و<code>/</code> و<code>؟</code>) لا تعمل أثناء الكتابة في حقل، عدا <code>Ctrl+K</code> و<code>Esc</code>.</p>`,

  employes: `<p>كل عون يحمل: الهوية، الموقع، القسم، الرزنامة، الشارة، النفاذ، الفضاء، تاريخي الالتحاق والمغادرة.</p>
<ul>
<li>إدخال <strong>تاريخ مغادرة</strong> يُطلق قواعد «العون المغادر».</li>
<li>تغيير الموقع أو القسم يُحدث واقعة <em>نقلة</em>.</li>
<li>الحقول المخصّصة: وحدة الحقول، مع إمكانية حفظ التاريخ.</li>
</ul>
<p><strong>ممارسة جيدة:</strong> بطاقة واحدة محيَّنة؛ كل الوحدات تقرأ منها.</p>`,

  calendriers: `<p>سلسلة ضبط الوقت:</p>
<ol>
<li><strong>أنواع الوقت</strong> (رموز العمل)</li>
<li><strong>الأيام النموذجية</strong>: فترات (إجبارية / مرنة / استراحة / ليلية)</li>
<li><strong>الرزنامة</strong>: إسناد يوما بيوم أو بالدورات</li>
<li>إسناد الرزنامة إلى العون (مع حفظ التاريخ)</li>
</ol>
<p>دون رزنامة، يظهر العون في <em>الاختلالات</em>.</p>`,

  pointage: `<p>التسجيلات تُغذّي حساب الحضور.</p>
<ul>
<li>الاتجاه دخول / خروج؛ وعدد <strong>فردي</strong> من الحركات في اليوم يدلّ غالبا على خروج ناقص.</li>
<li>وحدة <em>التسجيلات</em>: الاطّلاع والمحاكاة.</li>
<li>وحدة <em>الاختلالات</em>: طابور التصحيح.</li>
<li>الأجهزة: حالة الاتصال (سليم / غير متصل).</li>
</ul>
<p><em>ملاحظة:</em> الاتصال الفعلي بالأجهزة والتموقع عبر الهاتف غير مربوطين بالإنتاج في هذا النموذج — نموذج البيانات والشاشات جاهزة.</p>`,

  formules: `<p>وحدة <strong>العدّادات</strong>: قيم تُحسب على فترة.</p>
<p>المتغيّرات المعتادة في الصيغ:</p>
<ul>
<li><code>PRESENCE</code> — وقت الحضور المحسوب</li>
<li><code>THEORIQUE</code> — الوقت الواجب حسب الرزنامة</li>
<li>رموز أخرى حسب أنواع الوقت والعدّادات لديك</li>
</ul>
<p>الوحدات: ساعات، دقائق، أيام، عدد. و<strong>التقارير</strong> تجمع هذه العدّادات للتصدير.</p>
<p><strong>نصيحة:</strong> أنشئ أنواع الوقت والأيام أولا، ثم الصيغ، ثم تقرير مخرجات العناصر المتغيرة.</p>`,

  etats: `<p>التقرير = عدّادات مختارة + فترة + تجميع (عون / قسم / موقع) + أعمدة.</p>
<ul>
<li>تصدير <strong>CSV</strong> (جدول)، <strong>TXT</strong> (عرض ثابت)، <strong>طباعة / PDF</strong> عبر نافذة المتصفّح</li>
<li>تفصيل يومي أو مجموع الفترة</li>
<li>إمكانية التصفية على الحقول المخصّصة</li>
</ul>`,

  import: `<p>وحدة <strong>الاستيراد</strong>:</p>
<ol>
<li>اختر ملف نص / CSV</li>
<li>حدّد الفاصل واربط الأعمدة (رقم التسجيل، الاسم، الموقع…)</li>
<li>حلّل مسبقا: إحداثات / تحيينات / أخطاء</li>
<li>صادق: الكتابة في المرجع</li>
</ol>
<p>نماذج ومطابقة مرنة للعناوين (مثلا Dept ← القسم). بعد الاستيراد، راجع <em>الاختلالات</em> (رزنامات أو نفاذ ناقص).</p>
<p>الصيغ المتقدّمة (Excel أصلي، واجهة ERP) مبرمجة في نسخة الخادم لا في المتصفّح وحده.</p>`,

  corbeille: `<p>لا حذف فوري ولا أعمى.</p>
<ol>
<li>زر <em>حذف</em> يفتح نافذة <strong>تسمّي العنصر</strong> وتعدّد ما يعتمد عليه (أعوان مرتبطون، تسجيلات، حسابات…).</li>
<li>بعد التأكيد ينتقل العنصر إلى <strong>سلة المهملات</strong> (قائمة التبادل)، ويبقى شريط <em>تراجع</em> معروضا بضع ثوان.</li>
<li>في السلة: <em>استعادة</em> تُرجع العنصر كما كان، و<em>محو نهائي</em> يحذفه بلا رجعة.</li>
</ol>
<p>مدة الحفظ: <strong>30 يوما</strong>. و<code>Ctrl+Z</code> يتراجع عن آخر حذف دون فتح الشاشة.</p>
<p>الاستعادة ترفض إحداث نسخة مكرّرة: إذا أُعيد إنشاء عنصر بنفس الرمز في الأثناء، غيّر ذلك الرمز قبل الاستعادة.</p>`,

  acces: `<p>سلسلة النفاذ:</p>
<ol>
<li>المناطق والأبواب</li>
<li>فترات وبرامج النفاذ</li>
<li>الإسناد إلى العون (الحقوق)</li>
<li>منع العبور المزدوج عند تفعيله</li>
</ol>
<p>قواعد العمل قادرة على <strong>سحب كل حقوق النفاذ</strong> عند المغادرة أو الخروج من العدد.</p>`,

  circuits: `<p>المسارات = مراحل المصادقة (المسؤول ← الموارد البشرية ← الإدارة…).</p>
<ul>
<li>وحدة <em>المسارات</em>: ضبط المستويات</li>
<li>وحدة <em>المطالب</em>: متابعة الدورة</li>
<li>فضاء <em>فريقي</em>: مصادقة سريعة للمسؤول</li>
</ul>`,

  regles: `<p>المبدأ: <strong>إدخال واحد ← تحيينات متسلسلة</strong>.</p>
<table style="width:100%;font-size:12.5px;border-collapse:collapse">
<tr><th align="right">المُطلِق</th><th align="right">أمثلة الإجراءات</th></tr>
<tr><td>عون مغادر</td><td>الحساب، الفضاء، الشارة، النفاذ، البيومتري، الأرشفة، الإشعار</td></tr>
<tr><td>نقلة</td><td>المسارات، الإشعار</td></tr>
<tr><td>خارج العدد</td><td>سحب النفاذ / البيومتري / الشارة / الفضاء</td></tr>
</table>
<p>راجع <em>السجلّ</em> للتدقيق.</p>`,

  securite: `<p>ملفات الحقوق ← الحقوق شاشة بشاشة. المستعملون مرتبطون أو غير مرتبطين بعون.</p>
<ul>
<li>سياسة كلمة السر (الطول، التعقيد، القفل)</li>
<li>التثبّت المزدوج في وضع عرض</li>
<li>تفويضات مؤقّتة مدعومة في نموذج البيانات</li>
</ul>`,

  gaps: `<p>مقارنة بانتظارات الميدان وخبراء التسجيل، ما يزال خارج هذا النموذج داخل المتصفّح:</p>
<ul>
<li>تطبيق هاتف أصلي + تسجيل بالتموقع</li>
<li>بروتوكولات فعلية للأجهزة</li>
<li>روابط العناصر المتغيرة / ERP / LDAP وإشعارات بريد ورسائل قصيرة فعلية</li>
<li>محرّك أرصدة العطل ومقتضيات قانون الشغل (المدد، الراحة)</li>
<li>الإمضاء الإلكتروني على المطالب</li>
<li>أكثر من 10 آلاف عون: يستوجب الواجهة البرمجية وPostgreSQL، لا تخزين المتصفّح وحده</li>
</ul>
<p>ما يميّز التطبيق بالفعل: قواعد العمل، الاختلالات، مساعد الانطلاق، الفضاءات، الصيغ، سلة مهملات قابلة للتراجع، بحث شامل.</p>`
}
}

}; })();
