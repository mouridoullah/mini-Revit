import type { Command } from './base.js';
import type { Door, Window, DoorType, WindowType, BimState, ElementId } from '../types.js';
import { validateDoor, validateWindow, BimValidationError } from '../rules/index.js';

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
    let resolvedDoor = this.door;
    if (!resolvedDoor.doorTypeId) {
      const typeKey = 'door-type-900x2100';
      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }
      if (!draft.doorTypes[typeKey]) {
        draft.doorTypes[typeKey] = {
          id: typeKey,
          name: 'Porte 900×2100 mm',
          width: 900,
          height: 2100,
        };
      }
      resolvedDoor = {
        ...this.door,
        doorTypeId: typeKey,
      };
    } else if (!draft.doorTypes?.[resolvedDoor.doorTypeId]) {
      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }
      draft.doorTypes[resolvedDoor.doorTypeId] = {
        id: resolvedDoor.doorTypeId,
        name: 'Porte 900×2100 mm',
        width: 900,
        height: 2100,
      };
    }
    validateDoor(resolvedDoor, draft as BimState);
    if (!draft.doors) {
      (draft as { doors: Record<ElementId, Door> }).doors = {};
    }
    draft.doors[this.door.id] = resolvedDoor;
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
    let resolvedWindow = this.window;
    if (!resolvedWindow.windowTypeId) {
      const rawSill = this.window.sillHeight ?? 900;
      const typeKey = `window-type-1200x1400-s${rawSill}`;
      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }
      if (!draft.windowTypes[typeKey]) {
        draft.windowTypes[typeKey] = {
          id: typeKey,
          name: 'Fenêtre 1200×1400 mm',
          width: 1200,
          height: 1400,
          defaultSillHeight: rawSill,
        };
      }
      resolvedWindow = {
        ...this.window,
        windowTypeId: typeKey,
      };
    } else if (!draft.windowTypes?.[resolvedWindow.windowTypeId]) {
      const rawSill = this.window.sillHeight ?? 900;
      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }
      draft.windowTypes[resolvedWindow.windowTypeId] = {
        id: resolvedWindow.windowTypeId,
        name: 'Fenêtre 1200×1400 mm',
        width: 1200,
        height: 1400,
        defaultSillHeight: rawSill,
      };
    }
    validateWindow(resolvedWindow, draft as BimState);
    if (!draft.windows) {
      (draft as { windows: Record<ElementId, Window> }).windows = {};
    }
    draft.windows[this.window.id] = resolvedWindow;
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
    public readonly patch: Partial<Omit<Door, 'id' | 'category' | 'kind' | 'hostWallId'>> & {
      width?: number;
      height?: number;
    },
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

    let targetDoorTypeId = this.patch.doorTypeId ?? existing.doorTypeId;
    const rawPatch = this.patch as unknown as { width?: number; height?: number };
    if (rawPatch.width !== undefined || rawPatch.height !== undefined) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn(
          '[UpdateDoorCommand] Patch with width/height is deprecated. Prefer doorTypeId.',
        );
      }
      const curType = targetDoorTypeId ? draft.doorTypes?.[targetDoorTypeId] : undefined;
      const curW = curType?.width ?? 900;
      const curH = curType?.height ?? 2100;
      const newW = rawPatch.width ?? curW;
      const newH = rawPatch.height ?? curH;

      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }

      // 1. Déduplication : rechercher si un DoorType équivalent existe déjà
      const existingMatch = Object.values(draft.doorTypes).find(
        (t) => t.width === newW && t.height === newH,
      );

      if (existingMatch) {
        targetDoorTypeId = existingMatch.id;
      } else {
        const typeKey = `door-type-${newW}x${newH}`;
        draft.doorTypes[typeKey] = {
          id: typeKey,
          name: `Porte ${newW}×${newH} mm`,
          width: newW,
          height: newH,
        };
        targetDoorTypeId = typeKey;
      }
    }

    const sanitizedDoorPatch = { ...this.patch };
    delete (sanitizedDoorPatch as { width?: number }).width;
    delete (sanitizedDoorPatch as { height?: number }).height;
    delete (sanitizedDoorPatch as { kind?: string }).kind;

    const updatedDoor: Door = {
      ...existing,
      ...sanitizedDoorPatch,
      id: existing.id,
      category: 'door',
      doorTypeId: targetDoorTypeId,
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
    public readonly patch: Partial<Omit<Window, 'id' | 'category' | 'kind' | 'hostWallId'>> & {
      width?: number;
      height?: number;
    },
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

    let targetWindowTypeId = this.patch.windowTypeId ?? existing.windowTypeId;
    const rawPatch = this.patch as unknown as { width?: number; height?: number };
    if (rawPatch.width !== undefined || rawPatch.height !== undefined) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn(
          '[UpdateWindowCommand] Patch with width/height is deprecated. Prefer windowTypeId.',
        );
      }
      const curType = targetWindowTypeId ? draft.windowTypes?.[targetWindowTypeId] : undefined;
      const curW = curType?.width ?? 1200;
      const curH = curType?.height ?? 1400;
      const newW = rawPatch.width ?? curW;
      const newH = rawPatch.height ?? curH;

      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }

      // 1. Déduplication : rechercher si un WindowType équivalent existe déjà
      const existingMatch = Object.values(draft.windowTypes).find(
        (t) =>
          t.width === newW &&
          t.height === newH &&
          (t.defaultSillHeight ?? 900) === (existing.sillHeight ?? 900),
      );

      if (existingMatch) {
        targetWindowTypeId = existingMatch.id;
      } else {
        const typeKey = `window-type-${newW}x${newH}-s${existing.sillHeight}`;
        draft.windowTypes[typeKey] = {
          id: typeKey,
          name: `Fenêtre ${newW}×${newH} mm`,
          width: newW,
          height: newH,
          defaultSillHeight: existing.sillHeight,
        };
        targetWindowTypeId = typeKey;
      }
    }

    const sanitizedWindowPatch = { ...this.patch };
    delete (sanitizedWindowPatch as { width?: number }).width;
    delete (sanitizedWindowPatch as { height?: number }).height;
    delete (sanitizedWindowPatch as { kind?: string }).kind;

    const updatedWindow: Window = {
      ...existing,
      ...sanitizedWindowPatch,
      id: existing.id,
      category: 'window',
      windowTypeId: targetWindowTypeId,
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
