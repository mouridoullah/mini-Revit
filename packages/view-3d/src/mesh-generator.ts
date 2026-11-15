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
  readonly polygon?: readonly Vec2[] | undefined;
  /** Hauteur effective du mur en mm (prend le pas sur wallType.height si spécifiée, ADR-049 / S1-1). */
  readonly height?: number;
}

/**
 * Génère l'ensemble des maillages 3D bruts (RawMeshData[]) correspondant aux tranches
 * solides d'un mur percé d'ouvertures (allèges, linteaux, tranches pleines).
 *
 * Découplé : prend des paramètres géométriques neutres sans importer @mini-bim/core.
 * Garantit que chaque RawMeshData.elementId === wall.id pour la cohérence du picking 3D.
 */
export function createWallMeshWithOpenings(params: WallWithOpeningsParams): RawMeshData[] {
  const footprintVertices =
    params.polygon && params.polygon.length >= 3
      ? params.polygon
      : computeWallFootprint2d({
          start: params.wall.start,
          end: params.wall.end,
          thickness: params.wallType.thickness,
          locationLine: 'center',
        }).vertices;

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

  const wallHeight = params.height ?? params.wallType.height;

  const sliced = sliceWallWithOpenings(
    {
      id: params.wall.id,
      start: vec2(params.wall.start.x, params.wall.start.y),
      end: vec2(params.wall.end.x, params.wall.end.y),
      thickness: params.wallType.thickness,
      height: wallHeight,
      polygon: footprintVertices,
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
  height?: number,
): RawMeshData | null {
  const meshes = createWallMeshWithOpenings({
    wall,
    wallType,
    openings: [],
    elevation,
    ...(height !== undefined ? { height } : {}),
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
  readonly openings?:
    readonly (readonly { readonly x: number; readonly y: number }[])[] | undefined;
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
  const finalNormals = vOffset * 3 === normals.length ? normals : normals.subarray(0, vOffset * 3);
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

export interface StairGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly widthOverride?: number | undefined;
  readonly bottomElevation?: number | undefined;
  readonly topElevation?: number | undefined;
}

export interface StairTypeGeometryParams {
  readonly width: number;
}

/**
 * Génère le maillage 3D brut (RawMeshData) d'un escalier droit paramétrique (ADR-048).
 * Produit un maillage solide crénelé étanche (Euler V - E + F = 2) en 1 seul draw call
 * comprenant les marches supérieures (+Z), les contremarches (-u), le mur arrière (+u),
 * la base inférieure (-Z) et les deux flancs latéraux (+-n).
 */
export function createStairMesh(
  stair: StairGeometryParams,
  stairType?: StairTypeGeometryParams,
): RawMeshData | null {
  const z0 = stair.bottomElevation ?? 0;
  const z1 = stair.topElevation ?? z0 + 2800;
  const deltaZ = z1 - z0;
  if (deltaZ <= 0) return null;

  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) return null;

  const width = stair.widthOverride ?? stairType?.width ?? 900;
  if (width <= 0) return null;

  // 1. Découpage altimétrique en N contremarches
  const numberOfSteps = Math.min(30, Math.max(3, Math.round(deltaZ / 175)));
  const stepHeight = deltaZ / numberOfSteps;
  const stepDepth = len / numberOfSteps;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const halfW = width / 2;

  const numQuads = 2 * numberOfSteps + 2;
  const flankVertsCount = 2 * numberOfSteps + 2;
  const flankTrisCount = 2 * numberOfSteps;
  const totalVerts = numQuads * 4 + 2 * flankVertsCount;
  const totalIndices = numQuads * 6 + 2 * flankTrisCount * 3;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  const addQuad = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    normal: { x: number; y: number; z: number },
  ) => {
    const baseV = vOffset;
    const pts = [p0, p1, p2, p3];
    for (let k = 0; k < 4; k++) {
      const pt = pts[k]!;
      const idx = (baseV + k) * 3;
      positions[idx] = pt.x;
      positions[idx + 1] = pt.y;
      positions[idx + 2] = pt.z;

      normals[idx] = normal.x;
      normals[idx + 1] = normal.y;
      normals[idx + 2] = normal.z;

      uvs[(baseV + k) * 2] = pt.x / 1000;
      uvs[(baseV + k) * 2 + 1] = pt.y / 1000;
    }
    vOffset += 4;

    indices[iOffset++] = baseV;
    indices[iOffset++] = baseV + 1;
    indices[iOffset++] = baseV + 2;

    indices[iOffset++] = baseV;
    indices[iOffset++] = baseV + 2;
    indices[iOffset++] = baseV + 3;
  };

  // 1. Contremarches verticales (Risers, normale -u)
  for (let i = 0; i < numberOfSteps; i++) {
    const s = i * stepDepth;
    const zLow = z0 + i * stepHeight;
    const zHigh = z0 + (i + 1) * stepHeight;

    const mx = stair.start.x + ux * s;
    const my = stair.start.y + uy * s;

    addQuad(
      { x: mx + nx * halfW, y: my + ny * halfW, z: zLow },
      { x: mx - nx * halfW, y: my - ny * halfW, z: zLow },
      { x: mx - nx * halfW, y: my - ny * halfW, z: zHigh },
      { x: mx + nx * halfW, y: my + ny * halfW, z: zHigh },
      { x: -ux, y: -uy, z: 0 },
    );
  }

  // 2. Marches horizontales (Treads, normale +Z)
  for (let i = 0; i < numberOfSteps; i++) {
    const s0 = i * stepDepth;
    const s1 = (i + 1) * stepDepth;
    const z = z0 + (i + 1) * stepHeight;

    const m0x = stair.start.x + ux * s0;
    const m0y = stair.start.y + uy * s0;
    const m1x = stair.start.x + ux * s1;
    const m1y = stair.start.y + uy * s1;

    addQuad(
      { x: m0x - nx * halfW, y: m0y - ny * halfW, z },
      { x: m1x - nx * halfW, y: m1y - ny * halfW, z },
      { x: m1x + nx * halfW, y: m1y + ny * halfW, z },
      { x: m0x + nx * halfW, y: m0y + ny * halfW, z },
      { x: 0, y: 0, z: 1 },
    );
  }

  // 3. Dos vertical (Back quad à s = len, normale +u)
  {
    const mx = stair.start.x + ux * len;
    const my = stair.start.y + uy * len;

    addQuad(
      { x: mx - nx * halfW, y: my - ny * halfW, z: z0 },
      { x: mx + nx * halfW, y: my + ny * halfW, z: z0 },
      { x: mx + nx * halfW, y: my + ny * halfW, z: z1 },
      { x: mx - nx * halfW, y: my - ny * halfW, z: z1 },
      { x: ux, y: uy, z: 0 },
    );
  }

  // 4. Base inférieure (Bottom quad à z = z0, normale -Z)
  {
    const m0x = stair.start.x;
    const m0y = stair.start.y;
    const m1x = stair.start.x + ux * len;
    const m1y = stair.start.y + uy * len;

    addQuad(
      { x: m0x - nx * halfW, y: m0y - ny * halfW, z: z0 },
      { x: m0x + nx * halfW, y: m0y + ny * halfW, z: z0 },
      { x: m1x + nx * halfW, y: m1y + ny * halfW, z: z0 },
      { x: m1x - nx * halfW, y: m1y - ny * halfW, z: z0 },
      { x: 0, y: 0, z: -1 },
    );
  }

  // 5. Flancs latéraux (Triangulation 2D plane sans T-junctions pour Euler = 2)
  const profile2D: Vec2[] = [];
  profile2D.push(vec2(0, z0));
  for (let i = 0; i < numberOfSteps; i++) {
    profile2D.push(vec2(i * stepDepth, z0 + (i + 1) * stepHeight));
    profile2D.push(vec2((i + 1) * stepDepth, z0 + (i + 1) * stepHeight));
  }
  profile2D.push(vec2(len, z0));

  const { vertices: flankVerts, indices: flankIndices } = triangulatePolygonWithHoles(
    profile2D,
    [],
  );

  // 5a. Flanc droit (+n)
  const rightStartV = vOffset;
  for (let i = 0; i < flankVerts.length; i++) {
    const fv = flankVerts[i]!;
    const s = fv.x;
    const z = fv.y;
    const wx = stair.start.x + ux * s + nx * halfW;
    const wy = stair.start.y + uy * s + ny * halfW;

    const idx = (rightStartV + i) * 3;
    positions[idx] = wx;
    positions[idx + 1] = wy;
    positions[idx + 2] = z;

    normals[idx] = nx;
    normals[idx + 1] = ny;
    normals[idx + 2] = 0;

    uvs[(rightStartV + i) * 2] = wx / 1000;
    uvs[(rightStartV + i) * 2 + 1] = wy / 1000;
  }
  vOffset += flankVerts.length;

  for (let i = 0; i < flankIndices.length; i += 3) {
    const i0 = flankIndices[i]!;
    const i1 = flankIndices[i + 1]!;
    const i2 = flankIndices[i + 2]!;

    const v0 = flankVerts[i0]!;
    const v1 = flankVerts[i1]!;
    const v2 = flankVerts[i2]!;

    // Dans le repère 3D (u, n, z) avec Z-up et normale extérieure +n :
    // (u x z) = -n. Donc pour pointer vers +n, l'ordre des sommets dans le plan (s, z) doit être CW (crossSZ < 0).
    const crossSZ = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    if (crossSZ < 0) {
      indices[iOffset++] = rightStartV + i0;
      indices[iOffset++] = rightStartV + i1;
      indices[iOffset++] = rightStartV + i2;
    } else {
      indices[iOffset++] = rightStartV + i0;
      indices[iOffset++] = rightStartV + i2;
      indices[iOffset++] = rightStartV + i1;
    }
  }

  // 5b. Flanc gauche (-n)
  const leftStartV = vOffset;
  for (let i = 0; i < flankVerts.length; i++) {
    const fv = flankVerts[i]!;
    const s = fv.x;
    const z = fv.y;
    const wx = stair.start.x + ux * s - nx * halfW;
    const wy = stair.start.y + uy * s - ny * halfW;

    const idx = (leftStartV + i) * 3;
    positions[idx] = wx;
    positions[idx + 1] = wy;
    positions[idx + 2] = z;

    normals[idx] = -nx;
    normals[idx + 1] = -ny;
    normals[idx + 2] = 0;

    uvs[(leftStartV + i) * 2] = wx / 1000;
    uvs[(leftStartV + i) * 2 + 1] = wy / 1000;
  }
  vOffset += flankVerts.length;

  for (let i = 0; i < flankIndices.length; i += 3) {
    const i0 = flankIndices[i]!;
    const i1 = flankIndices[i + 1]!;
    const i2 = flankIndices[i + 2]!;

    const v0 = flankVerts[i0]!;
    const v1 = flankVerts[i1]!;
    const v2 = flankVerts[i2]!;

    const crossSZ = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    // Normale opposée (-n) : orienter vers l'extérieur gauche (crossSZ > 0)
    if (crossSZ > 0) {
      indices[iOffset++] = leftStartV + i0;
      indices[iOffset++] = leftStartV + i1;
      indices[iOffset++] = leftStartV + i2;
    } else {
      indices[iOffset++] = leftStartV + i0;
      indices[iOffset++] = leftStartV + i2;
      indices[iOffset++] = leftStartV + i1;
    }
  }

  // Bounding box AABB
  const cornerPoints = [
    { x: stair.start.x - nx * halfW, y: stair.start.y - ny * halfW },
    { x: stair.start.x + nx * halfW, y: stair.start.y + ny * halfW },
    { x: stair.end.x + nx * halfW, y: stair.end.y + ny * halfW },
    { x: stair.end.x - nx * halfW, y: stair.end.y - ny * halfW },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cp of cornerPoints) {
    minX = Math.min(minX, cp.x);
    maxX = Math.max(maxX, cp.x);
    minY = Math.min(minY, cp.y);
    maxY = Math.max(maxY, cp.y);
  }

  const finalPositions =
    vOffset * 3 === positions.length ? positions : positions.subarray(0, vOffset * 3);
  const finalNormals = vOffset * 3 === normals.length ? normals : normals.subarray(0, vOffset * 3);
  const finalUvs = vOffset * 2 === uvs.length ? uvs : uvs.subarray(0, vOffset * 2);
  const finalIndices = iOffset === indices.length ? indices : indices.subarray(0, iOffset);

  return {
    positions: finalPositions,
    normals: finalNormals,
    uvs: finalUvs,
    indices: finalIndices,
    elementId: stair.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: z0 },
      max: { x: maxX, y: maxY, z: z1 },
    },
    userData: {
      elementId: stair.id,
      category: 'stair',
    },
  };
}
