import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { SelectTool } from './SelectTool.js';
import { type ToolContext } from './types.js';

describe('SelectTool (Machine à états pure sans DOM)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let selectTool: SelectTool;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'wall_to_select',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );

    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
    };

    selectTool = new SelectTool();
  });

  it('état initial est idle', () => {
    expect(selectTool.getState()).toEqual({ kind: 'idle' });
  });

  it('pointerdown sur un mur sélectionne le mur et émet selectionChanged avec l’ID', () => {
    // Le mur va de (0, 0) à (4000, 0). En écran : centre à (400 + 2000*0.05, 300) = (500, 300)
    const screenPos = transform.worldToScreen({ x: 2000, y: 0 });

    const output = selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(output).toEqual({
      kind: 'selectionChanged',
      ids: ['wall_to_select'],
    });

    expect(selectTool.getState()).toEqual({
      kind: 'selected',
      wallId: 'wall_to_select',
    });
  });

  it('pointerdown dans le vide désélectionne et émet selectionChanged vide', () => {
    // Sélection préalable
    const screenOnWall = transform.worldToScreen({ x: 2000, y: 0 });
    selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenOnWall,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(selectTool.getState().kind).toBe('selected');

    // Clic dans le vide (à 2000 mm au-dessus du mur)
    const screenMiss = transform.worldToScreen({ x: 2000, y: 2000 });
    const output = selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenMiss,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(output).toEqual({
      kind: 'selectionChanged',
      ids: [],
    });
    expect(selectTool.getState()).toEqual({ kind: 'idle' });
  });

  it('ignore les clics boutons 1 (molette) et 2 (droit)', () => {
    const screenPos = transform.worldToScreen({ x: 2000, y: 0 });

    const outputWheel = selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 1,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outputWheel).toEqual({ kind: 'noop' });

    const outputRight = selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 2,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(outputRight).toEqual({ kind: 'noop' });
    expect(selectTool.getState()).toEqual({ kind: 'idle' });
  });

  it('touche Escape désélectionne l’élément sélectionné', () => {
    const screenPos = transform.worldToScreen({ x: 2000, y: 0 });
    selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outputEscape = selectTool.handle({ type: 'keydown', key: 'Escape' }, ctx);

    expect(outputEscape).toEqual({
      kind: 'selectionChanged',
      ids: [],
    });
    expect(selectTool.getState()).toEqual({ kind: 'idle' });
  });

  it('reset() remet l’outil à l’état idle', () => {
    const screenPos = transform.worldToScreen({ x: 2000, y: 0 });
    selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    selectTool.reset();
    expect(selectTool.getState()).toEqual({ kind: 'idle' });
  });

  it('pointerdown sur un composant sélectionne le composant et émet selectionChanged', () => {
    doc.execute(
      new Commands.AddComponentCommand({
        id: 'comp_select_test',
        category: 'component',
        typeId: 'ct_toilet_wall_hung',
        levelId: ctx.activeLevelId,
        placement: { x: 1000, y: 1000 },
      }),
    );

    const screenPos = transform.worldToScreen({ x: 1000, y: 1000 });
    const output = selectTool.handle(
      {
        type: 'pointerdown',
        screen: screenPos,
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(output).toEqual({
      kind: 'selectionChanged',
      ids: ['comp_select_test'],
    });
    expect(selectTool.getState()).toEqual({
      kind: 'selected',
      wallId: 'comp_select_test',
    });
  });
});
