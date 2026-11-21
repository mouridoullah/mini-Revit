import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Toolbar } from './Toolbar.js';

describe('Toolbar (apps/web/src/components/Toolbar.tsx — Audit P0.4)', () => {
  it('déclenche le changement d’outil sur touche simple mais ignore les raccourcis avec modificateurs (Ctrl, Meta, Alt)', () => {
    const onSelectTool = vi.fn();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSave = vi.fn();
    const onLoadFile = vi.fn();

    render(
      <Toolbar
        activeToolKind="select"
        onSelectTool={onSelectTool}
        canUndo={false}
        canRedo={false}
        onUndo={onUndo}
        onRedo={onRedo}
        onSave={onSave}
        onLoadFile={onLoadFile}
      />,
    );

    // 1. Touche simple 'w' active l'outil wall
    fireEvent.keyDown(window, { key: 'w' });
    expect(onSelectTool).toHaveBeenCalledWith('wall');
    onSelectTool.mockClear();

    // 2. Touche Ctrl+S (sauvegarde) ne doit PAS déclencher select
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(onSelectTool).not.toHaveBeenCalled();

    // 3. Touche Meta+C (copier sur Mac) ne doit PAS déclencher component
    fireEvent.keyDown(window, { key: 'c', metaKey: true });
    expect(onSelectTool).not.toHaveBeenCalled();

    // 4. Touche Alt+W ne doit PAS déclencher wall
    fireEvent.keyDown(window, { key: 'w', altKey: true });
    expect(onSelectTool).not.toHaveBeenCalled();
  });

  it('affiche les contrôles de niveaux uniquement dans l’onglet Structure', () => {
    const { getByTestId, queryByTestId } = render(
      <Toolbar
        activeToolKind="select"
        onSelectTool={vi.fn()}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onSave={vi.fn()}
        onLoadFile={vi.fn()}
        onAddLevel={vi.fn()}
      />,
    );

    expect(queryByTestId('add-level-btn')).toBeNull();
    fireEvent.click(getByTestId('ribbon-tab-structure'));
    expect(getByTestId('add-level-btn')).toBeDefined();
  });
});
