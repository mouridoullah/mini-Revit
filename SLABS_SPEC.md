# SPÉCIFICATION TECHNIQUE — DALLES (SLABS) & MULTI-NIVEAUX

**Version :** 1.1  
**Date :** 15 novembre 2026  
**Statut :** Spécification Validée (Phase 6 — Révisée suite à l'Audit Croisé Claude / Lead Architect)  
**Auteurs :** Lead Software Architect & Computational Geometry Engineer

---

## 1. Objet et Portée

Ce document définit les spécifications formelles, les conventions géométriques et les règles d'intégrité métier pour l'implémentation des **Dalles horizontales (`Slab`)**, de leurs types constructifs (**`SlabType`**), de la **gestion multi-étages (`Multi-Level`)** et du **rendu fantôme (`Underlay`)** au sein de Mini-BIM.

Cette version 1.1 intègre les arbitrages issus de l'audit critique de conception :

- Généralisation du pattern Revit Type / Instance via `SlabType` (ADR-042).
- Intégration native dans le Graphe de Dépendances Minimal (`DependencyGraph`, ADR-041).
- Dérivation fonctionnelle pure des trémies d'escalier (règle de la source unique de vérité).
- Roadmap formalisée pour l'associativité des contours de dalles.
- Stratégie de tests à base de propriétés (`fast-check`).

---

## 2. Modèle de Données Déclaratif (`@tabax/core`)

### 2.1 Types TypeScript (ADR-042)

```typescript
import { type ElementId, type Vec2 } from '../types.js';

export interface SlabType {
  readonly id: ElementId;
  readonly name: string; // Ex: "Dalle Béton Armé 200 mm", "Plancher Bois 160 mm"
  readonly thickness: number; // Épaisseur constructive en mm (strictement > 0)
  readonly materialId?: string;
}

export interface Slab {
  readonly id: ElementId;
  readonly category: 'slab';
  readonly slabTypeId: ElementId; // Référence vers state.slabTypes
  readonly levelId: ElementId; // Référence vers state.levels
  readonly boundary: readonly Vec2[]; // Contour extérieur fermé CCW
  readonly holes?: readonly (readonly Vec2[])[]; // Trémies manuelles intérieures fermées CW
  readonly openings?: readonly (readonly Vec2[])[]; // Trémies traversantes dérivées (Phase 6.4 / ADR-037 / ADR-045)
  readonly baseOffset?: number; // Décalage altimétrique optionnel (défaut: 0)
  readonly name?: string; // Libellé optionnel (ex: "Dalle RDC", "Plancher haut")
}

export interface BimState {
  // ... entités existantes (walls, doors, windows, rooms, dimensions, levels) ...
  readonly slabTypes: Record<ElementId, SlabType>;
  readonly slabs: Record<ElementId, Slab>;
}
```

### 2.2 Convention Altimétrique (Règle d'Or d'Ancrage)

Dans le standard BIM (Revit, IFC) :

- L'élévation d'un niveau (`level.elevation`) correspond à la **cote de plancher fini**.
- La dalle structurelle est positionnée **sous** le niveau de référence :
  $$ \begin{aligned}
  Z_{\text{sup}} &= \text{level.elevation} + (\text{slab.baseOffset} \mathbin{??} 0) \\
  Z_{\text{inf}} &= Z_{\text{sup}} - \text{slabType.thickness}
  \end{aligned} $$
  $$
- **Conséquence directe au niveau $N$ & Règle sur `baseOffset` :**  
  Par convention standard, le décalage altimétrique d'une dalle de sol satisfait $baseOffset \le 0$ afin que la dalle reste affleurante ou enfouie sous la cote de sol fini. Si un $baseOffset > 0$ est spécifié (cas d'un plancher technique surélevé), le pied des murs posés sur ce niveau s'aligne automatiquement sur la face supérieure de la dalle ($Z_{\text{base}} = Z_{\text{sup}}$) pour empêcher tout enfoncement des cloisons dans le béton.
- **Cas critique multi-étages (Mur du niveau $N$ sous dalle du niveau $N+1$, ADR-040) :**
  Pour un mur contraint sous la dalle de plancher haut du niveau $N+1$, son sommet s'arrête exactement à la sous-face de la dalle qui le couvre :
  $$Z_{\text{top}}(wall_N) = Z_{\text{inf}}(slab_{N+1}) = \text{level}_{N+1}.\text{elevation} + (\text{slab.baseOffset} \mathbin{??} 0) - \text{slabType.thickness}$$
