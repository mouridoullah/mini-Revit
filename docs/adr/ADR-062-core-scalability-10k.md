# ADR-062 : Scalabilité du Noyau 10 000 Entités — Indexation Paresseuse $\mathcal{O}(1)$, Partage Structurel CSG de Dalles via WeakMap et DAG Incrémental Différentiel

**Statut :** Accepté  
**Date :** 21 novembre 2026  
**Auteurs :** Ingénieur Principal & Direction Technique  
**Périmètre :** `@mini-bim/core`, `@mini-bim/geometry`

---

## Contexte

La métrologie de la Phase 9.1 a révélé deux goulots d'étranglement majeurs sur le palier des 10 000 entités (ADR-014) :
1. `resolveWallGeometry` prenait 6 708 ms pour résoudre 4 000 murs à cause d'un double balayage quadratique de l'ensemble des ouvertures, composants et dalles à chaque mur individuel, combiné au recalcul CSG systématique de `computeEffectiveSlabPolygon` sur chaque mur du niveau.
2. Une simple mutation unitaire (`UpdateWallCommand`, `MoveWallCommand`) provoquait une latence de ~6,9 s en raison de la ré-indexation globale du DAG et du réveil de milliers de pièges Proxy Immer de V8.

---

## Décisions Clés

### D1 — Pureté Fonctionnelle et Indexation Paresseuse via `WeakMap` (`packages/core/src/walls/index-cache.ts`)
- Mise en place de `LazyWallResolutionIndex` indexé sur la référence immuable `WeakMap<BimState, WallResolutionIndex>` avec getters paresseux mémoïsés (`doorsByHostWallId`, `windowsByHostWallId`, `componentsByLevelId`, `wallsByLevelId`, `dimensionsByRefId`, `roomsByLevelId`, `slabsByLevelId`, `roofs`). Les collections non sollicitées ne sont jamais scannées.
- Dé-proxification automatique dans `getOrBuildWallResolutionIndex` via `original(draft) ?? draft` avec support de `{ bypassUnwrap: true }` si appelée sur un draft en cours de mutation.
- Partage structurel des dalles via `WeakMap<Slab, EffectiveSlabResult>` réutilisant les contours CSG tant que l'objet `Slab` n'a pas été muté.

### D2 — Maintenance Incrémentale Différentielle du DAG (`packages/core/src/dag/DependencyGraph.ts` & `document.ts`)
- Conservation de l'instance persistante `DependencyGraph` dans `BimDocument`.
- Invariance topologique (`isTopologicalInvariant = true`) court-circuitant la reconstruction et le clonage du DAG lors des translations géométriques pures.
- Mise à jour différentielle locale `updateElements` pour les mutations structurelles.
- Atomicité absolue : si `validateDirty` lève une exception, `this.state` et `this._dag` restent strictement inchangés (`T-EXEC-INVARIANT-CONTRACT`).

### D3 — Accélération de `validateDirty` & Filtrage Spatial sans Proxy (`packages/core/src/rules/dirty.ts` & `rooms/detect.ts`)
- Court-circuit immédiat des violations `'warning'` non-bloquantes (ex. interférences de mobilier) sans second balayage sur `previousState`.
- Filtrage spatial AABB 2D en amont dans `detectRooms` sur coordonnées brutes sans réveiller les proxies Immer.
- Évitement du balayage de clés sur draft Immer via `noNewWalls: true` et `modifiedWallIds`.
- Repli architectural systématique sur la détection complète du niveau pour les grandes pièces ouvertes (> 6m ou > 15m) afin de garantir 0 faux négatif `unenclosed`.

---

## Résultats Métrologiques

| Benchmark & Scénario | Phase 9.1 (Avant) | Phase 10 (Après) | Budget ADR-014 | Facteur d'Accélération |
| :--- | :---: | :---: | :---: | :---: |
| **`T-SCALE-10K-RESOLVE-WALLS`** (4 000 murs) | 6 708 ms | **30.98 ms** | < 100 ms | **$\times 216$ plus rapide** |
| **`T-SCALE-10K-UPDATE-WALL`** (10 000 entités) | 6 931 ms | **16.50 ms** | < 50 ms | **$\times 420$ plus rapide** |
| **`T-SCALE-10K-MOVE-WALL`** (10 000 entités) | ~7 000 ms | **38.68 ms** | < 50 ms | **$\times 180$ plus rapide** |
