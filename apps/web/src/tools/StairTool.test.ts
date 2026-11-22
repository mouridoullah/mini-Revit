import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@tabax/core';
import { Transform2D } from '@tabax/view-2d';
import { StairTool } from './StairTool.js';
import { type ToolContext } from './types.js';

describe('Phase 6.4 — StairTool : Machine à états pure (apps/web/src/tools/StairTool.test.ts)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let stairTool: StairTool;
  let activeLevelId: string;
  let upperLevelId: string;
  let activeStairTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    activeLevelId = Object.keys(state.levels)[0]!;
    activeStairTypeId = Object.keys(state.stairTypes ?? {})[0]!;

    // Ajouter un second niveau R+1 pour permettre la liaison d'étage
    upperLevelId = 'lvl_upper';
    doc.execute(
      new Commands.AddLevelCommand({
        id: upperLevelId,
        name: 'R+1',
        elevation: 3000,
      }),
    );

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
      activeStairTypeId,
    };

    stairTool = new StairTool();
  });

  it('T-STAIR-TOOL-01 : Machine à états — idle -> pointerdown -> drawing avec preview stair', () => {
    expect(stairTool.getState()).toEqual({ kind: 'idle' });

    // 1. Premier clic : pose du pied de l'escalier (start)
    const out1 = stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 }, // centre écran -> (0, 0) monde
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out1.kind).toBe('preview');
    if (out1.kind === 'preview') {
      expect(out1.preview?.kind).toBe('stair');
    }
    expect(stairTool.getState().kind).toBe('drawing');
  });

  it('T-STAIR-TOOL-02 : Déplacement pointermove — actualise l’élastique avec kind "stair"', () => {
    stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Déplacement vers x = 700 (+3000 mm monde)
    const outMove = stairTool.handle(
      {
        type: 'pointermove',
        screen: { x: 700, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outMove.kind).toBe('preview');
    if (outMove.kind === 'preview') {
      expect(outMove.preview?.kind).toBe('stair');
      if (outMove.preview?.kind === 'stair') {
        expect(outMove.preview.end.x).toBeCloseTo(3000, 0);
        expect(outMove.preview.width).toBe(900);
      }
    }
  });

  it('T-STAIR-TOOL-03 : Touche Escape — annule le tracé et réinitialise à idle', () => {
    stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(stairTool.getState().kind).toBe('drawing');

    const outEsc = stairTool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(outEsc.kind).toBe('preview');
    if (outEsc.kind === 'preview') {
      expect(outEsc.preview).toBeNull();
    }
    expect(stairTool.getState()).toEqual({ kind: 'idle' });
  });

  it('T-STAIR-TOOL-04 : Validation — émet AddStairCommand avec niveaux adjacents', () => {
    // Mode deux clics : Clic 1 au départ, Clic 2 à l'arrivée
    stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 }, // (0, 0)
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const out2 = stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 800, y: 300 }, // (+4000 mm)
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out2.kind).toBe('command');
    if (out2.kind === 'command') {
      expect(out2.command.name).toBe('AddStair');
      const payload = (out2.command as any).stair;
      expect(payload.bottomLevelId).toBe(activeLevelId);
      expect(payload.topLevelId).toBe(upperLevelId);
      expect(payload.stairTypeId).toBe(activeStairTypeId);
      expect(payload.start.x).toBeCloseTo(0, 0);
      expect(payload.end.x).toBeCloseTo(4000, 0);
    }
    expect(stairTool.getState()).toEqual({ kind: 'idle' });
  });

  it('T-STAIR-TOOL-05 : Aimantation angulaire 45° avec Shift — aligne la direction', () => {
    stairTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 }, // (0, 0)
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Déplacement diagonal libre (ex: dx = 3000, dy = 1000)
    const outMoveShift = stairTool.handle(
      {
        type: 'pointermove',
        screen: { x: 700, y: 200 }, // dy écran -100 -> dy monde +1000
        shift: true,
        alt: false,
      },
      ctx,
    );

    expect(outMoveShift.kind).toBe('preview');
    if (outMoveShift.kind === 'preview' && outMoveShift.preview?.kind === 'stair') {
      // Avec Shift, snapAngle45 force l'angle le plus proche (ici axe X horizontal ou 45°)
      const dx = outMoveShift.preview.end.x - outMoveShift.preview.start.x;
      const dy = outMoveShift.preview.end.y - outMoveShift.preview.start.y;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      // Doit être un multiple de 45°
      expect(Math.abs(angleDeg % 45)).toBeCloseTo(0, 1);
    }
  });
});
