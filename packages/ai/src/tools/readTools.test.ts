import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BimDocument,
  AddWallCommand,
  AddDoorCommand,
  AddWindowCommand,
  AddSlabCommand,
  AddComponentCommand,
  AddRoomCommand,
  fromJSON,
} from '@tabax/core';
import { createPhase1ReadRegistry, PHASE1_READ_TOOLS } from './readTools.js';

function createSampleDocument(): {
  doc: BimDocument;
  levelId: string;
  wallEastWestId: string;
  wallNorthSouthId: string;
} {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();
  const levelId = Object.keys(state.levels)[0]!;
  const wallTypeId = Object.keys(state.wallTypes)[0]!;
  const slabTypeId = Object.keys(state.slabTypes)[0]!;
  const doorTypeId = Object.keys(state.doorTypes)[0]!;
  const windowTypeId = Object.keys(state.windowTypes)[0]!;
  const compTypeId = Object.keys(state.componentTypes ?? {})[0]!;

  const wallEastWestId = 'w_south';
  const wallNorthSouthId = 'w_east';

  doc.runTransaction('Sample house', () => {
    // Rectangle fermé 4000 x 3000 mm
    doc.execute(
      new AddWallCommand({
        id: wallEastWestId,
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: wallNorthSouthId,
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_north',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 4000, y: 3000 },
        end: { x: 0, y: 3000 },
      }),
    );
    doc.execute(
      new AddWallCommand({
        id: 'w_west',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 3000 },
        end: { x: 0, y: 0 },
      }),
    );
    doc.execute(
      new AddDoorCommand({
        id: 'door_1',
        category: 'door',
        doorTypeId,
        hostWallId: wallEastWestId,
        offsetAlong: 400,
        swing: { side: 'left', direction: 'in' },
      }),
    );
    doc.execute(
      new AddWindowCommand({
        id: 'win_1',
        category: 'window',
        windowTypeId,
        hostWallId: wallEastWestId,
        offsetAlong: 2200,
        sillHeight: 900,
      }),
    );
    doc.execute(
      new AddSlabCommand({
        id: 'slab_1',
        category: 'slab',
        slabTypeId,
        levelId,
        boundary: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
      }),
    );
    doc.execute(
      new AddComponentCommand({
        id: 'comp_1',
        category: 'component',
        typeId: compTypeId,
        levelId,
        placement: { x: 1500, y: 1500, rotation: Math.PI / 2 },
      }),
    );
    doc.execute(
      new AddRoomCommand({
        id: 'room_1',
        category: 'room',
        levelId,
        name: 'Séjour',
        seed: { x: 2000, y: 1500 },
      }),
    );
  });

  return { doc, levelId, wallEastWestId, wallNorthSouthId };
}

