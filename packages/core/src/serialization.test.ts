import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { toJSON, fromJSON } from './serialization.js';
import { BimValidationError } from './rules.js';
import { type BimState } from './types.js';

describe('Sérialisation et Désérialisation (serialization.ts)', () => {
  const sampleState: BimState = {
    schemaVersion: 2,
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
    slabTypes: {
      'default-slab-type': {
        id: 'default-slab-type',
        name: 'Dalle BA 200mm',
        thickness: 200,
      },
    },
    doorTypes: {},
    windowTypes: {},
    stairTypes: {},
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
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
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
    expect(jsonPretty).toContain('  "schemaVersion": 2');

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
      schemaVersion: 3,
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
    };
    expect(() => fromJSON(JSON.stringify(zeroLengthState))).toThrowError(/INVALID_WALL_LENGTH/);
  });

  /* =========================================================================
   * TESTS DE SÉRIALISATION PHASE 3.1 : PORTES ET FENÊTRES
   * ========================================================================= */

  it('toJSON et fromJSON gèrent fidèlement les portes et fenêtres avec intégrité référentielle', () => {
    const stateWithOpenings: BimState = {
      ...sampleState,
      doorTypes: {
        dt_01: {
          id: 'dt_01',
          name: 'Porte 900×2150 mm',
          width: 900,
          height: 2150,
        },
      },
      windowTypes: {
        wt_01: {
          id: 'wt_01',
          name: 'Fenêtre 1200×1400 mm',
          width: 1200,
          height: 1400,
          defaultSillHeight: 900,
        },
      },
      doors: {
        door_01: {
          id: 'door_01',
          category: 'door',
          doorTypeId: 'dt_01',
          hostWallId: 'w_01',
          offsetAlong: 500,
          swing: { side: 'right', direction: 'in' },
        },
      },
      windows: {
        win_01: {
          id: 'win_01',
          category: 'window',
          windowTypeId: 'wt_01',
          hostWallId: 'w_01',
          offsetAlong: 2000,
          sillHeight: 900,
        },
      },
      rooms: {},
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
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
      stairTypes: {},
      stairs: {},
    };

    expect(() => fromJSON(JSON.stringify(stateWithGhostWindow))).toThrowError(BimValidationError);
    expect(() => fromJSON(JSON.stringify(stateWithGhostWindow))).toThrowError(/UNKNOWN_HOST_WALL/);
  });

  it('fromJSON rejette une porte avec swing invalide (side OU direction) ou dimensions non-positives (MALFORMED_DOOR)', () => {
    // Cas 1: side invalide
    const badSideDoorState = {
      ...sampleState,
      schemaVersion: 1,
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
      stairTypes: {},
      stairs: {},
    };
    expect(() => fromJSON(JSON.stringify(badSideDoorState))).toThrowError(/MALFORMED_DOOR/);

    // Cas 2: direction invalide
    const badDirDoorState = {
      ...sampleState,
      schemaVersion: 1,
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
      stairTypes: {},
      stairs: {},
    };
    expect(() => fromJSON(JSON.stringify(badDirDoorState))).toThrowError(/MALFORMED_DOOR/);

    // Cas 3: dimensions nulles ou négatives
    const badDimDoorState = {
      ...sampleState,
      schemaVersion: 1,
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
      stairTypes: {},
      stairs: {},
    };
    expect(() => fromJSON(JSON.stringify(badDimDoorState))).toThrowError(/MALFORMED_DOOR/);
  });

  it('fromJSON rejette une porte dont la propriété swing est absente ou indéfinie (MALFORMED_DOOR)', () => {
    const missingSwingDoorState = {
      ...sampleState,
      schemaVersion: 1,
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
      stairTypes: {},
      stairs: {},
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

    // 1. fromJSON charge l'état avec succès et le migre automatiquement vers v2
    const loadedState = fromJSON(phase2Json);
    expect(loadedState.schemaVersion).toBe(2);
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

  /* =========================================================================
   * TESTS DE SÉRIALISATION PHASE 6.1a : T-SER-01 à T-SER-03
   * ========================================================================= */

  it('T-SER-01 : fromJSON sur un document schéma v2 valide le charge sans modification', () => {
    const rawV2 = toJSON(sampleState);
    const loaded = fromJSON(rawV2);
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded).toEqual(sampleState);
  });

  it('T-SER-02 : fromJSON sur un document schéma v1 avec 2 portes identiques synthétise 1 seul DoorType', () => {
    const v1WithDoors = JSON.stringify({
      schemaVersion: 1,
      units: 'mm',
      levels: { lvl_1: { id: 'lvl_1', name: 'RDC', elevation: 0 } },
      wallTypes: { wt_1: { id: 'wt_1', name: 'Mur 200', thickness: 200, height: 2800 } },
      walls: {
        w_1: {
          id: 'w_1',
          category: 'wall',
          typeId: 'wt_1',
          levelId: 'lvl_1',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: {
        d_1: {
          id: 'd_1',
          category: 'door',
          hostWallId: 'w_1',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
        d_2: {
          id: 'd_2',
          category: 'door',
          hostWallId: 'w_1',
          offsetAlong: 2500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
      windows: {},
    });

    const migrated = fromJSON(v1WithDoors);
    expect(migrated.schemaVersion).toBe(2);
    // Un seul DoorType synthétisé pour 900x2100
    expect(Object.keys(migrated.doorTypes)).toHaveLength(1);
    const synthesizedTypeId = Object.keys(migrated.doorTypes)[0]!;
    expect(migrated.doorTypes[synthesizedTypeId]).toEqual({
      id: 'door-type-900x2100',
      name: 'Porte 900×2100 mm',
      width: 900,
      height: 2100,
    });
    // Les deux portes pointent vers ce même type
    expect(migrated.doors['d_1']?.doorTypeId).toBe('door-type-900x2100');
    expect(migrated.doors['d_2']?.doorTypeId).toBe('door-type-900x2100');
  });

  it('T-SER-03 : fromJSON rejette rigoureusement un schéma futur v3 ou non supporté avec UNSUPPORTED_SCHEMA_VERSION', () => {
    const v3Doc = JSON.stringify({
      ...sampleState,
      schemaVersion: 3,
    });
    expect(() => fromJSON(v3Doc)).toThrowError(BimValidationError);
    expect(() => fromJSON(v3Doc)).toThrowError(/UNSUPPORTED_SCHEMA_VERSION/);

    const v99Doc = JSON.stringify({
      ...sampleState,
      schemaVersion: 99,
    });
    expect(() => fromJSON(v99Doc)).toThrowError(/UNSUPPORTED_SCHEMA_VERSION/);
  });

  /* =========================================================================
   * TESTS DE SÉRIALISATION PHASE 7.6 : INTÉGRITÉ RÉFÉRENTIELLE STRICTE (Chantier 7.6-D)
   * ========================================================================= */

  it('T-SER-7.6-01 : fromJSON rejette un mur avec topConstraint vers un niveau inexistant (UNKNOWN_LEVEL)', () => {
    const invalidDoc = JSON.stringify({
      ...sampleState,
      walls: {
        ...sampleState.walls,
        w_dangling: {
          id: 'w_dangling',
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
          topConstraint: { kind: 'level', levelId: 'lvl_ghost' },
        },
      },
    });
    expect(() => fromJSON(invalidDoc)).toThrowError(BimValidationError);
    expect(() => fromJSON(invalidDoc)).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('T-SER-7.6-02 : fromJSON rejette un mur avec topConstraint vers une toiture inexistante (UNKNOWN_ROOF)', () => {
    const invalidDoc = JSON.stringify({
      ...sampleState,
      walls: {
        ...sampleState.walls,
        w_dangling: {
          id: 'w_dangling',
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
          topConstraint: { kind: 'roof', roofId: 'roof_ghost' },
        },
      },
    });
    expect(() => fromJSON(invalidDoc)).toThrowError(BimValidationError);
    expect(() => fromJSON(invalidDoc)).toThrowError(/UNKNOWN_ROOF/);
  });

  it('T-SER-7.6-03 : fromJSON rejette une cotation référençant un mur inexistant (UNKNOWN_REFERENCED_ELEMENT)', () => {
    const invalidDoc = JSON.stringify({
      ...sampleState,
      dimensions: {
        dim_ghost: {
          id: 'dim_ghost',
          category: 'dimension',
          levelId: 'lvl_01',
          references: ['wall_ghost'],
          offset: 200,
          value: 4000,
        },
      },
    });
    expect(() => fromJSON(invalidDoc)).toThrowError(BimValidationError);
    expect(() => fromJSON(invalidDoc)).toThrowError(/UNKNOWN_REFERENCED_ELEMENT/);
  });

  it('T-SER-7.6-04 : fromJSON rejette un escalier référençant un stairType ou un niveau inexistant', () => {
    const invalidDoc = JSON.stringify({
      ...sampleState,
      stairs: {
        stair_ghost: {
          id: 'stair_ghost',
          category: 'stair',
          stairTypeId: 'st_ghost',
          bottomLevelId: 'lvl_01',
          topLevelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
        },
      },
    });
    expect(() => fromJSON(invalidDoc)).toThrowError(BimValidationError);
    expect(() => fromJSON(invalidDoc)).toThrowError(/UNKNOWN_STAIR_TYPE/);
  });

  it('T-SER-7.6-05 : fromJSON rejette une toiture référençant un roofType ou un niveau inexistant', () => {
    const invalidDoc = JSON.stringify({
      ...sampleState,
      roofs: {
        roof_ghost: {
          id: 'roof_ghost',
          category: 'roof',
          roofTypeId: 'rt_ghost',
          levelId: 'lvl_01',
          footprint: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 4000 },
          ],
        },
      },
    });
    expect(() => fromJSON(invalidDoc)).toThrowError(BimValidationError);
    expect(() => fromJSON(invalidDoc)).toThrowError(/UNKNOWN_ROOF_TYPE/);
  });

  /* =========================================================================
   * TESTS DE MATRICE D'INTÉGRITÉ RÉFÉRENTIELLE EXHAUSTIVE PHASE 7.6.1
   * ========================================================================= */

  it('T-SER-7.6.1-01 : fromJSON rejette une dalle avec slabType ou niveau orphelin', () => {
    const invalidSlabType = JSON.stringify({
      ...sampleState,
      slabs: {
        sl_ghost: {
          id: 'sl_ghost',
          category: 'slab',
          slabTypeId: 'st_ghost',
          levelId: 'lvl_01',
          boundary: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }],
        },
      },
    });
    expect(() => fromJSON(invalidSlabType)).toThrowError(/UNKNOWN_SLAB_TYPE/);

    const invalidSlabLevel = JSON.stringify({
      ...sampleState,
      slabs: {
        sl_ghost: {
          id: 'sl_ghost',
          category: 'slab',
          slabTypeId: 'default-slab-type',
          levelId: 'lvl_ghost',
          boundary: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }],
        },
      },
    });
    expect(() => fromJSON(invalidSlabLevel)).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('T-SER-7.6.1-02 : fromJSON rejette une ouverture de toit (RoofOpening) orpheline', () => {
    const invalidRoofOpening = JSON.stringify({
      ...sampleState,
      roofOpenings: {
        ro_ghost: {
          id: 'ro_ghost',
          category: 'roofOpening',
          roofId: 'roof_ghost',
          uAlong: 1000,
          vSlope: 1000,
          width: 800,
          height: 1200,
        },
      },
    });
    expect(() => fromJSON(invalidRoofOpening)).toThrowError(/UNKNOWN_ROOF/);
  });

  it('T-SER-7.6.1-03 : fromJSON rejette une porte ou fenêtre avec mur hôte ou type orphelin', () => {
    const invalidHost = JSON.stringify({
      ...sampleState,
      doors: {
        d_ghost: {
          id: 'd_ghost',
          category: 'door',
          hostWallId: 'wall_ghost',
          doorTypeId: 'dt_01',
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        },
      },
    });
    expect(() => fromJSON(invalidHost)).toThrowError(/UNKNOWN_HOST_WALL/);

    const invalidDoorType = JSON.stringify({
      ...sampleState,
      doors: {
        d_ghost: {
          id: 'd_ghost',
          category: 'door',
          hostWallId: 'w_01',
          doorTypeId: 'dt_ghost',
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        },
      },
    });
    expect(() => fromJSON(invalidDoorType)).toThrowError(/UNKNOWN_DOOR_TYPE/);
  });

  it('T-SER-7.6.1-04 : Migration Schema V1 vers V2 via fromJSON sans perte ni erreur de clé étrangère', () => {
    const legacyV1 = JSON.stringify({
      schemaVersion: 1,
      units: 'mm',
      levels: {
        lvl_v1: { id: 'lvl_v1', name: 'RDC V1', elevation: 0, height: 2800 },
      },
      wallTypes: {
        wt_v1: { id: 'wt_v1', name: 'Mur V1', thickness: 200, height: 2800 },
      },
      walls: {
        w_v1: {
          id: 'w_v1',
          category: 'wall',
          typeId: 'wt_v1',
          levelId: 'lvl_v1',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: {
        d_v1: {
          id: 'd_v1',
          category: 'door',
          hostWallId: 'w_v1',
          offsetAlong: 1000,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
      windows: {
        win_v1: {
          id: 'win_v1',
          category: 'window',
          hostWallId: 'w_v1',
          offsetAlong: 3000,
          width: 1200,
          height: 1400,
          sillHeight: 900,
        },
      },
    });

    const migrated = fromJSON(legacyV1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.walls['w_v1']).toBeDefined();
    expect(migrated.doors['d_v1']).toBeDefined();
    expect(migrated.windows['win_v1']).toBeDefined();

    // Vérifie que les DoorTypes et WindowTypes synthétisés satisfont strictement les contrôles de clés étrangères
    expect(migrated.doorTypes).toBeDefined();
    expect(Object.keys(migrated.doorTypes).length).toBe(1);
    expect(migrated.doors['d_v1']?.doorTypeId).toBeDefined();
    expect(migrated.doorTypes[migrated.doors['d_v1']!.doorTypeId]).toBeDefined();

    expect(migrated.windowTypes).toBeDefined();
    expect(Object.keys(migrated.windowTypes).length).toBe(1);
    expect(migrated.windows['win_v1']?.windowTypeId).toBeDefined();
    expect(migrated.windowTypes[migrated.windows['win_v1']!.windowTypeId]).toBeDefined();

    // Round-trip complet sans altération
    const reserialized = toJSON(migrated);
    const reloaded = fromJSON(reserialized);
    expect(reloaded).toEqual(migrated);
  });

  it('préserve les SectionCuts en round-trip toJSON / fromJSON (ADR-063)', () => {
    const stateWithCut: BimState = {
      ...sampleState,
      sectionCuts: {
        cut_01: {
          id: 'cut_01',
          category: 'sectionCut',
          name: "Coupe A-A'",
          label: 'A',
          kind: 'section',
          start: vec2(0, 2000),
          end: vec2(6000, 2000),
          viewDirection: 1,
          depth: 8000,
          zMin: -200,
          zMax: 6000,
          autoGenerated: true,
        },
      },
    };

    const jsonStr = toJSON(stateWithCut);
    const restored = fromJSON(jsonStr);
    expect(restored.sectionCuts?.['cut_01']).toBeDefined();
    expect(restored.sectionCuts?.['cut_01']?.name).toBe("Coupe A-A'");
    expect(restored.sectionCuts?.['cut_01']?.depth).toBe(8000);
    expect(restored.sectionCuts?.['cut_01']?.autoGenerated).toBe(true);
    expect(restored).toEqual(stateWithCut);
  });

  it('rejette un SectionCut avec autoGenerated invalide non-booléen (ADR-069)', () => {
    const invalidJson = JSON.stringify({
      ...sampleState,
      sectionCuts: {
        cut_bad: {
          id: 'cut_bad',
          category: 'sectionCut',
          name: 'Coupe Invalide',
          label: 'X',
          kind: 'section',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          viewDirection: 1,
          depth: 1000,
          autoGenerated: 'oui', // non booléen
        },
      },
    });

    expect(() => fromJSON(invalidJson)).toThrow(BimValidationError);
    expect(() => fromJSON(invalidJson)).toThrow(/autoGenerated must be a boolean/);
  });

  it('préserve les entités MEP LOD 350 en round-trip toJSON / fromJSON (fittings, cableTrays, equipments)', () => {
    const stateWithMep: BimState = {
      ...sampleState,
      cableTrays: {
        ct_01: {
          id: 'ct_01',
          category: 'cableTray',
          levelId: 'lvl_01',
          systemId: 'sys_elec',
          start: { x: 0, y: 0, z: 2500 },
          end: { x: 3000, y: 0, z: 2500 },
          width: 300,
          height: 60,
          style: 'ladder',
          ports: [],
        },
        ct_02: {
          id: 'ct_02',
          category: 'cableTray',
          levelId: 'lvl_01',
          systemId: 'sys_elec',
          start: { x: 0, y: 1000, z: 2500 },
          end: { x: 3000, y: 1000, z: 2500 },
          width: 200,
          height: 50,
          style: 'perforated',
          ports: [],
        },
      },
      mepFittings: {
        fit_elbow_01: {
          id: 'fit_elbow_01',
          category: 'mepFitting',
          levelId: 'lvl_01',
          fittingType: 'elbow',
          domain: 'hvac',
          systemType: 'supply_air',
          position: { x: 3000, y: 0, z: 2500 },
          ports: [
            { id: 'p0', elementId: 'fit_elbow_01', domain: 'hvac', systemType: 'supply_air', position: { x: 2800, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'round', diameter: 250 },
            { id: 'p1', elementId: 'fit_elbow_01', domain: 'hvac', systemType: 'supply_air', position: { x: 3000, y: 200, z: 2500 }, direction: { x: 0, y: 1, z: 0 }, shape: 'round', diameter: 250 },
          ],
        },
        fit_transition_01: {
          id: 'fit_transition_01',
          category: 'mepFitting',
          levelId: 'lvl_01',
          fittingType: 'transition',
          eccentricAlignment: 'flat_top',
          domain: 'hvac',
          systemType: 'supply_air',
          position: { x: 1000, y: 0, z: 2500 },
          ports: [
            { id: 't0', elementId: 'fit_transition_01', domain: 'hvac', systemType: 'supply_air', position: { x: 900, y: 0, z: 2500 }, direction: { x: -1, y: 0, z: 0 }, shape: 'rectangular', width: 400, height: 250 },
            { id: 't1', elementId: 'fit_transition_01', domain: 'hvac', systemType: 'supply_air', position: { x: 1100, y: 0, z: 2500 }, direction: { x: 1, y: 0, z: 0 }, shape: 'rectangular', width: 300, height: 200 },
          ],
        },
      },
      mepEquipments: {
        eq_valve_01: {
          id: 'eq_valve_01',
          category: 'mepEquipment',
          levelId: 'lvl_01',
          name: 'Clapet Anti-Retour DN50',
          family: 'check_valve',
          position: { x: 500, y: 0, z: 2500 },
          rotation: 0,
          width: 220,
          depth: 120,
          height: 140,
          ports: [],
        },
        eq_diffuser_01: {
          id: 'eq_diffuser_01',
          category: 'mepEquipment',
          levelId: 'lvl_01',
          name: 'Diffuseur 600x600',
          family: 'air_diffuser',
          position: { x: 1500, y: 2000, z: 2500 },
          rotation: 0,
          width: 600,
          depth: 600,
          height: 150,
          ports: [],
        },
        eq_jbox_01: {
          id: 'eq_jbox_01',
          category: 'mepEquipment',
          levelId: 'lvl_01',
          name: 'Boîte de dérivation',
          family: 'junction_box',
          position: { x: 2000, y: 500, z: 2500 },
          rotation: 0,
          width: 200,
          depth: 150,
          height: 100,
          ports: [],
        },
      },
    };

    const jsonStr = toJSON(stateWithMep);
    const restored = fromJSON(jsonStr);

    expect(restored.cableTrays?.['ct_01']?.style).toBe('ladder');
    expect(restored.cableTrays?.['ct_02']?.style).toBe('perforated');
    expect(restored.mepFittings?.['fit_elbow_01']?.fittingType).toBe('elbow');
    expect(restored.mepFittings?.['fit_transition_01']?.eccentricAlignment).toBe('flat_top');
    expect(restored.mepEquipments?.['eq_valve_01']?.family).toBe('check_valve');
    expect(restored.mepEquipments?.['eq_diffuser_01']?.family).toBe('air_diffuser');
    expect(restored.mepEquipments?.['eq_jbox_01']?.family).toBe('junction_box');
    expect(restored).toEqual(stateWithMep);
  });
});
