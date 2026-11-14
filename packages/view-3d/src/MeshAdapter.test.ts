import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { type RawMeshData, extrudeWallPiece, vec2, type WallPiece } from '@mini-bim/geometry';
import { MeshAdapter } from './MeshAdapter.js';

describe('MeshAdapter — Conversion RawMeshData vers THREE.BufferGeometry', () => {
  it('convertit un RawMeshData minimal (cube 8 sommets, 12 triangles) avec exactitude', () => {
    // 8 sommets d'un cube unitaire
    const positions = new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      0, // bas
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      0,
      1,
      1, // haut
    ]);

    const normals = new Float32Array([
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);

    // 12 triangles = 36 indices
    const indices = new Uint32Array([
      0,
      2,
      1,
      0,
      3,
      2, // bas
      4,
      5,
      6,
      4,
      6,
      7, // haut
      0,
      1,
      5,
      0,
      5,
      4, // face sud
      1,
      2,
      6,
      1,
      6,
      5, // face est
      2,
      3,
      7,
      2,
      7,
      6, // face nord
      3,
      0,
      4,
      3,
      4,
      7, // face ouest
    ]);

    const rawData: RawMeshData = {
      positions,
      normals,
      indices,
      elementId: 'cube_01',
      role: 'full',
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
    };

    const geometry = MeshAdapter.fromRawMeshData(rawData);

    // Vérification des attributs
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);

    const posAttr = geometry.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.count).toBe(8); // 8 sommets
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.array).toBeInstanceOf(Float32Array);
    expect(posAttr.array).toBe(positions); // Buffer direct, sans copie inutile

    const normAttr = geometry.getAttribute('normal');
    expect(normAttr).toBeDefined();
    expect(normAttr.count).toBe(8);
    expect(normAttr.itemSize).toBe(3);
    expect(normAttr.array).toBeInstanceOf(Float32Array);
    expect(normAttr.array).toBe(normals);

    const indexAttr = geometry.getIndex();
    expect(indexAttr).not.toBeNull();
    if (!indexAttr) return;
    expect(indexAttr.count).toBe(36); // 12 triangles * 3 indices
    expect(indexAttr.array).toBeInstanceOf(Uint32Array);
    expect(indexAttr.array).toBe(indices);

    // BoundingBox pré-calculée
    expect(geometry.boundingBox).not.toBeNull();
    expect(geometry.boundingBox?.min.x).toBe(0);
    expect(geometry.boundingBox?.max.z).toBe(1);

    // Métadonnées architecturales
    expect(geometry.userData).toEqual({
      elementId: 'cube_01',
      role: 'full',
    });
  });

  it('ne recalcule JAMAIS les normales (computeVertexNormals non appelé)', () => {
    const rawData: RawMeshData = {
      positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      elementId: 'triangle_flat',
      role: 'lintel',
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 100, z: 0 },
      },
    };

    const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'computeVertexNormals');

    const geometry = MeshAdapter.fromRawMeshData(rawData);
    expect(spy).not.toHaveBeenCalled();

    const normalArray = geometry.getAttribute('normal').array;
    expect(normalArray[2]).toBe(1.0); // Conforme au buffer d'entrée
    spy.mockRestore();
  });

  it('convertit fidèlement un maillage réel généré par extrudeWallPiece', () => {
    const wallPiece: WallPiece = {
      id: 'piece_test_view',
      wallId: 'wall_01',
      poly2D: [vec2(0, 0), vec2(4000, 0), vec2(4000, 200), vec2(0, 200)],
      z0: 0,
      z1: 2800,
      role: 'full',
      area2D: 800000,
      uInterval: [0, 4000],
    };

    const rawMesh = extrudeWallPiece(wallPiece, { generateUVs: true });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    const geometry = MeshAdapter.fromRawMeshData(rawMesh);

    expect(geometry.getAttribute('position').count).toBe(rawMesh.positions.length / 3);
    expect(geometry.getAttribute('normal').count).toBe(rawMesh.normals.length / 3);
    expect(geometry.getIndex()?.count).toBe(rawMesh.indices.length);

    // Vérifier les UVs
    const uvAttr = geometry.getAttribute('uv');
    expect(uvAttr).toBeDefined();
    expect(uvAttr.itemSize).toBe(2);
    expect(uvAttr.count).toBe(rawMesh.positions.length / 3);

    // Vérifier userData
    expect(geometry.userData['elementId']).toBe('piece_test_view');
    expect(geometry.userData['role']).toBe('full');

    // Vérifier BoundingBox
    expect(geometry.boundingBox?.min.x).toBe(0);
    expect(geometry.boundingBox?.max.x).toBe(4000);
    expect(geometry.boundingBox?.min.y).toBe(0);
    expect(geometry.boundingBox?.max.y).toBe(200);
    expect(geometry.boundingBox?.min.z).toBe(0);
    expect(geometry.boundingBox?.max.z).toBe(2800);
  });

  it('dispose() libère proprement les ressources de la géométrie', () => {
    const rawData: RawMeshData = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      elementId: 'disposable',
      role: 'sill',
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 0 },
      },
    };

    const geometry = MeshAdapter.fromRawMeshData(rawData);
    const spy = vi.spyOn(geometry, 'dispose');

    geometry.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('createWallMesh génère un RawMeshData 3D fermé et valide pour un mur architectural', async () => {
    const { createWallMesh } = await import('./mesh-generator.js');

    const wall = {
      id: 'w_gen_test',
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 },
    };
    const wallType = {
      thickness: 200,
      height: 2500,
    };

    const mesh = createWallMesh(wall, wallType, 0);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    expect(mesh.elementId).toBe('w_gen_test');
    expect(mesh.role).toBe('full');
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.boundingBox.max.z - mesh.boundingBox.min.z).toBeCloseTo(2500, 1);
  });
});
