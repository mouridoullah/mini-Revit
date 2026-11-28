/**
 * syncArchitecturalStructure
 *
 * Synchronise les éléments de structure et d'enveloppe du bâtiment (murs, dalles, escaliers, toitures)
 * entre le document BIM et la scène 3D Three.js.
 * En mode réaliste (LOD 350) : génère des assemblages multi-matériaux détaillés
 * (plinthes, finitions nobles de sol, girons saillants, garde-corps, faîtages, rives et chéneaux).
 * En mode technique / écorché : produit des maillages solides fermés à draw-call unique.
 */

import {
  type Scene3D,
  type RenderMode,
  createWallMeshWithOpenings,
  createWallAssembly,
  createSlabMesh,
  createSlabAssembly,
  createStairMesh,
  createStairAssembly,
  createRoofMesh,
  createRoofAssembly,
  type OpeningGeometryParams,
  type ComponentDetailLevel,
} from '@tabax/view-3d';
import { computeStairShaft, resolveWallGeometry, type BimState } from '@tabax/core';

export interface SyncArchitecturalStructureOptions {
  renderMode?: RenderMode;
  resolvedPolygonsByWallId?: ReadonlyMap<string, readonly { readonly x: number; readonly y: number }[]>;
  detailLevel?: ComponentDetailLevel;
}

export function syncArchitecturalStructure(
  scene: Scene3D,
  state: BimState,
  dirtyElementIds: Set<string>,
  isIncremental: boolean,
  options: SyncArchitecturalStructureOptions = {},
): void {
  const renderMode = options.renderMode ?? 'technique';
  const isRealistic = renderMode === 'realiste';
  const detailLevel = options.detailLevel ?? (isRealistic ? 'lod350' : 'lod200');
  const resolvedPolygonsByWallId =
    options.resolvedPolygonsByWallId ??
    new Map<string, readonly { readonly x: number; readonly y: number }[]>();

  const walls = state.walls ?? {};
  const slabs = state.slabs ?? {};
  const stairs = state.stairs ?? {};
  const roofs = state.roofs ?? {};

  // 1. Murs architecturaux & structurels
  for (const wall of Object.values(walls)) {
    if (isIncremental && !dirtyElementIds.has(wall.id)) continue;
    const wallType = state.wallTypes[wall.typeId];
    if (!wallType) continue;

    const resolved = resolveWallGeometry(wall, state);
    const openingParams: OpeningGeometryParams[] = resolved.openings.map((op) => ({
      id: op.id,
      kind: op.kind,
      offsetAlong: op.offsetAlong,
      width: op.width,
      height: op.height,
      sillHeight: op.sillHeight,
    }));

    const resolvedPoly = resolvedPolygonsByWallId.get(wall.id);
    const wallParams = {
      wall,
      wallType,
      openings: openingParams,
      elevation: resolved.zBase,
      height: resolved.height,
      topProfile: resolved.topProfile,
      ...(resolvedPoly ? { polygon: resolvedPoly } : {}),
    };

    if (isRealistic && detailLevel === 'lod350') {
      const isLoadBearing = (wall as { loadBearing?: boolean }).loadBearing ?? false;
      const wallAssembly = createWallAssembly(wallParams, {
        detailLevel,
        isLoadBearing,
      });
      scene.updateComponentAssembly(wallAssembly);
    } else {
      const pieces = createWallMeshWithOpenings(wallParams);
      scene.updateMeshBatch(wall.id, pieces);
    }
  }

  // 2. Dalles de plancher (avec trémies)
  for (const slab of Object.values(slabs)) {
    if (isIncremental && !dirtyElementIds.has(slab.id)) continue;
    const slabType = state.slabTypes?.[slab.slabTypeId];
    if (!slabType) continue;

    const level = state.levels[slab.levelId];
    const elevation = level?.elevation ?? 0;

    const stairShafts: { x: number; y: number }[][] = [];
    for (const st of Object.values(stairs)) {
      if (st.topLevelId === slab.levelId) {
        const shaft = computeStairShaft(st, state, {
          useHeadroomCutoff: true,
          slabThickness: slabType.thickness,
        });
        stairShafts.push([...shaft]);
      }
    }

    const slabParams = {
      id: slab.id,
      boundary: slab.boundary,
      holes: slab.holes,
      openings: [...(slab.openings ?? []), ...stairShafts],
      baseOffset: slab.baseOffset,
    };

    if (isRealistic && detailLevel === 'lod350') {
      const slabAssembly = createSlabAssembly(slabParams, slabType, elevation, {
        detailLevel: 'lod350',
      });
      if (slabAssembly) {
        scene.updateComponentAssembly(slabAssembly);
      }
    } else {
      const slabMesh = createSlabMesh(slabParams, slabType, elevation);
      if (slabMesh) {
        scene.updateSlabMesh(slab.id, slabMesh);
      }
    }
  }

  // 3. Escaliers paramétriques
  for (const stair of Object.values(stairs)) {
    if (isIncremental && !dirtyElementIds.has(stair.id)) continue;
    const stairType = state.stairTypes?.[stair.stairTypeId];
    const bottomLevel = state.levels[stair.bottomLevelId];
    const topLevel = state.levels[stair.topLevelId];
    const bottomElevation = bottomLevel?.elevation ?? 0;
    const topElevation = topLevel?.elevation ?? bottomElevation + 2800;

    const stairParams = {
      id: stair.id,
      start: stair.start,
      end: stair.end,
      widthOverride: stair.widthOverride,
      bottomElevation,
      topElevation,
    };
    const stairTypeParam = stairType ? { width: stairType.width } : undefined;

    if (isRealistic && detailLevel === 'lod350') {
      const stairAssembly = createStairAssembly(stairParams, stairTypeParam, {
        detailLevel: 'lod350',
      });
      if (stairAssembly) {
        scene.updateComponentAssembly(stairAssembly);
      }
    } else {
      const stairMesh = createStairMesh(stairParams, stairTypeParam);
      if (stairMesh) {
        scene.updateStairMesh(stair.id, stairMesh);
      }
    }
  }

  // 4. Toitures (plates et 2 pans)
  for (const roof of Object.values(roofs)) {
    if (isIncremental && !dirtyElementIds.has(roof.id)) continue;
    const roofType = state.roofTypes?.[roof.roofTypeId];
    if (!roofType) continue;

    const level = state.levels[roof.levelId];
    const elevation = level?.elevation ?? 0;

    const roofOpenings = Object.values(state.roofOpenings ?? {}).filter(
      (op) => op.roofId === roof.id,
    );

    const roofParams = {
      id: roof.id,
      footprint: roof.footprint,
      ridgeAxis: roof.ridgeAxis,
      slopeOverrideDeg: roof.slopeOverrideDeg,
      overhangOverride: roof.overhangOverrideMm,
      baseOffset: roof.baseOffset,
      elevation,
      openings: roofOpenings.map((op) => ({
        offsetU: op.offsetU,
        offsetV: op.offsetV,
        width: op.width,
        height: op.height,
      })),
    };

    if (isRealistic && detailLevel === 'lod350') {
      const roofAssembly = createRoofAssembly(roofParams, roofType, undefined, {
        detailLevel: 'lod350',
      });
      if (roofAssembly) {
        scene.updateComponentAssembly(roofAssembly);
      }
    } else {
      const roofMesh = createRoofMesh(roofParams, roofType);
      if (roofMesh) {
        scene.updateRoofMesh(roof.id, roofMesh);
      }
    }
  }
}
