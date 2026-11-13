# PROJECT AUDIT — MINI-BIM (REVIT-INSPIRED ARCHITECTURAL ENGINE)

**Date d'audit :** 13 novembre 2026  
**Auditeur :** Ingénieur Principal & Architecte Logiciel  
**Statut :** Phase 0 — Cadrage & Architecture

---

## 1. Contexte et Objectifs de l'Audit

Le projet **Mini-BIM** ambitionne de concevoir et réaliser un logiciel de modélisation architecturale paramétrique (BIM) dans le navigateur, inspiré de Revit, avec un premier périmètre fonctionnel ciblant la maison individuelle (R+1).

L'objectif de cet audit est :

1. Examiner l'environnement et l'état initial du dépôt.
2. Évaluer en profondeur le document de référence initial (_« Mini-BIM solo : guide d’architecture d’un mini-Revit »_).
3. Identifier les choix architecturaux pertinents, les lacunes critiques, les risques géométriques et algorithmiques.
4. Établir le cadre d'ingénierie rigoureux nécessaire pour garantir la viabilité, la performance et l'évolutivité du système.

---

## 2. État Initial du Dépôt

### 2.1 Inventaire des éléments existants

- **Fichiers source / configuration :** Aucun (`package.json`, `tsconfig.json`, linters absents).
- **Gestionnaire de versions :** Dépôt Git non initialisé.
- **Code existant :** Aucun code d'implémentation.
- **Documentation présente :** Un document unique : `Mini-BIM solo guide d’architecture d’un « mini-Revit ».md` (74 Ko, 1 066 lignes).

### 2.2 Constat

Le projet démarre d'une feuille blanche sur le plan logiciel. Il n'y a aucune dette technique de code hérité, ce qui est une opportunité idéale pour poser immédiatement les bases d'une architecture propre (monorepo modulaire, typage strict, outillage de test unitaire et d'intégration géométrique).

---

## 3. Analyse Critique du Document de Référence

Le document de référence constitue une synthèse dense et ambitieuse. Il pose des principes directeurs solides mais contient plusieurs raccourcis conceptuels et géométriques qu'il est impératif de corriger avant tout développement.

### 3.1 Points Forts Validés (Principes à Conserver)

1. **Le Modèle BIM comme Unique Source de Vérité :**
   - La géométrie 3D (Three.js) et 2D (Canvas/SVG) n'est qu'un **cache de projection dérivé**. Aucune donnée architecturale n'est détenue par la scène graphique.
2. **Architecture Local-First & Transactions :**
   - Toutes les modifications passent par des commandes sérialisables, garantissant la réversibilité (Undo/Redo), la traçabilité et l'intégrité.
3. **Moteur Métier Isomorphe (TypeScript Pur) :**
   - Découplage strict : le domaine BIM et le moteur géométrique ne dépendent ni de React, ni de Three.js, ni de l'environnement DOM. Ils sont exécutables en environnement Node/Worker et testables unitairement sans navigateur.
4. **Pragmatisme des Opérations Booléennes 3D :**
   - L'exclusion initiale d'un moteur CSG complet (trop lourd, instable numériquement) au profit d'un découpage en tranches verticales 2.5D (Sutherland-Hodgman) pour les ouvertures de murs droits.
5. **Unités et Repères Fixes :**
   - Millimètres (`mm`) en `float64` dans tout le modèle interne, conversion Z-up vers Three.js au niveau du groupe racine d'affichage.

---

### 3.2 Incohérences, Faiblesses et Risques Identifiés

L'analyse technique approfondie du document initial révèle plusieurs points critiques qui échoueraient en production s'ils étaient implémentés tels quels :

#### A. Omission du niveau d'agrégation `Building`

- _Constat :_ Le document lie directement `Project` à `Level` (`Project 1───* Level`).
- _Problème :_ Dans la norme IFC (`IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey`), ainsi que dans la réalité constructive, les niveaux appartiennent à un bâtiment. L'omission de `Building` interdit à terme les projets à bâtiments multiples, l'attribution d'adresses ou d'altitudes de référence terrain (NGF) spécifiques, et complique l'export IFC conforme.
- _Correction :_ Introduire explicitement l'entité `Building` entre `Project` et `Level`, avec une relation 1:1 par défaut pour le MVP.

#### B. Instabilité de la paramétrisation des ouvertures (`offsetAlong`)

- _Constat :_ L'ouverture stocke `offset_along` (distance absolue en mm depuis le point `A` du mur).
- _Problème :_ Si un mur est inversé (flip de direction), si son point `A` est déplacé pour un raccordement, ou si le mur est découpé par un autre mur, l'ouverture est décalée ou éjectée du mur.
- _Correction :_ Définir un système d'ancrage robuste : référence explicite au nœud d'ancrage (début ou fin), conservation de la position relative paramétrique lors des transformations, et validation stricte des bornes physiques d'accueil (`offsetAlong >= miterMargin` et `offsetAlong + width <= wallLength - miterMargin`).

#### C. Défaillance de l'Algorithme de Jonction en Étoile sur Cas Colinéaires et Jonctions en T

