import { type Dimension, type BimState, type ElementId } from '../types.js';

/**
 * Calcule dynamiquement la valeur d'une cotation 2D à partir de ses références architecturales.
 *
 * Invariant BIM :
 * - 1 référence [wallId] : longueur axiale du mur (distance euclidienne entre start et end).
 * - 2 références [wallId1, wallId2] : distance entre les deux murs.
 *   Si les deux murs sont parallèles, la distance orthogonale exacte est calculée.
 *   Sinon, la distance entre leurs milieux est retournée.
 */
export function computeDimensionValue(dim: Pick<Dimension, 'references'>, state: BimState): number {
  if (dim.references.length === 0) {
    return 0;
  }

  if (dim.references.length === 1) {
    const wallId = dim.references[0] as ElementId;
    const wall = state.walls[wallId];
    if (!wall) return 0;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    return Math.round(Math.hypot(dx, dy) * 1000) / 1000;
  }

  if (dim.references.length >= 2) {
    const w1 = state.walls[dim.references[0] as ElementId];
    const w2 = state.walls[dim.references[1] as ElementId];
    if (!w1 || !w2) return 0;

    const dx1 = w1.end.x - w1.start.x;
    const dy1 = w1.end.y - w1.start.y;
    const len1 = Math.hypot(dx1, dy1);

    const m1 = { x: (w1.start.x + w1.end.x) / 2, y: (w1.start.y + w1.end.y) / 2 };
    const m2 = { x: (w2.start.x + w2.end.x) / 2, y: (w2.start.y + w2.end.y) / 2 };

    if (len1 > 1e-6) {
      // Normale unitaire au mur 1
      const nx = -dy1 / len1;
      const ny = dx1 / len1;
      // Distance orthogonale projetée
      const dist = Math.abs((m2.x - m1.x) * nx + (m2.y - m1.y) * ny);
      return Math.round(dist * 1000) / 1000;
    }

    return Math.round(Math.hypot(m2.x - m1.x, m2.y - m1.y) * 1000) / 1000;
  }

  return 0;
}
