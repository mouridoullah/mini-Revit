import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { View2D } from '@mini-bim/view-2d';
import * as view2dModule from '@mini-bim/view-2d';
import { Scene3D } from '@mini-bim/view-3d';
import * as Scene3DModule from '@mini-bim/view-3d';
import { BimDocument, AddWallCommand } from '@mini-bim/core';
import { App } from './App.js';
import { createDemoDocument } from './demo/demoDocument.js';
import { exportToJSON } from './persistence/jsonIO.js';

describe('App Integration & Squelette Double Viewport (apps/web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      globalThis.URL.revokeObjectURL = vi.fn();
    }
  });

  it('monte <App /> avec les 2 canvas (2D et 3D) et affiche le nombre de murs dans StatusBar', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    const { getByTestId } = render(<App />);

    // 1. Présence du layout principal
    expect(getByTestId('app-root')).toBeDefined();

    // 2. Présence des deux canvas (2D et 3D) côte à côte
    const canvas2D = getByTestId('viewport-2d-canvas');
    const canvas3D = getByTestId('viewport-3d-canvas');
    expect(canvas2D).toBeDefined();
    expect(canvas3D).toBeDefined();

    // 3. StatusBar affiche bien les 4 murs du demoDocument
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Murs : 4');
    expect(statusBar?.textContent).toContain('Niveaux : 1');

    // 4. Aucune erreur console React
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    cleanup();
  });

  it('supporte React.StrictMode (double-mount dev) sans fuite et avec affichage intègre', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const view2dDisposeSpy = vi.spyOn(View2D.prototype, 'dispose');
    const scene3dDisposeSpy = vi.spyOn(Scene3D.prototype, 'dispose');

    const { getByTestId, unmount } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    // 1. Les deux viewports sont bien montés et présents
    expect(getByTestId('viewport-2d-canvas')).toBeDefined();
    expect(getByTestId('viewport-3d-canvas')).toBeDefined();

    // 2. StatusBar affiche toujours les 4 murs du demoDocument
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Murs : 4');
    expect(statusBar?.textContent).toContain('Niveaux : 1');

    // 3. Aucune erreur console React levée
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // 4. Double-mount StrictMode : dispose() appelé lors du démontage initial
    expect(view2dDisposeSpy).toHaveBeenCalledTimes(1);
    expect(scene3dDisposeSpy).toHaveBeenCalledTimes(1);

    // 5. Lors du démontage final du test
    unmount();

    // Au final, dispose() a été appelé exactement 2 fois sur chaque contrôleur graphique
    expect(view2dDisposeSpy).toHaveBeenCalledTimes(2);
    expect(scene3dDisposeSpy).toHaveBeenCalledTimes(2);
  });

  it('absence de fuite mémoire : 10 cycles consécutifs de mount / unmount s’exécutent proprement', () => {
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(<App />);
      unmount();
    }
  });

  it('permet de basculer d’outil via les boutons de la Toolbar et met à jour StatusBar', () => {
    const { getByTestId } = render(<App />);

    const selectBtn = getByTestId('tool-select-btn');
    const wallBtn = getByTestId('tool-wall-btn');
    const statusInfo = getByTestId('status-tool-info');

    // État initial : outil Sélectionner actif
    expect(statusInfo.textContent).toContain('Sélectionner (S)');

    // Clic sur Tracer Mur
    act(() => {
      fireEvent.click(wallBtn);
    });

    expect(statusInfo.textContent).toContain('Tracer Mur (W)');

    // Clic retour sur Sélectionner
    act(() => {
      fireEvent.click(selectBtn);
    });

    expect(statusInfo.textContent).toContain('Sélectionner (S)');

    cleanup();
  });

  it('supporte les raccourcis clavier globaux "W" et "S" pour basculer d’outil', () => {
    const { getByTestId } = render(<App />);
    const statusInfo = getByTestId('status-tool-info');

    expect(statusInfo.textContent).toContain('Sélectionner (S)');

    // Appui sur 'w'
    act(() => {
      fireEvent.keyDown(window, { key: 'w' });
    });
    expect(statusInfo.textContent).toContain('Tracer Mur (W)');

    // Appui sur 's'
    act(() => {
      fireEvent.keyDown(window, { key: 's' });
    });
    expect(statusInfo.textContent).toContain('Sélectionner (S)');

    cleanup();
  });

  /* =========================================================================
   * TESTS DE VALIDATION PHASE 2.4 : SYNC 2D/3D, UNDO/REDO & PERSISTANCE JSON
   * ========================================================================= */

  it('synchronise la sélection 2D vers la surbrillance 3D (Scene3D.setHighlight)', () => {
    const setHighlightSpy = vi.spyOn(Scene3D.prototype, 'setHighlight');
    vi.spyOn(view2dModule, 'findWallAtScreen').mockReturnValue('wall_south');

    const { getByTestId } = render(<App />);
    const canvas2D = getByTestId('viewport-2d-canvas');

    // Simuler un clic de sélection sur le canvas 2D
    act(() => {
      fireEvent.pointerDown(canvas2D, { clientX: 200, clientY: 150, button: 0 });
    });

    // Vérifier que Scene3D.setHighlight a bien été appelé avec l'ID du mur sélectionné
    expect(setHighlightSpy).toHaveBeenCalledWith(['wall_south']);

    cleanup();
  });

  it('synchronise la sélection 3D vers la sélection 2D (View2D.setSelection)', () => {
    const setSelectionSpy = vi.spyOn(View2D.prototype, 'setSelection');
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('wall_north');

    const { getByTestId } = render(<App />);
    const canvas3D = getByTestId('viewport-3d-canvas');

    // Simuler un clic stationnaire dans le viewport 3D touchant 'wall_north'
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 200, clientY: 150, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 200, clientY: 150, button: 0 });
    });

    // Vérifier que View2D.setSelection a bien reçu la sélection issue du picking 3D
    expect(setSelectionSpy).toHaveBeenCalledWith(['wall_north']);

    cleanup();
  });

  it('désélectionne les éléments sur appui de la touche Escape ou clic dans le vide', () => {
    const setSelectionSpy = vi.spyOn(View2D.prototype, 'setSelection');
    const setHighlightSpy = vi.spyOn(Scene3D.prototype, 'setHighlight');
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('wall_east');

    const { getByTestId } = render(<App />);
    const canvas3D = getByTestId('viewport-3d-canvas');

    // 1. Sélectionner un mur via 3D
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 200, clientY: 150, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 200, clientY: 150, button: 0 });
    });
    expect(setHighlightSpy).toHaveBeenCalledWith(['wall_east']);

    // 2. Appuyer sur Escape -> désélection globale
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(setSelectionSpy).toHaveBeenCalledWith([]);
    expect(setHighlightSpy).toHaveBeenCalledWith([]);

    // 3. Sélectionner à nouveau puis clic dans le vide (raycast retourne null)
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('wall_east');
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 200, clientY: 150, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 200, clientY: 150, button: 0 });
    });
    expect(setHighlightSpy).toHaveBeenCalledWith(['wall_east']);

    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue(null);
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 50, clientY: 50, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 50, clientY: 50, button: 0 });
    });

    expect(setSelectionSpy).toHaveBeenLastCalledWith([]);
    expect(setHighlightSpy).toHaveBeenLastCalledWith([]);

    cleanup();
  });

  it('gère l’historique transactionnel Undo / Redo via Toolbar et raccourcis clavier (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)', () => {
    const initialDoc = BimDocument.createDefaultProject();
    const levelId = Object.keys(initialDoc.getState().levels)[0] ?? '';
    const typeId = Object.keys(initialDoc.getState().wallTypes)[0] ?? '';

    const { getByTestId } = render(<App initialDoc={initialDoc} />);

    const undoBtn = getByTestId('undo-btn') as HTMLButtonElement;
    const redoBtn = getByTestId('redo-btn') as HTMLButtonElement;
    const statusBar = document.querySelector('footer');

    // Au départ : pas d'action annulable
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
    expect(statusBar?.textContent).toContain('Murs : 0');

    // 1. Exécuter une commande AddWallCommand sur le document
    act(() => {
      initialDoc.execute(
        new AddWallCommand({
          id: 'test-wall-new',
          start: { x: 0, y: 0 },
          end: { x: 2000, y: 0 },
          typeId,
          levelId,
          category: 'wall',
        }),
      );
    });

    // L'UI réagit immédiatement : 1 mur, Undo actif
    expect(statusBar?.textContent).toContain('Murs : 1');
    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);

    // 2. Annulation par clic sur le bouton Annuler
    act(() => {
      fireEvent.click(undoBtn);
    });

    expect(statusBar?.textContent).toContain('Murs : 0');
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);

    // 3. Rétablissement par clic sur le bouton Rétablir
    act(() => {
      fireEvent.click(redoBtn);
    });

    expect(statusBar?.textContent).toContain('Murs : 1');
    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);

    // 4. Annulation par raccourci clavier global Ctrl+Z
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: false });
    });

    expect(statusBar?.textContent).toContain('Murs : 0');
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);

    // 5. Rétablissement par raccourci clavier global Ctrl+Shift+Z
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    });

    expect(statusBar?.textContent).toContain('Murs : 1');
    expect(undoBtn.disabled).toBe(false);

    // 6. Rétablissement par raccourci clavier Windows Ctrl+Y
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: false });
    });
    expect(statusBar?.textContent).toContain('Murs : 0');

    act(() => {
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(statusBar?.textContent).toContain('Murs : 1');

    cleanup();
  });

  it('exporte le projet courant au format JSON lors du clic sur Sauvegarder', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { getByTestId } = render(<App />);
    const saveBtn = getByTestId('save-btn');

    act(() => {
      fireEvent.click(saveBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');

    cleanup();
  });

  it('exporte la maquette au format IFC4 lors du clic sur Exporter IFC', () => {
    let capturedBlob: Blob | null = null;
    let capturedDownloadName: string | null = null;

    const createObjectURLMock = vi.fn().mockImplementation((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-ifc';
    });
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedDownloadName = this.download;
    });

    const { getByTestId } = render(<App />);
    const ifcBtn = getByTestId('export-ifc-btn');

    act(() => {
      fireEvent.click(ifcBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedDownloadName).toBe('mini-bim-model.ifc');
    expect(capturedBlob).toBeDefined();

    cleanup();
  });

  it('exporte le plan d’étage vectoriel SVG lors du clic sur Exporter Plan (SVG) avec échelle sélectionnée', () => {
    let capturedDownloadName: string | null = null;

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-svg');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedDownloadName = this.download;
    });

    const { getByTestId } = render(<App />);
    const scaleSelect = getByTestId('export-svg-scale-select');
    const svgBtn = getByTestId('export-svg-btn');

    // Changement de l'échelle à 1:50
    act(() => {
      fireEvent.change(scaleSelect, { target: { value: '50' } });
    });

    act(() => {
      fireEvent.click(svgBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(capturedDownloadName).toBe('plan-etage-1-50.svg');

    cleanup();
  });

  it('importe fidèlement un fichier JSON valide et synchronise l’état global et StatusBar', async () => {
    // Créer un document avec seulement 1 mur
    const customDoc = BimDocument.createDefaultProject();
    const levelId = Object.keys(customDoc.getState().levels)[0] ?? '';
    const typeId = Object.keys(customDoc.getState().wallTypes)[0] ?? '';

    customDoc.execute(
      new AddWallCommand({
        id: 'wall-unique',
        start: { x: 100, y: 100 },
        end: { x: 3000, y: 100 },
        typeId,
        levelId,
        category: 'wall',
      }),
    );
    const jsonStr = exportToJSON(customDoc, true);
    const file = new File([jsonStr], 'one_wall.mbim.json', { type: 'application/json' });

    const { getByTestId } = render(<App />);
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Murs : 4');

    const fileInput = getByTestId('file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(statusBar?.textContent).toContain('Murs : 1');
    });

    cleanup();
  });

  it('affiche un bandeau d’erreur lors d’un import JSON corrompu sans altérer le document existant (string equality), puis disparaît sur import valide', async () => {
    const initialDoc = createDemoDocument();
    const jsonBefore = initialDoc.toJSON(true);

    const corruptedFile = new File(['{ "bad": "content" ...'], 'invalid.json', {
      type: 'application/json',
    });

    const { getByTestId, queryByTestId } = render(<App initialDoc={initialDoc} />);
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Murs : 4');
    expect(queryByTestId('error-banner')).toBeNull();

    const fileInput = getByTestId('file-input');

    // 1. Déclencher un import corrompu
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [corruptedFile] } });
    });

    // 2. Vérifier la présence du bandeau d'erreur dans le DOM
    await waitFor(() => {
      const banner = getByTestId('error-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('INVALID_JSON');
    });

    // 3. PREUVE FORMELLE D'IMMUTABILITÉ : Le BimState avant et après l'import est strictement identique bit-à-bit
    const jsonAfter = initialDoc.toJSON(true);
    expect(jsonAfter).toBe(jsonBefore);
    expect(statusBar?.textContent).toContain('Murs : 4');

    // 4. Import d'un document valide consécutif (1 mur)
    const validDoc = BimDocument.createDefaultProject();
    const levelId = Object.keys(validDoc.getState().levels)[0] ?? '';
    const typeId = Object.keys(validDoc.getState().wallTypes)[0] ?? '';
    validDoc.execute(
      new AddWallCommand({
        id: 'wall-new-valid',
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
        typeId,
        levelId,
        category: 'wall',
      }),
    );
    const validFile = new File([exportToJSON(validDoc, true)], 'valid.mbim.json', {
      type: 'application/json',
    });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [validFile] } });
    });

    // 5. L'error-banner disparaît automatiquement et le StatusBar est mis à jour
    await waitFor(() => {
      expect(queryByTestId('error-banner')).toBeNull();
      expect(statusBar?.textContent).toContain('Murs : 1');
    });

    cleanup();
  });

  it('réinitialise l’outil actif et vide la sélection lors de l’import d’un nouveau document', async () => {
    const customDoc = BimDocument.createDefaultProject();
    const jsonStr = exportToJSON(customDoc, true);
    const file = new File([jsonStr], 'clean.mbim.json', { type: 'application/json' });

    const { getByTestId } = render(<App />);
    const wallBtn = getByTestId('tool-wall-btn');
    const canvas2D = getByTestId('viewport-2d-canvas');

    // 1. Activer l'outil Mur et commencer un tracé
    act(() => {
      fireEvent.click(wallBtn);
    });

    act(() => {
      fireEvent.pointerDown(canvas2D, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(canvas2D, { clientX: 300, clientY: 100 });
    });

    // 2. Importer le fichier
    const fileInput = getByTestId('file-input');
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // 3. StatusBar indique 0 mur et la longueur de tracé est purgée
    await waitFor(() => {
      const statusBar = document.querySelector('footer');
      expect(statusBar?.textContent).toContain('Murs : 0');
      expect(statusBar?.textContent).not.toContain('Longueur :');
    });

    cleanup();
  });

  it('LE TEST DE CRÉDIBILITÉ DU BIM : MoveWallTool déplace le mur, la porte suit automatiquement avec offsetAlong inchangé', async () => {
    const doc = createDemoDocument();
    const createMeshSpy = vi.spyOn(Scene3DModule, 'createWallMeshWithOpenings');

    // Capture dynamique de l'instance View2D pour extraire sa matrice de transformation réelle (ADR-023)
    let capturedView2D: View2D | null = null;
    const origSetDocument = View2D.prototype.setDocument;
    vi.spyOn(View2D.prototype, 'setDocument').mockImplementation(function (this: View2D, document) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      capturedView2D = this;
      return origSetDocument.call(this, document);
    });

    const { getByTestId } = render(<App initialDoc={doc} />);
    expect(capturedView2D).not.toBeNull();
    if (!capturedView2D) throw new Error('View2D non initialisé');
    const transform = capturedView2D.getTransform();

    // 1. État initial : wall_south va de (0, 0) à (6000, 0), door_demo est à offsetAlong = 2000
    expect(doc.getState().walls['wall_south']?.start).toEqual({ x: 0, y: 0 });
    expect(doc.getState().doors?.['door_demo']?.offsetAlong).toBe(2000);

    // 2. Activer l'outil MoveWallTool depuis la Toolbar
    const moveWallBtn = getByTestId('tool-move-wall-btn');
    act(() => {
      fireEvent.click(moveWallBtn);
    });

    const statusInfo = getByTestId('status-tool-info');
    expect(statusInfo.textContent).toContain('Déplacer Mur (M)');

    // 3. Coordonnées calculées dynamiquement à partir de la transformation réelle (zéro valeur hardcodée)
    const wallCenterWorld = { x: (0 + 6000) / 2, y: 0 };
    const wallCenterScreen = transform.worldToScreen(wallCenterWorld);
    const deltaScreen = transform.worldDistanceToScreen(500); // 500 mm convertis en pixels écran réels

    // PointerDown sur le centre exact du mur calculé
    const canvas2D = getByTestId('viewport-2d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas2D, {
        clientX: wallCenterScreen.x,
        clientY: wallCenterScreen.y,
        button: 0,
      });
    });

    // 4. Drag de +500 mm en X calculé dynamiquement
    act(() => {
      fireEvent.pointerMove(canvas2D, {
        clientX: wallCenterScreen.x + deltaScreen,
        clientY: wallCenterScreen.y,
      });
    });

    // 5. PointerUp : validation de la translation
    act(() => {
      fireEvent.pointerUp(canvas2D, {
        clientX: wallCenterScreen.x + deltaScreen,
        clientY: wallCenterScreen.y,
        button: 0,
      });
    });

    // 6. ASSERTION 1 : Le mur a été déplacé dans le modèle de (500, 0)
    const movedWall = doc.getState().walls['wall_south'];
    expect(movedWall?.start).toEqual({ x: 500, y: 0 });
    expect(movedWall?.end).toEqual({ x: 6500, y: 0 });

    // 7. ASSERTION 2 : L'invariant BIM est strictement respecté : l'offsetAlong de la porte est INCHANGÉ
    const door = doc.getState().doors?.['door_demo'];
    expect(door).toBeDefined();
    expect(door?.offsetAlong).toBe(2000);

    // 8. ASSERTION 3 : createWallMeshWithOpenings a été ré-appelé avec le mur aux nouvelles coordonnées
    const lastCall = createMeshSpy.mock.calls.filter((c) => c[0].wall.id === 'wall_south').pop();
    expect(lastCall).toBeDefined();
    expect(lastCall?.[0].wall.start).toEqual({ x: 500, y: 0 });
    expect(lastCall?.[0].wall.end).toEqual({ x: 6500, y: 0 });
    expect(lastCall?.[0].openings[0]?.offsetAlong).toBe(2000);

    cleanup();
  });

  it('DoorTool place une 2ème porte sur le mur sud à l’offset cliqué réel (4520 mm -> snap 4500 mm)', async () => {
    const doc = createDemoDocument();
    let capturedView2D: View2D | null = null;
    const origSetDocument = View2D.prototype.setDocument;
    vi.spyOn(View2D.prototype, 'setDocument').mockImplementation(function (this: View2D, document) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      capturedView2D = this;
      return origSetDocument.call(this, document);
    });

    const { getByTestId } = render(<App initialDoc={doc} />);
    expect(capturedView2D).not.toBeNull();
    if (!capturedView2D) throw new Error('View2D non initialisé');
    const transform = capturedView2D.getTransform();

    // 1. Activer DoorTool
    const doorBtn = getByTestId('tool-door-btn');
    act(() => {
      fireEvent.click(doorBtn);
    });

    // 2. Clic à X = 4520 mm sur le mur sud (Y = 0) -> snap 50 mm -> 4500 mm
    const clickWorld = { x: 4520, y: 0 };
    const clickScreen = transform.worldToScreen(clickWorld);

    const canvas2D = getByTestId('viewport-2d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas2D, {
        clientX: clickScreen.x,
        clientY: clickScreen.y,
        button: 0,
      });
    });

    // 3. Vérification : 2 portes présentes, la 2ème est à l'offset cliqué exact 4500 mm
    const doors = Object.values(doc.getState().doors ?? {});
    expect(doors.length).toBe(2);
    const initialDoor = doors.find((d) => d.id === 'door_demo');
    const newDoor = doors.find((d) => d.id !== 'door_demo');

    expect(initialDoor?.offsetAlong).toBe(2000);
    expect(newDoor?.hostWallId).toBe('wall_south');
    expect(newDoor?.offsetAlong).toBe(4500); // 4520 mm snappé à 4500 mm

    cleanup();
  });

  it('Note 1 : DoorTool sur une zone occupée affiche une error-banner avec OPENING_OVERLAP', async () => {
    const doc = createDemoDocument();
    let capturedView2D: View2D | null = null;
    const origSetDocument = View2D.prototype.setDocument;
    vi.spyOn(View2D.prototype, 'setDocument').mockImplementation(function (this: View2D, document) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      capturedView2D = this;
      return origSetDocument.call(this, document);
    });

    const { getByTestId, queryByTestId } = render(<App initialDoc={doc} />);
    expect(capturedView2D).not.toBeNull();
    if (!capturedView2D) throw new Error('View2D non initialisé');
    const transform = capturedView2D.getTransform();

    // 1. Initialement, aucune bannière d'erreur
    expect(queryByTestId('error-banner')).toBeNull();

    // 2. Activer DoorTool
    const doorBtn = getByTestId('tool-door-btn');
    act(() => {
      fireEvent.click(doorBtn);
    });

    // 3. Clic à X = 2000 mm sur le mur sud (Y = 0) -> déjà occupé par door_demo
    const clickWorld = { x: 2000, y: 0 };
    const clickScreen = transform.worldToScreen(clickWorld);

    const canvas2D = getByTestId('viewport-2d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas2D, {
        clientX: clickScreen.x,
        clientY: clickScreen.y,
        button: 0,
      });
    });

    // 4. L'erreur métier OPENING_OVERLAP remonte jusqu'à l'UI via onErrorChange -> error-banner visible
    const banner = getByTestId('error-banner');
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain('OPENING_OVERLAP');

    // 5. Fermeture de la bannière via le bouton de fermeture
    const closeBtn = getByTestId('close-error-banner-btn');
    act(() => {
      fireEvent.click(closeBtn);
    });
    expect(queryByTestId('error-banner')).toBeNull();

    cleanup();
  });
});
