import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Viewport3DToolbar } from './Viewport3DToolbar.js';

describe('Composant <Viewport3DToolbar /> (ADR-072)', () => {
  it('affiche les boutons de mode de rendu et déclenche onModeChange', () => {
    const handleModeChange = vi.fn();
    render(
      <Viewport3DToolbar
        renderMode="technique"
        onModeChange={handleModeChange}
        sunHour={14}
        onSunHourChange={vi.fn()}
        showEdges={true}
        onToggleEdges={vi.fn()}
      />,
    );

    const btnRealiste = screen.getByTestId('render-mode-realiste');
    expect(btnRealiste).toBeDefined();
    fireEvent.click(btnRealiste);
    expect(handleModeChange).toHaveBeenCalledWith('realiste');
  });

  it('affiche le slider solaire en mode réaliste et permet de basculer les arêtes', () => {
    const handleSunHourChange = vi.fn();
    const handleToggleEdges = vi.fn();

    const { rerender } = render(
      <Viewport3DToolbar
        renderMode="realiste"
        onModeChange={vi.fn()}
        sunHour={14}
        onSunHourChange={handleSunHourChange}
        showEdges={true}
        onToggleEdges={handleToggleEdges}
      />,
    );

    const slider = screen.getByTestId('sun-hour-slider');
    expect(slider).toBeDefined();
    fireEvent.change(slider, { target: { value: '16.5' } });
    expect(handleSunHourChange).toHaveBeenCalledWith(16.5);

    const checkbox = screen.getByTestId('toggle-edges-checkbox');
    expect(checkbox).toBeDefined();
    fireEvent.click(checkbox);
    expect(handleToggleEdges).toHaveBeenCalledTimes(1);

    // En mode technique, le slider solaire ne doit pas être affiché
    rerender(
      <Viewport3DToolbar
        renderMode="technique"
        onModeChange={vi.fn()}
        sunHour={14}
        onSunHourChange={handleSunHourChange}
        showEdges={true}
        onToggleEdges={handleToggleEdges}
      />,
    );
    expect(screen.queryByTestId('sun-hour-slider')).toBeNull();
  });
});
