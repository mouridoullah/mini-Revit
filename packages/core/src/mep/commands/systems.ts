/**
 * @tabax/core/mep/commands/systems
 *
 * Commandes transactionnelles pour les systèmes fluides et électriques MEP (MepSystem).
 */

import type { Command } from '../../commands/base.js';
import type { BimState, ElementId } from '../../types.js';
import { BimValidationError } from '../../rules/types.js';
import type { MepSystem } from '../types.js';
import { checkMepSystemViolations } from '../rules.js';

// ============================================================================
// 6. Systèmes MEP (MepSystem)
// ============================================================================

export class CreateMepSystemCommand implements Command {
  public readonly name = 'CreateMepSystem';

  public constructor(public readonly system: MepSystem) {}

  public apply(draft: BimState): void {
    if (draft.mepSystems?.[this.system.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `MepSystem "${this.system.id}" already exists.`);
    }
    const violations = checkMepSystemViolations(this.system);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_SYSTEM', violations[0]?.message ?? 'Invalid system');
    }
    const mepSystems = ((draft as { mepSystems: Record<ElementId, MepSystem> }).mepSystems ??= {});
    mepSystems[this.system.id] = this.system;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.system.id];
  }
}

export class AssignToMepSystemCommand implements Command {
  public readonly name = 'AssignToMepSystem';

  public constructor(
    public readonly systemId: ElementId,
    public readonly elementIds: readonly ElementId[],
  ) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    const updatedIds = new Set(sys.elementIds);
    for (const id of this.elementIds) {
      updatedIds.add(id);
      // Affectation bidirectionnelle sur les entités
      if (draft.pipes?.[id]) draft.pipes[id] = { ...draft.pipes[id], systemId: this.systemId };
      if (draft.ducts?.[id]) draft.ducts[id] = { ...draft.ducts[id], systemId: this.systemId };
      if (draft.cableTrays?.[id]) draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: this.systemId };
      if (draft.mepFittings?.[id]) draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: this.systemId };
      if (draft.mepEquipments?.[id]) draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: this.systemId };
    }
    draft.mepSystems[this.systemId] = {
      ...sys,
      elementIds: Array.from(updatedIds),
    };
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.systemId, ...this.elementIds];
  }
}

export class RemoveFromMepSystemCommand implements Command {
  public readonly name = 'RemoveFromMepSystem';

  public constructor(
    public readonly systemId: ElementId,
    public readonly elementIds: readonly ElementId[],
  ) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    const toRemove = new Set(this.elementIds);
    draft.mepSystems[this.systemId] = {
      ...sys,
      elementIds: sys.elementIds.filter((id) => !toRemove.has(id)),
    };
    for (const id of this.elementIds) {
      if (draft.pipes?.[id]?.systemId === this.systemId) {
        draft.pipes[id] = { ...draft.pipes[id], systemId: undefined };
      }
      if (draft.ducts?.[id]?.systemId === this.systemId) {
        draft.ducts[id] = { ...draft.ducts[id], systemId: undefined };
      }
      if (draft.cableTrays?.[id]?.systemId === this.systemId) {
        draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: undefined };
      }
      if (draft.mepFittings?.[id]?.systemId === this.systemId) {
        draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: undefined };
      }
      if (draft.mepEquipments?.[id]?.systemId === this.systemId) {
        draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: undefined };
      }
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.systemId, ...this.elementIds];
  }
}

export class DeleteMepSystemCommand implements Command {
  public readonly name = 'DeleteMepSystem';
  private changedIds: ElementId[] = [];

  public constructor(public readonly systemId: ElementId) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    // Dégagement du systemId sur les éléments rattachés
    for (const id of sys.elementIds) {
      if (draft.pipes?.[id]?.systemId === this.systemId) draft.pipes[id] = { ...draft.pipes[id], systemId: undefined };
      if (draft.ducts?.[id]?.systemId === this.systemId) draft.ducts[id] = { ...draft.ducts[id], systemId: undefined };
      if (draft.cableTrays?.[id]?.systemId === this.systemId) draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: undefined };
      if (draft.mepFittings?.[id]?.systemId === this.systemId) draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: undefined };
      if (draft.mepEquipments?.[id]?.systemId === this.systemId) draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: undefined };
    }
    this.changedIds = [this.systemId, ...sys.elementIds];
    if (draft.mepSystems) {
      Reflect.deleteProperty(draft.mepSystems, this.systemId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.systemId];
  }
}
