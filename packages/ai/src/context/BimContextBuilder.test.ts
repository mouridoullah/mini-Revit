import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BimDocument,
  AddWallCommand,
  AddDoorCommand,
  AddComponentCommand,
  fromJSON,
} from '@tabax/core';
import { buildBimContext, formatBimContextPrompt } from './BimContextBuilder.js';

describe('BimContextBuilder (ADR-073 Lot 1)', () => {
  it('extrait niveaux, catalogues et sélection active résolue sans exposer la géométrie brute', () => {
    const doc = BimDocument.createDefaultProject();
    const state0 = doc.getState();
    const levelId = Object.keys(state0.levels)[0]!;
    const wallTypeId = Object.keys(state0.wallTypes)[0]!;
    const doorTypeId = Object.keys(state0.doorTypes)[0]!;
    const compTypeId = Object.keys(state0.componentTypes ?? {})[0]!;

    doc.runTransaction('Setup', () => {
      doc.execute(
        new AddWallCommand({
          id: 'w_ctx_1',
          category: 'wall',
          typeId: wallTypeId,
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        }),
      );
      doc.execute(
        new AddDoorCommand({
          id: 'd_ctx_1',
          category: 'door',
          doorTypeId,
          hostWallId: 'w_ctx_1',
          offsetAlong: 1000,
          swing: { side: 'left', direction: 'in' },
        }),
      );
      doc.execute(
        new AddComponentCommand({
          id: 'c_ctx_1',
          category: 'component',
          typeId: compTypeId,
          levelId,
          placement: { x: 2000, y: 1500, rotation: 0 },
          name: 'Équipement test',
        }),
      );
    });

    const ctx = buildBimContext(doc.getState(), {
      activeLevelId: levelId,
      selectedIds: ['w_ctx_1', 'd_ctx_1', 'c_ctx_1', 'unknown_id'],
    });

    expect(ctx.schemaVersion).toBe(2);
    expect(ctx.units).toBe('mm');
    expect(ctx.activeLevelId).toBe(levelId);
    expect(ctx.levels).toHaveLength(1);
    expect(ctx.levels[0]?.id).toBe(levelId);
    expect(ctx.catalogs.wallTypes.length).toBeGreaterThan(0);
    expect(ctx.catalogs.doorTypes.length).toBeGreaterThan(0);
    expect(ctx.catalogs.windowTypes.length).toBeGreaterThan(0);
    expect(ctx.catalogs.componentTypes.length).toBeGreaterThan(0);
    expect(ctx.selectedElements).toEqual([
      { id: 'w_ctx_1', category: 'wall', levelId },
      { id: 'd_ctx_1', category: 'door', levelId },
      { id: 'c_ctx_1', category: 'component', levelId, label: 'Équipement test' },
    ]);
    expect(ctx.summary.wallCount).toBe(1);
    expect(ctx.summary.doorCount).toBe(1);
    expect(ctx.summary.componentCount).toBe(1);
  });

  it('respecte un budget de contexte strictement compact sur demo-immeuble-r4.json (~1,31 Mo)', () => {
    const demoPath = path.resolve(__dirname, '../../../../apps/web/public/demo-immeuble-r4.json');
    const rawJson = fs.readFileSync(demoPath, 'utf8');
    const state = fromJSON(rawJson);

    const ctx = buildBimContext(state, { activeLevelId: 'level_r0' });
    const serialized = formatBimContextPrompt(ctx);

    // Le contexte initial doit rester très inférieur à 16 Ko (vs ~1,31 Mo brut)
    expect(rawJson.length).toBeGreaterThan(1_000_000);
    expect(serialized.length).toBeLessThan(16_000);
    expect(ctx.levels.length).toBe(6);
    expect(ctx.summary.wallCount).toBeGreaterThan(20);
    expect(ctx.summary.pipeCount).toBeGreaterThan(50);
  });
});