describe('ToolRegistry & 5 outils Phase 1 en lecture seule (ADR-073 Lot 1)', () => {
  it('expose des schémas JSON strictement plats en mode read', () => {
    const registry = createPhase1ReadRegistry();
    const schemas = registry.list('read');
    expect(schemas).toHaveLength(5);
    expect(registry.list('mutate')).toHaveLength(0);

    for (const tool of PHASE1_READ_TOOLS) {
      expect(tool.mode).toBe('read');
      for (const prop of Object.values(tool.parameters.properties)) {
        expect(typeof prop.type).toBe('string');
        expect(Array.isArray(prop.type)).toBe(false);
        expect('anyOf' in prop).toBe(false);
        expect('oneOf' in prop).toBe(false);
      }
    }
  });

  it('get_project_summary retourne métriques par niveau, topologie MEP et compteur d’audit', () => {
    const { doc, levelId } = createSampleDocument();
    const registry = createPhase1ReadRegistry();

    const res = registry.execute('get_project_summary', {}, { doc, activeLevelId: levelId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = res.data as Record<string, unknown>;
    expect(data.activeLevelId).toBe(levelId);
    expect(Array.isArray(data.metricsByLevel)).toBe(true);
    expect(data.mepTopology).toBeDefined();
    expect(typeof data.auditIssueCount).toBe('number');
  });

  it('get_level_details pré-calcule lengthMm, orientation et occupiedIntervalsMm et filtre categories', () => {
    const { doc, levelId, wallEastWestId, wallNorthSouthId } = createSampleDocument();
    const registry = createPhase1ReadRegistry();

    const wallsOnly = registry.execute(
      'get_level_details',
      { levelId, categories: ['walls'] },
      { doc },
    );
    expect(wallsOnly.ok).toBe(true);
    if (!wallsOnly.ok) return;

    const data = wallsOnly.data as {
      walls: Array<{
        id: string;
        lengthMm: number;
        orientation: string;
        occupiedIntervalsMm: Array<{ openingId: string; startMm: number; endMm: number }>;
      }>;
      openings?: unknown;
      rooms?: unknown;
    };

    expect(data.openings).toBeUndefined();
    expect(data.rooms).toBeUndefined();
    expect(data.walls).toHaveLength(4);

    const southWall = data.walls.find((w) => w.id === wallEastWestId)!;
    expect(southWall.lengthMm).toBe(4000);
    expect(southWall.orientation).toBe('E-O');
    expect(southWall.occupiedIntervalsMm).toEqual([
      { openingId: 'door_1', kind: 'door', startMm: 400, endMm: 1300 },
      { openingId: 'win_1', kind: 'window', startMm: 2200, endMm: 3400 },
    ]);

    const eastWall = data.walls.find((w) => w.id === wallNorthSouthId)!;
    expect(eastWall.lengthMm).toBe(3000);
    expect(eastWall.orientation).toBe('N-S');

    // Erreur ID niveau inconnu -> retourne validIds
    const badLevel = registry.execute('get_level_details', { levelId: 'RDC_INCONNU' }, { doc });
    expect(badLevel.ok).toBe(false);
    if (!badLevel.ok) {
      expect(badLevel.code).toBe('UNKNOWN_LEVEL');
      expect(badLevel.validIds).toEqual([levelId]);
    }
  });

  it('get_level_details avec filtre categories reste très compact sur un étage dense de demo-immeuble-r4.json', () => {
    const demoPath = path.resolve(__dirname, '../../../../apps/web/public/demo-immeuble-r4.json');
    const state = fromJSON(fs.readFileSync(demoPath, 'utf8'));
    const doc = new BimDocument(state);
    const registry = createPhase1ReadRegistry();

    const filtered = registry.execute(
      'get_level_details',
      { levelId: 'level_r0', categories: ['walls', 'rooms'] },
      { doc },
    );
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    const payloadSize = JSON.stringify(filtered.data).length;
    expect(payloadSize).toBeLessThan(20_000);
  });

  it('get_element_by_id retourne l’entité et ses dépendants, ou validIds si inconnu', () => {
    const { doc, wallEastWestId } = createSampleDocument();
    const registry = createPhase1ReadRegistry();

    const found = registry.execute('get_element_by_id', { elementId: wallEastWestId }, { doc });
    expect(found.ok).toBe(true);
    if (found.ok) {
      const data = found.data as { category: string; dependents: string[] };
      expect(data.category).toBe('wall');
      expect(data.dependents).toContain('door_1');
      expect(data.dependents).toContain('win_1');
    }

    const missing = registry.execute('get_element_by_id', { elementId: 'nope' }, { doc });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe('ELEMENT_NOT_FOUND');
      expect(missing.validIds?.length).toBeGreaterThan(0);
    }
  });

  it('audit_model filtre par niveau et signale un levelId invalide', () => {
    const { doc, levelId } = createSampleDocument();
    const registry = createPhase1ReadRegistry();

    const res = registry.execute('audit_model', { levelId }, { doc });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { totalIssues: number; issues: unknown[] };
      expect(Array.isArray(data.issues)).toBe(true);
    }

    const bad = registry.execute('audit_model', { levelId: 'missing_lvl' }, { doc });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe('UNKNOWN_LEVEL');
      expect(bad.validIds).toEqual([levelId]);
    }
  });

  it('get_clashes_summary détecte un clash réel et borne strictement limit à 50 max', () => {
    const { doc, levelId } = createSampleDocument();
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    // Ajouter un mur en collision franche avec comp_1 (situé en x=1500, y=1500)
    doc.execute(
      new AddWallCommand({
        id: 'w_clash_target',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 1500, y: 500 },
        end: { x: 1500, y: 2500 },
      }),
    );

    const registry = createPhase1ReadRegistry();
    const res = registry.execute('get_clashes_summary', { severity: 'hard', limit: 999 }, { doc });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { totalClashes: number; returnedCount: number; clashes: unknown[] };
      expect(data.totalClashes).toBeGreaterThan(0);
      expect(data.returnedCount).toBeLessThanOrEqual(50);
    }

    const limited = registry.execute('get_clashes_summary', { limit: 1 }, { doc });
    expect(limited.ok).toBe(true);
    if (limited.ok) {
      const data = limited.data as { returnedCount: number };
      expect(data.returnedCount).toBeLessThanOrEqual(1);
    }
  });

  it('ToolRegistry rejette proprement outil inconnu et arguments invalides', () => {
    const { doc } = createSampleDocument();
    const registry = createPhase1ReadRegistry();

    const unknownTool = registry.execute('add_wall', {}, { doc });
    expect(unknownTool.ok).toBe(false);
    if (!unknownTool.ok) {
      expect(unknownTool.code).toBe('UNKNOWN_TOOL');
      expect(unknownTool.validIds).toContain('get_project_summary');
    }

    const badArgs = registry.execute('get_level_details', { levelId: '' }, { doc });
    expect(badArgs.ok).toBe(false);
    if (!badArgs.ok) {
      expect(badArgs.code).toBe('INVALID_ARGUMENTS');
    }
  });
});
