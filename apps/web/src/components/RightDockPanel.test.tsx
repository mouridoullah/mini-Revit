import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RightDockPanel } from './RightDockPanel.js';

describe('Composant <RightDockPanel />', () => {
  it('bascule entre les onglets Propriétés, IFC Réf et Assistant IA', () => {
    const handleTabChange = vi.fn();
    const { rerender } = render(
      <RightDockPanel
        properties={<div data-testid="props-content">Inspecteur</div>}
        ifc={<div data-testid="ifc-content">Fédération IFC</div>}
        ai={<div data-testid="ai-content">Copilote IA</div>}
        selectedCount={2}
        modelCount={1}
        hasPendingAiPlan={true}
        activeTab="properties"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByTestId('props-content')).toBeDefined();
    expect(screen.queryByTestId('ifc-content')).toBeNull();
    expect(screen.queryByTestId('ai-content')).toBeNull();

    // Clic sur l'onglet IFC Réf
    fireEvent.click(screen.getByTestId('dock-tab-ifc'));
    expect(handleTabChange).toHaveBeenCalledWith('ifc');

    // Rerender avec l'onglet actif ifc
    rerender(
      <RightDockPanel
        properties={<div data-testid="props-content">Inspecteur</div>}
        ifc={<div data-testid="ifc-content">Fédération IFC</div>}
        ai={<div data-testid="ai-content">Copilote IA</div>}
        selectedCount={2}
        modelCount={1}
        hasPendingAiPlan={true}
        activeTab="ifc"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByTestId('ifc-content')).toBeDefined();
    expect(screen.queryByTestId('props-content')).toBeNull();

    // Clic sur l'onglet Assistant IA
    fireEvent.click(screen.getByTestId('dock-tab-ai'));
    expect(handleTabChange).toHaveBeenCalledWith('ai');

    rerender(
      <RightDockPanel
        properties={<div data-testid="props-content">Inspecteur</div>}
        ifc={<div data-testid="ifc-content">Fédération IFC</div>}
        ai={<div data-testid="ai-content">Copilote IA</div>}
        selectedCount={2}
        modelCount={1}
        hasPendingAiPlan={true}
        activeTab="ai"
        onTabChange={handleTabChange}
      />,
    );

    expect(screen.getByTestId('ai-content')).toBeDefined();
    expect(screen.queryByTestId('ifc-content')).toBeNull();
  });

  it('permet de replier et déplier le volet droit', () => {
    render(
      <RightDockPanel
        properties={<div>Inspecteur</div>}
        ifc={<div>Fédération IFC</div>}
        selectedCount={0}
        modelCount={0}
        activeTab="properties"
        onTabChange={vi.fn()}
      />,
    );

    const closeBtn = screen.getByLabelText('Réduire le panneau droit');
    fireEvent.click(closeBtn);

    const openBtn = screen.getByLabelText('Ouvrir le panneau droit');
    expect(openBtn).toBeDefined();

    fireEvent.click(openBtn);
    expect(screen.getByLabelText('Réduire le panneau droit')).toBeDefined();
  });
});
