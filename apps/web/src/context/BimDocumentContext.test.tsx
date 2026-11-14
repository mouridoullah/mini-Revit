import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { BimDocument, Commands } from '@mini-bim/core';
import { BimDocumentProvider } from './BimDocumentContext.js';
import { useBimDocument } from '../hooks/useBimDocument.js';

function TestConsumer() {
  const { doc, state, execute, undo, redo, canUndo, canRedo } = useBimDocument();

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
});
