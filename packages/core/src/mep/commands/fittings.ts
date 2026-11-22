/**
 * @tabax/core/mep/commands/fittings
 *
 * Commandes transactionnelles pour les raccords (MepFitting) et équipements techniques (MepEquipment).
 */

import type { Command } from '../../commands/base.js';
import type { BimState, ElementId } from '../../types.js';
import { BimValidationError } from '../../rules/types.js';
import type { MepFitting, MepEquipment } from '../types.js';
import {
  checkMepFittingViolations,
  checkMepEquipmentViolations,
} from '../rules.js';
import { detachIncidentConnectors, removeElementFromSystems } from './helpers.js';

// ============================================================================
// 4. Raccords (MepFitting)
// ============================================================================

export class AddMepFittingCommand implements Command {
  public readonly name = 'AddMepFitting';

  public constructor(public readonly fitting: MepFitting) {}

  public apply(draft: BimState): void {
    if (draft.mepFittings?.[this.fitting.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Fitting "${this.fitting.id}" already exists.`);
    }
    const violations = checkMepFittingViolations(this.fitting, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_FITTING', violations[0]?.message ?? 'Invalid fitting');
    }
    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[this.fitting.id] = this.fitting;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.fitting.id];
  }
}

export class UpdateMepFittingCommand implements Command {
  public readonly name = 'UpdateMepFitting';

  public constructor(
    public readonly fittingId: ElementId,
    public readonly patch: Partial<Omit<MepFitting, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.mepFittings?.[this.fittingId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Fitting "${this.fittingId}" not found.`);
    }
    const updated: MepFitting = {
      ...existing,
      ...this.patch,
      id: this.fittingId,
      category: 'mepFitting',
    };
    const violations = checkMepFittingViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_FITTING', violations[0]?.message ?? 'Invalid fitting');
    }
    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[this.fittingId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.fittingId];
  }
}

export class DeleteMepFittingCommand implements Command {
  public readonly name = 'DeleteMepFitting';
  private changedIds: ElementId[] = [];

  public constructor(public readonly fittingId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.mepFittings?.[this.fittingId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Fitting "${this.fittingId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.fittingId);
    if (draft.mepFittings) {
      Reflect.deleteProperty(draft.mepFittings, this.fittingId);
    }
    this.changedIds = [this.fittingId, ...detached];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.fittingId];
  }
}

// ============================================================================
// 5. Équipements Techniques (MepEquipment)
// ============================================================================

export class AddMepEquipmentCommand implements Command {
  public readonly name = 'AddMepEquipment';

  public constructor(public readonly equipment: MepEquipment) {}

  public apply(draft: BimState): void {
    if (draft.mepEquipments?.[this.equipment.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Equipment "${this.equipment.id}" already exists.`);
    }
    const violations = checkMepEquipmentViolations(this.equipment, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_EQUIPMENT', violations[0]?.message ?? 'Invalid equipment');
    }
    const mepEquipments = ((draft as { mepEquipments: Record<ElementId, MepEquipment> }).mepEquipments ??= {});
    mepEquipments[this.equipment.id] = this.equipment;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.equipment.id];
  }
}

export class UpdateMepEquipmentCommand implements Command {
  public readonly name = 'UpdateMepEquipment';

  public constructor(
    public readonly equipmentId: ElementId,
    public readonly patch: Partial<Omit<MepEquipment, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.mepEquipments?.[this.equipmentId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Equipment "${this.equipmentId}" not found.`);
    }
    const updated: MepEquipment = {
      ...existing,
      ...this.patch,
      id: this.equipmentId,
      category: 'mepEquipment',
    };
    const violations = checkMepEquipmentViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_EQUIPMENT', violations[0]?.message ?? 'Invalid equipment');
    }
    const mepEquipments = ((draft as { mepEquipments: Record<ElementId, MepEquipment> }).mepEquipments ??= {});
    mepEquipments[this.equipmentId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.equipmentId];
  }
}

export class DeleteMepEquipmentCommand implements Command {
  public readonly name = 'DeleteMepEquipment';
  private changedIds: ElementId[] = [];

  public constructor(public readonly equipmentId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.mepEquipments?.[this.equipmentId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Equipment "${this.equipmentId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.equipmentId);
    if (draft.mepEquipments) {
      Reflect.deleteProperty(draft.mepEquipments, this.equipmentId);
    }
    this.changedIds = [this.equipmentId, ...detached];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.equipmentId];
  }
}
