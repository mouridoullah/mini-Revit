/**
 * Mini-BIM — Script de Banc de Scalabilité & Benchmarks Statistiques
 * Exécution autonome pour la Phase 9.1
 * Mesure P50, P95, Moyenne, Min, Max et empreinte mémoire sur 100, 1 000 et 10 000 entités.
 */

import { generateSyntheticBimModel } from '../packages/core/dist/perf/synthetic-generator.js';
import { runBenchmark } from '../packages/core/dist/perf/stats.js';
import { DependencyGraph } from '../packages/core/dist/dag/DependencyGraph.js';
import { BimDocument } from '../packages/core/dist/document.js';
import { validateDirty } from '../packages/core/dist/rules/dirty.js';
import * as Commands from '../packages/core/dist/commands.js';
import { resolveWallGeometry } from '../packages/core/dist/walls/resolve.js';
import { createWallMeshWithOpenings } from '../packages/view-3d/dist/index.js';

console.log('========================================================================');
console.log('MINI-BIM — CAMPAGNE DE QUALIFICATION DE SCALABILITÉ (PHASE 9.1)');
console.log(`Node ${process.version} | ${process.platform} ${process.arch} | V8 ${process.versions.v8}`);
console.log('========================================================================\n');

const allMetrics = [];

function record(metric, category, tier) {
  allMetrics.push({ ...metric, category, tier });
  console.log(
    `[${tier}] ${metric.name.padEnd(28)} | P50: ${metric.p50Ms.toFixed(2).padStart(7)} ms | P95: ${metric.p95Ms.toFixed(2).padStart(7)} ms | Avg: ${metric.avgMs.toFixed(2).padStart(7)} ms | Min: ${metric.minMs.toFixed(2).padStart(7)} ms | Max: ${metric.maxMs.toFixed(2).padStart(7)} ms`
  );
}

// ---------------------------------------------------------------------------
// PALIER S : 100 ENTITÉS
// ---------------------------------------------------------------------------
console.log('--- PALIER S : 100 ENTITÉS MULTI-CATÉGORIES ---');
const tGen100_0 = performance.now();
const model100 = generateSyntheticBimModel(100);
const gen100Ms = performance.now() - tGen100_0;
console.log(`Génération 100 entités : ${gen100Ms.toFixed(2)} ms | Breakdown:`, model100.breakdown);

const dag100 = DependencyGraph.build(model100.state);
record(runBenchmark('DAG_BUILD_100', () => DependencyGraph.build(model100.state), { warmup: 5, iterations: 25 }), 'DAG', '100');
record(runBenchmark('DAG_CYCLE_100', () => dag100.hasCycle(), { warmup: 5, iterations: 25 }), 'DAG', '100');
record(runBenchmark('DAG_QUERY_100', () => dag100.getDependents('lvl_0'), { warmup: 5, iterations: 25 }), 'DAG', '100');

const wallId100 = Object.keys(model100.state.walls)[0];
const draft100 = {
  ...model100.state,
  walls: { ...model100.state.walls, [wallId100]: { ...model100.state.walls[wallId100], end: { x: 5050, y: 0 } } },
};
record(runBenchmark('VALIDATE_DIRTY_100', () => validateDirty(draft100, [wallId100], model100.state), { warmup: 5, iterations: 25 }), 'Validation', '100');

const doc100 = new BimDocument(model100.state);
record(runBenchmark('TX_UPDATE_WALL_100', (i) => {
  doc100.execute(new Commands.UpdateWallCommand(wallId100, { heightOverride: 2800 + (i % 2 === 0 ? 50 : 0) }));
}, { warmup: 5, iterations: 20 }), 'Transactions', '100');

record(runBenchmark('TX_MOVE_WALL_100', (i) => {
  doc100.execute(new Commands.MoveWallCommand(wallId100, { x: i % 2 === 0 ? 20 : -20, y: 0 }));
}, { warmup: 5, iterations: 20 }), 'Transactions', '100');

record(runBenchmark('TX_UNDO_REDO_100', () => {
  doc100.undo();
  doc100.redo();
}, { warmup: 5, iterations: 20 }), 'Transactions', '100');

const walls100 = Object.values(model100.state.walls);
record(runBenchmark('GEO_RESOLVE_WALLS_100', () => {
  for (const w of walls100) resolveWallGeometry(w, model100.state);
}, { warmup: 5, iterations: 25 }), 'Geometry', '100');

