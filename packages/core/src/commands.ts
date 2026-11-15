import {
  type Wall,
  type WallType,
  type Level,
  type Door,
  type Window,
  type DoorType,
  type WindowType,
  type Slab,
  type SlabType,
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
  validateSlab,
  validateSlabType,
  validateRoom,
  validateDimension,
  BimValidationError,
} from './rules.js';
import { resolveCascadeDeletions } from './relations/cascade.js';
import { detectRooms } from './rooms/detect.js';
import { computeDimensionValue } from './dimensions/index.js';
import {
  isPointInPolygon,
  computeWallStretch,
  projectOpeningOffset,
  findConnectedWalls,
  WallStretchError,
  type Vec2,
} from '@mini-bim/geometry';

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

/**
 * Options d'exécution de MoveWallCommand.
 */
export interface MoveWallOptions {
  /**
   * Maintien élastique de la connectivité des murs voisins (défaut : true).
   */
  readonly stretchNeighbors?: boolean;
  /**
   * Propagation transitive en chaîne récursive (défaut : false).
   */
  readonly propagateChain?: boolean;
}

/**
 * Déplacement paramétrique d'un mur avec maintien de connectivité des jonctions (ADR-044).
 *
 * Applique l'Option α (Revit-like elastic stretch) sur les voisins directs,
 * compense l'abscisse curviligne offsetAlong des baies hébergées par projection monde (Option β),
 * et préserve le statut des pièces (ADR-039).
 */
export class MoveWallCommand implements Command {
  public readonly name = 'MoveWall';
  private changedIds: ElementId[] = [];

  public constructor(
    public readonly wallId: ElementId,
    public readonly delta: Vec2,
    public readonly options: MoveWallOptions = {},
  ) {}

