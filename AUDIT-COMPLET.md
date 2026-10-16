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
