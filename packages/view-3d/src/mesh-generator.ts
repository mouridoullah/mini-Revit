import {
  computeWallFootprint2d,
  extrudeWallPiece,
  signedArea,
  type RawMeshData,
  type WallPiece,
} from '@mini-bim/geometry';

export interface WallGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

export interface WallTypeGeometryParams {
  readonly thickness: number;
  readonly height: number;
}

/**
 * Génère le maillage 3D brut (RawMeshData) d'un mur architectural à partir de son emprise 2D
 * et de son profil altimétrique (extrusion Z-up).
 *
 * Découplé : permet à apps/web et aux couches supérieures de générer des maillages
 * sans importer directement @mini-bim/geometry.
 */
export function createWallMesh(
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): RawMeshData | null {
  const footprint = computeWallFootprint2d({
    start: wall.start,
    end: wall.end,
    thickness: wallType.thickness,
    locationLine: 'center',
  });

  const area = Math.abs(signedArea(footprint.vertices));

  const piece: WallPiece = {
    id: wall.id,
    wallId: wall.id,
    poly2D: [...footprint.vertices],
    z0: elevation,
    z1: elevation + wallType.height,
    role: 'full',
    area2D: area,
    uInterval: [0, footprint.length],
  };

  return extrudeWallPiece(piece);
}
