import {
  computeWallFootprint2d,
  sliceWallWithOpenings,
  extrudeWallPiece,
  extrudePolygon,
  computeEffectiveSlabPolygon,
  triangulatePolygonWithHoles,
  triangulatePolygon,
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
  /** Profil polygonal d'arase supérieure (offsetAlong, zAbsolu) pour biseautage sous toiture (ADR-053). */
  readonly topProfile?: readonly Vec2[] | undefined;
}

function clipPolygonByHalfPlane(
  polygon: readonly Vec2[],
  p0: Vec2,
  normal: Vec2,
): Vec2[] {
  if (polygon.length === 0) return [];
  const output: Vec2[] = [];
  const len = polygon.length;
  for (let i = 0; i < len; i++) {
    const cur = polygon[i];
    const next = polygon[(i + 1) % len];
    if (!cur || !next) continue;
    const curDist = (cur.x - p0.x) * normal.x + (cur.y - p0.y) * normal.y;
    const nextDist = (next.x - p0.x) * normal.x + (next.y - p0.y) * normal.y;
    const curInside = curDist >= -1e-5;
    const nextInside = nextDist >= -1e-5;
    if (curInside) {
      output.push(cur);
      if (!nextInside) {
        const denom = curDist - nextDist;
        const t = Math.abs(denom) > 1e-9 ? curDist / denom : 0.5;
        output.push(vec2(cur.x + t * (next.x - cur.x), cur.y + t * (next.y - cur.y)));
      }
    } else if (nextInside) {
      const denom = curDist - nextDist;
      const t = Math.abs(denom) > 1e-9 ? curDist / denom : 0.5;
      output.push(vec2(cur.x + t * (next.x - cur.x), cur.y + t * (next.y - cur.y)));
    }
  }
  return output;
}

function evalTopZ(u: number, topProfile: readonly Vec2[]): number {
  const p0 = topProfile[0];
  if (!p0) return 2800;
  if (topProfile.length === 1) return p0.y;
  const p1 = topProfile[1];
  if (!p1) return p0.y;
  if (topProfile.length === 2) {
    const du = p1.x - p0.x;
    const t = Math.abs(du) > 1e-5 ? Math.max(0, Math.min(1, (u - p0.x) / du)) : 0;
    return p0.y + t * (p1.y - p0.y);
  }
  const pMid = p1;
  const pEnd = topProfile[2];
  if (!pEnd) return pMid.y;
  if (u <= pMid.x) {
    const du = pMid.x - p0.x;
    const t = Math.abs(du) > 1e-5 ? Math.max(0, Math.min(1, (u - p0.x) / du)) : 0;
    return p0.y + t * (pMid.y - p0.y);
  } else {
    const du = pEnd.x - pMid.x;
    const t = Math.abs(du) > 1e-5 ? Math.max(0, Math.min(1, (u - pMid.x) / du)) : 0;
    return pMid.y + t * (pEnd.y - pMid.y);
  }
}

