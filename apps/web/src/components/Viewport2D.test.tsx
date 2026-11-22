import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import * as View2DModule from '@tabax/view-2d';
import { BimDocument } from '@tabax/core';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { Viewport2D } from './Viewport2D.js';
import { WallTool } from '../tools/WallTool.js';
import { SelectTool } from '../tools/SelectTool.js';
import { DoorTool } from '../tools/DoorTool.js';
import { MoveWallTool } from '../tools/MoveWallTool.js';
import { Commands } from '@tabax/core';
import type { Tool } from '../tools/types.js';
import { DEFAULT_MEP_CONFIG } from '../tools/MepTool.js';

describe('Viewport2D React Wrapper & Tools Integration (apps/web)', () => {
  const disposeSpy = vi.spyOn(View2DModule.View2D.prototype, 'dispose');
  const renderSpy = vi.spyOn(View2DModule.View2D.prototype, 'render');
  const setSlabsSpy = vi.spyOn(View2DModule.View2D.prototype, 'setSlabs');
  const setSelectionSpy = vi.spyOn(View2DModule.View2D.prototype, 'setSelection');
  const setPreviewSpy = vi.spyOn(View2DModule.View2D.prototype, 'setPreview');

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock minimal du contexte Canvas 2D pour jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((id: string) => {
      if (id === '2d') {
        return {
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          closePath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          fill: vi.fn(),
          fillRect: vi.fn(),
          clearRect: vi.fn(),
          fillText: vi.fn(),
          setLineDash: vi.fn(),
          getLineDash: vi.fn(() => []),
          clip: vi.fn(),
          arc: vi.fn(),
          strokeRect: vi.fn(),
          setTransform: vi.fn(),
          resetTransform: vi.fn(),
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    });

    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
    } as DOMRect);

    // Mock setPointerCapture
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  });

  it('monte le composant, instancie View2D et déclenche le rendu initial', () => {
    const doc = BimDocument.createDefaultProject();

    const { getByTestId, getByText } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');
    expect(canvas).toBeDefined();
    expect(renderSpy).toHaveBeenCalled();

    expect(() => getByText('Plan 2D (Y-up)')).toThrow();
  });

  it('met à jour la configuration outil sans réinitialiser les écouteurs ni perdre leur contexte', () => {
    const doc = BimDocument.createDefaultProject();
    const seenConfigs: unknown[] = [];
    const tool: Tool = {
      kind: 'mep',
      getState: () => ({ kind: 'idle' }),
      handle: (_event, context) => {
        seenConfigs.push(context.mepConfig);
        return { kind: 'noop' };
      },
      reset: vi.fn(),
    };
    const initialConfig = { ...DEFAULT_MEP_CONFIG, diameter: 25 };
    const updatedConfig = { ...DEFAULT_MEP_CONFIG, diameter: 50 };
    const { getByTestId, rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={tool} mepConfig={initialConfig} />
      </BimDocumentProvider>,
    );

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={tool} mepConfig={updatedConfig} />
      </BimDocumentProvider>,
    );

    expect(tool.reset).not.toHaveBeenCalled();
    act(() =>
      fireEvent.pointerDown(getByTestId('viewport-2d-canvas'), {
        clientX: 120,
        clientY: 80,
        button: 0,
      }),
    );
    expect(seenConfigs.at(-1)).toBe(updatedConfig);
  });

  it('laisse View2D dériver la trémie d’escalier dans la dalle du niveau supérieur', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const bottomLevelId = Object.keys(state.levels)[0]!;
    const topLevelId = 'lvl_r1';
    const slabTypeId = Object.keys(state.slabTypes ?? {})[0]!;
    const stairTypeId = Object.keys(state.stairTypes ?? {})[0]!;

    doc.execute(new Commands.AddLevelCommand({ id: topLevelId, name: 'R+1', elevation: 2800 }));
    doc.execute(
      new Commands.AddSlabCommand({
        id: 'slab_r1',
        category: 'slab',
        slabTypeId,
        levelId: topLevelId,
        boundary: [
          { x: 0, y: 0 },
          { x: 12000, y: 0 },
          { x: 12000, y: 9000 },
          { x: 0, y: 9000 },
        ],
      }),
    );
    doc.execute(
      new Commands.AddStairCommand({
        id: 'stair_rdc_r1',
        category: 'stair',
        stairTypeId,
        bottomLevelId,
        topLevelId,
        start: { x: 1500, y: 1000 },
        end: { x: 1500, y: 5640 },
      }),
    );

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D activeLevelId={topLevelId} />
      </BimDocumentProvider>,
    );

    expect(setSlabsSpy).toHaveBeenCalled();
  });

  it('RÈGLE D’OR 3 : un re-render React ne recrée PAS l’instance de View2D', () => {
    const doc = BimDocument.createDefaultProject();
    const initSpy = vi.spyOn(View2DModule.View2D.prototype, 'setDocument');

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D />
      </BimDocumentProvider>,
    );

    expect(initSpy).toHaveBeenCalledTimes(1);

    // Déclenchement d'un re-render React
    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D />
      </BimDocumentProvider>,
    );

    // L'initialisation dans useEffect n'a toujours été exécutée qu'une seule fois !
    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it('appelle dispose() lors du démontage du composant (unmount)', () => {
    const doc = BimDocument.createDefaultProject();

    const { unmount } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D />
      </BimDocumentProvider>,
    );

    expect(disposeSpy).not.toHaveBeenCalled();

    unmount();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('exécute AddWallCommand et crée un mur lors du tracé complet avec WallTool', () => {
    const doc = BimDocument.createDefaultProject();
    const initialWallCount = Object.keys(doc.getState().walls).length;
    const wallTool = new WallTool();
    const lengthCallback = vi.fn();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={wallTool} onDrawingLengthChange={lengthCallback} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');

    // 1. PointerDown début de tracé
    act(() => {
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        button: 0,
      });
    });

    expect(wallTool.getState().kind).toBe('drawing');

    // 2. PointerMove mise à jour du rubber-band (déplacement de 200px = 4000mm à échelle 0.05)
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 600,
        clientY: 300,
        button: 0,
      });
    });

    expect(setPreviewSpy).toHaveBeenCalled();
    expect(lengthCallback).toHaveBeenCalled();

    // 3. PointerUp validation du tracé
    act(() => {
      fireEvent.pointerUp(canvas, {
        clientX: 600,
        clientY: 300,
        button: 0,
      });
    });

    // Le mur a bien été ajouté au document de manière transactionnelle
    const updatedWallCount = Object.keys(doc.getState().walls).length;
    expect(updatedWallCount).toBe(initialWallCount + 1);
    expect(wallTool.getState().kind).toBe('idle');
    expect(lengthCallback).toHaveBeenLastCalledWith(null);
  });

  it('met à jour la sélection de View2D lors d’un clic avec SelectTool', () => {
    const doc = BimDocument.createDefaultProject();
    const selectTool = new SelectTool();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={selectTool} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');

    // Simulation d'un clic dans le vide
    act(() => {
      fireEvent.pointerDown(canvas, {
        clientX: 10,
        clientY: 10,
        button: 0,
      });
    });

    expect(setSelectionSpy).toHaveBeenCalledWith([]);
  });

  it('nettoie le preview et réinitialise l’outil lors du démontage en cours de tracé', () => {
    const doc = BimDocument.createDefaultProject();
    const wallTool = new WallTool();

    const { getByTestId, unmount } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={wallTool} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');

    // Démarrage du tracé
    act(() => {
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        button: 0,
      });
    });

    expect(wallTool.getState().kind).toBe('drawing');

    // Démontage
    unmount();

    // Outil réinitialisé, preview vidé
    expect(wallTool.getState().kind).toBe('idle');
    expect(setPreviewSpy).toHaveBeenCalledWith(null);
  });

  it('propage la sélection externe vers view.setSelection()', () => {
    const doc = BimDocument.createDefaultProject();

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D selection={['wall_1']} />
      </BimDocumentProvider>,
    );

    expect(setSelectionSpy).toHaveBeenCalledWith(['wall_1']);

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D selection={[]} />
      </BimDocumentProvider>,
    );

    expect(setSelectionSpy).toHaveBeenCalledWith([]);
  });

  it('DoorTool + placement : pointerdown au-dessus d’un mur exécute AddDoorCommand et ajoute la porte au document', () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0] ?? '';
    const levelId = Object.keys(doc.getState().levels)[0] ?? '';

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_door_host',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );

    const doorTool = new DoorTool();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={doorTool} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');

    // Clic au centre de la vue à (400, 300) qui correspond au centre du mur (2500, 0) suite au zoomToFit
    act(() => {
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        button: 0,
      });
    });

    const doors = Object.values(doc.getState().doors ?? {});
    expect(doors.length).toBe(1);
    expect(doors[0]?.hostWallId).toBe('w_door_host');
    expect(doors[0]?.offsetAlong).toBe(2500);
    const doorType = doc.getState().doorTypes[doors[0]!.doorTypeId];
    expect(doorType?.width).toBe(900);
  });

  it('MoveWallTool + drag : drag d’un mur hôte déplace le mur, UpdateWallCommand est exécuté et la porte suit', () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0] ?? '';
    const levelId = Object.keys(doc.getState().levels)[0] ?? '';

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_move_host',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );

    const doorTypeId = Object.keys(doc.getState().doorTypes)[0]!;
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'door_hosted',
        category: 'door',
        hostWallId: 'w_move_host',
        offsetAlong: 2000,
        doorTypeId,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const moveWallTool = new MoveWallTool();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D tool={moveWallTool} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');

    // 1. Grab sur le mur au centre de la vue (400, 300)
    act(() => {
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        button: 0,
      });
    });
    expect(moveWallTool.getState().kind).toBe('dragging');

    // 2. Drag de +25 px en X (avec zoomToFit : 25px / 0.136 ≈ 183.8mm -> snappé à 180mm)
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 425,
        clientY: 300,
      });
    });

    // 3. Relâchement
    act(() => {
      fireEvent.pointerUp(canvas, {
        clientX: 425,
        clientY: 300,
        button: 0,
      });
    });

    // Le mur s'est déplacé de 180 mm
    const movedWall = doc.getState().walls['w_move_host'];
    expect(movedWall).toBeDefined();
    expect(movedWall?.start).toEqual({ x: 180, y: 0 });
    expect(movedWall?.end).toEqual({ x: 5180, y: 0 });

    // La porte conserve strictement son offsetAlong dans le modèle
    const door = doc.getState().doors?.['door_hosted'];
    expect(door).toBeDefined();
    expect(door?.offsetAlong).toBe(2000);
  });

  it('T-UNDERLAY-INVALIDATE-04 — doc.subscribe et changement de niveau invalident réactivement le cache underlay', () => {
    const invalidateSpy = vi.spyOn(View2DModule.View2D.prototype, 'invalidateUnderlayCache');
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_underlay_test',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D activeLevelId="lvl_r1" underlayLevelId="lvl_rdc" />
      </BimDocumentProvider>,
    );

    // Réinitialisation après montage initial
    invalidateSpy.mockClear();

    // 1. Exécution d'une commande documentaire
    act(() => {
      doc.execute(
        new Commands.UpdateWallCommand('w_underlay_test', {
          start: { x: 50, y: 50 },
        }),
      );
    });

    // doc.subscribe a bien déclenché invalidateUnderlayCache avec les IDs modifiés
    expect(invalidateSpy).toHaveBeenCalledWith(['w_underlay_test']);

    // 2. Changement de niveau actif / fantôme -> invalidation totale sans argument
    invalidateSpy.mockClear();
    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D activeLevelId="lvl_r2" underlayLevelId="lvl_r1" />
      </BimDocumentProvider>,
    );
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
