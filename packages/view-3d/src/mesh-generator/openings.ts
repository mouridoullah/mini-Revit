import {
  vec2,
  extrudeWallPiece,
  type RawMeshData,
  type WallPiece,
} from '@tabax/geometry';
import type { OpeningGeometryParams, WallGeometryParams } from './types.js';

export function createOpeningPlaceholder(
  params: OpeningGeometryParams,
  wall: WallGeometryParams,
  elevation: number = 0,
): RawMeshData {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) {
    throw new RangeError(`Cannot create opening placeholder on zero-length wall "${wall.id}".`);
  }

  // Vecteur unitaire directeur le long de la ligne d'axe du mur
  const ux = dx / len;
  const uy = dy / len;

  // Vecteur normal unitaire perpendiculaire au mur
  const vx = -uy;
  const vy = ux;

  // Position du centre de l'ouverture le long de la ligne d'axe
  const uCenter = params.offsetAlong + params.width / 2;
  const cx = wall.start.x + ux * uCenter;
  const cy = wall.start.y + uy * uCenter;

  // Épaisseur de la boîte placeholder (50 mm pour porte, 30 mm pour fenêtre)
  const thickness = params.kind === 'door' ? 50 : 30;
  const hw = params.width / 2;
  const ht = thickness / 2;

  // 4 sommets CCW du rectangle horizontal dans le plan XY
  const p0 = vec2(cx - ux * hw - vx * ht, cy - uy * hw - vy * ht);
  const p1 = vec2(cx + ux * hw - vx * ht, cy + uy * hw - vy * ht);
  const p2 = vec2(cx + ux * hw + vx * ht, cy + uy * hw + vy * ht);
  const p3 = vec2(cx - ux * hw + vx * ht, cy - uy * hw + vy * ht);

  const z0 = elevation + (params.sillHeight ?? 0);
  const z1 = z0 + params.height;

  const piece: WallPiece = {
    id: params.id,
    wallId: wall.id,
    poly2D: [p0, p1, p2, p3],
    z0,
    z1,
    role: 'full',
    area2D: params.width * thickness,
    uInterval: [params.offsetAlong, params.offsetAlong + params.width],
  };

  const mesh = extrudeWallPiece(piece);
  if (!mesh) {
    throw new Error(`Failed to extrude opening placeholder for "${params.id}".`);
  }

  return {
    ...mesh,
    elementId: params.id,
  };
}
