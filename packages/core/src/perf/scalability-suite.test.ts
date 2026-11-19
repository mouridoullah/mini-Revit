import { describe, it, expect } from 'vitest';
import { generateSyntheticBimModel } from './synthetic-generator.js';
import { runBenchmark, type BenchmarkMetrics } from './stats.js';
import { DependencyGraph } from '../dag/DependencyGraph.js';
import { BimDocument } from '../document.js';
import { validateDirty } from '../rules/dirty.js';
import * as Commands from '../commands.js';
import { resolveWallGeometry } from '../walls/resolve.js';

describe('Chantier 9.1 — Campagne de Scalabilité & Benchmarks Statistiques (100 / 1 000 / 10 000 Entités)', () => {
  const benchmarkResults: Record<string, BenchmarkMetrics> = {};

  // ---------------------------------------------------------------------------
  // 1. BANCS DU GRAPHE DE DÉPENDANCES (DAG)
  // ---------------------------------------------------------------------------
  describe('9.1.2-A : Performance du DAG (Construction, Détection de cycle, Traversée)', () => {
    it('Mesure la construction du DAG sur 100, 1 000 et 10 000 entités', () => {
      const model100 = generateSyntheticBimModel(100);
      const model1000 = generateSyntheticBimModel(1000);
      const model10000 = generateSyntheticBimModel(10000);

      const m100 = runBenchmark('DAG_BUILD_100', () => {
        DependencyGraph.build(model100.state);
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['DAG_BUILD_100'] = m100;

      const m1000 = runBenchmark('DAG_BUILD_1000', () => {
        DependencyGraph.build(model1000.state);
      }, { warmup: 2, iterations: 5 });
      benchmarkResults['DAG_BUILD_1000'] = m1000;

      const m10000 = runBenchmark('DAG_BUILD_10000', () => {
        DependencyGraph.build(model10000.state);
      }, { warmup: 1, iterations: 2 });
      benchmarkResults['DAG_BUILD_10000'] = m10000;

      expect(m100.p50Ms).toBeLessThan(10);
      expect(m1000.p50Ms).toBeLessThan(25);
      expect(m10000.p50Ms).toBeLessThan(200);
    });

    it('Mesure les requêtes de dépendance getDependents et cycle detection', () => {
      const model1000 = generateSyntheticBimModel(1000);
      const dag1000 = DependencyGraph.build(model1000.state);

      const mCycle = runBenchmark('DAG_CYCLE_CHECK_1000', () => {
        dag1000.hasCycle();
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['DAG_CYCLE_CHECK_1000'] = mCycle;

      const mQuery = runBenchmark('DAG_GET_DEPENDENTS_1000', () => {
        dag1000.getDependents('lvl_0');
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['DAG_GET_DEPENDENTS_1000'] = mQuery;

      expect(mCycle.p50Ms).toBeLessThan(5);
      expect(mQuery.p50Ms).toBeLessThan(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. VALIDATION DIFFÉRENTIELLE POST-CONDITION (validateDirty)
  // ---------------------------------------------------------------------------
  describe('9.1.2-B : Validation Différentielle Ciblée (validateDirty)', () => {
    it('Mesure le coût de validateDirty sur 100 et 1 000 éléments pour 1 mur muté', () => {
      const model100 = generateSyntheticBimModel(100);
      const wallId100 = Object.keys(model100.state.walls)[0]!;
      const draft100 = {
        ...model100.state,
        walls: {
          ...model100.state.walls,
          [wallId100]: {
            ...model100.state.walls[wallId100]!,
            end: { x: 5050, y: 0 },
          },
        },
      };

      const mVal100 = runBenchmark('VALIDATE_DIRTY_100_WALL', () => {
        validateDirty(draft100, [wallId100], model100.state);
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['VALIDATE_DIRTY_100_WALL'] = mVal100;

      const model1000 = generateSyntheticBimModel(1000);
      const wallId1000 = Object.keys(model1000.state.walls)[0]!;
      const draft1000 = {
        ...model1000.state,
        walls: {
          ...model1000.state.walls,
          [wallId1000]: {
            ...model1000.state.walls[wallId1000]!,
            end: { x: 5050, y: 0 },
          },
        },
      };

      const mVal1000 = runBenchmark('VALIDATE_DIRTY_1000_WALL', () => {
        validateDirty(draft1000, [wallId1000], model1000.state);
      }, { warmup: 2, iterations: 5 });
      benchmarkResults['VALIDATE_DIRTY_1000_WALL'] = mVal1000;

      expect(mVal100.p50Ms).toBeLessThan(10);
      expect(mVal1000.p50Ms).toBeLessThan(100);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TRANSACTIONS & COMMAND BUS (BimDocument.execute)
  // ---------------------------------------------------------------------------
  describe('9.1.2-C : Exécution de Commandes Transactionnelles', () => {
    it('Mesure UpdateWallCommand sur 100 et 1 000 entités', () => {
      const doc100 = new BimDocument(generateSyntheticBimModel(100).state);
      const wallId100 = Object.keys(doc100.getState().walls)[0]!;

      const mTx100 = runBenchmark('TX_UPDATE_WALL_100', (i) => {
        doc100.execute(new Commands.UpdateWallCommand(wallId100, { heightOverride: 2900 + (i % 2 === 0 ? 10 : 0) }));
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['TX_UPDATE_WALL_100'] = mTx100;

      const doc1000 = new BimDocument(generateSyntheticBimModel(1000).state);
      const wallId1000 = Object.keys(doc1000.getState().walls)[0]!;

      const mTx1000 = runBenchmark('TX_UPDATE_WALL_1000', (i) => {
        doc1000.execute(new Commands.UpdateWallCommand(wallId1000, { heightOverride: 2900 + (i % 2 === 0 ? 10 : 0) }));
      }, { warmup: 1, iterations: 3 });
      benchmarkResults['TX_UPDATE_WALL_1000'] = mTx1000;

      expect(mTx100.p50Ms).toBeLessThan(50);
      expect(mTx1000.p50Ms).toBeLessThan(1200);
    });

    it('Mesure les cycles d’annulation Undo / Redo sur 1 000 éléments', () => {
      const doc = new BimDocument(generateSyntheticBimModel(1000).state);
      const wallId = Object.keys(doc.getState().walls)[0]!;
      doc.execute(new Commands.UpdateWallCommand(wallId, { heightOverride: 3100 }));

      const mUndo = runBenchmark('TX_UNDO_REDO_1000', () => {
        doc.undo();
        doc.redo();
      }, { warmup: 3, iterations: 10 });
      benchmarkResults['TX_UNDO_REDO_1000'] = mUndo;

      expect(mUndo.p50Ms).toBeLessThan(15);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. RÉSOLUTION GÉOMÉTRIQUE PURE
  // ---------------------------------------------------------------------------
  describe('9.1.3 : Performance de Résolution Géométrique (resolveWallGeometry)', () => {
    it('Mesure la résolution géométrique de 400 murs avec baies', () => {
      const model = generateSyntheticBimModel(1000);
      const walls = Object.values(model.state.walls);

      const mResolve = runBenchmark('GEO_RESOLVE_1000_WALLS', () => {
        for (const wall of walls) {
          resolveWallGeometry(wall, model.state);
        }
      }, { warmup: 2, iterations: 5 });
      benchmarkResults['GEO_RESOLVE_1000_WALLS'] = mResolve;

      expect(mResolve.p50Ms).toBeLessThan(150);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. EMPREINTE MÉMOIRE & STABILITÉ
  // ---------------------------------------------------------------------------
  describe('9.1.5 : Empreinte Mémoire & Stabilité (Sur 10 000 Entités)', () => {
    it('Vérifie la compacité mémoire du modèle 10 000 et le delta après mutations', () => {
      const heapBefore = process.memoryUsage().heapUsed;
      const { state } = generateSyntheticBimModel(10000);
      const doc = new BimDocument(state);
      const heapLoaded = process.memoryUsage().heapUsed;
      const modelMemMb = (heapLoaded - heapBefore) / (1024 * 1024);

      // Le modèle de 10 000 entités pèse moins de 25 Mo
      expect(modelMemMb).toBeLessThan(25);

      // 1 transaction et 1 undo sur le modèle 10k
      const wallId = Object.keys(doc.getState().walls)[0]!;
      doc.execute(new Commands.UpdateWallCommand(wallId, { heightOverride: 2850 }));
      doc.undo();

      const heapAfter = process.memoryUsage().heapUsed;
      const deltaMb = (heapAfter - heapLoaded) / (1024 * 1024);
      expect(deltaMb).toBeLessThan(80);
    }, 20000);
  });
});
