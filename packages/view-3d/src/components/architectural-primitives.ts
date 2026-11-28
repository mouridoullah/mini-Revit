/**
 * components/architectural-primitives — Primitives haute fidélité pour mobilier, menuiseries & enveloppe LOD 350
 *
 * Étend BaseMeshAccumulator (shared/primitives) avec les formes architecturales spécialisées
 * (becs col-de-cygne, cuves/vasques, coussins rembourrés).
 */

import type { RawMeshData } from '@tabax/geometry';
import {
  BaseMeshAccumulator,
  v3,
  add,
  sub,
  scale,
  dot,
  cross,
  len,
  normalize,
  type Vec3D,
} from '../mesh-generator/shared/primitives.js';

export { v3, add, sub, scale, dot, cross, len, normalize, type Vec3D };

export class ArchitecturalMeshAccumulator extends BaseMeshAccumulator {
  /**
   * Boîte avec chanfreins / biseaux adoucis sur les 12 arêtes et 8 coins (100% étanche).
   */
  public addBeveledBox(
    center: Vec3D,
    size: Vec3D,
    bevelRadius = 0,
    uAxis: Vec3D = { x: 1, y: 0, z: 0 },
    vAxis: Vec3D = { x: 0, y: 1, z: 0 },
    wAxis: Vec3D = { x: 0, y: 0, z: 1 },
  ): void {
    this.addBeveledBoxRaw(center, size.x, size.y, size.z, uAxis, vAxis, wAxis, bevelRadius, 0.35);
  }

  /**
   * Bec col-de-cygne galbé pour robinetterie de cuisine et vasque de salle de bain.
   */
  public addCurvedSpout(
    base: Vec3D,
    height: number,
    reach: number,
    radius = 12,
    segments = 12,
  ): void {
    const p0 = base;
    const p1 = add(base, { x: 0, y: 0, z: height * 0.7 });
    const p2 = add(base, { x: reach * 0.8, y: 0, z: height });
    const p3 = add(base, { x: reach, y: 0, z: height * 0.8 });

    this.addSmoothCylinder(p0, p1, radius, segments, true);
    this.addSmoothCylinder(p1, p2, radius, segments, false);
    this.addSmoothCylinder(p2, p3, radius, segments, true);
  }

  /**
   * Vasque ou cuve d'évier évidée avec bordure périphérique et fond avec bonde.
   */
  public addBasin(
    center: Vec3D,
    outerSize: Vec3D,
    rim: number,
    depth: number,
    uAxis: Vec3D = { x: 1, y: 0, z: 0 },
    vAxis: Vec3D = { x: 0, y: 1, z: 0 },
  ): void {
    const wAxis: Vec3D = { x: 0, y: 0, z: 1 };
    const halfX = outerSize.x / 2;
    const halfY = outerSize.y / 2;
    const zTop = center.z + outerSize.z / 2;
    const zBottom = zTop - depth;

    const innerHalfX = halfX - rim;
    const innerHalfY = halfY - rim;
    if (innerHalfX <= 5 || innerHalfY <= 5) return;

    const bottomCenter = add(center, { x: 0, y: 0, z: zBottom - center.z });
    this.addBeveledBox(
      bottomCenter,
      { x: innerHalfX * 2, y: innerHalfY * 2, z: 30 },
      2,
      uAxis,
      vAxis,
      wAxis,
    );

    const p = (lx: number, ly: number, lz: number): Vec3D =>
      add(center, add(scale(uAxis, lx), add(scale(vAxis, ly), scale(wAxis, lz - center.z))));

    this.addOrientedQuad(
      p(-innerHalfX, -innerHalfY, zBottom),
      p(innerHalfX, -innerHalfY, zBottom),
      p(innerHalfX, -innerHalfY, zTop),
      p(-innerHalfX, -innerHalfY, zTop),
      vAxis,
    );
    this.addOrientedQuad(
      p(innerHalfX, innerHalfY, zBottom),
      p(-innerHalfX, innerHalfY, zBottom),
      p(-innerHalfX, innerHalfY, zTop),
      p(innerHalfX, innerHalfY, zTop),
      scale(vAxis, -1),
    );
    this.addOrientedQuad(
      p(-innerHalfX, innerHalfY, zBottom),
      p(-innerHalfX, -innerHalfY, zBottom),
      p(-innerHalfX, -innerHalfY, zTop),
      p(-innerHalfX, innerHalfY, zTop),
      uAxis,
    );
    this.addOrientedQuad(
      p(innerHalfX, -innerHalfY, zBottom),
      p(innerHalfX, innerHalfY, zBottom),
      p(innerHalfX, innerHalfY, zTop),
      p(innerHalfX, -innerHalfY, zTop),
      scale(uAxis, -1),
    );
  }

  /**
   * Coussin rembourré à volume adouci pour canapé, assise, oreiller.
   */
  public addPaddedCushion(
    center: Vec3D,
    size: Vec3D,
    uAxis: Vec3D = { x: 1, y: 0, z: 0 },
    vAxis: Vec3D = { x: 0, y: 1, z: 0 },
    wAxis: Vec3D = { x: 0, y: 0, z: 1 },
  ): void {
    const bevel = Math.min(size.x, Math.min(size.y, size.z)) * 0.28;
    this.addBeveledBox(center, size, bevel, uAxis, vAxis, wAxis);
  }

  public override toRawMeshData(
    elementId: string,
    userData?: Record<string, unknown>,
  ): RawMeshData & { bounds: RawMeshData['boundingBox'] } {
    const raw = super.toRawMeshData(elementId, userData);
    return {
      ...raw,
      bounds: raw.boundingBox,
    };
  }
}