- **Invariant de Non-Interpénétration Volumique (Test Discriminant Multi-Niveaux) :**
  Pour tout mur du niveau $N$ contraint sous une dalle du niveau $N+1$, quel que soit le décalage altimétrique de la dalle (`baseOffset` $\in [-500, +500]\text{ mm}$) :
  $$wall_N.maxZ \le slab_{N+1}.minZ \implies \text{Volume}(wall_N \cap slab_{N+1}) \equiv 0$$
  La boîte englobante 3D du mur et la boîte englobante 3D de la dalle supérieure ne se chevauchent jamais en $Z$ (au plus un contact surfacique plan coplanaire sans aucune interpénétration).

---

## 3. Dérivation des Trémies d'Escalier & Résolution Booléenne (Règle de Vérité Unique)

Pour éviter tout risque de désynchronisation entre un escalier et la réservation qu'il traverse (critique de Claude sur la duplication d'état) et pour gérer robustement les trémies en rive ou sécantes :

1. **Source Unique de Vérité :**  
   Le champ `slab.holes` stocke **exclusivement les trémies et réservations manuelles** dessinées par l'utilisateur. La trémie requise pour le passage d'un escalier n'est **jamais stockée en dur** dans `slab.holes`.
2. **Fonction Pure de Dérivation Booléenne (`computeEffectiveSlabPolygon`) :**  
   Avant toute opération de maillage 3D (`earcut`), de tracé en plan 2D ou d'export IFC, les trémies d'escalier sont collectées et combinées via `polygon-clipping` :
   - **Union des trémies :** L'ensemble des trous manuels `slab.holes` et des contours de trémies d'escaliers débouchants est fusionné par union booléenne :
     $$\text{shafts}_{\text{merged}} = \text{union}(\text{slab.holes} \cup \bigcup_{s \in \text{stairs}} \text{computeStairShaft}(s))$$
   - **Découpe des trémies en rive & Contrainte de Polygone Unique :** Si une trémie d'escalier ou manuelle intersecte le bord extérieur de la dalle (cas fréquent de l'escalier adossé à un mur de façade), elle découpe le contour extérieur par différence booléenne :
     $$\text{boundary}_{\text{trimmed}} = \text{difference}(\text{slab.boundary}, \text{shafts}_{\text{merged}})$$
     **Invariant de Nappe d'un Seul Tenant :** Dans Mini-BIM, chaque entité `Slab` doit former un solide continu unique (un polygone extérieur avec d'éventuels trous intérieurs). Si la soustraction d'une trémie traversante scinde la dalle en plusieurs polygones disjoints (`MultiPolygon`), la transaction est rejetée avec l'erreur typée `SLAB_SEVERED`. Si la trémie absorbe la totalité de la dalle, l'opération est rejetée avec `SLAB_EMPTY`.
   - **Extraction des trous intérieurs :** Les îlots de vide résultants situés strictement à l'intérieur de $\text{boundary}_{\text{trimmed}}$ forment les trous intérieurs effectifs $\text{holes}_{\text{effective}}$ passés au mailleur `earcut`.
3. **Conséquence :**  
   Si un escalier est déplacé, redimensionné ou supprimé, la trémie correspondante dans la dalle supérieure s'ajuste ou disparaît immédiatement, sans aucun risque de trou orphelin persistant et avec une étanchéité topologique absolue.

---

## 4. Commandes Transactionnelles (`immer`) & Intégration DAG

### 4.1 Catalogue des Commandes

| Commande                | Paramètres                                    | Rôle Métier                                       |
| ----------------------- | --------------------------------------------- | ------------------------------------------------- |
| `AddSlabTypeCommand`    | `slabType: SlabType`                          | Déclare un nouveau type de dalle.                 |
| `UpdateSlabTypeCommand` | `typeId: ElementId, patch: Partial<SlabType>` | Modifie les caractéristiques du type (épaisseur). |
| `DeleteSlabTypeCommand` | `typeId: ElementId`                           | Supprime le type (rejeté si utilisé).             |
| `AddSlabCommand`        | `slab: Slab`                                  | Insère une dalle après validation complète.       |
| `UpdateSlabCommand`     | `slabId: ElementId, patch: Partial<Slab>`     | Applique un patch et revalide l'entité.           |
| `DeleteSlabCommand`     | `slabId: ElementId`                           | Supprime la dalle du modèle.                      |

### 4.2 Déclaration dans le `RELATIONS_REGISTRY` & DAG (ADR-038 / ADR-041)

```typescript
// Enregistrement déclaratif des relations de la Dalle :
{
  sourceCategory: 'slab',
  field: 'levelId',
  targetCategory: 'level',
  onDelete: 'restrict', // Interdit la suppression d'un niveau portant des dalles
},
{
  sourceCategory: 'slab',
  field: 'slabTypeId',
  targetCategory: 'slabType',
  onDelete: 'restrict', // Interdit la suppression d'un type de dalle utilisé
}
```

