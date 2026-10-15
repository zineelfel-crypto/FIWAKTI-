# FIWAKTI — jeu de démonstration du workflow : tests et démonstrations

Ce guide accompagne le script **`demo-workflow.js`**. Le script crée sur votre serveur une petite entreprise fictive :
- un service RH et un atelier ;
- 8 salariés, avec leurs comptes ;
- une semaine de badgeages contenant des situations à traiter ;
- des demandes en attente.

Les scénarios ci-dessous servent deux fois : pour **tester** le workflow, puis pour le **montrer** en démonstration.

Tout ce que crée le script est isolé :
- identifiants commençant par `demo-` ;
- libellés commençant par « DÉMO » ;
- matricules **9001 à 9008**.

Vos autres données et votre paramétrage ne sont pas modifiés. Les circuits de démonstration ne s'appliquent qu'aux deux
services DÉMO.

---

## 1. Installer, réinitialiser, supprimer

Copiez `demo-workflow.js` dans `C:\pack_inst\`. FIWAKTI doit être démarré. Ouvrez PowerShell :

| Action | Commande |
|---|---|
| Créer le jeu | `node C:\pack_inst\demo-workflow.js --url http://localhost:8080 --login admin` |
| **Remettre à zéro avant chaque démo** | `node C:\pack_inst\demo-workflow.js --url http://localhost:8080 --login admin --reinitialiser` |
| Tout retirer | `node C:\pack_inst\demo-workflow.js --url http://localhost:8080 --login admin --supprimer` |

- Le script demande le mot de passe de l'administrateur.
- **Réinitialiser** recrée tout avec des dates recalées sur aujourd'hui. Il défait les validations faites pendant la démo
  précédente et remet les mots de passe des comptes DÉMO à leur matricule.
- Le calcul des journées est fait par le serveur dans les **2 à 3 minutes** qui suivent. Lancez la réinitialisation
  quelques minutes avant la démo.
- Si FIWAKTI utilise HTTPS, remplacez l'adresse par `https://<serveur>:8443`.

---

## 2. Les personnages

| Compte | 1er mot de passe | Personne | Rôle dans la démo |
|---|---|---|---|
| `rh.demo` | `9001` | Ines Ben Ali | **RH** : 2e niveau de validation, corrections, maladies |
| `chef.demo` | `9002` | Karim Trabelsi | **Chef d'atelier** : 1er niveau de validation, son équipe seulement |
| `9003` | `9003` | Sami Gharbi | Employé : journées normales, il crée ses propres demandes |
| `9004` | `9004` | Leila Mansouri | Employée : 2 retards, congé annuel en attente |
| `9005` | `9005` | Youssef Jaziri | Employé : **oubli de pointage** hier (pas de sortie le soir) |
| `9006` | `9006` | Mariem Hammami | Employée : **heures supplémentaires** (départ à 19:35, 2 jours) |
| `9007` | `9007` | Walid Khelifi | Employé : **absent sans justificatif** un jour |
| `9008` | `9008` | Nour Sassi | Employée : **congé annuel** en cours (accepté) |

**Première connexion :**
- le mot de passe est le **matricule** ;
- FIWAKTI impose aussitôt d'en choisir un nouveau : au moins 12 caractères, une majuscule et un chiffre, sans
  le nom, le login ni le matricule ;
- par exemple `Atelier#2026Demo`, avec une variante par compte.

**Profils créés :**

| Profil | Accès |
|---|---|
| DÉMO RH | Tous les salariés DÉMO, validation RH |
| DÉMO Chef d'équipe | Son équipe, validation de 1er niveau, menu « avancé » |
| DÉMO Employé | Son espace seulement : ses pointages et ses demandes |

**Circuits créés :**

| Circuit | Validation |
|---|---|
| Congé annuel | Chef, puis RH |
| Congé maladie | RH |
| Autorisation d'absence | Chef |

**Astuce pour la démo :** ouvrez **trois navigateurs** côte à côte, par exemple Edge, Chrome et une fenêtre InPrivate :
un pour le chef, un pour les RH, un pour l'employé. On voit alors chaque action arriver chez la personne suivante.

---

## 3. Scénarios

Chaque scénario indique **qui** agit, **où**, **quoi**, et **ce qu'on doit constater** (✔).

### S1 — Congé annuel à deux niveaux (chef puis RH)
Demande déjà créée : Leila (9004), congé annuel la semaine prochaine.
1. **chef.demo** › **RH › Demandes**. La ligne de Leila est « En instance », en attente de « Trabelsi Karim ». Ouvrez-la,
   puis cliquez **Valider**.
   - ✔ La demande reste « En instance », mais elle attend maintenant **Ines Ben Ali** (2e niveau).
2. **rh.demo** › **Demandes** › ouvrez la demande de Leila › **Valider**.
   - ✔ Statut **Acceptée**.
   - ✔ Les jours de congé apparaissent dans **Pointage › Journées** de Leila, colonne Absence.
3. **9004** (Leila) › **Mon espace**.
   - ✔ Sa demande est acceptée.

### S2 — Un employé fait sa demande, le chef refuse avec un motif
1. **9003** (Sami) › **RH › Demandes › Nouvelle demande**. Choisissez 2 jours dans le calendrier, type **Congé annuel**,
   puis **Déposer**.
   - ✔ La demande est « En instance », en attente de Trabelsi Karim, son chef.
2. **chef.demo** › **Demandes** › ouvrez la demande de Sami › **Refuser**, avec un motif (« Période de forte activité »).
3. **9003** › **Mon espace**.
   - ✔ La demande est refusée, avec le motif.

**Variante :** le chef valide, puis les RH refusent. Le refus du 2e niveau est visible par Sami.

