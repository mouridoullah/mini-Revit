# ADR-073 : Copilote BIM Agentique, Bac à Sable Transactionnel (`BimDocument.runTransaction`) & Inférence Hybride Sans Backend (Tabax v1.2.0)

## Contexte

L'architecture actuelle de **Tabax** (`v1.1.0`) repose sur un modèle sémantique unifié (`BimState` schéma v2, unités strictes en millimètres `ADR-003`), un bus de commandes transactionnelles réversibles (`CommandBus` + patchs différentiels Immer), une validation différentielle atomique (`validateDirty`) renvoyant des `BimValidationError` avec `offendingIds`, et un graphe de dépendances incrémental (`DependencyGraph`).

Cette séparation stricte entre sémantique métier (`@tabax/core`) et caches géométriques dérivés (`@tabax/geometry`, `@tabax/view-2d`, `@tabax/view-3d`) permet d'intégrer une couche d'assistance par LLM sans jamais exposer ni faire manipuler de triangles, de maillages 3D ou de JSON complets de maquette au modèle de langage : l'agent orchestre exclusivement des **outils typés** mappés sur des commandes déterministes dans une boucle fermée auto-correctrice.

Toutefois, cette intégration doit respecter les invariants fondamentaux du monorepo :
1. **Étanchéité des packages (`ADR-023`, `purity.test.ts`) :** Zéro dépendance IA dans `@tabax/core`, `@tabax/geometry`, `@tabax/view-2d` et `@tabax/view-3d`.
2. **Déploiement statique *Local-First* sans backend obligatoire :** Compatibilité intégrale avec l'hébergement statique GitHub Pages (`deploy-pages.yml`) et utilisation hors-ligne sur poste local équipé d'un GPU (ex. Ollama).
3. **Zéro auto-réparation silencieuse (`ADR-070`) :** Aucune mutation de la maquette active en arrière-plan ; toute modification proposée par l'IA exige une inspection explicite par l'utilisateur, un garde-fou contre la dérive d'état et une réversibilité en un seul `Ctrl+Z`.
4. **Maîtrise des budgets mémoire et contexte :** Les projets denses (ex. `demo-immeuble-r4.json`, ~1,31 Mo) ne doivent jamais être injectés en bloc dans un prompt, en particulier pour les modèles locaux 8B–14B.
5. **Plafond architectural de `Scene3D.ts` (`ADR-072`) :** Ne pas alourdir `Scene3D.ts` (774 lignes, plafond strict à 800 lignes).

---

## Décisions Architecturales

### 1. D1 — Package Isolé `@tabax/ai` et Pureté Architecturale
- Création d'un package dédié `packages/ai` (`@tabax/ai`) en TypeScript strict :
  - **Dépendance interne unique autorisée :** `@tabax/core`.
  - **Dépendances externes :** Zéro SDK fournisseur lourd ; utilisation exclusive de `fetch` standard (injectable pour les tests unitaires déterministes sans réseau).
  - **Interdictions strictes :** Zéro import de `react`, `react-dom`, `three`, `@tabax/geometry`, `window` ou `document`.
- Verrouillage immédiat de cette frontière dans `packages/core/src/purity.test.ts` et dans `eslint.config.mjs`.

---

### 2. D2 — Mécanisme Transactionnel Groupé : `BimDocument.runTransaction` (Arbitrage Option A)

