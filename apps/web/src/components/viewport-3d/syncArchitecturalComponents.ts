/**
 * syncArchitecturalComponents
 *
 * Synchronise l'ensemble des composants architecturaux et de mobilier intérieur
 * en assemblages multi-matériaux LOD 350 vers la Scene3D (ADR-072).
 */

import type { BimState } from '@tabax/core';
import {
  type Scene3D,
  createComponentAssembly,
  type ComponentAssembly3D,
} from '@tabax/view-3d';

export interface SyncArchitecturalComponentsResult {
  readonly syncedCount: number;
  readonly totalCount: number;
}

export function syncArchitecturalComponents(
  scene: Scene3D,
  state: BimState,
  dirtyElementIds: ReadonlySet<string>,
  isIncremental: boolean,
): SyncArchitecturalComponentsResult {
  const components = state.components ?? {};
  const totalCount = Object.keys(components).length;
  let syncedCount = 0;

  for (const comp of Object.values(components)) {
    if (isIncremental && !dirtyElementIds.has(comp.id)) continue;
    const compType = state.componentTypes?.[comp.typeId];
    if (!compType) continue;

    const level = state.levels[comp.levelId];
    const elevation = level?.elevation ?? 0;

    const assembly: ComponentAssembly3D | null = createComponentAssembly(
      comp,
      compType,
      elevation,
      { detailLevel: 'lod350' },
    );

    if (assembly) {
      scene.updateComponentAssembly(assembly);
      syncedCount++;
    } else {
      scene.removeMesh(comp.id);
    }
  }

  return { syncedCount, totalCount };
}
