# FIWAKTI 56.33.11 — guide d'installation

Ce guide couvre la **mise à jour d'une installation FIWAKTI 56.33.10 existante** (votre cas), puis, en annexe,
l'installation sur un serveur neuf. Comptez **30 minutes**, dont environ **2 minutes d'interruption** pour les
utilisateurs. Les badgeages des pointeuses ne sont pas perdus pendant l'interruption :
- en mode Push, les pointeuses les gardent et les renvoient ;
- les autres pointeuses sont relues à la collecte suivante.

> Toutes les étapes de ce guide ont été jouées sur des installations 56.33.10 réelles (PostgreSQL et SQLite) : voir
> l'annexe C.

---

## 1. Contenu de la livraison

| Fichier | Rôle |
|---|---|
| `FIWAKTI-maj-56.33.11.fwk` | Mise à jour **depuis l'application** (méthode A). Doit être **signé par l'éditeur** (voir § 9). |
| `FIWAKTI-56.33.11-installation.zip` | Dossier complet pour la **mise à jour par script** (méthode B) ou une installation neuve. |
| ├ `versions/56.33.11/` | La nouvelle version (app, public, serveur et ses bibliothèques). |
| ├ `installer-maj.js` | Script de mise à jour avec contrôles, bascule, vérification et retour arrière automatique. |
| ├ `lanceur.js` | Lanceur de référence, seulement pour une installation neuve sans lanceur de l'éditeur. |
| ├ `SHA256SUMS.txt` | Empreintes de tous les fichiers (contrôlées par le script). |
| └ `INSTALLATION.md` | Ce guide. |

Les deux méthodes donnent le même résultat. **La méthode A est la plus simple** : elle se fait depuis le navigateur,
mais demande un paquet signé. La méthode B se fait sur le serveur, sans signature.

---

## 2. Avant de commencer (à faire dans tous les cas)

Cochez chaque point :

