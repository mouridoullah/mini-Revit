function assertArgCount(
  method: string,
  actualCount: number,
  expectedCount: number,
  optionalCount: number = 0,
): void {
  const min = expectedCount - optionalCount;
  if (actualCount < min) {
    throw new TypeError(
      `Failed to execute '${method}' on 'Path2D': ${min} argument${min > 1 ? 's' : ''} required, but only ${actualCount} present.`,
    );
  }
}

function assertFiniteArgs(method: string, ...args: number[]): void {
  for (let i = 0; i < args.length; i++) {
    if (!Number.isFinite(args[i])) {
      throw new TypeError(
        `Failed to execute '${method}' on 'Path2D': The provided float value is non-finite.`,
      );
    }
  }
}

/**
 * Implémentation de repli légère, inspectable et validante de Path2D
 * pour les environnements de test headless (Node.js/JSDOM).
 * Valide strictement l'arité et la finitude des coordonnées (refuse NaN / Infinity).
 */
export class MockPath2D {
  public readonly ops: Array<{ method: string; args: readonly unknown[] }> = [];

  public moveTo(...args: [number, number]): void {
    assertArgCount('moveTo', arguments.length, 2);
    const [x, y] = args;
    assertFiniteArgs('moveTo', x, y);
    this.ops.push({ method: 'moveTo', args: [x, y] });
  }

  public lineTo(...args: [number, number]): void {
    assertArgCount('lineTo', arguments.length, 2);
    const [x, y] = args;
    assertFiniteArgs('lineTo', x, y);
    this.ops.push({ method: 'lineTo', args: [x, y] });
  }

  public closePath(): void {
    this.ops.push({ method: 'closePath', args: [] });
  }

  public arc(
    ...args: [number, number, number, number, number, boolean?]
  ): void {
    assertArgCount('arc', arguments.length, 6, 1);
    const [x, y, radius, startAngle, endAngle, counterclockwise] = args;
    assertFiniteArgs('arc', x, y, radius, startAngle, endAngle);
    if (radius < 0) {
      throw new TypeError(
        "Failed to execute 'arc' on 'Path2D': The radius provided is negative.",
      );
    }
    this.ops.push({
      method: 'arc',
      args: [x, y, radius, startAngle, endAngle, counterclockwise ?? false],
    });
  }

  public rect(...args: [number, number, number, number]): void {
    assertArgCount('rect', arguments.length, 4);
    const [x, y, w, h] = args;
    assertFiniteArgs('rect', x, y, w, h);
    this.ops.push({ method: 'rect', args: [x, y, w, h] });
  }

  public addPath(...args: [unknown, unknown?]): void {
    assertArgCount('addPath', arguments.length, 2, 1);
    const [path, transform] = args;
    if (!path) {
      throw new TypeError(
        "Failed to execute 'addPath' on 'Path2D': 1 argument required, but only 0 present.",
      );
    }
    this.ops.push({ method: 'addPath', args: [path, transform] });
  }
}
