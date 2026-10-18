# FIWAKTI 56.33.11 — audit complet (sécurité, logique métier, modules, exploitation, interface, performances)

## 1. Ce qu'un audit peut garantir, et ce qu'il ne peut pas garantir

Aucun audit ne peut certifier qu'une application est « sûre à 100 % » ou qu'elle ne demandera « aucune vérification
supplémentaire ». Ce document dit ce qui a été examiné, ce qui a été trouvé et corrigé, les preuves de bon
fonctionnement, et ce qui reste à vérifier. Restent à vérifier en particulier :
- les essais sur les vraies pointeuses du client ;
- la configuration réseau et HTTPS du site.

## 2. Méthode

Cinq revues indépendantes ont été menées en parallèle sur l'ensemble du code, puis tous les constats ont été corrigés
et retestés sur le banc : PostgreSQL 16, 50 000 salariés, 5,5 millions de badgeages, 2,26 millions de journées
calculées.

| Revue | Portée |
|---|---|
| Couche HTTP | toutes les routes `/api/*` et `/iclock` : authentification, droits, périmètres, CSRF, sessions, fichiers, journaux |
| Modules | les 10 modules FW-* (BI, Compétences, Évaluation, Formation, HSE, Médical, Migration, Intégration, Recrutement, Visiteurs) |
| Logique métier | ingestion, fuseaux, pilotes, synchronisation biométrique, cycle de vie des journées, calcul, planificateur, base |
| Exploitation | installation, mises à jour signées, sauvegardes et restaurations, migrations, disque plein, journaux |
| Client | injections HTML, attributs, redirections, stockage local, jeton CSRF, modules chargés à la demande |

## 3. Constats et corrections (tous retestés)

### Critiques et hauts

| # | Constat | Correction |
|---|---|---|
| 1 | Sauvegarde PostgreSQL : des lignes perdues (clé de pagination partielle), vérification aveugle | clé primaire réelle utilisée, comptes vérifiés sur toutes les tables, marque de fin ; 30 000/30 000 lignes restaurées |
| 2 | Sauvegarde > 512 Mo : vérification, restauration et reprise impossibles | lecture en flux (691 Mo lus, 146 Mo de mémoire) |
| 3 | Disque plein pendant une sauvegarde : arrêt du serveur | flux avec gestion d'erreur ; serveur vivant ; fichier partiel supprimé |
| 4 | SQLite : transactions simultanées en échec, écritures perdues | vraie file d'attente des transactions |
| 5 | Profil introuvable = droits d'administrateur sur les données | refus par défaut ; l'administrateur reste reconnu par son rôle |
| 6 | Tout utilisateur pouvait justifier ses propres anomalies | droit de correction du pointage exigé, jamais sur ses propres journées |
| 7 | Validation d'ajustements et de recalculs hors périmètre | périmètre contrôlé ; recalcul validé par une autre personne que son auteur |
| 8 | Un responsable validait ses propres journées | refusé ; l'étape RH est faite par une autre personne que l'étape responsable |
| 9 | Recrutement : candidats, CV et entretiens de tous les sites lisibles | cloisonné par site ; CV et entretiens réservés au droit de saisie |
| 10 | HSE : taux de fréquence et de gravité divisés par 2 pour un responsable de site ; accidents d'autres sites visibles | calcul corrigé ; visibilité selon la victime ; sites et actions cloisonnés |
| 11 | Calcul de fond pouvant réécrire une journée corrigée avec l'ancien résultat | invalidations horodatées ; résultat périmé retiré et recalculé |
| 12 | Fin de blocage biométrique fausse (maladie aujourd'hui + congé en décembre → bloqué 2 mois ; absence annulée → blocage maintenu) | fin = fin des absences consécutives ; levée à l'annulation |
| 13 | Mise à l'heure ZK et Hikvision dans le fuseau du serveur (1 h d'écart si serveur en UTC) | heure envoyée dans le fuseau de l'appareil ou du site |
| 14 | ZK Push : effacement de l'appareil sans attendre l'enregistrement des badgeages renvoyés | effacement seulement après accusé de l'appareil, enregistrement complet et 15 s sans envoi |
| 15 | Injection d'attributs par un identifiant de demande (zone invisible déclenchant une validation) | identifiants contrôlés par le serveur, échappés à l'écran (52 endroits) |

### Moyens et bas (corrigés)

- **Annuaire paginé** : données personnelles non masquées pour un profil « masqué ».
- **Terminaux** :
  - liste et état (n° de série, adresses) visibles par tous ;
  - lecture de la supervision qui écrivait des alertes.
- **`/iclock`** : sans limite de débit ; jusqu'à 20 Mo lus avant l'identification de l'appareil.
- **Exports d'états** : sans contrôle du droit « États » ; paramètres non validés (erreur 500).
- **Divers** :
  - comptage de tout le personnel accessible sans droit ;
  - suppression de la page d'accueil administrateur possible sans être administrateur ;
  - identifiant de session non renouvelé après la double authentification.
- **Mises à jour** :
  - paquet plus ancien accepté (retour vers une version vulnérable) ;
  - paquet incomplet accepté ;
  - mise à jour lancée sans sauvegarde vérifiée.
- **Sauvegardes** :
  - rétention capable de supprimer la dernière sauvegarde restaurable ;
  - deux sauvegardes dans la même seconde s'écrasaient.
- **Restauration SQLite interrompue** : base laissée fermée.
- **Journaux** : sans rotation. Erreur imprévue non journalisée.
- **Archives des pointeuses ZK** : recopie complète à chaque collecte (≈ 60 Mo/jour/appareil).
- **Sagem** : heures mal lues (« 4/1/2026 18:30 » → 08:30 ; AM/PM).
- **Ingestion** :
  - badgeage « dans le futur » perdu (il passe désormais en revue et peut être rejoué) ;
  - clôture contrôlée sur la date civile au lieu de la date de travail.
- **Biométrie** :
  - nouveau badge ou code non propagé (carte perdue toujours valide) ;
  - « aujourd'hui » calculé en UTC.
- **ZK Push** :
  - commandes de retrait conservées 2 s en mémoire seulement ;
  - identifiant non transmissible ignoré sans le dire ;
  - commande refusée par l'appareil jamais signalée.
- **ZK ancien modèle** : fiches utilisateurs de 28 octets mal lues.
- **Formation** : clôture d'une session contenant des inscrits hors périmètre.
- **Visiteurs** : plafond de visites non appliqué en modification.
- **Migration** : ouverte à un paramétreur limité à un site.
- **Évaluation** :
  - compétences hors catalogue acceptées ;
  - validation possible après la clôture de la campagne.
- **Intégration** : transitions de statut non contrôlées.
- **Suivi médical** : petits nombres (1 à 4) pouvant ré-identifier une personne dans le pilotage.
- **Navigateur** :
  - copie en clair du référentiel en cas de coupure réseau, jamais effacée ;
  - jeton CSRF pouvant partir vers une autre origine.
- **PostgreSQL < 14** : erreur de syntaxe incompréhensible (message clair désormais).

## 4. Vérifié correct (sans modification)

- **Authentification** :
  - mots de passe scrypt ;
  - comparaisons en temps constant ;
  - verrouillage par compte et par adresse, identifiants inconnus compris ;
  - double authentification sans rejeu.
- **Sessions et en-têtes** :
  - sessions aléatoires stockées hachées ;
  - cookie HttpOnly, SameSite=Strict ;
  - CSRF sur toutes les écritures ;
  - CSP stricte.
- **Injections et fichiers** :
  - aucune injection SQL (requêtes paramétrées partout) ;
  - aucune traversée de chemin ;
  - aucun secret dans les journaux ;
  - fichiers de données en 0600 et 0700 ;
  - dépôts de CV contrôlés (type, signature, taille, chiffrement).
- **Données protégées** :
  - données médicales réservées au droit médical ;
  - badgeages bruts et ajustements immuables au niveau de la base (déclencheurs PostgreSQL).
- **Mises à jour signées** : SHA-256 par fichier, écriture atomique.
- **Fuseaux horaires** : changements d'heure gérés (heure inexistante, heure ambiguë).

## 5. Preuves (après corrections)

| Contrôle | Résultat |
|---|---|
| `node --check` sur les 55 fichiers JavaScript | 0 erreur |
| Tous les écrans (50) en administrateur, en français, anglais et arabe | 0 erreur JavaScript, chaque clic sous 0,3 s |
| Écrans d'un responsable de site (16 écrans selon ses droits) | 0 erreur JavaScript |
| Ingestion sur une installation neuve : 53 cas piégés | résultats identiques à la référence ; seul changement voulu : badgeage futur mis en revue |
| Ingestion Push, 100 000 badgeages nouveaux, 20 appareils en parallèle | 7 909 badgeages/s (référence : 6 900 à 7 500/s) |
| Renvoi de badgeages déjà reçus | 19 519/s |
| Pilotage (BI) | 4,1 s au premier calcul après redémarrage, puis 4 ms |
| Exploits de l'audit rejoués | tous refusés (403 / 404 / identifiant invalide) |
| Effacement ZK Push en deux temps (appareil simulé) | rien avant l'accusé ; effacement unique après 15 s |
| Blocage biométrique (maladie aujourd'hui et J+3, congé à J+60) | fin au J+3 ; levée immédiate à l'annulation |
| Hikvision, BioStar 2, Sagem (appareils simulés) | collecte, copie de sauvegarde, doublons écartés |
| Sauvegarde PostgreSQL de 30 000 lignes, restauration | 30 000 lignes ; fichier altéré refusé |
| Disque plein pendant une sauvegarde | erreur gérée, serveur en service |

## 6. Ce qui reste à vérifier ou à décider

1. **Sur site, le jour de l'installation (indispensable)**. Pour une pointeuse de chaque marque :
   - diagnostic, collecte, envoi d'un salarié ;
   - retrait d'un sortant, blocage d'un absent ;
   - mise à l'heure.

   Les pilotes sont testés contre des appareils simulés conformes aux protocoles publiés, pas contre le matériel du
   client.
2. **Signature du paquet et licence** par l'éditeur (clé privée absente du dépôt). `npm ci` avant la construction du
   paquet.
3. **Lanceur de production** : il est absent de ce dépôt. C'est lui qui relance le serveur après une mise à jour ou
   un arrêt ; à fournir par l'installateur de l'éditeur.
4. **Windows** : droits du dossier `donnees/` à restreindre par l'installateur (le umask Unix n'y a pas d'effet).
5. **Limites connues, acceptées** :
   - Retrait ZK Push : la confirmation repose sur l'appareil. Une commande refusée est signalée dans l'audit, et
     « Vérifier les identifiants » montre tout salarié resté sur un appareil.
   - Horloge de licence : une date trop en avance au démarrage ne se corrige pas depuis l'application (jeton
     éditeur à prévoir).
   - Bibliothèque `xlsx` (module Migration seulement) : failles publiées sans correctif sur npm, exécutée isolée.
   - Styles en ligne autorisés par la CSP (`style-src 'unsafe-inline'`), nécessaires à l'interface. Les injections
     d'attributs sont désormais bloquées à la source.
   - Compteurs « à traiter » de Recrutement et HSE globaux : des nombres seulement, sans nom.

## Correction après installation (essai sur site, 15/10/2026)

**Export de l'écran Pointage** (Excel, CSV, texte, PDF) : sur les onglets *Journées*, *Semaines* et *Badgeages*, le
fichier ne contenait que les en-têtes des badgeages bruts.

- **Cause** :
  - l'export reprenait la liste des badgeages, quel que soit l'onglet ;
  - en mode grand effectif, cette liste n'est pas chargée dans le navigateur.
- **Correction** (`app/app.js`) :
  - chaque onglet exporte ses propres colonnes ;
  - les onglets calculés par le serveur (*Journées*, *Synthèse*, *Badgeages* en annuaire paginé) sont lus page par
    page, avec les filtres de l'écran et dans la limite du périmètre de l'utilisateur, jusqu'à 100 000 lignes ;
    au-delà, un message renvoie vers les États ;
  - si un calcul est en cours sur le serveur, l'export attend sa fin (2 min au plus) puis signale un fichier
    éventuellement incomplet ;
  - les heures sont écrites en décimal avec une virgule (lisibles par Excel en français) et les dates en jj/mm/aaaa ;
  - un onglet vide affiche un message au lieu de produire un fichier vide.
- **Preuve** : essai avec 6 000 salariés et 30 000 badgeages.

  | Onglet | Lignes exportées | Contrôle (base) |
  |---|---|---|
  | Journées | 41 160 | 41 160 journées calculées en base |
  | Synthèse | 11 760 | 5 880 salariés sur 2 semaines |
  | Badgeages | 3 600 | 3 600 badgeages en base |

  Les fichiers Excel et CSV donnent le même nombre de lignes.

**Export de l'écran Employés** (même cause) : en annuaire paginé, la liste des salariés n'est pas chargée dans le
navigateur, et l'export produisait un fichier sans aucune ligne.

- **Correction** : les matricules sont lus page par page, avec la recherche, le statut et le site de l'écran. Les fiches
  sont ensuite lues par lots de 1 000 (`/api/v1/employes/complets`), dans le périmètre et avec le masquage appliqués
  par le serveur.
- **Changement côté serveur** (`principal.js`) : option `sansPhoto`, pour que l'export ne transporte pas les photos.
- **Preuve** :
  - 5 880 salariés exportés en 0,4 à 0,7 s (Excel et CSV) ;
  - avec la recherche « trabelsi », 300 salariés exportés, comme à l'écran.

**États** (même cause) : en grand effectif, la sortie d'un état posait trois problèmes.

- Le menu *Exporter* du haut de l'écran exportait la liste des modèles d'états, et non l'état.
- TXT, PDF et Imprimer calculaient l'état dans le navigateur, où les salariés ne sont pas chargés : le résultat était
  vide.
- CSV lançait seulement un travail en arrière-plan, à télécharger ensuite depuis la liste des travaux.

**Correction** :

- Toutes les sorties passent par le calcul du serveur (`/api/v1/travaux`), dans le périmètre de l'utilisateur.
- L'écran suit l'avancement du calcul.
- Le fichier est remis dès qu'il est prêt :
  - CSV : le fichier du serveur, tel quel ;
  - Excel et TXT : 200 000 lignes au plus, dates en jj/mm/aaaa et décimales à virgule ;
  - PDF et impression : les 5 000 premières lignes, avec un message.
- Un bouton *Excel* est ajouté dans la barre de sortie de l'état.
- Le menu *Exporter* du haut exporte l'état ouvert. Si aucun état n'est ouvert, un message le demande.

**Preuve** : avec 6 000 salariés, l'état *Contrôle journalier* de septembre donne 176 400 lignes.

| Sortie | Lignes | Durée |
|---|---|---|
| CSV | 176 400 | 11 s |
| Excel | 176 400 | 15 s |
| TXT | 176 400 | 11 s |

- Impression : 5 000 lignes, avec un message.
- *Récapitulatif des éléments variables* exporté en Excel depuis le menu du haut : 5 880 lignes.

Complément après un essai sur site : le menu *Exporter* du haut renvoyait « Ouvrez d'abord un état » quand l'état était
ouvert en **consultation** (clic sur son nom).

- Ce mode est maintenant reconnu : l'export suit la période, les colonnes et les filtres choisis à l'écran (service,
  salarié).
- Un bouton *Excel* est ajouté à côté d'*Exporter CSV*.
- Côté serveur (`calcul.js`), la sélection accepte le filtre `mat` (un seul salarié).
- Essai, état *Heures supplémentaires par semaine* :

  | Sélection | Lignes |
  |---|---|
  | Tout le personnel | 5 880 |
  | Un salarié | 1 |
  | Un service | 20 |

Revue de tous les écrans en grand effectif : à part Pointage, Employés et États, l'export contient ce que l'écran
affiche.

**Identifiants des pointeuses illisibles** (essai sur site, Hikvision) : le test de communication échouait avec
« Unsupported state or unable to authenticate data ».

- **Cause** :
  - les accès des appareils avaient été chiffrés par une autre installation, avec une autre clé `secrets` ;
  - les données avaient été reprises sans le trousseau de cette installation ;
  - le déchiffrement échouait pour tous les appareils, et même l'enregistrement d'un nouveau mot de passe était
    impossible.
- **Correction** (`pointeuses.js`) :
  - le bloc illisible est mis de côté (`meta.pointeuses_secrets_illisibles`), pour être récupéré si l'on importe le
    trousseau d'origine ;
  - un événement d'audit le signale ;
  - les appareils qui demandent un identifiant renvoient un message clair (409), qui demande de ressaisir l'identifiant
    et le mot de passe ;
  - la ressaisie est acceptée ;
  - les appareils Push, qui n'ont pas d'identifiant, ne sont pas touchés.
- **Preuve** (deux clés différentes) :
  1. test de communication avant ressaisie : message clair, code 409 ;
  2. ressaisie du mot de passe : enregistrée, bloc d'origine conservé ;
  3. test de communication après ressaisie : il atteint l'appareil (« L'appareil refuse la connexion » sur un port
     fermé).

**Collecte Hikvision : « socket hang up »** (essai sur site) : le diagnostic (lecture GET) répondait, mais la collecte
(recherche POST `/ISAPI/AccessControl/AcsEvent`) était coupée par l'appareil.

- **Cause** (`pilotes/http-util.js`) :
  - le corps de la requête partait en `Transfer-Encoding: chunked`, que les serveurs embarqués refusent ;
  - les connexions étaient conservées entre les requêtes, alors que l'appareil ferme la sienne après la réponse 401 du
    Digest.
- **Correction** :
  - le corps est envoyé avec sa longueur (`Content-Length`) ;
  - une connexion neuve est ouverte pour chaque requête ;
  - une coupure survenue avant toute réponse est retentée une fois ;
  - si l'échec persiste, le message indique le port, le protocole et l'activation de l'API ISAPI.
