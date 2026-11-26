# Journal des modifications (Changelog)

Toutes les modifications notables apportées au projet **Tabax** sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère à la spécification [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.2.0] - 2026-11-26

### Vue d'ensemble
Version mineure apportant le **Copilote BIM Agentique (`@tabax/ai`)**, le **bac à sable transactionnel `BimDocument.runTransaction`**, le mode d'inférence hybride sans backend **Ollama local + BYOK Cloud** et l'onglet **`Assistant IA`** intégré au dock droit du cockpit (`ADR-073`).

---

### Ajouté

#### 1. Transactions Groupées & Clonage Bac à Sable (`@tabax/core`)
- **`BimDocument.runTransaction(label, fn)` :** Exécution séquentielle multi-commandes sur états Immer commis (compatibilité complète avec `original(draft)` dans `MoveWallCommand` et `LazyWallResolutionIndex`), concaténation directe des `patches`, concaténation inversée des `inversePatches` (`[inv_N, ..., inv_1]`) en **1 seule `HistoryEntry`** dotée d'un libellé optionnel `label`, rollback atomique en cas d'échec, blocage des appels imbriqués et d'`undo()`/`redo()` en cours de transaction, et notification `subscribe` unique avec l'union dédupliquée des `changedIds`.
- **`BimDocument.cloneForSandbox()` :** Clone structurel instantané partageant la référence immuable `BimState`, clonant le graphe DAG avec un historique vierge et sans recopier les abonnés UI/3D.
- **Accesseurs d'historique & ré-export :** Ajout de `getUndoLabel()` / `getRedoLabel()` sur `BimDocument` et ré-export racine de `AutoDimensionLevelCommand`.

#### 2. Package Agentique Pur `@tabax/ai` (`ADR-073`)
- **Pureté & étanchéité CI :** Package TypeScript pur dépendant uniquement de `@tabax/core` (0 dépendance runtime externe), verrouillé par `T-PUR-03-AI` dans `purity.test.ts` et `no-restricted-imports` ESLint.
- **Constructeur de contexte compact (`BimContextBuilder`) :** Sérialisation frugale des niveaux, compteurs par catégorie, types catalogués (`wallTypes`, `doorTypes`, `windowTypes`, etc.), sélection courante et résumé d'alertes sous contrainte `< 16 Ko`.
- **Catalogue figé de 17 outils (schémas JSON plats, unités `Mm`/`Deg`) :**
  - *5 outils d'audit en lecture seule (Phase 1) :* `get_project_summary`, `get_level_details` (filtre `categories?`, longueurs, orientations et intervalles occupés pré-calculés), `get_element_by_id`, `audit_model`, `get_clashes_summary`.
  - *12 outils de mutation sous bac à sable (Phase 2) :* `add_wall`, `move_wall`, `update_wall` (`heightMm` / `resetHeightToAuto`), `delete_wall`, `add_door`, `add_window`, `move_opening` (`newOffsetAlongMm` / `deltaOffsetMm`), `delete_opening`, `add_component` (`rotationDeg`), `add_room`, `auto_dimension_level`, `auto_generate_views`.
- **Bac à sable & *Stale Plan Guard* (`DryRunExecutor`) :** Planification par descripteurs immuables `PlannedStep` avec ULIDs figés et fabriques de commandes fraîches, boucle bornée (`MAX_TOOL_STEPS = 8`, `MAX_TOTAL_TOOL_CALLS = 24`, `MAX_SELF_CORRECTION_RETRIES = 3`, `AbortSignal`), auto-correction structurée (`BimValidationError.offendingIds` / `validIds`), détection d'obsolescence sur `doc` ou `baseState` et action déterministe `revalidatePlan` sans appel LLM.
- **Adaptateurs `fetch` hybrides sans backend :** `OpenAiCompatibleProvider` (Ollama, LM Studio, vLLM, OpenAI, normalisant `arguments` chaîne/objet) et `GeminiProvider`, accompagnés du diagnostic CORS (`OLLAMA_ORIGINS`) et *Mixed Content* HTTPS vers HTTP via `testConnection()`.

