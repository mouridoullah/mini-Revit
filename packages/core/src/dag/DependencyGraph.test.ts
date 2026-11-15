import { describe, it, expect } from 'vitest';
import { DependencyGraph } from './DependencyGraph.js';
import type { BimState, Wall, Door, Window, Dimension, Level, WallType } from '../types.js';
import { BimValidationError } from '../rules.js';

function createMockState(partial: Partial<BimState> = {}): BimState {
  return {
    schemaVersion: 1,
    units: 'mm',
    levels: {},
    wallTypes: {},
    walls: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    ...partial,
  };
}

describe('DependencyGraph — Graphe de Dépendances Minimal (T-DAG-01 à 17)', () => {
  // A. Construction (T-DAG-01 à 05)
  it('T-DAG-01: build(emptyState)', () => {
    const dag = DependencyGraph.build(createMockState());
    expect(dag.getDependents('any_id')).toEqual([]);
    expect(dag.getDependencies('any_id')).toEqual([]);
    expect(dag.hasCycle()).toBe(false);
  });

  it('T-DAG-02: build(state avec 1 mur + 1 porte)', () => {
    const wallId = 'w_01';
    const doorId = 'd_01';
    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
        },
      },
      doors: {
        [doorId]: {
          id: doorId,
          category: 'door',
          kind: 'door',
          hostWallId: wallId,
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
    });

    const dag = DependencyGraph.build(state);
    // wall -> door
    expect(dag.getDependents(wallId)).toContain(doorId);
    expect(dag.getDependencies(doorId)).toContain(wallId);
    // Arête inverse door -> wall absente
    expect(dag.getDependents(doorId)).not.toContain(wallId);
  });

  it('T-DAG-03: build(state avec wall.typeId → wallType)', () => {
    const wallId = 'w_01';
    const typeId = 'wt_01';
    const state = createMockState({
      wallTypes: {
        [typeId]: { id: typeId, name: 'Standard', thickness: 200, height: 2800 },
      },
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId,
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
        },
      },
    });

    const dag = DependencyGraph.build(state);
    // wallType -> wall
    expect(dag.getDependents(typeId)).toContain(wallId);
    expect(dag.getDependencies(wallId)).toContain(typeId);
  });

  it('T-DAG-04: build(state avec dimension.references[] = [wallA, wallB])', () => {
    const wallA = 'w_a';
    const wallB = 'w_b';
    const dimId = 'dim_ab';
    const state = createMockState({
      dimensions: {
        [dimId]: {
          id: dimId,
          category: 'dimension',
          type: 'linear',
          references: [wallA, wallB],
          offset: 200,
          value: 4000,
        },
      },
    });

    const dag = DependencyGraph.build(state);
    expect(dag.getDependents(wallA)).toContain(dimId);
    expect(dag.getDependents(wallB)).toContain(dimId);
    expect(dag.getDependencies(dimId)).toEqual([wallA, wallB].sort());
  });

  it('T-DAG-05: build(state avec 2 niveaux + 2 murs + 2 dalles)', () => {
    const lvl0 = 'lvl_0';
    const lvl1 = 'lvl_1';
    const w0 = 'w_0';
    const w1 = 'w_1';
    const slab0 = 'slab_0';
    const slab1 = 'slab_1';

    const state = createMockState({
      levels: {
        [lvl0]: { id: lvl0, name: 'RDC', elevation: 0 },
        [lvl1]: { id: lvl1, name: 'R+1', elevation: 3000 },
      },
      walls: {
        [w0]: {
          id: w0,
          category: 'wall',
          typeId: 'wt_1',
          levelId: lvl0,
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
        [w1]: {
          id: w1,
          category: 'wall',
          typeId: 'wt_1',
          levelId: lvl1,
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
      },
    });
    (state as any).slabs = {
      [slab0]: { id: slab0, levelId: lvl0 },
      [slab1]: { id: slab1, levelId: lvl1 },
    };

    const dag = DependencyGraph.build(state);
    expect(dag.getDependents(lvl0)).toContain(w0);
    expect(dag.getDependents(lvl0)).toContain(slab0);
    expect(dag.getDependents(lvl1)).toContain(w1);
    expect(dag.getDependents(lvl1)).toContain(slab1);
  });

  // B. getDependents() (T-DAG-06 à 10)
  it('T-DAG-06: getDependents(wallId) sur mur avec 2 portes + 1 fenêtre', () => {
    const wallId = 'w_host';
    const doorA = '01JABCD0001';
    const doorB = '01JABCD0002';
    const winA = '01JABCD0003';

    const state = createMockState({
      doors: {
        [doorA]: { id: doorA, hostWallId: wallId } as any,
        [doorB]: { id: doorB, hostWallId: wallId } as any,
      },
      windows: {
        [winA]: { id: winA, hostWallId: wallId } as any,
      },
    });

    const dag = DependencyGraph.build(state);
    expect(dag.getDependents(wallId)).toEqual([doorA, doorB, winA].sort());
  });

  it('T-DAG-07: getDependents(wallTypeId) sur type utilisé par 3 murs', () => {
    const typeId = 'wt_common';
    const state = createMockState({
      walls: {
        w_1: { id: 'w_1', typeId } as any,
        w_2: { id: 'w_2', typeId } as any,
        w_3: { id: 'w_3', typeId } as any,
      },
    });

    const dag = DependencyGraph.build(state);
    expect(dag.getDependents(typeId)).toEqual(['w_1', 'w_2', 'w_3'].sort());
  });

  it('T-DAG-08: getDependents(leafId) sur porte isolée', () => {
    const doorId = 'd_leaf';
    const state = createMockState({
      doors: { [doorId]: { id: doorId, hostWallId: 'w_0' } as any },
    });
    const dag = DependencyGraph.build(state);
    expect(dag.getDependents(doorId)).toEqual([]);
  });

  it('T-DAG-09: getDependents(unknownId) sur ID inexistant', () => {
    const dag = DependencyGraph.build(createMockState());
    expect(dag.getDependents('non_existent_id')).toEqual([]);
  });

  it('T-DAG-10: getDependents(wallId) avec dépendance transitive : wall → door → doorChild', () => {
    const dag = new DependencyGraph();
    dag.addEdge('wall_1', 'door_1');
    dag.addEdge('door_1', 'dim_on_door');

    expect(dag.getDependents('wall_1')).toEqual(['dim_on_door', 'door_1']);
  });

  // C. getDependencies() (T-DAG-11 à 12)
  it('T-DAG-11: getDependencies(doorId) sur porte avec hostWallId', () => {
    const dag = new DependencyGraph();
    dag.addEdge('wall_1', 'door_1');
    expect(dag.getDependencies('door_1')).toEqual(['wall_1']);
  });

  it('T-DAG-12: getDependencies(wallId) avec typeId + levelId', () => {
    const dag = new DependencyGraph();
    dag.addEdge('type_1', 'wall_1');
    dag.addEdge('level_1', 'wall_1');
    expect(dag.getDependencies('wall_1')).toEqual(['level_1', 'type_1']);
  });

  // D. Cycles & Erreurs (T-DAG-13 à 15)
  it('T-DAG-13: hasCycle() sur un graphe forcé avec cycle', () => {
    const dag = new DependencyGraph();
    dag.addEdge('nodeA', 'nodeB');
    dag.addEdge('nodeB', 'nodeC');
    dag.addEdge('nodeC', 'nodeA');
    expect(dag.hasCycle()).toBe(true);
  });

  it('T-DAG-14: build(state) avec un état corrompu contenant un cycle lève CYCLE_DETECTED', () => {
    // Custom registry simulating a cyclic relation
    const cyclicRegistry = [
      {
        sourceCategory: 'wall' as const,
        field: 'typeId',
        targetCategory: 'wallType' as const,
        onDelete: 'restrict' as const,
      },
      {
        sourceCategory: 'wallType' as const,
        field: 'materialId', // simulates wallType referencing wall
        targetCategory: 'wall' as const,
        onDelete: 'restrict' as const,
      },
    ];

    const state = createMockState({
      wallTypes: {
        wt_1: { id: 'wt_1', materialId: 'w_1' } as any,
      },
      walls: {
        w_1: { id: 'w_1', typeId: 'wt_1' } as any,
      },
    });

    try {
      DependencyGraph.build(state, cyclicRegistry);
      expect.fail('Should have thrown BimValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bve = err as BimValidationError;
      expect(bve.code).toBe('CYCLE_DETECTED');
      expect(bve.offendingIds).toBeDefined();
      expect(bve.offendingIds).toContain('w_1');
      expect(bve.offendingIds).toContain('wt_1');
    }
  });

  it('T-DAG-15: build(state) avec references: [] (vide) sur dimension', () => {
    const state = createMockState({
      dimensions: {
        dim_empty: {
          id: 'dim_empty',
          category: 'dimension',
          type: 'linear',
          references: [],
          offset: 0,
          value: 0,
        },
      },
    });

    const dag = DependencyGraph.build(state);
    expect(dag.getDependencies('dim_empty')).toEqual([]);
    expect(dag.hasCycle()).toBe(false);
  });

  // E. Performance (T-DAG-16 à 17)
  it('T-DAG-16: build() sur 1000 murs + 2000 portes + 1000 cotations < 10 ms', () => {
    const walls: Record<string, Wall> = {};
    const doors: Record<string, Door> = {};
    const dimensions: Record<string, Dimension> = {};

    for (let i = 0; i < 1000; i++) {
      const wId = `w_${i}`;
      walls[wId] = {
        id: wId,
        category: 'wall',
        typeId: `wt_${i % 5}`,
        levelId: `lvl_${i % 3}`,
        start: { x: i * 100, y: 0 },
        end: { x: (i + 1) * 100, y: 0 },
      };

      const dId1 = `d_${i}_1`;
      const dId2 = `d_${i}_2`;
      doors[dId1] = {
        id: dId1,
        category: 'door',
        kind: 'door',
        hostWallId: wId,
        offsetAlong: 20,
        width: 900,
        height: 2100,
        swing: { side: 'left', direction: 'in' },
      };
      doors[dId2] = {
        id: dId2,
        category: 'door',
        kind: 'door',
        hostWallId: wId,
        offsetAlong: 50,
        width: 800,
        height: 2100,
        swing: { side: 'right', direction: 'out' },
      };

      const dimId = `dim_${i}`;
      dimensions[dimId] = {
        id: dimId,
        category: 'dimension',
        type: 'linear',
        references: [wId],
        offset: 100,
        value: 1000,
      };
    }

    const state = createMockState({ walls, doors, dimensions });

    // Warm-up V8 JIT
    DependencyGraph.build(state);
    DependencyGraph.build(state);

    let minDuration = Infinity;
    let dag = DependencyGraph.build(state);
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      dag = DependencyGraph.build(state);
      const duration = performance.now() - t0;
      if (duration < minDuration) minDuration = duration;
    }

    expect(minDuration).toBeLessThan(10); // < 10 ms
    expect(dag.getDependents('w_0').length).toBe(3); // 2 doors + 1 dim
  });

  it('T-DAG-17: getDependents() sur un mur avec 100 dépendants transitifs < 1 ms', () => {
    const dag = new DependencyGraph();
    // Chaine de 100 nœuds en cascade : n0 -> n1 -> n2 ... -> n99
    for (let i = 0; i < 99; i++) {
      dag.addEdge(`n_${i}`, `n_${i + 1}`);
    }

    const t0 = performance.now();
    const dependents = dag.getDependents('n_0');
    const duration = performance.now() - t0;

    expect(dependents.length).toBe(99);
    expect(duration).toBeLessThan(1); // < 1 ms
  });
});