- **Suppression d'un Mur (`DeleteWallCommand`) :** Une dalle est une entité horizontale indépendante ; supprimer un mur porteur ne supprime pas la dalle.
- **Suppression d'un Niveau (`DeleteLevelCommand`) :** Rejetée avec l'erreur typée `DELETE_RESTRICTED` (`blockingIds: [...]`) si le niveau porte des dalles ou des murs.
- **Suppression d'un Type (`DeleteSlabTypeCommand`) :** Rejetée avec l'erreur typée `DELETE_RESTRICTED` (`blockingIds: [...]`) si le type est encore référencé par au moins une dalle.
- **Arêtes DAG Dalle $\to$ Murs :** Le DAG enregistre l'arête `slab(N+1) -> wall(N)` pour les dalles de plancher haut couvrantes, et l'arête `slab(N) -> wall(N)` si `slab.baseOffset > 0` (car la face supérieure de la dalle surélève le pied des murs du même niveau).
- **Invariant Undo / Redo :** Toute opération restaure bit-à-bit l'état documentaire exact (`expect(doc.state).toEqual(stateBefore)`).

---

## 5. Règles Métier et Codes d'Erreur (`validateSlab` & `validateSlabType`)

### 5.1 Normalisation Automatique des Contours

- Le contour extérieur `boundary` est automatiquement normalisé en sens trigonométrique (**CCW**) lors de l'exécution de la commande (inversion automatique si l'utilisateur saisit les points en sens horaire).
- Les trémies manuelles `holes` sont automatiquement normalisées en sens horaire (**CW**).

### 5.2 Invariants et Exceptions Typées (`BimValidationError`)

La fonction pure `validateSlab(slab: Slab, state: BimState): void` vérifie :

