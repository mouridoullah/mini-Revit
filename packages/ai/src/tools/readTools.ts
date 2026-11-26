import {
  auditDocumentState,
  computeLevelMetrics,
  detectClashes,
  detectRooms,
  MepNetworkGraph,
  type BimState,
  type ClashSeverity,
  type ElementId,
  type Wall,
} from '@tabax/core';
import { buildBimContext } from '../context/BimContextBuilder.js';
import type { ExposedToolSchema, ToolDefinition, ToolResult } from '../types.js';
import { ToolArgumentValidationError, ToolRegistry } from './ToolRegistry.js';

export type LevelDetailCategory = 'walls' | 'openings' | 'slabs' | 'components' | 'rooms';

const ALL_LEVEL_CATEGORIES: readonly LevelDetailCategory[] = [
  'walls',
  'openings',
  'slabs',
  'components',
  'rooms',
];

const DEFAULT_CLASH_LIMIT = 20;
const MAX_CLASH_LIMIT = 50;
const MAX_SAMPLE_ELEMENT_IDS = 30;

function asPlainObject(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ToolArgumentValidationError('Les paramètres de l’outil doivent être un objet JSON.');
  }
  return raw as Record<string, unknown>;
}

function readRequiredString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new ToolArgumentValidationError(`Le paramètre requis "${key}" doit être une chaîne non vide.`);
  }
  return val;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new ToolArgumentValidationError(`Le paramètre optionnel "${key}" doit être une chaîne non vide.`);
  }
  return val;
}

function readOptionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const val = obj[key];
  if (val === undefined) return undefined;
  if (typeof val !== 'boolean') {
    throw new ToolArgumentValidationError(`Le paramètre optionnel "${key}" doit être un booléen.`);
  }
  return val;
}

function computeWallOrientationLabel(wall: Wall): string {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return '0°';
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
  const absCos = Math.abs(dx) / len;
  const absSin = Math.abs(dy) / len;
  if (absCos >= 0.999) return 'E-O';
  if (absSin >= 0.999) return 'N-S';
  return `${angleDeg}°`;
}

export interface OccupiedIntervalSummary {
  readonly openingId: ElementId;
  readonly kind: 'door' | 'window';
  readonly startMm: number;
  readonly endMm: number;
}

function collectOccupiedIntervalsByWall(
  state: BimState,
): Map<ElementId, OccupiedIntervalSummary[]> {
  const map = new Map<ElementId, OccupiedIntervalSummary[]>();

  const pushInterval = (wallId: ElementId, entry: OccupiedIntervalSummary) => {
    let list = map.get(wallId);
    if (!list) {
      list = [];
      map.set(wallId, list);
    }
    list.push(entry);
  };

  for (const door of Object.values(state.doors ?? {})) {
    const width = state.doorTypes?.[door.doorTypeId]?.width ?? 900;
    pushInterval(door.hostWallId, {
      openingId: door.id,
      kind: 'door',
      startMm: Math.round(door.offsetAlong),
      endMm: Math.round(door.offsetAlong + width),
    });
  }

  for (const win of Object.values(state.windows ?? {})) {
    const width = state.windowTypes?.[win.windowTypeId]?.width ?? 1200;
    pushInterval(win.hostWallId, {
      openingId: win.id,
      kind: 'window',
      startMm: Math.round(win.offsetAlong),
      endMm: Math.round(win.offsetAlong + width),
    });
  }

  for (const intervals of map.values()) {
    intervals.sort((a, b) => a.startMm - b.startMm);
  }
  return map;
}

const ELEMENT_COLLECTIONS: readonly (readonly [keyof BimState, string])[] = [
  ['walls', 'wall'],
  ['doors', 'door'],
  ['windows', 'window'],
  ['slabs', 'slab'],
  ['rooms', 'room'],
  ['dimensions', 'dimension'],
  ['stairs', 'stair'],
  ['roofs', 'roof'],
  ['roofOpenings', 'roofOpening'],
  ['components', 'component'],
  ['pipes', 'pipe'],
  ['ducts', 'duct'],
  ['cableTrays', 'cableTray'],
  ['mepFittings', 'mepFitting'],
  ['mepEquipments', 'mepEquipment'],
  ['mepSystems', 'mepSystem'],
  ['mepConnectors', 'mepConnector'],
  ['levels', 'level'],
  ['wallTypes', 'wallType'],
  ['doorTypes', 'doorType'],
  ['windowTypes', 'windowType'],
  ['slabTypes', 'slabType'],
  ['componentTypes', 'componentType'],
];

