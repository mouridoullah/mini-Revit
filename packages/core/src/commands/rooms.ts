import type { Command } from './base.js';
import type { Room, BimState, ElementId } from '../types.js';
import { validateRoom, BimValidationError } from '../rules/index.js';
import { detectRooms } from '../rooms/detect.js';
import { isPointInPolygon } from '@mini-bim/geometry';

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

    let area = this.room.area;
    const status: 'enclosed' | 'unenclosed' = this.room.status ?? 'enclosed';
    if (area === undefined) {
      const detected = detectRooms(draft as BimState, this.room.levelId);
      const match = detected.find((d) => {
        if (!isPointInPolygon(this.room.seed, d.polygon)) return false;
        if (d.holes && d.holes.some((h) => isPointInPolygon(this.room.seed, h))) return false;
        return true;
      });
      if (match) {
        area = match.areaMm2 / 1_000_000;
      }
    }

    draft.rooms[this.room.id] = {
      ...this.room,
      status,
      ...(area !== undefined ? { area } : {}),
    };
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
    let updated: Room = {
      ...existing,
      ...(this.patch.name !== undefined ? { name: this.patch.name } : {}),
      ...(this.patch.seed !== undefined ? { seed: this.patch.seed } : {}),
    };
    validateRoom(updated, draft as BimState);
    if (this.patch.seed !== undefined) {
      const detected = detectRooms(draft as BimState, updated.levelId);
      const match = detected.find((d) => isPointInPolygon(updated.seed, d.polygon));
      if (!match) {
        throw new BimValidationError(
          'ROOM_SEED_NOT_IN_CLOSED_AREA',
          `Cannot place room seed at (${updated.seed.x}, ${updated.seed.y}): point is not inside any closed boundary.`,
          { offendingIds: [this.roomId] },
        );
      }
      updated = {
        ...updated,
        area: match.areaMm2 / 1_000_000,
        status: 'enclosed',
      };
    }
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
