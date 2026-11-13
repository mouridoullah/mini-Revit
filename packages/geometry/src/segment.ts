import { GEOM_CONFIG } from './constants.js';
import { type Vec2, sub, cross2d, dot, length, lengthSquared, add, mul, distance } from './vec2.js';

/**
 * Segment fini délimité par ses deux extrémités start et end.
 * S(t) = start + t * (end - start), pour t ∈ [0, 1].
 */
export interface Segment2 {
  readonly start: Vec2;
  readonly end: Vec2;
}

/**
 * Constructeur sécurisé d'un segment 2D.
 */
export function segment2(start: Vec2, end: Vec2): Segment2 {
  return Object.freeze({ start, end });
}

/**
 * Vecteur directeur non normalisé d'un segment : end - start.
 */
export function segmentVector(s: Segment2): Vec2 {
  return sub(s.end, s.start);
}

/**
 * Longueur euclidienne d'un segment.
 */
export function segmentLength(s: Segment2): number {
  return distance(s.start, s.end);
}

/**
 * Résultat discriminant exhaustif de l'intersection de deux segments finis.
 */
export type SegmentIntersectionResult =
  | {
      readonly type: 'point';
      readonly point: Vec2;
      readonly t: number; // Paramètre scalaire sur segment 1, t ∈ [0, 1]
      readonly u: number; // Paramètre scalaire sur segment 2, u ∈ [0, 1]
    }
  | {
      readonly type: 'none'; // Segments disjoints (parallèles ou sécants hors limites)
    }
  | {
      readonly type: 'overlap';
      readonly segment: readonly [Vec2, Vec2]; // Sous-segment de chevauchement commun
      readonly tRange: readonly [number, number]; // [t_min, t_max] sur segment 1
      readonly uRange: readonly [number, number]; // [u_min, u_max] sur segment 2
    }
  | {
      readonly type: 'degenerate';
      readonly reason: 'segment1_zero' | 'segment2_zero' | 'both_zero';
    };

/**
 * Vérifie si deux segments finis sont parallèles (ou colinéaires).
 */
export function isParallelSegments(
  s1: Segment2,
  s2: Segment2,
  tolerance: number = GEOM_CONFIG.EPSILON_COLLINEAR,
): boolean {
  const d1 = segmentVector(s1);
  const d2 = segmentVector(s2);
  const len1 = length(d1);
  const len2 = length(d2);

  if (len1 <= GEOM_CONFIG.EPSILON_DISTANCE || len2 <= GEOM_CONFIG.EPSILON_DISTANCE) {
    return false;
  }

  const cross = Math.abs(cross2d(d1, d2));
  return cross <= tolerance * len1 * len2;
}

/**
 * Vérifie si deux segments finis sont colinéaires (appartiennent à la même droite support).
 */
export function isCollinearSegments(
  s1: Segment2,
  s2: Segment2,
  tolerance: number = GEOM_CONFIG.EPSILON_COLLINEAR,
): boolean {
  if (!isParallelSegments(s1, s2, tolerance)) {
    return false;
  }
  const d1 = segmentVector(s1);
  const len1 = length(d1);
  const diff = sub(s2.start, s1.start);
  const crossDiff = Math.abs(cross2d(diff, d1));
  return (
    crossDiff <= Math.max(GEOM_CONFIG.EPSILON_DISTANCE * len1, tolerance * len1 * length(diff))
  );
}

/**
 * Calcule l'intersection de deux segments finis S1[A, B] et S2[C, D].
 *
 * Traite exhaustivement :
 * - Les intersections en un point intérieur ou sur une extrémité.
 * - L'absence d'intersection.
 * - Le contact en un seul sommet entre segments colinéaires.
 * - Le chevauchement partiel ou total entre segments colinéaires.
 * - Les segments dégénérés (longueur nulle).
 */
