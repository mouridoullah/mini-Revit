# ADR-049 : Résolveur Unique de Géométrie de Mur (`resolveWallGeometry` — S1-1 + S1-4)

## Statut

**Accepté** (Chantier 2 — Correction des anomalies S1-1 & S1-4)

## Date

15 novembre 2026

## Contexte & Analyse du Problème

L'audit architectural approfondi a identifié deux failles critiques dans la propagation altimétrique des murs :

1. **Bug S1-1 (Hauteur effective non propagée) :**
   Dans les modules métiers (`rules.ts`, `metrics.ts`, `ifc/generator.ts`, `mesh-generator.ts`), le calcul de la hauteur des murs utilisait directement `wallType.height` ou un fallback local `wall.heightOverride ?? wallType.height ?? 2800`, ignorant totalement la contrainte supérieure `topConstraint` et la sous-face des dalles structurelles couvrantes.

2. **Bug S1-4 (Désynchronisation 3D vs IFC vs Cotes d'ouvertures) :**
   Le composant `Viewport3D` extrudait les murs au niveau de base `elevation` du niveau sans appliquer `wall.baseOffset`, utilisait `wallType.height` au lieu de la hauteur effective, et positionnait les placeholders de portes et fenêtres au niveau brut du storey. Résultat : un mur avec `baseOffset: +500 mm` flottait ou voyait ses portes décalées de 500 mm par rapport à l'évidement 3D, tout en divergeant de l'export IFC4.

---

## Décisions d'Architecture

### 1. D1 — Résolveur Unique de Géométrie de Mur (`resolveWallGeometry`)

Toute géométrie altimétrique de mur et toute position d'ouverture hébergée doivent être calculées par une unique fonction pure faisant autorité :
```typescript
function resolveWallGeometry(wall: Wall, state: BimState): ResolvedWall;
```
Située dans `packages/core/src/walls/resolve.ts` et réexportée à la racine de `@tabax/core`.

### 2. D2 — Modèle de Données Dérivé (`ResolvedWall` & `ResolvedOpening`)

```typescript
export interface ResolvedOpening {
  readonly id: ElementId;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly sillZAbsolute: number;   // zBase + sillHeight
  readonly lintelZAbsolute: number; // zBase + sillHeight + height
}

export interface ResolvedWall {
  readonly wallId: ElementId;
  readonly zBase: number;          // level.elevation + (wall.baseOffset ?? 0)
  readonly zTop: number;           // Surcharge > TopConstraint/Dalle > Nominal
  readonly height: number;         // zTop - zBase (>= 0)
  readonly heightSource: 'override' | 'constraint' | 'nominal';
  readonly limitingSlabId?: ElementId;
  readonly openings: readonly ResolvedOpening[];
}
```

### 3. D3 — Réfractoration des 5 Consommateurs

1. **`packages/core/src/rules.ts` :** Validation de collision et de débordement haut des ouvertures (`checkDoorViolations`, `checkWindowViolations`, `checkOpeningsWithCandidate`) basée sur `resolveWallGeometry(wall, state).height`.
2. **`packages/core/src/metrics.ts` :** Calculs des surfaces brutes, nettes et volumes solides de murs (`computeWallMetrics`, `computeLevelMetrics`) basés sur `resolved.height`.
3. **`packages/core/src/ifc/generator.ts` :** Solide extrudé `IFCEXTRUDEDAREASOLID` avec `resolved.height`, et placement `IFCCARTESIANPOINT` à `z = baseOffset`.
4. **`packages/view-3d/src/mesh-generator.ts` :** Découpage et extrusion paramétrique acceptant `height?: number` optionnel pour découper et extruder le mur à sa hauteur effective.
5. **`apps/web/src/components/Viewport3D.tsx` :** Génération des tronçons solides avec `elevation: resolved.zBase` et `height: resolved.height`, et instanciation des placeholders 3D à `resolvedHost.zBase` avec dimensions issues de `resolved.openings`.

### 4. D4 — Règle de Non-Régression & Règle d'Or

Zéro occurrence de `wallType.height` en dehors de `resolve.ts` (et de son délégué `walls.ts`, ou de la validation de validité intrinsèque du type `wallType.height > 0`) dans le code de production.

### 5. D5 — Découplage de `@tabax/view-3d`

Le package `@tabax/view-3d` reste strictement découplé de `@tabax/core`. Il ne dépend pas du résolveur mais accepte un paramètre géométrique neutre `height?: number` sur `WallWithOpeningsParams` et `createWallMesh`. C'est le consommateur applicatif (`Viewport3D.tsx`) qui fait le pont en appelant `resolveWallGeometry` et en passant `resolved.zBase` et `resolved.height`.
