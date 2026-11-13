import { describe, it, expect } from 'vitest';
import { produceWithPatches } from 'immer';
import { HistoryStack } from './history.js';
import { type BimState } from './types.js';

describe('Gestionnaire d’Historique Transactionnel (history.ts)', () => {
  function createBaseState(): BimState {
    return {
      schemaVersion: 1,
      units: 'mm',
      levels: {},
      wallTypes: {},
      walls: {},
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
});
