# ADR-071 : Fidélité IFC4 Exacte (Toitures Inclinées, Escaliers Crénelés & MEP Natif), Déterminisme Absolu des GUIDs & Précision Métier du Moteur de Clash (Saison 3 - Étape 6 Volet B)

## Statut

**Accepté** (Saison 3 — Étape 6 Volet B)

## Date

22 novembre 2026

## Contexte & Problématique

La qualification industrielle de Tabax face aux suites BIM tierces (Revit, ArchiCAD, Solibri, BlenderBIM) et l'audit d'interopérabilité OpenBIM ont mis en lumière quatre exigences structurelles pour le moteur d'export IFC4 et la détection de conflits :

1. **Monolithisme du générateur IFC et non-déterminisme des GUIDs :**
   Le fichier `packages/core/src/ifc/generator.ts` dépassait 1 110 lignes et concentrait la sérialisation de toutes les entités du projet. De plus, la génération de GUIDs IFC (`packages/core/src/ifc/guid.ts`) recourait ponctuellement à `Math.random()`, rompant le déterminisme d'export : deux exports successifs d'un même projet produisaient des fichiers STEP différents au niveau des `GlobalId`, empêchant le versionnage propre en GED et le différentiel IFC fiable.
2. **Conformité stricte à la syntaxe STEP ISO 10303-21 :**
   Les chaînes de caractères contenant des accents ou caractères hors ASCII 32-126 nécessitent un encodage normalisé `\X2\...\X0\` (format double-octet hexadécimal) et le doublement systématique des apostrophes (`''`) pour être parsées fidèlement par les moteurs certifiés tels que `web-ifc` (C++/WASM).
3. **Approximations géométriques des toitures et escaliers :**
   - Les toitures 2 pans étaient initialement simplifiées sous forme de volumes horizontaux, sans pente réelle en $Z$.
   - Les volées d'escalier étaient modélisées sous forme de boîtes englobantes sans marches ni contremarches, et les trémies dérivées d'escaliers (`computeStairShaft`) n'étaient pas répercutées dans les réservations de dalles supérieures (`IfcArbitraryProfileDefWithVoids`).
4. **Absence d'export natif des réseaux techniques MEP en IFC4 :**
   Les réseaux techniques modélisés dans Tabax (tuyaux hydrauliques, gaines aérauliques, chemins de câbles, raccords, équipements et sous-systèmes fluides) n'étaient pas traduits dans les entités spécialisées IFC4 (`IfcPipeSegment`, `IfcDuctSegment`, `IfcCableCarrierSegment`, `IfcDistributionSystem`).
5. **Faux positifs géométriques dans le moteur de Clash Detection :**
   Le moteur de collision testait les murs sous forme d'un unique parallélépipède (OBB plein). Ainsi, un tuyau ou une gaine passant légitimement à travers une baie de porte ou de fenêtre ouverte déclenchait un faux positif de collision dure (`HARD_CLASH`), polluant le rapport de synthèse de clash. De même, les conduits verticaux traversant les trémies et réservations de dalles n'étaient pas exemptés de conflit.

---

## Décisions d'Architecture

### 1. D1 — Découpage Modulaire du Générateur IFC (`packages/core/src/ifc/`)

Le monolithe `generator.ts` est scindé en sous-modules étanches et spécialisés sous `packages/core/src/ifc/`, orchestrés par `generator.ts` et ré-exportés via `index.ts` :
- `types.ts` : Interfaces de configuration (`IfcExportOptions`, `StoreyInfo`, `IfcContext`).
- `step-writer.ts` : Gestionnaire de flux STEP ISO 10303-21 (`StepWriter`) et fonction pure d'échappement normalisé (`escapeStepString`).
- `guid.ts` : Génération déterministe d'identifiants uniques IFC 128-bit / Base64 22 caractères sans aucun aléa.
- `walls.ts` : Export des murs droits, biaises et pignons biseautés (`IfcWall`, `IfcExtrudedAreaSolid`, profils 2D).
- `openings.ts` : Réservations (`IfcOpeningElement`), portes (`IfcDoor`), fenêtres (`IfcWindow`), relations de percement (`IfcRelVoidsElement`) et remplissage (`IfcRelFillsElement`).
- `slabs.ts` : Dalles horizontales (`IfcSlab`), réservations manuelles et trémies dérivées d'escaliers (`IfcArbitraryProfileDefWithVoids`).
- `roofs.ts` : Toitures inclinées (`IfcRoof`, `IfcSlab.ROOF.`, `IfcAxis2Placement3D` orienté selon la normale $N$).
- `stairs.ts` : Escaliers droits (`IfcStair`, `IfcStairFlight`, profil crémaillère marches/girons/paillasse).
- `mep.ts` : Réseaux techniques complets (`IfcPipeSegment`, `IfcDuctSegment`, `IfcCableCarrierSegment`, raccords, équipements et `IfcDistributionSystem`).
- `spaces.ts` : Pièces architecturales closes (`IfcSpace`, quantités de surface et volume utiles nettes).
- `components.ts` : Mobilier et composants sanitaires/techniques (`IfcFurniture`, `IfcSanitaryTerminal`).

### 2. D2 — Déterminisme Absolu des GUIDs & Échappement STEP ISO 10303-21

- **Suppression intégrale de `Math.random()` :**
  Tous les `GlobalId` IFC sont dérivés de manière 100% déterministe par hachage 128 bits stable (FNV/Murmur) à partir de l'`ElementId` natif et de son rôle fonctionnel (ex: `wall:${wall.id}`, `roof-slab:${roof.id}:${slopeIndex}`).
  En cas d'élément anonyme ou non identifié, une séquence de repli déterministe indexée garantit qu'aucune variation binaire n'intervient entre deux exports successifs. Deux exports du même état BIM produisent des fichiers IFC strictement identiques bit-à-bit (`ifc1 === ifc2`).
- **Échappement STEP normalisé :**
  La fonction `escapeStepString` préserve les caractères ASCII 32-126 (sauf `'` doublé en `''` et `\` doublé en `\\`), et encode les caractères non-ASCII (accents, cédilles, caractères spéciaux) en blocs hexadécimaux ISO 10303-21 `\X2\...\X0\` (ex: `é` $\to$ `\X2\00E9\X0\`).

