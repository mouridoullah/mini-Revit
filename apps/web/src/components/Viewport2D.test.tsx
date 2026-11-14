import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import * as View2DModule from '@mini-bim/view-2d';
import { BimDocument } from '@mini-bim/core';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { Viewport2D } from './Viewport2D.js';
import { WallTool } from '../tools/WallTool.js';
import { SelectTool } from '../tools/SelectTool.js';

describe('Viewport2D React Wrapper & Tools Integration (apps/web)', () => {
  const disposeSpy = vi.spyOn(View2DModule.View2D.prototype, 'dispose');
  const renderSpy = vi.spyOn(View2DModule.View2D.prototype, 'render');
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
          setLineDash: vi.fn(),
          getLineDash: vi.fn(() => []),
          arc: vi.fn(),
          strokeRect: vi.fn(),
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

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport2D />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-2d-canvas');
    expect(canvas).toBeDefined();
    expect(renderSpy).toHaveBeenCalled();
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
});
