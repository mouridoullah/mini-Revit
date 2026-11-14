import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';
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

/**
 * Teste si un point 2D est strictement situé à l'intérieur d'un polygone fermé.
 * Algorithme de Ray-Casting (Jordan curve theorem).
 */
export function isPointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;

    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calcule le pôle d'inaccessibilité (point intérieur le plus éloigné des bords)
 * pour un polygone 2D avec d'éventuels îlots/trous via l'algorithme polylabel.
 */
export function computePolylabel(
  polygon: readonly Vec2[],
  holes?: readonly (readonly Vec2[])[],
  precision: number = 1.0,
): Vec2 {
  if (polygon.length < 3) {
    return centroid(polygon);
  }

  const rings: [number, number][][] = [];
  const outerRing: [number, number][] = polygon.map((v) => [v.x, v.y]);
  const firstOuter = outerRing[0];
  const lastOuter = outerRing[outerRing.length - 1];
  if (
    firstOuter &&
    lastOuter &&
    (firstOuter[0] !== lastOuter[0] || firstOuter[1] !== lastOuter[1])
  ) {
    outerRing.push([firstOuter[0], firstOuter[1]]);
  }
  rings.push(outerRing);

  if (holes && holes.length > 0) {
    for (const hole of holes) {
      if (hole.length < 3) continue;
      const holeRing: [number, number][] = hole.map((v) => [v.x, v.y]);
      const firstHole = holeRing[0];
      const lastHole = holeRing[holeRing.length - 1];
      if (firstHole && lastHole && (firstHole[0] !== lastHole[0] || firstHole[1] !== lastHole[1])) {
        holeRing.push([firstHole[0], firstHole[1]]);
      }
      rings.push(holeRing);
    }
  }

  try {
    const fn = (polylabel as unknown as { default?: typeof polylabel }).default ?? polylabel;
    const res = fn(rings, precision);
    const rx = res[0];
    const ry = res[1];
    if (typeof rx === 'number' && typeof ry === 'number') {
      return vec2(rx, ry);
    }
    return centroid(polygon);
  } catch {
    return centroid(polygon);
  }
}

export interface PolygonWithHoles {
  readonly outer: Vec2[];
  readonly holes: Vec2[][];
}

/**
 * Convertit un anneau de coordonnées polygon-clipping en tableau de Vec2 sans sommet de fermeture dupliqué.
 */
function toVec2List(ring: readonly (readonly [number, number])[]): Vec2[] {
  const result: Vec2[] = [];
  const len = ring.length;
  const p0 = ring[0];
  const pn = ring[len - 1];
  const count = len > 1 && p0 && pn && p0[0] === pn[0] && p0[1] === pn[1] ? len - 1 : len;

  for (let i = 0; i < count; i++) {
    const pt = ring[i];
    if (pt) {
      result.push(vec2(pt[0], pt[1]));
    }
  }
  return result;
}

/**
 * Réalise l'union booléenne 2D de polygones d'emprises de murs via polygon-clipping et extrait
 * les contours extérieurs ainsi que tous les trous intérieurs (pièces candidates).
 */
export function unionPolygonFootprints(polygons: readonly (readonly Vec2[])[]): PolygonWithHoles[] {
  if (polygons.length === 0) return [];

  const pc =
    (polygonClipping as unknown as { default?: typeof polygonClipping }).default ?? polygonClipping;

  const geoms: [number, number][][][] = [];
  for (const poly of polygons) {
    if (poly.length < 3) continue;
    const ring: [number, number][] = poly.map((v) => [v.x, v.y]);
    const r0 = ring[0];
    const rn = ring[ring.length - 1];
    if (r0 && rn && (r0[0] !== rn[0] || r0[1] !== rn[1])) {
      ring.push([r0[0], r0[1]]);
    }
    geoms.push([ring]);
  }

  if (geoms.length === 0) return [];

  const first = geoms[0];
  if (!first) return [];
  const rest = geoms.slice(1);
  const multiPoly = pc.union(first, ...rest);

  const results: PolygonWithHoles[] = [];

  for (const poly of multiPoly) {
    if (poly.length === 0) continue;
    const outerRing = poly[0];
    if (!outerRing) continue;
    const outerVertices = toVec2List(outerRing);
    if (signedArea(outerVertices) < 0) {
      outerVertices.reverse();
    }

    const holes: Vec2[][] = [];
    for (let h = 1; h < poly.length; h++) {
      const holeRing = poly[h];
      if (!holeRing) continue;
      const holeVertices = toVec2List(holeRing);
      // Garantir l'orientation CCW pour le contour de la pièce
      if (signedArea(holeVertices) < 0) {
        holeVertices.reverse();
      }
      if (holeVertices.length >= 3) {
        holes.push(holeVertices);
      }
    }

    results.push({
      outer: outerVertices,
      holes,
    });
  }

  return results;
}
