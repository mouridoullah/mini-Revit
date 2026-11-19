import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../dag/DependencyGraph.js';
import { BimDocument } from '../document.js';
import * as Commands from '../commands.js';
import { validateDirty } from '../rules/dirty.js';
import {
  type BimState,
  type Wall,
  type Level,
  type WallType,
  type SlabType,
  type Slab,
} from '../types.js';

function createBenchmarkGridState(wallCount: number): BimState {
  const lvl0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 };
  const lvl1: Level = { id: 'lvl_1', name: 'R+1', elevation: 2800, height: 2800 };
  const wt200: WallType = { id: 'wt_200', name: 'Mur 200mm', thickness: 200, height: 2800 };
  const slt200: SlabType = { id: 'slt_200', name: 'Dalle 200mm', thickness: 200 };

  const walls: Record<string, Wall> = {};
  const gridSide = Math.ceil(Math.sqrt(wallCount / 2));
  const spacing = 4000;

  let created = 0;
  // Murs horizontaux
  for (let r = 0; r <= gridSide && created < wallCount; r++) {
    for (let c = 0; c < gridSide && created < wallCount; c++) {
      const id = `wall_h_${r}_${c}`;
      walls[id] = {
        id,
        category: 'wall',
        typeId: 'wt_200',
        levelId: r % 2 === 0 ? 'lvl_0' : 'lvl_1',
        start: { x: c * spacing, y: r * spacing },
        end: { x: (c + 1) * spacing, y: r * spacing },
        topConstraint: r % 2 === 0 ? { kind: 'level', levelId: 'lvl_1' } : undefined,
      };
      created++;
    }
  }

  // Murs verticaux
  for (let c = 0; c <= gridSide && created < wallCount; c++) {
    for (let r = 0; r < gridSide && created < wallCount; r++) {
      const id = `wall_v_${c}_${r}`;
      walls[id] = {
        id,
        category: 'wall',
        typeId: 'wt_200',
        levelId: c % 2 === 0 ? 'lvl_0' : 'lvl_1',
        start: { x: c * spacing, y: r * spacing },
        end: { x: c * spacing, y: (r + 1) * spacing },
        topConstraint: c % 2 === 0 ? { kind: 'level', levelId: 'lvl_1' } : undefined,
      };
      created++;
    }
  }

  const slabs: Record<string, Slab> = {
    slab_0: {
      id: 'slab_0',
      category: 'slab',
      slabTypeId: 'slt_200',
      levelId: 'lvl_1',
      boundary: [
        { x: 0, y: 0 },
        { x: gridSide * spacing, y: 0 },
        { x: gridSide * spacing, y: gridSide * spacing },
        { x: 0, y: gridSide * spacing },
      ],
      holes: [],
      openings: [],
    },
  };

  return {
    schemaVersion: 2,
    units: 'mm',
    levels: { lvl_0: lvl0, lvl_1: lvl1 },
    wallTypes: { wt_200: wt200 },
    slabTypes: { slt_200: slt200 },
    doorTypes: {},
    windowTypes: {},
    stairTypes: {},
    roofTypes: {},
    componentTypes: {},
    walls,
    slabs,
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
    roofs: {},
    roofOpenings: {},
    components: {},
  };
}

describe('Chantier 8.6.3 : Banc de Performance Synthétique & Échelle du Moteur BIM', () => {
  it('T-SCALE-DAG-1000 : La construction du DAG sur 1 000 murs prend moins de 15 ms', () => {
    const state = createBenchmarkGridState(1000);
    expect(Object.keys(state.walls).length).toBe(1000);

    // Warm-up
    DependencyGraph.build(state);

    const iterations = 20;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      DependencyGraph.build(state);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(15);
  });

  it('T-SCALE-VALIDATE-DIRTY-1000 : La validation différentielle ciblée sur 1 000 murs prend moins de 5 ms', () => {
    const state = createBenchmarkGridState(1000);
    const targetWallId = 'wall_h_0_0';
    const draftState: BimState = {
      ...state,
      walls: {
        ...state.walls,
        [targetWallId]: {
          ...state.walls[targetWallId]!,
          end: { x: 4100, y: 0 },
        },
      },
    };

    // Warm-up
    validateDirty(draftState, [targetWallId], state);

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      validateDirty(draftState, [targetWallId], state);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(5);
  });

  it('T-SCALE-MOVEWALL-100 : MoveWallCommand avec étirement cinématique sur 100 murs prend moins de 25 ms (< 50ms budget)', () => {
    const state = createBenchmarkGridState(100);
    const doc = new BimDocument(state);
    const wallId = 'wall_h_0_0';

    // Warm-up
    doc.execute(new Commands.MoveWallCommand(wallId, { x: 50, y: 0 }));

    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      doc.execute(new Commands.MoveWallCommand(wallId, { x: i % 2 === 0 ? 20 : -20, y: 0 }));
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(25);
  });

  it('T-SCALE-TRANSACTION-1000 : Une transaction unitaire sur 1 000 murs prend moins de 50 ms', () => {
    const state = createBenchmarkGridState(1000);
    const doc = new BimDocument(state);
    const wallId = 'wall_h_0_0';

    // Warm-up
    doc.execute(new Commands.UpdateWallCommand(wallId, { heightOverride: 3000 }));

    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      doc.execute(
        new Commands.UpdateWallCommand(wallId, {
          heightOverride: 3000 + (i % 2 === 0 ? 100 : 0),
        }),
      );
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    expect(avgMs).toBeLessThan(50);
  });
});
