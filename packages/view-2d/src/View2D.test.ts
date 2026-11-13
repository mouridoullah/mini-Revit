import { describe, it, expect, vi } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, toJSON } from '@mini-bim/core';
import { View2D } from './View2D.js';
import { createMockCanvas } from './test-utils.js';

describe('View2D (View2D.ts)', () => {
  it('lève une exception si le contexte Canvas 2D est inaccessible', () => {
    const canvasWithoutContext = document.createElement('canvas');
    canvasWithoutContext.getContext = () => null;

    expect(() => new View2D(canvasWithoutContext)).toThrowError(
      /Impossible d’acquérir le contexte/,
    );
  });

  it('s’initialise correctement avec les dimensions du canvas et les options', () => {
    const { canvas } = createMockCanvas(1024, 768);
    const view = new View2D(canvas, {
      transform: { scale: 0.1 },
    });

    expect(view.getCanvas()).toBe(canvas);
    expect(view.getContext()).toBeDefined();
    expect(view.getTransform().viewportWidth).toBe(1024);
    expect(view.getTransform().viewportHeight).toBe(768);
    expect(view.getTransform().scale).toBe(0.1);
    expect(view.getDocument()).toBeNull();
    expect(view.getSelectedIds()).toEqual([]);

    view.dispose();
  });

  it('rendu à la demande (Demand-Driven Rendering) : pas de boucle RAF continue au repos', () => {
    const { canvas, mock } = createMockCanvas(800, 600);
    const view = new View2D(canvas);

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    mock.clearCalls();

    // Rendu déclenché explicitement
    view.render(doc);
    expect(mock.filterCalls('fill')).toHaveLength(1);

    mock.clearCalls();

    // Sans action, aucun appel de tracé supplémentaire n'a lieu
    expect(mock.calls).toHaveLength(0);

    view.dispose();
  });

  it('hitTest détecte fidèlement un mur sous le curseur en coordonnées écran', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas, {
      transform: {
        origin: vec2(0, 0),
        scale: 0.05, // 50 px pour 1000 mm
      },
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    // Mur de (0,0) à (4000, 0)
    // Coordonnées écran : (400, 300) à (600, 300)
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_hit',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    view.setDocument(doc);

    // Clic sur le corps du mur (milieu de l'axe : x=500, y=300)
    const hitWallId = view.hitTest(vec2(500, 300));
    expect(hitWallId).toBe('w_hit');

    // Clic à côté du mur (x=500, y=200 -> à 100 px = 2000 mm au-dessus)
    const missId = view.hitTest(vec2(500, 200));
    expect(missId).toBeNull();

    view.dispose();
  });

  it('sélection : un clic gauche sur un mur met à jour la sélection et notifie onSelectionChanged', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas, {
      transform: { origin: vec2(0, 0), scale: 0.05 },
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_select_test',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );
    view.setDocument(doc);

    const selectionEvents: string[][] = [];
    view.onSelectionChanged((ids) => selectionEvents.push([...ids]));

    // Clic sur le mur
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 500,
        clientY: 300,
        button: 0,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 500,
        clientY: 300,
        button: 0,
      }),
    );

    expect(view.getSelectedIds()).toEqual(['w_select_test']);
    expect(selectionEvents).toEqual([['w_select_test']]);

    // Clic dans le vide -> désélection
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 100,
        clientY: 100,
        button: 0,
      }),
    );

    expect(view.getSelectedIds()).toEqual([]);
    expect(selectionEvents).toEqual([['w_select_test'], []]);

    view.dispose();
  });

  it('RÈGLE D’OR : View2D émet les intentions de commande via onCommandRequested sans JAMAIS muter BimDocument', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas);

    const doc = BimDocument.createDefaultProject();
    const stateBefore = doc.getState();
    const typeId = Object.keys(stateBefore.wallTypes)[0]!;
    const levelId = Object.keys(stateBefore.levels)[0]!;

    view.setDocument(doc);

    const receivedCommands: Commands.Command[] = [];
    const unsubscribe = view.onCommandRequested((cmd) => {
      receivedCommands.push(cmd);
    });

    // Émission d'une commande d'ajout de mur simulée par un futur outil 2D
    const newWallCmd = new Commands.AddWallCommand({
      id: 'w_from_tool',
      category: 'wall',
      typeId,
      levelId,
      start: vec2(1000, 1000),
      end: vec2(5000, 1000),
    });

    view.emitCommand(newWallCmd);

    // 1. La commande est bien transmise au callback
    expect(receivedCommands).toHaveLength(1);
    expect(receivedCommands[0]).toBe(newWallCmd);

    // 2. RÈGLE D'OR : Le document n'a PAS été muté par View2D !
    expect(doc.getState().walls['w_from_tool']).toBeUndefined();
    expect(doc.getState()).toBe(stateBefore);

    // 3. Désinscription propre
    unsubscribe();
    view.emitCommand(newWallCmd);
    expect(receivedCommands).toHaveLength(1); // Pas de nouvelle réception

    view.dispose();
  });

  it('gestion des molettes de zoom (wheel) et pan (pointermove)', () => {
    const { canvas, mock } = createMockCanvas(800, 600);
    const view = new View2D(canvas, {
      transform: { origin: vec2(0, 0), scale: 0.05 },
    });

    mock.clearCalls();

    // 1. Événement de zoom molette avant (deltaY < 0)
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        clientX: 400,
        clientY: 300,
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(view.getTransform().scale).toBeCloseTo(0.05 * 1.15, 6);
    expect(mock.filterCalls('fillRect')).toHaveLength(1); // Redessiné

    // 2. Pan avec clic molette (bouton 1)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 400,
        clientY: 300,
        button: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 450,
        clientY: 320,
        button: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 450,
        clientY: 320,
        button: 1,
      }),
    );

    // L'origine a bougé suite au pan
    expect(view.getTransform().origin.x).not.toBe(0);

    view.dispose();
  });

  it('zoomToFit cadre l’ensemble des murs du projet', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas);

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_fit_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(8000, 0),
      }),
    );
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_fit_2',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(8000, 0),
        end: vec2(8000, 6000),
      }),
    );

    view.setDocument(doc);
    view.zoomToFit(40);

    // Le centre doit être à (4000, 3000)
    expect(view.getTransform().origin.x).toBe(4000);
    expect(view.getTransform().origin.y).toBe(3000);

    view.dispose();
  });

  it('resize adapte la taille du canvas et la vue sans crash', () => {
    const { canvas, mock } = createMockCanvas(800, 600);
    const view = new View2D(canvas);

    mock.clearCalls();
    view.resize(1920, 1080);

    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(view.getTransform().viewportWidth).toBe(1920);
    expect(view.getTransform().viewportHeight).toBe(1080);
    expect(mock.filterCalls('fillRect')).toHaveLength(1);

    view.dispose();
  });

  it('dispose nettoie tous les écouteurs d’événements et références', () => {
    const { canvas, mock } = createMockCanvas(800, 600);
    const view = new View2D(canvas);
    const doc = BimDocument.createDefaultProject();
    view.setDocument(doc);

    view.dispose();

    expect(view.getDocument()).toBeNull();
    expect(view.getSelectedIds()).toEqual([]);

    mock.clearCalls();
    // Dispatch d'événements après dispose : rien ne doit planter ni redessiner
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(mock.calls).toHaveLength(0);
  });

  it('immutabilité stricte : un clic sur un mur ne mute pas le BimDocument (JSON identique) et n’appelle pas onCommandRequested', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas, {
      transform: { origin: vec2(0, 0), scale: 0.05 },
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_immutable_check',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    // Sérialisation stricte de l'état avant tout clic
    const jsonBefore = toJSON(doc.getState());

    view.setDocument(doc);

    // Enregistrement d'un espion sur onCommandRequested
    const commandSpy = vi.fn();
    view.onCommandRequested(commandSpy);

    // Clic sur le mur au centre de l'écran (500, 300)
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 500,
        clientY: 300,
        button: 0,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 500,
        clientY: 300,
        button: 0,
      }),
    );

    // 1. Le mur a bien été sélectionné
    expect(view.getSelectedIds()).toEqual(['w_immutable_check']);

    // 2. RÈGLE D'OR : Le document est strictement identique (zéro mutation)
    const jsonAfter = toJSON(doc.getState());
    expect(jsonAfter).toBe(jsonBefore);
    expect(JSON.parse(jsonAfter)).toEqual(JSON.parse(jsonBefore));

    // 3. La sélection n'étant pas une mutation documentaire, onCommandRequested n'a été appelé 0 fois
    expect(commandSpy).toHaveBeenCalledTimes(0);

    view.dispose();
  });

  it('ResizeObserver : déconnecté proprement lors de dispose() s’il est actif dans l’environnement', () => {
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();

    // Mock temporaire global de ResizeObserver
    class MockResizeObserver {
      public observe = observeSpy;
      public unobserve = vi.fn();
      public disconnect = disconnectSpy;
    }

    const originalRO = globalThis.ResizeObserver;
    // @ts-expect-error Mock ResizeObserver pour test d'environnement
    globalThis.ResizeObserver = MockResizeObserver;

    try {
      const { canvas } = createMockCanvas(800, 600);
      const view = new View2D(canvas);

      expect(observeSpy).toHaveBeenCalledWith(canvas);

      view.dispose();

      // Vérification que disconnect a bien été appelé lors du dispose
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = originalRO;
    }
  });
});
