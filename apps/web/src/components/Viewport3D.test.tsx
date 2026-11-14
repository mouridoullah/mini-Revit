import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as Scene3DModule from '@mini-bim/view-3d';
import { BimDocument } from '@mini-bim/core';
import { createDemoDocument } from '../demo/demoDocument.js';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { Viewport3D } from './Viewport3D.js';

describe('Viewport3D React Wrapper (apps/web)', () => {
  const disposeSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'dispose');
  const addMeshSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'addMesh');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monte le composant, instancie Scene3D et ajoute les maillages initiaux', () => {
    const doc = createDemoDocument();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-3d-canvas');
    expect(canvas).toBeDefined();
    // Le demoDocument comporte 4 murs -> addMesh appelé pour chaque mur
    expect(addMeshSpy).toHaveBeenCalledTimes(4);
  });

  it('RÈGLE D’OR 3 : un re-render React ne recrée PAS l’instance de Scene3D', () => {
    const doc = createDemoDocument();

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Initialement 4 addMesh
    expect(addMeshSpy).toHaveBeenCalledTimes(4);

    // Déclenchement d'un re-render React
    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // addMesh n'a pas été rappelé (l'instance Scene3D est persistée dans sceneRef et le useEffect[] ne s'est pas réexécuté)
    expect(addMeshSpy).toHaveBeenCalledTimes(4);
  });

  it('appelle scene.dispose() lors du démontage du composant (unmount)', () => {
    const doc = BimDocument.createDefaultProject();

    const { unmount } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    expect(disposeSpy).not.toHaveBeenCalled();

    unmount();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
