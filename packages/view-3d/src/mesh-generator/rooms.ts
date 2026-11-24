import { vec2, extrudePolygon, type RawMeshData } from '@tabax/geometry';
import type { RoomFloorMeshParams } from './types.js';

/**
 * Génère le maillage 3D brut (RawMeshData) d'une dalle de sol de pièce.
 * Extrudée de 1 mm d'épaisseur à z = elevation (plat horizontal).
 * Intègre les métadonnées de revêtement PBR (parquet / carrelage) selon ADR-072.
 */
export function createRoomFloorMesh(params: RoomFloorMeshParams): RawMeshData | null {
  if (params.polygon.length < 3) return null;

  const elevation = params.elevation ?? 0;
  const poly2D = params.polygon.map((v) => vec2(v.x, v.y));

  const mesh = extrudePolygon(poly2D, elevation, elevation + 1);
  if (!mesh) return null;

  // Détection du revêtement PBR : carrelage pour pièces humides / sanitaires, parquet chêne pour pièces sèches
  const isWetRoom = params.name
    ? /salle|bain|eau|wc|toilet|cuisine|cellier|buanderie/i.test(params.name)
    : false;
  const finish = params.finish ?? (isWetRoom ? 'carrelage' : 'parquet');

  return {
    ...mesh,
    elementId: params.id,
    userData: {
      finish,
      name: params.name,
    },
  };
}
