# ADR-075 : Résolution Assistée des Conflits MEP 3D, Dévoiement Déterministe (`BypassMepSegmentCommand`) & Contraintes Gravitaires (Tabax v1.4.0)

## Contexte

La version `Tabax v1.2.0` (`ADR-073`) a établi le socle agentique `@tabax/ai`, le clonage instantané `BimDocument.cloneForSandbox()`, la transaction atomique `BimDocument.runTransaction()`, la boucle d'auto-correction `DryRunExecutor` et le *Stale Plan Guard*. Toutefois, `@tabax/ai` n'expose en `v1.2.0` que l'audit en lecture (`get_clashes_summary`) et les commandes architecturales 2D/3D (murs, baies, composants, pièces, cotations, vues).

L'audit technique préalable du moteur `ClashEngine` (`packages/core/src/clash/`) et des primitives de routage MEP (`packages/core/src/mep/`) sur la maquette de référence `demo-immeuble-r4.json` a mis en évidence quatre constats structurels qui conditionnent la faisabilité d'un copilote de synthèse MEP en `v1.3.0` :

1. **Bruit topologique à 2 sauts dans `ClashEngine` :** Sur `demo-immeuble-r4.json`, `detectClashes(state, { checkClearance: true })` remonte **672 conflits**, dont **460 (68,5 %) sont des recouvrements entre voisins distants de 2 sauts** partageant un raccord ou équipement intermédiaire (`350 / 422` `pipe::pipe::hard`, `74 / 76` `mepEquipment::pipe::hard`, `36 / 42` `pipe::mepFitting::hard`). En effet, `areMepElementsConnected` dans `packages/core/src/clash/classification/rules.ts` ne contrôle que les connecteurs directs à **1 saut**. Brancher un agent de résolution MEP sans assainir préalablement cette classification l'enverrait corriger des centaines de faux positifs.
2. **Sémantique de `filterElementIds` dans `detectClashes` :** L'option `filterElementIds` actuelle filtre les **deux** bornes de `extractIndexedElements` (`packages/core/src/clash/engine.ts`). Elle ne permet donc pas de tester un élément dévoyé contre l'ensemble de la maquette (architecture, structure, autres réseaux MEP).
3. **Absence de primitive d'évitement local et perte d'attributs à la scission :** `solveMepRoute` (`packages/core/src/mep/routing.ts`) sait calculer des tracés droits, en L, en baïonnette XY planaire ou en colonne montante, mais ne sait pas dévier un tronçon existant autour d'un obstacle (`intersectionBox`) par un déport local en oméga ($\pm XY$ ou $\pm Z$) ni recâbler ses connecteurs voisins. De plus, `InsertTeeBranchCommand` (`packages/core/src/mep/commands/routing.ts`) ne propage pas `origPipe.slope` ni `origPipe.name` sur les deux sous-segments générés.
4. **Réseaux gravitaires non protégés :** `Pipe.slope` et `MEP_TOLERANCES.SLOPE_PERCENT` existent, mais ni `solveMepRoute` ni `checkPipeViolations` ne préviennent aujourd'hui la création d'un siphon, d'une contre-pente ou d'une réduction de pente sous le seuil nominal (`84` tuyaux gravitaires `sys_eu` / `sys_ev` dans `demo-immeuble-r4.json` avec pentes `0.01` et `0.02`).

---

## Lot 0 — Prérequis Obligatoire d'Assainissement (`@tabax/core`)

Avant l'implémentation de tout outil de résolution MEP, le **Lot 0** doit assainir le noyau :

