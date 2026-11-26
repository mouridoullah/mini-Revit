import { describe, it, expect } from 'vitest';
import { BimDocument, AddWallCommand } from '@tabax/core';
import {
  ALL_COPILOT_TOOLS,
  createFullCopilotRegistry,
  PHASE2_MUTATE_TOOLS,
  type PlannedStep,
} from '../index.js';

function setupSandbox(): {
  doc: BimDocument;
  levelId: string;
  wallTypeId: string;
  compTypeId: string;
} {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();
  const levelId = Object.keys(state.levels)[0]!;
  const wallTypeId = Object.keys(state.wallTypes)[0]!;
  const compTypeId = Object.keys(state.componentTypes ?? {})[0]!;
  return { doc, levelId, wallTypeId, compTypeId };
}

describe('12 outils de mutation Phase 2 & descripteurs PlannedStep (ADR-073 Lot 2)', () => {
  it('enregistre 17 outils (5 read + 12 mutate) avec schémas JSON strictement plats', () => {
    const registry = createFullCopilotRegistry();
    expect(registry.list('read')).toHaveLength(5);
    expect(registry.list('mutate')).toHaveLength(12);
    expect(ALL_COPILOT_TOOLS).toHaveLength(17);

    for (const tool of PHASE2_MUTATE_TOOLS) {
      expect(tool.mode).toBe('mutate');
      for (const prop of Object.values(tool.parameters.properties)) {
        expect(typeof prop.type).toBe('string');
        expect(Array.isArray(prop.type)).toBe(false);
        expect('anyOf' in prop).toBe(false);
      }
    }
  });

  it('add_wall résout typeId par défaut, fige l’ULID dans PlannedStep et rejette NaN/ID inconnu', () => {
    const { doc, levelId } = setupSandbox();
    const registry = createFullCopilotRegistry();
    const steps: PlannedStep[] = [];

    const badNum = registry.execute(
      'add_wall',
      { levelId, startXMm: Number.NaN, startYMm: 0, endXMm: 4000, endYMm: 0 },
      { doc },
    );
    expect(badNum.ok).toBe(false);
    if (!badNum.ok) expect(badNum.code).toBe('INVALID_ARGUMENTS');

    const badLevel = registry.execute(
      'add_wall',
      { levelId: 'unknown_lvl', startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 },
      { doc },
    );
    expect(badLevel.ok).toBe(false);
    if (!badLevel.ok) {
      expect(badLevel.code).toBe('UNKNOWN_LEVEL');
      expect(badLevel.validIds).toEqual([levelId]);
    }

    const res = registry.execute(
      'add_wall',
      { levelId, startXMm: 0, startYMm: 0, endXMm: 4000, endYMm: 0 },
      { doc, onPlanStep: (s) => steps.push(s) },
    );
    expect(res.ok).toBe(true);
    expect(steps).toHaveLength(1);
    const createdId = steps[0]!.createdIds[0]!;
    expect(doc.getState().walls[createdId]).toBeDefined();
    expect((steps[0]!.normalizedArgs as Record<string, unknown>).typeId).toBeDefined();
  });

  it('update_wall gère heightMm, resetHeightToAuto et rejette la combinaison contradictoire', () => {
    const { doc, levelId, wallTypeId } = setupSandbox();
    doc.execute(
      new AddWallCommand({
        id: 'w_upd',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    const registry = createFullCopilotRegistry();

    const conflict = registry.execute(
      'update_wall',
      { wallId: 'w_upd', heightMm: 3000, resetHeightToAuto: true },
      { doc },
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe('INVALID_ARGUMENTS');

    const setHeight = registry.execute('update_wall', { wallId: 'w_upd', heightMm: 3200 }, { doc });
    expect(setHeight.ok).toBe(true);
    expect(doc.getState().walls['w_upd']?.heightOverride).toBe(3200);

    const reset = registry.execute(
      'update_wall',
      { wallId: 'w_upd', resetHeightToAuto: true },
      { doc },
    );
    expect(reset.ok).toBe(true);
    expect(doc.getState().walls['w_upd']?.heightOverride).toBeUndefined();
  });

  it('add_door, add_window, move_opening (absolu/relatif) et delete_opening fonctionnent avec validation', () => {
    const { doc, levelId, wallTypeId } = setupSandbox();
    doc.execute(
      new AddWallCommand({
        id: 'w_open',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );
    const registry = createFullCopilotRegistry();
    const steps: PlannedStep[] = [];
    const ctx = { doc, onPlanStep: (s: PlannedStep) => steps.push(s) };

    const doorRes = registry.execute('add_door', { hostWallId: 'w_open', offsetAlongMm: 500 }, ctx);
    expect(doorRes.ok).toBe(true);
    const doorId = (doorRes as { ok: true; data: { doorId: string } }).data.doorId;

    const winRes = registry.execute('add_window', { hostWallId: 'w_open', offsetAlongMm: 3000 }, ctx);
    expect(winRes.ok).toBe(true);
    const windowId = (winRes as { ok: true; data: { windowId: string } }).data.windowId;

    // Rejeter si les deux modes ou aucun sont fournis
    expect(
      registry.execute(
        'move_opening',
        { openingId: doorId, newOffsetAlongMm: 800, deltaOffsetMm: 100 },
        ctx,
      ).ok,
    ).toBe(false);
    expect(registry.execute('move_opening', { openingId: doorId }, ctx).ok).toBe(false);

    // Mode relatif
    const relMove = registry.execute('move_opening', { openingId: doorId, deltaOffsetMm: 300 }, ctx);
    expect(relMove.ok).toBe(true);
    expect(doc.getState().doors[doorId]?.offsetAlong).toBe(800);

    // Mode absolu
    const absMove = registry.execute(
      'move_opening',
      { openingId: windowId, newOffsetAlongMm: 3500 },
      ctx,
    );
    expect(absMove.ok).toBe(true);
    expect(doc.getState().windows[windowId]?.offsetAlong).toBe(3500);

    // BimValidationError structuré si hors bornes du mur
    const badMove = registry.execute(
      'move_opening',
      { openingId: doorId, newOffsetAlongMm: 99_000 },
      ctx,
    );
    expect(badMove.ok).toBe(false);
    if (!badMove.ok) {
      expect(badMove.code).toBeTruthy();
      expect(doc.getState().doors[doorId]?.offsetAlong).toBe(800);
    }

    const delRes = registry.execute('delete_opening', { openingId: doorId }, ctx);
    expect(delRes.ok).toBe(true);
    expect(doc.getState().doors[doorId]).toBeUndefined();
  });

  it('add_component convertit rotationDeg en radians et valide typeId contre componentTypes', () => {
    const { doc, levelId, compTypeId } = setupSandbox();
    const registry = createFullCopilotRegistry();

    const badType = registry.execute(
      'add_component',
      { levelId, typeId: 'type_bidon', xMm: 1000, yMm: 1000 },
      { doc },
    );
    expect(badType.ok).toBe(false);
    if (!badType.ok) {
      expect(badType.code).toBe('UNKNOWN_COMPONENT_TYPE');
      expect(badType.validIds).toContain(compTypeId);
    }

    const res = registry.execute(
      'add_component',
      { levelId, typeId: compTypeId, xMm: 1200, yMm: 1400, rotationDeg: -90 },
      { doc },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const compId = (res.data as { componentId: string }).componentId;
      const comp = doc.getState().components?.[compId];
      expect(comp?.placement.rotation).toBeCloseTo((270 * Math.PI) / 180, 6);
    }
  });

  it('couvre move_wall, delete_wall, add_room, auto_dimension_level et auto_generate_views', () => {
    const { doc, levelId, wallTypeId } = setupSandbox();
    const registry = createFullCopilotRegistry();

    // Boucle fermée 4 x 3 m pour add_room + cotes + coupes
    const walls = [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } },
      { id: 'w2', start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
      { id: 'w3', start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 } },
      { id: 'w4', start: { x: 0, y: 3000 }, end: { x: 0, y: 0 } },
    ];
    for (const w of walls) {
      doc.execute(new AddWallCommand({ ...w, category: 'wall', typeId: wallTypeId, levelId }));
    }

    expect(
      registry.execute('add_room', { levelId, name: 'Salon', seedXMm: 2000, seedYMm: 1500 }, { doc })
        .ok,
    ).toBe(true);
    expect(registry.execute('auto_dimension_level', { levelId }, { doc }).ok).toBe(true);
    expect(registry.execute('auto_generate_views', {}, { doc }).ok).toBe(true);
    expect(
      registry.execute('move_wall', { wallId: 'w2', deltaXMm: 500, deltaYMm: 0 }, { doc }).ok,
    ).toBe(true);
    expect(doc.getState().walls['w2']?.start.x).toBe(4500);

    // Vérifier delete_wall sur un mur isolé
    doc.execute(
      new AddWallCommand({
        id: 'w_extra',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 8000, y: 0 },
        end: { x: 9000, y: 0 },
      }),
    );
    expect(registry.execute('delete_wall', { wallId: 'w_extra' }, { doc }).ok).toBe(true);
    expect(doc.getState().walls['w_extra']).toBeUndefined();
  });
});
