import { type Vec2, vec2 } from './vec2.js';

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
