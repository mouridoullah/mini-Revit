import type { Command } from './base.js';
import type { Wall, WallType, BimState, ElementId } from '../types.js';
import { validateWall, validateWallType, BimValidationError } from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';
import { detectRooms } from '../rooms/detect.js';
import { computeDimensionValue } from '../dimensions/index.js';
import {
  isPointInPolygon,
  computeWallStretch,
  projectOpeningOffset,
  findConnectedWalls,
  WallStretchError,
  type Vec2,
} from '@mini-bim/geometry';

export class AddWallCommand implements Command {
  public readonly name = 'AddWall';
  private impactedRoomIds: ElementId[] = [];

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

    // Mise à jour associative des pièces de ce niveau (ex: fermeture d'une pièce jusqu'ici non enclose)
    const impactedRooms: ElementId[] = [];
    if (draft.rooms) {
      const levelRooms = Object.values(draft.rooms).filter((r) => r.levelId === this.wall.levelId);
      if (levelRooms.length > 0) {
        const detected = detectRooms(draft as BimState, this.wall.levelId);
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
            };
          }
          impactedRooms.push(room.id);
        }
      }
    }
    this.impactedRoomIds = impactedRooms.sort();
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wall.id, ...this.impactedRoomIds];
  }
}

export class UpdateWallCommand implements Command {
  public readonly name = 'UpdateWall';
  private impactedDimensionIds: ElementId[] = [];
  private impactedRoomIds: ElementId[] = [];

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
    if ('heightOverride' in this.patch && this.patch.heightOverride === undefined) {
      delete (updatedWall as { heightOverride?: number }).heightOverride;
    }
    if ('loadBearing' in this.patch && this.patch.loadBearing === undefined) {
      delete (updatedWall as { loadBearing?: boolean }).loadBearing;
    }
    if ('isExternal' in this.patch && this.patch.isExternal === undefined) {
      delete (updatedWall as { isExternal?: boolean }).isExternal;
    }

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

    // Mise à jour associative des pièces de ce niveau (Point B / Phase 7.6.1)
    const impactedRooms: ElementId[] = [];
    if (draft.rooms) {
      const levelRooms = Object.values(draft.rooms).filter((r) => r.levelId === updatedWall.levelId);
      if (levelRooms.length > 0) {
        const detected = detectRooms(draft as BimState, updatedWall.levelId);
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
            };
          }
          impactedRooms.push(room.id);
        }
      }
    }
    this.impactedRoomIds = impactedRooms.sort();
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.wallId, ...this.impactedDimensionIds, ...this.impactedRoomIds];
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
        const task = queue.shift();
        if (!task) break;
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

    // 2b. Détacher les composants éventuellement adossés à ce mur
    if (draft.components) {
      for (const [compId, comp] of Object.entries(draft.components)) {
        if (comp.placement.hostWallId === this.wallId) {
          draft.components[compId] = {
            ...comp,
            placement: {
              ...comp.placement,
              hostWallId: undefined,
            },
          };
          this.cascadedIds.push(compId);
        }
      }
      this.cascadedIds = Array.from(new Set(this.cascadedIds)).sort();
    }

    // 3. Impact sur les Pièces de ce niveau (Préservation de l'identité - Phase 7.6)
    // Un BIM professionnel conserve l'entité Room (nom, germe, métadonnées) et bascule son statut
    // en 'unenclosed' pour le Room Leak Detector, sans la détruire du document.
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
            draft.rooms[roomId] = {
              ...room,
              status: 'unenclosed',
            };
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