1. **L0.1 — Exclusion à 2 sauts bornée géométriquement (`packages/core/src/clash/classification/rules.ts`) :**
   - Clarifier la distinction entre faux positifs topologiques à 2 sauts et vrais conflits inter-systèmes sur `demo-immeuble-r4.json` :
     - Sur les `76` `mepEquipment::pipe::hard`, **`74`** sont des paires à 2 sauts au sein du même système (`pipe -> fitting/pipe -> equipment`) contre **`2`** collisions réelles (`equip_compteur_eau ↔ pipe_ef_vers_ballon`, `equip_balloon_ecs ↔ sys_ef_f0_terminal_1_2`).
     - Sur les `42` collisions tuyau/raccord (`36` `pipe::mepFitting` + `6` `mepFitting::pipe`), **`36`** sont des recouvrements à 2 sauts dans le même système contre **`6`** vraies collisions inter-systèmes (`duct_tee_vmc_* ↔ sys_eu_riser_*`, pénétration `50 mm`).
     - Sur les `422` `pipe::pipe::hard`, **`350`** sont des paires à 2 sauts au droit d'un nœud commun.
   - **Règle d'exclusion retenue :** Ne jamais exclure aveuglément toute paire `(A, B)` distante de 2 sauts dans `MepNetworkGraph` (deux branches longues issues d'un même té pourraient se recroiser ailleurs). Exclure `(A, B)` **uniquement si** :
     - `A` et `B` partagent un nœud connecté commun `N` (`MepFitting`, `MepEquipment` ou segment intermédiaire) ; **et**
     - la zone d'intersection `intersectionBox` calculée par la *narrow-phase* se situe dans l'emprise AABB de ce nœud partagé `N` augmentée d'une marge bornée (ex. `MEP_TOLERANCES.POSITION_MM` + demi-section nominale au raccord).
2. **L0.2 — Option `targetElementIds` sur `detectClashes` (`packages/core/src/clash/engine.ts`) :**
   - Conserver la rétrocompatibilité de `filterElementIds` (sous-ensemble complet) et introduire `targetElementIds?: readonly ElementId[]`.
   - Lorsque `targetElementIds` est fourni, l'index BVH indexe l'intégralité de `state` mais la boucle d'évaluation ne retient que les paires candidates dont **au moins un élément** (`elemA.id` ou `elemB.id`) appartient à `targetElementIds`, garantissant une vérification contre toute la maquette sans coût de post-filtrage tardif.
3. **L0.3 — Helper partagé de scission & propagation de pente (`packages/core/src/mep/commands/routing.ts`) :**
   - Extraire un helper pur de scission de segment (`splitLinearMepSegment`) utilisé par `InsertTeeBranchCommand` et par la future commande de dévoiement.
   - Corriger l'oubli actuel dans `InsertTeeBranchCommand` : propager systématiquement `origPipe.slope` (ainsi que `name` et propriétés physiques `thickness`, `material`, `insulationThickness`) sur les sous-segments résultants.

---

## Décisions Architecturales

### 1. D1 — Hiérarchie Métier de Synthèse & Verrous Gravitaires Non Négociables

- **Priorité de dévoiement BIM :** Lors d'un conflit MEP ↔ MEP, la priorité de déplacement suit strictement les contraintes hydrauliques et d'encombrement :
  1. **Priorité 1 (plus flexibles) :** Courants forts/faibles (`electrical` : `power`, `telecom`), eau sous pression (`domestic_cold_water`, `domestic_hot_water`) et réseaux hydroniques (`hydronic_supply`, `hydronic_return`).
  2. **Priorité 2 :** Gaines aérauliques (`hvac` : `supply_air`, `return_air`, `exhaust_air`).
  3. **Priorité 3 (dernier recours) :** Réseaux gravitaires d'évacuation (`drainage_waste`, `drainage_soil`).
- **Piège mathématique de la pente gravitaire :** Entre deux points d'ancrage d'altitude figée $(z_{\text{start}}, z_{\text{end}})$, un dévoiement horizontal en oméga allonge le parcours développé ($L' > L$) à dénivelé total constant ($\Delta z$ invariant). Cela **réduit mécaniquement la pente effective** ($\left|\Delta z\right| / L' < \text{slope}$).
- **Verrou physique strict dans `@tabax/core` :**
  - Interdiction absolue de tout déport vertical $\pm Z$ en oméga (qui créerait un siphon ou une poche d'air/contre-pente) sur un segment gravitaire (`drainage_waste`, `drainage_soil` ou porteur d'un `slope` strict). Rejet atomique avec `BimValidationError` de code **`GRAVITY_COUNTER_SLOPE`**.
  - Tout dévoiement horizontal sur segment gravitaire vérifie que la pente effective résultante sur chaque sous-segment respecte $\text{slope}_{\text{eff}} \ge \text{slope}_{\text{nominal}} - \text{MEP\_TOLERANCES.SLOPE\_PERCENT}$ dans le même sens d'écoulement. En cas d'échec, rejet avec code **`GRAVITY_SLOPE_VIOLATION`**.
  - Les outils IA enrichissent les erreurs `GRAVITY_COUNTER_SLOPE` et `GRAVITY_SLOPE_VIOLATION` d'une recommandation explicite de dévier l'autre élément du conflit s'il appartient à une discipline non gravitaire.

