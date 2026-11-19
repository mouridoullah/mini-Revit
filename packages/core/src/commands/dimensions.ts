import type { Command } from './base.js';
import type { Dimension, BimState, ElementId } from '../types.js';
import { validateDimension, BimValidationError } from '../rules/index.js';
import { computeDimensionValue } from '../dimensions/index.js';

export class AddDimensionCommand implements Command {
  public readonly name = 'AddDimension';

  public constructor(public readonly dimension: Dimension) {}

  public apply(draft: BimState): void {
    if (draft.dimensions && draft.dimensions[this.dimension.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A dimension with ID "${this.dimension.id}" already exists.`,
      );
    }
    validateDimension(this.dimension, draft as BimState);
    const computedValue = computeDimensionValue(this.dimension, draft as BimState);
    const dimToStore: Dimension = {
      ...this.dimension,
      value: computedValue,
    };
    draft.dimensions[this.dimension.id] = dimToStore;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.dimension.id];
  }
}

export class UpdateDimensionCommand implements Command {
  public readonly name = 'UpdateDimension';

  public constructor(
    public readonly dimensionId: ElementId,
    public readonly patch: Partial<Omit<Dimension, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.dimensions?.[this.dimensionId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update dimension: ID "${this.dimensionId}" not found.`,
      );
    }

    const updated: Dimension = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'dimension',
    };

    validateDimension(updated, draft as BimState);
    const finalUpdated: Dimension = {
      ...updated,
      value: computeDimensionValue(updated, draft as BimState),
    };
    draft.dimensions[this.dimensionId] = finalUpdated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.dimensionId];
  }
}

export class DeleteDimensionCommand implements Command {
  public readonly name = 'DeleteDimension';

  public constructor(public readonly dimensionId: ElementId) {}

  public apply(draft: BimState): void {
    if (!draft.dimensions?.[this.dimensionId]) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete dimension: ID "${this.dimensionId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.dimensions, this.dimensionId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.dimensionId];
  }
}
