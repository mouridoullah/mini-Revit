import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { type RawMeshData } from '@mini-bim/geometry';
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

describe('Scene3D — Gestionnaire de scène 3D Three.js impératif', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createSampleRawMesh(id: string, role: 'full' | 'sill' | 'lintel' = 'full'): RawMeshData {
    return {
      positions: new Float32Array([
        // Face avant (Y = 0)
        0, 0, 0, 1000, 0, 0, 1000, 0, 2800, 0, 0, 2800,
        // Face supérieure (Z = 2800)
        0, 200, 2800, 1000, 200, 2800,
      ]),
      normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4]),
      elementId: id,
      role,
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1000, y: 200, z: 2800 },
      },
    };
  }

  it('constructeur initialise Camera Z-up, Scene, GridHelper, Lights et OrbitControls', () => {
    const scene3d = new Scene3D(canvas, {
      width: 1024,
      height: 768,
      cameraPosition: { x: 5000, y: 5000, z: 3000 },
      cameraTarget: { x: 1000, y: 500, z: 0 },
    });

    const camera = scene3d.getCamera();
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    // Vérification de la convention architecturale Z-up
    expect(camera.up.x).toBe(0);
    expect(camera.up.y).toBe(0);
    expect(camera.up.z).toBe(1);
    expect(camera.position.x).toBeCloseTo(5000, 3);
    expect(camera.position.y).toBeCloseTo(5000, 3);
    expect(camera.position.z).toBeCloseTo(3000, 3);

    const controls = scene3d.getControls();
    expect(controls).toBeDefined();
    expect(controls.object).toBe(camera);
    expect(controls.object.up.z).toBe(1);
    expect(controls.target.x).toBe(1000);
    expect(controls.target.y).toBe(500);
    expect(controls.target.z).toBe(0);

    // Vérification que la caméra pointe rigoureusement vers cameraTarget
    const worldDir = new THREE.Vector3();
    camera.getWorldDirection(worldDir);
    const expectedDir = new THREE.Vector3(1000 - 5000, 500 - 5000, 0 - 3000).normalize();
    expect(worldDir.dot(expectedDir)).toBeCloseTo(1.0, 4);

    // Vérification que controls.getPolarAngle() est cohérent avec Z-up
    // Vecteur cible->caméra : (4000, 4500, 3000). Angle avec +Z = acos(3000 / hypot(4000, 4500, 3000))
    const expectedPolarAngle = Math.acos(3000 / Math.hypot(4000, 4500, 3000));
    expect(controls.getPolarAngle()).toBeCloseTo(expectedPolarAngle, 3);

    const scene = scene3d.getScene();
    expect(scene).toBeInstanceOf(THREE.Scene);

    // Initialement, 0 mesh architectural
    expect(scene3d.getMeshCount()).toBe(0);

    scene3d.dispose();
  });

  it('interaction OrbitControls : un événement change déclenche bien render() à la demande', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const renderer = scene3d.getRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');

    // Réinitialiser le compteur de spy après le rendu initial du constructeur
    renderSpy.mockClear();
    expect(renderSpy).not.toHaveBeenCalled();

    // Déclencher artificiellement l'événement 'change' émis par OrbitControls
    scene3d.getControls().dispatchEvent({ type: 'change' });

    // Vérifier que le rendu à la demande a bien été déclenché
    expect(renderSpy).toHaveBeenCalledTimes(1);

    scene3d.dispose();
  });

  it('intégrité Three.js : seul WebGLRenderer est mocké, Scene, Mesh, Camera et BufferGeometry sont les vraies classes Three.js', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const rawData = createSampleRawMesh('w_real');
    const mesh = scene3d.addMesh(rawData);

    // Vérifier que ce sont les véritables instances de classes Three.js natives
    expect(scene3d.getScene()).toBeInstanceOf(THREE.Scene);
    expect(scene3d.getCamera()).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);

    // Méthodes prototypes Three.js natives non altérées
    expect(typeof mesh.geometry.computeVertexNormals).toBe('function');
    expect(typeof mesh.raycast).toBe('function');
    expect(typeof scene3d.getScene().add).toBe('function');

    scene3d.dispose();
  });

  it('rendu à la demande : aucune boucle requestAnimationFrame n’est démarrée dans le constructeur', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

    // Aucune boucle continue à 60 fps ne doit être initiée
    expect(rafSpy).not.toHaveBeenCalled();

    // Mais le renderer a bien été appelé 1 fois pour le dessin initial de la scène
    const renderer = scene3d.getRenderer();
    expect(renderer.render).toHaveBeenCalledTimes(1);

    scene3d.dispose();
  });

  it('addMesh ajoute un mesh, conserve userData et déclenche render()', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const renderer = scene3d.getRenderer();
    expect(renderer.render).toHaveBeenCalledTimes(1); // Rendu initial

    const rawData = createSampleRawMesh('wall_piece_1', 'full');
    const mesh = scene3d.addMesh(rawData);

    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.name).toBe('wall_piece_1');
    expect(scene3d.getMeshCount()).toBe(1);
    expect(scene3d.getMeshes('wall_piece_1')).toHaveLength(1);

    // Le rendu à la demande a été déclenché
    expect(renderer.render).toHaveBeenCalledTimes(2);

    scene3d.dispose();
  });

  it('updateMesh remplace la géométrie existante et libère immédiatement l’ancienne via dispose()', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

    const rawDataV1 = createSampleRawMesh('wall_01', 'full');
    const meshV1 = scene3d.addMesh(rawDataV1);
    const geometryV1 = meshV1.geometry;

    // Espionner la libération de l'ancienne géométrie
    const disposeSpy = vi.spyOn(geometryV1, 'dispose');

    // Mise à jour avec une V2 modifiée
    const rawDataV2: RawMeshData = {
      ...createSampleRawMesh('wall_01', 'full'),
      positions: new Float32Array([0, 0, 0, 2000, 0, 0, 2000, 200, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };

    const meshV2 = scene3d.updateMesh(rawDataV2);

    // L'ancienne géométrie doit avoir été libérée immédiatement
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    // Le compte de maillages reste à 1
    expect(scene3d.getMeshCount()).toBe(1);
    expect(scene3d.getMeshes('wall_01')[0]).toBe(meshV2);
    expect(meshV2.geometry).not.toBe(geometryV1);

    scene3d.dispose();
  });

  it('removeMesh retire le mesh de la scène et libère sa géométrie', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const rawData = createSampleRawMesh('wall_to_remove', 'sill');
    const mesh = scene3d.addMesh(rawData);
    const disposeSpy = vi.spyOn(mesh.geometry, 'dispose');

    expect(scene3d.getMeshCount()).toBe(1);

    scene3d.removeMesh('wall_to_remove');

    expect(scene3d.getMeshCount()).toBe(0);
    expect(scene3d.getMeshes('wall_to_remove')).toHaveLength(0);
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    scene3d.dispose();
  });

  it('resize met à jour le ratio de la caméra et la taille du renderer', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const camera = scene3d.getCamera();
    const renderer = scene3d.getRenderer();

    scene3d.resize(1920, 1080);

    expect(camera.aspect).toBeCloseTo(1920 / 1080, 5);
    expect(renderer.setSize).toHaveBeenCalledWith(1920, 1080, false);

    scene3d.dispose();
  });

  it('dispose libère toutes les ressources (renderer, controls, geometries, scene)', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const mesh1 = scene3d.addMesh(createSampleRawMesh('wall_1'));
    const mesh2 = scene3d.addMesh(createSampleRawMesh('wall_2'));

    const disp1 = vi.spyOn(mesh1.geometry, 'dispose');
    const disp2 = vi.spyOn(mesh2.geometry, 'dispose');
    const controlsDisp = vi.spyOn(scene3d.getControls(), 'dispose');
    const rendererDisp = vi.spyOn(scene3d.getRenderer(), 'dispose');

    scene3d.dispose();

    expect(disp1).toHaveBeenCalledTimes(1);
    expect(disp2).toHaveBeenCalledTimes(1);
    expect(controlsDisp).toHaveBeenCalledTimes(1);
    expect(rendererDisp).toHaveBeenCalledTimes(1);
    expect(scene3d.getMeshCount()).toBe(0);
    expect(scene3d.getScene().children.length).toBe(0);

    // Une tentative d'opération sur une instance disposée doit lever une exception
    expect(() => scene3d.addMesh(createSampleRawMesh('late'))).toThrowError(/disposed/);
  });

  it('setHighlight bascule le matériau et met à jour la couleur émissive 0x2563eb', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const mesh1 = scene3d.addMesh(createSampleRawMesh('wall_1'));
    const mesh2 = scene3d.addMesh(createSampleRawMesh('wall_2'));

    // Avant highlight : matériau standard par défaut (emissive = 0x000000)
    const mat1Before = mesh1.material as THREE.MeshStandardMaterial;
    expect(mat1Before.emissive.getHex()).toBe(0x000000);

    // Application de la sélection sur wall_1 uniquement
    scene3d.setHighlight(['wall_1']);

    const mat1After = mesh1.material as THREE.MeshStandardMaterial;
    const mat2After = mesh2.material as THREE.MeshStandardMaterial;

    // wall_1 est en surbrillance avec émissif 0x2563eb
    expect(mat1After.emissive.getHex()).toBe(0x2563eb);
    // wall_2 reste non sélectionné (émissif 0x000000)
    expect(mat2After.emissive.getHex()).toBe(0x000000);

    // Désélection totale
    scene3d.setHighlight([]);
    expect((mesh1.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);

    scene3d.dispose();
  });

  it('raycast détecte l’elementId du maillage sous le curseur ou renvoie null', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    scene3d.addMesh(createSampleRawMesh('wall_center'));

    // Positionner la caméra droit devant le mur (le mur est en 0..1000, 0..200, 0..2800)
    scene3d.getCamera().position.set(500, -2000, 1400);
    scene3d.getCamera().lookAt(500, 100, 1400);
    scene3d.getCamera().updateMatrixWorld(true);

    // Clic au centre du canvas (400, 300) -> NDC (0, 0)
    const hitId = scene3d.raycast(400, 300);
    expect(hitId).toBe('wall_center');

    // Clic loin dans le vide
    const missId = scene3d.raycast(10, 10);
    expect(missId).toBeNull();

    scene3d.dispose();
  });
});
