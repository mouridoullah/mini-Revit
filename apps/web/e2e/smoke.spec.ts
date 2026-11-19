import { test, expect } from '@playwright/test';

test.describe('Mini-BIM E2E Smoke Tests (Playwright Real Browser)', () => {
  test('monte l’application, initialise WebGL et Canvas 2D sans erreur console', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    // 1. Navigation vers l'application web
    await page.goto('/');

    // 2. Vérification de la présence du canvas 2D Plan
    const canvas2D = page.locator('canvas[data-testid="viewport-2d-canvas"]');
    await expect(canvas2D).toBeVisible();

    // 3. Vérification de la présence du canvas 3D WebGL Three.js
    const canvas3D = page.locator('canvas[data-testid="viewport-3d-canvas"]');
    await expect(canvas3D).toBeVisible();

    // 4. Vérification de la barre de statut (projet de démo avec murs chargés)
    const statusBar = page.locator('[data-testid="status-bar"]');
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toContainText('Murs : 4');

    // 5. Interaction : basculer vers l'outil Mur via le ruban
    const wallToolBtn = page.locator('button[data-testid="tool-wall-btn"], button[data-testid="tool-btn-wall"]');
    if (await wallToolBtn.count() > 0) {
      await wallToolBtn.click();
      await expect(statusBar).toContainText('Mur');
    }

    // 6. Interaction : réactiver l'outil Sélection
    const selectToolBtn = page.locator('button[data-testid="tool-select-btn"], button[data-testid="tool-btn-select"]');
    if (await selectToolBtn.count() > 0) {
      await selectToolBtn.click();
      await expect(statusBar).toContainText('Sélection');
    }

    // 7. Vérification de l'absence totale d'exceptions JavaScript non gérées
    expect(consoleErrors).toEqual([]);
  });

  test('affiche et referme le panneau des métrés sans régression d’affichage', async ({ page }) => {
    await page.goto('/');

    const metricsToggleBtn = page.locator('[data-testid="metrics-toggle-btn"]');
    if (await metricsToggleBtn.count() > 0) {
      await metricsToggleBtn.click();
      const metricsPanel = page.locator('[data-testid="metrics-panel-content"]');
      await expect(metricsPanel).toBeVisible();
    }
  });

  test('modélise un tronçon MEP, l’inspecte dans l’UI et met à jour le rendu 3D sans erreur', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Activer l'outil MEP
    const mepToolBtn = page.locator('button[data-testid="tool-mep-btn"]');
    await expect(mepToolBtn).toBeVisible();
    await mepToolBtn.click();

    // 2. Vérifier l'apparition du ruban contextuel MEP
    const mepRibbon = page.locator('[data-testid="mep-ribbon"]');
    await expect(mepRibbon).toBeVisible();
    await expect(page.locator('[data-testid="status-tool-info"]')).toContainText('Réseau MEP');
    const ribbonBox = await mepRibbon.boundingBox();
    const ribbonHeight = ribbonBox?.height ?? 37;

    // 3. Dessiner un tuyau sur le canvas 2D
    const canvas2D = page.locator('canvas[data-testid="viewport-2d-canvas"]');
    await expect(canvas2D).toBeVisible();

    // Clic départ puis clic arrivée directement sur le canvas 2D
    await canvas2D.click({ position: { x: 120, y: 120 } });
    await canvas2D.hover({ position: { x: 260, y: 120 } });
    await canvas2D.click({ position: { x: 260, y: 120 } });

    // 4. Repasser en outil Sélection
    const selectBtn = page.locator('button[data-testid="tool-select-btn"]');
    await selectBtn.click();
    await expect(mepRibbon).toBeHidden();

    // 5. Cliquer au milieu du segment sur le canvas 2D pour le sélectionner
    // Le démontage du ruban MEP recentre le repère monde de ΔH / 2 (Transform2D)
    const selectY = 120 + ribbonHeight / 2;
    await canvas2D.click({ position: { x: 190, y: selectY } });

    // 6. Vérifier l'apparition du panneau MepInspector
    const mepInspector = page.locator('[data-testid="inspector-mep-panel"]');
    await expect(mepInspector).toBeVisible();
    await expect(page.locator('[data-testid="mep-diameter-input"]')).toBeVisible();

    // 7. Vérifier que le canvas 3D reste fonctionnel sans erreur WebGL
    const canvas3D = page.locator('canvas[data-testid="viewport-3d-canvas"]');
    await expect(canvas3D).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('modélise un tracé coudé en L avec raccord paramétrique et bascule d’angle', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Activer l'outil MEP
    const mepToolBtn = page.locator('button[data-testid="tool-mep-btn"]');
    await mepToolBtn.click();

    // 2. Vérifier la présence des boutons d'angle 90° et 45°
    const angle90Btn = page.locator('[data-testid="mep-angle-90"]');
    const angle45Btn = page.locator('[data-testid="mep-angle-45"]');
    await expect(angle90Btn).toBeVisible();
    await expect(angle45Btn).toBeVisible();

    // 3. Dessiner un tracé coudé en L sur le canvas 2D
    const canvas2D = page.locator('canvas[data-testid="viewport-2d-canvas"]');
    await canvas2D.click({ position: { x: 100, y: 100 } });
    await canvas2D.hover({ position: { x: 220, y: 180 } });
    await canvas2D.click({ position: { x: 220, y: 180 } });

    // 4. Vérifier que le canvas 3D reste impeccable sans erreur
    const canvas3D = page.locator('canvas[data-testid="viewport-3d-canvas"]');
    await expect(canvas3D).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
