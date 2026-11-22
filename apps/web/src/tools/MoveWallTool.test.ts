import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@tabax/core';
import { Transform2D } from '@tabax/view-2d';
import { MoveWallTool } from './MoveWallTool.js';
import { type ToolContext } from './types.js';

describe('MoveWallTool — Tests d’Acceptation Phase 6.0c (apps/web)', () => {
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

  // T-TOOL-MOVE-01 : MoveWallTool émet MoveWallCommand (nouveau type)
  it('T-TOOL-MOVE-01 : drag valide émet MoveWallCommand avec stretchNeighbors: true', () => {
    // Milieu du mur : (3000, 1000) -> Écran : (400 + 3000*0.05, 300 - 1000*0.05) = (550, 250)
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
      expect(upOut.command.name).toBe('MoveWall');
      const moveCmd = upOut.command as Commands.MoveWallCommand;
      expect(moveCmd.wallId).toBe('w_move_target');
      expect(moveCmd.delta).toEqual({ x: 100, y: 0 });
      expect(moveCmd.options.stretchNeighbors).toBe(true);
    }
    expect(tool.getState().kind).toBe('idle');
  });

  // T-TOOL-MOVE-02 : Snap 10mm sur delta conservé
  it('T-TOOL-MOVE-02 : snap 10 mm : delta de 105 mm est snappé à 100 mm', () => {
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

  // T-TOOL-MOVE-03 : Escape pendant dragging -> reset sans émission de commande
  it('T-TOOL-MOVE-03 : Escape pendant dragging annule sans émettre de commande', () => {
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

  // T-TOOL-MOVE-04 : Delta (0,0) -> pas de commande
  it('T-TOOL-MOVE-04 : clic stationnaire delta zéro n’émet aucune commande', () => {
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

    expect(upOut.kind).not.toBe('command');
    expect(tool.getState().kind).toBe('idle');
  });

  // T-TOOL-MOVE-05 : Prévisualisation continue pendant le dragging
  it('T-TOOL-MOVE-05 : Prévisualisation mise à jour en continu à chaque pointermove', () => {
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

    const out1 = tool.handle(
      { type: 'pointermove', screen: { x: 560, y: 250 }, shift: false, alt: false },
      ctx,
    );
    expect(out1.kind).toBe('preview');

    const out2 = tool.handle(
      { type: 'pointermove', screen: { x: 570, y: 250 }, shift: false, alt: false },
      ctx,
    );
    expect(out2.kind).toBe('preview');
  });

  // T-TOOL-MOVE-06 : Après Escape, nouvel essai de drag possible
  it('T-TOOL-MOVE-06 : Après annulation, un nouveau drag peut démarrer immédiatement', () => {
    tool.handle(
      { type: 'pointerdown', screen: { x: 550, y: 250 }, button: 0, shift: false, alt: false },
      ctx,
    );
    tool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(tool.getState().kind).toBe('idle');

    tool.handle(
      { type: 'pointerdown', screen: { x: 550, y: 250 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(tool.getState().kind).toBe('dragging');
  });

  // T-TOOL-MOVE-07 : MoveWallTool ne mute pas BimDocument directement (règle d'or préservée)
  it('T-TOOL-MOVE-07 : MoveWallTool ne mute pas BimDocument directement pendant le drag', () => {
    const stateBefore = doc.getState();

    tool.handle(
      { type: 'pointerdown', screen: { x: 550, y: 250 }, button: 0, shift: false, alt: false },
      ctx,
    );
    tool.handle({ type: 'pointermove', screen: { x: 600, y: 250 }, shift: false, alt: false }, ctx);

    // L'état documentaire reste rigoureusement inchangé tant que la commande n'a pas été émise
    expect(doc.getState()).toEqual(stateBefore);
  });

  // T-TOOL-MOVE-08 : reset() réinitialise à idle
  it('T-TOOL-MOVE-08 : reset() réinitialise immédiatement l’état à idle', () => {
    tool.handle(
      { type: 'pointerdown', screen: { x: 550, y: 250 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(tool.getState().kind).toBe('dragging');

    tool.reset();
    expect(tool.getState().kind).toBe('idle');
  });

  // Tests de robustesse conservés de Phase 3.3
  it('noop sur clic vide : pointerdown en dehors de tout mur ne déclenche aucun drag', () => {
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

  it('clic secondaire (button !== 0) ignoré sans déclencher de drag', () => {
    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 550, y: 250 },
        button: 2,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(out.kind).toBe('noop');
    expect(tool.getState().kind).toBe('idle');
  });
});
