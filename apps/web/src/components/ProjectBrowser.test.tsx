import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Level, SectionCut } from '@tabax/core';
import { ProjectBrowser } from './ProjectBrowser.js';

describe('Composant <ProjectBrowser />', () => {
  const dummyLevels: readonly Level[] = [
    { id: 'level_0', name: 'RDC', elevation: 0, height: 3000 },
    { id: 'level_1', name: 'R+1', elevation: 3000, height: 3000 },
  ];

  const dummySectionCuts: readonly SectionCut[] = [
    {
      id: 'sec_1',
      name: "Coupe A-A'",
      category: 'sectionCut',
      label: 'A',
      kind: 'section',
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
      viewDirection: 1,
      depth: 2000,
    },
  ];

  it('affiche les niveaux et permet de changer de niveau actif', () => {
    const handleSelectLevel = vi.fn();
    render(
      <ProjectBrowser
        levels={dummyLevels}
        activeLevelId="level_0"
        onSelectLevel={handleSelectLevel}
        onAddLevel={vi.fn()}
        underlayEnabled={true}
        onToggleUnderlay={vi.fn()}
        hasUnderlayLevel={true}
        models={[]}
        visibility={new Map()}
        onToggleModel={vi.fn()}
        onLoadIfc={vi.fn()}
        onMetrics={vi.fn()}
        sectionCuts={dummySectionCuts}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText('RDC')).toBeDefined();
    expect(screen.getByText('R+1')).toBeDefined();

    fireEvent.click(screen.getByText('R+1'));
    expect(handleSelectLevel).toHaveBeenCalledWith('level_1');
  });

  it('affiche les coupes et déclenche onSelectSectionCut au clic', () => {
    const handleSelectCut = vi.fn();
    render(
      <ProjectBrowser
        levels={dummyLevels}
        activeLevelId="level_0"
        onSelectLevel={vi.fn()}
        onAddLevel={vi.fn()}
        underlayEnabled={true}
        onToggleUnderlay={vi.fn()}
        hasUnderlayLevel={true}
        models={[]}
        visibility={new Map()}
        onToggleModel={vi.fn()}
        onLoadIfc={vi.fn()}
        onMetrics={vi.fn()}
        sectionCuts={dummySectionCuts}
        onSelectSectionCut={handleSelectCut}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );

    expect(screen.getByText("Coupe A-A'")).toBeDefined();
    fireEvent.click(screen.getByText("Coupe A-A'"));
    expect(handleSelectCut).toHaveBeenCalledWith('sec_1');
  });
});