---

### 2. D2 — Outils IA Déclaratifs de Haut Niveau & Primitives Atomiques (`BypassMepSegmentCommand`)

Un modèle de langage (y compris un modèle local 8B–14B) ne doit **jamais** calculer lui-même les coordonnées de 4 coudes et 5 segments d'un contournement 3D. Toute la trigonométrie et le re-câblage topologique résident de manière déterministe dans `@tabax/core` :

1. **Solveur pur `solveMepBypass` (`packages/core/src/mep/routing.ts`) :**
   - Paramètres : segment cible (`Pipe` | `Duct` | `CableTray`), boîte d'obstacle (`intersectionBox`), direction de dévoiement demandée (`'+x' | '-x' | '+y' | '-y' | '+z' | '-z'` ou axe canonique orthogonal `'up' | 'down' | 'left' | 'right'`), dégagement cible `clearanceMm`, angle de coude `45 | 90`.
   - Calcule une fenêtre de scission amont/aval centrée sur l'intersection, génère les sous-segments conservés + l'oméga de contournement (2 coudes de sortie + tronçon décalé + 2 coudes de retour), contrôle `MIN_SEGMENT_LENGTH_MM = 50` mm, respecte les dalles plancher/plafond du niveau actif et rejette en amont toute géométrie dégénérée (`ROUTE_INSUFFICIENT_SPACE`, `SEGMENT_TOO_SHORT`).
2. **Commande transactionnelle `BypassMepSegmentCommand` (`packages/core/src/mep/commands/routing.ts`) :**
   - Scinde atomiquement le segment d'origine, insère les sous-segments et les 4 coudes `elbow`, re-câble les `Connector` incidents des ports extrêmes d'origine (`oldPort0Id`, `oldPort1Id`) vers le premier et dernier sous-segment, met à jour `mepSystems[systemId].elementIds` et conserve l'intégralité réversible en **1 seul `undo()`** (sans aucun élément ni connecteur orphelin).
3. **Commande complémentaire `OffsetMepSegmentCommand` :**
   - Décalage global contrôlé d'un tronçon complet (`deltaXMm`, `deltaYMm`, `deltaZMm`) avec adaptation ou raccordement aux ports extrêmes lorsque le décalage du segment entier est préférable à un oméga local.
4. **Outils exposés dans `@tabax/ai` (`ADR-073` étendu) :**
   - **Lecture (`mode: 'read'`) :**
     - Enrichissement rétrocompatible de `get_clashes_summary` avec `disciplineA`, `disciplineB`, `point` et `intersectionBox` (sans casser le contrat existant `v1.2.0`).
     - Nouvel outil **`get_clash_context(clashId)`** renvoyant la fiche complète des deux éléments, leur `MepSystem`, l'indicateur `isGravity`, la pente nominale, le débattement vertical libre entre la dalle plancher et la sous-face de dalle haute du niveau, et la liste des directions de dévoiement candidates.
   - **Mutation sous bac à sable (`mode: 'mutate'`) :**
     - **`bypass_mep_segment(segmentId, clashId, direction, clearanceMm?, bendAngleDeg?)`** (mappé sur `BypassMepSegmentCommand` via descripteur immuable `PlannedStep`).
     - **`offset_mep_segment(segmentId, deltaXMm?, deltaYMm?, deltaZMm?)`** (mappé sur `OffsetMepSegmentCommand`).

---

### 3. D3 — Contrat Déterministe de Vérification Post-Résolution (`ΔClashes == 0`)

L'exécution de `bypass_mep_segment` ou `offset_mep_segment` dans le bac à sable (`BimDocument.cloneForSandbox()`) doit valider **4 invariants déterministes** avant qu'un `PlannedStep` puisse être accepté comme étape réussie :

