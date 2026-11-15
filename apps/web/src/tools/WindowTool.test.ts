import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { WindowTool } from './WindowTool.js';
import { type ToolContext } from './types.js';

describe('WindowTool (apps/web)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: WindowTool;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_test',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      activeWallTypeId: typeId,
    };

    tool = new WindowTool();
  });

  it('hovering : pointermove au-dessus d’un mur calcule l’offsetAlong snappé et émet une preview', () => {
    // Monde X = 3045 mm -> snap 50 mm -> 3050 mm
    // Écran X = 400 + 3045 * 0.05 = 552.25, Y = 300
    const out = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 552.25, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('preview');
    if (out.kind === 'preview') {
      expect(out.preview).toEqual({
        kind: 'line',
        start: { x: 3050, y: 0 },
        end: { x: 4250, y: 0 }, // 3050 + 1200
      });
    }

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.wallId).toBe('w_test');
      expect(state.offsetAlong).toBe(3050);
    }
  });

  it('placement : pointerdown (button 0) émet AddWindowCommand avec paramètres par défaut', () => {
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 552.25, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 552.25, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      expect(out.command.name).toBe('AddWindow');
      const addWinCmd = out.command as Commands.AddWindowCommand;
      expect(addWinCmd.window.hostWallId).toBe('w_test');
      expect(addWinCmd.window.offsetAlong).toBe(3050);
      expect(addWinCmd.window.windowTypeId).toBeDefined();
      expect(doc.getState().windowTypes[addWinCmd.window.windowTypeId]?.width).toBe(1200);
      expect(doc.getState().windowTypes[addWinCmd.window.windowTypeId]?.height).toBe(1400);
      expect(addWinCmd.window.sillHeight).toBe(900);
    }

    expect(tool.getState().kind).toBe('placed');
  });

  it('Escape : réinitialise l’état à idle et efface la prévisualisation', () => {
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 552.25, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(tool.getState().kind).toBe('hovering');

    const out = tool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(out).toEqual({ kind: 'preview', preview: null });
    expect(tool.getState().kind).toBe('idle');
  });
});
