# Kit de l'éditeur FIWAKTI — licences, jetons d'intervention, mises à jour

Outil **réservé à l'éditeur**, jamais livré aux clients (les paquets ne contiennent que `app/`, `public/`, `serveur/`).

## 1. Principe
- Les installations vérifient chaque licence (`FWK1…`), chaque jeton (`FWJ1…`) et chaque paquet de mise à jour (`.fwk`)
  avec la clé publique livrée : `serveur/cle-publique.json` (« active », plus les « anciennes » encore acceptées pour les licences).
- Seule la **clé privée de l'éditeur** correspondante peut signer. Le kit refuse toute autre clé, car les serveurs des
  clients rejetteraient ce qu'elle signe.
- La clé privée n'est jamais copiée, affichée, journalisée ni transmise : elle sert uniquement à signer, sur le poste de l'éditeur.
  Conservez-la hors du dépôt (le `.gitignore` exclut `*.pem` et `cle-privee*`), de préférence chiffrée par une phrase secrète
  (variable d'environnement `FIWAKTI_CLE_PHRASE`), avec une copie de secours hors ligne.

## 2. Vérifier la clé
```
node outils/editeur/fiwakti-licences.js verifier-cle --cle D:\coffre\cle-privee-fiwakti.pem
```
Formats acceptés : PEM (PKCS#8, chiffré ou non) ou JWK (ECDSA P-256).

## 3. Émettre une licence
1. Le client relève son **code d'installation** (empreinte `XXXX-XXXX-XXXX-XXXX`) : page Installation (contrôles) ou
   Système › Licence. Il ne transmet aucune donnée (ne jamais demander le dossier `donnees`).
2. L'éditeur émet :
```
node outils/editeur/fiwakti-licences.js licence --cle CLE.pem --client "Société X" ^
     --fin 2027-12-31 --politique grace_lecture --grace 30 ^
     --modules FW-Core,FW-Licence,FW-RH,FW-BI --capacite 6000 ^
     --empreinte ABCD-EF12-3456-7890 --sortie licence-societe-x.txt
```
3. Le client colle la licence dans Système › Licence (`POST /api/v1/licence`). Le serveur contrôle signature, machine,
   série et modules.

Règles :
- `--serie` croît par client (calculée automatiquement depuis le registre) ; une licence de série inférieure est refusée.
- Sans `--fin` : licence perpétuelle. Dates au format AAAA-MM-JJ (affichées jj/mm/aaaa dans l'application).
- Politiques : `grace_lecture` (défaut), `immediate`, `grace_blocage`, `contrat` (avec `--apres lecture|blocage`).
- Sans `--empreinte`, la licence n'est liée à aucune machine (déconseillé).
- Chaque licence est re-vérifiée après signature, puis inscrite au registre.

## 4. Jeton d'intervention (support)
```
node outils/editeur/fiwakti-licences.js jeton --cle CLE.pem --empreinte ABCD-EF12-3456-7890 --minutes 60
```
Valable une heure au plus, uniquement sur l'installation indiquée, signé par la clé active seulement.

## 5. Contrôler une licence reçue
```
node outils/editeur/fiwakti-licences.js lire licence-societe-x.txt
```
Décode et vérifie avec la clé publique livrée (aucune clé privée nécessaire).

## 6. Révocation
Émettre une nouvelle licence (série supérieure) avec `--revoque ID1,ID2` : les licences ou jetons cités sont refusés
sur cette installation.

## 7. Registre
`outils/editeur/registre-licences.jsonl` (une ligne par émission : client, série, id, dates, modules, empreinte).
Il est exclu de Git ; sauvegardez-le chez l'éditeur. Il ne contient aucune clé.

## 8. Mises à jour signées
```
node outils/construire-paquet.js --cle CLE.pem                 # dossier, archive et FIWAKTI-maj-<version>.fwk signé
node outils/construire-paquet.js --signer FIWAKTI-maj-X.fwk --cle CLE.pem
```
Avant chaque version : incrémenter `serveur/version.json` et `serveur/package.json`, mettre à jour `CARTE-DEPENDANCES.md`
si un module change, `node --check` sur les fichiers modifiés.

## 9. Renouvellement de la clé
Générer la nouvelle paire chez l'éditeur, placer la nouvelle publique en « active » dans `serveur/cle-publique.json` et
déplacer l'ancienne dans « anciennes » (`{publique, jusqua, motif}`), puis livrer une mise à jour **signée par l'ancienne clé**
(seule acceptée par les installations en place). Les licences existantes restent valides jusqu'à la date `jusqua`.

## 10. Essais
`--cle-publique FICHIER` permet de tester avec une paire jetable. Ne jamais remplacer `serveur/cle-publique.json`
par une clé de test.
