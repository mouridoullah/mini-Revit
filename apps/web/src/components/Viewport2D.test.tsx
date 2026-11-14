import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as View2DModule from '@mini-bim/view-2d';
import { BimDocument } from '@mini-bim/core';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { Viewport2D } from './Viewport2D.js';

describe('Viewport2D React Wrapper (apps/web)', () => {
  const disposeSpy = vi.spyOn(View2DModule.View2D.prototype, 'dispose');
  const renderSpy = vi.spyOn(View2DModule.View2D.prototype, 'render');

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
});
