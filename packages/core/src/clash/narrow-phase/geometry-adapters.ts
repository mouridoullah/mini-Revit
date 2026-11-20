import type {
  Wall,
  Slab,
  Component,
  Stair,
  BimState,
  ElementId,
} from '../../types.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
} from '../../mep/types.js';
import type { Primitive3D, OBB3D, Cylinder3D, Vec3 } from '../types.js';
import { obbToAABB } from './sat.js';
import { createAABB } from '../spatial/aabb.js';

export function createWallPrimitive(wall: Wall, state: BimState): Primitive3D {
  const level = state.levels[wall.levelId];
  const wallType = state.wallTypes[wall.typeId];
  const zBase = (level?.elevation ?? 0) + (wall.baseOffset ?? 0);
  const height = wall.heightOverride ?? wallType?.height ?? level?.height ?? 2800;
  const thickness = wallType?.thickness ?? 200;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1.0;

  const u: Vec3 = { x: dx / len, y: dy / len, z: 0 };
  const v: Vec3 = { x: -dy / len, y: dx / len, z: 0 };
  const w: Vec3 = { x: 0, y: 0, z: 1 };

  const center: Vec3 = {
    x: (wall.start.x + wall.end.x) * 0.5,
    y: (wall.start.y + wall.end.y) * 0.5,
    z: zBase + height * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: len * 0.5, y: thickness * 0.5, z: height * 0.5 },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createSlabPrimitive(slab: Slab, state: BimState): Primitive3D {
  const level = state.levels?.[slab.levelId];
  const typeId = slab.slabTypeId ?? (slab as unknown as { typeId?: ElementId }).typeId;
  const slabType = typeId && state.slabTypes ? state.slabTypes[typeId] : undefined;
  const zBase = (level?.elevation ?? 0) + (slab.baseOffset ?? 0);
  const thickness = slabType?.thickness ?? (slab as unknown as { thickness?: number }).thickness ?? 200;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const pts = slab.boundary ?? (slab as unknown as { polygon?: readonly { x: number; y: number }[] }).polygon ?? [];
  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 1000;
    minY = 0;
    maxY = 1000;
  }

  const hx = (maxX - minX) * 0.5;
  const hy = (maxY - minY) * 0.5;
  const hz = thickness * 0.5;

  const center: Vec3 = {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    z: zBase - hz, // Dalle sous le niveau
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: hx, y: hy, z: hz },
    axes: [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createComponentPrimitive(comp: Component, state: BimState): Primitive3D {
  const level = state.levels[comp.levelId];
  const compType = state.componentTypes ? state.componentTypes[comp.typeId] : undefined;
  const zBase =
    (level?.elevation ?? 0) +
    (comp.placement.elevationOffset ?? compType?.defaultElevationOffset ?? 0);

  const width = compType?.width ?? 600;
  const depth = compType?.depth ?? 600;
  const height = compType?.height ?? 800;

  const rotDeg = comp.placement.rotation ?? 0;
  const rotRad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const u: Vec3 = { x: cos, y: sin, z: 0 };
  const v: Vec3 = { x: -sin, y: cos, z: 0 };
  const w: Vec3 = { x: 0, y: 0, z: 1 };

  const center: Vec3 = {
    x: comp.placement.x,
    y: comp.placement.y,
    z: zBase + height * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: width * 0.5, y: depth * 0.5, z: height * 0.5 },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createStairPrimitive(stair: Stair, state: BimState): Primitive3D {
  const bottomLevel = state.levels[stair.bottomLevelId];
  const topLevel = state.levels[stair.topLevelId];
  const zBottom = bottomLevel?.elevation ?? 0;
  const zTop = topLevel?.elevation ?? zBottom + 2800;

  const stairType = state.stairTypes ? state.stairTypes[stair.stairTypeId] : undefined;
  const stairWidth = stairType?.width ?? 900;

  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const len = Math.hypot(dx, dy) || 1.0;

  const u: Vec3 = { x: dx / len, y: dy / len, z: 0 };
  const v: Vec3 = { x: -dy / len, y: dx / len, z: 0 };
  const w: Vec3 = { x: 0, y: 0, z: 1 };

  const height = Math.abs(zTop - zBottom) || 2800;
  const center: Vec3 = {
    x: (stair.start.x + stair.end.x) * 0.5,
    y: (stair.start.y + stair.end.y) * 0.5,
    z: Math.min(zBottom, zTop) + height * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: len * 0.5, y: stairWidth * 0.5, z: height * 0.5 },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createPipePrimitive(pipe: Pipe): Primitive3D {
  const radius = (pipe.diameter ?? 32) * 0.5;
  const cylinder: Cylinder3D = {
    start: pipe.start,
    end: pipe.end,
    radius,
  };

  const minX = Math.min(pipe.start.x, pipe.end.x) - radius;
  const maxX = Math.max(pipe.start.x, pipe.end.x) + radius;
  const minY = Math.min(pipe.start.y, pipe.end.y) - radius;
  const maxY = Math.max(pipe.start.y, pipe.end.y) + radius;
  const minZ = Math.min(pipe.start.z, pipe.end.z) - radius;
  const maxZ = Math.max(pipe.start.z, pipe.end.z) + radius;

  return {
    kind: 'cylinder',
    cylinder,
    aabb: createAABB({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ }),
  };
}

export function createDuctPrimitive(duct: Duct): Primitive3D {
  if (duct.shape === 'round' || (duct.diameter !== undefined && duct.shape !== 'rectangular')) {
    const radius = (duct.diameter ?? 200) * 0.5;
    const cylinder: Cylinder3D = {
      start: duct.start,
      end: duct.end,
      radius,
    };
    const minX = Math.min(duct.start.x, duct.end.x) - radius;
    const maxX = Math.max(duct.start.x, duct.end.x) + radius;
    const minY = Math.min(duct.start.y, duct.end.y) - radius;
    const maxY = Math.max(duct.start.y, duct.end.y) + radius;
    const minZ = Math.min(duct.start.z, duct.end.z) - radius;
    const maxZ = Math.max(duct.start.z, duct.end.z) + radius;

    return {
      kind: 'cylinder',
      cylinder,
      aabb: createAABB({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ }),
    };
  }

  // Rectangulaire -> OBB
  const width = duct.width ?? 300;
  const height = duct.height ?? 200;

  const dx = duct.end.x - duct.start.x;
  const dy = duct.end.y - duct.start.y;
  const dz = duct.end.z - duct.start.z;
  const len = Math.hypot(dx, dy, dz) || 1.0;

  const u: Vec3 = { x: dx / len, y: dy / len, z: dz / len };
  // Vecteur v orthogonal arbitraire
  const up: Vec3 = Math.abs(u.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const vPre = {
    x: u.y * up.z - u.z * up.y,
    y: u.z * up.x - u.x * up.z,
    z: u.x * up.y - u.y * up.x,
  };
  const vLen = Math.hypot(vPre.x, vPre.y, vPre.z) || 1.0;
  const v: Vec3 = { x: vPre.x / vLen, y: vPre.y / vLen, z: vPre.z / vLen };
  const w: Vec3 = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };

  const center: Vec3 = {
    x: (duct.start.x + duct.end.x) * 0.5,
    y: (duct.start.y + duct.end.y) * 0.5,
    z: (duct.start.z + duct.end.z) * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: len * 0.5, y: width * 0.5, z: height * 0.5 },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createCableTrayPrimitive(cableTray: CableTray): Primitive3D {
  const width = cableTray.width ?? 200;
  const height = cableTray.height ?? 60;

  const dx = cableTray.end.x - cableTray.start.x;
  const dy = cableTray.end.y - cableTray.start.y;
  const dz = cableTray.end.z - cableTray.start.z;
  const len = Math.hypot(dx, dy, dz) || 1.0;

  const u: Vec3 = { x: dx / len, y: dy / len, z: dz / len };
  const up: Vec3 = Math.abs(u.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const vPre = {
    x: u.y * up.z - u.z * up.y,
    y: u.z * up.x - u.x * up.z,
    z: u.x * up.y - u.y * up.x,
  };
  const vLen = Math.hypot(vPre.x, vPre.y, vPre.z) || 1.0;
  const v: Vec3 = { x: vPre.x / vLen, y: vPre.y / vLen, z: vPre.z / vLen };
  const w: Vec3 = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  };

  const center: Vec3 = {
    x: (cableTray.start.x + cableTray.end.x) * 0.5,
    y: (cableTray.start.y + cableTray.end.y) * 0.5,
    z: (cableTray.start.z + cableTray.end.z) * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: { x: len * 0.5, y: width * 0.5, z: height * 0.5 },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createEquipmentPrimitive(eq: MepEquipment): Primitive3D {
  const rotRad = eq.rotation ?? 0;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const u: Vec3 = { x: cos, y: sin, z: 0 };
  const v: Vec3 = { x: -sin, y: cos, z: 0 };
  const w: Vec3 = { x: 0, y: 0, z: 1 };

  const center: Vec3 = {
    x: eq.position.x,
    y: eq.position.y,
    z: eq.position.z + (eq.height ?? 600) * 0.5,
  };

  const obb: OBB3D = {
    center,
    halfExtents: {
      x: (eq.width ?? 600) * 0.5,
      y: (eq.depth ?? 600) * 0.5,
      z: (eq.height ?? 600) * 0.5,
    },
    axes: [u, v, w],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}

export function createFittingPrimitive(fitting: MepFitting): Primitive3D {
  // Raccord borné par l'encombrement de ses piquages
  let maxDim = 80;
  for (const port of fitting.ports) {
    if (port.diameter && port.diameter > maxDim) maxDim = port.diameter;
    if (port.width && port.width > maxDim) maxDim = port.width;
    if (port.height && port.height > maxDim) maxDim = port.height;
  }

  const h = maxDim * 0.6;
  const center = fitting.position;

  const obb: OBB3D = {
    center,
    halfExtents: { x: h, y: h, z: h },
    axes: [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ],
  };

  return {
    kind: 'obb',
    obb,
    aabb: obbToAABB(obb),
  };
}
