/**
 * @mini-bim/core/mep/math3d
 *
 * Utilitaires mathématiques 3D purs pour la topologie des réseaux techniques MEP.
 * Calcul en flottant double précision IEEE 754 float64 sans arrondi prématuré (ADR-010).
 */

import type { Point3D, Vector3D } from './types.js';
import { MEP_TOLERANCES } from './tolerances.js';

export function point3D(x: number, y: number, z: number): Point3D {
  return { x, y, z };
}

export function vector3D(x: number, y: number, z: number): Vector3D {
  return { x, y, z };
}

export function distance3D(a: Point3D, b: Point3D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function magnitude3D(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize3D(v: Vector3D): Vector3D {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (mag < 1e-12) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag,
  };
}

export function dotProduct3D(u: Vector3D, v: Vector3D): number {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

export function directionBetweenPoints(from: Point3D, to: Point3D): Vector3D {
  return normalize3D({
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  });
}

export function arePointsCoincident3D(
  a: Point3D,
  b: Point3D,
  tolerance = MEP_TOLERANCES.POSITION_MM,
): boolean {
  return distance3D(a, b) <= tolerance;
}

/**
 * Valide si deux vecteurs unitaires sont orientés en sens opposé (face-à-face).
 * Deux ports accostés doivent avoir leurs normales pointant l'une vers l'autre : u · v ≈ -1.0.
 */
export function areDirectionsOpposed3D(
  u: Vector3D,
  v: Vector3D,
  tolerance = MEP_TOLERANCES.ANGLE_RAD,
): boolean {
  const nu = normalize3D(u);
  const nv = normalize3D(v);
  const dot = dotProduct3D(nu, nv);
  // Pour des vecteurs opposés, dot ≈ -1.0. L'écart angulaire θ vérifie cos(θ) = -dot.
  // Si dot = -1, acos(-dot) = 0.
  // Avec tolerance en radians: dot <= -cos(tolerance)
  return dot <= -Math.cos(tolerance);
}
