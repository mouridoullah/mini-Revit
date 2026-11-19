import { type BimState, type Wall, type ElementId } from './types.js';
import { isPointInPolygon, computeEffectiveSlabPolygon, vec2, type Vec2 } from '@mini-bim/geometry';

export interface ComputeWallEffectiveHeightOptions {
  /** Échantillonnage supplémentaire le long du mur si nécessaire (par défaut [start, mid, end]). */
  readonly samplePointsCount?: number;
}

/**
 * Résultat complet de la résolution altimétrique d'un mur (ADR-045 D2).
 */
export interface WallEffectiveHeightResult {
  /** Arase inférieure du mur en coordonnées mondes Z (mm). */
  readonly zBase: number;
  /** Arase supérieure effective du mur (sous-face de plancher ou cible) en coordonnées mondes Z (mm). */
  readonly zTop: number;
  /** Hauteur effective du mur en mm (zTop - zBase, >= 0). */
  readonly heightEff: number;
  /** Provenance de la hauteur calculée (ADR-049). */
  readonly heightSource: 'override' | 'constraint' | 'nominal';
  /** ID de la dalle dont la sous-face a limité l'arase supérieure, le cas échéant. */
  readonly limitingSlabId?: ElementId;
}

/**
 * Teste si un point 2D est situé à l'intérieur de la matière solide d'une dalle
 * (à l'intérieur de son contour externe et à l'extérieur de toutes ses réservations/trémies).
 */
function isPointInsideSlab(
  point: Vec2,
  slabGeometry: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
): boolean {
  if (!isPointInPolygon(point, slabGeometry.outer)) {
    return false;
  }
  for (const hole of slabGeometry.holes) {
    if (isPointInPolygon(point, hole)) {
      return false; // Dans le trou -> pas de matière solide
    }
  }
  return true;
}

/**
 * Détermine si un segment de mur est couvert par l'emprise solide d'une dalle.
 */
function isWallCoveredBySlab(
  wall: Wall,
  slabGeometry: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
): boolean {
  const midPoint = vec2((wall.start.x + wall.end.x) / 2, (wall.start.y + wall.end.y) / 2);
  const quarter1 = vec2(
    wall.start.x + 0.25 * (wall.end.x - wall.start.x),
    wall.start.y + 0.25 * (wall.end.y - wall.start.y),
  );
  const quarter3 = vec2(
    wall.start.x + 0.75 * (wall.end.x - wall.start.x),
    wall.start.y + 0.75 * (wall.end.y - wall.start.y),
  );

  // Le mur est considéré couvert si son milieu ou l'un de ses quarts se trouve sous la matière solide de la dalle
  return (
    isPointInsideSlab(midPoint, slabGeometry) ||
    isPointInsideSlab(quarter1, slabGeometry) ||
    isPointInsideSlab(quarter3, slabGeometry)
  );
}

/**
 * Résout les bornes altimétriques et arases d'un mur (ADR-045 D2).
 * Retourne { zBase, zTop, heightEff, limitingSlabId }.
 */
