# ADR-052 : Dépendance Contrôlée de `@mini-bim/view-2d` vers `@mini-bim/core` pour Fonctions Pures de Dérivation (Amendement ADR-021 & ADR-029)

## Statut

**Accepté** (Chantier 3 — Complément d'Architecture — 15 novembre 2026)

## Contexte & Analyse du Problème

Historiquement, l'ADR-021 (Phase 2.1) et l'ADR-029 (Phase 3.2) stipulaient une séparation stricte des frontières :
> *« `packages/view-3d` et `packages/view-2d` ne doivent JAMAIS importer `@mini-bim/core`. »*

L'intention originelle de cette règle était d'empêcher les moteurs de rendu 2D et 3D de muter directement le modèle BIM, de s'accoupler à la machine transactionnelle Immer / CommandBus, ou d'introduire des dépendances circulaires.

Cependant, lors de l'implémentation de la Phase 6.4 (Escaliers) et du Chantier 3 (Anomalie S2-5), il est apparu que :
1. La dérivation dynamique de la trémie d'escalier (`computeStairShaft`), intégrant la hauteur d'échappée réglementaire minimale de 2000 mm (`computeHeadroomCutoffStep`) et l'épaisseur de dalle, réside dans `@mini-bim/core`.
2. Pour respecter le dogme d'isolation, `View2D.ts` avait réécrit manuellement un calcul géométrique approché de trémie. Résultat : une duplication de code et une divergence géométrique flagrante entre le plan 2D et la vue 3D (Bug S2-5).
3. Dupliquer du code algorithmique complexe dans `view-2d` viole le principe fondamental de **Source Unique de Vérité (ADR-001)**.

---

## Décision d'Architecture

### 1. D1 — Amendement Officiel des ADR-021 et ADR-029

`@mini-bim/view-2d` est officiellement autorisé à importer `@mini-bim/core` en dépendance de production (`dependencies`), **exclusivement et strictement pour les fonctions pures de dérivation géométrique et les types en lecture seule**.

### 2. D2 — Périmètre Autorisé (White-list Stricte)

Seuls les symboles suivants peuvent être importés de `@mini-bim/core` dans `packages/view-2d` :
- `computeStairShaft` : Dérivation déterministe du polygone de trémie d'escalier dans la dalle supérieure.
- `computeStairGeometry` : Calcul géométrique de foulée et de marches (formule de Blondel).
- `computeHeadroomCutoffStep` : Calcul de la marche de rupture pour l'échappée sous dalle.
- `resolveWallGeometry` : Résolution altimétrique et cotes d'ouvertures (si nécessaire en 2D).
- Interfaces de types en lecture seule (`Stair`, `Slab`, `Wall`, `BimState`).

Toutes ces fonctions sont des **fonctions pures** :
- Zéro effet de bord.
- Zéro dépendance vers le DOM, Canvas, React ou Three.js.
- Exécutables de manière identique en environnement Node.js, Web Worker ou navigateur.

### 3. D3 — Périmètre Strictement Interdit (Black-list Impérative)

Restent formellement interdits d'import dans `packages/view-2d` :
- `BimDocument` (l'instance documentaire globale).
- `CommandBus`, `Command` et toutes les classes de commandes concrètes (`AddWallCommand`, `UpdateWallCommand`, etc.).
- Les gestionnaires de mutations transactionnelles et Immer (`produceWithPatches`).
- L'historique undo / redo.
- Tout hook React ou état applicatif mutable.

Le composant `View2D` continue de respecter scrupuleusement la Règle d'Or : **il ne mute jamais le modèle BIM et émet exclusivement des intentions de mutation via des callbacks (`onCommandRequested`)**.

---

## Conséquences & Bénéfices

- **Garantie d'Isochronisme et de Parité Géométrique :** Le polygone de trémie calculé pour le plan 2D est rigoureusement identique au polygone extrudé dans la dalle 3D (validé par `T-STAIR-SHAFT-UNIFIED-01..03`).
- **Élimination de la Dette de Duplication :** Aucune formule mathématique n'est réécrite deux fois.
- **Pureté Préservée :** `@mini-bim/core` ne dépend d'aucun moteur de rendu, et `view-2d` reste un moteur Canvas 2D impératif découplé de la couche applicative.
