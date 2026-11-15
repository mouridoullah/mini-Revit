import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import {
  type BimState,
  type Wall,
  type Roof,
  type GableRoofType,
  type FlatRoofType,
  type WallType,
  type Level,
  type Door,
  type Window,
  type DoorType,
  type WindowType,
} from '../types.js';
import { resolveWallGeometry } from './resolve.js';

describe('resolveWallGeometry étendu avec Toitures (ADR-053 [D2 / D8])', () => {
  const level0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0 };
  const level1: Level = { id: 'lvl_1', name: 'R+1', elevation: 3000 };
  const wallType: WallType = { id: 'wt_standard', name: 'Mur 200', thickness: 200, height: 2800 };
  const doorType: DoorType = { id: 'dt_std', name: 'Porte 900x2100', width: 900, height: 2100 };
  const winType: WindowType = { id: 'wt_std', name: 'Fenêtre 1200x1400', width: 1200, height: 1400, defaultSillHeight: 900 };

  const flatRoofType: FlatRoofType = {
    id: 'rt_flat',
    name: 'Toit Plat 200',
    category: 'roofType',
    family: 'flat',
    thickness: 200,
  };

  const gableRoofType: GableRoofType = {
    id: 'rt_gable',
    name: 'Toit 2 Pans 45°',
    category: 'roofType',
    family: 'gable',
    thickness: 250,
    slopeDeg: 45,
    overhangMm: 0,
  };

  const flatRoof: Roof = {
    id: 'roof_flat',
    category: 'roof',
    roofTypeId: 'rt_flat',
    levelId: 'lvl_1',
    baseOffset: 0,
    footprint: [vec2(0, 0), vec2(10000, 0), vec2(10000, 8000), vec2(0, 8000)],
  };

  const gableRoof: Roof = {
    id: 'roof_gable',
    category: 'roof',
    roofTypeId: 'rt_gable',
    levelId: 'lvl_0',
    baseOffset: 0,
    footprint: [vec2(0, 0), vec2(10000, 0), vec2(10000, 8000), vec2(0, 8000)],
    ridgeAxis: { start: vec2(0, 4000), end: vec2(10000, 4000) },
  };

  const createBaseState = (roofs: Record<string, Roof> = {}): BimState => ({
    schemaVersion: 2,
    units: 'mm',
    levels: { lvl_0: level0, lvl_1: level1 },
    wallTypes: { wt_standard: wallType },
    doorTypes: { dt_std: doorType },
    windowTypes: { wt_std: winType },
    roofTypes: { rt_flat: flatRoofType, rt_gable: gableRoofType },
    slabTypes: {},
    walls: {},
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    roofs,
  });

  it('T-RESOLVE-ROOF-01 : Mur sans toit -> topProfile rectangle nominal, wallHeightSource = "level"', () => {
    const wall: Wall = {
      id: 'w_1',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };
    const state = createBaseState({});
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('level');
    expect(res.heightSource).toBe('nominal');
    expect(res.height).toBe(2800);
    expect(res.zTop).toBe(2800);
    expect(res.topProfile).toEqual([vec2(0, 2800), vec2(5000, 2800)]);
  });

  it('T-RESOLVE-ROOF-02 : Mur sous toit plat -> topProfile rectangle (zBaseRoof), wallHeightSource = "roof"', () => {
    const wall: Wall = {
      id: 'w_flat',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(1000, 1000),
      end: vec2(6000, 1000),
      topConstraint: { kind: 'roof', roofId: 'roof_flat' },
    };
    const state = createBaseState({ roof_flat: flatRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('roof');
    expect(res.heightSource).toBe('constraint');
    expect(res.limitingRoofId).toBe('roof_flat');
    expect(res.zTop).toBe(3000); // level1 elevation
    expect(res.height).toBe(3000);
    expect(res.topProfile).toEqual([vec2(0, 3000), vec2(5000, 3000)]);
  });

  it('T-RESOLVE-ROOF-03 : Mur sous 1 pan (parallèle au ridge) -> profil horizontal constant', () => {
    const wall: Wall = {
      id: 'w_par',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(1000, 2000),
      end: vec2(5000, 2000),
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('roof');
    expect(res.topProfile).toHaveLength(2);
    // dist au faîtage = 2000 -> z = 4000 - 2000 = 2000
    expect(res.topProfile[0]?.y).toBeCloseTo(2000, 1);
    expect(res.topProfile[1]?.y).toBeCloseTo(2000, 1);
  });

  it('T-RESOLVE-ROOF-04 : Mur perpendiculaire au ridge sous 1 pan -> trapézoïdal montant', () => {
    const wall: Wall = {
      id: 'w_perp',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(2000, 1000),
      end: vec2(2000, 3000),
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('roof');
    expect(res.topProfile).toHaveLength(2);
    expect(res.topProfile[0]?.y).toBeCloseTo(1000, 1);
    expect(res.topProfile[1]?.y).toBeCloseTo(3000, 1);
  });

  it('T-RESOLVE-ROOF-05 : Mur sous 2 pans (pignon) -> chevron avec pic au faîtage', () => {
    const wallGable: Wall = {
      id: 'w_pignon',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wallGable, state);

    expect(res.wallHeightSource).toBe('roof');
    expect(res.topProfile).toHaveLength(3);
    expect(res.topProfile[1]?.x).toBeCloseTo(4000, 1);
    expect(res.topProfile[1]?.y).toBeCloseTo(4000, 1); // pic
    expect(res.zTop).toBeCloseTo(4000, 1);
    expect(res.height).toBeCloseTo(4000, 1);
  });

  it('T-RESOLVE-ROOF-06 : Mur sous toit avec heightOverride -> override gagne', () => {
    const wall: Wall = {
      id: 'w_override',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
      heightOverride: 3500,
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('override');
    expect(res.heightSource).toBe('override');
    expect(res.height).toBe(3500);
    expect(res.zTop).toBe(3500);
    expect(res.topProfile).toEqual([vec2(0, 3500), vec2(8000, 3500)]);
  });

  it('T-RESOLVE-ROOF-07 : Mur sous toit avec topConstraint.kind="level" -> level gagne', () => {
    const wall: Wall = {
      id: 'w_level_pref',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
      topConstraint: { kind: 'level', levelId: 'lvl_1' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('level');
    expect(res.heightSource).toBe('constraint');
    expect(res.zTop).toBe(3000);
    expect(res.height).toBe(3000);
  });

  it('T-RESOLVE-ROOF-08 : Mur hors footprint du toit -> fallback nominal', () => {
    const wall: Wall = {
      id: 'w_out',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(20000, 0),
      end: vec2(25000, 0),
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('level');
    expect(res.heightSource).toBe('nominal');
    expect(res.height).toBe(2800);
  });

  it('T-RESOLVE-ROOF-09 : Mur auto-détecté sous toiture (ADR-053 [D8])', () => {
    // Sans topConstraint explicite, le mur est sous l'emprise de gableRoof
    const wall: Wall = {
      id: 'w_auto',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    expect(res.wallHeightSource).toBe('roof');
    expect(res.limitingRoofId).toBe('roof_gable');
    expect(res.topProfile).toHaveLength(3);
  });

  it('T-RESOLVE-ROOF-10 : Mur sous toit avec ouvertures -> sillZAbsolute et lintelZAbsolute intègrent zBase', () => {
    const wall: Wall = {
      id: 'w_with_openings',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      baseOffset: 200,
      start: vec2(0, 0),
      end: vec2(0, 8000),
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const door: Door = {
      id: 'd_1',
      category: 'door',
      doorTypeId: 'dt_std',
      hostWallId: 'w_with_openings',
      offsetAlong: 500,
      swing: { side: 'left', direction: 'in' },
    };
    const win: Window = {
      id: 'win_1',
      category: 'window',
      windowTypeId: 'wt_std',
      hostWallId: 'w_with_openings',
      offsetAlong: 2000,
      sillHeight: 900,
    };

    const state = createBaseState({ roof_gable: gableRoof });
    state.walls['w_with_openings'] = wall;
    state.doors['d_1'] = door;
    state.windows['win_1'] = win;

    const res = resolveWallGeometry(wall, state);
    expect(res.openings).toHaveLength(2);

    const resDoor = res.openings[0];
    expect(resDoor?.kind).toBe('door');
    expect(resDoor?.sillZAbsolute).toBe(200); // zBase
    expect(resDoor?.lintelZAbsolute).toBe(200 + 2100);

    const resWin = res.openings[1];
    expect(resWin?.kind).toBe('window');
    expect(resWin?.sillZAbsolute).toBe(200 + 900);
    expect(resWin?.lintelZAbsolute).toBe(200 + 900 + 1400);
  });

  it('T-RESOLVE-ROOF-11 : zTop = max(topProfile), height = zTop - zBase', () => {
    const wall: Wall = {
      id: 'w_check',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
      topConstraint: { kind: 'roof', roofId: 'roof_gable' },
    };
    const state = createBaseState({ roof_gable: gableRoof });
    const res = resolveWallGeometry(wall, state);

    const maxZ = Math.max(...res.topProfile.map((p) => p.y));
    expect(res.zTop).toBe(maxZ);
    expect(res.height).toBe(maxZ - res.zBase);
  });

  it('T-RESOLVE-ROOF-12 : wallHeightSource correct ("roof" si couvert, "override", "level")', () => {
    const state = createBaseState({ roof_gable: gableRoof });

    const wallRoof: Wall = {
      id: 'w_r',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(1000, 1000),
      end: vec2(2000, 1000),
    };
    expect(resolveWallGeometry(wallRoof, state).wallHeightSource).toBe('roof');

    const wallOverride: Wall = {
      ...wallRoof,
      id: 'w_ov',
      heightOverride: 2500,
    };
    expect(resolveWallGeometry(wallOverride, state).wallHeightSource).toBe('override');

    const wallLevel: Wall = {
      ...wallRoof,
      id: 'w_lvl',
      topConstraint: { kind: 'level', levelId: 'lvl_1' },
    };
    expect(resolveWallGeometry(wallLevel, state).wallHeightSource).toBe('level');
  });
});
