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

// Mock Canvas 2D et WebGL pour jsdom avec dimensions réelles
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((id: string) => {
  if (id === '2d') {
    return {
      canvas: null,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      fillText: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
      setTransform: vi.fn(),
      transform: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }
  if (id === 'webgl' || id === 'webgl2') {
    return {
      canvas: null,
      getExtension: vi.fn(() => null),
      getParameter: vi.fn(() => null),
      createBuffer: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
    } as unknown as WebGLRenderingContext;
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

// Mock des dimensions de conteneur DOM pour éviter les fallbacks 0x0 sous jsdom
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return 800;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {
    return 600;
  },
});

// Mock complet et contrôlable de ResizeObserver pour les tests
export class MockResizeObserver {
  public static instances: MockResizeObserver[] = [];
  public callback: ResizeObserverCallback;
  public observedElements: Set<Element> = new Set();
  public isDisconnected = false;

  public constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  public observe(target: Element): void {
    this.observedElements.add(target);
  }

  public unobserve(target: Element): void {
    this.observedElements.delete(target);
  }

  public disconnect(): void {
    this.isDisconnected = true;
    this.observedElements.clear();
  }

  public trigger(entries: Partial<ResizeObserverEntry>[]): void {
    if (this.isDisconnected) return;
    this.callback(entries as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock URL.createObjectURL and URL.revokeObjectURL for jsdom file downloads
if (typeof window !== 'undefined' && window.URL) {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  }
}
