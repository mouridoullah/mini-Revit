import type { Command } from './base.js';
import type { Roof, RoofType, RoofOpening, BimState, ElementId } from '../types.js';
import {
  validateRoof,
  validateRoofType,
  validateRoofOpening,
  BimValidationError,
} from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';

export class AddRoofTypeCommand implements Command {
  public readonly name = 'AddRoofType';

  public constructor(public readonly roofType: RoofType) {}

  public apply(draft: BimState): void {
    const roofTypes = ((draft as { roofTypes: Record<ElementId, RoofType> }).roofTypes ??= {});
    if (roofTypes[this.roofType.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `Cannot add roof type: ID "${this.roofType.id}" already exists.`,
      );
    }
    validateRoofType(this.roofType);
    roofTypes[this.roofType.id] = this.roofType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roofType.id];
  }
}

export class UpdateRoofTypeCommand implements Command {
  public readonly name = 'UpdateRoofType';

  public constructor(
    public readonly roofTypeId: ElementId,
    public readonly patch: Partial<RoofType>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.roofTypes?.[this.roofTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update roof type: ID "${this.roofTypeId}" not found.`,
      );
    }
    const updated = { ...existing, ...this.patch, id: this.roofTypeId } as RoofType;
    validateRoofType(updated);
    const roofTypes = ((draft as { roofTypes: Record<ElementId, RoofType> }).roofTypes ??= {});
    roofTypes[this.roofTypeId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roofTypeId];
  }
}

export class DeleteRoofTypeCommand implements Command {
  public readonly name = 'DeleteRoofType';

  public constructor(public readonly roofTypeId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.roofTypes?.[this.roofTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete roof type: ID "${this.roofTypeId}" not found.`,
      );
    }
    const { restrictViolations } = resolveCascadeDeletions(draft, this.roofTypeId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete roof type: ID "${this.roofTypeId}" is referenced by ${restrictViolations.length} active element(s) (DELETE_ROOF_TYPE_REJECTED).`,
        { blockingIds: restrictViolations },
      );
    }
    if (draft.roofTypes) {
      Reflect.deleteProperty(draft.roofTypes, this.roofTypeId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roofTypeId];
  }
}

export class AddRoofCommand implements Command {
  public readonly name = 'AddRoof';

  public constructor(public readonly roof: Roof) {}

  public apply(draft: BimState): void {
    const roofs = ((draft as { roofs: Record<ElementId, Roof> }).roofs ??= {});
    if (roofs[this.roof.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `Cannot add roof: ID "${this.roof.id}" already exists.`,
      );
    }
    validateRoof(this.roof, draft);
    roofs[this.roof.id] = this.roof;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roof.id];
  }
}

export class UpdateRoofCommand implements Command {
  public readonly name = 'UpdateRoof';

  public constructor(
    public readonly roofId: ElementId,
    public readonly patch: Partial<Roof>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.roofs?.[this.roofId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update roof: ID "${this.roofId}" not found.`,
      );
    }
    const updated: Roof = {
      ...existing,
      ...this.patch,
      id: this.roofId,
      category: 'roof',
    };
    validateRoof(updated, draft);
    const roofs = ((draft as { roofs: Record<ElementId, Roof> }).roofs ??= {});
    roofs[this.roofId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roofId];
  }
}

export class DeleteRoofCommand implements Command {
  public readonly name = 'DeleteRoof';

  public constructor(public readonly roofId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.roofs?.[this.roofId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete roof: ID "${this.roofId}" not found.`,
      );
    }

    // Vérifier si un mur référence ce toit via topConstraint (T-ROOF-08)
    const referencingWalls = Object.values(draft.walls).filter(
      (w) => w.topConstraint?.kind === 'roof' && w.topConstraint.roofId === this.roofId,
    );
    if (referencingWalls.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete roof: ID "${this.roofId}" is referenced by ${referencingWalls.length} wall(s) via topConstraint.`,
        { blockingIds: referencingWalls.map((w) => w.id) },
      );
    }

    const { restrictViolations, cascadeDeletes } = resolveCascadeDeletions(draft, this.roofId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete roof: ID "${this.roofId}" is referenced by active elements.`,
        { blockingIds: restrictViolations },
      );
    }

    // Supprimer en cascade les trémies de ce toit
    if (draft.roofOpenings) {
      for (const opId of cascadeDeletes) {
        if (draft.roofOpenings[opId]) {
          Reflect.deleteProperty(draft.roofOpenings, opId);
        }
      }
      for (const [opId, op] of Object.entries(draft.roofOpenings)) {
        if (op.roofId === this.roofId) {
          Reflect.deleteProperty(draft.roofOpenings, opId);
        }
      }
    }

    if (draft.roofs) {
      Reflect.deleteProperty(draft.roofs, this.roofId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roofId];
  }
}

export class AddRoofOpeningCommand implements Command {
  public readonly name = 'AddRoofOpening';

  public constructor(public readonly opening: RoofOpening) {}

  public apply(draft: BimState): void {
    const roofOpenings = ((draft as { roofOpenings: Record<ElementId, RoofOpening> }).roofOpenings ??= {});
    if (roofOpenings[this.opening.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `Cannot add roof opening: ID "${this.opening.id}" already exists.`,
      );
    }
    validateRoofOpening(this.opening, draft);
    roofOpenings[this.opening.id] = this.opening;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.opening.id, this.opening.roofId];
  }
}

export class UpdateRoofOpeningCommand implements Command {
  public readonly name = 'UpdateRoofOpening';

  public constructor(
    public readonly openingId: ElementId,
    public readonly patch: Partial<RoofOpening>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.roofOpenings?.[this.openingId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update roof opening: ID "${this.openingId}" not found.`,
      );
    }
    const updated: RoofOpening = {
      ...existing,
      ...this.patch,
      id: this.openingId,
      category: 'roofOpening',
    };
    validateRoofOpening(updated, draft);
    const roofOpenings = ((draft as { roofOpenings: Record<ElementId, RoofOpening> }).roofOpenings ??= {});
    roofOpenings[this.openingId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.openingId];
  }
}

export class DeleteRoofOpeningCommand implements Command {
  public readonly name = 'DeleteRoofOpening';

  public constructor(public readonly openingId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.roofOpenings?.[this.openingId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete roof opening: ID "${this.openingId}" not found.`,
      );
    }
    if (draft.roofOpenings) {
      Reflect.deleteProperty(draft.roofOpenings, this.openingId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.openingId];
  }
}
