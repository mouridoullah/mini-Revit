import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, type Wall, type WallType } from '@mini-bim/core';
import { Transform2D } from './transform.js';
import {
  isPointInsideOrNearFootprint,
  hitTestWall,
  findWallAtScreen,
  findOpeningAtScreen,
  findMepElementAtScreen,
  findMepPortAtScreen,
} from './hit-test.js';

describe('Hit-Test Découplé (hit-test.ts)', () => {
  const wall: Wall = {
    id: 'w_test',
    category: 'wall',
    typeId: 'wt_200',
    levelId: 'lvl_rdc',
    start: vec2(0, 0),
    end: vec2(4000, 0),
  };

  const wallType: WallType = {
    id: 'wt_200',
    name: 'Mur 200mm',
    thickness: 200,
    height: 2800,
  };

  it('isPointInsideOrNearFootprint valide correctement un point intérieur et rejette un point extérieur', () => {
    // Rectangle CCW : [ (0,-100), (4000,-100), (4000,100), (0,100) ]
    const poly: readonly [
      ReturnType<typeof vec2>,
      ReturnType<typeof vec2>,
      ReturnType<typeof vec2>,
      ReturnType<typeof vec2>,
    ] = [vec2(0, -100), vec2(4000, -100), vec2(4000, 100), vec2(0, 100)];

    // Point intérieur au centre
    expect(isPointInsideOrNearFootprint(vec2(2000, 0), poly, 0)).toBe(true);
    // Point sur l'arête
    expect(isPointInsideOrNearFootprint(vec2(2000, 100), poly, 1e-4)).toBe(true);
    // Point hors du polygone à Y = 150 (sans tolérance)
    expect(isPointInsideOrNearFootprint(vec2(2000, 150), poly, 0)).toBe(false);
    // Point à Y = 150 avec tolérance 60 mm -> accepté
    expect(isPointInsideOrNearFootprint(vec2(2000, 150), poly, 60)).toBe(true);
  });

  it('hitTestWall valide un clic sur le corps du mur et rejette un clic hors tolérance', () => {
    // Milieu de l'axe (2000, 0)
    expect(hitTestWall(vec2(2000, 0), wall, wallType, 0)).toBe(true);
    // Au bord intérieur (2000, -90)
    expect(hitTestWall(vec2(2000, -90), wall, wallType, 0)).toBe(true);
    // Hors de l'épaisseur à Y = 150 mm (épaisseur = 200 mm -> demi = 100 mm)
    expect(hitTestWall(vec2(2000, 150), wall, wallType, 0)).toBe(false);
    // Au-delà de l'extrémité (X = 4200, Y = 0)
    expect(hitTestWall(vec2(4200, 0), wall, wallType, 0)).toBe(false);
    // Au-delà de l'extrémité mais dans une tolérance de 300 mm
    expect(hitTestWall(vec2(4200, 0), wall, wallType, 300)).toBe(true);
  });

  it('findWallAtScreen détecte le mur en coordonnées écran et respecte activeLevelId', () => {
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_screen_1',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(4000, 0),
      }),
    );

    // Écran : centre à (400, 300).
    // Mur va de (400, 300) à (600, 300). Clic à (500, 300)
    const hitId = findWallAtScreen(vec2(500, 300), transform, doc);
    expect(hitId).toBe('w_screen_1');

    // Clic dans le vide à (500, 100)
    const missId = findWallAtScreen(vec2(500, 100), transform, doc);
    expect(missId).toBeNull();

    // Filtre sur un autre niveau
    const otherLevelHit = findWallAtScreen(vec2(500, 300), transform, doc, {
      activeLevelId: 'lvl_non_existant',
    });
    expect(otherLevelHit).toBeNull();
  });

  it('findOpeningAtScreen détecte portes et fenêtres avec précision et rejette les clics hors zone', () => {
    const transform = new Transform2D({
      origin: vec2(0, 0),
      scale: 0.05,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const typeId = Object.keys(state.wallTypes)[0]!;
    const levelId = Object.keys(state.levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_host',
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(6000, 0),
      }),
    );

    doc.execute(
      new Commands.AddDoorCommand({
        id: 'door_test_1',
        category: 'door',
        hostWallId: 'w_host',
        offsetAlong: 1000,
        doorTypeId: 'dt-standard',
        swing: { side: 'left', direction: 'in' },
      }),
    );

    doc.execute(
      new Commands.AddWindowCommand({
        id: 'win_test_1',
        category: 'window',
        hostWallId: 'w_host',
        offsetAlong: 3500,
        windowTypeId: 'wt-standard',
        sillHeight: 900,
      }),
    );

    // Mur va de (0,0) à (6000,0) -> écran X va de 400 à 700, Y = 300.
    // Porte à offset 1000 (X monde = 1000 à 1900) -> écran X = 400 + 1000*0.05 = 450 à 495.
    // Clic au milieu de la porte : monde (1450, 0) -> écran (472.5, 300)
    const doorHit = findOpeningAtScreen(vec2(472.5, 300), transform, doc);
    expect(doorHit).toEqual({
      id: 'door_test_1',
      kind: 'door',
      hostWallId: 'w_host',
    });

    // Fenêtre à offset 3500 (X monde = 3500 à 4700) -> écran X = 400 + 3500*0.05 = 575 à 635.
    // Clic au milieu de la fenêtre : monde (4100, 0) -> écran (605, 300)
    const winHit = findOpeningAtScreen(vec2(605, 300), transform, doc);
    expect(winHit).toEqual({
      id: 'win_test_1',
      kind: 'window',
      hostWallId: 'w_host',
    });

    // Clic sur le mur mais hors des ouvertures : monde (2500, 0) -> écran (525, 300)
    const wallOnlyHit = findOpeningAtScreen(vec2(525, 300), transform, doc);
    expect(wallOnlyHit).toBeNull();

    // Clic au-delà de l'épaisseur du mur : monde (1450, 300) -> écran (472.5, 300 - 15)
    const farPerpHit = findOpeningAtScreen(vec2(472.5, 270), transform, doc);
    expect(farPerpHit).toBeNull();

    // Clic complètement dans le vide (hors de tout mur) : écran (100, 100)
    const voidHit = findOpeningAtScreen(vec2(100, 100), transform, doc);
    expect(voidHit).toBeNull();

    // Clic sur le bord immédiat de la porte dans la tolérance de 6 px (495 + 4 = 499 px)
    const edgeHit = findOpeningAtScreen(vec2(499, 300), transform, doc, { hitTolerancePx: 6 });
    expect(edgeHit).toEqual({
      id: 'door_test_1',
      kind: 'door',
      hostWallId: 'w_host',
    });

    // Clic au-delà de la tolérance sur le bord (495 + 10 = 505 px) -> hors ouverture
    const beyondTolHit = findOpeningAtScreen(vec2(505, 300), transform, doc, { hitTolerancePx: 6 });
    expect(beyondTolHit).toBeNull();
  });

  it('findMepElementAtScreen détecte précisément tuyaux, gaines, chemins de câbles et équipements', () => {
    const doc = new BimDocument();
    doc.execute({
      name: 'InitLevel',
      apply: (draft) => {
        (draft as any).levels = {
          lvl_rdc: { id: 'lvl_rdc', name: 'RDC', elevation: 0 },
        };
      },
      getChangedIds: () => ['lvl_rdc'],
    });

    const transform = new Transform2D({
      viewportWidth: 800,
      viewportHeight: 600,
      scale: 0.05, // 1 px = 20 mm
      origin: vec2(0, 0),
    });

    doc.execute({
      name: 'AddPipe',
      apply: (draft) => {
        (draft as any).pipes = {
          p1: {
            id: 'p1',
            category: 'pipe',
            levelId: 'lvl_rdc',
            start: { x: 0, y: 1000, z: 2500 },
            end: { x: 3000, y: 1000, z: 2500 },
            diameter: 100,
            ports: [
              {
                id: 'port_p1_start',
                elementId: 'p1',
                position: { x: 0, y: 1000, z: 2500 },
                direction: { x: -1, y: 0, z: 0 },
                domain: 'plumbing',
                systemType: 'domestic_cold_water',
                shape: 'round',
                diameter: 100,
              },
              {
                id: 'port_p1_end',
                elementId: 'p1',
                position: { x: 3000, y: 1000, z: 2500 },
                direction: { x: 1, y: 0, z: 0 },
                domain: 'plumbing',
                systemType: 'domestic_cold_water',
                shape: 'round',
                diameter: 100,
              },
            ],
          },
        };
      },
      getChangedIds: () => ['p1'],
    });

    // Clic sur l'axe du tuyau : monde (1500, 1000)
    const screenCenter = transform.worldToScreen(vec2(1500, 1000));
    const pipeHit = findMepElementAtScreen(screenCenter, transform, doc);
    expect(pipeHit).toEqual({ id: 'p1', category: 'pipe' });

    // Clic légèrement à côté (Y écran + 2 px -> delta 40 mm, dans le rayon de 50 mm)
    const pipeNearHit = findMepElementAtScreen(vec2(screenCenter.x, screenCenter.y + 2), transform, doc);
    expect(pipeNearHit).toEqual({ id: 'p1', category: 'pipe' });

    // Clic hors du tuyau (Y écran - 20 px -> delta 400 mm)
    const pipeFarHit = findMepElementAtScreen(vec2(screenCenter.x, screenCenter.y - 20), transform, doc);
    expect(pipeFarHit).toBeNull();
  });

  it('findMepPortAtScreen détecte le port magnétique le plus proche selon l’ADR-047', () => {
    const doc = new BimDocument();
    doc.execute({
      name: 'InitLevel',
      apply: (draft) => {
        (draft as any).levels = {
          lvl_rdc: { id: 'lvl_rdc', name: 'RDC', elevation: 0 },
        };
      },
      getChangedIds: () => ['lvl_rdc'],
    });

    const transform = new Transform2D({
      viewportWidth: 800,
      viewportHeight: 600,
      scale: 0.05, // 1 px = 20 mm
      origin: vec2(0, 0),
    });

    doc.execute({
      name: 'AddPipe',
      apply: (draft) => {
        (draft as any).pipes = {
          p1: {
            id: 'p1',
            category: 'pipe',
            levelId: 'lvl_rdc',
            start: { x: 0, y: 1000, z: 2500 },
            end: { x: 3000, y: 1000, z: 2500 },
            diameter: 100,
            ports: [
              {
                id: 'port_p1_start',
                elementId: 'p1',
                position: { x: 0, y: 1000, z: 2500 },
                direction: { x: -1, y: 0, z: 0 },
                domain: 'plumbing',
                systemType: 'domestic_cold_water',
                shape: 'round',
                diameter: 100,
              },
              {
                id: 'port_p1_end',
                elementId: 'p1',
                position: { x: 3000, y: 1000, z: 2500 },
                direction: { x: 1, y: 0, z: 0 },
                domain: 'plumbing',
                systemType: 'domestic_cold_water',
                shape: 'round',
                diameter: 100,
              },
            ],
          },
        };
      },
      getChangedIds: () => ['p1'],
    });

    // Port à (3000, 1000)
    const portScreen = transform.worldToScreen(vec2(3000, 1000));

    // Clic à 8 pixels écran du port -> dans la tolérance de 14 px
    const portHit = findMepPortAtScreen(vec2(portScreen.x + 8, portScreen.y), transform, doc, { hitTolerancePx: 14 });
    expect(portHit).not.toBeNull();
    expect(portHit?.port.id).toBe('port_p1_end');
    expect(portHit?.elementId).toBe('p1');
    expect(portHit?.distanceScreenPx).toBeCloseTo(8, 1);

    // Clic à 20 pixels écran du port -> hors de la tolérance de 14 px
    const portMiss = findMepPortAtScreen(vec2(portScreen.x + 20, portScreen.y), transform, doc, { hitTolerancePx: 14 });
    expect(portMiss).toBeNull();
  });
});
