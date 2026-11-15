import { type BimState, type Wall, type ElementId } from '../types.js';
import { computeWallVerticalBounds } from '../walls.js';

export interface ResolvedOpening {
  readonly id: ElementId;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;       // Hauteur d'allège (0 pour porte, sillHeight pour fenêtre)
  readonly sillZAbsolute: number;   // zBase + sillHeight
  readonly lintelZAbsolute: number; // zBase + sillHeight + height
}

export interface ResolvedWall {
  readonly wallId: ElementId;
  readonly zBase: number;          // level.elevation + (wall.baseOffset ?? 0)
  readonly zTop: number;           // computed from heightOverride > topConstraint > wallType.height
  readonly height: number;         // zTop - zBase (>= 0)
  readonly heightSource: 'override' | 'constraint' | 'nominal';
  readonly limitingSlabId?: ElementId;
  readonly openings: readonly ResolvedOpening[];
}

/**
 * Résout la géométrie altimétrique et les ouvertures d'un mur architectural (ADR-049 / S1-1 + S1-4).
 *
 * Source unique de vérité pour :
 * - zBase : arase inférieure absolue (niveau + baseOffset)
 * - zTop : arase supérieure absolue (heightOverride > topConstraint/dalle > wallType nominal)
 * - height : hauteur libre effective du mur (zTop - zBase)
 * - openings : liste ordonnée des ouvertures avec cotes absolues sillZAbsolute et lintelZAbsolute
 *
 * @param wall Mur hôte
 * @param state État global du document BIM
 * @returns Géométrie résolue du mur
 */
export function resolveWallGeometry(wall: Wall, state: BimState): ResolvedWall {
  const bounds = computeWallVerticalBounds(wall, state);

  const openings: ResolvedOpening[] = [];

  // 1. Portes hébergées
  if (state.doors) {
    for (const door of Object.values(state.doors)) {
      if (door.hostWallId === wall.id) {
        const dt = state.doorTypes?.[door.doorTypeId];
        const width = dt?.width ?? 900;
        const height = dt?.height ?? 2100;
        const sillHeight = 0;
        const sillZAbsolute = bounds.zBase + sillHeight;
        const lintelZAbsolute = sillZAbsolute + height;

        openings.push({
          id: door.id,
          kind: 'door',
          offsetAlong: door.offsetAlong,
          width,
          height,
          sillHeight,
          sillZAbsolute,
          lintelZAbsolute,
        });
      }
    }
  }

  // 2. Fenêtres hébergées
  if (state.windows) {
    for (const win of Object.values(state.windows)) {
      if (win.hostWallId === wall.id) {
        const wt = state.windowTypes?.[win.windowTypeId];
        const width = wt?.width ?? 1200;
        const height = wt?.height ?? 1400;
        const sillHeight = win.sillHeight ?? 0;
        const sillZAbsolute = bounds.zBase + sillHeight;
        const lintelZAbsolute = sillZAbsolute + height;

        openings.push({
          id: win.id,
          kind: 'window',
          offsetAlong: win.offsetAlong,
          width,
          height,
          sillHeight,
          sillZAbsolute,
          lintelZAbsolute,
        });
      }
    }
  }

  // Trier les ouvertures par abscisse curviligne offsetAlong
  openings.sort((a, b) => a.offsetAlong - b.offsetAlong);

  return {
    wallId: wall.id,
    zBase: bounds.zBase,
    zTop: bounds.zTop,
    height: bounds.heightEff,
    heightSource: bounds.heightSource,
    ...(bounds.limitingSlabId ? { limitingSlabId: bounds.limitingSlabId } : {}),
    openings,
  };
}
