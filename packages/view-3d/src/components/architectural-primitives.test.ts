import { describe, it, expect } from 'vitest';
import { ArchitecturalMeshAccumulator, v3 } from './architectural-primitives.js';

describe('Architectural Primitives LOD 350', () => {
  it('construit une boîte simple avec 24 sommets et 36 indices', () => {
    const acc = new ArchitecturalMeshAccumulator();
    acc.addBeveledBox(v3(0, 0, 0), v3(100, 100, 100), 0);
    const mesh = acc.toRawMeshData('box_1');

    expect(mesh.positions.length).toBe(24 * 3);
    expect(mesh.indices.length).toBe(36);
    expect(mesh.bounds.min.x).toBeCloseTo(-50);
    expect(mesh.bounds.max.x).toBeCloseTo(50);
  });

  it('construit un cylindre lisse étanche avec normales unitaires', () => {
    const acc = new ArchitecturalMeshAccumulator();
    acc.addSmoothCylinder(v3(0, 0, 0), v3(0, 0, 100), 10, 16, true);
    const mesh = acc.toRawMeshData('cyl_1');

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.bounds.min.z).toBeCloseTo(0);
    expect(mesh.bounds.max.z).toBeCloseTo(100);

    // Vérifie que toutes les normales sont unitaires
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i] ?? 0;
      const ny = mesh.normals[i + 1] ?? 0;
      const nz = mesh.normals[i + 2] ?? 0;
      const normLen = Math.hypot(nx, ny, nz);
      expect(normLen).toBeCloseTo(1, 2);
    }
  });

  it('construit un bec col-de-cygne galbé et un coussin rembourré', () => {
    const acc = new ArchitecturalMeshAccumulator();
    acc.addCurvedSpout(v3(0, 0, 0), 150, 100, 8, 8);
    acc.addPaddedCushion(v3(0, 0, 200), v3(100, 80, 40));
    const mesh = acc.toRawMeshData('faucet_cushion');

    expect(mesh.positions.length).toBeGreaterThan(100);
    expect(mesh.indices.length).toBeGreaterThan(100);
    expect(mesh.bounds.max.z).toBeGreaterThan(200);
  });
});
