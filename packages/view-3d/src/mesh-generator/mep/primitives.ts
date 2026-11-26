/**
 * mesh-generator/mep/primitives — Primitives procédurales chanfreinées avec UVs métriques (1 UV = 1 000 mm)
 *
 * Modules purement géométriques (zéro Three.js) produisant des RawMeshData étanches avec normales
 * unitaires exactes et coordonnées UV métriques adaptées aux textures PBR brossées/perforées.
 */

import type { RawMeshData } from '@tabax/geometry';
import {
  add,
  sub,
  scale,
  cross,
  len,
  normalize,
  computeOrthonormalBasis,
  type Vec3D,
} from './common.js';

const UV_SCALE = 0.001; // 1 unité UV = 1 000 mm

function dot(a: Vec3D, b: Vec3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export class UvMeshAccumulator {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private minX = Infinity;
  private minY = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  private maxZ = -Infinity;

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

  private addOrientedQuadWithMetrics(
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

  private addFlatTri(a: Vec3D, b: Vec3D, c: Vec3D, expectedOut: Vec3D, uAxis: Vec3D, vAxis: Vec3D): void {
    const rawN = cross(sub(b, a), sub(c, a));
    const nLen = len(rawN);
    if (nLen < 1e-8) return;
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

  private addFlatQuad(
    a: Vec3D,
    b: Vec3D,
    c: Vec3D,
    d: Vec3D,
    expectedOut: Vec3D,
    uAxis: Vec3D,
    vAxis: Vec3D,
  ): void {
    const rawN = cross(sub(b, a), sub(c, a));
    const nLen = len(rawN);
    if (nLen < 1e-8) return;
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
   * Boîte orientée avec chanfreins à 45° sur les 12 arêtes et 8 coins (c = min(3 mm, 0.08 * minDim)).
   * Retombe proprement sur une boîte plane UV si c < 0.25 mm.
   */
  public addBeveledBox(
    center: Vec3D,
    width: number,
    depth: number,
    height: number,
    u: Vec3D,
    v: Vec3D,
    w: Vec3D,
    chamferMm?: number,
  ): void {
    if (width <= 0 || depth <= 0 || height <= 0) return;
    const hx = width * 0.5;
    const hy = depth * 0.5;
    const hz = height * 0.5;
    const minDim = Math.min(width, depth, height);
    const c = Math.min(chamferMm ?? 3, minDim * 0.08, hx * 0.45, hy * 0.45, hz * 0.45);

    const pt = (x: number, y: number, z: number) =>
      add(center, add(scale(u, x), add(scale(v, y), scale(w, z))));

    if (c < 0.25) {
      // Boîte simple avec UVs métriques par face
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
   * Tube prismatique rectangulaire chanfreiné extrudé entre p1 et p2 (gaines CVC / chemins).
   */
  public addChamferedRectTube(
    p1: Vec3D,
    p2: Vec3D,
    width: number,
    height: number,
    chamferMm = 3,
    caps = true,
    uOverride?: Vec3D,
    vOverride?: Vec3D,
  ): void {
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || width <= 0 || height <= 0) return;

    const axis = normalize(dir);
    let u = uOverride;
    let v = vOverride;
    if (!u || !v) {
      const basis = computeOrthonormalBasis(axis);
      u = basis.u;
      v = basis.v;
    }

    const hx = width * 0.5;
    const hy = height * 0.5;
    const c = Math.min(chamferMm, width * 0.1, height * 0.1);
    const pts2D: readonly [number, number][] =
      c >= 0.25
        ? [
            [hx, -hy + c],
            [hx, hy - c],
            [hx - c, hy],
            [-hx + c, hy],
            [-hx, hy - c],
            [-hx, -hy + c],
            [-hx + c, -hy],
            [hx - c, -hy],
          ]
        : [
            [hx, -hy],
            [hx, hy],
            [-hx, hy],
            [-hx, -hy],
          ];

    const nPts = pts2D.length;
    let perim = 0;
    for (let i = 0; i < nPts; i++) {
      const curr = pts2D[i];
      const next = pts2D[(i + 1) % nPts];
      if (!curr || !next) continue;
      const pA1 = add(p1, add(scale(u, curr[0]), scale(v, curr[1])));
      const pB1 = add(p1, add(scale(u, next[0]), scale(v, next[1])));
      const pB2 = add(p2, add(scale(u, next[0]), scale(v, next[1])));
      const pA2 = add(p2, add(scale(u, curr[0]), scale(v, curr[1])));

      const segLen = Math.hypot(next[0] - curr[0], next[1] - curr[1]);
      const midOut = normalize(
        add(scale(u, (curr[0] + next[0]) * 0.5), scale(v, (curr[1] + next[1]) * 0.5)),
      );
      const rawN = normalize(cross(sub(pB1, pA1), sub(pB2, pA1)));
      const flip = dot(rawN, midOut) < 0;
      const normal = flip ? scale(rawN, -1) : rawN;

      const u0 = perim * UV_SCALE;
      const u1 = (perim + segLen) * UV_SCALE;
      const v0 = 0;
      const v1 = l * UV_SCALE;

      const i0 = this.addVertex(pA1, normal, u0, v0);
      const i1 = this.addVertex(pB1, normal, u1, v0);
      const i2 = this.addVertex(pB2, normal, u1, v1);
      const i3 = this.addVertex(pA2, normal, u0, v1);

      if (flip) {
        this.addQuad(i0, i3, i2, i1);
      } else {
        this.addQuad(i0, i1, i2, i3);
      }
      perim += segLen;
    }

    if (caps) {
      const addCap = (origin: Vec3D, normal: Vec3D, reverse: boolean) => {
        const ci = this.addVertex(origin, normal, 0, 0);
        const ring: number[] = [];
        for (const pt2 of pts2D) {
          const wp = add(origin, add(scale(u, pt2[0]), scale(v, pt2[1])));
          ring.push(this.addVertex(wp, normal, pt2[0] * UV_SCALE, pt2[1] * UV_SCALE));
        }
        for (let i = 0; i < nPts; i++) {
          const a = ring[i] ?? 0;
          const b = ring[(i + 1) % nPts] ?? 0;
          if (reverse) {
            this.addTriangle(ci, b, a);
          } else {
            this.addTriangle(ci, a, b);
          }
        }
      };
      addCap(p1, scale(axis, -1), true);
      addCap(p2, axis, false);
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
    const dir = sub(p2, p1);
    const l = len(dir);
    if (l < 1e-4 || radius <= 0) return;

    const axis = normalize(dir);
    const { u, v } = computeOrthonormalBasis(axis);
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
      const a0 = r1[i] ?? 0;
      const a1 = r1[i + 1] ?? 0;
      const b1 = r2[i + 1] ?? 0;
      const b0 = r2[i] ?? 0;
      this.addQuad(a0, a1, b1, b0);
    }

    if (caps) {
      const n1 = scale(axis, -1);
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

      const c2 = this.addVertex(p2, axis, 0, 0);
      const cap2: number[] = [];
      for (let i = 0; i < segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const dx = Math.cos(theta) * radius;
        const dy = Math.sin(theta) * radius;
        const wp = add(p2, add(scale(u, dx), scale(v, dy)));
        cap2.push(this.addVertex(wp, axis, dx * UV_SCALE, dy * UV_SCALE));
      }
      for (let i = 0; i < segments; i++) {
        this.addTriangle(c2, cap2[i] ?? 0, cap2[(i + 1) % segments] ?? 0);
      }
    }
  }

  /**
   * Balayage courbe circulaire (coude rayon doux) avec UVs métriques continues.
   */
  public addCurvedSweep(
    pStart: Vec3D,
    pControl: Vec3D,
    pEnd: Vec3D,
    rStart: number,
    rEnd: number,
    segments = 24,
    slices = 16,
  ): void {
    const vStart = sub(pControl, pStart);
    const vEnd = sub(pEnd, pControl);
    if (len(vStart) < 1e-4 || len(vEnd) < 1e-4) return;

    let nPlane = cross(vStart, vEnd);
    if (len(nPlane) < 1e-5) {
      const axis = normalize(vStart);
      const basis = computeOrthonormalBasis(axis);
      nPlane = basis.u;
    } else {
      nPlane = normalize(nPlane);
    }

    const rings: number[][] = [];
    let arcLen = 0;
    let prevC = pStart;

    for (let s = 0; s <= slices; s++) {
      const t = s / slices;
      const C = add(
        add(scale(pStart, (1 - t) ** 2), scale(pControl, 2 * (1 - t) * t)),
        scale(pEnd, t ** 2),
      );
      if (s > 0) arcLen += len(sub(C, prevC));
      prevC = C;

      const T = normalize(add(scale(vStart, 2 * (1 - t)), scale(vEnd, 2 * t)));
      const U = normalize(cross(T, nPlane));
      const V = nPlane;
      const r = rStart + t * (rEnd - rStart);
      const circum = 2 * Math.PI * r;

      const ring: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const norm = add(scale(U, Math.cos(theta)), scale(V, Math.sin(theta)));
        ring.push(
          this.addVertex(add(C, scale(norm, r)), norm, (i / segments) * circum * UV_SCALE, arcLen * UV_SCALE),
        );
      }
      rings.push(ring);
    }

    for (let s = 0; s < slices; s++) {
      const rA = rings[s];
      const rB = rings[s + 1];
      if (!rA || !rB) continue;
      for (let i = 0; i < segments; i++) {
        this.addQuad(rA[i] ?? 0, rA[i + 1] ?? 0, rB[i + 1] ?? 0, rB[i] ?? 0);
      }
    }
  }

  /**
   * Profil de bride annulaire chanfreinée (PN16 ou manchon femelle).
   */
  public addFlangeProfile(
    center: Vec3D,
    axis: Vec3D,
    innerR: number,
    outerR: number,
    thickness: number,
    bevelMm = 1.5,
    segments = 24,
  ): void {
    const dir = normalize(axis);
    const { u, v } = computeOrthonormalBasis(dir);
    const halfT = thickness * 0.5;
    const b = Math.min(bevelMm, halfT * 0.4, (outerR - innerR) * 0.3);

    // Profil fermé en coupe radiale (r, z) CCW
    const profile: readonly [number, number][] = [
      [innerR, -halfT],
      [outerR - b, -halfT],
      [outerR, -halfT + b],
      [outerR, halfT - b],
      [outerR - b, halfT],
      [innerR, halfT],
    ];

    const nP = profile.length;
    for (let s = 0; s < nP; s++) {
      const a = profile[s];
      const c = profile[(s + 1) % nP];
      if (!a || !c) continue;
      const dr = c[0] - a[0];
      const dz = c[1] - a[1];
      const edgeLen = Math.hypot(dr, dz);
      if (edgeLen < 1e-4) continue;

      const ringA: number[] = [];
      const ringB: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (2 * Math.PI * i) / segments;
        const radial = add(scale(u, Math.cos(theta)), scale(v, Math.sin(theta)));
        // Normale extérieure dans le plan (radial, dir)
        const norm = normalize(add(scale(radial, -dz), scale(dir, dr)));
        const pA = add(center, add(scale(radial, a[0]), scale(dir, a[1])));
        const pB = add(center, add(scale(radial, c[0]), scale(dir, c[1])));
        const uUv = (i / segments) * 2 * Math.PI * ((a[0] + c[0]) * 0.5) * UV_SCALE;
        ringA.push(this.addVertex(pA, norm, uUv, 0));
        ringB.push(this.addVertex(pB, norm, uUv, edgeLen * UV_SCALE));
      }

      for (let i = 0; i < segments; i++) {
        this.addQuad(ringA[i] ?? 0, ringB[i] ?? 0, ringB[i + 1] ?? 0, ringA[i + 1] ?? 0);
      }
    }
  }

  /**
   * Prisme hexagonal (écrou, tête de boulon, chapeau de vanne/clapet).
   */
  public addHexPrism(
    center: Vec3D,
    axis: Vec3D,
    flatToFlatDiameter: number,
    height: number,
  ): void {
    const dir = normalize(axis);
    const { u, v } = computeOrthonormalBasis(dir);
    const circumR = flatToFlatDiameter / Math.sqrt(3);
    const halfH = height * 0.5;
    const p1 = sub(center, scale(dir, halfH));
    const p2 = add(center, scale(dir, halfH));

    const ptsU: number[] = [];
    const ptsV: number[] = [];
    for (let i = 0; i < 6; i++) {
      const th = (Math.PI / 3) * i;
      ptsU.push(Math.cos(th) * circumR);
      ptsV.push(Math.sin(th) * circumR);
    }

    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      const pA1 = add(p1, add(scale(u, ptsU[i] ?? 0), scale(v, ptsV[i] ?? 0)));
      const pB1 = add(p1, add(scale(u, ptsU[next] ?? 0), scale(v, ptsV[next] ?? 0)));
      const pB2 = add(p2, add(scale(u, ptsU[next] ?? 0), scale(v, ptsV[next] ?? 0)));
      const pA2 = add(p2, add(scale(u, ptsU[i] ?? 0), scale(v, ptsV[i] ?? 0)));
      const out = normalize(
        add(
          scale(u, ((ptsU[i] ?? 0) + (ptsU[next] ?? 0)) * 0.5),
          scale(v, ((ptsV[i] ?? 0) + (ptsV[next] ?? 0)) * 0.5),
        ),
      );
      this.addFlatQuad(pA1, pB1, pB2, pA2, out, u, dir);
    }

    const addHexCap = (origin: Vec3D, normal: Vec3D, rev: boolean) => {
      const ci = this.addVertex(origin, normal, 0, 0);
      const ring: number[] = [];
      for (let i = 0; i < 6; i++) {
        const dx = ptsU[i] ?? 0;
        const dy = ptsV[i] ?? 0;
        ring.push(
          this.addVertex(
            add(origin, add(scale(u, dx), scale(v, dy))),
            normal,
            dx * UV_SCALE,
            dy * UV_SCALE,
          ),
        );
      }
      for (let i = 0; i < 6; i++) {
        const a = ring[i] ?? 0;
        const b = ring[(i + 1) % 6] ?? 0;
        if (rev) this.addTriangle(ci, b, a);
        else this.addTriangle(ci, a, b);
      }
    };
    addHexCap(p1, scale(dir, -1), true);
    addHexCap(p2, dir, false);
  }

  /**
   * Volant à rayons circulaire pour vannes DN > 50 (jante toroïdale segmentée + moyeu + N rayons).
   */
  public addHandwheel(
    center: Vec3D,
    axis: Vec3D,
    outerRadius: number,
    rimRadius = 6,
    spokes = 4,
    ringSegments = 20,
    tubeSegments = 8,
  ): void {
    const dir = normalize(axis);
    const { u, v } = computeOrthonormalBasis(dir);
    const majorR = Math.max(rimRadius * 2, outerRadius - rimRadius);

    // 1. Jante toroïdale
    const rings: number[][] = [];
    for (let i = 0; i <= ringSegments; i++) {
      const phi = (2 * Math.PI * i) / ringSegments;
      const radial = add(scale(u, Math.cos(phi)), scale(v, Math.sin(phi)));
      const ringCenter = add(center, scale(radial, majorR));
      const ring: number[] = [];
      for (let j = 0; j <= tubeSegments; j++) {
        const th = (2 * Math.PI * j) / tubeSegments;
        const n = add(scale(radial, Math.cos(th)), scale(dir, Math.sin(th)));
        const pt = add(ringCenter, scale(n, rimRadius));
        ring.push(
          this.addVertex(
            pt,
            n,
            (i / ringSegments) * 2 * Math.PI * majorR * UV_SCALE,
            (j / tubeSegments) * 2 * Math.PI * rimRadius * UV_SCALE,
          ),
        );
      }
      rings.push(ring);
    }
    for (let i = 0; i < ringSegments; i++) {
      const rA = rings[i];
      const rB = rings[i + 1];
      if (!rA || !rB) continue;
      for (let j = 0; j < tubeSegments; j++) {
        this.addQuad(rA[j] ?? 0, rB[j] ?? 0, rB[j + 1] ?? 0, rA[j + 1] ?? 0);
      }
    }

    // 2. Moyeu central
    this.addSmoothCylinder(
      sub(center, scale(dir, rimRadius * 1.3)),
      add(center, scale(dir, rimRadius * 1.3)),
      rimRadius * 1.8,
      14,
      true,
    );

    // 3. Rayons
    for (let s = 0; s < spokes; s++) {
      const ang = (2 * Math.PI * s) / spokes;
      const spokeDir = add(scale(u, Math.cos(ang)), scale(v, Math.sin(ang)));
      this.addSmoothCylinder(
        add(center, scale(spokeDir, rimRadius)),
        add(center, scale(spokeDir, majorR)),
        rimRadius * 0.65,
        8,
        false,
      );
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
