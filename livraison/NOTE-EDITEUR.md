# FIWAKTI — corrections à reprendre dans la version de l'éditeur

Ces corrections partent de la version **56.33.10**, prise dans le paquet d'origine. Elles ont été livrées en **56.33.11**.
Elles ne sont dans aucune version de l'éditeur : une mise à jour 56.34.x (ou ultérieure) construite sans elles les
efface à son installation.

## Contenu

| Fichier | Rôle |
|---|---|
| `corrections-56.33.10-vers-56.33.11.patch` | Toutes les modifications du code (`serveur/`, `app/`, `public/`), au format `git diff` : 40 fichiers |
| `AUDIT-COMPLET.md` | Pour chaque constat : ce qui a été trouvé, la correction et la preuve. 15 constats critiques ou élevés, environ 35 moyens ou faibles |
| `PERFORMANCES-GRAND-EFFECTIF.md` | Mesures à 50 000 salariés et 5,5 millions de badgeages, avec les optimisations faites |
| `ANALYSE-INSTALLATION.md` | Anomalies de l'assistant d'installation, A à M |
| `BILAN-AVANT-INSTALLATION.md` | Prérequis, réglages et limites connues |
| `INSTALLATION.md` | Paquet de livraison, script de mise à jour et lanceur de référence |

## Appliquer sur une copie de 56.33.10

```
git apply --check corrections-56.33.10-vers-56.33.11.patch
git apply corrections-56.33.10-vers-56.33.11.patch
cd serveur && npm ci
```

## Reporter sur une version plus récente (56.34.x)

Appliquez avec `git apply -3`, ou fichier par fichier, en vous aidant d'`AUDIT-COMPLET.md`.

Points d'attention :

- **`app/app.js`** est minifié sur une seule ligne : le patch le remplace en entier. Reportez les changements de façon
  ciblée, dans votre source non minifiée :
  - 52 identifiants placés dans des attributs HTML sont échappés (`esc(x.id)`) ;
  - en mode serveur, aucune copie des données n'est gardée dans le navigateur (`localStorage` / IndexedDB), et la copie
    est effacée à la déconnexion ;
  - le contrôle CSRF vérifie strictement l'origine (`new URL(url, location.href).origin`).
- **Migrations ajoutées**, compatibles SQLite et PostgreSQL :
  - table `calc_invalidations` ;
  - index de la file d'ingestion par pointeuse ;
  - contrôle PostgreSQL 14 ou plus.
- **Dépendances** : `fflate` et `mysql2` ont été mis à jour pour des failles publiées (voir `package-lock.json`).
- **Numéro de version** : 56.33.11 est un numéro provisoire. Donnez à la version qui intègre ces corrections votre
  propre numéro, supérieur au dernier publié.
- **Signature** : le paquet `.fwk` doit être signé avec votre clé privée.
  - Commande : `node outils/construire-paquet.js --cle CLE`.
  - `serveur/cle-publique.json` n'a pas été modifié.