export function computeWallVerticalBounds(
  wall: Wall,
  state: BimState,
  _options?: ComputeWallEffectiveHeightOptions,
): WallEffectiveHeightResult {
  const currentLevel = state.levels[wall.levelId];
  const zBase = (currentLevel?.elevation ?? 0) + (wall.baseOffset ?? 0);

  // Priorité 1 : Surcharge manuelle explicite
  if (wall.heightOverride !== undefined && Number.isFinite(wall.heightOverride)) {
    const heightEff = Math.max(0, wall.heightOverride);
    return {
      zBase,
      zTop: zBase + heightEff,
      heightEff,
      heightSource: 'override',
    };
  }

  const wallType = state.wallTypes[wall.typeId];
  const defaultHeight = wallType?.height ?? 2800;

  // Priorité 2 : Contrainte supérieure de niveau
  if (wall.topConstraint?.levelId) {
    const topLevelId = wall.topConstraint.levelId;
    const targetLevel = state.levels[topLevelId];

    if (!currentLevel || !targetLevel) {
      return {
        zBase,
        zTop: zBase + defaultHeight,
        heightEff: defaultHeight,
        heightSource: 'nominal',
      };
    }

    const topOffset = wall.topConstraint.topOffset ?? wall.topConstraint.offset ?? 0;
    let zTop = targetLevel.elevation + topOffset;
    let limitingSlabId: ElementId | undefined;

    // Rechercher les dalles associées au niveau supérieur
    if (state.slabs) {
      const targetSlabs = Object.values(state.slabs).filter(
        (sl) => sl.levelId === topLevelId,
      );

      for (const slab of targetSlabs) {
        const slabType = state.slabTypes?.[slab.slabTypeId];
        if (!slabType) continue;

        let effectivePolygon;
        try {
          effectivePolygon = computeEffectiveSlabPolygon({
            boundary: slab.boundary,
            holes: slab.holes,
            openings: slab.openings,
          });
        } catch {
          // Si la dalle est corrompue ou dégénérée, l'ignorer pour le calcul d'arase
          continue;
        }

        if (isWallCoveredBySlab(wall, effectivePolygon)) {
          // Arase inférieure (sous-face) de la dalle
          const zInfSlab = targetLevel.elevation + (slab.baseOffset ?? 0) - slabType.thickness;
          if (zInfSlab < zTop) {
            zTop = zInfSlab;
            limitingSlabId = slab.id;
          }
        }
      }
    }

    const heightEff = Math.max(0, zTop - zBase);
    return {
      zBase,
      zTop,
      heightEff,
      heightSource: 'constraint',
      ...(limitingSlabId ? { limitingSlabId } : {}),
    };
  }

  // Priorité 3 : Hauteur nominale du type de mur
  return {
    zBase,
    zTop: zBase + defaultHeight,
    heightEff: defaultHeight,
    heightSource: 'nominal',
  };
}

/**
 * Calcule la hauteur effective d'un mur en résolvant rigoureusement son altimétrie
 * et ses contraintes supérieures (ADR-045 [D2]).
 */
export function computeWallEffectiveHeight(
  wall: Wall,
  state: BimState,
  options?: ComputeWallEffectiveHeightOptions,
): number {
  return computeWallVerticalBounds(wall, state, options).heightEff;
}

/**
 * Calcule la pénétration physique (en mm) d'un mur dans les dalles d'étages supérieurs.
 * Ne détecte de collision que si le mur est effectivement couvert ou intersecté en 2D
 * par l'emprise solide de la dalle, évitant ainsi tout faux positif horizontal.
 */
export function computeWallSlabPenetration(wall: Wall, state: BimState): number {
  if (wall.heightOverride === undefined) {
    return 0;
  }

  const curLevel = state.levels[wall.levelId];
  const zBase = (curLevel?.elevation ?? 0) + (wall.baseOffset ?? 0);
  const zTop = zBase + wall.heightOverride;

  let maxPenetrationMm = 0;

  for (const sl of Object.values(state.slabs ?? {})) {
    const slLevel = state.levels[sl.levelId];
    if (slLevel && slLevel.elevation > (curLevel?.elevation ?? 0)) {
      const slType = state.slabTypes?.[sl.slabTypeId];
      if (slType) {
        let effectivePolygon;
        try {
          effectivePolygon = computeEffectiveSlabPolygon({
            boundary: sl.boundary,
            holes: sl.holes,
            openings: sl.openings,
          });
        } catch {
          continue;
        }

        if (isWallCoveredBySlab(wall, effectivePolygon)) {
          const zInf = slLevel.elevation + (sl.baseOffset ?? 0) - slType.thickness;
          if (zTop > zInf) {
            maxPenetrationMm = Math.max(maxPenetrationMm, zTop - zInf);
          }
        }
      }
    }
  }

  return maxPenetrationMm;
}

export {
  resolveWallGeometry,
  type ResolvedWall,
  type ResolvedOpening,
} from './walls/resolve.js';
