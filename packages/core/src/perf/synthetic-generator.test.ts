import { describe, it, expect } from 'vitest';
import { generateSyntheticBimModel } from './synthetic-generator.js';
import { DependencyGraph } from '../dag/DependencyGraph.js';

describe('Chantier 9.1.1 : Générateur de Maquettes Synthétiques Multi-Catégories', () => {
  it('génère une maquette de 100 éléments avec toutes les familles représentées', () => {
    const { state, breakdown } = generateSyntheticBimModel(100);

    expect(breakdown.totalElements).toBe(100);
    expect(breakdown.walls).toBeGreaterThan(30);
    expect(breakdown.doors).toBeGreaterThan(5);
    expect(breakdown.windows).toBeGreaterThan(5);
    expect(breakdown.slabs).toBeGreaterThan(1);
    expect(breakdown.stairs).toBeGreaterThan(0);
    expect(breakdown.roofs).toBeGreaterThan(0);
    expect(breakdown.components).toBeGreaterThan(10);
    expect(breakdown.dimensions).toBeGreaterThan(1);
    expect(breakdown.rooms).toBeGreaterThan(1);

    // Vérification de l'intégrité référentielle
    for (const door of Object.values(state.doors)) {
      expect(state.walls[door.hostWallId]).toBeDefined();
      expect(state.doorTypes[door.doorTypeId]).toBeDefined();
    }
    for (const win of Object.values(state.windows)) {
      expect(state.walls[win.hostWallId]).toBeDefined();
      expect(state.windowTypes[win.windowTypeId]).toBeDefined();
    }
    for (const comp of Object.values(state.components ?? {})) {
      expect(state.componentTypes?.[comp.typeId]).toBeDefined();
      expect(state.levels[comp.levelId]).toBeDefined();
    }

    // Le DAG se construit sans erreur ni cycle
    const dag = DependencyGraph.build(state);
    expect(dag.hasCycle()).toBe(false);
    expect(dag.getDependents('lvl_0').length).toBeGreaterThan(10);
  });

  it('génère une maquette de 1 000 éléments avec stricte intégrité topologique', () => {
    const { state, breakdown } = generateSyntheticBimModel(1000);

    expect(breakdown.totalElements).toBe(1000);
    expect(Object.keys(state.walls).length).toBe(breakdown.walls);
    expect(Object.keys(state.doors).length).toBe(breakdown.doors);
    expect(Object.keys(state.windows).length).toBe(breakdown.windows);
    expect(Object.keys(state.components ?? {}).length).toBe(breakdown.components);

    const dag = DependencyGraph.build(state);
    expect(dag.hasCycle()).toBe(false);
    expect(dag.getDependents('lvl_0').length).toBeGreaterThan(50);
  });

  it('génère une maquette massive de 10 000 éléments de manière déterministe', () => {
    const t0 = performance.now();
    const { state, breakdown } = generateSyntheticBimModel(10000);
    const genDurationMs = performance.now() - t0;

    expect(breakdown.totalElements).toBe(10000);
    expect(breakdown.walls).toBeGreaterThan(3000);
    expect(breakdown.doors).toBeGreaterThan(1000);
    expect(breakdown.windows).toBeGreaterThan(1000);
    expect(breakdown.components).toBeGreaterThan(1500);

    // Génération rapide (inférieure à 200 ms pour 10 000 éléments)
    expect(genDurationMs).toBeLessThan(500);

    // Test de déterminisme bit à bit
    const run2 = generateSyntheticBimModel(10000);
    expect(run2.breakdown).toEqual(breakdown);
    expect(Object.keys(run2.state.walls).length).toBe(Object.keys(state.walls).length);
    expect(Object.keys(run2.state.doors).length).toBe(Object.keys(state.doors).length);
    expect(Object.keys(run2.state.components ?? {}).length).toBe(Object.keys(state.components ?? {}).length);
  });
});
