import {
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
  type BimState,
  type ElementId,
} from './types.js';
import {
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
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
  private deletedOpeningIds: ElementId[] = [];

  public constructor(public readonly wallId: ElementId) {}

  public apply(draft: BimState): void {
    if (!draft.walls[this.wallId]) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete wall: ID "${this.wallId}" not found.`,
      );
    }

    // Cascade ON DELETE CASCADE : suppression de toutes les portes et fenêtres hébergées
    this.deletedOpeningIds = [];
    if (draft.doors) {
      for (const [doorId, door] of Object.entries(draft.doors)) {
        if (door.hostWallId === this.wallId) {
          Reflect.deleteProperty(draft.doors, doorId);
          this.deletedOpeningIds.push(doorId);
        }
      }
    }
    if (draft.windows) {
      for (const [windowId, win] of Object.entries(draft.windows)) {
        if (win.hostWallId === this.wallId) {
          Reflect.deleteProperty(draft.windows, windowId);
          this.deletedOpeningIds.push(windowId);
        }
      }
    }

    Reflect.deleteProperty(draft.walls, this.wallId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallId, ...this.deletedOpeningIds];
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

// ---------------------------------------------------------------------------
// Commandes relatives aux Ouvertures (Doors & Windows)
// ---------------------------------------------------------------------------

export class AddDoorCommand implements Command {
  public readonly name = 'AddDoor';

  public constructor(public readonly door: Door) {}

  public apply(draft: BimState): void {
    if (draft.doors?.[this.door.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A door with ID "${this.door.id}" already exists.`,
      );
    }
    validateDoor(this.door, draft as BimState);
    if (!draft.doors) {
      (draft as { doors: Record<ElementId, Door> }).doors = {};
    }
    draft.doors[this.door.id] = this.door;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.door.id, this.door.hostWallId];
  }
}

export class AddWindowCommand implements Command {
  public readonly name = 'AddWindow';

  public constructor(public readonly window: Window) {}

  public apply(draft: BimState): void {
    if (draft.windows?.[this.window.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A window with ID "${this.window.id}" already exists.`,
      );
    }
    validateWindow(this.window, draft as BimState);
    if (!draft.windows) {
      (draft as { windows: Record<ElementId, Window> }).windows = {};
    }
    draft.windows[this.window.id] = this.window;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.window.id, this.window.hostWallId];
  }
}

export class UpdateDoorCommand implements Command {
  public readonly name = 'UpdateDoor';
  private hostWallId: ElementId = '';

  public constructor(
    public readonly doorId: ElementId,
    public readonly patch: Partial<Omit<Door, 'id' | 'category' | 'kind' | 'hostWallId'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.doors?.[this.doorId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update door: ID "${this.doorId}" not found.`,
      );
    }
    this.hostWallId = existing.hostWallId;
    const updatedDoor: Door = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'door',
      kind: 'door',
      hostWallId: existing.hostWallId,
    };
    validateDoor(updatedDoor, draft as BimState);
    draft.doors[this.doorId] = updatedDoor;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.doorId, ...(this.hostWallId ? [this.hostWallId] : [])];
  }
}

export class UpdateWindowCommand implements Command {
  public readonly name = 'UpdateWindow';
  private hostWallId: ElementId = '';

  public constructor(
    public readonly windowId: ElementId,
    public readonly patch: Partial<Omit<Window, 'id' | 'category' | 'kind' | 'hostWallId'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.windows?.[this.windowId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update window: ID "${this.windowId}" not found.`,
      );
    }
    this.hostWallId = existing.hostWallId;
    const updatedWindow: Window = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'window',
      kind: 'window',
      hostWallId: existing.hostWallId,
    };
    validateWindow(updatedWindow, draft as BimState);
    draft.windows[this.windowId] = updatedWindow;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.windowId, ...(this.hostWallId ? [this.hostWallId] : [])];
  }
}

export class DeleteOpeningCommand implements Command {
  public readonly name = 'DeleteOpening';
  private hostWallId: ElementId = '';

  public constructor(public readonly openingId: ElementId) {}

  public apply(draft: BimState): void {
    const door = draft.doors?.[this.openingId];
    if (door) {
      this.hostWallId = door.hostWallId;
      Reflect.deleteProperty(draft.doors, this.openingId);
      return;
    }
    const win = draft.windows?.[this.openingId];
    if (win) {
      this.hostWallId = win.hostWallId;
      Reflect.deleteProperty(draft.windows, this.openingId);
      return;
    }
    throw new BimValidationError(
      'ELEMENT_NOT_FOUND',
      `Cannot delete opening: ID "${this.openingId}" not found in doors or windows.`,
    );
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.openingId, ...(this.hostWallId ? [this.hostWallId] : [])];
  }
}

export class MoveOpeningCommand implements Command {
  public readonly name = 'MoveOpening';
  private hostWallId: ElementId = '';

  public constructor(
    public readonly openingId: ElementId,
    public readonly newOffsetAlong: number,
  ) {}

  public apply(draft: BimState): void {
    const door = draft.doors?.[this.openingId];
    if (door) {
      this.hostWallId = door.hostWallId;
      const updated: Door = {
        ...door,
        offsetAlong: this.newOffsetAlong,
      };
      validateDoor(updated, draft as BimState);
      draft.doors[this.openingId] = updated;
      return;
    }

    const win = draft.windows?.[this.openingId];
    if (win) {
      this.hostWallId = win.hostWallId;
      const updated: Window = {
        ...win,
        offsetAlong: this.newOffsetAlong,
      };
      validateWindow(updated, draft as BimState);
      draft.windows[this.openingId] = updated;
      return;
    }

    throw new BimValidationError(
      'ELEMENT_NOT_FOUND',
      `Cannot move opening: ID "${this.openingId}" not found in doors or windows.`,
    );
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.openingId, ...(this.hostWallId ? [this.hostWallId] : [])];
  }
}