1. `UNKNOWN_LEVEL` : Le `slab.levelId` doit exister dans `state.levels`.
2. `UNKNOWN_SLAB_TYPE` : Le `slab.slabTypeId` doit exister dans `state.slabTypes`.
3. `INVALID_SLAB_BOUNDARY` : Le contour extérieur `boundary` doit comporter au moins 3 sommets non colinéaires et une surface $\ge 0,1\text{ m}^2$.
4. `SELF_INTERSECTING_SLAB` : Le contour extérieur ne doit présenter aucune auto-intersection d'arêtes.
5. `HOLE_OUTSIDE_SLAB` : Chaque trémie dans `holes` doit intersecter ou être contenue dans le polygone `boundary`. Une trémie strictement extérieure (aucun point commun avec l'emprise de la dalle) est formellement rejetée. Les trémies adossées en rive ou tangentes sont acceptées et découpées.
6. `INTERSECTING_HOLES` : Deux trémies ne peuvent pas se chevaucher ou s'auto-intersecter.
7. `SLAB_SEVERED` : Si une découpe booléenne de trémie sépare la dalle en plusieurs polygones disjoints (`MultiPolygon`), la commande est rejetée (la dalle doit rester d'un seul tenant).
8. `SLAB_EMPTY` : Si la surface restante après soustraction des trémies est nulle ou négative, la commande est rejetée.

La fonction pure `validateSlabType(slabType: SlabType): void` vérifie :

- `INVALID_SLAB_THICKNESS` : L'épaisseur `thickness` doit être un nombre fini strictement positif ($\ge 50\text{ mm}$).

---

## 6. Roadmap d'Associativité des Dalles

Afin de concilier simplicité de livraison et ambition BIM professionnelle :

| Phase         | Mode de Définition de Dalle             | Comportement lors du Déplacement d'un Mur                                                                                                                          |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 6.1** | **Contour Manuel par Clics**            | Le contour de la dalle est statique. Les sommets s'aimantent sur les angles de murs lors du tracé initial.                                                         |
| **Phase 6.2** | **Création depuis Pièce ("Pick Room")** | L'utilisateur clique sur une pièce pour générer instantanément une dalle épousant le contour fermé intérieur.                                                      |
| **Phase 7+**  | **Mode Associatif Dynamique**           | Les arêtes de la dalle sont liées aux axes ou nus extérieurs des murs porteurs ; le déplacement d'un mur translate automatiquement la rive de la dalle via le DAG. |

---

## 7. Pipeline Géométrique et Rendu 3D (`@tabax/view-3d`)

1. **Triangulation des faces horizontales :**
   - Utilisation d'`earcut` pour trianguler le polygone concave avec trous effectifs (`holes_effective`).
   - Face supérieure orientée vers le haut ($+Z$) à $Z = Z_{\text{sup}}$.
   - Face inférieure orientée vers le bas ($-Z$) à $Z = Z_{\text{inf}}$ avec ordre d'indices inversé.
2. **Génération des tranches verticales latérales :**
   - Murs de rive extérieurs : quads verticaux reliant chaque segment $(P_i, P_{i+1})$ entre $Z_{\text{sup}}$ et $Z_{\text{inf}}$, orientés vers l'extérieur.
   - Parois de trémies : quads verticaux reliant les segments de trous, orientés vers l'intérieur de la réservation.
3. **Format du maillage :** `RawMeshData` (positions Float32, normales Float32, indices Uint32). Le solide résultant est rigoureusement **étanche (watertight/manifold)**.

---

## 8. Rendu 2D en Plan (`@tabax/view-2d`)

1. **Contour en plan :** Tracé du contour `boundary` en ligne continue avec poché discret béton (`#f3f4f6`).
2. **Trémies :** Tracé des réservations avec croix architecturale en diagonales.
3. **Mode Underlay (Vue Fantôme de l'étage inférieur) :**
   - Si le niveau actif est $N$ et que l'option Underlay est activée, les murs et baies du niveau $N-1$ sont dessinés en traits fins pointillés gris moyen (`#9ca3af`).
   - Tolérance d'aimantation (snapping) inter-niveaux fixée en pixels écran ($12\text{ px} / \text{scale}$).

---

## 9. Export IFC4 (`IfcSlab`)

Traduction conforme STEP ISO 10303-21 respectant les 9 attributs d'IFC4 (`PredefinedType` en 9ᵉ position) :

```step
#200=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,'SlabProfile',#201,(#202));
#203=IFCEXTRUDEDAREASOLID(#200,#204,#12,200.00);
#205=IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#203));
#206=IFCPRODUCTDEFINITIONSHAPE($,$,(#205));
#207=IFCSLAB('1A2B3C4D5E6F7G8H9I0J1K',#5,'Dalle RDC',$,$,#208,#206,$,.FLOOR.);
#209=IFCRELCONTAINEDINSPATIALSTRUCTURE('2B3C4D5E6F7G8H9I0J1K2L',#5,'SlabStorey',$,(#207),#27);
```

---

## 10. Tests à Base de Propriétés (`fast-check`)

En complément des tests unitaires déterministes, la suite de tests de Phase 6.1 intègre `fast-check` pour vérifier les invariants universels :

1. **Propriété d'Invariance d'Undo/Redo :**  
   Pour toute séquence aléatoire de $K$ commandes valides tirées au hasard (`AddSlab`, `UpdateSlab`, `AddWall`, `DeleteWall`, etc.), défaire les $K$ commandes successivement doit restaurer exactement l'état documentaire de départ :
   $$\forall s_0, \forall (c_1, \dots, c_K), \quad \text{undo}^K(\text{apply}^K(s_0)) \equiv s_0$$
2. **Propriété de Résilience de `validateSlab` :**  
   Fuzzing sur des polygones arbitraires générés aléatoirement (sommets superposés, segments croisés, sens horaire inversé) : `validateSlab` ne doit jamais lever d'exception non gérée (seules des instances de `BimValidationError` typées sont admises).
3. **Propriété de Non-Interpénétration Volumique Multi-Niveaux :**  
   Pour des configurations aléatoires de hauteurs de niveaux ($[2400, 4000]\text{ mm}$), d'épaisseurs de dalles ($[100, 400]\text{ mm}$) et de décalages altimétriques de dalles (`baseOffset` $\in [-500, +500]\text{ mm}$) :
   Tout mur du niveau $N$ contraint sous une dalle du niveau $N+1$ a un sommet $Z_{\text{top}}$ rigoureusement inférieur ou égal à la sous-face de la dalle ($wall_N.maxZ \le slab_{N+1}.minZ$), garantissant analytiquement $\text{Volume}(wall_N \cap slab_{N+1}) \equiv 0$ sans chevauchement en $Z$.

---

## 11. Critères d'Acceptation et Décompte des Tests (Phase 6.1)

1. **Noyau (`@tabax/core`) :**
   - 100% des commandes testées (`Slab` et `SlabType`).
   - Moteur DAG minimal opérationnel et validé par les tests de cascades.
   - Validation stricte des 6 codes d'erreur de `validateSlab` et du code de `validateSlabType`.
   - Restauration Undo/Redo bit-à-bit et tests de propriétés `fast-check` au vert.
   - Sérialisation et rétrocompatibilité (fichiers V1.0 sans dalles migrés automatiquement sans erreur).
2. **UI (`apps/web`) :**
   - Panneau d'inspection minimal intégré (édition directe du nom, type, épaisseur et altitude de l'élément sélectionné).
3. **Zéro Régression :** Les 507 tests existants restent 100% verts.
