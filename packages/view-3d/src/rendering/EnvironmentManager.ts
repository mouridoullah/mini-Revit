/**
 * EnvironmentManager
 *
 * Configure le pipeline lumière/IBL/ombres PBR de la scène Three.js.
 * - ACESFilmicToneMapping + SRGBColorSpace
 * - PMREMGenerator + RoomEnvironment (IBL sans HDR externe)
 * - Lumière solaire directionnelle orientable + HemisphereLight ciel/sol
 * - Ombres PCFSoftShadowMap 4096×4096 (Ultra) / 2048×2048 (Standard)
 * - Sol studio ShadowMaterial sous Z=0
 *
 * Compatible ADR-018 (rendu à la demande) : n'émet aucun requestAnimationFrame.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ShadowQuality = 'standard' | 'ultra';

export interface EnvironmentManagerOptions {
  /** Qualité des shadow maps. Par défaut 'ultra'. */
  shadowQuality?: ShadowQuality;
  /** Exposition tonemapping. Par défaut 1.05. */
  exposure?: number;
}

export class EnvironmentManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.HemisphereLight;
  private readonly shadowFloor: THREE.Mesh;
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  public constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    options: EnvironmentManagerOptions = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;

    const exposure = options.exposure ?? 1.05;
    const quality = options.shadowQuality ?? 'ultra';
    const shadowMapSize = quality === 'ultra' ? 4096 : 2048;

    // Tonemapping et espace colorimétrique
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Ombres initialisées mais désactivées par défaut (mode technique léger)
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // IBL : RoomEnvironment via PMREMGenerator
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();
    const envTexture = this.pmremGenerator.fromScene(new RoomEnvironment()).texture;
    scene.environment = envTexture;

    // Lumière hémisphérique ciel/sol douce
    this.sky = new THREE.HemisphereLight(0xddeeff, 0x334455, 0.6);
    scene.add(this.sky);

    // Lumière solaire directionnelle
    this.sun = new THREE.DirectionalLight(0xfffaee, 1.8);
    this.sun.position.set(15000, -20000, 25000);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.camera.near = 100;
    this.sun.shadow.camera.far = 200000;
    this.sun.shadow.camera.left = -30000;
    this.sun.shadow.camera.right = 30000;
    this.sun.shadow.camera.top = 30000;
    this.sun.shadow.camera.bottom = -30000;
    this.sun.shadow.normalBias = 2.0;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Sol studio récepteur d'ombres sous Z=0
    const floorGeo = new THREE.PlaneGeometry(100000, 100000);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.18, transparent: true });
    this.shadowFloor = new THREE.Mesh(floorGeo, floorMat);
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.z = -1;
    this.shadowFloor.receiveShadow = true;
    this.shadowFloor.visible = false;
    this.shadowFloor.name = '__shadow_floor__';
    scene.add(this.shadowFloor);
  }

  /**
   * Active ou désactive les ombres et éléments de sol selon le mode de rendu.
   */
  public setRenderMode(mode: 'technique' | 'ecorche' | 'realiste'): void {
    const isRealiste = mode === 'realiste';
    this.renderer.shadowMap.enabled = isRealiste;
    this.sun.castShadow = isRealiste;
    this.shadowFloor.visible = isRealiste;
  }

  /**
   * Oriente le soleil à partir de l'heure du jour (0–24h).
   * L'azimut tourne de 0 (Est) à 2π (Est à nouveau) sur 24h.
   */
  public setSunHour(hour: number): void {
    const angle = ((hour - 6) / 12) * Math.PI; // midi = zénith approx
    const elevation = Math.max(0, Math.sin(angle));
    const azimuth = (hour / 24) * Math.PI * 2;
    const dist = 25000;
    this.sun.position.set(
      dist * Math.cos(azimuth),
      dist * Math.sin(azimuth),
      dist * elevation + 5000,
    );
    this.sun.intensity = 0.5 + 1.3 * elevation;
  }

  /**
   * Ajuste le frustum orthographique de l'ombre pour couvrir la boîte du bâtiment.
   */
  public fitShadowCameraToBounds(box: THREE.Box3): void {
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const halfDiag = Math.max(size.x, size.y, size.z) * 0.6;
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = -halfDiag;
    cam.right = halfDiag;
    cam.top = halfDiag;
    cam.bottom = -halfDiag;
    cam.updateProjectionMatrix();
  }

  public dispose(): void {
    this.scene.remove(this.sun, this.sun.target, this.sky, this.shadowFloor);
    this.sun.dispose();
    this.sky.dispose();
    this.shadowFloor.geometry.dispose();
    (this.shadowFloor.material as THREE.Material).dispose();
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }
    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }
  }
}
