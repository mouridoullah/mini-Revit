import {
  AddComponentCommand,
  AddDoorCommand,
  AddRoomCommand,
  AddWallCommand,
  AddWindowCommand,
  AutoDimensionLevelCommand,
  AutoGenerateViewsCommand,
  BimValidationError,
  DeleteOpeningCommand,
  DeleteWallCommand,
  generateId,
  MoveOpeningCommand,
  MoveWallCommand,
  UpdateWallCommand,
  type BimState,
  type DoorSwingDirection,
  type DoorSwingSide,
  type ElementId,
  type Wall,
} from '@tabax/core';
import type { PlannedStep } from '../planner/types.js';
import type { ExposedToolSchema, ToolDefinition, ToolExecutionContext, ToolResult } from '../types.js';
import { ToolArgumentValidationError, ToolRegistry } from './ToolRegistry.js';
import { PHASE1_READ_TOOLS, createPhase1ReadRegistry } from './readTools.js';
import {
  asPlainObject,
  normalizeDegrees,
  readOptionalBoolean,
  readOptionalEnum,
  readOptionalFiniteNumber,
  readOptionalString,
  readRequiredFiniteNumber,
  readRequiredString,
} from './validationHelpers.js';

function runSandboxMutationStep(
  step: PlannedStep,
  ctx: ToolExecutionContext,
  extraData: Record<string, unknown>,
): ToolResult<Record<string, unknown>> {
  try {
    const cmdResult = ctx.doc.execute(step.createCommand());
    ctx.onPlanStep?.(step);
    return {
      ok: true,
      data: {
        summary: step.summary,
        changedIds: cmdResult.changed,
        ...extraData,
      },
    };
  } catch (err) {
    if (err instanceof BimValidationError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        ...(err.offendingIds ? { offendingIds: err.offendingIds } : {}),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      code: 'MUTATION_FAILED',
      message,
    };
  }
}

function resolveDefaultCatalogId(
  record: Readonly<Record<string, unknown>> | undefined,
  preferredId: string,
): string | undefined {
  if (!record) return undefined;
  if (preferredId in record) return preferredId;
  return Object.keys(record)[0];
}

// ============================================================================
// 1. add_wall
// ============================================================================

export interface AddWallArgs {
  readonly levelId: string;
  readonly startXMm: number;
  readonly startYMm: number;
  readonly endXMm: number;
  readonly endYMm: number;
  readonly typeId?: string | undefined;
}

