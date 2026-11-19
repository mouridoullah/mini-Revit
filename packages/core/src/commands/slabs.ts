import type { Command } from './base.js';
import type { Slab, SlabType, BimState, ElementId } from '../types.js';
import { validateSlab, validateSlabType, BimValidationError } from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';

export class AddSlabTypeCommand implements Command {
  public readonly name = 'AddSlabType';

  public constructor(public readonly slabType: SlabType) {}

  public apply(draft: BimState): void {
    if (draft.slabTypes?.[this.slabType.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A slab type with ID "${this.slabType.id}" already exists.`,
      );
    }
    validateSlabType(this.slabType);
    if (!draft.slabTypes) {
      (draft as { slabTypes: Record<ElementId, SlabType> }).slabTypes = {};
    }
    draft.slabTypes[this.slabType.id] = this.slabType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slabType.id];
  }
}

export class UpdateSlabTypeCommand implements Command {
  public readonly name = 'UpdateSlabType';

  public constructor(
    public readonly slabTypeId: ElementId,
    public readonly patch: Partial<Omit<SlabType, 'id'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.slabTypes?.[this.slabTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update slab type: ID "${this.slabTypeId}" not found.`,
      );
    }
    const updated: SlabType = {
      ...existing,
      ...this.patch,
      id: existing.id,
    };
    validateSlabType(updated);
    draft.slabTypes[this.slabTypeId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slabTypeId];
  }
}

export class DeleteSlabTypeCommand implements Command {
  public readonly name = 'DeleteSlabType';

  public constructor(public readonly slabTypeId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.slabTypes?.[this.slabTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete slab type: ID "${this.slabTypeId}" not found.`,
      );
    }
    const { restrictViolations } = resolveCascadeDeletions(draft, this.slabTypeId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete slab type: ID "${this.slabTypeId}" is referenced by ${restrictViolations.length} active element(s) (DELETE_SLAB_TYPE_REJECTED).`,
        { blockingIds: restrictViolations },
      );
    }
    Reflect.deleteProperty(draft.slabTypes, this.slabTypeId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slabTypeId];
  }
}

export class AddSlabCommand implements Command {
  public readonly name = 'AddSlab';

  public constructor(public readonly slab: Slab) {}

  public apply(draft: BimState): void {
    if (draft.slabs?.[this.slab.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A slab with ID "${this.slab.id}" already exists.`,
      );
    }
    validateSlab(this.slab, draft as BimState);
    if (!draft.slabs) {
      (draft as { slabs: Record<ElementId, Slab> }).slabs = {};
    }
    draft.slabs[this.slab.id] = this.slab;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slab.id];
  }
}

export class UpdateSlabCommand implements Command {
  public readonly name = 'UpdateSlab';

  public constructor(
    public readonly slabId: ElementId,
    public readonly patch: Partial<Omit<Slab, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.slabs?.[this.slabId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update slab: ID "${this.slabId}" not found.`,
      );
    }
    const updated: Slab = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'slab',
    };
    validateSlab(updated, draft as BimState);
    draft.slabs[this.slabId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slabId];
  }
}

export class DeleteSlabCommand implements Command {
  public readonly name = 'DeleteSlab';

  public constructor(public readonly slabId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.slabs?.[this.slabId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete slab: ID "${this.slabId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.slabs, this.slabId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.slabId];
  }
}
