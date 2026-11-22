import { vec2 } from '@tabax/geometry';
import type {
  BoundingBox2D,
  WallFor2D,
  WallTypeFor2D,
  SlabFor2D,
  StairFor2D,
  StairTypeFor2D,
  RoofFor2D,
  DetectedRoomFor2D,
  DimensionFor2D,
  ComponentFor2D,
  ComponentTypeFor2D,
  PipeFor2D,
  DuctFor2D,
  CableTrayFor2D,
  MepFittingFor2D,
  MepEquipmentFor2D,
} from '../types.js';

/**
 * Vérifie si deux boîtes englobantes 2D AABB se chevauchent ou se touchent.
 */
export function aabbIntersects(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return !(
    a.max.x < b.min.x ||
    a.min.x > b.max.x ||
    a.max.y < b.min.y ||
    a.min.y > b.max.y
  );
}

/**
 * Dilate une boîte englobante d'une marge donnée en millimètres.
 */
export function expandAABB(box: BoundingBox2D, marginMm: number): BoundingBox2D {
  return {
    min: vec2(box.min.x - marginMm, box.min.y - marginMm),
    max: vec2(box.max.x + marginMm, box.max.y + marginMm),
  };
}

/**
 * Calcule l'AABB d'un mur architectural avec son épaisseur.
 */
export function getWallAABB(wall: WallFor2D, wallType?: WallTypeFor2D): BoundingBox2D {
  const thickness = wallType?.thickness ?? 200;
  const halfT = thickness / 2;
  const minX = Math.min(wall.start.x, wall.end.x) - halfT;
  const maxX = Math.max(wall.start.x, wall.end.x) + halfT;
  const minY = Math.min(wall.start.y, wall.end.y) - halfT;
  const maxY = Math.max(wall.start.y, wall.end.y) + halfT;

  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'une dalle horizontale.
 */
export function getSlabAABB(slab: SlabFor2D): BoundingBox2D {
  if (!slab.boundary || slab.boundary.length === 0) {
    return { min: vec2(0, 0), max: vec2(0, 0) };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of slab.boundary) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'un escalier droit.
 */
export function getStairAABB(stair: StairFor2D, stairType?: StairTypeFor2D): BoundingBox2D {
  const width = stair.widthOverride ?? stairType?.width ?? 900;
  const halfW = width / 2;
  const minX = Math.min(stair.start.x, stair.end.x) - halfW;
  const maxX = Math.max(stair.start.x, stair.end.x) + halfW;
  const minY = Math.min(stair.start.y, stair.end.y) - halfW;
  const maxY = Math.max(stair.start.y, stair.end.y) + halfW;

  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'une toiture.
 */
export function getRoofAABB(roof: RoofFor2D): BoundingBox2D {
  const poly = roof.footprint;
  if (!poly || poly.length === 0) {
    return { min: vec2(0, 0), max: vec2(0, 0) };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'un composant d'aménagement ou mobilier.
 */
export function getComponentAABB(
  comp: ComponentFor2D,
  compType?: ComponentTypeFor2D,
): BoundingBox2D {
  const width = comp.widthOverride ?? compType?.width ?? 600;
  const depth = comp.depthOverride ?? compType?.depth ?? 600;
  const radius = Math.hypot(width, depth) / 2;

  return {
    min: vec2(comp.placement.x - radius, comp.placement.y - radius),
    max: vec2(comp.placement.x + radius, comp.placement.y + radius),
  };
}

/**
 * Calcule l'AABB d'une pièce close.
 */
export function getRoomAABB(room: DetectedRoomFor2D): BoundingBox2D {
  if (!room.polygon || room.polygon.length === 0) {
    return { min: vec2(0, 0), max: vec2(0, 0) };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of room.polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'une cotation 2D.
 */
export function getDimensionAABB(
  dim: DimensionFor2D,
  wall?: WallFor2D,
): BoundingBox2D {
  const p1 = wall ? wall.start : vec2(0, 0);
  const p2 = wall ? wall.end : vec2(0, 0);
  const offset = Math.abs(dim.offset ?? 500);

  return {
    min: vec2(Math.min(p1.x, p2.x) - offset, Math.min(p1.y, p2.y) - offset),
    max: vec2(Math.max(p1.x, p2.x) + offset, Math.max(p1.y, p2.y) + offset),
  };
}

/**
 * Calcule l'AABB d'un tuyau (Pipe) en projection 2D.
 */
export function getPipeAABB(pipe: PipeFor2D): BoundingBox2D {
  const r = Math.max(1, (pipe.diameter ?? 20) / 2);
  const minX = Math.min(pipe.start.x, pipe.end.x) - r;
  const maxX = Math.max(pipe.start.x, pipe.end.x) + r;
  const minY = Math.min(pipe.start.y, pipe.end.y) - r;
  const maxY = Math.max(pipe.start.y, pipe.end.y) + r;
  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'une gaine (Duct) en projection 2D.
 */
export function getDuctAABB(duct: DuctFor2D): BoundingBox2D {
  const size =
    duct.shape === 'round'
      ? Math.max(1, (duct.diameter ?? 200) / 2)
      : Math.max(duct.width ?? 300, duct.height ?? 200) / 2;
  const minX = Math.min(duct.start.x, duct.end.x) - size;
  const maxX = Math.max(duct.start.x, duct.end.x) + size;
  const minY = Math.min(duct.start.y, duct.end.y) - size;
  const maxY = Math.max(duct.start.y, duct.end.y) + size;
  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'un chemin de câbles (CableTray) en projection 2D.
 */
export function getCableTrayAABB(tray: CableTrayFor2D): BoundingBox2D {
  const halfW = Math.max(20, (tray.width ?? 150) / 2);
  const minX = Math.min(tray.start.x, tray.end.x) - halfW;
  const maxX = Math.max(tray.start.x, tray.end.x) + halfW;
  const minY = Math.min(tray.start.y, tray.end.y) - halfW;
  const maxY = Math.max(tray.start.y, tray.end.y) + halfW;
  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}

/**
 * Calcule l'AABB d'un raccord (MepFitting) en projection 2D.
 */
export function getFittingAABB(fitting: MepFittingFor2D): BoundingBox2D {
  let minX = fitting.position.x;
  let maxX = fitting.position.x;
  let minY = fitting.position.y;
  let maxY = fitting.position.y;

  if (fitting.ports) {
    for (const port of fitting.ports) {
      if (port.position.x < minX) minX = port.position.x;
      if (port.position.x > maxX) maxX = port.position.x;
      if (port.position.y < minY) minY = port.position.y;
      if (port.position.y > maxY) maxY = port.position.y;
    }
  }

  const margin = 50;
  return {
    min: vec2(minX - margin, minY - margin),
    max: vec2(maxX + margin, maxY + margin),
  };
}

/**
 * Calcule l'AABB d'un équipement (MepEquipment) en projection 2D.
 */
export function getEquipmentAABB(eq: MepEquipmentFor2D): BoundingBox2D {
  const width = Math.max(10, eq.width ?? 600);
  const depth = Math.max(10, eq.depth ?? 400);
  const radius = Math.hypot(width, depth) / 2;

  return {
    min: vec2(eq.position.x - radius, eq.position.y - radius),
    max: vec2(eq.position.x + radius, eq.position.y + radius),
  };
}
