import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type RawMeshData } from '@mini-bim/geometry';
import { type SceneOptions } from './types.js';
import { MeshAdapter } from './MeshAdapter.js';
import {
  createDefaultMaterial,
  createHighlightMaterial,
  createSanitaryMaterial,
  createKitchenMaterial,
  createFurnitureMaterial,
  createGlazingMaterial,
} from './materials.js';

export type ComponentMeshFamily = 'sanitary' | 'kitchen' | 'furniture' | 'glazing' | (string & {});

/**
 * Gestionnaire impératif de scène 3D Three.js pour Mini-BIM.
 *
 * RÈGLES D'OR ARCHITECTURALES :
 * 1. Zéro React : Cette classe est un contrôleur impératif pur, réutilisable dans tout contexte.
 * 2. Rendu à la demande (demand-driven) : Aucune boucle requestAnimationFrame n'est lancée
 *    dans le constructeur. Les rendus sont déclenchés explicitement lors des mutations
 *    ou des interactions de la caméra.
 * 3. Repère Z-up architectural : L'axe Z est l'axe vertical (altimétrie), le plan XY
 *    constitue le sol horizontal (conforme aux conventions BIM Revit/IFC).
 * 4. Gestion rigoureuse des ressources : dispose() libère toutes les géométries,
 *    matériaux, contrôles et contextes WebGL pour prévenir toute fuite mémoire.
 */
