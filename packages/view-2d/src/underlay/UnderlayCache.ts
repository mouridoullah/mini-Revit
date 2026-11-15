import { type Vec2, vec2, computeWallFootprint2d } from '@mini-bim/geometry';

/**
 * Données d'un mur pour la compilation de la vue fantôme (underlay).
 */
export interface WallForUnderlay {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly thickness: number;
}

/**
 * Données d'une porte pour la compilation de la vue fantôme (underlay).
 */
export interface DoorForUnderlay {
  readonly id: string;
  readonly hostWallId: string;
  readonly offsetAlong: number;
  readonly width: number;
  readonly swing?: {
    readonly side: 'left' | 'right';
    readonly direction: 'in' | 'out';
  };
}

/**
 * Données d'une fenêtre pour la compilation de la vue fantôme (underlay).
 */
export interface WindowForUnderlay {
  readonly id: string;
  readonly hostWallId: string;
  readonly offsetAlong: number;
  readonly width: number;
}

/**
 * Entrée normalisée pour la compilation du cache vectoriel Path2D d'un niveau en underlay.
 */
export interface StairForUnderlay {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly width: number;
  readonly numberOfSteps?: number;
}

export interface UnderlayInput {
  readonly levelId: string;
  readonly walls: readonly WallForUnderlay[];
  readonly doors?: readonly DoorForUnderlay[];
  readonly windows?: readonly WindowForUnderlay[];
  readonly stairs?: readonly StairForUnderlay[];
}

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

/**
 * Crée une nouvelle instance de Path2D (native du navigateur ou MockPath2D en environnement headless).
 */
export function createUnderlayPath(): Path2D {
  if (typeof globalThis.Path2D !== 'undefined') {
    return new (globalThis.Path2D as unknown as { new (): Path2D })();
  }
  return new MockPath2D() as unknown as Path2D;
}

interface CachedUnderlayEntry {
  readonly path: Path2D;
  readonly elementIds: ReadonlySet<string>;
}

/**
 * Gestionnaire pur de cache vectoriel Path2D pour la vue fantôme (Underlay).
 * Conforme à ADR-047 (D1 = Option β, D2 = Option α, D3 = Option α).
 */
export class UnderlayCache {
  private readonly cache = new Map<string, CachedUnderlayEntry>();
  private hitCount: number = 0;
  private missCount: number = 0;

  /**
   * Compile un Path2D composé pour le niveau donné (murs + portes + fenêtres en coordonnées monde).
   */
  public compile(input: UnderlayInput): Path2D {
    if (!input || typeof input.levelId !== 'string' || input.levelId.trim() === '') {
      throw new TypeError("UnderlayCache.compile: 'input.levelId' must be a non-empty string.");
    }

    const path = createUnderlayPath();
    const wallMap = new Map<string, WallForUnderlay>();

    // 1. Empreintes 2D des murs
    for (const wall of input.walls) {
      wallMap.set(wall.id, wall);
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-4 || wall.thickness <= 0) continue;

      try {
        const footprint = computeWallFootprint2d({
          start: wall.start,
          end: wall.end,
          thickness: wall.thickness,
          locationLine: 'center',
        });
        const v = footprint.vertices;
        path.moveTo(v[0].x, v[0].y);
        path.lineTo(v[1].x, v[1].y);
        path.lineTo(v[2].x, v[2].y);
        path.lineTo(v[3].x, v[3].y);
        path.closePath();
      } catch {
        // Ignorer les éventuels segments singuliers dégénérés
      }
    }

    // 2. Portes hébergées (battant à 90° et arc de débattement)
    for (const door of input.doors ?? []) {
      const wall = wallMap.get(door.hostWallId);
      if (!wall) continue;

      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-4) continue;

      const ux = dx / len;
      const uy = dy / len;
      const vx = -uy;
      const vy = ux;

      const doorWidth = door.width > 0 ? door.width : 900;
      const u0 = door.offsetAlong;
      const u1 = door.offsetAlong + doorWidth;

      const isLeft = (door.swing?.side ?? 'left') === 'left';
      const dirSign = (door.swing?.direction ?? 'in') === 'in' ? 1 : -1;
      const hingeU = isLeft ? u0 : u1;
      const latchU = isLeft ? u1 : u0;

      const hinge = vec2(wall.start.x + ux * hingeU, wall.start.y + uy * hingeU);
      const closed = vec2(wall.start.x + ux * latchU, wall.start.y + uy * latchU);
      const open = vec2(
        hinge.x + (isLeft ? vx : -vx) * dirSign * doorWidth,
        hinge.y + (isLeft ? vy : -vy) * dirSign * doorWidth,
      );

      // Trait du battant ouvert
      path.moveTo(hinge.x, hinge.y);
      path.lineTo(open.x, open.y);

      // Arc de débattement
      const startAngle = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
      const endAngle = Math.atan2(open.y - hinge.y, open.x - hinge.x);
      let deltaAngle = endAngle - startAngle;
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
      const counterclockwise = deltaAngle < 0;

