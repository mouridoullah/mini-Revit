import {
  computeWallFootprint2d,
  sliceWallWithOpenings,
  extrudeWallPiece,
  extrudePolygon,
  computeEffectiveSlabPolygon,
  triangulatePolygonWithHoles,
  vec2,
  type RawMeshData,
  type WallPiece,
  type OpeningInput,
  type Vec2,
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

export interface SlabGeometryParams {
  readonly id: string;
  readonly boundary: readonly { readonly x: number; readonly y: number }[];
  readonly holes?: readonly (readonly { readonly x: number; readonly y: number }[])[] | undefined;
  readonly openings?: readonly (readonly { readonly x: number; readonly y: number }[])[] | undefined;
  readonly baseOffset?: number | undefined;
}

export interface SlabTypeGeometryParams {
  readonly thickness: number;
}

/**
 * Génère le maillage 3D brut (RawMeshData) d'une dalle horizontale extrudée vers le bas
 * avec découpe effective des réservations/trémies (ADR-046 / Phase 6.1b).
 *
 * Z_sup = elevation + (slab.baseOffset ?? 0)
 * Z_inf = Z_sup - slabType.thickness
 */
export function createSlabMesh(
  slab: SlabGeometryParams,
  slabType: SlabTypeGeometryParams,
  elevation: number = 0,
): RawMeshData | null {
  if (!slab.boundary || slab.boundary.length < 3) return null;

  const boundary2D = slab.boundary.map((p) => vec2(p.x, p.y));
  const rawHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])].map((h) =>
    h.map((p) => vec2(p.x, p.y)),
  );

  let effective;
  try {
    effective = computeEffectiveSlabPolygon({
      boundary: boundary2D,
      holes: rawHoles,
    });
  } catch {
    return null;
  }

  const thickness = Math.max(1, slabType.thickness);
  const zSup = elevation + (slab.baseOffset ?? 0);
  const zInf = zSup - thickness;

  // Triangulation des faces horizontales (avec trous)
  const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
    effective.outer,
    effective.holes,
  );

  const numFaceVerts = vertices.length;
  const numFaceTris = topIndices.length / 3;

  // Calcul du nombre de segments pour les flancs verticaux
  let numWallSegments = effective.outer.length;
  for (const h of effective.holes) {
    numWallSegments += h.length;
  }
  const numWallQuads = numWallSegments;
  const numWallTris = numWallQuads * 2;
  const totalTris = numFaceTris * 2 + numWallTris;
  const totalVerts = numFaceVerts * 2 + numWallQuads * 4;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalTris * 3);

  let vOffset = 0;
  let iOffset = 0;

  // 1. Face Supérieure (+Z)
  const topStartV = vOffset;
  for (let i = 0; i < numFaceVerts; i++) {
    const v = vertices[i]!;
    const idx = (topStartV + i) * 3;
    positions[idx] = v.x;
    positions[idx + 1] = v.y;
    positions[idx + 2] = zSup;

    normals[idx] = 0;
    normals[idx + 1] = 0;
    normals[idx + 2] = 1;

    uvs[(topStartV + i) * 2] = v.x / 1000;
    uvs[(topStartV + i) * 2 + 1] = v.y / 1000;
  }
  vOffset += numFaceVerts;

  for (let i = 0; i < topIndices.length; i++) {
    indices[iOffset++] = topStartV + topIndices[i]!;
  }

  // 2. Face Inférieure (-Z)
  const bottomStartV = vOffset;
  for (let i = 0; i < numFaceVerts; i++) {
    const v = vertices[i]!;
    const idx = (bottomStartV + i) * 3;
    positions[idx] = v.x;
    positions[idx + 1] = v.y;
    positions[idx + 2] = zInf;

    normals[idx] = 0;
    normals[idx + 1] = 0;
    normals[idx + 2] = -1;

    uvs[(bottomStartV + i) * 2] = v.x / 1000;
    uvs[(bottomStartV + i) * 2 + 1] = v.y / 1000;
  }
  vOffset += numFaceVerts;

  // Inversion de l'ordre d'enroulement pour orienter la normale vers le bas (-Z)
  for (let i = 0; i < topIndices.length; i += 3) {
    indices[iOffset++] = bottomStartV + topIndices[i]!;
    indices[iOffset++] = bottomStartV + topIndices[i + 2]!;
    indices[iOffset++] = bottomStartV + topIndices[i + 1]!;
  }

  // Fonction helper pour construire les flancs verticaux d'un anneau
  const addFlanks = (ring: readonly Vec2[]) => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const pA = ring[i]!;
      const pB = ring[(i + 1) % n]!;

      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;

      const nx = dy / len;
      const ny = -dx / len;

      const baseV = vOffset;
      const pts = [
        { x: pA.x, y: pA.y, z: zInf, u: 0, v: 0 },
        { x: pB.x, y: pB.y, z: zInf, u: len / 1000, v: 0 },
        { x: pB.x, y: pB.y, z: zSup, u: len / 1000, v: thickness / 1000 },
        { x: pA.x, y: pA.y, z: zSup, u: 0, v: thickness / 1000 },
      ];

      for (let k = 0; k < 4; k++) {
        const pt = pts[k]!;
        const idx = (baseV + k) * 3;
        positions[idx] = pt.x;
        positions[idx + 1] = pt.y;
        positions[idx + 2] = pt.z;

        normals[idx] = nx;
        normals[idx + 1] = ny;
        normals[idx + 2] = 0;

        uvs[(baseV + k) * 2] = pt.u;
        uvs[(baseV + k) * 2 + 1] = pt.v;
      }
      vOffset += 4;

      // Triangles quad : (V0, V1, V2) et (V0, V2, V3)
      indices[iOffset++] = baseV;
      indices[iOffset++] = baseV + 1;
      indices[iOffset++] = baseV + 2;

      indices[iOffset++] = baseV;
      indices[iOffset++] = baseV + 2;
      indices[iOffset++] = baseV + 3;
    }
  };

  addFlanks(effective.outer);
  for (const hole of effective.holes) {
    addFlanks(hole);
  }

  // Calcul AABB
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of effective.outer) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const finalPositions =
    vOffset * 3 === positions.length ? positions : positions.subarray(0, vOffset * 3);
  const finalNormals =
    vOffset * 3 === normals.length ? normals : normals.subarray(0, vOffset * 3);
  const finalUvs = vOffset * 2 === uvs.length ? uvs : uvs.subarray(0, vOffset * 2);
  const finalIndices = iOffset === indices.length ? indices : indices.subarray(0, iOffset);

  return {
    positions: finalPositions,
    normals: finalNormals,
    uvs: finalUvs,
    indices: finalIndices,
    elementId: slab.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: zInf },
      max: { x: maxX, y: maxY, z: zSup },
    },
    userData: {
      elementId: slab.id,
      category: 'slab',
    },
  };
}
