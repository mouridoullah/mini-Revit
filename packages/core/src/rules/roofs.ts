import type {
  Roof,
  RoofType,
  GableRoofType,
  RoofOpening,
  BimState,
  ElementId,
} from '../types.js';
import type { RuleViolation } from './types.js';
import { BimValidationError } from './types.js';
import { signedArea } from '@tabax/geometry';

/**
 * Vérifie les contraintes métier sur un RoofType (ADR-053 [3.1]).
 */
export function checkRoofTypeViolations(roofType: RoofType): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!roofType.name || roofType.name.trim() === '') {
    violations.push({
      code: 'INVALID_ROOF_NAME',
      message: 'RoofType name cannot be empty.',
      offendingIds: [roofType.id],
    });
  }

  if (!Number.isFinite(roofType.thickness) || roofType.thickness < 100) {
    violations.push({
      code: 'INVALID_ROOF_THICKNESS',
      message: `RoofType thickness must be at least 100 mm (got ${roofType.thickness} mm).`,
      offendingIds: [roofType.id],
    });
  }

  if (roofType.family === 'gable') {
    const gable = roofType as GableRoofType;
    if (!Number.isFinite(gable.slopeDeg) || gable.slopeDeg < 5 || gable.slopeDeg > 60) {
      violations.push({
        code: 'INVALID_ROOF_SLOPE',
        message: `RoofType slope must be between 5° and 60° (got ${gable.slopeDeg}°).`,
        offendingIds: [roofType.id],
      });
    }

    if (!Number.isFinite(gable.overhangMm) || gable.overhangMm < 0 || gable.overhangMm > 1500) {
      violations.push({
        code: 'INVALID_ROOF_OVERHANG',
        message: `RoofType overhang must be between 0 and 1500 mm (got ${gable.overhangMm} mm).`,
        offendingIds: [roofType.id],
      });
    }
  }

  return violations;
}

export function validateRoofType(roofType: RoofType): void {
  const violations = checkRoofTypeViolations(roofType);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur une toiture (Roof) (ADR-053 [3.2]).
 */
export function checkRoofViolations(roof: Roof, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const roofType = state.roofTypes?.[roof.roofTypeId];
  if (!roofType) {
    violations.push({
      code: 'UNKNOWN_ROOF_TYPE',
      message: `Roof references unknown RoofType "${roof.roofTypeId}".`,
      offendingIds: [roof.id, roof.roofTypeId],
    });
  }

  const level = state.levels[roof.levelId];
  if (!level) {
    violations.push({
      code: 'UNKNOWN_LEVEL',
      message: `Roof references unknown level "${roof.levelId}".`,
      offendingIds: [roof.id, roof.levelId],
    });
  }

  if (!roof.footprint || roof.footprint.length < 3) {
    violations.push({
      code: 'INVALID_ROOF_FOOTPRINT',
      message: 'Roof footprint must have at least 3 vertices.',
      offendingIds: [roof.id],
    });
    return violations;
  }

  const footprintArea = Math.abs(signedArea(roof.footprint));
  if (footprintArea < 1000000) {
    violations.push({
      code: 'INVALID_ROOF_FOOTPRINT',
      message: `Roof footprint area must be at least 1 m² (1 000 000 mm²), got ${(footprintArea / 1e6).toFixed(2)} m².`,
      offendingIds: [roof.id],
    });
  }

  if (roofType && roofType.family === 'gable') {
    if (!roof.ridgeAxis || !roof.ridgeAxis.start || !roof.ridgeAxis.end) {
      violations.push({
        code: 'MISSING_RIDGE_AXIS',
        message: 'Gable roof requires a ridgeAxis (start and end).',
        offendingIds: [roof.id],
      });
    } else {
      const rStart = roof.ridgeAxis.start;
      const rEnd = roof.ridgeAxis.end;
      const ridgeLen = Math.hypot(rEnd.x - rStart.x, rEnd.y - rStart.y);
      if (ridgeLen <= 1e-4) {
        violations.push({
          code: 'MISSING_RIDGE_AXIS',
          message: 'Ridge axis length must be greater than zero.',
          offendingIds: [roof.id],
        });
      } else {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of roof.footprint) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const tol = 100;
        const midX = (rStart.x + rEnd.x) / 2;
        const midY = (rStart.y + rEnd.y) / 2;

        if (
          midX < minX - tol ||
          midX > maxX + tol ||
          midY < minY - tol ||
          midY > maxY + tol
        ) {
          violations.push({
            code: 'RIDGE_OUTSIDE_FOOTPRINT',
            message: 'Ridge axis must be located within the roof footprint bounds.',
            offendingIds: [roof.id],
          });
        }
      }
    }
  }

  if (roof.slopeOverrideDeg !== undefined) {
    if (!Number.isFinite(roof.slopeOverrideDeg) || roof.slopeOverrideDeg < 5 || roof.slopeOverrideDeg > 60) {
      violations.push({
        code: 'INVALID_ROOF_SLOPE',
        message: `Roof slope override must be between 5° and 60° (got ${roof.slopeOverrideDeg}°).`,
        offendingIds: [roof.id],
      });
    }
  }

  if (roof.overhangOverrideMm !== undefined) {
    if (!Number.isFinite(roof.overhangOverrideMm) || roof.overhangOverrideMm < 0 || roof.overhangOverrideMm > 1500) {
      violations.push({
        code: 'INVALID_ROOF_OVERHANG',
        message: `Roof overhang override must be between 0 and 1500 mm (got ${roof.overhangOverrideMm} mm).`,
        offendingIds: [roof.id],
      });
    }
  }

  return violations;
}

