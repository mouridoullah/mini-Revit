import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@tabax/core';
import { Transform2D } from '@tabax/view-2d';
import { RoofTool } from './RoofTool.js';
import { type ToolContext } from './types.js';

describe('RoofTool — Machine à états interactive de modélisation de toiture (Milestone 7c)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let roofTool: RoofTool;
  let activeLevelId: string;
  let activeWallTypeId: string;
  let defaultGableTypeId: string;
  let defaultFlatTypeId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    activeLevelId = Object.keys(state.levels)[0] ?? 'lvl_0';
    activeWallTypeId = Object.keys(state.wallTypes)[0] ?? 'wt_0';
    defaultGableTypeId = 'default-gable-roof-type';
    defaultFlatTypeId = 'default-flat-roof-type';

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
    };

    roofTool = new RoofTool();
  });

  it('T-ROOF-TOOL-01 : machine à états idle -> drawing-footprint -> preview élastique', () => {
    expect(roofTool.getState()).toEqual({ kind: 'idle' });

    // Clic pour premier point
    const out1 = roofTool.handle(
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
    expect(roofTool.getState().kind).toBe('drawing-footprint');

    // Mouvement souris
    const out2 = roofTool.handle(
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
      expect(out2.preview?.kind).toBe('roof');
    }
  });

  it('T-ROOF-TOOL-02 : toit plat -> fermeture du polygone émet AddRoofCommand direct sans faîtage', () => {
    roofTool.setRoofTypeId(defaultFlatTypeId);

    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );

    // Clic sur le premier sommet pour fermer (x=100, y=100)
    const outClose = roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );

    expect(outClose.kind).toBe('command');
    if (outClose.kind === 'command') {
      const cmd = outClose.command as Commands.AddRoofCommand;
      expect(cmd.name).toBe('AddRoof');
      expect(cmd.roof.roofTypeId).toBe(defaultFlatTypeId);
      expect(cmd.roof.ridgeAxis).toBeUndefined();
    }
    expect(roofTool.getState().kind).toBe('idle');
  });

  it('T-ROOF-TOOL-03 : toit 2 pans -> fermeture du polygone bascule vers picking-ridge', () => {
    roofTool.setRoofTypeId(defaultGableTypeId);

    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );

    // Fermeture avec Enter
    const outClose = roofTool.handle(
      { type: 'keydown', key: 'Enter' },
      ctx,
    );

    expect(outClose.kind).toBe('preview');
    expect(roofTool.getState().kind).toBe('picking-ridge');
    if (outClose.kind === 'preview') {
      expect(outClose.preview?.kind).toBe('roof');
    }
  });

  it('T-ROOF-TOOL-04 : toit 2 pans -> picking ridge (start + end) émet AddRoofCommand avec ridgeAxis', () => {
    roofTool.setRoofTypeId(defaultGableTypeId);

    // Empreinte
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 200 }, button: 0, shift: false, alt: false },
      ctx,
    );
    roofTool.handle(
      { type: 'keydown', key: 'Enter' },
      ctx,
    );

    expect(roofTool.getState().kind).toBe('picking-ridge');

    // Clic départ faîtage
    const outRidgeStart = roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 150 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(outRidgeStart.kind).toBe('preview');

    // Clic fin faîtage
    const outRidgeEnd = roofTool.handle(
      { type: 'pointerdown', screen: { x: 300, y: 150 }, button: 0, shift: false, alt: false },
      ctx,
    );

    expect(outRidgeEnd.kind).toBe('command');
    if (outRidgeEnd.kind === 'command') {
      const cmd = outRidgeEnd.command as Commands.AddRoofCommand;
      expect(cmd.name).toBe('AddRoof');
      expect(cmd.roof.roofTypeId).toBe(defaultGableTypeId);
      expect(cmd.roof.ridgeAxis).toBeDefined();
    }
    expect(roofTool.getState().kind).toBe('idle');
  });

  it('T-ROOF-TOOL-05 : Escape annule le tracé et revient à idle', () => {
    roofTool.handle(
      { type: 'pointerdown', screen: { x: 100, y: 100 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(roofTool.getState().kind).toBe('drawing-footprint');

    const outEsc = roofTool.handle(
      { type: 'keydown', key: 'Escape' },
      ctx,
    );

    expect(outEsc.kind).toBe('preview');
    if (outEsc.kind === 'preview') {
      expect(outEsc.preview).toBeNull();
    }
    expect(roofTool.getState().kind).toBe('idle');
  });
});
