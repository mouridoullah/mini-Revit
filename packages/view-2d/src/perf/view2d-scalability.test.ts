import { describe, it, expect } from 'vitest';
import { BimDocument, generateSyntheticBimModel, runBenchmark } from '@mini-bim/core';
import { Transform2D } from '../transform.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from '../renderer.js';
import { createMockCanvas } from '../test-utils.js';

describe('Chantier 9.1.4 : Scalabilité du Rendu 2D Canvas (@mini-bim/view-2d)', () => {
  it('Mesure le temps de rendu 2D unifié sur 100 et 1 000 éléments', () => {
    const { mock } = createMockCanvas(1920, 1080);
    const transform = new Transform2D({
      scale: 0.05,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    // 1. Modèle 100 entités
    const doc100 = new BimDocument(generateSyntheticBimModel(100).state);
    const m2D_100 = runBenchmark('VIEW2D_RENDER_100', () => {
      renderPlanView(mock.ctx, transform, doc100, new Set(), DEFAULT_VIEW2D_RENDER_CONFIG);
    }, { warmup: 3, iterations: 10 });

    expect(m2D_100.p50Ms).toBeLessThan(25); // Moins de 25 ms

    // 2. Modèle 1 000 entités
    const doc1000 = new BimDocument(generateSyntheticBimModel(1000).state);
    const m2D_1000 = runBenchmark('VIEW2D_RENDER_1000', () => {
      renderPlanView(mock.ctx, transform, doc1000, new Set(), DEFAULT_VIEW2D_RENDER_CONFIG);
    }, { warmup: 2, iterations: 5 });

    // Sur 1 000 éléments sans culling spatial, le rendu 2D complet prend ~270 ms
    expect(m2D_1000.p50Ms).toBeLessThan(350);
  });
});
