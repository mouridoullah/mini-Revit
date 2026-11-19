# Rapport de Qualification Technique — Phase 9.2
## Noyau Métier MEP & Modèle Topologique des Réseaux Techniques

**Projet :** Mini-BIM (`mini-Revit`)  
**Phase :** 9.2 — Noyau MEP (`feat/phase-9-2-mep-core`)  
**Date :** 19 novembre 2026  
**Auteurs :** Ingénieur Principal & Direction Technique  
**Environnement d'exécution :** Node.js 24.1.0, TypeScript 5.7 strict, Vite 6, Three.js 0.170, Vitest 3.2.7, Playwright 1.51  
**Statut :** **LIVRÉ, QUALIFIÉ & INTÉGRÉ SANS RÉSERVE** (1 061 tests passants, 0 erreur TS strict, 0 warning ESLint)

---

## 1. Contexte & Périmètre Contractuel

Conformément aux arbitrages méthodologiques de la Phase 9.1 et à l'**ADR-009** (*Extensibilité du Modèle pour les Réseaux MEP*), la **Sous-phase 9.2** a été engagée avec un périmètre rigoureusement délimité :
- **Objectif prioritaire :** Établir le modèle sémantique typé et le système de connectivité topologique des réseaux techniques fluides et électriques dans `@mini-bim/core`.
- **Frontières explicites respectées :** Aucun développement prématuré d'algorithmes de routage géométrique automatique, de génération 3D de coudes/tés, d'outils interactifs de dessin 2D/3D, d'interférences solides 3D (BVH/OBB) ou de calculs de pertes de charge hydrauliques. Tout ce périmètre aval reste assigné aux Sous-phases 9.3 et 9.4.

---

## 2. Décisions Architecturales Majeures & Garde-fous Validés

### 2.1. Découplage Structurel Absolu des Deux Graphes (ADR-056)
L'arbitrage architectural clé réside dans la séparation étanche entre :
1. **Le `DependencyGraph` existant (DAG de dépendance BIM) :**
   - Reste **strictement acyclique** ($\mathcal{O}(V+E)$).
   - Ne capture que les dépendances structurelles de niveau et d'affectation : `levelId -> mepElement`, `mepSystemId -> mepElement`.
   - **Règle absolue vérifiée :** Aucune arête de flux physique n'y est injectée.
2. **Le `MepNetworkGraph` (Graphe topologique physique MEP) :**
   - Indépendant du DAG, modélise la connectivité physique réelle des ports et connecteurs.
   - Autorise sans restriction les réseaux linéaires, ramifiés, les sous-réseaux disjoints, les éléments isolés et **les boucles fermées cycliques** (boucles aller/retour chauffage, boucles de recyclage ECS).
   - Test formel `T-MEP-03` : une boucle hydraulique fermée est détectée par `graph.hasLoops() === true` tout en garantissant `dag.hasCycle() === false`.

### 2.2. Modèle Sémantique Typé & Contrat Formel des Ports
Le module `packages/core/src/mep/` introduit 8 entités typées :
- `Pipe` (tuyauterie), `Duct` (gaine), `CableTray` (chemin de câbles), `MepFitting` (raccords coude/té/croix/réduction/bouchon), `MepEquipment` (chaudière, PAC, cumulus, CTA, radiateur, etc.), `MepSystem` (système technique fluide), `Port` (point de raccordement physique) et `Connector` (relation effective de connexion).
- **Taxonomie typée des fluides :** `plumbing` (`domestic_cold_water`, `domestic_hot_water`, `drainage_waste`, `drainage_soil`), `hvac` (`supply_air`, `return_air`, `exhaust_air`), `hydronic` (`hydronic_supply`, `hydronic_return`), `electrical` (`power`, `telecom`). Aucune chaîne libre n'est acceptée.
- **Tolérances centralisées (`MEP_TOLERANCES`) :** `POSITION_MM = 1.0`, `ANGLE_RAD = 0.05` (~2.86° anti-parallèle), `DIMENSION_MM = 0.5`.

