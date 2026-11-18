import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createComplexVillaDocument } from '@mini-bim/core';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { MetricsPanel } from './components/MetricsPanel.js';

describe('Intégration UI & Double Rendu 2D/3D — « Villa Contemporaine Complexe » (Chantier 7.5-A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  });

  it('monte Viewport2D et Viewport3D avec la Villa Complexe sans aucune exception graphique', () => {
    const doc = createComplexVillaDocument();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <div style={{ display: 'flex', width: 1200, height: 800 }}>
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

  it('MetricsPanel affiche les quantitatifs exacts de la Villa Complexe (50.76m de murs, 4 portes, 2 fenêtres)', () => {
    const doc = createComplexVillaDocument();

    const { container } = render(
      <BimDocumentProvider initialDoc={doc}>
        <MetricsPanel doc={doc} activeLevelId="lvl_0" />
      </BimDocumentProvider>,
    );

    const textContent = container.textContent ?? '';

    // Vérification du tableau de métrés analytiques (calcul polygonal exact Phase 7.6 : 156.79m² réels sous pignon)
    expect(textContent).toContain('Métrés');
    expect(textContent).toContain('Linéaire total50.76m');
    expect(textContent).toContain('Surface nette totale156.79m²');
    expect(textContent).toContain('Portes4u');
    expect(textContent).toContain('Fenêtres2u');
    expect(textContent).toContain('Cellier4.38m²');
    expect(textContent).toContain('Cuisine12.06m²');
    expect(textContent).toContain('Salon / Séjour47.95m²');

    cleanup();
  });
});
