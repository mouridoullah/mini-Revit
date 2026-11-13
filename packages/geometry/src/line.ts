import { GEOM_CONFIG } from './constants.js';
import { type Vec2, sub, cross2d, dot, length, lengthSquared, add, mul } from './vec2.js';

/**
 * Droite infinie en 2D définie par un point d'ancrage et un vecteur directeur.
 * L(t) = origin + t * direction, pour t ∈ ℝ.
 */
export interface Line2 {
  readonly origin: Vec2;
  readonly direction: Vec2;
}

/**
 * Constructeur sécurisé d'une droite 2D.
 */
export function line2(origin: Vec2, direction: Vec2): Line2 {
  return Object.freeze({ origin, direction });
}

/**
 * Droite passant par deux points distincts A et B : L(t) = A + t * (B - A).
 */
export function lineFromPoints(a: Vec2, b: Vec2): Line2 {
  return line2(a, sub(b, a));
}

/**
 * Résultat discriminant de l'intersection de deux droites infinies.
 */
export type LineIntersectionResult =
  | {
      readonly type: 'point';
      readonly point: Vec2;
      readonly t: number; // Paramètre sur la ligne 1
      readonly u: number; // Paramètre sur la ligne 2
    }
  | {
      readonly type: 'parallel'; // Droites parallèles distinctes (aucun point d'intersection)
    }
  | {
      readonly type: 'collinear'; // Droites confondues (infinité de points)
    }
  | {
      readonly type: 'degenerate'; // Au moins une des droites a un vecteur directeur nul
      readonly reason: 'line1_zero' | 'line2_zero' | 'both_zero';
    };

/**
 * Vérifie si deux droites sont parallèles (ou colinéaires).
 * |r × s| <= tolerance * ||r|| * ||s||
 */
export function isParallelLines(
  l1: Line2,
  l2: Line2,
  tolerance: number = GEOM_CONFIG.EPSILON_COLLINEAR,
): boolean {
  const len1 = length(l1.direction);
  const len2 = length(l2.direction);
  if (len1 <= GEOM_CONFIG.EPSILON_NUMERICAL || len2 <= GEOM_CONFIG.EPSILON_NUMERICAL) {
    return false;
  }
  const cross = Math.abs(cross2d(l1.direction, l2.direction));
  return cross <= tolerance * len1 * len2;
}

/**
 * Vérifie si deux droites sont colinéaires (confondues).
 */
export function isCollinearLines(
  l1: Line2,
  l2: Line2,
  tolerance: number = GEOM_CONFIG.EPSILON_COLLINEAR,
): boolean {
  if (!isParallelLines(l1, l2, tolerance)) {
    return false;
  }
  const len1 = length(l1.direction);
  const diff = sub(l2.origin, l1.origin);
  const crossDiff = Math.abs(cross2d(diff, l1.direction));
  return crossDiff <= tolerance * len1 * Math.max(1, length(diff));
}

/**
 * Calcule l'intersection de deux droites infinies L1(P, r) et L2(Q, s).
 *
 * P + t * r = Q + u * s
 * t * (r × s) = (Q - P) × s
 */
export function intersectLines(l1: Line2, l2: Line2): LineIntersectionResult {
  const len1 = length(l1.direction);
  const len2 = length(l2.direction);

  const zero1 = len1 <= GEOM_CONFIG.EPSILON_NUMERICAL;
  const zero2 = len2 <= GEOM_CONFIG.EPSILON_NUMERICAL;

  if (zero1 && zero2) {
    return { type: 'degenerate', reason: 'both_zero' };
  }
  if (zero1) {
    return { type: 'degenerate', reason: 'line1_zero' };
  }
  if (zero2) {
    return { type: 'degenerate', reason: 'line2_zero' };
  }

  const denom = cross2d(l1.direction, l2.direction);
  const absDenom = Math.abs(denom);
  const scale = len1 * len2;

  // Parallèles ou colinéaires
  if (absDenom <= GEOM_CONFIG.EPSILON_COLLINEAR * scale) {
    const diff = sub(l2.origin, l1.origin);
    const crossDiff = Math.abs(cross2d(diff, l1.direction));
    if (crossDiff <= GEOM_CONFIG.EPSILON_COLLINEAR * len1 * Math.max(1, length(diff))) {
      return { type: 'collinear' };
    }
    return { type: 'parallel' };
  }

  const diff = sub(l2.origin, l1.origin);
  const t = cross2d(diff, l2.direction) / denom;
  const u = cross2d(diff, l1.direction) / denom;

  const point = add(l1.origin, mul(l1.direction, t));

  return {
    type: 'point',
    point,
    t,
    u,
  };
}

/**
 * Projection orthogonale d'un point P sur une droite L(origin, direction).
 *
 * L(t) = origin + t * direction
 * t = ((P - origin) · direction) / ||direction||²
 */
export function projectPointOnLine(
  p: Vec2,
  line: Line2,
): { readonly point: Vec2; readonly t: number } {
  const lenSq = lengthSquared(line.direction);
  if (lenSq <= GEOM_CONFIG.EPSILON_DISTANCE_SQUARED) {
    return { point: line.origin, t: 0 };
  }
  const diff = sub(p, line.origin);
  const t = dot(diff, line.direction) / lenSq;
  const point = add(line.origin, mul(line.direction, t));
  return { point, t };
}
