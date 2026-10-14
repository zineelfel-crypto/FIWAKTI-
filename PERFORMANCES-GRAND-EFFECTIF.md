# FIWAKTI 56.33.11 — performances à 50 000 salariés et 5,5 millions de badgeages

## 1. Banc de mesure

Toutes les mesures passent par l'API réelle (HTTP), jamais par des insertions directes en base.

| Élément | Valeur |
|---|---|
| Base | PostgreSQL 16, sur la même machine |
| Machine de test | 4 cœurs, 15 Go. Le client de test, Node, les 3 fils de calcul et PostgreSQL se partagent ces 4 cœurs. |
| Salariés | 50 000, importés par `/api/v1/donnees/sync` par lots de 1 000 (20 sites, 300 services) |
| Comptes | 50 000 comptes du portail salarié + administrateur + un chef de site (périmètre de 2 500 salariés) |
| Pointeuses | 20 pointeuses ZKTeco en mode Push (`/iclock/cdata`), une par site |
| Badgeages | 5,5 millions reçus par les pointeuses (55 jours × 100 000), soit 6,1 millions d'événements bruts. Base de 9,9 Go. |

L'outil est livré : `outils/banc-charge.js`. Usage dans `CLAUDE.md`.

## 2. Résultats écran par écran (un utilisateur, médiane)

| Écran / opération | 56.33.10 (100 000 badgeages, 1 compte) | 56.33.11 (5,5 M badgeages, 50 000 comptes) |
|---|---:|---:|
| Annuaire : 1re page | 62 ms | **3 ms** |
| Annuaire : page 250 triée par matricule | 404 ms (p95 615) | **3 ms** |
| Annuaire : recherche pendant la frappe | 27 ms | **4 ms** |
| Annuaire juste après la modification d'une fiche | 22 ms (*) | **17 ms** |
| Modification d'une fiche salarié | 313 ms (*) | **36 ms** |
| Journal des badgeages du jour | 51 ms | **12 ms** |
| Badgeages d'un salarié sur 30 jours | 23 ms | **10 ms** |
| Journées calculées du jour | 51 ms | **39 ms** |
| Synthèse sur 30 jours | **30 s (délai dépassé)** pendant l'arrivée des badgeages | **38 ms** |
| Supervision des pointeuses | 194 ms, et croît avec l'historique | **8 ms** |
| Badgeage temps réel (1 ligne Push) | 25 ms | **9 ms** |
| Connexion (hachage scrypt volontairement coûteux) | 245 ms | 117 ms |

(*) Avec 50 000 comptes et le code 56.33.10, une modification de fiche relisait et réécrivait chaque compte : 933 ms
mesurés à un stade intermédiaire, 30 à 36 ms en 56.33.11.

Chef de site (2 500 salariés), médianes 56.33.11 :
- annuaire : 5 ms ;
- journal du jour : 31 ms ;
- journées : 29 ms ;
- synthèse sur 30 jours : 36 ms ;
- accueil : 3 ms.

## 3. Pointeuses et import

| Opération | 56.33.10 | 56.33.11 |
|---|---:|---:|
| Ingestion Push (20 pointeuses en parallèle) | 1 076 badgeages/s | **6 896 à 7 484 badgeages/s** |
| 5,5 millions de badgeages | ~1 h 25 (estimation) | **12 min 15 s** (mesuré) |
| Renvoi de badgeages déjà reçus (doublons) | — | 5 961/s, doublons exacts |
| Import de 50 000 salariés | 78 s (641/s) | lots de 1 000 en ~1,5 s |
| Synchronisation de 50 000 comptes sans changement | impraticable (~100 000 requêtes) | **1,1 s** |

**Bug corrigé** : le même lot de badgeages pouvait être traité deux fois en parallèle. La reprise automatique reprenait
un lot en cours de traitement, ce qui produisait l'erreur « duplicate key raw_events » ; 40 lots sur 205 étaient
concernés lors du premier essai. Aucun badgeage n'était perdu, mais le travail était fait en double et le journal se
remplissait d'erreurs. Un lot est maintenant pris en charge de façon exclusive.

## 4. Charge simultanée