export class Scene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly gridHelper: THREE.GridHelper;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly directionalLight: THREE.DirectionalLight;
  private readonly defaultMaterial: THREE.MeshStandardMaterial;
  private readonly highlightMaterial: THREE.MeshStandardMaterial;
  private readonly slabMaterial: THREE.MeshStandardMaterial;
  private readonly stairMaterial: THREE.MeshStandardMaterial;
  private readonly roofMaterial: THREE.MeshStandardMaterial;
  private readonly sanitaryMaterial: THREE.MeshStandardMaterial;
  private readonly kitchenMaterial: THREE.MeshStandardMaterial;
  private readonly furnitureMaterial: THREE.MeshStandardMaterial;
  private readonly glazingMaterial: THREE.MeshStandardMaterial;

  /**
   * Registre des maillages architecturaux indexés par elementId.
   */
  private readonly meshes: Map<string, THREE.Mesh[]> = new Map();

  private readonly onControlsChange: () => void;
  private isDisposed = false;

  public constructor(canvas: HTMLCanvasElement, options?: Partial<SceneOptions>);
  public constructor(options: SceneOptions);
  public constructor(
    canvasOrOptions: HTMLCanvasElement | SceneOptions,
    maybeOptions?: Partial<SceneOptions>,
  ) {
    let canvas: HTMLCanvasElement;
    let options: Partial<SceneOptions>;

    if (canvasOrOptions && typeof canvasOrOptions === 'object' && 'getContext' in canvasOrOptions) {
      canvas = canvasOrOptions as HTMLCanvasElement;
      options = maybeOptions ?? {};
    } else {
      const fullOptions = canvasOrOptions as SceneOptions;
      canvas = fullOptions.canvas;
      options = fullOptions;
    }

    const width = options.width ?? 800;
    const height = options.height ?? 600;
    const background = options.background ?? 0xf4f3ef;
    const gridSize = options.gridSize ?? 20000;
    const gridDivisions = options.gridDivisions ?? 20;
    const camPos = options.cameraPosition ?? { x: 8000, y: 8000, z: 8000 };
    const camTarget = options.cameraTarget ?? { x: 0, y: 0, z: 0 };

    // 1. Initialisation du WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    // 2. Initialisation de la Scène
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);

    // 3. Caméra perspective en repère Z-up architectural
    const aspect = width / (height || 1);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 10, 500000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(camPos.x, camPos.y, camPos.z);
    this.camera.lookAt(camTarget.x, camTarget.y, camTarget.z);

    // 4. Éclairage architectural
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(15000, -20000, 25000);
    this.directionalLight.target.position.set(camTarget.x, camTarget.y, camTarget.z);
    this.scene.add(this.directionalLight);
    this.scene.add(this.directionalLight.target);

    // 5. Grille de sol horizontale XY (Z = 0)
    this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x888888, 0xd0d0d0);
    // Bascule de la grille du plan XZ standard Three.js vers le plan XY architectural
    this.gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(this.gridHelper);

    // 6. Contrôles orbitaux
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(camTarget.x, camTarget.y, camTarget.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.update();

    // 7. Matériaux partagés par défaut et de surbrillance
    this.defaultMaterial = createDefaultMaterial();
    this.highlightMaterial = createHighlightMaterial();
    this.slabMaterial = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.stairMaterial = new THREE.MeshStandardMaterial({
      color: 0xa0825a,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    this.roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.sanitaryMaterial = createSanitaryMaterial();
    this.kitchenMaterial = createKitchenMaterial();
    this.furnitureMaterial = createFurnitureMaterial();
    this.glazingMaterial = createGlazingMaterial();

    // 8. Rendu à la demande sur interaction caméra
    this.onControlsChange = () => {
      this.render();
    };
    this.controls.addEventListener('change', this.onControlsChange);

    // Rendu initial pour afficher la grille et l'environnement
    this.render();
  }

  /**
   * Vérifie si un matériau fait partie des matériaux internes gérés par Scene3D
   * (ne devant pas être détruits lors de la suppression d'un maillage unitaire).
   */
  private isInternalMaterial(mat: THREE.Material): boolean {
    return (
      mat === this.defaultMaterial ||
      mat === this.highlightMaterial ||
      mat === this.slabMaterial ||
      mat === this.stairMaterial ||
      mat === this.roofMaterial ||
      mat === this.sanitaryMaterial ||
      mat === this.kitchenMaterial ||
      mat === this.furnitureMaterial ||
      mat === this.glazingMaterial
    );
  }

  /**
   * Ajoute un maillage à la scène à partir d'un conteneur RawMeshData.
   */
  public addMesh(
    rawData: RawMeshData,
    material?: THREE.Material,
    materialOptions?: { ownsMaterial?: boolean; isSharedMaterial?: boolean },
  ): THREE.Mesh {
    if (this.isDisposed) {
      throw new Error('[Scene3D] Cannot add mesh to a disposed Scene3D instance.');
    }

    const geometry = MeshAdapter.fromRawMeshData(rawData);
    const mat = material ?? this.defaultMaterial;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = rawData.elementId;
    mesh.userData = {
      elementId: rawData.elementId,
      role: rawData.role,
      baseMaterial: mat,
      ...(rawData.userData ?? {}),
      ...(materialOptions ?? {}),
    };

    this.scene.add(mesh);

    const existingList = this.meshes.get(rawData.elementId) ?? [];
    existingList.push(mesh);
    this.meshes.set(rawData.elementId, existingList);

    this.render();
    return mesh;
  }

  /**
   * Met à jour le maillage associé à un elementId (remplace la géométrie existante).
   * L'ancienne géométrie est immédiatement libérée via dispose().
   */
  public updateMesh(
    rawData: RawMeshData,
    material?: THREE.Material,
    materialOptions?: { ownsMaterial?: boolean; isSharedMaterial?: boolean },
  ): THREE.Mesh {
    if (this.isDisposed) {
      throw new Error('[Scene3D] Cannot update mesh on a disposed Scene3D instance.');
    }

    // Supprimer et libérer proprement les anciens maillages de cet elementId
    this.removeMesh(rawData.elementId);

    // Ajouter le nouveau maillage
    return this.addMesh(rawData, material, materialOptions);
  }

  /**
   * Met à jour en une seule opération atomique l'ensemble des maillages associés à un elementId
   * (ex: les 3 à 6 tronçons solides d'un mur percé d'ouvertures).
   *
   * Garantit que :
   * 1. Toutes les géométries précédentes associées à elementId sont libérées via dispose().
   * 2. L'ensemble des nouveaux tronçons est instancié et rattaché à la scène sous elementId.
   *
   * @param elementId Identifiant de l'élément architectural hôte
   * @param rawDataList Liste des conteneurs géométriques à instancier
   * @param material Matériau optionnel (par défaut: defaultMaterial)
   * @returns La liste des nouveaux maillages THREE.Mesh créés
   */
  public updateMeshBatch(
    elementId: string,
    rawDataList: readonly RawMeshData[],
    material?: THREE.Material,
  ): THREE.Mesh[] {
    if (this.isDisposed) {
      throw new Error('[Scene3D] Cannot update mesh batch on a disposed Scene3D instance.');
    }

    // 1. Libérer et supprimer proprement tous les anciens maillages de cet elementId
    this.removeMesh(elementId);

    if (rawDataList.length === 0) {
      return [];
    }

    // 2. Créer et ajouter tous les nouveaux maillages
    const createdMeshes: THREE.Mesh[] = [];
    for (const rawData of rawDataList) {
      createdMeshes.push(this.addMesh(rawData, material));
    }

    return createdMeshes;
  }

  /**
   * Retire tous les maillages associés à un elementId et libère leur géométrie tampon.
   */
  public removeMesh(elementId: string): void {
    if (this.isDisposed) return;

    const meshList = this.meshes.get(elementId);
    if (!meshList || meshList.length === 0) return;

    for (const mesh of meshList) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();

      // Protection des matériaux partagés ou non possédés (S2-3)
      if (mesh.userData?.ownsMaterial === false || mesh.userData?.isSharedMaterial === true) {
        continue;
      }

      const baseMat = mesh.userData?.baseMaterial as THREE.Material | undefined;
      const matsToDispose = new Set<THREE.Material>();

      const checkAndAdd = (mat: THREE.Material | THREE.Material[] | undefined) => {
        if (!mat) return;
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
          if (!this.isInternalMaterial(m)) {
            matsToDispose.add(m);
          }
        }
      };

      checkAndAdd(mesh.material);
      checkAndAdd(baseMat);

      for (const m of matsToDispose) {
        m.dispose();
      }
    }

    this.meshes.delete(elementId);
    this.render();
  }

  /**
   * Retourne tous les maillages associés à un elementId.
   */
  public getMeshes(elementId: string): readonly THREE.Mesh[] {
    return this.meshes.get(elementId) ?? [];
  }

  /**
   * Ajoute une dalle de sol de pièce dans la scène 3D avec un matériau pastel translucide.
   */
  public addRoomMesh(roomId: string, rawMesh: RawMeshData): THREE.Mesh {
    const color = getRoomColorHex(roomId);
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    return this.addMesh({ ...rawMesh, elementId: roomId }, material);
  }

  /**
   * Met à jour la dalle de sol d'une pièce (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateRoomMesh(roomId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(roomId);
    return this.addRoomMesh(roomId, rawMesh);
  }

  /**
   * Ajoute une dalle structurelle dans la scène 3D avec un matériau béton (#d1d5db).
   */
  public addSlabMesh(slabId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(
      {
        ...rawMesh,
        elementId: slabId,
        userData: {
          elementId: slabId,
          category: 'slab',
          ...(rawMesh.userData ?? {}),
        },
      },
      this.slabMaterial,
    );
  }

  /**
   * Met à jour une dalle structurelle (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateSlabMesh(slabId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(slabId);
    return this.addSlabMesh(slabId, rawMesh);
  }

  /**
   * Ajoute un escalier dans la scène 3D avec un matériau bois structuré (#a0825a).
   */
  public addStairMesh(stairId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(
      {
        ...rawMesh,
        elementId: stairId,
        userData: {
          elementId: stairId,
          category: 'stair',
          ...(rawMesh.userData ?? {}),
        },
      },
      this.stairMaterial,
    );
  }

  /**
   * Met à jour un escalier (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateStairMesh(stairId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(stairId);
    return this.addStairMesh(stairId, rawMesh);
  }

  public removeStairMesh(stairId: string): void {
    this.removeMesh(stairId);
  }

  /**
   * Ajoute une toiture dans la scène 3D avec un matériau architectural terre cuite (#92400e).
   */
  public addRoofMesh(roofId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(
      {
        ...rawMesh,
        elementId: roofId,
        userData: {
          elementId: roofId,
          category: 'roof',
          ...(rawMesh.userData ?? {}),
        },
      },
      this.roofMaterial,
    );
  }

  /**
   * Met à jour une toiture (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateRoofMesh(roofId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(roofId);
    return this.addRoofMesh(roofId, rawMesh);
  }

  public removeRoofMesh(roofId: string): void {
    this.removeMesh(roofId);
  }

  /**
   * Ajoute un composant d'aménagement ou mobilier dans la scène 3D.
   */
  public addComponentMesh(
    componentId: string,
    rawMesh: RawMeshData,
    family: ComponentMeshFamily = 'furniture',
  ): THREE.Mesh {
    let mat: THREE.MeshStandardMaterial;
    switch (family) {
      case 'sanitary':
        mat = this.sanitaryMaterial;
        break;
      case 'kitchen':
        mat = this.kitchenMaterial;
        break;
      case 'furniture':
        mat = this.furnitureMaterial;
        break;
      case 'glazing':
        mat = this.glazingMaterial;
        break;
      default:
        mat = this.furnitureMaterial;
    }

    return this.addMesh(
      {
        ...rawMesh,
        elementId: componentId,
        userData: {
          elementId: componentId,
          category: 'component',
          family,
          ...(rawMesh.userData ?? {}),
        },
      },
      mat,
    );
  }

  /**
   * Met à jour un composant d'aménagement (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateComponentMesh(
    componentId: string,
    rawMesh: RawMeshData,
    family: ComponentMeshFamily = 'furniture',
  ): THREE.Mesh {
    this.removeMesh(componentId);
    return this.addComponentMesh(componentId, rawMesh, family);
  }

  public removeComponentMesh(componentId: string): void {
    this.removeMesh(componentId);
  }

  /**
   * Applique ou retire la surbrillance de sélection sur les éléments spécifiés.
   * Bascule le matériau entre son matériau de base (ou defaultMaterial) et highlightMaterial (#2563eb).
   *
   * @param ids Ensemble d'identifiants d'éléments architecturaux à surligner
   */
  public setHighlight(ids: Iterable<string>): void {
    if (this.isDisposed) return;

    const idSet = new Set(ids);
    for (const [elementId, meshList] of this.meshes.entries()) {
      const isSelected = idSet.has(elementId);
      for (const mesh of meshList) {
        const baseMat = (mesh.userData?.baseMaterial as THREE.Material) ?? this.defaultMaterial;
        mesh.material = isSelected ? this.highlightMaterial : baseMat;
      }
    }
    this.render();
  }

  /**
   * Effectue un lancer de rayon (picking 3D) à partir de coordonnées écran locales.
   *
   * @param screenX Coordonnée X en pixels locaux relatifs au canvas (0 à width)
   * @param screenY Coordonnée Y en pixels locaux relatifs au canvas (0 à height)
   * @returns L'identifiant elementId du premier mur touché, ou null si clic dans le vide
   */
  public raycast(screenX: number, screenY: number): string | null {
    if (this.isDisposed) return null;

    const canvas = this.renderer.domElement;
    const width = canvas.width > 0 ? canvas.width : 800;
    const height = canvas.height > 0 ? canvas.height : 600;

    // Normalisation en Device Coordinates (NDC) dans [-1, 1]
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -(screenY / height) * 2 + 1;

    return this.raycastNDC(ndcX, ndcY);
  }

  /**
   * Effectue un lancer de rayon (picking 3D) à partir de coordonnées NDC normalisées dans [-1, 1].
   *
   * @param ndcX Coordonnée X dans [-1, 1] (-1 gauche, +1 droite)
   * @param ndcY Coordonnée Y dans [-1, 1] (-1 bas, +1 haut)
   * @returns L'identifiant elementId du premier mur touché, ou null
   */
  public raycastNDC(ndcX: number, ndcY: number): string | null {
    if (this.isDisposed) return null;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const candidateMeshes: THREE.Mesh[] = [];
    for (const meshList of this.meshes.values()) {
      candidateMeshes.push(...meshList);
    }

    const hits = raycaster.intersectObjects(candidateMeshes, false);
    const firstHit = hits[0];
    if (firstHit) {
      const userDataId = firstHit.object.userData?.elementId as string | undefined;
      const meshName = firstHit.object.name;
      return userDataId || meshName || null;
    }
    return null;
  }

  /**
   * Retourne le nombre total de maillages architecturaux enregistrés dans la scène.
   */
  public getMeshCount(): number {
    let count = 0;
    for (const list of this.meshes.values()) {
      count += list.length;
    }
    return count;
  }

  /**
   * Rendu unitaire à la demande.
   */
  public render(): void {
    if (this.isDisposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Redimensionne le viewport et recalcule la matrice de projection de la caméra.
   */
  public resize(width: number, height: number): void {
    if (this.isDisposed) return;
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.render();
  }

  /**
   * Libère toutes les ressources WebGL, les géométries, les matériaux et les contrôles.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // 1. Détacher les écouteurs et libérer les contrôles orbitaux
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();

    // 2. Nettoyer et libérer tous les maillages architecturaux
    for (const meshList of this.meshes.values()) {
      for (const mesh of meshList) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.userData?.ownsMaterial === false || mesh.userData?.isSharedMaterial === true) {
          continue;
        }
        if (mesh.material) {
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of list) {
            if (!this.isInternalMaterial(m)) {
              m.dispose();
            }
          }
        }
      }
    }
    this.meshes.clear();

    // 3. Libérer la grille de sol
    this.scene.remove(this.gridHelper);
    this.gridHelper.geometry.dispose();
    if (Array.isArray(this.gridHelper.material)) {
      this.gridHelper.material.forEach((m) => m.dispose());
    } else {
      this.gridHelper.material.dispose();
    }

    // 4. Libérer les matériaux gérés
    this.defaultMaterial.dispose();
    this.highlightMaterial.dispose();
    this.slabMaterial.dispose();
    this.stairMaterial.dispose();
    this.roofMaterial.dispose();
    this.sanitaryMaterial.dispose();
    this.kitchenMaterial.dispose();
    this.furnitureMaterial.dispose();
    this.glazingMaterial.dispose();

    // 5. Vider la scène Three.js
    this.scene.clear();

    // 6. Libérer le contexte de rendu WebGL
    this.renderer.dispose();
  }

  // Getters pour inspection ou extensions futures
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getControls(): OrbitControls {
    return this.controls;
  }

  public getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }
}

/**
 * Palette déterministe de teintes pastel pour la différenciation des pièces.
 */
function getRoomColorHex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const pastelColors = [
    0xbfdbfe, // bleu ciel
    0xbbf7d0, // vert menthe
    0xfef08a, // jaune doux
    0xfbcfe8, // rose poudré
    0xddd6fe, // lavande
    0xfed7aa, // pêche
    0xc7d2fe, // indigo doux
  ];
  const idx = Math.abs(hash) % pastelColors.length;
  return pastelColors[idx] ?? 0xbae6fd;
}
