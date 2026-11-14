import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type RawMeshData } from '@mini-bim/geometry';
import { type SceneOptions } from './types.js';
import { MeshAdapter } from './MeshAdapter.js';
import { createDefaultMaterial, createHighlightMaterial } from './materials.js';

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

    // 8. Rendu à la demande sur interaction caméra
    this.onControlsChange = () => {
      this.render();
    };
    this.controls.addEventListener('change', this.onControlsChange);

    // Rendu initial pour afficher la grille et l'environnement
    this.render();
  }

  /**
   * Ajoute un maillage à la scène à partir d'un conteneur RawMeshData.
   */
  public addMesh(rawData: RawMeshData, material?: THREE.Material): THREE.Mesh {
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
  public updateMesh(rawData: RawMeshData, material?: THREE.Material): THREE.Mesh {
    if (this.isDisposed) {
      throw new Error('[Scene3D] Cannot update mesh on a disposed Scene3D instance.');
    }

    // Supprimer et libérer proprement les anciens maillages de cet elementId
    this.removeMesh(rawData.elementId);

    // Ajouter le nouveau maillage
    return this.addMesh(rawData, material);
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
      const baseMat = mesh.userData?.baseMaterial as THREE.Material | undefined;
      const matsToDispose = new Set<THREE.Material>();
      if (mesh.material !== this.defaultMaterial && mesh.material !== this.highlightMaterial) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => matsToDispose.add(m));
        } else {
          matsToDispose.add(mesh.material);
        }
      }
      if (baseMat && baseMat !== this.defaultMaterial && baseMat !== this.highlightMaterial) {
        if (Array.isArray(baseMat)) {
          (baseMat as THREE.Material[]).forEach((m) => matsToDispose.add(m));
        } else {
          matsToDispose.add(baseMat);
        }
      }
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
        if (mesh.material !== this.defaultMaterial) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
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