Le test cumule des utilisateurs qui enchaînent les écrans (annuaire, recherche, badgeages, journées, anomalies,
« À traiter », accueil) et les 20 pointeuses qui envoient chacune un badgeage toutes les 100 ms.

| Scénario | Débit | Médianes | Erreurs |
|---|---|---|---|
| 56.33.10 (avant cette série) : 100 utilisateurs sans pause | 16 écrans/s | 2 à 15 s ; badgeage 30 s ; accueil en délai dépassé | 11 |
| **300 utilisateurs, un clic toutes les 3 s** (usage réel) | 88 écrans/s, 74 badgeages/s | annuaire 39–45 ms, badgeages 74–93 ms, À traiter 43 ms, journées 212 ms, accueil 371 ms, anomalies 439 ms, badgeage 141 ms | **0** |
| 100 utilisateurs sans aucune pause (capacité maximale) | **180 écrans/s** | 67 ms à 1,4 s (file d'attente) | **0** |

Dans le dernier scénario, le temps de réponse mesure la file d'attente : 100 requêtes permanentes ÷ 180 par seconde.
Sur un serveur de production avec PostgreSQL sur sa propre machine et 8 cœurs ou plus, la capacité augmente d'autant.

## 5. Ce qui a été changé (sans changer les résultats)

Chaque optimisation a été comparée à l'ancien code :
- ingestion : lots piégés identiques à 56.33.10 sur SQLite ;
- fuseaux horaires : 319 200 conversions identiques ;
- annuaire : 288 requêtes identiques, et 800 listes identiques après modifications.

1. **Ingestion** :
   - normalisation par lot : les doublons sont cherchés en 3 requêtes par lot, les écritures sont multi-lignes ;
   - fuseau horaire et décalage UTC mis en mémoire (30 % du temps auparavant) ;
   - prise exclusive des lots ;
   - réinitialisation unique du moteur pour une rafale de lots.
2. **Annuaire** :
   - tris préparés une fois, mis à jour de façon incrémentale ;
   - un seul passage par requête ;
   - instance conservée entre les requêtes (elle était recréée à chaque requête).
3. **Recherche** :
   - chaque mot tapé doit figurer, dans n'importe quel ordre (« amine trab » trouve « Trabelsi Amine ») ; la phrase
     exacte est classée en premier ;
   - côté navigateur, recherche pendant la frappe avec le focus conservé, et total réel affiché (« 50 au total »
     s'affichait avec 49 000 salariés).
4. **Paramétrage** : copie partagée et gelée, revalidée par sa version. Avec 50 000 comptes, il pèse 8 à 16 Mo ; il
   était relu et décodé plusieurs fois par requête, y compris à chaque contrôle de session.
5. **Salariés en mémoire** : la fiche modifiée est remplacée dans la liste au lieu de relire les 50 000. La mise à jour
   est annulée si la transaction échoue.
6. **Comptes** : une lecture groupée ; seuls les comptes modifiés sont réécrits, et seulement ceux des salariés
   enregistrés.
7. **Calculs** :
   - deux priorités dans les fils de calcul : l'écran avant le rattrapage de fond ;
   - fils de calcul en priorité basse sous Linux (`FIWAKTI_PRIORITE_CALCUL`) ;
   - sélection, matricules et jours attendus mis en mémoire ;
   - calcul unique partagé entre les demandes simultanées ;
   - comptes d'anomalies mis en cache à part de la pagination.
8. **Temps réel** : un badgeage reçu d'une pointeuse ne fait plus abandonner tous les caches. Les résultats sont servis
   au plus 5 s, et la journée d'aujourd'hui ou d'hier est marquée « à rafraîchir » au lieu d'être effacée. Une
   modification faite par un utilisateur reste prise en compte immédiatement. Le journal des badgeages bruts reste
   instantané.
9. **Base de données** :
   - index de la file d'ingestion par pointeuse ;
   - index `enreg(coll, d, id)` pour le journal des badgeages ;
   - les deux sont créés sans bloquer les écritures (`CONCURRENTLY`) ;
   - comptages de l'état du système mis en mémoire 5 min.
10. **Périmètres** : sous-arbre des services indexé. L'ancien parcours était quadratique pour chaque salarié examiné, ce
    qui représentait des milliards d'opérations pour un profil défini par services.

## 6. Limites connues et recommandations

- **Comptes du portail (principal chantier restant)** : l'écran de gestion des comptes de l'administrateur charge les
  50 000 comptes à l'ouverture (14 Mo, 114 ms côté serveur). Il les renvoie en entier au moindre changement de compte.
  À servir par page comme l'annuaire (refonte de l'écran des comptes).
- **Chef de site** : il reçoit l'identité des 50 000 comptes (6,9 Mo) à l'ouverture. À restreindre aux comptes de son
  périmètre, après vérification des usages côté écran (délégations, messages).
- **File d'ingestion** : `ingestion_queue` n'est jamais purgée. Elle garde chaque lot reçu avec son contenu, ce qui
  double le volume des événements bruts. Prévoir une purge des lots traités au-delà de la durée de conservation.
- **Matériel** : PostgreSQL sur un serveur dédié (ou 8 cœurs ou plus au total), 16 Go de mémoire, disque SSD.
  `shared_buffers` à environ 25 % de la mémoire.
- **SQLite** reste réservé aux petits effectifs : c'est un seul écrivain, et un seul fil de calcul.

## 7. Compteurs, règles de sortie, modules et interface (deuxième série)

### Compteurs arithmétiques
Le moteur calcule déjà, journée par journée et selon les règles versionnées (paramétrables par société, site,
service, équipe, planning, catégorie ou salarié) :
- les heures de nuit (fenêtre paramétrable) ;
- le travail du dimanche et des jours fériés ;
- les heures supplémentaires par tranche (seuils et taux) ;
- la récupération, les absences payées ou non ;
- les taux de majoration.

- **Bug corrigé** : la variable `NUIT` valait « non calculé » les jours sans badgeage. Le total d'une période qui
  contenait un repos ou un week-end était perdu : un compteur d'heures de nuit ne pouvait donc pas fonctionner.
- **13 compteurs standard ajoutés** s'ils manquent : heures de nuit, de dimanche et de jours fériés et leurs
  majorations, heures supplémentaires par tranche et leur majoration, heures à récupérer, absences payées et non
  payées, nombre de jours fériés. Ils restent modifiables et supprimables. Leurs valeurs ont été vérifiées à la main
  sur un cas réel (dimanche, jour férié, nuit, longues journées).
- **Calcul des compteurs 25 % plus rapide**, résultats identiques (300 calculs × 36 compteurs comparés, jour par jour
  et en total).
- **Export des éléments variables** réparti sur tous les fils de calcul : 49 000 salariés sur un mois en **87 s**
  (177 s auparavant), fichier identique octet par octet.

### Salariés sortis et absents (biométrie, portail, badge)
- **Absence** (congé, maladie…) : blocage biométrique déjà géré par le serveur, paramétrable par type d'absence (fin
  automatique, levée par les RH, délai de grâce) ; les empreintes sont retirées des appareils puis rediffusées au
  retour. Les types d'absence qui bloquent sont à choisir dans le paramétrage (aucun par défaut).
