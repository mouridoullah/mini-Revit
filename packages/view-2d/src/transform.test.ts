import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';

describe('Transform2D (transform.ts)', () => {
  it('initialise avec les valeurs par défaut ou les options fournies', () => {
    const tDefault = new Transform2D();
    expect(tDefault.origin).toEqual({ x: 0, y: 0 });
    expect(tDefault.scale).toBe(0.05);
    expect(tDefault.viewportWidth).toBe(800);
    expect(tDefault.viewportHeight).toBe(600);

    const tCustom = new Transform2D({
      origin: vec2(1000, 2000),
      scale: 0.1,
      minScale: 0.01,
      maxScale: 2.0,
      viewportWidth: 1024,
      viewportHeight: 768,
    });
    expect(tCustom.origin).toEqual({ x: 1000, y: 2000 });
    expect(tCustom.scale).toBe(0.1);
    expect(tCustom.minScale).toBe(0.01);
    expect(tCustom.maxScale).toBe(2.0);
    expect(tCustom.viewportWidth).toBe(1024);
    expect(tCustom.viewportHeight).toBe(768);
  });

  it('worldToScreen projette l’origine monde au centre du viewport écran', () => {
    const t = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const screenCenter = t.worldToScreen(vec2(0, 0));
    expect(screenCenter.x).toBe(400);
    expect(screenCenter.y).toBe(300);
  });

  it('worldToScreen inverse rigoureusement l’axe vertical (Y-up architectural -> Y-down Canvas)', () => {
    const t = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05, // 50 px pour 1000 mm
      viewportWidth: 800,
      viewportHeight: 600,
    });

    // Un point situé au Nord (+Y dans le monde architectural) doit monter à l'écran (y_s diminue)
    const northPt = t.worldToScreen(vec2(0, 1000));
    expect(northPt.x).toBe(400);
    expect(northPt.y).toBe(300 - 1000 * 0.05); // 250 px

    // Un point situé au Sud (-Y dans le monde) doit descendre à l'écran (y_s augmente)
    const southPt = t.worldToScreen(vec2(0, -1000));
    expect(southPt.x).toBe(400);
    expect(southPt.y).toBe(300 + 1000 * 0.05); // 350 px

    // Un point situé à l'Est (+X dans le monde) doit aller à droite (x_s augmente)
    const eastPt = t.worldToScreen(vec2(2000, 0));
    expect(eastPt.x).toBe(400 + 2000 * 0.05); // 500 px
    expect(eastPt.y).toBe(300);
  });

  it('bijection Y-up / Y-down sur configurations asymétriques (+Y, -Y, +X/+Y, -X/-Y)', () => {
    const t = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.1, // 100 px pour 1000 mm -> 1 px = 10 mm
      viewportWidth: 800,
      viewportHeight: 600,
    });
    // Centre écran : cx = 400, cy = 300

    // 1. Point avec Y positif seul (0, 500) -> monte à l'écran (ys diminue sous cy = 300)
    const pYPos = vec2(0, 500);
    const sYPos = t.worldToScreen(pYPos);
    expect(sYPos.x).toBe(400);
    expect(sYPos.y).toBe(250); // 300 - 50 = 250 (< 300)
    expect(sYPos.y).toBeLessThan(300);
    const rYPos = t.screenToWorld(sYPos);
    expect(Math.abs(rYPos.x - pYPos.x)).toBeLessThan(1e-6);
    expect(Math.abs(rYPos.y - pYPos.y)).toBeLessThan(1e-6);

    // 2. Point avec Y négatif seul (0, -500) -> descend à l'écran (ys augmente au-dessus de cy = 300)
    const pYNeg = vec2(0, -500);
    const sYNeg = t.worldToScreen(pYNeg);
    expect(sYNeg.x).toBe(400);
    expect(sYNeg.y).toBe(350); // 300 + 50 = 350 (> 300)
    expect(sYNeg.y).toBeGreaterThan(300);
    const rYNeg = t.screenToWorld(sYNeg);
    expect(Math.abs(rYNeg.x - pYNeg.x)).toBeLessThan(1e-6);
    expect(Math.abs(rYNeg.y - pYNeg.y)).toBeLessThan(1e-6);

    // 3. Point asymétrique (+X, +Y) : (100, 200) -> xs = 410, ys = 280
    const pXYPos = vec2(100, 200);
    const sXYPos = t.worldToScreen(pXYPos);
    expect(sXYPos.x).toBe(410); // 400 + 10
    expect(sXYPos.y).toBe(280); // 300 - 20
    const rXYPos = t.screenToWorld(sXYPos);
    expect(Math.abs(rXYPos.x - pXYPos.x)).toBeLessThan(1e-6);
    expect(Math.abs(rXYPos.y - pXYPos.y)).toBeLessThan(1e-6);

    // 4. Point asymétrique (-X, -Y) : (-50, -300) -> xs = 395, ys = 330
    const pXYNeg = vec2(-50, -300);
    const sXYNeg = t.worldToScreen(pXYNeg);
    expect(sXYNeg.x).toBe(395); // 400 - 5
    expect(sXYNeg.y).toBe(330); // 300 + 30
    const rXYNeg = t.screenToWorld(sXYNeg);
    expect(Math.abs(rXYNeg.x - pXYNeg.x)).toBeLessThan(1e-6);
    expect(Math.abs(rXYNeg.y - pXYNeg.y)).toBeLessThan(1e-6);
  });

  it('inversibilité mathématique stricte : screenToWorld(worldToScreen(P)) == P à 1e-9 mm près', () => {
    const t = new Transform2D({
      origin: vec2(1234.56, -987.65),
      scale: 0.0732,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    // Échantillonnage de points variés (entiers, fractionnaires, positifs, négatifs, lointains)
    const testPoints = [
      vec2(0, 0),
      vec2(1000, 2000),
      vec2(-5432.1, 8765.4),
      vec2(25000.789, -15000.123),
      vec2(-100000, -100000),
      vec2(0.001, -0.001),
      vec2(4000.5, 3000.25),
    ];

    for (const pt of testPoints) {
      const screen = t.worldToScreen(pt);
      const restored = t.screenToWorld(screen);

      expect(Math.abs(restored.x - pt.x)).toBeLessThan(1e-9);
      expect(Math.abs(restored.y - pt.y)).toBeLessThan(1e-9);
    }
  });

  it('inversibilité mathématique inverse : worldToScreen(screenToWorld(S)) == S à 1e-9 px près', () => {
    const t = new Transform2D({
      origin: vec2(500, 500),
      scale: 0.04,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const screenPoints = [
      vec2(0, 0),
      vec2(400, 300),
      vec2(800, 600),
      vec2(123.45, 567.89),
      vec2(-150, 950),
    ];

    for (const s of screenPoints) {
      const world = t.screenToWorld(s);
      const restored = t.worldToScreen(world);

      expect(Math.abs(restored.x - s.x)).toBeLessThan(1e-9);
      expect(Math.abs(restored.y - s.y)).toBeLessThan(1e-9);
    }
  });

  it('conversion exacte de distances euclidiennes (worldDistanceToScreen / screenDistanceToWorld)', () => {
    const t = new Transform2D({ scale: 0.02 });

    expect(t.worldDistanceToScreen(1000)).toBe(20);
    expect(t.worldDistanceToScreen(5000)).toBe(100);

    expect(t.screenDistanceToWorld(20)).toBe(1000);
    expect(t.screenDistanceToWorld(100)).toBe(5000);
  });

  it('panByScreen décale l’affichage de la quantité de pixels demandée', () => {
    const t = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const worldPoint = vec2(1000, 1000);
    const screenBefore = t.worldToScreen(worldPoint);

    // Déplacement de la vue de +50 px vers la droite et +30 px vers le bas
    t.panByScreen(vec2(50, 30));

    const screenAfter = t.worldToScreen(worldPoint);

    expect(screenAfter.x).toBeCloseTo(screenBefore.x + 50, 9);
    expect(screenAfter.y).toBeCloseTo(screenBefore.y + 30, 9);
  });

  it('zoomAt maintient le point du monde sous le curseur strictement invariant à l’écran', () => {
    const t = new Transform2D({
      origin: vec2(2000, 1500),
      scale: 0.05,
      viewportWidth: 1000,
      viewportHeight: 800,
    });

    const cursorScreen = vec2(350, 420);
    const worldUnderCursor = t.screenToWorld(cursorScreen);

    // Zoom avant x 1.5
    t.zoomAt(cursorScreen, 1.5);
    expect(t.scale).toBeCloseTo(0.075, 9);

    const cursorAfterZoomIn = t.worldToScreen(worldUnderCursor);
    expect(cursorAfterZoomIn.x).toBeCloseTo(cursorScreen.x, 9);
    expect(cursorAfterZoomIn.y).toBeCloseTo(cursorScreen.y, 9);

    // Zoom arrière x 0.8
    t.zoomAt(cursorScreen, 0.8);
    const cursorAfterZoomOut = t.worldToScreen(worldUnderCursor);
    expect(cursorAfterZoomOut.x).toBeCloseTo(cursorScreen.x, 9);
    expect(cursorAfterZoomOut.y).toBeCloseTo(cursorScreen.y, 9);
  });

  it('zoomAt respecte strictement les bornes minScale et maxScale', () => {
    const t = new Transform2D({
      scale: 1.0,
      minScale: 0.1,
      maxScale: 2.0,
    });

    // Tentative de dépasser maxScale
    t.zoomAt(vec2(400, 300), 5.0);
    expect(t.scale).toBe(2.0);

    // Tentative de dépasser minScale
    t.zoomAt(vec2(400, 300), 0.01);
    expect(t.scale).toBe(0.1);
  });

  it('getVisibleWorldBounds calcule le rectangle englobant du monde visible', () => {
    const t = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const bounds = t.getVisibleWorldBounds();
    // Demi-largeur en monde : 400 px / 0.05 = 8000 mm
    // Demi-hauteur en monde : 300 px / 0.05 = 6000 mm
    expect(bounds.min.x).toBeCloseTo(-8000, 6);
    expect(bounds.max.x).toBeCloseTo(8000, 6);
    expect(bounds.min.y).toBeCloseTo(-6000, 6);
    expect(bounds.max.y).toBeCloseTo(6000, 6);
  });

  it('zoomToFit cadre parfaitement la boîte englobante spécifiée avec sa marge', () => {
    const t = new Transform2D({
      viewportWidth: 1000,
      viewportHeight: 800,
      minScale: 0.001,
      maxScale: 10.0,
    });

    const houseBounds = {
      min: vec2(0, 0),
      max: vec2(10000, 8000), // Bâtiment 10m x 8m
    };

    t.zoomToFit(houseBounds, 50);

    // Le centre du monde doit être le centre du bâtiment
    expect(t.origin.x).toBe(5000);
    expect(t.origin.y).toBe(4000);

    // Le bâtiment doit tenir entièrement dans le viewport avec la marge
    const sMin = t.worldToScreen(houseBounds.min);
    const sMax = t.worldToScreen(houseBounds.max);

    expect(sMin.x).toBeGreaterThanOrEqual(50 - 1e-4);
    expect(sMax.x).toBeLessThanOrEqual(1000 - 50 + 1e-4);
    expect(sMax.y).toBeGreaterThanOrEqual(50 - 1e-4);
    expect(sMin.y).toBeLessThanOrEqual(800 - 50 + 1e-4);
  });
});
