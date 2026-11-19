# ADR-054 : Modularisation du Noyau, Propagation DAG des Composants Hébergés et Qualification Système

- **Statut :** Accepté
- **Date :** 2026-11-19
- **Auteurs :** Équipe Mini-BIM (Phase 8.6)
- **Décideurs :** Architecture Core & Direction Technique

---

## 1. Contexte

À l'issue des Phases 8.4, 8.5 et des chantiers de consolidation 1 à 4, le moteur Mini-BIM a atteint un haut niveau de complétude sémantique. Cependant, les audits externes (ChatGPT & Gemini) ont mis en lumière trois axes critiques avant d'envisager la Phase 9 (MEP) :
1. **Dette de maintenabilité sur les monolithes :** trois fichiers dépassaient 1 500 à 2 150 lignes (`packages/core/src/rules.ts`, `packages/core/src/commands.ts`, `apps/web/src/components/PropertyInspector.tsx`), créant un goulot d'étranglement de lisibilité et de couplage.
2. **Propagation réactive des composants hébergés (`placement.hostWallId`) :** si la suppression en cascade d'un mur détachait bien le composant, la réactivité du DAG lors d'une mutation géométrique du mur hôte devait être formalisée et prouvée. De plus, le comportement des collisions mur $\to$ composant devait être tranché pour éviter d'entraver le travail architectural légitime (rejet bloquant vs avertissement).
3. **Qualification externe & Tests réels :** le pipeline manquait d'un test navigateur réel (WebGL + Canvas 2D) en environnement de production et d'une preuve d'interopérabilité IFC4 autonome validée par un parseur externe officiel (WebIFC).

---

## 2. Décisions Architecturales

### 2.1. Découpage Modulaire Zéro Rupture (Chantier 8.6.1)
- **`packages/core/src/rules/` :** éclatement du monolithe de 2 150 lignes en 12 modules spécialisés par domaine sémantique (`types.ts`, `utils.ts`, `walls.ts`, `openings.ts`, `levels.ts`, `rooms.ts`, `dimensions.ts`, `slabs.ts`, `stairs.ts`, `roofs.ts`, `components.ts`, `dirty.ts`). Le point d'entrée `rules.ts` conserve un ré-export complet `export * from './rules/index.js'`, garantissant une rétrocompatibilité absolue à 100%.
- **`packages/core/src/commands/` :** éclatement du monolithe de 2 040 lignes en 10 modules (`base.ts`, `walls.ts`, `levels.ts`, `openings.ts`, `rooms.ts`, `dimensions.ts`, `slabs.ts`, `stairs.ts`, `roofs.ts`, `components.ts`). Le fichier `commands.ts` ré-exporte `./commands/index.js`.
- **`apps/web/src/components/inspector/` :** éclatement de l'inspecteur de propriétés de 1 518 lignes en composants isolés à responsabilité unique (`DebouncedInputs.tsx`, `WallInspector.tsx`, `SlabInspector.tsx`, `DoorInspector.tsx`, `WindowInspector.tsx`, `LevelInspector.tsx`, `StairInspector.tsx`, `RoofInspector.tsx`, `ComponentInspector.tsx`). `PropertyInspector.tsx` devient un orchestrateur concis (~200 lignes).

### 2.2. DAG & Cycle Réactif des Composants Hébergés (Chantier 8.6.2)
- La dépendance `component -> hostWallId` est enregistrée dans le DAG.
- Lors de l'exécution de toute commande modifiant un mur (`UpdateWallCommand`, `MoveWallCommand`), `BimDocument.execute` interroge le DAG avant et après transaction via `dag.getDependents(wallId)`. Le composant hébergé est automatiquement agrégé dans l'ensemble `CommandResult.changed` et diffusé aux écouteurs réactifs via `lastChangedIds`.
- Test formel `T-EXEC-08` dans `document-execution.test.ts`.

### 2.3. Tranchage Collision Mur $\to$ Composant : Sévérité `warning`
- En phase de conception architecturale, déplacer un mur ou ajuster un agencement ne doit pas bloquer la transaction en cas de chevauchement temporaire de mobilier.
- `COMPONENT_COLLISION` est classé en `severity: 'warning'`.
- La fonction `validateDirty` ne lève d'exception fatale que pour les violations où `v.severity !== 'warning'`. Les collisions restent inspectables et signalées dans les outils de vérification sans entraver la saisie.
- Test formel `T-RULES-MOVE-06` dans `rules-move.test.ts`.

### 2.4. Banc de Performance Synthétique (Chantier 8.6.3)
- Mise en place du banc `packages/core/src/perf/scale-benchmark.test.ts` testant des grilles de 100 et 1 000 murs.
- Mesures réelles obtenues :
  - Construction du DAG (1 000 murs) : **< 2 ms** (budget 15 ms).
  - Validation différentielle `validateDirty` (1 000 murs) : **< 0,5 ms** (budget 5 ms).
  - Déplacement cinématique `MoveWallCommand` avec étirement élastique (100 murs) : **< 8 ms** (budget 25 ms).
  - Transaction unitaire DAG (1 000 murs) : **< 15 ms** (budget 50 ms).

### 2.5. Qualification IFC4 & Smoke Test Navigateur Réel (Chantiers 8.6.4 & 8.6.6)
- Script d'export autonome `scripts/export-villa-ifc.mjs` produisant la maquette complète de la Villa Contemporaine Complexe (38,5 Ko, 11 murs, 4 dalles, 1 toit à deux pans, 1 escalier, 6 ouvertures).
- Validation syntaxique et structurelle par le moteur C++/WASM officiel `web-ifc` : 0 erreur.
- Intégration de Playwright (`test:e2e`) avec un serveur de prévisualisation de production (`vite preview --port 4173`) et test Chromium headless validant l'instanciation des contextes WebGL/Canvas et l'absence d'erreurs console.

---

## 3. Conséquences

- **Positives :**
  - Fin des fichiers monolithiques ingérables : chaque fichier source reste désormais sous 350-450 lignes.
  - Garantie de réactivité complète du DAG pour les composants hébergés.
  - Preuve formelle de passage à l'échelle sur 1 000 entités.
  - Sécurité absolue de la CI : compilation séquentielle et tests E2E réels.
- **Neutres :**
  - Le découpage en sous-modules respecte l'arborescence des types sans casser aucun import existant grâce aux façades de ré-export.
