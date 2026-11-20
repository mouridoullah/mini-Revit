import type { Vec3, AABB3D, OBB3D } from '../types.js';
import { createAABB } from '../spatial/aabb.js';

export interface SATIntersectionResult {
  readonly intersects: boolean;
  readonly penetrationDepthMm: number;
  readonly intersectionBox: AABB3D;
  readonly point: Vec3;
}

const EPSILON = 1e-6;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function lengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

function normalize(v: Vec3): Vec3 {
  const l = Math.sqrt(lengthSq(v));
  if (l < EPSILON) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Teste l'intersection exacte entre deux OBB 3D selon le théorème des axes séparateurs (SAT 3D).
 *
 * Examine les 15 axes fondamentaux :
 * - 3 normales de faces de A
 * - 3 normales de faces de B
 * - 9 produits vectoriels d'arêtes A x B
 */
export function testOBBVsOBB(
  a: OBB3D,
  b: OBB3D,
  toleranceMm = 0,
): SATIntersectionResult {
  const t: Vec3 = {
    x: b.center.x - a.center.x,
    y: b.center.y - a.center.y,
    z: b.center.z - a.center.z,
  };

  const [u0, u1, u2] = a.axes;
  const [v0, v1, v2] = b.axes;
  const a0 = a.halfExtents.x;
  const a1 = a.halfExtents.y;
  const a2 = a.halfExtents.z;
  const b0 = b.halfExtents.x;
  const b1 = b.halfExtents.y;
  const b2 = b.halfExtents.z;

  const R00 = dot(u0, v0);
  const R01 = dot(u0, v1);
  const R02 = dot(u0, v2);
  const R10 = dot(u1, v0);
  const R11 = dot(u1, v1);
  const R12 = dot(u1, v2);
  const R20 = dot(u2, v0);
  const R21 = dot(u2, v1);
  const R22 = dot(u2, v2);

  const absR00 = Math.abs(R00) + EPSILON;
  const absR01 = Math.abs(R01) + EPSILON;
  const absR02 = Math.abs(R02) + EPSILON;
  const absR10 = Math.abs(R10) + EPSILON;
  const absR11 = Math.abs(R11) + EPSILON;
  const absR12 = Math.abs(R12) + EPSILON;
  const absR20 = Math.abs(R20) + EPSILON;
  const absR21 = Math.abs(R21) + EPSILON;
  const absR22 = Math.abs(R22) + EPSILON;

  const t0 = dot(t, u0);
  const t1 = dot(t, u1);
  const t2 = dot(t, u2);

  let minOverlap = Infinity;

  // 1. Axes de A
  // Axe u0
  let ra = a0;
  let rb = b0 * absR00 + b1 * absR01 + b2 * absR02;
  let dist = Math.abs(t0);
  let overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  minOverlap = overlap;

  // Axe u1
  ra = a1;
  rb = b0 * absR10 + b1 * absR11 + b2 * absR12;
  dist = Math.abs(t1);
  overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  if (overlap < minOverlap) minOverlap = overlap;

  // Axe u2
  ra = a2;
  rb = b0 * absR20 + b1 * absR21 + b2 * absR22;
  dist = Math.abs(t2);
  overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  if (overlap < minOverlap) minOverlap = overlap;

  // 2. Axes de B
  // Axe v0
  ra = a0 * absR00 + a1 * absR10 + a2 * absR20;
  rb = b0;
  dist = Math.abs(t0 * R00 + t1 * R10 + t2 * R20);
  overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  if (overlap < minOverlap) minOverlap = overlap;

  // Axe v1
  ra = a0 * absR01 + a1 * absR11 + a2 * absR21;
  rb = b1;
  dist = Math.abs(t0 * R01 + t1 * R11 + t2 * R21);
  overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  if (overlap < minOverlap) minOverlap = overlap;

  // Axe v2
  ra = a0 * absR02 + a1 * absR12 + a2 * absR22;
  rb = b2;
  dist = Math.abs(t0 * R02 + t1 * R12 + t2 * R22);
  overlap = ra + rb - dist;
  if (overlap < -toleranceMm) return noIntersection();
  if (overlap < minOverlap) minOverlap = overlap;

  // 3. Produits vectoriels u_i x v_j (9 axes)
  const crossPairs: readonly (readonly [Vec3, Vec3])[] = [
    [u0, v0], [u0, v1], [u0, v2],
    [u1, v0], [u1, v1], [u1, v2],
    [u2, v0], [u2, v1], [u2, v2],
  ];

  for (const [ui, vj] of crossPairs) {
    const axis = cross(ui, vj);
    const lSq = lengthSq(axis);
    if (lSq < EPSILON) continue;
    const axisNorm = normalize(axis);

    ra = a0 * Math.abs(dot(u0, axisNorm)) + a1 * Math.abs(dot(u1, axisNorm)) + a2 * Math.abs(dot(u2, axisNorm));
    rb = b0 * Math.abs(dot(v0, axisNorm)) + b1 * Math.abs(dot(v1, axisNorm)) + b2 * Math.abs(dot(v2, axisNorm));
    dist = Math.abs(dot(t, axisNorm));
    overlap = ra + rb - dist;
    if (overlap < -toleranceMm) return noIntersection();
    if (overlap < minOverlap) minOverlap = overlap;
  }

  // Calcul du centre estimé et de la boîte d'intersection
  const boxA = obbToAABB(a);
  const boxB = obbToAABB(b);
  const minX = Math.max(boxA.min.x, boxB.min.x);
  const minY = Math.max(boxA.min.y, boxB.min.y);
  const minZ = Math.max(boxA.min.z, boxB.min.z);
  const maxX = Math.min(boxA.max.x, boxB.max.x);
  const maxY = Math.min(boxA.max.y, boxB.max.y);
  const maxZ = Math.min(boxA.max.z, boxB.max.z);

  const intersectionBox = createAABB(
    { x: minX, y: minY, z: minZ },
    { x: Math.max(minX, maxX), y: Math.max(minY, maxY), z: Math.max(minZ, maxZ) },
  );

  const point: Vec3 = {
    x: (intersectionBox.min.x + intersectionBox.max.x) * 0.5,
    y: (intersectionBox.min.y + intersectionBox.max.y) * 0.5,
    z: (intersectionBox.min.z + intersectionBox.max.z) * 0.5,
  };

  return {
    intersects: true,
    penetrationDepthMm: Math.max(0, minOverlap),
    intersectionBox,
    point,
  };
}

/**
 * Convertit un OBB en AABB englobante.
 */
export function obbToAABB(obb: OBB3D): AABB3D {
  const u = obb.axes[0];
  const v = obb.axes[1];
  const w = obb.axes[2];

  const ex =
    Math.abs(u.x) * obb.halfExtents.x +
    Math.abs(v.x) * obb.halfExtents.y +
    Math.abs(w.x) * obb.halfExtents.z;

  const ey =
    Math.abs(u.y) * obb.halfExtents.x +
    Math.abs(v.y) * obb.halfExtents.y +
    Math.abs(w.y) * obb.halfExtents.z;

  const ez =
    Math.abs(u.z) * obb.halfExtents.x +
    Math.abs(v.z) * obb.halfExtents.y +
    Math.abs(w.z) * obb.halfExtents.z;

  return createAABB(
    { x: obb.center.x - ex, y: obb.center.y - ey, z: obb.center.z - ez },
    { x: obb.center.x + ex, y: obb.center.y + ey, z: obb.center.z + ez },
  );
}

function noIntersection(): SATIntersectionResult {
  return {
    intersects: false,
    penetrationDepthMm: 0,
    intersectionBox: createAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    point: { x: 0, y: 0, z: 0 },
  };
}
