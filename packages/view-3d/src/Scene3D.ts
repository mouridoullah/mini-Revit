import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type RawMeshData } from '@mini-bim/geometry';
import { type SceneOptions, type ClashOverlayItem, type FederatedModelVisual } from './types.js';
import { MeshAdapter } from './MeshAdapter.js';
import { FederatedIfcManager } from './FederatedIfcManager.js';
import {
  createDefaultMaterial,
  createHighlightMaterial,
  createSanitaryMaterial,
  createKitchenMaterial,
  createFurnitureMaterial,
  createGlazingMaterial,
  createMepMaterial,
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
  private readonly gridMajorVertexMask: readonly boolean[];
  private readonly ambientLight: THREE.HemisphereLight;
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
   * Groupe conteneur des superpositions filaires et visuelles de collisions.
   */
  private readonly clashOverlaysGroup: THREE.Group = new THREE.Group();

  /**
   * Gestionnaire impératif des maquettes IFC externes fédérées.
   */
  private readonly federatedManager: FederatedIfcManager = new FederatedIfcManager();

  /**
   * Registre des maillages architecturaux indexés par elementId.
   */
  private readonly meshes: Map<string, THREE.Mesh[]> = new Map();

  /**
   * Plan de coupe 3D actif (ADR-063).
   */
  private activeClippingPlane: THREE.Plane | null = null;

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
    const background = options.background ?? 0x262a33;
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
    this.renderer.localClippingEnabled = true;
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
    this.ambientLight = new THREE.HemisphereLight(0xe8eefb, 0x424854, 1.15);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(15000, -20000, 25000);
    this.directionalLight.target.position.set(camTarget.x, camTarget.y, camTarget.z);
    this.scene.add(this.directionalLight);
    this.scene.add(this.directionalLight.target);

    // 5. Grille de sol horizontale XY (Z = 0)
    this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x566070, 0x3a404c);
    const gridColors = this.gridHelper.geometry.getAttribute('color');
    const majorColor = new THREE.Color(0x566070);
    const minorColor = new THREE.Color(0x3a404c);
    this.gridMajorVertexMask = Array.from({ length: gridColors.count }, (_, index) => {
      const r = gridColors.getX(index);
      const g = gridColors.getY(index);
      const b = gridColors.getZ(index);
      const majorDistance = Math.hypot(r - majorColor.r, g - majorColor.g, b - majorColor.b);
      const minorDistance = Math.hypot(r - minorColor.r, g - minorColor.g, b - minorColor.b);
      return majorDistance < minorDistance;
    });
    // Bascule de la grille du plan XZ standard Three.js vers le plan XY architectural
    this.gridHelper.rotation.x = Math.PI / 2;
    this.scene.add(this.gridHelper);
    this.scene.add(this.clashOverlaysGroup);
    this.scene.add(this.federatedManager.getRootGroup());

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
    if (this.activeClippingPlane) {
      const planes = [this.activeClippingPlane];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          m.clippingPlanes = planes;
          m.clipShadows = true;
        });
      } else {
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
      }
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = rawData.elementId;
    mesh.userData = {
      elementId: rawData.elementId,
      role: rawData.role,
      baseMaterial: mat,
      ...(rawData.userData ?? {}),
      ...(materialOptions ?? {}),
    };

    // Arêtes d'architecture fines, conservées comme enfants du volume sélectionnable.
    if (['wall', 'slab', 'roof'].includes(String(mesh.userData.category ?? ''))) {
      const edges = new THREE.EdgesGeometry(geometry, 15);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2b303b });
      if (this.activeClippingPlane) {
        lineMat.clippingPlanes = [this.activeClippingPlane];
      }
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.name = `${rawData.elementId}-architectural-edges`;
      lines.userData.ownsGeometryAndMaterial = true;
      mesh.add(lines);
    }

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
      this.disposeArchitecturalEdges(mesh);
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

  private disposeArchitecturalEdges(mesh: THREE.Mesh): void {
    for (const child of [...mesh.children]) {
      if (child.userData?.ownsGeometryAndMaterial !== true) continue;
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    }
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
   * Ajoute un élément de réseau MEP (tuyau, gaine, chemin de câbles, raccord, équipement) à la scène 3D.
   */
  public addMepMesh(
    elementId: string,
    rawMesh: RawMeshData,
    colorOrMaterial?: string | number | THREE.Material,
  ): THREE.Mesh {
    let material: THREE.Material;
    if (colorOrMaterial instanceof THREE.Material) {
      material = colorOrMaterial;
    } else {
      const hex = colorOrMaterial ?? (rawMesh.userData?.color as string | undefined) ?? '#64748b';
      material = createMepMaterial(hex);
    }

    return this.addMesh(
      {
        ...rawMesh,
        elementId,
        userData: {
          elementId,
          category: 'mep',
          ...(rawMesh.userData ?? {}),
        },
      },
      material,
    );
  }

  /**
   * Met à jour un élément MEP dans la scène 3D (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateMepMesh(
    elementId: string,
    rawMesh: RawMeshData,
    colorOrMaterial?: string | number | THREE.Material,
  ): THREE.Mesh {
    this.removeMesh(elementId);
    return this.addMepMesh(elementId, rawMesh, colorOrMaterial);
  }

  public removeMepMesh(elementId: string): void {
    this.removeMesh(elementId);
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
    for (const hit of hits) {
      if (this.activeClippingPlane && this.activeClippingPlane.distanceToPoint(hit.point) < 0) {
        continue;
      }
      const userDataId = hit.object.userData?.elementId as string | undefined;
      const meshName = hit.object.name;
      return userDataId || meshName || null;
    }
    return null;
  }

  /**
   * Efface et libère tous les volumes et repères de surimpression de collisions.
   */
  public clearClashOverlays(): void {
    if (this.isDisposed) return;
    while (this.clashOverlaysGroup.children.length > 0) {
      const child = this.clashOverlaysGroup.children[0];
      if (!child) break;
      this.clashOverlaysGroup.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    }
    this.render();
  }

  /**
   * Génère et affiche les volumes englobants et repères visuels des conflits détectés.
   * - Hard clash : boîte filaire rouge (0xef4444) avec remplissage translucide
   * - Clearance : boîte filaire ambre (0xf59e0b) avec remplissage translucide
   * - Point de collision : sphère repère (rayon 35 mm)
   */
  public setClashOverlays(clashes: readonly ClashOverlayItem[]): void {
    if (this.isDisposed) return;
    this.clearClashOverlays();

    for (const clash of clashes) {
      const isHard = clash.severity === 'hard';
      const color = isHard ? 0xef4444 : 0xf59e0b;
      const min = clash.intersectionBox.min;
      const max = clash.intersectionBox.max;

      // Calcul des dimensions de la zone d'interférence avec épaisseur minimale visible
      const dx = Math.max(Math.abs(max.x - min.x), 30);
      const dy = Math.max(Math.abs(max.y - min.y), 30);
      const dz = Math.max(Math.abs(max.z - min.z), 30);

      const cx = (min.x + max.x) / 2;
      const cy = (min.y + max.y) / 2;
      const cz = (min.z + max.z) / 2;

      // 1. Volume translucide
      const boxGeo = new THREE.BoxGeometry(dx, dy, dz);
      const boxMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(cx, cy, cz);
      this.clashOverlaysGroup.add(boxMesh);

      // 2. Arêtes filaires accentuées
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({
        color,
      });
      const lineSegments = new THREE.LineSegments(edgesGeo, lineMat);
      lineSegments.position.set(cx, cy, cz);
      this.clashOverlaysGroup.add(lineSegments);

      // 3. Repère ponctuel au point de contact
      if (clash.point) {
        const sphereGeo = new THREE.SphereGeometry(35, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereMesh.position.set(clash.point.x, clash.point.y, clash.point.z);
        this.clashOverlaysGroup.add(sphereMesh);
      }
    }

    this.render();
  }

  /**
   * Centre la caméra et l'orbite sur un point de coordonnées 3D spécifique.
   */
  public focusOnPoint(
    point: { readonly x: number; readonly y: number; readonly z: number },
    distance = 6500,
  ): void {
    if (this.isDisposed) return;

    this.controls.target.set(point.x, point.y, point.z);

    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();

    if (dir.lengthSq() < 0.001) {
      dir.set(1, 1, 0.75).normalize();
    }

    this.camera.position.set(
      point.x + dir.x * distance,
      point.y + dir.y * distance,
      point.z + dir.z * distance,
    );

    this.controls.update();
    this.render();
  }

  /**
   * Cadre tous les maillages du modèle dans le viewport.
   * Retourne false si aucun maillage n'est présent.
   */
  public zoomToFit(): boolean {
    if (this.isDisposed) return false;

    const bounds = new THREE.Box3();
    for (const meshes of this.meshes.values()) {
      for (const mesh of meshes) {
        bounds.expandByObject(mesh);
      }
    }
    if (bounds.isEmpty()) return false;

    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = (Math.max(sphere.radius, 500) * 1.15) / Math.sin(limitingFov / 2);

    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    if (direction.lengthSq() < 0.001) {
      direction.set(1, 1, 0.75).normalize();
    }

    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.far = Math.max(this.camera.far, distance * 10);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.render();
    return true;
  }

  /**
   * Ajoute ou met à jour une maquette IFC fédérée dans la scène 3D.
   */
  public addFederatedModel(model: FederatedModelVisual): void {
    if (this.isDisposed) return;
    this.federatedManager.addModel(model);
    this.render();
  }

  /**
   * Retire une maquette IFC fédérée et libère ses ressources WebGL.
   */
  public removeFederatedModel(modelId: string): void {
    if (this.isDisposed) return;
    this.federatedManager.removeModel(modelId);
    this.render();
  }

  /**
   * Modifie la visibilité d'un modèle fédéré.
   */
  public setFederatedModelVisibility(modelId: string, visible: boolean): void {
    if (this.isDisposed) return;
    this.federatedManager.setVisibility(modelId, visible);
    this.render();
  }

  /**
   * Modifie l'opacité d'un modèle fédéré.
   */
  public setFederatedModelOpacity(modelId: string, opacity: number): void {
    if (this.isDisposed) return;
    this.federatedManager.setOpacity(modelId, opacity);
    this.render();
  }

  /**
   * Active ou désactive le mode filaire pour un modèle fédéré.
   */
  public setFederatedModelWireframe(modelId: string, wireframe: boolean): void {
    if (this.isDisposed) return;
    this.federatedManager.setWireframe(modelId, wireframe);
    this.render();
  }

  /**
   * Ajuste le décalage de recalage (dx, dy, dz) d'un modèle fédéré en mm.
   */
  public setFederatedModelOffset(
    modelId: string,
    offset: { x: number; y: number; z: number },
  ): void {
    if (this.isDisposed) return;
    this.federatedManager.setOffset(modelId, offset);
    this.render();
  }

  public setFederatedSelection(modelId: string | null, expressId: number | null): void {
    if (this.isDisposed) return;
    this.federatedManager.setSelectedEntity(modelId, expressId);
    this.render();
  }

  /**
   * Retourne le groupe Three.js racine contenant les maquettes IFC fédérées.
   */
  public getFederatedRootGroup(): THREE.Group {
    return this.federatedManager.getRootGroup();
  }

  /**
   * Raycast sur les géométries de référence IFC fédérées.
   */
  public getFederatedEntityAt(
    screenX: number,
    screenY: number,
  ): { modelId: string; expressId: number } | null {
    if (this.isDisposed) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((screenY - rect.top) / rect.height) * 2 - 1);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    return this.federatedManager.pickEntity(raycaster, this.activeClippingPlane);
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
   * Modifie le fond de la scène et les couleurs de la grille.
   */
  public setBackground(
    background: THREE.ColorRepresentation,
    gridColors: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation],
  ): void {
    if (this.isDisposed) return;

    this.scene.background = new THREE.Color(background);
    const colors = this.gridHelper.geometry.getAttribute('color');
    const majorColor = new THREE.Color(gridColors[0]);
    const minorColor = new THREE.Color(gridColors[1]);
    for (let index = 0; index < colors.count; index++) {
      const color = this.gridMajorVertexMask[index] ? majorColor : minorColor;
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
    this.render();
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
   * Retourne le plan de coupe actif ou null.
   */
  public getActiveClippingPlane(): THREE.Plane | null {
    return this.activeClippingPlane;
  }

  /**
   * Définit ou réinitialise le plan de coupe 3D actif (ADR-063).
   * Propage le plan de coupe sur tous les matériaux existants et partagés.
   */
  public setSectionCutPlane(plane: THREE.Plane | null): void {
    if (this.isDisposed) return;
    this.activeClippingPlane = plane;
    const planes = plane ? [plane] : [];

    // 1. Couverture globale au niveau du renderer Three.js (ADR-063)
    this.renderer.clippingPlanes = planes;

    // 2. Propagation aux maillages architecturaux et MEP
    for (const meshList of this.meshes.values()) {
      for (const mesh of meshList) {
        this.applyClippingPlanesToMesh(mesh, planes);
      }
    }

    // 3. Propagation aux maquettes IFC de référence fédérées
    this.federatedManager.setClippingPlanes(planes);

    // 4. Propagation aux matériaux internes partagés
    const sharedMaterials = [
      this.defaultMaterial,
      this.highlightMaterial,
      this.slabMaterial,
      this.stairMaterial,
      this.roofMaterial,
      this.sanitaryMaterial,
      this.kitchenMaterial,
      this.furnitureMaterial,
      this.glazingMaterial,
    ];
    for (const mat of sharedMaterials) {
      mat.clippingPlanes = planes;
      mat.clipShadows = true;
    }

    this.render();
  }

  /**
   * Configure le plan de coupe 3D à partir d'un segment 2D et d'une direction de vue (ADR-063).
   * start et end sont en coordonnées monde 2D (mm), viewDirection vaut 1 ou -1.
   */
  public setSectionCutFrom2D(
    start: { readonly x: number; readonly y: number },
    end: { readonly x: number; readonly y: number },
    viewDirection: 1 | -1 = 1,
  ): void {
    if (this.isDisposed) return;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) {
      this.setSectionCutPlane(null);
      return;
    }
    const ux = dx / len;
    const uy = dy / len;
    // Normale orientée vers la direction d'observation
    const nx = viewDirection * -uy;
    const ny = viewDirection * ux;
    const normal = new THREE.Vector3(nx, ny, 0).normalize();
    const constant = -(nx * start.x + ny * start.y);
    const plane = new THREE.Plane(normal, constant);
    this.setSectionCutPlane(plane);
  }

  private applyClippingPlanesToMesh(mesh: THREE.Mesh, planes: THREE.Plane[]): void {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => {
        m.clippingPlanes = planes;
        m.clipShadows = true;
      });
    } else if (mesh.material) {
      mesh.material.clippingPlanes = planes;
      mesh.material.clipShadows = true;
    }
    for (const child of mesh.children) {
      if ('material' in child && child.material) {
        const cMat = (child as THREE.Mesh | THREE.LineSegments).material;
        if (Array.isArray(cMat)) {
          cMat.forEach((m) => {
            m.clippingPlanes = planes;
          });
        } else {
          cMat.clippingPlanes = planes;
        }
      }
    }
  }

  /**
   * Libère toutes les ressources WebGL, les géométries, les matériaux et les contrôles.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // 0. Réinitialiser le plan de coupe
    this.setSectionCutPlane(null);

    // 1. Détacher les écouteurs et libérer les contrôles orbitaux
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();

    // 2. Nettoyer et libérer tous les maillages architecturaux
    for (const meshList of this.meshes.values()) {
      for (const mesh of meshList) {
        this.scene.remove(mesh);
        this.disposeArchitecturalEdges(mesh);
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

    // 4. Libérer les superpositions de collision
    this.clearClashOverlays();
    this.scene.remove(this.clashOverlaysGroup);

    // 4b. Libérer les maquettes IFC fédérées
    this.federatedManager.dispose();
    this.scene.remove(this.federatedManager.getRootGroup());

    // 5. Libérer les matériaux gérés
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
