import { describe, it, expect } from 'vitest';
import { createWallMesh } from './mesh-generator.js';

describe('mesh-generator — Générateur de maillage 3D neutre pour view-3d', () => {
  it('génère un RawMeshData 3D fermé et valide pour un mur architectural à altitude 0', () => {
    const wall = {
      id: 'w_gen_01',
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    const wallType = {
      thickness: 200,
      height: 2800,
    };

    const mesh = createWallMesh(wall, wallType, 0);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    expect(mesh.elementId).toBe('w_gen_01');
    expect(mesh.role).toBe('full');
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    // Hauteur Z = 2800 mm
    expect(mesh.boundingBox.min.z).toBeCloseTo(0, 1);
    expect(mesh.boundingBox.max.z).toBeCloseTo(2800, 1);
  });

  it('génère un maillage prenant en compte l’élévation altimétrique du niveau', () => {
    const wall = {
      id: 'w_gen_r1',
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };
    const wallType = {
      thickness: 300,
      height: 2700,
    };
    const elevation = 3200; // R+1 à +3.20m

    const mesh = createWallMesh(wall, wallType, elevation);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    expect(mesh.boundingBox.min.z).toBeCloseTo(3200, 1);
    expect(mesh.boundingBox.max.z).toBeCloseTo(5900, 1);
  });
});
