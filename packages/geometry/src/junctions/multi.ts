import { GEOM_CONFIG } from '../constants.js';
import { type Vec2, add, mul, distance } from '../vec2.js';
import { intersectLines } from '../line.js';
import { type WallInput, type WallEnd } from './types.js';
import { getWallBoundaryAtEnd, type WallBoundaryAtEnd } from './miter.js';

/**
 * Résultat d'une jonction multiple (Y ou étoile) pour un mur participant.
 */
export interface MultiJunctionEndResult {
  readonly wallId: string;
  readonly end: WallEnd;
  readonly vertices: readonly [Vec2, Vec2]; // [pRight, pLeft]
}

/**
 * Résout une jonction en étoile / Y regroupant 3 murs ou davantage au même nœud topologique.
 *
 * Algorithme radial CCW :
 * 1. Trie les murs incidents par angle croissant de leur vecteur directeur sortant.
 * 2. Pour chaque paire consécutive (k, k+1), calcule l'intersection entre le bord gauche de k
 *    et le bord droit de k+1.
 * 3. Applique la limite d'onglet sur chaque angle.
 * 4. Attribue à chaque mur ses sommets droit et gauche.
 */
export function solveMultiJunction(
  incidentWalls: readonly { wall: WallInput; end: WallEnd }[],
  nodePoint: Vec2,
  miterLimitRatio: number = GEOM_CONFIG.MITER_LIMIT_RATIO,
): readonly MultiJunctionEndResult[] {
  const m = incidentWalls.length;
  if (m < 2) return [];

  // Calcul des bordures d'extrémité
  const boundaries: (WallBoundaryAtEnd & { angle: number })[] = incidentWalls.map(
    ({ wall, end }) => {
      const b = getWallBoundaryAtEnd(wall, end, nodePoint);
      let angle = Math.atan2(b.outgoingDir.y, b.outgoingDir.x);
      if (angle < 0) angle += 2 * Math.PI;
      return { ...b, angle };
    },
  );

  // Tri CCW par angle croissant
  boundaries.sort((a, b) => a.angle - b.angle);

  const corners: Vec2[] = [];

  for (let k = 0; k < m; k++) {
    const cur = boundaries[k];
    const next = boundaries[(k + 1) % m];
    if (!cur || !next) continue;

    const inter = intersectLines(cur.leftLine, next.rightLine);
    let cornerPt: Vec2;

    if (inter.type === 'point') {
      cornerPt = inter.point;
      const maxT = Math.max(cur.leftOffset + cur.rightOffset, next.leftOffset + next.rightOffset);
      if (distance(cornerPt, nodePoint) > miterLimitRatio * maxT) {
        // Troncature de sécurité
        cornerPt = add(nodePoint, mul(cur.outgoingDir, 0));
      }
    } else {
      cornerPt = nodePoint;
    }

    corners.push(cornerPt);
  }

  // Attribution des sommets à chaque mur
  const results: MultiJunctionEndResult[] = [];
  for (let k = 0; k < m; k++) {
    const cur = boundaries[k];
    const prevIdx = (k - 1 + m) % m;
    const pRight = corners[prevIdx];
    const pLeft = corners[k];

    if (cur && pRight && pLeft) {
      results.push({
        wallId: cur.wallId,
        end: cur.end,
        vertices: [pRight, pLeft],
      });
    }
  }

  return results;
}
