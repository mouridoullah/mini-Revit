import { getSortedLevels, type BimState, type ElementId } from '@tabax/core';

export interface ContextBuildOptions {
  readonly activeLevelId?: string | undefined;
  readonly selectedIds?: readonly ElementId[] | undefined;
}

export interface SelectedElementSummary {
  readonly id: ElementId;
  readonly category: string;
  readonly levelId?: string | undefined;
  readonly label?: string | undefined;
}

export interface CompactLevelEntry {
  readonly id: ElementId;
  readonly name: string;
  readonly elevationMm: number;
  readonly heightMm?: number | undefined;
}

export interface CompactWallTypeEntry {
  readonly id: ElementId;
  readonly name: string;
  readonly thicknessMm: number;
  readonly heightMm: number;
}

export interface CompactDoorTypeEntry {
  readonly id: ElementId;
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface CompactWindowTypeEntry {
  readonly id: ElementId;
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly defaultSillHeightMm?: number | undefined;
}

export interface CompactComponentTypeEntry {
  readonly id: ElementId;
  readonly name: string;
  readonly family: string;
  readonly subType: string;
  readonly widthMm: number;
  readonly depthMm: number;
}

export interface BimProjectCounts {
  readonly levelCount: number;
  readonly wallCount: number;
  readonly doorCount: number;
  readonly windowCount: number;
  readonly slabCount: number;
  readonly roomCount: number;
  readonly componentCount: number;
  readonly stairCount: number;
  readonly roofCount: number;
  readonly dimensionCount: number;
  readonly pipeCount: number;
  readonly ductCount: number;
  readonly cableTrayCount: number;
  readonly fittingCount: number;
  readonly equipmentCount: number;
}

export interface BimSemanticContext {
  readonly schemaVersion: number;
  readonly units: 'mm';
  readonly activeLevelId?: string | undefined;
  readonly selectedElements: readonly SelectedElementSummary[];
  readonly levels: readonly CompactLevelEntry[];
  readonly catalogs: {
    readonly wallTypes: readonly CompactWallTypeEntry[];
    readonly doorTypes: readonly CompactDoorTypeEntry[];
    readonly windowTypes: readonly CompactWindowTypeEntry[];
    readonly componentTypes: readonly CompactComponentTypeEntry[];
  };
  readonly summary: BimProjectCounts;
}

function resolveSelectedElement(state: BimState, id: ElementId): SelectedElementSummary | null {
  const wall = state.walls?.[id];
  if (wall) return { id, category: 'wall', levelId: wall.levelId };

  const door = state.doors?.[id];
  if (door) {
    const host = state.walls?.[door.hostWallId];
    return {
      id,
      category: 'door',
      ...(host ? { levelId: host.levelId } : {}),
    };
  }

  const win = state.windows?.[id];
  if (win) {
    const host = state.walls?.[win.hostWallId];
    return {
      id,
      category: 'window',
      ...(host ? { levelId: host.levelId } : {}),
    };
  }

  const slab = state.slabs?.[id];
  if (slab) {
    return {
      id,
      category: 'slab',
      levelId: slab.levelId,
      ...(slab.name ? { label: slab.name } : {}),
    };
  }

  const room = state.rooms?.[id];
  if (room) return { id, category: 'room', levelId: room.levelId, label: room.name };

  const comp = state.components?.[id];
  if (comp) {
    return {
      id,
      category: 'component',
      levelId: comp.levelId,
      ...(comp.name ? { label: comp.name } : {}),
    };
  }

  const stair = state.stairs?.[id];
  if (stair) {
    return {
      id,
      category: 'stair',
      levelId: stair.bottomLevelId,
      ...(stair.name ? { label: stair.name } : {}),
    };
  }

  const roof = state.roofs?.[id];
  if (roof) {
    return {
      id,
      category: 'roof',
      levelId: roof.levelId,
      ...(roof.name ? { label: roof.name } : {}),
    };
  }

  const pipe = state.pipes?.[id];
  if (pipe) {
    return {
      id,
      category: 'pipe',
      ...(pipe.levelId ? { levelId: pipe.levelId } : {}),
      ...(pipe.name ? { label: pipe.name } : {}),
    };
  }

  const duct = state.ducts?.[id];
  if (duct) {
    return {
      id,
      category: 'duct',
      ...(duct.levelId ? { levelId: duct.levelId } : {}),
      ...(duct.name ? { label: duct.name } : {}),
    };
  }

  return null;
}

function countRecord(record: Readonly<Record<string, unknown>> | undefined): number {
  return record ? Object.keys(record).length : 0;
}

/**
 * Construit une projection sémantique compacte d'un BimState v2 pour injection dans le prompt LLM.
 * Ne sérialise jamais la géométrie brute ni l'intégralité du JSON (ADR-073 D3).
 */
export function buildBimContext(
  state: BimState,
  options?: ContextBuildOptions,
): BimSemanticContext {
  const levels = getSortedLevels(state.levels).map<CompactLevelEntry>((lvl) => ({
    id: lvl.id,
    name: lvl.name,
    elevationMm: lvl.elevation,
    ...(lvl.height !== undefined ? { heightMm: lvl.height } : {}),
  }));

  const selectedElements: SelectedElementSummary[] = [];
  if (options?.selectedIds) {
    for (const id of options.selectedIds) {
      const resolved = resolveSelectedElement(state, id);
      if (resolved) {
        selectedElements.push(resolved);
      }
    }
  }

  const wallTypes = Object.values(state.wallTypes ?? {}).map<CompactWallTypeEntry>((wt) => ({
    id: wt.id,
    name: wt.name,
    thicknessMm: wt.thickness,
    heightMm: wt.height,
  }));

  const doorTypes = Object.values(state.doorTypes ?? {}).map<CompactDoorTypeEntry>((dt) => ({
    id: dt.id,
    name: dt.name,
    widthMm: dt.width,
    heightMm: dt.height,
  }));

  const windowTypes = Object.values(state.windowTypes ?? {}).map<CompactWindowTypeEntry>((wt) => ({
    id: wt.id,
    name: wt.name,
    widthMm: wt.width,
    heightMm: wt.height,
    ...(wt.defaultSillHeight !== undefined ? { defaultSillHeightMm: wt.defaultSillHeight } : {}),
  }));

  const componentTypes = Object.values(state.componentTypes ?? {}).map<CompactComponentTypeEntry>(
    (ct) => ({
      id: ct.id,
      name: ct.name,
      family: ct.family,
      subType: ct.subType,
      widthMm: ct.width,
      depthMm: ct.depth,
    }),
  );

  const summary: BimProjectCounts = {
    levelCount: levels.length,
    wallCount: countRecord(state.walls),
    doorCount: countRecord(state.doors),
    windowCount: countRecord(state.windows),
    slabCount: countRecord(state.slabs),
    roomCount: countRecord(state.rooms),
    componentCount: countRecord(state.components),
    stairCount: countRecord(state.stairs),
    roofCount: countRecord(state.roofs),
    dimensionCount: countRecord(state.dimensions),
    pipeCount: countRecord(state.pipes),
    ductCount: countRecord(state.ducts),
    cableTrayCount: countRecord(state.cableTrays),
    fittingCount: countRecord(state.mepFittings),
    equipmentCount: countRecord(state.mepEquipments),
  };

  return {
    schemaVersion: state.schemaVersion,
    units: state.units,
    ...(options?.activeLevelId !== undefined ? { activeLevelId: options.activeLevelId } : {}),
    selectedElements,
    levels,
    catalogs: {
      wallTypes,
      doorTypes,
      windowTypes,
      componentTypes,
    },
    summary,
  };
}

/**
 * Formate le contexte sémantique compact en bloc JSON minimal lisible par le LLM.
 */
export function formatBimContextPrompt(context: BimSemanticContext): string {
  return JSON.stringify(context);
}
