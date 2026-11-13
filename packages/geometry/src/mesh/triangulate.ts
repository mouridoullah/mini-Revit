import earcut from 'earcut';
import { type Vec2, vec2, cross2d, sub, distance } from '../vec2.js';
import { GEOM_CONFIG } from '../constants.js';
import { isCCW } from '../polygon.js';

/**
 * Nettoie un polygone 2D avant triangulation :
 * 1. Supprime les sommets dupliqués consécutifs (distance < EPSILON_DISTANCE).
 * 2. Supprime l'éventuel sommet de fermeture dupliqué (dernier == premier).
 * 3. Supprime les sommets colinéaires intermédiaires (cross product ~ 0).
 */
export function cleanPolygonVertices(vertices: readonly Vec2[]): Vec2[] {
  if (vertices.length < 3) return [];

  const eps = GEOM_CONFIG.EPSILON_DISTANCE;
  const filtered: Vec2[] = [];

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!v) continue;

    const prev = filtered[filtered.length - 1];
    if (prev && distance(prev, v) < eps) {
      continue; // Sommet dupliqué consécutif ignoré
    }
    filtered.push(vec2(v.x, v.y));
  }

  // Vérifier et éliminer la fermeture si elle duplique le premier sommet
  if (filtered.length >= 2) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (first && last && distance(first, last) < eps) {
      filtered.pop();
    }
  }

  if (filtered.length < 3) return [];

  // Élimination des sommets colinéaires intermédiaires (points alignés)
  const result: Vec2[] = [];
  const n = filtered.length;
  for (let i = 0; i < n; i++) {
    const prev = filtered[(i - 1 + n) % n];
    const cur = filtered[i];
    const next = filtered[(i + 1) % n];

    if (!prev || !cur || !next) continue;

    const v1 = sub(cur, prev);
    const v2 = sub(next, cur);
    const cross = cross2d(v1, v2);

    // Si les deux arêtes sont parfaitement alignées, cur est redondant
    if (Math.abs(cross) <= GEOM_CONFIG.EPSILON_NUMERICAL) {
      continue;
    }
    result.push(cur);
  }

  return result.length >= 3 ? result : filtered;
}

/**
 * Détermine si un polygone 2D est convexe en vérifiant que tous les virages
 * formés par les arêtes consécutives ont le même signe.
 *
 * Complexité : O(n).
 */
export function isConvexPolygon(vertices: readonly Vec2[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;
  if (n === 3) return true; // Tout triangle est trivialement convexe

  let sign = 0;
  const eps = GEOM_CONFIG.EPSILON_NUMERICAL;

  for (let i = 0; i < n; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % n];
    const p3 = vertices[(i + 2) % n];

    if (!p1 || !p2 || !p3) return false;

    const v1 = sub(p2, p1);
    const v2 = sub(p3, p2);
    const cross = cross2d(v1, v2);

    if (Math.abs(cross) > eps) {
      const currentSign = cross > 0 ? 1 : -1;
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false; // Changement de signe : le polygone est concave
      }
    }
  }

  return sign !== 0;
}

/**
 * Triangulation en éventail (Triangle Fan) pour polygone convexe orienté CCW.
 *
 * Les triangles générés sont (0, 1, 2), (0, 2, 3), ..., (0, n-2, n-1).
 * Complexité : O(n).
 */
export function triangulateConvexFan(vertexCount: number): Uint32Array {
  if (vertexCount < 3) return new Uint32Array(0);

  const triangleCount = vertexCount - 2;
  const indices = new Uint32Array(triangleCount * 3);

  let ptr = 0;
  for (let i = 1; i < vertexCount - 1; i++) {
    indices[ptr++] = 0;
    indices[ptr++] = i;
    indices[ptr++] = i + 1;
  }

  return indices;
}

/**
 * Triangulation par Ear Clipping (via lib earcut de Mapbox) pour polygones concaves ou complexes.
 *
 * Complexité : O(n²) pire cas, O(n log n) cas moyen.
 */
export function triangulateEarClipping(vertices: readonly Vec2[]): Uint32Array {
  const n = vertices.length;
  if (n < 3) return new Uint32Array(0);

  // Aplatissement des coordonnées en tableau [x0, y0, x1, y1, ...]
  const flatCoords = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    if (v) {
      flatCoords[i * 2] = v.x;
      flatCoords[i * 2 + 1] = v.y;
    }
  }

  const rawIndices = earcut(flatCoords);
  return new Uint32Array(rawIndices);
}

/**
 * Triangule un polygone 2D arbitraire en sélectionnant la stratégie optimale :
 * 1. Nettoyage des sommets dupliqués et colinéaires.
 * 2. Normalisation de l'orientation en CCW si nécessaire.
 * 3. Si le polygone est convexe -> Triangulation Fan O(n).
 * 4. Sinon -> Ear Clipping O(n log n).
 *
 * Retourne les indices des triangles orientés CCW vus du dessus (+Z).
 */
export function triangulatePolygon(
  vertices: readonly Vec2[],
  options?: { readonly allowConcaveFallback?: boolean },
): { readonly cleanedVertices: readonly Vec2[]; readonly indices: Uint32Array } {
  let cleaned = cleanPolygonVertices(vertices);
  if (cleaned.length < 3) {
    return { cleanedVertices: [], indices: new Uint32Array(0) };
  }

  // Normaliser en CCW pour garantir un enroulement positif uniforme
  if (!isCCW(cleaned)) {
    cleaned = [...cleaned].reverse();
  }

  // Vérifier la convexité
  if (isConvexPolygon(cleaned)) {
    const indices = triangulateConvexFan(cleaned.length);
    return { cleanedVertices: cleaned, indices };
  }

  // Fallback Ear Clipping pour polygones concaves
  const allowFallback = options?.allowConcaveFallback ?? true;
  if (allowFallback) {
    const indices = triangulateEarClipping(cleaned);
    return { cleanedVertices: cleaned, indices };
  }

  return { cleanedVertices: cleaned, indices: new Uint32Array(0) };
}