- **Sortie, nouveau** : dès que la date de sortie est passée (même saisie à l'avance, même si personne n'ouvre
  l'application) :
  - retrait automatique de toutes les pointeuses et de tous les lecteurs d'accès (empreintes, visage, badge, code) ;
  - connexion au portail refusée et sessions ouvertes fermées immédiatement ;
  - compte désactivé par une tâche horaire, avec une trace dans l'audit.
  Vérifié sur le banc.

### Modules (avec volume)
Données de test : 150 000 visites médicales, 150 000 inscriptions et 100 000 habilitations de formation, 500 000
niveaux de compétences, 20 000 événements HSE, 50 000 candidatures et 100 000 évaluations (script
`outils/banc-modules.sql`). Résultats :
- toutes les routes de lecture répondent en moins de 70 ms pour l'administrateur et moins de 105 ms pour le chef de
  site ;
- cinq routes (BI, compétences, visiteurs) passent de 200–330 ms à 2–52 ms ;
- les écarts de compétences chargent une fois un index en mémoire (environ 1 s au premier appel), puis répondent en
  5 ms.

### Interface
- Totaux réels en grand effectif : menu « Employés », en-tête de l'écran Pointages.
- En-têtes plus compacts, chiffres alignés, survol des lignes, focus clavier visible, champ de recherche harmonisé.
- Vérifié en clair, en sombre et en arabe, sans erreur JavaScript.

## 8. Navigateur avec 50 000 comptes, file d'ingestion, réglages (troisième série)

- **Écran « Utilisateurs » : navigateur figé 101 s → 0,3 s.** Le contrôle des accès recalculait, pour chacun des
  50 000 comptes, les délégations reçues en reparcourant tous les comptes (2,5 milliards d'opérations). Les
  délégations passent par un index reconstruit une fois par rendu (résultat et ordre identiques).
- **Chaque clic : environ 155 ms → 29 ms.** La cloche de notifications recomptait les 50 000 comptes trois fois
  à chaque rendu. Les comptages se font maintenant en un passage, gardés 5 s.
- Mesure de **tous les écrans du menu** (administrateur) : tous sous 260 ms, presque tous sous 100 ms, sans
  erreur JavaScript.
- **Chef de site** : il ne reçoit plus que les comptes utiles (son périmètre, les responsables, les délégations).
  L'ouverture passe de 6,9 Mo à 774 Ko.
- **File d'ingestion** : les lots traités sont purgés au-delà de `conservation.fileJours` (30 jours par défaut). Leur
  contenu reste dans les événements bruts ; les lots en attente ou en erreur ne sont jamais purgés.
- **Fils de calcul** : leur nombre est réglable sur un gros serveur (`FIWAKTI_FILS_CALCUL` ou `filsCalcul`,
  4 au plus par défaut).
- **Limite connue** : l'export annuel des congés (49 000 salariés × 365 jours) prend 285 s sur la machine de test.
  Le recours : plus de fils de calcul sur un gros serveur, ou des cumuls mensuels arrêtés (évolution à valider, car
  elle touche au calcul des droits à congés).

## 9. Purge des pointeuses après import, avec copie sur le serveur (quatrième série)

Constat avant correction :
- le pilote ZK natif effaçait l'appareil dès que l'enregistrement répondait « ok », même si la lecture avait été
  tronquée (coupure réseau) ;
- un pilote externe pouvait effacer l'appareil lui-même **avant** l'enregistrement par FIWAKTI ;
- aucune copie des badgeages bruts n'était gardée sur le serveur.

Règle appliquée (56.33.11), dans cet ordre :
1. appareil verrouillé (`DISABLE`), nombre de badgeages relu, lecture ;
2. **copie de sauvegarde** écrite dans `donnees/archives-pointeuses/<pointeuse>/<AAAA-MM>/*.fwa` : JSON compressé,
   chiffré AES-256-GCM (clé `sauvegarde` du coffre), empreinte SHA-256 contrôlée à la relecture, fichier 0600 écrit
   puis synchronisé sur disque (`fsync`) ;
3. enregistrement dans FIWAKTI ;
4. purge **seulement si** l'option « purger après collecte » est cochée, la copie est écrite, l'enregistrement est
   confirmé et la lecture est complète (autant de badgeages lus que l'appareil en annonce). Sinon le motif est rendu
   (`purgeNonFaite`) et l'appareil garde tout ; la collecte suivante renvoie les mêmes badgeages, écartés comme doublons.
- Pilotes externes : l'option `purgeInterdite` leur est transmise pendant la collecte ; un pilote qui purge malgré tout
  est tracé (`pointeuse.purge_par_pilote` dans l'audit) et la copie de sauvegarde est écrite.
- Conservation : les archives sont supprimées par mois entiers au-delà de `conservation.badgeagesAns` (tâche nocturne
  « purge-file-ingestion »).

Vérifié sur le banc (PostgreSQL, 50 000 salariés) avec un pilote externe simulé : copie écrite (0600), déchiffrée et
SHA-256 identique, `purgeInterdite:true` reçu par le pilote, purge forcée par le pilote tracée dans l'audit, pilote
modifié refusé (403) jusqu'à nouvelle approbation, 2ᵉ collecte : 3 doublons, 0 intégré. Collecte à froid 6,5 s (premier
chargement de l'annuaire), puis 0,25 à 0,75 s. La règle de purge du pilote ZK (`refusPurge`) est testée sur 6 cas
(copie absente, archive en échec, enregistrement refusé, lecture tronquée, nombre annoncé inconnu, cas nominal).

## 10. Module d'import des salariés (quatrième série)

Parcours testé dans le navigateur (Chromium, 50 000 salariés, PostgreSQL) : dépôt du fichier, correspondance,
contrôle, import, puis relecture en base. Fonctionnait déjà : colonnes non reconnues proposées en « Créer le champ
personnalisé », valeurs écrites dans l'historique de la fiche, champs et fiches enregistrés sur le serveur, ré-import
reconnu automatiquement (la colonne retrouve le champ créé).

Corrigé / ajouté :
- **Bouton « Créer toutes les colonnes non reconnues comme champs personnalisés »** : un clic au lieu d'un choix par
  colonne ; le type est proposé d'après les valeurs et reste modifiable colonne par colonne.
- **Type du champ** : « saisie libre » ou « liste des valeurs du fichier ». Avant, toute colonne de 30 valeurs ou moins
  devenait une liste fermée (un fichier de 20 salariés transformait les numéros de téléphone en liste). La liste n'est
  conseillée que si les valeurs se répètent, sont courtes et ne sont pas des numéros.
- **Champ existant en liste** : les nouvelles valeurs du fichier complètent la liste (indiqué dans le rapport).
- Codes de champ propres (`N_CNSS` et non `N__CNSS`), jamais un code réservé (MATRICULE, NOM…), garde si la liste des
  champs est absente.
- **Classeurs Excel (.xlsx, .xlsm) lus directement**, sans bibliothèque (décompression du navigateur, extension chargée
  au dépôt d'un classeur seulement) : première feuille, dates au format date converties en JJ/MM/AAAA, nombres,
  textes partagés, cellules contenant « ; ». Décompression plafonnée à 150 Mo (archive piégée). Les anciens `.xls`/`.ods`
  restent refusés avec un message clair.
- **En-têtes en arabe reconnus** : la normalisation ne gardait que A-Z/0-9, un en-tête arabe devenait vide et n'était
  jamais associé. Ajout d'alias courants en français (« Date d'entrée », « Service », « Responsable »,
  « Téléphone portable »…) et en arabe (« رقم التسجيل », « اللقب », « الاسم », « تاريخ الانتداب »…).

## 11. Sécurité informatique (quatrième série)

Tests réels sur le serveur du banc (PostgreSQL, 50 000 salariés) :

| Contrôle | Résultat |
|---|---|
| En-têtes : CSP stricte (`script-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | OK |
| Cookie de session `HttpOnly`, `SameSite=Strict` (`Secure` en HTTPS) | OK |
| Traversée de chemin (`..`, `%2e%2e`, `%2f`, `%5c`, octet nul) sur `/public`, `/app`, `/app/modules`, avec et sans session | 404 partout |
| API sans session | 401 |
| CSRF : requête sans jeton ou d'une autre origine | 403 |
| Taille des corps de requête | bornée (1 Mo par défaut, 300 Mo coupés) |
| Force brute : verrouillage du compte après 5 échecs, 20 essais par adresse, ralentissement global | OK |
| XSS stockée : `<img onerror>`, `<svg onload>`, `<script>` importés dans nom, prénom et champ personnalisé, affichés en liste et en fiche | affichés comme du texte, rien d'exécuté |
| Périmètres : chef de site lisant/écrivant un salarié hors périmètre, actions d'administration | refusé (`hors`), écriture ignorée, 403 |
| Injection SQL : requêtes construites par concaténation | paramètres `?` ou identifiants internes ; `LIMIT`/`OFFSET` convertis en nombres bornés |
| Secrets dans les journaux (mot de passe PostgreSQL, mot de passe administrateur) | absents |
| Droits des fichiers de `donnees/` | 0700 / 0600 |

Corrigé :
- **Énumération des identifiants** : seul un compte existant pouvait répondre « Compte verrouillé » ; un identifiant
  inconnu ou inactif est désormais verrouillé de la même façon (même nombre d'essais, même durée, même message).
- **Injection de formules dans les exports CSV** du suivi médical et des visiteurs (nom, société, motif saisis par des
  personnes extérieures) : une cellule commençant par `=`, `+`, `-`, `@` est neutralisée, comme dans les exports de
  l'application (`csvCell`).
- **Dépendances** : `fflate` 0.8.3 (boucle infinie sur une archive ZIP64 malformée, dans le fil principal du module
  Migration) et `mysql2` 3.24.6 (fuite du mot de passe par rétrogradation d'authentification, décompression non bornée).

Reste connu : `xlsx` 0.18.5 (SheetJS, module Migration) a deux failles publiées sans version corrigée sur npm. La
lecture est déjà isolée dans un fil séparé (mémoire 1,5 Go, 2 min au plus, résultat recopié), ce qui contient la
pollution de prototype et le déni de service. Pour supprimer la dépendance, l'éditeur peut installer la version
corrigée de cdn.sheetjs.com. L'import des salariés n'utilise pas cette bibliothèque (lecture .xlsx propre au navigateur).
Le paquet `.fwk` livrant `node_modules`, il doit être reconstruit (`npm ci`) puis re-signé par l'éditeur.

## 12. Ergonomie (quatrième série)

- **Import, étape Contrôle** : listes de choix et champs alignés sur le reste de l'application (ils avaient l'aspect
  natif du navigateur) ; un élément encore « à traiter » est surligné en orange ; bouton « tout créer » pour les colonnes.
- **Collecte d'une pointeuse** : le message dit exactement ce qui s'est passé, dans les trois langues :
  mémoire vidée (après copie, lecture complète et enregistrement confirmés), conservée car l'effacement n'est pas
  demandé, ou conservée avec le motif (copie impossible, lecture incomplète, badgeages non enregistrés, refus de
  l'appareil) ; présence de la copie de sauvegarde chiffrée. Avant : « conservée (intégration non confirmée) » même quand
  l'effacement n'était simplement pas demandé.
- La case « Effacer les badgeages de l'appareil » rappelle les conditions de l'effacement ; l'état de chaque pointeuse
  garde la dernière purge, son motif de refus et le nom de la copie ; un refus est écrit au journal.

## 13. Pointeuses biométriques et faciales autres que ZK (cinquième série)

Chaque pilote est testé contre un appareil simulé : terminal Hikvision ISAPI avec authentification Digest réelle et
pagination, serveur Suprema BioStar 2 (heures en UTC), dossier d'export Sagem/Morpho, appareil ZK Push.

| Pilote | Défaut constaté | Correction | Vérifié |
|---|---|---|---|
| Hikvision | collecte limitée aux **visages** (type 75) : un terminal à empreinte ou à badge ne remontait **aucun** badgeage | badge, badge+code, empreinte, badge+empreinte(+code), empreinte+code, visage ; types réglables par appareil ; doublons écartés par n° d'événement | 122 badgeages (120 empreintes sur 2 pages, 1 badge, 1 visage), l'échec d'empreinte ignoré |
| Hikvision | photo de visage téléchargée à l'adresse fournie par l'appareil, avec ses identifiants, sans contrôle | adresse suivie seulement si elle désigne le même appareil | photo du même appareil lue et chiffrée, adresse externe ignorée |
| BioStar 2 | heure UTC prise pour l'heure locale : **1 h d'écart** en Tunisie (2 h en été ailleurs) | l'ingestion accepte une heure avec fuseau (`Z`, `+01:00`) et la convertit dans le fuseau du site | 07:00Z → 08:00, 16:15Z → 17:15 |
| BioStar 2 | sens jamais lu ; session jamais fermée | touche T&A (F1 entrée, F2 sortie, réglable) ; déconnexion après chaque action | IN / OUT corrects, déconnexion à chaque appel |
| Sagem / Morpho | un fichier illisible était quand même **rangé** dans `integres/` : ses passages n'étaient jamais intégrés | seuls les fichiers lus sont rangés, après enregistrement ; les autres restent avec un message | fichier valide intégré, fichier mal formé laissé dans le dossier |
| Sagem / Morpho | **sortie ou absence : empreinte jamais retirée** (« non pris en charge ») | fichier de suppression `a-supprimer/` pour MorphoManager | fichier créé avec le matricule du salarié sorti |
| ZK Push | « Effacer les badgeages » pouvait perdre des badgeages pas encore transmis | demande de renvoi des badgeages avant l'effacement (exécutés dans l'ordre par l'appareil) | ordre des commandes vérifié |
| Tous | copie de sauvegarde seulement pour ZK et pilotes externes | copie chiffrée automatique de toute collecte, quel que soit le pilote | copie écrite pour Hikvision, BioStar 2, Sagem |

**Règles biométriques (sortie, congé, maladie)**
- **Blocage pendant une absence : ne fonctionnait pas.** La synchronisation lisait un référentiel « tts » qui n'existe
  pas : la liste des types d'absence était **vide à l'écran** (impossible d'en cocher) et aucune absence ne déclenchait
  de blocage. Corrigé, avec une valeur par défaut : toute absence à la journée bloque (congé annuel, maladie,
  maternité, absence non justifiée, longue durée, congés spéciaux), mais pas les absences à l'heure (visite médicale,
  autorisation) ni les missions et formations. Ce choix reste modifiable dans le réglage.
- Vérifié : congé maladie saisi → salarié bloqué et retrait mis en file sur la pointeuse de son site ; salarié sorti →
  retrait en un cycle sur Hikvision (visage puis personne), BioStar 2 (utilisateur) et Sagem (fichier), et mis en file
  pour ZK Push.
- Un appareil dont le pilote ne sait pas retirer un utilisateur produit désormais une **alerte d'audit**
  (« à retirer à la main ») au lieu d'un « ok » silencieux.
- Rappel : la synchronisation biométrique est **désactivée par défaut**. Elle doit être activée à l'installation
  (Appareils › Synchronisation biométrique), sinon les règles de sortie et de blocage ne s'appliquent pas.

Mesure : 120 badgeages pour 120 salariés s'intègrent en 0,3 à 0,5 s une fois le serveur démarré (3,5 s pour le premier
lot après redémarrage). 120 badgeages d'un même salarié le même jour prennent 1,5 s, sans conséquence en pratique :
on compte 2 à 8 badgeages par jour.

## 14. Module BI « Pilotage transverse » (cinquième série)

Testé sur le banc (50 000 salariés, 2,26 millions de journées calculées), dans le navigateur en français et en arabe.

Ce qui existait : indicateurs agrégés de RH, Temps, Compétences, Formation, Évaluations, HSE, Suivi médical et
Recrutement ; filtres site / service / fonction ; périmètre de l'utilisateur respecté ; tendances ; personnalisation ;
cache serveur.

Ajouté :
- **Couverture** : jours fériés et jours de repos travaillés (jours et heures), oublis de badgeage, journées en anomalie,
  **absences par type** (jours et part de chaque type), **Visiteurs** (prévues, réalisées, annulées, entreprises),
  **Intégration** (parcours en cours, tâches en retard, tâches faites à temps), **règles biométriques** (salariés
  bloqués pendant une absence, retraits en attente ou en échec). Chaque domaine n'apparaît que si son module est actif.
- **Comparer par site, service ou fonction** : tableau des indicateurs principaux par groupe (effectif, présence,
  absentéisme, heures supplémentaires, retards, accidents), triable par colonne, exporté avec le reste.
- **Périodes** : mois en cours, mois précédent, année en cours, dates choisies (en plus de 30 jours, 3 mois, 12 mois) ;
  la tendance compare toujours à la période précédente de même durée.
- **Paramétrage partagé** : avec le droit de paramétrage des états, « Enregistrer pour tous les utilisateurs » fixe les
  objectifs et les indicateurs affichés par défaut ; chacun peut encore les ajuster pour lui-même.
- Export CSV : cellules neutralisées (pas de formule exécutée par le tableur). Libellé du cache corrigé (30 min, et non 5).

Temps de réponse (banc) :
- tableau complet : 5,6 s au premier calcul, puis servi par le cache ; préchauffé en tâche de fond 90 s après le
  démarrage et toutes les 30 min ;
- ventilation : 0,7 à 1 s (296 services), préchauffée pour la vue par site ;
- affichage complet de l'écran depuis le cache : 0,8 s.

Non couvert : le détail par compteur (heures de nuit, majorations par taux) n'est pas conservé dans les journées
calculées. Il reste disponible dans les États, calculés à la demande.