### 3. D3 — Géométries IFC4 Exactes (Toitures Inclinées, Escaliers Crénelés & Trémies)

- **Toitures inclinées à pans (`IfcRoof` + `IfcSlab.ROOF.`) :**
  Pour chaque versant calculé par `computeRoofSlopes`, l'export génère un repère local 3D `IfcAxis2Placement3D` avec normale $N = (n_x, n_y, n_z)$ (où $n_z = \cos(\text{pente}) < 1$) et vecteur horizontal de faîtage $U = (u_x, u_y, 0)$. Le contour 2D du versant est projeté dans ce plan local et extrudé orthogonalement sur l'épaisseur constructive `thickness` le long de $N$.
- **Escaliers crénelés paramétriques (`IfcStair` + `IfcStairFlight`) :**
  Chaque volée droite est exportée avec son profil longitudinal réel en crémaillère $(u, z)$ (`IfcArbitraryClosedProfileDef`) intégrant les contremarches verticales $h$, les girons horizontaux $g$ et la paillasse inclinée en sous-face, extrudé transversalement sur la largeur nominale $W$. Les attributs normalisés `NumberOfRiser`, `NumberOfTreads`, `RiserHeight`, `TreadLength` sont renseignés directement sur `IFCSTAIRFLIGHT`.
- **Trémies de dalles intégrées :**
  Lorsqu'un escalier arrive sur une dalle d'étage, l'emprise de trémie calculée par `computeStairShaft` est automatiquement injectée dans `IfcArbitraryProfileDefWithVoids` pour découper le vide de passage sans requérir d'action manuelle de l'utilisateur.

