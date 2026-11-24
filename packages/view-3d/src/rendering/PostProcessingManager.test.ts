import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PostProcessingManager } from './PostProcessingManager.js';

describe('PostProcessingManager (ADR-018 & ADR-072)', () => {
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    renderer = {
      render: vi.fn(),
      getSize: vi.fn((target: THREE.Vector2) => target.set(800, 600)),
      getPixelRatio: vi.fn(() => 1),
      capabilities: {
        isWebGL2: true,
      },
    } as unknown as THREE.WebGLRenderer;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 800 / 600, 10, 100000);
  });

  it('initialise les passes et démarre en mode technique', () => {
    const pp = new PostProcessingManager(renderer, scene, camera);
    expect(pp.getRenderMode()).toBe('technique');

    pp.setRenderMode('realiste');
    expect(pp.getRenderMode()).toBe('realiste');

    pp.setRenderMode('ecorche');
    expect(pp.getRenderMode()).toBe('ecorche');

    pp.dispose();
  });

  it('renderDirect exécute un rendu immédiat sans passer par l AO pour la réactivité orbitale (ADR-018)', () => {
    const pp = new PostProcessingManager(renderer, scene, camera);
    pp.renderDirect();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    pp.dispose();
  });

  it('scheduleFullRender programme un rendu après délai de stabilisation', async () => {
    vi.useFakeTimers();
    const pp = new PostProcessingManager(renderer, scene, camera);
    pp.setRenderMode('technique');

    pp.scheduleFullRender();
    expect(renderer.render).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(renderer.render).toHaveBeenCalled();

    vi.useRealTimers();
    pp.dispose();
  });
});
