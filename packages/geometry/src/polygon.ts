import { type Vec2, vec2, dot, sub, add, mul, distance } from './vec2.js';
import { GEOM_CONFIG } from './constants.js';

/**
 * Calcule l'aire signée d'un polygone 2D via la formule du lacet de Gauss (Shoelace formula).
 *
 * Résultat > 0 : Orientation anti-horaire (CCW)
 * Résultat < 0 : Orientation horaire (CW)
 * Résultat = 0 : Polygone dégénéré ou aplati
 *
 * L'unité retournée est le mm² (diviser par 1e6 pour obtenir des m²).
 */
export function signedArea(vertices: readonly Vec2[]): number {
  const n = vertices.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];
    if (current && next) {
      sum += current.x * next.y - next.x * current.y;
    }
  }
  return sum / 2;
}

/**
 * Vérifie si un polygone est orienté dans le sens trigonométrique anti-horaire (CCW).
 */
export function isCCW(vertices: readonly Vec2[]): boolean {
  return signedArea(vertices) > 0;
}

/**
 * Calcule le périmètre d'un polygone fermé (en mm).
 */
export function perimeter(vertices: readonly Vec2[]): number {
  const n = vertices.length;
  if (n < 2) return 0;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];
    if (current && next) {
      total += Math.hypot(next.x - current.x, next.y - current.y);
    }
  }
  return total;
}

/**
 * Calcule le centre de gravité (centroïde géométrique) d'un polygone non dégénéré.
 */
export function centroid(vertices: readonly Vec2[]): Vec2 {
  const n = vertices.length;
  if (n === 0) return vec2(0, 0);

  const first = vertices[0];
  if (!first) return vec2(0, 0);
  if (n === 1) return first;

  const second = vertices[1];
  if (n === 2 && second) {
    return vec2((first.x + second.x) / 2, (first.y + second.y) / 2);
  }

  const area = signedArea(vertices);
  if (Math.abs(area) < 1e-9) {
    // Cas aplati : moyenne arithmétique des sommets
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const v of vertices) {
      sumX += v.x;
      sumY += v.y;
      count++;
    }
    return count > 0 ? vec2(sumX / count, sumY / count) : vec2(0, 0);
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    if (curr && next) {
      const factor = curr.x * next.y - next.x * curr.y;
      cx += (curr.x + next.x) * factor;
      cy += (curr.y + next.y) * factor;
    }
  }

  const coeff = 1 / (6 * area);
  return vec2(cx * coeff, cy * coeff);
}

/**
 * Découpe un polygone 2D par un demi-plan défini par un point d'origine et une normale intérieure.
 * Implémente l'algorithme d'écrêtage de Sutherland-Hodgman.
 *
 * Le demi-plan conservé est l'ensemble des points P tels que :
 * dot(P - origin, normal) >= -tolerance
 *
 * @param vertices Sommets du polygone 2D
 * @param origin Point de passage de la droite séparatrice
 * @param normal Normale unitaire pointant vers l'intérieur du demi-plan conservé
 * @param tolerance Seuil de tolérance numérique (par défaut EPSILON_DISTANCE)
 * @returns Polygone découpé (vide si entièrement hors du demi-plan ou dégénéré)
 */
export function clipPolygonWithHalfPlane(
  vertices: readonly Vec2[],
  origin: Vec2,
  normal: Vec2,
  tolerance: number = GEOM_CONFIG.EPSILON_DISTANCE,
): Vec2[] {
  const n = vertices.length;
  if (n < 3) return [];

  const out: Vec2[] = [];

  for (let i = 0; i < n; i++) {
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    if (!cur || !next) continue;

    const dCur = dot(sub(cur, origin), normal);
    const dNext = dot(sub(next, origin), normal);

    const curInside = dCur >= -tolerance;
    const nextInside = dNext >= -tolerance;

    if (curInside) {
      if (nextInside) {
        out.push(next);
      } else {
        const denom = dCur - dNext;
        const t = Math.abs(denom) > GEOM_CONFIG.EPSILON_NUMERICAL ? dCur / denom : 0;
        out.push(add(cur, mul(sub(next, cur), Math.max(0, Math.min(1, t)))));
      }
    } else {
      if (nextInside) {
        const denom = dCur - dNext;
        const t = Math.abs(denom) > GEOM_CONFIG.EPSILON_NUMERICAL ? dCur / denom : 0;
        out.push(add(cur, mul(sub(next, cur), Math.max(0, Math.min(1, t)))));
        out.push(next);
      }
    }
  }

  // Élimination des sommets consécutifs quasi-identiques
  const cleaned: Vec2[] = [];
  const m = out.length;
  for (let i = 0; i < m; i++) {
    const p = out[i];
    const q = out[(i + 1) % m];
    if (p && q && distance(p, q) > tolerance) {
      cleaned.push(p);
    }
  }

  if (cleaned.length < 3) return [];
  return cleaned;
}
