/**
 * components/glazing — Menuiseries vitrees paramétriques
 *
 * Sous-module extrait de components-3d.ts.
 * Gere : sliding_door, french_window
 */

import { vec2, type Vec2, type WallPiece, buildWallMeshAggregated, type RawMeshData } from '@tabax/geometry';
import type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

export const GLAZING_SUBTYPES = ['sliding_door', 'french_window'] as const;
export type GlazingSubType = (typeof GLAZING_SUBTYPES)[number];

export function createGlazingMesh(
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
    case 'sliding_door': {
      const frameW = 50;
      const frameD = Math.min(depth, 70);
      const halfFD = frameD / 2;
      pieces.push(makeOrientedBox(`${id}_jamb_l`, -halfW, -halfFD, -halfW + frameW, halfFD, 0, height));
      pieces.push(makeOrientedBox(`${id}_jamb_r`, halfW - frameW, -halfFD, halfW, halfFD, 0, height));
      pieces.push(makeOrientedBox(`${id}_head`, -halfW + frameW, -halfFD, halfW - frameW, halfFD, height - frameW, height));
      pieces.push(makeOrientedBox(`${id}_sill`, -halfW + frameW, -halfFD, halfW - frameW, halfFD, 0, frameW));
      const glassH0 = frameW;
      const glassH1 = height - frameW;
      const glassW = (width - 2 * frameW) / 2 + 20;
      pieces.push(makeOrientedBox(`${id}_glass1`, -halfW + frameW, -halfFD + 8, -halfW + frameW + glassW, -halfFD + 20, glassH0, glassH1));
      pieces.push(makeOrientedBox(`${id}_glass2`, halfW - frameW - glassW, halfFD - 20, halfW - frameW, halfFD - 8, glassH0, glassH1));
      break;
    }
    case 'french_window': {
      const frameW = 50;
      const frameD = Math.min(depth, 70);
      const halfFD = frameD / 2;
      pieces.push(makeOrientedBox(`${id}_jamb_l`, -halfW, -halfFD, -halfW + frameW, halfFD, 0, height));
      pieces.push(makeOrientedBox(`${id}_jamb_r`, halfW - frameW, -halfFD, halfW, halfFD, 0, height));
      pieces.push(makeOrientedBox(`${id}_head`, -halfW + frameW, -halfFD, halfW - frameW, halfFD, height - frameW, height));
      pieces.push(makeOrientedBox(`${id}_sill`, -halfW + frameW, -halfFD, halfW - frameW, halfFD, 0, frameW));
      pieces.push(makeOrientedBox(`${id}_mullion`, -frameW / 2, -halfFD, frameW / 2, halfFD, frameW, height - frameW));
      const glassH0 = frameW;
      const glassH1 = height - frameW;
      pieces.push(makeOrientedBox(`${id}_glass_l`, -halfW + frameW, -6, -frameW / 2, 6, glassH0, glassH1));
      pieces.push(makeOrientedBox(`${id}_glass_r`, frameW / 2, -6, halfW - frameW, 6, glassH0, glassH1));
      break;
    }
    default:
      return null;
  }

  const agg = buildWallMeshAggregated({ id }, pieces);
  return { ...agg, elementId: id, role: 'full' };
}