### 2.3. Transactionnalité, Cascade et Undo/Redo Intégral
12 commandes transactionnelles réversibles ont été intégrées à `BimDocument` (`AddPipe`, `UpdatePipe`, `DeletePipe`, `AddDuct`, `AddCableTray`, `AddMepFitting`, `AddMepEquipment`, `CreateMepSystem`, `AssignToMepSystem`, `RemoveFromMepSystem`, `ConnectPorts`, `DisconnectPorts`).
- **Cascade de suppression :** La suppression d'un élément MEP détache immédiatement ses connecteurs incidents et assainit ses références système.
- **Réversibilité prouvée (`T-MEP-11`, `T-MEP-12`) :** `undo()` restaure intégralement l'élément et ses connexions incidentes sans duplication ni relique orpheline.

### 2.4. Performance : Coût Local Strict $\mathcal{O}(1)$
Conformément aux alertes de la Phase 9.1, les contrôles de validation différentielle post-condition (`validateDirty`) s'exécutent en complexité locale stricte $\mathcal{O}(1)$ par élément marqué dirty. Aucune boucle quadratique $\mathcal{O}(N^2)$ globale n'a été insérée.

---

## 3. Résultats de la Suite de Qualification (`mep.test.ts`)

La suite de tests dédiée `packages/core/src/mep/mep.test.ts` valide les 16 exigences contractuelles :

| Identifiant | Scénario de Test | Statut | Résultat Observé |
| :--- | :--- | :--- | :--- |
| **`T-MEP-01`** | Réseau linéaire | ✅ Passant | Chaîne continue de segments raccordés, traversée BFS complète |
| **`T-MEP-02`** | Réseau ramifié | ✅ Passant | Té de dérivation avec 3 branches, connectivité multi-directionnelle |
| **`T-MEP-03`** | Réseau avec boucle | ✅ Passant | Boucle fermée chaudière/radiateur détectée (`hasLoops() = true`), DAG 100% acyclique |
| **`T-MEP-04`** | Réseaux déconnectés | ✅ Passant | Détection et partitionnement exact de 2 sous-réseaux disjoints (`getAllNetworks`) |
| **`T-MEP-05`** | Ports libres | ✅ Passant | Identification exacte des extrémités ouvertes du réseau |
| **`T-MEP-06`** | Incompatibilité de domaine | ✅ Passant | Rejet immédiat d'une connexion Plomberie $\leftrightarrow$ CVC (`DOMAIN_MISMATCH`) |
| **`T-MEP-07`** | Incompatibilité de fluide | ✅ Passant | Rejet immédiat Eau Froide $\leftrightarrow$ Eau Chaude (`SYSTEM_TYPE_MISMATCH`) |
| **`T-MEP-08`** | Connexion dupliquée | ✅ Passant | Rejet d'un second raccordement sur un port déjà engagé (`PORT_ALREADY_CONNECTED`) |
| **`T-MEP-09`** | Suppression élément intermédiaire | ✅ Passant | Suppression de tuyau intermédiaire : purge automatique des 2 connecteurs incidents |
| **`T-MEP-10`** | Suppression équipement raccordé | ✅ Passant | Nettoyage des connecteurs incidents et retrait de la liste `elementIds` du système |
| **`T-MEP-11`** | Undo/Redo d'une connexion | ✅ Passant | Cycle Undo $\to$ port redevient ouvert, Redo $\to$ connexion rétablie |
| **`T-MEP-12`** | Undo/Redo suppression élément | ✅ Passant | Cycle Undo $\to$ restauration parfaite de l'élément ET de ses connecteurs |
| **`T-MEP-13`** | Sérialisation / Restauration | ✅ Passant | Cycle `toJSON` $\to$ `fromJSON` sans perte d'intégrité topologique |
| **`T-MEP-14`** | Rétrocompatibilité maquettes anciennes | ✅ Passant | Chargement sans erreur d'un fichier architectural V2 sans clés MEP |
| **`T-MEP-15`** | Cohérence DAG vs MepNetworkGraph | ✅ Passant | Invalidation réactive du niveau vers les tuyaux via `dag.getDependents(levelId)` |
| **`T-MEP-SCALE`** | Scalabilité du MepNetworkGraph | ✅ Passant | Mesure sur 100, 1 000 et 10 000 connexions (détail ci-après) |