      path.arc(hinge.x, hinge.y, doorWidth, startAngle, endAngle, counterclockwise);
    }

    // 3. Fenêtres hébergées (montants de baie et lignes d'appui/allège)
    for (const win of input.windows ?? []) {
      const wall = wallMap.get(win.hostWallId);
      if (!wall) continue;

      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-4) continue;

      const ux = dx / len;
      const uy = dy / len;
      const vx = -uy;
      const vy = ux;
      const halfT = wall.thickness / 2;

      const winWidth = win.width > 0 ? win.width : 1200;
      const u0 = win.offsetAlong;
      const u1 = win.offsetAlong + winWidth;

      const pA0 = vec2(wall.start.x + ux * u0 - vx * halfT, wall.start.y + uy * u0 - vy * halfT);
      const pB0 = vec2(wall.start.x + ux * u1 - vx * halfT, wall.start.y + uy * u1 - vy * halfT);
      const pB1 = vec2(wall.start.x + ux * u1 + vx * halfT, wall.start.y + uy * u1 + vy * halfT);
      const pA1 = vec2(wall.start.x + ux * u0 + vx * halfT, wall.start.y + uy * u0 + vy * halfT);

      // Montants de baie
      path.moveTo(pA0.x, pA0.y);
      path.lineTo(pA1.x, pA1.y);
      path.moveTo(pB0.x, pB0.y);
      path.lineTo(pB1.x, pB1.y);

      // Lignes de vitrage/allège
      path.moveTo(pA0.x, pA0.y);
      path.lineTo(pB0.x, pB0.y);
      path.moveTo(pA1.x, pA1.y);
      path.lineTo(pB1.x, pB1.y);
    }

    // 4. Empreintes 2D des escaliers sous-jacents (ADR-048)
    for (const st of input.stairs ?? []) {
      const dx = st.end.x - st.start.x;
      const dy = st.end.y - st.start.y;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-4 || st.width <= 0) continue;

      const u = vec2(dx / len, dy / len);
      const n = vec2(-u.y, u.x);
      const halfW = st.width / 2;

      // Contour rectangulaire de la volée
      const p1 = vec2(st.start.x - n.x * halfW, st.start.y - n.y * halfW);
      const p2 = vec2(st.end.x - n.x * halfW, st.end.y - n.y * halfW);
      const p3 = vec2(st.end.x + n.x * halfW, st.end.y + n.y * halfW);
      const p4 = vec2(st.start.x + n.x * halfW, st.start.y + n.y * halfW);

      path.moveTo(p1.x, p1.y);
      path.lineTo(p2.x, p2.y);
      path.lineTo(p3.x, p3.y);
      path.lineTo(p4.x, p4.y);
      path.closePath();

      // Nez de marches
      const nSteps = st.numberOfSteps ?? Math.max(3, Math.round(len / 280));
      const stepDist = len / nSteps;
      for (let i = 1; i < nSteps; i++) {
        const mx = st.start.x + u.x * (i * stepDist);
        const my = st.start.y + u.y * (i * stepDist);
        path.moveTo(mx - n.x * halfW, my - n.y * halfW);
        path.lineTo(mx + n.x * halfW, my + n.y * halfW);
      }

      // Ligne de foulée axiale
      path.moveTo(st.start.x, st.start.y);
      path.lineTo(st.end.x, st.end.y);
    }

    return path;
  }

  /**
   * Retourne le Path2D mis en cache pour un niveau, ou undefined si absent.
   */
  public get(levelId: string): Path2D | undefined {
    const entry = this.cache.get(levelId);
    if (entry) {
      this.hitCount++;
      return entry.path;
    }
    this.missCount++;
    return undefined;
  }

  /**
   * Retourne le Path2D mis en cache, ou le compile et le met en cache.
   */
  public getOrCompile(input: UnderlayInput): Path2D {
    const cached = this.get(input.levelId);
    if (cached) {
      return cached;
    }

    const path = this.compile(input);
    const elementIds = new Set<string>();
    elementIds.add(input.levelId);
    for (const w of input.walls) {
      elementIds.add(w.id);
    }
    for (const d of input.doors ?? []) {
      elementIds.add(d.id);
    }
    for (const win of input.windows ?? []) {
      elementIds.add(win.id);
    }
    for (const st of input.stairs ?? []) {
      elementIds.add(st.id);
    }

    this.cache.set(input.levelId, { path, elementIds });
    return path;
  }

  /**
   * Vérifie si le cache d'un niveau doit être invalidé pour les IDs modifiés donnés.
   */
  public shouldInvalidate(levelId: string, changedIds: readonly string[]): boolean {
    const entry = this.cache.get(levelId);
    if (!entry) return false;
    if (changedIds.length === 0) return true;
    for (const id of changedIds) {
      if (entry.elementIds.has(id)) return true;
    }
    return false;
  }

  /**
   * Invalide les entrées du cache affectées par les IDs modifiés, ou tout le cache si aucun ID n'est spécifié.
   */
  public invalidate(changedIds?: readonly string[]): void {
    if (!changedIds || changedIds.length === 0) {
      this.clear();
      return;
    }

    for (const [levelId, entry] of Array.from(this.cache.entries())) {
      for (const id of changedIds) {
        if (entry.elementIds.has(id)) {
          this.cache.delete(levelId);
          break;
        }
      }
    }
  }

  /**
   * Supprime l'entrée d'un niveau, ou purge l'intégralité du cache.
   */
  public clear(levelId?: string): void {
    if (levelId) {
      this.cache.delete(levelId);
    } else {
      this.cache.clear();
    }
  }

  public getHitCount(): number {
    return this.hitCount;
  }

  public getMissCount(): number {
    return this.missCount;
  }

  public resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}
