import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import * as Scene3DModule from '@mini-bim/view-3d';
import { BimDocument } from '@mini-bim/core';
import { createDemoDocument } from '../demo/demoDocument.js';
import { BimDocumentProvider } from '../context/BimDocumentContext.js';
import { Viewport3D } from './Viewport3D.js';

describe('Viewport3D React Wrapper (apps/web)', () => {
  const disposeSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'dispose');
  const addMeshSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'addMesh');
  const setHighlightSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'setHighlight');
  const raycastSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'raycast');

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
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

    // 1. Décompte d'appels : 4 murs
    expect(addMeshSpy).toHaveBeenCalledTimes(4);

    // 2. Vérification des arguments passés à addMesh
    const calledElementIds = addMeshSpy.mock.calls.map((call) => call[0].elementId);
    expect(calledElementIds).toHaveLength(4);

    // Les 4 IDs sont distincts
    const uniqueIds = new Set(calledElementIds);
    expect(uniqueIds.size).toBe(4);

    // Correspondance exacte avec les 4 murs du demoDocument
    const expectedWallIds = ['wall_south', 'wall_east', 'wall_north', 'wall_west'];
    expect([...calledElementIds].sort()).toEqual([...expectedWallIds].sort());

    // Vérification de la structure et de l'intégrité géométrique de chaque RawMeshData
    for (const call of addMeshSpy.mock.calls) {
      const meshData = call[0];
      expect(meshData.positions.length).toBeGreaterThan(0);
      expect(meshData.indices.length).toBeGreaterThan(0);
      expect(meshData.normals.length).toBe(meshData.positions.length);
      expect(meshData.role).toBe('full');
      expect(meshData.boundingBox.max.z - meshData.boundingBox.min.z).toBeCloseTo(2800, 1);
    }

    // Vérification que les emprises X/Y des 4 murs sont bien distinctes dans le plan (pas de murs clonés)
    const centroidsXY = addMeshSpy.mock.calls.map((call) => {
      const bb = call[0].boundingBox;
      return `${Math.round((bb.min.x + bb.max.x) / 2)},${Math.round((bb.min.y + bb.max.y) / 2)}`;
    });
    expect(new Set(centroidsXY).size).toBe(4);
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

  it('propage la sélection externe à scene.setHighlight()', () => {
    const doc = createDemoDocument();

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D selection={['wall_south']} />
      </BimDocumentProvider>,
    );

    expect(setHighlightSpy).toHaveBeenCalledWith(['wall_south']);

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D selection={[]} />
      </BimDocumentProvider>,
    );

    expect(setHighlightSpy).toHaveBeenCalledWith([]);
  });

  it('déclenche le picking 3D (raycast) sur clic stationnaire (Δ ≤ 5px, ex: Δ ≈ 2.8px) et notifie onSelectionChanged', () => {
    const doc = createDemoDocument();
    const selectionCallback = vi.fn();
    raycastSpy.mockReturnValue('wall_south');

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D onSelectionChanged={selectionCallback} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-3d-canvas');

    // Clic avec micro-mouvement de 2.8px : dx=2, dy=2 => hypot(2, 2) = sqrt(8) ≈ 2.828px ≤ 5px
    act(() => {
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(canvas, { clientX: 102, clientY: 102, button: 0 });
    });

    expect(raycastSpy).toHaveBeenCalled();
    expect(selectionCallback).toHaveBeenCalledWith(['wall_south']);
  });

  it('ignore le clic si le pointeur a été déplacé de plus de 5px (ex: Δ = 50px pour rotation caméra OrbitControls)', () => {
    const doc = createDemoDocument();
    const selectionCallback = vi.fn();

    const { getByTestId } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D onSelectionChanged={selectionCallback} />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-3d-canvas');

    // Déplacement de 50px (rotation de caméra OrbitControls) : dx=50, dy=0 => hypot(50, 0) = 50px > 5px
    act(() => {
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(canvas, { clientX: 150, clientY: 100, button: 0 });
    });

    // Pas de picking sur un drag
    expect(raycastSpy).not.toHaveBeenCalled();
    expect(selectionCallback).not.toHaveBeenCalled();
  });
});
