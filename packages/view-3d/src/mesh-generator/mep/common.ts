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

  public addBox(
    center: Vec3D,
    width: number,
    depth: number,
    height: number,
    u: Vec3D = v3(1, 0, 0),
    v: Vec3D = v3(0, 1, 0),
    w: Vec3D = v3(0, 0, 1),
  ): void {
    if (width <= 0 || depth <= 0 || height <= 0) return;
    const hw = width / 2;
    const hd = depth / 2;
    const hh = height / 2;

    const getPt = (su: number, sv: number, sw: number): Vec3D => {
      return add(center, add(scale(u, su * hw), add(scale(v, sv * hd), scale(w, sw * hh))));
    };

    // 6 faces de la boîte
    // Face bas (-W)
    {
      const n = scale(w, -1);
      this.addQuad(
        this.addVertex(getPt(-1, -1, -1), n),
        this.addVertex(getPt(1, -1, -1), n),
        this.addVertex(getPt(1, 1, -1), n),
        this.addVertex(getPt(-1, 1, -1), n),
      );
    }
    // Face haut (+W)
    {
      const n = w;
      this.addQuad(
        this.addVertex(getPt(-1, -1, 1), n),
        this.addVertex(getPt(-1, 1, 1), n),
        this.addVertex(getPt(1, 1, 1), n),
        this.addVertex(getPt(1, -1, 1), n),
      );
    }
    // Face avant (-V)
    {
      const n = scale(v, -1);
      this.addQuad(
        this.addVertex(getPt(-1, -1, -1), n),
        this.addVertex(getPt(-1, -1, 1), n),
        this.addVertex(getPt(1, -1, 1), n),
        this.addVertex(getPt(1, -1, -1), n),
      );
    }
    // Face arrière (+V)
    {
      const n = v;
      this.addQuad(
        this.addVertex(getPt(1, 1, -1), n),
        this.addVertex(getPt(1, 1, 1), n),
        this.addVertex(getPt(-1, 1, 1), n),
        this.addVertex(getPt(-1, 1, -1), n),
      );
    }
    // Face droite (+U)
    {
      const n = u;
      this.addQuad(
        this.addVertex(getPt(1, -1, -1), n),
        this.addVertex(getPt(1, -1, 1), n),
        this.addVertex(getPt(1, 1, 1), n),
        this.addVertex(getPt(1, 1, -1), n),
      );
    }
    // Face gauche (-U)
    {
      const n = scale(u, -1);
      this.addQuad(
        this.addVertex(getPt(-1, 1, -1), n),
        this.addVertex(getPt(-1, 1, 1), n),
        this.addVertex(getPt(-1, -1, 1), n),
        this.addVertex(getPt(-1, -1, -1), n),
      );
    }
  }

  public addSphere(
    center: Vec3D,
    radius: number,
    rings = 10,
    sectors = 16,
  ): void {
    if (radius <= 0) return;
    const ringIndices: number[][] = [];

    // Pôle sud (-Z)
    const pSouth = add(center, v3(0, 0, -radius));
    const iSouth = this.addVertex(pSouth, v3(0, 0, -1));

    // Anneaux de latitude
    for (let r = 1; r < rings; r++) {
      const phi = -Math.PI / 2 + (Math.PI * r) / rings;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const currentRing: number[] = [];

      for (let s = 0; s < sectors; s++) {
        const theta = (2 * Math.PI * s) / sectors;
        const nx = cosPhi * Math.cos(theta);
        const ny = cosPhi * Math.sin(theta);
        const nz = sinPhi;
        const norm = v3(nx, ny, nz);
        const pt = add(center, scale(norm, radius));
        currentRing.push(this.addVertex(pt, norm));
      }
      ringIndices.push(currentRing);
    }

    // Pôle nord (+Z)
    const pNorth = add(center, v3(0, 0, radius));
    const iNorth = this.addVertex(pNorth, v3(0, 0, 1));

    // Triangles pôle sud -> premier anneau
    const firstRing = ringIndices[0];
    if (firstRing) {
      for (let s = 0; s < sectors; s++) {
        const next = (s + 1) % sectors;
        this.addTriangle(iSouth, firstRing[next] ?? 0, firstRing[s] ?? 0);
      }
    }

    // Quads entre anneaux intermédiaires
    for (let r = 0; r < ringIndices.length - 1; r++) {
      const ringA = ringIndices[r];
      const ringB = ringIndices[r + 1];
      if (ringA && ringB) {
        for (let s = 0; s < sectors; s++) {
          const next = (s + 1) % sectors;
          this.addQuad(ringA[s] ?? 0, ringA[next] ?? 0, ringB[next] ?? 0, ringB[s] ?? 0);
        }
      }
    }

    // Triangles dernier anneau -> pôle nord
    const lastRing = ringIndices[ringIndices.length - 1];
    if (lastRing) {
      for (let s = 0; s < sectors; s++) {
        const next = (s + 1) % sectors;
        this.addTriangle(lastRing[s] ?? 0, lastRing[next] ?? 0, iNorth);
      }
    }
  }

  public addCurvedSweep(
    pStart: Vec3D,
    pControl: Vec3D,
    pEnd: Vec3D,
    rStart: number,
    rEnd: number,
    segments = 16,
    slices = 12,
  ): void {
    const vStart = sub(pControl, pStart);
    const vEnd = sub(pEnd, pControl);
    if (len(vStart) < 1e-4 || len(vEnd) < 1e-4) return;

    let nPlane = cross(vStart, vEnd);
    if (len(nPlane) < 1e-5) {
      const axis = normalize(vStart);
      const ref = Math.abs(axis.z) > 0.9 ? v3(0, 1, 0) : v3(0, 0, 1);
      nPlane = normalize(cross(axis, ref));
    } else {
      nPlane = normalize(nPlane);
    }

    const ringIndices: number[][] = [];

    for (let s = 0; s <= slices; s++) {
      const t = s / slices;
      const C = add(
        add(scale(pStart, (1 - t) ** 2), scale(pControl, 2 * (1 - t) * t)),
        scale(pEnd, t ** 2),
      );
      const Tunnorm = add(scale(vStart, 2 * (1 - t)), scale(vEnd, 2 * t));
      const T = normalize(Tunnorm);
      const U = normalize(cross(T, nPlane));
      const V = nPlane;
      const r = rStart + t * (rEnd - rStart);

      const ring: number[] = [];
      for (let i = 0; i < segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const norm = add(scale(U, Math.cos(theta)), scale(V, Math.sin(theta)));
        ring.push(this.addVertex(add(C, scale(norm, r)), norm));
      }
      ringIndices.push(ring);
    }

    for (let s = 0; s < slices; s++) {
      const rA = ringIndices[s];
      const rB = ringIndices[s + 1];
      if (rA && rB) {
        for (let i = 0; i < segments; i++) {
          const next = (i + 1) % segments;
          this.addQuad(rA[i] ?? 0, rA[next] ?? 0, rB[next] ?? 0, rB[i] ?? 0);
        }
      }
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
