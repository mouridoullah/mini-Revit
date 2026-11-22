import polygonClipping from 'polygon-clipping';
import { type Vec2, vec2, signedArea } from '@tabax/geometry';
import { type Roof, type RoofOpening } from '../types.js';

export class RoofGeometryError extends Error {
  public constructor(
    public readonly code: 'ROOF_EMPTY' | 'ROOF_SEVERED' | 'INVALID_ROOF_BOUNDARY',
    message: string,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'RoofGeometryError';
  }
}

export interface EffectiveRoofPolygonResult {
  readonly effectiveFootprint: readonly Vec2[];
  readonly effectiveHoles: readonly (readonly Vec2[])[];
  readonly wasTrimmed: boolean;
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

function openingToRing(opening: RoofOpening | readonly Vec2[]): [number, number][] {
  if (Array.isArray(opening)) {
    return toClosedRing(opening as readonly Vec2[]);
  }
  const o = opening as RoofOpening;
  return toClosedRing([
    vec2(o.offsetU, o.offsetV),
    vec2(o.offsetU + o.width, o.offsetV),
    vec2(o.offsetU + o.width, o.offsetV + o.height),
    vec2(o.offsetU, o.offsetV + o.height),
  ]);
}

/**
 * Calcule le polygone effectif d'une toiture après soustraction de ses ouvertures (ADR-053 [D3]).
 *
 * Règles & invariants :
 * 1. Découpe booléenne via polygon-clipping (différence entre l'empreinte et les ouvertures).
 * 2. Si la surface résiduelle est <= 0 -> throw ROOF_EMPTY.
 * 3. Si l'ouverture sépare la toiture en plusieurs îlots disjoints -> throw ROOF_SEVERED.
 * 4. Les ouvertures en rive (intersectant le contour) rognent le contour externe (wasTrimmed = true).
 * 5. Normalisation d'orientation : outer CCW (aire > 0), trous CW (aire < 0).
 */
export function computeEffectiveRoofPolygon(
  roof: Roof,
  openings: readonly (RoofOpening | readonly Vec2[])[] = [],
): EffectiveRoofPolygonResult {
  const footprint = roof.footprint;

  if (!footprint || footprint.length < 3) {
    throw new RoofGeometryError(
      'INVALID_ROOF_BOUNDARY',
      'Le contour de la toiture doit comporter au moins 3 sommets.',
    );
  }

  const baseArea = signedArea(footprint);
  if (Math.abs(baseArea) < 1e-4) {
    throw new RoofGeometryError(
      'ROOF_EMPTY',
      'Le contour initial de la toiture a une surface nulle.',
    );
  }

  const validOpenings = openings.filter((op) => {
    if (Array.isArray(op)) {
      return op.length >= 3;
    }
    const o = op as RoofOpening;
    return o && o.width > 0 && o.height > 0;
  });

  // Cas trivial : aucune ouverture
  if (validOpenings.length === 0) {
    const outer = [...footprint];
    if (signedArea(outer) < 0) {
      outer.reverse();
    }
    return {
      effectiveFootprint: outer,
      effectiveHoles: [],
      wasTrimmed: false,
    };
  }

  const subjectRing = toClosedRing(footprint);
  const subjectGeom: [number, number][][][] = [[subjectRing]];

  const clippingRings: [number, number][][] = validOpenings.map(openingToRing);
  const clippingGeom: [number, number][][][] = clippingRings.map((r) => [r]);

  let diffResult: polygonClipping.MultiPolygon;
  try {
    diffResult = polygonClipping.difference(subjectGeom, clippingGeom);
  } catch (err) {
    throw new RoofGeometryError(
      'ROOF_EMPTY',
      `Échec lors du calcul booléen de la toiture: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!diffResult || diffResult.length === 0) {
    throw new RoofGeometryError(
      'ROOF_EMPTY',
      'La toiture a été intégralement supprimée par les ouvertures (surface nulle).',
    );
  }

  // Filtrer les îlots d'aire significative (> 1000 mm²)
  const significantIslands = diffResult.filter((poly) => {
    const outerRing = poly[0];
    if (!outerRing) return false;
    const pts = toVec2List(outerRing);
    return Math.abs(signedArea(pts)) > 1000;
  });

  if (significantIslands.length === 0) {
    throw new RoofGeometryError(
      'ROOF_EMPTY',
      'La toiture a été intégralement supprimée par les ouvertures.',
    );
  }

  if (significantIslands.length > 1) {
    throw new RoofGeometryError(
      'ROOF_SEVERED',
      `Une ouverture a scindé la toiture en ${significantIslands.length} parties disjointes.`,
    );
  }

  const targetIsland = significantIslands[0];
  if (!targetIsland) {
    throw new RoofGeometryError('ROOF_EMPTY', 'Toiture vide après découpe.');
  }

  const rawOuterRing = targetIsland[0];
  if (!rawOuterRing) {
    throw new RoofGeometryError('ROOF_EMPTY', 'Contour externe manquant.');
  }

  const outer = toVec2List(rawOuterRing);
  if (signedArea(outer) < 0) {
    outer.reverse();
  }

  const holes: Vec2[][] = [];
  for (let i = 1; i < targetIsland.length; i++) {
    const holeRing = targetIsland[i];
    if (holeRing) {
      const h = toVec2List(holeRing);
      if (h.length >= 3) {
        if (signedArea(h) > 0) {
          h.reverse();
        }
        holes.push(h);
      }
    }
  }

  // Déterminer si le contour externe a été rogné (trimmed)
  let wasTrimmed = false;
  if (outer.length !== footprint.length) {
    wasTrimmed = true;
  } else {
    const origArea = Math.abs(signedArea(footprint));
    const newOuterArea = Math.abs(signedArea(outer));
    if (Math.abs(origArea - newOuterArea) > 10) {
      wasTrimmed = true;
    }
  }

  return {
    effectiveFootprint: outer,
    effectiveHoles: holes,
    wasTrimmed,
  };
}
