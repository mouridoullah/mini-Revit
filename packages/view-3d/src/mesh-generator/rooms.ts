import { vec2, extrudePolygon, type RawMeshData } from '@mini-bim/geometry';
import type { RoomFloorMeshParams } from './types.js';

/**
 * Génère le maillage 3D brut (RawMeshData) d'une dalle de sol de pièce.
 * Extrudée de 1 mm d'épaisseur à z = elevation (plat horizontal).
 */
export function createRoomFloorMesh(params: RoomFloorMeshParams): RawMeshData | null {
  if (params.polygon.length < 3) return null;

  const elevation = params.elevation ?? 0;
  const poly2D = params.polygon.map((v) => vec2(v.x, v.y));

  const mesh = extrudePolygon(poly2D, elevation, elevation + 1);
  if (!mesh) return null;

  return {
    ...mesh,
    elementId: params.id,
  };
}
