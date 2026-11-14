import {
  computeWallFootprint2d,
  sliceWallWithOpenings,
  extrudeWallPiece,
  extrudePolygon,
  vec2,
  type RawMeshData,
  type WallPiece,
  type OpeningInput,
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

export interface OpeningGeometryParams {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight?: number; // allège (pour fenêtre, 0 par défaut pour porte)
}

export interface WallWithOpeningsParams {
  readonly wall: WallGeometryParams;
  readonly wallType: WallTypeGeometryParams;
  readonly openings: readonly OpeningGeometryParams[];
  readonly elevation?: number;
}

/**
 * Génère l'ensemble des maillages 3D bruts (RawMeshData[]) correspondant aux tranches
 * solides d'un mur percé d'ouvertures (allèges, linteaux, tranches pleines).
 *
 * Découplé : prend des paramètres géométriques neutres sans importer @mini-bim/core.
 * Garantit que chaque RawMeshData.elementId === wall.id pour la cohérence du picking 3D.
 */
export function createWallMeshWithOpenings(params: WallWithOpeningsParams): RawMeshData[] {
  const footprint = computeWallFootprint2d({
    start: params.wall.start,
    end: params.wall.end,
    thickness: params.wallType.thickness,
    locationLine: 'center',
  });

  const elevation = params.elevation ?? 0;

  const openingsInput: OpeningInput[] = (params.openings ?? []).map((op) => ({
    id: op.id,
    hostWallId: params.wall.id,
    u: op.offsetAlong + op.width / 2,
    width: op.width,
    height: op.height,
    sillZ: op.sillHeight ?? 0,
    kind: op.kind,
  }));

  const sliced = sliceWallWithOpenings(
    {
      id: params.wall.id,
      start: vec2(params.wall.start.x, params.wall.start.y),
      end: vec2(params.wall.end.x, params.wall.end.y),
      thickness: params.wallType.thickness,
      height: params.wallType.height,
      polygon: footprint.vertices,
    },
    openingsInput,
  );

  const meshes: RawMeshData[] = [];

  for (const piece of sliced.pieces) {
    // extrudeWallPiece retourne null pour role === 'void'
    const elevatedPiece: WallPiece = {
      ...piece,
      z0: elevation + piece.z0,
      z1: elevation + piece.z1,
    };
    const mesh = extrudeWallPiece(elevatedPiece);
    if (mesh) {
      // Invariant architectural : elementId = wall.id pour que le picking de n'importe
      // quelle pièce (allège, linteau, trumeau) sélectionne le mur hôte
      meshes.push({
        ...mesh,
        elementId: params.wall.id,
      });
    }
  }

  return meshes;
}

/**
 * Génère le maillage 3D brut (RawMeshData) d'un placeholder d'ouverture (porte ou fenêtre).
 *
 * Représentation :
 * - Porte : boîte orientée de width × height × 50 mm (matériau bois)
 * - Fenêtre : boîte orientée de width × height × 30 mm (matériau verre translucide)
 * - RawMeshData.elementId === params.id (permet le picking direct de l'ouverture)
 */
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

/**
 * Génère le maillage 3D brut (RawMeshData) d'un mur architectural plein (sans ouvertures).
 * Maintient la compatibilité ascendante avec la Phase 2.2.
 */
export function createWallMesh(
  wall: WallGeometryParams,
  wallType: WallTypeGeometryParams,
  elevation: number = 0,
): RawMeshData | null {
  const meshes = createWallMeshWithOpenings({
    wall,
    wallType,
    openings: [],
    elevation,
  });
  return meshes[0] ?? null;
}

export interface RoomFloorMeshParams {
  readonly id: string;
  readonly polygon: readonly { readonly x: number; readonly y: number }[];
  readonly elevation?: number;
}

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
