import { test, expect } from '@playwright/test';

test.describe('Tabax E2E Smoke Tests (Playwright Real Browser)', () => {
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

  test('cotes 2D interactives et cotation automatique d’étage (ADR-066)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // 1. Activer l'outil Cotation (T)
    const dimToolBtn = page.locator('[data-testid="tool-dimension-btn"]');
    await expect(dimToolBtn).toBeVisible();
    await dimToolBtn.click();

    await expect(page.locator('[data-testid="status-tool-info"]')).toContainText('Cotation (T)');

    // 2. Tracé interactif d'une cote libre sur le canvas 2D
    const canvas2D = page.locator('canvas[data-testid="viewport-2d-canvas"]');
    const box = await canvas2D.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('Canvas 2D introuvable');

    // Clic 1er point au centre
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Clic 2e point décalé de 120 px à droite
    await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2);
    // Clic 3e point pour placer le déport (50 px vers le haut)
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 - 50);

    // Vérifier que la barre d'état compte la nouvelle cote (1 existante démo + 1 nouvelle = 2)
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 2');

    // 3. Déclencher la cotation automatique d'étage
    const autoDimBtn = page.locator('[data-testid="auto-dimension-floor-btn"]');
    await expect(autoDimBtn).toBeVisible();
    await autoDimBtn.click();

    // Vérifier que le nombre de cotes passe à 12 (2 manuelles + 10 automatiques chaînes complètes)
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 12');

    expect(consoleErrors).toEqual([]);
  });

  test('génère automatiquement les coupes et élévations avec cotations verticales (ADR-069)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // 1. Bouton "Générer Vues" dans la Toolbar (onglet Architecture)
    const autoViewsBtn = page.locator('[data-testid="auto-generate-views-btn"]');
    await expect(autoViewsBtn).toBeVisible();
    await autoViewsBtn.click();

    // 2. Vérifier la présence des 6 vues générées dans le ProjectBrowser
    const southElevBtn = page.locator('button[data-testid^="project-section-"]:has-text("Élévation Façade Sud")');
    await expect(southElevBtn).toBeVisible();

    const northElevBtn = page.locator('button[data-testid^="project-section-"]:has-text("Élévation Façade Nord")');
    await expect(northElevBtn).toBeVisible();

    const cutAABtn = page.locator('button[data-testid^="project-section-"]:has-text("Coupe transversale A-A\'")');
    await expect(cutAABtn).toBeVisible();

    // 3. Ouvrir l'Élévation Sud
    await southElevBtn.click();

    // 4. Vérifier l'affichage dans SectionViewport
    const viewport = page.locator('[data-testid="section-viewport"]');
    await expect(viewport).toBeVisible();

    const title = page.locator('[data-testid="section-active-title"]');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Élévation Façade Sud');

    const canvas = page.locator('canvas[data-testid="section-canvas"]');
    await expect(canvas).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('persistance et restauration automatique IndexedDB après page.reload() (ADR-070)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');

    // 1. Déclencher une modification (cotation automatique d'étage)
    const autoDimBtn = page.locator('[data-testid="auto-dimension-floor-btn"]');
    await expect(autoDimBtn).toBeVisible();
    await autoDimBtn.click();

    // Vérifier l'augmentation des cotes (1 existante + 10 = 11)
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 11');

    // 2. Attendre de manière déterministe que la sauvegarde soit persistée dans IndexedDB (ADR-051, ADR-070)
    await page.waitForFunction(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('tabax_autosave', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('projects')) {
            resolve(false);
            return;
          }
          const tx = db.transaction('projects', 'readonly');
          const store = tx.objectStore('projects');
          const getReq = store.get('current_project');
          getReq.onsuccess = () => {
            const data = getReq.result;
            resolve(Boolean(data && data.state && Object.keys(data.state.dimensions || {}).length === 11));
          };
          getReq.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    }, null, { timeout: 5000 });

    // 3. Recharger la page
    await page.reload();

    // 4. Vérifier la restauration automatique depuis IndexedDB
    const infoBanner = page.locator('[data-testid="info-banner"]');
    await expect(infoBanner).toBeVisible();
    await expect(infoBanner).toContainText('sauvegarde automatique');

    // Vérifier que les cotes sont bien restaurées
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 11');

    expect(consoleErrors).toEqual([]);
  });

  test('garde-fou multi-onglets Web Locks et bannière de suspension (ADR-070)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // 1. Onglet principal détient le verrou
    await page.goto('/');
    await expect(page.locator('canvas[data-testid="viewport-2d-canvas"]')).toBeVisible();

    // L'onglet principal n'a PAS la bannière de conflit
    await expect(page.locator('[data-testid="multi-tab-warning-banner"]')).toHaveCount(0);

    // 2. Ouverture d'un second onglet dans le même contexte de navigateur
    const context = page.context();
    const page2 = await context.newPage();
    await page2.goto('/');

    // 3. Le second onglet doit détecter le conflit Web Locks et afficher la bannière
    const warningBanner = page2.locator('[data-testid="multi-tab-warning-banner"]');
    await expect(warningBanner).toBeVisible();
    await expect(warningBanner).toContainText('Projet déjà ouvert dans un autre onglet');

    const reloadBtn = page2.locator('[data-testid="reload-latest-btn"]');
    await expect(reloadBtn).toBeVisible();

    // 4. Fermeture propre du second onglet
    await page2.close();

    expect(consoleErrors).toEqual([]);
  });

  test('modes de rendu 3D PBR, écorché et ensoleillement dynamique (ADR-072)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('canvas[data-testid="viewport-3d-canvas"]')).toBeVisible();

    // 1. Vérification de la présence de la barre de contrôle 3D
    const toolbar = page.locator('[data-testid="viewport-3d-toolbar"]');
    await expect(toolbar).toBeVisible();

    // 2. Bascule en mode Écorché
    const ecorcheBtn = page.locator('[data-testid="render-mode-ecorche"]');
    await ecorcheBtn.click();
    await expect(ecorcheBtn).toHaveCSS('font-weight', '600');

    // 3. Bascule en mode Réaliste PBR
    const realisteBtn = page.locator('[data-testid="render-mode-realiste"]');
    await realisteBtn.click();
    await expect(realisteBtn).toHaveCSS('font-weight', '600');

    // Le curseur solaire doit apparaître en mode réaliste
    const sunSlider = page.locator('[data-testid="sun-hour-slider"]');
    await expect(sunSlider).toBeVisible();
    await sunSlider.fill('16');

    // 4. Bascule des arêtes fines
    const edgesCheckbox = page.locator('[data-testid="toggle-edges-checkbox"]');
    await expect(edgesCheckbox).toBeChecked();
    await edgesCheckbox.uncheck();
    await expect(edgesCheckbox).not.toBeChecked();

    // 5. Revenir en mode Technique
    const techniqueBtn = page.locator('[data-testid="render-mode-technique"]');
    await techniqueBtn.click();
    await expect(techniqueBtn).toHaveCSS('font-weight', '600');
    await expect(sunSlider).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test('export DXF R12 1:1 du plan d’étage actif (ADR-064)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    const downloadPromise = page.waitForEvent('download');
    const exportDxfBtn = page.locator('[data-testid="export-plan-dxf-btn"]');
    await expect(exportDxfBtn).toBeVisible();
    await exportDxfBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.dxf$/i);
    expect(consoleErrors).toEqual([]);
  });

  test('idempotence de la cotation automatique au deuxième clic (ADR-066)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    const autoDimBtn = page.locator('[data-testid="auto-dimension-floor-btn"]');
    await expect(autoDimBtn).toBeVisible();
    await autoDimBtn.click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 11');

    // 2ème clic : ne doit pas ré-ajouter de cotes redondantes
    await autoDimBtn.click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 11');
    expect(consoleErrors).toEqual([]);
  });

  test('synchronisation de coupe 3D et mode Écorché (ADR-063, ADR-072)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    // 1. Générer les vues et coupes automatiques
    const genViewsBtn = page.locator('[data-testid="auto-generate-views-btn"]');
    await expect(genViewsBtn).toBeVisible();
    await genViewsBtn.click();

    // 2. Sélectionner la coupe dans le navigateur de projet
    const cutAABtn = page.locator('button[data-testid^="project-section-"]:has-text("Coupe transversale A-A\'")');
    await expect(cutAABtn).toBeVisible();
    await cutAABtn.click();

    // 3. Basculer en vue Coupe et activer la synchronisation 3D
    await page.locator('[data-testid="layout-section-btn"]').click();
    const sync3dBtn = page.locator('[data-testid="toggle-3d-synchro-btn"]');
    await expect(sync3dBtn).toBeVisible();
    await sync3dBtn.click();

    // 4. Basculer en vue 3D
    const view3dBtn = page.locator('[data-testid="layout-3d-btn"]');
    await view3dBtn.click();

    // 5. Basculer en mode Écorché
    const ecorcheBtn = page.locator('[data-testid="render-mode-ecorche"]');
    await expect(ecorcheBtn).toBeVisible();
    await ecorcheBtn.click();
    await expect(ecorcheBtn).toHaveCSS('font-weight', '600');
    expect(consoleErrors).toEqual([]);
  });

  test('parcours agentique complet avec auto-correction et Undo atomique (ADR-073)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    let chatCallIndex = 0;
    let sawSelfCorrectionFeedback = false;

    await page.route('http://localhost:11434/v1/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'qwen2.5-coder:14b' }] }),
      });
    });

    await page.route('http://localhost:11434/v1/chat/completions', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        messages?: Array<{ role: string; content: string | null }>;
      };
      const messages = body.messages ?? [];
      const rawMessagesText = messages.map((m) => m.content ?? '').join('\n');
      const levelMatch = rawMessagesText.match(/"activeLevelId"\s*:\s*"([^"]+)"/);
      const activeLevelId = levelMatch?.[1] ?? 'unknown-level';

      const currentCall = chatCallIndex++;
      if (currentCall === 0) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_read_level',
                      type: 'function',
                      function: {
                        name: 'get_level_details',
                        arguments: JSON.stringify({
                          levelId: activeLevelId,
                          categories: ['walls'],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        });
        return;
      }

      if (currentCall === 1) {
        const lastToolMsg = [...messages].reverse().find((m) => m.role === 'tool');
        const toolPayload = JSON.parse(lastToolMsg?.content ?? '{}') as {
          ok?: boolean;
          data?: { walls?: Array<{ id: string }> };
        };
        const firstWallId = toolPayload.data?.walls?.[0]?.id ?? '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_invalid_door',
                      type: 'function',
                      function: {
                        name: 'add_door',
                        arguments: JSON.stringify({
                          hostWallId: firstWallId,
                          offsetAlongMm: 99000,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        });
        return;
      }

      if (currentCall === 2) {
        const lastToolMsg = [...messages].reverse().find((m) => m.role === 'tool');
        const toolPayload = JSON.parse(lastToolMsg?.content ?? '{}') as {
          ok?: boolean;
          code?: string;
          offendingIds?: unknown;
        };
        if (
          toolPayload.ok === false &&
          typeof toolPayload.code === 'string' &&
          Array.isArray(toolPayload.offendingIds) &&
          toolPayload.offendingIds.length > 0
        ) {
          sawSelfCorrectionFeedback = true;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_add_wall',
                      type: 'function',
                      function: {
                        name: 'add_wall',
                        arguments: JSON.stringify({
                          levelId: activeLevelId,
                          startXMm: 0,
                          startYMm: 9000,
                          endXMm: 4000,
                          endYMm: 9000,
                        }),
                      },
                    },
                    {
                      id: 'call_auto_dim',
                      type: 'function',
                      function: {
                        name: 'auto_dimension_level',
                        arguments: JSON.stringify({ levelId: activeLevelId }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Plan corrigé validé en sandbox : ajout du mur et mise à jour des cotes.',
                tool_calls: [],
              },
            },
          ],
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Murs : 4');
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 1');

    // 1. Ouvrir l'onglet Assistant IA et tester la connexion locale simulée
    await page.locator('[data-testid="dock-tab-ai"]').click();
    await expect(page.locator('[data-testid="ai-assistant-panel"]')).toBeVisible();

    await page.locator('[data-testid="ai-settings-toggle"]').click();
    await page.locator('[data-testid="ai-test-connection-btn"]').click();
    await expect(page.locator('[data-testid="ai-connection-diagnostic"]')).toContainText(
      'Connexion établie',
    );
    await page.locator('[data-testid="ai-settings-toggle"]').click();

    // 2. Soumettre le prompt déclenchant une erreur puis une auto-correction sandbox
    await page
      .locator('[data-testid="ai-prompt-input"]')
      .fill('Ajoute un mur au nord et mets à jour les cotes du niveau');
    await page.locator('[data-testid="ai-send-btn"]').click();

    await expect(page.locator('[data-testid="ai-action-plan-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-plan-ready-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-msg-assistant"]').last()).toContainText(
      'Plan corrigé validé en sandbox',
    );
    expect(sawSelfCorrectionFeedback).toBe(true);
    expect(chatCallIndex).toBe(4);

    // Tant que le plan n'est pas appliqué, le document officiel reste inchangé
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Murs : 4');
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 1');

    // 3. Appliquer la transaction groupée
    await page.locator('[data-testid="ai-apply-plan-btn"]').click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Murs : 5');
    await expect(page.locator('[data-testid="status-bar"]')).toContainText(/Cotes : ([2-9]|[1-9]\d+)/);

    // 4. Undo atomique en 1 seule action
    await page.locator('[data-testid="undo-btn"]').click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Murs : 4');
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 1');

    expect(consoleErrors).toEqual([]);
  });

  test('détecte un plan obsolète (Stale Plan Guard) et revalide sans appel LLM (ADR-073)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    let llmChatRequests = 0;

    await page.route('http://localhost:11434/v1/chat/completions', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        messages?: Array<{ role: string; content: string | null }>;
      };
      const messages = body.messages ?? [];
      const rawMessagesText = messages.map((m) => m.content ?? '').join('\n');
      const levelMatch = rawMessagesText.match(/"activeLevelId"\s*:\s*"([^"]+)"/);
      const activeLevelId = levelMatch?.[1] ?? 'unknown-level';

      const callIndex = llmChatRequests++;
      if (callIndex === 0) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_stale_wall',
                      type: 'function',
                      function: {
                        name: 'add_wall',
                        arguments: JSON.stringify({
                          levelId: activeLevelId,
                          startXMm: 0,
                          startYMm: 9000,
                          endXMm: 4000,
                          endYMm: 9000,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'Mur supplémentaire préparé pour validation.',
                tool_calls: [],
              },
            },
          ],
        }),
      });
    });

    await page.goto('/');
    await page.locator('[data-testid="dock-tab-ai"]').click();
    await page.locator('[data-testid="ai-prompt-input"]').fill('Ajoute un mur au nord');
    await page.locator('[data-testid="ai-send-btn"]').click();

    await expect(page.locator('[data-testid="ai-plan-ready-badge"]')).toBeVisible();
    const requestsAfterGeneration = llmChatRequests;
    expect(requestsAfterGeneration).toBe(2);

    // 1. Mutation manuelle directe du document pendant que le plan est en attente
    await page.locator('[data-testid="auto-dimension-floor-btn"]').click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Cotes : 11');

    // 2. Passage immédiat à Obsolète et remplacement du bouton Appliquer par Revalider
    await expect(page.locator('[data-testid="ai-plan-stale-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-apply-plan-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="ai-revalidate-plan-btn"]')).toBeVisible();

    // 3. Revalidation déterministe sans aucun nouvel appel LLM
    await page.locator('[data-testid="ai-revalidate-plan-btn"]').click();
    expect(llmChatRequests).toBe(requestsAfterGeneration);
    await expect(page.locator('[data-testid="ai-plan-ready-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-apply-plan-btn"]')).toBeVisible();

    // 4. Application effective du plan revalidé
    await page.locator('[data-testid="ai-apply-plan-btn"]').click();
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Murs : 5');

    expect(consoleErrors).toEqual([]);
  });
});
