import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { DoorTool } from './DoorTool.js';
import { type ToolContext } from './types.js';

describe('DoorTool (apps/web)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: DoorTool;

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
        end: { x: 5000, y: 0 },
      }),
    );

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      activeWallTypeId: typeId,
    };

    tool = new DoorTool();
  });

  it('hovering : pointermove au-dessus d’un mur calcule l’offsetAlong snappé et émet une preview', () => {
    // Monde X = 2053 mm -> Écran X = 400 + 2053 * 0.05 = 502.65, Y = 300
    const out = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 502.65, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('preview');
    if (out.kind === 'preview') {
      expect(out.preview).toEqual({
        kind: 'line',
        start: { x: 2050, y: 0 },
        end: { x: 2950, y: 0 },
      });
    }

    const state = tool.getState();
    expect(state.kind).toBe('hovering');
    if (state.kind === 'hovering') {
      expect(state.wallId).toBe('w_test');
      expect(state.offsetAlong).toBe(2050);
    }
  });

  it('placement : pointerdown (button 0) émet AddDoorCommand avec offsetAlong snappé', () => {
    // 1. Simuler pointermove pour passer en hovering
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 502.65, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 2. Clic gauche
    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 502.65, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      expect(out.command.name).toBe('AddDoor');
      const addDoorCmd = out.command as Commands.AddDoorCommand;
      expect(addDoorCmd.door.hostWallId).toBe('w_test');
      expect(addDoorCmd.door.offsetAlong).toBe(2050);
      expect(addDoorCmd.door.doorTypeId).toBeDefined();
      expect(doc.getState().doorTypes[addDoorCmd.door.doorTypeId]?.width).toBe(900);
      expect(doc.getState().doorTypes[addDoorCmd.door.doorTypeId]?.height).toBe(2100);
      expect(addDoorCmd.door.swing).toEqual({ side: 'left', direction: 'in' });
    }

    expect(tool.getState().kind).toBe('placed');
  });

  it('Escape : réinitialise l’état à idle et efface la prévisualisation', () => {
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 502.65, y: 300 },
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

  it('snap 50 mm et gardes minimales : 2053 -> 2050 mm, et clamping aux extrémités', () => {
    // 1. Aimantation 2053 -> 2050 mm
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400 + 2053 * 0.05, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    let state = tool.getState();
    expect(state.kind === 'hovering' && state.offsetAlong).toBe(2050);

    // 2. Clamping à l'origine (X = 20 mm < 50 mm garde) -> 50 mm
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400 + 20 * 0.05, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    state = tool.getState();
    expect(state.kind === 'hovering' && state.offsetAlong).toBe(50);

    // 3. Clamping à l'extrémité (X = 4900 mm > 5000 - 900 - 50 = 4050 mm) -> 4050 mm
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400 + 4900 * 0.05, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    state = tool.getState();
    expect(state.kind === 'hovering' && state.offsetAlong).toBe(4050);
  });

  it('gestion des erreurs : AddDoorCommand exécutée sur un emplacement en chevauchement lève OPENING_OVERLAP', () => {
    // 1. Ajouter une première porte à offsetAlong = 2000
    const doorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'door_existing',
        category: 'door',
        hostWallId: 'w_test',
        offsetAlong: 2000,
        doorTypeId,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    // 2. DoorTool émet une commande à offsetAlong = 2200 (chevauchement avec [2000, 2900])
    tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400 + 2200 * 0.05, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    const out = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400 + 2200 * 0.05, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      // 3. L'exécution de la commande par le document lève l'erreur métier OPENING_OVERLAP
      expect(() => doc.execute(out.command)).toThrowError(/OPENING_OVERLAP/);
    }
  });

  it('rejet sans commande (noop) si le mur hôte est trop court pour accueillir la porte avec gardes', () => {
    const typeId = Object.keys(doc.getState().wallTypes)[0] ?? '';
    const levelId = Object.keys(doc.getState().levels)[0] ?? '';

    // Mur court de 800 mm (< 900 mm porte + 100 mm gardes)
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_short',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 2000 },
        end: { x: 800, y: 2000 },
      }),
    );

    // Clic au milieu du mur court : X monde = 400, Y monde = 2000 -> écran (400 + 20, 300 - 100) = (420, 200)
    const outMove = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 420, y: 200 },
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outMove.kind).toBe('preview');
    if (outMove.kind === 'preview') {
      expect(outMove.preview).toBeNull();
    }
    expect(tool.getState().kind).toBe('idle');

    const outDown = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 420, y: 200 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outDown.kind).toBe('noop');
    expect(tool.getState().kind).toBe('idle');
  });
});
