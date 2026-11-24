import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { EnvironmentManager } from './EnvironmentManager.js';

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();

  class MockWebGLRenderer {
    public toneMapping = 0;
    public toneMappingExposure = 1;
    public outputColorSpace = '';
    public shadowMap = { enabled: false, type: 0 };
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
      getMaxAnisotropy: () => 16,
    };
    public info = {
      render: { calls: 0, frame: 0, lines: 0, points: 0, triangles: 0 },
      memory: { geometries: 0, textures: 0 },
    };
    public setSize = vi.fn();
    public setPixelRatio = vi.fn();
    public render = vi.fn();
    public dispose = vi.fn();
  }

  class MockPMREMGenerator {
    public compileEquirectangularShader = vi.fn();
    public fromScene = vi.fn(() => ({
      texture: new actual.Texture(),
    }));
    public dispose = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
    PMREMGenerator: MockPMREMGenerator,
  };
});

describe('EnvironmentManager (ADR-072)', () => {
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;

  beforeEach(() => {
    renderer = new THREE.WebGLRenderer();
    scene = new THREE.Scene();
  });

  it('initialise les paramètres PBR, le tonemapping et l environnement lumineux IBL', () => {
    const env = new EnvironmentManager(renderer, scene, { exposure: 1.1, shadowQuality: 'ultra' });
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.1);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(scene.environment).toBeDefined();

    // Vérifie la présence des lumières ajoutées
    const hasSun = scene.children.some((c) => c instanceof THREE.DirectionalLight);
    const hasSky = scene.children.some((c) => c instanceof THREE.HemisphereLight);
    const hasFloor = scene.children.some((c) => c.name === '__shadow_floor__');
    expect(hasSun).toBe(true);
    expect(hasSky).toBe(true);
    expect(hasFloor).toBe(true);

    env.dispose();
  });

  it('active les ombres dynamiques et le sol en mode réaliste, les désactive en mode technique', () => {
    const env = new EnvironmentManager(renderer, scene);
    env.setRenderMode('realiste');
    expect(renderer.shadowMap.enabled).toBe(true);

    env.setRenderMode('technique');
    expect(renderer.shadowMap.enabled).toBe(false);

    env.dispose();
  });

  it('calibre l orientation et l intensité solaire selon l heure (setSunHour)', () => {
    const env = new EnvironmentManager(renderer, scene);
    env.setSunHour(12); // Midi solaire
    const sun = scene.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(sun).toBeDefined();
    expect(sun.intensity).toBeGreaterThan(1.0);

    env.setSunHour(0); // Nuit
    expect(sun.intensity).toBeLessThan(1.0);

    env.dispose();
  });

  it('calibre la caméra d ombre sur la boîte englobante de la scène (fitShadowCameraToBounds)', () => {
    const env = new EnvironmentManager(renderer, scene);
    const box = new THREE.Box3(new THREE.Vector3(-5000, -5000, 0), new THREE.Vector3(5000, 5000, 3000));
    env.fitShadowCameraToBounds(box);

    const sun = scene.children.find((c) => c instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    expect(sun.shadow.camera.left).toBeLessThan(0);
    expect(sun.shadow.camera.right).toBeGreaterThan(0);

    env.dispose();
  });

  it('libère proprement toutes les ressources GPU lors du dispose()', () => {
    const env = new EnvironmentManager(renderer, scene);
    env.dispose();
    expect(scene.children.length).toBe(0);
    expect(scene.environment).toBeNull();
  });
});
