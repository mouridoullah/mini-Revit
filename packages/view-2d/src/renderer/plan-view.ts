import type { Transform2D } from '../transform.js';
import type {
  View2DRenderConfig,
  PreviewShape,
  DocumentFor2D,
  OpeningFor2D,
  DetectedRoomFor2D,
  DimensionFor2D,
  SlabFor2D,
  RoofFor2D,
  RoomDiagnosticFor2D,
} from '../types.js';
import type { SpatialIndex2D } from '../spatial/types.js';
import {
  DEFAULT_VIEW2D_RENDER_CONFIG,
  DEFAULT_GRID_CONFIG,
  DEFAULT_WALL_RENDER_CONFIG,
  DEFAULT_SLAB_RENDER_CONFIG,
  DEFAULT_STAIR_RENDER_CONFIG,
  DEFAULT_ROOF_RENDER_CONFIG,
  DEFAULT_UNDERLAY_RENDER_CONFIG,
  DEFAULT_ROOM_RENDER_CONFIG,
  DEFAULT_DIMENSION_RENDER_CONFIG,
  DEFAULT_MEP_RENDER_CONFIG,
} from './config.js';
import { DEFAULT_COMPONENT_RENDER_CONFIG, drawComponents } from '../components-2d.js';
import { clearCanvas, drawGrid } from './grid.js';
import { drawWalls } from './walls.js';
import { drawOpenings } from './openings.js';
import { drawSlabs } from './slabs.js';
import { drawUnderlay } from './underlay.js';
import { drawStairs } from './stairs.js';
import { drawRoofs } from './roofs.js';
import { drawMepElements } from './mep.js';
import { drawRoomFills, drawRoomLabels, drawRoomDiagnostics } from './rooms.js';
import { drawDimensions } from './dimensions.js';
import { drawSectionCuts } from './section-symbols.js';
import { drawPreview } from './preview.js';
import {
  aabbIntersects,
  expandAABB,
  getWallAABB,
  getSlabAABB,
  getStairAABB,
  getRoofAABB,
  getComponentAABB,
  getDimensionAABB,
  getRoomAABB,
} from '../spatial/culling.js';

export interface RenderPlanViewOptions {
  readonly enableCulling?: boolean | undefined;
  readonly spatialIndex?: SpatialIndex2D | null | undefined;
}

/**
 * Fonction pure orchestrant le cycle de rendu complet d'une vue en plan 2D.
 * Intègre le filtrage par niveau actif et le Frustum Culling spatial par AABB.
 */