export const addWallTool: ToolDefinition<AddWallArgs, Record<string, unknown>> = {
  name: 'add_wall',
  mode: 'mutate',
  description: 'Ajoute un mur linéaire sur un niveau donné entre deux points 2D exprimés en millimètres.',
  parameters: {
    type: 'object',
    properties: {
      levelId: { type: 'string', description: 'Identifiant exact du niveau cible.' },
      startXMm: { type: 'number', description: 'Coordonnée X de départ en mm.' },
      startYMm: { type: 'number', description: 'Coordonnée Y de départ en mm.' },
      endXMm: { type: 'number', description: 'Coordonnée X d’arrivée en mm.' },
      endYMm: { type: 'number', description: 'Coordonnée Y d’arrivée en mm.' },
      typeId: { type: 'string', description: 'Identifiant optionnel du type de mur (WallType).' },
    },
    required: ['levelId', 'startXMm', 'startYMm', 'endXMm', 'endYMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const typeId = readOptionalString(obj, 'typeId');
    return {
      levelId: readRequiredString(obj, 'levelId'),
      startXMm: readRequiredFiniteNumber(obj, 'startXMm'),
      startYMm: readRequiredFiniteNumber(obj, 'startYMm'),
      endXMm: readRequiredFiniteNumber(obj, 'endXMm'),
      endYMm: readRequiredFiniteNumber(obj, 'endYMm'),
      ...(typeId !== undefined ? { typeId } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.levels[args.levelId]) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const resolvedTypeId = args.typeId ?? Object.keys(state.wallTypes)[0];
    if (!resolvedTypeId || !state.wallTypes[resolvedTypeId]) {
      return {
        ok: false,
        code: 'UNKNOWN_WALL_TYPE',
        message: `Type de mur introuvable "${args.typeId ?? ''}".`,
        validIds: Object.keys(state.wallTypes),
      };
    }

    const wallId = generateId();
    const lengthMm = Math.round(Math.hypot(args.endXMm - args.startXMm, args.endYMm - args.startYMm));
    const wallTypeName = state.wallTypes[resolvedTypeId]?.name ?? resolvedTypeId;
    const normalizedArgs = { ...args, typeId: resolvedTypeId, wallId };

    const step: PlannedStep = {
      toolName: 'add_wall',
      operation: 'create',
      summary: `Créer un mur (${wallTypeName}, ${lengthMm} mm)`,
      normalizedArgs,
      createdIds: [wallId],
      targetIds: [args.levelId],
      createCommand: () =>
        new AddWallCommand({
          id: wallId,
          category: 'wall',
          typeId: resolvedTypeId,
          levelId: args.levelId,
          start: { x: args.startXMm, y: args.startYMm },
          end: { x: args.endXMm, y: args.endYMm },
        }),
    };

    return runSandboxMutationStep(step, ctx, { wallId, typeId: resolvedTypeId });
  },
};

// ============================================================================
// 2. move_wall
// ============================================================================

export interface MoveWallArgs {
  readonly wallId: string;
  readonly deltaXMm: number;
  readonly deltaYMm: number;
  readonly stretchNeighbors?: boolean | undefined;
  readonly propagateChain?: boolean | undefined;
}

export const moveWallTool: ToolDefinition<MoveWallArgs, Record<string, unknown>> = {
  name: 'move_wall',
  mode: 'mutate',
  description: 'Déplace un mur existant d’un vecteur (deltaXMm, deltaYMm) en mm avec maintien élastique des jonctions.',
  parameters: {
    type: 'object',
    properties: {
      wallId: { type: 'string', description: 'Identifiant du mur à déplacer.' },
      deltaXMm: { type: 'number', description: 'Translation selon X en mm.' },
      deltaYMm: { type: 'number', description: 'Translation selon Y en mm.' },
      stretchNeighbors: {
        type: 'boolean',
        description: 'Maintenir la connectivité élastique des murs voisins (défaut true).',
      },
      propagateChain: {
        type: 'boolean',
        description: 'Propager en chaîne aux murs alignés (défaut false).',
      },
    },
    required: ['wallId', 'deltaXMm', 'deltaYMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const stretchNeighbors = readOptionalBoolean(obj, 'stretchNeighbors');
    const propagateChain = readOptionalBoolean(obj, 'propagateChain');
    return {
      wallId: readRequiredString(obj, 'wallId'),
      deltaXMm: readRequiredFiniteNumber(obj, 'deltaXMm'),
      deltaYMm: readRequiredFiniteNumber(obj, 'deltaYMm'),
      ...(stretchNeighbors !== undefined ? { stretchNeighbors } : {}),
      ...(propagateChain !== undefined ? { propagateChain } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.walls[args.wallId]) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur introuvable "${args.wallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    const stretchNeighbors = args.stretchNeighbors !== false;
    const propagateChain = args.propagateChain === true;

    const step: PlannedStep = {
      toolName: 'move_wall',
      operation: 'update',
      summary: `Déplacer mur ${args.wallId} de (${args.deltaXMm}, ${args.deltaYMm}) mm`,
      normalizedArgs: { ...args, stretchNeighbors, propagateChain },
      createdIds: [],
      targetIds: [args.wallId],
      createCommand: () =>
        new MoveWallCommand(
          args.wallId,
          { x: args.deltaXMm, y: args.deltaYMm },
          { stretchNeighbors, propagateChain },
        ),
    };

    return runSandboxMutationStep(step, ctx, { wallId: args.wallId });
  },
};

// ============================================================================
// 3. update_wall
// ============================================================================

export interface UpdateWallArgs {
  readonly wallId: string;
  readonly typeId?: string | undefined;
  readonly heightMm?: number | undefined;
  readonly resetHeightToAuto?: boolean | undefined;
  readonly startXMm?: number | undefined;
  readonly startYMm?: number | undefined;
  readonly endXMm?: number | undefined;
  readonly endYMm?: number | undefined;
}

export const updateWallTool: ToolDefinition<UpdateWallArgs, Record<string, unknown>> = {
  name: 'update_wall',
  mode: 'mutate',
  description:
    'Modifie les propriétés d’un mur existant (type, géométrie ou hauteur en mm ; utiliser resetHeightToAuto: true pour rétablir la hauteur automatique sans passer heightMm).',
  parameters: {
    type: 'object',
    properties: {
      wallId: { type: 'string', description: 'Identifiant du mur à modifier.' },
      typeId: { type: 'string', description: 'Nouvel identifiant de WallType.' },
      heightMm: {
        type: 'number',
        description: 'Hauteur forcée en mm (> 0). Incompatible avec resetHeightToAuto: true.',
        minimum: 100,
      },
      resetHeightToAuto: {
        type: 'boolean',
        description: 'Si true, supprime la surcharge manuelle et rétablit la hauteur automatique (topConstraint).',
      },
      startXMm: { type: 'number', description: 'Nouvelle coordonnée X de départ en mm.' },
      startYMm: { type: 'number', description: 'Nouvelle coordonnée Y de départ en mm.' },
      endXMm: { type: 'number', description: 'Nouvelle coordonnée X d’arrivée en mm.' },
      endYMm: { type: 'number', description: 'Nouvelle coordonnée Y d’arrivée en mm.' },
    },
    required: ['wallId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const wallId = readRequiredString(obj, 'wallId');
    const typeId = readOptionalString(obj, 'typeId');
    const heightMm = readOptionalFiniteNumber(obj, 'heightMm', { min: 1, max: 100_000 });
    const resetHeightToAuto = readOptionalBoolean(obj, 'resetHeightToAuto');
    const startXMm = readOptionalFiniteNumber(obj, 'startXMm');
    const startYMm = readOptionalFiniteNumber(obj, 'startYMm');
    const endXMm = readOptionalFiniteNumber(obj, 'endXMm');
    const endYMm = readOptionalFiniteNumber(obj, 'endYMm');

    if (heightMm !== undefined && resetHeightToAuto === true) {
      throw new ToolArgumentValidationError(
        'Paramètres contradictoires : fournissez soit "heightMm", soit "resetHeightToAuto: true", jamais les deux.',
      );
    }

    const hasAnyUpdate =
      typeId !== undefined ||
      heightMm !== undefined ||
      resetHeightToAuto === true ||
      startXMm !== undefined ||
      startYMm !== undefined ||
      endXMm !== undefined ||
      endYMm !== undefined;

    if (!hasAnyUpdate) {
      throw new ToolArgumentValidationError(
        'Au moins un champ à modifier doit être fourni pour update_wall.',
      );
    }

    return {
      wallId,
      ...(typeId !== undefined ? { typeId } : {}),
      ...(heightMm !== undefined ? { heightMm } : {}),
      ...(resetHeightToAuto !== undefined ? { resetHeightToAuto } : {}),
      ...(startXMm !== undefined ? { startXMm } : {}),
      ...(startYMm !== undefined ? { startYMm } : {}),
      ...(endXMm !== undefined ? { endXMm } : {}),
      ...(endYMm !== undefined ? { endYMm } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    const existing = state.walls[args.wallId];
    if (!existing) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur introuvable "${args.wallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    if (args.typeId !== undefined && !state.wallTypes[args.typeId]) {
      return {
        ok: false,
        code: 'UNKNOWN_WALL_TYPE',
        message: `Type de mur introuvable "${args.typeId}".`,
        validIds: Object.keys(state.wallTypes),
      };
    }

    const patch: Partial<Omit<Wall, 'id' | 'category'>> = {
      ...(args.typeId !== undefined ? { typeId: args.typeId } : {}),
      ...(args.heightMm !== undefined ? { heightOverride: args.heightMm } : {}),
      ...(args.resetHeightToAuto === true ? { heightOverride: undefined } : {}),
      ...(args.startXMm !== undefined || args.startYMm !== undefined
        ? {
            start: {
              x: args.startXMm ?? existing.start.x,
              y: args.startYMm ?? existing.start.y,
            },
          }
        : {}),
      ...(args.endXMm !== undefined || args.endYMm !== undefined
        ? {
            end: {
              x: args.endXMm ?? existing.end.x,
              y: args.endYMm ?? existing.end.y,
            },
          }
        : {}),
    };

    const step: PlannedStep = {
      toolName: 'update_wall',
      operation: 'update',
      summary: `Mettre à jour le mur ${args.wallId}`,
      normalizedArgs: { ...args },
      createdIds: [],
      targetIds: [args.wallId],
      createCommand: () => new UpdateWallCommand(args.wallId, patch),
    };

    return runSandboxMutationStep(step, ctx, { wallId: args.wallId });
  },
};

// ============================================================================
// 4. delete_wall
// ============================================================================

export interface DeleteWallArgs {
  readonly wallId: string;
}

export const deleteWallTool: ToolDefinition<DeleteWallArgs, Record<string, unknown>> = {
  name: 'delete_wall',
  mode: 'mutate',
  description: 'Supprime un mur et ses ouvertures/cotations dépendantes par cascade.',
  parameters: {
    type: 'object',
    properties: {
      wallId: { type: 'string', description: 'Identifiant du mur à supprimer.' },
    },
    required: ['wallId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    return { wallId: readRequiredString(obj, 'wallId') };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.walls[args.wallId]) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur introuvable "${args.wallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    const step: PlannedStep = {
      toolName: 'delete_wall',
      operation: 'delete',
      summary: `Supprimer le mur ${args.wallId}`,
      normalizedArgs: { ...args },
      createdIds: [],
      targetIds: [args.wallId],
      createCommand: () => new DeleteWallCommand(args.wallId),
    };

    return runSandboxMutationStep(step, ctx, { deletedWallId: args.wallId });
  },
};

// ============================================================================
// 5. add_door
// ============================================================================

export interface AddDoorArgs {
  readonly hostWallId: string;
  readonly offsetAlongMm: number;
  readonly doorTypeId?: string | undefined;
  readonly swingSide?: DoorSwingSide | undefined;
  readonly swingDirection?: DoorSwingDirection | undefined;
}

export const addDoorTool: ToolDefinition<AddDoorArgs, Record<string, unknown>> = {
  name: 'add_door',
  mode: 'mutate',
  description: 'Insère une porte dans un mur hôte à une abscisse curviligne offsetAlongMm mesurée depuis start.',
  parameters: {
    type: 'object',
    properties: {
      hostWallId: { type: 'string', description: 'Identifiant du mur hôte.' },
      offsetAlongMm: {
        type: 'number',
        description: 'Distance en mm depuis le point start du mur hôte jusqu’au bord de la porte.',
        minimum: 0,
      },
      doorTypeId: { type: 'string', description: 'Identifiant optionnel du DoorType.' },
      swingSide: {
        type: 'string',
        description: 'Côté de paumelle ("left" ou "right").',
        enum: ['left', 'right'],
      },
      swingDirection: {
        type: 'string',
        description: 'Sens d’ouverture ("in" ou "out").',
        enum: ['in', 'out'],
      },
    },
    required: ['hostWallId', 'offsetAlongMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const doorTypeId = readOptionalString(obj, 'doorTypeId');
    const swingSide = readOptionalEnum(obj, 'swingSide', ['left', 'right']);
    const swingDirection = readOptionalEnum(obj, 'swingDirection', ['in', 'out']);
    return {
      hostWallId: readRequiredString(obj, 'hostWallId'),
      offsetAlongMm: readRequiredFiniteNumber(obj, 'offsetAlongMm', { min: 0 }),
      ...(doorTypeId !== undefined ? { doorTypeId } : {}),
      ...(swingSide !== undefined ? { swingSide } : {}),
      ...(swingDirection !== undefined ? { swingDirection } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.walls[args.hostWallId]) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur hôte introuvable "${args.hostWallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    const resolvedDoorTypeId =
      args.doorTypeId ?? resolveDefaultCatalogId(state.doorTypes, 'default-door-type');
    if (!resolvedDoorTypeId || !state.doorTypes[resolvedDoorTypeId]) {
      return {
        ok: false,
        code: 'UNKNOWN_DOOR_TYPE',
        message: `Type de porte introuvable "${args.doorTypeId ?? ''}".`,
        validIds: Object.keys(state.doorTypes),
      };
    }

    const doorId = generateId();
    const swingSide: DoorSwingSide = args.swingSide ?? 'left';
    const swingDirection: DoorSwingDirection = args.swingDirection ?? 'in';
    const typeName = state.doorTypes[resolvedDoorTypeId]?.name ?? resolvedDoorTypeId;

    const step: PlannedStep = {
      toolName: 'add_door',
      operation: 'create',
      summary: `Ajouter une porte (${typeName}) sur mur ${args.hostWallId} à ${args.offsetAlongMm} mm`,
      normalizedArgs: {
        ...args,
        doorTypeId: resolvedDoorTypeId,
        swingSide,
        swingDirection,
        doorId,
      },
      createdIds: [doorId],
      targetIds: [args.hostWallId],
      createCommand: () =>
        new AddDoorCommand({
          id: doorId,
          category: 'door',
          doorTypeId: resolvedDoorTypeId,
          hostWallId: args.hostWallId,
          offsetAlong: args.offsetAlongMm,
          swing: { side: swingSide, direction: swingDirection },
        }),
    };

    return runSandboxMutationStep(step, ctx, { doorId, doorTypeId: resolvedDoorTypeId });
  },
};

// ============================================================================
// 6. add_window
// ============================================================================

export interface AddWindowArgs {
  readonly hostWallId: string;
  readonly offsetAlongMm: number;
  readonly windowTypeId?: string | undefined;
  readonly sillHeightMm?: number | undefined;
}

export const addWindowTool: ToolDefinition<AddWindowArgs, Record<string, unknown>> = {
  name: 'add_window',
  mode: 'mutate',
  description: 'Insère une fenêtre dans un mur hôte à une abscisse curviligne offsetAlongMm en mm.',
  parameters: {
    type: 'object',
    properties: {
      hostWallId: { type: 'string', description: 'Identifiant du mur hôte.' },
      offsetAlongMm: {
        type: 'number',
        description: 'Distance en mm depuis le point start du mur hôte jusqu’au bord de la fenêtre.',
        minimum: 0,
      },
      windowTypeId: { type: 'string', description: 'Identifiant optionnel du WindowType.' },
      sillHeightMm: {
        type: 'number',
        description: 'Hauteur d’allège optionnelle en mm (>= 0).',
        minimum: 0,
        maximum: 10_000,
      },
    },
    required: ['hostWallId', 'offsetAlongMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const windowTypeId = readOptionalString(obj, 'windowTypeId');
    const sillHeightMm = readOptionalFiniteNumber(obj, 'sillHeightMm', { min: 0, max: 10_000 });
    return {
      hostWallId: readRequiredString(obj, 'hostWallId'),
      offsetAlongMm: readRequiredFiniteNumber(obj, 'offsetAlongMm', { min: 0 }),
      ...(windowTypeId !== undefined ? { windowTypeId } : {}),
      ...(sillHeightMm !== undefined ? { sillHeightMm } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.walls[args.hostWallId]) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur hôte introuvable "${args.hostWallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    const resolvedWindowTypeId =
      args.windowTypeId ?? resolveDefaultCatalogId(state.windowTypes, 'default-window-type');
    const winType = resolvedWindowTypeId ? state.windowTypes[resolvedWindowTypeId] : undefined;
    if (!resolvedWindowTypeId || !winType) {
      return {
        ok: false,
        code: 'UNKNOWN_WINDOW_TYPE',
        message: `Type de fenêtre introuvable "${args.windowTypeId ?? ''}".`,
        validIds: Object.keys(state.windowTypes),
      };
    }

    const windowId = generateId();
    const sillHeightMm = args.sillHeightMm ?? winType.defaultSillHeight ?? 900;

    const step: PlannedStep = {
      toolName: 'add_window',
      operation: 'create',
      summary: `Ajouter une fenêtre (${winType.name}) sur mur ${args.hostWallId} à ${args.offsetAlongMm} mm`,
      normalizedArgs: {
        ...args,
        windowTypeId: resolvedWindowTypeId,
        sillHeightMm,
        windowId,
      },
      createdIds: [windowId],
      targetIds: [args.hostWallId],
      createCommand: () =>
        new AddWindowCommand({
          id: windowId,
          category: 'window',
          windowTypeId: resolvedWindowTypeId,
          hostWallId: args.hostWallId,
          offsetAlong: args.offsetAlongMm,
          sillHeight: sillHeightMm,
        }),
    };

    return runSandboxMutationStep(step, ctx, { windowId, windowTypeId: resolvedWindowTypeId });
  },
};

// ============================================================================
// 7. move_opening
// ============================================================================

export interface MoveOpeningArgs {
  readonly openingId: string;
  readonly newOffsetAlongMm?: number | undefined;
  readonly deltaOffsetMm?: number | undefined;
}

export const moveOpeningTool: ToolDefinition<MoveOpeningArgs, Record<string, unknown>> = {
  name: 'move_opening',
  mode: 'mutate',
  description:
    'Déplace une porte ou fenêtre le long de son mur hôte. Fournir exclusivement soit newOffsetAlongMm (position absolue) soit deltaOffsetMm (décalage relatif).',
  parameters: {
    type: 'object',
    properties: {
      openingId: { type: 'string', description: 'Identifiant de la porte ou fenêtre.' },
      newOffsetAlongMm: {
        type: 'number',
        description: 'Nouvelle abscisse absolue le long du mur hôte en mm (>= 0).',
        minimum: 0,
      },
      deltaOffsetMm: {
        type: 'number',
        description: 'Décalage relatif en mm à ajouter à l’abscisse actuelle.',
      },
    },
    required: ['openingId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const openingId = readRequiredString(obj, 'openingId');
    const newOffsetAlongMm = readOptionalFiniteNumber(obj, 'newOffsetAlongMm', { min: 0 });
    const deltaOffsetMm = readOptionalFiniteNumber(obj, 'deltaOffsetMm');

    const hasAbs = newOffsetAlongMm !== undefined;
    const hasDelta = deltaOffsetMm !== undefined;
    if (hasAbs === hasDelta) {
      throw new ToolArgumentValidationError(
        'Fournissez exactement un des deux paramètres : "newOffsetAlongMm" ou "deltaOffsetMm".',
      );
    }

    return {
      openingId,
      ...(newOffsetAlongMm !== undefined ? { newOffsetAlongMm } : {}),
      ...(deltaOffsetMm !== undefined ? { deltaOffsetMm } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    const existing = state.doors?.[args.openingId] ?? state.windows?.[args.openingId];
    if (!existing) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Ouverture introuvable "${args.openingId}".`,
        validIds: [
          ...Object.keys(state.doors ?? {}),
          ...Object.keys(state.windows ?? {}),
        ],
      };
    }

    const resolvedOffsetAlongMm =
      args.newOffsetAlongMm !== undefined
        ? args.newOffsetAlongMm
        : existing.offsetAlong + (args.deltaOffsetMm ?? 0);

    const step: PlannedStep = {
      toolName: 'move_opening',
      operation: 'update',
      summary: `Déplacer l’ouverture ${args.openingId} à offset ${resolvedOffsetAlongMm} mm`,
      normalizedArgs: {
        openingId: args.openingId,
        resolvedOffsetAlongMm,
      },
      createdIds: [],
      targetIds: [args.openingId, existing.hostWallId],
      createCommand: () => new MoveOpeningCommand(args.openingId, resolvedOffsetAlongMm),
    };

    return runSandboxMutationStep(step, ctx, {
      openingId: args.openingId,
      offsetAlongMm: resolvedOffsetAlongMm,
    });
  },
};

// ============================================================================
// 8. delete_opening
// ============================================================================

export interface DeleteOpeningArgs {
  readonly openingId: string;
}

export const deleteOpeningTool: ToolDefinition<DeleteOpeningArgs, Record<string, unknown>> = {
  name: 'delete_opening',
  mode: 'mutate',
  description: 'Supprime une porte ou une fenêtre existante.',
  parameters: {
    type: 'object',
    properties: {
      openingId: { type: 'string', description: 'Identifiant de la porte ou fenêtre à supprimer.' },
    },
    required: ['openingId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    return { openingId: readRequiredString(obj, 'openingId') };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    const existing = state.doors?.[args.openingId] ?? state.windows?.[args.openingId];
    if (!existing) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Ouverture introuvable "${args.openingId}".`,
        validIds: [
          ...Object.keys(state.doors ?? {}),
          ...Object.keys(state.windows ?? {}),
        ],
      };
    }

    const step: PlannedStep = {
      toolName: 'delete_opening',
      operation: 'delete',
      summary: `Supprimer l’ouverture ${args.openingId}`,
      normalizedArgs: { ...args },
      createdIds: [],
      targetIds: [args.openingId, existing.hostWallId],
      createCommand: () => new DeleteOpeningCommand(args.openingId),
    };

    return runSandboxMutationStep(step, ctx, { deletedOpeningId: args.openingId });
  },
};

// ============================================================================
// 9. add_component
// ============================================================================

export interface AddComponentArgs {
  readonly levelId: string;
  readonly typeId: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly rotationDeg?: number | undefined;
  readonly hostWallId?: string | undefined;
}

export const addComponentTool: ToolDefinition<AddComponentArgs, Record<string, unknown>> = {
  name: 'add_component',
  mode: 'mutate',
  description:
    'Place un composant architectural ou équipement mobilier/sanitaire (typeId issu du catalogue componentTypes) aux coordonnées (xMm, yMm) avec orientation optionnelle en degrés (rotationDeg).',
  parameters: {
    type: 'object',
    properties: {
      levelId: { type: 'string', description: 'Identifiant exact du niveau cible.' },
      typeId: { type: 'string', description: 'Identifiant exact du ComponentType dans componentTypes.' },
      xMm: { type: 'number', description: 'Position X en mm.' },
      yMm: { type: 'number', description: 'Position Y en mm.' },
      rotationDeg: {
        type: 'number',
        description: 'Angle de rotation autour de l’axe vertical Z en degrés (défaut 0).',
      },
      hostWallId: { type: 'string', description: 'Identifiant optionnel du mur d’adossement.' },
    },
    required: ['levelId', 'typeId', 'xMm', 'yMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const rotationDeg = readOptionalFiniteNumber(obj, 'rotationDeg', { min: -3600, max: 3600 });
    const hostWallId = readOptionalString(obj, 'hostWallId');
    return {
      levelId: readRequiredString(obj, 'levelId'),
      typeId: readRequiredString(obj, 'typeId'),
      xMm: readRequiredFiniteNumber(obj, 'xMm'),
      yMm: readRequiredFiniteNumber(obj, 'yMm'),
      ...(rotationDeg !== undefined ? { rotationDeg } : {}),
      ...(hostWallId !== undefined ? { hostWallId } : {}),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.levels[args.levelId]) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const compTypes = state.componentTypes ?? {};
    const compType = compTypes[args.typeId];
    if (!compType) {
      return {
        ok: false,
        code: 'UNKNOWN_COMPONENT_TYPE',
        message: `Type de composant introuvable "${args.typeId}".`,
        validIds: Object.keys(compTypes),
      };
    }

    if (args.hostWallId !== undefined && !state.walls[args.hostWallId]) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Mur hôte introuvable "${args.hostWallId}".`,
        validIds: Object.keys(state.walls),
      };
    }

    const componentId = generateId();
    const normalizedDeg = normalizeDegrees(args.rotationDeg ?? 0);
    const rotationRad = (normalizedDeg * Math.PI) / 180;

    const step: PlannedStep = {
      toolName: 'add_component',
      operation: 'create',
      summary: `Placer ${compType.name} en (${args.xMm}, ${args.yMm}) mm (${normalizedDeg}°)`,
      normalizedArgs: {
        ...args,
        rotationDeg: normalizedDeg,
        componentId,
      },
      createdIds: [componentId],
      targetIds: [args.levelId, ...(args.hostWallId ? [args.hostWallId] : [])],
      createCommand: () =>
        new AddComponentCommand({
          id: componentId,
          category: 'component',
          typeId: args.typeId,
          levelId: args.levelId,
          placement: {
            x: args.xMm,
            y: args.yMm,
            rotation: rotationRad,
            ...(args.hostWallId ? { hostWallId: args.hostWallId } : {}),
          },
        }),
    };

    return runSandboxMutationStep(step, ctx, { componentId, rotationDeg: normalizedDeg });
  },
};

// ============================================================================
// 10. add_room
// ============================================================================

export interface AddRoomArgs {
  readonly levelId: string;
  readonly name: string;
  readonly seedXMm: number;
  readonly seedYMm: number;
}

export const addRoomTool: ToolDefinition<AddRoomArgs, Record<string, unknown>> = {
  name: 'add_room',
  mode: 'mutate',
  description: 'Déclare et nomme une pièce à l’intérieur d’une boucle fermée de murs via un point graine (seedXMm, seedYMm).',
  parameters: {
    type: 'object',
    properties: {
      levelId: { type: 'string', description: 'Identifiant exact du niveau cible.' },
      name: { type: 'string', description: 'Nom métier de la pièce (ex. "Séjour", "Chambre 1").' },
      seedXMm: { type: 'number', description: 'Coordonnée X d’un point intérieur à la pièce en mm.' },
      seedYMm: { type: 'number', description: 'Coordonnée Y d’un point intérieur à la pièce en mm.' },
    },
    required: ['levelId', 'name', 'seedXMm', 'seedYMm'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    return {
      levelId: readRequiredString(obj, 'levelId'),
      name: readRequiredString(obj, 'name').trim(),
      seedXMm: readRequiredFiniteNumber(obj, 'seedXMm'),
      seedYMm: readRequiredFiniteNumber(obj, 'seedYMm'),
    };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.levels[args.levelId]) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const roomId = generateId();
    const step: PlannedStep = {
      toolName: 'add_room',
      operation: 'create',
      summary: `Créer la pièce "${args.name}" sur ${args.levelId}`,
      normalizedArgs: { ...args, roomId },
      createdIds: [roomId],
      targetIds: [args.levelId],
      createCommand: () =>
        new AddRoomCommand({
          id: roomId,
          category: 'room',
          levelId: args.levelId,
          name: args.name,
          seed: { x: args.seedXMm, y: args.seedYMm },
        }),
    };

    return runSandboxMutationStep(step, ctx, { roomId, name: args.name });
  },
};

// ============================================================================
// 11. auto_dimension_level
// ============================================================================

export interface AutoDimensionLevelArgs {
  readonly levelId: string;
}

export const autoDimensionLevelTool: ToolDefinition<AutoDimensionLevelArgs, Record<string, unknown>> = {
  name: 'auto_dimension_level',
  mode: 'mutate',
  description: 'Génère automatiquement et de façon idempotente les cotes architecturales 2D du niveau spécifié.',
  parameters: {
    type: 'object',
    properties: {
      levelId: { type: 'string', description: 'Identifiant exact du niveau à coter.' },
    },
    required: ['levelId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    return { levelId: readRequiredString(obj, 'levelId') };
  },
  execute(args, ctx) {
    const state = ctx.doc.getState() as BimState;
    if (!state.levels[args.levelId]) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const step: PlannedStep = {
      toolName: 'auto_dimension_level',
      operation: 'update',
      summary: `Coter automatiquement le niveau ${args.levelId}`,
      normalizedArgs: { ...args },
      createdIds: [],
      targetIds: [args.levelId],
      createCommand: () => new AutoDimensionLevelCommand(args.levelId),
    };

    return runSandboxMutationStep(step, ctx, { levelId: args.levelId });
  },
};

// ============================================================================
// 12. auto_generate_views
// ============================================================================

export const autoGenerateViewsTool: ToolDefinition<Record<string, never>, Record<string, unknown>> = {
  name: 'auto_generate_views',
  mode: 'mutate',
  description: 'Génère automatiquement les 4 élévations de façade et les 2 coupes orthogonales du projet.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  validateArgs(raw) {
    asPlainObject(raw);
    return {};
  },
  execute(_args, ctx) {
    const step: PlannedStep = {
      toolName: 'auto_generate_views',
      operation: 'update',
      summary: 'Générer automatiquement les coupes et élévations',
      normalizedArgs: {},
      createdIds: [],
      targetIds: [],
      createCommand: () => new AutoGenerateViewsCommand(),
    };

    return runSandboxMutationStep(step, ctx, {});
  },
};

export const PHASE2_MUTATE_TOOLS: readonly ExposedToolSchema[] = [
  addWallTool,
  moveWallTool,
  updateWallTool,
  deleteWallTool,
  addDoorTool,
  addWindowTool,
  moveOpeningTool,
  deleteOpeningTool,
  addComponentTool,
  addRoomTool,
  autoDimensionLevelTool,
  autoGenerateViewsTool,
];

export const ALL_COPILOT_TOOLS: readonly ExposedToolSchema[] = [
  ...PHASE1_READ_TOOLS,
  ...PHASE2_MUTATE_TOOLS,
];

export function registerPhase2MutateTools(registry: ToolRegistry): ToolRegistry {
  registry.register(addWallTool);
  registry.register(moveWallTool);
  registry.register(updateWallTool);
  registry.register(deleteWallTool);
  registry.register(addDoorTool);
  registry.register(addWindowTool);
  registry.register(moveOpeningTool);
  registry.register(deleteOpeningTool);
  registry.register(addComponentTool);
  registry.register(addRoomTool);
  registry.register(autoDimensionLevelTool);
  registry.register(autoGenerateViewsTool);
  return registry;
}

export function createFullCopilotRegistry(): ToolRegistry {
  const registry = createPhase1ReadRegistry();
  return registerPhase2MutateTools(registry);
}

export function collectPreexistingIdsInState(
  state: Readonly<BimState>,
  candidateIds: readonly ElementId[],
): ElementId[] {
  const seen = new Set<ElementId>();
  const valid: ElementId[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    if (
      state.walls?.[id] ||
      state.doors?.[id] ||
      state.windows?.[id] ||
      state.slabs?.[id] ||
      state.rooms?.[id] ||
      state.components?.[id] ||
      state.stairs?.[id] ||
      state.roofs?.[id] ||
      state.dimensions?.[id]
    ) {
      seen.add(id);
      valid.push(id);
    }
  }
  return valid;
}
