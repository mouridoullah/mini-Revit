import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { resolveWallGeometry } from './resolve.js';
import {
  computeWallSlabPenetration,
  getOrBuildWallResolutionIndex,
  getOrComputeSlabGeometry,
} from '../walls.js';
import type { BimState, Wall, WallType, Level, Slab, SlabType, Door, Window, DoorType, WindowType } from '../types.js';

describe('resolveWallGeometry (core/walls/resolve.ts) — Source unique de vérité', () => {
  const level0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0 };
  const level1: Level = { id: 'lvl_1', name: 'R+1', elevation: 3000 };

  const wallType: WallType = {
    id: 'wt_standard',
    name: 'Mur Standard 200',
    thickness: 200,
    height: 2800,
  };

  const doorType: DoorType = {
    id: 'dt_standard',
    name: 'Porte 900x2100',
    width: 900,
    height: 2100,
  };

  const windowType: WindowType = {
    id: 'wt_standard_win',
    name: 'Fenêtre 1200x1400',
    width: 1200,
    height: 1400,
    defaultSillHeight: 900,
  };

  const baseState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: { [level0.id]: level0, [level1.id]: level1 },
    wallTypes: { [wallType.id]: wallType },
    doorTypes: { [doorType.id]: doorType },
    windowTypes: { [windowType.id]: windowType },
    slabTypes: {},
    walls: {},
    doors: {},
    windows: {},
    slabs: {},
    rooms: {},
    dimensions: {},
  };

  it('T-RESOLVE-01 : Hauteur nominale (aucun override ni topConstraint)', () => {
    const wall: Wall = {
      id: 'w1',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };

    const resolved = resolveWallGeometry(wall, baseState);

    expect(resolved.wallId).toBe('w1');
    expect(resolved.zBase).toBe(0);
    expect(resolved.zTop).toBe(2800);
    expect(resolved.height).toBe(2800);
    expect(resolved.heightSource).toBe('nominal');
    expect(resolved.limitingSlabId).toBeUndefined();
    expect(resolved.openings).toEqual([]);
  });

  it('T-RESOLVE-02 : Priorité 1 — Surcharge manuelle explicite (heightOverride)', () => {
    const wall: Wall = {
      id: 'w2',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: level1.id, topOffset: 0 },
      heightOverride: 3500,
    };

    const resolved = resolveWallGeometry(wall, baseState);

    expect(resolved.zBase).toBe(0);
    expect(resolved.zTop).toBe(3500);
    expect(resolved.height).toBe(3500);
    expect(resolved.heightSource).toBe('override');
    expect(resolved.limitingSlabId).toBeUndefined();
  });

  it('T-RESOLVE-03 : Priorité 2 — Contrainte supérieure de niveau sans dalle', () => {
    const wall: Wall = {
      id: 'w3',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: level1.id, topOffset: 200 },
    };

    const resolved = resolveWallGeometry(wall, baseState);

    expect(resolved.zBase).toBe(0);
    expect(resolved.zTop).toBe(3200); // 3000 + 200
    expect(resolved.height).toBe(3200);
    expect(resolved.heightSource).toBe('constraint');
  });

  it('T-RESOLVE-04 : Priorité 2 — Contrainte supérieure arrêtée sous la sous-face de dalle', () => {
    const slabType: SlabType = {
      id: 'st_200',
      name: 'Dalle Béton 200',
      thickness: 200,
    };

    const slab: Slab = {
      id: 'slab_1',
      category: 'slab',
      levelId: level1.id,
      slabTypeId: slabType.id,
      boundary: [vec2(-1000, -1000), vec2(6000, -1000), vec2(6000, 3000), vec2(-1000, 3000)],
      holes: [],
    };

    const stateWithSlab: BimState = {
      ...baseState,
      slabTypes: { [slabType.id]: slabType },
      slabs: { [slab.id]: slab },
    };

    const wall: Wall = {
      id: 'w4',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      topConstraint: { levelId: level1.id, topOffset: 0 },
    };

    const resolved = resolveWallGeometry(wall, stateWithSlab);

    // zTop = level1.elevation (3000) - thickness (200) = 2800 mm
    expect(resolved.zBase).toBe(0);
    expect(resolved.zTop).toBe(2800);
    expect(resolved.height).toBe(2800);
    expect(resolved.heightSource).toBe('constraint');
    expect(resolved.limitingSlabId).toBe('slab_1');
  });

  it('T-RESOLVE-05 : Décalage vertical (baseOffset = +500 mm et -100 mm)', () => {
    const wallRaised: Wall = {
      id: 'w_raised',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      baseOffset: 500,
      heightOverride: 3000,
    };

    const resRaised = resolveWallGeometry(wallRaised, baseState);
    expect(resRaised.zBase).toBe(500);
    expect(resRaised.zTop).toBe(3500); // 500 + 3000
    expect(resRaised.height).toBe(3000);
    expect(resRaised.heightSource).toBe('override');

    const wallLowered: Wall = {
      id: 'w_lowered',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(5000, 0),
      baseOffset: -100,
    };

    const resLowered = resolveWallGeometry(wallLowered, baseState);
    expect(resLowered.zBase).toBe(-100);
    expect(resLowered.zTop).toBe(-100 + 2800);
    expect(resLowered.height).toBe(2800);
  });

  it('T-RESOLVE-06 : Résolution complète des ouvertures avec cotes absolues sillZ / lintelZ', () => {
    const wall: Wall = {
      id: 'w_openings',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(6000, 0),
      baseOffset: 500,
      heightOverride: 3200,
    };

    const door: Door = {
      id: 'd1',
      category: 'door',
      doorTypeId: doorType.id,
      hostWallId: wall.id,
      offsetAlong: 800,
      swing: { side: 'right', direction: 'in' },
    };

    const win: Window = {
      id: 'win1',
      category: 'window',
      windowTypeId: windowType.id,
      hostWallId: wall.id,
      offsetAlong: 3000,
      sillHeight: 900,
    };

    const state: BimState = {
      ...baseState,
      walls: { [wall.id]: wall },
      doors: { [door.id]: door },
      windows: { [win.id]: win },
    };

    const resolved = resolveWallGeometry(wall, state);

    expect(resolved.openings).toHaveLength(2);

    // Porte à offset 800
    const resolvedDoor = resolved.openings[0]!;
    expect(resolvedDoor.id).toBe('d1');
    expect(resolvedDoor.kind).toBe('door');
    expect(resolvedDoor.offsetAlong).toBe(800);
    expect(resolvedDoor.width).toBe(900);
    expect(resolvedDoor.height).toBe(2100);
    expect(resolvedDoor.sillHeight).toBe(0);
    expect(resolvedDoor.sillZAbsolute).toBe(500); // zBase (500) + 0
    expect(resolvedDoor.lintelZAbsolute).toBe(2600); // 500 + 2100

    // Fenêtre à offset 3000
    const resolvedWin = resolved.openings[1]!;
    expect(resolvedWin.id).toBe('win1');
    expect(resolvedWin.kind).toBe('window');
    expect(resolvedWin.offsetAlong).toBe(3000);
    expect(resolvedWin.width).toBe(1200);
    expect(resolvedWin.height).toBe(1400);
    expect(resolvedWin.sillHeight).toBe(900);
    expect(resolvedWin.sillZAbsolute).toBe(1400); // zBase (500) + 900
    expect(resolvedWin.lintelZAbsolute).toBe(2800); // 1400 + 1400
  });

  it('T-RESOLVE-07 : Résilience aux états partiels (collections manquantes)', () => {
    const minimalState = {
      schemaVersion: 2,
      levels: { [level0.id]: level0 },
      wallTypes: { [wallType.id]: wallType },
      walls: {},
    } as unknown as BimState;

    const wall: Wall = {
      id: 'w_min',
      category: 'wall',
      levelId: level0.id,
      typeId: wallType.id,
      start: vec2(0, 0),
      end: vec2(4000, 0),
    };

    const resolved = resolveWallGeometry(wall, minimalState);
    expect(resolved.height).toBe(2800);
    expect(resolved.openings).toEqual([]);
  });

  describe('computeWallSlabPenetration (sans faux positifs horizontaux)', () => {
    const slabType: SlabType = {
      id: 'st_200',
      name: 'Dalle 200mm',
      thickness: 200,
    };

    const slabR1: Slab = {
      id: 'slab_r1',
      category: 'slab',
      levelId: level1.id,
      slabTypeId: slabType.id,
      boundary: [vec2(0, 0), vec2(5000, 0), vec2(5000, 5000), vec2(0, 5000)],
      holes: [],
      openings: [],
    };

    it('T-PEN-01 : Mur distant horizontalement de la dalle -> 0 mm de pénétration', () => {
      const stateWithSlab: BimState = {
        schemaVersion: 2,
        levels: { [level0.id]: level0, [level1.id]: level1 },
        wallTypes: { [wallType.id]: wallType },
        slabTypes: { [slabType.id]: slabType },
        slabs: { [slabR1.id]: slabR1 },
        walls: {},
      } as unknown as BimState;

      // Mur situé en x = 10000..14000 (hors de l'emprise x = 0..5000 de la dalle)
      const distantWall: Wall = {
        id: 'w_distant',
        category: 'wall',
        levelId: level0.id,
        typeId: wallType.id,
        start: vec2(10000, 0),
        end: vec2(14000, 0),
        heightOverride: 3200, // Ztop = 3200 > Zinf(slab) = 2800
      };

      const penetration = computeWallSlabPenetration(distantWall, stateWithSlab);
      expect(penetration).toBe(0);
    });

    it('T-PEN-02 : Mur sous la dalle avec dépassement altimétrique -> pénétration exacte calculée', () => {
      const stateWithSlab: BimState = {
        schemaVersion: 2,
        levels: { [level0.id]: level0, [level1.id]: level1 },
        wallTypes: { [wallType.id]: wallType },
        slabTypes: { [slabType.id]: slabType },
        slabs: { [slabR1.id]: slabR1 },
        walls: {},
      } as unknown as BimState;

      // Mur situé sous la dalle (x = 1000..3000, y = 2000)
      // Level 1 elevation = 3000, slab thickness = 200 -> zInf = 2800
      // Mur heightOverride = 3000 -> zTop = 3000 -> pénétration = 3000 - 2800 = 200 mm
      const coveredWall: Wall = {
        id: 'w_covered',
        category: 'wall',
        levelId: level0.id,
        typeId: wallType.id,
        start: vec2(1000, 2000),
        end: vec2(3000, 2000),
        heightOverride: 3000,
      };

      const penetration = computeWallSlabPenetration(coveredWall, stateWithSlab);
      expect(penetration).toBe(200);
    });

    it('T-PEN-03 : Mur sans heightOverride (auto) -> 0 mm de pénétration', () => {
      const stateWithSlab: BimState = {
        schemaVersion: 2,
        levels: { [level0.id]: level0, [level1.id]: level1 },
        wallTypes: { [wallType.id]: wallType },
        slabTypes: { [slabType.id]: slabType },
        slabs: { [slabR1.id]: slabR1 },
        walls: {},
      } as unknown as BimState;

      const autoWall: Wall = {
        id: 'w_auto',
        category: 'wall',
        levelId: level0.id,
        typeId: wallType.id,
        start: vec2(1000, 2000),
        end: vec2(3000, 2000),
      };

      const penetration = computeWallSlabPenetration(autoWall, stateWithSlab);
      expect(penetration).toBe(0);
    });

    it('T-INDEX-CACHE-01 : getOrBuildWallResolutionIndex mémoïse sur BimState et slabGeometryCache sur Slab', () => {
      const stateWithSlab: BimState = {
        schemaVersion: 2,
        levels: { [level0.id]: level0, [level1.id]: level1 },
        wallTypes: { [wallType.id]: wallType },
        slabTypes: { [slabType.id]: slabType },
        slabs: { [slabR1.id]: slabR1 },
        walls: {},
      } as unknown as BimState;

      const idx1 = getOrBuildWallResolutionIndex(stateWithSlab);
      const idx2 = getOrBuildWallResolutionIndex(stateWithSlab);
      expect(idx1).toBe(idx2);

      const geom1 = getOrComputeSlabGeometry(slabR1);
      const geom2 = getOrComputeSlabGeometry(slabR1);
      expect(geom1).toBe(geom2);
      expect(geom1?.aabb.minX).toBe(0);
      expect(geom1?.aabb.maxX).toBe(5000);
    });
  });
});