record(runBenchmark('VIEW3D_MESH_GEN_100', () => {
  for (const w of walls100) {
    const wt = model100.state.wallTypes[w.typeId];
    createWallMeshWithOpenings({
      wall: { start: w.start, end: w.end },
      wallType: { thickness: wt.thickness, height: wt.height },
      openings: [],
    });
  }
}, { warmup: 5, iterations: 25 }), 'View3D', '100');

console.log('');

// ---------------------------------------------------------------------------
// PALIER M : 1 000 ENTITÉS
// ---------------------------------------------------------------------------
console.log('--- PALIER M : 1 000 ENTITÉS MULTI-CATÉGORIES ---');
const tGen1000_0 = performance.now();
const model1000 = generateSyntheticBimModel(1000);
const gen1000Ms = performance.now() - tGen1000_0;
console.log(`Génération 1 000 entités : ${gen1000Ms.toFixed(2)} ms | Breakdown:`, model1000.breakdown);

const dag1000 = DependencyGraph.build(model1000.state);
record(runBenchmark('DAG_BUILD_1000', () => DependencyGraph.build(model1000.state), { warmup: 3, iterations: 20 }), 'DAG', '1 000');
record(runBenchmark('DAG_CYCLE_1000', () => dag1000.hasCycle(), { warmup: 5, iterations: 20 }), 'DAG', '1 000');
record(runBenchmark('DAG_QUERY_1000', () => dag1000.getDependents('lvl_0'), { warmup: 5, iterations: 20 }), 'DAG', '1 000');

const wallId1000 = Object.keys(model1000.state.walls)[0];
const draft1000 = {
  ...model1000.state,
  walls: { ...model1000.state.walls, [wallId1000]: { ...model1000.state.walls[wallId1000], end: { x: 5050, y: 0 } } },
};
record(runBenchmark('VALIDATE_DIRTY_1000', () => validateDirty(draft1000, [wallId1000], model1000.state), { warmup: 3, iterations: 15 }), 'Validation', '1 000');

const doc1000 = new BimDocument(model1000.state);
record(runBenchmark('TX_UPDATE_WALL_1000', (i) => {
  doc1000.execute(new Commands.UpdateWallCommand(wallId1000, { heightOverride: 2800 + (i % 2 === 0 ? 50 : 0) }));
}, { warmup: 3, iterations: 10 }), 'Transactions', '1 000');

record(runBenchmark('TX_MOVE_WALL_1000', (i) => {
  doc1000.execute(new Commands.MoveWallCommand(wallId1000, { x: i % 2 === 0 ? 20 : -20, y: 0 }));
}, { warmup: 3, iterations: 10 }), 'Transactions', '1 000');

record(runBenchmark('TX_UNDO_REDO_1000', () => {
  doc1000.undo();
  doc1000.redo();
}, { warmup: 3, iterations: 10 }), 'Transactions', '1 000');

const walls1000 = Object.values(model1000.state.walls);
record(runBenchmark('GEO_RESOLVE_WALLS_1000', () => {
  for (const w of walls1000) resolveWallGeometry(w, model1000.state);
}, { warmup: 3, iterations: 10 }), 'Geometry', '1 000');

record(runBenchmark('VIEW3D_MESH_GEN_1000', () => {
  for (const w of walls1000) {
    const wt = model1000.state.wallTypes[w.typeId];
    createWallMeshWithOpenings({
      wall: { start: w.start, end: w.end },
      wallType: { thickness: wt.thickness, height: wt.height },
      openings: [],
    });
  }
}, { warmup: 2, iterations: 10 }), 'View3D', '1 000');

console.log('');

// ---------------------------------------------------------------------------
// PALIER L : 10 000 ENTITÉS
// ---------------------------------------------------------------------------
console.log('--- PALIER L : 10 000 ENTITÉS MULTI-CATÉGORIES ---');
const heapBefore = process.memoryUsage().heapUsed;
const tGen10000_0 = performance.now();
const model10000 = generateSyntheticBimModel(10000);
const gen10000Ms = performance.now() - tGen10000_0;
const heapLoaded = process.memoryUsage().heapUsed;
const modelMemMb = (heapLoaded - heapBefore) / (1024 * 1024);
console.log(`Génération 10 000 entités : ${gen10000Ms.toFixed(2)} ms | Heap modèle : ${modelMemMb.toFixed(2)} Mo`);
console.log('Breakdown 10 000 :', model10000.breakdown);

const dag10000 = DependencyGraph.build(model10000.state);
record(runBenchmark('DAG_BUILD_10000', () => DependencyGraph.build(model10000.state), { warmup: 1, iterations: 5 }), 'DAG', '10 000');
record(runBenchmark('DAG_CYCLE_10000', () => dag10000.hasCycle(), { warmup: 2, iterations: 10 }), 'DAG', '10 000');
record(runBenchmark('DAG_QUERY_10000', () => dag10000.getDependents('lvl_0'), { warmup: 2, iterations: 10 }), 'DAG', '10 000');

