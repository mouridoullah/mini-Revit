import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClashResult } from '@tabax/core';
import { ClashPresentation } from './ClashPresentation.js';
import { createDemoDocument } from '../../demo/demoDocument.js';

describe('Composant <ClashPresentation /> (Unified Clash UI Presentation)', () => {
  const dummyClashes: readonly ClashResult[] = [
    {
      id: 'clash-1',
      elementA: 'wall_1',
      elementB: 'pipe_1',
      categoryA: 'wall',
      categoryB: 'pipe',
      severity: 'hard',
      disciplineA: 'structure',
      disciplineB: 'mep',
      penetrationDepthMm: 50,
      intersectionBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      description: 'Pénétration mur / tuyauterie',
      point: { x: 100, y: 200, z: 300 },
    },
    {
      id: 'clash-2',
      elementA: 'duct_1',
      elementB: 'pipe_2',
      categoryA: 'duct',
      categoryB: 'pipe',
      severity: 'clearance',
      disciplineA: 'mep',
      disciplineB: 'mep',
      penetrationDepthMm: 25,
      intersectionBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      description: 'Garde insuffisante gaine / tuyau',
      point: { x: 400, y: 500, z: 600 },
    },
  ];

  it('affiche les conflits en mode dock avec les testids correspondants', () => {
    const doc = createDemoDocument();
    const onSelect = vi.fn();
    const onSelectId = vi.fn();

    render(
      <ClashPresentation
        doc={doc}
        clashes={dummyClashes}
        selectedClashId="clash-1"
        onSelectClashId={onSelectId}
        onSelectClash={onSelect}
        layout="dock"
      />,
    );

    expect(screen.getByTestId('clash-table')).toBeDefined();
    expect(screen.getByTestId('clash-row-clash-1')).toBeDefined();
    expect(screen.getByTestId('clash-detail-card')).toBeDefined();
    expect(screen.getByTestId('center-3d-cam-btn')).toBeDefined();
    expect(screen.getByTestId('locate-2d-plan-btn')).toBeDefined();

    fireEvent.click(screen.getByTestId('clash-row-clash-2'));
    expect(onSelectId).toHaveBeenCalledWith('clash-2');
  });

  it('affiche les conflits en mode workspace avec les testids correspondants', () => {
    const doc = createDemoDocument();
    const onSelectId = vi.fn();

    render(
      <ClashPresentation
        doc={doc}
        clashes={dummyClashes}
        selectedClashId="clash-1"
        onSelectClashId={onSelectId}
        layout="workspace"
      />,
    );

    expect(screen.getByTestId('clash-table')).toBeDefined();
    expect(screen.getByTestId('workspace-clash-row-clash-1')).toBeDefined();
    expect(screen.getByTestId('workspace-clash-detail')).toBeDefined();
    expect(screen.getByTestId('workspace-center-3d-btn')).toBeDefined();
    expect(screen.getByTestId('workspace-locate-2d-btn')).toBeDefined();
  });

  it('filtre par sévérité et par discipline', () => {
    const doc = createDemoDocument();
    render(
      <ClashPresentation
        doc={doc}
        clashes={dummyClashes}
        selectedClashId={null}
        onSelectClashId={vi.fn()}
        layout="dock"
      />,
    );

    const filter = screen.getByTestId('severity-filter');
    fireEvent.change(filter, { target: { value: 'clearance' } });

    expect(screen.queryByTestId('clash-row-clash-1')).toBeNull();
    expect(screen.getByTestId('clash-row-clash-2')).toBeDefined();
  });
});
