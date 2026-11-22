import { describe, it, expect } from 'vitest';
import { computePlanScene } from './computePlanScene.js';
import type { DocumentFor2D } from '../types.js';

describe('PlanScene Intermediate Model (@tabax/view-2d)', () => {
  const mockDoc: DocumentFor2D = {
    getState: () => ({
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl_00: { id: 'lvl_00', name: 'Rez-de-chaussée', elevation: 0 },
      },
      wallTypes: {
        wt_200: { id: 'wt_200', name: 'Mur 200mm', thickness: 200, height: 2800 },
      },
      slabTypes: {
        st_200: { id: 'st_200', name: 'Dalle 200mm', thickness: 200 },
      },
      doorTypes: {
        dt_900: { id: 'dt_900', name: 'Porte 900', width: 900, height: 2100 },
      },
      windowTypes: {
        wt_1200: { id: 'wt_1200', name: 'Fenêtre 1200', width: 1200, height: 1400 },
      },
      stairTypes: {
        stair_std: { id: 'stair_std', name: 'Escalier Std', width: 1000 },
      },
      componentTypes: {},
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
        w2: {
          id: 'w2',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_00',
          start: { x: 5000, y: 0 },
          end: { x: 5000, y: 4000 },
        },
      },
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          doorTypeId: 'dt_900',
          hostWallId: 'w1',
          offsetAlong: 1000,
          swing: { side: 'right', direction: 'in' },
        },
      },
      windows: {
        win1: {
          id: 'win1',
          category: 'window',
          windowTypeId: 'wt_1200',
          hostWallId: 'w2',
          offsetAlong: 1500,
        },
      },
      slabs: {
        s1: {
          id: 's1',
          category: 'slab',
          slabTypeId: 'st_200',
          levelId: 'lvl_00',
          boundary: [
            { x: 0, y: 0 },
            { x: 5000, y: 0 },
            { x: 5000, y: 4000 },
            { x: 0, y: 4000 },
          ],
          holes: [
            [
              { x: 1000, y: 1000 },
              { x: 2000, y: 1000 },
              { x: 2000, y: 2000 },
              { x: 1000, y: 2000 },
            ],
          ],
        },
      },
      stairs: {
        st1: {
          id: 'st1',
          category: 'stair',
          stairTypeId: 'stair_std',
          bottomLevelId: 'lvl_00',
          start: { x: 500, y: 500 },
          end: { x: 500, y: 3500 },
        },
      },
      rooms: {
        r1: {
          id: 'r1',
          name: 'Séjour',
          levelId: 'lvl_00',
          areaMm2: 20_000_000,
          seed: { x: 2500, y: 2000 },
          polygon: [
            { x: 100, y: 100 },
            { x: 4900, y: 100 },
            { x: 4900, y: 3900 },
            { x: 100, y: 3900 },
          ],
        },
      },
      dimensions: {
        dim1: {
          id: 'dim1',
          category: 'dimension',
          levelId: 'lvl_00',
          type: 'linear',
          references: ['w1'],
          offset: -500,
          value: 5000,
        },
      },
      sectionCuts: {
        secA: {
          id: 'secA',
          name: 'Coupe A-A',
          start: { x: -1000, y: 2000 },
          end: { x: 6000, y: 2000 },
          viewDirection: 1,
        },
      },
      pipes: {
        p1: {
          id: 'p1',
          category: 'pipe',
          system: 'supply',
          start: { x: 100, y: 200 },
          end: { x: 3000, y: 200 },
          diameter: 40,
        },
      },
      ducts: {},
      cableTrays: {},
    } as any),
  };

  it('computes PlanScene with exact architectural data', () => {
    const scene = computePlanScene(mockDoc, { levelId: 'lvl_00' });

    expect(scene.levelId).toBe('lvl_00');
    expect(scene.levelName).toBe('Rez-de-chaussée');

    // Walls
    expect(scene.walls.length).toBe(2);
    const wall1 = scene.walls.find((w) => w.id === 'w1');
    expect(wall1).toBeDefined();
    expect(wall1!.thickness).toBe(200);
    expect(wall1!.footprint.length).toBeGreaterThanOrEqual(4);
    expect(wall1!.hatchLines.length).toBeGreaterThan(0);

    // Openings
    expect(wall1!.openings.length).toBe(1);
    const door = wall1!.openings[0]!;
    expect(door.kind).toBe('door');
    expect(door.arc).toBeDefined();
    expect(door.arc!.radius).toBe(900);
    expect(door.leafLine).toBeDefined();

    const wall2 = scene.walls.find((w) => w.id === 'w2');
    expect(wall2!.openings.length).toBe(1);
    const win = wall2!.openings[0]!;
    expect(win.kind).toBe('window');
    expect(win.glassLine).toBeDefined();
    expect(win.frameLines?.length).toBe(4);

    // Slabs & holes
    expect(scene.slabs.length).toBe(1);
    expect(scene.slabs[0]!.boundary.length).toBe(4);
    expect(scene.slabs[0]!.holes.length).toBe(1);

    // Stairs
    expect(scene.stairs.length).toBe(1);
    expect(scene.stairs[0]!.treads.length).toBeGreaterThan(3);
    expect(scene.stairs[0]!.walkLine).toBeDefined();
    expect(scene.stairs[0]!.arrowLines.length).toBe(2);

    // Rooms
    expect(scene.rooms.length).toBe(1);
    expect(scene.rooms[0]!.name).toBe('Séjour');
    expect(scene.rooms[0]!.areaM2).toBe(20);

    // Dimensions
    expect(scene.dimensions.length).toBe(1);
    expect(scene.dimensions[0]!.value).toBe(5000);
    expect(scene.dimensions[0]!.ticks.length).toBe(2);

    // Section cuts
    expect(scene.sectionCuts.length).toBe(1);
    expect(scene.sectionCuts[0]!.name).toBe('Coupe A-A');
    expect(scene.sectionCuts[0]!.arrows.length).toBe(2);

    // MEP
    expect(scene.mep.pipes.length).toBe(1);
    expect(scene.mep.pipes[0]!.system).toBe('supply');

    // Bounding Box
    expect(scene.bounds.width).toBeGreaterThan(5000);
    expect(scene.bounds.height).toBeGreaterThan(4000);
  });
});
