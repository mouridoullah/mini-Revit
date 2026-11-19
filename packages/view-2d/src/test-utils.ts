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
    globalAlpha: 1.0,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,

    save: vi.fn(() => {
      record('save', []);
    }),

    restore: vi.fn(() => {
      record('restore', []);
    }),

    translate: vi.fn((x: number, y: number) => {
      assertFiniteNumber(x, 'x', 'translate');
      assertFiniteNumber(y, 'y', 'translate');
      record('translate', [x, y]);
    }),

    scale: vi.fn((x: number, y: number) => {
      assertFiniteNumber(x, 'x', 'scale');
      assertFiniteNumber(y, 'y', 'scale');
      record('scale', [x, y]);
    }),

    rotate: vi.fn((angle: number) => {
      assertFiniteNumber(angle, 'angle', 'rotate');
      record('rotate', [angle]);
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

    setTransform: vi.fn(
      (
        a?: number | DOMMatrix2DInit,
        b?: number,
        c?: number,
        d?: number,
        e?: number,
        f?: number,
      ) => {
        record('setTransform', [a, b, c, d, e, f]);
      },
    ),

    stroke: vi.fn((path?: Path2D) => {
      record('stroke', path ? [path] : []);
    }),

    fill: vi.fn((fillRule?: CanvasFillRule) => {
      record('fill', fillRule ? [fillRule] : []);
    }),

    clip: vi.fn((fillRule?: CanvasFillRule) => {
      record('clip', fillRule ? [fillRule] : []);
    }),

    fillText: vi.fn((text: string, x: number, y: number, maxWidth?: number) => {
      assertFiniteNumber(x, 'x', 'fillText');
      assertFiniteNumber(y, 'y', 'fillText');
      record('fillText', [text, x, y, maxWidth]);
    }),

    arc: vi.fn(
      (
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        counterclockwise: boolean = false,
      ) => {
        assertFiniteNumber(x, 'x', 'arc');
        assertFiniteNumber(y, 'y', 'arc');
        assertFiniteNumber(radius, 'radius', 'arc');
        assertFiniteNumber(startAngle, 'startAngle', 'arc');
        assertFiniteNumber(endAngle, 'endAngle', 'arc');
        record('arc', [x, y, radius, startAngle, endAngle, counterclockwise]);
      },
    ),

    ellipse: vi.fn(
      (
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
        counterclockwise: boolean = false,
      ) => {
        assertFiniteNumber(x, 'x', 'ellipse');
        assertFiniteNumber(y, 'y', 'ellipse');
        assertFiniteNumber(radiusX, 'radiusX', 'ellipse');
        assertFiniteNumber(radiusY, 'radiusY', 'ellipse');
        assertFiniteNumber(rotation, 'rotation', 'ellipse');
        assertFiniteNumber(startAngle, 'startAngle', 'ellipse');
        assertFiniteNumber(endAngle, 'endAngle', 'ellipse');
        record('ellipse', [x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise]);
      },
    ),

    rect: vi.fn((x: number, y: number, w: number, h: number) => {
      assertFiniteNumber(x, 'x', 'rect');
      assertFiniteNumber(y, 'y', 'rect');
      assertFiniteNumber(w, 'width', 'rect');
      assertFiniteNumber(h, 'height', 'rect');
      record('rect', [x, y, w, h]);
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

    measureText: vi.fn((text: string) => {
      record('measureText', [text]);
      return { width: text.length * 8 } as TextMetrics;
    }),
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

/**
 * Crée un mock Canvas ultra-léger et sans allocation d'historique d'appels,
 * spécialement calibré pour les bancs de performance et micro-benchmarks haute fréquence.
 */
export function createBenchmarkCanvas(
  width: number = 1920,
  height: number = 1080,
): {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
} {
  const mockCtx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1.0,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    clip: () => {},
    rect: () => {},
    arc: () => {},
    ellipse: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    fillText: () => {},
    strokeText: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
    measureText: (_text: string) => ({ width: 10 } as TextMetrics),
    canvas: { width, height } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width,
    height,
    getContext: () => mockCtx,
  } as unknown as HTMLCanvasElement;

  return { canvas, ctx: mockCtx };
}
