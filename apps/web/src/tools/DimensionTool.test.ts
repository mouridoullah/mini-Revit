import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@tabax/core';
import { Transform2D } from '@tabax/view-2d';
import { DimensionTool, MIN_DIMENSION_LENGTH, DEFAULT_DIMENSION_OFFSET } from './DimensionTool.js';
import { type ToolContext } from './types.js';

describe('Saison 3 — Étape 4 : DimensionTool (apps/web/src/tools/DimensionTool.test.ts)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let dimTool: DimensionTool;
  let activeLevelId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    activeLevelId = Object.keys(state.levels)[0]!;

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
    };

    dimTool = new DimensionTool();
  });

  it('T-DIM-TOOL-01 : État initial est idle avec flipSide = false et defaultOffset = 500', () => {
    expect(MIN_DIMENSION_LENGTH).toBe(50);
    expect(DEFAULT_DIMENSION_OFFSET).toBe(500);
    expect(dimTool.getState()).toEqual({ kind: 'idle' });
    expect(dimTool.getFlipSide()).toBe(false);
    expect(dimTool.getDefaultOffset()).toBe(500);
  });

  it('T-DIM-TOOL-02 : Pointerdown passe en état firstPointPicked et émet une preview dimension', () => {
    const out = dimTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 }, // centre -> (0, 0)
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('preview');
    if (out.kind === 'preview') {
      expect(out.preview?.kind).toBe('dimension');
      expect((out.preview as any).offset).toBe(0);
    }
    expect(dimTool.getState().kind).toBe('firstPointPicked');
  });

  it('T-DIM-TOOL-03 : Pointermove met à jour la position courante et supporte Shift pour le snap 45°', () => {
    // 1. Démarrer le tracé à (0, 0)
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 2. Déplacer vers (2000, 100) en coordonnées monde
    const screenMove = transform.worldToScreen({ x: 2000, y: 100 });
    const outMove = dimTool.handle(
      {
        type: 'pointermove',
        screen: screenMove,
        shift: true, // Aimantation 45° -> s'aligne sur (2000, 0)
        alt: false,
      },
      ctx,
    );

    expect(outMove.kind).toBe('preview');
    if (outMove.kind === 'preview') {
      expect(outMove.preview?.kind).toBe('dimension');
      const p = outMove.preview as any;
      expect(p.end.y).toBeCloseTo(0, 1);
      expect(p.value).toBeCloseTo(Math.hypot(2000, 100), 1);
    }
  });

  it('T-DIM-TOOL-04 : Deuxième clic passe à placingOffset et permet dajuster le déport', () => {
    // 1. Clic 1 à (0, 0)
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 2. Clic 2 à (3000, 0)
    const out2 = dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 3000, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out2.kind).toBe('preview');
    expect(dimTool.getState().kind).toBe('placingOffset');

    // 3. Move pour ajuster l'offset à Y = 600
    const outMove = dimTool.handle(
      {
        type: 'pointermove',
        screen: transform.worldToScreen({ x: 1500, y: 600 }),
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outMove.kind).toBe('preview');
    if (outMove.kind === 'preview') {
      expect((outMove.preview as any).offset).toBe(600);
    }
  });

  it('T-DIM-TOOL-05 : Touche Espace bascule le déport en négatif', () => {
    // 1. Clic 1 et 2
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 3000, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Initialement offset = 500
    const outSpace = dimTool.handle({ type: 'keydown', key: ' ' }, ctx);
    expect(outSpace.kind).toBe('preview');
    if (outSpace.kind === 'preview') {
      expect((outSpace.preview as any).offset).toBe(-500);
    }
  });

  it('T-DIM-TOOL-06 : Troisième clic valide et émet AddDimensionCommand valide pour BimDocument', () => {
    // 1. Clic 1 à (0, 0)
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 2. Clic 2 à (4000, 0)
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 4000, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 3. Move offset à 700 mm
    dimTool.handle(
      {
        type: 'pointermove',
        screen: transform.worldToScreen({ x: 2000, y: 700 }),
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 4. Clic 3 pour finaliser
    const outCommit = dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 2000, y: 700 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outCommit.kind).toBe('command');
    if (outCommit.kind === 'command') {
      expect(outCommit.command.name).toBe('AddDimension');
      const addCmd = outCommit.command as Commands.AddDimensionCommand;
      expect(addCmd.dimension.references).toEqual([]);
      expect(addCmd.dimension.startPoint).toEqual({ x: 0, y: 0 });
      expect(addCmd.dimension.endPoint).toEqual({ x: 4000, y: 0 });
      expect(addCmd.dimension.offset).toBe(700);

      // Exécuter la commande dans le document BIM
      doc.execute(addCmd);
      const state = doc.getState();
      expect(state.dimensions?.[addCmd.dimension.id]).toBeDefined();
      expect(state.dimensions?.[addCmd.dimension.id]?.value).toBe(4000);
    }

    expect(dimTool.getState().kind).toBe('idle');
  });

  it('T-DIM-TOOL-07 : Glisser-déposer (>200 mm) passe directement en mode placingOffset', () => {
    // Pointerdown à (0, 0)
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Pointerup à (2500, 0)
    const outUp = dimTool.handle(
      {
        type: 'pointerup',
        screen: transform.worldToScreen({ x: 2500, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outUp.kind).toBe('preview');
    expect(dimTool.getState().kind).toBe('placingOffset');
    if (outUp.kind === 'preview') {
      expect((outUp.preview as any).value).toBeCloseTo(2500, 1);
    }
  });

  it('T-DIM-TOOL-08 : Touche Escape annule le tracé et réinitialise létat', () => {
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(dimTool.getState().kind).toBe('firstPointPicked');

    const outEsc = dimTool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(outEsc.kind).toBe('preview');
    if (outEsc.kind === 'preview') {
      expect(outEsc.preview).toBeNull();
    }
    expect(dimTool.getState().kind).toBe('idle');
  });

  it('T-DIM-TOOL-09 : Touche Enter valide avec le déport par défaut', () => {
    dimTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    dimTool.handle(
      {
        type: 'pointermove',
        screen: transform.worldToScreen({ x: 2000, y: 0 }),
        shift: false,
        alt: false,
      },
      ctx,
    );

    const outEnter = dimTool.handle({ type: 'keydown', key: 'Enter' }, ctx);
    expect(outEnter.kind).toBe('command');
    if (outEnter.kind === 'command') {
      const addCmd = outEnter.command as Commands.AddDimensionCommand;
      expect(addCmd.dimension.offset).toBe(500);
      expect(addCmd.dimension.value).toBe(2000);
    }
    expect(dimTool.getState().kind).toBe('idle');
  });
});
