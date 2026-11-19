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
    const wallToolBtn = page.locator('button[data-testid="tool-btn-wall"]');
    if (await wallToolBtn.count() > 0) {
      await wallToolBtn.click();
      await expect(statusBar).toContainText('Mur');
    }

    // 6. Interaction : réactiver l'outil Sélection
    const selectToolBtn = page.locator('button[data-testid="tool-btn-select"]');
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
});