#### 3. Cockpit `Assistant IA` (`apps/web`)
- **Hook dédié (`useAiCopilot`) & panneau (`AiAssistantPanel`, `RightDockPanel`) :** Onglet `Assistant IA` dans le dock droit, fil conversationnel, réglages fournisseur avec diagnostic de connexion, politique stricte de clés BYOK (`sessionStorage` par défaut, opt-in `localStorage`), carte de plan d'actions avec badge `Obsolète`, bouton `Revalider`, ciblage sélectif des éléments et `Appliquer` / `Ignorer`.
- **Isolation clavier & stabilité 3D :** Blocage explicite des raccourcis globaux lors de la saisie dans le panneau IA et zéro modification sur `Scene3D.ts`.
- **Qualification navigateur :** Ajout de 2 scénarios Playwright déterministes (`page.route()`) couvrant l'auto-correction agentique + `Undo` atomique et le *Stale Plan Guard* avec revalidation sans appel LLM.

---

### Métriques de Qualification v1.2.0

| Métrique de Livraison | Valeur Vérifiée v1.2.0 | Détail par Package |
| :--- | :--- | :--- |
| **Suites de Tests Vitest** | **173 fichiers** | `geometry`: 20, `core`: 53, `view-3d`: 20, `ai`: 5, `view-2d`: 19, `web`: 56 |
| **Tests Automatisés Vitest** | **1 445 tests passés** | `geometry`: 228, `core`: 567, `view-3d`: 125, `ai`: 28, `view-2d`: 155, `web`: 342 |
| **Scénarios E2E Playwright** | **20 / 20 passés (100%)** | `apps/web/e2e/smoke.spec.ts` (Chromium production, 0 erreur console) |
| **Vérification Statique (TypeCheck)** | **0 erreur** | `pnpm typecheck` (`tsc -b` strict sur 6 packages) |
| **Qualité & Formatage (Lint)** | **0 avertissement** | `pnpm lint` (ESLint 9 flat config) |

---

## [1.1.0] - 2026-11-24

### Vue d'ensemble
Version mineure majeure de **Tabax** apportant le pipeline de rendu photoréaliste PBR 3D, l'éclairage IBL en mémoire, les bouchons de coupe fermés par Stencil Buffer, la modélisation géométrique haute fidélité des réseaux MEP et l'éclatement architectural complet des monolithes de `@tabax/view-3d`.

---

### Ajouté

#### 1. Moteur Graphique PBR, IBL & Post-Processing Temps Réel (`ADR-072`)
- **Pipeline colorimétrique & IBL :** Activation de `ACESFilmicToneMapping` (exposition 1.05), espace colorimétrique `SRGBColorSpace` et générateur d'ambiance `PMREMGenerator` couplé à `RoomEnvironment` en mémoire pure sans aucun asset HDR externe.
- **Éclairage dynamique & ombres douces :** Lumière solaire directionnelle orientable avec ajustement horaire dynamique (0-24h), lumière hémisphérique ciel/sol douce et ombres `PCFSoftShadowMap` (4096×4096 en mode Ultra, 2048×2048 en mode Standard) calibrées automatiquement sur la boîte englobante de la scène (`fitShadowsToScene`).
- **Occlusion ambiante & anti-saccade (`PostProcessingManager`) :** Pipeline `EffectComposer` + `GTAOPass` + `OutputPass` avec stratégie adaptative conforme `ADR-018` (rendu direct réactif pendant les manipulations orbitales, passe AO pleine résolution 80 ms après relâchement).
- **Textures PBR procédurales (`ProceduralTextures`) :** Génération mémoire via canvas sans fichier externe pour parquet chêne clair, carrelage pour pièces humides, enduit architectural fin et métaux brossés.
- **Modes de rendu 3D :** Sélecteur tripartite dans le viewport 3D permettant de basculer instantanément entre mode `Technique` (fond ardoise, arêtes nettes), `Écorché` (fond sombre studio, mise en valeur des coupes et MEP) et `Réaliste` (PBR, IBL et AO).

