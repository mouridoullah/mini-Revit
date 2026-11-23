/**
 * components/kitchen — Meubles de cuisine et electromenager
 *
 * Sous-module extrait de components-3d.ts.
 * Gere : kitchen_base, sink_unit, kitchen_wall, appliance
 */

import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@tabax/geometry';
import type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

export const KITCHEN_SUBTYPES = ['kitchen_base', 'sink_unit', 'kitchen_wall', 'appliance'] as const;
export type KitchenSubType = (typeof KITCHEN_SUBTYPES)[number];

export function createKitchenMesh(
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
    case 'kitchen_base':
    case 'sink_unit': {
      // Caisson bas
      pieces.push(makeOrientedBox(`${id}_base`, -halfW, -halfD, halfW, halfD, 0, height - 40));
      // Plan de travail debordant
      pieces.push(makeOrientedBox(`${id}_countertop`, -halfW - 10, -halfD - 20, halfW + 10, halfD, height - 40, height));
      // Plinthe en retrait
      pieces.push(makeOrientedBox(`${id}_plinth`, -halfW + 20, -halfD, halfW - 20, -halfD + 60, 0, 100));
      break;
    }
    case 'kitchen_wall':
    case 'appliance': {
      pieces.push(makeOrientedBox(`${id}_body`, -halfW, -halfD, halfW, halfD, 0, height));
      break;
    }
    default:
      return null;
  }

  const agg = buildWallMeshAggregated({ id }, pieces);
  return { ...agg, elementId: id, role: 'full' };
}
