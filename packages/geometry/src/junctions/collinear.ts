import { type Vec2, add, mul } from '../vec2.js';
import { segment2, intersectSegments } from '../segment.js';
import { type WallInput, type WallEnd } from './types.js';
import { getWallBoundaryAtEnd } from './miter.js';

/**
 * Résultat de la résolution d'une jonction colinéaire.
 */
export interface CollinearJunctionResult {
  readonly wall1Id: string;
  readonly wall2Id: string;
  readonly isOverlapping: boolean;
  /**
   * Sommets modifiés pour chaque mur à l'extrémité connectée.
   */
  readonly vertices1: readonly [Vec2, Vec2];
  readonly vertices2: readonly [Vec2, Vec2];
}

/**
 * Résout une jonction colinéaire entre deux murs alignés.
 *
 * Gère les murs aboutés bout-à-bout (avec ou sans différence d'épaisseur)
 * et les murs partiellement superposés (avec découpe prioritaire).
 */
export function solveCollinearJunction(
  wall1: WallInput,
  end1: WallEnd,
  wall2: WallInput,
  end2: WallEnd,
  nodePoint: Vec2,
): CollinearJunctionResult {
  const b1 = getWallBoundaryAtEnd(wall1, end1, nodePoint);
  const b2 = getWallBoundaryAtEnd(wall2, end2, nodePoint);

  // Vérifier s'il y a superposition le long de l'axe
  const s1 = segment2(wall1.start, wall1.end);
  const s2 = segment2(wall2.start, wall2.end);
  const inter = intersectSegments(s1, s2);

  const isOverlapping = inter.type === 'overlap';

  // Coupe droite orthogonale pour chaque mur au point de contact
  const p1Right = add(nodePoint, mul(b1.leftNormal, -b1.rightOffset));
  const p1Left = add(nodePoint, mul(b1.leftNormal, b1.leftOffset));

  const p2Right = add(nodePoint, mul(b2.leftNormal, -b2.rightOffset));
  const p2Left = add(nodePoint, mul(b2.leftNormal, b2.leftOffset));

  return {
    wall1Id: wall1.id,
    wall2Id: wall2.id,
    isOverlapping,
    vertices1: [p1Right, p1Left],
    vertices2: [p2Right, p2Left],
  };
}
