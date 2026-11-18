import { describe, it, expect } from 'vitest';
import { DependencyGraph } from './DependencyGraph.js';
import { BimDocument } from '../document.js';
import * as Commands from '../commands.js';
import {
  type BimState,
  type Wall,
  type Level,
  type WallType,
  type SlabType,
  type Slab,
} from '../types.js';

function createLargeBuildingState(wallCount: number): BimState {
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
    walls,
    slabs,
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
    roofs: {},
    roofOpenings: {},
  };
}

describe('Chantier 7.5-D : Benchmark de Performance & Échelle DAG', () => {
  it('T-PERF-DAG-BUILD-200 : La construction du DAG pour 200 murs prend moins de 10 ms', () => {
    const state = createLargeBuildingState(200);
    expect(Object.keys(state.walls).length).toBe(200);

    // Warm-up
    DependencyGraph.build(state);

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      DependencyGraph.build(state);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // Doit être ultra-rapide (inférieur à 10ms, idéalement < 2ms)
    expect(avgMs).toBeLessThan(10);
  });

  it('T-PERF-DAG-TRANSACTION-100 : L’exécution d’une commande transactionnelle sur 100 murs prend moins de 25 ms', () => {
    const state = createLargeBuildingState(100);
    const doc = new BimDocument(state);

    const firstWallId = Object.keys(state.walls)[0];
    expect(firstWallId).toBeDefined();

    // Warm-up
    doc.execute(
      new Commands.UpdateWallCommand(firstWallId!, {
        end: { x: 4200, y: 0 },
      }),
    );

    const iterations = 20;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      doc.execute(
        new Commands.UpdateWallCommand(firstWallId!, {
          end: { x: 4000 + (i % 2 === 0 ? 100 : 0), y: 0 },
        }),
      );
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // Le budget par commande transactionnelle avec double reconstruction DAG doit rester sous 25ms
    expect(avgMs).toBeLessThan(25);
  });

  it('T-PERF-INCREMENTAL-DIRTY : La propagation différentielle n’invalide que les éléments réellement dépendants', () => {
    const state = createLargeBuildingState(50);
    const doc = new BimDocument(state);

    // Modification d'un mur horizontal indépendant au R+1 (pas de slab au-dessus, pas d'ouverture)
    const wallId = 'wall_h_1_0';
    expect(doc.getState().walls[wallId]).toBeDefined();

    const res = doc.execute(
      new Commands.UpdateWallCommand(wallId, {
        end: { x: 4500, y: 4000 },
      }),
    );

    // Seul le mur modifié (et ses éventuels dépendants directs) est marqué changé
    // Sur 50 murs, on ne doit JAMAIS invalider tous les murs
    expect(res.changed.length).toBeLessThan(5);
    expect(res.changed).toContain(wallId);
  });
});
