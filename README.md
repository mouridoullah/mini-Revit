# Tabax (`tabax`)

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/mouridoullah/mini-Revit/releases/tag/v1.0.0)
[![CI](https://github.com/mouridoullah/mini-Revit/actions/workflows/ci.yml/badge.svg)](https://github.com/mouridoullah/mini-Revit/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1%20336%20passed-success.svg)](https://github.com/mouridoullah/mini-Revit)
[![Playwright E2E](https://img.shields.io/badge/e2e-14%2F14%20passed-success.svg)](https://github.com/mouridoullah/mini-Revit)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%200%20errors-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **Tabax** *(du wolof « construire / bâtir »)* est une plateforme logicielle professionnelle de modélisation de données du bâtiment (BIM) et de CAO architecturale fonctionnant nativement dans un navigateur web moderne.

Tabax combine un noyau paramétrique performant capable de traiter 10 000+ entités en temps réel, un design system d'ingénierie sombre (**Graphite Engineering**), une double vue 2D / 3D synchronisée, la modélisation multi-disciplinaire (Architecture, Structure, Réseaux MEP), la détection spatiale de conflits (BVH Clash Engine), les coupes et élévations dynamiques, un outillage complet de cotation interactive et automatique, et une chaîne documentaire complète de livrables professionnels (IFC4 OpenBIM, DXF R12 AutoCAD 1:1, carnet de plans vectoriel multi-pages PDF 1.4).

---

## Accès Démo en Ligne (100% Client-Side)

Tabax s'exécute intégralement côté client dans le navigateur (zéro backend requis) :

- 🏢 **[Démo en direct — Immeuble R+4 Complet (Architecture & MEP)](https://mouridoullah.github.io/mini-Revit/?demo=r4)**
- 🏡 **[Démo en direct — Villa Contemporaine](https://mouridoullah.github.io/mini-Revit/?demo=villa)**
- 📐 **[Démo en direct — Toitures Inclinées & Biseautage 3D](https://mouridoullah.github.io/mini-Revit/?demo=roof)**

---

## 1. Architecture du projet

Le projet est structuré sous forme de monorepo `pnpm` (TypeScript strict, Vite, React 19, Three.js, Vitest) articulé en cinq modules découplés sous le scope `@tabax/*` :

- **`packages/geometry` (`@tabax/geometry`)** : Moteur géométrique pur 2D et 2.5D (vecteurs, segments, polygones, triangulation contrainte, découpe analytique des réservations, calcul des jonctions en onglet et biseau, coupes de solides).
- **`packages/core` (`@tabax/core`)** : Noyau sémantique BIM, état documentaire immuable avec patchs réversibles, registre déclaratif des relations inter-entités, graphe orienté acyclique (DAG) de dépendances, graphe topologique MEP, moteur de détection de conflits BVH, validation différentielle post-condition, métrés et exportateur IFC4 (ISO 10303-21).
- **`packages/view-2d` (`@tabax/view-2d`)** : Moteur de rendu graphique Canvas 2D impératif, cotations violettes ISO, symbologie normalisée, calque fantôme d'étage sous-jacent, export SVG, export DXF R12 1:1 sans dépendance et moteur vectoriel de carnet de plans PDF 1.4 multi-pages.
- **`packages/view-3d` (`@tabax/view-3d`)** : Moteur de rendu Three.js (génération procédurale des solides extrudés, percement des réservations, maillage crénelé des escaliers, prismes de toiture biseautés, réseaux MEP 3D, clipping planes de coupes synchronisés, sélection et raycasting interactif).
- **`apps/web` (`@tabax/web`)** : Cockpit applicatif web intégrant le ruban graphite, les viewports 2D/3D et coupes synchronisés, l'outillage de tracé interactif, l'inspecteur contextuel de propriétés, la coordination de maquettes fédérées IFC et la persistance locale continue IndexedDB.

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

# Tests de fumée End-to-End Playwright sur navigateur réel Chromium
pnpm test:e2e
```

---

## 4. Principes fondamentaux

1. **Intégrité sémantique et BIM Source de Vérité** : Chaque élément appartient à un type et un niveau, avec validation stricte des dimensions, positions et connectivités.
2. **Immuabilité transactionnelle & Undo/Redo infini** : Toute modification s'opère via une commande produisant des deltas réversibles pour un historique déterministe.
3. **Multi-Vues Synchronisées 2D / 3D / Coupes** : Toutes les représentations partagent le même état documentaire et réagissent en temps réel aux événements de sélection et d'édition.
4. **Local-First & Zéro Dépendance Lourde** : Persistance transactionnelle IndexedDB et moteurs natifs d'exportation (IFC4, DXF R12, PDF 1.4 vectoriel) fonctionnant sans serveur distant ni filigrane.
5. **Ingénierie & Haute Scalabilité** : Indexation paresseuse O(1), propagation incrémentale différentielle et rendu optimisé sur 10 000+ entités architecturales et MEP.

---

## 5. Déploiement Statique & Démo Publique

Tabax est une SPA 100% statique et *local-first*, sans backend requis. Le bundle compilé dans `apps/web/dist` peut être hébergé directement sur n'importe quel service statique :

- **GitHub Pages** : Activé automatiquement via le workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) dès activation de GitHub Pages dans `Settings > Pages > Source : GitHub Actions`.
- **Vercel / Netlify / Cloudflare Pages** :
  - Répertoire racine : `.`
  - Commande de build : `pnpm build`
  - Répertoire de sortie (*Output Directory*) : `apps/web/dist`

