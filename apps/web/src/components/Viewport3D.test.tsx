import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import * as Scene3DModule from '@mini-bim/view-3d';
import {
  BimDocument,
  Commands,
  point3D,
  vector3D,
  createPipe,
  createMepFitting,
  createPort,
  AddPipeCommand,
  AddMepFittingCommand,
  ConnectPortsCommand,
  UpdateMepElementCommand,
} from '@mini-bim/core';
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

  it('monte le composant, instancie Scene3D et ajoute les maillages initiaux (murs percés et placeholders)', () => {
    const doc = createDemoDocument();

    const { getByTestId, getByText } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    const canvas = getByTestId('viewport-3d-canvas');
    expect(canvas).toBeDefined();

    expect(() => getByText('Vue 3D Orbitale (Z-up)')).toThrow();

    // 1. Décompte d'appels :
    // - wall_south (avec 1 porte) : 3 pièces solides (2 pleines + 1 linteau)
    // - wall_north (avec 1 fenêtre) : 4 pièces solides (2 pleines + 1 allège + 1 linteau)
    // - wall_east (sans ouverture) : 1 pièce pleine
    // - wall_west (sans ouverture) : 1 pièce pleine
    // - door_demo : 1 placeholder (boîte bois)
    // - window_demo : 1 placeholder (boîte vitrée)
    // - slab_demo_ground : 1 dalle structurelle avec trémie
    // Total = 3 + 4 + 1 + 1 + 1 + 1 + 1 = 12 maillages
    expect(addMeshSpy).toHaveBeenCalledTimes(12);

    // 2. Vérification des arguments passés à addMesh
    const calledElementIds = addMeshSpy.mock.calls.map((call) => call[0].elementId);
    expect(calledElementIds).toHaveLength(12);

    // Les IDs distincts couvrent exactement les 4 murs + 2 ouvertures + 1 dalle
    const uniqueIds = new Set(calledElementIds);
    expect(uniqueIds).toEqual(
      new Set([
        'wall_south',
        'wall_east',
        'wall_north',
        'wall_west',
        'door_demo',
        'window_demo',
        'slab_demo_ground',
      ]),
    );

    // 3. Vérification de la structure géométrique des tronçons de murs percés
    const wallCalls = addMeshSpy.mock.calls.filter((c) =>
      ['wall_south', 'wall_east', 'wall_north', 'wall_west'].includes(c[0].elementId),
    );
    expect(wallCalls).toHaveLength(9);

    for (const call of wallCalls) {
      const meshData = call[0];
      expect(meshData.positions.length).toBeGreaterThan(0);
      expect(meshData.indices.length).toBeGreaterThan(0);
      expect(meshData.normals.length).toBe(meshData.positions.length);
      expect(['full', 'sill', 'lintel']).toContain(meshData.role);
    }
  });

  it('applique le thème de fond transmis à la vue 3D', () => {
    const doc = BimDocument.createDefaultProject();
    const setBackgroundSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'setBackground');

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D isWhiteMode={false} />
      </BimDocumentProvider>,
    );

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D isWhiteMode />
      </BimDocumentProvider>,
    );
    expect(setBackgroundSpy).toHaveBeenLastCalledWith(0xffffff, [0xd1d5db, 0xe5e7eb]);

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D isWhiteMode={false} />
      </BimDocumentProvider>,
    );
    expect(setBackgroundSpy).toHaveBeenLastCalledWith(0x262a33, [0x566070, 0x3a404c]);
  });

  it('expose une action de cadrage 3D qui appelle Scene3D.zoomToFit', () => {
    const doc = BimDocument.createDefaultProject();
    const zoomToFitSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'zoomToFit');
    let zoomToFit: (() => void) | undefined;

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D onZoomFitReady={(callback) => (zoomToFit = callback)} />
      </BimDocumentProvider>,
    );

    zoomToFit?.();
    expect(zoomToFitSpy).toHaveBeenCalledOnce();
  });

  it('RÈGLE D’OR 3 : un re-render React ne recrée PAS l’instance de Scene3D', () => {
    const doc = createDemoDocument();

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Initialement 12 addMesh
    expect(addMeshSpy).toHaveBeenCalledTimes(12);

    // Déclenchement d'un re-render React
    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // addMesh n'a pas été rappelé (l'instance Scene3D est persistée dans sceneRef et le useEffect[] ne s'est pas réexécuté)
    expect(addMeshSpy).toHaveBeenCalledTimes(12);
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

  it('décomptes géométriques discriminants : 3 pièces pour mur+porte, 4 pièces pour mur+fenêtre, 1 pièce par mur plein', () => {
    const doc = createDemoDocument();

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Filtrer les pièces par elementId
    const southPieces = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'wall_south');
    const northPieces = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'wall_north');
    const eastPieces = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'wall_east');
    const westPieces = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'wall_west');

    // 1. Mur Sud (avec 1 porte de h=2100 < 2800) -> 3 pièces (2 full + 1 lintel)
    expect(southPieces).toHaveLength(3);
    const southRoles = southPieces.map((c) => c[0].role).sort();
    expect(southRoles).toEqual(['full', 'full', 'lintel']);

    // 2. Mur Nord (avec 1 fenêtre de allège=900 + h=1400 = 2300 < 2800) -> 4 pièces (2 full + 1 sill + 1 lintel)
    expect(northPieces).toHaveLength(4);
    const northRoles = northPieces.map((c) => c[0].role).sort();
    expect(northRoles).toEqual(['full', 'full', 'lintel', 'sill']);

    // 3. Murs Est et Ouest (pleins sans ouverture) -> 1 pièce pleine chacun
    expect(eastPieces).toHaveLength(1);
    const eastCall = eastPieces[0];
    expect(eastCall?.[0].role).toBe('full');
    expect(westPieces).toHaveLength(1);
    const westCall = westPieces[0];
    expect(westCall?.[0].role).toBe('full');

    // 4. Placeholders d'ouvertures (dimensions et matériaux dédiés)
    const doorPlaceholderCall = addMeshSpy.mock.calls.find((c) => c[0].elementId === 'door_demo');
    const winPlaceholderCall = addMeshSpy.mock.calls.find((c) => c[0].elementId === 'window_demo');
    expect(doorPlaceholderCall).toBeDefined();
    expect(winPlaceholderCall).toBeDefined();

    if (!doorPlaceholderCall || !winPlaceholderCall) {
      throw new Error('Les appels de placeholders doivent exister');
    }

    // Vérification de la hauteur et élévation de la porte
    const doorBb = doorPlaceholderCall[0].boundingBox;
    expect(doorBb.max.z - doorBb.min.z).toBeCloseTo(2100, 1);
    expect(doorBb.min.z).toBeCloseTo(0, 1);
    expect(doorPlaceholderCall[1]).toBeDefined(); // Matériau bois transmis

    // Vérification de la hauteur et de l'allège (sillHeight) de la fenêtre
    const winBb = winPlaceholderCall[0].boundingBox;
    expect(winBb.max.z - winBb.min.z).toBeCloseTo(1400, 1);
    expect(winBb.min.z).toBeCloseTo(900, 1); // sillHeight = 900
    expect(winPlaceholderCall[1]).toBeDefined(); // Matériau vitrage transmis
  });

  it('addMesh reçoit des elementId distincts (wall_south vs door_demo)', () => {
    const doc = createDemoDocument();

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    const wallSouthCalls = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'wall_south');
    const doorCalls = addMeshSpy.mock.calls.filter((c) => c[0].elementId === 'door_demo');

    expect(wallSouthCalls.length).toBeGreaterThan(0);
    expect(doorCalls.length).toBe(1);

    const firstSouth = wallSouthCalls[0];
    const firstDoor = doorCalls[0];
    expect(firstSouth).toBeDefined();
    expect(firstDoor).toBeDefined();

    // Vérifier l'indépendance stricte des IDs pour le raycast et la sélection
    if (firstSouth && firstDoor) {
      expect(firstSouth[0].elementId).not.toEqual(firstDoor[0].elementId);
    }
  });

  it('la suppression d’un mur hôte cascade et retire tous les maillages associés (tronçons de mur ET placeholders)', () => {
    const doc = createDemoDocument();
    const removeMeshSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'removeMesh');

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    removeMeshSpy.mockClear();

    // Suppression de wall_south (qui héberge door_demo)
    act(() => {
      doc.execute(new Commands.DeleteWallCommand('wall_south'));
    });

    // removeMesh a été appelé pour le mur ET pour la porte en cascade
    const removedIds = removeMeshSpy.mock.calls.map((c) => c[0]);
    expect(removedIds).toContain('wall_south');
    expect(removedIds).toContain('door_demo');
  });

  it('update propagation : quand une porte est déplacée via MoveOpeningCommand, le mur hôte est régénéré (re-calcul du perçage) et l’ancien maillage est disposé', () => {
    const doc = createDemoDocument();
    const createWallMeshWithOpeningsSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');
    const updateMeshBatchSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'updateMeshBatch');
    const removeMeshSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'removeMesh');

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Initialement : 4 appels à createWallMeshWithOpenings (1 par mur du demoDocument)
    const initialWallSouthCalls = createWallMeshWithOpeningsSpy.mock.calls.filter(
      (c) => c[0].wall.id === 'wall_south',
    );
    expect(initialWallSouthCalls).toHaveLength(1);
    const firstCall = initialWallSouthCalls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      expect(firstCall[0].openings[0]?.offsetAlong).toBe(2000);
    }

    createWallMeshWithOpeningsSpy.mockClear();
    updateMeshBatchSpy.mockClear();
    removeMeshSpy.mockClear();

    // Déplacement de door_demo de offsetAlong 2000 mm -> 3500 mm
    act(() => {
      doc.execute(new Commands.MoveOpeningCommand('door_demo', 3500));
    });

    // 1. Propagation confirmée : createWallMeshWithOpenings ré-invoqué pour wall_south avec le nouvel offset 3500
    const updatedWallSouthCalls = createWallMeshWithOpeningsSpy.mock.calls.filter(
      (c) => c[0].wall.id === 'wall_south',
    );
    expect(updatedWallSouthCalls).toHaveLength(1);
    const secondCall = updatedWallSouthCalls[0];
    expect(secondCall).toBeDefined();
    if (secondCall) {
      expect(secondCall[0].openings[0]?.offsetAlong).toBe(3500);
    }

    // 2. updateMeshBatch appelé pour wall_south
    expect(updateMeshBatchSpy).toHaveBeenCalledWith('wall_south', expect.any(Array));

    // 3. removeMesh appelé pour nettoyer et disposer les anciens maillages du mur et du placeholder
    const removedIds = removeMeshSpy.mock.calls.map((c) => c[0]);
    expect(removedIds).toContain('wall_south');
    expect(removedIds).toContain('door_demo');

    // 4. addMesh appelé pour ré-attacher le nouveau placeholder de door_demo régénéré à offsetAlong 3500
    const updatedDoorCall = addMeshSpy.mock.calls.find(
      (c) => c[0].elementId === 'door_demo' && c[0].boundingBox.min.x >= 3500,
    );
    expect(updatedDoorCall).toBeDefined();
  });

  it('Viewport3D passe les polygones de jonction résolus (solveWallJunctions) à createWallMeshWithOpenings (P1.3)', () => {
    const doc = createDemoDocument();
    const createWallMeshWithOpeningsSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');

    render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Les 4 murs de la démo sont connectés en L
    expect(createWallMeshWithOpeningsSpy).toHaveBeenCalledTimes(4);
    for (const call of createWallMeshWithOpeningsSpy.mock.calls) {
      const params = call[0];
      // Chaque mur a un polygone résolu fourni par solveWallJunctions
      expect(params.polygon).toBeDefined();
      expect(params.polygon?.length).toBeGreaterThanOrEqual(4);
    }

    createWallMeshWithOpeningsSpy.mockRestore();
  });

  it('T-VIEW3D-INCREMENTAL : ne reconstruit que le mur modifié et ses voisins topologiques lors d’un UpdateWallCommand', () => {
    const doc = createDemoDocument();
    const createWallMeshWithOpeningsSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');
    const updateMeshBatchSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'updateMeshBatch');

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Initial mount : 4 murs construits
    expect(createWallMeshWithOpeningsSpy).toHaveBeenCalledTimes(4);
    createWallMeshWithOpeningsSpy.mockClear();
    updateMeshBatchSpy.mockClear();

    // Mutation ciblée sur wall_south
    act(() => {
      doc.execute(new Commands.UpdateWallCommand('wall_south', { heightOverride: 3200 }));
    });

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Vérification de la propagation incrémentale
    const rebuiltWallIds = createWallMeshWithOpeningsSpy.mock.calls.map((c) => c[0].wall.id);
    expect(rebuiltWallIds).toContain('wall_south');
    // wall_north n'est pas connecté à wall_south et ne doit PAS être re-maillé
    expect(rebuiltWallIds).not.toContain('wall_north');

    createWallMeshWithOpeningsSpy.mockRestore();
    updateMeshBatchSpy.mockRestore();
  });

  it('T-BENCHMARK-VIEW3D : Mesure concrète du gain algorithmique O(k) vs O(N) sur un projet multi-murs', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Construire 20 murs isolés
    const wallCount = 20;
    for (let i = 0; i < wallCount; i++) {
      doc.execute(
        new Commands.AddWallCommand({
          id: `bench_wall_${i}`,
          category: 'wall',
          typeId,
          levelId,
          start: { x: i * 2000, y: 0 },
          end: { x: i * 2000 + 1500, y: 0 },
        }),
      );
    }

    const createWallMeshWithOpeningsSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // Initial : 20 murs construits
    expect(createWallMeshWithOpeningsSpy).toHaveBeenCalledTimes(wallCount);
    createWallMeshWithOpeningsSpy.mockClear();

    // Modification d'un seul mur (bench_wall_5)
    act(() => {
      doc.execute(new Commands.UpdateWallCommand('bench_wall_5', { heightOverride: 3500 }));
    });

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // En re-maillage incrémental : EXACTEMENT 1 seul mur re-maillé sur 20 !
    const incrementalCallCount = createWallMeshWithOpeningsSpy.mock.calls.length;
    expect(incrementalCallCount).toBe(1);

    // Gain d'appels = 20x moins de maillages générés
    const speedupFactor = wallCount / incrementalCallCount;
    expect(speedupFactor).toBe(20);

    createWallMeshWithOpeningsSpy.mockRestore();
  });

  it('T-MEP-REMESHDUTY : la modification d’un tronçon MEP propage la salissure à son raccord incident sans re-mailler les murs', () => {
    const doc = BimDocument.createDefaultProject();
    const levelId = Object.keys(doc.getState().levels)[0]!;

    // 1. Ajouter un mur architectural
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    doc.execute(
      new Commands.AddWallCommand({
        id: 'wall_arch_1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
      }),
    );

    // 2. Ajouter une chaîne pipe1 -> elbow
    const pipe1 = createPipe({
      id: 'pipe_1',
      levelId,
      start: point3D(0, 1000, 500),
      end: point3D(1000, 1000, 500),
      diameter: 32,
    });
    doc.execute(new AddPipeCommand(pipe1));

    const elbowPort0 = createPort({
      elementId: 'elbow_1',
      position: point3D(1000, 1000, 500),
      direction: vector3D(-1, 0, 0),
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      shape: 'round',
      diameter: 32,
    });
    const elbowPort1 = createPort({
      elementId: 'elbow_1',
      position: point3D(1000, 1000, 500),
      direction: vector3D(0, 1, 0),
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      shape: 'round',
      diameter: 32,
    });
    const elbow = createMepFitting({
      id: 'elbow_1',
      levelId,
      fittingType: 'elbow',
      domain: 'plumbing',
      systemType: 'domestic_cold_water',
      position: point3D(1000, 1000, 500),
      ports: [elbowPort0, elbowPort1],
    });
    doc.execute(new AddMepFittingCommand(elbow));

    // Connecter pipe1 (port 1) à elbow (port 0)
    doc.execute(
      new ConnectPortsCommand({
        id: 'conn_1',
        category: 'mepConnector',
        portAId: pipe1.ports[1]!.id,
        portBId: elbowPort0.id,
      }),
    );

    const createWallMeshWithOpeningsSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');
    const updateMepMeshSpy = vi.spyOn(Scene3DModule.Scene3D.prototype, 'updateMepMesh');

    const { rerender } = render(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    createWallMeshWithOpeningsSpy.mockClear();
    updateMepMeshSpy.mockClear();

    // Modifier le diamètre de pipe1
    act(() => {
      doc.execute(new UpdateMepElementCommand('pipe_1', { diameter: 40 }));
    });

    rerender(
      <BimDocumentProvider initialDoc={doc}>
        <Viewport3D />
      </BimDocumentProvider>,
    );

    // ZERO mur architectural re-maillé !
    expect(createWallMeshWithOpeningsSpy).toHaveBeenCalledTimes(0);

    // updateMepMesh a été appelé pour pipe_1 et pour son voisin incident elbow_1
    const updatedMepIds = updateMepMeshSpy.mock.calls.map((c) => c[0]);
    expect(updatedMepIds).toContain('pipe_1');
    expect(updatedMepIds).toContain('elbow_1');

    createWallMeshWithOpeningsSpy.mockRestore();
    updateMepMeshSpy.mockRestore();
  });
});
