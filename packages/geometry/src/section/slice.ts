import { type Vec2, vec2, add, mul, distance } from '../vec2.js';
import { type Segment2, segment2, intersectSegments } from '../segment.js';
import { isPointInPolygon } from '../polygon.js';
import { GEOM_CONFIG } from '../constants.js';

export interface SliceInterval {
  readonly startS: number; // Abscisse de début le long du segment [0, L]
  readonly endS: number;   // Abscisse de fin le long du segment [0, L]
  readonly startPt: Vec2;  // Coordonnées mondiales du point d'entrée
  readonly endPt: Vec2;    // Coordonnées mondiales du point de sortie
}

/**
 * Calcule l'intersection analytique d'un segment fini [start, end] avec un polygone 2D simple.
 * Retourne les sous-intervalles ordonnés où le segment traverse l'intérieur du polygone.
 */
export function sliceSegmentWithPolygon(
  start: Vec2,
  end: Vec2,
  polygon: readonly Vec2[],
  tolerance: number = GEOM_CONFIG.EPSILON_DISTANCE,
): readonly SliceInterval[] {
  return sliceSegmentWithPolygonWithHoles(start, end, polygon, undefined, tolerance);
}

/**
 * Calcule l'intersection analytique d'un segment fini [start, end] avec un polygone 2D avec trous.
 * Retourne les sous-intervalles ordonnés situés à l'intérieur du contour extérieur et hors des trous.
 */
export function sliceSegmentWithPolygonWithHoles(
  start: Vec2,
  end: Vec2,
  outer: readonly Vec2[],
  holes?: readonly (readonly Vec2[])[],
  tolerance: number = GEOM_CONFIG.EPSILON_DISTANCE,
): readonly SliceInterval[] {
  const n = outer.length;
  if (n < 3) return [];

  const segLen = distance(start, end);
  if (segLen < tolerance) return [];

  const u = vec2((end.x - start.x) / segLen, (end.y - start.y) / segLen);
  const mainSeg: Segment2 = segment2(start, end);

  // 1. Collecter toutes les abscisses s d'intersection avec les arêtes extérieures
  const sList: number[] = [0, segLen];

  function collectIntersections(ring: readonly Vec2[]) {
    const ringLen = ring.length;
    for (let i = 0; i < ringLen; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % ringLen];
      if (!p1 || !p2) continue;

      const edge = segment2(p1, p2);
      const res = intersectSegments(mainSeg, edge);
      if (res.type === 'point') {
        const s = res.t * segLen;
        if (s >= -tolerance && s <= segLen + tolerance) {
          sList.push(Math.max(0, Math.min(segLen, s)));
        }
      } else if (res.type === 'overlap') {
        const s1 = res.tRange[0] * segLen;
        const s2 = res.tRange[1] * segLen;
        sList.push(Math.max(0, Math.min(segLen, s1)));
        sList.push(Math.max(0, Math.min(segLen, s2)));
      }
    }
  }

  collectIntersections(outer);

  if (holes) {
    for (const hole of holes) {
      if (hole.length >= 3) {
        collectIntersections(hole);
      }
    }
  }

  // 2. Trier et dédupliquer les abscisses s
  sList.sort((a, b) => a - b);
  const uniqueS: number[] = [];
  for (let i = 0; i < sList.length; i++) {
    const s = sList[i];
    if (s === undefined) continue;
    const prev = uniqueS[uniqueS.length - 1];
    if (prev === undefined || s - prev > Math.max(0.01, tolerance)) {
      uniqueS.push(s);
    }
  }

  if (uniqueS.length < 2) return [];

  // 3. Tester chaque intervalle élémentaire [s_i, s_{i+1}]
  const rawIntervals: [number, number][] = [];

  for (let i = 0; i < uniqueS.length - 1; i++) {
    const s1 = uniqueS[i];
    const s2 = uniqueS[i + 1];
    if (s1 === undefined || s2 === undefined) continue;
    if (s2 - s1 < Math.max(0.1, tolerance)) continue;

    const sMid = (s1 + s2) / 2;
    const pMid = add(start, mul(u, sMid));

    // Doit être dans le contour extérieur
    const inOuter = isPointInPolygon(pMid, outer);
    if (!inOuter) continue;

    // Et en dehors de tous les trous
    let inAnyHole = false;
    if (holes) {
      for (const hole of holes) {
        if (isPointInPolygon(pMid, hole)) {
          inAnyHole = true;
          break;
        }
      }
    }

    if (!inAnyHole) {
      rawIntervals.push([s1, s2]);
    }
  }

  if (rawIntervals.length === 0) return [];

  // 4. Fusionner les intervalles adjacents
  const merged: [number, number][] = [];
  let cur = rawIntervals[0];
  if (!cur) return [];

  for (let i = 1; i < rawIntervals.length; i++) {
    const next = rawIntervals[i];
    if (!next) continue;
    if (Math.abs(next[0] - cur[1]) <= Math.max(0.1, tolerance * 2)) {
      cur = [cur[0], next[1]];
    } else {
      merged.push(cur);
      cur = next;
    }
  }
  merged.push(cur);

  // 5. Convertir en SliceInterval
  return merged.map(([sStart, sEnd]) => ({
    startS: sStart,
    endS: sEnd,
    startPt: add(start, mul(u, sStart)),
    endPt: add(start, mul(u, sEnd)),
  }));
}
