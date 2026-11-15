import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';
import {
  drawStair,
  drawStairs,
  drawPreview,
  DEFAULT_STAIR_RENDER_CONFIG,
} from './renderer.js';
import { type StairFor2D, type StairTypeFor2D } from './types.js';
import { createMockCanvas } from './test-utils.js';

describe('Phase 6.4 — Rendu 2D des Escaliers (packages/view-2d/src/stairs-2d.test.ts)', () => {
  const transform = new Transform2D({
    origin: vec2(0, 0),
    scale: 0.1, // 100 px pour 1000 mm
    viewportWidth: 800,
    viewportHeight: 600,
  });

  const baseStair: StairFor2D = {
    id: 'stair_01',
    category: 'stair',
    stairTypeId: 'st_timber_900',
    bottomLevelId: 'lvl_0',
    topLevelId: 'lvl_1',
    start: vec2(0, 0),
    end: vec2(4200, 0),
  };

  const stairType: StairTypeFor2D = {
    id: 'st_timber_900',
    name: 'Escalier Bois 900mm',
    width: 900,
  };

  it('T-STAIR-2D-01 : Rendu complet — contour rectangulaire, nez de marches, ligne de foulée fléchée et pastille', () => {
    const { mock } = createMockCanvas(800, 600);

    drawStair(mock.ctx, transform, baseStair, stairType, false, DEFAULT_STAIR_RENDER_CONFIG);

    // 1. Contour rempli et tracé
    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);

    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls.length).toBeGreaterThanOrEqual(3); // contour, marches, walkline

    // 2. Pastille de départ (arc)
    const arcCalls = mock.filterCalls('arc');
    expect(arcCalls.length).toBeGreaterThanOrEqual(1);

    // 3. Lignes transversales (marches)
    const lineToCalls = mock.filterCalls('lineTo');
    // 4 coins contour + ~14 marches + flèche
    expect(lineToCalls.length).toBeGreaterThanOrEqual(15);
  });

  it('T-STAIR-2D-02 : Priorité de largeur — utilise widthOverride si présent, sinon stairType.width, sinon 900', () => {
    const { mock } = createMockCanvas(800, 600);

    const stairWithOverride: StairFor2D = {
      ...baseStair,
      widthOverride: 1100,
    };

    drawStair(mock.ctx, transform, stairWithOverride, stairType, false, DEFAULT_STAIR_RENDER_CONFIG);

    const moveToCalls = mock.filterCalls('moveTo');
    expect(moveToCalls.length).toBeGreaterThan(0);
    // Première coordonnée de coin Y = -550 mm monde -> convertie en écran (55 px sous le centre)
    const firstMove = moveToCalls[0]!;
    // worldToScreen de { x: 0, y: -550 } à scale 0.1, origin 0, viewport 800x600:
    // cy + 550 * 0.1 = 300 + 55 = 355
    expect(firstMove.args[1]).toBeCloseTo(355, 1);
  });

  it('T-STAIR-2D-03 : Style de sélection — contour accentué et couleur bleue en sélection', () => {
    const { mock } = createMockCanvas(800, 600);

    drawStair(mock.ctx, transform, baseStair, stairType, true, DEFAULT_STAIR_RENDER_CONFIG);

    expect(mock.ctx.strokeStyle).toBe(DEFAULT_STAIR_RENDER_CONFIG.selectedStrokeColor);
    expect(mock.ctx.lineWidth).toBe(DEFAULT_STAIR_RENDER_CONFIG.selectedStrokeWidth);
  });

  it('T-STAIR-2D-04 : Filtrage multi-niveaux — drawStairs filtre selon bottomLevelId', () => {
    const { mock } = createMockCanvas(800, 600);

    const stairs: Record<string, StairFor2D> = {
      stair_0: baseStair,
      stair_1: {
        ...baseStair,
        id: 'stair_02',
        bottomLevelId: 'lvl_1',
        topLevelId: 'lvl_2',
      },
    };

    // Filtre sur lvl_0 : seul stair_0 doit être dessiné
    drawStairs(
      mock.ctx,
      transform,
      stairs,
      { [stairType.id]: stairType },
      new Set(),
      DEFAULT_STAIR_RENDER_CONFIG,
      'lvl_0',
    );

    const arcCalls = mock.filterCalls('arc');
    expect(arcCalls.length).toBe(1); // 1 seule pastille de départ
  });

  it('T-STAIR-2D-05 : Prévisualisation interactive — drawPreview trace un rectangle pointillé et une ligne axiale', () => {
    const { mock } = createMockCanvas(800, 600);

    drawPreview(mock.ctx, transform, {
      kind: 'stair',
      start: vec2(0, 0),
      end: vec2(3000, 0),
      width: 900,
    });

    const setLineDashCalls = mock.filterCalls('setLineDash');
    expect(setLineDashCalls.length).toBeGreaterThanOrEqual(1);

    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);

    const arcCalls = mock.filterCalls('arc');
    expect(arcCalls.length).toBe(2); // 2 pastilles aux extrémités
  });
});
