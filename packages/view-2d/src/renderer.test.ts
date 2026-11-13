import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, type Wall, type WallType } from '@mini-bim/core';
import { Transform2D } from './transform.js';
import {
  clearCanvas,
  drawGrid,
  drawWall,
  drawWalls,
  renderPlanView,
  DEFAULT_GRID_CONFIG,
  DEFAULT_WALL_RENDER_CONFIG,
  DEFAULT_VIEW2D_RENDER_CONFIG,
} from './renderer.js';
import { createMockCanvas } from './test-utils.js';

describe('Renderer 2D (renderer.ts)', () => {
  it('clearCanvas remplit le canvas avec la couleur d’arrière-plan configurée', () => {
    const { mock } = createMockCanvas(800, 600);
    clearCanvas(mock.ctx, 800, 600, '#fafafa');

    expect(mock.ctx.fillStyle).toBe('#fafafa');
    const fillRectCalls = mock.filterCalls('fillRect');
    expect(fillRectCalls).toHaveLength(1);
    expect(fillRectCalls[0]?.args).toEqual([0, 0, 800, 600]);
  });

  it('drawGrid n’effectue aucun tracé si config.show == false', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D();

    drawGrid(mock.ctx, transform, { ...DEFAULT_GRID_CONFIG, show: false });
    expect(mock.filterCalls('stroke')).toHaveLength(0);
  });

  it('drawGrid trace la grille et les axes X (rouge) et Y (vert)', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1, // 100 px pour 1000 mm -> pas mineur 100 mm = 10 px
      viewportWidth: 800,
      viewportHeight: 600,
    });

    drawGrid(mock.ctx, transform, DEFAULT_GRID_CONFIG, true);

    const strokeCalls = mock.filterCalls('stroke');
    // Doit avoir tracé la grille mineure, majeure et les 2 axes
    expect(strokeCalls.length).toBeGreaterThanOrEqual(3);

    const lineToCalls = mock.filterCalls('lineTo');
    expect(lineToCalls.length).toBeGreaterThan(10);
  });

  it('drawGrid désactive les lignes mineures si leur espacement écran est inférieur à minPixelSpacing', () => {
    const { mock } = createMockCanvas(800, 600);
    // scale modérée : 0.02 px/mm -> pas mineur 100 mm = 2 px (< 10 px, supprimé), pas majeur 1000 mm = 20 px (>= 10 px, tracé)
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.02,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    drawGrid(mock.ctx, transform, { ...DEFAULT_GRID_CONFIG, minPixelSpacing: 10 }, false);

    // Seule la grille majeure doit être tracée
    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls).toHaveLength(1);
  });

  it('drawWall trace le poché (fill), le contour (stroke) et l’axe central en pointillé', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const wall: Wall = {
      id: 'w_test_1',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_rdc',
      start: vec2(0, 0),
      end: vec2(4000, 0),
    };

    const wallType: WallType = {
      id: 'wt_standard',
      name: 'Mur Béton 200mm',
      thickness: 200,
      height: 2800,
    };

    drawWall(mock.ctx, transform, wall, wallType, false, DEFAULT_WALL_RENDER_CONFIG);

    // 1. Poché rempli
    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls).toHaveLength(1);

    // 2. Contour fermé (4 sommets + closePath)
    const closePathCalls = mock.filterCalls('closePath');
    expect(closePathCalls).toHaveLength(1);

    // 3. Deux traits tracés (contour d'emprise + axe central)
    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls).toHaveLength(2);

    // 4. Axe central avec setLineDash
    const setLineDashCalls = mock.filterCalls('setLineDash');
    expect(setLineDashCalls).toHaveLength(1);
    expect(setLineDashCalls[0]?.args[0]).toEqual([6, 4]);
  });

  it('drawWall applique les styles de surbrillance lorsque isSelected == true', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D();

    const wall: Wall = {
      id: 'w_selected',
      category: 'wall',
      typeId: 'wt_200',
      levelId: 'lvl_1',
      start: vec2(0, 0),
      end: vec2(3000, 0),
    };
    const wallType: WallType = {
      id: 'wt_200',
      name: 'Porteur 200',
      thickness: 200,
      height: 2800,
    };

    drawWall(mock.ctx, transform, wall, wallType, true, DEFAULT_WALL_RENDER_CONFIG);

    // Vérification de la couleur et épaisseur de sélection
    expect(mock.ctx.fillStyle).toBe(DEFAULT_WALL_RENDER_CONFIG.selectedFillColor);
    expect(mock.ctx.strokeStyle).toBe(DEFAULT_WALL_RENDER_CONFIG.selectedStrokeColor);
    expect(mock.ctx.lineWidth).toBe(DEFAULT_WALL_RENDER_CONFIG.centerlineWidth); // Après tracé de l'axe
  });

  it('drawWalls filtre correctement selon le niveau spécifié', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D();

    const wallTypes: Record<string, WallType> = {
      wt_1: { id: 'wt_1', name: 'T1', thickness: 200, height: 2800 },
    };

    const walls: Record<string, Wall> = {
      w_rdc: {
        id: 'w_rdc',
        category: 'wall',
        typeId: 'wt_1',
        levelId: 'lvl_rdc',
        start: vec2(0, 0),
        end: vec2(4000, 0),
      },
      w_etage: {
        id: 'w_etage',
        category: 'wall',
        typeId: 'wt_1',
        levelId: 'lvl_etage',
        start: vec2(0, 0),
        end: vec2(4000, 0),
      },
    };

    // Rendu uniquement pour le RDC
    drawWalls(
      mock.ctx,
      transform,
      walls,
      wallTypes,
      new Set(),
      DEFAULT_WALL_RENDER_CONFIG,
      'lvl_rdc',
    );

    // 1 mur rendu -> 1 fill()
    expect(mock.filterCalls('fill')).toHaveLength(1);

    mock.clearCalls();

    // Rendu sans filtre (tous les niveaux) -> 2 murs -> 2 fill()
    drawWalls(mock.ctx, transform, walls, wallTypes, new Set(), DEFAULT_WALL_RENDER_CONFIG, null);
    expect(mock.filterCalls('fill')).toHaveLength(2);
  });

  it('renderPlanView orchestre le cycle complet de rendu sans crash', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D();

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_plan_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      }),
    );
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_plan_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(5000, 0),
        end: vec2(5000, 4000),
      }),
    );

    renderPlanView(mock.ctx, transform, doc, new Set(['w_plan_1']), DEFAULT_VIEW2D_RENDER_CONFIG);

    // Arrière-plan effacé
    expect(mock.filterCalls('fillRect')).toHaveLength(1);
    // 2 murs rendus
    expect(mock.filterCalls('fill')).toHaveLength(2);
    expect(mock.filterCalls('stroke').length).toBeGreaterThanOrEqual(4);
  });
});
