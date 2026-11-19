import type { Command } from './base.js';
import type { Stair, StairType, BimState, ElementId } from '../types.js';
import { validateStair, validateStairType, BimValidationError } from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';

export class AddStairTypeCommand implements Command {
  public readonly name = 'AddStairType';

  public constructor(public readonly stairType: StairType) {}

  public apply(draft: BimState): void {
    if (draft.stairTypes?.[this.stairType.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A stair type with ID "${this.stairType.id}" already exists.`,
      );
    }
    validateStairType(this.stairType);
    const stairTypes = ((draft as { stairTypes: Record<ElementId, StairType> }).stairTypes ??= {});
    stairTypes[this.stairType.id] = this.stairType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stairType.id];
  }
}

export class UpdateStairTypeCommand implements Command {
  public readonly name = 'UpdateStairType';

  public constructor(
    public readonly stairTypeId: ElementId,
    public readonly patch: Partial<Omit<StairType, 'id'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.stairTypes?.[this.stairTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update stair type: ID "${this.stairTypeId}" not found.`,
      );
    }
    const updated: StairType = {
      ...existing,
      ...this.patch,
      id: existing.id,
    };
    validateStairType(updated);
    draft.stairTypes[this.stairTypeId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stairTypeId];
  }
}

export class DeleteStairTypeCommand implements Command {
  public readonly name = 'DeleteStairType';

  public constructor(public readonly stairTypeId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.stairTypes?.[this.stairTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete stair type: ID "${this.stairTypeId}" not found.`,
      );
    }
    const { restrictViolations } = resolveCascadeDeletions(draft, this.stairTypeId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete stair type: ID "${this.stairTypeId}" is referenced by ${restrictViolations.length} active element(s) (DELETE_STAIR_TYPE_REJECTED).`,
        { blockingIds: restrictViolations },
      );
    }
    Reflect.deleteProperty(draft.stairTypes, this.stairTypeId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stairTypeId];
  }
}

export class AddStairCommand implements Command {
  public readonly name = 'AddStair';

  public constructor(public readonly stair: Stair) {}

  public apply(draft: BimState): void {
    if (draft.stairs?.[this.stair.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A stair with ID "${this.stair.id}" already exists.`,
      );
    }
    validateStair(this.stair, draft as BimState);
    const stairs = ((draft as { stairs: Record<ElementId, Stair> }).stairs ??= {});
    stairs[this.stair.id] = this.stair;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stair.id];
  }
}

export class UpdateStairCommand implements Command {
  public readonly name = 'UpdateStair';

  public constructor(
    public readonly stairId: ElementId,
    public readonly patch: Partial<Omit<Stair, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.stairs?.[this.stairId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update stair: ID "${this.stairId}" not found.`,
      );
    }
    const updated: Stair = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'stair',
    };
    validateStair(updated, draft as BimState);
    draft.stairs[this.stairId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stairId];
  }
}

export class DeleteStairCommand implements Command {
  public readonly name = 'DeleteStair';

  public constructor(public readonly stairId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.stairs?.[this.stairId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete stair: ID "${this.stairId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.stairs, this.stairId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.stairId];
  }
}
