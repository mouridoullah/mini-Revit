import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitViewport, type ViewMode } from './SplitViewport.js';

describe('Composant <SplitViewport /> (Layout Multi-Vues & Espace Conflits)', () => {
  it('supporte le mode de vue "clashes" et affiche le conteneur dédié', () => {
    const handleModeChange = vi.fn();

    render(
      <SplitViewport
        levelName="Niveau RDC"
        mode="clashes"
        onModeChange={handleModeChange}
        twoD={<div data-testid="test-2d">Vue 2D</div>}
        threeD={<div data-testid="test-3d">Vue 3D</div>}
        section={<div data-testid="test-section">Vue Coupe</div>}
        clashes={<div data-testid="test-clashes-workspace">Espace Dédié Conflits</div>}
      />,
    );

    expect(screen.getByTestId('test-clashes-workspace')).toBeDefined();
    expect(screen.queryByTestId('test-2d')).toBeNull();
    expect(screen.queryByTestId('test-3d')).toBeNull();
    expect(screen.queryByTestId('test-section')).toBeNull();

    // Bouton de commutation Conflits dans layoutControls
    const clashBtn = screen.getByTestId('layout-clashes-btn');
    expect(clashBtn).toBeDefined();
    expect(clashBtn.getAttribute('aria-pressed')).toBe('true');

    // Cliquer sur le mode 2D
    const btn2d = screen.getByTestId('layout-2d-btn');
    fireEvent.click(btn2d);
    expect(handleModeChange).toHaveBeenCalledWith('2d');
  });

  it('commute correctement vers le mode clashes lors du clic sur le bouton Conflits', () => {
    let currentMode: ViewMode = 'split';
    const handleModeChange = vi.fn((next: ViewMode) => {
      currentMode = next;
    });

    const { rerender } = render(
      <SplitViewport
        levelName="Niveau RDC"
        mode={currentMode}
        onModeChange={handleModeChange}
        twoD={<div data-testid="test-2d">Vue 2D</div>}
        threeD={<div data-testid="test-3d">Vue 3D</div>}
        clashes={<div data-testid="test-clashes-workspace">Espace Dédié Conflits</div>}
      />,
    );

    const clashBtn = screen.getByTestId('layout-clashes-btn');
    fireEvent.click(clashBtn);
    expect(handleModeChange).toHaveBeenCalledWith('clashes');

    rerender(
      <SplitViewport
        levelName="Niveau RDC"
        mode="clashes"
        onModeChange={handleModeChange}
        twoD={<div data-testid="test-2d">Vue 2D</div>}
        threeD={<div data-testid="test-3d">Vue 3D</div>}
        clashes={<div data-testid="test-clashes-workspace">Espace Dédié Conflits</div>}
      />,
    );
    expect(screen.getByTestId('test-clashes-workspace')).toBeDefined();
  });
});
