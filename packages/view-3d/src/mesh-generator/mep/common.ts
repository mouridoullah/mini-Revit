/**
 * mesh-generator/mep/common — Algèbre linéaire 3D locale et accumulateur de maillage RawMeshData
 */

import type { RawMeshData } from '@tabax/geometry';

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

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
  if (l < 1e-7) return { x: 0, y: 0, z: 1 };
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

export class RawMeshAccumulator {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly indices: number[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  private maxZ = -Infinity;

  public addVertex(p: Vec3D, n: Vec3D): number {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
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

  public addCylinder(
    p1: Vec3D,
    p2: Vec3D,
    radius: number,
    segments = 16,
    caps = true,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || radius <= 0) return;

    const axis = normalize(dir);
    const { u, v } = computeOrthonormalBasis(axis);

    const baseIndices: number[] = [];
    const topIndices: number[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rad = add(scale(u, cos), scale(v, sin));

      const vBase = add(p1, scale(rad, radius));
      const vTop = add(p2, scale(rad, radius));

      baseIndices.push(this.addVertex(vBase, rad));
      topIndices.push(this.addVertex(vTop, rad));
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const b0 = baseIndices[i] ?? 0;
      const b1 = baseIndices[next] ?? 0;
      const t0 = topIndices[i] ?? 0;
      const t1 = topIndices[next] ?? 0;

      this.addTriangle(b0, b1, t0);
      this.addTriangle(t0, b1, t1);
    }

    if (caps) {
      const nBottom = scale(axis, -1);
      const nTop = axis;

      const cBottom = this.addVertex(p1, nBottom);
      const cTop = this.addVertex(p2, nTop);

      const capBaseIndices: number[] = [];
      const capTopIndices: number[] = [];

      for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rad = add(scale(u, cos), scale(v, sin));

        capBaseIndices.push(this.addVertex(add(p1, scale(rad, radius)), nBottom));
        capTopIndices.push(this.addVertex(add(p2, scale(rad, radius)), nTop));
      }

      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        this.addTriangle(cBottom, capBaseIndices[next] ?? 0, capBaseIndices[i] ?? 0);
        this.addTriangle(cTop, capTopIndices[i] ?? 0, capTopIndices[next] ?? 0);
      }
    }
  }

  public addBoxAlongAxis(
    p1: Vec3D,
    p2: Vec3D,
    width: number,
    height: number,
    caps = true,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || width <= 0 || height <= 0) return;

    const axis = normalize(dir);
    let u: Vec3D;
    let v: Vec3D;
    if (Math.abs(axis.z) > 0.99) {
      u = v3(1, 0, 0);
      v = v3(0, 1, 0);
    } else {
      u = normalize(cross(axis, v3(0, 0, 1)));
      v = cross(axis, u);
    }

    const halfW = width / 2;
    const halfH = height / 2;

    const getCorner = (origin: Vec3D, su: number, sv: number): Vec3D => {
      return add(origin, add(scale(u, su * halfW), scale(v, sv * halfH)));
    };

    const sides = [
      {
        du: 1,
        dv: 0,
        n: u,
        p1a: getCorner(p1, 1, -1),
        p1b: getCorner(p1, 1, 1),
        p2b: getCorner(p2, 1, 1),
        p2a: getCorner(p2, 1, -1),
      },
      {
        du: 0,
        dv: 1,
        n: v,
        p1a: getCorner(p1, 1, 1),
        p1b: getCorner(p1, -1, 1),
        p2b: getCorner(p2, -1, 1),
        p2a: getCorner(p2, 1, 1),
      },
      {
        du: -1,
        dv: 0,
        n: scale(u, -1),
        p1a: getCorner(p1, -1, 1),
        p1b: getCorner(p1, -1, -1),
        p2b: getCorner(p2, -1, -1),
        p2a: getCorner(p2, -1, 1),
      },
      {
        du: 0,
        dv: -1,
        n: scale(v, -1),
        p1a: getCorner(p1, -1, -1),
        p1b: getCorner(p1, 1, -1),
        p2b: getCorner(p2, 1, -1),
        p2a: getCorner(p2, -1, -1),
      },
    ];

    for (const s of sides) {
      const i0 = this.addVertex(s.p1a, s.n);
      const i1 = this.addVertex(s.p1b, s.n);
      const i2 = this.addVertex(s.p2b, s.n);
      const i3 = this.addVertex(s.p2a, s.n);
      this.addQuad(i0, i1, i2, i3);
    }

    if (caps) {
      const n1 = scale(axis, -1);
      const c10 = this.addVertex(getCorner(p1, -1, -1), n1);
      const c11 = this.addVertex(getCorner(p1, -1, 1), n1);
      const c12 = this.addVertex(getCorner(p1, 1, 1), n1);
      const c13 = this.addVertex(getCorner(p1, 1, -1), n1);
      this.addQuad(c10, c11, c12, c13);

      const n2 = axis;
      const c20 = this.addVertex(getCorner(p2, -1, -1), n2);
      const c21 = this.addVertex(getCorner(p2, 1, -1), n2);
      const c22 = this.addVertex(getCorner(p2, 1, 1), n2);
      const c23 = this.addVertex(getCorner(p2, -1, 1), n2);
      this.addQuad(c20, c21, c22, c23);
    }
  }

  public addTruncatedCone(
    p1: Vec3D,
    p2: Vec3D,
    r1: number,
    r2: number,
    segments = 16,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4) return;

    const axis = normalize(dir);
    const { u, v } = computeOrthonormalBasis(axis);

    const baseIndices: number[] = [];
    const topIndices: number[] = [];

    const dr = r1 - r2;
    const slantNormalFactor = Math.hypot(l, dr);
    const nz = dr / slantNormalFactor;
    const nrad = l / slantNormalFactor;

    for (let i = 0; i < segments; i++) {
      const angle = (2 * Math.PI * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rad = add(scale(u, cos), scale(v, sin));
      const norm = add(scale(rad, nrad), scale(axis, nz));

      const vBase = add(p1, scale(rad, r1));
      const vTop = add(p2, scale(rad, r2));

      baseIndices.push(this.addVertex(vBase, norm));
      topIndices.push(this.addVertex(vTop, norm));
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const b0 = baseIndices[i] ?? 0;
      const b1 = baseIndices[next] ?? 0;
      const t0 = topIndices[i] ?? 0;
      const t1 = topIndices[next] ?? 0;

      this.addTriangle(b0, b1, t0);
      this.addTriangle(t0, b1, t1);
    }
  }

  public toRawMeshData(
    elementId: string,
    userData?: Record<string, unknown>,
  ): RawMeshData {
    const safeMinX = this.minX === Infinity ? 0 : this.minX;
    const safeMinY = this.minY === Infinity ? 0 : this.minY;
    const safeMinZ = this.minZ === Infinity ? 0 : this.minZ;
    const safeMaxX = this.maxX === -Infinity ? 0 : this.maxX;
    const safeMaxY = this.maxY === -Infinity ? 0 : this.maxY;
    const safeMaxZ = this.maxZ === -Infinity ? 0 : this.maxZ;

    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
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
