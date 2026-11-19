# Mini-BIM (`mini-Revit`)

Mini-BIM est un prototype logiciel d'ingénierie architecturale fonctionnant dans un navigateur web moderne. Il combine un noyau sémantique paramétrique, une double vue 2D / 3D synchronisée, la gestion des transactions réversibles (undo / redo), la résolution topologique des jonctions de murs, et l'exportation conforme au standard OpenBIM IFC4.

---

## 1. Architecture du projet

Le projet est structuré sous forme de monorepo `pnpm` (TypeScript strict, Vite, React 19, Three.js, Vitest) articulé en cinq modules :

- **`packages/geometry`** : Moteur géométrique pur 2D et 2.5D (vecteurs, segments, polygones, triangulation contrainte, découpe des réservations, calcul des jonctions en onglet et biseau).
- **`packages/core`** : Noyau sémantique BIM, état documentaire immuable avec patchs réversibles, registre déclaratif des relations inter-entités, graphe orienté acyclique (DAG) de dépendances, validation différentielle post-condition, métrés et exportateur IFC4 (ISO 10303-21).
- **`packages/view-2d`** : Moteur de rendu graphique Canvas 2D (repère monde, symbologie normalisée des murs, portes, fenêtres, pièces, escaliers, toitures et mobilier, calque fantôme d'étage sous-jacent et export SVG).
- **`packages/view-3d`** : Moteur de rendu Three.js (génération procédurale des solides extrudés, percement des réservations, maillage crénelé des escaliers, prismes de toiture biseautés, sélection et raycasting interactif, propagation différentielle incrémentale).
- **`apps/web`** : Application web intégrant les deux viewports synchronisés, la barre d'outils interactive, l'inspecteur de propriétés contextuel, le tableau des métrés et la persistance locale IndexedDB.

---

## 2. Prérequis et installation

- **Node.js** : version 22 LTS ou supérieure
- **pnpm** : version 9 ou supérieure

```bash
# Installation des dépendances du monorepo
pnpm install

# Compilation de l'ensemble des modules
pnpm build

# Lancement du serveur de développement web
pnpm dev
```

---

## 3. Commandes principales

```bash
# Exécution de la suite complète de tests unitaires et d'intégration
pnpm test

# Vérification statique des types sur tous les workspaces
pnpm typecheck

# Analyse statique du code (linter)
pnpm lint
```

---

## 4. Principes fondamentaux

1. **Intégrité sémantique** : Chaque élément appartient à un type et un niveau, avec validation stricte des dimensions et positions.
2. **Immuabilité transactionnelle** : Toute modification s'opère via une commande produisant des patchs avant/arrière pour un historique infini.
3. **Double vue 2D / 3D continue** : Les deux représentations partagent le même état documentaire et réagissent aux événements de sélection.
4. **Inter-opérabilité OpenBIM** : Export standardisé IFC4 avec identifiants déterministes et quantités de base (Qto).