  public apply(draft: BimState): void {
    const wall = draft.walls[this.wallId];
    if (!wall) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot move wall: ID "${this.wallId}" not found.`,
        { offendingIds: [this.wallId] },
      );
    }

    if (this.delta.x === 0 && this.delta.y === 0) {
      this.changedIds = [this.wallId];
      return;
    }

    const stretchNeighbors = this.options.stretchNeighbors !== false;
    const propagateChain = this.options.propagateChain === true;

    // Déplacement initial du mur cible
    const movedA: Wall = {
      ...wall,
      start: { x: wall.start.x + this.delta.x, y: wall.start.y + this.delta.y },
      end: { x: wall.end.x + this.delta.x, y: wall.end.y + this.delta.y },
    };
    validateWall(movedA, draft as BimState);
    draft.walls[this.wallId] = movedA;

    const modifiedWallIds = new Set<ElementId>([this.wallId]);
    const affectedOpeningIds = new Set<ElementId>();
    const affectedRoomIds = new Set<ElementId>();

    if (stretchNeighbors) {
      const visited = new Set<ElementId>([this.wallId]);

      interface StretchTask {
        movedWall: { id: ElementId; start: Vec2; end: Vec2; levelId: ElementId };
        delta: Vec2;
        parentId?: ElementId;
      }

      const queue: StretchTask[] = [
        {
          movedWall: wall, // État géométrique avant translation
          delta: this.delta,
        },
      ];

      while (queue.length > 0) {
        const task = queue.shift()!;
        const levelWalls = Object.values(draft.walls).filter(
          (w) => w.levelId === task.movedWall.levelId,
        );

        const connected = findConnectedWalls(task.movedWall, levelWalls);

        for (const conn of connected) {
          const neighborId = conn.wallId;
          // Ignorer le mur parent qui vient de déclencher cette tâche
          if (task.parentId && neighborId === task.parentId) {
            continue;
          }

          if (visited.has(neighborId)) {
            if (propagateChain) {
              throw new BimValidationError(
                'WALL_STRETCH_CYCLE',
                `Cycle d'étirement détecté dans la chaîne cinématique fermée de murs.`,
                { offendingIds: Array.from(visited) },
              );
            }
            continue;
          }

          const neighbor = draft.walls[neighborId];
          if (!neighbor) continue;

          let stretchRes;
          try {
            stretchRes = computeWallStretch({
              movedWall: task.movedWall,
              delta: task.delta,
              neighbor: { start: neighbor.start, end: neighbor.end },
              connection: conn.connection,
            });
          } catch (err) {
            if (err instanceof WallStretchError) {
              throw new BimValidationError(err.code, err.message, {
                offendingIds: [task.movedWall.id, neighborId],
              });
            }
            throw err;
          }

          visited.add(neighborId);
          modifiedWallIds.add(neighborId);

          const oldNeighbor = { start: neighbor.start, end: neighbor.end };
          const updatedNeighbor: Wall = {
            ...neighbor,
            start: stretchRes.newNeighborEndpoints.start,
            end: stretchRes.newNeighborEndpoints.end,
          };
          validateWall(updatedNeighbor, draft as BimState);
          draft.walls[neighborId] = updatedNeighbor;

          // Compensation d'abscisse curviligne des baies (Option β d'ADR-044)
          if (draft.doors) {
            for (const [doorId, door] of Object.entries(draft.doors)) {
              if (door.hostWallId === neighborId) {
                const newOffset = projectOpeningOffset(
                  door.offsetAlong,
                  oldNeighbor,
                  updatedNeighbor,
                );
                draft.doors[doorId] = {
                  ...door,
                  offsetAlong: newOffset,
                };
                affectedOpeningIds.add(doorId);
              }
            }
          }

          if (draft.windows) {
            for (const [winId, win] of Object.entries(draft.windows)) {
              if (win.hostWallId === neighborId) {
                const newOffset = projectOpeningOffset(
                  win.offsetAlong,
                  oldNeighbor,
                  updatedNeighbor,
                );
                draft.windows[winId] = {
                  ...win,
                  offsetAlong: newOffset,
                };
                affectedOpeningIds.add(winId);
              }
            }
          }

          // Si propagation en chaîne récursive demandée
          if (propagateChain) {
            queue.push({
              movedWall: neighbor,
              delta: task.delta,
              parentId: task.movedWall.id,
            });
          }
        }
      }
    }

    // Mise à jour associative des cotations impactées
    if (draft.dimensions) {
      for (const [dimId, dim] of Object.entries(draft.dimensions)) {
        const touches = dim.references.some((ref) => modifiedWallIds.has(ref));
        if (touches) {
          const newVal = computeDimensionValue(dim, draft as BimState);
          draft.dimensions[dimId] = {
            ...dim,
            value: newVal,
          };
        }
      }
    }

    // Mise à jour non-destructive des pièces du niveau (ADR-039 / ADR-044)
    if (draft.rooms) {
      const levelRooms = Object.values(draft.rooms).filter((r) => r.levelId === wall.levelId);
      if (levelRooms.length > 0) {
        const detected = detectRooms(draft as BimState, wall.levelId);
        for (const room of levelRooms) {
          const match = detected.find((d) => isPointInPolygon(room.seed, d.polygon));
          if (match) {
            draft.rooms[room.id] = {
              ...room,
              status: 'enclosed',
              area: match.areaMm2 / 1_000_000,
            };
          } else {
            draft.rooms[room.id] = {
              ...room,
              status: 'unenclosed',
              area: 0,
            };
          }
          affectedRoomIds.add(room.id);
        }
      }
    }

    const sortedNeighbors = Array.from(modifiedWallIds)
      .filter((id) => id !== this.wallId)
      .sort();
    const sortedOpenings = Array.from(affectedOpeningIds).sort();
    const sortedRooms = Array.from(affectedRoomIds).sort();

    this.changedIds = [this.wallId, ...sortedNeighbors, ...sortedOpenings, ...sortedRooms];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
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
    let resolvedDoor = this.door;
    if (!resolvedDoor.doorTypeId) {
      const rawW = (this.door as unknown as { width?: number }).width ?? 900;
      const rawH = (this.door as unknown as { height?: number }).height ?? 2100;
      const typeKey = `door-type-${rawW}x${rawH}`;
      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }
      if (!draft.doorTypes[typeKey]) {
        draft.doorTypes[typeKey] = {
          id: typeKey,
          name: `Porte ${rawW}×${rawH} mm`,
          width: rawW,
          height: rawH,
        };
      }
      resolvedDoor = {
        ...this.door,
        doorTypeId: typeKey,
      };
    } else if (!draft.doorTypes?.[resolvedDoor.doorTypeId]) {
      const rawW = (this.door as unknown as { width?: number }).width ?? 900;
      const rawH = (this.door as unknown as { height?: number }).height ?? 2100;
      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }
      draft.doorTypes[resolvedDoor.doorTypeId] = {
        id: resolvedDoor.doorTypeId,
        name: `Porte ${rawW}×${rawH} mm`,
        width: rawW,
        height: rawH,
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
      const rawW = (this.window as unknown as { width?: number }).width ?? 1200;
      const rawH = (this.window as unknown as { height?: number }).height ?? 1400;
      const rawSill = this.window.sillHeight ?? 900;
      const typeKey = `window-type-${rawW}x${rawH}-s${rawSill}`;
      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }
      if (!draft.windowTypes[typeKey]) {
        draft.windowTypes[typeKey] = {
          id: typeKey,
          name: `Fenêtre ${rawW}×${rawH} mm`,
          width: rawW,
          height: rawH,
          defaultSillHeight: rawSill,
        };
      }
      resolvedWindow = {
        ...this.window,
        windowTypeId: typeKey,
      };
    } else if (!draft.windowTypes?.[resolvedWindow.windowTypeId]) {
      const rawW = (this.window as unknown as { width?: number }).width ?? 1200;
      const rawH = (this.window as unknown as { height?: number }).height ?? 1400;
      const rawSill = this.window.sillHeight ?? 900;
      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }
      draft.windowTypes[resolvedWindow.windowTypeId] = {
        id: resolvedWindow.windowTypeId,
        name: `Fenêtre ${rawW}×${rawH} mm`,
        width: rawW,
        height: rawH,
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

    let targetDoorTypeId = this.patch.doorTypeId ?? existing.doorTypeId;
    const rawPatch = this.patch as unknown as { width?: number; height?: number };
    if (rawPatch.width !== undefined || rawPatch.height !== undefined) {
      const curType = targetDoorTypeId ? draft.doorTypes?.[targetDoorTypeId] : undefined;
      const curW = curType?.width ?? (existing as unknown as { width?: number }).width ?? 900;
      const curH = curType?.height ?? (existing as unknown as { height?: number }).height ?? 2100;
      const newW = rawPatch.width ?? curW;
      const newH = rawPatch.height ?? curH;
      const typeKey = `door-type-${newW}x${newH}`;
      if (!draft.doorTypes) {
        (draft as { doorTypes: Record<ElementId, DoorType> }).doorTypes = {};
      }
      if (!draft.doorTypes[typeKey]) {
        draft.doorTypes[typeKey] = {
          id: typeKey,
          name: `Porte ${newW}×${newH} mm`,
          width: newW,
          height: newH,
        };
      }
      targetDoorTypeId = typeKey;
    }

    const updatedDoor: Door = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'door',
      kind: 'door',
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

    let targetWindowTypeId = this.patch.windowTypeId ?? existing.windowTypeId;
    const rawPatch = this.patch as unknown as { width?: number; height?: number };
    if (rawPatch.width !== undefined || rawPatch.height !== undefined) {
      const curType = targetWindowTypeId ? draft.windowTypes?.[targetWindowTypeId] : undefined;
      const curW = curType?.width ?? (existing as unknown as { width?: number }).width ?? 1200;
      const curH = curType?.height ?? (existing as unknown as { height?: number }).height ?? 1400;
      const newW = rawPatch.width ?? curW;
      const newH = rawPatch.height ?? curH;
      const typeKey = `window-type-${newW}x${newH}-s${existing.sillHeight}`;
      if (!draft.windowTypes) {
        (draft as { windowTypes: Record<ElementId, WindowType> }).windowTypes = {};
      }
      if (!draft.windowTypes[typeKey]) {
        draft.windowTypes[typeKey] = {
          id: typeKey,
          name: `Fenêtre ${newW}×${newH} mm`,
          width: newW,
          height: newH,
          defaultSillHeight: existing.sillHeight,
        };
      }
      targetWindowTypeId = typeKey;
    }

    const updatedWindow: Window = {
      ...existing,
      ...this.patch,
      id: existing.id,
      category: 'window',
      kind: 'window',
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

// ---------------------------------------------------------------------------
// Commandes relatives aux Types de Dalles (SlabTypes)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Commandes relatives aux Dalles (Slabs)
// ---------------------------------------------------------------------------

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