function findElementInState(
  state: BimState,
  id: ElementId,
): { readonly category: string; readonly element: unknown } | null {
  for (const [key, category] of ELEMENT_COLLECTIONS) {
    const collection = state[key] as Readonly<Record<string, unknown>> | undefined;
    if (collection && id in collection) {
      return { category, element: collection[id] };
    }
  }
  return null;
}

function collectSampleElementIds(state: BimState, maxCount = MAX_SAMPLE_ELEMENT_IDS): string[] {
  const ids: string[] = [];
  for (const [key] of ELEMENT_COLLECTIONS) {
    const collection = state[key] as Readonly<Record<string, unknown>> | undefined;
    if (!collection) continue;
    for (const id of Object.keys(collection)) {
      ids.push(id);
      if (ids.length >= maxCount) return ids;
    }
  }
  return ids;
}

function resolveViolationLevelIds(state: BimState, offendingIds: readonly ElementId[]): Set<string> {
  const levelIds = new Set<string>();
  for (const id of offendingIds) {
    if (state.levels?.[id]) {
      levelIds.add(id);
      continue;
    }
    const wall = state.walls?.[id];
    if (wall) {
      levelIds.add(wall.levelId);
      continue;
    }
    const door = state.doors?.[id];
    if (door) {
      const host = state.walls?.[door.hostWallId];
      if (host) levelIds.add(host.levelId);
      continue;
    }
    const win = state.windows?.[id];
    if (win) {
      const host = state.walls?.[win.hostWallId];
      if (host) levelIds.add(host.levelId);
      continue;
    }
    const slab = state.slabs?.[id];
    if (slab) {
      levelIds.add(slab.levelId);
      continue;
    }
    const comp = state.components?.[id];
    if (comp) {
      levelIds.add(comp.levelId);
      continue;
    }
    const stair = state.stairs?.[id];
    if (stair) {
      levelIds.add(stair.bottomLevelId);
      continue;
    }
    const room = state.rooms?.[id];
    if (room) {
      levelIds.add(room.levelId);
    }
  }
  return levelIds;
}

// ============================================================================
// 1. get_project_summary
// ============================================================================

export const getProjectSummaryTool: ToolDefinition<Record<string, never>, unknown> = {
  name: 'get_project_summary',
  mode: 'read',
  description:
    'Retourne la synthèse globale du projet BIM : niveaux, catalogues de types, métriques quantitatives par étage, topologie MEP et compteur d’anomalies.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  validateArgs(raw) {
    asPlainObject(raw);
    return {};
  },
  execute(_args, ctx): ToolResult<unknown> {
    const state = ctx.doc.getState() as BimState;
    const context = buildBimContext(state, {
      activeLevelId: ctx.activeLevelId,
      selectedIds: ctx.selectedIds,
    });
    const levelMetrics = context.levels.map((lvl) => {
      const m = computeLevelMetrics(state, lvl.id);
      return {
        levelId: lvl.id,
        name: lvl.name,
        totals: m.totals,
      };
    });
    const mepGraph = MepNetworkGraph.build(state);
    const issues = auditDocumentState(state);

    return {
      ok: true,
      data: {
        ...context,
        metricsByLevel: levelMetrics,
        mepTopology: {
          connectorCount: mepGraph.getAllConnectors().length,
          isolatedElementIds: mepGraph.getIsolatedElements().slice(0, 20),
          hasLoops: mepGraph.hasLoops(),
        },
        auditIssueCount: issues.length,
      },
    };
  },
};

// ============================================================================
// 2. get_level_details
// ============================================================================

export interface GetLevelDetailsArgs {
  readonly levelId: string;
  readonly categories?: readonly LevelDetailCategory[] | undefined;
  readonly compact?: boolean | undefined;
}

