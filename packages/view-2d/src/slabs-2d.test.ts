import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';
import { drawSlab, DEFAULT_SLAB_RENDER_CONFIG } from './renderer.js';
import { type SlabFor2D, type SlabTypeFor2D } from './types.js';
import { createMockCanvas } from './test-utils.js';

describe('Phase 6.1b — Rendu 2D des Dalles (packages/view-2d/src/slabs-2d.test.ts)', () => {
  const transform = new Transform2D({
    origin: vec2(0, 0),
    scale: 0.1, // 100 px pour 1000 mm
    viewportWidth: 800,
    viewportHeight: 600,
  });

  const baseSlab: SlabFor2D = {
    id: 'slab_01',
    category: 'slab',
    slabTypeId: 'st_concrete_200',
    levelId: 'lvl_0',
    boundary: [vec2(0, 0), vec2(4000, 0), vec2(4000, 3000), vec2(0, 3000)],
  };

  const slabType: SlabTypeFor2D = {
    id: 'st_concrete_200',
    name: 'Dalle BA 200mm',
    thickness: 200,
  };

  it('T-SLAB-2D-01 : Rendu poché présent — fill() est appelé avec la couleur de fond configurée (#f3f4f6)', () => {
    const { mock } = createMockCanvas(800, 600);

    drawSlab(mock.ctx, transform, baseSlab, slabType, false, DEFAULT_SLAB_RENDER_CONFIG);

    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
    expect(mock.ctx.fillStyle).toBe(DEFAULT_SLAB_RENDER_CONFIG.fillColor);
  });

  it('T-SLAB-2D-02 : Hachures présentes — tracé des diagonales 45° sous masque de clip', () => {
    const { mock } = createMockCanvas(800, 600);

    drawSlab(mock.ctx, transform, baseSlab, slabType, false, DEFAULT_SLAB_RENDER_CONFIG);

    const clipCalls = mock.filterCalls('clip');
    expect(clipCalls.length).toBe(1);

    const lineToCalls = mock.filterCalls('lineTo');
    // Le contour extérieur compte 4 côtés, plus les diagonales de hachure
    expect(lineToCalls.length).toBeGreaterThan(6);
  });

  it('T-SLAB-2D-03 : Trémies avec diagonales — croix de réservation tracée sur les trous', () => {
    const { mock } = createMockCanvas(800, 600);

    const slabWithHole: SlabFor2D = {
      ...baseSlab,
      holes: [[vec2(1000, 1000), vec2(2000, 1000), vec2(2000, 2000), vec2(1000, 2000)]],
    };

    drawSlab(mock.ctx, transform, slabWithHole, slabType, false, DEFAULT_SLAB_RENDER_CONFIG);

    // Les diagonales de réservation forment un X -> au moins 2 moveTo et 2 lineTo supplémentaires
    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls.length).toBeGreaterThanOrEqual(3); // hachure + contour + trémie/croix
  });

  it('T-SLAB-2D-04 : Sélection -> surbrillance — contour accentué avec selectedStrokeColor (#3b82f6) et épaisseur 2', () => {
    const { mock } = createMockCanvas(800, 600);

    drawSlab(mock.ctx, transform, baseSlab, slabType, true, DEFAULT_SLAB_RENDER_CONFIG);

    expect(mock.ctx.strokeStyle).toBe(DEFAULT_SLAB_RENDER_CONFIG.selectedStrokeColor);
    expect(mock.ctx.lineWidth).toBe(DEFAULT_SLAB_RENDER_CONFIG.selectedStrokeWidth);
  });

  it('T-SLAB-2D-05 : Un Slab sans hole -> pas de diagonales de réservation', () => {
    const { mock } = createMockCanvas(800, 600);

    drawSlab(mock.ctx, transform, baseSlab, slabType, false, DEFAULT_SLAB_RENDER_CONFIG);

    const strokeCallsWithoutHole = mock.filterCalls('stroke');

    const { mock: mockWithHole } = createMockCanvas(800, 600);
    const slabWithHole: SlabFor2D = {
      ...baseSlab,
      holes: [[vec2(1000, 1000), vec2(2000, 1000), vec2(2000, 2000), vec2(1000, 2000)]],
    };
    drawSlab(
      mockWithHole.ctx,
      transform,
      slabWithHole,
      slabType,
      false,
      DEFAULT_SLAB_RENDER_CONFIG,
    );

    const strokeCallsWithHole = mockWithHole.filterCalls('stroke');

    // Le tracé avec trou comporte obligatoirement plus de passes de stroke pour la trémie et sa croix
    expect(strokeCallsWithHole.length).toBeGreaterThan(strokeCallsWithoutHole.length);
  });
});
