/**
 * mesh-generator/shared/primitives — Socle géométrique unifié avec UVs métriques (1 UV = 1 000 mm)
 *
 * Centralise l'algèbre vectorielle 3D, composeMatrix4 et l'accumulateur de base
 * (boîtes chanfreinées étanches, cylindres lisses, quads orientés) partagé entre MEP et Architecture.
 */

import type { RawMeshData } from '@tabax/geometry';

export interface Vec3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const UV_SCALE = 0.001; // 1 unité UV = 1 000 mm

export function v3(x: number, y: number, z: number): Vec3D {
  return { x, y, z };
}

export function add(a: Vec3D, b: Vec3D): Vec3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3D, b: Vec3D): Vec3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vec3D, s: number): Vec3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vec3D, b: Vec3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3D, b: Vec3D): Vec3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len(v: Vec3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize(v: Vec3D): Vec3D {
  const l = len(v);
  if (l <= 1e-8) return { x: 0, y: 0, z: 1 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Construit une base orthonormée (u, v, axis) où axis est le vecteur directeur normalisé.
 */
export function computeOrthonormalBasis(axis: Vec3D): { u: Vec3D; v: Vec3D } {
  const ref = Math.abs(axis.z) > 0.9 ? v3(0, 1, 0) : v3(0, 0, 1);
  const u = normalize(cross(axis, ref));
  const v = cross(axis, u);
  return { u, v };
}

/**
 * Construit une matrice 4x4 column-major (ordre Three.js Matrix4.elements).
 */
export function composeMatrix4(
  origin: Vec3D,
  u: Vec3D,
  v: Vec3D,
  w: Vec3D,
  scaleXYZ: Vec3D = { x: 1, y: 1, z: 1 },
): readonly number[] {
  return [
    u.x * scaleXYZ.x,
    u.y * scaleXYZ.x,
    u.z * scaleXYZ.x,
    0,
    v.x * scaleXYZ.y,
    v.y * scaleXYZ.y,
    v.z * scaleXYZ.y,
    0,
    w.x * scaleXYZ.z,
    w.y * scaleXYZ.z,
    w.z * scaleXYZ.z,
    0,
    origin.x,
    origin.y,
    origin.z,
    1,
  ];
}

export class BaseMeshAccumulator {
  protected readonly positions: number[] = [];
  protected readonly normals: number[] = [];
  protected readonly uvs: number[] = [];
  protected readonly indices: number[] = [];
  protected minX = Infinity;
  protected minY = Infinity;
  protected minZ = Infinity;
  protected maxX = -Infinity;
  protected maxY = -Infinity;
  protected maxZ = -Infinity;

  public addVertex(p: Vec3D, n: Vec3D, uCoord: number, vCoord: number): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.uvs.push(uCoord, vCoord);
    if (p.x < this.minX) this.minX = p.x;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.y > this.maxY) this.maxY = p.y;
    if (p.z < this.minZ) this.minZ = p.z;
    if (p.z > this.maxZ) this.maxZ = p.z;
    return this.positions.length / 3 - 1;
  }

  public addTriangle(i0: number, i1: number, i2: number): void {
    this.indices.push(i0, i1, i2);
  }

  public addQuad(i0: number, i1: number, i2: number, i3: number): void {
    this.indices.push(i0, i1, i2, i0, i2, i3);
  }

  public addOrientedQuad(
    p0: Vec3D,
    p1: Vec3D,
    p2: Vec3D,
    p3: Vec3D,
    normalOverride?: Vec3D,
  ): void {
    const e1 = sub(p1, p0);
    const e2 = sub(p3, p0);
    const n = normalOverride ?? normalize(cross(e1, e2));
    const u1 = len(e1) * UV_SCALE;
    const v1 = len(e2) * UV_SCALE;

    const i0 = this.addVertex(p0, n, 0, 0);
    const i1 = this.addVertex(p1, n, u1, 0);
    const i2 = this.addVertex(p2, n, u1, v1);
    const i3 = this.addVertex(p3, n, 0, v1);
    this.addQuad(i0, i1, i2, i3);
  }

  protected addOrientedQuadWithMetrics(
    p0: Vec3D,
    p1: Vec3D,
    p2: Vec3D,
    p3: Vec3D,
    n: Vec3D,
    uAxis: Vec3D,
    vAxis: Vec3D,
  ): void {
    const pts = [p0, p1, p2, p3] as const;
    const idx: number[] = [];
    for (const p of pts) {
      idx.push(this.addVertex(p, n, dot(p, uAxis) * UV_SCALE, dot(p, vAxis) * UV_SCALE));
    }
    this.addQuad(idx[0] ?? 0, idx[1] ?? 0, idx[2] ?? 0, idx[3] ?? 0);
  }

  protected addFlatTri(
    a: Vec3D,
    b: Vec3D,
    c: Vec3D,
    expectedOut: Vec3D,
    uAxis: Vec3D,
    vAxis: Vec3D,
  ): void {
    const rawN = cross(sub(b, a), sub(c, a));
    if (len(rawN) < 1e-8) return;
    const n = normalize(rawN);
    const flip = dot(n, expectedOut) < 0;
    const finalN = flip ? scale(n, -1) : n;
    const ia = this.addVertex(a, finalN, dot(a, uAxis) * UV_SCALE, dot(a, vAxis) * UV_SCALE);
    const ib = this.addVertex(b, finalN, dot(b, uAxis) * UV_SCALE, dot(b, vAxis) * UV_SCALE);
    const ic = this.addVertex(c, finalN, dot(c, uAxis) * UV_SCALE, dot(c, vAxis) * UV_SCALE);
    if (flip) {
      this.addTriangle(ia, ic, ib);
    } else {
      this.addTriangle(ia, ib, ic);
    }
  }

  protected addFlatQuad(
    a: Vec3D,
    b: Vec3D,
    c: Vec3D,
    d: Vec3D,
    expectedOut: Vec3D,
    uAxis: Vec3D,
    vAxis: Vec3D,
  ): void {
    const rawN = cross(sub(b, a), sub(c, a));
    if (len(rawN) < 1e-8) return;
    const n = normalize(rawN);
    const flip = dot(n, expectedOut) < 0;
    const finalN = flip ? scale(n, -1) : n;
    const ia = this.addVertex(a, finalN, dot(a, uAxis) * UV_SCALE, dot(a, vAxis) * UV_SCALE);
    const ib = this.addVertex(b, finalN, dot(b, uAxis) * UV_SCALE, dot(b, vAxis) * UV_SCALE);
    const ic = this.addVertex(c, finalN, dot(c, uAxis) * UV_SCALE, dot(c, vAxis) * UV_SCALE);
    const id = this.addVertex(d, finalN, dot(d, uAxis) * UV_SCALE, dot(d, vAxis) * UV_SCALE);
    if (flip) {
      this.addQuad(ia, id, ic, ib);
    } else {
      this.addQuad(ia, ib, ic, id);
    }
  }

  /**
   * Boîte orientée avec chanfreins à 45° sur les 12 arêtes et 8 coins.
   * Retombe proprement sur une boîte plane UV (24 sommets) si c < 0.25 mm.
   */
  public addBeveledBoxRaw(
    center: Vec3D,
    width: number,
    depth: number,
    height: number,
    u: Vec3D,
    v: Vec3D,
    w: Vec3D,
    chamferMm?: number,
    maxChamferRatio = 0.08,
  ): void {
    if (width <= 0 || depth <= 0 || height <= 0) return;
    const hx = width * 0.5;
    const hy = depth * 0.5;
    const hz = height * 0.5;
    const minDim = Math.min(width, depth, height);
    const c = Math.min(chamferMm ?? 3, minDim * maxChamferRatio, hx * 0.45, hy * 0.45, hz * 0.45);

    const pt = (x: number, y: number, z: number) =>
      add(center, add(scale(u, x), add(scale(v, y), scale(w, z))));

    if (c < 0.25) {
      const p = (sx: number, sy: number, sz: number) => pt(sx * hx, sy * hy, sz * hz);
      this.addOrientedQuadWithMetrics(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1), u, v, w);
      this.addOrientedQuadWithMetrics(p(-1, 1, -1), p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), scale(u, -1), v, w);
      this.addOrientedQuadWithMetrics(p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), v, u, w);
      this.addOrientedQuadWithMetrics(p(1, -1, -1), p(-1, -1, -1), p(-1, -1, 1), p(1, -1, 1), scale(v, -1), u, w);
      this.addOrientedQuadWithMetrics(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), w, u, v);
      this.addOrientedQuadWithMetrics(p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1), p(-1, -1, -1), scale(w, -1), u, v);
      return;
    }

    const ix = hx - c;
    const iy = hy - c;
    const iz = hz - c;

    // 6 faces principales en retrait
    this.addFlatQuad(pt(hx, -iy, -iz), pt(hx, iy, -iz), pt(hx, iy, iz), pt(hx, -iy, iz), u, v, w);
    this.addFlatQuad(pt(-hx, iy, -iz), pt(-hx, -iy, -iz), pt(-hx, -iy, iz), pt(-hx, iy, iz), scale(u, -1), v, w);
    this.addFlatQuad(pt(-ix, hy, -iz), pt(ix, hy, -iz), pt(ix, hy, iz), pt(-ix, hy, iz), v, u, w);
    this.addFlatQuad(pt(ix, -hy, -iz), pt(-ix, -hy, -iz), pt(-ix, -hy, iz), pt(ix, -hy, iz), scale(v, -1), u, w);
    this.addFlatQuad(pt(-ix, -iy, hz), pt(ix, -iy, hz), pt(ix, iy, hz), pt(-ix, iy, hz), w, u, v);
    this.addFlatQuad(pt(-ix, iy, -hz), pt(ix, iy, -hz), pt(ix, -iy, -hz), pt(-ix, -iy, -hz), scale(w, -1), u, v);

    // 4 chanfreins verticaux (parallèles à w)
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const out = normalize(add(scale(u, sx), scale(v, sy)));
        this.addFlatQuad(
          pt(sx * hx, sy * iy, -iz),
          pt(sx * ix, sy * hy, -iz),
          pt(sx * ix, sy * hy, iz),
          pt(sx * hx, sy * iy, iz),
          out,
          u,
          w,
        );
      }
    }

    // 4 chanfreins parallèles à u (faces ±Y / ±Z)
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const out = normalize(add(scale(v, sy), scale(w, sz)));
        this.addFlatQuad(
          pt(-ix, sy * hy, sz * iz),
          pt(ix, sy * hy, sz * iz),
          pt(ix, sy * iy, sz * hz),
          pt(-ix, sy * iy, sz * hz),
          out,
          u,
          v,
        );
      }
    }

    // 4 chanfreins parallèles à v (faces ±X / ±Z)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const out = normalize(add(scale(u, sx), scale(w, sz)));
        this.addFlatQuad(
          pt(sx * hx, -iy, sz * iz),
          pt(sx * hx, iy, sz * iz),
          pt(sx * ix, iy, sz * hz),
          pt(sx * ix, -iy, sz * hz),
          out,
          v,
          w,
        );
      }
    }

    // 8 triangles de coins
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const out = normalize(add(scale(u, sx), add(scale(v, sy), scale(w, sz))));
          this.addFlatTri(
            pt(sx * hx, sy * iy, sz * iz),
            pt(sx * ix, sy * hy, sz * iz),
            pt(sx * ix, sy * iy, sz * hz),
            out,
            u,
            v,
          );
        }
      }
    }
  }

  /**
   * Cylindre lisse avec UVs métriques (u = arc circonférentiel en m, v = longueur en m).
   */
  public addSmoothCylinder(
    p1: Vec3D,
    p2: Vec3D,
    radius: number,
    segments = 24,
    caps = true,
  ): void {
    const axis = sub(p2, p1);
    const l = len(axis);
    if (l < 1e-4 || radius <= 0) return;

    const dir = normalize(axis);
    const { u, v } = computeOrthonormalBasis(dir);
    const circumference = 2 * Math.PI * radius;

    const r1: number[] = [];
    const r2: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (2 * Math.PI * i) / segments;
      const normal = add(scale(u, Math.cos(theta)), scale(v, Math.sin(theta)));
      const offset = scale(normal, radius);
      const uUv = (i / segments) * circumference * UV_SCALE;
      r1.push(this.addVertex(add(p1, offset), normal, uUv, 0));
      r2.push(this.addVertex(add(p2, offset), normal, uUv, l * UV_SCALE));
    }

    for (let i = 0; i < segments; i++) {
      this.addQuad(r1[i] ?? 0, r1[i + 1] ?? 0, r2[i + 1] ?? 0, r2[i] ?? 0);
    }

    if (caps) {
      const n1 = scale(dir, -1);
      const c1 = this.addVertex(p1, n1, 0, 0);
      const cap1: number[] = [];
      for (let i = 0; i < segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const dx = Math.cos(theta) * radius;
        const dy = Math.sin(theta) * radius;
        const wp = add(p1, add(scale(u, dx), scale(v, dy)));
        cap1.push(this.addVertex(wp, n1, dx * UV_SCALE, dy * UV_SCALE));
      }
      for (let i = 0; i < segments; i++) {
        this.addTriangle(c1, cap1[(i + 1) % segments] ?? 0, cap1[i] ?? 0);
      }

      const c2 = this.addVertex(p2, dir, 0, 0);
      const cap2: number[] = [];
      for (let i = 0; i < segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const dx = Math.cos(theta) * radius;
        const dy = Math.sin(theta) * radius;
        const wp = add(p2, add(scale(u, dx), scale(v, dy)));
        cap2.push(this.addVertex(wp, dir, dx * UV_SCALE, dy * UV_SCALE));
      }
      for (let i = 0; i < segments; i++) {
        this.addTriangle(c2, cap2[i] ?? 0, cap2[(i + 1) % segments] ?? 0);
      }
    }
  }

  public toRawMeshData(elementId: string, userData?: Record<string, unknown>): RawMeshData {
    const safeMinX = this.minX === Infinity ? 0 : this.minX;
    const safeMinY = this.minY === Infinity ? 0 : this.minY;
    const safeMinZ = this.minZ === Infinity ? 0 : this.minZ;
    const safeMaxX = this.maxX === -Infinity ? 0 : this.maxX;
    const safeMaxY = this.maxY === -Infinity ? 0 : this.maxY;
    const safeMaxZ = this.maxZ === -Infinity ? 0 : this.maxZ;

    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
      elementId,
      role: 'full',
      boundingBox: {
        min: { x: safeMinX, y: safeMinY, z: safeMinZ },
        max: { x: safeMaxX, y: safeMaxY, z: safeMaxZ },
      },
      userData,
    };
  }
}