### 4. D4 — Export MEP Natif IFC4 (`packages/core/src/ifc/mep.ts`)

- `Pipe` $\to$ `IfcPipeSegment` (`.RIGIDSEGMENT.`) avec section circulaire `IfcCircleProfileDef` extrudée le long de l'axe directeur 3D.
- `Duct` $\to$ `IfcDuctSegment` (`.RIGIDSEGMENT.`) avec section rectangulaire `IfcRectangleProfileDef` ou circulaire selon `shape`.
- `CableTray` $\to$ `IfcCableCarrierSegment` (`.CABLETRAYSEGMENT.`) avec profil rectangulaire extrudé le long de la travée.
- `MepFitting` $\to$ `IfcPipeFitting`, `IfcDuctFitting` ou `IfcCableCarrierFitting` selon le domaine technique.
- `MepEquipment` $\to$ `IfcDistributionFlowElement` avec volume d'encombrement orienté selon la rotation d'instance.
- `MepSystem` $\to$ `IfcDistributionSystem` regroupant tous les composants et tronçons du réseau via `IfcRelAssignsToGroup`.

### 5. D5 — Zéro Faux Positif dans le Moteur de Clash (`packages/core/src/clash/`)

- **Découpage des murs percés en morceaux solides réels (`sliceWallWithOpenings`) :**
  Dans `createWallPrimitives`, un mur hébergeant des portes ou des fenêtres est partitionné en solides OBB effectifs (trumeaux latéraux, linteau supérieur, allège inférieure). Le vide de la baie ne génère aucun OBB : un conduit MEP passant au travers d'une baie ouverte traverse un espace vide et ne déclenche aucun contact géométrique avec le mur hôte (0 faux positif).
  Si le conduit est déplacé dans le linteau ou les trumeaux, le test SAT 3D détecte immédiatement l'interpénétration et émet un `HARD_CLASH`.
- **Traversée des réservations et trémies de dalles :**
  La fonction sémantique `isMepPassingThroughSlabVoid` vérifie si un conduit traversant l'épaisseur altimétrique d'une dalle passe à l'intérieur d'une réservation manuelle (`slab.holes`), d'une trémie géométrique (`slab.openings`) ou d'une trémie dérivée d'escalier (`computeStairShaft`). Si tel est le cas, le contact est qualifié d'exclu / légitime (`LEGITIMATE_CONTACT`). Dans le cas contraire, une collision solide `HARD_CLASH` est consignée.
- **Indexation spatiale BVH robuste :**
  Chaque fragment d'élément (tranche de mur, pan de toiture) se voit attribuer un identifiant unique canonique dans le BVH (`${elem.id}#${idx}`), évitant tout écrasement dans les structures de partition spatiale, avec déduplication finale et conservation de la pénétration maximale par paire d'éléments.

---

## Conséquences & Validation Métrologique

- **Tests unitaires et d'intégration :**
  - `@tabax/core` passe à **52 fichiers de tests** et **559 tests unitaires** (+1 fichier et +17 tests réels).
  - Monorepo global : **1 336 / 1 336 tests Vitest passés avec succès** sur 141 fichiers de test.
- **Tests d'intégration WebIFC (C++/WASM) :**
  - Villa Complexe : toitures avec normale inclinée ($n_z < 1$) et variation en $Z$ vérifiées, volée crénelée avec 16 contremarches validée, trémies de dalle confirmées.
  - Immeuble R+4 : 285 tuyaux, 12 gaines, 12 chemins de câbles, 7 systèmes et 78 murs validés sous le parseur officiel `web-ifc` avec reproductibilité bit-à-bit stricte (`ifc1 === ifc2`).
- **Tests E2E Playwright :**
  - **14 / 14 tests E2E passés au vert** sur Chromium en mode bundle de production (`dist/`).
- **Qualité de code :**
  - 0 erreur TypeScript (`pnpm typecheck`).
  - 0 warning ESLint (`pnpm lint`).
