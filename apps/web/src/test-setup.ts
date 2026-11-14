import { vi } from 'vitest';

export class MockWebGLRenderer {
  public domElement: HTMLCanvasElement;
  public setSize = vi.fn();
  public setPixelRatio = vi.fn();
  public render = vi.fn();
  public dispose = vi.fn();
  public clear = vi.fn();
  public clearColor = vi.fn();
  public clearDepth = vi.fn();
  public clearStencil = vi.fn();
  public getPixelRatio = vi.fn(() => 1);
  public getContext = vi.fn(() => null);

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
  };

  public info = {
    render: { calls: 0, frame: 0, lines: 0, points: 0, triangles: 0 },
    memory: { geometries: 0, textures: 0 },
  };

  public shadowMap = {
    enabled: false,
    type: 1,
  };

  public constructor(parameters?: { canvas?: HTMLCanvasElement }) {
    this.domElement = parameters?.canvas ?? (document.createElement('canvas') as HTMLCanvasElement);
  }
}

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// Mock Canvas 2D pour jsdom
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((id: string) => {
  if (id === '2d') {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
    } as unknown as CanvasRenderingContext2D;
  }
  return null;
});

HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
} as DOMRect);
