import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { type BimDocument, Commands, createPipe } from '@mini-bim/core';
import { ClashPanel } from './ClashPanel.js';
import { createDemoDocument } from '../demo/demoDocument.js';

describe('Composant <ClashPanel /> (Clash Detection UI)', () => {
  function createDocWithClash(): BimDocument {
    const doc = createDemoDocument();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0] ?? 'level_0';

    // Ajouter un tuyau qui traverse le mur Sud perpendiculairement
    const pipe = createPipe({
      levelId,
      start: { x: 2000, y: -500, z: 1000 },
      end: { x: 2000, y: 500, z: 1000 },
      diameter: 110,
      systemType: 'domestic_cold_water',
    });
    doc.execute(new Commands.AddPipeCommand(pipe));

    return doc;
  }

  it('affiche le panneau et permet de le déplier/replier', () => {
    const doc = createDocWithClash();
    const onToggle = vi.fn();
    const { rerender } = render(
      <ClashPanel doc={doc} isCollapsed={true} onToggleCollapse={onToggle} />,
    );

    expect(screen.getByTestId('clash-panel')).toBeDefined();
    expect(screen.queryByTestId('run-clash-btn')).toBeNull();

    // Clic sur l'en-tête pour basculer
    fireEvent.click(screen.getByTestId('clash-panel-header'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ClashPanel doc={doc} isCollapsed={false} onToggleCollapse={onToggle} />);
    expect(screen.getByTestId('run-clash-btn')).toBeDefined();
  });

  it('détecte les conflits lors du clic sur Analyser et affiche le tableau', () => {
    const doc = createDocWithClash();
    const handleSelectClash = vi.fn();
    const handleClashesChanged = vi.fn();

    render(
      <ClashPanel
        doc={doc}
        isCollapsed={false}
        onSelectClash={handleSelectClash}
        onClashesChanged={handleClashesChanged}
      />,
    );

    const runBtn = screen.getByTestId('run-clash-btn');
    fireEvent.click(runBtn);

    expect(handleClashesChanged).toHaveBeenCalledTimes(1);
    const clashes = handleClashesChanged.mock.calls[0]?.[0] as unknown[];
    expect(clashes?.length).toBeGreaterThan(0);

    // Le tableau et les badges doivent être affichés
    expect(screen.getByTestId('hard-clash-badge')).toBeDefined();
    expect(screen.getByTestId('clash-table')).toBeDefined();

    // Cliquer sur la première ligne de conflit appelle onSelectClash
    const firstRow = screen.getByTestId(/^clash-row-/);
    fireEvent.click(firstRow);
    expect(handleSelectClash).toHaveBeenCalledTimes(1);
  });

  it('permet de vider les résultats avec le bouton Effacer', () => {
    const doc = createDocWithClash();
    const handleClashesChanged = vi.fn();

    render(
      <ClashPanel
        doc={doc}
        isCollapsed={false}
        onClashesChanged={handleClashesChanged}
      />,
    );

    fireEvent.click(screen.getByTestId('run-clash-btn'));
    expect(screen.getByTestId('clear-clash-btn')).toBeDefined();

    fireEvent.click(screen.getByTestId('clear-clash-btn'));
    expect(screen.queryByTestId('clash-table')).toBeNull();
    expect(handleClashesChanged).toHaveBeenLastCalledWith([]);
  });

  it('permet de filtrer par sévérité', () => {
    const doc = createDocWithClash();
    render(<ClashPanel doc={doc} isCollapsed={false} />);

    fireEvent.click(screen.getByTestId('run-clash-btn'));

    const filter = screen.getByTestId('severity-filter');
    fireEvent.change(filter, { target: { value: 'clearance' } });

    // Aucun clearance dans ce modèle de test, donc message vide
    expect(screen.getByTestId('no-clashes-msg')).toBeDefined();
  });
});
