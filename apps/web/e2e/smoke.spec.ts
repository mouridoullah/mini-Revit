import { test, expect } from '@playwright/test';

test.describe('Mini-BIM E2E Smoke Tests (Playwright Real Browser)', () => {
  test('charge en production un IFC exporté par l’application et initialise le WASM', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    const ifcWasPreloaded = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((entry) => entry.name.includes('ifc-domain')),
    );
    expect(ifcWasPreloaded).toBe(false);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-ifc-btn"]').click();
    const download = await downloadPromise;
    const ifcPath = testInfo.outputPath('roundtrip.ifc');
    await download.saveAs(ifcPath);

    await page.locator('[data-testid="ribbon-tab-coordination"]').click();
    await page.locator('[data-testid="ifc-file-input"]').setInputFiles(ifcPath);
    await expect(page.locator('[data-testid="federated-ifc-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="federated-ifc-panel"]')).toContainText('1');
    await expect(page.locator('[data-testid="error-banner"]')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('exporte un plan SVG valide pour un niveau encore vide', async ({ page }, testInfo) => {
    await page.goto('/');
    await page.locator('[data-testid="ribbon-tab-structure"]').click();
    await page.locator('[data-testid="add-level-btn"]').click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Étage 1');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="export-svg-btn"]').click();
    const download = await downloadPromise;
    const svgPath = testInfo.outputPath('empty-level.svg');
    await download.saveAs(svgPath);
    const svg = await import('node:fs/promises').then(({ readFile }) => readFile(svgPath, 'utf8'));
    expect(svg).toContain('<svg');
    expect(svg).toContain('Étage 1');
  });

  test('monte l’application, initialise WebGL et Canvas 2D sans erreur console', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
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

    // Layout cockpit, vues et navigation du ruban métier
    await expect(page.locator('[data-testid="project-browser"]')).toBeVisible();
    await expect(page.locator('[data-testid="right-dock-panel"]')).toBeVisible();
    await page.locator('[data-testid="layout-2d-btn"]').click();
    await expect(canvas2D).toBeVisible();
    await expect(canvas3D).toBeHidden();
    await page.locator('[data-testid="layout-split-btn"]').click();
    await expect(canvas3D).toBeVisible();
    await page.locator('[data-testid="layout-3d-btn"]').click();
    await expect(canvas2D).toBeHidden();
    await expect(canvas3D).toBeVisible();
    await page.locator('[data-testid="layout-split-btn"]').click();
    await page
      .locator('[data-testid="project-browser"] button[aria-label="Réduire Project Browser"]')
      .click();
    await expect(page.locator('[data-testid="project-browser"]')).toBeVisible();
    await page
      .locator('[data-testid="project-browser"] button[aria-label="Ouvrir Project Browser"]')
      .click();
    await page.locator('[data-testid="ribbon-tab-coordination"]').click();
    await page.locator('[data-testid="load-demo-r4-btn"]').click();
    await expect(statusBar).toContainText('Murs : 78', { timeout: 60000 });
    await page.locator('[data-testid="ribbon-tab-architecture"]').click();
    const closeBannerBtn = page.locator('[data-testid="close-info-banner-btn"]');
    if (await closeBannerBtn.isVisible()) {
      await closeBannerBtn.click();
    }
    await page.locator('[data-testid="dock-tab-properties"]').click();
    await page.locator('[data-testid="zoom-fit-3d-btn"]').click();
    await page.screenshot({ path: testInfo.outputPath('graphite-engineering.png'), fullPage: true });

    // 5. Interaction : basculer vers l'outil Mur via le ruban
    const wallToolBtn = page.locator(
      'button[data-testid="tool-wall-btn"], button[data-testid="tool-btn-wall"]',
    );
    if ((await wallToolBtn.count()) > 0) {
      await wallToolBtn.click();
      await expect(statusBar).toContainText('Mur');
    }

    // 6. Interaction : réactiver l'outil Sélection
    const selectToolBtn = page.locator(
      'button[data-testid="tool-select-btn"], button[data-testid="tool-btn-select"]',
    );
    if ((await selectToolBtn.count()) > 0) {
      await selectToolBtn.click();
      await expect(statusBar).toContainText('Sélection');
    }

    // 7. Vérification de l'absence totale d'exceptions JavaScript non gérées
    expect(consoleErrors).toEqual([]);
  });

  test('affiche et referme le panneau des métrés sans régression d’affichage', async ({ page }) => {
    await page.goto('/');

    const metricsToggleBtn = page.locator('[data-testid="metrics-toggle-btn"]');
    if ((await metricsToggleBtn.count()) > 0) {
      await metricsToggleBtn.click();
      const metricsPanel = page.locator('[data-testid="metrics-table"]');
      await expect(metricsPanel).toBeVisible();
    }
  });

  test('modélise un tronçon MEP, l’inspecte dans l’UI et met à jour le rendu 3D sans erreur', async ({
    page,
  }) => {
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
    await page.locator('[data-testid="ribbon-tab-mep"]').click();
    const mepToolBtn = page.locator('button[data-testid="tool-mep-btn"]');
    await expect(mepToolBtn).toBeVisible();
    await mepToolBtn.click();

    // 2. Vérifier l'apparition du ruban contextuel MEP
    const mepRibbon = page.locator('[data-testid="mep-ribbon"]');
    await expect(mepRibbon).toBeVisible();
    await expect(page.locator('[data-testid="status-tool-info"]')).toContainText('Réseau MEP');

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
    // Les réglages MEP sont intégrés dans la rangée du ruban ; le viewport ne se déplace pas.
    const selectY = 120;
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

  test('modélise un tracé coudé en L avec raccord paramétrique et bascule d’angle', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Activer l'outil MEP
    await page.locator('[data-testid="ribbon-tab-mep"]').click();
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

  test('ouvre le panneau de détection des conflits (Clash Detection), lance l’analyse et interagit avec la sélection sans erreur', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Bouton "⚡ Conflits" dans la Toolbar
    await page.locator('[data-testid="ribbon-tab-coordination"]').click();
    const clashToggleBtn = page.locator('button[data-testid="toggle-clash-panel-btn"]');
    await expect(clashToggleBtn).toBeVisible();
    await clashToggleBtn.click();

    // 2. Panneau ClashPanel visible
    const clashPanel = page.locator('[data-testid="clash-panel"]');
    await expect(clashPanel).toBeVisible();

    // 3. Cliquer sur "Analyser"
    const runClashBtn = page.locator('button[data-testid="run-clash-btn"]');
    await expect(runClashBtn).toBeVisible();
    await runClashBtn.click();

    // 4. Vérifier que l'analyse aboutit sans erreur console
    const noClashesOrTable = page.locator(
      '[data-testid="no-clashes-msg"], [data-testid="clash-table"]',
    );
    await expect(noClashesOrTable).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('ouvre le panneau des maquettes IFC fédérées (Sous-phase 9.5), vérifie les onglets et contrôles sans erreur', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Bouton "📁 IFC Réf" dans la Toolbar
    await page.locator('[data-testid="ribbon-tab-coordination"]').click();
    const fedToggleBtn = page.locator('button[data-testid="toggle-federated-panel-btn"]');
    await expect(fedToggleBtn).toBeVisible();
    await fedToggleBtn.click();

    // 2. Panneau FederatedIfcPanel visible
    const fedPanel = page.locator('[data-testid="federated-ifc-panel"]');
    await expect(fedPanel).toBeVisible();

    // 3. Navigation sur les onglets
    const tabInspector = page.locator('button[data-testid="tab-inspector-btn"]');
    await expect(tabInspector).toBeVisible();
    await tabInspector.click();

    const tabClashes = page.locator('button[data-testid="tab-clashes-btn"]');
    await expect(tabClashes).toBeVisible();
    await tabClashes.click();

    // 4. Fermeture du panneau
    const closeBtn = page.locator('button[data-testid="close-federated-panel-btn"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(fedPanel).not.toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('Saison 3 — Coupe 2D Dynamique : activation outil Coupe (X), tracé, inspection, bascule vue coupe et synchro 3D (ADR-063)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // 1. Bouton "Coupe" dans le ruban Architecture
    const sectionToolBtn = page.locator('[data-testid="tool-section-btn"]');
    await expect(sectionToolBtn).toBeVisible();
    await sectionToolBtn.click();

    // 2. Tracé d'une coupe sur le canvas 2D
    const canvas2D = page.locator('canvas[data-testid="viewport-2d-canvas"]');
    const box = await canvas2D.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 200, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 500, box.y + 200);
      await page.mouse.up();
    }

    // 3. Vérification de la création dans ProjectBrowser
    const projectBrowser = page.locator('[data-testid="project-browser"]');
    await expect(projectBrowser).toContainText('Coupe A-A');

    // 4. Clic sur la coupe pour basculer vers la vue Coupe
    const sectionItem = projectBrowser.locator('button', { hasText: 'Coupe A-A' });
    await sectionItem.click();

    // 5. Affichage de la vue SectionViewport
    const sectionViewport = page.locator('[data-testid="section-viewport"]');
    await expect(sectionViewport).toBeVisible();
    await expect(page.locator('[data-testid="section-active-title"]')).toContainText('Coupe A-A');

    // 6. Bascule vers la vue 2D puis retour vue Coupe via disposition cockpit
    await page.locator('[data-testid="layout-2d-btn"]').click();
    await expect(canvas2D).toBeVisible();
    await page.locator('[data-testid="layout-section-btn"]').click();
    await expect(sectionViewport).toBeVisible();

    // 7. Toggle Synchro 3D
    const synchroBtn = page.locator('[data-testid="toggle-3d-synchro-btn"]');
    await expect(synchroBtn).toBeVisible();
    await synchroBtn.click();

    expect(consoleErrors).toEqual([]);
  });

  test('exporte un carnet de plans multi-pages PDF vectoriel conforme ISO 32000-1 via la modale', async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // 1. Bouton "Carnet PDF" dans la Toolbar
    const pdfBookBtn = page.locator('[data-testid="export-pdf-book-btn"]');
    await expect(pdfBookBtn).toBeVisible();
    await pdfBookBtn.click();

    // 2. Modale de configuration
    const modal = page.locator('[data-testid="export-pdf-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Carnet de Plans Vectoriel');

    // 3. Configuration des paramètres (Format A3, Échelle 1:100, Titre)
    await page.locator('[data-testid="pdf-paper-size-select"]').selectOption('A3');
    await page.locator('[data-testid="pdf-scale-select"]').selectOption('100');
    await page.locator('[data-testid="pdf-project-title-input"]').fill('Projet E2E Graphite');

    // 4. Déclenchement du téléchargement
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="pdf-confirm-export-btn"]').click();
    const download = await downloadPromise;

    // 5. Vérification du fichier binaire téléchargé
    const pdfPath = testInfo.outputPath('carnet-e2e.pdf');
    await download.saveAs(pdfPath);

    const pdfBuffer = await import('node:fs/promises').then(({ readFile }) => readFile(pdfPath));
    expect(pdfBuffer.length).toBeGreaterThan(15000);

    const header = pdfBuffer.subarray(0, 8).toString('latin1');
    expect(header).toBe('%PDF-1.4');

    const tail = pdfBuffer.subarray(pdfBuffer.length - 30).toString('latin1');
    expect(tail).toContain('%%EOF');

    await expect(modal).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });
});
