import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { MoveOpeningTool } from './MoveOpeningTool.js';
import { type ToolContext } from './types.js';

describe('MoveOpeningTool (apps/web)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: MoveOpeningTool;

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
        id: 'w_host',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );

    const doorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'door_to_move',
        category: 'door',
        hostWallId: 'w_host',
        offsetAlong: 2000,
        doorTypeId,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      activeWallTypeId: typeId,
    };

    tool = new MoveOpeningTool();
  });

  it('1. drag valide : drag d’une porte de 500 mm (2000 -> 2500) émet MoveOpeningCommand', () => {
    // Centre de la porte à offset 2000 + 450 = 2450 mm
    // Écran X = 400 + 2450 * 0.05 = 522.5, Y = 300
    const downOut = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 522.5, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(downOut.kind).toBe('noop');
    expect(tool.getState().kind).toBe('dragging');

    // Déplacement vers offset 2500 (curseur à 2500 mm -> écran 400 + 2500 * 0.05 = 525)
    const moveOut = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 525, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(moveOut.kind).toBe('preview');
    if (moveOut.kind === 'preview') {
      expect(moveOut.preview).toEqual({
        kind: 'line',
        start: { x: 2500, y: 0 },
        end: { x: 3400, y: 0 },
      });
    }

    const upOut = tool.handle(
      {
        type: 'pointerup',
        screen: { x: 525, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(upOut.kind).toBe('command');
    if (upOut.kind === 'command') {
      expect(upOut.command.name).toBe('MoveOpening');
      const moveCmd = upOut.command as Commands.MoveOpeningCommand;
      expect(moveCmd.openingId).toBe('door_to_move');
      expect(moveCmd.newOffsetAlong).toBe(2500);

      // Exécution de la commande sur le document
      const result = doc.execute(moveCmd);
      // Vérification du contrat Phase 3.2 : getChangedIds inclut l'ouverture et son mur hôte après apply
      expect(result.changed).toEqual(['door_to_move', 'w_host']);
      expect(doc.getState().doors?.['door_to_move']?.offsetAlong).toBe(2500);
    }
  });

  it('2. snap 50 mm : curseur à 2053 mm est snappé à 2050 mm', () => {
    // Grab
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 522.5, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Curseur à X = 2053 mm -> écran 400 + 2053 * 0.05 = 502.65
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 502.65, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    const state = tool.getState();
    expect(state.kind).toBe('dragging');
    if (state.kind === 'dragging') {
      expect(state.currentOffsetAlong).toBe(2050);
    }
  });

  it('3. noop sur clic vide : clic dans le vide ou sur mur sans ouverture ne déclenche pas de drag', () => {
    // Clic sur le mur mais loin de l'ouverture : X monde = 4500 mm -> écran 625
    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 625, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('noop');
    expect(tool.getState().kind).toBe('idle');
  });

  it('4. Escape et clic stationnaire : annulation et pas de commande si l’offset est inchangé', () => {
    // 4.1 Escape pendant dragging
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 522.5, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(tool.getState().kind).toBe('dragging');

    const escOut = tool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(escOut).toEqual({ kind: 'preview', preview: null });
    expect(tool.getState().kind).toBe('idle');

    // 4.2 Clic stationnaire sans changement de position
    tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 522.5, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    const upOut = tool.handle(
      {
        type: 'pointerup',
        screen: { x: 522.5, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(upOut.kind).not.toBe('command');
    expect(tool.getState().kind).toBe('idle');
  });
});
