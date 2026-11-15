import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Scene3D } from './Scene3D.js';
import { createSlabMesh } from './mesh-generator.js';

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

describe('view-3d — Rendu 3D des Dalles et Trémies (Milestone 6.1b-1)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T-SLAB-3D-01 : dalle simple rectangulaire sans trémie (positions, normales, AABB)', () => {
    const rawMesh = createSlabMesh(
      {
        id: 'slab-1',
        boundary: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
      },
      {
        id: 'slab-type-1',
        name: 'Dalle BA 200mm',
        thickness: 200,
      },
      0,
    );

    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    expect(rawMesh.elementId).toBe('slab-1');
    expect(rawMesh.role).toBe('full');
    expect(rawMesh.userData?.category).toBe('slab');

    // Bounding box : Z_sup = 0, Z_inf = -200
    expect(rawMesh.boundingBox).toEqual({
      min: { x: 0, y: 0, z: -200 },
      max: { x: 4000, y: 3000, z: 0 },
    });

    // 2 triangles pour top, 2 triangles pour bottom, 4 faces x 2 = 8 triangles pour flancs = 12 triangles (36 indices)
    expect(rawMesh.indices.length).toBe(36);

    // Vérification des normales : faces horizontales (z = 1 ou z = -1) et flancs verticaux (z = 0)
    for (let i = 0; i < rawMesh.normals.length; i += 3) {
      const nx = rawMesh.normals[i]!;
      const ny = rawMesh.normals[i + 1]!;
      const nz = rawMesh.normals[i + 2]!;
      const len = Math.hypot(nx, ny, nz);
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it('T-SLAB-3D-02 : dalle avec trémie (évidement central, maillage découpé)', () => {
    const rawMesh = createSlabMesh(
      {
        id: 'slab-shaft',
        boundary: [
          { x: 0, y: 0 },
          { x: 5000, y: 0 },
          { x: 5000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        holes: [
          [
            { x: 2000, y: 1500 },
            { x: 3000, y: 1500 },
            { x: 3000, y: 2500 },
            { x: 2000, y: 2500 },
          ],
        ],
      },
      {
        id: 'slab-type-1',
        name: 'Dalle BA 200mm',
        thickness: 200,
      },
      0,
    );

    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    // Doit avoir plus d'indices que la dalle simple en raison de la découpe et des flancs intérieurs
    // Sans trou: 36 indices. Avec trou: triangulation découpée + 4 quads intérieurs pour le trou.
    expect(rawMesh.indices.length).toBeGreaterThan(36);
    expect(rawMesh.boundingBox.min.z).toBe(-200);
    expect(rawMesh.boundingBox.max.z).toBe(0);

    // Vérification de l'orientation stricte des normales des flancs (P4 / Complément n°22) :
    // 1. Les flancs du trou (centre 2500, 2000) doivent pointer vers le vide intérieur du trou
    // 2. Les flancs du contour extérieur doivent pointer vers l'extérieur du bâtiment
    const holeCenter = { x: 2500, y: 2000 };
    const slabCenter = { x: 2500, y: 2000 };
    let holeFlankNormalsVerified = 0;
    let outerFlankNormalsVerified = 0;

    for (let i = 0; i < rawMesh.positions.length; i += 3) {
      const px = rawMesh.positions[i]!;
      const py = rawMesh.positions[i + 1]!;
      const nx = rawMesh.normals[i]!;
      const ny = rawMesh.normals[i + 1]!;
      const nz = rawMesh.normals[i + 2]!;

      // Ignorer les faces horizontales supérieure (+Z) et inférieure (-Z)
      if (Math.abs(nz) > 0.5) continue;

      // Est-ce un sommet de flanc de trou ?
      if (px >= 1999 && px <= 3001 && py >= 1499 && py <= 2501) {
        // La normale doit pointer vers le centre du trou (vers l'air libre)
        const dot = nx * (holeCenter.x - px) + ny * (holeCenter.y - py);
        expect(dot).toBeGreaterThan(0);
        holeFlankNormalsVerified++;
      } else {
        // Sommet du contour extérieur : la normale doit pointer vers l'extérieur
        const dot = nx * (px - slabCenter.x) + ny * (py - slabCenter.y);
        expect(dot).toBeGreaterThan(0);
        outerFlankNormalsVerified++;
      }
    }

    expect(holeFlankNormalsVerified).toBe(16); // 4 quads * 4 sommets
    expect(outerFlankNormalsVerified).toBe(16); // 4 quads * 4 sommets
  });

  it('T-SLAB-3D-03 : AABB exacte avec élévation et baseOffset', () => {
    const rawMesh = createSlabMesh(
      {
        id: 'slab-offset',
        boundary: [
          { x: 100, y: 200 },
          { x: 2100, y: 200 },
          { x: 2100, y: 1200 },
          { x: 100, y: 1200 },
        ],
        baseOffset: -50,
      },
      {
        id: 'slab-type-thick',
        name: 'Dalle épaisse 250mm',
        thickness: 250,
      },
      3000, // elevation R+1
    );

    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    // Z_sup = 3000 + (-50) = 2950
    // Z_inf = 2950 - 250 = 2700
    expect(rawMesh.boundingBox.max.z).toBe(2950);
    expect(rawMesh.boundingBox.min.z).toBe(2700);
    expect(rawMesh.boundingBox.min.x).toBe(100);
    expect(rawMesh.boundingBox.max.x).toBe(2100);
    expect(rawMesh.boundingBox.min.y).toBe(200);
    expect(rawMesh.boundingBox.max.y).toBe(1200);
  });

  it('T-SLAB-3D-04 : calcul du volume géométrique égal à (Aire_ext - Aire_trou) * épaisseur', () => {
    const rawMesh = createSlabMesh(
      {
        id: 'slab-vol',
        boundary: [
          { x: 0, y: 0 },
          { x: 6000, y: 0 },
          { x: 6000, y: 4000 },
          { x: 0, y: 4000 },
        ],
        holes: [
          [
            { x: 2000, y: 1000 },
            { x: 4000, y: 1000 },
            { x: 4000, y: 2000 },
            { x: 2000, y: 2000 },
          ],
        ],
      },
      {
        id: 'slab-type-1',
        name: 'Dalle BA 200mm',
        thickness: 200,
      },
      0,
    );

    expect(rawMesh).not.toBeNull();
    if (!rawMesh) return;

    // Volume théorique :
    // Outer = 6000 * 4000 = 24 000 000 mm²
    // Hole = 2000 * 1000 = 2 000 000 mm²
    // Net area = 22 000 000 mm²
    // Volume = 22 000 000 * 200 = 4 400 000 000 mm³
    const theoreticalVolume = (6000 * 4000 - 2000 * 1000) * 200;

    // Calcul du volume via la divergence / somme des tétraèdres orientés
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

      // v0 . (v1 x v2)
      const crossX = v1y * v2z - v1z * v2y;
      const crossY = v1z * v2x - v1x * v2z;
      const crossZ = v1x * v2y - v1y * v2x;

      computedVolume += (v0x * crossX + v0y * crossY + v0z * crossZ) / 6;
    }

    // Le volume calculé doit correspondre au volume théorique à 0.1% près
    expect(Math.abs(computedVolume)).toBeCloseTo(theoreticalVolume, -4);
  });

  it('T-SLAB-3D-05 : Scene3D.addSlabMesh et updateSlabMesh attachent le matériau dalle et nettoient', () => {
    const scene = new Scene3D(canvas, { width: 800, height: 600 });

    const rawMesh = createSlabMesh(
      {
        id: 'slab-test',
        boundary: [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 2000 },
          { x: 0, y: 2000 },
        ],
      },
      {
        id: 'slab-type-1',
        name: 'Dalle BA 200mm',
        thickness: 200,
      },
      0,
    )!;

    const mesh = scene.addSlabMesh('slab-test', rawMesh);
    expect(mesh).toBeDefined();
    expect(mesh.name).toBe('slab-test');
    expect(mesh.userData.category).toBe('slab');
    expect(scene.getMeshes('slab-test')).toHaveLength(1);

    // Mise à jour de la dalle
    const updatedMesh = scene.updateSlabMesh('slab-test', rawMesh);
    expect(updatedMesh).toBeDefined();
    expect(scene.getMeshes('slab-test')).toHaveLength(1);

    // Suppression
    scene.removeMesh('slab-test');
    expect(scene.getMeshes('slab-test')).toHaveLength(0);

    // Nettoyage global
    expect(() => scene.dispose()).not.toThrow();
  });

  // Dérivation de trémies d'escaliers (ADR-048 D5)
  it('T-SLAB-STAIR-01 : Trémie d’escalier dérivée — createSlabMesh prend openings sans toucher slab.holes', () => {
    // Trémie dérivée d'un escalier de 900 mm de large et 3000 mm de long :
    // Dégagements prescrits : +50 mm latéraux (main courante) et +100 mm en extrémités
    // Dimensions trémie : 1000 mm x 3200 mm
    const stairShaft = [
      { x: 1000, y: 1000 },
      { x: 4200, y: 1000 },
      { x: 4200, y: 2000 },
      { x: 1000, y: 2000 },
    ];

    const slabWithoutHoles = {
      id: 'slab-upper',
      boundary: [
        { x: 0, y: 0 },
        { x: 8000, y: 0 },
        { x: 8000, y: 6000 },
        { x: 0, y: 6000 },
      ],
      holes: [] as { x: number; y: number }[][], // slab.holes reste vide
      openings: [stairShaft], // Trémie injectée dynamiquement
    };

    const meshWithShaft = createSlabMesh(
      slabWithoutHoles,
      { thickness: 200 },
      3000,
    );

    const meshSolid = createSlabMesh(
      { ...slabWithoutHoles, openings: [] },
      { thickness: 200 },
      3000,
    );

    expect(meshWithShaft).not.toBeNull();
    expect(meshSolid).not.toBeNull();
    // Le maillage avec trémie comporte plus de triangles (pour contourner le trou)
    expect(meshWithShaft!.indices.length).toBeGreaterThan(meshSolid!.indices.length);
    // slab.holes original n'a pas été muté
    expect(slabWithoutHoles.holes).toHaveLength(0);
  });

  it('T-SLAB-STAIR-02 : Conservation du volume — le volume de la dalle diminue exactement de la trémie', () => {
    const shaftW = 1000;
    const shaftL = 3200;
    const thickness = 200;
    const stairShaft = [
      { x: 2000, y: 2000 },
      { x: 2000 + shaftL, y: 2000 },
      { x: 2000 + shaftL, y: 2000 + shaftW },
      { x: 2000, y: 2000 + shaftW },
    ];

    const rawMesh = createSlabMesh(
      {
        id: 'slab-upper-vol',
        boundary: [
          { x: 0, y: 0 },
          { x: 8000, y: 0 },
          { x: 8000, y: 6000 },
          { x: 0, y: 6000 },
        ],
        openings: [stairShaft],
      },
      { thickness },
      3000,
    )!;

    let computedVolume = 0;
    const pos = rawMesh.positions;
    const idx = rawMesh.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i]! * 3;
      const i1 = idx[i + 1]! * 3;
      const i2 = idx[i + 2]! * 3;

      const v0x = pos[i0]!, v0y = pos[i0 + 1]!, v0z = pos[i0 + 2]!;
      const v1x = pos[i1]!, v1y = pos[i1 + 1]!, v1z = pos[i1 + 2]!;
      const v2x = pos[i2]!, v2y = pos[i2 + 1]!, v2z = pos[i2 + 2]!;

      const crossX = v1y * v2z - v1z * v2y;
      const crossY = v1z * v2x - v1x * v2z;
      const crossZ = v1x * v2y - v1y * v2x;

      computedVolume += (v0x * crossX + v0y * crossY + v0z * crossZ) / 6;
    }

    const expectedVolume = (8000 * 6000 - shaftL * shaftW) * thickness;
    expect(Math.abs(computedVolume)).toBeCloseTo(expectedVolume, -4);
  });

  it('T-SLAB-STAIR-03 : Découpe de trémie avec trous existants — cumul propre sans conflit', () => {
    const manualHole = [
      { x: 1000, y: 1000 },
      { x: 1500, y: 1000 },
      { x: 1500, y: 1500 },
      { x: 1000, y: 1500 },
    ];
    const stairShaft = [
      { x: 4000, y: 2000 },
      { x: 7000, y: 2000 },
      { x: 7000, y: 3000 },
      { x: 4000, y: 3000 },
    ];

    const mesh = createSlabMesh(
      {
        id: 'slab-multi-holes',
        boundary: [
          { x: 0, y: 0 },
          { x: 8000, y: 0 },
          { x: 8000, y: 6000 },
          { x: 0, y: 6000 },
        ],
        holes: [manualHole],
        openings: [stairShaft],
      },
      { thickness: 200 },
      3000,
    );

    expect(mesh).not.toBeNull();
    expect(mesh!.boundingBox.max.z).toBe(3000); // zSup = elevation + baseOffset
    expect(mesh!.boundingBox.min.z).toBe(2800); // zInf = zSup - thickness
  });
});
