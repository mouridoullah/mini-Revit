# ADR-053 : Toitures (Plat & 2 Pans), Biseautage des Murs sous Toiture via `topProfile`, et Dérivation des Trémies de Toit

## Statut

**Accepté** (Phase 7 — Toitures — 15 novembre 2026)

## Contexte

Mini-BIM dispose de murs percés avec altimétrie paramétrique (`zBase`, `zTop`), de dalles horizontales, et d'escaliers droits avec trémies automatiques.
La fermeture de l'enveloppe du bâtiment requiert l'intégration de toitures :
1. Toitures plates (terrasses avec ou sans acrotères).
2. Toitures à deux pans (versants inclinés, faîtage, égouts, rives et débords).
3. Adaptation altimétrique et biseautage géométrique des têtes de murs sous toiture (murs gouttereaux biseautés sous versant unique, ou murs pignons en chevron sous deux versants).
4. Découpe des trémies et ouvertures de toit (lucarnes, cheminées) sans altération destructrice de l'empreinte primaire (ADR-001).
5. Rendu 2D, rendu 3D étanche (Euler = 2) et interopérabilité IFC4 (`IfcRoof`).

---

## Décisions d'Architecture

### 1. D1 — Modèle Type / Instance avec Discriminated Union (`RoofType` & `Roof`)

Pour garantir au niveau du système de types TypeScript l'absence d'états incohérents (ex. angle de pente ou axe de faîtage sur un toit plat), `RoofType` est défini comme une union discriminée sur `family` :

```typescript
export type RoofType =
  | {
      readonly id: ElementId;
      readonly name: string;
      readonly category: 'roofType';
      readonly family: 'flat';
      readonly thickness: number; // épaisseur de toiture en mm (>= 100)
      readonly acrotereHeight?: number; // hauteur d'acrotère en mm
      readonly materialId: string;
    }
  | {
      readonly id: ElementId;
      readonly name: string;
      readonly category: 'roofType';
      readonly family: 'gable';
      readonly thickness: number; // épaisseur de toiture en mm (>= 100)
      readonly slopeDeg: number; // pente en degrés (5° à 60°)
      readonly overhangMm: number; // débord de toit en mm (0 à 1500)
      readonly materialId: string;
    };

export interface Roof {
  readonly id: ElementId;
  readonly category: 'roof';
  readonly roofTypeId: ElementId;
  readonly levelId: ElementId; // niveau d'assise du toit
  readonly footprint: readonly Vec2[]; // empreinte fermée des murs porteurs (CCW)
  readonly baseOffset?: number; // décalage altimétrique vs niveau (mm, défaut 0)
  readonly ridgeAxis?: { readonly start: Vec2; readonly end: Vec2 }; // requis si family === 'gable'
  readonly slopeOverrideDeg?: number; // surcharge optionnelle de pente
  readonly overhangOverrideMm?: number; // surcharge optionnelle de débord
}
```

### 2. D2 — Extension du Résolveur de Murs (`resolveWallGeometry`) vers `topProfile: Vec2[]`

Pour que le sommet des murs sous toiture ne soit plus limité à un nombre scalaire unique `zTop`, l'interface `ResolvedWall` est refactorée en conservant `zTop` (altitude maximale) et `height` (`zTop - zBase`) pour la compatibilité, tout en introduisant la polyligne 2D locale de tête `topProfile: Vec2[]` :

```typescript
export interface ResolvedWall {
  readonly wallId: ElementId;
  readonly zBase: number;
  readonly zTop: number;
  readonly height: number;
  readonly openings: readonly ResolvedOpening[];
  readonly limitingSlabId?: ElementId;
  readonly topProfile: readonly Vec2[]; // polyligne (offsetAlong, zAbsolu) de u = 0 à u = L
  readonly wallHeightSource: 'override' | 'level' | 'roof';
}
```

- Mur nominal / contraint niveau / override : `topProfile = [(0, zBase + H), (L, zBase + H)]` (rectangle).
- Mur sous un seul versant de toiture : profil trapézoïdal linéaire `[(0, z_top(0)), (L, z_top(L))]`.
- Mur sous deux versants (mur pignon traversant le faîtage) : profil en chevron / pentagonal avec sommet au faîtage `[(0, z0), (u_ridge, z_ridge), (L, zL)]`.
- `mesh-generator.ts`, `ifc/generator.ts`, `metrics.ts` et `rules.ts` consomment tous ce `topProfile` comme source unique de vérité.

