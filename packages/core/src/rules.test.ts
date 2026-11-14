import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import {
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
  canDeleteWall,
  canDeleteLevel,
  canDeleteWallType,
  BimValidationError,
} from './rules.js';
import {
  type BimState,
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
} from './types.js';

describe('Règles Métier BIM (rules.ts)', () => {
  const sampleLevel: Level = { id: 'lvl_1', name: 'RDC', elevation: 0 };
  const sampleType: WallType = { id: 'type_1', name: 'Mur 200', thickness: 200, height: 2800 };

  const validState: BimState = {
    schemaVersion: 1,
    units: 'mm',
    levels: { lvl_1: sampleLevel },
    wallTypes: { type_1: sampleType },
    walls: {},
    doors: {},
    windows: {},
  };

  it('valide un mur géométriquement et référentiellement correct', () => {
    const validWall: Wall = {
      id: 'w_ok',
      category: 'wall',
      typeId: 'type_1',
      levelId: 'lvl_1',
      start: vec2(0, 0),
      end: vec2(4000, 0),
    };

    expect(() => validateWall(validWall, validState)).not.toThrow();
  });

  it('rejette un mur de longueur nulle (points confondus)', () => {
    const zeroWall: Wall = {
      id: 'w_zero',
      category: 'wall',
      typeId: 'type_1',
      levelId: 'lvl_1',
      start: vec2(1000, 2000),
      end: vec2(1000, 2000),
    };

    expect(() => validateWall(zeroWall, validState)).toThrowError(BimValidationError);
    expect(() => validateWall(zeroWall, validState)).toThrowError(/INVALID_WALL_LENGTH/);
  });

  it('rejette un mur référençant un WallType inexistant', () => {
    const invalidTypeWall: Wall = {
      id: 'w_bad_type',
      category: 'wall',
      typeId: 'non_existent_type',
      levelId: 'lvl_1',
      start: vec2(0, 0),
      end: vec2(1000, 0),
    };

    expect(() => validateWall(invalidTypeWall, validState)).toThrowError(BimValidationError);
    expect(() => validateWall(invalidTypeWall, validState)).toThrowError(/UNKNOWN_WALL_TYPE/);
  });

  it('rejette un mur référençant un Level inexistant', () => {
    const invalidLevelWall: Wall = {
      id: 'w_bad_level',
      category: 'wall',
      typeId: 'type_1',
      levelId: 'non_existent_level',
      start: vec2(0, 0),
      end: vec2(1000, 0),
    };

    expect(() => validateWall(invalidLevelWall, validState)).toThrowError(BimValidationError);
    expect(() => validateWall(invalidLevelWall, validState)).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('valide et rejette les paramètres de WallType selon les bornes physiques', () => {
    expect(() =>
      validateWallType({ id: 't1', name: 'OK', thickness: 200, height: 2800 }),
    ).not.toThrow();

    expect(() =>
      validateWallType({ id: 't2', name: '', thickness: 200, height: 2800 }),
    ).toThrowError(/INVALID_WALL_TYPE_NAME/);

    expect(() =>
      validateWallType({ id: 't3', name: 'NegThick', thickness: -10, height: 2800 }),
    ).toThrowError(/INVALID_WALL_TYPE_THICKNESS/);

    expect(() =>
      validateWallType({ id: 't4', name: 'ZeroHeight', thickness: 200, height: 0 }),
    ).toThrowError(/INVALID_WALL_TYPE_HEIGHT/);
  });

  it('valide et rejette les paramètres de Level', () => {
    expect(() => validateLevel({ id: 'l1', name: 'Étage 1', elevation: 3000 })).not.toThrow();

    expect(() => validateLevel({ id: 'l2', name: '   ', elevation: 3000 })).toThrowError(
      /INVALID_LEVEL_NAME/,
    );

    expect(() => validateLevel({ id: 'l3', name: 'NaN', elevation: Number.NaN })).toThrowError(
      /INVALID_LEVEL_ELEVATION/,
    );
  });

  it('refuse la suppression d’un Level si des murs y sont rattachés', () => {
    const stateWithWall: BimState = {
      ...validState,
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          typeId: 'type_1',
          levelId: 'lvl_1',
          start: vec2(0, 0),
          end: vec2(2000, 0),
        },
      },
    };

    const check = canDeleteLevel('lvl_1', stateWithWall);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/wall\(s\) are attached/);

    // Si aucun mur n'est rattaché
    const checkEmpty = canDeleteLevel('lvl_1', validState);
    expect(checkEmpty.allowed).toBe(true);
  });

  it('refuse la suppression d’un WallType si des murs l’utilisent', () => {
    const stateWithWall: BimState = {
      ...validState,
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          typeId: 'type_1',
          levelId: 'lvl_1',
          start: vec2(0, 0),
          end: vec2(2000, 0),
        },
      },
    };

    const check = canDeleteWallType('type_1', stateWithWall);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/wall\(s\) are using it/);

    // Si le type n'est pas utilisé
    const checkEmpty = canDeleteWallType('type_1', validState);
    expect(checkEmpty.allowed).toBe(true);
  });

  /* =========================================================================
   * TESTS DES RÈGLES MÉTIER PORTES ET FENÊTRES (PHASE 3.1)
   * ========================================================================= */

  const stateWithHostWall: BimState = {
    ...validState,
    walls: {
      w_host: {
        id: 'w_host',
        category: 'wall',
        typeId: 'type_1',
        levelId: 'lvl_1',
        start: vec2(0, 0),
        end: vec2(5000, 0), // Longueur 5000 mm, hauteur 2800 mm
      },
    },
  };

  it('valide une porte et une fenêtre géométriquement et référentiellement correctes', () => {
    const validDoor: Door = {
      id: 'd_ok',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900,
      height: 2150,
      swing: { side: 'right', direction: 'in' },
    };

    const validWindow: Window = {
      id: 'win_ok',
      category: 'window',
      kind: 'window',
      hostWallId: 'w_host',
      offsetAlong: 2000,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    expect(() => validateDoor(validDoor, stateWithHostWall)).not.toThrow();
    expect(() => validateWindow(validWindow, stateWithHostWall)).not.toThrow();
  });

  it('rejette une porte dont le hostWallId est inexistant (UNKNOWN_HOST_WALL)', () => {
    const ghostDoor: Door = {
      id: 'd_ghost',
      category: 'door',
      kind: 'door',
      hostWallId: 'wall_unknown',
      offsetAlong: 500,
      width: 900,
      height: 2150,
      swing: { side: 'left', direction: 'in' },
    };

    expect(() => validateDoor(ghostDoor, stateWithHostWall)).toThrowError(BimValidationError);
    expect(() => validateDoor(ghostDoor, stateWithHostWall)).toThrowError(/UNKNOWN_HOST_WALL/);
  });

  it('rejette une porte dont la position dépasse les bornes du mur (INVALID_OPENING_POSITION)', () => {
    const outOfBoundsDoor: Door = {
      id: 'd_out',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 4500, // 4500 + 900 = 5400 > 5000 mm
      width: 900,
      height: 2150,
      swing: { side: 'left', direction: 'in' },
    };

    expect(() => validateDoor(outOfBoundsDoor, stateWithHostWall)).toThrowError(BimValidationError);
    expect(() => validateDoor(outOfBoundsDoor, stateWithHostWall)).toThrowError(
      /INVALID_OPENING_POSITION/,
    );
  });

  it('rejette une porte dont la hauteur dépasse la hauteur du mur (INVALID_OPENING_HEIGHT)', () => {
    const tooTallDoor: Door = {
      id: 'd_tall',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900,
      height: 3000, // 3000 mm > 2800 mm
      swing: { side: 'left', direction: 'in' },
    };

    expect(() => validateDoor(tooTallDoor, stateWithHostWall)).toThrowError(BimValidationError);
    expect(() => validateDoor(tooTallDoor, stateWithHostWall)).toThrowError(
      /INVALID_OPENING_HEIGHT/,
    );
  });

  it('rejette une ouverture en chevauchement avec une autre sur le même mur (OPENING_OVERLAP)', () => {
    const existingDoor: Door = {
      id: 'd_existing',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 1000, // Occupe [500, 1500] mm
      height: 2150,
      swing: { side: 'right', direction: 'in' },
    };

    const stateWithDoor: BimState = {
      ...stateWithHostWall,
      doors: { d_existing: existingDoor },
    };

    // Nouvelle porte commençant à 1200 mm (chevauche [500, 1500])
    const overlappingDoor: Door = {
      id: 'd_overlap',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 1200,
      width: 900,
      height: 2150,
      swing: { side: 'left', direction: 'in' },
    };

    expect(() => validateDoor(overlappingDoor, stateWithDoor)).toThrowError(BimValidationError);
    expect(() => validateDoor(overlappingDoor, stateWithDoor)).toThrowError(/OPENING_OVERLAP/);
  });

  it('rejette une fenêtre dont l’allège + hauteur dépasse la hauteur du mur (INVALID_OPENING_HEIGHT)', () => {
    const tooHighWindow: Window = {
      id: 'win_too_high',
      category: 'window',
      kind: 'window',
      hostWallId: 'w_host',
      offsetAlong: 1000,
      width: 1200,
      height: 2000,
      sillHeight: 1000, // 1000 + 2000 = 3000 mm > 2800 mm
    };

    expect(() => validateWindow(tooHighWindow, stateWithHostWall)).toThrowError(BimValidationError);
    expect(() => validateWindow(tooHighWindow, stateWithHostWall)).toThrowError(
      /INVALID_OPENING_HEIGHT/,
    );
  });

  it('rejette une ouverture avec dimensions nulles ou négatives (INVALID_OPENING_DIMENSIONS)', () => {
    const zeroWidthDoor: Door = {
      id: 'd_zero_w',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 0,
      height: 2100,
      swing: { side: 'left', direction: 'in' },
    };
    expect(() => validateDoor(zeroWidthDoor, stateWithHostWall)).toThrowError(
      /INVALID_OPENING_DIMENSIONS/,
    );

    const negHeightDoor: Door = {
      id: 'd_neg_h',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900,
      height: -50,
      swing: { side: 'right', direction: 'out' },
    };
    expect(() => validateDoor(negHeightDoor, stateWithHostWall)).toThrowError(
      /INVALID_OPENING_DIMENSIONS/,
    );
  });

  it('rejette un battement de porte invalide sur side ET sur direction (INVALID_DOOR_SWING)', () => {
    // Cas 1: side invalide
    const badSideDoor: Door = {
      id: 'd_bad_side',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      swing: { side: 'center' as unknown as 'left', direction: 'in' },
    };
    expect(() => validateDoor(badSideDoor, stateWithHostWall)).toThrowError(/INVALID_DOOR_SWING/);

    // Cas 2: direction invalide
    const badDirectionDoor: Door = {
      id: 'd_bad_dir',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      swing: { side: 'left', direction: 'upwards' as unknown as 'in' },
    };
    expect(() => validateDoor(badDirectionDoor, stateWithHostWall)).toThrowError(
      /INVALID_DOOR_SWING/,
    );
  });

  it('rejette un trumeau insuffisant entre deux ouvertures (INVALID_OPENING_CLEARANCE)', () => {
    const door1: Door = {
      id: 'd_clear_1',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 500,
      width: 900, // [500..1400]
      height: 2100,
      swing: { side: 'left', direction: 'in' },
    };

    const stateWithDoor1: BimState = {
      ...stateWithHostWall,
      doors: { d_clear_1: door1 },
    };

    // Deuxième porte à offsetAlong = 1420 mm (trumeau = 20 mm < MIN_OPENING_CLEARANCE = 50 mm)
    const doorTooClose: Door = {
      id: 'd_clear_2',
      category: 'door',
      kind: 'door',
      hostWallId: 'w_host',
      offsetAlong: 1420,
      width: 900,
      height: 2100,
      swing: { side: 'right', direction: 'in' },
    };

    expect(() => validateDoor(doorTooClose, stateWithDoor1)).toThrowError(
      /INVALID_OPENING_CLEARANCE/,
    );
  });

  it('canDeleteWall autorise la suppression du mur avec cascade d’ouvertures', () => {
    const check = canDeleteWall('w_host', stateWithHostWall);
    expect(check.allowed).toBe(true);

    const checkUnknown = canDeleteWall('w_unknown', stateWithHostWall);
    expect(checkUnknown.allowed).toBe(false);
  });
});