export const getLevelDetailsTool: ToolDefinition<GetLevelDetailsArgs, unknown> = {
  name: 'get_level_details',
  mode: 'read',
  description:
    'Retourne le détail géométrique et sémantique d’un niveau donné (murs avec lengthMm, orientation et occupiedIntervalsMm, ouvertures, dalles, composants et pièces). Utiliser categories pour limiter le volume sur les étages denses.',
  parameters: {
    type: 'object',
    properties: {
      levelId: {
        type: 'string',
        description: 'Identifiant exact du niveau cible (ex. "level_r0").',
      },
      categories: {
        type: 'array',
        description: 'Filtre optionnel des catégories à retourner (walls, openings, slabs, components, rooms).',
        items: {
          type: 'string',
          enum: ALL_LEVEL_CATEGORIES,
        },
      },
      compact: {
        type: 'boolean',
        description: 'Projection compacte par défaut (true) pour économiser la fenêtre de contexte.',
      },
    },
    required: ['levelId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const levelId = readRequiredString(obj, 'levelId');
    const compact = readOptionalBoolean(obj, 'compact');
    let categories: LevelDetailCategory[] | undefined;

    if (obj.categories !== undefined) {
      if (!Array.isArray(obj.categories)) {
        throw new ToolArgumentValidationError('Le paramètre "categories" doit être un tableau de chaînes.');
      }
      categories = [];
      for (const item of obj.categories) {
        if (typeof item !== 'string' || !ALL_LEVEL_CATEGORIES.includes(item as LevelDetailCategory)) {
          throw new ToolArgumentValidationError(
            `Catégorie invalide "${String(item)}". Valeurs autorisées : ${ALL_LEVEL_CATEGORIES.join(', ')}.`,
          );
        }
        categories.push(item as LevelDetailCategory);
      }
    }

    return {
      levelId,
      ...(categories ? { categories } : {}),
      ...(compact !== undefined ? { compact } : {}),
    };
  },
  execute(args, ctx): ToolResult<unknown> {
    const state = ctx.doc.getState() as BimState;
    const level = state.levels[args.levelId];
    if (!level) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const selectedCategories = new Set<LevelDetailCategory>(
      args.categories && args.categories.length > 0 ? args.categories : ALL_LEVEL_CATEGORIES,
    );
    const compact = args.compact !== false;

    const result: Record<string, unknown> = {
      level: {
        id: level.id,
        name: level.name,
        elevationMm: level.elevation,
        ...(level.height !== undefined ? { heightMm: level.height } : {}),
      },
      compact,
    };

    const levelWalls = Object.values(state.walls ?? {}).filter((w) => w.levelId === level.id);
    const levelWallIds = new Set(levelWalls.map((w) => w.id));

    if (selectedCategories.has('walls')) {
      const intervalsByWall = collectOccupiedIntervalsByWall(state);
      result.walls = levelWalls.map((w) => {
        const lengthMm = Math.round(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y));
        const orientation = computeWallOrientationLabel(w);
        const occupiedIntervalsMm = intervalsByWall.get(w.id) ?? [];
        const base = {
          id: w.id,
          typeId: w.typeId,
          startMm: { x: w.start.x, y: w.start.y },
          endMm: { x: w.end.x, y: w.end.y },
          lengthMm,
          orientation,
          occupiedIntervalsMm,
        };
        if (compact) return base;
        return {
          ...base,
          ...(w.heightOverride !== undefined ? { heightOverrideMm: w.heightOverride } : {}),
          ...(w.topConstraint ? { topConstraint: w.topConstraint } : {}),
        };
      });
    }

    if (selectedCategories.has('openings')) {
      const doors = Object.values(state.doors ?? {})
        .filter((d) => levelWallIds.has(d.hostWallId))
        .map((d) => ({
          id: d.id,
          kind: 'door' as const,
          hostWallId: d.hostWallId,
          doorTypeId: d.doorTypeId,
          offsetAlongMm: d.offsetAlong,
          widthMm: state.doorTypes?.[d.doorTypeId]?.width ?? 900,
          ...(!compact ? { swing: d.swing } : {}),
        }));
      const windows = Object.values(state.windows ?? {})
        .filter((w) => levelWallIds.has(w.hostWallId))
        .map((w) => ({
          id: w.id,
          kind: 'window' as const,
          hostWallId: w.hostWallId,
          windowTypeId: w.windowTypeId,
          offsetAlongMm: w.offsetAlong,
          widthMm: state.windowTypes?.[w.windowTypeId]?.width ?? 1200,
          sillHeightMm: w.sillHeight ?? state.windowTypes?.[w.windowTypeId]?.defaultSillHeight ?? 900,
        }));
      result.openings = [...doors, ...windows];
    }

    if (selectedCategories.has('slabs')) {
      result.slabs = Object.values(state.slabs ?? {})
        .filter((s) => s.levelId === level.id)
        .map((s) => ({
          id: s.id,
          slabTypeId: s.slabTypeId,
          ...(s.name ? { name: s.name } : {}),
          vertexCount: s.boundary.length,
          ...(!compact ? { boundaryMm: s.boundary } : {}),
        }));
    }

    if (selectedCategories.has('components')) {
      result.components = Object.values(state.components ?? {})
        .filter((c) => c.levelId === level.id)
        .map((c) => ({
          id: c.id,
          typeId: c.typeId,
          xMm: c.placement.x,
          yMm: c.placement.y,
          rotationDeg:
            c.placement.rotation !== undefined
              ? Math.round(((c.placement.rotation * 180) / Math.PI) * 10) / 10
              : 0,
          ...(c.placement.hostWallId ? { hostWallId: c.placement.hostWallId } : {}),
          ...(c.name ? { name: c.name } : {}),
        }));
    }

    if (selectedCategories.has('rooms')) {
      const declaredRooms = Object.values(state.rooms ?? {})
        .filter((r) => r.levelId === level.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status ?? 'enclosed',
          ...(r.area !== undefined ? { areaM2: Number(r.area.toFixed(2)) } : {}),
        }));
      const detected = detectRooms(state, level.id).map((d, idx) => ({
        index: idx + 1,
        areaM2: Number((d.areaMm2 / 1_000_000).toFixed(2)),
        perimeterMm: Math.round(d.perimeterMm),
        ...(d.existingRoomId ? { existingRoomId: d.existingRoomId } : {}),
      }));
      result.rooms = { declared: declaredRooms, detected };
    }

    return { ok: true, data: result };
  },
};

