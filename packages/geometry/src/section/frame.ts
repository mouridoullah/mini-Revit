import { type Vec2, vec2, sub, dot, add, mul, distance } from '../vec2.js';

/**
 * Repère orthonormé 2D associé à une ligne de coupe / élévation (ADR-063).
 *
 * - Axe horizontal s ∈ [0, L] le long de u = (end - start) / ||end - start||
 * - Axe de profondeur d ∈ [0, depth] le long de n = viewDirection * (-uy, ux) (pointant vers l'arrière-plan)
 * - L'axe vertical z est conservé directement en Z-up millimètres
 */
export interface SectionFrame2D {
  readonly start: Vec2;
  readonly end: Vec2;
  readonly length: number;
  readonly viewDirection: 1 | -1;
  readonly depth: number;
  readonly u: Vec2; // Vecteur unitaire horizontal le long du segment
  readonly n: Vec2; // Vecteur unitaire normal pointant vers l'arrière-plan (d > 0)
}

/**
 * Crée un repère de coupe 2D normalisé à partir des extrémités du segment et de la vue.
 */
export function createSectionFrame2D(
  start: Vec2,
  end: Vec2,
  viewDirection: 1 | -1 = 1,
  depth: number = 10_000,
): SectionFrame2D {
  const len = distance(start, end);
  const u =
    len > 1e-6
      ? vec2((end.x - start.x) / len, (end.y - start.y) / len)
      : vec2(1, 0);

  // n = viewDirection * (-uy, ux)
  const n = vec2(viewDirection * -u.y, viewDirection * u.x);

  return {
    start,
    end,
    length: len,
    viewDirection,
    depth,
    u,
    n,
  };
}

/**
 * Projette un point mondial 2D (x, y) dans les coordonnées de coupe (s, d).
 *
 * @param pt Point mondial (mm)
 * @param frame Repère de coupe
 * @returns { s, d } où s est l'abscisse le long du segment et d la distance orthogonale
 */
export function projectPointToSectionFrame(
  pt: Vec2,
  frame: SectionFrame2D,
): { s: number; d: number } {
  const v = sub(pt, frame.start);
  const s = dot(v, frame.u);
  const d = dot(v, frame.n);
  return { s, d };
}

/**
 * Reconvertit des coordonnées de coupe (s, d) en coordonnées mondiales 2D (x, y).
 */
export function unprojectPointFromSectionFrame(
  s: number,
  d: number,
  frame: SectionFrame2D,
): Vec2 {
  return add(frame.start, add(mul(frame.u, s), mul(frame.n, d)));
}
