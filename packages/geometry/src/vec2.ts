import { GEOM_CONFIG } from './constants.js';

/**
 * Représentation immuable d'un vecteur ou d'un point en deux dimensions (coordonnées en mm).
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Constructeur sécurisé d'un vecteur 2D.
 * Vérifie que les coordonnées sont des nombres finis (rejette NaN et Infinity).
 */
export function vec2(x: number, y: number): Vec2 {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(
      `Coordonnées vectorielles invalides (doivent être des nombres finis) : (${x}, ${y})`,
    );
  }
  // Élimine le zéro négatif (-0) pour la prédictibilité des tests d'égalité
  return Object.freeze({
    x: x === 0 ? 0 : x,
    y: y === 0 ? 0 : y,
  });
}

/**
 * Constantes vectorielles usuelles.
 */
export const VEC2_ZERO: Vec2 = vec2(0, 0);
export const VEC2_UNIT_X: Vec2 = vec2(1, 0);
export const VEC2_UNIT_Y: Vec2 = vec2(0, 1);

/**
 * Vérifie si un objet satisfait l'interface Vec2 avec des coordonnées finies.
 */
export function isVec2(v: unknown): v is Vec2 {
  return (
    typeof v === 'object' &&
    v !== null &&
    'x' in v &&
    'y' in v &&
    typeof (v as { x: unknown }).x === 'number' &&
    typeof (v as { y: unknown }).y === 'number' &&
    Number.isFinite((v as { x: number }).x) &&
    Number.isFinite((v as { y: number }).y)
  );
}

/**
 * Addition de deux vecteurs 2D : a + b
 */
export function add(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x + b.x, a.y + b.y);
}

/**
 * Soustraction de deux vecteurs 2D : a - b
 */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return vec2(a.x - b.x, a.y - b.y);
}

/**
 * Multiplication scalaire : v * scalar
 */
export function mul(v: Vec2, scalar: number): Vec2 {
  if (!Number.isFinite(scalar)) {
    throw new RangeError(`Facteur scalaire invalide (doit être un nombre fini) : ${scalar}`);
  }
  return vec2(v.x * scalar, v.y * scalar);
}

/**
 * Produit scalaire de deux vecteurs 2D : a · b = ax*bx + ay*by
 */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * Produit vectoriel 2D (déterminant) : a × b = ax*by - ay*bx
 * Équivalent à la composante Z du produit vectoriel 3D.
 */
export function cross2d(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Carré de la norme euclidienne : ||v||² = x² + y²
 */
export function lengthSquared(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

/**
 * Norme euclidienne : ||v|| = sqrt(x² + y²)
 */
export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/**
 * Normalisation d'un vecteur (longueur = 1).
 *
 * Si la norme est inférieure ou égale à EPSILON_NUMERICAL (vecteur quasi-nul ou nul),
 * renvoie déterministement le vecteur nul (0, 0) sans lever d'exception ni générer NaN/Infinity.
 */
export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= GEOM_CONFIG.EPSILON_NUMERICAL) {
    return VEC2_ZERO;
  }
  return vec2(v.x / len, v.y / len);
}

/**
 * Normale unitaire gauche (rotation directe de +90°).
 *
 * Pour un vecteur unitaire de direction d = (dx, dy), perp(d) = (-dy, dx).
 * Si v est nul, renvoie (0, 0).
 */
export function perp(v: Vec2): Vec2 {
  return vec2(-v.y, v.x);
}

/**
 * Carré de la distance euclidienne entre deux points A et B.
 */
export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/**
 * Distance euclidienne entre deux points A et B (toujours positive ou nulle).
 */
export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Test de coïncidence de deux points à une tolérance donnée près.
 */
export function equals(
  a: Vec2,
  b: Vec2,
  tolerance: number = GEOM_CONFIG.EPSILON_DISTANCE,
): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

/**
 * Interpolation linéaire entre deux points : a + t * (b - a)
 */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}
