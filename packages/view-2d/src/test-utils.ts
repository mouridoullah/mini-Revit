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
 * Validateur d'arguments numériques finis conforme à la spécification W3C HTML Canvas 2D Context.
 */
function assertFiniteNumber(val: unknown, paramName: string, method: string): void {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new TypeError(
      `CanvasRenderingContext2D.${method}: Le paramètre '${paramName}' doit être un nombre fini (reçu : ${String(val)})`,
    );
  }
}

/**
 * Crée un mock robuste de contexte CanvasRenderingContext2D avec validation stricte
 * des signatures et types de paramètres (détection des NaN, undefined et arguments non finis).
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

    save: vi.fn(() => {
      record('save', []);
    }),

    restore: vi.fn(() => {
      record('restore', []);
    }),

    beginPath: vi.fn(() => {
      record('beginPath', []);
    }),

    closePath: vi.fn(() => {
      record('closePath', []);
    }),

    moveTo: vi.fn((x: number, y: number) => {
      assertFiniteNumber(x, 'x', 'moveTo');
      assertFiniteNumber(y, 'y', 'moveTo');
      record('moveTo', [x, y]);
    }),

    lineTo: vi.fn((x: number, y: number) => {
      assertFiniteNumber(x, 'x', 'lineTo');
      assertFiniteNumber(y, 'y', 'lineTo');
      record('lineTo', [x, y]);
    }),

    stroke: vi.fn(() => {
      record('stroke', []);
    }),

    fill: vi.fn(() => {
      record('fill', []);
    }),

    arc: vi.fn((x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
      assertFiniteNumber(x, 'x', 'arc');
      assertFiniteNumber(y, 'y', 'arc');
      assertFiniteNumber(radius, 'radius', 'arc');
      assertFiniteNumber(startAngle, 'startAngle', 'arc');
      assertFiniteNumber(endAngle, 'endAngle', 'arc');
      record('arc', [x, y, radius, startAngle, endAngle]);
    }),

    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFiniteNumber(x, 'x', 'strokeRect');
      assertFiniteNumber(y, 'y', 'strokeRect');
      assertFiniteNumber(w, 'width', 'strokeRect');
      assertFiniteNumber(h, 'height', 'strokeRect');
      record('strokeRect', [x, y, w, h]);
    }),

    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFiniteNumber(x, 'x', 'fillRect');
      assertFiniteNumber(y, 'y', 'fillRect');
      assertFiniteNumber(w, 'width', 'fillRect');
      assertFiniteNumber(h, 'height', 'fillRect');
      if (w < 0 || h < 0) {
        throw new RangeError(
          `CanvasRenderingContext2D.fillRect: width et height doivent être >= 0 (reçu: ${w}x${h})`,
        );
      }
      record('fillRect', [x, y, w, h]);
    }),

    clearRect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFiniteNumber(x, 'x', 'clearRect');
      assertFiniteNumber(y, 'y', 'clearRect');
      assertFiniteNumber(w, 'width', 'clearRect');
      assertFiniteNumber(h, 'height', 'clearRect');
      record('clearRect', [x, y, w, h]);
    }),

    setLineDash: vi.fn((segments: number[]) => {
      if (!Array.isArray(segments)) {
        throw new TypeError(
          'CanvasRenderingContext2D.setLineDash: Le paramètre doit être un tableau.',
        );
      }
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (typeof seg !== 'number' || !Number.isFinite(seg) || seg < 0) {
          throw new TypeError(
            `CanvasRenderingContext2D.setLineDash: Chaque segment doit être un nombre fini positif (reçu: ${String(seg)})`,
          );
        }
      }
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