1. **Disparition du conflit ciblé :** Un contrôle `detectClashes` ciblé via `targetElementIds` (incluant tous les nouveaux segments/coudes créés et le `clashId` d'origine) vérifie que le couple `(elementA, elementB)` d'origine ne produit plus d'intersection à la sévérité ciblée.
2. **Zéro nouveau conflit introduit (`ΔClashes == 0` nouveau) :** Comparaison de l'ensemble des conflits impliquant les éléments créés ou modifiés contre **toute la maquette** (architecture, structure, autres réseaux MEP) avant et après mutation. Si un conflit inédit apparaît (`Set(after) \ Set(before)` non vide), la commande sandbox retourne un `ToolErrorResult` structuré de code **`NEW_CLASH_INTRODUCED`** contenant `{ clashId, otherElementId, otherCategory, severity, point, penetrationDepthMm }`, permettant à `DryRunExecutor` d'explorer automatiquement un quadrant alternatif dans la limite de `MAX_SELF_CORRECTION_RETRIES = 3`.
3. **Continuité topologique `MepNetworkGraph` :** Vérification que tous les ports précédemment connectés aux extrémités du tronçon modifié restent raccordés et que le nombre de composantes connexes du `MepSystem` concerné n'augmente pas (`MEP_NETWORK_DISCONNECTED` sinon).
4. **Garde d'obsolescence & atomicité :** Toutes les créations, suppressions et re-câblages d'un ou plusieurs dévoiements validés en sandbox restent soumis au *Stale Plan Guard* (`doc.getState() !== plan.baseState` / `revalidatePlan`) et s'appliquent via `BimDocument.runTransaction` en **1 entrée `HistoryEntry`**.

---

### 4. D4 — Hors Périmètre Automatique : Traversées de Murs / Cloisons (`pipe::wall`)

Conformément au principe de non-destructivité silencieuse (`ADR-070`), `v1.3.0` **exclut la création automatique de percements, fourreaux ou réservations dans les murs porteurs ou cloisons**. Face à un conflit `MEP ↔ Wall` (tel les `2` cas `pipe::wall::clearance` observés sur `demo-immeuble-r4.json`), l'assistant propose soit un contournement latéral/vertical du conduit lorsque la configuration s'y prête, soit un diagnostic explicite laissant à l'utilisateur la validation manuelle d'une réservation.

---

## Découpage d'Implémentation Recommandé (`v1.3.0`)

- **Lot 0 (`@tabax/core`) :** Exclusion 2 sauts bornée géométriquement dans `classification/rules.ts`, option `targetElementIds` dans `detectClashes`, correction propagation `slope`/`name` lors des scissions, et tests de non-régression sur `demo-immeuble-r4.json` (mesure exacte de la baisse des faux positifs).
- **Lot 1 (`@tabax/core`) :** Solveur pur `solveMepBypass`, verrous gravitaires (`GRAVITY_COUNTER_SLOPE`, `GRAVITY_SLOPE_VIOLATION`), `BypassMepSegmentCommand`, `OffsetMepSegmentCommand` et tests unitaires (`undo()` atomique sans connecteurs orphelins).
- **Lot 2 (`@tabax/ai`) :** Enrichissement de `get_clashes_summary`, ajout de `get_clash_context`, `bypass_mep_segment`, `offset_mep_segment`, contrat post-résolution `ΔClashes == 0` (`NEW_CLASH_INTRODUCED`) et tests `DryRunExecutor` avec bascule automatique de quadrant.
- **Lot 3 (`apps/web` & E2E) :** Raccourci UI contextuel depuis `ClashPanel` vers `Assistant IA` (« Proposer une résolution IA »), mise en évidence des conflits résolus / restants et scénarios E2E Playwright déterministes.

---

## Statut
**Proposé** — Étude d'architecture planifiée pour `Tabax v1.4.0` (pré-lot d'exclusion des coudes directs `areLinearMepNaturallyConnected` livré par anticipation dans `v1.3.0` / `ADR-074`).

## Conséquences
- Élimination préalable des 460 faux positifs topologiques à 2 sauts sur `demo-immeuble-r4.json` avant toute exposition à l'agent de synthèse.
- Protection mathématique et métier explicite des collecteurs gravitaires EU/EV contre les contre-pentes et siphons.
- Garantie que tout dévoiement proposé par l'assistant IA supprime le conflit ciblé sans introduire de nouvelle collision ailleurs dans le bâtiment et s'annule en un seul `Ctrl+Z`.
