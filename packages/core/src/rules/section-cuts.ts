import type { SectionCut, BimState } from '../types.js';
import type { RuleViolation } from './types.js';
import { BimValidationError } from './types.js';
import { distance } from '@mini-bim/geometry';

export const MIN_SECTION_CUT_LENGTH = 100; // mm
export const MIN_SECTION_CUT_DEPTH = 10; // mm

/**
 * Vérifie les violations de contraintes géométriques et sémantiques sur un SectionCut.
 */
export function checkSectionCutViolations(
  cut: SectionCut,
  _state?: BimState,
): readonly RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!cut.id || typeof cut.id !== 'string') {
    violations.push({
      code: 'SECTION_CUT_INVALID_ID',
      message: 'SectionCut ID must be a non-empty string.',
      offendingIds: [cut.id ?? 'unknown'],
      severity: 'error',
    });
  }

  if (cut.category !== 'sectionCut') {
    violations.push({
      code: 'SECTION_CUT_INVALID_CATEGORY',
      message: `Invalid category "${cut.category}" for SectionCut; expected "sectionCut".`,
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  if (cut.kind !== 'section' && cut.kind !== 'elevation') {
    violations.push({
      code: 'SECTION_CUT_INVALID_KIND',
      message: `Invalid kind "${cut.kind}" for SectionCut; expected "section" or "elevation".`,
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  if (!cut.name || typeof cut.name !== 'string' || cut.name.trim().length === 0) {
    violations.push({
      code: 'SECTION_CUT_EMPTY_NAME',
      message: 'SectionCut name must not be empty.',
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  if (!cut.label || typeof cut.label !== 'string' || cut.label.trim().length === 0) {
    violations.push({
      code: 'SECTION_CUT_EMPTY_LABEL',
      message: 'SectionCut label must not be empty.',
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  if (
    !cut.start ||
    !cut.end ||
    !Number.isFinite(cut.start.x) ||
    !Number.isFinite(cut.start.y) ||
    !Number.isFinite(cut.end.x) ||
    !Number.isFinite(cut.end.y)
  ) {
    violations.push({
      code: 'SECTION_CUT_INVALID_COORDINATES',
      message: 'SectionCut start and end coordinates must be finite numbers.',
      offendingIds: [cut.id],
      severity: 'error',
    });
  } else {
    const len = distance(cut.start, cut.end);
    if (len < MIN_SECTION_CUT_LENGTH) {
      violations.push({
        code: 'SECTION_CUT_TOO_SHORT',
        message: `SectionCut length (${len.toFixed(1)} mm) is below minimum of ${MIN_SECTION_CUT_LENGTH} mm.`,
        offendingIds: [cut.id],
        severity: 'error',
        measurement: len,
        threshold: MIN_SECTION_CUT_LENGTH,
      });
    }
  }

  if (cut.viewDirection !== 1 && cut.viewDirection !== -1) {
    violations.push({
      code: 'SECTION_CUT_INVALID_VIEW_DIRECTION',
      message: `SectionCut viewDirection must be 1 or -1, received ${cut.viewDirection}.`,
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  if (!Number.isFinite(cut.depth) || cut.depth < MIN_SECTION_CUT_DEPTH) {
    violations.push({
      code: 'SECTION_CUT_INVALID_DEPTH',
      message: `SectionCut depth (${cut.depth}) must be at least ${MIN_SECTION_CUT_DEPTH} mm.`,
      offendingIds: [cut.id],
      severity: 'error',
      measurement: cut.depth,
      threshold: MIN_SECTION_CUT_DEPTH,
    });
  }

  if (cut.zMin !== undefined && cut.zMax !== undefined && cut.zMin >= cut.zMax) {
    violations.push({
      code: 'SECTION_CUT_INVALID_Z_RANGE',
      message: `SectionCut zMin (${cut.zMin}) must be strictly less than zMax (${cut.zMax}).`,
      offendingIds: [cut.id],
      severity: 'error',
    });
  }

  return violations;
}

/**
 * Valide un SectionCut et lève une BimValidationError si une contrainte bloquante est violée.
 */
export function validateSectionCut(cut: SectionCut, state?: BimState): void {
  const violations = checkSectionCutViolations(cut, state);
  const blocking = violations.filter((v) => v.severity !== 'warning');
  if (blocking.length > 0) {
    const first = blocking[0];
    throw new BimValidationError(
      first?.code ?? 'SECTION_CUT_INVALID',
      first?.message ?? 'Invalid SectionCut.',
      { offendingIds: [cut.id] },
    );
  }
}
