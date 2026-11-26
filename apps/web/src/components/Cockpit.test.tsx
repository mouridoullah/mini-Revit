import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SplitViewport } from './SplitViewport.js';
import { RightDockPanel, type DockTab } from './RightDockPanel.js';
import { ProjectBrowser } from './ProjectBrowser.js';

describe('cockpit layout', () => {
  it('place le thème 3D en icône dans les contrôles de disposition', () => {
    const onToggleWhiteMode = vi.fn();
    render(
      <SplitViewport
        levelName="RDC"
        twoD={<div />}
        threeD={<div />}
        isWhiteMode={false}
        onToggleWhiteMode={onToggleWhiteMode}
      />,
    );

    const toggle = screen.getByTestId('viewport-3d-background-toggle');
    expect(toggle.textContent).toBe('');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleWhiteMode).toHaveBeenCalledOnce();
  });

  it('déclenche le zoom fit de la vue 3D depuis son panneau', () => {
    const onZoomFit3D = vi.fn();
    render(
      <SplitViewport
        levelName="RDC"
        twoD={<div />}
        threeD={<div />}
        onZoomFit3D={onZoomFit3D}
      />,
    );

    fireEvent.click(screen.getByTestId('zoom-fit-3d-btn'));
    expect(onZoomFit3D).toHaveBeenCalledOnce();
  });

  it('bascule entre 2D, split et 3D et réinitialise le séparateur au double-clic', () => {
    render(
      <SplitViewport
        levelName="RDC"
        twoD={<div data-testid="view-2d" />}
        threeD={<div data-testid="view-3d" />}
      />,
    );
    expect(screen.getByTestId('view-2d')).toBeTruthy();
    expect(screen.getByTestId('view-3d')).toBeTruthy();
    fireEvent.click(screen.getByTestId('layout-2d-btn'));
    expect(screen.getByTestId('view-2d')).toBeTruthy();
    expect(screen.queryByTestId('view-3d')).toBeNull();
    fireEvent.click(screen.getByTestId('layout-3d-btn'));
    expect(screen.queryByTestId('view-2d')).toBeNull();
    expect(screen.getByTestId('view-3d')).toBeTruthy();
    fireEvent.click(screen.getByTestId('layout-split-btn'));
    fireEvent.doubleClick(screen.getByTestId('viewport-splitter'));
  });

  it('bascule les onglets Propriétés et IFC Réf', () => {
    function Harness() {
      const [tab, setTab] = useState<DockTab>('properties');
      return (
        <RightDockPanel
          properties={<div>Inspector</div>}
          ifc={<div>IFC models</div>}
          selectedCount={1}
          modelCount={3}
          activeTab={tab}
          onTabChange={setTab}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText('Inspector')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dock-tab-ifc'));
    expect(screen.getByText('IFC models')).toBeTruthy();
  });

  it('affiche les niveaux et transmet les interactions du navigateur projet', () => {
    const level = { id: 'ground', name: 'RDC', elevation: 0, height: 3000 };
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <ProjectBrowser
        levels={[level]}
        activeLevelId="ground"
        onSelectLevel={onSelect}
        onAddLevel={() => {}}
        underlayEnabled
        hasUnderlayLevel={false}
        onToggleUnderlay={onToggle}
        models={[]}
        visibility={new Map()}
        onToggleModel={() => {}}
        onLoadIfc={() => {}}
        onMetrics={() => {}}
        collapsed={false}
        onToggleCollapsed={() => {}}
      />,
    );
    expect(screen.getByTestId('project-level-ground')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-level-ground'));
    expect(onSelect).toHaveBeenCalledWith('ground');
  });
});
