import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vec2 } from '@tabax/geometry';
import {
  BimDocument,
  AddComponentCommand,
  STANDARD_COMPONENT_CATALOG,
} from '@tabax/core';
import { Transform2D } from './transform.js';
import { createMockCanvas } from './test-utils.js';
import {
  drawComponentSymbol,
  drawComponents,
  DEFAULT_COMPONENT_RENDER_CONFIG,
} from './components-2d.js';
import { findComponentAtScreen } from './hit-test.js';
import { renderPlanView } from './renderer.js';
import { View2D } from './View2D.js';

describe('Rendu 2D des Composants et Mobilier (Phase 8.2A — packages/view-2d)', () => {
  let mockCtx: CanvasRenderingContext2D;
  let transform: Transform2D;

  beforeEach(() => {
    mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      rect: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
    } as unknown as CanvasRenderingContext2D;

    transform = new Transform2D({
      viewportWidth: 800,
      viewportHeight: 600,
      origin: vec2(400, 300),
      scale: 0.1, // 10mm = 1px
    });
  });

  describe('Symbologie 2D normalisée (drawComponentSymbol)', () => {
    it('génère la symbologie pour l’ensemble des 15 familles du catalogue sans exception', () => {
      for (const ct of STANDARD_COMPONENT_CATALOG) {
        expect(() => {
          drawComponentSymbol(
            mockCtx,
            ct.subType,
            ct.width,
            ct.depth,
            '#ffffff',
            '#000000',
          );
        }).not.toThrow();
      }
    });

    it('dessine les meubles hauts avec des pointillés normalisés', () => {
      drawComponentSymbol(mockCtx, 'kitchen_wall', 600, 350, '#f1f5f9', '#334155');
      expect(mockCtx.setLineDash).toHaveBeenCalledWith([8, 6]);
    });

    it('dessine les lits avec tête de lit, oreillers et rabat de couette', () => {
      drawComponentSymbol(mockCtx, 'bed', 1600, 2000, '#fefce8', '#713f12');
      expect(mockCtx.rect).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('dessine les sanitaires avec cuvettes arrondies et robinetterie', () => {
      drawComponentSymbol(mockCtx, 'toilet', 360, 540, '#f8fafc', '#0f172a');
      expect(mockCtx.ellipse).toHaveBeenCalled();
      expect(mockCtx.arc).toHaveBeenCalled();
    });
  });

  describe('Pipeline de rendu global (drawComponents & renderPlanView)', () => {
    it('dessine les composants avec transformation de repère et prise en compte de la rotation', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      doc.execute(
        new AddComponentCommand({
          id: 'comp_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 2000, y: 1500, rotation: Math.PI / 4 },
        }),
      );

      const state = doc.getState();
      drawComponents(
        mockCtx,
        transform,
        state.components ?? {},
        state.componentTypes ?? {},
        new Set(),
        DEFAULT_COMPONENT_RENDER_CONFIG,
      );

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.translate).toHaveBeenCalled();
      expect(mockCtx.rotate).toHaveBeenCalledWith(Math.PI / 4);
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it('renderPlanView intègre les composants dans la passe de rendu', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      doc.execute(
        new AddComponentCommand({
          id: 'comp_sofa',
          category: 'component',
          typeId: 'ct_sofa_3p',
          levelId,
          placement: { x: 3000, y: 2000 },
        }),
      );

      expect(() => {
        renderPlanView(mockCtx, transform, doc);
      }).not.toThrow();
      expect(mockCtx.save).toHaveBeenCalled();
    });
  });

  describe('Hit-testing et sélection (findComponentAtScreen & View2D.hitTest)', () => {
    it('détecte un clic directement sur l’emprise d’un composant', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // Table 1600 x 900 posée à (2000, 1500)
      doc.execute(
        new AddComponentCommand({
          id: 'comp_hit_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 2000, y: 1500, rotation: 0 },
        }),
      );

      // Clic au centre de la table
      const screenCenter = transform.worldToScreen(vec2(2000, 1500));
      const hit = findComponentAtScreen(screenCenter, transform, doc);
      expect(hit).toBe('comp_hit_table');

      // Clic à 200mm du centre (toujours sur la table car halfW = 800, halfD = 450)
      const screenNear = transform.worldToScreen(vec2(2200, 1600));
      expect(findComponentAtScreen(screenNear, transform, doc)).toBe('comp_hit_table');

      // Clic loin en dehors de la table (ex: 5000, 5000)
      const screenFar = transform.worldToScreen(vec2(5000, 5000));
      expect(findComponentAtScreen(screenFar, transform, doc)).toBeNull();
    });

    it('gère correctement la rotation du composant lors du hit-test', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // Table 1600 x 900 tournée à 90° autour de (0, 0)
      // En local, X est 1600, Y est 900.
      // Après rotation de 90° (+PI/2), X monde devient [-450, +450] et Y monde devient [-800, +800]
      doc.execute(
        new AddComponentCommand({
          id: 'comp_rot_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 0, y: 0, rotation: Math.PI / 2 },
        }),
      );

      // Point à (0, 700) : dedans après rotation de 90° (car le grand côté est sur Y)
      const screenPointRotated = transform.worldToScreen(vec2(0, 700));
      expect(findComponentAtScreen(screenPointRotated, transform, doc)).toBe('comp_rot_table');

      // Point à (700, 0) : dehors après rotation de 90° (car le petit côté est sur X, max 450)
      const screenPointOutside = transform.worldToScreen(vec2(700, 0));
      expect(findComponentAtScreen(screenPointOutside, transform, doc)).toBeNull();
    });

    it('View2D.hitTest délègue et retourne l’ID du composant cliqué', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      doc.execute(
        new AddComponentCommand({
          id: 'comp_wc_hit',
          category: 'component',
          typeId: 'ct_toilet_wall_hung',
          levelId,
          placement: { x: 1000, y: 1000 },
        }),
      );

      const { canvas } = createMockCanvas(800, 600);
      const view2d = new View2D(canvas);
      view2d.setDocument(doc);

      const screenCenter = view2d.getTransform().worldToScreen(vec2(1000, 1000));
      expect(view2d.hitTest(screenCenter)).toBe('comp_wc_hit');
      view2d.dispose();
    });

    it('findComponentAtScreen et drawComponents prennent en compte les surcharges dimensionnelles et la zone de dégagement (Phase 8.4)', () => {
      const doc = BimDocument.createDefaultProject();
      const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

      // Table surchargée à 2400 mm de largeur au lieu de 1600 mm nominal
      doc.execute(
        new AddComponentCommand({
          id: 'comp_custom_table',
          category: 'component',
          typeId: 'ct_dining_table',
          levelId,
          placement: { x: 0, y: 0, rotation: 0 },
          widthOverride: 2400,
          showClearanceZone: true,
        }),
      );

      const transform = new Transform2D();

      // Hit-test à x=1000 : dedans avec widthOverride=2400 (halfW=1200), mais dehors avec nominal=1600 (halfW=800)
      const screenPt1000 = transform.worldToScreen(vec2(1000, 0));
      expect(findComponentAtScreen(screenPt1000, transform, doc)).toBe('comp_custom_table');

      // Dessin avec zone de dégagement
      drawComponents(
        mockCtx,
        transform,
        doc.getState().components!,
        doc.getState().componentTypes!,
        new Set(['comp_custom_table']),
        DEFAULT_COMPONENT_RENDER_CONFIG,
      );

      // Vérification que setLineDash a été invoqué pour tracer le contour pointillé du dégagement
      expect(mockCtx.setLineDash).toHaveBeenCalledWith([4, 4]);
    });
  });
});
