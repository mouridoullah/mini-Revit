import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BimDocument, AddLevelCommand, AddSectionCutCommand } from '@mini-bim/core';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { SectionViewport } from './SectionViewport.js';

describe('SectionViewport Component (apps/web/src/components/SectionViewport.tsx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((id: string) => {
      if (id === '2d') {
        return {
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          fillRect: vi.fn(),
          clearRect: vi.fn(),
          fillText: vi.fn(),
          setLineDash: vi.fn(),
          getLineDash: vi.fn(() => []),
          clip: vi.fn(),
          arc: vi.fn(),
          strokeRect: vi.fn(),
          setTransform: vi.fn(),
          resetTransform: vi.fn(),
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('affiche un état vide informatif quand aucune coupe n’est sélectionnée', () => {
    const doc = new BimDocument();
    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <SectionViewport sectionCutId={null} />
      </BimDocumentProvider>,
    );

    expect(getByTestId('section-viewport-empty')).toBeDefined();
  });

  it('affiche la coupe active, le canvas et les boutons d’export SVG et DXF', () => {
    const doc = new BimDocument();
    doc.execute(
      new AddLevelCommand({
        id: 'lvl_0',
        name: 'RDC',
        elevation: 0,
        height: 2800,
      }),
    );
    doc.execute(
      new AddSectionCutCommand({
        id: 'cut_transversale',
        category: 'sectionCut',
        name: "Coupe A-A'",
        label: 'A',
        kind: 'section',
        start: { x: 0, y: 2000 },
        end: { x: 10000, y: 2000 },
        viewDirection: 1,
        depth: 6000,
      }),
    );

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <SectionViewport sectionCutId="cut_transversale" />
      </BimDocumentProvider>,
    );

    expect(getByTestId('section-viewport')).toBeDefined();
    expect(getByTestId('section-active-title').textContent).toBe("Coupe A-A'");
    expect(getByTestId('section-canvas')).toBeDefined();

    const svgBtn = getByTestId('export-section-svg-btn');
    const dxfBtn = getByTestId('export-section-dxf-btn');
    expect(svgBtn).toBeDefined();
    expect(dxfBtn).toBeDefined();

    // Clic sur l'export DXF déclenche le téléchargement du blob DXF
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(dxfBtn);

    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();

    // Clic sur l'export SVG déclenche le téléchargement du blob SVG
    fireEvent.click(svgBtn);
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(2);

    clickSpy.mockRestore();
  });
});