export function intersectSegments(s1: Segment2, s2: Segment2): SegmentIntersectionResult {
  const d1 = segmentVector(s1);
  const d2 = segmentVector(s2);
  const len1 = length(d1);
  const len2 = length(d2);

  const zero1 = len1 <= GEOM_CONFIG.EPSILON_DISTANCE;
  const zero2 = len2 <= GEOM_CONFIG.EPSILON_DISTANCE;

  if (zero1 && zero2) {
    return { type: 'degenerate', reason: 'both_zero' };
  }
  if (zero1) {
    return { type: 'degenerate', reason: 'segment1_zero' };
  }
  if (zero2) {
    return { type: 'degenerate', reason: 'segment2_zero' };
  }

  const denom = cross2d(d1, d2);
  const absDenom = Math.abs(denom);
  const scale = len1 * len2;

  // 1. Cas Parallèle ou Colinéaire
  if (absDenom <= GEOM_CONFIG.EPSILON_COLLINEAR * scale) {
    // Vérifier si colinéaires
    const diff = sub(s2.start, s1.start);
    const distFromLine = Math.abs(cross2d(diff, d1)) / len1;

    if (distFromLine > GEOM_CONFIG.EPSILON_DISTANCE) {
      return { type: 'none' };
    }

    // Projeter S2 sur S1 pour obtenir les coordonnées paramétriques le long de S1
    const len1Sq = len1 * len1;
    const tC = dot(sub(s2.start, s1.start), d1) / len1Sq;
    const tD = dot(sub(s2.end, s1.start), d1) / len1Sq;

    const t2Min = Math.min(tC, tD);
    const t2Max = Math.max(tC, tD);

    const epsT = GEOM_CONFIG.EPSILON_DISTANCE / len1;

    // Intersection d'intervalles [0, 1] et [t2Min, t2Max]
    const tOverlapStart = Math.max(0, t2Min);
    const tOverlapEnd = Math.min(1, t2Max);

    if (tOverlapEnd < tOverlapStart - epsT) {
      return { type: 'none' }; // Colinéaires mais disjoints
    }

    // Contact en un seul point à une extrémité
    if (Math.abs(tOverlapEnd - tOverlapStart) <= epsT) {
      const tMid = Math.max(0, Math.min(1, (tOverlapStart + tOverlapEnd) / 2));
      const pt = add(s1.start, mul(d1, tMid));
      const uMid = Math.max(0, Math.min(1, dot(sub(pt, s2.start), d2) / (len2 * len2)));
      return {
        type: 'point',
        point: pt,
        t: tMid,
        u: uMid,
      };
    }

    // Chevauchement le long d'un segment
    const pt0 = add(s1.start, mul(d1, tOverlapStart));
    const pt1 = add(s1.start, mul(d1, tOverlapEnd));

    const len2Sq = len2 * len2;
    const u0 = dot(sub(pt0, s2.start), d2) / len2Sq;
    const u1 = dot(sub(pt1, s2.start), d2) / len2Sq;

    const uMin = Math.max(0, Math.min(1, Math.min(u0, u1)));
    const uMax = Math.max(0, Math.min(1, Math.max(u0, u1)));

    return {
      type: 'overlap',
      segment: [pt0, pt1],
      tRange: [tOverlapStart, tOverlapEnd],
      uRange: [uMin, uMax],
    };
  }

  // 2. Cas Sécant (Non Parallèle)
  const diff = sub(s2.start, s1.start);
  const t = cross2d(diff, d2) / denom;
  const u = cross2d(diff, d1) / denom;

  const epsT = GEOM_CONFIG.EPSILON_DISTANCE / len1;
  const epsU = GEOM_CONFIG.EPSILON_DISTANCE / len2;

  if (t >= -epsT && t <= 1 + epsT && u >= -epsU && u <= 1 + epsU) {
    const clampedT = Math.max(0, Math.min(1, t));
    const clampedU = Math.max(0, Math.min(1, u));
    const point = add(s1.start, mul(d1, clampedT));
    return {
      type: 'point',
      point,
      t: clampedT,
      u: clampedU,
    };
  }

  return { type: 'none' };
}

/**
 * Projection orthogonale d'un point P sur un segment fermé S[start, end].
 * Le paramètre t retourné est clampé à [0, 1].
 */
export function projectPointOnSegment(
  p: Vec2,
  segment: Segment2,
): { readonly point: Vec2; readonly t: number } {
  const d = segmentVector(segment);
  const lenSq = lengthSquared(d);

  if (lenSq <= GEOM_CONFIG.EPSILON_DISTANCE_SQUARED) {
    return { point: segment.start, t: 0 };
  }

  const diff = sub(p, segment.start);
  const rawT = dot(diff, d) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const point = add(segment.start, mul(d, t));

  return { point, t };
}

/**
 * Calcule la distance minimale d'un point P à un segment fini S[start, end].
 * La distance retournée est rigoureusement supérieure ou égale à zéro.
 */
export function distancePointToSegment(p: Vec2, segment: Segment2): number {
  const proj = projectPointOnSegment(p, segment);
  return distance(p, proj.point);
}