// ============================================================================
// 3. get_element_by_id
// ============================================================================

export interface GetElementByIdArgs {
  readonly elementId: string;
}

export const getElementByIdTool: ToolDefinition<GetElementByIdArgs, unknown> = {
  name: 'get_element_by_id',
  mode: 'read',
  description: 'Retourne la fiche complète d’un élément BIM par son ID ainsi que la liste de ses dépendants dans le graphe.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: 'Identifiant exact de l’élément recherché.',
      },
    },
    required: ['elementId'],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    return { elementId: readRequiredString(obj, 'elementId') };
  },
  execute(args, ctx): ToolResult<unknown> {
    const state = ctx.doc.getState() as BimState;
    const found = findElementInState(state, args.elementId);
    if (!found) {
      return {
        ok: false,
        code: 'ELEMENT_NOT_FOUND',
        message: `Élément introuvable "${args.elementId}". Utilisez get_level_details ou get_project_summary pour obtenir les IDs valides.`,
        validIds: collectSampleElementIds(state),
      };
    }

    const dependents = ctx.doc.getDependencyGraph().getDependents(args.elementId);
    return {
      ok: true,
      data: {
        id: args.elementId,
        category: found.category,
        element: found.element,
        dependents,
      },
    };
  },
};

// ============================================================================
// 4. audit_model
// ============================================================================

export interface AuditModelArgs {
  readonly levelId?: string | undefined;
}

