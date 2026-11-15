import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import {
  UnderlayCache,
  MockPath2D,
  type UnderlayInput,
  type WallForUnderlay,
  type DoorForUnderlay,
  type WindowForUnderlay,
} from './UnderlayCache.js';

describe('UnderlayCache (packages/view-2d/src/underlay/UnderlayCache.ts)', () => {
  let cache: UnderlayCache;

  beforeEach(() => {
    cache = new UnderlayCache();
  });

  it('T-UC-01 — compile 1 simple wall génère un Path2D avec 4 coins et closePath', () => {
    const wall: WallForUnderlay = {
      id: 'w1',
      start: vec2(0, 0),
      end: vec2(5000, 0),
      thickness: 200,
    };
    const input: UnderlayInput = {
      levelId: 'lvl0',
      walls: [wall],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    expect(path).toBeDefined();

    // Vérifier les opérations du polygone d'emprise
    const ops = path.ops;
    const moveOps = ops.filter((o) => o.method === 'moveTo');
    const lineOps = ops.filter((o) => o.method === 'lineTo');
    const closeOps = ops.filter((o) => o.method === 'closePath');

    expect(moveOps.length).toBe(1);
    expect(lineOps.length).toBe(3);
    expect(closeOps.length).toBe(1);
  });

  it('T-UC-02 — compile 2 murs connectés génère un tracé composé avec 2 boucles fermées', () => {
    const w1: WallForUnderlay = {
      id: 'w1',
      start: vec2(0, 0),
      end: vec2(5000, 0),
      thickness: 200,
    };
    const w2: WallForUnderlay = {
      id: 'w2',
      start: vec2(5000, 0),
      end: vec2(5000, 4000),
      thickness: 200,
    };
    const input: UnderlayInput = {
      levelId: 'lvl0',
      walls: [w1, w2],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    const ops = path.ops;

    const moveOps = ops.filter((o) => o.method === 'moveTo');
    const closeOps = ops.filter((o) => o.method === 'closePath');

    expect(moveOps.length).toBe(2);
    expect(closeOps.length).toBe(2);
  });

  it('T-UC-03 — compile un mur avec une porte hébergée génère le battant et l’arc de débattement', () => {
    const wall: WallForUnderlay = {
      id: 'w1',
      start: vec2(0, 0),
      end: vec2(6000, 0),
      thickness: 200,
    };
    const door: DoorForUnderlay = {
      id: 'd1',
      hostWallId: 'w1',
      offsetAlong: 2000,
      width: 900,
      swing: { side: 'left', direction: 'in' },
    };
    const input: UnderlayInput = {
      levelId: 'lvl0',
      walls: [wall],
      doors: [door],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    const ops = path.ops;

    const arcOps = ops.filter((o) => o.method === 'arc');
    expect(arcOps.length).toBe(1);
    // Rayon de l'arc = largeur de porte (900 mm)
    expect(arcOps[0]?.args[2]).toBe(900);
  });

  it('T-UC-04 — compile un mur avec une fenêtre hébergée génère les montants d’ébrasement et lignes d’allège', () => {
    const wall: WallForUnderlay = {
      id: 'w1',
      start: vec2(0, 0),
      end: vec2(6000, 0),
      thickness: 200,
    };
    const window: WindowForUnderlay = {
      id: 'win1',
      hostWallId: 'w1',
      offsetAlong: 3000,
      width: 1200,
    };
    const input: UnderlayInput = {
      levelId: 'lvl0',
      walls: [wall],
      windows: [window],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    const ops = path.ops;

    // 1 mur (1 moveTo + 3 lineTo + 1 closePath) + 4 segments de fenêtre (4 moveTo + 4 lineTo)
    const moveOps = ops.filter((o) => o.method === 'moveTo');
    const lineOps = ops.filter((o) => o.method === 'lineTo');

    expect(moveOps.length).toBe(5);
    expect(lineOps.length).toBe(7);
  });

  it('T-UC-05 — niveau vide (0 mur) renvoie un Path2D sans aucune commande sans erreur', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_empty',
      walls: [],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    expect(path.ops.length).toBe(0);
  });

  it('T-UC-05b — compile() lève TypeError si input.levelId est manquant ou vide', () => {
    expect(() => cache.compile({ levelId: '', walls: [] })).toThrow(TypeError);
    expect(() => cache.compile(null as unknown as UnderlayInput)).toThrow(TypeError);
  });

  it('T-UC-06 — getOrCompile effectue 1 compilation et 9 hits consécutifs sur 10 requêtes', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_cached',
      walls: [
        {
          id: 'w1',
          start: vec2(0, 0),
          end: vec2(4000, 0),
          thickness: 200,
        },
      ],
    };

    const first = cache.getOrCompile(input);
    expect(cache.getHitCount()).toBe(0);
    expect(cache.getMissCount()).toBe(1);

    for (let i = 0; i < 9; i++) {
      const next = cache.getOrCompile(input);
      expect(next).toBe(first);
    }

    expect(cache.getHitCount()).toBe(9);
    expect(cache.getMissCount()).toBe(1);
  });

  it('T-UC-06b — espionnage explicite vi.spyOn(cache, "compile") appelé 1 seule fois sur 10 getOrCompile successifs', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_cached_spy',
      walls: [
        {
          id: 'w_spy',
          start: vec2(0, 0),
          end: vec2(3000, 0),
          thickness: 200,
        },
      ],
    };

    const spy = vi.spyOn(cache, 'compile');
    for (let i = 0; i < 10; i++) {
      cache.getOrCompile(input);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('T-UC-07 — invalidate([wallId]) invalide le niveau concerné et force une recompilation', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_inval',
      walls: [
        {
          id: 'w_target',
          start: vec2(0, 0),
          end: vec2(4000, 0),
          thickness: 200,
        },
      ],
    };

    cache.getOrCompile(input);
    expect(cache.get('lvl_inval')).toBeDefined();

    // Invalider pour le mur 'w_target'
    cache.invalidate(['w_target']);
    expect(cache.get('lvl_inval')).toBeUndefined();
  });

  it('T-UC-08 — invalidate([otherId]) préserve le cache si l’ID ne fait pas partie du niveau', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_safe',
      walls: [
        {
          id: 'w_safe',
          start: vec2(0, 0),
          end: vec2(4000, 0),
          thickness: 200,
        },
      ],
    };

    cache.getOrCompile(input);
    cache.invalidate(['unrelated_id_123']);

    expect(cache.get('lvl_safe')).toBeDefined();
  });

  it('T-UC-09 — invalidate([doorId]) ou invalidate([windowId]) invalide le niveau hébergeant la baie', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_host',
      walls: [
        {
          id: 'w_host',
          start: vec2(0, 0),
          end: vec2(5000, 0),
          thickness: 200,
        },
      ],
      doors: [
        {
          id: 'd_child',
          hostWallId: 'w_host',
          offsetAlong: 1000,
          width: 900,
        },
      ],
    };

    cache.getOrCompile(input);
    cache.invalidate(['d_child']);
    expect(cache.get('lvl_host')).toBeUndefined();
  });

  it('T-UC-10 — clear() vide toutes les entrées et resetStats réinitialise les compteurs', () => {
    const input1: UnderlayInput = {
      levelId: 'lvl1',
      walls: [{ id: 'w1', start: vec2(0, 0), end: vec2(2000, 0), thickness: 200 }],
    };
    const input2: UnderlayInput = {
      levelId: 'lvl2',
      walls: [{ id: 'w2', start: vec2(0, 0), end: vec2(3000, 0), thickness: 200 }],
    };

    cache.getOrCompile(input1);
    cache.getOrCompile(input2);

    cache.clear('lvl1');
    expect(cache.get('lvl1')).toBeUndefined();
    expect(cache.get('lvl2')).toBeDefined();

    cache.clear();
    expect(cache.get('lvl2')).toBeUndefined();

    cache.resetStats();
    expect(cache.getHitCount()).toBe(0);
    expect(cache.getMissCount()).toBe(0);
  });

  it('T-UC-11 — shouldInvalidate détecte les dépendances directes et ignore les ID externes', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_dep',
      walls: [{ id: 'w_dep', start: vec2(0, 0), end: vec2(3000, 0), thickness: 200 }],
    };

    cache.getOrCompile(input);

    expect(cache.shouldInvalidate('lvl_dep', ['w_dep'])).toBe(true);
    expect(cache.shouldInvalidate('lvl_dep', ['external_id'])).toBe(false);
    expect(cache.shouldInvalidate('lvl_dep', [])).toBe(true); // invalidation globale
    expect(cache.shouldInvalidate('lvl_not_cached', ['w_dep'])).toBe(false);
  });

  it('T-UC-12 — tolérance aux segments dégénérés sans crash', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_degen',
      walls: [
        { id: 'w_zero_len', start: vec2(100, 100), end: vec2(100, 100), thickness: 200 },
        { id: 'w_zero_thick', start: vec2(0, 0), end: vec2(2000, 0), thickness: 0 },
      ],
    };

    expect(() => cache.compile(input)).not.toThrow();
    const path = cache.compile(input) as unknown as MockPath2D;
    expect(path.ops.length).toBe(0);
  });

  it('T-UC-13 — MockPath2D valide strictement la finitude des coordonnées et rejette NaN/Infinity avec TypeError', () => {
    const mock = new MockPath2D();
    expect(() => mock.moveTo(NaN, 100)).toThrow(TypeError);
    expect(() => mock.lineTo(100, Infinity)).toThrow(TypeError);
    expect(() => mock.arc(0, 0, -50, 0, Math.PI)).toThrow(TypeError);
    expect(() => mock.rect(0, 0, NaN, 200)).toThrow(TypeError);
    expect(() => mock.addPath(null)).toThrow(TypeError);
  });

  it('T-UC-14 — MockPath2D valide l arité des arguments et rejette moveTo avec 1 argument', () => {
    const mock = new MockPath2D();
    // @ts-expect-error test arité
    expect(() => mock.moveTo(100)).toThrow(TypeError);
    // @ts-expect-error test arité
    expect(() => mock.lineTo(100)).toThrow(TypeError);
  });

  it('T-UC-15 — MockPath2D valide l arité des arguments et rejette arc avec moins de 5 arguments', () => {
    const mock = new MockPath2D();
    // @ts-expect-error test arité
    expect(() => mock.arc(0, 0)).toThrow(TypeError);
    // @ts-expect-error test arité
    expect(() => mock.rect(0, 0, 100)).toThrow(TypeError);
  });

  it('T-STAIR-UC-01 — compile avec un escalier génère le contour, les nez de marches et la ligne de foulée', () => {
    const input: UnderlayInput = {
      levelId: 'lvl_stair',
      walls: [],
      stairs: [
        {
          id: 'st_underlay',
          start: vec2(0, 0),
          end: vec2(4000, 0),
          width: 900,
          numberOfSteps: 10,
        },
      ],
    };

    const path = cache.compile(input) as unknown as MockPath2D;
    expect(path.ops.length).toBeGreaterThan(0);

    const closeOps = path.ops.filter((o) => o.method === 'closePath');
    expect(closeOps.length).toBe(1); // contour fermé de la volée
  });
});
