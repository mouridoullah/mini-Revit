import { type Wall, type WallType, type Level, type BimState, type ElementId } from './types.js';
import {
  validateWall,
  validateWallType,
  validateLevel,
  canDeleteLevel,
  canDeleteWallType,
  BimValidationError,
} from './rules.js';

/**
 * Interface fondamentale d'une commande transactionnelle de mutation d'état BIM.
 */
export interface Command {
  readonly name: string;
  apply(draft: BimState): void;
  getChangedIds(): readonly ElementId[];
}

// ---------------------------------------------------------------------------
// Commandes relatives aux Murs (Walls)
// ---------------------------------------------------------------------------

export class AddWallCommand implements Command {
  public readonly name = 'AddWall';

  public constructor(public readonly wall: Wall) {}

  public apply(draft: BimState): void {
    if (draft.walls[this.wall.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A wall with ID "${this.wall.id}" already exists.`,
      );
    }
    // Validation d'intégrité métier
    validateWall(this.wall, draft as BimState);
    draft.walls[this.wall.id] = this.wall;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wall.id];
  }
}

export class UpdateWallCommand implements Command {
  public readonly name = 'UpdateWall';

  public constructor(
    public readonly wallId: ElementId,
    public readonly patch: Partial<Omit<Wall, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.walls[this.wallId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update wall: ID "${this.wallId}" not found.`,
      );
    }

    const updatedWall: Wall = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'wall',
    };

    validateWall(updatedWall, draft as BimState);
    draft.walls[this.wallId] = updatedWall;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallId];
  }
}

export class DeleteWallCommand implements Command {
  public readonly name = 'DeleteWall';

  public constructor(public readonly wallId: ElementId) {}

  public apply(draft: BimState): void {
    if (!draft.walls[this.wallId]) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete wall: ID "${this.wallId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.walls, this.wallId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallId];
  }
}

// ---------------------------------------------------------------------------
// Commandes relatives aux Niveaux (Levels)
// ---------------------------------------------------------------------------

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
    validateLevel(this.level);
    draft.levels[this.level.id] = this.level;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.level.id];
  }
}

export class UpdateLevelCommand implements Command {
  public readonly name = 'UpdateLevel';

  public constructor(
    public readonly levelId: ElementId,
    public readonly patch: Partial<Omit<Level, 'id'>>,
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

    validateLevel(updatedLevel);
    draft.levels[this.levelId] = updatedLevel;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.levelId];
  }
}

export class DeleteLevelCommand implements Command {
  public readonly name = 'DeleteLevel';

  public constructor(public readonly levelId: ElementId) {}

  public apply(draft: BimState): void {
    const check = canDeleteLevel(this.levelId, draft as BimState);
    if (!check.allowed) {
      throw new BimValidationError('DELETE_LEVEL_REJECTED', check.reason ?? 'Cannot delete level.');
    }
    Reflect.deleteProperty(draft.levels, this.levelId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.levelId];
  }
}

// ---------------------------------------------------------------------------
// Commandes relatives aux Types de Murs (WallTypes)
// ---------------------------------------------------------------------------

export class AddWallTypeCommand implements Command {
  public readonly name = 'AddWallType';

  public constructor(public readonly wallType: WallType) {}

  public apply(draft: BimState): void {
    if (draft.wallTypes[this.wallType.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A wall type with ID "${this.wallType.id}" already exists.`,
      );
    }
    validateWallType(this.wallType);
    draft.wallTypes[this.wallType.id] = this.wallType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallType.id];
  }
}

export class UpdateWallTypeCommand implements Command {
  public readonly name = 'UpdateWallType';

  public constructor(
    public readonly typeId: ElementId,
    public readonly patch: Partial<Omit<WallType, 'id'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.wallTypes[this.typeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update wall type: ID "${this.typeId}" not found.`,
      );
    }

    const updatedType: WallType = {
      ...existing,
      ...this.patch,
      id: existing.id,
    };

    validateWallType(updatedType);
    draft.wallTypes[this.typeId] = updatedType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.typeId];
  }
}

export class DeleteWallTypeCommand implements Command {
  public readonly name = 'DeleteWallType';

  public constructor(public readonly typeId: ElementId) {}

  public apply(draft: BimState): void {
    const check = canDeleteWallType(this.typeId, draft as BimState);
    if (!check.allowed) {
      throw new BimValidationError(
        'DELETE_WALL_TYPE_REJECTED',
        check.reason ?? 'Cannot delete wall type.',
      );
    }
    Reflect.deleteProperty(draft.wallTypes, this.typeId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.typeId];
  }
}
