import { describe, it, expect, beforeEach } from 'vitest';
import { BimDocument } from '@mini-bim/core';
import { Transform2D } from '@mini-bim/view-2d';
import { MepTool, CreateMepSegmentCommand } from './MepTool.js';
import { type ToolContext } from './types.js';

describe('MepTool (apps/web/src/tools/MepTool.ts — Sous-phase 9.3.2)', () => {
  let doc: BimDocument;
  let transform: Transform2D;
  let ctx: ToolContext;
  let tool: MepTool;
  let levelId: string;

  beforeEach(() => {
    doc = BimDocument.createDefaultProject();
    transform = new Transform2D({
      origin: { x: 0, y: 0 },
      scale: 0.1, // 10mm = 1px -> 1px = 10mm
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const state = doc.getState();
    levelId = Object.keys(state.levels)[0] ?? 'lvl_rdc';

    ctx = {
      doc,
      transform,
      activeLevelId: levelId,
      mepConfig: {
        category: 'pipe',
        shape: 'round',
        domain: 'plumbing',
        systemType: 'domestic_cold_water',
        diameter: 50,
        elevationOffsetMm: 2500,
        displayMode: 'single-line',
      },
    };

    tool = new MepTool();
  });

  it('initialise en état idle et passe à awaiting-start au survol', () => {
    expect(tool.getState().kind).toBe('idle');

    const out = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 400, y: 300 }, // monde (0, 0)
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out.kind).toBe('preview');
    expect(tool.getState().kind).toBe('awaiting-start');
  });

  it('permet de tracer un tuyau (pipe) de (0,0) à (2000, 0) et émet une commande transactionnelle', () => {
    // 1. Premier clic à (400, 300) -> monde (0, 0)
    const out1 = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 400, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out1.kind).toBe('preview');
    expect(tool.getState().kind).toBe('drawing');

    // 2. Déplacement du curseur vers monde (2000, 0) -> écran X = 400 + 2000*0.1 = 600 px
    const out2 = tool.handle(
      {
        type: 'pointermove',
        screen: { x: 600, y: 300 },
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out2.kind).toBe('preview');
    if (out2.kind === 'preview' && out2.preview?.kind === 'mep') {
      expect(out2.preview.start).toEqual({ x: 0, y: 0 });
      expect(out2.preview.end.x).toBeCloseTo(2000, 1);
      expect(out2.preview.end.y).toBeCloseTo(0, 1);
      expect(out2.preview.category).toBe('pipe');
      expect(out2.preview.diameter).toBe(50);
    }

    // 3. Second clic à l'arrivée
    const out3 = tool.handle(
      {
        type: 'pointerdown',
        screen: { x: 600, y: 300 },
        button: 0,
        shift: false,
        alt: false,
      },
      ctx,
    );

    expect(out3.kind).toBe('command');
    if (out3.kind === 'command') {
      expect(out3.command).toBeInstanceOf(CreateMepSegmentCommand);
      doc.execute(out3.command);

      const pipes = Object.values(doc.getState().pipes ?? {});
      expect(pipes).toHaveLength(1);
      const pipe = pipes[0];
      expect(pipe).toBeDefined();
      expect(pipe?.diameter).toBe(50);
      expect(pipe?.start.x).toBeCloseTo(0, 1);
      expect(pipe?.end.x).toBeCloseTo(2000, 1);
      expect(pipe?.ports).toHaveLength(2);
    }
  });

  it('permet de tracer une gaine rectangulaire (duct)', () => {
    ctx = {
      ...ctx,
      mepConfig: {
        category: 'duct',
        shape: 'rectangular',
        domain: 'hvac',
        systemType: 'supply_air',
        width: 400,
        height: 250,
        elevationOffsetMm: 2800,
      },
    };

    tool.handle(
      { type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );

    const out = tool.handle(
      { type: 'pointerdown', screen: { x: 700, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      doc.execute(out.command);
      const ducts = Object.values(doc.getState().ducts ?? {});
      expect(ducts).toHaveLength(1);
      const duct = ducts[0];
      expect(duct?.shape).toBe('rectangular');
      expect(duct?.width).toBe(400);
      expect(duct?.height).toBe(250);
      expect(duct?.ports).toHaveLength(2);
    }
  });

  it('permet de tracer un chemin de câbles (cableTray)', () => {
    ctx = {
      ...ctx,
      mepConfig: {
        category: 'cableTray',
        domain: 'electrical',
        systemType: 'power',
        width: 300,
        height: 60,
        elevationOffsetMm: 2600,
      },
    };

    tool.handle(
      { type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );

    const out = tool.handle(
      { type: 'pointerdown', screen: { x: 650, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );

    expect(out.kind).toBe('command');
    if (out.kind === 'command') {
      doc.execute(out.command);
      const trays = Object.values(doc.getState().cableTrays ?? {});
      expect(trays).toHaveLength(1);
      const tray = trays[0];
      expect(tray?.width).toBe(300);
      expect(tray?.height).toBe(60);
      expect(tray?.ports).toHaveLength(2);
    }
  });

  it('annule le tracé en cours sur appui de la touche Escape sans modifier le modèle', () => {
    // Démarrage du tracé
    tool.handle(
      { type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(tool.getState().kind).toBe('drawing');

    // Annulation
    const outEscape = tool.handle({ type: 'keydown', key: 'Escape' }, ctx);
    expect(outEscape.kind).toBe('preview');
    if (outEscape.kind === 'preview') {
      expect(outEscape.preview).toBeNull();
    }
    expect(tool.getState().kind).toBe('idle');

    // Vérification qu'aucun élément n'a été créé
    expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(0);
  });

  it('annule le tracé sur clic droit de souris', () => {
    tool.handle(
      { type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false },
      ctx,
    );
    expect(tool.getState().kind).toBe('drawing');

    // Clic droit (button 2)
    const outRightClick = tool.handle(
      { type: 'pointerdown', screen: { x: 500, y: 300 }, button: 2, shift: false, alt: false },
      ctx,
    );
    expect(outRightClick.kind).toBe('preview');
    expect(tool.getState().kind).toBe('idle');
  });

  it('réalise un accrochage magnétique (snapping) sur port libre et connecte automatiquement les deux segments', () => {
    // 1. Création d'un premier tuyau de (0, 0) à (1500, 0)
    tool.handle({ type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    const out1 = tool.handle({ type: 'pointerdown', screen: { x: 550, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    if (out1.kind === 'command') {
      doc.execute(out1.command);
    }

    const pipesBefore = Object.values(doc.getState().pipes ?? {});
    expect(pipesBefore).toHaveLength(1);
    const pipe1 = pipesBefore[0];
    expect(pipe1).toBeDefined();
    const portEnd1 = pipe1?.ports[1];
    expect(portEnd1).toBeDefined();

    // 2. Début du deuxième tuyau à proximité du port terminal de pipe1
    // Port à monde (1500, 0) -> écran (550, 300).
    // Déplacement à 6 pixels écran du port -> dans le seuil d'accrochage de 14 px
    const outHover = tool.handle(
      { type: 'pointermove', screen: { x: 556, y: 300 }, shift: false, alt: false },
      ctx,
    );
    expect(outHover.kind).toBe('preview');
    const state = tool.getState();
    expect(state.kind).toBe('awaiting-start');
    if (state.kind === 'awaiting-start') {
      expect(state.snappedPort).toBeDefined();
      expect(state.snappedPort?.compatible).toBe(true);
      expect(state.snappedPort?.port.id).toBe(portEnd1?.id);
    }

    // 3. Clic départ snappé sur le port
    tool.handle({ type: 'pointerdown', screen: { x: 556, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    expect(tool.getState().kind).toBe('drawing');

    // 4. Clic arrivée à monde (3000, 0) -> écran (700, 300)
    const out2 = tool.handle({ type: 'pointerdown', screen: { x: 700, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    expect(out2.kind).toBe('command');
    if (out2.kind === 'command') {
      doc.execute(out2.command);
    }

    // Vérification : 2 tuyaux créés et 1 connecteur reliant pipe1.ports[1] et pipe2.ports[0]
    const pipesAfter = Object.values(doc.getState().pipes ?? {});
    expect(pipesAfter).toHaveLength(2);

    const connectors = Object.values(doc.getState().mepConnectors ?? {});
    expect(connectors).toHaveLength(1);
    const conn = connectors[0];
    expect(conn?.portAId).toBe(portEnd1?.id);
  });

  it('refuse l’accrochage magnétique si le port cible est incompatible de domaine', () => {
    // Créer un tuyau plomberie (domain: plumbing)
    tool.handle({ type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    const out1 = tool.handle({ type: 'pointerdown', screen: { x: 550, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    if (out1.kind === 'command') {
      doc.execute(out1.command);
    }

    // Basculer l'outil en gaine aéraulique (domain: hvac)
    ctx = {
      ...ctx,
      mepConfig: {
        category: 'duct',
        shape: 'rectangular',
        domain: 'hvac',
        systemType: 'supply_air',
        width: 300,
        height: 200,
      },
    };

    // Survol du port du tuyau plomberie
    tool.handle({ type: 'pointermove', screen: { x: 550, y: 300 }, shift: false, alt: false }, ctx);
    const state = tool.getState();
    if (state.kind === 'awaiting-start') {
      expect(state.snappedPort).toBeDefined();
      expect(state.snappedPort?.compatible).toBe(false);
      expect(state.snappedPort?.reason).toBe('DOMAIN_MISMATCH');
    }
  });

  it('supporte l’Undo/Redo complet sans laisser de connecteur orphelin', () => {
    // 1. Tracer segment 1
    tool.handle({ type: 'pointerdown', screen: { x: 400, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    const out1 = tool.handle({ type: 'pointerdown', screen: { x: 550, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    if (out1.kind === 'command') doc.execute(out1.command);

    // 2. Tracer segment 2 connecté
    tool.handle({ type: 'pointerdown', screen: { x: 550, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    const out2 = tool.handle({ type: 'pointerdown', screen: { x: 700, y: 300 }, button: 0, shift: false, alt: false }, ctx);
    if (out2.kind === 'command') doc.execute(out2.command);

    expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(2);
    expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(1);

    // 3. Undo de segment 2 -> le tuyau ET le connecteur sont retirés (zéro connecteur orphelin)
    doc.undo();
    expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(1);
    expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(0);

    // 4. Redo -> le tuyau 2 et sa connexion sont restaurés fidèlement
    doc.redo();
    expect(Object.keys(doc.getState().pipes ?? {})).toHaveLength(2);
    expect(Object.keys(doc.getState().mepConnectors ?? {})).toHaveLength(1);
  });
});
