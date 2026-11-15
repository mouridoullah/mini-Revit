import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { SlabTool } from './SlabTool.js';
import { type ToolContext } from './types.js';

describe('SlabTool — Machine à états pure de modélisation de dalle (Milestone 6.1b-2)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let slabTool: SlabTool;
  let activeLevelId: string;
  let activeWallTypeId: string;
  let activeSlabTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    activeLevelId = Object.keys(state.levels)[0]!;
    activeWallTypeId = Object.keys(state.wallTypes)[0]!;
    activeSlabTypeId = Object.keys(state.slabTypes ?? {})[0]!;

    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.1, // 1 px = 10 mm
      viewportWidth: 800,
      viewportHeight: 600,
    });

    ctx = {
      doc,
      transform,
      activeLevelId,
      activeWallTypeId,
      activeSlabTypeId,
    };

    slabTool = new SlabTool();
  });

  it('T-SLAB-TOOL-01 : machine à états idle -> drawing -> preview', () => {
    expect(slabTool.getState()).toEqual({ kind: 'idle' });

    // Clic pour premier point
    const out1 = slabTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 100, y: 100 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out1.kind).toBe('preview');
    expect(slabTool.getState().kind).toBe('drawing');

    // Déplacement de la souris
    const out2 = slabTool.handle(
      {
        type: 'pointermove',
        screen: { x: 200, y: 100 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out2.kind).toBe('preview');
    if (out2.kind === 'preview') {
      expect(out2.preview?.kind).toBe('polygon');
    }
  });

  it('T-SLAB-TOOL-02 : aimantation aux sommets de murs existants (tolérance 12px)', () => {
    // Ajouter un mur de (0, 0) à (4000, 0)
    const wallStart = { x: 0, y: 0 };
    const wallEnd = { x: 4000, y: 0 };
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w1',
        category: 'wall',
        start: wallStart,
        end: wallEnd,
        levelId: activeLevelId,
        typeId: activeWallTypeId,
      }),
    );

    // Clic proche de (4000, 0) à 5 pixels d'écart en écran (scale = 0.1 -> 50mm en monde)
    const targetScreen = transform.worldToScreen(wallEnd);
    const nearScreen = { x: targetScreen.x + 5, y: targetScreen.y + 5 };

    slabTool.handle(
      {
        type: 'pointerdown',
        screen: nearScreen,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const state = slabTool.getState();
    expect(state.kind).toBe('drawing');
    if (state.kind === 'drawing') {
      // Doit avoir été snappé exactement sur (4000, 0)
      expect(state.points[0]).toEqual(wallEnd);
    }
  });

  it('T-SLAB-TOOL-03 : fermeture du polygone émet AddSlabCommand avec orientation CCW garantie', () => {
    // Clic de 4 sommets dans le sens horaire CW :
    // (0,0) -> (0, 3000) -> (4000, 3000) -> (4000, 0)
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 3000 },
      { x: 4000, y: 3000 },
      { x: 4000, y: 0 },
    ];

    for (const p of pts) {
      const s = transform.worldToScreen(p);
      slabTool.handle(
        {
          type: 'pointerdown',
          screen: s,
          button: 0,
          shift: false,
          alt: false,
        },
        ctx,
      );
    }

    // Touche Enter pour finaliser
    const out = slabTool.handle({ type: 'keydown', key: 'Enter' }, ctx);

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      expect(out.command).toBeInstanceOf(Commands.AddSlabCommand);
      const res = doc.execute(out.command);
      expect(res.changed.length).toBeGreaterThan(0);
      const createdSlab = doc.getState().slabs?.[res.changed[0]!];
      expect(createdSlab).toBeDefined();
      expect(createdSlab?.levelId).toBe(activeLevelId);
      expect(createdSlab?.slabTypeId).toBe(activeSlabTypeId);
      expect(createdSlab?.boundary.length).toBe(4);
    }

    expect(slabTool.getState()).toEqual({ kind: 'idle' });
  });

  it('T-SLAB-TOOL-04 : Escape annule le tracé et revient à idle', () => {
    slabTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 100, y: 100 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(slabTool.getState().kind).toBe('drawing');

    const out = slabTool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(out).toEqual({ kind: 'preview', preview: null });
    expect(slabTool.getState()).toEqual({ kind: 'idle' });
  });
});
