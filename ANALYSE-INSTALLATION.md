# Analyse de l'installation — FIWAKTI 56.33.10

Source analysée : `fiwakti-56.33.10-claude-code.zip` (1 343 fichiers, dont `serveur/node_modules`).
Périmètre : assistant `public/installation.html` + `installation.js`, routes `/api/installation*` et
démarrage dans `serveur/principal.js`, scripts `demarrer-dev.*`.

## 1. Méthode

- `node --check` sur tous les fichiers serveur, pilotes, modules et clients : **aucune erreur**.
- Serveur lancé réellement (Node 22.22.0) avec `FIWAKTI_RACINE` isolé, puis parcours testés de bout en bout :
  1. installation **base intégrée (SQLite)** ;
  2. installation **PostgreSQL 16** (mot de passe accentué) ;
  3. **reprise après sinistre** sur une autre racine et une autre base PostgreSQL (trousseau + sauvegarde chiffrée).
- Pour signer une licence de test sans la clé privée de l'éditeur, `cle-publique.json` a été remplacée par une clé de
  test **uniquement dans la copie de test** (rien n'est modifié dans le paquet).

## 2. Ce qui fonctionne

| Point | Résultat |
|---|---|
| Démarrage, `/api/sante`, page d'installation | OK |
| Contrôles de la machine (Node LTS, écriture, base, disque, HTTPS, heure, sauvegardes) | OK, pertinents |
| Code d'installation pour un poste distant (`jeton-installation.txt`, 0600, absent du journal) | OK |
| Refus des requêtes POST d'une autre origine (`Origin` ≠ `Host`) | OK |
| Installation SQLite : compte admin, licence, config 0600, 1ʳᵉ sauvegarde chiffrée vérifiée | OK |
| Installation PostgreSQL : bascule de base à chaud, sauvegarde `.pgjson.gz.chiffre` | OK |
| Reprise après sinistre (mot de passe sans accent) : bilan, chaîne d'audit intègre, licence reprise | OK (1,2 s) |
| Après installation, `/installation.html` et `/api/installation*` redirigent vers `/` | OK |

## 3. Anomalies constatées

### 🔴 Importantes

**A. Reprise après sinistre impossible si le mot de passe PostgreSQL contient un accent (ou tout caractère non ASCII).**
`installation.js` envoie la base cible dans l'en-tête `X-Base` avec `btoa(JSON.stringify(base))` : `btoa` code en
Latin-1, alors que le serveur décode en UTF-8 (`Buffer.from(…, "base64").toString("utf8")`).
- « é » → mot de passe altéré → *« Utilisateur ou mot de passe PostgreSQL refusé »*, alors que le bouton
  « Tester la connexion » vient de réussir (reproduit).
- Caractère hors Latin-1 (arabe, €…) → `btoa` lève une exception côté navigateur, message incompréhensible.

Correctif (client) : `btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(base||{}))))`.

**B. Assistant d'installation accessible sans code depuis le réseau derrière un proxy HTTPS local.**
Le code d'installation n'est exigé que si `!estLocal(req)`, et `estLocal` se fonde sur l'adresse de la connexion.
Or la solution proposée par le contrôle HTTPS est justement « placer FIWAKTI derrière un proxy HTTPS sur ce serveur » :
toutes les requêtes arrivent alors de `127.0.0.1` et l'assistant (choix de la base, création de l'administrateur)
est ouvert à tout le réseau tant que l'installation n'est pas terminée, sauf si `proxyConfiance` a été ajouté à la main
dans `config.json` (impossible depuis l'interface avant installation).
Même cause : le compte provisoire `admin`/`admin` de l'installation rapide (`b.rapide`), censé « ne fonctionner que sur
le serveur lui-même », est utilisable à distance à travers ce proxy.
Correctif : exiger le code d'installation aussi en local dès qu'un en-tête `X-Forwarded-For`/`Forwarded` est présent,
ou toujours l'exiger sauf requête directe sans en-tête de proxy.

**C. Aucune vérification de l'en-tête `Host` (rebinding DNS).**
Requête testée avec `Host: evil.example:8099` et `Origin: http://evil.example:8099` : acceptée et traitée comme locale.
Une page web malveillante ouverte sur le serveur pendant l'installation peut donc piloter l'assistant.
Correctif : avant installation, n'accepter que `localhost`, `127.0.0.1`, `[::1]`, le nom de la machine et ses adresses IP.

### 🟠 Moyennes

**D. Mode « Serveur d'entreprise » sans certificat : installation silencieusement limitée au poste.**
Sans HTTPS, le serveur n'écoute que sur `127.0.0.1` (choix volontaire v46), le contrôle n'est qu'« à vérifier », et
l'écran final affiche comme « adresse à communiquer aux utilisateurs » `http://localhost:8099/`, inutilisable par les
autres postes. Proposer : rendre le contrôle HTTPS bloquant (ou un avertissement explicite) quand le mode
« entreprise » est choisi, et ne pas afficher une adresse `localhost` comme adresse réseau.

**E. Licence affichée avec de mauvais modules.**
`/api/installation/licence` ne renvoie que `modules` (lettres historiques P/A). Pour une licence v2 (liste `fw`),
`modules` est absent et l'écran affiche « Contrôle d'accès » (reproduit avec une licence `FW-Time` + `FW-Formation`).
Correctif : renvoyer `fw` et l'afficher (ex. `j.fw.join(", ")`).

**F. Dépassement de délai possible pour une grosse sauvegarde.**
`serveur.requestTimeout = 300000` (5 min) s'applique aussi à `POST /api/installation/restaurer`. Une sauvegarde
PostgreSQL de plusieurs Go (≥ 20 000 salariés) envoyée depuis un autre poste peut être coupée.
Prévoir une exception pour cette route (ou `req.setTimeout(0)`).

**G. Mot de passe PostgreSQL d'un secret Docker écrit en clair dans `config.json`.**
`FIWAKTI_PG_MDP_FILE` est lu au démarrage et injecté dans `CONFIG.base.url`, puis `ecrireConfig(CONFIG)` (fin
d'installation) l'enregistre dans `donnees/config.json` — contraire à l'intention du commentaire v47 (« jamais dans
l'image ni dans une variable »). Même remarque pour `FIWAKTI_PG_URL`. Ne pas persister `base` quand il vient de
l'environnement. (Pour une base saisie dans l'assistant, le stockage en 0600 est acceptable.)

### 🟡 Mineures

- **H.** `POST /api/installation/base` avec le corps `null` → erreur 500 (`b.type` sur `null`) ; mettre `b = b || {}`.
- **I.** Restauration en échec : le fichier envoyé reste dans `donnees/sauvegardes` (peut accumuler des Go).
- **J.** Après une installation PostgreSQL, l'ancien `fiwakti.db` SQLite vide reste dans `donnees/`.
- **K.** `fiwakti.db`, `-wal` et `-shm` sont créés en 0644 (empreintes de mots de passe lisibles par les autres
  comptes Linux), alors que `config.json` et les sauvegardes sont en 0600. Appliquer un `umask` 077 au démarrage.
- **L.** `installation.js`, `voir(n)` : `sections[n-1]` suppose l'ordre du DOM, or la section 8 précède la 7 ;
  la mise au point (focus) est faite dans la mauvaise section aux étapes 7 et 8. Utiliser
  `sections.find(s => +s.dataset.etape === n)`.
- **M.** Saisie de la licence : si la réponse est un 403 (code d'installation manquant), le message affiché est vide.
- **N.** Règles de mot de passe : le navigateur ne vérifie pas les mots de passe courants ni le nom de
  l'administrateur (« Administrateur » par défaut) ; le serveur les refuse correctement, mais seulement au clic
  sur « Installer ». Le nom de l'entreprise n'est pas contrôlé à l'installation (`CONFIG.entreprise` encore vide).

## 4. Scripts de développement

- `demarrer-dev.sh` / `.cmd` : corrects ; `node_modules` est déjà livré dans le zip, `npm ci` n'est donc pas lancé.
- `.gitignore` exclut bien `node_modules/`, `.dev/`, `donnees/`, `*.fwk`.
- Avertissement attendu au démarrage : `ExperimentalWarning: SQLite is an experimental feature` (Node 22).

## 5. Priorités recommandées

1. A (reprise bloquée), B et C (sécurité de l'assistant avant installation).
2. D et E (l'utilisateur est induit en erreur à l'écran).
3. F et G, puis les points mineurs.

Rappel : toute correction doit être livrée dans un nouveau paquet `.fwk` **re-signé** avec la clé privée de l'éditeur,
avec incrément de `serveur/version.json` et `serveur/package.json`.
