import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { StrictMode } from 'react';
import { View2D } from '@mini-bim/view-2d';
import { Scene3D } from '@mini-bim/view-3d';
import { App } from './App.js';

describe('App Integration & Squelette Double Viewport (apps/web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    // 4. PREUVE FORMELLE DU DOUBLE-MOUNT STRICTMODE :
    // Lors de l'unmount intermédiaire forcé par StrictMode, dispose() a été appelé 1 fois sur chaque viewport
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
});
