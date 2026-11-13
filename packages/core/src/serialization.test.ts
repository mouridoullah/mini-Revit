import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { toJSON, fromJSON } from './serialization.js';
import { BimValidationError } from './rules.js';
import { type BimState } from './types.js';

describe('Sérialisation et Désérialisation (serialization.ts)', () => {
  const sampleState: BimState = {
    schemaVersion: 1,
    units: 'mm',
    levels: {
      lvl_01: { id: 'lvl_01', name: 'Rez-de-chaussée', elevation: 0 },
      lvl_02: { id: 'lvl_02', name: 'Étage 1', elevation: 2800 },
    },
    wallTypes: {
      wt_01: {
        id: 'wt_01',
        name: 'Mur Béton 200mm',
        thickness: 200,
        height: 2800,
        layers: [{ materialId: 'mat_concrete', thickness: 200 }],
      },
    },
    walls: {
      w_01: {
        id: 'w_01',
        category: 'wall',
        typeId: 'wt_01',
        levelId: 'lvl_01',
        start: vec2(0, 0),
        end: vec2(5000, 0),
        baseOffset: 0,
        heightOverride: 2800,
      },
    },
  };

  it('aller-retour toJSON -> fromJSON préserve l’état à l’identique (deepEqual)', () => {
    const jsonStr = toJSON(sampleState);
    expect(typeof jsonStr).toBe('string');

    const restoredState = fromJSON(jsonStr);
    expect(restoredState).toEqual(sampleState);
  });

  it('toJSON avec mise en page pretty produit un JSON valide et indenté', () => {
    const jsonPretty = toJSON(sampleState, true);
    expect(jsonPretty).toContain('\n');
    expect(jsonPretty).toContain('  "schemaVersion": 1');

    const restored = fromJSON(jsonPretty);
    expect(restored).toEqual(sampleState);
  });

  it('rejette une chaîne non-JSON ou corrompue', () => {
    expect(() => fromJSON('{ corrupt json ')).toThrowError(BimValidationError);
    expect(() => fromJSON('{ corrupt json ')).toThrowError(/INVALID_JSON/);
  });

  it('rejette un état JSON non-objet (ex: tableau ou primitif)', () => {
    expect(() => fromJSON('[1, 2, 3]')).toThrowError(/MALFORMED_STATE/);
    expect(() => fromJSON('"just a string"')).toThrowError(/MALFORMED_STATE/);
  });

  it('rejette une version de schéma non supportée', () => {
    const futureSchema = JSON.stringify({
      ...sampleState,
      schemaVersion: 2,
    });

    expect(() => fromJSON(futureSchema)).toThrowError(BimValidationError);
    expect(() => fromJSON(futureSchema)).toThrowError(/UNSUPPORTED_SCHEMA_VERSION/);
  });

  it('rejette des unités de mesure incompatibles', () => {
    const imperialSchema = JSON.stringify({
      ...sampleState,
      units: 'inch',
    });

    expect(() => fromJSON(imperialSchema)).toThrowError(BimValidationError);
    expect(() => fromJSON(imperialSchema)).toThrowError(/INVALID_UNITS/);
  });

  it('rejette un JSON dont les dictionnaires principaux sont manquants', () => {
    const missingWalls = JSON.stringify({
      schemaVersion: 1,
      units: 'mm',
      levels: {},
      wallTypes: {},
    });

    expect(() => fromJSON(missingWalls)).toThrowError(BimValidationError);
    expect(() => fromJSON(missingWalls)).toThrowError(/MISSING_REQUIRED_FIELDS/);
  });

  it('rejette un mur dont les propriétés obligatoires sont manquantes', () => {
    const badWallState = {
      schemaVersion: 1,
      units: 'mm',
      levels: {},
      wallTypes: {},
      walls: {
        bad_w: {
          id: 'bad_w',
          category: 'wall',
          // typeId et levelId manquants !
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
      },
    };

    expect(() => fromJSON(JSON.stringify(badWallState))).toThrowError(BimValidationError);
    expect(() => fromJSON(JSON.stringify(badWallState))).toThrowError(/MALFORMED_WALL/);
  });

  it('rejette un mur référençant un WallType ou un Level inexistant (intégrité référentielle)', () => {
    const orphanTypeState = {
      ...sampleState,
      walls: {
        w_orphan: {
          id: 'w_orphan',
          category: 'wall',
          typeId: 'wt_unknown',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(orphanTypeState))).toThrowError(/UNKNOWN_WALL_TYPE/);

    const orphanLevelState = {
      ...sampleState,
      walls: {
        w_orphan: {
          id: 'w_orphan',
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_unknown',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(orphanLevelState))).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('rejette un mur avec category invalide ou coordonnées non-finies / NaN', () => {
    const badCategoryState = {
      ...sampleState,
      walls: {
        w_cat: {
          ...sampleState.walls['w_01'],
          category: 'door',
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(badCategoryState))).toThrowError(/MALFORMED_WALL/);

    const nanCoordState = {
      ...sampleState,
      walls: {
        w_nan: {
          ...sampleState.walls['w_01'],
          start: { x: Number.NaN, y: 0 },
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(nanCoordState))).toThrowError(/MALFORMED_WALL/);
  });

  it('rejette une discordance entre la clé du dictionnaire et l’id interne de l’élément', () => {
    const keyMismatchState = {
      ...sampleState,
      levels: {
        key_01: {
          id: 'internal_id_different',
          name: 'Niveau Mismatch',
          elevation: 0,
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(keyMismatchState))).toThrowError(/MALFORMED_LEVEL/);
  });

  it('rejette un mur de longueur nulle dans le fichier sérialisé', () => {
    const zeroLengthState = {
      ...sampleState,
      walls: {
        w_zero: {
          ...sampleState.walls['w_01'],
          id: 'w_zero',
          start: { x: 1000, y: 1000 },
          end: { x: 1000, y: 1000 },
        },
      },
    };
    expect(() => fromJSON(JSON.stringify(zeroLengthState))).toThrowError(/INVALID_WALL_LENGTH/);
  });
});
