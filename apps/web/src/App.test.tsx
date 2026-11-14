import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { View2D } from '@mini-bim/view-2d';
import * as view2dModule from '@mini-bim/view-2d';
import { Scene3D } from '@mini-bim/view-3d';
import { BimDocument, AddWallCommand } from '@mini-bim/core';
import { App } from './App.js';
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

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

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

  it('affiche un bandeau d’erreur lors d’un import JSON corrompu sans altérer le document existant', async () => {
    const corruptedFile = new File(['{ "bad": "content" ...'], 'invalid.json', {
      type: 'application/json',
    });

    const { getByTestId, queryByTestId } = render(<App />);
    const statusBar = document.querySelector('footer');
    expect(statusBar?.textContent).toContain('Murs : 4');

    expect(queryByTestId('error-banner')).toBeNull();

    const fileInput = getByTestId('file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [corruptedFile] } });
    });

    await waitFor(() => {
      const banner = getByTestId('error-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('INVALID_JSON');
    });

    // Le document existant est intact (4 murs)
    expect(statusBar?.textContent).toContain('Murs : 4');

    // Fermeture du bandeau
    const closeBtn = getByTestId('close-error-banner-btn');
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(queryByTestId('error-banner')).toBeNull();

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
});
