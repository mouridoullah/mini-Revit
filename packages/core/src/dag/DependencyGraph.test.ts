import { describe, it, expect } from 'vitest';
import { DependencyGraph } from './DependencyGraph.js';
import type { BimState, Wall, Door, Dimension } from '../types.js';
import { BimValidationError } from '../rules.js';

function createMockState(partial: Partial<BimState> = {}): BimState {
  return {
    schemaVersion: 2,
    units: 'mm',
    levels: {},
    wallTypes: {},
    slabTypes: {},
    doorTypes: {},
    windowTypes: {},
    stairTypes: {},
    walls: {},
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
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
          doorTypeId: 'dt_01',
          hostWallId: wallId,
          offsetAlong: 500,
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
          levelId: 'lvl_01',
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
          levelId: 'lvl_01',
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
        doorTypeId: 'dt_01',
        hostWallId: wId,
        offsetAlong: 20,
        swing: { side: 'left', direction: 'in' },
      };
      doors[dId2] = {
        id: dId2,
        category: 'door',
        doorTypeId: 'dt_01',
        hostWallId: wId,
        offsetAlong: 50,
        swing: { side: 'right', direction: 'out' },
      };

      const dimId = `dim_${i}`;
      dimensions[dimId] = {
        id: dimId,
        category: 'dimension',
        levelId: 'lvl_01',
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

  // Escaliers & Trémies dérivées (ADR-048 §5)
  it('T-DAG-STAIR-01 : build(state avec escalier) crée les arêtes vers la dalle haute et les niveaux', () => {
    const stairId = 'stair_01';
    const stairTypeId = 'stair_type_01';
    const lvl0 = 'lvl_0';
    const lvl1 = 'lvl_1';
    const slabUpperId = 'slab_lvl1';

    const state = createMockState({
      levels: {
        [lvl0]: { id: lvl0, name: 'RDC', elevation: 0 },
        [lvl1]: { id: lvl1, name: 'R+1', elevation: 3000 },
      },
      stairTypes: {
        [stairTypeId]: { id: stairTypeId, name: 'Escalier 900', width: 900 },
      },
      stairs: {
        [stairId]: {
          id: stairId,
          category: 'stair',
          stairTypeId,
          bottomLevelId: lvl0,
          topLevelId: lvl1,
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
        },
      },
      slabs: {
        [slabUpperId]: {
          id: slabUpperId,
          category: 'slab',
          slabTypeId: 'st_200',
          levelId: lvl1,
          boundary: [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }],
        },
      },
    });

    const dag = DependencyGraph.build(state);

    // stair -> slabUpperId (topLevelId)
    expect(dag.getDependents(stairId)).toContain(slabUpperId);
    expect(dag.getDependencies(slabUpperId)).toContain(stairId);

    // stairType -> stair
    expect(dag.getDependents(stairTypeId)).toContain(stairId);

    // lvl0 -> stair, lvl1 -> stair
    expect(dag.getDependents(lvl0)).toContain(stairId);
    expect(dag.getDependents(lvl1)).toContain(stairId);
  });

  it('T-DAG-STAIR-02 : getDependents(stairId) retourne la dalle supérieure en dépendance transitive', () => {
    const stairId = 'stair_01';
    const slabUpperId = 'slab_lvl1';

    const state = createMockState({
      stairs: {
        [stairId]: {
          id: stairId,
          category: 'stair',
          stairTypeId: 'st_type',
          bottomLevelId: 'lvl_0',
          topLevelId: 'lvl_1',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
        },
      },
      slabs: {
        [slabUpperId]: {
          id: slabUpperId,
          category: 'slab',
          slabTypeId: 'st_200',
          levelId: 'lvl_1',
          boundary: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }],
        },
      },
    });

    const dag = DependencyGraph.build(state);
    const deps = dag.getDependents(stairId);
    expect(deps).toEqual([slabUpperId]);
  });

  it('T-DAG-STAIR-03 : Modification du niveau ou type d’escalier invalide en cascade l’escalier et la dalle', () => {
    const stairId = 'stair_01';
    const stairTypeId = 'stair_type_01';
    const lvl1 = 'lvl_1';
    const slabUpperId = 'slab_lvl1';

    const state = createMockState({
      levels: {
        [lvl1]: { id: lvl1, name: 'R+1', elevation: 3000 },
      },
      stairTypes: {
        [stairTypeId]: { id: stairTypeId, name: 'Escalier 900', width: 900 },
      },
      stairs: {
        [stairId]: {
          id: stairId,
          category: 'stair',
          stairTypeId,
          bottomLevelId: 'lvl_0',
          topLevelId: lvl1,
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
        },
      },
      slabs: {
        [slabUpperId]: {
          id: slabUpperId,
          category: 'slab',
          slabTypeId: 'st_200',
          levelId: lvl1,
          boundary: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }],
        },
      },
    });

    const dag = DependencyGraph.build(state);

    // Si on modifie le stairType, stair et slabUpperId sont tous deux dans la cascade transitive
    const typeDependents = dag.getDependents(stairTypeId);
    expect(typeDependents).toContain(stairId);
    expect(typeDependents).toContain(slabUpperId);

    // Si on modifie le niveau R+1, stair et slabUpperId sont invalidés
    const levelDependents = dag.getDependents(lvl1);
    expect(levelDependents).toContain(stairId);
    expect(levelDependents).toContain(slabUpperId);
  });

  it('T-DAG-ROOF-01 : Mutation d’un roofType -> invalide la toiture et les murs dépendants', () => {
    const roofTypeId = 'rt_gable_35';
    const roofId = 'roof_01';
    const wallId = 'wall_gable_01';
    const lvlId = 'lvl_roof';

    const state = createMockState({
      levels: {
        [lvlId]: { id: lvlId, name: 'Combles', elevation: 3000 },
      },
      roofTypes: {
        [roofTypeId]: {
          id: roofTypeId,
          category: 'roofType',
          name: 'Tuiles 35°',
          family: 'gable',
          thickness: 250,
          slopeDeg: 35,
          overhangMm: 0,
        },
      },
      roofs: {
        [roofId]: {
          id: roofId,
          category: 'roof',
          roofTypeId,
          levelId: lvlId,
          footprint: [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 6000 }, { x: 0, y: 6000 }],
        },
      },
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 0, y: 0 },
          end: { x: 0, y: 6000 },
          topConstraint: { kind: 'roof', roofId },
        },
      },
    });

    const dag = DependencyGraph.build(state);

    const typeDependents = dag.getDependents(roofTypeId);
    expect(typeDependents).toContain(roofId);
    expect(typeDependents).toContain(wallId);
  });

  it('T-DAG-ROOF-02 : Mutation d’une toiture -> invalide les murs sous toiture et ses ouvertures hébergées', () => {
    const roofId = 'roof_main';
    const wallId = 'wall_under_roof';
    const openingId = 'skylight_01';
    const lvlId = 'lvl_roof';

    const state = createMockState({
      levels: {
        [lvlId]: { id: lvlId, name: 'Combles', elevation: 3000 },
      },
      roofTypes: {
        rt_flat: { id: 'rt_flat', category: 'roofType', name: 'Toit plat', family: 'flat', thickness: 200 },
      },
      roofs: {
        [roofId]: {
          id: roofId,
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: lvlId,
          footprint: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }],
        },
      },
      roofOpenings: {
        [openingId]: {
          id: openingId,
          category: 'roofOpening',
          roofId,
          offsetU: 1000,
          offsetV: 1000,
          width: 800,
          height: 1000,
        },
      },
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          topConstraint: { kind: 'roof', roofId },
        },
      },
    });

    const dag = DependencyGraph.build(state);

    const roofDependents = dag.getDependents(roofId);
    expect(roofDependents).toContain(wallId);
    expect(roofDependents).toContain(openingId);
  });

  it('T-DAG-ROOF-03 : Dépendance transitive du niveau altimétrique vers la toiture et ses ouvertures', () => {
    const roofId = 'roof_main';
    const openingId = 'skylight_01';
    const lvlId = 'lvl_roof';

    const state = createMockState({
      levels: {
        [lvlId]: { id: lvlId, name: 'Combles', elevation: 3000 },
      },
      roofTypes: {
        rt_flat: { id: 'rt_flat', category: 'roofType', name: 'Toit plat', family: 'flat', thickness: 200 },
      },
      roofs: {
        [roofId]: {
          id: roofId,
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: lvlId,
          footprint: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }],
        },
      },
      roofOpenings: {
        [openingId]: {
          id: openingId,
          category: 'roofOpening',
          roofId,
          offsetU: 1000,
          offsetV: 1000,
          width: 800,
          height: 1000,
        },
      },
    });

    const dag = DependencyGraph.build(state);

    const levelDependents = dag.getDependents(lvlId);
    expect(levelDependents).toContain(roofId);
    expect(levelDependents).toContain(openingId);
  });

  it('T-DAG-ROOF-04 : Pas de contamination croisée entre toitures distinctes ni avec les murs hors emprise', () => {
    const lvlId = 'lvl_roof';
    const state = createMockState({
      levels: {
        [lvlId]: { id: lvlId, name: 'Combles', elevation: 3000 },
      },
      roofTypes: {
        rt_flat: { id: 'rt_flat', category: 'roofType', name: 'Toit plat', family: 'flat', thickness: 200 },
      },
      roofs: {
        roof_A: {
          id: 'roof_A',
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: lvlId,
          footprint: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { x: 0, y: 5000 }],
        },
        roof_B: {
          id: 'roof_B',
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: lvlId,
          footprint: [{ x: 10000, y: 0 }, { x: 15000, y: 0 }, { x: 15000, y: 5000 }, { x: 10000, y: 5000 }],
        },
      },
      walls: {
        w_under_A: {
          id: 'w_under_A',
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          topConstraint: { kind: 'roof', roofId: 'roof_A' },
        },
        w_under_B: {
          id: 'w_under_B',
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 10000, y: 0 },
          end: { x: 15000, y: 0 },
          topConstraint: { kind: 'roof', roofId: 'roof_B' },
        },
        w_outside: {
          id: 'w_outside',
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 20000, y: 0 },
          end: { x: 25000, y: 0 },
        },
        w_level: {
          id: 'w_level',
          category: 'wall',
          typeId: 'wt_standard',
          levelId: lvlId,
          start: { x: 1000, y: 1000 },
          end: { x: 4000, y: 1000 },
          topConstraint: { kind: 'level', levelId: lvlId },
        },
      },
    });

    const dag = DependencyGraph.build(state);

    const depsA = dag.getDependents('roof_A');
    expect(depsA).toContain('w_under_A');
    expect(depsA).not.toContain('w_under_B');
    expect(depsA).not.toContain('w_outside');
    expect(depsA).not.toContain('w_level');

    const depsB = dag.getDependents('roof_B');
    expect(depsB).toContain('w_under_B');
    expect(depsB).not.toContain('w_under_A');
    expect(depsB).not.toContain('w_outside');
    expect(depsB).not.toContain('w_level');
  });
});