#### Pourquoi `runTransaction` plutôt qu'une `CompositeCommand` sur un seul draft Immer
L'inspection de `@tabax/core` montre que `MoveWallCommand.apply(draft)` (`packages/core/src/commands/walls.ts`) dé-proxifie explicitement le brouillon Immer via `original(draft)` avant d'appeler `getOrBuildWallResolutionIndex(baseState)` (`LazyWallResolutionIndex`, `ADR-062`). Dans une `CompositeCommand` qui enchaînerait plusieurs mutations sur un unique *draft* Immer (ex. créer un mur puis le déplacer ou y poser une porte puis lancer l'auto-cotation), les sous-commandes suivantes ne verraient pas les entités créées ou modifiées par la sous-commande précédente via `original(draft)`.

#### Contrat de `BimDocument.runTransaction(label, fn)`
Une méthode transactionnelle de premier niveau est ajoutée à `BimDocument` (`packages/core/src/document.ts`) :
1. **Sauvegarde de point de reprise :** Mémorisation atomique de `{ stateBefore: this.state, dagBefore: this._dag, historyCountBefore }`.
2. **Exécution séquentielle sur états commis :** À l'intérieur de `fn`, chaque appel à `execute(cmd)` produit un état Immer commis (`nextState`), met à jour le graphe de dépendances incrémental, vérifie l'absence de cycle et exécute `validateDirty(nextState, changed, prevState)`. La commande suivante lit ainsi un état commis cohérent avec `LazyWallResolutionIndex`.
3. **Notifications différées :** Pendant la transaction, `notifySubscribers()` est suspendu afin d'éviter des rendus 2D/3D ou écritures IndexedDB (`tabax_autosave`) intermédiaires.
4. **Fusion d'historique en 1 seule entrée (`ADR-068` & `ADR-070`) :**
   - En cas de succès sur $N$ sous-commandes produisant $(p_1, inv_1) \dots (p_N, inv_N)$, une **unique `HistoryEntry`** est enregistrée dans `HistoryStack` (ne consommant qu'**1 seule entrée** sur le plafond de 500 entrées d'`ADR-068`) :
     - `patches` : concaténation en ordre direct $[p_1, \dots, p_N]$ ;
     - `inversePatches` : concaténation impérative en **ordre inverse** $[inv_N, \dots, inv_1]$ afin que `undo()` annule la mutation $N$ avant la $N-1$ ;
     - `changed` : union dédupliquée des identifiants modifiés sur l'ensemble de la transaction.
   - Une seule notification `notifySubscribers(unionChanged)` est émise à la fin du commit.
5. **Rollback atomique :** Si une sous-commande quelconque lève `BimValidationError` (ou toute autre erreur), `state`, `_dag` et `history` sont restaurés intégralement à leur état d'avant transaction, aucune notification n'est émise et l'exception est propagée.
6. **Critères d'acceptation Undo/Redo & cas limites (`ADR-070` D3) :**
   - Le `undo()` et le `redo()` d'une transaction multi-commandes (ex. création d'un mur + ajout d'une porte + `AutoDimensionLevelCommand`) doivent passer intégralement la validation DAG sur clone (`hasCycle()` négatif) et restituer l'état bit-à-bit équivalent.
   - Cas limite **création puis suppression d'un même élément `X` au sein d'une transaction unique** : `X` figure dans `changed` sans exister ni dans `beforeState` ni dans `afterState` ; `DependencyGraph.updateElements` et `undo()`/`redo()` doivent traiter ce cas proprement sans créer d'arête orpheline ni lever d'exception (couvert par test unitaire dédié).
7. **Clonage instantané de bac à sable (`BimDocument.cloneForSandbox`) :** Exposition d'une méthode légère `doc.cloneForSandbox()` instanciant un `BimDocument` isolé par partage structurel direct de l'état immuable `this.state` et clonage Copy-On-Write de `this._dag` (< 1 ms), sans jamais passer par `toJSON()` / `fromJSON()` (critique sur `demo-immeuble-r4.json`, ~1,31 Mo).

---

### 3. D3 — Extracteur de Contexte Compact & Catalogue d'Outils Typés (`v1.2.0` : 17 outils)

#### A. Extraction de contexte sémantique (`buildBimContext`)
- Le JSON complet du document n'est jamais sérialisé dans le prompt.
- Le contexte initial injecte uniquement : les métadonnées projet, la table compacte des niveaux (`getSortedLevels`), la sélection active (`selectedIds`), le niveau courant (`activeLevelId`), la table compacte des catalogues d'IDs/noms disponibles (`wallTypes`, `doorTypes`, `windowTypes`, `componentTypes`) et un résumé quantitatif issu de `metrics.ts`.

#### B. Outils Phase 1 — Lecture seule & Audit (5 outils, risque nul, hors `runTransaction`)
1. `get_project_summary()` : Niveaux, métriques globales (`metrics.ts`), résumé topologique MEP (`MepNetworkGraph`) et catalogues de types.
2. `get_level_details({ levelId, categories?, compact? })` : Liste les entités d'un niveau donné (murs, ouvertures, dalles, composants, pièces détectées `detectRooms`). Le filtre optionnel `categories?: readonly ('walls' | 'openings' | 'slabs' | 'components' | 'rooms')[]` et la projection compacte permettent d'inspecter des étages denses (ex. `demo-immeuble-r4.json`) sans saturer la fenêtre de contexte d'un modèle local. Pour éviter les erreurs de calcul mental des LLMs locaux, chaque mur retourné inclut pré-calculés : `lengthMm`, `orientation` (`E-O` / `N-S` ou angle en degrés) et `occupiedIntervalsMm` (plages `[offsetAlong, offsetAlong + width]` des portes/fenêtres déjà hébergées).
3. `get_element_by_id({ elementId })` : Fiche détaillée d'une entité et de ses dépendants directs via `doc.getDependencyGraph()`.
4. `audit_model({ levelId? })` : Exécute `auditDocumentState(state)` et retourne les `RuleViolation` actives filtrées optionnellement par niveau.
5. `get_clashes_summary({ severity?, limit? })` : Exécute `ClashEngine` et retourne une synthèse bornée des conflits actifs (IDs impliqués, sévérité, pénétration en mm).

#### C. Outils Phase 2 — Commandes de Modélisation (12 outils sous Sandbox $\to$ `runTransaction`)

**Invariants de schéma et de validation :**
- **Schémas JSON 100 % plats (compatibilité Gemini REST & Ollama) :** Aucun type union `["number", "null"]` ni `anyOf` sur les paramètres scalaires afin de rester strictement compatible avec `functionDeclarations` de l'API REST Gemini et les parseurs des modèles locaux 8B–14B.
- **Unités strictes (`ADR-003`) :** Tous les paramètres dimensionnels et spatiaux portent explicitement le suffixe `Mm` (millimètres) ou `Deg` (degrés), et sont validés côté TypeScript (`Number.isFinite`, bornes géométriques valides, rejet des `NaN`) avant toute instanciation de commande.
- **Chaînage par ULIDs figés :** Chaque outil appelé en sandbox exécute immédiatement la commande sur le clone en mémoire en utilisant un ULID généré via `generateId()`, retourne cet ID au LLM pour les appels suivants, et fige exactement cet ULID dans le plan validé qui sera rejoué dans `runTransaction`.

| # | Outil LLM | Contrat de paramètres | Commande `@tabax/core` & mapping exact |
| :- | :--- | :--- | :--- |
| 1 | `add_wall` | `levelId, startXMm, startYMm, endXMm, endYMm, typeId?` | `AddWallCommand` (ULID généré et retourné) |
| 2 | `move_wall` | `wallId, deltaXMm, deltaYMm, stretchNeighbors?, propagateChain?` | `MoveWallCommand` |
| 3 | `update_wall` | `wallId, typeId?, heightMm?, resetHeightToAuto?, startXMm?, startYMm?, endXMm?, endYMm?` | `UpdateWallCommand` — schéma plat : `heightMm` (nombre) mappe vers `patch.heightOverride = heightMm` ; `resetHeightToAuto: true` mappe explicitement vers `patch.heightOverride = undefined` afin de rétablir le calcul de hauteur automatique (`topConstraint` / `wallType.height`, `ADR-040` / `ADR-045`) |
| 4 | `delete_wall` | `wallId` | `DeleteWallCommand` (cascade `RELATIONS_REGISTRY`) |
| 5 | `add_door` | `hostWallId, offsetAlongMm, doorTypeId?, swingSide?, swingDirection?` | `AddDoorCommand` (ULID généré et retourné) |
| 6 | `add_window` | `hostWallId, offsetAlongMm, windowTypeId?, sillHeightMm?` | `AddWindowCommand` (ULID généré et retourné) |
| 7 | `move_opening` | `openingId, newOffsetAlongMm?, deltaOffsetMm?` | `MoveOpeningCommand(openingId, resolvedOffsetAlong)` — mode exclusif (exactement un des deux paramètres requis). Si `newOffsetAlongMm` est fourni, il est transmis directement ; si `deltaOffsetMm` est fourni, l'adaptateur résout `current.offsetAlong + deltaOffsetMm` depuis le clone courant |
| 8 | `delete_opening` | `openingId` | `DeleteOpeningCommand` |
| 9 | `add_component` | `levelId, typeId, xMm, yMm, rotationDeg?, hostWallId?` | `AddComponentCommand` — expose `rotationDeg` (en degrés) pour fiabiliser les modèles locaux 8B–14B, avec conversion déterministe `(rotationDeg ?? 0) * Math.PI / 180` vers `placement.rotation` |
| 10 | `add_room` | `levelId, name, seedXMm, seedYMm` | `AddRoomCommand` |
| 11 | `auto_dimension_level` | `levelId` | `AutoDimensionLevelCommand` *(ré-exporté à la racine de `@tabax/core` en complément de `Commands`)* |
| 12 | `auto_generate_views` | *(aucun)* | `AutoGenerateViewsCommand` |

*(Les outils `AddSlab`, `AddStair`, `AddRoof` et routage MEP restent hors périmètre `v1.2.0` et seront introduits dans les phases ultérieures.)*

---

### 4. D4 — Bac à Sable Transactionnel (`DryRunExecutor`), Auto-Correction & *Stale Plan Guard*
- **Boucle fermée en bac à sable :** L'agent obtient un clone léger via `doc.cloneForSandbox()` (partage structurel < 1 ms, sans `toJSON`/`fromJSON`). Chaque outil de mutation s'exécute immédiatement sur ce clone :
  - En cas de `BimValidationError` (ex. `OPENING_OVERLAP`, `WALL_STRETCH_COLLAPSE`, `INVALID_OPENING_HEIGHT`), l'erreur structurée (`code`, `message`, `offendingIds`) est renvoyée au LLM comme résultat d'outil en erreur afin qu'il ajuste sa proposition.
  - En cas d'identifiant inconnu (`levelId`, `typeId`, `wallId` inexistant), l'adaptateur d'outils enrichit systématiquement le `tool_result` d'erreur avec la liste des identifiants valides disponibles pour accélérer la convergence sur modèles compacts.
- **Bornes d'orchestration obligatoires :**
  - `MAX_TOOL_STEPS = 8` appels d'outils par requête utilisateur.
  - `MAX_SELF_CORRECTION_RETRIES = 3` tentatives d'auto-correction sur erreur de validation.
  - Propagation systématique d'un `AbortSignal` dans l'orchestrateur et les appels `fetch`, relié à un bouton **Arrêter** dans l'interface.
- **Garde-fou de dérive d'état & remplacement de document (*Stale Plan Guard*, `ADR-027` / `ADR-070`) :**
  - Chaque plan validé mémorise la référence d'instance `baseDoc` et la référence immuable `baseState = doc.getState()` initiale.
  - En cas de changement d'instance `doc` (import JSON ou rechargement multi-onglets Web Locks), le hook `useAiCopilot` invalide immédiatement le plan en attente.
  - Au clic sur **Appliquer**, si `doc.getState() !== plan.baseState` sur la même instance `doc`, l'application directe est bloquée et remplacée par un bouton **Revalider sur l'état actuel** qui rejoue uniquement le plan déterministe dans un clone frais (< 10 ms, sans nouvel appel LLM).

---

### 5. D5 — Fournisseurs Hybrides Sans Backend & Sécurité Navigateur
- **Interface `LlmProvider` neutre** implémentée par deux adaptateurs `fetch` natifs :
  1. `OpenAiCompatibleProvider` : compatible endpoint local Ollama (`http://localhost:11434/v1`), LM Studio, vLLM, ou API OpenAI BYOK, avec nom de modèle éditable (presets configurables). L'adaptateur normalise `tool_call.function.arguments` qu'il soit reçu en `string` JSON ou déjà parsé en `object`.
  2. `GeminiProvider` : compatible API REST Google AI Studio (clé BYOK, champ de modèle configurable).
- **Diagnostic CORS, Mixed Content et connectivité :** Le panneau de configuration propose un bouton **Tester la connexion** distinguant explicitement : serveur local injoignable, blocage CORS (`OLLAMA_ORIGINS` requis depuis l'origine `https://` de GitHub Pages), blocage navigateur *Mixed Content* HTTPS $\to$ HTTP (ex. Firefox/Safari, en rappelant l'usage de `pnpm dev` en local ou d'un reverse proxy HTTPS local), et erreur d'authentification/modèle.
- **Hygiène des clés BYOK :** Stockage en `sessionStorage` par défaut (purgé à la fermeture de l'onglet), avec option explicite non cochée par défaut *« Mémoriser sur cet appareil (`localStorage`) »*. Aucune clé API ne doit jamais être écrite dans `BimState`, les exports JSON/IFC ou `tabax_autosave` (IndexedDB).

---

### 6. D6 — Intégration UI Non Intrusive & Préservation de l'Architecture Web
- **Extraction dans un hook dédié (`apps/web/src/hooks/useAiCopilot.ts`) :** Sur le modèle de `useClashCoordination.ts` et `useFederatedIfc.ts`, toute la logique d'état, d'orchestration `AbortController`, de stockage BYOK et d'invalidation (`Stale Plan Guard` / changement de document) vit dans `useAiCopilot.ts` afin de ne pas alourdir `App.tsx` (actuellement 760 lignes).
- **Onglet dédié `Assistant IA` dans `RightDockPanel` :**
  - Affiche le contexte injecté actif (`activeLevelId`, nombre d'éléments sélectionnés dans `selectedIds`).
  - Présente les propositions de modification sous forme de **carte d'actions structurée** (comptage et détail lisible des opérations validées en sandbox), accompagnée du surlignage 2D/3D des éléments existants ciblés via le mécanisme de sélection déjà existant, d'un bouton **Appliquer** (1 seule transaction `doc.runTransaction`) et d'un accès immédiat à **Annuler (`Ctrl+Z`)**.
- **Protection de `Scene3D.ts` (`ADR-072`) :** Aucun pipeline de maillage fantôme n'est injecté dans `Scene3D.ts` en `v1.2.0` (maintien strict sous le plafond de 800 lignes). Un éventuel aperçu volumique 3D des nouveaux éléments pourra être ajouté ultérieurement dans un gestionnaire dédié `packages/view-3d/src/rendering/AiPreviewManager.ts`.
- **Qualification CI E2E sans réseau :** Les tests Playwright (`apps/web/e2e/smoke.spec.ts`) intercepteront les appels LLM via `page.route()` pour valider de bout en bout le parcours déterministe (prompt $\to$ dry-run $\to$ auto-correction $\to$ carte d'action $\to$ application $\to$ `Ctrl+Z`) sans clé API ni Ollama en CI.

---

## Statut
**Proposé** — Spécification d'architecture verrouillée pour `Tabax v1.2.0` (phase étude, avant implémentation).

## Conséquences
- Réutilisation intégrale du moteur déterministe `@tabax/core` (`validateDirty`, `LazyWallResolutionIndex`, `DependencyGraph`, `ClashEngine`) comme oracle de vérité de l'agent.
- Sécurité opérationnelle totale : aucune corruption silencieuse possible, tolérance aux modifications concurrentes (*Stale Plan Guard*) et annulation atomique en un seul `Ctrl+Z`.
- Double mode d'exploitation prêt dès la conception : confidentialité hors-ligne totale sur GPU local (Ollama) ou déploiement immédiat sans infrastructure serveur via BYOK Cloud.
- Maintien strict de la pureté du monorepo (`@tabax/core`, `@tabax/geometry`, `@tabax/view-2d`, `@tabax/view-3d` intacts hormis l'ajout ciblé de `BimDocument.runTransaction`, `BimDocument.cloneForSandbox`, `HistoryEntry.label?` et le ré-export racine de `AutoDimensionLevelCommand`).
