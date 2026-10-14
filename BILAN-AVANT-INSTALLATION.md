# FIWAKTI 56.33.11 — bilan avant installation

Ce document rassemble ce qui a été vérifié et corrigé, ce qui **bloque** encore l'installation, les prérequis et les
réglages à faire le jour de l'installation. Détails et mesures : `ANALYSE-INSTALLATION.md` (assistant d'installation)
et `PERFORMANCES-GRAND-EFFECTIF.md` (sections 1 à 14).
Audit complet de sécurité, de logique métier, des modules et de l'exploitation (constats, corrections, preuves, ce qui
reste à vérifier sur site) : `AUDIT-COMPLET.md`.

## 1. Blocages : à lever avant d'installer

| # | Blocage | Pourquoi | Qui |
|---|---|---|---|
| B1 | **Paquet de mise à jour `.fwk` à signer** avec la clé privée de l'éditeur | Le serveur refuse toute mise à jour dont la signature ne correspond pas à `cle-publique.json`. La clé privée n'est pas dans ce dépôt. | Éditeur |
| B2 | **Reconstruire `node_modules`** (`cd serveur && npm ci`) avant de construire le paquet | `fflate` et `mysql2` ont été mis à jour (failles publiées) ; le paquet livre `node_modules`. | Éditeur / Claude |
| B3 | **Licence signée par l'éditeur** couvrant les modules souscrits | L'installation la demande ; elle est vérifiée avec la même clé publique. Les modules non couverts restent inactifs. | Éditeur |
| B4 | **Certificat HTTPS** (mode « serveur d'entreprise ») | Sans HTTPS, le serveur n'écoute que sur le poste lui-même (127.0.0.1) : les autres postes ne peuvent pas se connecter. | Service informatique |

Une installation neuve copiée directement depuis le dépôt (`<racine>/versions/56.33.11/serveur`, puis
`node principal.js`) ne passe pas par la signature du paquet (B1). Elle demande quand même B2, B3 et B4.

## 2. Prérequis du serveur

- **Node.js 22.13 ou plus** (LTS). PostgreSQL 16 conseillé au-delà de 20 000 salariés (SQLite intégré en dessous).
- Pour 50 000 salariés :
  - 8 cœurs ou plus, ou PostgreSQL sur un serveur dédié ;
  - 16 Go de mémoire (`shared_buffers` ≈ 25 %) ;
  - disque SSD : la base pèse environ 10 Go pour 5,5 millions de badgeages, à prévoir en plus des sauvegardes.

  Les tests ont tourné sur 4 cœurs et 15 Go (§ 1 et 6 du rapport de performances).
- **Heure du serveur synchronisée (NTP)** et fuseau correct : les badgeages sont datés dans le fuseau du site.
- Réseau entre le serveur et les appareils :
  - ZK natif : TCP 4370 vers chaque pointeuse ;
  - ZK Push : la pointeuse appelle le serveur, sur le port Push ;
  - Hikvision : HTTP/HTTPS vers la pointeuse ;
  - BioStar 2 : HTTPS vers le serveur BioStar ;
  - Sagem / Morpho : dossier d'export de MorphoManager accessible **en écriture** depuis le serveur.
- Les appareils utilisent des certificats auto-signés que FIWAKTI ne vérifie pas : les placer dans un réseau
  (VLAN) réservé.

## 3. Réglages le jour de l'installation (sinon les règles ne s'appliquent pas)

1. **Appareils › Synchronisation biométrique : l'activer.** Elle est désactivée par défaut. Sans elle :
   - un salarié sorti garde son empreinte, son visage et son badge sur les appareils ;
   - un salarié en congé ou en maladie n'est pas bloqué.
2. Dans le même écran, **vérifier les absences qui bloquent**. Par défaut :
   - **bloquent** : toutes les absences à la journée (congé annuel, maladie, maternité, absence non justifiée, longue
     durée, congés spéciaux) ;
   - **ne bloquent pas** : les absences à l'heure, les missions et les formations.
3. Pour chaque pointeuse :
   - pilote, identifiants, site ;
   - **mode d'identification** (matricule, badge ou code) ;
   - option « Effacer les badgeages de l'appareil après une collecte réussie » si souhaitée. L'effacement n'a lieu
     qu'après copie de sauvegarde, lecture complète et enregistrement confirmés.
   - Hikvision : types d'événements lus. Par défaut : badge, empreinte, visage.
   - BioStar 2 : adresse du serveur BioStar ; touches entrée / sortie (par défaut F1 entrée, F2 sortie).
   - Sagem / Morpho : dossier des journaux, colonnes si le fichier n'a pas d'en-tête.
   - Faire **Diagnostic** puis **Vérifier les identifiants** sur chaque appareil.
4. **Sauvegardes** : destination hors du serveur, et **export du trousseau de clés conservé à part**. Sans le
   trousseau, les sauvegardes et les copies des pointeuses (`donnees/archives-pointeuses`, chiffrées) sont illisibles.
5. **Durée de conservation des badgeages** (`conservation.badgeagesAns`, 5 ans par défaut) : elle règle aussi la
   suppression des copies des pointeuses.
6. Pilotage (BI) : fixer les objectifs de l'entreprise puis **« Enregistrer pour tous les utilisateurs »**.
7. Import des salariés :
   - préparer le fichier (classeur `.xlsx` ou CSV) ;
   - les colonnes inconnues peuvent être créées comme champs personnalisés en un clic ;
   - faire un essai sur quelques lignes, puis utiliser le retour arrière si besoin.

## 4. Ce qui a été vérifié (résumé)

| Domaine | Résultat |
|---|---|
| Assistant d'installation | Anomalies A à M corrigées et retestées : SQLite, PostgreSQL, reprise après sinistre |
| Grand effectif | 50 000 salariés et 5,5 millions de badgeages, écrans de 0,3 à 1 s, 7 000 badgeages/s en Push |
| Pointeuses ZK natif / ZK Push | Copie chiffrée avant purge ; purge seulement après lecture complète ; renvoi avant effacement (Push) |
| Hikvision | Badge, empreinte et visage collectés (avant : visage seul) ; retrait des sortants ; photos du seul appareil |
| BioStar 2 | Heure locale exacte (avant : 1 h d'écart) ; sens entrée / sortie ; retrait des sortants |
| Sagem / Morpho | Aucun fichier perdu ; fichier de suppression des sortants et des absents |
| Règles biométriques | Sortant retiré de tous les appareils ; absent bloqué puis réactivé (avant : blocage inopérant) |
| Import des salariés | Champs personnalisés créés en un clic, type libre ou liste, `.xlsx` direct, en-têtes arabes |
| Pilotage (BI) | Tous les modules, comparaison par site / service / fonction, périodes, objectifs partagés |
| Sécurité | En-têtes, CSRF, sessions, traversée de chemin, XSS, périmètres, injection SQL, identifiants non énumérables, exports neutralisés |
| Non-régression | Ingestion identique à la référence (52 cas) ; installation neuve SQLite ; 55 fichiers JS sans erreur |

## 5. Limites connues (non bloquantes)

- **Matériel réel** : les pilotes sont testés contre des appareils simulés qui suivent les protocoles publiés.
  Un essai sur une pointeuse de chaque marque est à prévoir le jour de l'installation : diagnostic, collecte,
  envoi d'un utilisateur, retrait.
- **Hikvision** : les numéros d'événements peuvent varier selon le micrologiciel. Ils sont réglables par appareil.
- **BioStar 2** : liaison par le serveur BioStar (API REST). Une liaison directe (G-SDK) demanderait un pilote externe.
- **Sagem / Morpho** : liaison par fichiers de MorphoManager. Les fichiers d'ajout et de suppression déposés par
  FIWAKTI doivent être importés dans MorphoManager.
- **Pilote sans retrait** : un appareil dont le pilote ne sait pas retirer un salarié produit une alerte d'audit
  « à retirer à la main ».
- **Bibliothèque `xlsx`** (module Migration seulement) : deux failles publiées, sans correctif sur npm. Leur portée
  est limitée : la lecture tourne isolée, avec 2 min et 1,5 Go au plus.
- **Pilotage** : le détail par compteur (heures de nuit, majorations par taux) reste dans les États, calculés à la
  demande. Premier calcul après un redémarrage : 5 à 20 s, avant le préchauffage automatique (90 s).
- **Assistant d'installation** (voir `ANALYSE-INSTALLATION.md`) :
  - J : fichier SQLite vide laissé après une installation PostgreSQL, sans effet ;
  - N : règles de mot de passe contrôlées seulement au clic sur « Installer ».
