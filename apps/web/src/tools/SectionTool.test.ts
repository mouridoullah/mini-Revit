import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { SectionTool, MIN_SECTION_DRAG_LENGTH, DEFAULT_SECTION_DEPTH } from './SectionTool.js';
import { type ToolContext } from './types.js';

describe('Saison 3 — Lot 2.B : SectionTool (apps/web/src/tools/SectionTool.test.ts)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let sectionTool: SectionTool;
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

    sectionTool = new SectionTool();
  });

  it('T-SEC-TOOL-01 : État initial est idle avec viewDirection = 1 et depth = 5000', () => {
    expect(MIN_SECTION_DRAG_LENGTH).toBe(200);
    expect(sectionTool.getState()).toEqual({ kind: 'idle' });
    expect(sectionTool.getViewDirection()).toBe(1);
    expect(sectionTool.getDepth()).toBe(DEFAULT_SECTION_DEPTH);
  });

  it('T-SEC-TOOL-02 : Pointerdown passe en état drawing et émet une preview section', () => {
    const out = sectionTool.handle(
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
      expect(out.preview?.kind).toBe('section');
      expect((out.preview as any).viewDirection).toBe(1);
    }
    expect(sectionTool.getState().kind).toBe('drawing');
  });

  it('T-SEC-TOOL-03 : Pointermove met à jour la position courante et supporte Shift pour le snap 45°', () => {
    // 1. Démarrer le tracé à (0, 0)
    sectionTool.handle(
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
    const outMove = sectionTool.handle(
      {
        type: 'pointermove',
        screen: screenMove,
        shift: true, // Aimantation 45° -> doit s'aligner sur (2000, 0)
        alt: false,
      },
      ctx,
    );

    expect(outMove.kind).toBe('preview');
    if (outMove.kind === 'preview') {
      expect(outMove.preview?.kind).toBe('section');
      const p = outMove.preview as any;
      expect(p.end.y).toBeCloseTo(0, 1);
    }
  });

  it('T-SEC-TOOL-04 : Touche Espace bascule viewDirection entre 1 et -1 en direct', () => {
    sectionTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(sectionTool.getViewDirection()).toBe(1);

    const outSpace = sectionTool.handle(
      {
        type: 'keydown',
        key: ' ',
      },
      ctx,
    );

    expect(sectionTool.getViewDirection()).toBe(-1);
    expect(outSpace.kind).toBe('preview');
    if (outSpace.kind === 'preview') {
      expect((outSpace.preview as any).viewDirection).toBe(-1);
    }
  });

  it('T-SEC-TOOL-05 : Clic-glisser (pointerdown -> pointerup) valide la création d’une coupe', () => {
    // 1. Pointerdown à (1000, 2000)
    sectionTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 1000, y: 2000 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 2. Pointermove à (5000, 2000) (dx = 4000 mm > 200 mm)
    sectionTool.handle(
      {
        type: 'pointermove',
        screen: transform.worldToScreen({ x: 5000, y: 2000 }),
        shift: false,
        alt: false,
      },
      ctx,
    );

    // 3. Pointerup pour relâcher
    const outUp = sectionTool.handle(
      {
        type: 'pointerup',
        screen: transform.worldToScreen({ x: 5000, y: 2000 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outUp.kind).toBe('command');
    if (outUp.kind === 'command') {
      expect(outUp.command).toBeInstanceOf(Commands.AddSectionCutCommand);
      const cmd = outUp.command as Commands.AddSectionCutCommand;
      expect(cmd.sectionCut.label).toBe('A');
      expect(cmd.sectionCut.name).toBe("Coupe A-A'");
      expect(cmd.sectionCut.start.x).toBe(1000);
      expect(cmd.sectionCut.start.y).toBe(2000);
      expect(cmd.sectionCut.end.x).toBe(5000);
      expect(cmd.sectionCut.end.y).toBe(2000);
    }
    expect(sectionTool.getState().kind).toBe('idle');
  });

  it('T-SEC-TOOL-06 : Mode deux clics valide la création d’une coupe', () => {
    // Clic 1
    sectionTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    // Relâchement sans bouger (len = 0 < 200 mm) -> reste en drawing
    sectionTool.handle(
      {
        type: 'pointerup',
        screen: transform.worldToScreen({ x: 0, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(sectionTool.getState().kind).toBe('drawing');

    // Déplacement
    sectionTool.handle(
      {
        type: 'pointermove',
        screen: transform.worldToScreen({ x: 3000, y: 0 }),
        shift: false,
        alt: false,
      },
      ctx,
    );

    // Clic 2
    const outClick2 = sectionTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 3000, y: 0 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(outClick2.kind).toBe('command');
    expect(sectionTool.getState().kind).toBe('idle');
  });

  it('T-SEC-TOOL-07 : Touche Escape annule le tracé', () => {
    sectionTool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    expect(sectionTool.getState().kind).toBe('drawing');

    const outEsc = sectionTool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(outEsc.kind).toBe('preview');
    if (outEsc.kind === 'preview') {
      expect(outEsc.preview).toBeNull();
    }
    expect(sectionTool.getState().kind).toBe('idle');
  });

  it('T-SEC-TOOL-08 : Incrémentation automatique des étiquettes (A, B, C...)', () => {
    // Ajouter une coupe A
    doc.execute(
      new Commands.AddSectionCutCommand({
        id: 'cut_A',
        category: 'sectionCut',
        name: "Coupe A-A'",
        label: 'A',
        kind: 'section',
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        viewDirection: 1,
        depth: 5000,
      }),
    );

    // Tracer une seconde coupe
    sectionTool.handle(
      {
        type: 'pointerdown',
        screen: transform.worldToScreen({ x: 0, y: 1000 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );
    const out2 = sectionTool.handle(
      {
        type: 'pointerup',
        screen: transform.worldToScreen({ x: 5000, y: 1000 }),
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out2.kind).toBe('command');
    if (out2.kind === 'command') {
      const cmd = out2.command as Commands.AddSectionCutCommand;
      expect(cmd.sectionCut.label).toBe('B');
      expect(cmd.sectionCut.name).toBe("Coupe B-B'");
    }
  });
});
