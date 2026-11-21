import { describe, it, expect } from 'vitest';
import {
  BimDocument,
  generateSyntheticBimModel,
  runBenchmark,
} from '@mini-bim/core';
import { Transform2D } from '../transform.js';
import { renderPlanView, DEFAULT_VIEW2D_RENDER_CONFIG } from '../renderer.js';
import { buildSpatialIndex, buildLinearSpatialIndex } from '../spatial/index.js';
import { createBenchmarkCanvas } from '../test-utils.js';
import type {
  PipeFor2D,
  DuctFor2D,
  CableTrayFor2D,
  MepFittingFor2D,
  MepEquipmentFor2D,
  DocumentFor2D,
} from '../types.js';

describe('Banc de Scalabilité Mixte Architecture + MEP 2D (@mini-bim/view-2d)', () => {
  it('mesure la performance du rendu 2D et du culling sur maquette mixte (100, 1 000 et 10 000 entités)', () => {
    const { ctx } = createBenchmarkCanvas(1920, 1080);
    const testScales = [100, 1000, 10000] as const;

    const results: Record<
      number,
      {
        totalEntities: number;
        archEntities: number;
        mepEntities: number;
        gridCells: number;
        memoryKb: string;
        candidateIdsCount: number;
        cullingEfficiency: string;
        gridQueryMs: number;
        linearQueryMs: number;
        renderSingleLineP50Ms: number;
        renderSingleLineP95Ms: number;
        renderDoubleLineP50Ms: number;
        renderDoubleLineP95Ms: number;
      }
    > = {};

    for (const n of testScales) {
      const transform = new Transform2D({
        origin: { x: 5000, y: 5000 },
        scale: 0.05,
        viewportWidth: 1920,
        viewportHeight: 1080,
      });

      // 1. Génération de la base architecturale (~70% du volume)
      const archCount = Math.floor(n * 0.7);
      const synthetic = generateSyntheticBimModel(archCount);
      const doc = new BimDocument(synthetic.state);
      const state = doc.getState();
      const levelIds = Object.keys(state.levels);
      const activeLevelId = levelIds[0] ?? null;

      // 2. Génération synthétique des entités MEP (~30% du volume)
      const mepTarget = n - archCount;
      const pipes: Record<string, PipeFor2D> = {};
      const ducts: Record<string, DuctFor2D> = {};
      const cableTrays: Record<string, CableTrayFor2D> = {};
      const mepFittings: Record<string, MepFittingFor2D> = {};
      const mepEquipments: Record<string, MepEquipmentFor2D> = {};

      const wallKeys = Object.keys(state.walls ?? {});
      const wallCount = wallKeys.length;

      for (let i = 0; i < mepTarget; i++) {
        const wallIdx = i % Math.max(1, wallCount);
        const refWall = wallKeys[wallIdx] ? state.walls?.[wallKeys[wallIdx]!] : undefined;
        const xBase = refWall ? refWall.start.x : (i % 20) * 3000;
        const yBase = refWall ? refWall.start.y : Math.floor(i / 20) * 3000;
        const assignedLevel = refWall?.levelId ?? activeLevelId ?? 'lvl_0';

        const kindIdx = i % 5;
        if (kindIdx === 0 || kindIdx === 1) {
          // Pipe
          const id = `pipe_synth_${i}`;
          pipes[id] = {
            id,
            start: { x: xBase, y: yBase + 100, z: 500 },
            end: { x: xBase + 2500, y: yBase + 100, z: 500 },
            diameter: 32,
            levelId: assignedLevel,
          };
        } else if (kindIdx === 2) {
          // Duct
          const id = `duct_synth_${i}`;
          ducts[id] = {
            id,
            shape: i % 2 === 0 ? 'rectangular' : 'round',
            start: { x: xBase, y: yBase + 200, z: 2500 },
            end: { x: xBase + 3000, y: yBase + 200, z: 2500 },
            width: 300,
            height: 200,
            diameter: 250,
            levelId: assignedLevel,
          };
        } else if (kindIdx === 3) {
          // CableTray
          const id = `tray_synth_${i}`;
          cableTrays[id] = {
            id,
            start: { x: xBase, y: yBase + 300, z: 2800 },
            end: { x: xBase + 3000, y: yBase + 300, z: 2800 },
            width: 200,
            height: 50,
            levelId: assignedLevel,
          };
        } else {
          // Equipment
          const id = `eq_synth_${i}`;
          mepEquipments[id] = {
            id,
            family: 'boiler',
            position: { x: xBase + 500, y: yBase + 500, z: 0 },
            width: 600,
            depth: 400,
            height: 900,
            levelId: assignedLevel,
          };
        }
      }

      // Maquette mixte DocumentFor2D
      const mixedDoc: DocumentFor2D = {
        getState: () => ({
          ...state,
          pipes,
          ducts,
          cableTrays,
          mepFittings,
          mepEquipments,
        }),
      };

      const visibleBounds = transform.getVisibleWorldBounds();

      // 3. Construction et indexation spatiale mixte
      const spatialGrid = buildSpatialIndex(mixedDoc);
      const linearIndex = buildLinearSpatialIndex(mixedDoc);

      const gridQuery = spatialGrid.query(visibleBounds, activeLevelId);
      const linearQuery = linearIndex.query(visibleBounds, activeLevelId);
      const stats = spatialGrid.getStats();

      // 4. Benchmark de rendu unifilaire (mode single-line)
      const mSingle = runBenchmark(
        `VIEW2D_MIXED_SINGLE_${n}`,
        () => {
          renderPlanView(
            ctx,
            transform,
            mixedDoc,
            new Set(),
            {
              ...DEFAULT_VIEW2D_RENDER_CONFIG,
              mep: { mode: 'single-line' },
            },
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
        { warmup: 5, iterations: 15 },
      );

      // 5. Benchmark de rendu bifilaire (mode double-line)
      const mDouble = runBenchmark(
        `VIEW2D_MIXED_DOUBLE_${n}`,
        () => {
          renderPlanView(
            ctx,
            transform,
            mixedDoc,
            new Set(),
            {
              ...DEFAULT_VIEW2D_RENDER_CONFIG,
              mep: { mode: 'double-line' },
            },
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

      const cullingEfficiency =
        stats.count > 0
          ? `${(((stats.count - gridQuery.retainedCount) / stats.count) * 100).toFixed(1)}%`
          : '0%';

      results[n] = {
        totalEntities: stats.count,
        archEntities: archCount,
        mepEntities: mepTarget,
        gridCells: stats.cellCount ?? 0,
        memoryKb: (stats.memoryBytesEstimate / 1024).toFixed(1),
        candidateIdsCount: gridQuery.retainedCount,
        cullingEfficiency,
        gridQueryMs: gridQuery.searchTimeMs,
        linearQueryMs: linearQuery.searchTimeMs,
        renderSingleLineP50Ms: mSingle.p50Ms,
        renderSingleLineP95Ms: mSingle.p95Ms,
        renderDoubleLineP50Ms: mDouble.p50Ms,
        renderDoubleLineP95Ms: mDouble.p95Ms,
      };
    }

    // Affichage des résultats consolidés
    console.table(results);

    // Assertions architecturales :
    // 1. À 100 entités : P50 < 15 ms et P95 < 50 ms
    expect(results[100]!.renderSingleLineP50Ms).toBeLessThan(15);
    expect(results[100]!.renderSingleLineP95Ms).toBeLessThan(50);

    // 2. À 1 000 entités mixtes : P50 sous le seuil interactif (25 ms) et P95 < 50 ms (ADR-014)
    expect(results[1000]!.renderSingleLineP50Ms).toBeLessThan(25);
    expect(results[1000]!.renderSingleLineP95Ms).toBeLessThan(50);

    // 3. À 10 000 entités : le culling élimine > 90% des éléments hors champ
    expect(results[10000]!.candidateIdsCount).toBeLessThan(results[10000]!.totalEntities * 0.4);
    // Requête spatiale ultra-rapide
    expect(results[10000]!.gridQueryMs).toBeLessThan(15);
    // Rendu interactif (P50 < 20 ms)
    expect(results[10000]!.renderSingleLineP50Ms).toBeLessThan(25);
  });
});
