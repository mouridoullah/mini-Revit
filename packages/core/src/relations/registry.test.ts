import { describe, it, expect } from 'vitest';
import { RELATIONS_REGISTRY } from './registry.js';
import type { EntityCategory, CascadeAction } from './types.js';

describe('RELATIONS_REGISTRY — Intégrité Référentielle Déclarative (T-REG-01 à 04)', () => {
  const VALID_CATEGORIES: Set<EntityCategory> = new Set([
    'wall',
    'door',
    'window',
    'dimension',
    'slab',
    'wallType',
    'level',
    'doorType',
    'windowType',
    'slabType',
    'stairType',
    'stair',
    'roof',
    'roofType',
    'roofOpening',
    'room',
    'component',
    'componentType',
  ]);

  const VALID_ACTIONS: Set<CascadeAction> = new Set(['cascade', 'restrict', 'detach']);

  it('T-REG-01: Registry contient exactement les 18 relations déclarées (Phase 8 + Lot 1)', () => {
    expect(RELATIONS_REGISTRY.length).toBe(18);
    const wallHostedCompRel = RELATIONS_REGISTRY.find(
      (r) => r.sourceCategory === 'component' && r.field === 'placement.hostWallId',
    );
    expect(wallHostedCompRel).toBeDefined();
    expect(wallHostedCompRel?.targetCategory).toBe('wall');
    expect(wallHostedCompRel?.onDelete).toBe('detach');
  });

  it('T-REG-02: Tous les sourceCategory sont des catégories existantes', () => {
    for (const rel of RELATIONS_REGISTRY) {
      expect(VALID_CATEGORIES.has(rel.sourceCategory)).toBe(true);
    }
  });

  it('T-REG-03: Tous les targetCategory sont des catégories existantes', () => {
    for (const rel of RELATIONS_REGISTRY) {
      expect(VALID_CATEGORIES.has(rel.targetCategory)).toBe(true);
    }
  });

  it('T-REG-04: Chaque RelationDef a un onDelete valide (cascade, restrict, detach)', () => {
    for (const rel of RELATIONS_REGISTRY) {
      expect(VALID_ACTIONS.has(rel.onDelete)).toBe(true);
    }
  });
});
