import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scene3D } from './Scene3D.js';
import { createStairMesh, createStairAssembly, type StairGeometryParams } from './mesh-generator.js';

// Mock WebGLRenderer pour environnement headless / CI
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class MockWebGLRenderer {
    public domElement: HTMLCanvasElement;
    public setSize = vi.fn();
    public setPixelRatio = vi.fn();
    public render = vi.fn();
    public dispose = vi.fn();
    public clear = vi.fn();
    public getPixelRatio = vi.fn(() => 1);
    public getContext = vi.fn(() => null);

    public capabilities = {
      isWebGL2: true,
      maxTextures: 16,
      maxVertexTextures: 16,
      maxTextureSize: 4096,
      maxCubemapSize: 4096,
      maxAttributes: 16,
      maxVertexUniforms: 1024,
      maxVaryings: 32,
      maxFragmentUniforms: 1024,
      vertexTextures: true,
      floatFragmentTextures: true,
      floatVertexTextures: true,
      logarithmicDepthBuffer: false,
    };

    public info = {
      render: { calls: 0, frame: 0, lines: 0, points: 0, triangles: 0 },
      memory: { geometries: 0, textures: 0 },
    };

    public constructor(parameters?: { canvas?: HTMLCanvasElement }) {
      this.domElement =
        parameters?.canvas ?? (document.createElement('canvas') as HTMLCanvasElement);
    }
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

describe('Phase 6.4 — Rendu 3D des Escaliers (packages/view-3d/src/stairs-3d.test.ts)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
  });

  const baseStairParams: StairGeometryParams = {
    id: 'stair_01',
    start: { x: 0, y: 0 },
    end: { x: 4200, y: 0 },
    bottomElevation: 0,
    topElevation: 2800,
  };

  it('T-STAIR-3D-01 : Caractéristique d’Euler et étanchéité — V - E + F = 2 sur le solide crénelé', () => {
    const rawMesh = createStairMesh(baseStairParams, { width: 900 });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    // Calcul de la topologie à partir des indices et positions
    const pos = rawMesh.positions;
    const indices = rawMesh.indices;

    // Déduplication des sommets par clé numérique (tolérance 0.1 mm)
    const vertexMap = new Map<string, number>();
    const remap: number[] = [];
    let uniqueVertCount = 0;

    for (let i = 0; i < pos.length; i += 3) {
      const x = Math.round((pos[i] ?? 0) * 10) / 10;
      const y = Math.round((pos[i + 1] ?? 0) * 10) / 10;
      const z = Math.round((pos[i + 2] ?? 0) * 10) / 10;
      const key = `${x},${y},${z}`;

      let vId = vertexMap.get(key);
      if (vId === undefined) {
        vId = uniqueVertCount++;
        vertexMap.set(key, vId);
      }
      remap.push(vId);
    }

    const V = uniqueVertCount;
    const F = indices.length / 3;

    // Collecte des arêtes non orientées
    const edgeSet = new Set<string>();
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = remap[indices[i]!]!;
      const i1 = remap[indices[i + 1]!]!;
      const i2 = remap[indices[i + 2]!]!;

      const e1 = i0 < i1 ? `${i0}-${i1}` : `${i1}-${i0}`;
      const e2 = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
      const e3 = i2 < i0 ? `${i2}-${i0}` : `${i0}-${i2}`;

      edgeSet.add(e1);
      edgeSet.add(e2);
      edgeSet.add(e3);
    }

    const E = edgeSet.size;
    const euler = V - E + F;

    // Un solide fermé homéomorphe à une sphère a une caractéristique d'Euler V - E + F = 2
    expect(euler).toBe(2);
  });

  it('T-STAIR-3D-02 : Normales des faces — marches supérieures orientées +Z et contremarches orientées -u', () => {
    const rawMesh = createStairMesh(baseStairParams, { width: 900 });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    const normals = rawMesh.normals;
    let foundTopNormals = 0;
    let foundRiserNormals = 0;

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i]!;
      const ny = normals[i + 1]!;
      const nz = normals[i + 2]!;

      // Marche supérieure (+Z)
      if (Math.abs(nx) < 1e-3 && Math.abs(ny) < 1e-3 && Math.abs(nz - 1) < 1e-3) {
        foundTopNormals++;
      }
      // Contremarche : dx > 0, dy = 0 -> directrice +X -> contremarche normale -X
      if (Math.abs(nx - -1) < 1e-3 && Math.abs(ny) < 1e-3 && Math.abs(nz) < 1e-3) {
        foundRiserNormals++;
      }
    }

    expect(foundTopNormals).toBeGreaterThan(0);
    expect(foundRiserNormals).toBeGreaterThan(0);
  });

  it('T-STAIR-3D-02b : Calcul exact du volume du solide crénelé par théorème de divergence', () => {
    const rawMesh = createStairMesh(baseStairParams, { width: 900 });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    // Calcul du volume par flux de divergence / somme des tétraèdres signés (1/6) * (a x b) . c
    let computedVolume = 0;
    const pos = rawMesh.positions;
    const idx = rawMesh.indices;

    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i]! * 3;
      const i1 = idx[i + 1]! * 3;
      const i2 = idx[i + 2]! * 3;

      const v0x = pos[i0]!,
        v0y = pos[i0 + 1]!,
        v0z = pos[i0 + 2]!;
      const v1x = pos[i1]!,
        v1y = pos[i1 + 1]!,
        v1z = pos[i1 + 2]!;
      const v2x = pos[i2]!,
        v2y = pos[i2 + 1]!,
        v2z = pos[i2 + 2]!;

      const crossX = v1y * v2z - v1z * v2y;
      const crossY = v1z * v2x - v1x * v2z;
      const crossZ = v1x * v2y - v1y * v2x;

      computedVolume += (v0x * crossX + v0y * crossY + v0z * crossZ) / 6;
    }

    // Formule analytique exacte du solide crénelé fermé à z0 et au fond :
    // V = width * L * deltaZ * ((N + 1) / (2 * N))
    // Pour width=900, L=4200, deltaZ=2800, N=16:
    // V = 900 * 4200 * 2800 * (17 / 32) = 5 622 750 000 mm³
    const W = 900;
    const L = 4200;
    const deltaZ = 2800;
    const N = 16;
    const expectedSolidVolume = W * L * deltaZ * ((N + 1) / (2 * N));

    // Tolérance ±500 mm³ (-3) garantissant la stabilité sur coordonnées fractionnaires
    expect(Math.abs(computedVolume)).toBeCloseTo(expectedSolidVolume, -3);
    expect(expectedSolidVolume).toBe(5622750000);
  });

  it('T-STAIR-3D-03 : Métadonnées de picking — elementId et userData.category === "stair"', () => {
    const rawMesh = createStairMesh(baseStairParams, { width: 900 });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    expect(rawMesh.elementId).toBe(baseStairParams.id);
    expect(rawMesh.userData?.category).toBe('stair');
    expect(rawMesh.userData?.elementId).toBe(baseStairParams.id);
    expect(rawMesh.boundingBox.min.z).toBe(0);
    expect(rawMesh.boundingBox.max.z).toBe(2800);
  });

  it('T-STAIR-3D-04 : Garde-fous et rejets — retourne null si L <= 0, ΔZ <= 0 ou width <= 0', () => {
    // 1. Longueur nulle
    const zeroLen = createStairMesh({
      ...baseStairParams,
      start: { x: 1000, y: 1000 },
      end: { x: 1000, y: 1000 },
    });
    expect(zeroLen).toBeNull();

    // 2. Dénivelée négative ou nulle
    const zeroRise = createStairMesh({
      ...baseStairParams,
      bottomElevation: 2800,
      topElevation: 2800,
    });
    expect(zeroRise).toBeNull();

    // 3. Largeur nulle ou négative
    const zeroWidth = createStairMesh(baseStairParams, { width: 0 });
    expect(zeroWidth).toBeNull();
  });

  it('T-STAIR-3D-05 : Cycle de vie Scene3D — addStairMesh et updateStairMesh attachent le maillage et le matériau', () => {
    const scene = new Scene3D(canvas);
    const rawMesh = createStairMesh(baseStairParams, { width: 900 });
    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    const mesh = scene.addStairMesh('stair_01', rawMesh);
    expect(mesh).toBeDefined();
    expect(mesh.userData.elementId).toBe('stair_01');
    expect(mesh.userData.category).toBe('stair');
    expect(scene.getMeshes('stair_01').length).toBe(1);

    // Mise à jour
    const updated = scene.updateStairMesh('stair_01', rawMesh);
    expect(updated).toBeDefined();
    expect(scene.getMeshes('stair_01').length).toBe(1);

    scene.removeStairMesh('stair_01');
    expect(scene.getMeshes('stair_01').length).toBe(0);

    scene.dispose();
  });

  it('T-STAIR-3D-06 : createStairAssembly — LOD 200 (1 part monolithique) vs LOD 350 (5 parts multi-matériaux)', () => {
    // LOD 200
    const lod200Assembly = createStairAssembly(baseStairParams, { width: 900 }, { detailLevel: 'lod200' });
    expect(lod200Assembly).not.toBeNull();
    expect(lod200Assembly!.parts).toHaveLength(1);
    expect(lod200Assembly!.parts[0]!.materialRole).toBe('plaster_interior');

    // LOD 350
    const lod350Assembly = createStairAssembly(baseStairParams, { width: 900 }, { detailLevel: 'lod350' });
    expect(lod350Assembly).not.toBeNull();
    // 5 parties : structure, treads, stringers, handrail, guardrail
    expect(lod350Assembly!.parts).toHaveLength(5);

    const roles = lod350Assembly!.parts.map((p) => p.materialRole);
    expect(roles).toContain('plaster_interior'); // structure paillasse
    expect(roles).toContain('wood_oak'); // marches & main courante
    expect(roles).toContain('alu_anthracite'); // limons
    expect(roles).toContain('stainless_brushed'); // garde-corps poteaux & lisses

    // Vérification du nez de marche débordant (+25 mm)
    const treadsPart = lod350Assembly!.parts.find((p) => p.rawData.elementId.includes('treads'));
    expect(treadsPart).toBeDefined();
    expect(treadsPart!.rawData.boundingBox.max.x).toBeGreaterThan(baseStairParams.end.x);
  });

  it('T-STAIR-3D-07 : Scene3D — intégration et rendu de l’assemblage d’escalier LOD 350', () => {
    const scene = new Scene3D(canvas);
    const assembly = createStairAssembly(baseStairParams, { width: 900 }, { detailLevel: 'lod350' });
    expect(assembly).not.toBeNull();

    const meshes = scene.addComponentAssembly(assembly!);
    expect(meshes.length).toBe(5);
    expect(scene.getMeshes('stair_01').length).toBe(5);

    // Mise à jour de l'assemblage
    const updatedMeshes = scene.updateComponentAssembly(assembly!);
    expect(updatedMeshes.length).toBe(5);
    expect(scene.getMeshes('stair_01').length).toBe(5);

    scene.removeMesh('stair_01');
    expect(scene.getMeshes('stair_01').length).toBe(0);

    scene.dispose();
  });
});