function buildPlanarSlopedPrism(
  poly2D: readonly Vec2[],
  baseZ: number,
  wall: WallGeometryParams,
  topProfile: readonly Vec2[],
  elementId: string,
): RawMeshData | null {
  if (poly2D.length < 3) return null;
  const { cleanedVertices, indices: indices2D } = triangulatePolygon(poly2D);
  const n = cleanedVertices.length;
  const numTriangles2D = indices2D.length / 3;
  if (n < 3 || numTriangles2D === 0) return null;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  const uWall = len > 1e-5 ? vec2(dx / len, dy / len) : vec2(1, 0);

  const getU = (p: Vec2) => (p.x - wall.start.x) * uWall.x + (p.y - wall.start.y) * uWall.y;

  const zTops: number[] = [];
  for (const v of cleanedVertices) {
    const u = getU(v);
    zTops.push(evalTopZ(u, topProfile));
  }

  const cv0 = cleanedVertices[0];
  const cv1 = cleanedVertices[1];
  const u0 = cv0 ? getU(cv0) : 0;
  const u1 = cv1 ? getU(cv1) : 0;
  const du = u1 - u0;
  const zt0 = zTops[0] ?? 0;
  const zt1 = zTops[1] ?? 0;
  const dz = Math.abs(du) > 1e-5 ? (zt1 - zt0) / du : 0;
  const nxTopRaw = -dz * uWall.x;
  const nyTopRaw = -dz * uWall.y;
  const nzTopRaw = 1;
  const topNormLen = Math.hypot(nxTopRaw, nyTopRaw, nzTopRaw);
  const nxTop = nxTopRaw / topNormLen;
  const nyTop = nyTopRaw / topNormLen;
  const nzTop = nzTopRaw / topNormLen;

  const numFlankQuads = n;
  const totalTris = numTriangles2D * 2 + numFlankQuads * 2;
  const totalVerts = n * 2 + numFlankQuads * 4;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalTris * 3);

  let vOffset = 0;
  let iOffset = 0;

  // 1. Face inférieure (-Z)
  const botStartV = vOffset;
  for (const v of cleanedVertices) {
    positions[vOffset * 3] = v.x;
    positions[vOffset * 3 + 1] = v.y;
    positions[vOffset * 3 + 2] = baseZ;
    normals[vOffset * 3] = 0;
    normals[vOffset * 3 + 1] = 0;
    normals[vOffset * 3 + 2] = -1;
    uvs[vOffset * 2] = v.x / 1000;
    uvs[vOffset * 2 + 1] = v.y / 1000;
    vOffset++;
  }
  for (let t = 0; t < indices2D.length; t += 3) {
    const i0 = indices2D[t] ?? 0;
    const i1 = indices2D[t + 1] ?? 0;
    const i2 = indices2D[t + 2] ?? 0;
    indices[iOffset++] = botStartV + i0;
    indices[iOffset++] = botStartV + i2;
    indices[iOffset++] = botStartV + i1;
  }

  // 2. Face supérieure (+Z incliné)
  const topStartV = vOffset;
  for (let i = 0; i < n; i++) {
    const v = cleanedVertices[i];
    if (!v) continue;
    const zt = zTops[i] ?? baseZ;
    positions[vOffset * 3] = v.x;
    positions[vOffset * 3 + 1] = v.y;
    positions[vOffset * 3 + 2] = zt;
    normals[vOffset * 3] = nxTop;
    normals[vOffset * 3 + 1] = nyTop;
    normals[vOffset * 3 + 2] = nzTop;
    uvs[vOffset * 2] = v.x / 1000;
    uvs[vOffset * 2 + 1] = v.y / 1000;
    vOffset++;
  }
  for (let t = 0; t < indices2D.length; t += 3) {
    const i0 = indices2D[t] ?? 0;
    const i1 = indices2D[t + 1] ?? 0;
    const i2 = indices2D[t + 2] ?? 0;
    indices[iOffset++] = topStartV + i0;
    indices[iOffset++] = topStartV + i1;
    indices[iOffset++] = topStartV + i2;
  }

  // 3. Flancs verticaux (n quads)
  for (let i = 0; i < n; i++) {
    const p1 = cleanedVertices[i];
    const p2 = cleanedVertices[(i + 1) % n];
    if (!p1 || !p2) continue;
    const zTop1 = zTops[i] ?? baseZ;
    const zTop2 = zTops[(i + 1) % n] ?? baseZ;

    const edx = p2.x - p1.x;
    const edy = p2.y - p1.y;
    const eLen = Math.hypot(edx, edy);
    let nx = 0;
    let ny = 0;
    if (eLen > 1e-5) {
      nx = edy / eLen;
      ny = -edx / eLen;
    }

    const v0 = vOffset;
    positions[vOffset * 3] = p1.x;
    positions[vOffset * 3 + 1] = p1.y;
    positions[vOffset * 3 + 2] = baseZ;
    normals[vOffset * 3] = nx;
    normals[vOffset * 3 + 1] = ny;
    normals[vOffset * 3 + 2] = 0;
    uvs[vOffset * 2] = 0;
    uvs[vOffset * 2 + 1] = 0;
    vOffset++;

    const v1 = vOffset;
    positions[vOffset * 3] = p2.x;
    positions[vOffset * 3 + 1] = p2.y;
    positions[vOffset * 3 + 2] = baseZ;
    normals[vOffset * 3] = nx;
    normals[vOffset * 3 + 1] = ny;
    normals[vOffset * 3 + 2] = 0;
    uvs[vOffset * 2] = eLen / 1000;
    uvs[vOffset * 2 + 1] = 0;
    vOffset++;

    const v2 = vOffset;
    positions[vOffset * 3] = p2.x;
    positions[vOffset * 3 + 1] = p2.y;
    positions[vOffset * 3 + 2] = zTop2;
    normals[vOffset * 3] = nx;
    normals[vOffset * 3 + 1] = ny;
    normals[vOffset * 3 + 2] = 0;
    uvs[vOffset * 2] = eLen / 1000;
    uvs[vOffset * 2 + 1] = (zTop2 - baseZ) / 1000;
    vOffset++;

    const v3 = vOffset;
    positions[vOffset * 3] = p1.x;
    positions[vOffset * 3 + 1] = p1.y;
    positions[vOffset * 3 + 2] = zTop1;
    normals[vOffset * 3] = nx;
    normals[vOffset * 3 + 1] = ny;
    normals[vOffset * 3 + 2] = 0;
    uvs[vOffset * 2] = 0;
    uvs[vOffset * 2 + 1] = (zTop1 - baseZ) / 1000;
    vOffset++;

    indices[iOffset++] = v0;
    indices[iOffset++] = v1;
    indices[iOffset++] = v2;
    indices[iOffset++] = v0;
    indices[iOffset++] = v2;
    indices[iOffset++] = v3;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const minZ = baseZ;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = cleanedVertices[i];
    if (!v) continue;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    const zt = zTops[i] ?? baseZ;
    if (zt > maxZ) maxZ = zt;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    elementId,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
    userData: {
      elementId,
      category: 'wall',
    },
  };
}

