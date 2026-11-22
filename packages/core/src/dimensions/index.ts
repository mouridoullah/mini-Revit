import { type Dimension, type BimState, type ElementId } from '../types.js';

export * from './auto-dimension.js';

/**
 * Calcule dynamiquement la valeur d'une cotation 2D à partir de ses références architecturales.
 *
 * Invariant BIM :
 * - 0 référence : cotation libre entre `startPoint` et `endPoint`.
 * - 1 référence [wallId] avec `span` : trumeau ou baie paramétrique le long du mur.
 * - 1 référence [wallId] sans `span` : longueur axiale complète du mur.
 * - 2 références [wallId1, wallId2] : distance entre les deux murs (orthogonale si parallèles, milieux sinon).
 */
export function computeDimensionValue(
  dim: Pick<Dimension, 'references' | 'startPoint' | 'endPoint' | 'span'>,
  state: BimState,
): number {
  if (dim.references.length === 0) {
    if (dim.startPoint && dim.endPoint) {
      const dx = dim.endPoint.x - dim.startPoint.x;
      const dy = dim.endPoint.y - dim.startPoint.y;
      return Math.round(Math.hypot(dx, dy) * 1000) / 1000;
    }
    return 0;
  }

  if (dim.references.length === 1) {
    const wallId = dim.references[0] as ElementId;
    const wall = state.walls[wallId];
    if (!wall) return 0;

    if (dim.span) {
      const spanLen = Math.abs(dim.span.endOffset - dim.span.startOffset);
      return Math.round(spanLen * 1000) / 1000;
    }

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
