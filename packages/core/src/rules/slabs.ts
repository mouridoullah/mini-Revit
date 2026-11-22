import type { Slab, SlabType, BimState } from '../types.js';
import type { RuleViolation } from './types.js';
import { assertNoViolations } from './utils.js';
import {
  computeEffectiveSlabPolygon,
  SlabGeometryError,
  signedArea,
} from '@tabax/geometry';

/**
 * Valide les paramètres d'un type de dalle (SlabType).
 */
export function checkSlabTypeViolations(slabType: SlabType): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!slabType || typeof slabType !== 'object') {
    violations.push({
      code: 'MALFORMED_SLAB_TYPE',
      message: 'SlabType entry is null or not an object.',
      offendingIds: [],
    });
    return violations;
  }
  if (typeof slabType.name !== 'string' || !slabType.name.trim()) {
    violations.push({
      code: 'MALFORMED_SLAB_TYPE',
      message: `SlabType "${slabType.id}" has an invalid or empty name.`,
      offendingIds: [slabType.id],
    });
  }
  if (!Number.isFinite(slabType.thickness) || slabType.thickness <= 0) {
    violations.push({
      code: 'INVALID_SLAB_THICKNESS',
      message: `SlabType "${slabType.id}" has a non-positive or non-finite thickness (${slabType.thickness}).`,
      offendingIds: [slabType.id],
    });
  } else if (slabType.thickness < 50) {
    violations.push({
      code: 'INVALID_SLAB_THICKNESS',
      message: `SlabType "${slabType.id}" thickness must be at least 50 mm (got ${slabType.thickness} mm).`,
      offendingIds: [slabType.id],
    });
  }
  return violations;
}

export function validateSlabType(slabType: SlabType): void {
  assertNoViolations(checkSlabTypeViolations(slabType));
}

/**
 * Valide l'intégrité structurelle, référentielle et géométrique d'une dalle (Slab).
 */
export function checkSlabViolations(slab: Slab, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];
  if (!slab || typeof slab !== 'object') {
    violations.push({
      code: 'MALFORMED_SLAB',
      message: 'Slab entry is null or not an object.',
      offendingIds: [],
    });
    return violations;
  }
  if (!state.levels[slab.levelId]) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Slab "${slab.id}" references non-existent Level ID: "${slab.levelId}".`,
      offendingIds: [slab.id],
    });
  }
  if (!state.slabTypes[slab.slabTypeId]) {
    violations.push({
      code: 'UNKNOWN_SLAB_TYPE',
      message: `Slab "${slab.id}" references non-existent SlabType ID: "${slab.slabTypeId}".`,
      offendingIds: [slab.id],
    });
  }
  if (!slab.boundary || slab.boundary.length < 3) {
    violations.push({
      code: 'INVALID_SLAB_BOUNDARY',
      message: `Slab "${slab.id}" boundary must contain at least 3 vertices (got ${slab.boundary?.length ?? 0}).`,
      offendingIds: [slab.id],
    });
    return violations;
  }

  for (const pt of slab.boundary) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      violations.push({
        code: 'INVALID_SLAB_BOUNDARY',
        message: `Slab "${slab.id}" has non-finite boundary coordinates.`,
        offendingIds: [slab.id],
      });
      return violations;
    }
  }

  const baseArea = signedArea(slab.boundary);
  if (Math.abs(baseArea) < 1e-4) {
    violations.push({
      code: 'INVALID_SLAB_BOUNDARY',
      message: `Slab "${slab.id}" has non-positive area.`,
      offendingIds: [slab.id],
    });
    return violations;
  }

  try {
    computeEffectiveSlabPolygon({
      boundary: slab.boundary,
      holes: slab.holes,
      openings: slab.openings,
    });
  } catch (err) {
    if (err instanceof SlabGeometryError) {
      violations.push({
        code: err.code,
        message: err.message,
        offendingIds: [slab.id],
      });
    } else {
      violations.push({
        code: 'INVALID_SLAB_BOUNDARY',
        message: err instanceof Error ? err.message : String(err),
        offendingIds: [slab.id],
      });
    }
  }

  return violations;
}

export function validateSlab(slab: Slab, state: BimState): void {
  assertNoViolations(checkSlabViolations(slab, state));
}