export function validateRoof(roof: Roof, state: BimState): void {
  const violations = checkRoofViolations(roof, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

/**
 * Vérifie les contraintes métier sur une ouverture de toiture (ADR-053 [3.3]).
 */
export function checkRoofOpeningViolations(opening: RoofOpening, state: BimState): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const roof = state.roofs?.[opening.roofId];
  if (!roof) {
    violations.push({
      code: 'UNKNOWN_ROOF',
      message: `RoofOpening references unknown Roof "${opening.roofId}".`,
      offendingIds: [opening.id, opening.roofId],
    });
    return violations;
  }

  if (!Number.isFinite(opening.width) || opening.width <= 0 || !Number.isFinite(opening.height) || opening.height <= 0) {
    violations.push({
      code: 'INVALID_OPENING_DIMENSIONS',
      message: 'RoofOpening width and height must be positive numbers.',
      offendingIds: [opening.id],
    });
  }

  if (state.roofOpenings) {
    const minX = opening.offsetU;
    const maxX = opening.offsetU + opening.width;
    const minY = opening.offsetV;
    const maxY = opening.offsetV + opening.height;

    for (const other of Object.values(state.roofOpenings)) {
      if (other.id === opening.id || other.roofId !== opening.roofId) continue;
      const oMinX = other.offsetU;
      const oMaxX = other.offsetU + other.width;
      const oMinY = other.offsetV;
      const oMaxY = other.offsetV + other.height;

      const overlap = minX < oMaxX && maxX > oMinX && minY < oMaxY && maxY > oMinY;
      if (overlap) {
        violations.push({
          code: 'ROOF_OPENING_OVERLAP',
          message: `RoofOpening "${opening.id}" overlaps with existing RoofOpening "${other.id}".`,
          offendingIds: [opening.id, other.id],
        });
        break;
      }
    }
  }

  return violations;
}

export function validateRoofOpening(opening: RoofOpening, state: BimState): void {
  const violations = checkRoofOpeningViolations(opening, state);
  if (violations.length > 0) {
    const v = violations[0];
    if (v) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}

export function canDeleteRoofType(
  roofTypeId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.roofTypes?.[roofTypeId]) {
    return { allowed: false, reason: `RoofType "${roofTypeId}" does not exist.` };
  }
  const usingRoofs = Object.values(state.roofs ?? {}).filter((r) => r.roofTypeId === roofTypeId);
  if (usingRoofs.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete RoofType "${roofTypeId}": ${usingRoofs.length} roof(s) are using it.`,
    };
  }
  return { allowed: true };
}

export function canDeleteRoof(
  roofId: ElementId,
  state: BimState,
): { readonly allowed: boolean; readonly reason?: string } {
  if (!state.roofs?.[roofId]) {
    return { allowed: false, reason: `Roof "${roofId}" does not exist.` };
  }
  const referencingWalls = Object.values(state.walls).filter(
    (w) => w.topConstraint?.kind === 'roof' && w.topConstraint.roofId === roofId,
  );
  if (referencingWalls.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete Roof "${roofId}": ${referencingWalls.length} wall(s) reference it via topConstraint.`,
    };
  }
  return { allowed: true };
}
