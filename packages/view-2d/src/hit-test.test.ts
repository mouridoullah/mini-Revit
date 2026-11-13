import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { BimDocument, Commands, type Wall, type WallType } from '@mini-bim/core';
import { Transform2D } from './transform.js';
import { isPointInsideOrNearFootprint, hitTestWall, findWallAtScreen } from './hit-test.js';

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
});
