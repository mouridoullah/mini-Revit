import { describe, it, expect } from 'vitest';
import { testOBBVsOBB, obbToAABB } from './sat.js';
import { testCylinderVsCylinder, testCylinderVsOBB } from './cylinder.js';
import type { OBB3D, Cylinder3D, Vec3 } from '../types.js';

describe('Narrow-Phase 3D (SAT OBB/OBB et Cylindre/OBB)', () => {
  const identityAxes: readonly [Vec3, Vec3, Vec3] = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];

  it('détecte deux OBB 3D séparés sans faux positif', () => {
    const obbA: OBB3D = {
      center: { x: 0, y: 0, z: 1400 },
      halfExtents: { x: 2000, y: 100, z: 1400 }, // Mur 4m x 200mm x 2.8m
      axes: identityAxes,
    };
    const obbB: OBB3D = {
      center: { x: 0, y: 2000, z: 1400 }, // Décalé de 2m en Y
      halfExtents: { x: 2000, y: 100, z: 1400 },
      axes: identityAxes,
    };

    const res = testOBBVsOBB(obbA, obbB, 2.0);
    expect(res.intersects).toBe(false);
    expect(res.penetrationDepthMm).toBe(0);
  });

  it('détecte la collision solide entre deux OBB pénétrants avec profondeur exacte', () => {
    const obbA: OBB3D = {
      center: { x: 0, y: 0, z: 1000 },
      halfExtents: { x: 1000, y: 100, z: 1000 }, // Mur le long de X (-1000..1000, y: -100..100)
      axes: identityAxes,
    };
    const obbB: OBB3D = {
      center: { x: 0, y: 0, z: 1000 },
      halfExtents: { x: 100, y: 1000, z: 1000 }, // Mur orthogonal le long de Y (-100..100, y: -1000..1000)
      axes: identityAxes,
    };

    const res = testOBBVsOBB(obbA, obbB, 2.0);
    expect(res.intersects).toBe(true);
    expect(res.penetrationDepthMm).toBeGreaterThan(0);
    expect(res.point).toBeDefined();
  });

  it('gère les OBB orientés avec rotation angulaire arbitraire (45°)', () => {
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);

    const obbRotated: OBB3D = {
      center: { x: 50, y: 50, z: 50 },
      halfExtents: { x: 100, y: 100, z: 100 },
      axes: [
        { x: cos45, y: sin45, z: 0 },
        { x: -sin45, y: cos45, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
    };

    const aabb = obbToAABB(obbRotated);
    expect(aabb.min.x).toBeLessThan(0);
    expect(aabb.max.x).toBeGreaterThan(100);

    const obbStatic: OBB3D = {
      center: { x: 60, y: 60, z: 50 },
      halfExtents: { x: 50, y: 50, z: 50 },
      axes: identityAxes,
    };

    const res = testOBBVsOBB(obbRotated, obbStatic, 2.0);
    expect(res.intersects).toBe(true);
  });

  it('détecte l’interpénétration entre un tuyau (cylindre) et un mur (OBB)', () => {
    const wallOBB: OBB3D = {
      center: { x: 1000, y: 0, z: 1400 },
      halfExtents: { x: 1000, y: 100, z: 1400 }, // Mur X de 0 à 2000, Y de -100 à +100
      axes: identityAxes,
    };

    // Tuyau traversant le mur perpendiculairement à travers Y
    const pipeThroughWall: Cylinder3D = {
      start: { x: 1000, y: -500, z: 1000 },
      end: { x: 1000, y: 500, z: 1000 },
      radius: 25, // Tuyau DN50 (diamètre 50mm)
    };

    const resHit = testCylinderVsOBB(pipeThroughWall, wallOBB, 2.0);
    expect(resHit.intersects).toBe(true);
    expect(resHit.penetrationDepthMm).toBeGreaterThan(20);
    expect(resHit.point.x).toBeCloseTo(1000, 0);

    // Tuyau parallèle au mur à 300 mm de distance
    const pipeFarAway: Cylinder3D = {
      start: { x: 0, y: 300, z: 1000 },
      end: { x: 2000, y: 300, z: 1000 },
      radius: 25,
    };

    const resMiss = testCylinderVsOBB(pipeFarAway, wallOBB, 2.0);
    expect(resMiss.intersects).toBe(false);
  });

  it('détecte la collision entre deux tuyaux (Cylindre vs Cylindre)', () => {
    const pipe1: Cylinder3D = {
      start: { x: 0, y: 0, z: 1000 },
      end: { x: 2000, y: 0, z: 1000 },
      radius: 20,
    };
    // Tuyau 2 croisant le tuyau 1 à la même altitude
    const pipe2Crossing: Cylinder3D = {
      start: { x: 1000, y: -500, z: 1000 },
      end: { x: 1000, y: 500, z: 1000 },
      radius: 20,
    };
    // Tuyau 3 passant au-dessus avec 200 mm d'écart
    const pipe3Above: Cylinder3D = {
      start: { x: 1000, y: -500, z: 1200 },
      end: { x: 1000, y: 500, z: 1200 },
      radius: 20,
    };

    const hit = testCylinderVsCylinder(pipe1, pipe2Crossing, 2.0);
    expect(hit.intersects).toBe(true);
    expect(hit.penetrationDepthMm).toBeCloseTo(40, 0);

    const miss = testCylinderVsCylinder(pipe1, pipe3Above, 2.0);
    expect(miss.intersects).toBe(false);
  });
});