### S3 — Autorisation d'absence (un seul niveau)
Demande déjà créée : Sami, demain de 08:00 à 10:00.
1. **chef.demo** › **Demandes** › **Valider**.
   - ✔ **Acceptée** directement : le circuit n'a qu'un niveau.

### S4 — Oubli de pointage : correction par le chef, validation par les RH
Youssef (9005) n'a pas badgé sa sortie hier soir.
1. **chef.demo** › **RH › Suivi des équipes & présences** › période **7 jours** › carte **« Oubli de pointage »** de
   Youssef.
   - FIWAKTI propose la sortie manquante (17:00).
   - Cliquez **Oui, appliquer**, ou **Régulariser** pour saisir une autre heure.
   - ✔ La carte disparaît ; la correction part chez les RH.
2. **rh.demo** › **Suivi des équipes & présences** › file des **corrections à valider** › **Valider**.
   - ✔ Un badgeage de sortie à 17:00, marqué « manuel », est ajouté.
   - ✔ La journée de Youssef est complète : 8 h.
   - ✔ L'historique garde l'auteur, le valideur et l'heure.

### S5 — Retards : justifier ou maintenir
Leila (9004) est arrivée à 08:27 hier et à 08:41 un autre jour.
1. **chef.demo** › **Suivi** › puce **Retards** :
   - carte du 1er retard › **Justifier**, avec un motif (« Transport ») ;
   - carte du 2nd retard › **Maintenir le retard**.
   - ✔ Les deux cartes sont traitées. Le retard maintenu reste dans les compteurs ; le retard justifié n'y est plus.

### S6 — Heures supplémentaires
Mariem (9006) est partie à 19:35 deux jours de suite.
1. **chef.demo** › **Suivi** › puce **Écarts & H.S.** :
   - 1re carte › **Valider H.S.** ;
   - 2e carte › **Refuser**.
   - ✔ Seules les heures validées alimentent les compteurs d'heures supplémentaires (25 % / 50 %) et les états
     des éléments variables.

### S7 — Absence non justifiée : justification directe ou arrêt maladie validé par les RH
Walid (9007) n'a pas badgé un jour. Deux façons de traiter :
1. **Directement par le chef** : **chef.demo** › **Suivi** › puce **Absences** › carte de Walid.
   - **Justifier** › type **Congé maladie** › **Valider**.
     - ✔ L'absence est enregistrée tout de suite, sans circuit, avec la trace du chef.
     - ✔ L'anomalie disparaît.
   - Ou **Confirmer l'absence** : l'absence non justifiée est maintenue, et elle sera retenue dans les compteurs.
2. **Avec le circuit maladie** (validation RH) : **9007**, ou le chef pour lui › **Demandes › Nouvelle demande** › type
   **Congé maladie** › **Déposer**.
   - ✔ La demande attend **Ines Ben Ali**, car le circuit « Congé maladie » ne passe que par les RH.
   - **rh.demo** › **Demandes** › **Valider** : ✔ la journée passe en Congé maladie.

### S8 — Contrôle des droits et des périmètres (sécurité)
| Test | Résultat attendu |
|---|---|
| **chef.demo** › liste des employés | 7 salariés : lui et son équipe. Ines (RH) n'apparaît pas |
| **9003** › menus | Seulement son espace ; aucune donnée des collègues |
| **9003** essaie de valider sa propre demande | Aucun bouton de validation |
| **chef.demo** sur sa **propre** journée | Il ne peut pas la valider lui-même : refusé par le serveur |
| **rh.demo** sur une journée déjà approuvée par elle-même en tant que responsable | Validation RH refusée : il faut deux personnes différentes |

### S9 — Validation des journées à deux niveaux (optionnel)
Par défaut, la correction faite par le responsable vaut validation. Pour montrer la validation **responsable, puis RH** :
1. **admin** › **Administration › Règles** › « **Validation des journées corrigées** » › choisissez **Responsable puis
   RH**. Le réglage peut être limité au service DÉMO — Atelier montage.
2. Refaites **S4**.
   - ✔ Après la correction du chef, la journée est **approuvée par le responsable**.
3. **rh.demo** › **Validation des journées** › niveau RH › **Valider**.
   - ✔ La journée est **validée RH**.
4. Remettez la règle comme avant après la démo.

### S10 — Blocage biométrique selon l'absence (optionnel, pointeuse réelle)
Voir le réglage décrit dans **APPAREIL › Terminaux › Synchro biométrie**.
1. Saisissez une **mise à pied** (code 11) d'une journée pour un salarié qui a son empreinte sur une pointeuse.
   - ✔ L'empreinte est retirée au cycle suivant.
   - ✔ Elle est renvoyée automatiquement à la fin.
2. Saisissez une **maladie longue durée** (code 60).
   - ✔ À la fin, le salarié apparaît dans « Empreintes en attente de réactivation par les RH ».
   - ✔ L'empreinte n'est renvoyée qu'après le clic **Réactiver l'empreinte**.

---

## 4. Déroulé conseillé pour une démo de 20 minutes
1. **2 min** : le contexte. Trois navigateurs ouverts : chef, RH, employé.
2. **5 min** : S1 + S2. Le circuit de validation, les notifications, la vue de l'employé.
3. **6 min** : S4 + S5 + S6. Le tableau de suivi : on traite les anomalies en un clic.
4. **3 min** : S8. Chacun ne voit que son périmètre, et personne ne valide pour lui-même.
5. **4 min** : questions. Montrer l'**export Excel** d'un état et le tableau de bord.

Après la démo : `--reinitialiser`, pour remettre le jeu à zéro pour la suivante.
