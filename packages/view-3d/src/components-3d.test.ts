import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createComponentMesh, type ComponentMeshInput, type ComponentTypeMeshInput } from './components-3d.js';
import { Scene3D } from './Scene3D.js';

// Mock ciblé de THREE.WebGLRenderer pour environnement headless / CI sans GPU matériel
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class MockWebGLRenderer {
    public domElement: HTMLCanvasElement;
    public setSize = vi.fn();
    public setPixelRatio = vi.fn();
    public render = vi.fn();
    public dispose = vi.fn();
    public clear = vi.fn();
    public clearColor = vi.fn();
    public clearDepth = vi.fn();
    public clearStencil = vi.fn();
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

    public shadowMap = {
      enabled: false,
      type: 1,
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

// Catalogue de test représentant les familles architecturales standard
const SAMPLE_CATALOG: readonly ComponentTypeMeshInput[] = [
  { subType: 'toilet', width: 360, depth: 540, height: 400, defaultElevationOffset: 0 },
  { subType: 'sink', width: 800, depth: 500, height: 850, defaultElevationOffset: 0 },
  { subType: 'shower', width: 900, depth: 900, height: 60, defaultElevationOffset: 0 },
  { subType: 'bath', width: 1700, depth: 750, height: 550, defaultElevationOffset: 0 },
  { subType: 'kitchen_base', width: 600, depth: 600, height: 850, defaultElevationOffset: 0 },
  { subType: 'kitchen_wall', width: 600, depth: 350, height: 700, defaultElevationOffset: 1450 },
  { subType: 'sink_unit', width: 1200, depth: 600, height: 850, defaultElevationOffset: 0 },
  { subType: 'appliance', width: 600, depth: 650, height: 1850, defaultElevationOffset: 0 },
  { subType: 'bed', width: 1600, depth: 2000, height: 500, defaultElevationOffset: 0 },
  { subType: 'table', width: 1600, depth: 900, height: 750, defaultElevationOffset: 0 },
  { subType: 'chair', width: 450, depth: 450, height: 850, defaultElevationOffset: 0 },
  { subType: 'sofa', width: 2200, depth: 900, height: 800, defaultElevationOffset: 0 },
  { subType: 'cabinet', width: 1500, depth: 600, height: 2100, defaultElevationOffset: 0 },
  { subType: 'sliding_door', width: 2400, depth: 150, height: 2150, defaultElevationOffset: 0 },
  { subType: 'french_window', width: 1400, depth: 150, height: 2150, defaultElevationOffset: 0 },
];

describe('Rendu 3D des Composants et Mobilier (Phase 8.2B — packages/view-3d)', () => {
  describe('Générateur géométrique 3D (createComponentMesh)', () => {
    it('génère un maillage étanche valide pour l’ensemble des familles d’aménagement', () => {
      const dummyComponent: ComponentMeshInput = {
        id: 'comp_test',
        placement: { x: 1000, y: 1500, rotation: 0 },
      };

      for (const ct of SAMPLE_CATALOG) {
        const mesh = createComponentMesh(dummyComponent, ct, 0);

        expect(mesh).not.toBeNull();
        if (!mesh) continue;

        expect(mesh.elementId).toBe('comp_test');
        expect(mesh.positions.length).toBeGreaterThan(0);
        expect(mesh.normals.length).toBe(mesh.positions.length);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);

        // Vérification de la normalité unitaire des normales (|n| = 1.0)
        for (let i = 0; i < mesh.normals.length; i += 3) {
          const nx = mesh.normals[i]!;
          const ny = mesh.normals[i + 1]!;
          const nz = mesh.normals[i + 2]!;
          const len = Math.hypot(nx, ny, nz);
          expect(len).toBeCloseTo(1.0, 3);
        }

        // Vérification de la boîte englobante
        expect(mesh.boundingBox.max.x).toBeGreaterThan(mesh.boundingBox.min.x);
        expect(mesh.boundingBox.max.y).toBeGreaterThan(mesh.boundingBox.min.y);
        expect(mesh.boundingBox.max.z).toBeGreaterThan(mesh.boundingBox.min.z);
      }
    });

    it('positionne le maillage à l’altitude exacte incluant le niveau et elevationOffset', () => {
      const ct = SAMPLE_CATALOG[0]!;
      const comp: ComponentMeshInput = {
        id: 'comp_elev',
        placement: { x: 0, y: 0, elevationOffset: 120 },
      };

      const levelElevation = 2800;
      const mesh = createComponentMesh(comp, ct, levelElevation);
      expect(mesh).not.toBeNull();

      // zBase attendu = 2800 + 120 = 2920 mm
      expect(mesh!.boundingBox.min.z).toBeCloseTo(2920, 1);
    });

    it('applique la rotation autour de l’axe Z vertical', () => {
      // Table 1600 (X) x 900 (Y) x 750 (Z) tournée de 90°
      const tableType = SAMPLE_CATALOG.find((c) => c.subType === 'table')!;
      const comp: ComponentMeshInput = {
        id: 'comp_rot',
        placement: { x: 0, y: 0, rotation: Math.PI / 2 },
      };

      const mesh = createComponentMesh(comp, tableType, 0);
      expect(mesh).not.toBeNull();

      // Après rotation de 90°, l'emprise en X doit être ~ 900 (dans [-450, 450])
      // et l'emprise en Y doit être ~ 1600 (dans [-800, 800])
      const sizeX = mesh!.boundingBox.max.x - mesh!.boundingBox.min.x;
      const sizeY = mesh!.boundingBox.max.y - mesh!.boundingBox.min.y;

      expect(sizeX).toBeCloseTo(900, 1);
      expect(sizeY).toBeCloseTo(1600, 1);
    });

    it('retourne null si les dimensions sont invalides ou nulles', () => {
      const invalidType: ComponentTypeMeshInput = {
        ...SAMPLE_CATALOG[0]!,
        width: 0,
      };
      const comp: ComponentMeshInput = {
        id: 'comp_inv',
        placement: { x: 0, y: 0 },
      };

      expect(createComponentMesh(comp, invalidType, 0)).toBeNull();
    });
  });

  describe('Intégration Scene3D Three.js', () => {
    let canvas: HTMLCanvasElement;
    let scene: Scene3D;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      scene = new Scene3D({ canvas, width: 800, height: 600 });
    });

    afterEach(() => {
      scene.dispose();
    });

    it('ajoute, met à jour et supprime un composant dans la scène Three.js avec son matériau de famille', () => {
      const tableType = SAMPLE_CATALOG.find((c) => c.subType === 'table')!;
      const comp: ComponentMeshInput = {
        id: 'comp_scene_1',
        placement: { x: 1000, y: 1000 },
      };

      const meshData = createComponentMesh(comp, tableType, 0)!;
      const threeMesh = scene.addComponentMesh('comp_scene_1', meshData, 'furniture');

      expect(threeMesh).toBeDefined();
      expect(threeMesh.userData.elementId).toBe('comp_scene_1');
      expect(threeMesh.userData.category).toBe('component');

      // Mise à jour
      const updatedMesh = scene.updateComponentMesh('comp_scene_1', meshData, 'furniture');
      expect(updatedMesh).toBeDefined();

      // Suppression
      scene.removeComponentMesh('comp_scene_1');
      const found = scene.getMeshes('comp_scene_1');
      expect(found).toHaveLength(0);
    });

    it('applique la surbrillance de sélection sur le composant (setHighlight)', () => {
      const toiletType = SAMPLE_CATALOG.find((c) => c.subType === 'toilet')!;
      const comp: ComponentMeshInput = {
        id: 'comp_wc_hl',
        placement: { x: 500, y: 500 },
      };

      const meshData = createComponentMesh(comp, toiletType, 0)!;
      const mesh = scene.addComponentMesh('comp_wc_hl', meshData, 'sanitary');
      const baseMat = mesh.material;

      // Sélection
      scene.setHighlight(['comp_wc_hl']);
      expect(mesh.material).not.toBe(baseMat);

      // Désélection
      scene.setHighlight([]);
      expect(mesh.material).toBe(baseMat);
    });
  });
});
