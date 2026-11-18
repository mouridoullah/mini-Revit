import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument } from '@mini-bim/core';
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
});
