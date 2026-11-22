# ADR-070 : Résilience d'Exploitation — Verrou Multi-Onglets (Web Locks), Atomicité DAG sur Annulation/Rétablissement & Audit Passif au Chargement (Saison 3 - Étape 6 Volet A)

## Statut

**Accepté** (Saison 3 — Étape 6 Volet A)

## Date

22 novembre 2026

## Contexte & Problématique

Lors des audits d'architecture et de sécurité opérationnelle conduits à la fin de l'Étape 4 et consolidés en Phase C, plusieurs risques d'intégrité et de robustesse en production ont été identifiés :

1. **Concurrence multi-onglets & écrasements silencieux (Levée de la Clause V1 d'ADR-051) :**
   Dans l'implémentation initiale de l'autosave (ADR-051 §D6), la concurrence multi-onglets n'était pas gérée (*Last-Write-Wins* aveugle). Si un utilisateur ouvrait accidentellement deux onglets sur Tabax, l'édition sur le second onglet écrasait silencieusement la sauvegarde du premier dans `mini_bim_autosave`, risquant une désynchronisation ou perte irrémédiable de modifications architecturales.
2. **Rebranding et rupture potentielle de la persistance locale :**
   Le renommage de l'application en Tabax (ADR-067) imposait d'adopter un nom de base de données cohérent (`tabax_autosave`), sans pour autant faire disparaître les maquettes précédemment enregistrées par les utilisateurs dans la base historique `mini_bim_autosave`.
3. **Atomicité non stricte du DAG de dépendances sur `undo()` et `redo()` :**
   Dans `@tabax/core/src/document.ts`, les méthodes `undo()` et `redo()` exécutaient `history.undo()` ou `history.redo()` (qui mutait directement la pile d'historique) avant de mettre à jour le `DependencyGraph` sur le nouvel état. En cas d'erreur ou d'exception inattendue lors de la reconstruction ou de la validation du DAG (par exemple détection d'un cycle topologique corrompu), `this.state` ou l'historique se retrouvait dans un état partiellement muté, corrompant les invariants transactionnels.
4. **Diagnostic de conformité au chargement vs auto-réparation silencieuse :**
   La désérialisation par `BimDocument.fromJSON()` applique à juste titre un rejet strict des corruptions structurelles (Zod/JSON). Toutefois, un projet peut comporter des anomalies architecturales non bloquantes (murs trop courts $< 100\text{ mm}$, ouvertures qui se chevauchent ou débordent, escaliers ne respectant pas la loi de Blondel, pièces non closes, cotations orphelines). Modifier ou réparer silencieusement ces entités au chargement corromprait la maquette de l'utilisateur sans son consentement ; il était donc impératif de concevoir un audit passif et non destructif, alertant visuellement sans altérer l'état du document.

---

## Décisions d'Architecture

### 1. D1 — Migration Silencieuse à Sens Unique d'IndexedDB (`apps/web`)

- La constante officielle de la base de données d'autosave est définie à `AUTOSAVE_DB_NAME = 'tabax_autosave'`.
- La base historique est conservée sous `LEGACY_AUTOSAVE_DB_NAME = 'mini_bim_autosave'`.
- Lors du démarrage de l'application (`loadFromIndexedDB`) :
  1. L'application inspecte en premier lieu `tabax_autosave`.
  2. Si `tabax_autosave` ne contient aucun enregistrement (`current_project`), elle tente d'ouvrir `mini_bim_autosave`.
  3. Si un enregistrement est trouvé dans `mini_bim_autosave`, il est immédiatement migré et dupliqué dans `tabax_autosave` via `saveToIndexedDB()`.
  4. L'application travaille dès lors exclusivement sur `tabax_autosave`. Aucune donnée existante n'est perdue lors de la transition.

### 2. D2 — Orchestration Concurrente Multi-Onglets (`Web Locks API` & `BroadcastChannel`)

Pour éliminer définitivement le risque de collision entre onglets sans bloquer la navigation :
- **Acquisition de verrou exclusif non-bloquant (`WebLockCoordinator`) :**
  Au montage, le composant `<App />` (via `useBimPersistence`) tente d'acquérir le verrou exclusif `tabax-project-lock` via `navigator.locks.request('tabax-project-lock', { ifAvailable: true }, ...)`.
  - Si le verrou est obtenu, l'onglet courant devient l'onglet maître (**onglet actif**).
  - Si le verrou n'est pas disponible (ou si `!lock`), l'onglet est identifié comme **onglet secondaire / passif**.
- **Suspension de l'autosave sur l'onglet passif :**
  L'instance `AutoSaveManager` de l'onglet secondaire reçoit immédiatement `setDisabled(true)`. Toute écriture automatique périodique ou sur déchargement (`beforeunload`) est bloquée.
- **Bannière d'alerte non intrusive (`multi-tab-warning-banner`) :**
  L'onglet passif affiche un bandeau ambré en haut de l'écran :
  *"Un autre onglet de Tabax est actuellement actif sur ce projet. La sauvegarde automatique est suspendue dans cet onglet pour éviter les conflits."*
- **Synchronisation inter-onglets & actualisation :**
  Chaque sauvegarde réussie dans l'onglet maître diffuse un message sur `BroadcastChannel('tabax-sync')` avec le `timestamp` et le `schemaVersion`.
  L'onglet passif détecte cette notification et propose un bouton interactif `[Recharger la dernière version]` (`data-testid="reload-latest-btn"`), qui réinjecte sans rechargement de page brut l'état sauvegardé par l'onglet maître.
- **Libération déterministe du verrou :**
  Le verrou est maintenu tant que l'onglet reste ouvert et est libéré explicitement lors du démontage du hook (`releaseLock()`) ou de la fermeture du navigateur.
- **Repli gracieux :**
  Si l'environnement d'exécution ne supporte pas `navigator.locks` (ex. contextes headless, Node.js ou navigateurs anciens), `WebLockCoordinator` acquiert le verrou par défaut afin de ne jamais bloquer l'édition locale mono-poste.

### 3. D3 — Atomicité Stricte du DAG sur Annulation et Rétablissement (`undo()` / `redo()`)

Pour garantir l'intégrité absolue de `BimDocument` en présence d'exceptions inattendues dans le graphe de dépendances :
- `HistoryStack` est enrichi des méthodes de pré-visualisation et de validation :
  - `peekUndo(): StatePatch | undefined`
  - `commitUndo(): void`
  - `peekRedo(): StatePatch | undefined`
  - `commitRedo(): void`
- **Pattern transactionnel en 3 temps dans `BimDocument` :**
  1. **Phase 1 — Calcul de l'état cible candidat :** Récupération du patch via `peekUndo()` / `peekRedo()` et calcul de `nextState = applyPatches(this.state, patch.patches)`. Aucune mutation de l'état `this.state` n'a lieu à cette étape.
  2. **Phase 2 — Synchronisation & Validation DAG sur clone :** Le graphe de dépendances est cloné (`this._dag.clone()`) et synchronisé sur `nextState`. Si `nextDag.hasCycle()` détecte une boucle topologique ou si une exception survient, une erreur est levée. `this.state`, `this._dag`, et les compteurs `canUndo()` / `canRedo()` restent strictement **inchangés par référence (`toBe`)**.
  3. **Phase 3 — Commit Atomique :** La transaction est validée en appliquant simultanément `this.state = nextState`, `this._dag = nextDag`, et `this.history.commitUndo()` / `this.history.commitRedo()`, suivi de la notification des abonnés `this.notify()`.

### 4. D4 — Diagnostic Passif au Chargement (`auditDocumentState`)

- Rejet strict des auto-réparations silencieuses : aucune modification n'est injectée subrepticement dans le JSON de l'utilisateur au chargement.
- Introduction d'une fonction d'audit pure `@tabax/core/src/rules/audit.ts` : `auditDocumentState(state: BimState): readonly RuleViolation[]`.
- Contrôles passifs effectués :
  - `WALL_TOO_SHORT` : Murs d'une longueur $< 100\text{ mm}$.
  - `OPENING_OUT_OF_BOUNDS` : Portes ou fenêtres dépassant des extrémités du mur hôte.
  - `OPENING_OVERLAP` : Portes ou fenêtres se chevauchant mutuellement sur un même mur.
  - `STAIR_BLONDEL_VIOLATION` : Escaliers dont l'échappée ou la formule de Blondel ($2h + g \in [580, 660]\text{ mm}$) est non conforme.
  - `ROOM_UNENCLOSED` : Pièces dont le contour polygonal n'est pas étanche ou de surface nulle.
  - `DIMENSION_ORPHAN_REFERENCE` : Cotations associatives pointant vers un identifiant de mur inexistant.
- Exposition de `doc.getValidationIssues()` sur l'instance du document.
- Affichage non-bloquant dans la barre d'état (`StatusBar.tsx`) via l'indicateur d'anomalies `status-issues-indicator` affichant par exemple `⚠ 2 avertissements` avec infobulle descriptive, sans interrompre la session utilisateur.

---

## Conséquences & Bénéfices

- **Zéro perte de données en multi-onglets :** L'autosave du premier onglet actif est sanctuarisé ; l'utilisateur est guidé visuellement sans blocage ni corruption.
- **Compatibilité ascendante transparente :** Les projets stockés dans `mini_bim_autosave` sont migrés automatiquement sans intervention manuelle.
- **Résilience transactionnelle absolue :** Aucune exception de synchronisation DAG lors d'un `undo()` ou `redo()` ne peut laisser le document dans un état incohérent ou partiellement muté.
- **Transparence d'ingénierie :** Les incohérences de dessin sont signalées à l'utilisateur de manière passive sans modification non sollicitée de ses cotes et tracés.

---

## Qualification & Métriques

- **Couverture de tests unitaires et d'intégration :**
  - `@tabax/geometry` : 20 fichiers de test, 228 / 228 tests passés.
  - `@tabax/core` : 52 fichiers de test, 553 / 553 tests passés (dont 2 tests d'injection de panne transactionnelle `document.test.ts` et 8 tests d'audit passif `audit.test.ts`).
  - `@tabax/view-3d` : 9 fichiers de test, 94 / 94 tests passés.
  - `@tabax/view-2d` : 19 fichiers de test, 155 / 155 tests passés.
  - `@tabax/web` : 41 fichiers de test, 300 / 300 tests passés (dont tests de migration `mini_bim_autosave`, suspension d'écriture et `WebLockCoordinator`).
  - **Total unitaire/intégration :** **141 fichiers de test**, **1 330 / 1 330 tests passés**.
- **Tests End-to-End Playwright (Chromium réel) :**
  - **14 / 14 scénarios E2E passés**, incluant le test 13 (persistance et restauration automatique IndexedDB après `page.reload()`) et le test 14 (garde-fou multi-onglets Web Locks `context.newPage()` et suspension de sauvegarde).
- **TypeScript & ESLint :** 0 erreur TypeScript (`pnpm typecheck`), 0 warning ESLint (`pnpm lint`).