- [ ] **Fenêtre de maintenance** prévenue (2 minutes d'interruption, utilisateurs déconnectés quelques secondes).
- [ ] **Version installée = 56.33.10**. Elle est indiquée dans Système › État du système, et dans
      `<racine>/versions/actuelle.txt`. La mise à jour est prévue à partir de la 56.33.10 seulement.
- [ ] **Node.js 22.13 ou plus** sur le serveur (`node -v`). Il est indiqué aussi dans Système › État du système.
- [ ] **PostgreSQL 14 ou plus** si vous utilisez PostgreSQL (16 conseillé).
- [ ] **Espace disque** : au moins 1 Go libre sur le disque de FIWAKTI, plus la taille d'une sauvegarde.
- [ ] **Sauvegarde vérifiée** : Système › Sauvegardes › **Sauvegarder maintenant**. Attendez le statut « vérifiée ».
- [ ] **Trousseau de clés** : Système › Réglages d'exploitation › **Télécharger le trousseau de clés**. Rangez-le hors
      du serveur, séparément des sauvegardes (coffre, clé USB chiffrée). **Sans lui, une sauvegarde chiffrée ne peut
      pas être restaurée sur un autre serveur.**
- [ ] Repérez la **racine d'installation** : le dossier qui contient `versions/` et `donnees/`. Exemples :
      - `C:\FIWAKTI` sous Windows ;
      - `/opt/fiwakti` sous Linux.
- [ ] Repérez le **nom du service** FIWAKTI :
      - Windows : `services.msc` ou `Get-Service *fiwakti*` ;
      - Linux : `systemctl list-units | grep -i fiwakti`.

---

## 3. Méthode A — mise à jour depuis l'application (recommandée)

1. Connectez-vous avec un compte **administrateur**.
2. Menu **Système** › section **Mises à jour** › choisissez le fichier `FIWAKTI-maj-56.33.11.fwk`.
3. Confirmez « Installer la mise à jour ? ». FIWAKTI enchaîne alors seul les étapes suivantes :
   1. il vérifie la signature de l'éditeur et l'empreinte de chaque fichier ;
   2. il refuse un paquet plus ancien ou incomplet ;
   3. il fait une **sauvegarde vérifiée** et annule tout si elle échoue ;
   4. il installe la version dans `versions/56.33.11` sans toucher à la 56.33.10 ;
   5. il redémarre sur la nouvelle version, **à l'essai**.
4. Patientez **10 à 30 secondes**, puis rechargez la page : la version affichée doit être **56.33.11**.
5. Après 90 secondes de bon fonctionnement, la nouvelle version confirme son essai. Si elle ne démarre pas, le lanceur
   **revient tout seul à la 56.33.10** : rien à faire, les données sont intactes.
6. Passez aux contrôles du § 5.

Message « Signature invalide : mise à jour refusée » : le paquet n'est pas signé par l'éditeur. Utilisez la méthode B,
ou demandez le paquet signé (§ 9).

---

## 4. Méthode B — mise à jour par script sur le serveur

### 4.1 Copier et décompresser
Copiez `FIWAKTI-56.33.11-installation.zip` sur le serveur, par exemple dans `C:\Temp` ou `/tmp`, et décompressez-le.
Ne le mettez **pas** dans la racine d'installation. On obtient un dossier `FIWAKTI-56.33.11`.

### 4.2 Contrôle à blanc (rien n'est modifié)
Windows (invite de commandes **en administrateur**) :
```
cd C:\Temp\FIWAKTI-56.33.11
node installer-maj.js --racine "C:\FIWAKTI" --verifier
```
Linux :
```
cd /tmp/FIWAKTI-56.33.11
sudo node installer-maj.js --racine /opt/fiwakti --verifier
```
Le script contrôle :
- l'intégrité des 2 348 fichiers du paquet ;
- la version installée ;
- Node.js ;
- l'espace disque ;
- la présence d'une **sauvegarde vérifiée de moins de 24 h** ;
- que le serveur actuel répond.

Il doit finir par « contrôles terminés : rien n'a été modifié ». Sinon, corrigez ce qui est indiqué (voir § 8).

### 4.3 Mise à jour
Windows :
```
node installer-maj.js --racine "C:\FIWAKTI" --service "NomDuServiceFIWAKTI"
```
Linux :
```
sudo node installer-maj.js --racine /opt/fiwakti --service fiwakti
```
- `--service` permet au script de redémarrer lui-même le service :
  - Windows : `net stop` / `net start` ;
  - Linux : `systemctl restart`.

  Sans `--service`, le script affiche « Redémarrez maintenant le service FIWAKTI » et attend que vous le fassiez.
- `--url https://127.0.0.1:8443` est à donner seulement si le script n'arrive pas à joindre le serveur.

Déroulement observé lors de l'essai :
```
intégrité du paquet : 2348 fichiers vérifiés
sauvegarde vérifiée : fiwakti-20261014-213955.db.chiffre (il y a 0.0 h)
serveur en service sur http://127.0.0.1:8092 : version 56.33.10, base sqlite
version 56.33.11 copiée dans …/versions/56.33.11
bascule : actuelle = 56.33.11 (à l'essai), précédente = 56.33.10
la version 56.33.11 répond (base sqlite) ; confirmation de l'essai (90 s)…
OK : FIWAKTI 56.33.11 est en service. Retour possible : node installer-maj.js --racine "…" --retour
```
Si la nouvelle version ne répond pas dans les 5 minutes, le script **revient seul à la 56.33.10** et le dit.
Journal du script : `<racine>/donnees/journaux/installer-maj.log`.

---

## 5. Contrôles après la mise à jour (15 minutes)

- [ ] Système › État du système : version **56.33.11**, aucun point « bloquant ».
- [ ] Connexion d'un administrateur, d'un responsable de site et d'un salarié (portail).
- [ ] Ouvrir **Salariés**, **Pointage**, **Validation des journées**, **États**, **Pilotage** : affichage normal.
- [ ] **Pointeuses** : pour chaque appareil, **Diagnostic** puis **Collecter**. Le message de collecte indique la copie
      de sauvegarde chiffrée et l'état de la mémoire de l'appareil.
- [ ] Pointeuses en mode Push : la « dernière communication » se met à jour dans les minutes qui suivent.
- [ ] Système › Sauvegardes : faire une sauvegarde et vérifier le statut « vérifiée ».
- [ ] Le lendemain matin : la tâche de nuit s'est déroulée (Système › Tâches de fond) et les journées d'hier sont calculées.

---

## 6. Réglages nouveaux à faire une fois (sinon les règles ne s'appliquent pas)

1. **Appareils › Synchro biométrie (pointage et accès) : activer.** Elle est désactivée par défaut. Sans elle :
   - un salarié sorti n'est pas retiré des appareils ;
   - un salarié en congé ou en maladie n'est pas bloqué.
2. Même écran : **absences qui bloquent**. Par défaut, toutes les absences à la journée bloquent (congés, maladie,
   maternité, absence non justifiée, longue durée), mais ni les absences à l'heure ni les missions. Ajustez si besoin.
3. **Hikvision** : sur chaque appareil, champ « Types d'événements lus ». Vide = badge, empreinte et visage.
4. **BioStar 2** : champ « Touches entrée / sortie ». Vide = F1 entrée, F2 sortie.
5. **Sagem / Morpho** :
   - le dossier d'export doit être accessible **en écriture** par le serveur ;
   - FIWAKTI y dépose les fichiers `a-importer/` et `a-supprimer/`, que vous importez dans MorphoManager.
6. **Pilotage** : fixez les objectifs de l'entreprise, puis « Enregistrer pour tous les utilisateurs ».
7. **Profils** :
   - vérifiez que chaque compte a un profil : un compte **sans profil** n'a plus accès qu'à ses propres données ;
   - vérifiez que les responsables qui valident les journées ont « validation » sur le pointage ;
   - personne ne valide plus ses propres journées : prévoyez un second valideur pour les responsables.
8. **Exports d'états** : désormais réservés aux profils ayant au moins « lecture » sur les États.

---

## 7. Revenir à la version précédente

- **Automatique** : si la nouvelle version s'arrête ou ne confirme pas son essai, le lanceur revient seul à la
  56.33.10. Essai réel : retour en 1 seconde.
- **Depuis l'application** : Système › Mises à jour › **Revenir à la version 56.33.10**. Une sauvegarde est faite
  avant.
- **Par script** : `node installer-maj.js --racine <racine> --retour --service <nom>`.

La 56.33.10 fonctionne sur la base mise à niveau par la 56.33.11 : les ajouts de structure sont compatibles. Le retour
a été essayé, avec connexion et données intactes. Pour revenir aussi **aux données** d'avant la mise à jour, restaurez
la sauvegarde faite au § 2 (Système › Sauvegardes › Restaurer).

---

## 8. Dépannage

| Message | Cause et action |
|---|---|
| « aucune sauvegarde vérifiée de moins de 24 h » | Faites Système › Sauvegardes › Sauvegarder maintenant, attendez « vérifiée », relancez. |
| « le serveur FIWAKTI 56.33.10 ne répond pas sur … » | Le service est arrêté, ou l'adresse est différente : démarrez-le, ou ajoutez `--url https://127.0.0.1:<port>`. |
| « N fichier(s) du paquet absent(s) ou altéré(s) » | Copie incomplète : recopiez et décompressez de nouveau l'archive. |
| « mise à jour prévue à partir de la version 56.33.10 » | Installez d'abord la 56.33.10. |
| « Node.js 22.13 ou plus requis » | Mettez Node.js à jour (version LTS 22 ou 24), puis relancez. |
| « Signature invalide : mise à jour refusée » (méthode A) | Paquet non signé par l'éditeur : méthode B, ou paquet signé (§ 9). |
| « Sauvegarde préalable non vérifiée : mise à jour annulée » | La sauvegarde automatique a échoué (espace disque, droits). Voir `donnees/journaux/serveur.log`. |
| « PostgreSQL N détecté : FIWAKTI exige PostgreSQL 14 ou plus » | Mettez PostgreSQL à jour avant la mise à jour de FIWAKTI. |
| Retour automatique à 56.33.10 | Voir `donnees/journaux/serveur.log` et `lanceur.log` (ou le journal du service), puis contactez le support avec ces fichiers. |

Journaux : `<racine>/donnees/journaux/`
- `serveur.log` ;
- `mises-a-jour.log` ;
- `installer-maj.log` ;
- `lanceur.log` (lanceur de référence).

---

## Annexe A — installation neuve sur un autre serveur

1. Installez Node.js 22 LTS, puis PostgreSQL 16 (conseillé au-delà de 20 000 salariés) avec une base et un compte
   dédiés.
2. Créez la racine, par exemple `/opt/fiwakti` ou `C:\FIWAKTI`.
3. Copiez-y `versions/56.33.11/` et `lanceur.js` depuis l'archive, puis créez le fichier `versions/actuelle.txt`
   contenant `56.33.11`.
4. Lancez FIWAKTI comme **service**, avec le lanceur de l'éditeur s'il existe, sinon avec `lanceur.js` :
   - **Linux (systemd)** : fichier `/etc/systemd/system/fiwakti.service` :
     ```
     [Unit]
     Description=FIWAKTI
     After=network-online.target postgresql.service
     [Service]
     User=fiwakti
     WorkingDirectory=/opt/fiwakti
     ExecStart=/usr/bin/node /opt/fiwakti/lanceur.js --racine /opt/fiwakti
     Restart=always
     UMask=0077
     [Install]
     WantedBy=multi-user.target
     ```
     puis `systemctl daemon-reload && systemctl enable --now fiwakti`.
   - **Windows** : service créé avec NSSM, par exemple
     `nssm install FIWAKTI "C:\Program Files\nodejs\node.exe" "C:\FIWAKTI\lanceur.js --racine C:\FIWAKTI"`.
     Donnez au dossier `C:\FIWAKTI\donnees` des droits réservés au compte du service et aux administrateurs.
5. Placez le certificat HTTPS dans `donnees/certificats` : sans HTTPS, FIWAKTI n'écoute que sur le serveur lui-même.
6. Ouvrez `https://<serveur>:8443/installation.html` (ou `http://localhost:8080/…` sans certificat) et suivez
   l'assistant : base, licence, administrateur.
7. Puis § 5 et § 6.

Le lanceur de référence a été essayé sous Linux : démarrage, relance après mise à jour, retour automatique. Le service
Windows avec NSSM est à valider à l'installation.

## Annexe B — pour l'éditeur : construire et signer le paquet

```
cd <dépôt FIWAKTI>
node outils/construire-paquet.js --cle <clé-privée-éditeur.pem>          # construit et signe
node outils/construire-paquet.js --signer dist/FIWAKTI-maj-56.33.11.fwk.a-signer --cle <clé-privée-éditeur.pem>
```
La clé privée n'est jamais copiée. Une clé qui ne correspond pas à `serveur/cle-publique.json` est refusée.

## Annexe C — essais réalisés avant livraison

| Essai | Résultat |
|---|---|
| Mise à jour depuis l'application (paquet signé), installation 56.33.10 sur PostgreSQL, 3 000 salariés, 6 000 badgeages | 56.33.11 en service en 10 s ; sauvegarde vérifiée avant ; données identiques ; essai confirmé à 90 s ; écrans sans erreur |
| Mise à jour par script, installation 56.33.10 sur SQLite | contrôles, bascule, confirmation de l'essai ; port trouvé seul |
| Script sans sauvegarde récente | refus, rien n'est modifié |
| Retour manuel à 56.33.10 après mise à jour | 56.33.10 en service sur la base mise à niveau ; connexion et 3 000 salariés intacts |
| Version volontairement cassée envoyée par l'application | arrêt au démarrage → **retour automatique** du lanceur en 1 s |