#### 2. Bouchons de Coupe 3D Stencil 2-Passes (`SectionCapManager`)
- Pipeline Stencil Buffer 2-passes (`IncrementWrapStencilOp` sur face arrière, `DecrementWrapStencilOp` sur face avant et plan bouchon coplanaire `#1e222a` testant `stencilRef !== 0`) garantissant des sections coupées pleines et massives sans vide intérieur ni z-fighting.
- Synchronisation temps réel avec le plan de coupe actif (`ADR-063`).

#### 3. Enrichissement Géométrique Haute Fidélité MEP 3D (`@tabax/view-3d`)
- **Tuyaux :** Corps tubulaire au rayon nominal exact, terminaisons étanches fermées et colliers de fixation transversaux réguliers tous les 1 200 mm avec relief franc de +12 % éliminant le z-fighting à distance.
- **Raccords coudés fluides :** Coudes industriels haute fidélité (`elbow`) modélisés par balayage courbe toroïdal continu (`addCurvedSweep`), noyau sphérique interne de renfort et colliers d'emboîture aux ports, éliminant définitivement les bouchons plats saillants et les décrochements d'arêtes.
- **Gaines aérauliques :** Manchons d'étanchéité circulaires et cadres de brides transversaux assemblés en tôle tous les 1 200 mm pour les gaines rectangulaires.
- **Chemins de câbles :** Profilés en U, échelons transversaux, bords roulés supérieurs et 3 nappes de câbles distinctes (courants forts CFO Ø16 mm, courants faibles CFA Ø12 mm, conducteur de terre Ø8 mm).
- **Raccords généraux :** Colliers d'emboîture aux ports, selles de piquage sur les tés et croix, transitions progressives et bouchons étanches avec collerette et tête massive fermée.
- **Équipements techniques :** Modélisation volumique dédiée pour les 10 familles d'équipements (`boiler`, `heat_pump`, `water_heater`, `pump`, `ahu`, `fan`, `radiator`, `valve`, `meter`, `electrical_panel`).

#### 4. Coordination Spatiale & UI Conflits
- Composant partagé `ClashPresentation` (`layout="dock" | "workspace"`) unifiant le tableau d'interférences et la fiche d'inspection détaillée.
- Repositionnement du sélecteur de mode de vue 3D/2D à gauche du volet de prévisualisation pour éliminer définitivement toute superposition avec les boutons de disposition des vues.

---

### Métriques de Qualification v1.1.0

| Métrique de Livraison | Valeur Vérifiée v1.1.0 | Détail par Package |
| :--- | :--- | :--- |
| **Suites de Tests Vitest** | **165 fichiers** | `geometry`: 20, `core`: 52, `view-3d`: 20, `view-2d`: 19, `web`: 54 |
| **Tests Automatisés Vitest** | **1 402 tests passés** | `geometry`: 228, `core`: 559, `view-3d`: 125, `view-2d`: 155, `web`: 335 |
| **Scénarios E2E Playwright** | **18 / 18 passés (100%)** | `apps/web/e2e/smoke.spec.ts` (navigateur Chromium réel, 0 erreur console) |
| **Vérification Statique (TypeCheck)** | **0 erreur** | `pnpm typecheck` (TypeScript 5.7.3 strict sur 5 packages) |
| **Qualité & Formatage (Lint)** | **0 avertissement** | `pnpm lint` (ESLint 9 flat config) |
| **Plafond Monolithes 3D** | **Respecté (< 800 L)** | `Scene3D.ts` à **773 lignes** (`ADR-072`) |

---

### Modifié