export const auditModelTool: ToolDefinition<AuditModelArgs, unknown> = {
  name: 'audit_model',
  mode: 'read',
  description: 'Exécute un audit passif complet de la maquette (longueurs critiques, baies hors bornes, escaliers Blondel, etc.).',
  parameters: {
    type: 'object',
    properties: {
      levelId: {
        type: 'string',
        description: 'Filtre optionnel par identifiant de niveau.',
      },
    },
    required: [],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const levelId = readOptionalString(obj, 'levelId');
    return { ...(levelId !== undefined ? { levelId } : {}) };
  },
  execute(args, ctx): ToolResult<unknown> {
    const state = ctx.doc.getState() as BimState;
    if (args.levelId && !state.levels[args.levelId]) {
      return {
        ok: false,
        code: 'UNKNOWN_LEVEL',
        message: `Niveau introuvable "${args.levelId}".`,
        validIds: Object.keys(state.levels),
      };
    }

    const allIssues = auditDocumentState(state);
    const filtered = args.levelId
      ? allIssues.filter((issue) => {
          const levels = resolveViolationLevelIds(state, issue.offendingIds ?? []);
          return levels.has(args.levelId as string);
        })
      : allIssues;

    return {
      ok: true,
      data: {
        totalIssues: filtered.length,
        issues: filtered,
      },
    };
  },
};

// ============================================================================
// 5. get_clashes_summary
// ============================================================================

export interface GetClashesSummaryArgs {
  readonly severity?: ClashSeverity | undefined;
  readonly limit?: number | undefined;
}

export const getClashesSummaryTool: ToolDefinition<GetClashesSummaryArgs, unknown> = {
  name: 'get_clashes_summary',
  mode: 'read',
  description: 'Détecte les conflits géométriques 3D via le moteur BVH/SAT et retourne une synthèse bornée (max 50).',
  parameters: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        description: 'Filtre optionnel par sévérité ("hard" ou "clearance").',
        enum: ['hard', 'clearance'],
      },
      limit: {
        type: 'integer',
        description: 'Nombre maximal de conflits retournés (défaut 20, max 50).',
        minimum: 1,
        maximum: MAX_CLASH_LIMIT,
      },
    },
    required: [],
  },
  validateArgs(raw) {
    const obj = asPlainObject(raw);
    const severityRaw = readOptionalString(obj, 'severity');
    if (severityRaw !== undefined && severityRaw !== 'hard' && severityRaw !== 'clearance') {
      throw new ToolArgumentValidationError(
        `Sévérité invalide "${severityRaw}". Valeurs autorisées : hard, clearance.`,
      );
    }

    let limit = DEFAULT_CLASH_LIMIT;
    if (obj.limit !== undefined) {
      if (typeof obj.limit !== 'number' || !Number.isFinite(obj.limit)) {
        throw new ToolArgumentValidationError('Le paramètre "limit" doit être un entier fini.');
      }
      limit = Math.max(1, Math.min(MAX_CLASH_LIMIT, Math.trunc(obj.limit)));
    }

    return {
      ...(severityRaw ? { severity: severityRaw as ClashSeverity } : {}),
      limit,
    };
  },
  execute(args, ctx): ToolResult<unknown> {
    const state = ctx.doc.getState() as BimState;
    const limit = Math.max(1, Math.min(MAX_CLASH_LIMIT, args.limit ?? DEFAULT_CLASH_LIMIT));
    const allClashes = detectClashes(state, {
      checkClearance: args.severity !== 'hard',
    });
    const filtered = args.severity
      ? allClashes.filter((c) => c.severity === args.severity)
      : allClashes;

    const slice = filtered.slice(0, limit).map((c) => ({
      id: c.id,
      elementA: c.elementA,
      categoryA: c.categoryA,
      elementB: c.elementB,
      categoryB: c.categoryB,
      severity: c.severity,
      penetrationDepthMm: Number(c.penetrationDepthMm.toFixed(1)),
      description: c.description,
    }));

    return {
      ok: true,
      data: {
        totalClashes: filtered.length,
        returnedCount: slice.length,
        truncated: filtered.length > slice.length,
        clashes: slice,
      },
    };
  },
};

export const PHASE1_READ_TOOLS: readonly ExposedToolSchema[] = [
  getProjectSummaryTool,
  getLevelDetailsTool,
  getElementByIdTool,
  auditModelTool,
  getClashesSummaryTool,
];

export function createPhase1ReadRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(getProjectSummaryTool);
  registry.register(getLevelDetailsTool);
  registry.register(getElementByIdTool);
  registry.register(auditModelTool);
  registry.register(getClashesSummaryTool);
  return registry;
}
