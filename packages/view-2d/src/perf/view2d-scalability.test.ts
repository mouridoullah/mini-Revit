import { describe, it, expect } from 'vitest';
import { BimDocument, generateSyntheticBimModel, runBenchmark } from '@tabax/core';
import { Transform2D } from '../transform.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from '../renderer.js';
import { buildSpatialIndex, buildLinearSpatialIndex } from '../spatial/index.js';
import { createBenchmarkCanvas } from '../test-utils.js';

describe('Banc de Scalabilité et Performance du Rendu 2D Canvas (@tabax/view-2d)', () => {
  it('Évalue la scalabilité du culling spatial 2D sur 100, 1 000 et 10 000 entités (P50, P95, Pan, Zoom, Niveau)', () => {
    const { ctx } = createBenchmarkCanvas(1920, 1080);

    const testScales = [100, 1000, 10000] as const;
    const results: Record<
      number,
      {
        totalIndexed: number;
        gridCells: number;
        memoryKb: string;
        traversedCount: number;
        retainedCount: number;
        cullingEfficiency: string;
        gridQueryMs: number;
        linearQueryMs: number;
        renderP50Ms: number;
        renderP95Ms: number;
        panP50Ms: number;
        zoomP50Ms: number;
        levelSwitchP50Ms: number;
      }
    > = {};

    for (const n of testScales) {
      const transform = new Transform2D({
        origin: { x: 5000, y: 5000 },
        scale: 0.05,
        viewportWidth: 1920,
        viewportHeight: 1080,
      });

      // 1. Génération de la maquette synthétique réaliste
      const synthetic = generateSyntheticBimModel(n);
      const doc = new BimDocument(synthetic.state);
      const state = doc.getState();
      const levelIds = Object.keys(state.levels);
      const activeLevelId = levelIds[0] ?? null;
      const nextLevelId = levelIds[1] ?? activeLevelId;

      const visibleBounds = transform.getVisibleWorldBounds();

      // 2. Construction et indexation spatiale
      const spatialGrid = buildSpatialIndex(doc);
      const linearIndex = buildLinearSpatialIndex(doc);

      // 3. Comparaison métrologique des index (requête de champ visible)
      const gridQuery = spatialGrid.query(visibleBounds, activeLevelId);
      const linearQuery = linearIndex.query(visibleBounds, activeLevelId);
      const stats = spatialGrid.getStats();

      // 4. Rendu 2D Canvas standard
      const mRender = runBenchmark(
        `VIEW2D_RENDER_${n}`,
        () => {
          renderPlanView(
            ctx,
            transform,
            doc,
            new Set(),
            DEFAULT_VIEW2D_RENDER_CONFIG,
            activeLevelId,
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            null,
            undefined,
            undefined,
            { enableCulling: true, spatialIndex: spatialGrid },
          );
        },
        { warmup: 8, iterations: 20 },
      );

      // 5. Test de fluidité en Pan (translation de vue interactive)
      const mPan = runBenchmark(
        `VIEW2D_PAN_${n}`,
        (i) => {
          transform.panByScreen({ x: i % 2 === 0 ? 40 : -40, y: 20 });
          renderPlanView(
            ctx,
            transform,
            doc,
            new Set(),
            DEFAULT_VIEW2D_RENDER_CONFIG,
            activeLevelId,
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            null,
            undefined,
            undefined,
            { enableCulling: true, spatialIndex: spatialGrid },
          );
        },
        { warmup: 3, iterations: 10 },
      );

      // 6. Test de fluidité en Zoom (changement d'échelle centré)
      const mZoom = runBenchmark(
        `VIEW2D_ZOOM_${n}`,
        (i) => {
          transform.zoomAt({ x: 960, y: 540 }, i % 2 === 0 ? 1.02 : 0.98);
          renderPlanView(
            ctx,
            transform,
            doc,
            new Set(),
            DEFAULT_VIEW2D_RENDER_CONFIG,
            activeLevelId,
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            null,
            undefined,
            undefined,
            { enableCulling: true, spatialIndex: spatialGrid },
          );
        },
        { warmup: 3, iterations: 10 },
      );

      // 7. Test de basculement de niveau actif (Level Switch)
      const mLevel = runBenchmark(
        `VIEW2D_LEVEL_SWITCH_${n}`,
        () => {
          renderPlanView(
            ctx,
            transform,
            doc,
            new Set(),
            DEFAULT_VIEW2D_RENDER_CONFIG,
            nextLevelId,
            null,
            undefined,
            undefined,
            undefined,
            undefined,
            null,
            undefined,
            undefined,
            { enableCulling: true, spatialIndex: spatialGrid },
          );
        },
        { warmup: 3, iterations: 10 },
      );

      const cullingEfficiency =
        stats.count > 0
          ? `${(((stats.count - gridQuery.retainedCount) / stats.count) * 100).toFixed(1)}%`
          : '0%';

      results[n] = {
        totalIndexed: stats.count,
        gridCells: stats.cellCount ?? 0,
        memoryKb: (stats.memoryBytesEstimate / 1024).toFixed(1),
        traversedCount: gridQuery.traversedCount,
        retainedCount: gridQuery.retainedCount,
        cullingEfficiency,
        gridQueryMs: gridQuery.searchTimeMs,
        linearQueryMs: linearQuery.searchTimeMs,
        renderP50Ms: mRender.p50Ms,
        renderP95Ms: mRender.p95Ms,
        panP50Ms: mPan.p50Ms,
        zoomP50Ms: mZoom.p50Ms,
        levelSwitchP50Ms: mLevel.p50Ms,
      };
    }

    // Affichage formaté des résultats consolidés dans les logs de test
    console.table(results);

    // Assertions de performance et garanties architecturales

    // 1. Modèle 100 entités : ultra-réactif (< 10 ms P95 nominal, seuil CI 35 ms)
    expect(results[100]!.renderP95Ms).toBeLessThan(35);

    // 2. Modèle 1 000 entités (Scénario de référence) : P50 sous le budget 60 FPS (16,67 ms) et P95 sous le seuil interactif ADR-014
    expect(results[1000]!.renderP50Ms).toBeLessThan(16.7);
    expect(results[1000]!.renderP95Ms).toBeLessThan(75);
    expect(results[1000]!.panP50Ms).toBeLessThan(16.7);
    expect(results[1000]!.zoomP50Ms).toBeLessThan(16.7);
    expect(results[1000]!.levelSwitchP50Ms).toBeLessThan(16.7);

    // 3. Modèle 10 000 entités : le culling élimine la grande majorité des éléments hors champ
    expect(results[10000]!.retainedCount).toBeLessThan(results[10000]!.totalIndexed * 0.4);
    // Le temps de requête avec index spatial est très rapide (< 15 ms sur 10 000 entités)
    expect(results[10000]!.gridQueryMs).toBeLessThan(15);
  });
});
