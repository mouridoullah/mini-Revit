# ADR-061 : Design System Graphite Engineering, CSS Modules et Icônes Lucide

**Statut :** Accepté  
**Date :** 20 novembre 2026

## Contexte

L’interface `apps/web` accumule des styles inline divergents, une barre d’outils dense et plusieurs panneaux latéraux concurrents. Le nouveau cockpit doit établir une identité visuelle unifiée tout en conservant les moteurs et règles métier dans leurs packages existants.

## Décision

1. Adopter des variables CSS centralisées dans `apps/web/src/styles/theme.css` et des CSS Modules pour les composants du cockpit. Ne pas ajouter Tailwind.
2. Ajouter `lucide-react` comme unique dépendance d’icônes de l’interface et remplacer les emojis par des icônes vectorielles homogènes.
3. Organiser l’interface en ruban métier à onglets, navigateur projet gauche, vues 2D/3D à disposition et partage redimensionnable, dock droit à onglets et tiroir de métrés.
4. Limiter les arêtes Three.js à un effet de rendu dans `@mini-bim/view-3d`, les attacher aux maillages architecturaux et disposer leurs ressources avec les maillages.
5. Garder `@mini-bim/core` et `@mini-bim/geometry` inchangés. `apps/web` ne doit pas importer directement `@mini-bim/geometry`.

## Conséquences

- Les surfaces de travail et panneaux partagent une palette graphite dense avec chiffres tabulaires.
- Les viewports peuvent être utilisés en 2D, en 3D ou en split ; le séparateur conserve une plage de 20 à 80 %.
- Les commandes de sélection, conflits et fédération restent intégrées aux panneaux unifiés et conservent leurs identifiants de test.
- `view-3d` ajoute des arêtes architecturales de présentation sans modifier les buffers de calcul géométrique.
