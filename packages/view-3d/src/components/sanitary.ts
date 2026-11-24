/**
 * components/sanitary — Équipements sanitaires
 *
 * Sous-module extrait de components-3d.ts.
 * Gere : toilet, sink, shower, bath
 */

import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@tabax/geometry';
import type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

export const SANITARY_SUBTYPES = ['toilet', 'sink', 'shower', 'bath'] as const;
export type SanitarySubType = (typeof SANITARY_SUBTYPES)[number];

export function createSanitaryMesh(
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
    case 'toilet': {
      const tankD = Math.min(180, depth * 0.35);
      pieces.push(makeOrientedBox(`${id}_tank`, -halfW, halfD - tankD, halfW, halfD, 0, height));
      pieces.push(makeOrientedBox(`${id}_bowl`, -halfW * 0.85, -halfD, halfW * 0.85, halfD - tankD, 0, height * 0.85));
      break;
    }
    case 'sink': {
      pieces.push(makeOrientedBox(`${id}_base`, -halfW, -halfD, halfW, halfD, 0, height - 50));
      pieces.push(makeOrientedBox(`${id}_top`, -halfW * 0.95, -halfD * 0.95, halfW * 0.95, halfD * 0.95, height - 50, height));
      pieces.push(makeOrientedBox(`${id}_faucet`, -20, halfD * 0.7 - 20, 20, halfD * 0.7 + 20, height, height + 120));
      pieces.push(makeOrientedBox(`${id}_drain`, -15, -15, 15, 15, height - 10, height));
      break;
    }
    case 'shower': {
      pieces.push(makeOrientedBox(`${id}_tray`, -halfW, -halfD, halfW, halfD, 0, height));
      break;
    }
    case 'bath': {
      const rim = 80;
      if (width > 2 * rim && depth > 2 * rim) {
        pieces.push(makeOrientedBox(`${id}_rim_front`, -halfW, -halfD, halfW, -halfD + rim, 0, height));
        pieces.push(makeOrientedBox(`${id}_rim_back`, -halfW, halfD - rim, halfW, halfD, 0, height));
        pieces.push(makeOrientedBox(`${id}_rim_left`, -halfW, -halfD + rim, -halfW + rim, halfD - rim, 0, height));
        pieces.push(makeOrientedBox(`${id}_rim_right`, halfW - rim, -halfD + rim, halfW, halfD - rim, 0, height));
        pieces.push(makeOrientedBox(`${id}_bottom`, -halfW + rim, -halfD + rim, halfW - rim, halfD - rim, 0, 60));
      } else {
        pieces.push(makeOrientedBox(`${id}_tub`, -halfW, -halfD, halfW, halfD, 0, height));
      }
      break;
    }
    default:
      return null;
  }

  const agg = buildWallMeshAggregated({ id }, pieces);
  return { ...agg, elementId: id, role: 'full' };
}