---

## 4. Métrologie Empirique de Scalabilité Topologique (`T-MEP-SCALE`)

Mesures obtenues sur le `MepNetworkGraph` sur des chaînes continues de 100 à 10 000 connexions :

| Taille du Réseau ($N$ connexions) | Parcours BFS complet ($P_{50}$) | Détection de boucles `hasLoops` ($P_{50}$) | Empreinte mémoire estimée |
| :--- | :--- | :--- | :--- |
| **100 connexions** | **0,03 ms** | **0,02 ms** | $< 50\text{ Ko}$ |
| **1 000 connexions** | **0,35 ms** | **0,28 ms** | $\approx 450\text{ Ko}$ |
| **10 000 connexions** | **3,85 ms** | **3,10 ms** | $\approx 4,8\text{ Mo}$ |

**Conclusion de performance :** Le `MepNetworkGraph` présente une complexité strictement linéaire $\mathcal{O}(V + E)$. Parcourir un réseau technique massif de 10 000 éléments prend moins de **4 millisecondes**, garantissant une fluidité absolue pour la coordination interdisciplinaire.

---

## 5. Métriques Consolidées du Dépôt en Fin de Phase 9.2

- **Tests unitaires et d'intégration :** **1 061 tests passants** (100% verts sur 101 suites de test) :
  - `packages/geometry` : 222 tests
  - `packages/core` : 456 tests (+16 tests MEP)
  - `packages/view-3d` : 65 tests
  - `packages/view-2d` : 111 tests
  - `apps/web` : 207 tests
- **Smoke tests navigateur réel (Playwright E2E) :** **2/2 tests passants** sur Chromium headless avec serveur de preview production (`vite preview`).
- **Typage TypeScript strict :** **0 erreur** (`pnpm typecheck` sur les 5 projets).
- **Linting ESLint :** **0 erreur, 0 warning** (`pnpm lint`).
- **Build de production séquentiel :** Réussi en **4,14 secondes** avec chunks modulaires (`three`, `react-vendor`, `index`).
- **Gouvernance :**
  - **ADR-056** rédigé et consigné dans [`docs/adr/ADR-056-mep-topological-network-graph-and-semantic-model.md`](file:///c:/Users/bdame/Downloads/mini-Revit/docs/adr/ADR-056-mep-topological-network-graph-and-semantic-model.md).
  - Resynchronisation complète de [`DECISIONS.md`](file:///c:/Users/bdame/Downloads/mini-Revit/DECISIONS.md), [`DOMAIN_MODEL.md`](file:///c:/Users/bdame/Downloads/mini-Revit/DOMAIN_MODEL.md) et [`ROADMAP.md`](file:///c:/Users/bdame/Downloads/mini-Revit/ROADMAP.md).
  - Registre de catégories étendu à 25 catégories et 29 relations déclaratives.

---

## 6. Prérequis Techniques Obligatoires avant la Sous-phase 9.3

Avant d'engager le rendu graphique et les outils interactifs MEP (Sous-phase 9.3), les optimisations et nettoyages suivants doivent être exécutés :
1. **Scission des deux derniers monolithes graphiques :**
   - `packages/view-2d/src/renderer.ts` (~1 938 lignes)
   - `packages/view-3d/src/mesh-generator.ts` (~1 550 lignes)
2. **Filtrage par niveau actif et Frustum Culling sur `View2D` :**
   - Éliminer le tracé exhaustif de tout le bâtiment pour ramener le temps de rafraîchissement 2D sous les 16 ms ($> 60\text{ FPS}$).
