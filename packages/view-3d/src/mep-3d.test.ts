import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePipeMesh,
  generateDuctMesh,
  generateCableTrayMesh,
  generateFittingMesh,
  generateEquipmentMesh,
  generateMepMeshes,
  getMepSystemColor,
  MEP_SYSTEM_COLORS,
  Scene3D,
  type PipeGeometryParams,
  type DuctGeometryParams,
  type CableTrayGeometryParams,
  type MepFittingGeometryParams,
  type MepEquipmentGeometryParams,
} from './index.js';

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

describe('Phase 9.3.1 — Géométrie Fondamentale 3D MEP', () => {
  // --------------------------------------------------------------------------
  // 1. Couleurs normalisées des systèmes
  // --------------------------------------------------------------------------
  describe('Codes couleurs normalisés (getMepSystemColor)', () => {
    it('attribue les couleurs BIM conventionnelles par type de système', () => {
      expect(getMepSystemColor('domestic_cold_water')).toBe('#2563eb');
      expect(getMepSystemColor('domestic_hot_water')).toBe('#dc2626');
      expect(getMepSystemColor('drainage_waste')).toBe('#78716c');
      expect(getMepSystemColor('supply_air')).toBe('#0284c7');
      expect(getMepSystemColor('return_air')).toBe('#ea580c');
      expect(getMepSystemColor('exhaust_air')).toBe('#65a30d');
      expect(getMepSystemColor('hydronic_supply')).toBe('#0891b2');
      expect(getMepSystemColor('hydronic_return')).toBe('#be185d');
      expect(getMepSystemColor('power')).toBe('#f59e0b');
      expect(getMepSystemColor('telecom')).toBe('#8b5cf6');
    });

    it('applique un repli par domaine si le systemType est absent ou inconnu', () => {
      expect(getMepSystemColor(undefined, 'plumbing')).toBe('#2563eb');
      expect(getMepSystemColor(undefined, 'hvac')).toBe('#0284c7');
      expect(getMepSystemColor(undefined, 'hydronic')).toBe('#0891b2');
      expect(getMepSystemColor(undefined, 'electrical')).toBe('#f59e0b');
      expect(getMepSystemColor(undefined, undefined)).toBe('#64748b');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Tuyauterie (Pipe)
  // --------------------------------------------------------------------------
  describe('Générateur géométrique de tuyauterie (generatePipeMesh)', () => {
    it('génère un cylindre 3D étanche entre start et end avec normales et AABB exactes', () => {
      const pipe: PipeGeometryParams = {
        id: 'pipe_cold_1',
        start: { x: 0, y: 0, z: 1000 },
        end: { x: 2000, y: 0, z: 1000 },
        diameter: 50,
        levelId: 'lvl_rdc',
        systemType: 'domestic_cold_water',
        domain: 'plumbing',
      };

      const mesh = generatePipeMesh(pipe);

      expect(mesh.elementId).toBe('pipe_cold_1');
      expect(mesh.role).toBe('full');
      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.indices.length).toBeGreaterThan(0);
      // Triangles valides (multiple de 3)
      expect(mesh.indices.length % 3).toBe(0);

      // Vérification de la boîte englobante AABB
      const r = 25;
      expect(mesh.boundingBox.min.x).toBeCloseTo(0, 1);
      expect(mesh.boundingBox.max.x).toBeCloseTo(2000, 1);
      expect(mesh.boundingBox.min.y).toBeCloseTo(-r, 1);
      expect(mesh.boundingBox.max.y).toBeCloseTo(r, 1);
      expect(mesh.boundingBox.min.z).toBeCloseTo(1000 - r, 1);
      expect(mesh.boundingBox.max.z).toBeCloseTo(1000 + r, 1);

      // Métadonnées
      expect(mesh.userData?.category).toBe('pipe');
      expect(mesh.userData?.systemType).toBe('domestic_cold_water');
      expect(mesh.userData?.color).toBe(MEP_SYSTEM_COLORS['domestic_cold_water']);
    });

    it('génère un maillage valide pour un tuyau vertical (colonne montante)', () => {
      const pipe: PipeGeometryParams = {
        id: 'pipe_riser_1',
        start: { x: 500, y: 500, z: 0 },
        end: { x: 500, y: 500, z: 3000 },
        diameter: 100,
      };

      const mesh = generatePipeMesh(pipe);
      expect(mesh.boundingBox.min.z).toBeCloseTo(0, 1);
      expect(mesh.boundingBox.max.z).toBeCloseTo(3000, 1);
      expect(mesh.boundingBox.min.x).toBeCloseTo(500 - 50, 1);
      expect(mesh.boundingBox.max.x).toBeCloseTo(500 + 50, 1);
      expect(mesh.indices.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Gaines de ventilation (Duct)
  // --------------------------------------------------------------------------
  describe('Générateur géométrique de gaine (generateDuctMesh)', () => {
    it('génère une gaine circulaire quand shape === "round"', () => {
      const duct: DuctGeometryParams = {
        id: 'duct_round_1',
        shape: 'round',
        start: { x: 0, y: 0, z: 2500 },
        end: { x: 3000, y: 0, z: 2500 },
        diameter: 315,
        systemType: 'supply_air',
      };

      const mesh = generateDuctMesh(duct);
      expect(mesh.elementId).toBe('duct_round_1');
      expect(mesh.userData?.shape).toBe('round');
      expect(mesh.userData?.color).toBe('#0284c7');
      expect(mesh.boundingBox.max.x).toBeGreaterThanOrEqual(3000);
    });

    it('génère un prisme rectangulaire quand shape === "rectangular"', () => {
      const duct: DuctGeometryParams = {
        id: 'duct_rect_1',
        shape: 'rectangular',
        start: { x: 0, y: 0, z: 2500 },
        end: { x: 4000, y: 0, z: 2500 },
        width: 400,
        height: 250,
        systemType: 'return_air',
      };

      const mesh = generateDuctMesh(duct);
      expect(mesh.elementId).toBe('duct_rect_1');
      expect(mesh.userData?.shape).toBe('rectangular');
      expect(mesh.userData?.color).toBe('#ea580c');

      // Hauteur Z : centre 2500 +/- 125 mm
      expect(mesh.boundingBox.min.z).toBeCloseTo(2500 - 125, 1);
      expect(mesh.boundingBox.max.z).toBeCloseTo(2500 + 125, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Chemins de câbles (CableTray)
  // --------------------------------------------------------------------------
  describe('Générateur géométrique de chemin de câbles (generateCableTrayMesh)', () => {
    it('génère un profil en U ouvert avec semelle, rives et barreaux transversaux', () => {
      const tray: CableTrayGeometryParams = {
        id: 'tray_main_1',
        start: { x: 0, y: 0, z: 2800 },
        end: { x: 3000, y: 0, z: 2800 },
        width: 200,
        height: 60,
      };

      const mesh = generateCableTrayMesh(tray);
      expect(mesh.elementId).toBe('tray_main_1');
      expect(mesh.userData?.category).toBe('cableTray');
      expect(mesh.userData?.color).toBe('#f59e0b');

      // Le profil U + les barreaux transversaux génèrent un volume riche
      expect(mesh.positions.length).toBeGreaterThan(100);
      expect(mesh.indices.length % 3).toBe(0);
      expect(mesh.boundingBox.max.x).toBeGreaterThanOrEqual(3000);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Raccords (MepFitting)
  // --------------------------------------------------------------------------
  describe('Générateur géométrique de raccords (generateFittingMesh)', () => {
    it('génère un coude (elbow) mitered raccordant 2 ports', () => {
      const elbow: MepFittingGeometryParams = {
        id: 'fitting_elbow_1',
        fittingType: 'elbow',
        position: { x: 1000, y: 0, z: 1000 },
        ports: [
          {
            id: 'p0',
            position: { x: 900, y: 0, z: 1000 },
            direction: { x: -1, y: 0, z: 0 },
            diameter: 50,
          },
          {
            id: 'p1',
            position: { x: 1000, y: 100, z: 1000 },
            direction: { x: 0, y: 1, z: 0 },
            diameter: 50,
          },
        ],
        systemType: 'domestic_cold_water',
      };

      const mesh = generateFittingMesh(elbow);
      expect(mesh.elementId).toBe('fitting_elbow_1');
      expect(mesh.userData?.fittingType).toBe('elbow');
      expect(mesh.indices.length).toBeGreaterThan(0);
    });

    it('génère un té (tee) avec corps principal et piquage', () => {
      const tee: MepFittingGeometryParams = {
        id: 'fitting_tee_1',
        fittingType: 'tee',
        position: { x: 1000, y: 0, z: 1000 },
        ports: [
          {
            id: 'p0',
            position: { x: 900, y: 0, z: 1000 },
            direction: { x: -1, y: 0, z: 0 },
            diameter: 50,
          },
          {
            id: 'p1',
            position: { x: 1100, y: 0, z: 1000 },
            direction: { x: 1, y: 0, z: 0 },
            diameter: 50,
          },
          {
            id: 'p2',
            position: { x: 1000, y: 100, z: 1000 },
            direction: { x: 0, y: 1, z: 0 },
            diameter: 32,
          },
        ],
        systemType: 'domestic_hot_water',
      };

      const mesh = generateFittingMesh(tee);
      expect(mesh.elementId).toBe('fitting_tee_1');
      expect(mesh.userData?.fittingType).toBe('tee');
      expect(mesh.userData?.color).toBe('#dc2626');
    });

    it('génère une réduction (transition) tronconique entre deux diamètres', () => {
      const transition: MepFittingGeometryParams = {
        id: 'fitting_red_1',
        fittingType: 'transition',
        position: { x: 1000, y: 0, z: 1000 },
        ports: [
          {
            id: 'p0',
            position: { x: 950, y: 0, z: 1000 },
            direction: { x: -1, y: 0, z: 0 },
            diameter: 50,
          },
          {
            id: 'p1',
            position: { x: 1050, y: 0, z: 1000 },
            direction: { x: 1, y: 0, z: 0 },
            diameter: 32,
          },
        ],
      };

      const mesh = generateFittingMesh(transition);
      expect(mesh.elementId).toBe('fitting_red_1');
      expect(mesh.userData?.fittingType).toBe('transition');
      expect(mesh.indices.length).toBeGreaterThan(0);
    });

    it('génère un bouchon (cap) terminal', () => {
      const cap: MepFittingGeometryParams = {
        id: 'fitting_cap_1',
        fittingType: 'cap',
        position: { x: 2000, y: 0, z: 1000 },
        ports: [
          {
            id: 'p0',
            position: { x: 2000, y: 0, z: 1000 },
            direction: { x: 1, y: 0, z: 0 },
            diameter: 40,
          },
        ],
      };

      const mesh = generateFittingMesh(cap);
      expect(mesh.elementId).toBe('fitting_cap_1');
      expect(mesh.userData?.fittingType).toBe('cap');
      expect(mesh.indices.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Équipements techniques (MepEquipment)
  // --------------------------------------------------------------------------
  describe('Générateur géométrique d\'équipements (generateEquipmentMesh)', () => {
    it('génère une enveloppe 3D orientée avec pastilles de ports en relief', () => {
      const eq: MepEquipmentGeometryParams = {
        id: 'boiler_1',
        family: 'boiler',
        position: { x: 1000, y: 2000, z: 0 },
        rotation: 0,
        width: 600,
        depth: 400,
        height: 900,
        ports: [
          {
            id: 'p_flow',
            position: { x: 900, y: 2000, z: 800 },
            direction: { x: 0, y: -1, z: 0 },
            diameter: 32,
          },
          {
            id: 'p_ret',
            position: { x: 1100, y: 2000, z: 800 },
            direction: { x: 0, y: -1, z: 0 },
            diameter: 32,
          },
        ],
      };

      const mesh = generateEquipmentMesh(eq);
      expect(mesh.elementId).toBe('boiler_1');
      expect(mesh.userData?.category).toBe('mepEquipment');
      expect(mesh.userData?.family).toBe('boiler');

      // Vérification de l'AABB (600x400x900 centré sur x=1000, y=2000)
      expect(mesh.boundingBox.min.x).toBeLessThanOrEqual(700);
      expect(mesh.boundingBox.max.x).toBeGreaterThanOrEqual(1300);
      expect(mesh.boundingBox.min.z).toBeCloseTo(0, 1);
      expect(mesh.boundingBox.max.z).toBeGreaterThanOrEqual(900);
    });

    it('génère une modélisation multi-volumes dédiée pour chacune des 10 familles MEP (ADR-072)', () => {
      const families: Array<MepEquipmentGeometryParams['family']> = [
        'boiler',
        'heat_pump',
        'water_heater',
        'pump',
        'ahu',
        'fan',
        'radiator',
        'valve',
        'meter',
        'electrical_panel',
      ];

      for (const fam of families) {
        const eq: MepEquipmentGeometryParams = {
          id: `eq_${fam}_1`,
          family: fam,
          position: { x: 500, y: 500, z: 0 },
          width: 400,
          depth: 300,
          height: 600,
        };
        const m = generateEquipmentMesh(eq);
        expect(m.elementId).toBe(`eq_${fam}_1`);
        expect(m.userData?.family).toBe(fam);
        expect(m.positions.length).toBeGreaterThan(72); // Multi-volumes (> simple boîte de 72 floats)
        expect(m.indices.length % 3).toBe(0);
        expect(m.boundingBox.max.z).toBeGreaterThan(0);
      }
    });

    it('tuyaux et gaines intègrent des bagues, colliers et brides d assemblage (ADR-072)', () => {
      const longPipe: PipeGeometryParams = {
        id: 'pipe_flanged_1',
        start: { x: 0, y: 0, z: 1000 },
        end: { x: 2000, y: 0, z: 1000 },
        diameter: 50,
      };
      const pMesh = generatePipeMesh(longPipe);
      expect(pMesh.positions.length).toBeGreaterThan(150);

      const rectDuct: DuctGeometryParams = {
        id: 'duct_flanged_1',
        shape: 'rectangular',
        start: { x: 0, y: 0, z: 2000 },
        end: { x: 3000, y: 0, z: 2000 },
        width: 400,
        height: 250,
      };
      const dMesh = generateDuctMesh(rectDuct);
      expect(dMesh.positions.length).toBeGreaterThan(150);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Génération groupée par lot (generateMepMeshes)
  // --------------------------------------------------------------------------
  describe('Génération par lot (generateMepMeshes)', () => {
    it('génère les maillages de toutes les catégories MEP présentes', () => {
      const meshes = generateMepMeshes({
        pipes: {
          p1: {
            id: 'p1',
            start: { x: 0, y: 0, z: 500 },
            end: { x: 1000, y: 0, z: 500 },
            diameter: 32,
          },
        },
        ducts: {
          d1: {
            id: 'd1',
            shape: 'round',
            start: { x: 0, y: 500, z: 2500 },
            end: { x: 2000, y: 500, z: 2500 },
            diameter: 200,
          },
        },
        cableTrays: {
          t1: {
            id: 't1',
            start: { x: 0, y: 1000, z: 2700 },
            end: { x: 2000, y: 1000, z: 2700 },
            width: 150,
            height: 50,
          },
        },
      });

      expect(meshes.length).toBe(3);
      expect(meshes.map((m) => m.elementId)).toEqual(['p1', 'd1', 't1']);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Intégration Scene3D Three.js
  // --------------------------------------------------------------------------
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

    it('ajoute, met à jour et supprime un maillage MEP dans Scene3D', () => {
      const pipe: PipeGeometryParams = {
        id: 'pipe_scene_1',
        start: { x: 0, y: 0, z: 1000 },
        end: { x: 2000, y: 0, z: 1000 },
        diameter: 40,
        systemType: 'domestic_cold_water',
      };
      const rawMesh = generatePipeMesh(pipe);

      // Ajout
      const mesh = scene.addMepMesh(pipe.id, rawMesh);
      expect(mesh).toBeDefined();
      expect(scene.getMeshes(pipe.id).length).toBe(1);

      // Mise à jour
      const updatedPipe: PipeGeometryParams = {
        ...pipe,
        end: { x: 3000, y: 0, z: 1000 },
      };
      const updatedRawMesh = generatePipeMesh(updatedPipe);
      const updatedMesh = scene.updateMepMesh(pipe.id, updatedRawMesh);
      expect(updatedMesh).toBeDefined();
      expect(scene.getMeshes(pipe.id).length).toBe(1);

      // Suppression
      scene.removeMepMesh(pipe.id);
      expect(scene.getMeshes(pipe.id).length).toBe(0);
    });

    it('permet le raycasting et la surbrillance (highlight) sur les entités MEP', () => {
      const pipe: PipeGeometryParams = {
        id: 'pipe_pick_1',
        start: { x: -500, y: 0, z: 0 },
        end: { x: 500, y: 0, z: 0 },
        diameter: 200,
      };
      const rawMesh = generatePipeMesh(pipe);
      scene.addMepMesh(pipe.id, rawMesh);

      // Surbrillance
      scene.setHighlight([pipe.id]);
      const meshes = scene.getMeshes(pipe.id);
      expect(meshes[0]?.material).toBeDefined();

      // Extinction de la surbrillance
      scene.setHighlight([]);
    });
  });
});