- **Preuve** (faux appareil qui coupe les corps découpés et ferme sa connexion après un 401) :
  - avant : GET réussi, POST en « socket hang up » ;
  - après : GET et POST réussis ;
  - collecte complète par le pilote : 2 badgeages lus et intégrés, en 14 requêtes.

**Résultat de collecte peu lisible** (essai sur site) : le message « 0 pointage(s) intégré(s) » ne permettait pas de
savoir si l'appareil n'avait rien renvoyé ou si les badgeages avaient été écartés.

- **Correction** : le message indique maintenant :
  - le nombre de badgeages lus sur l'appareil, et sur combien de jours ;
  - les badgeages déjà enregistrés ;
  - les badgeages non rattachés à un salarié (mode d'identification à vérifier) ;
  - les badgeages rejetés.
- **Hikvision** : si aucun badgeage n'est trouvé avec les types d'événements réglés, une recherche de tous les
  événements d'accès (minor 0) indique les types que l'appareil enregistre réellement. Ces types sont à ajouter dans
  « Types d'événements lus » de la fiche.
- **Essai** (faux appareil, badgeages de type 39) : l'export signale « autres types : 39 (2) ».

**Badgeages d'un identifiant inconnu, rattachés après la création du salarié** (essai sur site : matricule 200 badgé
sur la Hikvision avant d'exister dans FIWAKTI).

- **Constat** :
  - ces badgeages restent en attente (« identifiant inconnu ») ;
  - une nouvelle collecte les voit comme déjà enregistrés ;
  - le rejeu n'existait que par une commande d'administration (`/api/v1/ingestion/rejouer`), sans bouton ;
  - ce rejeu ne lisait que les 5 000 premiers badgeages en attente, dans un ordre quelconque : sur l'essai, 26 400
    inconnus masquaient ceux du salarié créé ;
  - il remettait aussi tous les inconnus en attente sous une nouvelle réception.
- **Correction** :
  - `ingestion.js` : le rejeu regroupe par appareil et par identifiant, et ne rejoue que les identifiants qui
    correspondent désormais à un salarié (matricule, badge ou code, selon le mode de l'appareil) ;
  - `principal.js` : une tâche planifiée « rattachement-badgeages-en-attente » le lance automatiquement après chaque
    changement de la liste des salariés, au plus toutes les 2 minutes.
- **Preuve** (26 400 badgeages en attente sans salarié) :
  - 2 badgeages du matricule 300, alors inconnu, ont été mis en attente ;
  - après la création du salarié, ils ont été rattachés en 110 s ;
  - les 26 400 autres sont restés en attente sans être retraités.

**État de communication des pointeuses remis à « Non testé »** (essai sur site : « Répond », puis « Non testé » après
l'enregistrement).

- **Cause** (`app/app.js`) :
  - « Tester tous » et « Tester la communication » reposaient sur une fonction de démonstration. Sur un vrai serveur,
    elle ne testait rien et remettait toutes les pointeuses à « Non testé » ;
  - l'enregistrement d'une fiche ouverte avant le test réécrivait l'état antérieur.
- **Correction** :
  - ces boutons lancent maintenant le vrai diagnostic de chaque appareil (`/api/v1/pointeuses/diagnostic`) ;
  - le résultat est reporté sur la fiche ouverte ;
  - à l'enregistrement, l'état de communication, qui ne se modifie pas dans la fiche, est repris de l'appareil.
- **Preuve** (navigateur, diagnostic simulé « en ligne ») :
  - avant : après « Tester tous », 3 appareils sur 3 en « Non testé » ;
  - après : 3 sur 3 en « Répond » ;
  - après l'enregistrement d'une fiche périmée : toujours « Répond ».
- **Complément** : sur site, la fiche ouverte affichait encore « Non testé » alors que la liste affichait « Répond ». La
  fiche affiche maintenant l'état de communication de l'appareil en direct, et non sa copie d'édition.
  - Essai : fiche ouverte puis modifiée, Diagnostic, Enregistrer → la fiche et la liste affichent « Répond ».

**Résolution des anomalies vide (« Bravo ! ») alors que les compteurs en signalent des milliers** (essai sur site,
6 000 salariés).

- **Cause** (`app/app.js`) :
  - en grand effectif, la liste vient du serveur ;
  - chaque anomalie était ensuite rattachée au salarié chargé dans le navigateur, et écartée s'il n'y était pas. Pour un
    administrateur ou un RH, l'annuaire est paginé et aucun salarié n'est chargé : liste vide et message « Bravo » ;
  - les cartes « Anomalies à traiter », « Heures supp. » et « Présents », ainsi que le chiffre de l'onglet, étaient
    calculés à partir de cette même liste locale (0).
- **Correction** :
  - les fiches des salariés de la page affichée sont chargées depuis le serveur (`/api/v1/employes/complets`, sans
    photo, dans le périmètre et avec le masquage appliqués) ;
  - les cartes, l'onglet et la barre de progression reprennent les chiffres du serveur (comptes d'anomalies, présents
    et attendus du jour) ;
  - pendant le calcul, « Calcul en cours sur le serveur… » remplace « Bravo » ;
  - une anomalie traitée disparaît de la liste immédiatement.
- **Preuve** (navigateur, 6 000 salariés) :
  - avant : liste vide, « Bravo », cartes à 0, onglet « (0) », alors que la puce « Tout » affichait 5 400 ;
  - après : 40 anomalies affichées, onglet et carte à 5 400 ;
  - « Confirmer l'absence » retire la carte, et le total du serveur passe à 5 399.

**Blocage biométrique selon le type d'absence : réactivation automatique ou validée par les RH** (besoin exprimé sur
site : mise à pied, code 11, réactivation automatique ; maladie longue durée, code 60, réactivation par les RH).

- **Existant** (réglage *Appareils › Synchro biométrie*) :
  - « Absences qui bloquent » ;
  - « Réactivation automatique à la fin » ;
  - « Réactivation après validation RH ».
- **Manques corrigés** (`biosync.js`, `principal.js`, `app/app.js`) :
  - absence à validation RH enchaînée sur une absence à fin automatique (congé, puis maladie longue durée) : le
    blocage restait en réactivation automatique. Il passe désormais en validation RH, sauf si les RH ont déjà levé le
    blocage ;
  - absence à validation RH annulée ou raccourcie : la date de fin du blocage n'était pas corrigée, et la réactivation
    était reportée ;
  - aucune liste des salariés en attente de réactivation (il fallait saisir le matricule). Elle s'affiche maintenant
    dans le réglage, avec le type d'absence, les dates, la mention « absence terminée » et un bouton « Réactiver
    l'empreinte » ;
  - cette liste est réservée à la validation RH (EMP) et au paramétrage des terminaux, parce que le type d'absence peut
    être médical.
- **Preuve** (serveur d'essai ; codes 11 et 030 en réactivation automatique, 60 en validation RH, délai de grâce 0) :
  1. absences du jour : les 3 salariés sont bloqués, avec un retrait mis en file pour chacun ;
  2. congé (030) remplacé par une maladie longue durée (60) : le blocage passe en validation RH ;
  3. absences terminées : mise à pied et congé réactivés automatiquement, avec renvoi mis en file ; maladie longue
     durée toujours bloquée et affichée « absence terminée » dans la liste RH ;
  4. clic sur « Réactiver l'empreinte » : blocage levé par l'administrateur, renvoi mis en file.

**Nouvelle vérification complète et version de démonstration autonome** (16/10/2026).

- **Corrigé** (`app/app.js`) :
  - accueil d'un salarié, carte « Mes demandes » : l'état était affiché brut (« refusee », « attente »). Il est
    maintenant traduit : Refusée, Acceptée, En instance, Annulée, en français, en anglais et en arabe ;
  - le terme interdit « paie » restait dans l'écran *Administration › Recette* : description, période, état mensuel,
    noms de la convention et de l'état créés par le jeu d'essai. Même chose en anglais (« payroll ») et en arabe
    (« الأجر »). Il est remplacé par « éléments variables » ou par « période ».
- **Vérifié, sans défaut trouvé** :
  - syntaxe des 60 fichiers JavaScript (`node --check`) et des manifestes JSON ;
  - les 54 écrans en mode serveur, sur deux serveurs d'essai (démonstration et 6 000 salariés) : aucune erreur
    JavaScript, aucune réponse HTTP en erreur ;
  - sécurité de l'API, 34 contrôles :
    - les 17 routes du cœur et des modules refusent l'accès sans session (401) ;
    - fichiers de données, clés, code et traversée de chemins (`..`, `%2e%2e`, `..%2f`) : 404, avec ou sans session ;
    - en-têtes CSP, X-Frame-Options, nosniff et Referrer-Policy présents ;
    - écriture refusée sans jeton CSRF, avec un jeton faux et depuis une autre origine (403) ;
    - aucun mot de passe ni secret dans `/donnees` ni dans les journaux ;
  - le terme « Paie » ne reste plus dans le code du serveur, les modules ni les pages publiques. Ses seules traces sont
    les règles de migration qui convertissent les anciennes données.
- **Version de démonstration** : `outils/construire-demo.js` produit `livraison/FIWAKTI-demo.html`. C'est un seul
  fichier de 2 Mo qui s'ouvre sans serveur ni réseau :
  - le cœur fonctionne sur le jeu d'exemple intégré, et rien n'est enregistré ;
  - les 10 modules rejouent les réponses de `outils/demo/modules-reponses.json` (52 réponses, enregistrées sur un
    serveur d'essai rempli de données fictives) ;
  - les écritures des modules sont appliquées en mémoire (`outils/demo/rejeu.js`). Une création s'ajoute aux listes,
    et une action (faite, analyse, clôture, réalisation, étape, tâche cochée) change l'état de l'élément. Les listes sont
    filtrées par statut comme sur le serveur. Rien n'est conservé à la fermeture.
  - **Preuve** (navigateur, ouverture en `file://`) :
    - 54 écrans ouverts, 0 erreur, 0 requête réseau ;
    - arabe en sens droite-à-gauche ; thème sombre ;
    - export Excel des employés téléchargé ;
    - première connexion d'un salarié (matricule 10402, changement de mot de passe, puis son accueil) ;
    - saisie dans le module HSE : « Enregistré ».

**« Salarié introuvable. » sur le bouton « Pointage du mois » de la liste Employés** (constat sur site, grand effectif).

- **Cause** (`app/app.js`) : le panneau du mois cherchait le salarié parmi ceux chargés dans le navigateur. En grand
  effectif, l'annuaire est paginé par le serveur : le salarié n'y est pas, d'où le message. Ensuite, le mois était
  calculé à partir des badgeages du navigateur, qui ne sont pas chargés dans ce mode : toutes les journées seraient
  apparues absentes.
- **Correction** :
  - `app/app.js` :
    - la fiche est chargée depuis le serveur (`/api/v1/employes/:mat`) ;
    - les journées du mois sont lues dans les calculs du serveur (`/api/v1/calcul/journees?mat=`) : horaire,
      badgeages, heures travaillées et théoriques, retard, absence ;
    - le changement de mois et l'export CSV du panneau utilisent les mêmes données ;
  - `serveur/calcul.js` : le total de journées gardé en cache tient compte du matricule. Sans cela, une liste filtrée
    sur un salarié affichait le total de tout le périmètre.
- **Preuve** (6 000 salariés) :
  - avant : « Salarié introuvable. » ;
  - après : le panneau s'ouvre ; septembre se charge au changement de mois ;
  - pour le salarié 101001, le 09/10 affiche 07:57 ▸ 17:11 ◂, 7:14 travaillées, −0:46, et le CSV contient la même
    ligne ;
  - la modification et l'enregistrement d'une fiche depuis la liste fonctionnaient déjà (« Enregistré »).

**Journées alternatives non appliquées, et faux « oubli de pointage » sur les équipes de nuit** (besoin exprimé sur
site : badgeages 14:00 et 23:00 → horaire du soir).

- **Constat** (version d'origine 56.33.10, vérifié avec les mêmes badgeages) :
  - l'écran *Calendrier* enregistre les journées alternatives et les signale (« +1 »), et son aide annonce que le
    système retient celle qui colle aux badgeages. Mais le calcul (`dayVars`) n'utilise que la journée principale.
    Exemple : 14:00 → 23:00 avec principale « matin » (06:00–14:00) et alternative « après-midi » (14:00–22:00) donne
    « matin » et 480 min de retard ;
  - la détection des anomalies lit les badgeages du jour calendaire. Une nuit 22:00 → 06:00 produit donc deux faux
    « oublis de pointage » : l'entrée seule le premier jour, la sortie seule le lendemain. Cela vaut aussi pour une
    équipe de nuit permanente, sans alternative.
- **Correction** (`app/app.js`, moteur partagé par le navigateur et le serveur) :
  - **choix de la journée** (`altChoisir`) : parmi la journée principale et ses alternatives, celle dont l'horaire
    est le plus proche des badgeages (écart à l'entrée + écart à la sortie). À égalité, la principale. Une journée ne
    peut être retenue que si son premier badgeage tombe le jour même. Sans badgeage, ou sur un jour de repos ou
    férié, la journée principale s'applique comme avant ;
  - le choix vaut pour la présence, le retard, le départ anticipé, les heures supplémentaires, les compteurs, les
    anomalies, le relevé du mois et les états. La journée retenue est affichée, et la principale reste connue
    (`principale`) ;
  - **nuit** : les badgeages du matin qui ferment la nuit de la veille (veille retenue en nuit, avec une entrée
    après midi) sont rattachés à cette nuit, et ne sont plus relus le lendemain ;
  - **anomalies** : calculées sur les badgeages de la journée de travail retenue, et non plus sur ceux du jour
    calendaire ;
  - l'aide de l'écran Calendrier décrit la règle appliquée, avec l'exemple 14:00 / 23:00 (FR, EN, AR).
- **Recalcul après une mise à jour du moteur** (`serveur/principal.js`) : au démarrage, l'empreinte de `app.js` est
  comparée à la précédente. Si elle a changé, les journées calculées sont effacées, puis recalculées avec les nouvelles
  règles. Avant, une correction du moteur ne s'appliquait aux jours déjà calculés qu'après un changement du
  paramétrage ou un recalcul demandé. Mesure sur 6 000 salariés : 15 jours servis en 64 ms juste après le démarrage.
- **Preuve** :
  - navigateur et serveur d'essai, journée principale « matin », alternatives « après-midi » et « nuit » :
    - 14:00 → 23:00 : après-midi, 9 h, retard 0, 60 min d'heures supplémentaires à valider ;
    - 22:05 → 06:02 : nuit, 7,95 h, aucune anomalie ; le lendemain, la sortie de 06:02 n'est plus relue ;
    - 06:10 → 14:00 : matin, retard 10 min, comme avant ;
    - sans alternative, résultat inchangé (retard 480 min) ;
  - équipe de nuit permanente : avant, deux « oublis » ; après, aucune anomalie et 8,05 h ;
  - 54 écrans sans erreur (démonstration et 6 000 salariés).

**Nouvelle règle « Badgeages répétés »** (besoin exprimé sur site : plusieurs badgeages en quelques minutes rendent le
salarié absent).

- **Constat** :
  - FIWAKTI n'écartait que les événements strictement identiques (même badgeage reçu deux fois) ;
  - quand la pointeuse ne fournit pas le sens, il est déduit par alternance. Deux badgeages à 07:58 et 07:59 deviennent
    « entrée, sortie », et toute la journée se décale : « oubli de pointage », présence non calculée.
- **Ajout** (`app/app.js`, moteur partagé par le navigateur et le serveur) :
  - règle `DOUBLON_MIN` au catalogue de *Administration › Règles*, groupe des tolérances, libellés FR / EN / AR ;
  - valeur en minutes, par défaut 0 (comportement inchangé) ;
  - comme les autres règles : pour toute la société, ou par établissement, site, service, équipe, planning,
    catégorie ou salarié, avec date d'effet ;
  - les badgeages d'un salarié séparés de N minutes au plus (secondes comprises) forment un seul badgeage : le
    dernier est compté ;
  - si le sens a été déduit par alternance, il est recalculé pour la suite de la journée. Si la pointeuse a fourni
    le sens, celui du dernier badgeage est gardé ;
  - s'applique à la présence, aux retards, aux anomalies, aux compteurs et au relevé du mois ;
  - les badgeages reçus ne sont jamais supprimés : ils restent visibles et traçables ;
  - modifier la règle relance le calcul de toutes les journées (règles = paramétrage global).
- **Preuve** :
  - navigateur, sens par alternance, 07:58 E, 07:59 S, 12:01 E, 13:00 S, 17:02 E :
    - règle à 0 : « oubli », présence non calculée ;
    - règle à 3 : 07:59 E, 12:01 S, 13:00 E, 17:02 S ; 8,07 h ; aucune anomalie ;
  - navigateur, sens fourni par l'appareil, double entrée 08:03 et 08:04 : 7,92 h, aucune anomalie ;
  - serveur d'essai, règle enregistrée comme depuis l'écran Règles : même résultat (8,07 h, aucune anomalie) ;
  - 54 écrans sans erreur.

**Affectation des calendriers en masse (par site, service…) sans effet en grand effectif** (constat sur site).

- **Cause** (version d'origine) : l'écran *Calendrier › Affectation en masse* sélectionnait les salariés parmi ceux
  chargés dans le navigateur. En grand effectif, l'annuaire est paginé par le serveur : presque aucun salarié n'est
  chargé, donc la sélection était vide ou partielle, et l'application n'enregistrait rien.
- **Correction** :
  - `serveur/principal.js` : nouvelle route `POST /api/v1/employes/calendrier-masse` ;
    - même sélection que l'écran : sites, services avec sous-services, champs à la date d'effet, calendrier actuel,
      salariés sortis inclus ou non ;
    - calculée sur tout le périmètre de l'utilisateur, avec le droit de modification des salariés exigé ;
    - sans `appliquer` : nombre de salariés, nombre à modifier et aperçu des 60 premiers ;
    - avec `appliquer` : historique de calendrier complété à la date d'effet (l'ancien calendrier reste avant cette
      date). L'enregistrement se fait par lots de 500 via la synchronisation : droits, périmètre, versions et conflits.
      Le calcul est ensuite relancé, et l'opération est tracée au journal d'audit (`calendriers.masse`) ;
  - `app/app.js` : en annuaire paginé, l'écran interroge cette route à chaque changement de filtre, puis l'appelle
    pour appliquer. Les fiches déjà ouvertes sont rechargées. En petit effectif, comportement inchangé.
- **Preuve** (6 000 salariés, vérifié en base) :
  - avant : population vide ;
  - après : 5 890 salariés au total, 242 pour le site 1 ; 242 affectés au calendrier choisi à partir du 01/10 ;
  - historique conservé (ancien calendrier jusqu'au 30/09) ; les 60 sortis du site non modifiés ; aucun autre site
    touché ;
  - petit effectif (démo) : inchangé, 5 salariés à modifier sur 5 ;
  - 54 écrans sans erreur.

**Jours fériés : table unique, heures fériées payées, férié travaillé sans double comptage** (besoin exprimé sur
site).

- **Constat** (version d'origine) :
  - un jour férié était une exception posée à la main dans chaque calendrier, et chaque année. Un calendrier oublié
    rendait les salariés absents injustifiés ;
  - `db.feries` était cité mais jamais utilisé ;
  - un férié travaillé était compté deux fois : en heures fériées (HFERIE) et en heures supplémentaires (HSJ1 / HSJ2),
    avec l'anomalie « heures sup. 480 min » à valider ;
  - aucune heure payée n'était comptée pour un férié chômé (seulement le nombre de jours, NBFERIE).
- **Ajouts** (`app/app.js`, moteur partagé par le navigateur et le serveur) :
  1. **écran *Temps & présence › Jours fériés*** (FR / EN / AR) :
     - liste par année : date, libellé, type « chômé payé » ou « chômé non payé », sites (aucun = tous) ;
     - bouton « Jours fériés tunisiens {année} », qui ajoute les 8 dates fixes. Les fêtes religieuses se saisissent
       chaque année, avec des libellés proposés (Aïd el-Fitr, Aïd el-Idha, Ras el Am el Hejri, Mouled) ;
     - droit de modification : paramétrage des calendriers (CAL config).
  2. **application automatique** (`dayInfo`) :
     - le jour férié s'impose à tous les calendriers et aux salariés des sites concernés ;
     - **écarté s'il tombe un jour de repos** du calendrier ;
     - une exception posée dans un calendrier reste prioritaire ;
     - les fériés posés à la main restent valables ;
     - le congé ne décompte pas le férié, et la grille du calendrier l'affiche.
  3. **férié travaillé** :
     - compté en heures fériées (FERIE_TRAV / HFERIE, avec la majoration R_FERIE_MAJ), **pas** en heures
       supplémentaires journalières ni hebdomadaires (HPSEM d'origine) ;
     - pas d'anomalie « heures sup. » ;
     - la nouvelle règle versionnée `FERIE_HS` (« Férié travaillé compté aussi en heures sup. », Non par défaut)
       rétablit le double comptage si la convention le prévoit ;
     - variable `R_FERIE_HS`.
  4. **férié chômé payé** :
     - nouvelle variable `FERIE_PAYE` : durée de la journée prévue par le calendrier, 0 si « non payé » ;
     - nouveau compteur standard `HFERIEPAY` « Heures fériées payées », ajouté automatiquement s'il manque.
- **Serveur** :
  - rubrique `feries` autorisée au droit CAL config (`perimetre.js`) ;
  - rattachée à FW-Time (`modules.js`) ;
  - sa modification relance tout le calcul (`calcul.js`, REF_GLOBALES).
- **Preuve** :
  - démo, calendrier « Administratif » :
    - 15/10 chômé : jour férié, théorique 0, HFERIEPAY 8 h, aucune anomalie ;
    - 15/10 travaillé 8 h : HFERIE 8 h, HSJ1 / HSJ2 = 0, aucune anomalie ; avec `FERIE_HS` = Oui, HSJ 2 + 6 et
      anomalie « heures sup. », comme avant ;
    - samedi 25/07 : repos dans le calendrier « Production » (férié écarté, 0 h) ; demi-journée dans
      « Administratif » (HFERIEPAY 4 h) ;
    - exception de calendrier : journée normale conservée ;
    - férié limité au site de Hammamet : appliqué aux seuls salariés de ce site ;
    - congé du 14 au 16/10 : 2 jours décomptés ;
  - serveur d'essai : liste enregistrée sans refus ; 15/10 recalculé en férié, sans anomalie, absent ou travaillé ;
  - 55 écrans sans erreur (6 000 salariés) ; journées alternatives et badgeages répétés inchangés.

**Compteurs (Arithmétiques) : assistant de formules** (besoin exprimé sur site : formules peu lisibles, aucune aide
en cas d'erreur de syntaxe).

- **Constat** (version d'origine) :
  - le contrôle de la formule n'était pas relancé pendant la saisie. `SI(PRESENCE > 8; PRESENCE - 8 ; 0`, à qui
    manque une parenthèse, restait affichée « ✓ Formule valide » ;
  - une variable mal orthographiée (`PRESENSE`) passait le contrôle, et l'erreur n'apparaissait qu'au calcul ;
  - les messages étaient bruts, sans position ni correction ;
  - les variables étaient une liste de codes non cliquables, sans catégories ;
  - une formule invalide pouvait être enregistrée ;
  - la description de THEORIQUE était écrasée par une autre traduction (« Durée théorique à exprimer entre 0 et 1440
    minutes »).
- **Ajouts** (`app/app.js`, `app/app.css`, FR / EN / AR) :
  - **contrôle pendant la frappe** (`formDiag`, même grammaire que le moteur) :
    - message clair et partie fautive surlignée dans la formule ;
    - **bouton « Corriger »** quand la correction est sûre : parenthèses manquantes ou en trop, variable ou fonction
      mal orthographiée (« Vouliez-vous dire PRESENCE ? »), opérateur ou « ; » en trop ;
    - nombre d'arguments faux, avec la syntaxe de la fonction ;
    - argument vide, opérateur manquant, `CUM` sur autre chose qu'un compteur, compteur qui s'utilise lui-même ;
  - **formule en clair**, par exemple : « si Heures pointées du jour > 8 alors Heures pointées du jour − 8, sinon 0 » ;
  - **essai immédiat sur une journée type** : un champ par variable utilisée, résultat recalculé à chaque frappe,
    rien n'est enregistré ;
  - **palette cliquable** :
    - variables classées (Temps de présence, Retards et écarts, Heures sup. / nuit / dimanche / férié et taux,
      Calendrier, Absences, Types d'absence, Autres compteurs) ;
    - fonctions avec leur syntaxe et un exemple ;
    - insertion à l'emplacement du curseur ; description au survol ;
  - **liste** : formules colorées (fonctions, variables, nombres), lecture en clair au survol ; formules invalides
    signalées avec leur message ;
  - **enregistrement refusé** si la formule est invalide, avec le message d'erreur ;
  - libellé de THEORIQUE corrigé (« Heures théoriques du jour »).
  - styles de l'assistant également intégrés à `app.js` : l'affichage reste correct si `app.css` n'a pas été mis à
    jour (constat sur site : formules sans couleurs).
- **Preuve** :
  - les 37 compteurs existants sont reconnus valides, sans faux positif ;
  - 10 erreurs types diagnostiquées avec la bonne position, dont 5 corrigées en un clic ;
  - essai : PRESENCE 10, THEORIQUE 8 → 2 ;
  - enregistrement d'une formule invalide refusé ;
  - moteur du serveur inchangé (journées et synthèse calculées) ;
  - 55 écrans sans erreur.

**Période « Du / au » : date de début postérieure à la date de fin acceptée sans message** (constat sur site).

- **Constat** (version d'origine) :
  - les couples de dates (Pointage, états en période, demandes d'absence, validation des journées, recalcul,
    clôture, délégations, règles versionnées, simulation de solde…) acceptaient une date de début après la date de
    fin, sans message ;
  - les écrans calculaient alors sur une période vide ou incohérente.
- **Correction** (`app/app.js`, contrôle commun à tous les écrans, FR / EN / AR) :
  - un couple est reconnu par ses attributs (`du` / `au`, `from` / `to`, `valid_from` / `valid_to`, `debut` / `fin`,
    même indice de ligne) ou ses identifiants (`…Du` / `…Au`) ;
  - si la date de début est après la date de fin : la saisie est refusée et la valeur précédente rétablie ;
  - les deux champs sont signalés en rouge et un message précise les deux dates et comment corriger (« modifiez
    d'abord la date de fin » pour déplacer une période) ;
  - l'écran ne reçoit jamais la période impossible ;
  - la saisie clavier jj/mm/aaaa n'est contrôlée qu'une fois la date complète : pas de blocage pendant la frappe.
- **Preuve** (démo) :
  - écrans réels : Pointage (`data-ptgp`), Clôture, Règles versionnées, délégation d'un compte → refus, valeur
    rétablie, message ;
  - balisage exact des autres écrans (demande, état en période, validation, recalcul, pointages serveur,
    délégation globale, simulation de solde, plusieurs lignes de délégation) → couple reconnu, début après la fin
    refusé, période correcte acceptée ;
  - 55 écrans sans erreur.

## Audit du sous-menu RH › Employés (vérification écran par écran)

Essais sur un serveur d'essai de 6 010 salariés (grand effectif : annuaire servi par le serveur, 50 lignes par page),
puis sur un serveur en petit effectif et dans la démonstration autonome. Chaque constat a été reproduit avant
correction, puis vérifié après.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Recherche par matricule : le salarié exact n'arrivait pas en tête | moyenne | matricule, CIN ou badge exact placé en tête (`serveur/annuaire.js`) |
| 2 | Recherche « Rechercher… » de l'en-tête : seulement dans les 50 lignes affichées | haute | envoyée au serveur, sur tout l'effectif |
| 3 | Filtres de colonnes Matricule / Nom / Prénom / CIN : seulement sur la page | haute | envoyés au serveur |
| 4 | Filtres Département / Site : choix limités aux valeurs de la page | haute | tous les services (avec leurs sous-services) et tous les sites |
| 5 | Colonnes CIN, e-mail, téléphone, badge, calendrier, accès : vides en grand effectif | moyenne | servies par l'annuaire (masquées si le profil masque les données personnelles) |
| 6 | Cocher une ligne ouvrait la fiche : sélection multiple impossible | haute | la case ne déclenche plus l'ouverture de la fiche |
| 7 | **CIN, badge ou matricule déjà attribués à un salarié non affiché acceptés** (badgeages attribués au mauvais salarié) | **critique** | contrôle d'unicité sur tout le personnel avant l'enregistrement (`POST /api/v1/employes/unicite`) **et** imposé par le serveur à chaque enregistrement (`serveur/donnees.js`) ; la fiche refusée est rétablie, message en FR / EN / AR |
| 8 | Onglet Contrat & horaires : responsable et équipe vides, poste vide | moyenne | responsable lu sur le serveur, équipe et collègues comptés sur le serveur (`chef=` dans l'annuaire), poste repris de la fiche |
| 9 | Modification du chef hiérarchique : liste limitée aux salariés chargés | haute | recherche sur tout l'effectif (saisie avec suggestions) ; un salarié ne peut pas être son propre responsable |
| 10 | Export « Export des données » (fiche des employés) : seulement les 50 lignes de la page | haute | tout l'effectif filtré (5 890 lignes à l'essai) |
| 11 | Export de la sélection : seulement les salariés chargés dans le navigateur | haute | fiches lues sur le serveur, sélection sur plusieurs pages |
| 12 | Export CSV/Excel : filtres Département et colonnes ignorés | moyenne | mêmes filtres que la liste |
| 13 | Colonne E-mail / Téléphone / Badge ajoutée : filtre limité à la page ; Entrée, Sortie… : filtre trompeur | moyenne | e-mail, téléphone et badge cherchés sur le serveur ; pas de filtre de page sur les autres colonnes en grand effectif |
| 14 | **Congé annuel : heures additionnées affichées en jours** (un jour de congé = « 8 j pris », solde 240 - 8) | **haute** | compteurs livrés corrigés : pris = heures / journée de base, solde = 30 j - pris ; migration unique des installations dont les compteurs sont restés d'origine (un compteur personnalisé n'est pas touché) |
| 15 | Absences d'un congé validé doublées à l'écran en grand effectif (9,5 j au lieu de 4) | haute | absences régénérées seulement en petit effectif ; en grand effectif elles viennent du serveur (les données du serveur n'étaient pas touchées) |
| 16 | Enregistrement pendant un recalcul en arrière-plan : « database is locked », erreur 500 (SQLite) | haute | verrou d'écriture pris à l'ouverture de la transaction et nouvel essai sans bloquer le serveur (60 s au plus) : 40 enregistrements sur 40 réussis sous charge de calcul, attente maximale 188 ms |
| 17 | Nouveau salarié : date d'entrée vide acceptée, aucun avertissement sans calendrier | moyenne | date d'entrée obligatoire (aujourd'hui par défaut) ; avertissement si aucun calendrier |
| 18 | « Today : » (typographie française en anglais), solde « 20.5 j » | faible | ponctuation selon la langue ; décimales 20,5 en français et en arabe |

Vérifié sans anomalie : les six onglets de la fiche, Fiche de pointage (badgeages et totaux), Historique, Fiche
complète, modification et enregistrement (persistance vérifiée sur le serveur), annulation avec confirmation,
contrôles e-mail / date de sortie / matricule verrouillé, « Enregistrer la vue », choix des colonnes, pagination,
sélecteur de site, cloisonnement par périmètre (un responsable ne voit que ses 7 salariés ; fiche, lot, comptage,
fiches complètes et écriture hors périmètre refusés), libellés anglais et arabes, Pointage du mois.

Non modifié (choix de conception) : un salarié ne se supprime pas depuis la liste ou la fiche ; on renseigne sa date
de sortie (les calculs s'arrêtent, l'historique est conservé).

**Notifications des demandes (constat, non modifié en attente de décision)** :
- aucun e-mail n'est envoyé par le serveur : il ne contient aucun code d'envoi ; l'écran des paramètres d'envoi
  (serveur, port, adresse d'expédition) enregistre les réglages, et « Tester l'envoi » affiche « Message de test remis »
  sans rien envoyer (il vérifie seulement que les champs sont remplis) ;
- les messages destinés à l'employé (demande acceptée, refusée, rectifiée, niveau franchi) sont créés mais ne sont
  affichés nulle part ; l'employé voit l'état de ses 5 dernières demandes en ouvrant son portail ;
- les valideurs, eux, voient les demandes à valider dans la cloche de notifications.

**Libellé** : l'export « Fichier netTime » s'appelle désormais « Export des données » (FR / EN / AR) ; le mot
n'apparaît plus dans l'application.

## Notifications des demandes : application et e-mail

- **Dans l'application** : les messages destinés à l'employé (demande acceptée, refusée, rectifiée, niveau franchi,
  demande à valider pour le valideur) s'affichent dans la cloche (« Mes notifications », non lus comptés) et dans le
  portail ; un clic les marque comme lus (enregistré sur le serveur) et ouvre le portail.
- **Par e-mail** (`serveur/courriel.js`, sans dépendance externe) : le serveur envoie chaque nouvelle notification à
  l'adresse de la **fiche du salarié** (onglet Identité & contact). Sans adresse : notification dans l'application seule.
  - Réglages : Administration › Sécurité › Messagerie (le bloc était masqué en version serveur). Sécurité « aucune »,
    STARTTLS (587) ou SSL/TLS (465) ; authentification PLAIN ou LOGIN ; certificat du serveur de messagerie vérifié.
  - Mot de passe du compte d'envoi : saisi à l'écran, gardé **chiffré** sur le serveur (clé « secrets »), jamais renvoyé
    au navigateur ni journalisé.
  - « Tester l'envoi » envoie réellement un message à l'adresse indiquée (avant : message « remis » sans aucun envoi).
  - Case « Envoyer les notifications des demandes par e-mail » ; dernier envoi (nombre, échecs) affiché.
  - Garde-fous : 60 e-mails par heure au plus par compte, liens retirés du texte (une notification peut être créée par
    tout utilisateur), adresses masquées dans le journal.
- Une absence confirmée ou un justificatif saisi par le responsable n'est plus annoncé « Votre demande … a été acceptée »
  mais « Absence non justifiée enregistrée dans votre dossier pour le 15/10/2026 » ; dates des messages en jj/mm/aaaa.
- Preuves : serveur de messagerie d'essai — test d'envoi reçu (authentification, accents et arabe corrects), STARTTLS
  chiffré, certificat non vérifiable refusé ; demande acceptée → e-mail reçu par le salarié, notification visible dans
  sa cloche et son portail, statut « lu » enregistré ; mot de passe absent des journaux.
- Au passage : l'envoi du référentiel des pointeuses à l'ouverture de session n'est plus tenté pour les profils sans
  droit de configuration des terminaux (erreur 403 inutile).

## Audit du sous-menu RH › Suivi des équipes & présences

Essais en grand effectif (6 010 salariés), en petit effectif et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Onglet « Pointages & présences » : statuts et compteurs calculés sur les seuls salariés chargés dans le navigateur (50 absents sur 5 890 attendus) | **haute** | statuts calculés par le serveur (`/api/v1/calcul/presences`) sur tout le périmètre : comptes par statut, page par page, mêmes règles que l'écran |
| 2 | Onglet « Annuaire & profils » : 50 salariés au lieu de 5 890 ; filtres sur la seule page | **haute** | annuaire du serveur : recherche, service et sous-services, équipe, contrat, sortis ; poste et contrat actuels fournis par le serveur |
| 3 | Filtre « Équipe de… » : seuls les responsables chargés étaient proposés | moyenne | recherche d'un responsable sur tout l'effectif |
| 4 | Ouvrir la fiche depuis une ligne du suivi : « Salarié introuvable » pour un salarié non chargé | haute | la fiche est chargée depuis le serveur |
| 5 | « Afficher plus (10 restantes) » alors qu'il restait 8 971 anomalies | moyenne | nombre restant pris sur le total du serveur |
| 6 | Bouton « Exporter » : fichier vide « Pas de données tabulaires pour cette vue » | haute | export de l'onglet affiché avec ses filtres : 9 011 anomalies, 35 340 journées, 5 890 salariés (toutes les pages) |
| 7 | Compteurs inchangés après une décision (« Tout 9011 » après confirmation) | moyenne | relecture des compteurs une fois l'enregistrement transmis (9011 → 9010 → 9007…) |
| 8 | Annulation d'une décision : message « modifications non enregistrées par le serveur » | moyenne | le journal d'audit est inaltérable : l'annulation y est tracée (type Annulation) au lieu d'effacer la ligne |
| 9 | Pendant un recalcul de fond (après une mise à jour) : « 0 anomalie — bravo » et « 0 sur 0 attendus » | haute | le serveur signale « calcul en cours » (résultats partiels non mis en cache) ; l'écran l'affiche et se met à jour seul ; les journées du jour sont assurées pour l'accueil |

Vérifié sans anomalie : périodes (aujourd'hui, hier, semaine ; hier, 7 jours, 30 jours), filtres par statut et par type,
recherche, sélection de service, correction des pointages d'une journée, justification, confirmation, traitement en
lot, annulation, indicateurs (présents, anomalies, heures supplémentaires, demandes), cloisonnement (le responsable ne
voit que les journées de ses 7 salariés, une équipe hors périmètre renvoie 0).

## Audit du sous-menu RH › Validation des journées

Essais en grand effectif (6 010 salariés, 9 004 journées en anomalie), en petit effectif (avec une période clôturée au
30/09/2026 et un second compte valideur) et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Ajustement de période antérieure validé sans effet** : l'écart était enregistré (variable `AJ_<compteur>`) mais aucune formule ne l'utilisait ; de plus l'écran ne chargeait pas les ajustements | **critique** | l'écart validé est ajouté au compteur ajusté le jour d'imputation (sauf si la formule utilise déjà `AJ_<compteur>`) ; ajustements chargés par l'écran (lecture seule). Preuve : Heures travaillées du 01/10 : 0 → 1,5 après validation |
| 2 | **Recalcul interrompu par un redémarrage resté « En cours » pour toujours** ; à deux, plus aucun recalcul possible (« Deux recalculs sont déjà en cours ») | **haute** | au démarrage, les recalculs interrompus passent en « Échec » avec la cause ; ils se relancent normalement |
| 3 | Cocher une journée : « Aucune journée cochée » (régression de la correction des cases de sélection du 17/10) | **haute** | une case qui porte sa propre action la garde ; les cases des listes (Employés) n'ouvrent toujours pas la fiche |
| 4 | Ajustement accepté pour un matricule inexistant (999999) | haute | salarié existant et en poste à la date d'origine exigés par le serveur |
| 5 | Journées à valider : seules les 100 premières visibles (9 004 en anomalie) ; registre : 200 sur 9 004 | haute | pagination de 100 en 100 avec « 1–100 sur 9 004 » |
| 6 | « Exporter » : fichier vide | haute | export de l'onglet affiché (journées de l'état choisi, registre filtré, ajustements), toutes les pages |
| 7 | Recherche de l'en-tête sans effet | moyenne | nom, prénom ou matricule, sur le serveur (« Gharbi » → 1 499 anomalies sur 9 004) |
| 8 | Codes techniques affichés (ABSENCE_UNJUSTIFIED, « majeure », « resolue ») | moyenne | libellés en français, anglais et arabe (Absence non justifiée, Majeure, Résolue…), code en infobulle ; nom du salarié dans le registre et l'historique |
| 9 | Ajustement : « Écart (heures) » et « +1.5 h » pour tous les compteurs (certains sont en minutes ou en jours) ; matricule saisi à la main | moyenne | unité du compteur affichée, recherche du salarié |
| 10 | Sans période clôturée, formulaire d'ajustement proposé puis refusé par le serveur | faible | explication à la place du formulaire (« corrigez directement la journée ») |
| 11 | Boutons « Valider » et « Rejeter » affichés sans aucune journée à traiter | faible | affichés seulement s'il y a des journées dans l'état à valider |
| 12 | Rapport de recalcul : codes des compteurs et « 28.57 » | faible | libellé et unité du compteur, décimales selon la langue ; salarié ciblé choisi par recherche |

Vérifié sans anomalie : validation (responsable, RH) d'une sélection et « Tout valider », rejet avec motif obligatoire,
historique de la journée (événements, anomalies, transitions), filtres du registre, refus des ajustements sans motif /
sur journée non clôturée / à écart nul, séparation des pouvoirs (l'auteur d'un ajustement ne peut pas le valider),
recalcul d'un salarié avec rapport avant / après / écart et rejet, contrôle de période (début après fin refusé),
cloisonnement par périmètre, libellés anglais et arabes.

## Audit du sous-menu RH › Demandes

Essais en petit effectif (circuit à deux niveaux, valideur réel « s.gharbi »), en grand effectif (6 010 salariés) et dans
la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Période mal enregistrée** : en saisissant d'abord la date de début (02/11) d'une période future, le contrôle « début après fin » (ajouté le 16/10) refusait la saisie et gardait l'ancienne date ; demande créée du 17/10 au 06/11 (21 jours) au lieu de 02/11 → 06/11 (5 jours) | **critique** (régression) | une date de début placée après la fin repousse la fin (au lendemain dans une demande, pour garder le mode « plage ») avec un message ; une date de fin avant le début reste refusée — dans tous les écrans |
| 2 | **Chevauchement accepté** : deux congés sur les mêmes jours pour le même salarié (simple avertissement) | **haute** | refus avec le détail de la demande existante (en attente ou acceptée) |
| 3 | Mode « Journée » : changer la date → « La date de fin précède la date de début » | haute | en mode Journée / Heures, la date de fin suit la date choisie |
| 4 | Demande déposée sur un jour de repos ou férié (0 jour décompté) | moyenne | refusée : « Aucun jour ouvré dans cette période » |
| 5 | Grand effectif : durée « 0 j », circuit et valideur introuvables (personne ne pouvait valider), choix du salarié limité aux 50 salariés chargés | **haute** | fiches complètes des demandeurs et de leurs responsables lues sur le serveur ; salarié choisi par recherche sur tout l'effectif (fiche chargée, circuit retenu, jours décomptés) |
| 6 | Matricule inconnu ou en cours de saisie : l'écran plantait (formulaire fermé) | haute | aucun circuit sans salarié ; message « Salarié inconnu ou hors de votre périmètre » |
| 7 | Demande encore en attente plus ancienne que la fenêtre de chargement (2 mois) : disparaissait de l'écran des valideurs | haute | les demandes en attente sont toujours chargées |
| 8 | Annulation d'une demande en attente immédiate, sans confirmation | moyenne | confirmation (type, dates, valideurs informés) |
| 9 | Boîtes de refus (demandes, corrections, …) : bouton « Supprimer » ; restauration, simulation, retour d'import : « Supprimer » | moyenne | « Refuser », « Restaurer », « Confirmer » |
| 10 | Export : dates 2026-09-08, statut « attente », ni nom ni durée, toutes les demandes quel que soit le filtre | moyenne | mêmes demandes que la liste (périmètre, site, état), nom, durée, statut en clair, valideur, dates jj/mm/aaaa |
| 11 | Historique : « Créée par Employé » quand un responsable ou les RH saisissent pour un salarié | faible | nom de l'auteur, origine en commentaire |
| 12 | Solde de congé dépassé sans avertissement ; « 0.5 j » | faible | avertissement « Solde de congé insuffisant : x j disponibles pour y j demandés » ; décimales selon la langue |

Vérifié sans anomalie : circuit à deux niveaux (validation du responsable → niveau suivant), refus avec motif obligatoire,
séparation des pouvoirs (seul le valideur du niveau ou son délégué valide ; l'administrateur seulement sans valideur
disponible — choix de conception), modification d'une demande en attente, demande en heures (fin avant début refusée),
demande de plus d'un an refusée, demi-journée, rectification (modification ou annulation) d'une demande acceptée,
filtres par état, cloisonnement (le responsable ne voit que son équipe).

## Audit du sous-menu RH › Mon équipe

Essais avec de vrais comptes de responsables (« s.gharbi », 4 salariés, petit effectif ; « chef.demo », 6 salariés,
grand effectif), l'administrateur, en format ordinateur et téléphone, et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Accepter une demande d'une période clôturée** : « Demande acceptée » affiché et notification « acceptée » envoyée au salarié, alors que le serveur refusait l'écriture (demande toujours en attente) | **haute** | décision impossible sur une période clôturée, dans tous les écrans (Mon équipe, Demandes, notifications) ; la carte l'explique (« corrigez par un ajustement de période antérieure ») |
| 2 | Cliquer sur un salarié : l'écran basculait vers Employés (interdit au responsable) puis l'Accueil ; en fermant la fiche, on perdait « Mon équipe » | haute | la fiche s'ouvre sur place, sur l'onglet Solde & pointages |
| 3 | « Corriger » un oubli de pointage ouvrait la fiche d'identité au lieu de la journée | haute | ouvre la correction des pointages de la journée concernée |
| 4 | Téléphone : la barre d'onglets du bas disparaissait en ouvrant Demandes / Suivi / Moi (aucun retour possible sauf par le menu) | moyenne | barre présente sur ces écrans (petit écran seulement) |
| 5 | « 0 présent(s) sur 4 » alors que les 4 salariés sont en repos | moyenne | présents sur les salariés attendus (repos, congés, fériés exclus) ; « Personne n'est attendu aujourd'hui » ; absents et oublis en tête de liste |
| 6 | Compte sans équipe directe (administrateur, RH) : liste arbitraire des salariés chargés en grand effectif, sans explication | faible | explication et accès au Suivi des équipes ; en petit effectif, la liste est intitulée « Votre périmètre » |

Vérifié sans anomalie : équipe directe (salariés dont la fiche désigne le responsable), statuts du jour, demandes à
valider avec circuit (acceptation → niveau suivant), refus avec motif obligatoire, oublis de pointage de la veille,
cloisonnement (le responsable ne voit que son équipe), libellés anglais et arabes.

## Audit du sous-menu RH › Mon espace

Essais avec de vrais comptes de salariés (« 10241 », petit effectif ; « 9004 », grand effectif de 6 010 salariés), un
responsable (« s.gharbi ») et l'administrateur, en format ordinateur et téléphone, en français, anglais et arabe, et
dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Badgeages inventés** : en mode serveur, avec le jeu d'exemple, le navigateur générait des badgeages aléatoires dès que moins de 40 pointages étaient chargés, ce qui est toujours le cas d'un salarié. Une journée sans badgeage s'affichait « Présent / En retard » avec des heures différentes à chaque connexion | **critique** | génération réservée à la démonstration autonome (jamais en mode serveur) ; la « simulation » des états est limitée de la même façon. Le portail affiche exactement les pointages enregistrés en base |
| 2 | **« Pointer entrée / sortie » sur l'accueil** : le pointage s'affichait comme fait (« ✓ Mon statut ») puis était rejeté par le serveur (profil en lecture sur les pointages) | **haute** | boutons affichés seulement si le profil peut réellement saisir un pointage (règle du serveur : PTG ≥ saisie), action refusée avec un message sinon |
| 3 | Menu « Visiteurs » visible pour le salarié, réponse 403 à l'ouverture | haute | menu masqué selon la règle du serveur (droit VIS, administrateur ou salarié qui reçoit des visites) |
| 4 | Raccourci « Pointages » de l'accueil vers un écran interdit : retour silencieux à l'accueil | moyenne | redirection vers « Mon espace » ; tout autre écran interdit affiche « Cet écran n'est pas ouvert à votre profil » |
| 5 | « Mes pointages » : liste brute des 12 derniers badgeages, sans heures travaillées ni journées incomplètes ou absentes | moyenne | tableau par journée sur 14 jours : badgeages, heures travaillées (même calcul que les écrans RH), statut (présent, retard, incomplet, absent, congé) |
| 6 | « Exporter » produisait un fichier vide | moyenne | export CSV / Excel de mes journées (matricule, date, badgeages, travaillé, statut) |
| 7 | Type « Absence non justifiée » proposé au salarié dans une demande | moyenne | réservé à la saisie administrative |
| 8 | Notifications rédigées dans la langue du validateur (un salarié arabophone recevait le texte en français) | moyenne | modèle et paramètres conservés : le message s'affiche dans la langue du lecteur (le texte figé reste le repli et sert à l'e-mail) |
| 9 | Téléphone : en-tête « Mon espace » haut de 510 px (cadre vide) ; filtre « Tous les sites » affiché au salarié | faible | en-tête ramené à sa hauteur utile (200 px) ; filtre masqué pour un profil salarié sans écran multi-salariés |
| 10 | Libellés : « Demandes en instance » pour l'état d'une demande ; indicateur « Mes pointages 0 » ambigu | faible | « En instance » ; « Badgeages aujourd'hui » (FR / EN / AR) |

Vérifié sans anomalie : accès limité à sa propre fiche, solde de congés, dépôt d'une demande (seul le salarié lui-même
est proposé, circuit affiché), suivi des demandes et de leur état, notifications marquées comme lues, grand effectif
(aucun chargement global), libellés anglais et arabes, démonstration autonome (55 écrans, aucune erreur).

Note : si le jeu d'exemple était actif sur une installation serveur, les badgeages inventés n'étaient affichés que
dans le navigateur ; ils n'ont été enregistrés que si l'utilisateur avait des droits d'écriture sur les pointages et
qu'un enregistrement a suivi. Si un salarié signale une journée qu'il n'a pas effectuée, contrôler cette journée dans
Pointages (terminal et provenance de chaque badgeage).

## Audit du sous-menu RH › Organigramme

Essais avec l'administrateur (petit effectif : 8 services, 15 salariés ; grand effectif : 303 services, 6 010 salariés),
un profil « Gestionnaire RH » (Employés en configuration, Paramétrage en lecture) et un profil en lecture seule, en
format ordinateur et téléphone, en français, anglais et arabe, et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Responsable de service, grand effectif** : la liste ne proposait que les ~50 salariés chargés dans le navigateur (sur 6 010) ; un responsable non chargé apparaissait « — », et le circuit « Responsable du service » ne le trouvait pas | **haute** | nom du responsable affiché, choix par recherche sur tout le personnel (« Modifier »), fiches des responsables chargées au démarrage : le circuit les résout |
| 2 | **Responsable enregistré à chaque frappe** : en grand effectif, taper « Z » enregistrait « Z » comme responsable (matricule inexistant) | **haute** | enregistrement à la validation du choix seulement ; matricule vérifié (salarié actif, contrôle serveur en grand effectif) |
| 3 | **Droits** : le profil « Gestionnaire RH » ouvrait l'écran en écriture ; ajout, suppression, propriétés et responsable affichaient « Enregistré » / « supprimé », puis le serveur refusait (il exige le Paramétrage en configuration) | **haute** | boutons et panneau d'ajout selon la règle du serveur ; explication affichée ; action refusée même si elle est déclenchée autrement |
| 4 | **Suppression d'un service ayant des salariés** (« Ressources humaines », 2 salariés) : acceptée, les salariés restaient rattachés à un service inexistant | **haute** | suppression refusée tant que des salariés actifs sont rattachés au service ou à ses sous-services (comptes du serveur en grand effectif) |
| 5 | Impossible de **renommer ou déplacer** un service (seule solution : supprimer et recréer, en perdant les rattachements) | moyenne | « Renommer / déplacer » : nom et service parent, sans possibilité de boucle (un service ne peut pas passer sous l'un de ses sous-services), tracé dans le journal |
| 6 | **Doublon** : deux « Production » sous le même parent acceptés ; nom vide refusé sans message | moyenne | doublon refusé (casse et espaces ignorés) ; message « Champ obligatoire : Nom » |
| 7 | La **recherche** de l'en-tête ne filtrait pas l'arbre | moyenne | filtre sur le nom, les propriétés, le responsable et (petit effectif) les salariés, avec les services parents ; « Aucun service ne correspond » |
| 8 | Service dont le parent a été supprimé : **absent de l'arbre** | moyenne | affiché à la racine |
| 9 | **Performance grand effectif** : 303 listes de 51 options (15 453 options, 18 824 éléments), affichage 173 ms | moyenne | 304 options, 3 977 éléments, affichage 28 ms |
| 10 | Effectif : seul le nombre de rattachés directs ; « Direction générale » sans effectif | faible | « directs / avec sous-services » (ex. 0 / 14), infobulle explicative ; sens de lecture conservé en arabe |
| 11 | Export : parent sous forme d'identifiant seulement, sans responsable ni effectif | faible | colonnes ajoutées (chemin complet, matricule et nom du responsable, effectifs direct et total), anciennes colonnes conservées en tête pour la compatibilité ; tri par chemin |
| 12 | Liste « Rattaché à » : noms seuls (homonymes indiscernables), identifiants non échappés | faible | chemin complet trié (« Direction générale › Production › … »), valeurs échappées |

Vérifié sans anomalie : pliage / dépliage des branches, propriétés personnalisées (ajout, modification, suppression,
propagation aux sous-services), corbeille et annulation, salariés listés sous leur service (petit effectif), lecture
seule, libellés anglais et arabes, téléphone sans débordement, démonstration autonome (55 écrans, aucune erreur).

## Audit du sous-menu RH › Champs employés

Essais avec l'administrateur sur le petit effectif (3 champs GRADE, STATUT, CATÉGORIE ; 12 salariés avec historique ;
profil « Gestionnaire éléments variables » au périmètre filtré sur STATUT = Titulaire) et le grand effectif (6 010
salariés), en français, anglais et arabe, et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Renommer le code** d'un champ (STATUT → STATUT2) était accepté sans avertissement : les valeurs historisées des salariés restaient sous l'ancien code (champ vide partout), le filtre du profil devenait invisible dans l'écran Profils mais restait appliqué | **critique** | code figé dès la création (lecture seule, explication) ; refusé aussi s'il est modifié autrement ; le nom affiché reste modifiable |
| 2 | **Retirer une valeur** (« Titulaire ») utilisée par un filtre de périmètre : acceptée ; le profil affichait « Tous » alors que le filtre « Titulaire » restait appliqué | **haute** | retrait refusé tant que la valeur filtre un profil, un compte ou un état (liste des éléments concernés) |
| 3 | **Décocher « Utilisable comme filtre »** alors qu'un profil filtre sur ce champ : le filtre disparaissait des écrans mais restait appliqué | **haute** | refusé tant que des filtres l'utilisent |
| 4 | **Suppression** : « Aucun autre enregistrement ne dépend de cet élément » alors que 12 salariés avaient une valeur (comptage sur un champ `cf` inexistant, côté écran et côté serveur) ; suppression possible d'un champ utilisé par un périmètre | **haute** | comptage sur l'historique réel (écran et serveur : 12 au lieu de 0) ; comptes et états filtrants ajoutés aux impacts ; suppression refusée si le champ filtre un périmètre ou un état |
| 5 | **Codes réservés** acceptés (NOM, SITE, MATRICULE…, ou suffixe _DEPUIS) : ils entraient en conflit avec les colonnes standard de l'import des employés | moyenne | refusés avec explication |
| 6 | Saisie du code : « Échelon » devenait « CHELON » (lettre accentuée supprimée) | faible | accents convertis (« ECHELON ») |
| 7 | Valeurs possibles en double (« CDD » deux fois) conservées | faible | doublons retirés (casse ignorée) |
| 8 | Aucune visibilité sur l'utilisation d'un champ | faible | le panneau indique « Utilisé comme filtre : Profil « … » = valeur » |
| 9 | Installations existantes : un filtre déjà orphelin (champ supprimé ou valeur retirée avant cette correction) restait appliqué sans être visible | moyenne | encadré « Filtres invisibles à corriger » sur l'écran Champs employés, avec l'élément, le code et la valeur à corriger |

Vérifié sans anomalie : création (code, nom, valeurs, filtrable), doublon de code (casse ignorée), corbeille,
historique daté dans la fiche employé, export, libellés anglais et arabes, démonstration autonome (55 écrans, aucune
erreur).

## Audit du sous-menu Temps & présence › Registre détaillé des pointages

Essais avec l'administrateur sur le petit effectif (15 salariés, clôture au 30/09/2026) et le grand effectif (6 010
salariés, calcul serveur), sur les onglets Journées, Journal, Synthèse, Hebdomadaire et Régularisation, leurs filtres,
l'ajout manuel d'un badgeage et les exports, et dans la démonstration autonome.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **« Injecter les badgeages simulés »** proposé sur une installation réelle : un clic créait des badgeages fictifs (source « badge ») pour tout le mois, sur tous les salariés sans pointage | **critique** | bouton et action réservés à la démonstration ; refus explicite sinon |
| 2 | **Ajout manuel d'un badgeage** : période clôturée (« Enregistré » puis refus du serveur), date future (01/12/2026), doublon exact (même minute, même sens) et date hors de la période d'emploi (salarié sorti) étaient acceptés | **haute** | contrôles avant enregistrement, avec message précis (clôture, futur, doublon, période d'emploi) |
| 3 | **Grand effectif, Régularisation** : « Aucune anomalie — toutes les journées sont complètes » alors que l'écran ne regardait que les badgeages chargés dans le navigateur (aucun en grand effectif) | **haute** | journées incomplètes calculées par le serveur sur tout le périmètre (date, salarié, service, badgeages), bouton « Corriger » vers l'éditeur de journée, pagination, export |
| 4 | **Grand effectif, Hebdomadaire** : calculé sur la cinquantaine de salariés chargés (sur 6 010) et présenté comme complet | **haute** | totaux hebdomadaires du serveur sur tout le périmètre (jours travaillés, théorique, travaillé, écart après absences justifiées, dépassements journaliers, journées incomplètes) ; la ventilation par taux reste dans les compteurs et les états (note affichée) |
| 5 | **Grand effectif, Journal** : second sélecteur de dates (hier → aujourd'hui) contredisant la période de l'écran ; « Aucun badgeage » sur 7 jours alors que la base en comptait 84 ; filtres service / équipe / site ignorés ; compteur « 5 890 au total » (nombre de salariés) | **haute** | période, recherche, service, équipe et site de la barre de l'écran (filtres ajoutés au serveur) ; compteur = nombre de badgeages ; 85 badgeages affichés, 68 pour « Atelier montage » |
| 6 | **Export « Exporter (CSV) »** : tous les badgeages chargés, sans période ni filtre, dates AAAA-MM-JJ ; l'onglet Régularisation exportait les badgeages au lieu de ses lignes | moyenne | chaque onglet exporte ses lignes (période, filtres, recherche), dates jj/mm/aaaa, nom et service ajoutés ; export Régularisation et Hebdomadaire (y compris grand effectif, sur tout le périmètre) |
| 7 | **Salarié sorti** (sorti le 28/02/2026) listé dans Journées et Hebdomadaire avec des heures théoriques après sa sortie | moyenne | salariés hors contrat sur la période exclus ; jours avant l'entrée et après la sortie ignorés (85 → 79 journées) |
| 8 | Synthèse : dates DU / AU de l'export au format AAAA-MM-JJ | faible | jj/mm/aaaa |
| 9 | Pagination hebdomadaire et synthèse en grand effectif : « 50 sur 5 890 journées » au lieu de salariés | faible | « salariés » (FR / EN / AR) |

Vérifié sans anomalie : pagination du Journal (150 lignes par page), dates inversées refusées avec explication,
filtres de colonnes, filtre service, recherche, Synthèse (semaine, mois, période), éditeur de journée, clôture affichée,
démonstration autonome (55 écrans, aucune erreur).

## Audit du sous-menu Temps & présence › Calendrier

Essais avec l'administrateur sur le petit effectif (calendrier « Administratif — 44 h », 6 salariés, clôture au
30/09/2026) et le grand effectif (6 010 salariés), sur la grille (mois, année, journées principales et alternatives),
la fiche du calendrier, la trame hebdomadaire, la suppression et l'affectation en masse, et dans la démonstration.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Trame hebdomadaire sans date d'effet** : passer le lundi en repos transformait aussi tous les lundis passés, périodes clôturées comprises (14/09 : 8 h → 0 h théorique), et faussait les heures déjà validées | **critique** | trame datée : « Trame modifiée applicable à partir du » (par défaut le lendemain de la clôture) ; les journées antérieures gardent la trame en vigueur, listée sous « Trames antérieures » ; même calcul dans le navigateur et sur le serveur (vérifié : 12/10 repos, 14/09 inchangé) |
| 2 | **Pinceau sur un jour clôturé** (15/09 → repos) : accepté, journée clôturée modifiée (8 h → 0 h) | **haute** | jours clôturés hachurés et verrouillés ; peinture refusée (ou limitée aux jours ouverts, avec le nombre de jours écartés) |
| 3 | **« Effacer les exceptions » sans sélection** : supprimait toutes les exceptions du calendrier, périodes clôturées comprises | **haute** | seules les exceptions des jours ouverts sont effacées, avec leur nombre |
| 4 | **Suppression d'un calendrier utilisé** (6 salariés ; 6 010 en grand effectif) : acceptée, les journées passées perdaient leur horaire théorique | **haute** | refusée tant que des salariés l'ont dans leur historique d'affectation (comptage serveur en grand effectif) |
| 5 | **Affectation en masse avec une date d'effet clôturée** (01/09) : proposée et applicable (petit et grand effectif) | **haute** | refusée dans l'écran (bouton désactivé, explication) et par le serveur (409) |
| 6 | Aucune protection côté serveur : un client pouvait réécrire un calendrier sur une période clôturée | **haute** | le serveur refuse toute modification d'exception ou de trame en vigueur jusqu'à la clôture (vérifié par un contournement de l'écran : base inchangée) |
| 7 | Zone « Rechercher… » sans effet sur l'écran Calendriers | faible | retirée |

Vérifié sans anomalie : sélection (clic, Maj+clic, jours de la semaine, tout, rien), vues mois / année, journées
alternatives, nouveau calendrier (copie ou trame, nom en double refusé), fiche (nom, site), jours fériés de la table
commune, affectation en masse (aperçu, filtres, application), libellés FR / EN / AR, démonstration autonome (55 écrans,
aucune erreur).

## Audit du sous-menu Temps & présence › Journée type

Essais avec l'administrateur sur le petit effectif (6 journées types, « Journée normale 8 h » utilisée par 2
calendriers, clôture au 30/09/2026), en contournant aussi l'écran pour contrôler le serveur, et dans la démonstration.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Modifier une journée type réécrivait l'historique** : théorique, plages, tolérances et nuit s'appliquaient à toutes les journées passées, périodes clôturées comprises | **critique** | définition datée : à l'enregistrement, la définition en vigueur est conservée pour les journées jusqu'à la clôture (« Définitions antérieures ») ; la modification s'applique à partir du lendemain ; même moteur navigateur / serveur (vérifié : théorique 480 → 420 min, 13/10 = 7 h, 14/09 clôturé = 8 h) |
| 2 | **Heures non recalculées après modification** : le cache des calculs comparait seulement la longueur du paramétrage (480 → 420 min ou 10 → 15 min ignorés jusqu'au rechargement) | **haute** | signature sur le contenu, relue après chaque enregistrement (journées types, calendriers, conventions, types, règles, fériés) |
| 3 | Aucune protection serveur : un client pouvait modifier la définition d'une journée type sur la période clôturée | **haute** | refus du serveur (vérifié par contournement : base inchangée) |
| 4 | **Suppression d'une journée type utilisée** par 2 calendriers : acceptée (jours sans horaire dans la trame) | **haute** | refusée avec la liste des calendriers concernés (trame, trames antérieures, exceptions, journées alternatives) |
| 5 | Tolérances négatives ou excessives acceptées (−10, 500 min) | moyenne | 0 à 240 minutes |
| 6 | Pause de −30 min ou de 600 min (plus longue que sa plage de 120 min) acceptée ; limite et pénalité négatives possibles | moyenne | durée entre 1 minute et la longueur de la plage ; limite et pénalité positives |
| 7 | Théorique de 12 h sur des plages de travail de 8 h accepté sans alerte | moyenne | refusé : le théorique ne peut dépasser la durée des plages de travail (nuit à cheval sur minuit comprise) |
| 8 | Deux journées types du même nom (« Journée normale 8 h ») acceptées | faible | refusé (casse ignorée) |

Vérifié sans anomalie : création, plages (obligatoire, flexible, pause, nuit), chevauchement refusé, aperçu de la
bande horaire, couleur, libellés FR / EN / AR, démonstration autonome (55 écrans, aucune erreur).

## Audit du sous-menu Temps & présence › Type de temps

Essais avec l'administrateur sur le petit effectif (14 types, « Congé annuel » code 030 utilisé par 11 demandes ou
absences et par la formule CONGE = TT_030 / BASEJOUR, clôture au 30/09/2026), en contournant aussi l'écran pour
contrôler le serveur, et dans la démonstration.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Code modifiable** (030 → 300) sans avertissement : la formule du solde de congés (TT_030), la logique liée aux codes système (congé annuel, absence non justifiée, blocages biométriques) et les exports cessaient silencieusement de fonctionner | **critique** | code figé dès la création (lecture seule, explication) ; refusé aussi par le serveur |
| 2 | **Mode de saisie** « En journées » → « En heures » accepté alors que 11 demandes ou absences existaient en journées (durées réinterprétées) | **haute** | refusé dès qu'une demande ou une absence existe ; créer un nouveau type |
| 3 | **Classe** (Congé → Productif) et **« Rémunéré »** modifiables alors que le type est utilisé en période clôturée (calcul des périodes clôturées réécrit) | **haute** | refusés si le type est utilisé en période clôturée (2 absences / demandes ici) |
| 4 | **Suppression** d'un type utilisé par des demandes ou absences, ou d'un type système (030, 031, 034, 035, 040) : acceptée | **haute** | refusée, avec le nombre d'usages ou la mention « type système » |
| 5 | Aucune protection serveur : un client pouvait changer le code ou le mode de saisie | **haute** | le serveur vérifie sur toute la base (absences et demandes) ; contournement testé : base inchangée |
| 6 | Passer la classe en « Productif » décochait « Reportable » sans le rétablir au retour (le Congé annuel perdait son report) | moyenne | « Reportable » rétabli quand on revient à une classe d'absence dans la même modification |
| 7 | « Jours maxi » sans limite haute (99 999) | faible | entre 0 et 3 660 |
| 8 | Deux types du même nom acceptés ; aucune indication d'usage | faible | nom en double refusé ; le panneau indique l'usage (demandes / absences, dont période clôturée) et les types système |

Vérifié sans anomalie : création, code en double (espaces et casse ignorés), classes, couleur, saisie réservée à
l'administration, report et jours maxi, libellés FR / EN / AR, démonstration autonome (55 écrans, aucune erreur).

## Audit du sous-menu Temps & présence › Arithmétique

Essais avec l'administrateur sur le petit effectif (37 compteurs : heures, heures supplémentaires, congés —
SOLDECONGE = 30 − CUM(CONGE) —, majorations ; clôture au 30/09/2026), en contournant aussi l'écran pour contrôler le
serveur, et dans la démonstration.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Dépendance circulaire acceptée** (A = CUM(B), B = CUM(A)) : TOUS les compteurs cessaient d'être calculés — heures travaillées 8,18 h → 0, solde de congés 30 → 0 — sans autre signe qu'une note sur l'écran | **critique** | refusée à l'enregistrement, avec le chemin de la boucle (« ESSAIB → ESSAIA → ESSAIB ») |
| 2 | **Formule modifiée = périodes clôturées recalculées** (heures, congés, éléments variables déjà arrêtés) | **critique** | formule datée : la formule en vigueur est conservée pour les journées jusqu'à la clôture (« Formules antérieures ») ; vérifié : HT = THEORIQUE × 2 → 14/09 clôturé reste 8 h, 13/10 = 16 h ; même moteur navigateur / serveur |
| 3 | **Code renommé** (CONGE → CONGES) accepté : la formule de SOLDECONGE et les états qui l'utilisent étaient cassés | **haute** | code figé dès la création ; refusé aussi par le serveur |
| 4 | **Suppression** d'un compteur utilisé : « Aucun autre enregistrement ne dépend » alors que SOLDECONGE et l'état « Suivi des congés » l'utilisent (les états étaient cherchés dans le mauvais champ) | **haute** | refusée avec la liste des formules et états concernés ; impacts corrigés |
| 5 | Unité, périodicité et agrégation modifiables après une clôture (résultats des périodes clôturées changés) | **haute** | refusées après une clôture : créer un nouveau compteur |
| 6 | Aucune protection serveur (code, formule de la période clôturée, suppression) | **haute** | contrôle serveur ; contournement testé : base inchangée |
| 7 | Aucune indication des dépendances d'un compteur | faible | le panneau indique « Utilisé par … » |

Vérifié sans anomalie : variable inconnue refusée avec suggestion (« PRESENSE » → « PRESENCE »), auto-référence refusée,
assistant de formule (coloration, essai, palette), division par zéro sans erreur, libellés FR / EN / AR, démonstration
autonome (55 écrans, aucune erreur).

## Correctif 2 — règle « Badgeages répétés » (DOUBLON_MIN)

Signalement après installation : règle publiée à 3 min pour toute la société, journée du 17/10 avec 5 badgeages à 19:43
et 4 à 20:19 (pointeuse qui alterne Entrée / Sortie à chaque passage) : « le système accepte tous les pointages ».
Reproduit à l'identique sur le grand effectif (6 010 salariés) puis sur le petit effectif.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Sens après regroupement** : chaque groupe gardait le sens de son dernier badgeage ; avec une pointeuse qui alterne, il restait 19:43 Entrée et 20:19 **Entrée** → journée incomplète, heures non comptées (serveur : travaillé vide) | **haute** | un groupe qui mêle entrées et sorties prend le sens attendu après le groupe précédent : 19:43 Entrée, 20:19 Sortie → 0:36 travaillé, journée complète (même moteur navigateur / serveur) |
| 2 | **Affichage** : le registre (calcul serveur) montrait les 9 badgeages reçus, sans distinguer ceux écartés par la règle — d'où l'impression que la règle était ignorée | moyenne | badgeages retenus seuls, suivis de « (7 répété(s) écarté(s)) » ; dans le Journal, chaque badgeage écarté porte « répété — écarté » (tous restent enregistrés) |
| 3 | **Contrôles « journée incomplète »** (Régularisation, Hebdomadaire, Journal, Suivi, fiche salarié, tableau de bord…) sur la liste brute : des journées rendues complètes par la règle restaient signalées | moyenne | un seul contrôle, sur les badgeages retenus par la règle ; côté serveur, le nombre de badgeages du statut « incomplet » porte aussi sur les retenus |

Vérifié : serveur 0,6 h (19:43 E, 20:19 S, 7 écartés) ; petit effectif 07:56 E – 16:58 S = 7,03 h, journée absente de la
Régularisation ; installation simulée (empreintes, démarrage, 16 écrans sans erreur) ; démonstration autonome sans erreur.
Au premier démarrage, le changement de moteur déclenche le recalcul des journées en arrière-plan.

## Correctif 3 — recherche d'un salarié dans le registre (grand effectif)

Signalement : Registre détaillé des pointages › Journées, filtre « khald » dans la colonne Employés → « Rien à afficher »,
alors que « 1–100 sur 42 007 journées » restait affiché.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Le filtre de la colonne Employés n'était pas transmis au serveur (lu sous une clé « ptg » alors que les tableaux rangent leurs filtres sous « jours », « synthese », « semaines », « regul ») : il ne cherchait que dans la page affichée (100 lignes) | **haute** | filtre Employés / Matricule de l'onglet affiché transmis au serveur ; page 1 à chaque changement de filtre |
| 2 | Recherche à l'expression exacte : « asma baccouche » ne trouvait pas « Baccouche Asma », « 200 Khaldi Fethi » (valeur choisie dans la liste) ne correspondait pas côté serveur | moyenne | recherche par mots, dans n'importe quel ordre, côté serveur et dans les filtres de colonne de tous les tableaux |

Vérifié sur 6 010 salariés : « bacc » → 2 100 journées ; valeur choisie dans la liste → 7 journées du salarié ;
« asma baccouche » → résultats ; synthèse filtrée (300 salariés) ; installation simulée et démonstration sans erreur.
Livraison : FIWAKTI-56.33.11-correctif-3.zip (cumulatif : app.js, moteur.js, calcul.js).

## Correctif 4 — Temps et présence › Règles versionnées

Analyse complète du sous-menu (écran, publication, retrait, simulation, règle effective, établissements), du calcul des
compteurs alimentés par les règles (`compteursRegles`, `regleEff`) et du contrôle serveur (`controleReglesV`).
Les anomalies 1 à 8 et 11 ont été reproduites avant correction sur le moteur réel (`app.js` chargé comme par
`serveur/moteur.js`) et sur une vraie base SQLite (`D.synchroniser`, même fonction que l'enregistrement de l'écran) ;
les anomalies 9, 10 et 12 à 14 ont été relevées à la lecture du code. Les corrections ont été vérifiées dans Chromium (démo).

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Publier une nouvelle version d'une règle dont la version précédente avait une date de fin : l'écran ramenait cette fin à la veille, le serveur refusait alors **tout** l'enregistrement des règles (« fin de validité déjà fixée »). L'écran affichait « Règle enregistrée » : la version n'existait que dans le navigateur, jamais dans les calculs du serveur | **haute** | une nouvelle version remplace la précédente à partir de sa date **sans la modifier** (succession calculée à la date : la version de date de début la plus récente l'emporte) ; la fin effective est affichée dans la liste |
| 2 | Retrait d'une version future : la version précédente, close la veille par la publication, ne s'appliquait plus (trou : retour à la valeur par défaut) | **haute** | conséquence du point 1 : rien n'est modifié à la publication, le retrait rétablit donc la version précédente |
| 3 | Publier une version datée **avant** une version déjà prévue (ex. v3 au 01/04 alors que v2 est prévue au 01/07) : v3 l'emportait aussi après le 01/07 (rang par numéro de version), v2 était annulée sans le dire | **haute** | rang par date de début puis priorité puis version : v2 reste prévue à sa date |
| 4 | Règles par département ou service : une règle du département parent l'emportait sur celle du département du salarié dès qu'elle avait une version ou une priorité plus élevée | **haute** | le département le plus proche du salarié l'emporte, puis date, priorité, version |
| 5 | Valeur vide acceptée pour les taux, durées et seuils : « Seuil du second taux » vide = 0 → toutes les heures supplémentaires au second taux ; taux vide = 0 % ; durée de pause vide = 0 | **haute** | saisie refusée (sauf seuil journalier et tolérances, où « vide » a un sens) ; une version déjà publiée sans valeur garde la valeur par défaut |
| 6 | Pause « flexible » : la fenêtre était ignorée (une pause badgée à 9 h comptait comme pause de midi) | moyenne | seule la pause badgée dans la fenêtre compte ; le complément jusqu'à la durée minimale est déduit |
| 7 | Pause « forfaitaire » : badger 1 minute de pause suffisait à annuler la déduction d'une heure | moyenne | durée déduite moins la pause déjà badgée |
| 8 | Pauses « payée » et « non payée » proposées sans aucun effet | moyenne | payée : pause badgée comptée comme travaillée dans la limite de la durée (variable `PAUSE_PAYEE`) ; non payée : pause badgée non comptée (comportement existant, désormais documenté) |
| 9 | Règle effective non recalculée après la mutation d'un salarié (site, service, planning, catégorie, équipe) tant que la page n'était pas rechargée | moyenne | cache des règles effectives vidé à chaque enregistrement |
| 10 | Publication d'un brouillon daté dans le passé sans la confirmation exigée à la création | moyenne | même confirmation « publication rétroactive » |
| 11 | Serveur : versions incohérentes acceptées si envoyées directement à l'API (fin avant début, taux négatif, niveau inconnu, cible vide, date invalide) | moyenne | refusées par `controleReglesV` (de même qu'une version marquée « simulation ») |
| 12 | Grand effectif : onglet « Règle effective » bloqué sur « Choisissez un salarié » pour un salarié absent de la page chargée | moyenne | salarié chargé depuis le serveur |
| 13 | Saisie : minutes et pourcentages sans borne, matricule inexistant accepté, valeur hors liste acceptée, espaces autour de la cible | basse | minutes ≤ 1 440, pourcentages ≤ 1 000, matricule vérifié, choix vérifié, cible nettoyée (libellés fr / en / ar) |
| 14 | Dates en aaaa-mm-jj dans le journal d'audit et la colonne Statut | basse | jj/mm/aaaa |

Vérifié : 30 tests unitaires et d'enchaînement (écran → serveur), dont publication / version antérieure / retraits
successifs ; vraie base SQLite (l'ancien écran perd la version, l'écran corrigé l'enregistre, l'API refuse les versions
incohérentes) ; non-régression sur le jeu de démonstration : compteurs **identiques** à l'ancien moteur sans règle et avec
des règles « société » (nuit, taux d'heures supplémentaires, tolérance, dimanche) ; Chromium : saisie vide refusée,
publication de deux versions (fin effective 31/05/2027 affichée), retrait (version précédente « sans fin » rétablie),
règle effective au 01/08/2027, aucune erreur JavaScript ; `node --check` sur les fichiers modifiés ; démonstration reconstruite.

À valider par le métier (non modifié) :
- **Pauses forfaitaire / flexible** (points 6 et 7) : la déduction complète la pause badgée jusqu'à la durée de la règle.
  Si l'entreprise veut l'ancien comportement (aucune déduction dès qu'une pause est badgée), le signaler.
- **« Autorisation des heures supplémentaires »** (constatées / préautorisées / à régulariser) et **« Récupération :
  compteur spécifique »** sont enregistrées mais **n'ont aucun effet sur les calculs** : il n'existe pas de saisie des
  autorisations préalables. À traiter comme une évolution, ou à masquer.
- Le rattachement d'un site à un établissement n'est pas daté : le changer modifie le niveau « établissement » pour
  toute la période non clôturée.
- Grand effectif : les listes « Équipe » et « Catégorie » du formulaire sont proposées à partir des salariés chargés dans
  la page (la saisie libre reste possible pour la catégorie).

Livraison : FIWAKTI-56.33.11-correctif-4.zip (cumulatif : app.js, moteur.js, calcul.js, donnees.js — contient les
correctifs 2 et 3). Au premier démarrage, le changement de moteur déclenche le recalcul des journées en arrière-plan.

## Correctif 5 — Contrôle d'accès (Accès, Zones, Plages d'accès, Plans d'accès)

Analyse des 4 écrans du menu, de l'onglet « Accès » de la fiche salarié, de l'envoi des utilisateurs aux appareils
(`pointeuses.js`) et de la synchronisation automatique (`biosync.js`).

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | **Les droits d'accès n'étaient jamais appliqués aux lecteurs de porte** : utilisateurs envoyés selon le site (ou les lecteurs autorisés de la fiche). Un salarié sans droit, ou réglé sur « aucun accès », était enregistré sur le lecteur et ouvrait la porte | **critique** | nouveau `serveur/acces.js` (même règle que l'écran) : un lecteur « porte » rattaché à une porte d'une zone ne reçoit que les salariés autorisés dans la zone ce jour-là ; appliqué à l'envoi manuel et à la synchronisation automatique |
| 2 | Retrait d'un droit d'accès sans effet sur les lecteurs (la synchronisation ne réagissait qu'au site, aux lecteurs autorisés, à la sortie, au badge) | **critique** | changement des droits d'accès → retrait (prioritaire) ou envoi sur les lecteurs concernés |
| 3 | Droit daté (début ou retrait à une date future) jamais appliqué ce jour-là | **haute** | étape quotidienne du cycle de synchronisation (rattrapage des jours manqués) |
| 4 | Accès › « Retirer l'accès » en masse impossible : bouton Appliquer toujours grisé (le plan « aucun » n'était pas reconnu) | **haute** | retrait applicable ; « aucun droit » et « aucun accès » traités de la même façon (le nombre « à modifier » n'était plus gonflé) |
| 5 | Grand effectif : affectation en masse limitée aux salariés chargés dans la page | **haute** | route serveur `POST /api/v1/employes/acces-masse` (aperçu et application sur tout le périmètre, lots de 500, droits, audit « acces.masse ») |
| 6 | Suppression d'une zone, d'un plan ou d'une plage utilisés : simple avertissement, droits orphelins ; **un plan supprimé laissait le salarié autorisé** | **haute** | suppression refusée (zone : salariés ou lecteurs rattachés ; plan : salariés ; plage : plans) ; un plan inexistant ou qui n'ouvre aucune plage ne donne plus accès |
| 7 | Plages d'accès : chevauchements et durée nulle acceptés | moyenne | refusés (plages de nuit gérées) |
| 8 | Fiche salarié : droit sans zone, sans date, plan inexistant ou deux lignes même zone même date acceptés (droit ambigu) | moyenne | refusés |
| 9 | Zones : site facultatif, portes sans nom ou en double ; noms de zones, plans et plages en double | basse | contrôlés |
| 10 | Retirer une porte d'une zone détachait ses lecteurs immédiatement, même si l'on annulait | basse | lecteurs détachés à l'enregistrement de la zone |
| 11 | Alerte « terminaux actifs sans porte » : comptait aussi les pointeuses de simple pointage | basse | lecteurs de porte et mixtes seulement |
| 12 | Effectifs par zone et par plan comptés sur les salariés chargés (faux en grand effectif) ; impact d'une plage repéré par sous-chaîne (« ap1 » trouvait « ap10 ») | basse | comptage serveur ; identifiant exact |

Vérifié : vraie base SQLite, appareils simulés — avant : les 4 salariés (avec droit, sans droit, « aucun accès », plan
sans plage) envoyés sur le lecteur de porte, retrait et droit daté sans effet ; après : seul le salarié autorisé, retrait
envoyé, droit du jour appliqué. Serveur réel installé (licence de test, clé de test dans une copie uniquement) :
`acces-masse` — aperçu sur tout le personnel, « Retirer l'accès » appliqué à 5 salariés et relu en base, plan inexistant
refusé, audit. Moteur réel : 12 contrôles écran avant / après ; aucune fiche du jeu de démonstration bloquée à tort ;
compteurs de temps identiques au correctif 4. Chromium : retrait en masse, suppression refusée, chevauchement et droit
sans zone refusés à l'enregistrement, 4 écrans sans erreur JavaScript. Démonstration reconstruite.

Limites (à traiter avec le matériel, non modifié) :
- **Les plages horaires des plans ne sont pas transmises aux lecteurs** : un salarié autorisé dans une zone l'est
  24 h/24 sur l'appareil. Envoyer les plages (« time zones » ZKTeco, plannings Hikvision / BioStar 2) demande un
  développement par pilote et des essais sur les appareils réels.
- **L'anti-passback** de la zone est enregistré mais n'est pas appliqué par FIWAKTI : il se règle sur le contrôleur.
- Lecteurs « mixtes » (pointage et porte) : non filtrés par les droits d'accès, pour ne pas empêcher le pointage. Pour
  restreindre une porte, utiliser un lecteur de type « porte ».
- Après installation, resynchroniser chaque lecteur de porte (si la synchronisation inclut les terminaux d'accès)
  pour retirer les salariés enregistrés à tort avant le correctif.

Livraison : FIWAKTI-56.33.11-correctif-5.zip (cumulatif : app.js, moteur.js, calcul.js, donnees.js, principal.js,
pointeuses.js, biosync.js, nouveau acces.js — contient les correctifs 2 à 4).

## Correctif 6 — Contrôle d'accès › Droits d'accès

Reprise détaillée de l'écran « Droits d'accès » (affectation des droits par population), au-delà des points corrigés
au correctif 5 (retrait en masse, grand effectif, application aux lecteurs).

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | « Appliquer » (`accapply`) n'était rattaché à aucune catégorie de la matrice des droits : un profil en **consultation** de l'écran pouvait modifier les droits d'accès de toute une population | **haute** | rattaché à « Modification » : bouton masqué et action refusée sans ce droit |
| 2 | Date d'effet passée acceptée : droit accordé ou retiré rétroactivement, historique des accès réécrit (contraire à la note de l'écran) | **haute** | date d'effet ≥ aujourd'hui (champ, bouton, action, route serveur → 409) |
| 3 | Changement déjà programmé plus tard pour la même zone non signalé (ex. retrait aujourd'hui alors qu'un accès est prévu dans un mois : l'accès revient à sa date) | moyenne | nombre affiché dans l'aperçu et dans la confirmation (calculé par le serveur en grand effectif) ; le changement programmé est conservé |
| 4 | Confirmation sans zone, plan ni date ; affectation faite à l'écran absente du journal d'audit | moyenne | confirmation détaillée (« Appliquer », et non « Supprimer », pour un retrait) ; entrée d'audit « acces » |
| 5 | Route serveur `acces-masse` utilisable sans le module Contrôle d'accès | basse | refusée (403) si le module n'est pas activé |

Vérifié : Chromium, ancienne démonstration (correctif 5) puis nouvelle — date passée : avant, confirmation ouverte ;
après, bouton grisé et action refusée ; changement programmé signalé (aperçu et confirmation) ; audit écrit ; profil en
consultation : bouton masqué, clic forcé refusé (« Modification »). Serveur réel : application au 15/01/2026 → 409,
aperçu avec 5 changements programmés, application du jour sur 9 salariés.

Constat hors périmètre (non modifié) : l'affectation de calendrier en masse (`massapply`, Temps et présence) n'est pas
non plus rattachée à la matrice des droits.

Livraison : FIWAKTI-56.33.11-correctif-6.zip (cumulatif : correctifs 2 à 5 inclus).

## Correctif 7 — Contrôle d'accès › Zones et portes

Reprise détaillée de l'écran « Zones et portes », du rattachement des lecteurs (fiche du terminal) et de la protection
des zones par le serveur (au-delà du correctif 5 : suppression protégée à l'écran, contrôles de saisie).

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Fiche du terminal : portes de **tous les sites** proposées ; un lecteur pouvait commander la porte d'une zone d'un autre site (droits de cette zone appliqués au mauvais bâtiment) | **haute** | portes des zones du site du terminal seulement ; rattachement contrôlé à l'enregistrement |
| 2 | Zone déplacée vers un autre site alors que des lecteurs de l'ancien site commandent ses portes | **haute** | refusé (lecteurs nommés) |
| 3 | Lecteur rattaché à une **porte supprimée** : la fiche affichait « — » (comme sans porte) et réenregistrait la référence ; pour la synchronisation, ce lecteur de porte retombait sur la règle du site (tout le site) | **haute** | « Porte supprimée — choisissez une porte » affiché et exigé ; alerte « terminaux sans porte » étendue à ces lecteurs |
| 4 | **Serveur** : aucune protection des zones (appel direct de l'API) — suppression d'une zone utilisée, retrait d'une porte commandée par des lecteurs, même porte dans deux zones (zone d'une porte ambiguë), zone sans nom ou sans site | **haute** | `controleZones` dans `donnees.js` : refusés |
| 5 | Colonne « Employés » en grand effectif : tous les salariés ayant eu un droit sur la zone, même retiré (petit effectif : autorisés aujourd'hui) | moyenne | critère serveur `zoneAuj` (autorisés aujourd'hui, même règle que `acces.js`) |
| 6 | Nom de zone unique sur toute la société (correctif 5) : trop strict pour plusieurs sites | basse | unique par site |
| 7 | Sens des portes et anti-passback enregistrés sans aucun effet, sans que l'écran le dise | basse | aide de l'écran : informations réglées sur le contrôleur de la porte, non appliquées par FIWAKTI |
| 8 | Export des zones limité à l'identifiant, au nom et au site | basse | portes (avec sens), lecteurs, anti-passback |

Vérifié : moteur réel, ancienne (correctif 6) et nouvelle version — lecteur d'un autre site, porte supprimée, zone
déplacée : acceptés avant, refusés après ; nom par site ; 35 fiches du jeu de démonstration sans erreur. Serveur réel :
suppression de la zone utilisée (14 salariés), retrait d'une porte commandée, porte en double — refusés par l'API ;
modification légitime acceptée ; comptage `zoneAuj`. Chromium : portes proposées par site, « Porte supprimée » affichée
et exigée, aide de la zone, alerte, écrans sans erreur JavaScript.

Livraison : FIWAKTI-56.33.11-correctif-7.zip (cumulatif : correctifs 2 à 6 inclus ; ajoute annuaire.js).

## Correctif 8 — Contrôle d'accès › Plages d'accès

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Bouton « 24 heures » : fin enregistrée « 24:00 », qu'un champ horaire ne sait pas afficher → heure de fin **vide** à l'écran ; la modifier effaçait la fin | moyenne | « 24 heures » = 00:00 → 00:00 (minuit à minuit, comme l'annonce l'écran) ; « 24:00 » existant affiché 00:00 |
| 2 | 00:00 → 00:00 refusé (« même heure ») — régression du correctif 5, alors que l'écran présente « minuit à minuit » comme l'accès permanent | moyenne | accepté (seul intervalle) ; message d'erreur orientant vers « 24 heures » |
| 3 | « Ajouter un intervalle » : toujours 08:00-18:00, donc chevauchement immédiat avec un intervalle existant | basse | premier créneau libre (4 h au plus) ; journée entièrement couverte signalée |
| 4 | Intervalles conservés dans l'ordre de saisie | basse | rangés par heure de début à l'enregistrement |
| 5 | **Serveur** : aucune protection des plages par l'API — suppression d'une plage utilisée par un planning, plage vidée de ses intervalles (accès coupé pour tous les salariés de ses plannings), heure invalide, plage sans nom | **haute** | `controleAplages` dans `donnees.js` : refusés |
| 6 | Liste sans l'usage de chaque plage | basse | colonne « Plannings d'accès » |

Vérifié : Chromium, démonstration du correctif 7 puis nouvelle — « 24 heures » (fin vide → 00:00), minuit à minuit
(refusé → accepté), ajout d'intervalle (08:00-18:00 en double → 12:00-16:00, puis 6 ajouts couvrant la journée sans
chevauchement), tri à l'enregistrement, colonne ajoutée, aucune erreur JavaScript ; 35 fiches de démonstration sans
erreur. Serveur réel : suppression d'une plage utilisée (2 plannings), plage vidée, heure 25:00 refusées ; 00:00 → 00:00
accepté.

Rappel (correctif 5) : les plages ne sont pas transmises aux lecteurs ; une modification de plage s'applique à tous ses
plannings sans date d'effet (pas d'historique des horaires).

Livraison : FIWAKTI-56.33.11-correctif-8.zip (cumulatif : correctifs 2 à 7 inclus).

## Correctif 9 — Contrôle d'accès › Plannings d'accès

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Jour rattaché à une plage supprimée : la liste affichait « Aucun accès », mais l'ancienne plage restait dans les données et était réenregistrée telle quelle | moyenne | « Plage supprimée — choisissez une plage » affiché ; enregistrement refusé tant qu'un jour pointe vers une plage disparue |
| 2 | Planning n'ouvrant aucun jour accepté (ex. nouveau planning laissé à « Aucun accès » partout) : affecté à des salariés, il ne donne aucun accès sans que rien ne l'indique | moyenne | refusé, avec renvoi vers « Aucun accès » dans les droits |
| 3 | Colonne « Employés » : salariés ayant eu le planning un jour, même remplacé ou retiré | basse | salariés à qui le planning s'applique aujourd'hui (critère serveur `planAuj` en grand effectif) |
| 4 | **Serveur** : aucune protection des plannings par l'API — suppression d'un planning encore utilisé, plage inexistante, aucun jour ouvert, planning sans nom | **haute** | `controleAplans` dans `donnees.js` : refusés |
| 5 | Modification d'un planning appliquée sans date d'effet à tous ses salariés, sans que l'écran le dise | basse | aide de l'écran complétée |

Vérifié : Chromium, démonstration du correctif 8 puis nouvelle — plage supprimée (affichée « Aucun accès » et
enregistrée → signalée et refusée), planning vide (créé → refusé), effectif après retrait (5 → 4), aucune erreur
JavaScript ; 35 fiches de démonstration sans erreur. Serveur réel : suppression du planning utilisé (14 salariés), plage
inexistante, planning sans jour ouvert refusés ; planning valide accepté ; comptage `planAuj`.

Le menu Contrôle d'accès est ainsi entièrement repris (correctifs 5 à 9). Limites matérielles inchangées : plages non
transmises aux lecteurs, anti-passback réglé sur le contrôleur.

Livraison : FIWAKTI-56.33.11-correctif-9.zip (cumulatif : correctifs 2 à 8 inclus).

## Correctif 10 — Appareil › Terminaux

Analyse de l'écran Terminaux (fiche, barre d'actions, pilotes), des routes `/api/v1/pointeuses/*`, de `pointeuses.js`,
des pilotes et des contrôles du paramétrage côté serveur.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | « Nettoyage › Pointages / Tout » (pilote ZK natif) : `CLEAR_ATTLOG` envoyé directement, sans collecte, copie ni intégration — badgeages non encore remontés **perdus** (contraire à la règle « purge seulement après intégration confirmée ») | **critique** | `executer` : collecte complète d'abord (copie, enregistrement, lecture complète), effacement par la collecte elle-même ; refus 409 avec motif sinon ; garde dans `zk.js` |
| 2 | Actions `ta-suppr`, `ta-go` (nettoyage, redémarrage, envoi…), `termsync`, `svc-diag`, `ping*`, `pil-*` hors de la matrice des droits : un profil en consultation supprimait des terminaux, redémarrait des appareils | **haute** | rattachées à Suppression / Modification / Export |
| 3 | Serveur : actions sur un terminal hors du périmètre de site ; `utilisateurs-lire`, `utilisateurs-retirer`, `verifier-identifiants` dès TER « saisie » (noms et cartes des personnes de l'appareil) | **haute** | périmètre de site (comme la supervision) ; paramétrage TER requis |
| 4 | Serveur : aucun contrôle du paramétrage `terms` (site, adresse, port, n° de série, usage, bornes ; terminaux d'autres sites réécrits par un profil limité ; dossier de pilote) | **haute** | `controleTerms` dans `donnees.js` |
| 5 | N° de série en double : `termParSn` prenait le premier terminal — badgeages Push refusés ou attribués au mauvais appareil (porte, fuseau) | **haute** | refusé à la saisie et au serveur ; appareil ambigu refusé et journalisé ; terminal désactivé signalé comme tel |
| 6 | Fiche complète des terminaux (IP, n° de série, dossier) envoyée à tous les comptes, portail compris | **haute** | `perimetre.vue` : sans droit TER → nom, site, porte, usage ; sans paramétrage → ni adresse, ni port, ni n° de série, ni dossier |
| 7 | Pilote Sagem : dossier libre sur le serveur (lecture, déplacement, écriture de fichiers) | moyenne | dossier interdit dans l'installation ; modification réservée à l'administrateur (point 4) |
| 8 | Suppression d'un terminal : impacts limités aux salariés rattachés ; suppression en masse sans impacts | moyenne | porte et badgeages ajoutés ; impacts dans la confirmation en masse |
| 9 | Comptage serveur refusé (profil sans PAR) affiché « 0 salarié » | moyenne | « ? » ; critères rd / zone / plan permis au paramétrage TER |
| 10 | Export « pointages de ce terminal » : données du navigateur (partielles en grand effectif), rapprochement sur le nom, saisies manuelles incluses | moyenne | route serveur `GET /api/v1/pointeuses/export` (identifiant du terminal, 93 jours max, périmètre, audit) |
| 11 | « Simuler sync horaire » actif en mode serveur (écart inventé présenté comme réel) ; écart réel jamais enregistré ; ZK Push « écart corrigé : null s » ; mode et fréquence sans effet | moyenne | simulation réservée à la démo ; écart enregistré ; message « mise à l'heure envoyée » ; aide clarifiée |
| 12 | Saisie : port hors bornes, n° de série en double, ZK Push sans n° de série, bornes de collecte, site inexistant acceptés ; boutons de service sur un terminal non enregistré ; « Tester tous » (démo) incluant les terminaux désactivés | basse | contrôlés / masqués |

Vérifié : `executer` avec un pilote ZK simulé — avant : effacement direct dans les 3 cas, y compris copie impossible ;
après : collecte puis effacement, refus 409 si la copie échoue. Serveur réel avec un chef de site (TER saisie) et un
technicien (TER config) limités au site s1 : fiches masquées, utilisateurs-lire 403, terminal du site s2 403,
comptage rd permis au technicien, renommer un terminal de s2 / port 70000 / n° de série en double / dossier /etc refusés,
modification légitime acceptée, export filtré (saisie manuelle et autre terminal exclus), push ZK d'un n° de série en
double refusé avec motif. Moteur réel : 9 contrôles écran avant / après, 35 fiches sans erreur. Chromium : profil en
consultation — avant, suppression d'un terminal effectuée ; après, refusée ; redémarrage refusé ; impacts affichés.

À valider sur appareil réel (non modifié) : heure envoyée par ZK Push (`SET OPTIONS DateTime`, heure UTC) ; effet de
`CLEAR DATA` selon le firmware. Hors écran : l'import de badgeages (Import) rapproche les matricules sur les salariés
chargés dans le navigateur (partiel en grand effectif).

Livraison : FIWAKTI-56.33.11-correctif-10.zip (cumulatif : correctifs 2 à 9 inclus ; ajoute perimetre.js, pilotes/zk.js,
pilotes/sagem.js).

## Correctif 11 — Appareil › Biométrie

Analyse de l'écran Biométrie, de la synchronisation automatique (`biosync.js`), du stockage des visages
(`visages.js`), des commandes ZK Push et des routes `/api/v1/pointeuses/biometrie-*` / `visages-*`.

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | En mode serveur, l'écran ne pilotait aucun appareil : tableaux du navigateur (`db.bio`, `bioq`…), « Collecter » **inventait** des gabarits, « Traiter la file » marquait « fait » sans communication | **critique** | écran serveur : salariés enrôlés (métadonnées, appareils, blocages ; paginé, périmètre), effacement des gabarits (paramétrage TER, confirmation, audit, retrait des appareils puis réinscription sans biométrie), panneau de synchronisation réel ; actions simulées réservées à la démo |
| 2 | Gabarits **jamais effacés** (`visages.supprimer` jamais appelé) : visages de salariés partis conservés indéfiniment, sauvegardes comprises | **critique** | purge planifiée (6 h) selon un délai de conservation fixé par l'administrateur (aucune purge tant qu'il n'est pas réglé) ; effacement à la suppression d'un salarié |
| 3 | Salarié supprimé : aucun retrait des appareils (suppression jamais signalée à la synchronisation) | **haute** | suppression signalée : retrait programmé, gabarits, blocage et suivi effacés |
| 4 | Retrait d'un sortant en « échec définitif » après ~1 h 30 d'appareil injoignable, jamais repris (`bio_sorties` déjà marqué) : l'ancien salarié gardait l'accès | **haute** | retrait jamais abandonné (nouvel essai toutes les heures au plus) ; ordres d'un appareil supprimé annulés |
| 5 | Changement de matricule : visages, blocage, présence restés sur l'ancien matricule — réinscription sans visage et **sans le blocage soumis aux RH** | **haute** | données biométriques rattachées au nouveau matricule avant la diffusion |
| 6 | Commandes ZK Push (photos, gabarits en base64) persistées **en clair** dans la base et les sauvegardes, 200 dernières conservées | **haute** | file chiffrée au repos (clé « biometrie » du coffre) ; commandes envoyées conservées sans contenu biométrique |
| 7 | Liste des blocages (code d'absence = donnée de santé) et levée d'un blocage sans périmètre | **haute** | filtrées / refusées hors périmètre |
| 8 | Validation RH sans droit TER : levée refusée (contrôle TER avant l'exception RH) | moyenne | consultation et levée permises à la validation RH, limitées au périmètre |
| 9 | Actions de l'écran hors matrice des droits ; écran ouvert selon PTG (le serveur exige TER) | **haute** | actions catégorisées ; `ECRAN_DROIT.bio = TER` |
| 10 | Sortie : la règle « retirer les accès » **effaçait** l'historique des droits d'accès (`acces = []`) ; dernier jour travaillé traité comme une sortie (`<=`) ; ordres de retrait dupliqués dans la file du navigateur | moyenne | droits clos à date (« aucun accès » le lendemain de la sortie) ; même règle de date que le serveur ; file du navigateur seulement en démo |
| 11 | Pilote sans retrait : ordre marqué « ok » (« à retirer à la main » invisible, purgé après 7 jours) | moyenne | statut « manuel », compté, conservé 30 jours |
| 12 | Messages pointeuse sans contrôle ; `window.FIWAKTI.enroll` (ouvre des accès) utilisable en production | basse | contrôles ; interface réservée à la démo |

Vérifié : vraie base SQLite, appareil simulé — avant / après : retrait sortant (échec définitif → réessayé), salarié
supprimé (aucun ordre → retrait), changement de matricule (visage / blocage / liste RH sur le nouveau matricule, salarié
bloqué non réinscrit), purge (absente → sortis > délai et supprimés effacés, autres conservés ; rien sans délai réglé).
Serveur réel : liste paginée (admin 5, chef de site 3 ; aucune donnée biométrique transmise), effacement hors périmètre
403 / sans paramétrage 403 / sans confirmation 428 / autorisé 200, RH sans droit terminaux : liste limitée au site et
levée hors périmètre 403. Chromium : écran serveur (liste réelle, effacement confirmé, conservation non réglée signalée
puis réglée), démo inchangée ; sortie d'un salarié : historique des droits conservé (2 → 4 lignes). Compteurs de temps
identiques ; 35 fiches sans erreur.

Non traité (à décider) : écran RH dédié aux blocages biométriques (la validation RH sans droit TER n'a pas d'écran pour
lever un blocage, seulement l'API) ; consentement / information des salariés (rappel INPDP affiché) ; après une
resynchronisation, la présence des salariés hors périmètre sur l'appareil n'est pas reconstruite (non reproduit).

Livraison : FIWAKTI-56.33.11-correctif-11.zip (cumulatif : correctifs 2 à 10 inclus).

## Correctif 12 — RH › Biométrie suspendue (nouvel écran)

Suite du correctif 11 : la validation RH pouvait lever un blocage biométrique par le serveur, mais aucun écran ne le lui
permettait (Terminaux et Biométrie relèvent du droit Terminaux).

- Écran **RH › Biométrie suspendue** (`biorh`) : salariés dont la biométrie est suspendue pour une longue absence et dont
  la réactivation attend les RH — absence (type, code), période, situation, filtres (toutes / à réactiver / absence en
  cours), recherche, export ; démonstration avec exemples fictifs.
- Réactivation : immédiate si l'absence est terminée (renvoi aux appareils), sinon autorisée pour la fin de l'absence ;
  **motif obligatoire**, enregistré dans l'audit (`biometrie.blocage.leve_rh … — motif : …`) avec l'identité RH.
- Accès : validation RH (EMP ≥ validation) ou paramétrage TER, même règle que le serveur ; niveau de menu « avancé » ;
  action « Réactiver » rattachée au droit Validation de la matrice ; périmètre appliqué par le serveur (liste et levée).
- Serveur : motif transmis à l'audit ; liste RH portée de 300 à 2 000 lignes (troncature silencieuse auparavant).

Vérifié sur le serveur réel avec un compte RH (validation, aucun droit Terminaux, site s1) : écran présent dans le menu RH,
écrans Appareil absents ; 2 salariés du site s1 listés (celui du site s2 exclu) ; confirmation sans motif refusée ;
réactivation (2 envois en file) puis autorisation différée (fin d'absence) ; audit avec motif et identité ; démonstration
et export sans erreur ; trilingue.

Livraison : FIWAKTI-56.33.11-correctif-12.zip (cumulatif : correctifs 2 à 11 inclus).

## Correctif 13 — Pilotage (États, Tableau de bord, Audit, Journal)

### États

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | États calculés par le serveur (grand effectif, travaux) : salariés **sortis avant aujourd'hui** exclus (`calcul.etat` sans date de début) — Éléments variables du dernier mois des sortants absents | **critique** | sélection à la date de début de l'état |
| 2 | Compteurs (`runCounters`) calculés sur les jours **avant l'entrée et après la sortie** : heures théoriques, soldes et absences fictifs (ex. sorti le 10/09 : HT 192 au lieu de 68) | **critique** | jours hors contrat ignorés (même règle que le calcul journalier du serveur) |
| 3 | Période « Éléments variables » prise sur la convention du **premier salarié de la base** (filtre entrée/sortie, bornes affichées, dates envoyées au serveur) | **haute** | période de chaque salarié ; bornes affichées par convention ; dates serveur = min/max des conventions |
| 4 | Serveur : données chargées à partir de la veille de la période, alors que les compteurs hebdomadaires / annuels démarrent au lundi / 1er janvier — **cumul hebdomadaire et soldes annuels faux** (HS d'une plage commençant un mercredi : 5 h au lieu de 13 h) | **haute** | données chargées depuis le début de la période du compteur le plus long (`debutDonnees`) |
| 5 | Grand effectif : aperçu et visualisation calculés sur les deux jours chargés dans le navigateur | **haute** | aperçu calculé par le serveur à la demande (tous les salariés du périmètre, totaux exacts) |
| 6 | « Total général », moyenne, min, max sur les seules lignes affichées (1 920 h au lieu de 2 672 h) | **haute** | totaux et sous-totaux sur tous les salariés |
| 7 | `POST /api/v1/travaux` : ni liste des états du profil, ni action « exporter », ni menu masqué ; définition et dates du navigateur acceptées telles quelles (« pas-une-date », 1900→2999) | **haute** | contrôles serveur ; définition relue dans le paramétrage (options de visualisation contrôlées) ; dates valides, 3 ans au plus |
| 8 | Unité « jours » : trois résultats différents (écran, CSV, Excel) selon la base du premier salarié | moyenne | conversion avec la base de chaque salarié, totaux = somme des jours |
| 9 | Groupes éclatés (tri sur « groupe + nom » concaténés : Achat / Achats / Achat) | moyenne | tri sur le groupe puis le nom |
| 10 | « Imprimer » de la visualisation imprimait l'écran tronqué | moyenne | impression de l'état complet |
| 11 | Grand effectif : Excel, texte et impression sans groupes, sous-totaux ni total général (reconstruits d'un CSV plat) | moyenne | le serveur renvoie les blocs par salarié ; même matrice qu'en direct |
| 12 | Jours à venir comptés en déficit (mois en cours : solde −88 h pour 13 jours non écoulés) | moyenne | période arrêtée à aujourd'hui (mention « arrêté au … ») ; période entièrement future et simulation inchangées |
| 13–15 | En-tête contradictoire (bornes d'une convention, nom d'une autre) ; dates ISO dans le CSV ; salariés sortis absents de la liste de la visualisation | basse | corrigés ; plage tronquée à 3 ans signalée ; « Modifier l'état » rattaché au droit Modification |

Un seul calcul par salarié (« bloc ») sert désormais l'écran, le CSV, Excel, le texte, l'impression et l'aperçu serveur.

### Audit et Journal

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Tout compte pouvait écrire des traces d'audit et du journal **au nom d'un autre compte, à la date de son choix, hors de son périmètre** (preuve : RH sans droit Système → « suppression faite par admin » sur un salarié d'un autre site) | **critique** | auteur et heure imposés par le serveur (compte de la session, horloge du serveur) ; hors périmètre refusé |
| 2 | Audit du serveur (connexions, refus, restaurations, réglages) consultable nulle part ; route limitée aux 500 dernières lignes | **haute** | onglet « Audit du serveur » : période, recherche, pages, export CSV |
| 3 | Restauration d'une sauvegarde : **audit postérieur effacé en silence**, vérification « intègre » | **haute** | entrées copiées avant restauration, remises avec leurs sceaux (chaîne continue) ou conservées dans un fichier ; l'audit de la restauration le dit |
| 4 | Sceau SHA-256 **sans clé** (recalculable), lignes non scellées admises partout, troncature de fin non détectée | moyenne | sceau HMAC (clé « audit » du coffre, incluse dans le trousseau) ; lignes non scellées admises seulement avant la première ligne scellée ; dernier ancrage quotidien vérifié |
| 5 | Traces sans matricule (sécurité, clôtures, paramétrage, imports) envoyées à tout compte, portail compris | moyenne | réservées au droit Système |
| 6 | Purge de l'audit sans tenir compte de la clôture ; badgeages purgés sans aucune clôture | moyenne | jamais au-delà de la dernière clôture ; rien sans clôture |
| 7 | Écran Audit : seulement les traces chargées (≈ 2 mois ; hier et aujourd'hui en grand effectif ; 5 000 au plus) sans le dire | **haute** | traces servies par page sur la période choisie, avec le périmètre |
| 8 | Export de l'audit hors matrice des droits (`audit-csv` sans catégorie) | **haute** | catégorie « exporter » ; export serveur complet de la période |
| 9 | Pointages › Audit : tout l'audit (sécurité, clôtures…) avec le seul droit Pointage | moyenne | corrections et décisions seulement |
| 10 | Recherche par date jj/mm/aaaa sans résultat ; dates ISO dans les exports | basse | corrigés |
| 11–13 | Journal : ordre du plus ancien au plus récent, 200 premières sans mention ; deux formats d'entrée (lignes vides à l'écran, colonnes vides à l'export) ; heures en UTC et entrées des règles jamais datées (renvoyées à chaque chargement, volume sans limite) | moyenne | plus récent d'abord, pages ; une seule forme d'affichage et d'export ; heure locale, entrées datées (anciennes datées une fois) |

### Tableau de bord

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 14 | Pas de filtre de périmètre (demandes d'autres sites visibles, export compris) | **haute** | périmètre de l'écran Demandes |
| 15 | Grand effectif : « 0 jours accordés », export vide (fiches des demandeurs non chargées) | **haute** | fiches complétées ; jours en attente de fiche signalés |
| 16 | Indicateurs sur une fenêtre implicite ; heures additionnées comme des jours | moyenne | période explicite (décisions de la période, en instance à ce jour) ; demandes en heures comptées à part ; demandes plus anciennes chargées à la demande |
| 17 | Toutes les demandes en instance affichées (20 000 → 1,1 s, 4,4 Mo de HTML) | moyenne | 50 affichées (18 ms pour 5 000), renvoi à l'écran Demandes |
| 18 | Retard signalé après 3 jours (7 dans la note et l'alerte) ; dates ISO dans l'export | basse | 7 jours ; jj/mm/aaaa |

Vérifié : banc VM (scénarios de l'analyse : sortants, entrée/sortie en cours de période, conventions, totaux, groupes,
unités, dates) ; vraie base et serveur réel — cumul hebdomadaire d'une plage commençant un mercredi identique au calcul
complet (13 h, contre 5 h avant), sortant présent dans l'export, contrôles de `/api/v1/travaux` (403 / 400 attendus,
définition relue), falsification d'audit refusée ou réattribuée, traces sans matricule non transmises, restauration
(6 entrées remises, chaîne intègre), ligne insérée / sceau recalculé / fin supprimée détectés ; Chromium en mode normal
et en grand effectif (aperçu serveur = total navigateur, Excel et CSV par le serveur avec total général) ; démonstration :
56 écrans sans erreur. Compteurs de temps identiques, sauf le salarié sorti du jeu de démonstration (plus de compteurs
après sa sortie, attendu).

Non traité : traces applicatives non chaînées (seul l'audit du serveur est scellé ; auteur et heure désormais garantis) ;
ancrage externe (syslog ou export d'audit) toujours optionnel ; la cloche « demandes en attente depuis 7 jours » compte
aussi celles que l'utilisateur ne peut pas valider.

Livraison : FIWAKTI-56.33.11-correctif-13.zip (cumulatif : correctifs 2 à 12 inclus).

## Correctif 14 — Pilotage › États (seconde analyse)

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Un compte autorisé à écrire les états pouvait enregistrer **n'importe quel contenu** (chaîne, `null`, identifiant `">`, compteur inconnu, période « zz »…) : au chargement suivant, l'application basculait sur les **données de démonstration** chez tous les utilisateurs | **critique** | contrôle serveur des états (`controleEtats` : objet, identifiant, nom unique, compteurs existants, période / modèle / regroupement connus, dates, plage ≤ 3 ans, filtres sur des champs existants, pas de suppression d'un état cité par un profil) ; le navigateur écarte un élément invalide au lieu de tout réinitialiser |
| 2 | Compteur utilisé par un état supprimable en envoyant des états « nettoyés » (contrôle fait sur les états envoyés, même refusés) | **critique** | contrôle sur les états réellement retenus |
| 3 | Cache de l'aperçu jamais réutilisé (compteur de rendus dans la clé) : 1,8 à 2,6 s par rendu à 1 000 salariés, à chaque frappe dans l'atelier | **haute** | clé limitée à ce qui change le calcul, plus la langue : 2 à 3 ms après le premier calcul |
| 4 | Excel, texte et impression ignoraient les filtres de la visualisation (14 salariés au lieu de 1) | **haute** | filtres transmis |
| 5 | L'atelier permettait de modifier les états sans le droit Paramétrage (ETA) exigé par le serveur : « Enregistré » puis perdu | **haute** | créer / modifier / supprimer suivent le droit du serveur |
| 6 | État journalier en grand effectif : fichier pouvant dépasser la taille maximale d'un texte | **haute** | volume plafonné (3 000 000 de lignes-jour en CSV, 1 000 000 pour Excel / impression) avec message clair |
| 7 | Saisie de l'atelier : nom en double, compteur supprimé, plage sans dates / inversée / de plus de 3 ans, période inconnue, filtre orphelin acceptés (corrigés en silence) | moyenne | contrôles à la saisie (mêmes règles que le serveur) |
| 8 | Champ personnalisé supprimé : son filtre restait appliqué et invisible | moyenne | suppression refusée tant qu'un état filtre sur ce champ (navigateur et serveur) |
| 9 | Suppression d'un état cité par des profils sans avertissement (comptes privés de tout état) | moyenne | impact affiché, suppression refusée (navigateur et serveur) |
| 10 | Matrice : actions de l'atelier mal classées ; en grand effectif aperçu et impression impossibles sans le droit d'export | moyenne | `et-*` = modification ; aperçu = lecture, impression = droit Imprimer, Excel / CSV = droit Exporter (contrôlé par le serveur) |
| 11 | Aperçu serveur affiché comme à jour après un changement de filtre | moyenne | filtres dans la clé de l'aperçu |
| 12 | Libellés de l'écran restés dans l'ancienne langue ; exports du serveur toujours en français | moyenne | langue dans le cache ; langue de l'utilisateur transmise au moteur |
| 13 | Rafraîchissement de la liste des travaux toutes les 2 s pendant la saisie (perte du focus) | moyenne | seulement quand la liste est affichée ; suivi de l'aperçu sans perte du focus |
| 14 | Période entièrement à venir présentée comme du réalisé | moyenne | mention « période à venir » |
| — | Aperçus listés comme fichiers à télécharger ; compteurs ajoutés par un profil en consultation ; total et indicateurs de la visualisation absents d'Excel / impression | basse | aperçus hors liste (1 h) ; seuls les compteurs de l'état enregistré ; moyenne / min / max exportés |

Vérifié : scripts de preuve de l'analyse rejoués (saisie, matrice, filtres d'export, clé d'aperçu, langue, performances,
cache dans le navigateur) ; serveur réel (copie) : états invalides refusés, application intacte avec des états corrompus en
base, renommage accepté, doublon / plage inversée / suppression d'un état cité refusés, contournement des compteurs bloqué,
droits par usage (aperçu 200, impression 200, Excel / CSV 403 sans export), compteurs ajoutés ignorés, export en anglais ;
démonstration : 56 écrans sans erreur, écran / Excel / texte identiques (0 écart).

Non traité : duplication d'un état (fonction absente, pas une anomalie) ; fichiers de travaux encore téléchargeables 24 h
après une réduction de périmètre ; sens de lecture des périodes en arabe.

Livraison : FIWAKTI-56.33.11-correctif-14.zip (cumulatif : correctifs 2 à 13 inclus).

## Correctif 15 — Pilotage › Tableau de bord (seconde analyse)

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Rectification acceptée comptée comme une nouvelle demande : modification = 2 acceptées et 6 j au lieu de 1 et 3 j ; annulation = 5 j toujours comptés | **haute** | rectifications exclues des indicateurs (signalées à part) ; indicateur « Annulées » ; mention « Demande de rectification » dans les demandes en instance |
| 2 | Décisions de la période sur des absences anciennes absentes (chargement par date d'absence) — régularisation acceptée en octobre pour février jamais vue | **haute** | route serveur `/api/v1/demandes/bord` : demandes décidées ou déposées sur la période, périmètre appliqué, site et nom des demandeurs joints |
| 7 | Décisions non contrôlées par le serveur : « acceptée le 01/01/2019 par Directeur général (falsifié) » enregistrée ; date de décision prise sur l'horloge du poste | **haute** | transitions d'état contrôlées (refusée → acceptée refusée…), date et auteur de la décision imposés par le serveur, décision figée ensuite (reprise de données par l'administrateur conservée) |
| 3 | Période par défaut invalide en janvier et février (« 2027--1-01 ») | moyenne | calcul de date corrigé |
| 4 | Fiches des demandeurs plafonnées à 1 000 (suivantes jamais chargées) | moyenne | chargement par lots jusqu'au bout |
| 5 | Filtre de site : demande d'un salarié non chargé exclue sans avertissement | moyenne | site fourni par le serveur ; demandes non classées signalées |
| 6 | Grand effectif : rendu 2 à 18 s (recherche linéaire des fiches, jours recalculés) | moyenne | index des fiches, jours mémorisés : ≈ 0,3–0,5 s pour 50 000 demandes |
| 8–9 | Demi-journée sur jour non ouvré = 0,5 j ; jours après la sortie comptés ; décision sans `valideLe` invisible | basse | 0 ; jours hors contrat exclus ; date reprise de l'historique |
| 10–14 | Répartition par type sans rapport avec son libellé ; exports sans période, site ni indicateurs ; « 2.5 h » non localisé ; colonne Ancienneté rognée, lignes inertes ; requête relancée à chaque rendu après un échec | basse | libellé « Demandes déposées sur la période, par type » ; en-tête période / site / édité le / indicateurs, fichier nommé avec la période ; nombre et unité localisés ; tableau défilant, nom cliquable vers la demande ; échec mémorisé, bouton « Réessayer » |
| — | Motif de refus (peut révéler une information de santé) visible de tout compte du tableau de bord | à décider | affiché aux seuls comptes qui valident les absences (droit Absences ≥ validation), exports compris |

Vérifié : scripts de l'analyse rejoués (rectifications, annulation, demi-journée, sortie, période de janvier, 1 500
demandeurs, exports et impression, langues, performances) ; serveur réel (copie) : régularisation de février décidée le
06/10 présente en octobre pour les trois comptes du site, demande d'un autre site exclue, décision falsifiée réécrite à la
date du jour et au nom du compte, refusée → acceptée refusée ; Chromium (fr / ar, janvier 2027, largeur réduite) ;
démonstration : 56 écrans sans erreur.

Non traité : chefs d'équipe (niveau « avancé ») sans accès au tableau de bord (niveau « rh ») — à décider ; la cloche
« demandes en attente » n'applique pas le filtre de site.

Livraison : FIWAKTI-56.33.11-correctif-15.zip (cumulatif : correctifs 2 à 14 inclus).

## Correctif 16 — Pilotage › Journal (seconde analyse)

| # | Constat | Gravité | Correction |
|---|---|---|---|
| 1 | Tout profil (portail compris) pouvait écrire dans le journal : faux imports sans matricule, fausses règles « Compte désactivé », texte libre (« diagnostic : dépression », formule `=HYPERLINK`) | **haute** | contenu reconstruit par le serveur : règle existante et active, déclencheur de la règle, codes d'action connus, salarié du périmètre (droit Employés saisie), nom de la règle et du salarié repris du paramétrage, détail limité ; imports et accueil réservés au droit Système |
| 2 | Sorties planifiées traitées seulement par un navigateur RH (jamais en grand effectif) ; rien au journal sinon | **haute** | tâche serveur : toute sortie passée non traitée est signalée au journal (une fois par salarié et date) |
| 3 | Le journal annonçait des actions non faites (repli sur toutes les actions de la règle ; actions refusées par le serveur faute de droit annoncées faites) | **haute** | statut par action (faite, sans effet, non faite faute de droit, en échec) ; action sans droit non exécutée ; serveur reclasse « non faite » une action que le compte ne peut pas faire |
| 4 | Tri faux à l'intérieur d'une journée (identifiants aléatoires) — aussi pour l'onglet Audit | moyenne | tri sur l'heure de l'entrée |
| 5 | Doublons : même sortie rejouée à chaque ouverture si la fiche n'a pas pu être enregistrée ; service « hors effectif » rejoué à chaque enregistrement | moyenne | une entrée par règle, salarié, déclencheur et jour (serveur) ; règle « hors effectif » au passage seulement |
| 6 | Limite locale de 500 : les entrées tronquées partaient en suppressions refusées (≈ 4 770 pour l'administrateur) | moyenne | plus de troncature avec le serveur (5 000 en démonstration) |
| 8 | Journal jamais purgé | moyenne | conservation comme l'audit (jamais au-delà de la dernière clôture), visible dans l'état du système |
| 9 | Injection de formule dans les exports CSV (journal et audit) | moyenne | valeur commençant par `= + - @` neutralisée |
| 10 | Journal envoyé à tous les profils dans `/api/v1/donnees` (écran réservé au droit Système) | moyenne | envoyé aux seuls comptes du droit Système |
| 11 | Filtre de site sans effet ; pas de filtre nature / salarié ; date invalide ignorée (toute la base) ; export coupé à 200 000 sans prévenir | basse | filtres nature, matricule et site (serveur et export) ; date invalide refusée ; export daté et signalé s'il est limité |
| 12 | Actions et événements affichés en français dans tous les écrans ; en-têtes CSV en français ; boutons de page sans nom | basse | actions par code traduites à l'affichage ; export dans la langue de l'écran ; boutons nommés |
| 7 | Entrée refusée signalée une seule fois par session | à suivre | motif de refus détaillé renvoyé par le serveur ; file d'attente des entrées refusées non faite |

Vérifié : scripts de l'analyse rejoués (actions sans effet, service hors effectif renommé 3 fois = 2 entrées, libellés
fr / en / ar) ; serveur réel (copie) : faux import refusé (droit Système), règle inconnue refusée, action sans droit
reclassée « non faite », nom de règle / auteur imposés, doublon du jour ignoré, entrée hors périmètre refusée, journal non
envoyé à chef.s1, tri à la seconde, filtres nature / site, date invalide 400, CSV neutralisé, sortie non traitée signalée
une seule fois puis traitée par les règles au passage de l'administrateur ; Chromium fr / ar ; démonstration : 56 écrans
sans erreur.

Livraison : FIWAKTI-56.33.11-correctif-16.zip (cumulatif : correctifs 2 à 15 inclus).
