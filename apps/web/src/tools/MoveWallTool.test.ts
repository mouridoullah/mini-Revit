import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { MoveWallTool } from './MoveWallTool.js';
import { type ToolContext } from './types.js';

describe('MoveWallTool (apps/web)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: MoveWallTool;

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
        id: 'w_move_target',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 1000, y: 1000 },
        end: { x: 5000, y: 1000 },
      }),
    );

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      activeWallTypeId: typeId,
    };

    tool = new MoveWallTool();
  });

  it('1. drag valide : pointerdown, pointermove (+100, 0), pointerup émet UpdateWallCommand décalé de (100, 0)', () => {
    // Milieu du mur : (3000, 1000) -> Écran : (400 + 3000*0.05, 300 - 1000*0.05) = (550, 250)
    const downOut = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 550, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(downOut.kind).toBe('noop');
    expect(tool.getState().kind).toBe('dragging');

    // Déplacement de 100 mm monde vers la droite -> +5 px écran -> (555, 250)
    const moveOut = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 555, y: 250 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(moveOut.kind).toBe('preview');
    if (moveOut.kind === 'preview') {
      expect(moveOut.preview).toEqual({
        kind: 'line',
        start: { x: 1100, y: 1000 },
        end: { x: 5100, y: 1000 },
      });
    }

    // Relâchement du clic
    const upOut = tool.handle(
      {
        type: 'pointerup',
        screen: { x: 555, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(upOut.kind).toBe('command');
    if (upOut.kind === 'command') {
      expect(upOut.command.name).toBe('UpdateWall');
      const updateCmd = upOut.command as Commands.UpdateWallCommand;
      expect(updateCmd.wallId).toBe('w_move_target');
      expect(updateCmd.patch.start).toEqual({ x: 1100, y: 1000 });
      expect(updateCmd.patch.end).toEqual({ x: 5100, y: 1000 });
    }
    expect(tool.getState().kind).toBe('idle');
  });

  it('2. snap 10 mm : delta de 105 mm est snappé à 100 mm (multiple de 10 le plus proche)', () => {
    // Grab à (3000, 1000) -> écran (550, 250)
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 550, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Déplacement de 105 mm en X -> écran (550 + 105 * 0.05, 250) = (555.25, 250)
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 555.25, y: 250 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    const state = tool.getState();
    expect(state.kind).toBe('dragging');
    if (state.kind === 'dragging') {
      expect(state.currentDelta.x).toBe(100);
      expect(state.currentDelta.y).toBe(0);
    }
  });

  it('3. noop sur clic vide : pointerdown en dehors de tout mur ne déclenche aucun drag', () => {
    // Clic dans le vide à écran (100, 100)
    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 100, y: 100 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('noop');
    expect(tool.getState().kind).toBe('idle');
  });

  it('4. Escape pendant dragging : annule l’opération et efface la prévisualisation sans émettre de commande', () => {
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 550, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(tool.getState().kind).toBe('dragging');

    const out = tool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(out).toEqual({ kind: 'preview', preview: null });
    expect(tool.getState().kind).toBe('idle');
  });

  it('5. delta zéro -> noop : clic stationnaire sans déplacement n’émet aucune commande', () => {
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 550, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const upOut = tool.handle(
      {
        type: 'pointerup',
        screen: { x: 550, y: 250 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Aucune commande n'est émise pour ne pas polluer l'historique undo/redo
    expect(upOut.kind).not.toBe('command');
    expect(tool.getState().kind).toBe('idle');
  });
});
