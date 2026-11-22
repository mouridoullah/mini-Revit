import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { BimDocument, exportToIfc, DependencyGraph, MepNetworkGraph } from '@tabax/core';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { MetricsPanel } from './components/MetricsPanel.js';

describe('Intégration UI & Double Rendu 2D/3D — « Immeuble R+4 Complet » (Test Global)', () => {
  let doc: BimDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();

    const jsonPath = path.resolve(__dirname, '../public/demo-immeuble-r4.json');
    const jsonStr = fs.readFileSync(jsonPath, 'utf8');
    doc = BimDocument.fromJSON(jsonStr);
  });

  it('valide l’intégrité documentaire et la présence de 100% des composantes BIM & MEP', () => {
    const state = doc.getState();

    // Architecture
    expect(Object.keys(state.levels)).toHaveLength(6);
    expect(Object.keys(state.walls)).toHaveLength(78);
    expect(Object.keys(state.slabs)).toHaveLength(6);
    expect(Object.keys(state.doors)).toHaveLength(31);
    expect(Object.keys(state.windows)).toHaveLength(36);
    expect(Object.keys(state.rooms)).toHaveLength(36);
    expect(Object.keys(state.stairs ?? {})).toHaveLength(5);
    expect(Object.keys(state.roofs ?? {})).toHaveLength(1);
    expect(Object.keys(state.roofOpenings ?? {})).toHaveLength(1);
    expect(Object.keys(state.dimensions)).toHaveLength(5);
    expect(Object.keys(state.components ?? {})).toHaveLength(108);

    // MEP (Réseaux Techniques)
    expect(Object.keys(state.pipes ?? {})).toHaveLength(285);
    expect(Object.keys(state.ducts ?? {})).toHaveLength(12);
    expect(Object.keys(state.cableTrays ?? {})).toHaveLength(12);
    expect(Object.keys(state.mepFittings ?? {})).toHaveLength(284);
    expect(Object.keys(state.mepEquipments ?? {})).toHaveLength(41);
    expect(Object.keys(state.mepSystems ?? {})).toHaveLength(7);
    expect(Object.keys(state.mepConnectors ?? {})).toHaveLength(624);

    // Graphs
    const dag = DependencyGraph.build(state);
    expect(dag.hasCycle()).toBe(false);

    const mepGraph = MepNetworkGraph.build(state);
    expect(mepGraph.getElementCount()).toBeGreaterThanOrEqual(600);
    expect(mepGraph.getConnectorCount()).toBeGreaterThanOrEqual(600);
  });

  it('monte Viewport2D et Viewport3D avec l’Immeuble R+4 sans aucune exception graphique', () => {
    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <div style={{ display: 'flex', width: 1400, height: 900 }}>
          <Viewport2D />
          <Viewport3D />
        </div>
      </BimDocumentProvider>,
    );

    const canvas2D = getByTestId('viewport-2d-canvas');
    const canvas3D = getByTestId('viewport-3d-canvas');

    expect(canvas2D).toBeDefined();
    expect(canvas3D).toBeDefined();

    cleanup();
  });

  it('MetricsPanel affiche les quantitatifs exacts du niveau RDC', () => {
    const { container } = render(
      <BimDocumentProvider initialDoc={doc}>
        <MetricsPanel doc={doc} activeLevelId="level_r0" />
      </BimDocumentProvider>,
    );

    const textContent = container.textContent ?? '';

    expect(textContent).toContain('Métrés');
    expect(textContent).toContain('74.70m');
    expect(textContent).toContain('Portes6');
    expect(textContent).toContain('Fenêtres6');
    expect(textContent).toContain('Surface utile totale95.77m²');

    cleanup();
  });

  it('exporte l’Immeuble R+4 au format IFC4 avec toutes les classes architecturales et mobiliers requises', () => {
    const ifc = exportToIfc(doc.getState());

    expect(ifc).toContain('IFCWALL');
    expect(ifc).toContain('IFCSLAB');
    expect(ifc).toContain('IFCDOOR');
    expect(ifc).toContain('IFCWINDOW');
    expect(ifc).toContain('IFCSPACE');
    expect(ifc).toContain('IFCSTAIR');
    expect(ifc).toContain('IFCROOF');
    expect(ifc).toContain('IFCFURNITURE');
    expect(ifc).toContain('IFCSANITARYTERMINAL');
    expect(ifc.length).toBeGreaterThan(100000);
  });
});
