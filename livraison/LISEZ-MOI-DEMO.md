# FIWAKTI — version de démonstration (un seul fichier HTML)

`FIWAKTI-demo.html` contient toute l'application FIWAKTI 56.33.11 et ses 10 modules.

- **Ouvrir** : double-cliquez sur le fichier. Il s'ouvre dans Edge, Chrome ou Firefox, sans installation, sans serveur
  et sans Internet. On peut l'envoyer par e-mail ou le copier sur une clé USB.
- **Données** : entreprise fictive.
  - 3 sites : Tunis, Sousse et Hammamet ;
  - 15 salariés, avec leurs pointages, absences et demandes ;
  - les modules contiennent des exemples : accidents, visites médicales, formations, candidats, visiteurs, etc.
- **Rien n'est enregistré**. Tout repart à zéro avec **Quitter la démo** ou en rouvrant le fichier.
- **Langues** : FR / EN / AR, en haut à droite. **Mode sombre** : dans le menu, en bas à gauche.

## Comptes de démonstration

| Pour montrer | Comment |
|---|---|
| Administrateur (tout) | Ouverture directe |
| Un salarié et sa première connexion | Déconnexion (icône en haut à droite), puis login `10402` / mot de passe `10402`. FIWAKTI demande de choisir un nouveau mot de passe, par exemple `Atelier#2026Demo` |
| Revenir en administrateur | **Quitter la démo** |

## Ce qui est simulé

- **Écrans de base** (Temps, RH, Appareils, Administration, États) : ils fonctionnent entièrement sur les données
  fictives. Saisies, validations, calculs et exports Excel / PDF marchent ; rien n'est conservé à la fermeture.
- **Modules** (Santé et sécurité, Médecine du travail, Formation, Compétences, Évaluation, Intégration, Recrutement,
  Visiteurs, Pilotage BI, Migration) :
  - les écrans affichent des exemples enregistrés ;
  - les ajouts apparaissent dans les listes : accident déclaré, visite planifiée, candidat, session de formation, poste,
    risque, équipement… Les compteurs du tableau de bord Santé et sécurité suivent ;
  - les actions changent l'état : action corrective faite, événement analysé ou clos, visite réalisée, étape d'un
    candidat, tâche d'intégration cochée ;
  - tout repart des exemples à la fermeture ou avec **Quitter la démo** ;
  - certaines saisies très liées au serveur sont seulement simulées (« Enregistré » sans changement visible) : niveaux
    de compétences, évaluations, visiteurs, imports de Migration ;
  - les dates des exemples sont celles du 16/10/2026.
- **Pointeuses** : aucune communication réelle.

Pour reconstruire le fichier après une modification de l'application : `node outils/construire-demo.js`.
