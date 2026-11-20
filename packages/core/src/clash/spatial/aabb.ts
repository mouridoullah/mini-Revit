import type { Vec3, AABB3D } from '../types.js';

/**
 * Crée une boîte englobante AABB 3D canonique en s'assurant que min <= max sur chaque axe.
 */
export function createAABB(min: Vec3, max: Vec3): AABB3D {
  return {
    min: {
      x: Math.min(min.x, max.x),
      y: Math.min(min.y, max.y),
      z: Math.min(min.z, max.z),
    },
    max: {
      x: Math.max(min.x, max.x),
      y: Math.max(min.y, max.y),
      z: Math.max(min.z, max.z),
    },
  };
}

/**
 * Crée une AABB initiale vide (infinie) prête pour agrégation.
 */
export function makeEmptyAABB(): AABB3D {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  };
}

/**
 * Calcule le centre cartésien d'une AABB.
 */
export function aabbCenter(box: AABB3D): Vec3 {
  return {
    x: (box.min.x + box.max.x) * 0.5,
    y: (box.min.y + box.max.y) * 0.5,
    z: (box.min.z + box.max.z) * 0.5,
  };
}

/**
 * Calcule les dimensions (largeur, profondeur, hauteur) d'une AABB.
 */
export function aabbExtents(box: AABB3D): Vec3 {
  return {
    x: Math.max(0, box.max.x - box.min.x),
    y: Math.max(0, box.max.y - box.min.y),
    z: Math.max(0, box.max.z - box.min.z),
  };
}

/**
 * Calcule le volume 3D d'une AABB (en mm³).
 */
export function aabbVolume(box: AABB3D): number {
  const ext = aabbExtents(box);
  return ext.x * ext.y * ext.z;
}

/**
 * Calcule l'aire de surface d'une AABB (demi-surface ou surface totale pour heuristique SAH).
 */
export function aabbSurfaceArea(box: AABB3D): number {
  const ext = aabbExtents(box);
  return 2.0 * (ext.x * ext.y + ext.y * ext.z + ext.z * ext.x);
}

/**
 * Élargit une AABB d'une marge scalaire uniforme (mm) sur les 3 axes.
 */
export function expandAABB(box: AABB3D, marginMm: number): AABB3D {
  return {
    min: {
      x: box.min.x - marginMm,
      y: box.min.y - marginMm,
      z: box.min.z - marginMm,
    },
    max: {
      x: box.max.x + marginMm,
      y: box.max.y + marginMm,
      z: box.max.z + marginMm,
    },
  };
}

/**
 * Calcule l'AABB minimale englobant deux boîtes AABB.
 */
export function aabbUnion(a: AABB3D, b: AABB3D): AABB3D {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

/**
 * Teste si deux AABB s'intersectent avec une tolérance numérique optionnelle.
 */
export function intersectsAABB(a: AABB3D, b: AABB3D, toleranceMm = 0): boolean {
  if (a.min.x > b.max.x + toleranceMm || a.max.x < b.min.x - toleranceMm) return false;
  if (a.min.y > b.max.y + toleranceMm || a.max.y < b.min.y - toleranceMm) return false;
  if (a.min.z > b.max.z + toleranceMm || a.max.z < b.min.z - toleranceMm) return false;
  return true;
}

/**
 * Calcule l'AABB d'intersection entre deux boîtes, ou null si disjointes.
 */
export function aabbIntersection(a: AABB3D, b: AABB3D): AABB3D | null {
  const minX = Math.max(a.min.x, b.min.x);
  const minY = Math.max(a.min.y, b.min.y);
  const minZ = Math.max(a.min.z, b.min.z);

  const maxX = Math.min(a.max.x, b.max.x);
  const maxY = Math.min(a.max.y, b.max.y);
  const maxZ = Math.min(a.max.z, b.max.z);

  if (minX > maxX || minY > maxY || minZ > maxZ) {
    return null;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Teste si la boîte `container` contient entièrement la boîte `target`.
 */
export function containsAABB(container: AABB3D, target: AABB3D, toleranceMm = 1e-4): boolean {
  return (
    container.min.x <= target.min.x + toleranceMm &&
    container.max.x >= target.max.x - toleranceMm &&
    container.min.y <= target.min.y + toleranceMm &&
    container.max.y >= target.max.y - toleranceMm &&
    container.min.z <= target.min.z + toleranceMm &&
    container.max.z >= target.max.z - toleranceMm
  );
}

/**
 * Teste si un point 3D se trouve à l'intérieur d'une AABB.
 */
export function pointInAABB(p: Vec3, box: AABB3D, toleranceMm = 1e-4): boolean {
  return (
    p.x >= box.min.x - toleranceMm &&
    p.x <= box.max.x + toleranceMm &&
    p.y >= box.min.y - toleranceMm &&
    p.y <= box.max.y + toleranceMm &&
    p.z >= box.min.z - toleranceMm &&
    p.z <= box.max.z + toleranceMm
  );
}
