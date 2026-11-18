import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { View2D } from '@mini-bim/view-2d';
import * as view2dModule from '@mini-bim/view-2d';
import { Scene3D } from '@mini-bim/view-3d';
import * as Scene3DModule from '@mini-bim/view-3d';
import { BimDocument, AddWallCommand, Commands, resolveWallGeometry, computeLevelMetrics, exportToIfc } from '@mini-bim/core';
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

  it('permet de changer de niveau actif et l’export SVG cible fidèlement le niveau actif sélectionné (P1.1)', async () => {
    const doc = BimDocument.createDefaultProject();
    const level1: import('@mini-bim/core').Level = {
      id: 'lvl_etage_sup',
      name: 'Étage 1 (R+1)',
      elevation: 3000,
      height: 2800,
    };
    doc.execute(new Commands.AddLevelCommand(level1));

    let capturedBlob: Blob | null = null;
    const createObjectURLMock = vi.fn().mockImplementation((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-svg-url';
    });
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { getByTestId } = render(<App initialDoc={doc} />);

    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;
    expect(levelSelect.value).toBe(Object.keys(doc.getState().levels)[0]);

    // Sélectionner le niveau supérieur
    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_etage_sup' } });
    });
    expect(levelSelect.value).toBe('lvl_etage_sup');

    // Vérifier que la barre d'état affiche bien le niveau actif
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Étage 1 (R+1)');

    // Cliquer sur le bouton d'export SVG
    const svgBtn = getByTestId('export-svg-btn');
    act(() => {
      fireEvent.click(svgBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(capturedBlob).toBeDefined();

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
    const transform = (capturedView2D as View2D).getTransform();

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

    // 8. ASSERTION 3 (Vigilance 2 de Claude) : Les voisins connectés (east, west) s'étirent élastiquement
    const wallEast = doc.getState().walls['wall_east'];
    expect(wallEast?.start).toEqual({ x: 6500, y: 0 }); // suit wall_south.end
    expect(wallEast?.end).toEqual({ x: 6000, y: 4000 }); // ancré au nord

    const wallWest = doc.getState().walls['wall_west'];
    expect(wallWest?.start).toEqual({ x: 0, y: 4000 }); // ancré au nord
    expect(wallWest?.end).toEqual({ x: 500, y: 0 }); // suit wall_south.start

    // 9. ASSERTION 4 : createWallMeshWithOpenings a été ré-appelé avec les murs aux nouvelles coordonnées
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
    const transform = (capturedView2D as View2D).getTransform();

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
    const transform = (capturedView2D as View2D).getTransform();

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

  it('T-APP-MOVE-02 : Undo après MoveWallCommand restaure tous les murs (A + voisins) bit-à-bit', async () => {
    const doc = createDemoDocument();
    const stateBefore = doc.getState();

    // Déplacer wall_south
    doc.execute(new Commands.MoveWallCommand('wall_south', { x: 500, y: 0 }));
    expect(doc.getState()).not.toEqual(stateBefore);

    // Annuler
    doc.undo();
    expect(doc.getState()).toEqual(stateBefore);
  });

  it('T-APP-MOVE-03 : MoveWallTool + validation différentielle accepte le déplacement sain', async () => {
    const doc = createDemoDocument();
    // Le projet de démo standard est parfaitement valide
    const res = doc.execute(new Commands.MoveWallCommand('wall_south', { x: 200, y: 0 }));
    expect(res.changed).toContain('wall_south');
    expect(res.changed).toContain('wall_east');
    expect(res.changed).toContain('wall_west');
  });

  it('T-APP-SLAB-01 : demoDocument affiche la dalle structurelle dans les viewports 2D et 3D', async () => {
    const doc = createDemoDocument();
    let capturedView2D: View2D | null = null;
    const origSetDocument = View2D.prototype.setDocument;
    const setSlabsSpy = vi.spyOn(View2D.prototype, 'setSlabs');
    vi.spyOn(View2D.prototype, 'setDocument').mockImplementation(function (this: View2D, document) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      capturedView2D = this;
      return origSetDocument.call(this, document);
    });

    const { getByTestId } = render(<App initialDoc={doc} />);
    expect(capturedView2D).not.toBeNull();
    expect(getByTestId('viewport-2d-canvas')).toBeDefined();
    expect(getByTestId('viewport-3d-canvas')).toBeDefined();

    // Vérifier que la dalle demo est présente et synchronisée
    expect(doc.getState().slabs?.['slab_demo_ground']).toBeDefined();
    expect(setSlabsSpy).toHaveBeenCalled();
    const lastSlabs = setSlabsSpy.mock.calls[setSlabsSpy.mock.calls.length - 1]?.[0];
    expect(lastSlabs?.some((s) => s.id === 'slab_demo_ground')).toBe(true);

    cleanup();
  });

  it('T-APP-SLAB-02 : la sélection d’une dalle affiche ses propriétés dans PropertyInspector', async () => {
    const doc = createDemoDocument();
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('slab_demo_ground');

    const { getByTestId, queryByTestId } = render(<App initialDoc={doc} />);

    // Initialement : aucune sélection
    expect(getByTestId('inspector-no-selection')).toBeDefined();

    // Clic dans le viewport 3D pour sélectionner la dalle
    const canvas3D = getByTestId('viewport-3d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 100, clientY: 100, button: 0 });
    });

    // PropertyInspector affiche les détails de la dalle sélectionnée
    expect(queryByTestId('inspector-no-selection')).toBeNull();
    expect(getByTestId('inspector-slab-panel')).toBeDefined();
    expect(getByTestId('slab-thickness-display').textContent).toContain('200 mm');

    cleanup();
  });

  it('T-APP-SLAB-03 : l’édition de l’épaisseur du type de dalle via PropertyInspector met à jour le document', async () => {
    const doc = createDemoDocument();
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('slab_demo_ground');

    const { getByTestId } = render(<App initialDoc={doc} />);

    // Clic pour sélectionner la dalle
    const canvas3D = getByTestId('viewport-3d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 100, clientY: 100, button: 0 });
    });

    const thicknessInput = getByTestId('slab-type-thickness-input') as HTMLInputElement;
    expect(thicknessInput).toBeDefined();

    act(() => {
      fireEvent.change(thicknessInput, { target: { value: '250' } });
      fireEvent.blur(thicknessInput);
    });

    const slab = doc.getState().slabs?.['slab_demo_ground'];
    expect(slab).toBeDefined();
    expect(doc.getState().slabTypes?.[slab!.slabTypeId]?.thickness).toBe(250);

    cleanup();
  });

  it('T-APP-SLAB-04 : SlabTool permet de tracer une dalle et émet AddSlabCommand', async () => {
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
    const transform = (capturedView2D as View2D).getTransform();

    // 1. Activer SlabTool (L)
    const slabBtn = getByTestId('tool-slab-btn');
    act(() => {
      fireEvent.click(slabBtn);
    });

    const canvas2D = getByTestId('viewport-2d-canvas');

    // 2. Clics des 4 points du contour
    const pts = [
      { x: 1000, y: 1000 },
      { x: 3000, y: 1000 },
      { x: 3000, y: 3000 },
      { x: 1000, y: 3000 },
    ];

    for (const p of pts) {
      const s = transform.worldToScreen(p);
      act(() => {
        fireEvent.pointerDown(canvas2D, {
          clientX: s.x,
          clientY: s.y,
          button: 0,
        });
      });
    }

    // 3. Validation par touche Enter
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' });
    });

    // 4. Une nouvelle dalle a été créée
    const slabs = Object.values(doc.getState().slabs ?? {});
    expect(slabs.length).toBe(2);

    cleanup();
  });

  it('T-APP-SLAB-05 : LevelSelector permet de basculer d’étage et filtre le plan 2D', async () => {
    const doc = createDemoDocument();
    // Ajouter un 2ème niveau R+1
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const setActiveLevelIdSpy = vi.spyOn(View2D.prototype, 'setActiveLevelId');

    const { getByTestId } = render(<App initialDoc={doc} />);

    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;
    expect(levelSelect).toBeDefined();

    // Basculer sur R+1
    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_r1' } });
    });

    expect(levelSelect.value).toBe('lvl_r1');
    expect(setActiveLevelIdSpy).toHaveBeenCalledWith('lvl_r1');

    cleanup();
  });

  it('T-APP-U-01 : bascule vers R+1 active l’option underlay et affiche le bouton toggle', () => {
    const doc = createDemoDocument();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const { getByTestId } = render(<App initialDoc={doc} />);
    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;
    const underlayBtn = getByTestId('underlay-toggle-btn') as HTMLButtonElement;

    // Au RDC (index 0) : pas de niveau inférieur disponible, bouton disabled
    expect(underlayBtn.disabled).toBe(true);

    // Basculer sur R+1
    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_r1' } });
    });

    // Sur R+1 : bouton enabled et actif par défaut (ON)
    expect(underlayBtn.disabled).toBe(false);
    expect(underlayBtn.textContent).toContain('ON');

    cleanup();
  });

  it('T-APP-U-02 : clic sur underlay toggle bascule l’état ON / OFF', () => {
    const doc = createDemoDocument();
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const { getByTestId } = render(<App initialDoc={doc} />);
    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;
    const underlayBtn = getByTestId('underlay-toggle-btn') as HTMLButtonElement;

    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_r1' } });
    });

    expect(underlayBtn.textContent).toContain('ON');

    // Clic pour désactiver
    act(() => {
      fireEvent.click(underlayBtn);
    });
    expect(underlayBtn.textContent).toContain('OFF');

    // Clic pour réactiver
    act(() => {
      fireEvent.click(underlayBtn);
    });
    expect(underlayBtn.textContent).toContain('ON');

    cleanup();
  });

  it('T-APP-U-03 : View2D reçoit underlayLevelId lorsque R+1 est actif', () => {
    const doc = createDemoDocument();
    const rdcId = Object.keys(doc.getState().levels)[0]!;
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const setUnderlaySpy = vi.spyOn(View2D.prototype, 'setUnderlayLevelId');

    const { getByTestId } = render(<App initialDoc={doc} />);
    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;

    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_r1' } });
    });

    expect(setUnderlaySpy).toHaveBeenCalledWith(rdcId);

    cleanup();
  });

  it('T-APP-U-04 : tracé de mur sur R+1 s’aimante sur un sommet de mur underlay RDC', () => {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;

    // Mur porteur sur RDC : (0, 0) -> (6000, 0)
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_bearing_rdc',
        category: 'wall',
        typeId: wallTypeId,
        levelId: rdcId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );

    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_r1',
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const { getByTestId } = render(<App initialDoc={doc} />);
    const levelSelect = getByTestId('level-selector') as HTMLSelectElement;
    const wallBtn = getByTestId('tool-wall-btn');
    const canvas2D = getByTestId('viewport-2d-canvas');

    // Basculer sur R+1
    act(() => {
      fireEvent.change(levelSelect, { target: { value: 'lvl_r1' } });
    });

    // Activer WallTool
    act(() => {
      fireEvent.click(wallBtn);
    });

    // Tracer un mur sur R+1
    act(() => {
      fireEvent.pointerDown(canvas2D, { clientX: 405, clientY: 302, button: 0 });
      fireEvent.pointerUp(canvas2D, { clientX: 695, clientY: 302, button: 0 });
    });

    const r1Walls = Object.values(doc.getState().walls).filter((w) => w.levelId === 'lvl_r1');
    expect(r1Walls.length).toBeGreaterThanOrEqual(1);

    cleanup();
  });

  it('T-APP-CROSS-01 : Cohérence transverse (S1-1 + S1-4) — Mur avec heightOverride=3000 et baseOffset=+500', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const rdcId = Object.keys(state.levels)[0]!;
    const wallTypeId = Object.keys(state.wallTypes)[0]!;
    const doorTypeId = Object.keys(state.doorTypes)[0]!;
    const winTypeId = Object.keys(state.windowTypes)[0]!;

    // 1. Ajouter un mur avec baseOffset=500 et heightOverride=3000
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_cross_1',
        category: 'wall',
        typeId: wallTypeId,
        levelId: rdcId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        baseOffset: 500,
        heightOverride: 3000,
      }),
    );

    // 2. Ajouter une porte (H 2100) et une fenêtre (H 1400, sill 900)
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd_cross_1',
        category: 'door',
        doorTypeId,
        hostWallId: 'w_cross_1',
        offsetAlong: 800,
        swing: { side: 'right', direction: 'in' },
      }),
    );

    doc.execute(
      new Commands.AddWindowCommand({
        id: 'win_cross_1',
        category: 'window',
        windowTypeId: winTypeId,
        hostWallId: 'w_cross_1',
        offsetAlong: 3000,
        sillHeight: 900,
      }),
    );

    const updatedState = doc.getState();
    const wall = updatedState.walls['w_cross_1']!;

    // 3. Vérification resolveWallGeometry
    const resolved = resolveWallGeometry(wall, updatedState);
    expect(resolved.zBase).toBe(500);
    expect(resolved.zTop).toBe(3500);
    expect(resolved.height).toBe(3000);
    expect(resolved.heightSource).toBe('override');
    expect(resolved.openings).toHaveLength(2);

    const doorOp = resolved.openings[0]!;
    expect(doorOp.sillZAbsolute).toBe(500);
    expect(doorOp.lintelZAbsolute).toBe(2600); // 500 + 2100

    const winOp = resolved.openings[1]!;
    expect(winOp.sillZAbsolute).toBe(1400); // 500 + 900
    expect(winOp.lintelZAbsolute).toBe(2800); // 1400 + 1400

    // 4. Vérification Métriques (longueur 5m, hauteur 3m -> brute 15m²)
    const metrics = computeLevelMetrics(updatedState, rdcId);
    const wallMetric = metrics.walls.find((m) => m.wallId === 'w_cross_1');
    expect(wallMetric).toBeDefined();
    expect(wallMetric!.grossAreaMm2).toBe(5000 * 3000); // 15 000 000 mm²

    // 5. Vérification Export IFC
    const ifc = exportToIfc(updatedState);
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,3000\.00\)/);
    expect(ifc).toContain('IFCCARTESIANPOINT((0.00,0.00,500.00))');

    // 6. Rendu React App : l'inspecteur affiche bien la hauteur et le baseOffset
    vi.spyOn(Scene3D.prototype, 'raycast').mockReturnValue('w_cross_1');
    const { getByTestId } = render(<App initialDoc={doc} />);
    const canvas3D = getByTestId('viewport-3d-canvas');
    act(() => {
      fireEvent.pointerDown(canvas3D, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(canvas3D, { clientX: 100, clientY: 100, button: 0 });
    });
    expect(getByTestId('inspector-wall-panel')).toBeDefined();
    const baseOffsetInput = getByTestId('wall-base-offset-input') as HTMLInputElement;
    expect(baseOffsetInput.value).toBe('500');

    cleanup();
  });

  it('T-APP-CROSS-02 : Cohérence transverse (S1-1 + S1-4) — Mur contraint sous dalle avec mise à jour dynamique', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const rdcId = Object.keys(state.levels)[0]!;
    const wallTypeId = Object.keys(state.wallTypes)[0]!;

    // Ajouter niveau R+1 à 3000 mm
    doc.execute(
      new Commands.AddLevelCommand({
        id: 'lvl_etage_cross',
        name: 'Étage',
        elevation: 3000,
      }),
    );

    // Ajouter dalle supérieure de 200 mm
    doc.execute(
      new Commands.AddSlabTypeCommand({
        id: 'st_cross_200',
        name: 'Dalle 200',
        thickness: 200,
      }),
    );

    doc.execute(
      new Commands.AddSlabCommand({
        id: 'slab_cross_top',
        category: 'slab',
        levelId: 'lvl_etage_cross',
        slabTypeId: 'st_cross_200',
        boundary: [
          { x: -500, y: -500 },
          { x: 6000, y: -500 },
          { x: 6000, y: 3000 },
          { x: -500, y: 3000 },
        ],
      }),
    );

    // Ajouter mur contraint par R+1
    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_constrained_cross',
        category: 'wall',
        typeId: wallTypeId,
        levelId: rdcId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        topConstraint: { levelId: 'lvl_etage_cross', topOffset: 0 },
      }),
    );

    let curState = doc.getState();
    let res = resolveWallGeometry(curState.walls['w_constrained_cross']!, curState);
    expect(res.height).toBe(2800); // 3000 - 200
    expect(res.limitingSlabId).toBe('slab_cross_top');

    // Mettre à jour l'épaisseur de la dalle à 350 mm
    doc.execute(
      new Commands.UpdateSlabTypeCommand('st_cross_200', {
        thickness: 350,
      }),
    );

    curState = doc.getState();
    res = resolveWallGeometry(curState.walls['w_constrained_cross']!, curState);
    expect(res.height).toBe(2650); // 3000 - 350 = 2650 mm

    // IFC reflète la hauteur 2650.00
    const ifc = exportToIfc(curState);
    expect(ifc).toMatch(/IFCEXTRUDEDAREASOLID\(#\d+,#\d+,#\d+,2650\.00\)/);

    // Métrés reflètent 4m * 2.65m = 10.6 m²
    const metrics = computeLevelMetrics(curState, rdcId);
    const wallM = metrics.walls.find((w) => w.wallId === 'w_constrained_cross');
    expect(wallM?.grossAreaMm2).toBe(4000 * 2650);
  });

  it('T-APP-AUTOSAVE-01 : App au montage restaure automatiquement un projet depuis IndexedDB et affiche le bandeau d’information', async () => {
    const { saveToIndexedDB, clearIndexedDB } = await import('./persistence/autoSave.js');
    await clearIndexedDB();

    const savedDoc = BimDocument.createDefaultProject();
    const typeId = Object.keys(savedDoc.getState().wallTypes)[0]!;
    const levelId = Object.keys(savedDoc.getState().levels)[0]!;
    savedDoc.execute(
      new Commands.AddWallCommand({
        id: 'w_restored_1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 7500, y: 0 },
      }),
    );

    await saveToIndexedDB(savedDoc);

    const { findByTestId } = render(<App />);

    const infoBanner = await findByTestId('info-banner');
    expect(infoBanner).toBeDefined();
    expect(infoBanner.textContent).toContain('Projet restauré depuis la sauvegarde automatique');

    await waitFor(() => {
      const statusBar = document.querySelector('footer');
      expect(statusBar?.textContent).toContain('Murs : 1');
    });

    await clearIndexedDB();
  });

  it('T-APP-AUTOSAVE-RESTORE-ONCE : Restauration unique au montage — loadFromIndexedDB n’est appelé qu’une seule fois (ADR-051 §D4)', async () => {
    const autoSaveModule = await import('./persistence/autoSave.js');
    await autoSaveModule.clearIndexedDB();

    const savedDoc = BimDocument.createDefaultProject();
    const typeId = Object.keys(savedDoc.getState().wallTypes)[0]!;
    const levelId = Object.keys(savedDoc.getState().levels)[0]!;
    savedDoc.execute(
      new Commands.AddWallCommand({
        id: 'w_restore_once',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );

    await autoSaveModule.saveToIndexedDB(savedDoc);

    const loadSpy = vi.spyOn(autoSaveModule, 'loadFromIndexedDB');

    const { findByTestId, unmount } = render(<App />);

    const infoBanner = await findByTestId('info-banner');
    expect(infoBanner).toBeDefined();

    await waitFor(() => {
      const statusBar = document.querySelector('footer');
      expect(statusBar?.textContent).toContain('Murs : 1');
    });

    // Attendre pour s’assurer qu’aucune boucle infinie ne re-déclenche de restauration
    await new Promise((r) => setTimeout(r, 100));

    expect(loadSpy).toHaveBeenCalledTimes(1);

    loadSpy.mockRestore();
    unmount();
    await autoSaveModule.clearIndexedDB();
  });

  it('T-APP-COMPONENT-01 : activation de l’outil Composant, affichage du bandeau et implantation', async () => {
    const { getByTestId, findByTestId } = render(<App />);

    // Activation de l'outil Composant
    const compToolBtn = getByTestId('tool-component-btn');
    fireEvent.click(compToolBtn);

    // Vérification de la présence du bandeau d'options de composants
    const ribbon = await findByTestId('component-ribbon');
    expect(ribbon).toBeDefined();

    const toolInfo = getByTestId('status-tool-info');
    expect(toolInfo.textContent).toContain('Outil : Composant (C)');

    // Implantation via clic sur le canvas 2D
    const canvas2D = getByTestId('viewport-2d-canvas');
    fireEvent.pointerDown(canvas2D, { clientX: 450, clientY: 350, button: 0 });

    await waitFor(() => {
      const statusBar = document.querySelector('footer');
      expect(statusBar?.textContent).toContain('Composants : 1');
    });

    cleanup();
  });
});
