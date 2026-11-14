import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BimDocument, Commands } from '@mini-bim/core';
import { createDemoDocument } from '../demo/demoDocument.js';
import { BimDocumentProvider } from './BimDocumentContext.js';
import { useBimDocument } from '../hooks/useBimDocument.js';

function TestConsumer({ newDocToSet }: { readonly newDocToSet?: BimDocument }) {
  const { doc, state, execute, undo, redo, canUndo, canRedo, setDocument } = useBimDocument();

  const handleAddWall = () => {
    const levelId = Object.keys(state.levels)[0];
    const typeId = Object.keys(state.wallTypes)[0];
    if (!levelId || !typeId) return;
    execute(
      new Commands.AddWallCommand({
        id: 'wall_added_in_test',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 2500, y: 0 },
      }),
    );
  };

  return (
    <div>
      <span data-testid="doc-present">{doc ? 'YES' : 'NO'}</span>
      <span data-testid="wall-count">{Object.keys(state.walls).length}</span>
      <span data-testid="can-undo">{canUndo() ? 'TRUE' : 'FALSE'}</span>
      <span data-testid="can-redo">{canRedo() ? 'TRUE' : 'FALSE'}</span>
      <button type="button" onClick={handleAddWall} data-testid="add-btn">
        Ajouter
      </button>
      <button type="button" onClick={() => undo()} data-testid="undo-btn">
        Undo
      </button>
      <button type="button" onClick={() => redo()} data-testid="redo-btn">
        Redo
      </button>
      {newDocToSet && (
        <button type="button" onClick={() => setDocument(newDocToSet)} data-testid="set-doc-btn">
          SetDoc
        </button>
      )}
    </div>
  );
}

describe('BimDocumentContext & useBimDocument (apps/web)', () => {
  it('useBimDocument lève une erreur si invoqué hors du BimDocumentProvider', () => {
    // Supprimer temporairement le console.error de React pour éviter le bruit
    const originalError = console.error;
    console.error = () => {};

    expect(() => render(<TestConsumer />)).toThrowError(
      /useBimDocument doit être utilisé à l’intérieur d’un <BimDocumentProvider>/,
    );

    console.error = originalError;
  });

  it('BimDocumentProvider expose doc, state, execute, undo, redo et réagit aux commandes', async () => {
    const doc = BimDocument.createDefaultProject();

    render(
      <BimDocumentProvider initialDoc={doc}>
        <TestConsumer />
      </BimDocumentProvider>,
    );

    expect(screen.getByTestId('doc-present').textContent).toBe('YES');
    expect(screen.getByTestId('wall-count').textContent).toBe('0');
    expect(screen.getByTestId('can-undo').textContent).toBe('FALSE');

    // Exécution d'une commande d'ajout de mur via le bouton
    await act(async () => {
      screen.getByTestId('add-btn').click();
    });

    // Le state React a été mis à jour de façon réactive
    expect(screen.getByTestId('wall-count').textContent).toBe('1');
    expect(screen.getByTestId('can-undo').textContent).toBe('TRUE');
    expect(screen.getByTestId('can-redo').textContent).toBe('FALSE');

    // Annulation (Undo)
    await act(async () => {
      screen.getByTestId('undo-btn').click();
    });

    expect(screen.getByTestId('wall-count').textContent).toBe('0');
    expect(screen.getByTestId('can-undo').textContent).toBe('FALSE');
    expect(screen.getByTestId('can-redo').textContent).toBe('TRUE');

    // Rétablissement (Redo)
    await act(async () => {
      screen.getByTestId('redo-btn').click();
    });

    expect(screen.getByTestId('wall-count').textContent).toBe('1');
    expect(screen.getByTestId('can-undo').textContent).toBe('TRUE');
  });

  it('setDocument remplace immédiatement le BimDocument (4 murs -> 2 murs), synchronise le state et désabonne l’ancien doc', async () => {
    // 1. Document initial avec 4 murs
    const initialDoc = createDemoDocument();
    expect(Object.keys(initialDoc.getState().walls).length).toBe(4);

    // Espionner la désinscription sur initialDoc
    const originalSubscribe = initialDoc.subscribe.bind(initialDoc);
    const unsubSpy = vi.fn();
    vi.spyOn(initialDoc, 'subscribe').mockImplementation((listener) => {
      const realUnsub = originalSubscribe(listener);
      return () => {
        unsubSpy();
        realUnsub();
      };
    });

    // 2. Document de remplacement avec exactement 2 murs
    const replacementDoc = BimDocument.createDefaultProject();
    const levelId = Object.keys(replacementDoc.getState().levels)[0] ?? '';
    const typeId = Object.keys(replacementDoc.getState().wallTypes)[0] ?? '';
    replacementDoc.execute(
      new Commands.AddWallCommand({
        id: 'wall_rep_1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    replacementDoc.execute(
      new Commands.AddWallCommand({
        id: 'wall_rep_2',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );
    expect(Object.keys(replacementDoc.getState().walls).length).toBe(2);

    render(
      <BimDocumentProvider initialDoc={initialDoc}>
        <TestConsumer newDocToSet={replacementDoc} />
      </BimDocumentProvider>,
    );

    // Initialement : 4 murs
    expect(screen.getByTestId('wall-count').textContent).toBe('4');

    // 3. Remplacement du document via setDocument
    await act(async () => {
      screen.getByTestId('set-doc-btn').click();
    });

    // 4. Vérification d'immédiateté : le state React reflète 2 murs SANS attendre
    expect(screen.getByTestId('wall-count').textContent).toBe('2');

    // 5. Preuve formelle de désabonnement : l'ancien document a été désinscrit
    expect(unsubSpy).toHaveBeenCalledTimes(1);

    // 6. Une mutation sur l'ancien document n'affecte PLUS le state React
    act(() => {
      initialDoc.execute(
        new Commands.AddWallCommand({
          id: 'ghost_wall_old_doc',
          category: 'wall',
          typeId: Object.keys(initialDoc.getState().wallTypes)[0] ?? '',
          levelId: Object.keys(initialDoc.getState().levels)[0] ?? '',
          start: { x: 0, y: 100 },
          end: { x: 1000, y: 100 },
        }),
      );
    });
    expect(screen.getByTestId('wall-count').textContent).toBe('2');

    // 7. Une mutation sur le nouveau document met bien à jour le state React (3 murs)
    act(() => {
      replacementDoc.execute(
        new Commands.AddWallCommand({
          id: 'new_wall_rep_3',
          category: 'wall',
          typeId,
          levelId,
          start: { x: 4000, y: 3000 },
          end: { x: 0, y: 3000 },
        }),
      );
    });
    expect(screen.getByTestId('wall-count').textContent).toBe('3');
  });
});