const wallId10000 = Object.keys(model10000.state.walls)[0];
const draft10000 = {
  ...model10000.state,
  walls: { ...model10000.state.walls, [wallId10000]: { ...model10000.state.walls[wallId10000], end: { x: 5050, y: 0 } } },
};
record(runBenchmark('VALIDATE_DIRTY_10000', () => validateDirty(draft10000, [wallId10000], model10000.state), { warmup: 1, iterations: 5 }), 'Validation', '10 000');

const doc10000 = new BimDocument(model10000.state);
record(runBenchmark('TX_UPDATE_WALL_10000', (i) => {
  doc10000.execute(new Commands.UpdateWallCommand(wallId10000, { heightOverride: 2800 + (i % 2 === 0 ? 50 : 0) }));
}, { warmup: 1, iterations: 5 }), 'Transactions', '10 000');

record(runBenchmark('TX_UNDO_REDO_10000', () => {
  doc10000.undo();
  doc10000.redo();
}, { warmup: 1, iterations: 5 }), 'Transactions', '10 000');

const walls10000 = Object.values(model10000.state.walls);
record(runBenchmark('GEO_RESOLVE_WALLS_10000', () => {
  for (const w of walls10000) resolveWallGeometry(w, model10000.state);
}, { warmup: 1, iterations: 5 }), 'Geometry', '10 000');

record(runBenchmark('VIEW3D_MESH_GEN_10000', () => {
  for (const w of walls10000) {
    const wt = model10000.state.wallTypes[w.typeId];
    createWallMeshWithOpenings({
      wall: { start: w.start, end: w.end },
      wallType: { thickness: wt.thickness, height: wt.height },
      openings: [],
    });
  }
}, { warmup: 1, iterations: 3 }), 'View3D', '10 000');

// Mesure de mémoire sous mutations successives
console.log('\n--- PROFIL MÉMOIRE SOUS STRESS TIER L (10 000 ENTITÉS) ---');
const heapBeforeTx = process.memoryUsage().heapUsed;
for (let i = 0; i < 20; i++) {
  doc10000.execute(new Commands.UpdateWallCommand(wallId10000, { heightOverride: 2800 + (i % 10) * 10 }));
}
const heapAfter20Tx = process.memoryUsage().heapUsed;
const txDeltaMb = (heapAfter20Tx - heapBeforeTx) / (1024 * 1024);

for (let i = 0; i < 20; i++) {
  doc10000.undo();
}
const heapAfter20Undo = process.memoryUsage().heapUsed;
const undoDeltaMb = (heapAfter20Undo - heapBeforeTx) / (1024 * 1024);

console.log(`Heap initial avant modèle : ${(heapBefore / (1024 * 1024)).toFixed(2)} Mo`);
console.log(`Heap modèle 10k chargé    : ${(heapLoaded / (1024 * 1024)).toFixed(2)} Mo (+${modelMemMb.toFixed(2)} Mo)`);
console.log(`Heap après 20 transactions : ${(heapAfter20Tx / (1024 * 1024)).toFixed(2)} Mo (+${txDeltaMb.toFixed(2)} Mo)`);
console.log(`Heap après 20 rollbacks    : ${(heapAfter20Undo / (1024 * 1024)).toFixed(2)} Mo (Delta résiduel: ${undoDeltaMb.toFixed(2)} Mo)`);

console.log('\n========================================================================');
console.log('TABLEAU SYNTHÉTIQUE FINAL (Percentiles P50 / P95)');
console.log('========================================================================');
console.log('| Palier | Catégorie     | Métrique                   | P50 (ms) | P95 (ms) | Moyenne  | Min      | Max      |');
console.log('|--------|---------------|----------------------------|----------|----------|----------|----------|----------|');
for (const m of allMetrics) {
  const tier = m.tier.padEnd(6);
  const cat = m.category.padEnd(13);
  const name = m.name.padEnd(26);
  const p50 = m.p50Ms.toFixed(2).padStart(8);
  const p95 = m.p95Ms.toFixed(2).padStart(8);
  const avg = m.avgMs.toFixed(2).padStart(8);
  const min = m.minMs.toFixed(2).padStart(8);
  const max = m.maxMs.toFixed(2).padStart(8);
  console.log(`| ${tier} | ${cat} | ${name} | ${p50} | ${p95} | ${avg} | ${min} | ${max} |`);
}
console.log('========================================================================\n');
