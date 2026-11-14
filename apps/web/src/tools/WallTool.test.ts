import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { WallTool, MIN_WALL_LENGTH } from './WallTool.js';
import { type ToolContext } from './types.js';

describe('WallTool (Machine à états pure de tracé de mur)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let wallTool: WallTool;
  let activeLevelId: string;
  let activeWallTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    activeLevelId = Object.keys(state.levels)[0]!;
    activeWallTypeId = Object.keys(state.wallTypes)[0]!;

    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    ctx = {
      doc,
      transform,
      activeLevelId,
      activeWallTypeId,
    };

    wallTool = new WallTool();
  });

  it('état initial est idle', () => {
    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });

  it('pointerdown + pointerup valides émettent une AddWallCommand avec les bonnes coordonnées', () => {
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });
    const screenEnd = transform.worldToScreen({ x: 3000, y: 0 });

    // 1. Clic gauche : début de tracé
    const outputDown = wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outputDown).toEqual({ kind: 'preview', preview: null });
    expect(wallTool.getState().kind).toBe('drawing');

    // 2. Relâchement du clic : validation
    const outputUp = wallTool.handle(
      {
        type: 'pointerup',
        screen: screenEnd,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outputUp.kind).toBe('command');
    if (outputUp.kind !== 'command') return;

    expect(outputUp.command).toBeInstanceOf(Commands.AddWallCommand);
    const cmd = outputUp.command as Commands.AddWallCommand;
    expect(cmd.wall.category).toBe('wall');
    expect(cmd.wall.levelId).toBe(activeLevelId);
    expect(cmd.wall.typeId).toBe(activeWallTypeId);
    expect(cmd.wall.start.x).toBeCloseTo(0, 1);
    expect(cmd.wall.start.y).toBeCloseTo(0, 1);
    expect(cmd.wall.end.x).toBeCloseTo(3000, 1);
    expect(cmd.wall.end.y).toBeCloseTo(0, 1);

    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });

  it('tracé trop court (< 100 mm) est annulé et n’émet aucune commande', () => {
    expect(MIN_WALL_LENGTH).toBe(100);
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });
    const screenEnd = transform.worldToScreen({ x: 50, y: 0 }); // 50 mm < MIN_WALL_LENGTH

    wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outputUp = wallTool.handle(
      {
        type: 'pointerup',
        screen: screenEnd,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outputUp).toEqual({ kind: 'preview', preview: null });
    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });

  it('pointermove pendant drawing met à jour le preview de ligne élastique', () => {
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });
    const screenMove = transform.worldToScreen({ x: 1500, y: 500 });

    wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outputMove = wallTool.handle(
      {
        type: 'pointermove',
        screen: screenMove,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outputMove.kind).toBe('preview');
    if (outputMove.kind !== 'preview' || !outputMove.preview) return;

    expect(outputMove.preview.kind).toBe('line');
    if (outputMove.preview.kind === 'line') {
      expect(outputMove.preview.start.x).toBeCloseTo(0, 1);
      expect(outputMove.preview.start.y).toBeCloseTo(0, 1);
      expect(outputMove.preview.end.x).toBeCloseTo(1500, 1);
      expect(outputMove.preview.end.y).toBeCloseTo(500, 1);
    }
  });

  it('Shift pendant drawing active le snap angulaire à 45°', () => {
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });
    // Tracé presque horizontal à 5° d'inclinaison
    const screenNearHorizontal = transform.worldToScreen({ x: 2000, y: 150 });

    wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outputMove = wallTool.handle(
      {
        type: 'pointermove',
        screen: screenNearHorizontal,
        shift: true, // Shift activé !
        alt: false,
      },
      ctx,
    );

    expect(outputMove.kind).toBe('preview');
    if (outputMove.kind !== 'preview' || !outputMove.preview) return;

    if (outputMove.preview.kind === 'line') {
      // Y est snappé exactement à 0
      expect(outputMove.preview.end.y).toBe(0);
      expect(outputMove.preview.end.x).toBeCloseTo(Math.hypot(2000, 150), 4);
    }

    // Relâchement avec Shift maintenu -> la commande doit également être snappée
    const outputUp = wallTool.handle(
      {
        type: 'pointerup',
        screen: screenNearHorizontal,
        button: 0,
        shift: true,
        alt: false,
      },
      ctx,
    );

    expect(outputUp.kind).toBe('command');
    if (outputUp.kind !== 'command') return;
    const cmd = outputUp.command as Commands.AddWallCommand;
    expect(cmd.wall.end.y).toBe(0);
  });

  it('touche Escape pendant drawing annule le tracé et efface le preview', () => {
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });

    wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(wallTool.getState().kind).toBe('drawing');

    const outputEscape = wallTool.handle({ type: 'keydown', key: 'Escape' }, ctx);

    expect(outputEscape).toEqual({ kind: 'preview', preview: null });
    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });

  it('touche Enter pendant drawing valide le tracé et émet une AddWallCommand', () => {
    const screenStart = transform.worldToScreen({ x: 0, y: 0 });
    const screenMove = transform.worldToScreen({ x: 2500, y: 0 });

    wallTool.handle(
      {
        type: 'pointerdown',
        screen: screenStart,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    wallTool.handle(
      {
        type: 'pointermove',
        screen: screenMove,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outputEnter = wallTool.handle({ type: 'keydown', key: 'Enter' }, ctx);

    expect(outputEnter.kind).toBe('command');
    if (outputEnter.kind !== 'command') return;
    const cmd = outputEnter.command as Commands.AddWallCommand;
    expect(cmd.wall.end.x).toBeCloseTo(2500, 1);
    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });

  it('ignore les clics droits et molettes pendant le tracé', () => {
    const screen = transform.worldToScreen({ x: 0, y: 0 });

    const out1 = wallTool.handle(
      { type: 'pointerdown', screen, button: 1, shift: false, alt: false },
      ctx,
    );
    expect(out1).toEqual({ kind: 'noop' });

    const out2 = wallTool.handle(
      { type: 'pointerdown', screen, button: 2, shift: false, alt: false },
      ctx,
    );
    expect(out2).toEqual({ kind: 'noop' });
    expect(wallTool.getState()).toEqual({ kind: 'idle' });
  });
});
