import type { BimState, ElementId } from '../types.js';
import type { RuleViolation } from './types.js';
import { BimValidationError } from './types.js';
import { checkWallViolations, checkWallTypeViolations } from './walls.js';
import {
  checkOpeningsOnWall,
  checkDoorViolations,
  checkWindowViolations,
} from './openings.js';
import { checkLevelViolations } from './levels.js';
import { checkRoomViolations } from './rooms.js';
import { checkDimensionViolations } from './dimensions.js';
import { checkSlabViolations, checkSlabTypeViolations } from './slabs.js';
import { checkStairViolations, checkStairTypeViolations } from './stairs.js';
import {
  checkRoofViolations,
  checkRoofTypeViolations,
  checkRoofOpeningViolations,
} from './roofs.js';
import {
  checkComponentViolations,
  checkComponentCollisions,
  checkComponentTypeViolations,
} from './components.js';

// ---------------------------------------------------------------------------
// Validation Différentielle Post-Condition (Phase 6.0b / ADR-041 §6)
// ---------------------------------------------------------------------------

export const CATEGORY_VALIDATORS: readonly ((
  id: ElementId,
  state: BimState,
) => readonly RuleViolation[])[] = [
  (id, state) => {
    const wall = state.walls[id];
    return wall ? [...checkWallViolations(wall, state), ...checkOpeningsOnWall(wall, state)] : [];
  },
  (id, state) => {
    const door = state.doors?.[id];
    return door ? checkDoorViolations(door, state) : [];
  },
  (id, state) => {
    const win = state.windows?.[id];
    return win ? checkWindowViolations(win, state) : [];
  },
  (id, state) => {
    const lvl = state.levels[id];
    return lvl ? checkLevelViolations(lvl, state) : [];
  },
  (id, state) => {
    const wt = state.wallTypes[id];
    return wt ? checkWallTypeViolations(wt) : [];
  },
  (id, state) => {
    const rm = state.rooms?.[id];
    return rm ? checkRoomViolations(rm, state) : [];
  },
  (id, state) => {
    const dim = state.dimensions?.[id];
    return dim ? checkDimensionViolations(dim, state) : [];
  },
  (id, state) => {
    const sl = state.slabs?.[id];
    return sl ? checkSlabViolations(sl, state) : [];
  },
  (id, state) => {
    const slt = state.slabTypes?.[id];
    return slt ? checkSlabTypeViolations(slt) : [];
  },
  (id, state) => {
    const st = state.stairs?.[id];
    return st ? checkStairViolations(st, state) : [];
  },
  (id, state) => {
    const stt = state.stairTypes?.[id];
    return stt ? checkStairTypeViolations(stt) : [];
  },
  (id, state) => {
    const rf = state.roofs?.[id];
    return rf ? checkRoofViolations(rf, state) : [];
  },
  (id, state) => {
    const rft = state.roofTypes?.[id];
    return rft ? checkRoofTypeViolations(rft) : [];
  },
  (id, state) => {
    const ro = state.roofOpenings?.[id];
    return ro ? checkRoofOpeningViolations(ro, state) : [];
  },
  (id, state) => {
    const comp = state.components?.[id];
    return comp
      ? [...checkComponentViolations(comp, state), ...checkComponentCollisions(comp, state)]
      : [];
  },
  (id, state) => {
    const compt = state.componentTypes?.[id];
    return compt ? checkComponentTypeViolations(compt) : [];
  },
];

/**
 * Collecte exhaustivement toutes les violations de règles métier pour les entités du dirty set.
 */
export function collectViolationsForDirty(
  state: BimState,
  dirtyIds: readonly ElementId[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const seenKeys = new Set<string>();

  const pushViolation = (v: RuleViolation) => {
    const sortedIds = [...v.offendingIds].sort().join(',');
    const key = `${v.code}:${sortedIds}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      violations.push(v);
    }
  };

  const uniqueDirty = Array.from(new Set(dirtyIds));
  for (const id of uniqueDirty) {
    for (const validator of CATEGORY_VALIDATORS) {
      for (const v of validator(id, state)) {
        pushViolation(v);
      }
    }
  }

  return violations;
}

/**
 * Valide le dirty set de manière différentielle.
 * Ne rejette la transaction que si elle introduit au moins une NOUVELLE violation
 * de règle sur le dirty set ou aggrave une violation existante par rapport à previousState.
 * Les règles de sévérité 'warning' (ex. collisions mobilier) ne sont pas bloquantes.
 */
export function validateDirty(
  draftState: BimState,
  dirtyIds: readonly ElementId[],
  previousState?: BimState,
): void {
  const draftViolations = collectViolationsForDirty(draftState, dirtyIds);
  if (draftViolations.length === 0) {
    return;
  }

  // Sans état précédent, toute violation bloquante sur le dirty set est fatale
  if (!previousState) {
    const fatal = draftViolations.find((v) => v.severity !== 'warning');
    if (fatal) {
      throw new BimValidationError(fatal.code, fatal.message, { offendingIds: fatal.offendingIds });
    }
    return;
  }

  const prevViolations = collectViolationsForDirty(previousState, dirtyIds);
  const prevByKey = new Map<string, RuleViolation>();
  for (const v of prevViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    prevByKey.set(`${v.code}:${sortedIds}`, v);
  }

  // Trouver la première violation introduite ou aggravée
  for (const v of draftViolations) {
    const sortedIds = [...v.offendingIds].sort().join(',');
    const key = `${v.code}:${sortedIds}`;
    const prev = prevByKey.get(key);

    if (!prev) {
      // Nouvelle violation introduite par la transaction : bloquante sauf si sévérité 'warning'
      if (v.severity !== 'warning') {
        throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
      }
      continue;
    }

    if (v.severity === 'warning') {
      continue;
    }

    // Violation existante : vérifier si elle est aggravée numériquement
    if (
      v.measurement !== undefined &&
      v.threshold !== undefined &&
      prev.measurement !== undefined &&
      prev.threshold !== undefined
    ) {
      const draftDelta = Math.abs(v.measurement - v.threshold);
      const prevDelta = Math.abs(prev.measurement - prev.threshold);
      if (draftDelta > prevDelta + 1e-4) {
        throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
      }
    } else if (v.message !== prev.message) {
      throw new BimValidationError(v.code, v.message, { offendingIds: v.offendingIds });
    }
  }
}
