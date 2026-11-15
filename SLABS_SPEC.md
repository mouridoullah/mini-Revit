# SPÉCIFICATION TECHNIQUE — DALLES (SLABS) & MULTI-NIVEAUX

**Version :** 1.0  
**Date :** 15 novembre 2026  
**Statut :** Spécification Validée (Phase 6)  
**Auteurs :** Lead Software Architect & Computational Geometry Engineer

---

## 1. Objet et Portée

Ce document définit les spécifications formelles, les conventions géométriques et les règles d'intégrité métier pour l'implémentation des **Dalles horizontales (`Slab`)**, de la **gestion multi-étages (`Multi-Level`)** et du **rendu fantôme (`Underlay`)** au sein de Mini-BIM.

---

## 2. Modèle de Données Déclaratif (`@mini-bim/core`)

### 2.1 Types TypeScript

```typescript
import { type ElementId, type Vec2 } from '../types.js';

export interface Slab {
  readonly id: ElementId;
  readonly category: 'slab';
  readonly levelId: ElementId;
  readonly boundary: readonly Vec2[]; // Contour extérieur fermé CCW
  readonly holes: readonly (readonly Vec2[])[]; // Trémies intérieures fermées CW
  readonly thickness: number; // Épaisseur constructive en mm (strictement > 0)
  readonly baseOffset?: number; // Décalage altimétrique optionnel (défaut: 0)
  readonly name?: string; // Libellé optionnel (ex: "Dalle RDC", "Plancher haut")
}

export interface BimState {
  // ... champs existants ...
  readonly slabs: Record<ElementId, Slab>;
}
```

### 2.2 Convention Altimétrique (Règle d'Or d'Ancrage)

Dans le standard BIM (Revit, IFC) :
* L'élévation d'un niveau (`level.elevation`) correspond à la **cote de plancher fini**.
* La dalle structurelle est donc positionnée **sous** le niveau de référence :
  $$\begin{aligned}
  Z_{\text{sup}} &= \text{level.elevation} + (\text{slab.baseOffset} \mathbin{??} 0) \\
  Z_{\text{inf}} &= Z_{\text{sup}} - \text{slab.thickness}
  \end{aligned}$$
* **Conséquence directe :** Les murs posés sur ce niveau ($Z = \text{level.elevation}$) reposent exactement sur la face supérieure de la dalle, sans aucun chevauchement ou conflit volumique.

---

## 3. Commandes Transactionnelles (`immer`)

| Commande | Paramètres | Effet sur `draft.slabs` | `getChangedIds()` |
|---|---|---|---|
| `AddSlabCommand` | `slab: Slab` | Insère la dalle après validation complète. | `[slab.id]` |
| `UpdateSlabCommand` | `slabId: ElementId, patch: Partial<Slab>` | Applique le patch et re-valide l'entité. | `[slab.id]` |
| `DeleteSlabCommand` | `slabId: ElementId` | Supprime la dalle du modèle. | `[slabId]` |

### Invariant Undo / Redo
Toute opération sur une dalle doit restaurer l'état documentaire bit-à-bit (`expect(doc.state).toEqual(stateBefore)`).

---

## 4. Règles Métier et Codes d'Erreur (`validateSlab`)

La fonction pure `validateSlab(slab: Slab, state: BimState): void` vérifie les invariants suivants et lève des exceptions `BimValidationError` typées :

1. `UNKNOWN_LEVEL` : Le `slab.levelId` doit correspondre à un niveau existant dans `state.levels`.
2. `INVALID_SLAB_THICKNESS` : L'épaisseur `thickness` doit être un nombre fini strictement positif ($\ge 50\text{ mm}$).
3. `INVALID_SLAB_BOUNDARY` : Le contour extérieur `boundary` doit comporter au moins 3 sommets non colinéaires et une aire signée non nulle ($\ge 0,1\text{ m}^2$).
4. `SELF_INTERSECTING_SLAB` : Le contour extérieur ne doit présenter aucune auto-intersection d'arêtes.
5. `HOLE_OUTSIDE_SLAB` : Chaque trémie dans `holes` doit être géométriquement et strictement incluse à l'intérieur du polygone `boundary`.
6. `INTERSECTING_HOLES` : Deux trémies ne peuvent pas se chevaucher ou s'auto-intersecter.

---

## 5. Pipeline Géométrique et Rendu 3D (`@mini-bim/view-3d`)

1. **Triangulation des faces horizontales :**
   - Utilisation d'`earcut` pour trianguler le polygone concave avec trous.
   - Face supérieure orientée vers le haut ($+Z$) à $Z = Z_{\text{sup}}$.
   - Face inférieure orientée vers le bas ($-Z$) à $Z = Z_{\text{inf}}$ avec ordre d'indices inversé.
2. **Génération des tranches verticales latérales :**
   - Murs de rive extérieurs : quads verticaux reliant chaque segment $(P_i, P_{i+1})$ entre $Z_{\text{sup}}$ et $Z_{\text{inf}}$, orientés vers l'extérieur.
   - Parois de trémies intérieures : quads verticaux reliant les segments de trous, orientés vers l'intérieur de la réservation.
3. **Format du maillage :** `RawMeshData` (positions Float32, normales Float32, indices Uint32). Le solide résultant est rigoureusement **étanche (watertight/manifold)**.

---

## 6. Rendu 2D en Plan (`@mini-bim/view-2d`)

1. **Contour en plan :** Tracé du contour `boundary` en ligne continue avec poché léger ou hachure standard béton.
2. **Trémies d'escalier :** Tracé des réservations `holes` avec diagonales normalisées (croix de réservation architecturale).
3. **Mode Underlay (Vue Fantôme de l'étage inférieur) :**
   - Si le niveau actif est $N$ et que l'option Underlay est activée, les murs du niveau $N-1$ sont dessinés en traits fins pointillés gris clair (`#9ca3af`).
   - L'utilisateur peut ainsi aligner les nouvelles cloisons ou façades directement sur les porteurs du dessous.

---

## 7. Export IFC4 (`IfcSlab`)

La dalle est traduite dans le fichier STEP ISO 10303-21 :
```step
#200=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,'SlabProfile',#201,(#202));
#203=IFCEXTRUDEDAREASOLID(#200,#204,#12,200.00);
#205=IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#203));
#206=IFCPRODUCTDEFINITIONSHAPE($,$,(#205));
#207=IFCSLAB('1A2B3C4D5E6F7G8H9I0J1K',#5,'Dalle RDC',$,.FLOOR.,#208,#206,$,$);
#209=IFCRELCONTAINEDINSPATIALSTRUCTURE('2B3C4D5E6F7G8H9I0J1K2L',#5,'SlabStorey',$,(#207),#27);
```

---

## 8. Critères d'Acceptation et Décompte des Tests (Phase 6.1)

1. **Noyau (`@mini-bim/core`) :**
   - 100% des commandes de dalles testées (Add, Update, Delete).
   - Validation stricte des 6 codes d'erreur.
   - Restauration Undo/Redo bit-à-bit.
   - Sérialisation et rétrocompatibilité (fichiers Phase 5 sans dalles ouverts sans erreur).
2. **Géométrie & Rendu :**
   - Maillage 3D étanche avec calcul automatique de volume ($V = \text{Aire} \times \text{Épaisseur} - \sum V_{\text{trous}}$).
   - Rendu 2D avec distinction visuelle des trémies.
3. **Zéro Régression :** Les 507 tests existants restent 100% verts.