### 3. D3 — Dérivation d'Empreinte Effective (`computeEffectiveRoofPolygon`)

Similaire à `computeEffectiveSlabPolygon` (ADR-045), le module `core/src/roofs/effective.ts` fournit une fonction géométrique pure :
```typescript
export function computeEffectiveRoofPolygon(
  roof: Roof,
  openings: readonly RoofOpening[],
): {
  readonly effectiveFootprint: readonly Vec2[];
  readonly effectiveHoles: readonly (readonly Vec2[])[];
  readonly wasTrimmed: boolean;
};
```
Elle valide l'intégrité de la toiture (rejet `ROOF_SEVERED` si une découpe coupe le toit en deux îlots disjoints, rejet `ROOF_EMPTY` si l'ouverture englobe tout le toit).

### 4. D4 — Entité `RoofOpening` & Trémies Dérivées (ADR-001)

Les fenêtres de toit ou découpes de conduits sont représentées par `RoofOpening` :
```typescript
export interface RoofOpening {
  readonly id: ElementId;
  readonly category: 'roofOpening';
  readonly roofId: ElementId;
  readonly offsetU: number; // coordonnées locales le long de la pente
  readonly offsetV: number;
  readonly width: number;
  readonly height: number;
}
```
> [!NOTE]
> **Périmètre Phase 7 vs Phase 8 :**
> `RoofOpening` est une entité de données pour Phase 7 (modèle géométrique, calculs d'ouvertures effectives avec `computeEffectiveRoofPolygon`, validation `ROOF_SEVERED`/`ROOF_EMPTY`, sérialisation). L'outil interactif de dessin sur plan (`RoofOpeningTool`) est reporté en Phase 8.

Les trémies ne sont jamais fusionnées de manière destructive dans `roof.footprint` ; elles sont passées à la demande via `computeEffectiveRoofPolygon`.

### 5. D5 — Rendu 3D Fusionné & Polyèdre Étanche (Euler = 2)

Chaque entité `Roof` produit un unique maillage 3D fusionné (`RawMeshData`) comprenant :
- Les versants inclinés (intrados et extrados extrudés sur l'épaisseur `thickness`).
- Les sous-faces et joues de rives / égouts.
- Les pignons verticaux de fermeture (pour toiture à 2 pans).
- Les acrotères (si `acrotereHeight > 0` sur toiture plate).
- Vérification topologique par formule d'Euler-Poincaré : $V - E + F = 2$ pour une enveloppe fermée de genre 0.

### 6. D6 — Interopérabilité IFC4

Export standardisé selon ISO 16739 :
- Entité conteneur : `IFCROOF`.
- Versants décomposés : entités `IFCSLAB` avec `PredefinedType = .ROOF.`.
- Relation d'agrégation spatiale : `IFCRELAGGREGATES(IfcRoof, [IfcSlab...])`.
- Rattachement spatial : `IFCRELCONTAINEDINSPATIALSTRUCTURE(IfcRoof, IfcBuildingStorey)`.

### 7. D7 — Migration de Schéma Documentaire `topConstraint` vers Discriminated Union

Le schéma documentaire v2 est étendu en v2Extended tout en préservant `schemaVersion: 2` :
- Antérieur : `{ topConstraint?: { levelId: string; offset?: number } }`
- Nouveau :
  ```typescript
  export type WallTopConstraint =
    | { readonly kind: 'level'; readonly levelId: ElementId; readonly offset?: number }
    | { readonly kind: 'roof'; readonly roofId?: ElementId; readonly offset?: number };
  ```
- Les fonctions de désérialisation (`deserializeState`, `BimDocument.fromJSON`) migrent automatiquement `{ levelId }` en `{ kind: 'level', levelId }` pour une compatibilité ascendante totale sans régression.

### 8. D8 — Couverture Wall $\to$ Roof (Algorithme Hybride)

Pour associer un mur à sa toiture de couverture :
1. Si `wall.topConstraint?.kind === 'roof'` et que `roofId` est renseigné : liaison explicite vers ce toit.
2. Sinon (détection automatique par défaut) : détection spatiale par intersection géométrique de l'axe 2D du mur avec le polygone englobant (`footprint`) des toitures situées sur le niveau supérieur ou égal.
3. Si aucun toit ne couvre le mur : repli nominal sur le niveau supérieur ou `heightOverride`.
