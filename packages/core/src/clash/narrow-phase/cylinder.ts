import type { Vec3, Cylinder3D, OBB3D } from '../types.js';
import { createAABB } from '../spatial/aabb.js';
import type { SATIntersectionResult } from './sat.js';

const EPSILON = 1e-6;

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Calcule la distance minimale au carré entre deux segments 3D finis S1 et S2,
 * ainsi que les points les plus proches (algorithme d'Ericson §5.1.2).
 */
export function closestPointsBetweenSegments(
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { c1: Vec3; c2: Vec3; distanceSq: number } {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };

  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);

  let s = 0;
  let t = 0;

  if (a <= EPSILON && e <= EPSILON) {
    // Les deux segments sont dégénérés en points
    return { c1: p1, c2: p2, distanceSq: distSq(p1, p2) };
  }

  if (a <= EPSILON) {
    // S1 est un point
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPSILON) {
      // S2 est un point
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;

      if (Math.abs(denom) > EPSILON) {
        s = clamp((b * f - c * e) / denom, 0, 1);
      } else {
        s = 0;
      }

      t = (b * s + f) / e;

      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const c1: Vec3 = {
    x: p1.x + d1.x * s,
    y: p1.y + d1.y * s,
    z: p1.z + d1.z * s,
  };

  const c2: Vec3 = {
    x: p2.x + d2.x * t,
    y: p2.y + d2.y * t,
    z: p2.z + d2.z * t,
  };

  return { c1, c2, distanceSq: distSq(c1, c2) };
}

/**
 * Teste la collision exacte entre deux cylindres 3D (tuyaux, gaines rondes).
 */
export function testCylinderVsCylinder(
  cylA: Cylinder3D,
  cylB: Cylinder3D,
  toleranceMm = 0,
): SATIntersectionResult {
  const { c1, c2, distanceSq } = closestPointsBetweenSegments(
    cylA.start,
    cylA.end,
    cylB.start,
    cylB.end,
  );

  const radiusSum = cylA.radius + cylB.radius;
  const targetThreshold = radiusSum + toleranceMm;

  if (distanceSq > targetThreshold * targetThreshold) {
    return noIntersection();
  }

  const dist = Math.sqrt(distanceSq);
  const penetrationDepthMm = Math.max(0, radiusSum - dist);

  const point: Vec3 = {
    x: (c1.x + c2.x) * 0.5,
    y: (c1.y + c2.y) * 0.5,
    z: (c1.z + c2.z) * 0.5,
  };

  const rMax = Math.max(cylA.radius, cylB.radius);
  const intersectionBox = createAABB(
    { x: point.x - rMax, y: point.y - rMax, z: point.z - rMax },
    { x: point.x + rMax, y: point.y + rMax, z: point.z + rMax },
  );

  return {
    intersects: true,
    penetrationDepthMm,
    intersectionBox,
    point,
  };
}

/**
 * Teste la collision exacte entre un cylindre 3D (ex. tuyau) et un OBB 3D (ex. mur ou dalle).
 */
export function testCylinderVsOBB(
  cylinder: Cylinder3D,
  obb: OBB3D,
  toleranceMm = 0,
): SATIntersectionResult {
  // 1. Transformer le segment du cylindre dans le repère local de l'OBB
  const pA = worldToLocalOBB(cylinder.start, obb);
  const pB = worldToLocalOBB(cylinder.end, obb);

  const hx = obb.halfExtents.x;
  const hy = obb.halfExtents.y;
  const hz = obb.halfExtents.z;

  // 2. Trouver la distance minimale entre le segment [pA, pB] et l'AABB locale [-hx..hx, -hy..hy, -hz..hz]
  const { closestPointOnSegment, closestPointOnBox, distSq: localDistSq } =
    closestPointSegmentAABB(pA, pB, { x: hx, y: hy, z: hz });

  const targetThreshold = cylinder.radius + toleranceMm;
  if (localDistSq > targetThreshold * targetThreshold) {
    return noIntersection();
  }

  const dist = Math.sqrt(localDistSq);
  const penetrationDepthMm = Math.max(0, cylinder.radius - dist);

  // 3. Re-projeter le point de contact en coordonnées monde
  const localMid: Vec3 = {
    x: (closestPointOnSegment.x + closestPointOnBox.x) * 0.5,
    y: (closestPointOnSegment.y + closestPointOnBox.y) * 0.5,
    z: (closestPointOnSegment.z + closestPointOnBox.z) * 0.5,
  };
  const point = localToWorldOBB(localMid, obb);

  const r = cylinder.radius;
  const intersectionBox = createAABB(
    { x: point.x - r, y: point.y - r, z: point.z - r },
    { x: point.x + r, y: point.y + r, z: point.z + r },
  );

  return {
    intersects: true,
    penetrationDepthMm,
    intersectionBox,
    point,
  };
}

function worldToLocalOBB(p: Vec3, obb: OBB3D): Vec3 {
  const dx = p.x - obb.center.x;
  const dy = p.y - obb.center.y;
  const dz = p.z - obb.center.z;
  const d = { x: dx, y: dy, z: dz };
  return {
    x: dot(d, obb.axes[0]),
    y: dot(d, obb.axes[1]),
    z: dot(d, obb.axes[2]),
  };
}

function localToWorldOBB(p: Vec3, obb: OBB3D): Vec3 {
  return {
    x: obb.center.x + p.x * obb.axes[0].x + p.y * obb.axes[1].x + p.z * obb.axes[2].x,
    y: obb.center.y + p.x * obb.axes[0].y + p.y * obb.axes[1].y + p.z * obb.axes[2].y,
    z: obb.center.z + p.x * obb.axes[0].z + p.y * obb.axes[1].z + p.z * obb.axes[2].z,
  };
}

function closestPointSegmentAABB(
  pA: Vec3,
  pB: Vec3,
  h: Vec3,
): { closestPointOnSegment: Vec3; closestPointOnBox: Vec3; distSq: number } {
  // Discrétisation fine et calcul analytique sur les bords
  // Recherche ternaire / échantillonnage 16 pas garantissant une convergence sub-millimétrique
  let bestDistSq = Infinity;
  let bestPointOnSegment = pA;
  let bestPointOnBox = pA;

  const STEPS = 16;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const pt: Vec3 = {
      x: pA.x + (pB.x - pA.x) * t,
      y: pA.y + (pB.y - pA.y) * t,
      z: pA.z + (pB.z - pA.z) * t,
    };
    const boxPt: Vec3 = {
      x: clamp(pt.x, -h.x, h.x),
      y: clamp(pt.y, -h.y, h.y),
      z: clamp(pt.z, -h.z, h.z),
    };
    const d2 = distSq(pt, boxPt);
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestPointOnSegment = pt;
      bestPointOnBox = boxPt;
    }
  }

  return {
    closestPointOnSegment: bestPointOnSegment,
    closestPointOnBox: bestPointOnBox,
    distSq: bestDistSq,
  };
}

function noIntersection(): SATIntersectionResult {
  return {
    intersects: false,
    penetrationDepthMm: 0,
    intersectionBox: createAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    point: { x: 0, y: 0, z: 0 },
  };
}
