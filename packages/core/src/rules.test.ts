import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import {
  validateWall,
  validateWallType,
  validateLevel,
  canDeleteLevel,
  canDeleteWallType,
  BimValidationError,
} from './rules.js';
import { type BimState, type Wall, type WallType, type Level } from './types.js';

describe('Règles Métier BIM (rules.ts)', () => {
  const sampleLevel: Level = { id: 'lvl_1', name: 'RDC', elevation: 0 };
  const sampleType: WallType = { id: 'type_1', name: 'Mur 200', thickness: 200, height: 2800 };

  const validState: BimState = {
    schemaVersion: 1,
    units: 'mm',
    levels: { lvl_1: sampleLevel },
    wallTypes: { type_1: sampleType },
    walls: {},
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
});
