import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type RawMeshData } from '@tabax/geometry';
import { type SceneOptions, type ClashOverlayItem, type FederatedModelVisual } from './types.js';
import { FederatedIfcManager } from './FederatedIfcManager.js';
import { createDefaultMaterial } from './materials.js';
import { EnvironmentManager } from './rendering/EnvironmentManager.js';
import { PostProcessingManager } from './rendering/PostProcessingManager.js';
import type { RenderMode } from './rendering/PostProcessingManager.js';
import { SectionCapManager } from './rendering/SectionCapManager.js';
import { ArchitecturalMeshManager } from './rendering/ArchitecturalMeshManager.js';
import { ArchitecturalGridManager } from './rendering/ArchitecturalGridManager.js';
import { DomainMeshFactory, type ComponentMeshFamily } from './rendering/DomainMeshFactory.js';
import { ClashOverlayManager } from './rendering/ClashOverlayManager.js';
import { SelectionHighlightManager } from './rendering/SelectionHighlightManager.js';
import { CameraTransitionManager } from './rendering/CameraTransitionManager.js';

export type { ComponentMeshFamily };

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
  private readonly gridManager: ArchitecturalGridManager;
  private readonly ambientLight: THREE.HemisphereLight;
  private readonly directionalLight: THREE.DirectionalLight;
  private readonly defaultMaterial: THREE.MeshStandardMaterial;
  private readonly highlightMaterial: THREE.MeshStandardMaterial;
  private readonly domainFactory: DomainMeshFactory;

  public get slabMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.slabMaterial; }
  public get stairMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.stairMaterial; }
  public get roofMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.roofMaterial; }
  public get sanitaryMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.sanitaryMaterial; }
  public get kitchenMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.kitchenMaterial; }
  public get furnitureMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.furnitureMaterial; }
  public get glazingMaterial(): THREE.MeshStandardMaterial { return this.domainFactory.glazingMaterial; }

  /**
   * Gestionnaires impératifs dédiés (ADR-072) : surbrillance, collisions, transitions.
   */
  private readonly clashOverlayManager: ClashOverlayManager;
  private readonly selectionHighlightManager: SelectionHighlightManager;

  /**
   * Gestionnaire impératif des maquettes IFC externes fédérées.
   */
  private readonly federatedManager: FederatedIfcManager = new FederatedIfcManager();

  /**
   * Gestionnaire des maillages architecturaux et arêtes fines (ADR-072).
   */
  private readonly meshManager: ArchitecturalMeshManager;
  private readonly meshes: Map<string, THREE.Mesh[]>;

  /**
   * Plan de coupe 3D actif (ADR-063).
   */
  private activeClippingPlane: THREE.Plane | null = null;

  /** Pipeline PBR : lumiere IBL, ombres, tonemapping (Lot 1). */
  private environmentManager: EnvironmentManager | null = null;
  /** Post-traitement AO (Lot 1). Compatible ADR-018. */
  private postProcessingManager: PostProcessingManager | null = null;
  /** Bouchons de coupe stencil (Lot 2). */
  private sectionCapManager: SectionCapManager | null = null;

  /** Indicateur d'invalidation par lot pour éviter les re-rendus redondants. */
  private isBatchUpdating = false;

  private readonly onControlsChange: () => void;
  private isDisposed = false;

  public constructor(canvas: HTMLCanvasElement, options?: Partial<SceneOptions>);
  public constructor(options: SceneOptions);
  public constructor(
    canvasOrOptions: HTMLCanvasElement | SceneOptions,
    maybeOptions?: Partial<SceneOptions>,
  ) {
    const isCanvas = canvasOrOptions && typeof canvasOrOptions === 'object' && 'getContext' in canvasOrOptions;
    const canvas = (isCanvas ? canvasOrOptions : (canvasOrOptions as SceneOptions).canvas) as HTMLCanvasElement;
    const options: Partial<SceneOptions> = isCanvas ? (maybeOptions ?? {}) : (canvasOrOptions as SceneOptions);

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
    this.gridManager = new ArchitecturalGridManager(this.scene, gridSize, gridDivisions);
    this.meshManager = new ArchitecturalMeshManager(this.scene);
    this.meshes = this.meshManager.getMeshesMap();
    this.clashOverlayManager = new ClashOverlayManager(this.scene);
    this.selectionHighlightManager = new SelectionHighlightManager();
    this.scene.add(this.federatedManager.getRootGroup());

    // 6. Contrôles orbitaux
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(camTarget.x, camTarget.y, camTarget.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.update();

    // 7. Matériaux partagés par défaut et de domaine (ADR-050, ADR-072)
    this.defaultMaterial = createDefaultMaterial();
    this.highlightMaterial = this.selectionHighlightManager.getHighlightMaterial();
    this.domainFactory = new DomainMeshFactory(this.renderer);

    // 8. Rendu à la demande sur interaction caméra
    // Compatible ADR-018 : pendant la rotation -> rendu direct, apres relachement -> AO plein
    this.onControlsChange = () => {
      if (this.postProcessingManager) {
        this.postProcessingManager.renderDirect();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    this.controls.addEventListener('change', this.onControlsChange);

    // Fin de rotation -> passe AO complete (80 ms de delai)
    this.controls.addEventListener('end', () => {
      if (this.postProcessingManager) {
        this.postProcessingManager.scheduleFullRender();
      }
    });

    // 9. Managers PBR (initialises en mode 'technique' par defaut)
    // Enveloppes dans try/catch : si l'env WebGL ne supporte pas RoomEnvironment
    // (ex. jsdom dans les tests Vitest), on degrade silencieusement.
    if (typeof window !== 'undefined') {
      try {
        this.environmentManager = new EnvironmentManager(this.renderer, this.scene);
        // Supprimer l'eclairage de base maintenant gere par EnvironmentManager
        this.scene.remove(this.ambientLight, this.directionalLight, this.directionalLight.target);
      } catch {
        // Degradation gracieuse (env test sans WebGL complet)
      }
      try {
        this.postProcessingManager = new PostProcessingManager(this.renderer, this.scene, this.camera);
        this.postProcessingManager.setRenderMode('technique');
      } catch {
        // Degradation gracieuse
      }
      try {
        this.sectionCapManager = new SectionCapManager(this.scene);
      } catch {
        // Degradation gracieuse
      }
    }

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
      this.domainFactory.isInternalMaterial(mat)
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
    const mesh = this.meshManager.addMesh(
      rawData,
      material ?? this.defaultMaterial,
      materialOptions,
      this.activeClippingPlane,
      this.sectionCapManager,
    );
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
    this.removeMesh(rawData.elementId);
    return this.addMesh(rawData, material, materialOptions);
  }

  /**
   * Met à jour en une seule opération atomique l'ensemble des maillages associés à un elementId.
   */
  public updateMeshBatch(
    elementId: string,
    rawDataList: readonly RawMeshData[],
    material?: THREE.Material,
  ): THREE.Mesh[] {
    if (this.isDisposed) {
      throw new Error('[Scene3D] Cannot update mesh batch on a disposed Scene3D instance.');
    }
    return this.batchUpdate(() => {
      this.removeMesh(elementId);
      if (rawDataList.length === 0) return [];
      return rawDataList.map((rawData) => this.addMesh(rawData, material));
    });
  }

  /**
   * Retire tous les maillages associés à un elementId et libère leur géométrie tampon.
   */
  public removeMesh(elementId: string): void {
    if (this.isDisposed) return;
    this.meshManager.removeMesh(
      elementId,
      this.sectionCapManager,
      (mat) => this.isInternalMaterial(mat),
    );
    this.render();
  }

  /**
   * Retourne tous les maillages associés à un elementId.
   */
  public getMeshes(elementId: string): readonly THREE.Mesh[] {
    return this.meshes.get(elementId) ?? [];
  }

  /**
   * Ajoute une dalle de sol de pièce dans la scène 3D.
   * Utilise les revêtements PBR texturés (parquet / carrelage) en mode réaliste,
   * ou un matériau pastel translucide en mode technique / écorché.
   */
  public addRoomMesh(roomId: string, rawMesh: RawMeshData): THREE.Mesh {
    const isRealistic = this.getRenderMode() === 'realiste';
    const material = this.domainFactory.getRoomMaterial(roomId, rawMesh, isRealistic);
    return this.addMesh({ ...rawMesh, elementId: roomId }, material);
  }

  /**
   * Met à jour la dalle de sol d'une pièce (libère l'ancienne géométrie et remplace le mesh).
   */
  public updateRoomMesh(roomId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(roomId);
    return this.addRoomMesh(roomId, rawMesh);
  }

  public addSlabMesh(slabId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(this.domainFactory.formatSlab(slabId, rawMesh), this.slabMaterial);
  }

  public updateSlabMesh(slabId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(slabId);
    return this.addSlabMesh(slabId, rawMesh);
  }

  public addStairMesh(stairId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(this.domainFactory.formatStair(stairId, rawMesh), this.stairMaterial);
  }

  public updateStairMesh(stairId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(stairId);
    return this.addStairMesh(stairId, rawMesh);
  }

  public removeStairMesh(stairId: string): void { this.removeMesh(stairId); }

  public addRoofMesh(roofId: string, rawMesh: RawMeshData): THREE.Mesh {
    return this.addMesh(this.domainFactory.formatRoof(roofId, rawMesh), this.roofMaterial);
  }

  public updateRoofMesh(roofId: string, rawMesh: RawMeshData): THREE.Mesh {
    this.removeMesh(roofId);
    return this.addRoofMesh(roofId, rawMesh);
  }

  public removeRoofMesh(roofId: string): void { this.removeMesh(roofId); }

  public addComponentMesh(
    componentId: string,
    rawMesh: RawMeshData,
    family: ComponentMeshFamily = 'furniture',
  ): THREE.Mesh {
    return this.addMesh(
      this.domainFactory.formatComponent(componentId, rawMesh, family),
      this.domainFactory.getComponentMaterial(family),
    );
  }

  public updateComponentMesh(
    componentId: string,
    rawMesh: RawMeshData,
    family: ComponentMeshFamily = 'furniture',
  ): THREE.Mesh {
    this.removeMesh(componentId);
    return this.addComponentMesh(componentId, rawMesh, family);
  }

  public removeComponentMesh(componentId: string): void { this.removeMesh(componentId); }

  public addMepMesh(
    elementId: string,
    rawMesh: RawMeshData,
    colorOrMaterial?: string | number | THREE.Material,
  ): THREE.Mesh {
    return this.addMesh(
      this.domainFactory.formatMep(elementId, rawMesh),
      this.domainFactory.getMepMaterial(rawMesh, colorOrMaterial),
    );
  }

  public updateMepMesh(
    elementId: string,
    rawMesh: RawMeshData,
    colorOrMaterial?: string | number | THREE.Material,
  ): THREE.Mesh {
    this.removeMesh(elementId);
    return this.addMepMesh(elementId, rawMesh, colorOrMaterial);
  }

  public removeMepMesh(elementId: string): void { this.removeMesh(elementId); }

  /**
   * Applique ou retire la surbrillance de sélection sur les éléments spécifiés.
   * Bascule le matériau entre son matériau de base (ou defaultMaterial) et highlightMaterial (#2563eb).
   *
   * @param ids Ensemble d'identifiants d'éléments architecturaux à surligner
   */
  public setHighlight(ids: Iterable<string>): void {
    if (this.isDisposed) return;
    this.selectionHighlightManager.setHighlight(ids, this.meshes, this.defaultMaterial);
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
    return this.meshManager.raycastNDC(ndcX, ndcY, this.camera, this.activeClippingPlane);
  }

  /**
   * Efface et libère tous les volumes et repères de surimpression de collisions.
   */
  public clearClashOverlays(): void {
    if (this.isDisposed) return;
    this.clashOverlayManager.clear();
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
    this.clashOverlayManager.setClashOverlays(clashes);
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
    CameraTransitionManager.focusOnPoint(this.camera, this.controls, point, distance);
    this.render();
  }

  /**
   * Cadre tous les maillages du modèle dans le viewport.
   * Retourne false si aucun maillage n'est présent.
   */
  public zoomToFit(): boolean {
    if (this.isDisposed) return false;
    const bounds = this.meshManager.computeBounds();
    const res = CameraTransitionManager.zoomToFit(this.camera, this.controls, bounds);
    if (res) this.render();
    return res;
  }

  /**
   * Ajoute ou met à jour une maquette IFC fédérée dans la scène 3D.
   */
  public addFederatedModel(model: FederatedModelVisual): void {
    if (this.isDisposed) return;
    this.federatedManager.addModel(model);
    this.render();
  }

  public removeFederatedModel(modelId: string): void {
    if (this.isDisposed) return;
    this.federatedManager.removeModel(modelId);
    this.render();
  }

  public setFederatedModelVisibility(modelId: string, visible: boolean): void {
    if (this.isDisposed) return;
    this.federatedManager.setVisibility(modelId, visible);
    this.render();
  }

  public setFederatedModelOpacity(modelId: string, opacity: number): void {
    if (this.isDisposed) return;
    this.federatedManager.setOpacity(modelId, opacity);
    this.render();
  }

  public setFederatedModelWireframe(modelId: string, wireframe: boolean): void {
    if (this.isDisposed) return;
    this.federatedManager.setWireframe(modelId, wireframe);
    this.render();
  }

  public setFederatedModelOffset(modelId: string, offset: { x: number; y: number; z: number }): void {
    if (this.isDisposed) return;
    this.federatedManager.setOffset(modelId, offset);
    this.render();
  }

  public setFederatedSelection(modelId: string | null, expressId: number | null): void {
    if (this.isDisposed) return;
    this.federatedManager.setSelectedEntity(modelId, expressId);
    this.render();
  }

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
    return this.meshManager.getMeshCount();
  }

  /**
   * Exécute un lot de modifications géométriques sans déclencher de rendu intermédiaire.
   * Le rendu final n'est invoqué qu'une seule fois à la fin du callback.
   */
  public batchUpdate<T>(callback: () => T): T {
    const wasBatching = this.isBatchUpdating;
    this.isBatchUpdating = true;
    try {
      return callback();
    } finally {
      this.isBatchUpdating = wasBatching;
      if (!wasBatching) {
        this.render();
      }
    }
  }

  /**
   * Rendu unitaire à la demande.
   */
  public render(): void {
    if (this.isDisposed || this.isBatchUpdating) return;
    if (this.postProcessingManager) {
      this.postProcessingManager.renderFull();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Modifie le fond de la scène et les couleurs de la grille.
   */
  public setBackground(
    background: THREE.ColorRepresentation,
    gridColors: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation],
  ): void {
    if (this.isDisposed) return;
    this.gridManager.setBackground(this.scene, background, gridColors);
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
    if (this.postProcessingManager) {
      this.postProcessingManager.setSize(width, height);
    }
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
    this.meshManager.applyClippingPlanes(planes);

    // 3. Propagation aux maquettes IFC de référence fédérées
    this.federatedManager.setClippingPlanes(planes);

    // 4. Propagation aux matériaux internes partagés
    const sharedMaterials = [
      this.defaultMaterial,
      this.highlightMaterial,
      ...this.domainFactory.getSharedMaterials(),
    ];
    for (const mat of sharedMaterials) {
      mat.clippingPlanes = planes;
      mat.clipShadows = true;
    }

    // 5. Propagation aux bouchons de coupe stencil
    this.sectionCapManager?.setClippingPlane(plane);

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
    this.setSectionCutPlane(SectionCapManager.computeCutPlane(start, end, viewDirection));
  }

  /**
   * Définit le mode de rendu d'affichage (ADR-072) :
   * - 'technique' : fond ardoise neutre, arêtes nettes, éclairage standard sans AO
   * - 'ecorche' : fond sombre studio, bouchons de coupe stencils visibles, contraste MEP
   * - 'realiste' : pipeline PBR avec IBL RoomEnvironment et occlusion ambiante temps réel
   */
  public setRenderMode(mode: RenderMode): void {
    if (this.isDisposed) return;
    this.environmentManager?.setRenderMode(mode);
    if (this.postProcessingManager) {
      this.postProcessingManager.setRenderMode(mode);
    }
    if (mode === 'ecorche') {
      this.setBackground(0x181a1f, [0x303642, 0x222730]);
    } else if (mode === 'realiste') {
      this.setBackground(0x20242c, [0x444c5c, 0x2c3340]);
    } else {
      this.setBackground(0x262a33, [0x566070, 0x3a404c]);
    }
    this.render();
  }

  public getRenderMode(): RenderMode {
    return this.postProcessingManager ? this.postProcessingManager.getRenderMode() : 'technique';
  }

  /**
   * Règle l'ensoleillement selon l'heure du jour (0-24h).
   */
  public setSunHour(hour: number): void {
    if (this.isDisposed) return;
    this.environmentManager?.setSunHour(hour);
    this.render();
  }

  /**
   * Calibre automatiquement la caméra d'ombre sur la boîte englobante de la maquette.
   */
  public fitShadowsToScene(): void {
    if (this.isDisposed || !this.environmentManager) return;
    const box = this.meshManager.computeBounds();
    if (!box.isEmpty()) {
      this.environmentManager.fitShadowCameraToBounds(box);
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

    // 2. Nettoyer et libérer tous les maillages architecturaux (ADR-072)
    this.meshManager.dispose((mat) => this.isInternalMaterial(mat));

    // 3. Libérer la grille de sol
    this.gridManager.dispose(this.scene);

    // 4. Libérer les superpositions de collision et surbrillances (ADR-072)
    this.clashOverlayManager.dispose();
    this.selectionHighlightManager.dispose();

    // 4b. Libérer les maquettes IFC fédérées
    this.federatedManager.dispose();
    this.scene.remove(this.federatedManager.getRootGroup());

    // 4c. Libérer les gestionnaires de rendu PBR et caps (ADR-072)
    this.sectionCapManager?.dispose();
    this.sectionCapManager = null;
    this.postProcessingManager?.dispose();
    this.postProcessingManager = null;
    this.environmentManager?.dispose();
    this.environmentManager = null;

    // 5. Libérer les matériaux gérés
    this.defaultMaterial.dispose();
    this.highlightMaterial.dispose();
    this.domainFactory.dispose();

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
