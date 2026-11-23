/**
 * components/furniture — Mobilier d'amenagement interieur
 *
 * Sous-module extrait de components-3d.ts.
 * Gere : bed, table, chair, sofa, wardrobe (default)
 */

import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@tabax/geometry';
import type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

export const FURNITURE_SUBTYPES = ['bed', 'table', 'chair', 'sofa', 'wardrobe'] as const;
export type FurnitureSubType = (typeof FURNITURE_SUBTYPES)[number];

export function createFurnitureMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation: number = 0,
): RawMeshData | null {
  const width = comp.widthOverride ?? compType.width;
  const depth = comp.depthOverride ?? compType.depth;
  const height = comp.heightOverride ?? compType.height;
  if (width <= 0 || depth <= 0 || height <= 0) return null;

  const elevationOffset = comp.placement.elevationOffset ?? compType.defaultElevationOffset ?? 0;
  const zBase = levelElevation + elevationOffset;
  const rotation = comp.placement.rotation ?? 0;
  const cx = comp.placement.x;
  const cy = comp.placement.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const ux = cos, uy = sin, vx = -sin, vy = cos;
  const halfW = width / 2;
  const halfD = depth / 2;

  const makeOrientedBox = (
    boxId: string, lx0: number, ly0: number, lx1: number, ly1: number, rz0: number, rz1: number,
  ): WallPiece => {
    const p0: Vec2 = vec2(cx + ux * lx0 + vx * ly0, cy + uy * lx0 + vy * ly0);
    const p1: Vec2 = vec2(cx + ux * lx1 + vx * ly0, cy + uy * lx1 + vy * ly0);
    const p2: Vec2 = vec2(cx + ux * lx1 + vx * ly1, cy + uy * lx1 + vy * ly1);
    const p3: Vec2 = vec2(cx + ux * lx0 + vx * ly1, cy + uy * lx0 + vy * ly1);
    const bw = Math.max(1, lx1 - lx0);
    const bd = Math.max(1, ly1 - ly0);
    return { id: boxId, wallId: comp.id, poly2D: [p0, p1, p2, p3], z0: zBase + rz0, z1: zBase + rz1, role: 'full', area2D: bw * bd, uInterval: [0, bw] };
  };

  const pieces: WallPiece[] = [];
  const id = comp.id;

  switch (compType.subType) {
    case 'bed': {
      pieces.push(makeOrientedBox(`${id}_mattress`, -halfW, -halfD, halfW, halfD, 0, height * 0.7));
      const headD = Math.min(80, depth * 0.05);
      pieces.push(makeOrientedBox(`${id}_headboard`, -halfW, halfD - headD, halfW, halfD, 0, height));
      break;
    }
    case 'table': {
      pieces.push(makeOrientedBox(`${id}_top`, -halfW, -halfD, halfW, halfD, height - 40, height));
      const legSize = 50;
      const legH = height - 40;
      pieces.push(makeOrientedBox(`${id}_leg_fl`, -halfW + 20, -halfD + 20, -halfW + 20 + legSize, -halfD + 20 + legSize, 0, legH));
      pieces.push(makeOrientedBox(`${id}_leg_fr`, halfW - 20 - legSize, -halfD + 20, halfW - 20, -halfD + 20 + legSize, 0, legH));
      pieces.push(makeOrientedBox(`${id}_leg_bl`, -halfW + 20, halfD - 20 - legSize, -halfW + 20 + legSize, halfD - 20, 0, legH));
      pieces.push(makeOrientedBox(`${id}_leg_br`, halfW - 20 - legSize, halfD - 20 - legSize, halfW - 20, halfD - 20, 0, legH));
      break;
    }
    case 'chair': {
      const seatZ = height * 0.52;
      pieces.push(makeOrientedBox(`${id}_seat`, -halfW, -halfD, halfW, halfD, seatZ - 30, seatZ));
      pieces.push(makeOrientedBox(`${id}_back`, -halfW, halfD - 40, halfW, halfD, seatZ, height));
      const ls = 35;
      pieces.push(makeOrientedBox(`${id}_leg1`, -halfW + 10, -halfD + 10, -halfW + 10 + ls, -halfD + 10 + ls, 0, seatZ - 30));
      pieces.push(makeOrientedBox(`${id}_leg2`, halfW - 10 - ls, -halfD + 10, halfW - 10, -halfD + 10 + ls, 0, seatZ - 30));
      pieces.push(makeOrientedBox(`${id}_leg3`, -halfW + 10, halfD - 10 - ls, -halfW + 10 + ls, halfD - 10, 0, seatZ - 30));
      pieces.push(makeOrientedBox(`${id}_leg4`, halfW - 10 - ls, halfD - 10 - ls, halfW - 10, halfD - 10, 0, seatZ - 30));
      break;
    }
    case 'sofa': {
      const seatH = height * 0.5;
      pieces.push(makeOrientedBox(`${id}_seat`, -halfW, -halfD, halfW, halfD, 0, seatH));
      const backD = Math.min(180, depth * 0.25);
      pieces.push(makeOrientedBox(`${id}_back`, -halfW, halfD - backD, halfW, halfD, seatH, height));
      const armW = Math.min(160, width * 0.12);
      pieces.push(makeOrientedBox(`${id}_arm_l`, -halfW, -halfD, -halfW + armW, halfD - backD, seatH, height * 0.78));
      pieces.push(makeOrientedBox(`${id}_arm_r`, halfW - armW, -halfD, halfW, halfD - backD, seatH, height * 0.78));
      break;
    }
    // Armoire ou default
    default: {
      pieces.push(makeOrientedBox(`${id}_box`, -halfW, -halfD, halfW, halfD, 0, height));
      break;
    }
  }

  const agg = buildWallMeshAggregated({ id }, pieces);
  return { ...agg, elementId: id, role: 'full' };
}
