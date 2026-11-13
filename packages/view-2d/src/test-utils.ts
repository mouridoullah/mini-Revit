import { vi } from 'vitest';

export interface MockCanvasCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface MockCanvasContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly calls: MockCanvasCall[];
  readonly clearCalls: () => void;
  readonly filterCalls: (method: string) => MockCanvasCall[];
}

/**
 * Crée un mock de contexte CanvasRenderingContext2D pour environnement de test headless Vitest/jsdom.
 */
export function createMockCanvas(
  width: number = 800,
  height: number = 600,
): {
  readonly canvas: HTMLCanvasElement;
  readonly mock: MockCanvasContext;
} {
  const calls: MockCanvasCall[] = [];

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };

  const lineDash: number[] = [];

  const mockCtx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter' as CanvasLineJoin,

    save: vi.fn(() => record('save', [])),
    restore: vi.fn(() => record('restore', [])),
    beginPath: vi.fn(() => record('beginPath', [])),
    closePath: vi.fn(() => record('closePath', [])),
    moveTo: vi.fn((x: number, y: number) => record('moveTo', [x, y])),
    lineTo: vi.fn((x: number, y: number) => record('lineTo', [x, y])),
    stroke: vi.fn(() => record('stroke', [])),
    fill: vi.fn(() => record('fill', [])),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
      record('fillRect', [x, y, w, h]),
    ),
    clearRect: vi.fn((x: number, y: number, w: number, h: number) =>
      record('clearRect', [x, y, w, h]),
    ),
    setLineDash: vi.fn((segments: number[]) => {
      lineDash.length = 0;
      lineDash.push(...segments);
      record('setLineDash', [segments]);
    }),
    getLineDash: vi.fn(() => [...lineDash]),
  } as unknown as CanvasRenderingContext2D;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  canvas.getContext = ((contextId: string) => {
    if (contextId === '2d') {
      return mockCtx;
    }
    return null;
  }) as unknown as typeof canvas.getContext;

  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect;

  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();

  const mock: MockCanvasContext = {
    ctx: mockCtx,
    calls,
    clearCalls: () => {
      calls.length = 0;
    },
    filterCalls: (method: string) => calls.filter((c) => c.method === method),
  };

  return { canvas, mock };
}
