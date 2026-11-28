import { describe, it, expect } from 'vitest';
import { v3 } from './common.js';
import { UvMeshAccumulator } from './primitives.js';
import { getAllMepPrototypes, getMepPrototypeMesh } from './prototypes.js';
import { composeMatrix4, type MepInstancePrototypeKey } from './assembly-types.js';

function assertValidRawMesh(mesh: ReturnType<UvMeshAccumulator['toRawMeshData']>): void {
  const vertexCount = mesh.positions.length / 3;
  expect(vertexCount).toBeGreaterThan(0);
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.uvs?.length).toBe(vertexCount * 2);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(mesh.indices.length % 3).toBe(0);

  for (let i = 0; i < mesh.indices.length; i++) {
    expect(mesh.indices[i]).toBeLessThan(vertexCount);
  }

  for (let i = 0; i < vertexCount; i++) {
    const nx = mesh.normals[i * 3] ?? 0;
    const ny = mesh.normals[i * 3 + 1] ?? 0;
    const nz = mesh.normals[i * 3 + 2] ?? 0;
    const normLen = Math.hypot(nx, ny, nz);
    expect(normLen).toBeCloseTo(1, 3);
  }
}

describe('Primitives MEP chanfreinées avec UVs métriques (Lot 1 LOD 350)', () => {
  it('génère une boîte chanfreinée étanche avec normales unitaires et UVs métriques (1 UV = 1 000 mm)', () => {
    const acc = new UvMeshAccumulator();
    acc.addBeveledBox(
      v3(500, 500, 250),
      1000,
      500,
      500,
      v3(1, 0, 0),
      v3(0, 1, 0),
      v3(0, 0, 1),
      3,
    );
    const raw = acc.toRawMeshData('beveled_box');
    assertValidRawMesh(raw);

    // 6 faces + 12 chanfreins + 8 coins = volume chanfreiné complet (beaucoup plus de sommets qu'une boîte simple)
    expect(raw.positions.length / 3).toBeGreaterThan(24);
    expect(raw.boundingBox.min.x).toBeCloseTo(0, 2);
    expect(raw.boundingBox.max.x).toBeCloseTo(1000, 2);

    // Vérification échelle métrique UV : 1 000 mm -> étendue UV = 1.0
    const uVals: number[] = [];
    for (let i = 0; i < (raw.uvs?.length ?? 0); i += 2) {
      uVals.push(raw.uvs?.[i] ?? 0);
    }
    const maxU = Math.max(...uVals);
    const minU = Math.min(...uVals);
    expect(maxU - minU).toBeCloseTo(1.0, 2);
  });

  it('génère les tubes chanfreinés, cylindres lisses, coudes, brides PN16, écrous 6 pans et volants', () => {
    const acc = new UvMeshAccumulator();
    acc.addChamferedRectTube(v3(0, 0, 0), v3(1200, 0, 0), 400, 250, 3, true);
    acc.addSmoothCylinder(v3(0, 500, 0), v3(1000, 500, 0), 32, 24, true);
    acc.addCurvedSweep(v3(0, 1000, 0), v3(300, 1000, 0), v3(300, 1300, 0), 50, 50, 20, 12);
    acc.addFlangeProfile(v3(0, 1500, 0), v3(1, 0, 0), 25, 60, 14, 1.5, 24);
    acc.addHexPrism(v3(0, 1800, 0), v3(0, 0, 1), 17, 7);
    acc.addHandwheel(v3(0, 2200, 0), v3(0, 0, 1), 80, 6, 4);

    const raw = acc.toRawMeshData('mep_primitives_mix');
    assertValidRawMesh(raw);
  });

  it('expose les 8 prototypes GPU unitaires prêts pour InstancedMesh', () => {
    const keys: readonly MepInstancePrototypeKey[] = [
      'bolt_m10',
      'flange_corner',
      'pipe_clamp',
      'threaded_rod',
      'ladder_rung',
      'cable_gland',
      'cabinet_hinge',
      'diffuser_blade',
    ];
    const all = getAllMepPrototypes();
    for (const key of keys) {
      expect(all[key]).toBeDefined();
      assertValidRawMesh(getMepPrototypeMesh(key));
    }

    const mat4 = composeMatrix4(
      v3(100, 200, 300),
      v3(1, 0, 0),
      v3(0, 1, 0),
      v3(0, 0, 1),
      v3(2, 3, 4),
    );
    expect(mat4).toHaveLength(16);
    expect(mat4[0]).toBe(2);
    expect(mat4[5]).toBe(3);
    expect(mat4[10]).toBe(4);
    expect(mat4[12]).toBe(100);
    expect(mat4[13]).toBe(200);
    expect(mat4[14]).toBe(300);
  });
});
