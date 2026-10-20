# FIWAKTI — guide pour Claude Code

Plateforme RH « FIWAKTI Enterprise » : pointage et gestion du temps de travail conforme à la
réglementation tunisienne (conventions collectives), étendue par des modules « FW- » activés par licence.
Version de ce dépôt : **56.33.12** (voir `serveur/version.json`).

## Structure
- `serveur/` — serveur Node.js (≥ 22.13), point d'entrée `principal.js`, sans framework.
  - `bd.js` (SQLite intégré `node:sqlite` ou PostgreSQL via `pg`), `moteur.js` / `calcul.js` / `recalcul.js` (calcul des heures),
    `workflow.js` (circuits de validation), `perimetre.js` (contrôle des périmètres), `licence.js` + `cle-publique.json`,
    `pointeuses.js` + `pilotes/` (ZK, ZK Push, Hikvision, BioStar 2, Sagem), `planificateur.js` (tâches, sync 03h00).
  - `modules/FW-*.json` (manifeste) + `FW-*.serveur.js` (routes du module).
- `app/` — application cliente (`app.js`, `index.html`) et `app/modules/FW-*/` (chargés à la demande).
- `public/` — pages publiques : connexion, installation.
- `CARTE-DEPENDANCES.md` — dépendances entre modules (aucune dépendance circulaire autorisée).

## Lancer en développement
```
cd serveur
npm ci            # seulement si node_modules est absent
FIWAKTI_RACINE=../.dev FIWAKTI_PORT=8099 node principal.js
```
(Windows : `demarrer-dev.cmd`.) Puis ouvrir http://localhost:8099/installation.html.
Les données (config.json, base SQLite, journaux, sauvegardes) vont dans `$FIWAKTI_RACINE/donnees`.
Sans `FIWAKTI_RACINE`, la racine est trois niveaux au-dessus de `serveur/` (structure d'installation
`<racine>/versions/<version>/serveur`) — toujours la définir en développement.
PostgreSQL : `FIWAKTI_PG_URL=postgres://...`.

## Règles du projet
- Interface trilingue : arabe, français, anglais. Dates affichées en jj/mm/aaaa.
- Le terme « Paie » est interdit : utiliser « Éléments variables » (interface, exports, journaux, code).
- Authentification et règles critiques toujours côté serveur ; contrôle strict des périmètres sur tous les écrans
  et matrice d'autorisations par écran (lecture, création, modification, suppression, validation, export, impression).
- Dimensionnement : ≥ 20 000 employés — pagination et recherche côté serveur, pas de chargement global
  de données, modules ou matrices dans le navigateur.
- Mises à jour sans perte : migrations de base automatiques, compatibles SQLite **et** PostgreSQL.
- Purge des pointeuses seulement après intégration confirmée.
- Ne jamais écrire de secret dans les journaux (voir `masquerSecrets` dans `principal.js`).
- Chaque nouvelle version : incrémenter `serveur/version.json` et `serveur/package.json`, mettre à jour
  `CARTE-DEPENDANCES.md` si un module change, vérifier `node --check` sur les fichiers modifiés.

## Grand effectif (56.33.11)
- `D.referentielLecture()` : paramétrage partagé et **gelé** (lecture seule, revalidé par la version de `kv`). Pour le
  modifier, utiliser `D.referentiel()` (copie neuve). Toute écriture de `fiwakti:ref:v1` doit incrémenter `kv.version`.
- `D.employes()` renvoie un tableau qui change d'identité à chaque modification : les caches dérivés se comparent par
  identité (annuaire, correspondance des pointeuses, sélection des calculs). Ne jamais modifier ce tableau.
- Caches de calcul : `GENERATION` (modification par un utilisateur, effet immédiat) et `GEN_P` (badgeage reçu d'une
  pointeuse, résultats servis au plus 5 s).
- Banc de charge : `node outils/banc-charge.js referentiel|employes N|comptes N|push N J|mesures|mesures-chef|concurrence U S [pauseMs]`
  (serveur installé, `FIWAKTI_DEBIT=1000000` pour lever la limite par adresse en essai). Voir `PERFORMANCES-GRAND-EFFECTIF.md`.

## Paquets de mise à jour (.fwk)
Construction de la livraison : `node outils/construire-paquet.js [--cle CLE_PRIVEE]` (dossier, archive, .fwk ;
voir INSTALLATION.md). Scripts livrés : `outils/livraison/installer-maj.js` (mise à jour d'une installation) et
`outils/livraison/lanceur.js` (lanceur de référence : code 75, versions/essai.txt).
Les fichiers `FIWAKTI-maj-*.fwk` sont du JSON signé (`format: fiwakti-maj-1`) contenant chaque fichier en base64
avec son SHA-256. Ce dépôt a été extrait du paquet 56.33.10 (1 339 fichiers, empreintes vérifiées).
Correctifs PowerShell (livraison/FIWAKTI-<version>-correctif-N.zip) : ils visent `versions\<version du dépôt>` ; depuis la
56.33.12 (qui intègre le correctif final et les correctifs 2 à 42), leur paramètre `-Version` par défaut doit être 56.33.12.
Un paquet modifié doit être re-signé avec la clé privée de l'éditeur (absente de ce dépôt) pour être accepté.

## Version de démonstration autonome
`node outils/construire-demo.js` produit `livraison/FIWAKTI-demo.html` : un seul fichier, en mode démo, sans serveur.
Les modules rejouent `outils/demo/modules-reponses.json` ; leurs écritures sont appliquées en mémoire par
`outils/demo/rejeu.js` (créations ajoutées aux listes, actions faite / clore / étape…, filtrage par statut). Le constructeur échoue si
`demoDemande` change dans `app.js`. Reconstruire après toute modification de `app/` ou des manifestes de modules.
