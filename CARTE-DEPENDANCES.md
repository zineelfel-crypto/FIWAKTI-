# FIWAKTI 56.33.11 — carte des dépendances des modules

Générée à la construction ; aucune dépendance circulaire ni non déclarée.

| Module | Origine | Dépend de | Utilisé par |
|---|---|---|---|
| FW-Core | socle | — | — | FW-Licence, FW-RH, FW-Time, FW-Acces, FW-BI, FW-Competences, FW-Evaluation, FW-Formation, FW-HSE, FW-Medicale, FW-Migration, FW-Onboarding, FW-Recrutement, FW-Visiteurs |
| FW-Licence | socle | FW-Core | — | — |
| FW-RH | socle | FW-Core | — | FW-Time, FW-Acces, FW-BI, FW-Competences, FW-Evaluation, FW-Formation, FW-HSE, FW-Medicale, FW-Migration, FW-Onboarding, FW-Recrutement, FW-Visiteurs |
| FW-Time | socle | FW-Core, FW-RH | — | FW-Acces |
| FW-Acces | socle | FW-Core, FW-RH, FW-Time | — | — |
| FW-BI | module 56.33.11 | FW-Core, FW-RH | — | — |
| FW-Competences | module 1.1 | FW-Core, FW-RH | — | — |
| FW-Evaluation | module 1.0 | FW-Core, FW-RH | FW-Competences | — |
| FW-Formation | module 1.0 | FW-Core, FW-RH | FW-Competences | — |
| FW-HSE | module 1.0 | FW-Core, FW-RH | FW-Time | — |
| FW-Medicale | module 1.0 | FW-Core, FW-RH | — | — |
| FW-Migration | module 1.1.11 | FW-Core, FW-RH | — | — |
| FW-Onboarding | module 1.0 | FW-Core, FW-RH | — | — |
| FW-Recrutement | module 1.1 | FW-Core, FW-RH | — | — |
| FW-Visiteurs | module 1.0 | FW-Core, FW-RH | — | — |

Note 56.33.11 : FW-BI lit aussi, **seulement si ces modules sont actifs** et sans en dépendre (aucune dépendance
déclarée, aucun appel quand ils sont absents), les tables des modules Temps, Compétences, Formation, Évaluation, HSE,
Suivi médical (par son service d'indicateurs), Recrutement, Visiteurs et Intégration, ainsi que les tables de la
synchronisation biométrique du socle. Aucune dépendance circulaire.
