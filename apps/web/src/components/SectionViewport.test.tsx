import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BimDocument, AddLevelCommand, AddSectionCutCommand } from '@tabax/core';
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

  it('affiche une élévation de façade avec le titre et l’icône bâtiment', () => {
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
        id: 'elev_sud',
        category: 'sectionCut',
        name: 'Façade Sud',
        label: 'S',
        kind: 'elevation',
        start: { x: -1500, y: -1500 },
        end: { x: 11500, y: -1500 },
        viewDirection: 1,
        depth: 20000,
      }),
    );

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <SectionViewport sectionCutId="elev_sud" />
      </BimDocumentProvider>,
    );

    expect(getByTestId('section-viewport')).toBeDefined();
    expect(getByTestId('section-active-title').textContent).toBe('Façade Sud');
    expect(getByTestId('section-canvas')).toBeDefined();
  });

  it('gère les contrôles de zoom interactifs (Zoom In, Zoom Out, Cadrer, Molette)', () => {
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
        id: 'cut_test',
        category: 'sectionCut',
        name: 'Coupe Test',
        label: 'T',
        kind: 'section',
        start: { x: 0, y: 1000 },
        end: { x: 8000, y: 1000 },
        viewDirection: 1,
        depth: 4000,
      }),
    );

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <SectionViewport sectionCutId="cut_test" />
      </BimDocumentProvider>,
    );

    const zoomText = getByTestId('zoom-level-text');
    expect(zoomText.textContent).toBe('100%');

    // Zoom avant
    const zoomInBtn = getByTestId('zoom-in-section-btn');
    fireEvent.click(zoomInBtn);
    expect(zoomText.textContent).toBe('125%');

    // Zoom arrière
    const zoomOutBtn = getByTestId('zoom-out-section-btn');
    fireEvent.click(zoomOutBtn);
    expect(zoomText.textContent).toBe('100%');

    // Zoom molette
    const canvas = getByTestId('section-canvas');
    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(zoomText.textContent).toBe('115%');

    // Cadrer (reset)
    const fitBtn = getByTestId('zoom-fit-section-btn');
    fireEvent.click(fitBtn);
    expect(zoomText.textContent).toBe('100%');
  });
});