#### Architecture Modulaire & Refactorisation
- **Scission de `Scene3D.ts` :** Monolithe ramené à **773 lignes** (strictement sous les 800 lignes requises par `ADR-072`), déléguant ses responsabilités à 6 gestionnaires dédiés sous `rendering/` (`ArchitecturalMeshManager`, `DomainMeshFactory`, `ClashOverlayManager`, `SelectionHighlightManager`, `CameraTransitionManager`, `ArchitecturalGridManager`).
- **Éclatement de `mesh-generator/mep.ts` :** Divisé en 8 sous-modules étanches dans `mep/`.
- **Éclatement de `components-3d.ts` :** Façade allégée distribuant les sous-modules dans `components/`.
- Correction de l'attribution de l'historique borné à 500 entrées à `ADR-068` (au lieu d'`ADR-070`).

---

## [1.0.0] - 2026-11-22

### Vue d'ensemble
Version inaugurale majeure de **Tabax** (anciennement Mini-BIM), plateforme web professionnelle de modélisation de l'information du bâtiment (BIM), de coordination technique multidisciplinaire et de production de plans d'exécution CAO/BIM.

Cette version 1.0.0 consolide l'ensemble des saisons de développement et clôture les 4 audits d'ingénierie externes avec une couverture de **1 336 tests automatisés (141 suites)** et **14 scénarios E2E Playwright réels**, sans aucune régression ni avertissement de compilation.

---

### Ajouté

#### 1. Noyau BIM Paramétrique & Graphe Immuable (`@tabax/core`)
- Modèle de données immuable (`BimDocument` / `BimState`) avec validation et désérialisation typée stricte native sans dépendance externe.
- Niveaux et étages hiérarchiques avec altitudes relatives et absolues calculées au millimètre.
- Éléments architecturaux paramétriques :
  - **Murs multicouches** avec gestion des épaisseurs, jonctions d'angles nettes et calculs d'axes automatiques.
  - **Dalles & Planchers** intégrant le découpage automatique des trémies d'escaliers et gaines.
  - **Toitures inclinées** (plates et deux pans avec biseautage de murs) avec versants calculés en 3D (`ADR-053`).
  - **Menuiseries** (fenêtres, portes battantes/coulissantes) avec allèges, linteaux et perçage dynamique des réservations d'ouvertures.
  - **Escaliers paramétriques** (volées droites continues sans palier) avec calcul de girons, hauteurs de marches et trémies automatiques (`ADR-048`).
- Historique d'actions transactionnel borné à 500 entrées (`ADR-068`), avec atomicité stricte du graphe de dépendances géométrique (`DependencyGraph`) sur `undo`/`redo`.
- Moteur de détection de clash géométrique 3D BVH (`ADR-059`, `ADR-071`) filtrant nativement les faux positifs liés aux réservations d'ouvertures et trémies.

#### 2. Ingénierie MEP & Réseaux Techniques (`@tabax/core`)
- Support natif de 4 disciplines de réseaux techniques (`ADR-056`) :
  - **Plomberie** (EF/EC, évacuation EU/EV).
  - **CVC / Aéraulique** (gaines rectangulaires et circulaires).
  - **Électricité** (chemins de câbles et gaines techniques).
  - **Systèmes de coordination** transversaux.
- Architecture modulaire de commandes MEP découplée en 6 sous-modules étanches (`commands/`).
- Routage assisté avec calcul automatique des coudes, tés, réductions et piquages paramétriques (`ADR-058`).

#### 3. Cockpit Graphite Engineering & Rendu Visuel Double Viewport (`apps/web`, `@tabax/view-2d`, `@tabax/view-3d`)
- Design System exclusif **Graphite Engineering** (`ADR-061`) : interface épurée à haute densité d'information, palette graphite `#111215`, typographie monospace d'ingénierie, icônes Lucide.
- Double viewport temps réel 60 FPS synchronisé :
  - Viewport 2D vectoriel haute précision sur HTML5 Canvas (`@tabax/view-2d`).
  - Viewport 3D Three.js orbital Z-up interactif avec matériaux standards et gestion des éléments de domaine (`@tabax/view-3d`).
- Coupes 2D/3D et élévations dynamiques interactives (`ADR-063`, `ADR-069`) :
  - Visualisation en temps réel du plan de coupe avec hachures architecturales.
  - Occlusion opaque en élévation, masquage des réseaux MEP occultés et rendu détaillé des menuiseries.
  - Commande de génération automatique des 4 élévations de façades et coupes en un clic (`AutoGenerateViewsCommand`).
- Outil interactif de cotation dimensionnelle (raccourci clavier `T`) et cotations automatiques d'étage (`ADR-066`, calque `ARCH-DIMS`).
- Tableau de bord de métriques de projet et métrés quantitatifs surfaciques/volumiques instantanés.

#### 4. Interopérabilité OpenBIM IFC4 Haute Fidélité (`@tabax/core`)
- Architecture d'export IFC scindée en 11 modules étanches (`packages/core/src/ifc/`).
- Reproductibilité binaire stricte (`ifc1 === ifc2`) assurée par des GUIDs IFC déterministes (Base64 IFC 22 caractères) dérivés des identifiants d'éléments (`ADR-033`, `ADR-071`).
- Échappement STEP ISO 10303-21 certifié.
- Géométrie 3D IFC4 conforme : versants de toits inclinés, marches crénelées d'escalier, extrusion solide de profilés MEP (`IfcPipeSegment`, `IfcDuctSegment`, `IfcCableCarrierSegment`), et réservations d'ouvertures (`IfcOpeningElement` / `IfcRelVoidsElement`).
- Conformité validée par le moteur officiel WASM Web-IFC.

#### 5. CAO & Dossiers d'Exécution Vectoriels (`@tabax/view-2d`)
- Export DXF R12 1:1 sans dépendance externe (`ADR-064`), respectant la charte de calques normalisée de la profession (`ARCH-WALLS`, `ARCH-OPENINGS`, `ARCH-SLABS`, `ARCH-ROOFS`, `ARCH-STAIRS`, `ARCH-DIMS`, `MEP-*`).
- Carnet de plans vectoriel multi-pages au format PDF 1.4 normalisé ISO 32000-1 (`ADR-065`), incluant fonds de plans 2D, coupes dynamiques, élévations, échelle métrique normalisée et cartouche d'ingénierie réglementaire.
- Unification du pipeline vectoriel 2D via l'abstraction `PlanScene`.

#### 6. Résilience Industrielle, Intégrité & Sécurité d'Exploitation (`@tabax/core`, `apps/web`)
- Verrouillage multi-onglets sécurisé via la Web Locks API (`navigator.locks`) combiné à la synchronisation d'état temps réel par `BroadcastChannel` (`ADR-070`).
- Persistance locale sous IndexedDB (`tabax_autosave`) avec migration transparente sans perte depuis `mini_bim_autosave`.
- Barrière d'intégrité au chargement de projet avec rapport d'anomalies dimensionnelles non bloquant.
- Composant d'interface `<ErrorBoundary>` isolant les défaillances de rendu et préservant les données de l'utilisateur.

---

### Modifié
- Remplacement intégral de la marque *Mini-BIM* par **Tabax** à travers l'ensemble des modules, documentations, interfaces et suites de tests.
- Règle ESLint `no-restricted-imports` durcie pour interdire tout couplage non autorisé entre modules.
- Intégration continue GitHub Actions durcie avec installation stricte `pnpm install --frozen-lockfile`.

---

### Corrigé
- Élimination des faux positifs du détecteur de clash 3D sur les fenêtres, portes et trémies.
- Correction des hauteurs et calages d'élévations pour les toitures à pans coupés et versants multiples.
- Normalisation du calque DXF des cotations sur `ARCH-DIMS` (ACI 6 / Magenta).
- Rétablissement de la documentation complète d'`ADR-061` dans les spécifications d'architecture.

---

### Statistiques de Livraison (v1.0.0)
| Métrique | Valeur |
| :--- | :--- |
| **Packages Monorepo** | 5 (`geometry`, `core`, `view-2d`, `view-3d`, `web`) |
| **Suites de Tests Vitest** | 141 fichiers |
| **Tests Unitaires & Intégration** | 1 336 tests (100% passants) |
| **Tests E2E Playwright Réels** | 14 scénarios (100% passants) |
| **Erreurs TypeScript / Warnings ESLint** | 0 erreur / 0 warning |
