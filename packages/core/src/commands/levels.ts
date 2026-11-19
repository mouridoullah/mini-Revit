import type { Command } from './base.js';
import type { Level, BimState, ElementId } from '../types.js';
import { validateLevel, BimValidationError } from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';

export class AddLevelCommand implements Command {
  public readonly name = 'AddLevel';

  public constructor(public readonly level: Level) {}

  public apply(draft: BimState): void {
    if (draft.levels[this.level.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A level with ID "${this.level.id}" already exists.`,
      );
    }
    validateLevel(this.level, draft);
    draft.levels[this.level.id] = this.level;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.level.id];
  }
}

export interface UpdateLevelOptions {
  readonly shiftSuperiorLevels?: boolean;
}

export class UpdateLevelCommand implements Command {
  public readonly name = 'UpdateLevel';
  private shiftedLevelIds: ElementId[] = [];

  public constructor(
    public readonly levelId: ElementId,
    public readonly patch: Partial<Omit<Level, 'id'>>,
    public readonly options?: UpdateLevelOptions,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.levels[this.levelId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update level: ID "${this.levelId}" not found.`,
      );
    }

    const updatedLevel: Level = {
      ...existing,
      ...this.patch,
      id: existing.id,
    };

    // Si l'élévation change et que le décalage des niveaux supérieurs est actif
    this.shiftedLevelIds = [];
    if (
      this.patch.elevation !== undefined &&
      Number.isFinite(this.patch.elevation) &&
      this.patch.elevation !== existing.elevation &&
      (this.options?.shiftSuperiorLevels ?? true)
    ) {
      const delta = this.patch.elevation - existing.elevation;
      for (const [id, lvl] of Object.entries(draft.levels)) {
        if (id !== this.levelId && lvl.elevation > existing.elevation) {
          draft.levels[id] = {
            ...lvl,
            elevation: lvl.elevation + delta,
          };
          this.shiftedLevelIds.push(id);
        }
      }
    }

    validateLevel(updatedLevel, draft);
    draft.levels[this.levelId] = updatedLevel;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.levelId, ...this.shiftedLevelIds];
  }
}

export class DeleteLevelCommand implements Command {
  public readonly name = 'DeleteLevel';

  public constructor(public readonly levelId: ElementId) {}

  public apply(draft: BimState): void {
    const { restrictViolations } = resolveCascadeDeletions(draft, this.levelId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete level: ID "${this.levelId}" is referenced by ${restrictViolations.length} active element(s) (DELETE_LEVEL_REJECTED).`,
        { blockingIds: restrictViolations },
      );
    }
    Reflect.deleteProperty(draft.levels, this.levelId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.levelId];
  }
}
