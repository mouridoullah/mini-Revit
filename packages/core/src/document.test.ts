import { describe, it, expect, vi } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { BimDocument } from './document.js';
import * as Commands from './commands.js';
import { type Wall, type WallType, type Level, type Door, type Window } from './types.js';
import { DependencyGraph } from './dag/DependencyGraph.js';

describe('BimDocument & CommandBus (document.ts)', () => {
  it('constructeur initialise un état vide valide', () => {
    const doc = new BimDocument();
    const state = doc.getState();

    expect(state.schemaVersion).toBe(2);
    expect(state.units).toBe('mm');
    expect(state.levels).toEqual({});
    expect(state.wallTypes).toEqual({});
    expect(state.walls).toEqual({});
    expect(doc.canUndo()).toBe(false);
    expect(doc.canRedo()).toBe(false);
  });

  it('createDefaultProject fournit un niveau et un type de mur prêts à l’emploi', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();

    const levelIds = Object.keys(state.levels);
    const typeIds = Object.keys(state.wallTypes);

    expect(levelIds).toHaveLength(1);
    expect(typeIds).toHaveLength(1);
    expect(state.walls).toEqual({});

    const defaultLevel = state.levels[levelIds[0]!];
    expect(defaultLevel?.elevation).toBe(0);

    const defaultType = state.wallTypes[typeIds[0]!];
    expect(defaultType?.thickness).toBe(200);
  });

  it('cycle complet : AddWall, UpdateWall, DeleteWall avec notification et undo/redo', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const subscriber = vi.fn();
    const unsubscribe = doc.subscribe(subscriber);

    // 1. AddWall
    const wallId = 'wall_01';
    const wall: Wall = {
      id: wallId,
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };

    const addRes = doc.execute(new Commands.AddWallCommand(wall));
    expect(addRes.changed).toEqual([wallId]);
    expect(doc.getState().walls[wallId]).toBeDefined();
    expect(doc.getState().walls[wallId]?.end.x).toBe(5000);
    expect(subscriber).toHaveBeenCalledWith([wallId]);

    // 2. UpdateWall
    const updateRes = doc.execute(
      new Commands.UpdateWallCommand(wallId, {
        end: vec2(6000, 0),
      }),
    );
    expect(updateRes.changed).toEqual([wallId]);
    expect(doc.getState().walls[wallId]?.end.x).toBe(6000);

    // 3. Undo de UpdateWall -> retour à end.x = 5000
    expect(doc.canUndo()).toBe(true);
    const undoUpdate = doc.undo();
    expect(undoUpdate).toBe(true);
    expect(doc.getState().walls[wallId]?.end.x).toBe(5000);

    // 4. Redo de UpdateWall -> retour à end.x = 6000
    expect(doc.canRedo()).toBe(true);
    const redoUpdate = doc.redo();
    expect(redoUpdate).toBe(true);
    expect(doc.getState().walls[wallId]?.end.x).toBe(6000);

    // 5. DeleteWall
    const delRes = doc.execute(new Commands.DeleteWallCommand(wallId));
    expect(delRes.changed).toEqual([wallId]);
    expect(doc.getState().walls[wallId]).toBeUndefined();

    // 6. Undo de DeleteWall -> le mur réapparaît à 6000
    doc.undo();
    expect(doc.getState().walls[wallId]).toBeDefined();
    expect(doc.getState().walls[wallId]?.end.x).toBe(6000);

    // 7. Désinscription
    unsubscribe();
    subscriber.mockClear();
    doc.execute(new Commands.DeleteWallCommand(wallId));
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('gère l’ajout, mise à jour et suppression conditionnelle de Level et WallType', () => {
    const doc = new BimDocument();

    const lvl: Level = { id: 'lvl_etage1', name: 'Étage 1', elevation: 3000 };
    doc.execute(new Commands.AddLevelCommand(lvl));
    expect(doc.getState().levels['lvl_etage1']).toBeDefined();

    doc.execute(new Commands.UpdateLevelCommand('lvl_etage1', { name: 'Premier Étage' }));
    expect(doc.getState().levels['lvl_etage1']?.name).toBe('Premier Étage');

    const wt: WallType = { id: 'wt_ba13', name: 'Placo BA13', thickness: 72, height: 2600 };
    doc.execute(new Commands.AddWallTypeCommand(wt));
    expect(doc.getState().wallTypes['wt_ba13']).toBeDefined();

    doc.execute(new Commands.UpdateWallTypeCommand('wt_ba13', { thickness: 100 }));
    expect(doc.getState().wallTypes['wt_ba13']?.thickness).toBe(100);

    // Suppressions libres car aucun mur rattaché
    doc.execute(new Commands.DeleteLevelCommand('lvl_etage1'));
    expect(doc.getState().levels['lvl_etage1']).toBeUndefined();

    doc.execute(new Commands.DeleteWallTypeCommand('wt_ba13'));
    expect(doc.getState().wallTypes['wt_ba13']).toBeUndefined();
  });

  it('toJSON et fromJSON permettent la persistance complète du document', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'wall_persist',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 4000),
      }),
    );

    const json = doc.toJSON();
    const restoredDoc = BimDocument.fromJSON(json);

    expect(restoredDoc.getState()).toEqual(doc.getState());
  });

  it('execute(AddWallCommand) rejette un mur de longueur nulle', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    expect(() =>
      doc.execute(
        new Commands.AddWallCommand({
          id: 'w_bad_len',
          category: 'wall',
          typeId,
          levelId,
          start: vec2(100, 100),
          end: vec2(100, 100),
        }),
      ),
    ).toThrowError(/INVALID_WALL_LENGTH/);
  });

  it('execute(AddWallCommand) rejette un mur référençant un WallType inexistant', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;

    expect(() =>
      doc.execute(
        new Commands.AddWallCommand({
          id: 'w_bad_type',
          category: 'wall',
          typeId: 'non_existent_type',
          levelId,
          start: vec2(0, 0),
          end: vec2(1000, 0),
        }),
      ),
    ).toThrowError(/UNKNOWN_WALL_TYPE/);
  });

  it('execute(AddWallCommand) rejette un mur référençant un Level inexistant', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;

    expect(() =>
      doc.execute(
        new Commands.AddWallCommand({
          id: 'w_bad_lvl',
          category: 'wall',
          typeId,
          levelId: 'non_existent_level',
          start: vec2(0, 0),
          end: vec2(1000, 0),
        }),
      ),
    ).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('execute(UpdateWallCommand) rejette une mise à jour réduisant la longueur à zéro', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wallId = 'w_valid_1';
    doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    expect(() =>
      doc.execute(
        new Commands.UpdateWallCommand(wallId, {
          end: vec2(0, 0),
        }),
      ),
    ).toThrowError(/INVALID_WALL_LENGTH/);
  });

  it('execute(DeleteLevelCommand) rejette la suppression si des murs y sont rattachés', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_attached',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0),
      }),
    );

    expect(() => doc.execute(new Commands.DeleteLevelCommand(levelId))).toThrowError(
      /DELETE_LEVEL_REJECTED/,
    );
  });

  it('execute(DeleteWallTypeCommand) rejette la suppression si des murs l’utilisent', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_attached',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0),
      }),
    );

    expect(() => doc.execute(new Commands.DeleteWallTypeCommand(typeId))).toThrowError(
      /DELETE_WALL_TYPE_REJECTED/,
    );
  });

  it('execute(AddLevelCommand et UpdateLevelCommand) valide les paramètres de niveau', () => {
    const doc = new BimDocument();

    // Rejet nom vide
    expect(() =>
      doc.execute(new Commands.AddLevelCommand({ id: 'lvl_bad_name', name: '', elevation: 0 })),
    ).toThrowError(/INVALID_LEVEL_NAME/);

    // Rejet élévation NaN
    expect(() =>
      doc.execute(
        new Commands.AddLevelCommand({ id: 'lvl_nan', name: 'Étage NaN', elevation: Number.NaN }),
      ),
    ).toThrowError(/INVALID_LEVEL_ELEVATION/);

    // Ajout valide
    doc.execute(new Commands.AddLevelCommand({ id: 'lvl_valid', name: 'RDC', elevation: 0 }));

    // Rejet mise à jour invalide
    expect(() =>
      doc.execute(new Commands.UpdateLevelCommand('lvl_valid', { elevation: Number.NaN })),
    ).toThrowError(/INVALID_LEVEL_ELEVATION/);
  });

  it('execute(AddWallTypeCommand et UpdateWallTypeCommand) valide les paramètres de type de mur', () => {
    const doc = new BimDocument();

    // Rejet nom vide
    expect(() =>
      doc.execute(
        new Commands.AddWallTypeCommand({ id: 'wt_bad', name: '', thickness: 200, height: 2800 }),
      ),
    ).toThrowError(/INVALID_WALL_TYPE_NAME/);

    // Rejet épaisseur négative
    expect(() =>
      doc.execute(
        new Commands.AddWallTypeCommand({
          id: 'wt_neg_t',
          name: 'Négatif',
          thickness: -10,
          height: 2800,
        }),
      ),
    ).toThrowError(/INVALID_WALL_TYPE_THICKNESS/);

    // Rejet hauteur nulle
    expect(() =>
      doc.execute(
        new Commands.AddWallTypeCommand({
          id: 'wt_zero_h',
          name: 'Zéro H',
          thickness: 200,
          height: 0,
        }),
      ),
    ).toThrowError(/INVALID_WALL_TYPE_HEIGHT/);

    // Ajout valide
    doc.execute(
      new Commands.AddWallTypeCommand({
        id: 'wt_valid',
        name: 'Mur 200',
        thickness: 200,
        height: 2800,
      }),
    );

    // Rejet mise à jour invalide
    expect(() =>
      doc.execute(new Commands.UpdateWallTypeCommand('wt_valid', { thickness: 0 })),
    ).toThrowError(/INVALID_WALL_TYPE_THICKNESS/);
  });

  it('isolation des abonnés : un subscriber défaillant qui throw ne casse pas execute ni les autres subscribers', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const healthySubscriber1 = vi.fn();
    const faultySubscriber = vi.fn(() => {
      throw new Error('Explosion dans le subscriber UI');
    });
    const healthySubscriber2 = vi.fn();

    // Supprimer temporairement le console.error dans ce test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    doc.subscribe(healthySubscriber1);
    doc.subscribe(faultySubscriber);
    doc.subscribe(healthySubscriber2);

    const wallId = 'wall_isolated';
    const res = doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(2000, 0),
      }),
    );

    expect(res.changed).toEqual([wallId]);
    expect(healthySubscriber1).toHaveBeenCalledWith([wallId]);
    expect(faultySubscriber).toHaveBeenCalledWith([wallId]);
    expect(healthySubscriber2).toHaveBeenCalledWith([wallId]);

    consoleSpy.mockRestore();
  });

  describe('Ouvertures hébergées (Doors & Windows)', () => {
    function setupDocWithWall() {
      const doc = BimDocument.createDefaultProject();
      const state = doc.getState();
      const levelId = Object.keys(state.levels)[0]!;
      const typeId = Object.keys(state.wallTypes)[0]!;
      const wallId = 'wall_test_openings';
      doc.execute(
        new Commands.AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId,
          levelId,
          start: vec2(0, 0),
          end: vec2(5000, 0),
        }),
      );
      return { doc, wallId, levelId, typeId };
    }

    it('execute(AddDoorCommand) ajoute une porte valide et notifie [doorId, hostWallId]', () => {
      const { doc, wallId } = setupDocWithWall();
      const doorId = 'door_01';
      const door: Door = {
        id: doorId,
        category: 'door',
        doorTypeId: 'door-type-900x2100',
        hostWallId: wallId,
        offsetAlong: 500,
        swing: { side: 'right', direction: 'in' },
      };

      const res = doc.execute(new Commands.AddDoorCommand(door));
      expect(res.changed).toEqual([doorId, wallId]);
      expect(doc.getState().doors[doorId]).toEqual(door);
    });

    it('execute(AddDoorCommand) rejette un hostWallId inexistant', () => {
      const { doc } = setupDocWithWall();
      const door: Door = {
        id: 'door_bad_wall',
        category: 'door',
        doorTypeId: 'door-type-900x2100',
        hostWallId: 'non_existent_wall',
        offsetAlong: 500,
        swing: { side: 'left', direction: 'in' },
      };

      expect(() => doc.execute(new Commands.AddDoorCommand(door))).toThrowError(
        /UNKNOWN_HOST_WALL/,
      );
    });

    it('execute(AddDoorCommand) rejette un débordement en longueur (offsetAlong + width > wallLength)', () => {
      const { doc, wallId } = setupDocWithWall();
      const door: Door = {
        id: 'door_overflow',
        category: 'door',
        doorTypeId: 'door-type-900x2100',
        hostWallId: wallId,
        offsetAlong: 4500, // mur = 5000, 4500 + 900 = 5400 > 5000
        swing: { side: 'right', direction: 'out' },
      };

      expect(() => doc.execute(new Commands.AddDoorCommand(door))).toThrowError(
        /INVALID_OPENING_POSITION/,
      );
    });

    it('execute(AddDoorCommand) rejette le chevauchement avec une ouverture existante', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_1',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 1000,
          swing: { side: 'right', direction: 'in' },
        }),
      );

      // Deuxième porte qui chevauche door_1 [1000..1900]
      expect(() =>
        doc.execute(
          new Commands.AddDoorCommand({
            id: 'door_2',
            category: 'door',
            doorTypeId: 'door-type-900x2100',
            hostWallId: wallId,
            offsetAlong: 1500,
            swing: { side: 'left', direction: 'out' },
          }),
        ),
      ).toThrowError(/OPENING_OVERLAP/);
    });

    it('execute(AddWindowCommand) rejette un dépassement en hauteur (sillHeight + height > wallHeight)', () => {
      const { doc, wallId } = setupDocWithWall();
      // Mur par défaut a une hauteur de 2800 mm. Type par défaut : height = 1400 mm.
      expect(() =>
        doc.execute(
          new Commands.AddWindowCommand({
            id: 'win_too_high',
            category: 'window',
            windowTypeId: 'default-window-type',
            hostWallId: wallId,
            offsetAlong: 1000,
            sillHeight: 2000, // 2000 + 1400 = 3400 > 2800
          }),
        ),
      ).toThrowError(/INVALID_OPENING_HEIGHT/);
    });

    it('execute(DeleteWallCommand) supprime le mur ET supprime en cascade toutes ses ouvertures hébergées', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_cascade_1',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );
      const win: Window = {
        id: 'win_cascade_1',
        category: 'window',
        windowTypeId: 'default-window-type',
        hostWallId: wallId,
        offsetAlong: 2500,
        sillHeight: 900,
      };
      doc.execute(new Commands.AddWindowCommand(win));

      expect(doc.getState().walls[wallId]).toBeDefined();
      expect(doc.getState().doors['door_cascade_1']).toBeDefined();
      expect(doc.getState().windows['win_cascade_1']).toBeDefined();

      const delRes = doc.execute(new Commands.DeleteWallCommand(wallId));
      expect(delRes.changed).toEqual([wallId, 'door_cascade_1', 'win_cascade_1']);

      expect(doc.getState().walls[wallId]).toBeUndefined();
      expect(doc.getState().doors['door_cascade_1']).toBeUndefined();
      expect(doc.getState().windows['win_cascade_1']).toBeUndefined();
    });

    it('execute(DeleteOpeningCommand) supprime l’ouverture sans affecter le mur hôte', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_to_delete',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 800,
          swing: { side: 'left', direction: 'in' },
        }),
      );

      const delRes = doc.execute(new Commands.DeleteOpeningCommand('door_to_delete'));
      expect(delRes.changed).toContain('door_to_delete');
      expect(delRes.changed).toContain(wallId);

      expect(doc.getState().doors['door_to_delete']).toBeUndefined();
      expect(doc.getState().walls[wallId]).toBeDefined();
    });

    it('execute(MoveOpeningCommand) met à jour la position offsetAlong après validation', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_to_move',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );

      doc.execute(new Commands.MoveOpeningCommand('door_to_move', 2000));
      expect(doc.getState().doors['door_to_move']?.offsetAlong).toBe(2000);

      // Rejet si nouveau déplacement sort du mur
      expect(() => doc.execute(new Commands.MoveOpeningCommand('door_to_move', 4500))).toThrowError(
        /INVALID_OPENING_POSITION/,
      );
    });

    it('execute(MoveOpeningCommand) rejette un déplacement créant un chevauchement (OPENING_OVERLAP)', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_fixed',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 2500,
          swing: { side: 'left', direction: 'in' },
        }),
      );
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_moving',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );

      // Déplacement de door_moving vers 2200 -> [2200..3100] chevauche door_fixed [2500..3400]
      expect(() => doc.execute(new Commands.MoveOpeningCommand('door_moving', 2200))).toThrowError(
        /OPENING_OVERLAP/,
      );
    });

    it('execute(MoveOpeningCommand) rejette un déplacement créant un trumeau insuffisant < 50mm (INVALID_OPENING_CLEARANCE)', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_fixed',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 2500,
          swing: { side: 'left', direction: 'in' },
        }),
      );
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_moving',
          category: 'door',
          doorTypeId: 'door-type-900x2100',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );

      // Déplacement de door_moving vers 1580 -> [1580..2480], trumeau = 20 mm (< 50 mm)
      expect(() => doc.execute(new Commands.MoveOpeningCommand('door_moving', 1580))).toThrowError(
        /INVALID_OPENING_CLEARANCE/,
      );
    });

    it('execute(UpdateDoorCommand et UpdateWindowCommand) modifient les propriétés avec validation', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_update',
          category: 'door',
          doorTypeId: 'default-door-type',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );
      doc.execute(
        new Commands.AddWindowCommand({
          id: 'win_update',
          category: 'window',
          windowTypeId: 'default-window-type',
          hostWallId: wallId,
          offsetAlong: 2000,
          sillHeight: 900,
        }),
      );

      doc.execute(
        new Commands.UpdateDoorCommand('door_update', {
          swing: { side: 'right', direction: 'out' },
          width: 800,
        }),
      );
      const updatedDoor = doc.getState().doors['door_update'];
      expect(updatedDoor?.swing).toEqual({
        side: 'right',
        direction: 'out',
      });
      const updatedDoorType = doc.getState().doorTypes[updatedDoor!.doorTypeId];
      expect(updatedDoorType?.width).toBe(800);

      doc.execute(
        new Commands.UpdateWindowCommand('win_update', {
          sillHeight: 1100,
        }),
      );
      expect(doc.getState().windows['win_update']?.sillHeight).toBe(1100);
    });

    it('execute(UpdateDoorCommand) rejette un élargissement débordant du mur (INVALID_OPENING_POSITION)', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddDoorCommand({
          id: 'door_expand',
          category: 'door',
          doorTypeId: 'default-door-type',
          hostWallId: wallId,
          offsetAlong: 500,
          swing: { side: 'left', direction: 'in' },
        }),
      );

      // Mur = 5000 mm, offset = 500, width = 4800 -> 500 + 4800 = 5300 > 5000
      expect(() =>
        doc.execute(new Commands.UpdateDoorCommand('door_expand', { width: 4800 })),
      ).toThrowError(/INVALID_OPENING_POSITION/);
    });

    it('execute(UpdateWindowCommand) rejette une allège excessive (INVALID_OPENING_HEIGHT)', () => {
      const { doc, wallId } = setupDocWithWall();
      doc.execute(
        new Commands.AddWindowCommand({
          id: 'win_raise',
          category: 'window',
          windowTypeId: 'default-window-type',
          hostWallId: wallId,
          offsetAlong: 1000,
          sillHeight: 900,
        }),
      );

      // Hauteur mur = 2800 mm, sillHeight 1500 + height 1400 = 2900 > 2800
      expect(() =>
        doc.execute(new Commands.UpdateWindowCommand('win_raise', { sillHeight: 1500 })),
      ).toThrowError(/INVALID_OPENING_HEIGHT/);
    });
  });

  describe('Atomicité transactionnelle et résilience du DAG sur undo() et redo() (ADR-070)', () => {
    it('maintient l’état, le DAG et canUndo/canRedo strictement inchangés par référence si une exception survient pendant undo()', () => {
      const doc = BimDocument.createDefaultProject();
      const typeId = Object.keys(doc.getState().wallTypes)[0]!;
      const levelId = Object.keys(doc.getState().levels)[0]!;
      const wallId = 'w_atomic_1';
      doc.execute(
        new Commands.AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId,
          levelId,
          start: vec2(0, 0),
          end: vec2(4000, 0),
        }),
      );

      const stateBeforeUndo = doc.getState();
      const dagBeforeUndo = doc.getDependencyGraph();
      expect(doc.canUndo()).toBe(true);
      expect(doc.canRedo()).toBe(false);

      // Injection de panne : espion sur updateElements qui lève une exception
      const updateElementsSpy = vi
        .spyOn(DependencyGraph.prototype, 'updateElements')
        .mockImplementationOnce(() => {
          throw new Error('Panne simulée du calcul DAG lors de l’annulation');
        });

      // L'appel à undo() doit échouer sans corrompre doc
      expect(() => doc.undo()).toThrow('Panne simulée du calcul DAG lors de l’annulation');

      // Vérification stricte d'atomicité : aucun changement d'état ni de pointeurs de pile
      expect(doc.getState()).toBe(stateBeforeUndo);
      expect(doc.getDependencyGraph()).toBe(dagBeforeUndo);
      expect(doc.canUndo()).toBe(true);
      expect(doc.canRedo()).toBe(false);

      updateElementsSpy.mockRestore();

      // Vérifier que le undo() suivant fonctionne normalement après rétablissement
      const undoResult = doc.undo();
      expect(undoResult).toBe(true);
      expect(doc.getState().walls[wallId]).toBeUndefined();
      expect(doc.canUndo()).toBe(false);
      expect(doc.canRedo()).toBe(true);
    });

    it('maintient l’état, le DAG et canUndo/canRedo strictement inchangés par référence si une exception survient pendant redo()', () => {
      const doc = BimDocument.createDefaultProject();
      const typeId = Object.keys(doc.getState().wallTypes)[0]!;
      const levelId = Object.keys(doc.getState().levels)[0]!;
      const wallId = 'w_atomic_2';
      doc.execute(
        new Commands.AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId,
          levelId,
          start: vec2(0, 0),
          end: vec2(4000, 0),
        }),
      );

      doc.undo();
      expect(doc.canRedo()).toBe(true);

      const stateBeforeRedo = doc.getState();
      const dagBeforeRedo = doc.getDependencyGraph();

      // Injection de panne sur hasCycle pour simuler un rejet de cycle de dépendances
      const hasCycleSpy = vi
        .spyOn(DependencyGraph.prototype, 'hasCycle')
        .mockReturnValueOnce(true);

      // L'appel à redo() doit lever DEPENDENCY_CYCLE
      expect(() => doc.redo()).toThrowError(/DEPENDENCY_CYCLE/);

      // Vérification stricte d'atomicité
      expect(doc.getState()).toBe(stateBeforeRedo);
      expect(doc.getDependencyGraph()).toBe(dagBeforeRedo);
      expect(doc.canRedo()).toBe(true);
      expect(doc.canUndo()).toBe(false);

      hasCycleSpy.mockRestore();

      // Vérifier que le redo() suivant fonctionne normalement
      const redoResult = doc.redo();
      expect(redoResult).toBe(true);
      expect(doc.getState().walls[wallId]).toBeDefined();
      expect(doc.canRedo()).toBe(false);
      expect(doc.canUndo()).toBe(true);
    });
  });
});