function buildBeveledWallMeshes(
  poly2D: readonly Vec2[],
  wall: WallGeometryParams,
  topProfile: readonly Vec2[],
  baseZ: number,
  elementId: string,
  uInterval?: readonly [number, number],
): RawMeshData[] {
  const meshes: RawMeshData[] = [];
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  const uWall = len > 1e-5 ? vec2(dx / len, dy / len) : vec2(1, 0);

  const uMin = uInterval ? uInterval[0] : 0;
  const uMax = uInterval ? uInterval[1] : len;

  const topMid = topProfile[1];
  if (topProfile.length === 3 && topMid) {
    const uRidge = topMid.x;
    if (uRidge > uMin + 5 && uRidge < uMax - 5) {
      const pRidge = vec2(wall.start.x + uRidge * uWall.x, wall.start.y + uRidge * uWall.y);
      const poly1 = clipPolygonByHalfPlane(poly2D, pRidge, vec2(-uWall.x, -uWall.y));
      const poly2 = clipPolygonByHalfPlane(poly2D, pRidge, uWall);

      const m1 = buildPlanarSlopedPrism(poly1, baseZ, wall, topProfile, elementId);
      if (m1) meshes.push(m1);
      const m2 = buildPlanarSlopedPrism(poly2, baseZ, wall, topProfile, elementId);
      if (m2) meshes.push(m2);
      return meshes;
    }
  }

  const m = buildPlanarSlopedPrism(poly2D, baseZ, wall, topProfile, elementId);
  if (m) meshes.push(m);
  return meshes;
}

