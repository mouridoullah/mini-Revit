import polygonClipping from 'polygon-clipping';
import { type Vec2, vec2 } from '../vec2.js';
import { signedArea } from '../polygon.js';

export class SlabGeometryError extends Error {
  public constructor(
    public readonly code: 'SLAB_EMPTY' | 'SLAB_SEVERED' | 'INVALID_SLAB_BOUNDARY',
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'SlabGeometryError';
  }
}

export interface EffectiveSlabPolygonResult {
  /** Contour externe de la dalle, obligatoirement orienté dans le sens trigonométrique (CCW). */
  readonly outer: readonly Vec2[];
  /** Anneaux intérieurs (réservations / trémies), obligatoirement orientés dans le sens horaire (CW). */
  readonly holes: readonly (readonly Vec2[])[];
}

export interface ComputeEffectiveSlabPolygonOptions {
  /** Contour principal de la dalle (>= 3 sommets). */
  readonly boundary: readonly Vec2[];
  /** Réservations ou évidements manuels définis sur la dalle. */
  readonly holes?: readonly (readonly Vec2[])[] | undefined;
  /** Trémies traversantes dérivées (ouvertures de plancher, cages d'escalier, etc.). */
  readonly openings?: readonly (readonly Vec2[])[] | undefined;
}

function toClosedRing(pts: readonly Vec2[]): [number, number][] {
  const ring: [number, number][] = pts.map((p) => [p.x, p.y]);
  const p0 = ring[0];
  const pn = ring[ring.length - 1];
  if (p0 && pn && (p0[0] !== pn[0] || p0[1] !== pn[1])) {
    ring.push([p0[0], p0[1]]);
  }
  return ring;
}

function toVec2List(ring: readonly (readonly [number, number])[]): Vec2[] {
  const result: Vec2[] = [];
  const len = ring.length;
  const p0 = ring[0];
  const pn = ring[len - 1];
  const count = len > 1 && p0 && pn && p0[0] === pn[0] && p0[1] === pn[1] ? len - 1 : len;
  for (let i = 0; i < count; i++) {
    const pt = ring[i];
    if (pt) {
      result.push(vec2(pt[0], pt[1]));
    }
  }
  return result;
}

/**
 * Calcule le polygone effectif d'une dalle après soustraction booléenne des trous manuels
 * et des trémies géométriques traversantes (ADR-045 / Phase 6.1a).
 *
 * Règles métier & invariants :
 * 1. Découpe booléenne rigoureuse via polygon-clipping (union des réservations puis différence avec boundary).
 * 2. Si la surface résiduelle est <= 0 -> throw SLAB_EMPTY.
 * 3. Si la dalle est scindée en plusieurs polygones disjoints -> throw SLAB_SEVERED.
 * 4. Les trémies en rive (mordant sur l'extérieur) modifient le contour externe (encoches) sans générer d'îlots invalides.
 * 5. Normalisation d'orientation canonique : outer CCW (aire > 0), tous les trous CW (aire < 0).
 */
export function computeEffectiveSlabPolygon(
  options: ComputeEffectiveSlabPolygonOptions,
): EffectiveSlabPolygonResult {
  const { boundary, holes = [], openings = [] } = options;

  if (!boundary || boundary.length < 3) {
    throw new SlabGeometryError(
      'INVALID_SLAB_BOUNDARY',
      'Le contour de la dalle doit comporter au moins 3 sommets.',
    );
  }

  const baseArea = signedArea(boundary);
  if (Math.abs(baseArea) < 1e-4) {
    throw new SlabGeometryError(
      'SLAB_EMPTY',
      'Le contour initial de la dalle a une surface nulle.',
    );
  }

  const allCutouts = [...holes, ...openings].filter((h) => h && h.length >= 3);

  // Cas trivial : aucun évidement
  if (allCutouts.length === 0) {
    const outer = [...boundary];
    if (signedArea(outer) < 0) {
      outer.reverse();
    }
    return {
      outer,
      holes: [],
    };
  }

  const pc =
    (polygonClipping as unknown as { default?: typeof polygonClipping }).default ?? polygonClipping;

  const subject: [number, number][][][] = [[toClosedRing(boundary)]];
  const clips: [number, number][][][] = allCutouts.map((c) => [toClosedRing(c)]);

  let diffResult: [number, number][][][];
  try {
    diffResult = pc.difference(subject, ...clips);
  } catch (err) {
    throw new SlabGeometryError(
      'INVALID_SLAB_BOUNDARY',
      `Erreur lors du calcul booléen de découpe de dalle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Filtrer les éventuels micro-fragments numériques (surface < 1 mm²)
  const validPolys = diffResult.filter((poly) => {
    if (!poly[0]) return false;
    const ringPts = toVec2List(poly[0]);
    return Math.abs(signedArea(ringPts)) > 1.0;
  });

  if (validPolys.length === 0) {
    throw new SlabGeometryError(
      'SLAB_EMPTY',
      'La dalle a une surface effective nulle ou négative après découpe des trémies.',
    );
  }

  if (validPolys.length > 1) {
    throw new SlabGeometryError(
      'SLAB_SEVERED',
      `La trémie scinde la dalle en ${validPolys.length} parties disjointes distinctes.`,
    );
  }

  const poly = validPolys[0];
  const firstRing = poly?.[0];
  if (!poly || !firstRing) {
    throw new SlabGeometryError(
      'SLAB_EMPTY',
      'La dalle a une surface effective nulle ou négative après découpe des trémies.',
    );
  }
  const rawOuter = toVec2List(firstRing);
  const outer = [...rawOuter];
  // Normalisation CCW (sens trigonométrique positif)
  if (signedArea(outer) < 0) {
    outer.reverse();
  }

  const effectiveHoles: Vec2[][] = [];
  for (let i = 1; i < poly.length; i++) {
    const holeRing = poly[i];
    if (!holeRing) continue;
    const rawHole = toVec2List(holeRing);
    // Ignorer les micro-trous numériques < 1 mm²
    if (Math.abs(signedArea(rawHole)) > 1.0) {
      const hole = [...rawHole];
      // Normalisation CW (sens horaire négatif)
      if (signedArea(hole) > 0) {
        hole.reverse();
      }
      effectiveHoles.push(hole);
    }
  }

  return {
    outer,
    holes: effectiveHoles,
  };
}
