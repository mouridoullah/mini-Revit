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

  it('gère une séquence de 10 mutations, 5 undo et 3 redo avec exactitude', () => {
    const history = new HistoryStack();
    let state = createBaseState();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // 1. Exécuter 10 mutations séquentielles (ajout de 10 niveaux)
    for (let i = 1; i <= 10; i++) {
      const [nextState, patches, inversePatches] = produceWithPatches(state, (draft) => {
        draft.levels[`lvl_${i}`] = { id: `lvl_${i}`, name: `Étage ${i}`, elevation: i * 3000 };
      });
      state = nextState;
      history.push({ patches, inversePatches, changed: [`lvl_${i}`] });
    }

    expect(Object.keys(state.levels)).toHaveLength(10);
    expect(history.getUndoCount()).toBe(10);
    expect(history.getRedoCount()).toBe(0);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // 2. Annuler 5 transactions (retour à 5 niveaux)
    for (let u = 0; u < 5; u++) {
      const res = history.undo(state);
      expect(res).not.toBeNull();
      if (!res) return;
      state = res.nextState;
    }

    expect(Object.keys(state.levels)).toHaveLength(5);
    expect(history.getUndoCount()).toBe(5);
    expect(history.getRedoCount()).toBe(5);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);

    // 3. Rétablir 3 transactions (remontée à 8 niveaux)
    for (let r = 0; r < 3; r++) {
      const res = history.redo(state);
      expect(res).not.toBeNull();
      if (!res) return;
      state = res.nextState;
    }

    expect(Object.keys(state.levels)).toHaveLength(8);
    expect(history.getUndoCount()).toBe(8);
    expect(history.getRedoCount()).toBe(2);

    // 4. Une nouvelle commande doit vider immédiatement le redoStack
    const [branchState, patches, inversePatches] = produceWithPatches(state, (draft) => {
      draft.levels['lvl_branch'] = { id: 'lvl_branch', name: 'Étage Bifurqué', elevation: 9999 };
    });
    state = branchState;
    history.push({ patches, inversePatches, changed: ['lvl_branch'] });

    expect(history.canRedo()).toBe(false);
    expect(history.getRedoCount()).toBe(0);
    expect(history.getUndoCount()).toBe(9);
    expect(state.levels['lvl_branch']).toBeDefined();
  });

  it('les patchs inverses ne contiennent aucune référence circulaire et sont sérialisables', () => {
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