/**
 * Génère l'ensemble des maillages 3D bruts (RawMeshData[]) correspondant aux tranches
 * solides d'un mur percé d'ouvertures (allèges, linteaux, tranches pleines) ou biseauté sous toiture.
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

  const prof0 = params.topProfile?.[0];
  const prof1 = params.topProfile?.[1];
  const isBeveled =
    params.topProfile &&
    params.topProfile.length >= 2 &&
    (params.topProfile.length >= 3 ||
      (prof0 && prof1 && Math.abs(prof0.y - prof1.y) > 1e-3));

  if (isBeveled && params.topProfile) {
    if (!params.openings || params.openings.length === 0) {
      return buildBeveledWallMeshes(
        footprintVertices,
        params.wall,
        params.topProfile,
        elevation,
        params.wall.id,
      );
    }
  }

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
    if (piece.role === 'void') continue;

    if (isBeveled && params.topProfile && piece.z1 >= wallHeight - 10) {
      const beveledPieceMeshes = buildBeveledWallMeshes(
        piece.poly2D,
        params.wall,
        params.topProfile,
        elevation + piece.z0,
        params.wall.id,
        piece.uInterval,
      );
      meshes.push(...beveledPieceMeshes);
    } else {
      const elevatedPiece: WallPiece = {
        ...piece,
        z0: elevation + piece.z0,
        z1: elevation + piece.z1,
      };
      const mesh = extrudeWallPiece(elevatedPiece);
      if (mesh) {
        meshes.push({
          ...mesh,
          elementId: params.wall.id,
        });
      }
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
    const v = vertices[i];
    if (!v) continue;
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
    const tIdx = topIndices[i];
    if (tIdx !== undefined) {
      indices[iOffset++] = topStartV + tIdx;
    }
  }

  // 2. Face Inférieure (-Z)
  const bottomStartV = vOffset;
  for (let i = 0; i < numFaceVerts; i++) {
    const v = vertices[i];
    if (!v) continue;
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
    const i0 = topIndices[i];
    const i1 = topIndices[i + 1];
    const i2 = topIndices[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      indices[iOffset++] = bottomStartV + i0;
      indices[iOffset++] = bottomStartV + i2;
      indices[iOffset++] = bottomStartV + i1;
    }
  }

  // Fonction helper pour construire les flancs verticaux d'un anneau
  const addFlanks = (ring: readonly Vec2[]) => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const pA = ring[i];
      const pB = ring[(i + 1) % n];
      if (!pA || !pB) continue;

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
        const pt = pts[k];
        if (!pt) continue;
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
      const pt = pts[k];
      if (!pt) continue;
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
    const fv = flankVerts[i];
    if (!fv) continue;
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
    const i0 = flankIndices[i];
    const i1 = flankIndices[i + 1];
    const i2 = flankIndices[i + 2];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

    const v0 = flankVerts[i0];
    const v1 = flankVerts[i1];
    const v2 = flankVerts[i2];
    if (!v0 || !v1 || !v2) continue;

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
    const fv = flankVerts[i];
    if (!fv) continue;
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
    const i0 = flankIndices[i];
    const i1 = flankIndices[i + 1];
    const i2 = flankIndices[i + 2];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

    const v0 = flankVerts[i0];
    const v1 = flankVerts[i1];
    const v2 = flankVerts[i2];
    if (!v0 || !v1 || !v2) continue;

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

export interface RoofGeometryParams {
  readonly id: string;
  readonly footprint: readonly { readonly x: number; readonly y: number }[];
  readonly ridgeAxis?:
    | {
        readonly start: { readonly x: number; readonly y: number };
        readonly end: { readonly x: number; readonly y: number };
      }
    | undefined;
  readonly slopeOverrideDeg?: number | undefined;
  readonly overhangOverride?: number | undefined;
  readonly baseOffset?: number | undefined;
  readonly elevation?: number | undefined;
  readonly openings?:
    | readonly {
        readonly offsetU: number;
        readonly offsetV: number;
        readonly width: number;
        readonly height: number;
      }[]
    | undefined;
}

export interface FlatRoofTypeGeometryParams {
  readonly family: 'flat';
  readonly thickness: number;
}

export interface GableRoofTypeGeometryParams {
  readonly family: 'gable';
  readonly thickness: number;
  readonly slopeDeg: number;
  readonly overhangMm?: number;
}

export type RoofTypeGeometryParams = FlatRoofTypeGeometryParams | GableRoofTypeGeometryParams;

/**
 * Génère le maillage 3D brut (RawMeshData) d'une toiture (plate ou 2 pans).
 * Garantit un solide fermé étanche (caractéristique d'Euler V - E + F = 2) et des normales
 * unitaires orientées vers l'extérieur.
 */
