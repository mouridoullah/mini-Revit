import { describe, it, expect, vi } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument } from './document.js';
import * as Commands from './commands.js';
import { type Wall, type WallType, type Level } from './types.js';

describe('BimDocument & CommandBus (document.ts)', () => {
  it('constructeur initialise un état vide valide', () => {
    const doc = new BimDocument();
    const state = doc.getState();

    expect(state.schemaVersion).toBe(1);
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
});
