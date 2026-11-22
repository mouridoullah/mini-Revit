import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { type RawMeshData } from '@mini-bim/geometry';
import { Scene3D } from './Scene3D.js';
import { type FederatedModelVisual } from './types.js';

// Mock ciblé de THREE.WebGLRenderer pour environnement headless / CI sans GPU matériel
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class MockWebGLRenderer {
    public domElement: HTMLCanvasElement;
    public localClippingEnabled = false;
    public clippingPlanes: THREE.Plane[] = [];
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

  it('modifie le fond et éclaircit la grille en mode fond blanc', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const scene = scene3d.getScene();
    const grid = scene.children.find((child) => child instanceof THREE.GridHelper);

    scene3d.setBackground(0xffffff, [0xd1d5db, 0xe5e7eb]);

    expect((scene.background as THREE.Color).getHex()).toBe(0xffffff);
    expect(grid).toBeInstanceOf(THREE.GridHelper);
    if (grid instanceof THREE.GridHelper) {
      const colors = grid.geometry.getAttribute('color');
      const expectedColors = [new THREE.Color(0xd1d5db), new THREE.Color(0xe5e7eb)];
      const actualColors = Array.from({ length: colors.count }, (_, index) =>
        new THREE.Color().setRGB(colors.getX(index), colors.getY(index), colors.getZ(index)),
      );
      for (const expected of expectedColors) {
        expect(
          actualColors.some(
            (actual) =>
              Math.hypot(actual.r - expected.r, actual.g - expected.g, actual.b - expected.b) <
              0.0001,
          ),
        ).toBe(true);
      }
    }

    scene3d.dispose();
  });

  it('cadre les maillages présents sans déplacer la caméra si la scène est vide', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const initialTarget = scene3d.getControls().target.clone();

    expect(scene3d.zoomToFit()).toBe(false);
    expect(scene3d.getControls().target.equals(initialTarget)).toBe(true);

    scene3d.addMesh(createSampleRawMesh('fit_test'));
    expect(scene3d.zoomToFit()).toBe(true);
    expect(scene3d.getControls().target.x).toBeCloseTo(500, 3);
    expect(scene3d.getControls().target.y).toBeCloseTo(100, 3);
    expect(scene3d.getControls().target.z).toBeCloseTo(1400, 3);
    expect(scene3d.getCamera().position.distanceTo(scene3d.getControls().target)).toBeGreaterThan(
      2000,
    );

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

  it('ajoute des arêtes architecturales aux murs et les libère avec le maillage', () => {
    const scene3d = new Scene3D(canvas, { width: 1024, height: 768 });
    const mesh = scene3d.addMesh({
      ...createSampleRawMesh('wall_edges'),
      userData: { category: 'wall' },
    });
    const edges = mesh.children[0] as THREE.LineSegments;
    const geometryDispose = vi.spyOn(edges.geometry, 'dispose');
    const materialDispose = vi.spyOn(edges.material as THREE.Material, 'dispose');

    expect(edges).toBeInstanceOf(THREE.LineSegments);
    scene3d.removeMesh('wall_edges');

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
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
    const defaultMat1 = mesh1.material as THREE.MeshStandardMaterial;
    const defaultMat2 = mesh2.material as THREE.MeshStandardMaterial;
    expect(defaultMat1.emissive.getHex()).toBe(0x000000);
    expect(defaultMat2.emissive.getHex()).toBe(0x000000);
    expect(mesh1.material).toBe(mesh2.material); // Matériau par défaut partagé

    // 1. Application de la sélection sur wall_1 uniquement
    scene3d.setHighlight(['wall_1']);

    const mat1After = mesh1.material as THREE.MeshStandardMaterial;
    const mat2After = mesh2.material as THREE.MeshStandardMaterial;

    // wall_1 permute vers highlightMaterial (référence différente + émissif 0x2563eb)
    expect(mat1After).not.toBe(defaultMat1);
    expect(mat1After.emissive.getHex()).toBe(0x2563eb);

    // wall_2 conserve strictement defaultMaterial (émissif 0x000000)
    expect(mat2After).toBe(defaultMat2);
    expect(mat2After.emissive.getHex()).toBe(0x000000);

    // 2. Désélection totale
    scene3d.setHighlight([]);
    expect(mesh1.material).toBe(defaultMat1);
    expect((mesh1.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);
    expect(mesh2.material).toBe(defaultMat2);

    // 3. Sélection d'un ID inexistant : aucune exception levée, matériaux inchangés
    expect(() => scene3d.setHighlight(['id_inexistant'])).not.toThrow();
    expect(mesh1.material).toBe(defaultMat1);
    expect(mesh2.material).toBe(defaultMat2);

    scene3d.dispose();
  });

  it('raycast et raycastNDC détectent l’elementId du maillage ou renvoient null', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    scene3d.addMesh(createSampleRawMesh('wall_center'));

    // Positionner la caméra droit devant le mur (le mur est en 0..1000, 0..200, 0..2800)
    scene3d.getCamera().position.set(500, -2000, 1400);
    scene3d.getCamera().lookAt(500, 100, 1400);
    scene3d.getCamera().updateMatrixWorld(true);

    // 1. Raycast écran au centre du canvas (400, 300) -> NDC (0, 0)
    const hitScreenCenter = scene3d.raycast(400, 300);
    expect(hitScreenCenter).toBe('wall_center');

    // 2. Raycast direct en coordonnées NDC au centre (0, 0)
    const hitNdcCenter = scene3d.raycastNDC(0, 0);
    expect(hitNdcCenter).toBe('wall_center');

    // 3. Raycast sur les bords extrêmes de la scène (NDC ±1) : aucun maillage présent
    expect(scene3d.raycastNDC(-1, -1)).toBeNull();
    expect(scene3d.raycastNDC(1, 1)).toBeNull();
    expect(scene3d.raycastNDC(-1, 1)).toBeNull();
    expect(scene3d.raycastNDC(1, -1)).toBeNull();

    // 4. Raycast écran dans le vide (10, 10)
    expect(scene3d.raycast(10, 10)).toBeNull();

    scene3d.dispose();
  });

  it('updateMeshBatch remplace atomiquement un ensemble de maillages multi-pièces et libère proprement les anciens', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

    // 1. Ajout initial de 6 tronçons de mur (ex: mur percé d'une porte et d'une fenêtre)
    const initialPieces: RawMeshData[] = [
      createSampleRawMesh('wall_pierced', 'full'),
      createSampleRawMesh('wall_pierced', 'lintel'),
      createSampleRawMesh('wall_pierced', 'full'),
      createSampleRawMesh('wall_pierced', 'sill'),
      createSampleRawMesh('wall_pierced', 'lintel'),
      createSampleRawMesh('wall_pierced', 'full'),
    ];

    for (const p of initialPieces) {
      scene3d.addMesh(p);
    }

    const initialMeshes = scene3d.getMeshes('wall_pierced');
    expect(initialMeshes).toHaveLength(6);

    // Espionner dispose() sur les géométries initiales
    const disposeSpies = initialMeshes.map((m) => vi.spyOn(m.geometry, 'dispose'));

    // 2. Remplacement par 6 nouveaux tronçons via updateMeshBatch
    const updatedPieces: RawMeshData[] = [
      createSampleRawMesh('wall_pierced', 'full'),
      createSampleRawMesh('wall_pierced', 'lintel'),
      createSampleRawMesh('wall_pierced', 'full'),
      createSampleRawMesh('wall_pierced', 'sill'),
      createSampleRawMesh('wall_pierced', 'lintel'),
      createSampleRawMesh('wall_pierced', 'full'),
    ];

    const newMeshes = scene3d.updateMeshBatch('wall_pierced', updatedPieces);
    expect(newMeshes).toHaveLength(6);

    // 3. Vérifications :
    // Toutes les anciennes géométries ont été détruites
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }

    // Les maillages enregistrés sous l'elementId sont strictement les nouveaux
    const currentMeshes = scene3d.getMeshes('wall_pierced');
    expect(currentMeshes).toHaveLength(6);
    expect(currentMeshes).toEqual(newMeshes);
    for (let i = 0; i < 6; i++) {
      expect(currentMeshes[i]).not.toBe(initialMeshes[i]);
    }

    scene3d.dispose();
  });

  it('addRoomMesh et updateRoomMesh gèrent les dalles 3D de pièces avec matériau translucide', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const rawSlab = createSampleRawMesh('room_salon', 'full');

    const mesh = scene3d.addRoomMesh('room_salon', rawSlab);
    expect(mesh).toBeDefined();
    expect(scene3d.getMeshes('room_salon')).toHaveLength(1);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.5, 2);

    // Mise à jour (remplacement) de la dalle
    const newRawSlab = createSampleRawMesh('room_salon', 'full');
    const updatedMesh = scene3d.updateRoomMesh('room_salon', newRawSlab);
    expect(scene3d.getMeshes('room_salon')).toHaveLength(1);
    expect(updatedMesh).not.toBe(mesh);

    scene3d.dispose();
  });

  it('T-SHARED-MAT-01 — 10 cycles consécutifs d’ajout/mise à jour/suppression avec matériau partagé ne disposent jamais le matériau', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const sharedMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6 });
    const disposeSpy = vi.spyOn(sharedMat, 'dispose');

    for (let i = 0; i < 10; i++) {
      scene3d.updateMesh(createSampleRawMesh('door_shared_1', 'full'), sharedMat, {
        ownsMaterial: false,
        isSharedMaterial: true,
      });
      expect(scene3d.getMeshes('door_shared_1')).toHaveLength(1);
      scene3d.removeMesh('door_shared_1');
      expect(scene3d.getMeshes('door_shared_1')).toHaveLength(0);
    }

    expect(disposeSpy).not.toHaveBeenCalled();
    sharedMat.dispose();
    scene3d.dispose();
  });

  it('T-SHARED-MAT-02 — removeMesh respecte ownsMaterial: false et ne dispose que les matériaux possédés', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

    const sharedMat = new THREE.MeshStandardMaterial({ color: 0x10b981 });
    const ownedMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });

    const sharedSpy = vi.spyOn(sharedMat, 'dispose');
    const ownedSpy = vi.spyOn(ownedMat, 'dispose');

    // Maillage 1 : matériau partagé (non possédé)
    const mesh1 = scene3d.addMesh(createSampleRawMesh('item_shared', 'full'), sharedMat);
    mesh1.userData.ownsMaterial = false;

    // Maillage 2 : matériau possédé
    scene3d.addMesh(createSampleRawMesh('item_owned', 'full'), ownedMat);

    scene3d.removeMesh('item_shared');
    scene3d.removeMesh('item_owned');

    expect(sharedSpy).not.toHaveBeenCalled();
    expect(ownedSpy).toHaveBeenCalledTimes(1);

    sharedMat.dispose();
    scene3d.dispose();
  });

  it('T-SHARED-MAT-03 — les matériaux internes (default, slab, stair) ne sont jamais détruits lors de removeMesh', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

    const slabMesh = scene3d.addSlabMesh('slab_test', createSampleRawMesh('slab_test', 'full'));
    const stairMesh = scene3d.addStairMesh('stair_test', createSampleRawMesh('stair_test', 'full'));

    const slabMat = slabMesh.material as THREE.Material;
    const stairMat = stairMesh.material as THREE.Material;

    const slabMatSpy = vi.spyOn(slabMat, 'dispose');
    const stairMatSpy = vi.spyOn(stairMat, 'dispose');

    scene3d.removeMesh('slab_test');
    scene3d.removeMesh('stair_test');

    expect(slabMatSpy).not.toHaveBeenCalled();
    expect(stairMatSpy).not.toHaveBeenCalled();

    // Vérifie qu'on peut immédiatement réutiliser ces matériaux internes pour de nouveaux éléments
    const newSlab = scene3d.addSlabMesh('slab_new', createSampleRawMesh('slab_new', 'full'));
    expect(newSlab.material).toBe(slabMat);

    scene3d.dispose();
  });

  it('T-CLASH-OVERLAY-01 — setClashOverlays crée les volumes et repères filaires puis clearClashOverlays les détruit', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const scene = scene3d.getScene();

    scene3d.setClashOverlays([
      {
        id: 'clash_1',
        severity: 'hard',
        intersectionBox: {
          min: { x: 100, y: 100, z: 0 },
          max: { x: 200, y: 200, z: 300 },
        },
        point: { x: 150, y: 150, z: 150 },
      },
      {
        id: 'clash_2',
        severity: 'clearance',
        intersectionBox: {
          min: { x: 500, y: 500, z: 0 },
          max: { x: 600, y: 600, z: 100 },
        },
        point: { x: 550, y: 550, z: 50 },
      },
    ]);

    // scene3d a créé un groupe contenant 3 enfants par clash (box + edges + sphere point) = 6
    const overlaysGroup = scene.children.find((c) => c instanceof THREE.Group);
    expect(overlaysGroup).toBeDefined();
    expect(overlaysGroup?.children.length).toBe(6);

    // clearClashOverlays libère tout
    scene3d.clearClashOverlays();
    expect(overlaysGroup?.children.length).toBe(0);

    scene3d.dispose();
  });

  it('T-CLASH-OVERLAY-02 — focusOnPoint oriente et positionne la caméra vers le point 3D cible', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const controls = scene3d.getControls();
    const camera = scene3d.getCamera();

    scene3d.focusOnPoint({ x: 1500, y: 2000, z: 2700 }, 1000);

    expect(controls.target.x).toBeCloseTo(1500, 1);
    expect(controls.target.y).toBeCloseTo(2000, 1);
    expect(controls.target.z).toBeCloseTo(2700, 1);

    // La caméra doit être décalée à environ 1 000 mm de la cible
    const dist = camera.position.distanceTo(controls.target);
    expect(Math.round(dist)).toBe(1000);

    scene3d.dispose();
  });

  it('T-CLASH-OVERLAY-03 — le ciblage par défaut laisse du recul pour voir l’interférence', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const controls = scene3d.getControls();
    const camera = scene3d.getCamera();

    scene3d.focusOnPoint({ x: 1500, y: 2000, z: 2700 });

    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(6500, 0);
    scene3d.dispose();
  });

  it('T-FED-VIEW3D-01 : Ajoute une maquette fédérée dans Scene3D avec opacité et décalage', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const sampleVisual: FederatedModelVisual = {
      id: 'fed_sample_01',
      name: 'Maquette Structure Fédérée',
      opacity: 0.35,
      wireframe: false,
      offset: { x: 100, y: 200, z: 0 },
      items: [
        {
          expressId: 101,
          positions: new Float32Array([0, 0, 0, 1000, 0, 0, 1000, 1000, 0, 0, 1000, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
          color: { r: 0.2, g: 0.6, b: 0.8, a: 1.0 },
        },
      ],
    };

    scene3d.addFederatedModel(sampleVisual);

    const rootScene = scene3d.getScene();
    const fedGroup = rootScene.getObjectByName('FederatedIfcContainer') as THREE.Group;
    expect(fedGroup).toBeDefined();

    const modelGroup = fedGroup.getObjectByName('FederatedModel_fed_sample_01') as THREE.Group;
    expect(modelGroup).toBeDefined();
    expect(modelGroup.position.x).toBe(100);
    expect(modelGroup.position.y).toBe(200);

    const mesh = modelGroup.getObjectByName('IfcEntity_fed_sample_01_101') as THREE.Mesh;
    expect(mesh).toBeDefined();
    expect(mesh.userData.isFederated).toBe(true);
    expect(mesh.userData.expressId).toBe(101);

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.opacity).toBe(0.35);
    expect(mat.transparent).toBe(true);

    scene3d.dispose();
  });

  it('T-FED-VIEW3D-02 : Contrôle interactif de visibilité, opacité, filaire et décalage', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    const sampleVisual: FederatedModelVisual = {
      id: 'fed_sample_01',
      name: 'Structure',
      items: [
        {
          expressId: 101,
          positions: new Float32Array([0, 0, 0, 1000, 0, 0, 1000, 1000, 0]),
        },
      ],
    };

    scene3d.addFederatedModel(sampleVisual);

    // Visibilité
    scene3d.setFederatedModelVisibility('fed_sample_01', false);
    const fedGroup = scene3d.getScene().getObjectByName('FederatedIfcContainer') as THREE.Group;
    const modelGroup = fedGroup.getObjectByName('FederatedModel_fed_sample_01') as THREE.Group;
    expect(modelGroup.visible).toBe(false);

    // Opacité
    scene3d.setFederatedModelOpacity('fed_sample_01', 0.75);
    const mesh = modelGroup.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.opacity).toBe(0.75);

    // Filaire
    scene3d.setFederatedModelWireframe('fed_sample_01', true);
    expect(mat.wireframe).toBe(true);

    // Décalage
    scene3d.setFederatedModelOffset('fed_sample_01', { x: 300, y: 400, z: 500 });
    expect(modelGroup.position.x).toBe(300);
    expect(modelGroup.position.y).toBe(400);
    expect(modelGroup.position.z).toBe(500);

    scene3d.dispose();
  });

  it('T-FED-VIEW3D-03 : Déchargement et nettoyage GPU (removeFederatedModel)', () => {
    const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
    scene3d.addFederatedModel({
      id: 'fed_to_remove',
      name: 'To Remove',
      items: [{ expressId: 1, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) }],
    });

    const fedGroup = scene3d.getScene().getObjectByName('FederatedIfcContainer') as THREE.Group;
    expect(fedGroup.children.length).toBe(1);

    scene3d.removeFederatedModel('fed_to_remove');
    expect(fedGroup.children.length).toBe(0);

    scene3d.dispose();
  });

  describe('ADR-063 : Plan de coupe 3D dynamique (Section Cuts & Elevations)', () => {
    it('T-SCENE3D-SEC-01 : setSectionCutPlane propage le plan de coupe sur les matériaux existants et nouveaux', () => {
      const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
      const mesh1 = scene3d.addMesh(createSampleRawMesh('wall_01'));
      expect((mesh1.material as THREE.Material).clippingPlanes).toBeFalsy();

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1500);
      scene3d.setSectionCutPlane(plane);

      expect(scene3d.getActiveClippingPlane()).toBe(plane);
      expect((mesh1.material as THREE.Material).clippingPlanes).toEqual([plane]);

      // Nouveau mesh ajouté après l'activation de la coupe
      const mesh2 = scene3d.addMesh(createSampleRawMesh('wall_02'));
      expect((mesh2.material as THREE.Material).clippingPlanes).toEqual([plane]);

      // Désactivation de la coupe
      scene3d.setSectionCutPlane(null);
      expect(scene3d.getActiveClippingPlane()).toBeNull();
      expect((mesh1.material as THREE.Material).clippingPlanes).toEqual([]);
      expect((mesh2.material as THREE.Material).clippingPlanes).toEqual([]);

      scene3d.dispose();
    });

    it('T-SCENE3D-SEC-02 : setSectionCutFrom2D configure un plan THREE.Plane orienté par viewDirection', () => {
      const scene3d = new Scene3D(canvas, { width: 800, height: 600 });

      // Coupe horizontale de (0, 2000) à (5000, 2000) regardant vers le haut (+Y, viewDirection = 1)
      scene3d.setSectionCutFrom2D({ x: 0, y: 2000 }, { x: 5000, y: 2000 }, 1);
      const plane = scene3d.getActiveClippingPlane();
      expect(plane).not.toBeNull();
      // u = (1, 0), n_2D = (-uy, ux) = (0, 1) * 1 = (0, 1)
      expect(plane!.normal.x).toBeCloseTo(0);
      expect(plane!.normal.y).toBeCloseTo(1);
      expect(plane!.normal.z).toBeCloseTo(0);
      // constant = -(0*0 + 1*2000) = -2000
      expect(plane!.constant).toBeCloseTo(-2000);

      // Inversion de la direction de vue (-1 => normale vers le bas -Y)
      scene3d.setSectionCutFrom2D({ x: 0, y: 2000 }, { x: 5000, y: 2000 }, -1);
      const planeInv = scene3d.getActiveClippingPlane();
      expect(planeInv!.normal.y).toBeCloseTo(-1);
      expect(planeInv!.constant).toBeCloseTo(2000);

      scene3d.dispose();
    });

    it('T-SCENE3D-SEC-03 : raycastNDC ignore les surfaces coupées par le plan de coupe', () => {
      const scene3d = new Scene3D(canvas, { width: 800, height: 600 });
      scene3d.addMesh(createSampleRawMesh('wall_cut'));

      // Coupe plaçant wall_cut en zone coupée (distance < 0)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -5000);
      scene3d.setSectionCutPlane(plane);

      // Raycast simulé : avec le plan actif, si le point touché est < 0, il est ignoré
      const hit = scene3d.raycastNDC(0, 0);
      expect(hit).toBeNull();

      scene3d.dispose();
    });
  });
});