export function renderPlanView(
  ctx: CanvasRenderingContext2D,
  transform: Transform2D,
  doc: DocumentFor2D,
  selectedIds: ReadonlySet<string> = new Set(),
  config: Partial<View2DRenderConfig> = {},
  levelFilter?: string | null,
  preview?: PreviewShape | null,
  openings?: readonly OpeningFor2D[],
  rooms?: readonly DetectedRoomFor2D[],
  dimensions?: readonly DimensionFor2D[],
  slabs?: readonly SlabFor2D[],
  underlayPath?: Path2D | null,
  roofs?: readonly RoofFor2D[],
  roomDiagnostics?: readonly RoomDiagnosticFor2D[],
  options?: RenderPlanViewOptions,
): void {
  const mergedConfig: View2DRenderConfig = {
    backgroundColor: config.backgroundColor ?? DEFAULT_VIEW2D_RENDER_CONFIG.backgroundColor,
    showAxes: config.showAxes ?? DEFAULT_VIEW2D_RENDER_CONFIG.showAxes,
    grid: { ...DEFAULT_GRID_CONFIG, ...config.grid },
    wall: { ...DEFAULT_WALL_RENDER_CONFIG, ...config.wall },
    slab: { ...DEFAULT_SLAB_RENDER_CONFIG, ...config.slab },
    stair: { ...DEFAULT_STAIR_RENDER_CONFIG, ...config.stair },
    roof: { ...DEFAULT_ROOF_RENDER_CONFIG, ...config.roof },
    underlay: { ...DEFAULT_UNDERLAY_RENDER_CONFIG, ...config.underlay },
    room: { ...DEFAULT_ROOM_RENDER_CONFIG, ...config.room },
    dimension: { ...DEFAULT_DIMENSION_RENDER_CONFIG, ...config.dimension },
    component: { ...DEFAULT_COMPONENT_RENDER_CONFIG, ...config.component },
    mep: { ...DEFAULT_MEP_RENDER_CONFIG, ...config.mep },
  };

  const state = doc.getState();

  // 1. Résolution du niveau actif : si non spécifié, par défaut premier niveau de la maquette
  let effectiveLevelId: string | null = null;
  if (levelFilter === 'all') {
    effectiveLevelId = null; // Rendu explicite de tous les niveaux
  } else if (levelFilter !== undefined) {
    effectiveLevelId = levelFilter;
  } else if (state.levels && Object.keys(state.levels).length > 0) {
    effectiveLevelId = Object.keys(state.levels)[0] ?? null;
  }

  // 2. Frustum Culling : calcul de l'emprise visible en millimètres avec marge de sécurité
  const enableCulling = options?.enableCulling ?? true;
  const visibleBounds = transform.getVisibleWorldBounds();
  const marginMm = Math.max(500, 50 / transform.scale);
  const paddedBounds = expandAABB(visibleBounds, marginMm);

  // Requête spatiale si un index est fourni
  const spatialVisibleIds =
    enableCulling && options?.spatialIndex
      ? options.spatialIndex.queryIds(paddedBounds, effectiveLevelId)
      : null;

  // 1. Nettoyage de l'arrière-plan
  clearCanvas(ctx, transform.viewportWidth, transform.viewportHeight, mergedConfig.backgroundColor);

  // 2. Grille de repérage et axes
  drawGrid(ctx, transform, mergedConfig.grid, mergedConfig.showAxes);

  // 2b. Vue fantôme (Underlay) du niveau inférieur
  if (underlayPath) {
    drawUnderlay(ctx, transform, underlayPath, mergedConfig.underlay);
  }

  // 3. Dalles horizontales
  const effectiveSlabs: readonly SlabFor2D[] =
    slabs ?? (state.slabs ? Object.values(state.slabs) : []);
  if (effectiveSlabs.length > 0) {
    let visibleSlabIds: Set<string> | null = null;
    if (enableCulling) {
      visibleSlabIds = new Set<string>();
      if (spatialVisibleIds) {
        for (const id of spatialVisibleIds) {
          if (state.slabs?.[id]) {
            visibleSlabIds.add(id);
          }
        }
      } else {
        for (const slab of effectiveSlabs) {
          if (aabbIntersects(getSlabAABB(slab), paddedBounds)) {
            visibleSlabIds.add(slab.id);
          }
        }
      }
    }
    drawSlabs(
      ctx,
      transform,
      effectiveSlabs,
      state.slabTypes ?? {},
      selectedIds,
      mergedConfig.slab,
      effectiveLevelId,
      visibleSlabIds,
    );
  }

  // 3b. Escaliers droits paramétriques
  if (state.stairs && Object.keys(state.stairs).length > 0) {
    let visibleStairIds: Set<string> | null = null;
    if (enableCulling) {
      visibleStairIds = new Set<string>();
      if (spatialVisibleIds) {
        for (const id of spatialVisibleIds) {
          if (state.stairs[id]) {
            visibleStairIds.add(id);
          }
        }
      } else {
        for (const stair of Object.values(state.stairs)) {
          const stairType = stair.stairTypeId ? state.stairTypes?.[stair.stairTypeId] : undefined;
          if (aabbIntersects(getStairAABB(stair, stairType), paddedBounds)) {
            visibleStairIds.add(stair.id);
          }
        }
      }
    }
    drawStairs(
      ctx,
      transform,
      state.stairs,
      state.stairTypes ?? {},
      selectedIds,
      mergedConfig.stair,
      effectiveLevelId,
      visibleStairIds,
    );
  }

  // 3c. Toitures
  const effectiveRoofs: readonly RoofFor2D[] =
    roofs ?? (state.roofs ? Object.values(state.roofs) : []);
  if (effectiveRoofs.length > 0) {
    let visibleRoofIds: Set<string> | null = null;
    if (enableCulling) {
      visibleRoofIds = new Set<string>();
      if (spatialVisibleIds) {
        for (const id of spatialVisibleIds) {
          if (state.roofs?.[id]) {
            visibleRoofIds.add(id);
          }
        }
      } else {
        for (const roof of effectiveRoofs) {
          if (aabbIntersects(getRoofAABB(roof), paddedBounds)) {
            visibleRoofIds.add(roof.id);
          }
        }
      }
    }
    drawRoofs(
      ctx,
      transform,
      effectiveRoofs,
      state.roofTypes ?? {},
      state.roofOpenings ?? {},
      selectedIds,
      mergedConfig.roof,
      effectiveLevelId,
      visibleRoofIds,
    );
  }

  // 4. Fonds pochés des pièces closes (fond de plan sous mobilier, murs et MEP)
  let visibleRoomIds: Set<string> | null = null;
  if (rooms && rooms.length > 0) {
    if (enableCulling) {
      visibleRoomIds = new Set<string>();
      for (const room of rooms) {
        if (
          spatialVisibleIds
            ? room.id && spatialVisibleIds.has(room.id)
            : aabbIntersects(getRoomAABB(room), paddedBounds)
        ) {
          if (room.id) visibleRoomIds.add(room.id);
        }
      }
    }
    drawRoomFills(ctx, transform, rooms, mergedConfig.room, visibleRoomIds);
  }

  // 4b. Composants d'aménagement et mobilier
  if (state.components && Object.keys(state.components).length > 0) {
    let visibleCompIds: Set<string> | null = null;
    if (enableCulling) {
      visibleCompIds = new Set<string>();
      if (spatialVisibleIds) {
        for (const id of spatialVisibleIds) {
          if (state.components[id]) {
            visibleCompIds.add(id);
          }
        }
      } else {
        for (const comp of Object.values(state.components)) {
          const cType = state.componentTypes?.[comp.typeId];
          if (aabbIntersects(getComponentAABB(comp, cType), paddedBounds)) {
            visibleCompIds.add(comp.id);
          }
        }
      }
    }
    drawComponents(
      ctx,
      transform,
      state.components,
      state.componentTypes ?? {},
      selectedIds,
      mergedConfig.component,
      effectiveLevelId,
      visibleCompIds,
    );
  }

  // 5. Murs architecturaux (avec Frustum Culling sur solveWallJunctions)
  const visibleWallIds = new Set<string>();
  if (state.walls) {
    if (spatialVisibleIds) {
      for (const id of spatialVisibleIds) {
        const wall = state.walls[id];
        if (wall) {
          if (effectiveLevelId && wall.levelId && wall.levelId !== effectiveLevelId) {
            continue;
          }
          visibleWallIds.add(wall.id);
        }
      }
    } else {
      for (const wall of Object.values(state.walls)) {
        if (effectiveLevelId && wall.levelId && wall.levelId !== effectiveLevelId) {
          continue;
        }
        if (!enableCulling) {
          visibleWallIds.add(wall.id);
        } else {
          const wallType = wall.typeId ? state.wallTypes?.[wall.typeId] : undefined;
          if (aabbIntersects(getWallAABB(wall, wallType), paddedBounds)) {
            visibleWallIds.add(wall.id);
          }
        }
      }
    }
  }

  drawWalls(
    ctx,
    transform,
    state.walls,
    state.wallTypes,
    selectedIds,
    mergedConfig.wall,
    effectiveLevelId,
    enableCulling ? visibleWallIds : null,
  );

  // 5b. Ouvertures architecturales
  let effectiveOpenings: readonly OpeningFor2D[] = openings ?? [];
  if (!openings) {
    const openingsList: OpeningFor2D[] = [];
    if (state.doors) {
      for (const d of Object.values(state.doors)) {
        if (!enableCulling || visibleWallIds.has(d.hostWallId)) {
          openingsList.push({ ...d, kind: 'door' as const });
        }
      }
    }
    if (state.windows) {
      for (const w of Object.values(state.windows)) {
        if (!enableCulling || visibleWallIds.has(w.hostWallId)) {
          openingsList.push({ ...w, kind: 'window' as const });
        }
      }
    }
    effectiveOpenings = openingsList;
  }

  if (effectiveOpenings.length > 0) {
    let visibleOpeningIds: Set<string> | null = null;
    if (enableCulling) {
      visibleOpeningIds = new Set<string>();
      for (const op of effectiveOpenings) {
        // Une ouverture est visible si son mur hôte est visible
        if (visibleWallIds.has(op.hostWallId)) {
          visibleOpeningIds.add(op.id);
        }
      }
    }

    drawOpenings(
      ctx,
      transform,
      state.walls,
      state.wallTypes,
      effectiveOpenings,
      selectedIds,
      mergedConfig.wall,
      mergedConfig.backgroundColor,
      effectiveLevelId,
      state.doorTypes,
      state.windowTypes,
      visibleOpeningIds,
    );
  }

  // 5c. Réseaux et équipements techniques MEP
  if (
    state.pipes ||
    state.ducts ||
    state.cableTrays ||
    state.mepFittings ||
    state.mepEquipments
  ) {
    drawMepElements(
      ctx,
      transform,
      {
        pipes: state.pipes,
        ducts: state.ducts,
        cableTrays: state.cableTrays,
        mepFittings: state.mepFittings,
        mepEquipments: state.mepEquipments,
        mepConnectors: state.mepConnectors,
        mepSystems: state.mepSystems,
      },
      mergedConfig.mep,
      {
        effectiveLevelId,
        selectedIds,
        spatialVisibleIds,
      },
    );
  }

  // 6. Cotations 2D associatives
  let effectiveDimensions: readonly DimensionFor2D[] = dimensions ?? [];
  if (!dimensions && state.dimensions) {
    effectiveDimensions = Object.values(state.dimensions);
  }

  if (effectiveDimensions.length > 0) {
    let visibleDimIds: Set<string> | null = null;
    if (enableCulling) {
      visibleDimIds = new Set<string>();
      if (spatialVisibleIds) {
        for (const id of spatialVisibleIds) {
          if (state.dimensions?.[id]) {
            visibleDimIds.add(id);
          }
        }
      } else {
        for (const dim of effectiveDimensions) {
          const ref0 = dim.references[0];
          const wall = ref0 ? state.walls?.[ref0] : undefined;
          if (aabbIntersects(getDimensionAABB(dim, wall), paddedBounds)) {
            visibleDimIds.add(dim.id);
          }
        }
      }
    }

    drawDimensions(
      ctx,
      transform,
      effectiveDimensions,
      state.walls,
      mergedConfig.dimension,
      effectiveLevelId,
      visibleDimIds,
    );
  }

  // 6b. Étiquettes de pièces closes (Z-order supérieur avec cartouche blanc au-dessus du mobilier et MEP)
  if (rooms && rooms.length > 0) {
    drawRoomLabels(ctx, transform, rooms, mergedConfig.room, visibleRoomIds);
  }

  // 6c. Diagnostics visuels des pièces
  if (roomDiagnostics && roomDiagnostics.length > 0) {
    drawRoomDiagnostics(ctx, transform, roomDiagnostics);
  }

  // 6d. Symboles de coupe normalisés ISO (ADR-063)
  if (state.sectionCuts) {
    drawSectionCuts(ctx, transform, Object.values(state.sectionCuts), selectedIds);
  }

  // 7. Forme de prévisualisation interactive
  if (preview) {
    drawPreview(ctx, transform, preview);
  }
}
