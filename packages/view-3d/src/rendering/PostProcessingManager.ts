/**
 * PostProcessingManager
 *
 * Pipeline post-traitement : EffectComposer + RenderPass + GTAOPass + OutputPass.
 *
 * Compatible ADR-018 (rendu à la demande) :
 * - Pendant la rotation orbitale (OrbitControls 'change') : on expose renderDirect()
 * - 80 ms après relâchement (OrbitControls 'end') : renderFull() (passe AO complète)
 *
 * Usage dans Scene3D :
 *   const pp = new PostProcessingManager(renderer, scene, camera);
 *   controls.addEventListener('change', () => pp.renderDirect());
 *   controls.addEventListener('end', () => pp.scheduleFullRender());
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/** Délai de relaxation avant la passe AO pleine résolution (ms). */
const AO_SETTLE_MS = 80;

export type RenderMode = 'technique' | 'ecorche' | 'realiste';

export class PostProcessingManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private aoPass: { dispose(): void; enabled: boolean } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentMode: RenderMode = 'technique';

  public constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    // StencilBuffer obligatoire sur le RenderTarget d'EffectComposer pour les bouchons de coupe (ADR-063)
    const renderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.width * pixelRatio)),
      Math.max(1, Math.floor(size.height * pixelRatio)),
      {
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: true,
      },
    );
    this.composer = new EffectComposer(renderer, renderTarget);
    this.composer.setSize(Math.max(1, size.width), Math.max(1, size.height));
    this.composer.addPass(new RenderPass(scene, camera));

    // Passe GTAO calibrée en millimètres
    this.tryAddAOPass();

    this.composer.addPass(new OutputPass());
  }

  private tryAddAOPass(): void {
    try {
      const { width, height } = this.renderer.getSize(new THREE.Vector2());
      const gtao = new GTAOPass(
        this.scene,
        this.camera,
        Math.max(1, width),
        Math.max(1, height),
      );
      // Calibration millimétrique Tabax (par défaut Three.js calibre ~0.25 m)
      gtao.updateGtaoMaterial({
        radius: 140,
        distanceExponent: 1.8,
        thickness: 120,
        scale: 1.15,
        samples: 16,
        screenSpaceRadius: false,
      });
      gtao.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 40,
        normalPhi: 3,
        radius: 8,
      });
      this.composer.addPass(gtao);
      this.aoPass = gtao;
    } catch {
      // GTAOPass non disponible dans un environnement WebGL incomplet (jsdom)
      this.aoPass = null;
    }
  }

  /**
   * Rendu direct (renderer brut) — utilisé pendant la rotation orbitale pour
   * un maximum de réactivité (ADR-018).
   */
  public renderDirect(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    if (this.aoPass) this.aoPass.enabled = false;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Planifie un rendu composer complet (avec AO) 80 ms après le relâchement des
   * contrôles orbitaux.
   */
  public scheduleFullRender(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.currentMode === 'realiste') {
        if (this.aoPass) this.aoPass.enabled = true;
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }, AO_SETTLE_MS);
  }

  /**
   * Rendu immédiat. En mode réaliste, passe par le composer (avec AO).
   * En modes technique et écorché, rendu direct ultra-rapide sans surcoût.
   */
  public renderFull(): void {
    if (this.currentMode === 'realiste') {
      if (this.aoPass) this.aoPass.enabled = true;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  public setRenderMode(mode: RenderMode): void {
    this.currentMode = mode;
    // En mode 'technique' et 'ecorche' on désactive l'AO (look dessin tech.)
    if (this.aoPass) {
      this.aoPass.enabled = mode === 'realiste';
    }
  }

  public getRenderMode(): RenderMode {
    return this.currentMode;
  }

  public dispose(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    if (this.aoPass) {
      this.aoPass.dispose();
      this.aoPass = null;
    }
    this.composer.dispose();
  }
}
