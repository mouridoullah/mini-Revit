import { type Vec2, vec2 } from '@tabax/geometry';
import { type BimState, type Roof, type GableRoofType, type FlatRoofType } from '../types.js';

export interface RoofPlane3D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number; // a*x + b*y + c*z + d = 0
}

export interface Slope {
  readonly id: string;
  readonly plane: RoofPlane3D;
  readonly polygon: readonly Vec2[]; // contour 2D délimité dans le plan de l'empreinte
  readonly pitchDeg: number;
  readonly zEave: number;
  readonly zRidge: number;
  readonly isRidgeCrossing?: boolean;
}

/**
 * Découpe un polygone par un demi-plan défini par n . (P - P0) >= 0 (Sutherland-Hodgman).
 */
function clipPolygonByHalfPlane(
  polygon: readonly Vec2[],
  p0: Vec2,
  normal: Vec2,
): Vec2[] {
  if (polygon.length === 0) return [];

  const output: Vec2[] = [];
  const len = polygon.length;

  for (let i = 0; i < len; i++) {
    const cur = polygon[i];
    const next = polygon[(i + 1) % len];
    if (!cur || !next) continue;

    const curDist = (cur.x - p0.x) * normal.x + (cur.y - p0.y) * normal.y;
    const nextDist = (next.x - p0.x) * normal.x + (next.y - p0.y) * normal.y;

    const curInside = curDist >= -1e-5;
    const nextInside = nextDist >= -1e-5;

    if (curInside) {
      output.push(cur);
      if (!nextInside) {
        // Sortie : point d'intersection
        const denom = curDist - nextDist;
        const t = Math.abs(denom) > 1e-9 ? curDist / denom : 0.5;
        output.push(vec2(cur.x + t * (next.x - cur.x), cur.y + t * (next.y - cur.y)));
      }
    } else if (nextInside) {
      // Entrée : point d'intersection
      const denom = curDist - nextDist;
      const t = Math.abs(denom) > 1e-9 ? curDist / denom : 0.5;
      output.push(vec2(cur.x + t * (next.x - cur.x), cur.y + t * (next.y - cur.y)));
    }
  }

  return output;
}

/**
 * Calcule les versants (slopes) et leurs équations de plans 3D pour une toiture (ADR-053 [4.1]).
 */
export function computeRoofSlopes(roof: Roof, state: BimState): Slope[] {
  const roofType = state.roofTypes?.[roof.roofTypeId];
  const level = state.levels[roof.levelId];
  const levelElevation = level?.elevation ?? 0;
  const zBase = levelElevation + (roof.baseOffset ?? 0);

  // 1. Toit plat (flat) : 1 versant horizontal
  if (!roofType || roofType.family === 'flat') {
    const flatType = roofType as FlatRoofType | undefined;
    const thickness = flatType?.thickness ?? 200;
    const zTop = zBase + thickness;

    return [
      {
        id: 'slope_flat',
        plane: { a: 0, b: 0, c: 1, d: -zTop },
        polygon: [...roof.footprint],
        pitchDeg: 0,
        zEave: zBase,
        zRidge: zBase,
        isRidgeCrossing: false,
      },
    ];
  }

  // 2. Toit à deux pans (gable)
  const gableType = roofType as GableRoofType;
  const slopeDeg = roof.slopeOverrideDeg ?? gableType.slopeDeg ?? 35;
  const pitchRad = (slopeDeg * Math.PI) / 180;
  const tanSlope = Math.tan(pitchRad);

  const ridgeAxis = roof.ridgeAxis ?? {
    start: vec2(0, 0),
    end: vec2(1000, 0),
  };

  const ridgeDx = ridgeAxis.end.x - ridgeAxis.start.x;
  const ridgeDy = ridgeAxis.end.y - ridgeAxis.start.y;
  const ridgeLen = Math.hypot(ridgeDx, ridgeDy);
  const uRidge = ridgeLen > 1e-5 ? vec2(ridgeDx / ridgeLen, ridgeDy / ridgeLen) : vec2(1, 0);

  // Normale unitaire perpendiculaire au faîtage
  const nRidge = vec2(-uRidge.y, uRidge.x);

  // Distance maximale par rapport à la ligne de faîtage pour déterminer le tirant / demi-portée
  let maxHalfSpan = 0;
  for (const v of roof.footprint) {
    const signedDist = (v.x - ridgeAxis.start.x) * nRidge.x + (v.y - ridgeAxis.start.y) * nRidge.y;
    maxHalfSpan = Math.max(maxHalfSpan, Math.abs(signedDist));
  }
  if (maxHalfSpan < 10) {
    maxHalfSpan = 4000; // valeur par défaut nominale
  }

  const totalRise = maxHalfSpan * tanSlope;
  const zRidge = zBase + totalRise;
  const zEave = zBase;

  // Découpage de l'empreinte en 2 versants (versant 1: nRidge >= 0, versant 2: -nRidge >= 0)
  const poly1 = clipPolygonByHalfPlane(roof.footprint, ridgeAxis.start, nRidge);
  const poly2 = clipPolygonByHalfPlane(roof.footprint, ridgeAxis.start, vec2(-nRidge.x, -nRidge.y));

  // Plan versant 1 : z = zRidge - tanSlope * ((P - P0) . nRidge)
  // => (tanSlope * nRidge.x) * x + (tanSlope * nRidge.y) * y + 1 * z - [zRidge + tanSlope * (nRidge . P0)] = 0
  const dotP0_1 = nRidge.x * ridgeAxis.start.x + nRidge.y * ridgeAxis.start.y;
  const plane1: RoofPlane3D = {
    a: tanSlope * nRidge.x,
    b: tanSlope * nRidge.y,
    c: 1,
    d: -(zRidge + tanSlope * dotP0_1),
  };

  // Plan versant 2 : z = zRidge + tanSlope * ((P - P0) . nRidge)
  // => (-tanSlope * nRidge.x) * x + (-tanSlope * nRidge.y) * y + 1 * z - [zRidge - tanSlope * (nRidge . P0)] = 0
  const plane2: RoofPlane3D = {
    a: -tanSlope * nRidge.x,
    b: -tanSlope * nRidge.y,
    c: 1,
    d: -(zRidge - tanSlope * dotP0_1),
  };

  const slopes: Slope[] = [];
  if (poly1.length >= 3) {
    slopes.push({
      id: 'slope_1',
      plane: plane1,
      polygon: poly1,
      pitchDeg: slopeDeg,
      zEave,
      zRidge,
      isRidgeCrossing: false,
    });
  }
  if (poly2.length >= 3) {
    slopes.push({
      id: 'slope_2',
      plane: plane2,
      polygon: poly2,
      pitchDeg: slopeDeg,
      zEave,
      zRidge,
      isRidgeCrossing: false,
    });
  }

  return slopes;
}