export function createRoofMesh(
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  effectivePolygon?: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
): RawMeshData | null {
  if (!roof.footprint || roof.footprint.length < 3) return null;

  const elevation = roof.elevation ?? 0;
  const baseOffset = roof.baseOffset ?? 0;
  const zBase = elevation + baseOffset;
  const thickness = Math.max(10, roofType.thickness);

  // ---------------------------------------------------------------------------
  // 1. Toiture plate (Flat) : Prisme horizontal fermé (comme une dalle)
  // ---------------------------------------------------------------------------
  if (roofType.family === 'flat') {
    const boundary2D = roof.footprint.map((p) => vec2(p.x, p.y));
    const holes2D: Vec2[][] = [];

    if (effectivePolygon?.holes && effectivePolygon.holes.length > 0) {
      holes2D.push(...effectivePolygon.holes.map((h) => h.map((p) => vec2(p.x, p.y))));
    } else if (roof.openings && roof.openings.length > 0) {
      for (const op of roof.openings) {
        holes2D.push([
          vec2(op.offsetU, op.offsetV),
          vec2(op.offsetU + op.width, op.offsetV),
          vec2(op.offsetU + op.width, op.offsetV + op.height),
          vec2(op.offsetU, op.offsetV + op.height),
        ]);
      }
    }

    const zSup = zBase + thickness;
    const zInf = zBase;

    const outerLoop =
      effectivePolygon?.outer && effectivePolygon.outer.length >= 3
        ? effectivePolygon.outer.map((p) => vec2(p.x, p.y))
        : boundary2D;

    const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
      outerLoop,
      holes2D,
    );

    const numFaceVerts = vertices.length;
    const numFaceTris = topIndices.length / 3;

    let numWallSegments = outerLoop.length;
    for (const h of holes2D) {
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

    // Face supérieure (+Z)
    const topStartV = vOffset;
    for (const v of vertices) {
      positions[vOffset * 3] = v.x;
      positions[vOffset * 3 + 1] = v.y;
      positions[vOffset * 3 + 2] = zSup;

      normals[vOffset * 3] = 0;
      normals[vOffset * 3 + 1] = 0;
      normals[vOffset * 3 + 2] = 1;

      uvs[vOffset * 2] = v.x / 1000;
      uvs[vOffset * 2 + 1] = v.y / 1000;
      vOffset++;
    }
    for (let i = 0; i < topIndices.length; i++) {
      indices[iOffset++] = topStartV + (topIndices[i] ?? 0);
    }

    // Face inférieure (-Z)
    const botStartV = vOffset;
    for (const v of vertices) {
      positions[vOffset * 3] = v.x;
      positions[vOffset * 3 + 1] = v.y;
      positions[vOffset * 3 + 2] = zInf;

      normals[vOffset * 3] = 0;
      normals[vOffset * 3 + 1] = 0;
      normals[vOffset * 3 + 2] = -1;

      uvs[vOffset * 2] = v.x / 1000;
      uvs[vOffset * 2 + 1] = v.y / 1000;
      vOffset++;
    }
    for (let i = 0; i < topIndices.length; i += 3) {
      indices[iOffset++] = botStartV + (topIndices[i] ?? 0);
      indices[iOffset++] = botStartV + (topIndices[i + 2] ?? 0);
      indices[iOffset++] = botStartV + (topIndices[i + 1] ?? 0);
    }

    // Flancs verticaux (périphérie extérieure + trous)
    const allLoops = [outerLoop, ...holes2D];
    for (let lIdx = 0; lIdx < allLoops.length; lIdx++) {
      const loop = allLoops[lIdx];
      if (!loop) continue;
      const isHole = lIdx > 0;
      const count = loop.length;
      for (let j = 0; j < count; j++) {
        const p1 = loop[j];
        const p2 = loop[(j + 1) % count];
        if (!p1 || !p2) continue;

        const edx = p2.x - p1.x;
        const edy = p2.y - p1.y;
        const eLen = Math.hypot(edx, edy);
        let nx = 0;
        let ny = 0;
        if (eLen > 1e-5) {
          nx = edy / eLen;
          ny = -edx / eLen;
          if (isHole) {
            nx = -nx;
            ny = -ny;
          }
        }

        const v0 = vOffset;
        positions[vOffset * 3] = p1.x;
        positions[vOffset * 3 + 1] = p1.y;
        positions[vOffset * 3 + 2] = zInf;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = 0;
        uvs[vOffset * 2 + 1] = 0;
        vOffset++;

        const v1 = vOffset;
        positions[vOffset * 3] = p2.x;
        positions[vOffset * 3 + 1] = p2.y;
        positions[vOffset * 3 + 2] = zInf;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = eLen / 1000;
        uvs[vOffset * 2 + 1] = 0;
        vOffset++;

        const v2 = vOffset;
        positions[vOffset * 3] = p2.x;
        positions[vOffset * 3 + 1] = p2.y;
        positions[vOffset * 3 + 2] = zSup;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = eLen / 1000;
        uvs[vOffset * 2 + 1] = thickness / 1000;
        vOffset++;

        const v3 = vOffset;
        positions[vOffset * 3] = p1.x;
        positions[vOffset * 3 + 1] = p1.y;
        positions[vOffset * 3 + 2] = zSup;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = 0;
        uvs[vOffset * 2 + 1] = thickness / 1000;
        vOffset++;

        indices[iOffset++] = v0;
        indices[iOffset++] = v1;
        indices[iOffset++] = v2;
        indices[iOffset++] = v0;
        indices[iOffset++] = v2;
        indices[iOffset++] = v3;
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of outerLoop) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      positions,
      normals,
      uvs,
      indices,
      elementId: roof.id,
      role: 'full',
      boundingBox: {
        min: { x: minX, y: minY, z: zInf },
        max: { x: maxX, y: maxY, z: zSup },
      },
      userData: {
        elementId: roof.id,
        category: 'roof',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Toiture à deux pans (Gable) : Solide fermé étanche (Euler V - E + F = 2)
  // ---------------------------------------------------------------------------
  const gableType = roofType as GableRoofTypeGeometryParams;
  const slopeDeg = roof.slopeOverrideDeg ?? gableType.slopeDeg ?? 35;
  const slopeRad = (slopeDeg * Math.PI) / 180;
  const tanSlope = Math.tan(slopeRad);
  const cosSlope = Math.cos(slopeRad);
  const deltaZ = thickness / cosSlope;

  const ridgeAxis = roof.ridgeAxis ?? {
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
  };

  const ridgeDx = ridgeAxis.end.x - ridgeAxis.start.x;
  const ridgeDy = ridgeAxis.end.y - ridgeAxis.start.y;
  const ridgeLen = Math.hypot(ridgeDx, ridgeDy);
  const uRidge = ridgeLen > 1e-5 ? vec2(ridgeDx / ridgeLen, ridgeDy / ridgeLen) : vec2(1, 0);
  const nRidge = vec2(-uRidge.y, uRidge.x);

  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;

  for (const v of roof.footprint) {
    const s = (v.x - ridgeAxis.start.x) * uRidge.x + (v.y - ridgeAxis.start.y) * uRidge.y;
    const d = (v.x - ridgeAxis.start.x) * nRidge.x + (v.y - ridgeAxis.start.y) * nRidge.y;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }

  const overhang = roof.overhangOverride ?? gableType.overhangMm ?? 0;
  if (overhang > 0) {
    sMin -= overhang;
    sMax += overhang;
    dMin -= overhang;
    dMax += overhang;
  }

  const w1 = Math.max(10, Math.abs(dMin));
  const w2 = Math.max(10, Math.abs(dMax));
  const maxHalfSpan = Math.max(w1, w2);
  const totalRise = maxHalfSpan * tanSlope;
  const zRidge = zBase + totalRise;
  const zEave = zBase;

  const c0 = vec2(ridgeAxis.start.x + sMin * uRidge.x, ridgeAxis.start.y + sMin * uRidge.y);
  const c1 = vec2(ridgeAxis.start.x + sMax * uRidge.x, ridgeAxis.start.y + sMax * uRidge.y);

  // 6 sommets à c0 (sMin)
  const v0 = { x: c0.x - w1 * nRidge.x, y: c0.y - w1 * nRidge.y, z: zEave - deltaZ };
  const v1 = { x: c0.x - w1 * nRidge.x, y: c0.y - w1 * nRidge.y, z: zEave };
  const v2 = { x: c0.x, y: c0.y, z: zRidge };
  const v3 = { x: c0.x + w2 * nRidge.x, y: c0.y + w2 * nRidge.y, z: zEave };
  const v4 = { x: c0.x + w2 * nRidge.x, y: c0.y + w2 * nRidge.y, z: zEave - deltaZ };
  const v5 = { x: c0.x, y: c0.y, z: zRidge - deltaZ };

  // 6 sommets à c1 (sMax)
  const w0 = { x: c1.x - w1 * nRidge.x, y: c1.y - w1 * nRidge.y, z: zEave - deltaZ };
  const w1Pt = { x: c1.x - w1 * nRidge.x, y: c1.y - w1 * nRidge.y, z: zEave };
  const w2Pt = { x: c1.x, y: c1.y, z: zRidge };
  const w3 = { x: c1.x + w2 * nRidge.x, y: c1.y + w2 * nRidge.y, z: zEave };
  const w4 = { x: c1.x + w2 * nRidge.x, y: c1.y + w2 * nRidge.y, z: zEave - deltaZ };
  const w5 = { x: c1.x, y: c1.y, z: zRidge - deltaZ };

  // Normales unitaires pour chaque face
  const nEave1 = { x: -nRidge.x, y: -nRidge.y, z: 0 };
  const nEave2 = { x: nRidge.x, y: nRidge.y, z: 0 };
  const nGable0 = { x: -uRidge.x, y: -uRidge.y, z: 0 };
  const nGable1 = { x: uRidge.x, y: uRidge.y, z: 0 };

  const normHypot = Math.hypot(tanSlope, 1);
  const nExtrados1 = {
    x: (-tanSlope * nRidge.x) / normHypot,
    y: (-tanSlope * nRidge.y) / normHypot,
    z: 1 / normHypot,
  };
  const nExtrados2 = {
    x: (tanSlope * nRidge.x) / normHypot,
    y: (tanSlope * nRidge.y) / normHypot,
    z: 1 / normHypot,
  };
  const nIntrados2 = {
    x: (-tanSlope * nRidge.x) / normHypot,
    y: (-tanSlope * nRidge.y) / normHypot,
    z: -1 / normHypot,
  };
  const nIntrados1 = {
    x: (tanSlope * nRidge.x) / normHypot,
    y: (tanSlope * nRidge.y) / normHypot,
    z: -1 / normHypot,
  };

  const posList: number[] = [];
  const normList: number[] = [];
  const uvList: number[] = [];
  const indList: number[] = [];

  const addQuad = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    norm: { x: number; y: number; z: number },
  ) => {
    const v0Start = posList.length / 3;
    posList.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    normList.push(norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z);
    uvList.push(0, 0, 1, 0, 1, 1, 0, 1);
    indList.push(v0Start, v0Start + 1, v0Start + 2, v0Start, v0Start + 2, v0Start + 3);
  };

  const hasOpenings = roof.openings && roof.openings.length > 0;
  if (!hasOpenings) {
    addQuad(v0, w0, w1Pt, v1, nEave1);
    addQuad(v1, w1Pt, w2Pt, v2, nExtrados1);
    addQuad(v2, w2Pt, w3, v3, nExtrados2);
    addQuad(v3, w3, w4, v4, nEave2);
    addQuad(v4, w4, w5, v5, nIntrados2);
    addQuad(v5, w5, w0, v0, nIntrados1);
  } else {
    addQuad(v0, w0, w1Pt, v1, nEave1);
    addQuad(v2, w2Pt, w3, v3, nExtrados2);
    addQuad(v3, w3, w4, v4, nEave2);
    addQuad(v4, w4, w5, v5, nIntrados2);

    const op = roof.openings?.[0];
    if (op) {
      const opS0 = sMin + op.offsetU;
      const opS1 = opS0 + op.width;
      const opD0 = -w1 + op.offsetV;
      const opD1 = opD0 + op.height;

      const pt3D = (s: number, d: number, isIntrados: boolean) => {
        const c = vec2(ridgeAxis.start.x + s * uRidge.x, ridgeAxis.start.y + s * uRidge.y);
        const frac = Math.abs(d) / (w1 || 1);
        const z = zRidge - frac * totalRise - (isIntrados ? deltaZ : 0);
        return {
          x: c.x + d * nRidge.x,
          y: c.y + d * nRidge.y,
          z,
        };
      };

      // 4 quads autour du trou sur extrados
      addQuad(v1, pt3D(opS0, -w1, false), pt3D(opS0, 0, false), v2, nExtrados1);
      addQuad(pt3D(opS1, -w1, false), w1Pt, w2Pt, pt3D(opS1, 0, false), nExtrados1);
      addQuad(pt3D(opS0, -w1, false), pt3D(opS1, -w1, false), pt3D(opS1, opD0, false), pt3D(opS0, opD0, false), nExtrados1);
      addQuad(pt3D(opS0, opD1, false), pt3D(opS1, opD1, false), pt3D(opS1, 0, false), pt3D(opS0, 0, false), nExtrados1);

      // 4 quads autour du trou sur intrados
      addQuad(pt3D(opS0, -w1, true), v0, v5, pt3D(opS0, 0, true), nIntrados1);
      addQuad(w0, pt3D(opS1, -w1, true), pt3D(opS1, 0, true), w5, nIntrados1);
      addQuad(pt3D(opS1, -w1, true), pt3D(opS0, -w1, true), pt3D(opS0, opD0, true), pt3D(opS1, opD0, true), nIntrados1);
      addQuad(pt3D(opS1, opD1, true), pt3D(opS0, opD1, true), pt3D(opS0, 0, true), pt3D(opS1, 0, true), nIntrados1);

      // 4 flancs intérieurs de l'ouverture
      addQuad(pt3D(opS0, opD1, false), pt3D(opS0, opD0, false), pt3D(opS0, opD0, true), pt3D(opS0, opD1, true), { x: uRidge.x, y: uRidge.y, z: 0 });
      addQuad(pt3D(opS1, opD0, false), pt3D(opS1, opD1, false), pt3D(opS1, opD1, true), pt3D(opS1, opD0, true), { x: -uRidge.x, y: -uRidge.y, z: 0 });
      addQuad(pt3D(opS0, opD0, false), pt3D(opS1, opD0, false), pt3D(opS1, opD0, true), pt3D(opS0, opD0, true), { x: nRidge.x, y: nRidge.y, z: 0 });
      addQuad(pt3D(opS1, opD1, false), pt3D(opS0, opD1, false), pt3D(opS0, opD1, true), pt3D(opS1, opD1, true), { x: -nRidge.x, y: -nRidge.y, z: 0 });
    }
  }

  // Pignon 0 (sMin) : 2 quads CCW
  addQuad(v0, v5, v2, v1, nGable0);
  addQuad(v5, v4, v3, v2, nGable0);

  // Pignon 1 (sMax) : 2 quads CCW
  addQuad(w0, w5, w2Pt, w1Pt, nGable1);
  addQuad(w5, w4, w3, w2Pt, nGable1);

  const positions = new Float32Array(posList);
  const normals = new Float32Array(normList);
  const uvs = new Float32Array(uvList);
  const indices = new Uint32Array(indList);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    elementId: roof.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: zEave - deltaZ },
      max: { x: maxX, y: maxY, z: zRidge },
    },
    userData: {
      elementId: roof.id,
      category: 'roof',
    },
  };
}
