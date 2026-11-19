import {
  computeWallFootprint2d,
  sliceWallWithOpenings,
  extrudeWallPiece,
  triangulatePolygon,
  vec2,
  type RawMeshData,
  type WallPiece,
  type OpeningInput,
  type Vec2,
} from '@mini-bim/geometry';
import type {
  WallGeometryParams,
  WallTypeGeometryParams,
  WallWithOpeningsParams,
} from './types.js';

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
