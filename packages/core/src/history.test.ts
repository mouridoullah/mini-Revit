import { describe, it, expect } from 'vitest';
import { produceWithPatches } from 'immer';
import { vec2 } from '@mini-bim/geometry';
import { HistoryStack } from './history.js';
import { type BimState, type Wall, type Door, type Window, type Room } from './types.js';
import { BimDocument } from './document.js';
import * as Commands from './commands.js';

describe('Gestionnaire d’Historique Transactionnel (history.ts)', () => {
  function createBaseState(): BimState {
    return {
      schemaVersion: 1,
      units: 'mm',
      levels: {},
      wallTypes: {},
      walls: {},
      doors: {},
      windows: {},
    };
  }

  it('undo d’une seule commande restaure l’état exact (deepEqual)', () => {
    const history = new HistoryStack();
    const initialState = createBaseState();

    const [nextState, patches, inversePatches] = produceWithPatches(initialState, (draft) => {
      draft.levels['lvl_0'] = { id: 'lvl_0', name: 'RDC', elevation: 0 };
    });

    history.push({ patches, inversePatches, changed: ['lvl_0'] });
    expect(nextState.levels['lvl_0']).toBeDefined();

    const undoRes = history.undo(nextState);
    expect(undoRes).not.toBeNull();
    if (!undoRes) return;

    expect(undoRes.nextState).toEqual(initialState);
    expect(undoRes.changed).toEqual(['lvl_0']);
  });

  it('canUndo devient false après avoir vidé la pile d’annulation', () => {
    const history = new HistoryStack();
    let state = createBaseState();

    expect(history.canUndo()).toBe(false);

    // Ajouter 3 éléments
    for (let i = 1; i <= 3; i++) {
      const [nextState, patches, inversePatches] = produceWithPatches(state, (draft) => {
        draft.levels[`lvl_${i}`] = { id: `lvl_${i}`, name: `Lvl ${i}`, elevation: i * 1000 };
      });
      state = nextState;
      history.push({ patches, inversePatches, changed: [`lvl_${i}`] });
    }

    expect(history.canUndo()).toBe(true);

    // Annuler les 3 éléments
    for (let i = 0; i < 3; i++) {
      expect(history.canUndo()).toBe(true);
      const res = history.undo(state);
      if (res) state = res.nextState;
    }

    // La pile d'annulation est vide
    expect(history.canUndo()).toBe(false);
    expect(history.undo(state)).toBeNull();
  });

  it('canRedo devient false après avoir vidé la pile de rétablissement', () => {
    const history = new HistoryStack();
    let state = createBaseState();

    const [nextState, patches, inversePatches] = produceWithPatches(state, (draft) => {
      draft.levels['lvl_redo'] = { id: 'lvl_redo', name: 'Redo Test', elevation: 0 };
    });
    state = nextState;
    history.push({ patches, inversePatches, changed: ['lvl_redo'] });

    // Annuler
    const undoRes = history.undo(state);
    if (undoRes) state = undoRes.nextState;

    expect(history.canRedo()).toBe(true);

    // Rétablir
    const redoRes = history.redo(state);
    if (redoRes) state = redoRes.nextState;

    // La pile de rétablissement est vide
    expect(history.canRedo()).toBe(false);
    expect(history.redo(state)).toBeNull();
  });

  it('une nouvelle commande après undo vide immédiatement le redoStack', () => {
    const history = new HistoryStack();
    let state = createBaseState();

    // 2 commandes
    for (let i = 1; i <= 2; i++) {
      const [nextState, patches, inversePatches] = produceWithPatches(state, (draft) => {
        draft.levels[`lvl_${i}`] = { id: `lvl_${i}`, name: `Lvl ${i}`, elevation: i * 1000 };
      });
      state = nextState;
      history.push({ patches, inversePatches, changed: [`lvl_${i}`] });
    }

    // Annuler 1 commande -> redoStack contient 1 élément
    const undoRes = history.undo(state);
    if (undoRes) state = undoRes.nextState;
    expect(history.canRedo()).toBe(true);
    expect(history.getRedoCount()).toBe(1);

    // Exécuter une nouvelle commande alternative
    const [branchState, patches, inversePatches] = produceWithPatches(state, (draft) => {
      draft.levels['lvl_branch'] = { id: 'lvl_branch', name: 'Branch', elevation: 9999 };
    });
    state = branchState;
    history.push({ patches, inversePatches, changed: ['lvl_branch'] });

    // redoStack doit être invalidé et vide
    expect(history.canRedo()).toBe(false);
    expect(history.getRedoCount()).toBe(0);
    expect(history.getUndoCount()).toBe(2);
  });

  it('applyPatches sur des patchs de suppression ("op": "remove") fonctionne sans résidu', () => {
    const history = new HistoryStack();
    const initialState: BimState = {
      ...createBaseState(),
      levels: {
        to_delete: { id: 'to_delete', name: 'À supprimer', elevation: 500 },
      },
    };

    // Supprimer l'élément via Reflect.deleteProperty (génère un patch "op": "remove")
    const [deletedState, patches, inversePatches] = produceWithPatches(initialState, (draft) => {
      Reflect.deleteProperty(draft.levels, 'to_delete');
    });

    expect(deletedState.levels['to_delete']).toBeUndefined();
    history.push({ patches, inversePatches, changed: ['to_delete'] });

    // Undo -> l'élément doit réapparaître intact
    const undoRes = history.undo(deletedState);
    expect(undoRes).not.toBeNull();
    if (!undoRes) return;
    expect(undoRes.nextState.levels['to_delete']).toEqual({
      id: 'to_delete',
      name: 'À supprimer',
      elevation: 500,
    });

    // Redo -> l'élément est de nouveau supprimé proprement
    const redoRes = history.redo(undoRes.nextState);
    expect(redoRes).not.toBeNull();
    if (!redoRes) return;
    expect(redoRes.nextState.levels['to_delete']).toBeUndefined();
  });

  it('les patchs inverses ne contiennent aucune référence circulaire (sérialisation JSON stricte)', () => {
    const history = new HistoryStack();
    const state = createBaseState();

    const [nextState, patches, inversePatches] = produceWithPatches(state, (draft) => {
      draft.levels['lvl_circ'] = { id: 'lvl_circ', name: 'Test', elevation: 0 };
    });

    history.push({ patches, inversePatches, changed: ['lvl_circ'] });

    // Sérialisation JSON pour garantir l'absence de références circulaires
    expect(() => JSON.stringify(patches)).not.toThrow();
    expect(() => JSON.stringify(inversePatches)).not.toThrow();

    const restored = history.undo(nextState);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.nextState.levels['lvl_circ']).toBeUndefined();
  });

  it('undo/redo sur AddDoorCommand : la porte disparaît à l’annulation et réapparaît au rétablissement', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'wall_host',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    const door: Door = {
      id: 'door_test_history',
      category: 'door',
      kind: 'door',
      hostWallId: 'wall_host',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      swing: { side: 'right', direction: 'in' },
    };

    doc.execute(new Commands.AddDoorCommand(door));
    expect(doc.getState().doors['door_test_history']).toEqual(door);

    // Annuler -> la porte disparaît
    expect(doc.canUndo()).toBe(true);
    const undoRes = doc.undo();
    expect(undoRes).toBe(true);
    expect(doc.getState().doors['door_test_history']).toBeUndefined();
    expect(doc.getState().walls['wall_host']).toBeDefined();

    // Rétablir -> la porte réapparaît fidèlement
    expect(doc.canRedo()).toBe(true);
    const redoRes = doc.redo();
    expect(redoRes).toBe(true);
    expect(doc.getState().doors['door_test_history']).toEqual(door);
  });

  it('undo/redo sur DeleteWallCommand avec cascade : le mur ET ses ouvertures (porte + fenêtre) sont restaurés fidèlement', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const typeId = Object.keys(state.wallTypes)[0]!;

    const wall: Wall = {
      id: 'wall_cascade_hist',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(6000, 0),
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const door: Door = {
      id: 'door_cascade_hist',
      category: 'door',
      kind: 'door',
      hostWallId: 'wall_cascade_hist',
      offsetAlong: 500,
      width: 900,
      height: 2100,
      swing: { side: 'left', direction: 'out' },
    };
    doc.execute(new Commands.AddDoorCommand(door));

    const windowElem: Window = {
      id: 'win_cascade_hist',
      category: 'window',
      kind: 'window',
      hostWallId: 'wall_cascade_hist',
      offsetAlong: 2500,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };
    doc.execute(new Commands.AddWindowCommand(windowElem));

    // Mémoriser l'état complet avant suppression
    const stateBeforeDelete = doc.getState();

    // Exécuter DeleteWallCommand
    const delRes = doc.execute(new Commands.DeleteWallCommand('wall_cascade_hist'));
    expect(delRes.changed).toEqual(['wall_cascade_hist', 'door_cascade_hist', 'win_cascade_hist']);

    expect(doc.getState().walls['wall_cascade_hist']).toBeUndefined();
    expect(doc.getState().doors['door_cascade_hist']).toBeUndefined();
    expect(doc.getState().windows['win_cascade_hist']).toBeUndefined();

    // 1. Undo -> Restauration intégrale
    const undoSuccess = doc.undo();
    expect(undoSuccess).toBe(true);

    const restoredState = doc.getState();
    expect(restoredState.walls['wall_cascade_hist']).toEqual(wall);
    expect(restoredState.doors['door_cascade_hist']).toEqual(door);
    expect(restoredState.windows['win_cascade_hist']).toEqual(windowElem);
    expect(restoredState).toEqual(stateBeforeDelete);

    // 2. Redo -> Suppression à nouveau du mur et de ses ouvertures en cascade
    const redoSuccess = doc.redo();
    expect(redoSuccess).toBe(true);

    expect(doc.getState().walls['wall_cascade_hist']).toBeUndefined();
    expect(doc.getState().doors['door_cascade_hist']).toBeUndefined();
    expect(doc.getState().windows['win_cascade_hist']).toBeUndefined();
  });

  it('undo/redo sur DeleteWallCommand avec cascade de Room (ADR-032) : le mur ET la Room sont restaurés fidèlement', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0] ?? '';
    const typeId = Object.keys(state.wallTypes)[0] ?? '';

    // 4 murs formant une pièce fermée rectangulaire 4m × 3m
    const wallSouth: Wall = {
      id: 'w_hist_s',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(4000, 0),
    };
    const wallEast: Wall = {
      id: 'w_hist_e',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(4000, 0),
      end: vec2(4000, 3000),
    };
    const wallNorth: Wall = {
      id: 'w_hist_n',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(4000, 3000),
      end: vec2(0, 3000),
    };
    const wallWest: Wall = {
      id: 'w_hist_w',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(0, 3000),
      end: vec2(0, 0),
    };

    doc.execute(new Commands.AddWallCommand(wallSouth));
    doc.execute(new Commands.AddWallCommand(wallEast));
    doc.execute(new Commands.AddWallCommand(wallNorth));
    doc.execute(new Commands.AddWallCommand(wallWest));

    // Ajout d'une Room déclarée
    const room: Room = {
      id: 'room_hist_cascade',
      category: 'room',
      levelId,
      seed: vec2(2000, 1500),
      name: 'Salon Principal',
    };
    doc.execute(new Commands.AddRoomCommand(room));
    expect(doc.getState().rooms['room_hist_cascade']).toEqual(room);

    // Mémoriser l'état complet avant suppression
    const stateBeforeDelete = doc.getState();

    // Suppression du mur Ouest : la pièce n'est plus close -> cascade Option B
    const delRes = doc.execute(new Commands.DeleteWallCommand('w_hist_w'));
    expect(delRes.changed).toEqual(['w_hist_w', 'room_hist_cascade']);

    // 1. Invariant de cascade : le mur ET la Room ont disparu du state
    expect(doc.getState().walls['w_hist_w']).toBeUndefined();
    expect(doc.getState().rooms['room_hist_cascade']).toBeUndefined();

    // 2. Undo -> Restauration intégrale bit-à-bit du mur ET de la Room
    const undoRes = doc.undo();
    expect(undoRes).toBe(true);

    const restoredState = doc.getState();
    expect(restoredState.walls['w_hist_w']).toEqual(wallWest);
    expect(restoredState.rooms['room_hist_cascade']).toEqual(room);
    expect(restoredState.rooms['room_hist_cascade']?.id).toBe('room_hist_cascade');
    expect(restoredState.rooms['room_hist_cascade']?.seed).toEqual(vec2(2000, 1500));
    expect(restoredState.rooms['room_hist_cascade']?.name).toBe('Salon Principal');
    expect(restoredState).toEqual(stateBeforeDelete);

    // 3. Redo -> Suppression à nouveau du mur et de la Room en cascade
    const redoRes = doc.redo();
    expect(redoRes).toBe(true);

    expect(doc.getState().walls['w_hist_w']).toBeUndefined();
    expect(doc.getState().rooms['room_hist_cascade']).toBeUndefined();
  });
});
