/**
 * SectionCapManager
 *
 * Gère les bouchons de coupe fermés par Stencil Buffer pour les volumes architecturaux.
 * Quand un plan de coupe est actif, les volumes tranchés affichent une face
 * solide gris anthracite (#1e222a) sur la surface de coupe exacte.
 *
 * Pipeline Stencil 2 passes (ADR-063 & ADR-072) :
 * 1. Passe 1 : Face arrière (BackSide) -> IncrementWrapStencilOp (renderOrder 1)
 * 2. Passe 2 : Face avant (FrontSide) -> DecrementWrapStencilOp (renderOrder 1)
 * 3. Passe 3 : Plan bouchon coplanaire -> test stencilRef !== 0, reset à 0 (renderOrder 2)
 *
 * Résultat : plan massif et net sans aucun vide intérieur ni z-fighting.
 */

import * as THREE from 'three';

export class SectionCapManager {
  private readonly scene: THREE.Scene;
  private readonly capGroup: THREE.Group = new THREE.Group();
  private readonly backStencilMaterial: THREE.MeshBasicMaterial;
  private readonly frontStencilMaterial: THREE.MeshBasicMaterial;
  private readonly capPlaneMaterial: THREE.MeshStandardMaterial;
  private readonly capPlaneMesh: THREE.Mesh;

  /** Map elementId -> paire de meshes stencil [backMesh, frontMesh] */
  private readonly caps: Map<string, [THREE.Mesh, THREE.Mesh]> = new Map();
  private activePlane: THREE.Plane | null = null;

  public static computeCutPlane(
    start: { readonly x: number; readonly y: number },
    end: { readonly x: number; readonly y: number },
    viewDirection: 1 | -1 = 1,
  ): THREE.Plane | null {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return null;
    const ux = dx / len;
    const uy = dy / len;
    const nx = viewDirection * -uy;
    const ny = viewDirection * ux;
    const normal = new THREE.Vector3(nx, ny, 0).normalize();
    const constant = -(nx * start.x + ny * start.y);
    return new THREE.Plane(normal, constant);
  }

  public constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Passe Stencil Face Arrière (Incrément)
    this.backStencilMaterial = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: true,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      side: THREE.BackSide,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.IncrementWrapStencilOp,
    });
    (this.backStencilMaterial as THREE.MeshBasicMaterial & { isSharedMaterial?: boolean }).isSharedMaterial = true;

    // 2. Passe Stencil Face Avant (Décrément)
    this.frontStencilMaterial = new THREE.MeshBasicMaterial({
      depthWrite: false,
      depthTest: true,
      colorWrite: false,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      side: THREE.FrontSide,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.DecrementWrapStencilOp,
    });
    (this.frontStencilMaterial as THREE.MeshBasicMaterial & { isSharedMaterial?: boolean }).isSharedMaterial = true;

    // 3. Plan bouchon coplanaire
    this.capPlaneMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e222a,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: 0,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ZeroStencilOp,
      stencilZFail: THREE.ZeroStencilOp,
      stencilZPass: THREE.ZeroStencilOp,
    });
    (this.capPlaneMaterial as THREE.MeshStandardMaterial & { isSharedMaterial?: boolean }).isSharedMaterial = true;

    // Géométrie du plan bouchon (200m x 200m pour englober tout bâtiment BIM)
    const planeGeo = new THREE.PlaneGeometry(200000, 200000);
    this.capPlaneMesh = new THREE.Mesh(planeGeo, this.capPlaneMaterial);
    this.capPlaneMesh.name = '__section_cap_plane__';
    this.capPlaneMesh.renderOrder = 2;
    this.capPlaneMesh.visible = false;

    this.capGroup.name = '__section_caps__';
    this.capGroup.renderOrder = 1;
    this.capGroup.visible = false;

    scene.add(this.capGroup);
    scene.add(this.capPlaneMesh);
  }

  /**
   * Active ou désactive le plan de coupe et positionne le plan bouchon.
   */
  public setClippingPlane(plane: THREE.Plane | null): void {
    this.activePlane = plane;
    const planes = plane ? [plane] : [];

    this.backStencilMaterial.clippingPlanes = planes;
    this.backStencilMaterial.needsUpdate = true;

    this.frontStencilMaterial.clippingPlanes = planes;
    this.frontStencilMaterial.needsUpdate = true;

    if (plane) {
      this.capGroup.visible = true;
      this.capPlaneMesh.visible = true;

      // Aligner le maillage plan bouchon sur le plan de coupe Three.js
      const normal = plane.normal.clone().normalize();
      this.capPlaneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.capPlaneMesh.position.copy(normal).multiplyScalar(-plane.constant);
    } else {
      this.capGroup.visible = false;
      this.capPlaneMesh.visible = false;
    }

    // Mettre à jour la visibilité et les clippingPlanes de chaque mesh stencil
    for (const [backMesh, frontMesh] of this.caps.values()) {
      backMesh.visible = plane !== null;
      frontMesh.visible = plane !== null;
    }
  }

  /**
   * Enregistre un mesh architectural et crée ses passes stencil jumelles.
   */
  public registerMesh(mesh: THREE.Mesh, elementId: string): void {
    const backMesh = new THREE.Mesh(mesh.geometry, this.backStencilMaterial);
    backMesh.name = `${elementId}--cap`;
    backMesh.position.copy(mesh.position);
    backMesh.rotation.copy(mesh.rotation);
    backMesh.scale.copy(mesh.scale);
    backMesh.renderOrder = 1;
    backMesh.visible = this.activePlane !== null;

    const frontMesh = new THREE.Mesh(mesh.geometry, this.frontStencilMaterial);
    frontMesh.name = `${elementId}--cap-front`;
    frontMesh.position.copy(mesh.position);
    frontMesh.rotation.copy(mesh.rotation);
    frontMesh.scale.copy(mesh.scale);
    frontMesh.renderOrder = 1;
    frontMesh.visible = this.activePlane !== null;

    this.capGroup.add(backMesh);
    this.capGroup.add(frontMesh);

    this.caps.set(elementId, [backMesh, frontMesh]);
  }

  /**
   * Supprime les maillages stencil associés à un elementId.
   */
  public unregisterMesh(elementId: string): void {
    const pair = this.caps.get(elementId);
    if (!pair) return;
    const [backMesh, frontMesh] = pair;
    this.capGroup.remove(backMesh);
    this.capGroup.remove(frontMesh);
    this.caps.delete(elementId);
  }

  /**
   * Retourne le maillage du plan bouchon pour inspection ou tests.
   */
  public getCapPlaneMesh(): THREE.Mesh {
    return this.capPlaneMesh;
  }

  /**
   * Retourne le matériau bouchon.
   */
  public getCapMaterial(): THREE.MeshStandardMaterial {
    return this.capPlaneMaterial;
  }

  public dispose(): void {
    this.scene.remove(this.capGroup);
    this.scene.remove(this.capPlaneMesh);
    this.capPlaneMesh.geometry.dispose();
    this.backStencilMaterial.dispose();
    this.frontStencilMaterial.dispose();
    this.capPlaneMaterial.dispose();
    this.caps.clear();
  }
}
