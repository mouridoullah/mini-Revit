import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { BimDocument } from '../document.js';
import * as Commands from '../commands.js';
import { auditDocumentState } from './audit.js';
import { toJSON, fromJSON } from '../serialization.js';
import type { BimState } from '../types.js';

describe('Diagnostic métier non-bloquant & Audit au chargement (ADR-070)', () => {
  it('un projet par défaut sain ne produit aucun avertissement', () => {
    const doc = BimDocument.createDefaultProject();
    const issues = doc.getValidationIssues();
    expect(issues).toEqual([]);
  });

  it('détecte un mur de longueur critique (< 50 mm) comme avertissement WALL_TOO_SHORT', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const stateWithShortWall: BimState = {
      ...state,
      walls: {
        ...state.walls,
        w_short: {
          id: 'w_short',
          category: 'wall',
          typeId: Object.keys(state.wallTypes)[0]!,
          levelId: Object.keys(state.levels)[0]!,
          start: vec2(0, 0),
          end: vec2(30, 0), // 30 mm < 50 mm
        },
      },
    };

    const issues = auditDocumentState(stateWithShortWall);
    const shortWallIssue = issues.find((i) => i.code === 'WALL_TOO_SHORT');
    expect(shortWallIssue).toBeDefined();
    expect(shortWallIssue?.severity).toBe('warning');
    expect(shortWallIssue?.offendingIds).toContain('w_short');
  });

  it('détecte un escalier hors formule de Blondel comme STAIR_BLONDEL_OUT_OF_RANGE', () => {
    const doc = BimDocument.createDefaultProject();
    const level0Id = Object.keys(doc.getState().levels)[0]!;
    const level1Id = 'lvl_1';
    doc.execute(
      new Commands.AddLevelCommand({
        id: level1Id,
        name: 'R+1',
        elevation: 3000,
      }),
    );

    const state = doc.getState();
    // Créer un escalier avec un giron extrême g = 150 mm (2h + g = 2*176 + 150 = 502 mm < 590 mm)
    const stateWithBadStair: BimState = {
      ...state,
      stairTypes: {
        stair_t1: {
          id: 'stair_t1',
          name: 'Escalier Raide',
          width: 900,
        },
      },
      stairs: {
        stair_bad: {
          id: 'stair_bad',
          category: 'stair',
          stairTypeId: 'stair_t1',
          bottomLevelId: level0Id,
          topLevelId: level1Id,
          start: vec2(0, 0),
          end: vec2(1200, 0), // Course très courte -> marches trop raides
        },
      },
    };

    const issues = auditDocumentState(stateWithBadStair);
    const blondelIssue = issues.find((i) => i.code === 'STAIR_BLONDEL_OUT_OF_RANGE');
    expect(blondelIssue).toBeDefined();
    expect(blondelIssue?.severity).toBe('warning');
    expect(blondelIssue?.offendingIds).toContain('stair_bad');
  });

  it('détecte une ouverture débordant de son mur hôte (OPENING_OUT_OF_BOUNDS)', () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallId = 'w_host_test';

    doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(3000, 0), // Longueur 3000 mm
      }),
    );

    const state = doc.getState();
    const doorTypeId = Object.keys(state.doorTypes)[0]!;
    // Injection d'une porte avec offsetAlong = 2500 mm et width = 900 mm -> 3400 mm > 3000 mm
    const stateWithOverflow: BimState = {
      ...state,
      doors: {
        door_overflow: {
          id: 'door_overflow',
          category: 'door',
          doorTypeId,
          hostWallId: wallId,
          offsetAlong: 2500,
          swing: { side: 'left', direction: 'in' },
        },
      },
    };

    const issues = auditDocumentState(stateWithOverflow);
    const overflowIssue = issues.find((i) => i.code === 'OPENING_OUT_OF_BOUNDS');
    expect(overflowIssue).toBeDefined();
    expect(overflowIssue?.offendingIds).toContain('door_overflow');
    expect(overflowIssue?.offendingIds).toContain(wallId);
  });

  it('détecte le chevauchement de deux ouvertures (OPENING_OVERLAP)', () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;
    const wallId = 'w_host_overlap';

    doc.execute(
      new Commands.AddWallCommand({
        id: wallId,
        category: 'wall',
        typeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      }),
    );

    const state = doc.getState();
    const doorTypeId = Object.keys(state.doorTypes)[0]!;
    const stateWithOverlap: BimState = {
      ...state,
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          doorTypeId,
          hostWallId: wallId,
          offsetAlong: 1000,
          swing: { side: 'left', direction: 'in' },
        },
        d2: {
          id: 'd2',
          category: 'door',
          doorTypeId,
          hostWallId: wallId,
          offsetAlong: 1500,
          swing: { side: 'left', direction: 'in' },
        },
      },
    };

    const issues = auditDocumentState(stateWithOverlap);
    const overlapIssue = issues.find((i) => i.code === 'OPENING_OVERLAP');
    expect(overlapIssue).toBeDefined();
    expect(overlapIssue?.offendingIds).toContain('d1');
    expect(overlapIssue?.offendingIds).toContain('d2');
  });

  it('détecte une pièce non fermée (ROOM_UNENCLOSED)', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const stateWithUnenclosedRoom: BimState = {
      ...state,
      rooms: {
        r_open: {
          id: 'r_open',
          category: 'room',
          name: 'Chambre non close',
          levelId: Object.keys(state.levels)[0]!,
          seed: vec2(1000, 1000),
          status: 'unenclosed',
          area: 0,
        },
      },
    };

    const issues = auditDocumentState(stateWithUnenclosedRoom);
    const unenclosedIssue = issues.find((i) => i.code === 'ROOM_UNENCLOSED');
    expect(unenclosedIssue).toBeDefined();
    expect(unenclosedIssue?.offendingIds).toContain('r_open');
  });

  it('détecte une cotation associative avec référence orpheline (DIMENSION_ORPHAN_REFERENCE)', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const stateWithOrphanDim: BimState = {
      ...state,
      dimensions: {
        dim_orphan: {
          id: 'dim_orphan',
          category: 'dimension',
          type: 'linear',
          levelId: Object.keys(state.levels)[0]!,
          references: ['w_non_existent'],
          offset: 200,
          value: 3000,
        },
      },
    };

    const issues = auditDocumentState(stateWithOrphanDim);
    const orphanDimIssue = issues.find((i) => i.code === 'DIMENSION_ORPHAN_REFERENCE');
    expect(orphanDimIssue).toBeDefined();
    expect(orphanDimIssue?.offendingIds).toContain('dim_orphan');
  });

  it('garantit l’absence stricte d’auto-réparation silencieuse : fromJSON() préserve exactement l’objet sans le modifier', () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const stateWithWarnings: BimState = {
      ...state,
      walls: {
        ...state.walls,
        w_short: {
          id: 'w_short',
          category: 'wall',
          typeId: Object.keys(state.wallTypes)[0]!,
          levelId: Object.keys(state.levels)[0]!,
          start: vec2(0, 0),
          end: vec2(40, 0),
        },
      },
    };

    const json = toJSON(stateWithWarnings);
    const loaded = fromJSON(json);

    // Les données avec avertissement doivent être préservées bit-à-bit, aucune altération silencieuse
    expect(loaded).toEqual(stateWithWarnings);
    expect(loaded.walls['w_short']?.end).toEqual({ x: 40, y: 0 });

    // Le rapport d'audit sur l'objet chargé restitue l'anomalie
    const issues = auditDocumentState(loaded);
    expect(issues.some((i) => i.code === 'WALL_TOO_SHORT')).toBe(true);
  });
});
