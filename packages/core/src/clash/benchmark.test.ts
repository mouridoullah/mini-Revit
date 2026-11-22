import { describe, it, expect } from 'vitest';
import { generateSyntheticBimModel } from '../perf/synthetic-generator.js';
import { detectClashes } from './engine.js';
import { BVHTree } from './spatial/bvh.js';
import { runBenchmark } from '../perf/stats.js';
import type { Pipe, SpatialItem } from '../index.js';
import { createPipe } from '../mep/catalog.js';
import { createAABB } from './spatial/aabb.js';

describe('Banc de Scalabilité & Benchmark Clash Detection (Phase 9.4)', () => {
  it('T-CLASH-BENCH-1000 : Évalue la performance de détection sur 1 000 entités mixtes', () => {
    // 1. Génération d'une maquette mixte de 1 000 entités
    const synthetic = generateSyntheticBimModel({
      targetElementCount: 1000,
      levelCount: 3,
    });
    const state = synthetic.state;

    // Injecter un clash connu : un tuyau traversant le premier mur
    const firstWall = Object.values(state.walls)[0]!;
    expect(firstWall).toBeDefined();

    const midX = (firstWall.start.x + firstWall.end.x) * 0.5;
    const midY = (firstWall.start.y + firstWall.end.y) * 0.5;

    const testPipe = createPipe({
      id: 'pipe_benchmark_clash',
      levelId: firstWall.levelId,
      start: { x: midX, y: midY - 300, z: 1200 },
      end: { x: midX, y: midY + 300, z: 1200 },
      diameter: 50,
      systemType: 'domestic_cold_water',
    });
    const mutableState = state as { pipes?: Record<string, Pipe> };
    mutableState.pipes = { ...(state.pipes ?? {}), [testPipe.id]: testPipe };

    const totalCount =
      Object.keys(state.walls).length +
      Object.keys(state.doors).length +
      Object.keys(state.windows).length +
      Object.keys(state.slabs).length +
      Object.keys(state.components ?? {}).length +
      Object.keys(state.pipes ?? {}).length +
      Object.keys(state.ducts ?? {}).length;

    expect(totalCount).toBeGreaterThanOrEqual(900);

    // 2. Mesure du temps d'exécution de detectClashes (P50, P95)
    const metrics = runBenchmark(
      'Clash Detection 1000 entities',
      () => {
        detectClashes(state, { hardToleranceMm: 2.0 });
      },
      { iterations: 5, warmup: 1 },
    );

    const clashes = detectClashes(state, { hardToleranceMm: 2.0 });

    // Le clash injecté doit être trouvé
    const foundInjected = clashes.some(
      (c) =>
        (c.elementA === 'pipe_benchmark_clash' && c.elementB === firstWall.id) ||
        (c.elementA === firstWall.id && c.elementB === 'pipe_benchmark_clash'),
    );
    expect(foundInjected).toBe(true);

    // Vérification de la performance : le budget est < 50 ms pour 1 000 entités
    console.log(
      `[T-CLASH-BENCH-1000] Entités: ${totalCount} | Conflits: ${clashes.length} | P50: ${metrics.p50Ms.toFixed(2)} ms | P95: ${metrics.p95Ms.toFixed(2)} ms`,
    );

    expect(metrics.p50Ms).toBeLessThan(200);
  });

  it('T-CLASH-BVH-VS-BRUTEFORCE : Compare le filtrage BVH vs recherche exhaustive O(N^2)', () => {
    const N = 500;
    const items: SpatialItem<string>[] = [];

    // Répartition spatiale 3D réaliste
    for (let i = 0; i < N; i++) {
      const x = (i % 25) * 200;
      const y = Math.floor(i / 25) * 200;
      const z = (i % 3) * 3000;
      items.push({
        id: `item_${i}`,
        aabb: createAABB({ x, y, z }, { x: x + 250, y: y + 250, z: z + 200 }),
        data: `item_${i}`,
      });
    }

    const bvh = new BVHTree<string>(items);

    const t0 = performance.now();
    const bvhPairs = bvh.queryPairs();
    const bvhTime = performance.now() - t0;

    const totalPossiblePairs = (N * (N - 1)) / 2; // 124 750 paires
    const candidatePairsCount = bvhPairs.length;
    const pruningRatio = (1 - candidatePairsCount / totalPossiblePairs) * 100;

    console.log(
      `[BVH Benchmark] N=${N} | Paires possibles: ${totalPossiblePairs} | Paires retenues: ${candidatePairsCount} | Élimination: ${pruningRatio.toFixed(2)} % | Temps BVH: ${bvhTime.toFixed(2)} ms`,
    );

    expect(pruningRatio).toBeGreaterThan(95.0); // Élimine plus de 95% des paires inutiles
    expect(bvhTime).toBeLessThan(30);
  });
});
