import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { type BimDocument, Commands, createPipe, detectClashes } from '@tabax/core';
import { ClashWorkspace } from './ClashWorkspace.js';
import { createDemoDocument } from '../demo/demoDocument.js';

describe('Composant <ClashWorkspace /> (Dedicated BIM Coordination Cockpit)', () => {
  function createDocWithClash(): BimDocument {
    const doc = createDemoDocument();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0] ?? 'level_0';

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

  it('affiche le centre de coordination et permet de lancer l’analyse des conflits', () => {
    const doc = createDocWithClash();
    const handleClashesChanged = vi.fn();
    const handleFocusPoint3D = vi.fn();
    const handleLocate2D = vi.fn();

    render(
      <ClashWorkspace
        doc={doc}
        clashes={[]}
        onClashesChanged={handleClashesChanged}
        onFocusPoint3D={handleFocusPoint3D}
        onLocate2D={handleLocate2D}
        viewport3D={<div data-testid="mock-3d-viewport">Mock 3D</div>}
        viewport2D={<div data-testid="mock-2d-viewport">Mock 2D</div>}
      />,
    );

    expect(screen.getByTestId('clash-workspace')).toBeDefined();
    expect(screen.getByText('Coordination BIM & Conflits')).toBeDefined();

    // Lancer la détection
    const runBtn = screen.getByTestId('run-clash-btn');
    fireEvent.click(runBtn);

    expect(handleClashesChanged).toHaveBeenCalledTimes(1);
    const clashes = handleClashesChanged.mock.calls[0]?.[0] as unknown[];
    expect(clashes?.length).toBeGreaterThan(0);
    expect(handleFocusPoint3D).toHaveBeenCalledTimes(1);
  });

  it('affiche les conflits détectés, la fiche détaillée et permet le centrage 3D et la localisation 2D', () => {
    const doc = createDocWithClash();
    const handleClashesChanged = vi.fn();
    const handleFocusPoint3D = vi.fn();
    const handleLocate2D = vi.fn();

    // Détecter un conflit réel pour le passer en props
    const results = detectClashes(doc.getState());

    render(
      <ClashWorkspace
        doc={doc}
        clashes={results}
        onClashesChanged={handleClashesChanged}
        onFocusPoint3D={handleFocusPoint3D}
        onLocate2D={handleLocate2D}
        viewport3D={<div data-testid="mock-3d-viewport">Mock 3D</div>}
        viewport2D={<div data-testid="mock-2d-viewport">Mock 2D</div>}
      />,
    );

    expect(screen.getByTestId('workspace-hard-badge').textContent).toContain('1 Hard');
    expect(screen.getByTestId('clash-table')).toBeDefined();

    // Clic sur le conflit
    const firstRow = screen.getByTestId(/^workspace-clash-row-/);
    fireEvent.click(firstRow);

    expect(handleFocusPoint3D).toHaveBeenCalled();
    expect(screen.getByTestId('workspace-clash-detail')).toBeDefined();

    // Centrer Caméra 3D
    const btn3d = screen.getByTestId('workspace-center-3d-btn');
    fireEvent.click(btn3d);
    expect(handleFocusPoint3D).toHaveBeenCalled();

    // Localiser sur Plan 2D
    const btn2d = screen.getByTestId('workspace-locate-2d-btn');
    fireEvent.click(btn2d);
    expect(handleLocate2D).toHaveBeenCalled();
    expect(handleLocate2D.mock.calls[0]?.[0]).toHaveProperty('x');
    expect(handleLocate2D.mock.calls[0]?.[0]).toHaveProperty('y');
  });

  it('permet de basculer la vue de droite entre 3D et 2D', () => {
    const doc = createDocWithClash();

    render(
      <ClashWorkspace
        doc={doc}
        clashes={[]}
        onClashesChanged={vi.fn()}
        onFocusPoint3D={vi.fn()}
        onLocate2D={vi.fn()}
        viewport3D={<div data-testid="mock-3d-viewport">Mock 3D</div>}
        viewport2D={<div data-testid="mock-2d-viewport">Mock 2D</div>}
      />,
    );

    // Par défaut, la vue 3D est affichée
    expect(screen.getByTestId('mock-3d-viewport')).toBeDefined();
    expect(screen.queryByTestId('mock-2d-viewport')).toBeNull();

    // Basculer sur Plan 2D
    fireEvent.click(screen.getByTestId('workspace-switch-2d-btn'));
    expect(screen.getByTestId('mock-2d-viewport')).toBeDefined();
    expect(screen.queryByTestId('mock-3d-viewport')).toBeNull();

    // Revenir sur Vue 3D
    fireEvent.click(screen.getByTestId('workspace-switch-3d-btn'));
    expect(screen.getByTestId('mock-3d-viewport')).toBeDefined();
  });
});
