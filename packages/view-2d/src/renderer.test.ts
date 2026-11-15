import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, type Wall, type WallType } from '@mini-bim/core';
import { Transform2D } from './transform.js';
import {
  clearCanvas,
  drawGrid,
  drawWall,
  drawWalls,
  drawRooms,
  drawDimensions,
  drawOpeningDoor,
  drawOpeningWindow,
  renderPlanView,
  DEFAULT_GRID_CONFIG,
  DEFAULT_WALL_RENDER_CONFIG,
  DEFAULT_VIEW2D_RENDER_CONFIG,
  DEFAULT_DIMENSION_RENDER_CONFIG,
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

  it('drawOpeningDoor trace l’évidement du poché, les ébrasements, le vantail et l’arc de 90°', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1, // 0.1 px/mm -> 900 mm = 90 px
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const wall: Wall = {
      id: 'w1',
      category: 'wall',
      typeId: 'wt1',
      levelId: 'lvl1',
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };

    drawOpeningDoor(
      mock.ctx,
      transform,
      {
        id: 'door1',
        hostWallId: 'w1',
        offsetAlong: 2000,
        width: 900,
        swing: { side: 'right', direction: 'in' },
      },
      wall,
      200,
      false,
      DEFAULT_WALL_RENDER_CONFIG,
      '#ffffff',
    );

    // 1. Évidement du poché : 1 fill() avec la couleur d'arrière-plan
    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls).toHaveLength(1);

    // 2. Arc de 90° : 1 appel à ctx.arc
    const arcCalls = mock.filterCalls('arc');
    expect(arcCalls).toHaveLength(1);
    const arcArgs = arcCalls[0]?.args as [number, number, number, number, number, boolean];
    const [arcX, arcY, arcRadius, startAngle, endAngle, counterclockwise] = arcArgs;

    // Rayon écran = 900 mm * 0.1 px/mm = 90 px
    expect(arcRadius).toBeCloseTo(90, 5);

    // Pour side='right', la charnière est à offsetAlong + width = 2900 mm
    // screenX = 400 + 2900 * 0.1 = 690, screenY = 300 - 0 * 0.1 = 300
    expect(arcX).toBeCloseTo(690, 5);
    expect(arcY).toBeCloseTo(300, 5);

    // L'arc couvre exactement 90° (PI/2 radians) sur le cercle trigonométrique
    const angularSpan = Math.abs(
      Math.atan2(Math.sin(endAngle - startAngle), Math.cos(endAngle - startAngle)),
    );
    expect(angularSpan).toBeCloseTo(Math.PI / 2, 5);
    expect(typeof counterclockwise).toBe('boolean');

    // 3. Vantail et ébrasements : plusieurs segments tracés
    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('drawOpeningDoor vérifie les angles exacts et sens de rotation sur les 4 combinaisons (side × direction × orientation du mur)', () => {
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1, // 1000 mm = 100 px
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const getArcParams = (
      wall: Wall,
      swing: { side: 'left' | 'right'; direction: 'in' | 'out' },
    ) => {
      const { mock } = createMockCanvas(800, 600);
      drawOpeningDoor(
        mock.ctx,
        transform,
        {
          id: 'door_test',
          hostWallId: wall.id,
          offsetAlong: 1000,
          width: 1000,
          swing,
        },
        wall,
        200,
      );
      const arcCall = mock.filterCalls('arc')[0];
      expect(arcCall).toBeDefined();
      return arcCall?.args as [number, number, number, number, number, boolean];
    };

    // 1. Mur horizontal (0°) + swing: left / in
    const wHoriz: Wall = {
      id: 'w_h',
      category: 'wall',
      typeId: 'wt1',
      levelId: 'lvl1',
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };
    const [x1, y1, r1, s1, e1, ccw1] = getArcParams(wHoriz, { side: 'left', direction: 'in' });
    expect(x1).toBeCloseTo(500, 5); // 400 + 1000 * 0.1 = 500
    expect(y1).toBeCloseTo(300, 5); // 300 - 0 = 300
    expect(r1).toBeCloseTo(100, 5);
    expect(s1).toBeCloseTo(0, 5);
    expect(e1).toBeCloseTo(-Math.PI / 2, 5);
    expect(ccw1).toBe(true);

    // 2. Mur horizontal (0°) + swing: right / out
    const [x2, y2, r2, s2, e2, ccw2] = getArcParams(wHoriz, { side: 'right', direction: 'out' });
    expect(x2).toBeCloseTo(600, 5); // 400 + 2000 * 0.1 = 600 (charnière à droite)
    expect(y2).toBeCloseTo(300, 5);
    expect(r2).toBeCloseTo(100, 5);
    expect(s2).toBeCloseTo(Math.PI, 5);
    expect(e2).toBeCloseTo(Math.PI / 2, 5);
    expect(ccw2).toBe(true);

    // 3. Mur vertical (90°) + swing: left / in
    const wVert: Wall = {
      id: 'w_v',
      category: 'wall',
      typeId: 'wt1',
      levelId: 'lvl1',
      start: vec2(0, 0),
      end: vec2(0, 5000),
    };
    const [x3, y3, r3, s3, e3, ccw3] = getArcParams(wVert, { side: 'left', direction: 'in' });
    expect(x3).toBeCloseTo(400, 5);
    expect(y3).toBeCloseTo(200, 5); // 300 - 1000 * 0.1 = 200
    expect(r3).toBeCloseTo(100, 5);
    expect(s3).toBeCloseTo(-Math.PI / 2, 5);
    expect(e3).toBeCloseTo(Math.PI, 5);
    expect(ccw3).toBe(true);

    // 4. Mur à 45° + swing: right / in
    const L = 5000;
    const c = Math.SQRT1_2;
    const w45: Wall = {
      id: 'w_45',
      category: 'wall',
      typeId: 'wt1',
      levelId: 'lvl1',
      start: vec2(0, 0),
      end: vec2(L * c, L * c),
    };
    const [x4, y4, r4, s4, e4, ccw4] = getArcParams(w45, { side: 'right', direction: 'in' });
    // Hinge world = start + 2000 * (c, c) = (2000*c, 2000*c)
    // Screen coords = (400 + 200*c, 300 - 200*c) ≈ (541.42, 158.58)
    expect(x4).toBeCloseTo(400 + 200 * c, 4);
    expect(y4).toBeCloseTo(300 - 200 * c, 4);
    expect(r4).toBeCloseTo(100, 5);
    expect(s4).toBeCloseTo((3 * Math.PI) / 4, 5);
    expect(e4).toBeCloseTo((-3 * Math.PI) / 4, 5);
    expect(ccw4).toBe(false);

    // 5. Mur horizontal (0°) + swing: left / out
    const [x5, y5, r5, s5, e5, ccw5] = getArcParams(wHoriz, { side: 'left', direction: 'out' });
    expect(x5).toBeCloseTo(500, 5);
    expect(y5).toBeCloseTo(300, 5);
    expect(r5).toBeCloseTo(100, 5);
    expect(s5).toBeCloseTo(0, 5);
    expect(e5).toBeCloseTo(Math.PI / 2, 5);
    expect(ccw5).toBe(false);

    // 6. Mur horizontal (0°) + swing: right / in
    const [x6, y6, r6, s6, e6, ccw6] = getArcParams(wHoriz, { side: 'right', direction: 'in' });
    expect(x6).toBeCloseTo(600, 5);
    expect(y6).toBeCloseTo(300, 5);
    expect(r6).toBeCloseTo(100, 5);
    expect(s6).toBeCloseTo(Math.PI, 5);
    expect(e6).toBeCloseTo(-Math.PI / 2, 5);
    expect(ccw6).toBe(false);

    // 7. Mur vertical (90°) + swing: right / in
    const [x7, y7, r7, s7, e7, ccw7] = getArcParams(wVert, { side: 'right', direction: 'in' });
    expect(x7).toBeCloseTo(400, 5);
    expect(y7).toBeCloseTo(100, 5); // 300 - 2000 * 0.1 = 100
    expect(r7).toBeCloseTo(100, 5);
    expect(s7).toBeCloseTo(Math.PI / 2, 5);
    expect(e7).toBeCloseTo(Math.PI, 5);
    expect(ccw7).toBe(false);

    // 8. Mur vertical (90°) + swing: left / out
    const [x8, y8, r8, s8, e8, ccw8] = getArcParams(wVert, { side: 'left', direction: 'out' });
    expect(x8).toBeCloseTo(400, 5);
    expect(y8).toBeCloseTo(200, 5);
    expect(r8).toBeCloseTo(100, 5);
    expect(s8).toBeCloseTo(-Math.PI / 2, 5);
    expect(e8).toBeCloseTo(0, 5);
    expect(ccw8).toBe(false);
  });

  it('drawOpeningWindow trace l’évidement, les montants et 2 lignes parallèles de vitrage', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const wall: Wall = {
      id: 'w1',
      category: 'wall',
      typeId: 'wt1',
      levelId: 'lvl1',
      start: vec2(0, 0),
      end: vec2(5000, 0),
    };

    drawOpeningWindow(
      mock.ctx,
      transform,
      {
        id: 'win1',
        hostWallId: 'w1',
        offsetAlong: 1500,
        width: 1200,
        sillHeight: 900,
      },
      wall,
      200,
      false,
      DEFAULT_WALL_RENDER_CONFIG,
      '#ffffff',
    );

    // 1. Évidement du poché
    expect(mock.filterCalls('fill')).toHaveLength(1);

    // 2. Pas d'arc de battement pour une fenêtre
    expect(mock.filterCalls('arc')).toHaveLength(0);

    // 3. Traits tracés : ébrasements (2 montants), allège (2 traits), vitrage (2 traits parallèles)
    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls.length).toBe(3); // 1 montants, 1 allège, 1 vitrage
  });

  it('renderPlanView intègre automatiquement les ouvertures du BimDocument', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_open_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(6000, 0),
      }),
    );
    const doorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    const windowTypeId = Object.keys(doc.getState().windowTypes)[0]!;
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd_open_1',
        category: 'door',
        hostWallId: 'w_open_1',
        offsetAlong: 2000,
        doorTypeId,
        swing: { side: 'left', direction: 'in' },
      }),
    );
    doc.execute(
      new Commands.AddWindowCommand({
        id: 'w_open_win_1',
        category: 'window',
        hostWallId: 'w_open_1',
        offsetAlong: 4000,
        windowTypeId,
        sillHeight: 900,
      }),
    );

    renderPlanView(mock.ctx, transform, doc, new Set());

    // 1 mur rendu (1 fill) + 2 ouvertures qui épatent le poché (2 fills) = 3 fills
    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls).toHaveLength(3);

    // L'arc de la porte est bien tracé
    const arcCalls = mock.filterCalls('arc');
    expect(arcCalls).toHaveLength(1);
    expect(arcCalls[0]?.args[2]).toBeCloseTo(90, 5); // 900 * 0.1 = 90 px
  });

  it('un mur sans ouvertures ne déclenche aucun tracé d’arc ni d’évidement supplémentaire', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D();

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_plain',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    renderPlanView(mock.ctx, transform, doc);

    // Seulement 1 fill pour le poché du mur (aucun fill pour évidement)
    expect(mock.filterCalls('fill')).toHaveLength(1);
    // Aucun tracé d'arc de porte
    expect(mock.filterCalls('arc')).toHaveLength(0);
  });

  describe('Rendu des Pièces (drawRooms)', () => {
    it('drawRooms remplit le polygone en pastel et écrit le nom et la surface au centre', () => {
      const { mock } = createMockCanvas(800, 600);
      const transform = new Transform2D({
        origin: vec2(2000, 1500),
        scale: 0.1,
        viewportWidth: 800,
        viewportHeight: 600,
      });

      const detectedRooms = [
        {
          id: 'room_01',
          name: 'Séjour',
          polygon: [vec2(100, 100), vec2(3900, 100), vec2(3900, 2900), vec2(100, 2900)],
          areaMm2: 10640000,
          perimeterMm: 13200,
          seed: vec2(2000, 1500),
        },
      ];

      drawRooms(mock.ctx, transform, detectedRooms);

      // 1. Remplissage du polygone (fill)
      const fillCalls = mock.filterCalls('fill');
      expect(fillCalls.length).toBeGreaterThanOrEqual(1);

      // 2. Écriture du nom ("Séjour") et de la surface ("10.64 m²")
      const fillTextCalls = mock.filterCalls('fillText');
      expect(fillTextCalls.length).toBeGreaterThanOrEqual(2);
      expect(fillTextCalls[0]?.args[0]).toBe('Séjour');
      expect(fillTextCalls[1]?.args[0]).toBe('10.64 m²');
    });

    it('drawRooms évide un îlot intérieur (poteau) via la règle evenodd', () => {
      const { mock } = createMockCanvas(800, 600);
      const transform = new Transform2D();

      const roomWithHole = [
        {
          id: 'room_hole',
          name: 'Hall',
          polygon: [vec2(0, 0), vec2(4000, 0), vec2(4000, 4000), vec2(0, 4000)],
          holes: [[vec2(1500, 1500), vec2(2500, 1500), vec2(2500, 2500), vec2(1500, 2500)]],
          areaMm2: 15000000,
          perimeterMm: 16000,
          seed: vec2(800, 800),
        },
      ];

      drawRooms(mock.ctx, transform, roomWithHole);

      const fillCalls = mock.filterCalls('fill');
      expect(fillCalls).toHaveLength(1);
      expect(fillCalls[0]?.args[0]).toBe('evenodd');
    });
  });

  describe('Cotations 2D (drawDimensions)', () => {
    it('drawDimensions trace les lignes de rappel, la ligne de cote, les ticks à 45° et le texte', () => {
      const { mock } = createMockCanvas(800, 600);
      const transform = new Transform2D({
        origin: vec2(3000, 2000),
        scale: 0.1,
        viewportWidth: 800,
        viewportHeight: 600,
      });

      const walls = {
        w_south: {
          id: 'w_south',
          start: vec2(0, 0),
          end: vec2(6000, 0),
        },
      };

      const dimensions = [
        {
          id: 'dim_01',
          type: 'linear' as const,
          references: ['w_south'],
          offset: -500,
          value: 6000,
        },
      ];

      drawDimensions(mock.ctx, transform, dimensions, walls, DEFAULT_DIMENSION_RENDER_CONFIG);

      // Traçage des lignes (lignes de rappel, ligne de cote, ticks)
      const strokeCalls = mock.filterCalls('stroke');
      expect(strokeCalls.length).toBeGreaterThanOrEqual(3);

      // Écriture de la valeur textuelle "6.00 m"
      const fillTextCalls = mock.filterCalls('fillText');
      expect(fillTextCalls).toHaveLength(1);
      expect(fillTextCalls[0]?.args[0]).toBe('6.00 m');
    });

    it('drawDimensions filtre par niveau actif', () => {
      const { mock } = createMockCanvas(800, 600);
      const transform = new Transform2D();

      const walls = {
        w1: { id: 'w1', start: vec2(0, 0), end: vec2(4000, 0) },
      };

      const dimensions = [
        {
          id: 'dim_lvl1',
          levelId: 'lvl_01',
          type: 'linear' as const,
          references: ['w1'],
          offset: 400,
          value: 4000,
        },
      ];

      // Filtrer sur lvl_02 -> rien ne doit être tracé
      drawDimensions(
        mock.ctx,
        transform,
        dimensions,
        walls,
        DEFAULT_DIMENSION_RENDER_CONFIG,
        'lvl_02',
      );
      expect(mock.filterCalls('stroke')).toHaveLength(0);
      expect(mock.filterCalls('fillText')).toHaveLength(0);
    });
  });
});
