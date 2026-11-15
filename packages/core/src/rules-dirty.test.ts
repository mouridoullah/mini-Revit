import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  Commands,
  type Wall,
  type Door,
  type WallType,
  type Level,
  BimValidationError,
  validateDirty,
  collectViolationsForDirty,
} from './index.js';

describe('Validation Différentielle Post-Condition (validateDirty / Phase 6.0b)', () => {
  it('T-DIRTY-01: validateDirty passe sans erreur sur des mutations valides', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w_valid_1',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    };

    const res = doc.execute(new Commands.AddWallCommand(wall));
    expect(res.changed).toContain('w_valid_1');
    expect(doc.getState().walls['w_valid_1']).toBeDefined();
  });

  it('T-DIRTY-02: validateDirty rejette un mur dégénéré (L=0) avec INVALID_WALL_LENGTH et offendingIds', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const zeroWall: Wall = {
      id: 'w_zero',
      typeId,
      levelId,
      start: { x: 1000, y: 1000 },
      end: { x: 1000, y: 1000 },
    };

    try {
      doc.execute(new Commands.AddWallCommand(zeroWall));
      expect.unreachable('Devait lever une BimValidationError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('INVALID_WALL_LENGTH');
      expect(bErr.offendingIds).toEqual(['w_zero']);
    }
  });

  it('T-DIRTY-03: validateDirty rejette une ouverture hors limites avec INVALID_OPENING_POSITION et offendingIds', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w_host',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const outDoor: Door = {
      id: 'd_out',
      hostWallId: 'w_host',
      offsetAlong: 1500,
      width: 900, // 1500 + 900 = 2400 > 2000 mm
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };

    try {
      doc.execute(new Commands.AddDoorCommand(outDoor));
      expect.unreachable('Devait lever INVALID_OPENING_POSITION');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('INVALID_OPENING_POSITION');
      expect(bErr.offendingIds).toBeDefined();
      expect(bErr.offendingIds).toContain('d_out');
    }
  });

  it('T-DIRTY-04: validateDirty rejette deux ouvertures en chevauchement avec OPENING_OVERLAP et offendingIds', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w_host_overlap',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const door1: Door = {
      id: 'd_1',
      hostWallId: 'w_host_overlap',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };
    doc.execute(new Commands.AddDoorCommand(door1));

    const door2: Door = {
      id: 'd_2',
      hostWallId: 'w_host_overlap',
      offsetAlong: 800, // Chevauchement avec d_1 [500, 1400]
      width: 900,
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'right', direction: 'out' },
    };

    try {
      doc.execute(new Commands.AddDoorCommand(door2));
      expect.unreachable('Devait lever OPENING_OVERLAP');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('OPENING_OVERLAP');
      expect(bErr.offendingIds).toBeDefined();
      expect(bErr.offendingIds).toContain('d_2');
      expect(bErr.offendingIds).toContain('d_1');
    }
  });

  it('T-DIRTY-05: validateDirty rejette le raccourcissement d un mur qui fait déborder une porte existante', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w_shrink',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const door: Door = {
      id: 'd_fixed',
      hostWallId: 'w_shrink',
      offsetAlong: 2500,
      width: 900, // [2500, 3400]
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };
    doc.execute(new Commands.AddDoorCommand(door));

    // Raccourcir le mur à 3000 mm -> la porte [2500, 3400] déborde
    try {
      doc.execute(new Commands.UpdateWallCommand('w_shrink', { end: { x: 3000, y: 0 } }));
      expect.unreachable('Devait rejeter le raccourcissement par validateDirty');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('INVALID_OPENING_POSITION');
      expect(bErr.offendingIds).toBeDefined();
      expect(bErr.offendingIds).toContain('d_fixed');
    }

    // Vérifier que le mur est resté à sa longueur initiale de 4000 mm
    expect(doc.getState().walls['w_shrink']?.end.x).toBe(4000);
  });

  it('T-DIRTY-06: validateDirty rejette la réduction de hauteur d un mur sous la hauteur d une porte existante', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'w_height',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const door: Door = {
      id: 'd_tall',
      hostWallId: 'w_height',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };
    doc.execute(new Commands.AddDoorCommand(door));

    // Réduire la hauteur du mur à 2000 mm (< 2100 mm de la porte)
    try {
      doc.execute(new Commands.UpdateWallCommand('w_height', { heightOverride: 2000 }));
      expect.unreachable('Devait rejeter la réduction de hauteur par validateDirty');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bErr = err as BimValidationError;
      expect(bErr.code).toBe('INVALID_OPENING_HEIGHT');
      expect(bErr.offendingIds).toBeDefined();
      expect(bErr.offendingIds).toContain('d_tall');
    }

    // Le mur conserve sa hauteur antérieure
    expect(doc.getState().walls['w_height']?.heightOverride).toBeUndefined();
  });

  it('T-DIRTY-07: Comportement différentiel : une violation préexistante non aggravée ne bloque pas une commande innocente', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    // On forge un état documentaire contenant directement une ouverture hors bornes (ex: import legacy)
    const corruptedWall: Wall = {
      id: 'w_legacy',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
    };
    const corruptedDoor: Door = {
      id: 'd_corrupted',
      hostWallId: 'w_legacy',
      offsetAlong: 1500,
      width: 900, // Déborde de 400 mm
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };

    const stateWithWarning = {
      ...state,
      walls: {
        ...state.walls,
        [corruptedWall.id]: corruptedWall,
      },
      doors: {
        ...state.doors,
        [corruptedDoor.id]: corruptedDoor,
      },
    };

    const docWithWarning = new BimDocument(stateWithWarning);

    // Une commande innocente sur un autre mur ne doit PAS être bloquée par l'erreur préexistante sur d_corrupted !
    const innocentWall: Wall = {
      id: 'w_innocent',
      typeId,
      levelId,
      start: { x: 0, y: 3000 },
      end: { x: 4000, y: 3000 },
    };

    expect(() => {
      docWithWarning.execute(new Commands.AddWallCommand(innocentWall));
    }).not.toThrow();

    expect(docWithWarning.getState().walls['w_innocent']).toBeDefined();
  });

  it('T-DIRTY-08: Comportement différentiel : une nouvelle violation sur un modèle avec avertissement existant est rejetée', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const corruptedWall: Wall = {
      id: 'w_legacy_2',
      typeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 2000, y: 0 },
    };
    const corruptedDoor: Door = {
      id: 'd_corrupted_2',
      hostWallId: 'w_legacy_2',
      offsetAlong: 1500,
      width: 900,
      height: 2100,
      category: 'door',
      kind: 'door',
      swing: { side: 'left', direction: 'in' },
    };

    const docWithWarning = new BimDocument({
      ...state,
      walls: { [corruptedWall.id]: corruptedWall },
      doors: { [corruptedDoor.id]: corruptedDoor },
    });

    // Ajout d'un mur invalide (longueur 0) -> rejet immédiat
    const badWall: Wall = {
      id: 'w_new_bad',
      typeId,
      levelId,
      start: { x: 100, y: 100 },
      end: { x: 100, y: 100 },
    };

    expect(() => {
      docWithWarning.execute(new Commands.AddWallCommand(badWall));
    }).toThrowError(/INVALID_WALL_LENGTH/);
  });

  it('T-DIRTY-09: Rejet atomique : en cas de rejet par validateDirty, aucun patch n est empilé dans l historique', () => {
    const doc = BimDocument.createDefaultProject();
    const initialUndoCount = doc.canUndo();
    expect(initialUndoCount).toBe(false);

    const badWall: Wall = {
      id: 'w_bad_atomic',
      typeId: 'wt_missing',
      levelId: 'lvl_missing',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
    };

    expect(() => doc.execute(new Commands.AddWallCommand(badWall))).toThrow();

    // Rien dans l'historique Undo
    expect(doc.canUndo()).toBe(false);
    expect(doc.getState().walls['w_bad_atomic']).toBeUndefined();
  });

  it('T-DIRTY-10: collectViolationsForDirty retourne toutes les violations du dirty set avec leurs offendingIds', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();

    const badWall: Wall = {
      id: 'w_test_violations',
      typeId: 'wt_non_existent',
      levelId: 'lvl_non_existent',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 }, // Longueur 0 ET clés étrangères inconnues
    };

    const draft = {
      ...state,
      walls: {
        ...state.walls,
        [badWall.id]: badWall,
      },
    };

    const violations = collectViolationsForDirty(draft, ['w_test_violations']);
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.some((v) => v.code === 'INVALID_WALL_LENGTH')).toBe(true);
    expect(violations.some((v) => v.code === 'UNKNOWN_WALL_TYPE')).toBe(true);
    for (const v of violations) {
      expect(v.offendingIds).toContain('w_test_violations');
    }
  });
});
