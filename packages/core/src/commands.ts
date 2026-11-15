import {
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
  type Room,
  type Dimension,
  type BimState,
  type ElementId,
} from './types.js';
import {
  validateWall,
  validateWallType,
  validateLevel,
  validateDoor,
  validateWindow,
  validateRoom,
  validateDimension,
  BimValidationError,
} from './rules.js';
import { resolveCascadeDeletions } from './relations/cascade.js';
import { detectRooms } from './rooms/detect.js';
import { computeDimensionValue } from './dimensions/index.js';
import { isPointInPolygon } from '@mini-bim/geometry';

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
  private impactedDimensionIds: ElementId[] = [];

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

    // Mise à jour associative des cotations qui référencent ce mur
    const impacted: ElementId[] = [];
    if (draft.dimensions) {
      for (const [dimId, dim] of Object.entries(draft.dimensions)) {
        if (dim.references.includes(this.wallId)) {
          const newVal = computeDimensionValue(dim, draft as BimState);
          draft.dimensions[dimId] = {
            ...dim,
            value: newVal,
          };
          impacted.push(dimId);
        }
      }
    }
    this.impactedDimensionIds = impacted.sort();
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallId, ...this.impactedDimensionIds];
  }
}

export class DeleteWallCommand implements Command {
  public readonly name = 'DeleteWall';
  private cascadedIds: ElementId[] = [];
  private deletedRoomIds: ElementId[] = [];

  public constructor(public readonly wallId: ElementId) {}

  public apply(draft: BimState): void {
    const wall = draft.walls[this.wallId];
    if (!wall) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete wall: ID "${this.wallId}" not found.`,
      );
    }
    const levelId = wall.levelId;

    // 1. Résolution déclarative générique des cascades (portes, fenêtres, cotations - ADR-038)
    const { cascadeDeletes } = resolveCascadeDeletions(draft, this.wallId);

    // 2. Suppression atomique de toutes les entités identifiées
    for (const id of cascadeDeletes) {
      if (id === this.wallId) {
        Reflect.deleteProperty(draft.walls, id);
      } else if (draft.doors?.[id]) {
        Reflect.deleteProperty(draft.doors, id);
      } else if (draft.windows?.[id]) {
        Reflect.deleteProperty(draft.windows, id);
      } else if (draft.dimensions?.[id]) {
        Reflect.deleteProperty(draft.dimensions, id);
      }
    }
    this.cascadedIds = Array.from(cascadeDeletes).sort();

    // 3. Cascade Rooms sur ce niveau (D1 / Phase 4)
    const cascadedRooms: ElementId[] = [];
    if (draft.rooms) {
      const remainingRoomsOnLevel = Object.entries(draft.rooms).filter(
        ([_, r]) => r.levelId === levelId,
      );

      if (remainingRoomsOnLevel.length > 0) {
        const remainingDetected = detectRooms(draft as BimState, levelId);
        for (const [roomId, room] of remainingRoomsOnLevel) {
          const stillClosed = remainingDetected.some((d) => isPointInPolygon(room.seed, d.polygon));
          if (!stillClosed) {
            Reflect.deleteProperty(draft.rooms, roomId);
            cascadedRooms.push(roomId);
          }
        }
      }
    }
    this.deletedRoomIds = cascadedRooms.sort();
  }

  public getChangedIds(): readonly ElementId[] {
    const others = this.cascadedIds.filter((id) => id !== this.wallId);
    return [this.wallId, ...others, ...this.deletedRoomIds];
  }

  public getAdditionalChangedIds(): readonly ElementId[] {
    return this.deletedRoomIds;
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
    const { restrictViolations } = resolveCascadeDeletions(draft, this.typeId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete wall type: ID "${this.typeId}" is referenced by ${restrictViolations.length} active wall(s) (DELETE_WALL_TYPE_REJECTED).`,
        { blockingIds: restrictViolations },
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

// ---------------------------------------------------------------------------
// Commandes relatives aux Pièces (Rooms)
// ---------------------------------------------------------------------------

export class AddRoomCommand implements Command {
  public readonly name = 'AddRoom';

  public constructor(public readonly room: Room) {}

  public apply(draft: BimState): void {
    if (!draft.rooms) {
      (draft as { rooms: Record<ElementId, Room> }).rooms = {};
    }
    if (draft.rooms[this.room.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A room with ID "${this.room.id}" already exists.`,
      );
    }
    // Validation d'intégrité spatiale et référentielle
    validateRoom(this.room, draft as BimState);
    draft.rooms[this.room.id] = this.room;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.room.id];
  }
}

export class UpdateRoomCommand implements Command {
  public readonly name = 'UpdateRoom';

  public constructor(
    public readonly roomId: ElementId,
    public readonly patch: Partial<Pick<Room, 'name' | 'seed'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.rooms?.[this.roomId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update room: ID "${this.roomId}" not found.`,
      );
    }
    const updated: Room = {
      ...existing,
      ...(this.patch.name !== undefined ? { name: this.patch.name } : {}),
      ...(this.patch.seed !== undefined ? { seed: this.patch.seed } : {}),
    };
    validateRoom(updated, draft as BimState);
    draft.rooms[this.roomId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roomId];
  }
}

export class DeleteRoomCommand implements Command {
  public readonly name = 'DeleteRoom';

  public constructor(public readonly roomId: ElementId) {}

  public apply(draft: BimState): void {
    if (!draft.rooms?.[this.roomId]) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete room: ID "${this.roomId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.rooms, this.roomId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.roomId];
  }
}

// ---------------------------------------------------------------------------
// Commandes relatives aux Cotations (Dimensions)
// ---------------------------------------------------------------------------

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
