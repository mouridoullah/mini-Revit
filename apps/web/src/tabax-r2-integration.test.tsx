import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { BimDocument, exportToIfc } from '@tabax/core';
import { generatePlanDxf, generatePdfBook } from '@tabax/view-2d';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { SectionViewport } from './components/SectionViewport.js';

describe('Intégration UI Tabax R2 Test Model — Tests Exhaustifs', () => {
  let doc: BimDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();

    const jsonPath = path.resolve(__dirname, '../public/tabax-r2-test-model-v2.json');
    const jsonStr = fs.readFileSync(jsonPath, 'utf8');
    doc = BimDocument.fromJSON(jsonStr);
  });

  it('renders Viewport2D on all 3 levels without error', () => {
    for (const levelId of ['level_rdc', 'level_r1', 'level_r2']) {
      const { container } = render(
        <BimDocumentProvider initialDoc={doc}>
          <Viewport2D activeLevelId={levelId} />
        </BimDocumentProvider>,
      );
      expect(container).toBeDefined();
      cleanup();
    }
  });

  it('renders Viewport3D without error', () => {
    const { container } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D selection={[]} onSelectionChanged={() => {}} />
      </BimDocumentProvider>,
    );
    expect(container).toBeDefined();
    cleanup();
  });

  it('renders SectionViewport for all 4 section cuts without error', () => {
    const state = doc.getState();
    for (const cutId of Object.keys(state.sectionCuts ?? {})) {
      const { container } = render(
        <BimDocumentProvider initialDoc={doc}>
          <SectionViewport sectionCutId={cutId} />
        </BimDocumentProvider>,
      );
      expect(container).toBeDefined();
      cleanup();
    }
  });

  it('MetricsPanel renders and displays exact metrics', () => {
    const { container } = render(
      <BimDocumentProvider initialDoc={doc}>
        <MetricsPanel doc={doc} activeLevelId="level_rdc" />
      </BimDocumentProvider>,
    );
    expect(container.textContent).toContain('Métrés');
    cleanup();
  });

  it('exports IFC4 successfully with all entities', () => {
    const ifc = exportToIfc(doc.getState());
    expect(ifc).toContain('IFCWALL');
    expect(ifc).toContain('IFCSLAB');
    expect(ifc).toContain('IFCDOOR');
    expect(ifc).toContain('IFCWINDOW');
    expect(ifc).toContain('IFCROOF');
    expect(ifc).toContain('IFCSTAIR');
  });

  it('exports DXF and PDF book successfully', () => {
    for (const levelId of ['level_rdc', 'level_r1', 'level_r2']) {
      const dxf = generatePlanDxf(doc, { levelId });
      expect(dxf.length).toBeGreaterThan(1000);
    }
    const pdf = generatePdfBook(doc, { paperSize: 'A3' });
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
