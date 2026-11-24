import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { getProceduralTextures, disposeProceduralTextures } from './ProceduralTextures.js';

describe('ProceduralTextures (ADR-072)', () => {
  let mockRenderer: THREE.WebGLRenderer;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    mockRenderer = {
      capabilities: {
        getMaxAnisotropy: () => 16,
      },
    } as unknown as THREE.WebGLRenderer;

    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
    };

    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx) as never;
    disposeProceduralTextures();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    disposeProceduralTextures();
  });

  it('génère et met en cache l ensemble des 6 textures PBR architecturales', () => {
    const textures = getProceduralTextures(mockRenderer);
    expect(textures).toBeDefined();
    expect(textures.enduit).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.beton).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.parquet).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.carrelage).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.toleGalva).toBeInstanceOf(THREE.CanvasTexture);
    expect(textures.bois).toBeInstanceOf(THREE.CanvasTexture);

    // Vérifie le wrapping et l'anisotropie
    expect(textures.parquet.wrapS).toBe(THREE.RepeatWrapping);
    expect(textures.parquet.wrapT).toBe(THREE.RepeatWrapping);
    expect(textures.parquet.anisotropy).toBe(16);

    // Vérifie la mise en cache (singleton)
    const textures2 = getProceduralTextures(mockRenderer);
    expect(textures2).toBe(textures);
  });

  it('libère proprement toutes les textures lors de disposeProceduralTextures()', () => {
    const textures = getProceduralTextures(mockRenderer);
    const disposeSpies = Object.values(textures).map((tex) => vi.spyOn(tex, 'dispose'));

    disposeProceduralTextures();
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalled());

    // Après libération, un nouvel appel génère un nouveau jeu
    const texturesNew = getProceduralTextures(mockRenderer);
    expect(texturesNew).not.toBe(textures);
  });
});
