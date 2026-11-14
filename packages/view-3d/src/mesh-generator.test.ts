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

    // 8 sommets topologiques dédoublés pour normales franches :
    // 4 sommets fond (normal -Z) + 4 sommets couvercle (normal +Z) + 4x4 sommets flancs = 24 sommets = 72 floats
    expect(mesh.positions.length).toBe(72);
    expect(mesh.normals.length).toBe(72);
    // 12 triangles (2 fond + 2 couvercle + 8 flancs) = 36 indices
    expect(mesh.indices.length).toBe(36);

    // Vérification de la présence de normales verticales +Z (couvercle) et -Z (fond)
    let hasUpNormal = false;
    let hasDownNormal = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nz = mesh.normals[i + 2]!;
      if (Math.abs(nz - 1) < 1e-4) hasUpNormal = true;
      if (Math.abs(nz - -1) < 1e-4) hasDownNormal = true;
    }
    expect(hasUpNormal).toBe(true);
    expect(hasDownNormal).toBe(true);

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