- _Constat :_ L'algorithme de jonction en étoile présenté (section 5.4) trie les murs incidents en CCW et intersecte `left[k]` avec `right[k+1]`.
- _Problème :_
  - Si deux murs sont colinéaires (direction opposée `d1 = -d2`), `cross(d1, d2) == 0`. L'intersection échoue par division par zéro.
  - Dans un T, le mur traversant ne doit pas être biseauté : il reste continu, et seul le mur incident doit venir buter sur sa face. L'algorithme proposé ne distingue pas topologiquement les murs continus des murs sécants.
  - Deux murs qui se croisent (croix) ne peuvent pas simplement « insérer un nœud » lors du tracé sans casser l'identité de l'élément porteur (diviser un mur en 2 génère des problèmes d'hébergement pour les portes déjà placées).
- _Correction :_ Mettre en place un **modèle topologique de jonctions** explicite (L-Join, T-Join, Cross-Join, End-Cap) avec règles de priorité des couches de matériaux (porteur traverse isolant).

#### D. Fragilité de la Détection de Pièces par Union Booléenne Naïve

- _Constat :_ La section 5.5 propose de faire l'union 2D des emprises de murs et de considérer chaque trou intérieur comme une pièce.
- _Problème :_
  - Si deux murs ont un interstice de 1 mm (imprécision de tracé ou tolérance d'accrochage), le contour n'est pas étanche : le trou fusionne avec l'extérieur, et la pièce disparaît instantanément.
  - La méthode de l'union booléenne de surfaces détruit la traçabilité des murs limites (`boundingWalls`) indispensables au calcul des métrés de cloisons par pièce et aux finitions de pièces.
  - Elle ne permet pas de localiser les « fuites » pour aider l'utilisateur.
- _Correction :_ Adopter à terme une structure en graphe planaire (DCEL / arrangement de lignes) pour extraire les faces fermées du réseau de murs, tout en utilisant la tolérance de snapping en amont.

#### E. Gestion d'État et Undo/Redo par Patches Immer Naïfs

- _Constat :_ Le document suggère d'utiliser `produceWithPatches` d'Immer pour enregistrer automatiquement tous les patchs JSON.
- _Problème :_ Bien que séduisant pour un prototype, enregistrer des patchs JSON bruts à chaque micro-action (comme un drag de souris) surcharge la mémoire, ne fournit aucune sémantique métier dans l'historique (impossible d'afficher « Déplacement Mur 1 de 200 mm »), et complexifie la validation des invariants métier lors du Redo.
- _Correction :_ Architecture par **Command Pattern transactionnel** : chaque commande (`MoveWallCommand`, `InsertDoorCommand`) encapsule sa validation métier et son calcul de delta inverse typé. Immer peut être utilisé en interne dans la commande pour produire les transitions d'état immuables sans compromettre l'architecture.

#### F. Absence de Gestion des Relations et Invariants Métier

- _Constat :_ Le document n'aborde pas la gestion des cascades de suppression et d'invalidation (supprimer un mur doit détruire ou détacher ses portes, invalider les pièces adjacentes, recalculer les jonctions des murs voisins).
- _Correction :_ Définir un graphe de dépendances réactif (DAG) qui propage les invalidations par marquage d'éléments sales (`dirty set`) et ordonnancement topologique.

---

## 4. Matrice d'Évaluation des Risques Techniques

| Risque                                                           | Probabilité |  Impact  | Stratégie d'Atténuation                                                                                                                                |
| :--------------------------------------------------------------- | :---------: | :------: | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instabilité géométrique (micro-fissures, divisions par zéro)** |   Élevée    | Critique | Tolérances nommées strictes (`EPSILON`), quantification sur grille entière pour les opérations booléennes, tests unitaires exhaustifs sur cas limites. |
| **Fuite de logique métier dans React / Three.js**                |   Élevée    |  Majeur  | Interdiction stricte d'importer `three` ou `react` dans `core` et `geometry`. Tests automatisés de non-régression d'architecture en CI.                |
| **Explosion des Draw Calls 3D sur grands projets**               |   Moyenne   |  Majeur  | Architecture prête pour le regroupement de géométries par matériau (`chunking`) et l'instanciation (`InstancedMesh`) des ouvertures.                   |
| **Incohérence du modèle lors de l'Undo/Redo**                    |   Moyenne   | Critique | Commandes transactionnelles atomiques avec validation d'invariants pré/post exécution.                                                                 |
| **Perte de données à la fermeture du navigateur**                |   Moyenne   | Critique | Format JSON normalisé versionné dès le jour 1, suivi d'une persistance transactionnelle SQLite (WASM/OPFS).                                            |
| **Complexité excessive prématurée (MEP, toits complexes)**       |   Élevée    |  Majeur  | Respect strict du phasage : stabilisation du noyau architectural avant toute incursion dans les réseaux techniques.                                    |

---

## 5. Décisions Immédiates à Prendre

1. **Initialisation de l'infrastructure :** Mettre en place un monorepo TypeScript strict avec gestion des paquets `pnpm`, bundler `Vite`, moteur de test `Vitest`.
2. **Découpage modulaire :** Structurer le projet en packages autonomes :
   - `@mini-bim/geometry` : Mathématiques pures, 2D/3D, découpes, sans aucune dépendance externe lourde.
   - `@mini-bim/core` : Entités BIM, catalogue de types, graphe de dépendances, bus de commandes.
   - `@mini-bim/persistence` : Sérialisation, schémas Zod versionnés, adaptateurs JSON / SQLite.
   - `@mini-bim/view-2d` : Moteur de rendu et d'interaction 2D (HTML5 Canvas).
   - `@mini-bim/view-3d` : Moteur de rendu 3D Three.js impératif.
   - `@mini-bim/ui` : Application React (barres d'outils, inspecteur de propriétés, métrés).
3. **Formalisation des Spécifications :** Rédaction des documents normatifs d'architecture, de domaine, de géométrie et de roadmap.
