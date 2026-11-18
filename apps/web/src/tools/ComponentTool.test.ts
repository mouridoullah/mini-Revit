import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { ComponentTool } from './ComponentTool.js';
import { type ToolContext } from './types.js';

describe('ComponentTool (apps/web/src/tools/ComponentTool.ts — Phase 8.3)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: ComponentTool;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.1, // 10mm = 1px
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0] ?? 'lvl_0';

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      activeComponentTypeId: 'ct_toilet_wall_hung',
    };

    tool = new ComponentTool();
  });

  it('génère un polygone d’emprise orienté lors du survol pointermove', () => {
    // Écran (400, 300) correspond à l'origine monde (0, 0)
    const out = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('preview');
    if (out.kind === 'preview') {
      expect(out.preview).not.toBeNull();
      expect(out.preview?.kind).toBe('polygon');
      if (out.preview?.kind === 'polygon') {
        expect(out.preview.points).toHaveLength(4);
      }
    }

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.worldPos.x).toBeCloseTo(0, 1);
      expect(state.worldPos.y).toBeCloseTo(0, 1);
      expect(state.rotation).toBe(0);
    }
  });

  it('pivote l’emprise de 90° lors de l’appui sur la Barre d’Espace', () => {
    // 1. Initialiser le survol
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(tool.getRotation()).toBe(0);

    // 2. Touche Espace
    const outKey = tool.handle(
      {
        type: 'keydown',
        key: ' ',
      },
      ctx,
    );

    expect(tool.getRotation()).toBeCloseTo(Math.PI / 2, 4);
    expect(outKey.kind).toBe('preview');

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.rotation).toBeCloseTo(Math.PI / 2, 4);
    }
  });

  it('émet une commande AddComponentCommand lors du clic gauche pointerdown', () => {
    // Déplacement à X=1500, Y=2000 (monde)
    // worldToScreen(1500, 2000) = (400 + 1500*0.1, 300 - 2000*0.1) = (550, 100)
    const screenPos = transform.worldToScreen({ x: 1500, y: 2000 });

    const outClick = tool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outClick.kind).toBe('command');
    if (outClick.kind === 'command') {
      doc.execute(outClick.command);
    }

    const state = doc.getState();
    const components = Object.values(state.components ?? {});
    expect(components).toHaveLength(1);

    const comp = components[0];
    expect(comp?.typeId).toBe('ct_toilet_wall_hung');
    expect(comp?.levelId).toBe(ctx.activeLevelId);
    expect(comp?.placement.x).toBeCloseTo(1500, 1);
    expect(comp?.placement.y).toBeCloseTo(2000, 1);
    expect(comp?.placement.rotation).toBe(0);
  });

  it('Escape réinitialise l’outil à idle et supprime la prévisualisation', () => {
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(tool.getState().kind).toBe('hovering');

    const outEsc = tool.handle(
      {
        type: 'keydown',
        key: 'Escape',
      },
      ctx,
    );

    expect(outEsc.kind).toBe('preview');
    if (outEsc.kind === 'preview') {
      expect(outEsc.preview).toBeNull();
    }
    expect(tool.getState().kind).toBe('idle');
  });

  it('magnétise automatiquement le composant contre la face du mur avec orientation du dos (Phase 8.4)', () => {
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
    const wallId = 'wall_north';

    // Mur horizontal de (0, 3000) à (6000, 3000), épaisseur 200 mm (halfT = 100)
    doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId: wallTypeId,
        levelId: ctx.activeLevelId,
        start: { x: 0, y: 3000 },
        end: { x: 6000, y: 3000 },
      }),
    );

    // Survol juste au-dessus du mur à y=3200 (au nord du mur)
    // ct_toilet_wall_hung a depth=540 (halfD=270).
    // Adossé au nord : centre y doit valoir 3000 + halfT + halfD = 3000 + 100 + 270 = 3370 mm
    const screenPos = transform.worldToScreen({ x: 2000, y: 3200 });

    tool.handle(
      {
        type: 'pointermove',
        screen: screenPos,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.hostWallId).toBe(wallId);
      expect(state.worldPos.x).toBeCloseTo(2000, 1);
      expect(state.worldPos.y).toBeCloseTo(3370, 1);
      // Face arrière tournée vers le sud (vers le mur) : rotation = PI
      expect(state.rotation).toBeCloseTo(Math.PI, 2);
    }
  });

  it('aligne les menuiseries (baies vitrées) au centre de l’axe du mur avec l’angle du mur (Phase 8.4)', () => {
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_default';
    const wallId = 'wall_center';

    doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId: wallTypeId,
        levelId: ctx.activeLevelId,
        start: { x: 0, y: 1000 },
        end: { x: 4000, y: 1000 },
      }),
    );

    const ctxGlazing = {
      ...ctx,
      activeComponentTypeId: 'ct_sliding_door',
    };

    const screenPos = transform.worldToScreen({ x: 2000, y: 1050 });
    tool.handle(
      {
        type: 'pointermove',
        screen: screenPos,
        shift: false,
        alt: false,
      },
      ctxGlazing,
    );

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.hostWallId).toBe(wallId);
      // Centré exactement sur l'axe du mur y=1000
      expect(state.worldPos.y).toBeCloseTo(1000, 1);
      expect(state.rotation).toBeCloseTo(0, 2);
    }
  });
});
