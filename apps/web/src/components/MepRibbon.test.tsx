import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MepRibbon } from './MepRibbon.js';
import { DEFAULT_MEP_CONFIG } from '../tools/MepTool.js';

describe('MepRibbon (apps/web/src/components/MepRibbon.tsx — Sous-phase 9.3.3)', () => {
  it('affiche les options MEP et permet de basculer l’angle préférentiel de routage (90° / 45°)', () => {
    const onChangeConfig = vi.fn();
    const onToggleDisplayMode = vi.fn();

    render(
      <MepRibbon
        config={DEFAULT_MEP_CONFIG}
        onChangeConfig={onChangeConfig}
        displayMode="single-line"
        onToggleDisplayMode={onToggleDisplayMode}
      />,
    );

    expect(screen.getByTestId('mep-ribbon')).toBeDefined();
    expect(screen.getByTestId('mep-cat-pipe')).toBeDefined();
    expect(screen.getByTestId('mep-angle-90')).toBeDefined();
    expect(screen.getByTestId('mep-angle-45')).toBeDefined();

    // Clic sur l'angle 45°
    fireEvent.click(screen.getByTestId('mep-angle-45'));
    expect(onChangeConfig).toHaveBeenCalledWith({ anglePreference: 45 });

    // Clic sur l'angle 90°
    fireEvent.click(screen.getByTestId('mep-angle-90'));
    expect(onChangeConfig).toHaveBeenCalledWith({ anglePreference: 90 });

    // Bascule unifilaire / bifilaire
    fireEvent.click(screen.getByTestId('mep-mode-toggle'));
    expect(onToggleDisplayMode).toHaveBeenCalledWith('double-line');
  });
});
