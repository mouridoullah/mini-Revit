# SPÉCIFICATION TECHNIQUE — TOITURES (ROOFS) & BISEAUTAGE DES MURS

**Version :** 1.0  
**Date :** 15 novembre 2026  
**Statut :** Spécification Validée (Phase 7 — Décisions D1 à D9 / ADR-053)  
**Auteurs :** Lead Software Architect & Computational Geometry Engineer

---

## 1. Objet et Portée

Ce document définit les spécifications formelles, les conventions géométriques, les règles d'intégrité métier et les algorithmes de résolution altimétrique pour :
1. Les **Toitures architecturales (`Roof`)** et leurs familles de types (**`RoofType`** : toit plat et toit à deux pans).
2. L'adaptation altimétrique et le **biseautage automatique des têtes de murs sous toiture** (`resolveWallGeometry`, `computeWallTopProfile`).
3. Les **ouvertures et trémies de toit hébergées (`RoofOpening`)** calculées par dérivation non-destructive (ADR-001 / ADR-045).
4. Le **rendu 2D/3D étanche** ($V - E + F = 2$, volume analytique exact) et l'export standardisé **IFC4 (`IfcRoof` agrégeant `IfcSlab.ROOF.`)**.

---

## 2. Modèle de Données Déclaratif (`@mini-bim/core`)

### 2.1 Types TypeScript & Discriminated Union (ADR-053 / D1)

```typescript
import { type ElementId, type Vec2 } from './types.js';

export type RoofType =
  | {
      readonly id: ElementId;
      readonly name: string;
      readonly category: 'roofType';
      readonly family: 'flat';
      readonly thickness: number; // >= 100 mm
      readonly acrotereHeight?: number; // >= 0 mm
      readonly materialId?: string;
    }
  | {
      readonly id: ElementId;
      readonly name: string;
      readonly category: 'roofType';
      readonly family: 'gable';
      readonly thickness: number; // >= 100 mm
      readonly slopeDeg: number; // 5° à 60°
      readonly overhangMm: number; // 0 à 1500 mm
      readonly materialId?: string;
    };

export interface Roof {
  readonly id: ElementId;
  readonly category: 'roof';
  readonly roofTypeId: ElementId;
  readonly levelId: ElementId;
  readonly footprint: readonly Vec2[]; // Empreinte fermée CCW
  readonly baseOffset?: number; // Décalage altimétrique vs niveau (défaut: 0)
  readonly ridgeAxis?: { readonly start: Vec2; readonly end: Vec2 }; // Requis si family === 'gable'
  readonly slopeOverrideDeg?: number;
  readonly overhangOverrideMm?: number;
}

export interface RoofOpening {
  readonly id: ElementId;
  readonly category: 'roofOpening';
  readonly roofId: ElementId;
  readonly offsetU: number; // Coordonnées UV locales le long de la pente
  readonly offsetV: number;
  readonly width: number;
  readonly height: number;
}
```

### 2.2 Migration de Schéma Documentaire `topConstraint` (D7)

Pour unifier la gestion des contraintes supérieures de murs :
```typescript
export type WallTopConstraint =
  | { readonly kind: 'level'; readonly levelId: ElementId; readonly offset?: number }
  | { readonly kind: 'roof'; readonly roofId?: ElementId; readonly offset?: number };
```
La désérialisation v2 migre automatiquement l'ancien format `{ levelId: string }` vers `{ kind: 'level', levelId }` en assurant une rétrocompatibilité ascendante sans rupture.

---

## 3. Algorithme de Biseautage des Murs (`computeWallTopProfile`) (D2)

Le sommet d'un mur sous toiture est représenté par une polyligne 2D locale `topProfile: Vec2[]` où chaque point $(u, z)$ associe l'abscisse curviligne le long du mur ($0 \le u \le L$) à l'altitude absolue $z$.

### 3.1 Murs Gouttereaux (Parallèles ou situés sous un pan unique)
Le profil est trapézoïdal ou horizontal linéaire :
$$topProfile = [(0, z_0), (L, z_L)]$$

### 3.2 Murs Pignons (Traversant le faîtage)
Lorsque le segment du mur croise l'axe de faîtage ($s_0 \cdot s_1 < 0$), le profil est divisé en **chevron (3 sommets)** :
$$topProfile = [(0, z_0), (u_{\text{ridge}}, z_{\text{ridge}}), (L, z_L)]$$

Où la hauteur de pointe vérifie rigoureusement :
$$z_{\text{ridge}} = z_{\text{base}} + W_{\text{half}} \cdot \tan(\alpha)$$
$$u_{\text{ridge}} = L \cdot \frac{s_0}{s_0 - s_1}$$

---

## 4. Rendu 2D & Rendu 3D

### 4.1 Rendu 2D (`@mini-bim/view-2d`)
- **Empreinte nominale (`footprint`) :** Trait continu noir.
- **Ligne de débord (`overhang`) :** Polygone étendu tracé en tiretés bleus (`strokeDasharray: [6, 4]`).
- **Axe de faîtage (`ridgeAxis`) :** Trait fort (`lineWidth: 3`) avec cercles d'extrémités.
- **Trémies de toit (`roofOpenings`) :** Découpe avec croix diagonale et contour pointillé.
- **Sélection :** Halo cyan semi-transparent avec surbrillance.

### 4.2 Rendu 3D (`@mini-bim/view-3d`)
- **Toiture 2 pans :** Polyèdre étanche de genre 0, vérifiant la relation d'Euler-Poincaré :
  $$V - E + F = 2$$
- **Volume analytique exact :**
  $$V_{\text{exact}} = 2 \times S_{\text{versant}} \times e_{\text{toit}}$$
- **Biseautage des murs :** `createWallMeshWithOpenings` segmente le prisme vertical du mur selon `topProfile`, extrudant le chevron ou le trapèze sans artefacts géométriques ni fentes.
- **Matériau standard :** Terre cuite `#92400e` pour tuiles 2 pans, béton `#64748b` pour toit plat.

---

## 5. Interopérabilité IFC4 (D6)

Export standardisé selon ISO 16739 :
- Entité conteneur : `IFCROOF` (`.GABLE_ROOF.` ou `.FLAT_ROOF.`).
- Versants décomposés : entités `IFCSLAB` avec `PredefinedType = .ROOF.`.
- Relation d'agrégation spatiale : `IFCRELAGGREGATES(IfcRoof, [IfcSlab...])`.
- Rattachement spatial : `IFCRELCONTAINEDINSPATIALSTRUCTURE(IfcRoof, IfcBuildingStorey)`.

---

## 6. Outils & Workflow Utilisateur (D9)

1. **`RoofTool` (Raccourci clavier 'R') :**
   - État initial `idle`.
   - Clics successifs : saisie de l'empreinte polygonale (bouclage sur le 1er sommet).
   - Pour toiture 2 pans : saisie du segment de faîtage (départ et fin).
   - Émission de `AddRoofCommand`.
2. **`PropertyInspector` :**
   - Sélection d'une toiture : affichage du panneau dédié avec nom, type, pente modifiable, débord et baseOffset.
3. **`StatusBar` :**
   - Compteur en direct du nombre de toitures actives.
