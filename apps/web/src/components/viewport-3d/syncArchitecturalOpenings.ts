/**
 * syncArchitecturalOpenings
 *
 * Synchronise les menuiseries architecturales (portes et fenêtres) vers la Scene3D.
 * - Mode 'lod350' (Rendu Réaliste) : Menuiseries haute fidélité paramétriques (huisserie alu, vitrage MeshPhysical, vantail bois, béquille chromée)
 * - Mode 'lod200' (Mode Technique) : Placeholders géométriques légers optimisés pour la vitesse (ADR-018, ADR-072).
 */

import * as THREE from 'three';
import type { BimState } from '@tabax/core';
import { resolveWallGeometry } from '@tabax/core';
import {
  type Scene3D,
  createOpeningPlaceholder,
  createDoorAssembly,
  createWindowAssembly,
} from '@tabax/view-3d';

export interface SyncArchitecturalOpeningsOptions {
  readonly detailLevel?: 'lod200' | 'lod350' | undefined;
  readonly doorMaterial?: THREE.Material | undefined;
  readonly windowMaterial?: THREE.Material | undefined;
}

export interface SyncArchitecturalOpeningsResult {
  readonly doorsSynced: number;
  readonly windowsSynced: number;
}

export function syncArchitecturalOpenings(
  scene: Scene3D,
  state: BimState,
  dirtyElementIds: ReadonlySet<string>,
  isIncremental: boolean,
  options?: SyncArchitecturalOpeningsOptions,
): SyncArchitecturalOpeningsResult {
  const doors = state.doors ?? {};
  const windows = state.windows ?? {};
  const isLod350 = options?.detailLevel === 'lod350';
  let doorsSynced = 0;
  let windowsSynced = 0;

  // 1. Synchronisation des portes
  for (const door of Object.values(doors)) {
    if (
      isIncremental &&
      !dirtyElementIds.has(door.id) &&
      !dirtyElementIds.has(door.hostWallId)
    ) {
      continue;
    }

    const hostWall = state.walls[door.hostWallId];
    if (!hostWall) continue;
    const hostWallType = state.wallTypes[hostWall.typeId];
    if (!hostWallType) continue;

    const resolvedHost = resolveWallGeometry(hostWall, state);
    const resolvedDoor = resolvedHost.openings.find((o) => o.id === door.id);
    if (!resolvedDoor) continue;

    const openingParams = {
      id: door.id,
      kind: 'door' as const,
      offsetAlong: resolvedDoor.offsetAlong,
      width: resolvedDoor.width,
      height: resolvedDoor.height,
      sillHeight: resolvedDoor.sillHeight,
    };

    if (isLod350) {
      const assembly = createDoorAssembly(
        openingParams,
        hostWall,
        hostWallType,
        resolvedHost.zBase,
      );
      scene.updateComponentAssembly(assembly);
    } else {
      const placeholder = createOpeningPlaceholder(
        openingParams,
        hostWall,
        resolvedHost.zBase,
      );
      const m = scene.updateMesh(placeholder, options?.doorMaterial, {
        ownsMaterial: false,
        isSharedMaterial: true,
      });
      m.userData.ownsMaterial = false;
      m.userData.isSharedMaterial = true;
    }
    doorsSynced++;
  }

  // 2. Synchronisation des fenêtres
  for (const win of Object.values(windows)) {
    if (
      isIncremental &&
      !dirtyElementIds.has(win.id) &&
      !dirtyElementIds.has(win.hostWallId)
    ) {
      continue;
    }

    const hostWall = state.walls[win.hostWallId];
    if (!hostWall) continue;
    const hostWallType = state.wallTypes[hostWall.typeId];
    if (!hostWallType) continue;

    const resolvedHost = resolveWallGeometry(hostWall, state);
    const resolvedWin = resolvedHost.openings.find((o) => o.id === win.id);
    if (!resolvedWin) continue;

    const openingParams = {
      id: win.id,
      kind: 'window' as const,
      offsetAlong: resolvedWin.offsetAlong,
      width: resolvedWin.width,
      height: resolvedWin.height,
      sillHeight: resolvedWin.sillHeight,
    };

    if (isLod350) {
      const assembly = createWindowAssembly(
        openingParams,
        hostWall,
        hostWallType,
        resolvedHost.zBase,
      );
      scene.updateComponentAssembly(assembly);
    } else {
      const placeholder = createOpeningPlaceholder(
        openingParams,
        hostWall,
        resolvedHost.zBase,
      );
      const m = scene.updateMesh(placeholder, options?.windowMaterial, {
        ownsMaterial: false,
        isSharedMaterial: true,
      });
      m.userData.ownsMaterial = false;
      m.userData.isSharedMaterial = true;
    }
    windowsSynced++;
  }

  return { doorsSynced, windowsSynced };
}
