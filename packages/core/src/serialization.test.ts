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
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
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
      rooms: {},
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
      rooms: {},
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
      rooms: {},
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
      rooms: {},
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
      rooms: {},
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
      rooms: {},
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
      rooms: {},
    };
    expect(() => fromJSON(JSON.stringify(zeroLengthState))).toThrowError(/INVALID_WALL_LENGTH/);
  });

  /* =========================================================================
   * TESTS DE SÉRIALISATION PHASE 3.1 : PORTES ET FENÊTRES
   * ========================================================================= */

  it('toJSON et fromJSON gèrent fidèlement les portes et fenêtres avec intégrité référentielle', () => {
    const stateWithOpenings: BimState = {
      ...sampleState,
      doors: {
        door_01: {
          id: 'door_01',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_01',
          offsetAlong: 500,
          width: 900,
          height: 2150,
          swing: { side: 'right', direction: 'in' },
        },
      },
      windows: {
        win_01: {
          id: 'win_01',
          category: 'window',
          kind: 'window',
          hostWallId: 'w_01',
          offsetAlong: 2000,
          width: 1200,
          height: 1400,
          sillHeight: 900,
        },
      },
      rooms: {},
    };

    const json = toJSON(stateWithOpenings, true);
    expect(json).toContain('"door_01"');
    expect(json).toContain('"win_01"');

    const parsed = fromJSON(json);
    expect(parsed).toEqual(stateWithOpenings);
  });

  it('fromJSON rejette une porte référençant un hostWallId inexistant (UNKNOWN_HOST_WALL)', () => {
    const stateWithGhostDoor = {
      ...sampleState,
      doors: {
        door_orphan: {
          id: 'door_orphan',
          category: 'door',
          kind: 'door',
          hostWallId: 'non_existent_wall',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
      rooms: {},
    };

    expect(() => fromJSON(JSON.stringify(stateWithGhostDoor))).toThrowError(BimValidationError);
    expect(() => fromJSON(JSON.stringify(stateWithGhostDoor))).toThrowError(/UNKNOWN_HOST_WALL/);
  });

  it('fromJSON rejette une fenêtre référençant un hostWallId inexistant (UNKNOWN_HOST_WALL)', () => {
    const stateWithGhostWindow = {
      ...sampleState,
      windows: {
        win_orphan: {
          id: 'win_orphan',
          category: 'window',
          kind: 'window',
          hostWallId: 'non_existent_wall',
          offsetAlong: 500,
          width: 1000,
          height: 1200,
          sillHeight: 900,
        },
      },
      rooms: {},
    };

    expect(() => fromJSON(JSON.stringify(stateWithGhostWindow))).toThrowError(BimValidationError);
    expect(() => fromJSON(JSON.stringify(stateWithGhostWindow))).toThrowError(/UNKNOWN_HOST_WALL/);
  });

  it('fromJSON rejette une porte avec swing invalide (side OU direction) ou dimensions non-positives (MALFORMED_DOOR)', () => {
    // Cas 1: side invalide
    const badSideDoorState = {
      ...sampleState,
      doors: {
        door_bad_side: {
          id: 'door_bad_side',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_01',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'invalid_side', direction: 'in' },
        },
      },
      rooms: {},
    };
    expect(() => fromJSON(JSON.stringify(badSideDoorState))).toThrowError(/MALFORMED_DOOR/);

    // Cas 2: direction invalide
    const badDirDoorState = {
      ...sampleState,
      doors: {
        door_bad_dir: {
          id: 'door_bad_dir',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_01',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'invalid_dir' },
        },
      },
      rooms: {},
    };
    expect(() => fromJSON(JSON.stringify(badDirDoorState))).toThrowError(/MALFORMED_DOOR/);

    // Cas 3: dimensions nulles ou négatives
    const badDimDoorState = {
      ...sampleState,
      doors: {
        door_bad_dim: {
          id: 'door_bad_dim',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_01',
          offsetAlong: 500,
          width: -100,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
      rooms: {},
    };
    expect(() => fromJSON(JSON.stringify(badDimDoorState))).toThrowError(/MALFORMED_DOOR/);
  });

  it('fromJSON rejette une porte dont la propriété swing est absente ou indéfinie (MALFORMED_DOOR)', () => {
    const missingSwingDoorState = {
      ...sampleState,
      doors: {
        door_no_swing: {
          id: 'door_no_swing',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_01',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          // swing absent
        },
      },
      rooms: {},
    };
    expect(() => fromJSON(JSON.stringify(missingSwingDoorState))).toThrowError(/MALFORMED_DOOR/);
  });

  it('rétrocompatibilité fromJSON sur un fichier Phase 2 réel (4 murs de demoDocument, sans clés doors/windows)', () => {
    // JSON canonique Phase 2.4 dépourvu des clés doors et windows
    const phase2Json = JSON.stringify({
      schemaVersion: 1,
      units: 'mm',
      levels: {
        lvl_default: { id: 'lvl_default', name: 'Niveau 0 (RDC)', elevation: 0 },
      },
      wallTypes: {
        wt_default: {
          id: 'wt_default',
          name: 'Générique - 200mm',
          thickness: 200,
          height: 2800,
        },
      },
      walls: {
        wall_south: {
          id: 'wall_south',
          category: 'wall',
          typeId: 'wt_default',
          levelId: 'lvl_default',
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        },
        wall_east: {
          id: 'wall_east',
          category: 'wall',
          typeId: 'wt_default',
          levelId: 'lvl_default',
          start: { x: 6000, y: 0 },
          end: { x: 6000, y: 4000 },
        },
        wall_north: {
          id: 'wall_north',
          category: 'wall',
          typeId: 'wt_default',
          levelId: 'lvl_default',
          start: { x: 6000, y: 4000 },
          end: { x: 0, y: 4000 },
        },
        wall_west: {
          id: 'wall_west',
          category: 'wall',
          typeId: 'wt_default',
          levelId: 'lvl_default',
          start: { x: 0, y: 4000 },
          end: { x: 0, y: 0 },
        },
      },
    });

    // 1. fromJSON charge l'état avec succès
    const loadedState = fromJSON(phase2Json);
    expect(loadedState.schemaVersion).toBe(1);
    expect(Object.keys(loadedState.walls)).toHaveLength(4);

    // 2. Initialisation automatique de doors et windows à {}
    expect(loadedState.doors).toEqual({});
    expect(loadedState.windows).toEqual({});

    // 3. toJSON après chargement produit un JSON contenant explicitement "doors":{} et "windows":{}
    const reserializedJson = toJSON(loadedState);
    expect(reserializedJson).toContain('"doors":{}');
    expect(reserializedJson).toContain('"windows":{}');

    // 4. Stabilité intégrale du round-trip
    const reloadedState = fromJSON(reserializedJson);
    expect(reloadedState).toEqual(loadedState);
  });
});
