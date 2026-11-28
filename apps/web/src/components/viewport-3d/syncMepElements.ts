import type { BimState, MepElement } from '@tabax/core';
import {
  type Scene3D,
  type MepDetailLevel,
  type MepFittingGeometryParams,
  type MepEquipmentGeometryParams,
  createMepAssembly3D,
  getMepSystemColor,
} from '@tabax/view-3d';

/** Seuil de bascule automatique LOD 350 -> LOD 200 pour préserver la scalabilité 10k (ADR-062). */
export const MEP_LOD_FALLBACK_THRESHOLD = 1500;

export interface SyncMepOptions {
  readonly detailLevel?: MepDetailLevel | undefined;
}

export interface SyncMepResult {
  readonly syncedCount: number;
  readonly totalMepCount: number;
  readonly detailLevel: MepDetailLevel;
}

const previousDetailLevelByScene = new WeakMap<Scene3D, MepDetailLevel>();

function expandDirtyMepCluster(
  state: BimState,
  dirtyIds: ReadonlySet<string>,
): Set<string> {
  const expanded = new Set(dirtyIds);
  const connectors = state.mepConnectors ? Object.values(state.mepConnectors) : [];
  if (connectors.length === 0 || expanded.size === 0) return expanded;

  const pipes = state.pipes ?? {};
  const ducts = state.ducts ?? {};
  const cableTrays = state.cableTrays ?? {};
  const mepFittings = state.mepFittings ?? {};
  const mepEquipments = state.mepEquipments ?? {};

  const dirtyPortIds = new Set<string>();
  for (const id of dirtyIds) {
    const el: MepElement | undefined =
      pipes[id] ?? ducts[id] ?? cableTrays[id] ?? mepFittings[id] ?? mepEquipments[id];
    if (!el) continue;
    for (const p of el.ports) dirtyPortIds.add(p.id);
  }
  if (dirtyPortIds.size === 0) return expanded;

  const targetPortIds = new Set<string>();
  for (const conn of connectors) {
    if (!conn) continue;
    if (dirtyPortIds.has(conn.portAId)) targetPortIds.add(conn.portBId);
    else if (dirtyPortIds.has(conn.portBId)) targetPortIds.add(conn.portAId);
  }
  if (targetPortIds.size === 0) return expanded;

  const allGroups: readonly Record<string, MepElement | undefined>[] = [
    pipes,
    ducts,
    cableTrays,
    mepFittings,
    mepEquipments,
  ];
  for (const group of allGroups) {
    for (const el of Object.values(group)) {
      if (!el || expanded.has(el.id)) continue;
      if (el.ports.some((p) => targetPortIds.has(p.id))) {
        expanded.add(el.id);
      }
    }
  }
  return expanded;
}

/**
 * Synchronise l'ensemble des réseaux techniques MEP (tuyaux, gaines, chemins de câbles,
 * raccords et équipements) en assemblages LOD 350 / LOD 200 multi-matériaux vers la Scene3D.
 */
export function syncMepElements(
  scene: Scene3D,
  state: BimState,
  dirtyElementIds: ReadonlySet<string>,
  isIncremental: boolean,
  options?: SyncMepOptions,
): SyncMepResult {
  const pipes = state.pipes ?? {};
  const ducts = state.ducts ?? {};
  const cableTrays = state.cableTrays ?? {};
  const mepFittings = state.mepFittings ?? {};
  const mepEquipments = state.mepEquipments ?? {};

  const totalMepCount =
    Object.keys(pipes).length +
    Object.keys(ducts).length +
    Object.keys(cableTrays).length +
    Object.keys(mepFittings).length +
    Object.keys(mepEquipments).length;

  const detailLevel: MepDetailLevel =
    options?.detailLevel ?? (totalMepCount > MEP_LOD_FALLBACK_THRESHOLD ? 'lod200' : 'lod350');

  const prevDetail = previousDetailLevelByScene.get(scene);
  const effectiveIncremental = isIncremental && (!prevDetail || prevDetail === detailLevel);
  previousDetailLevelByScene.set(scene, detailLevel);

  const mepDirtyIds = effectiveIncremental
    ? expandDirtyMepCluster(state, dirtyElementIds)
    : dirtyElementIds;

  let syncedCount = 0;

  scene.batchUpdate(() => {
    for (const pipe of Object.values(pipes)) {
      if (effectiveIncremental && !mepDirtyIds.has(pipe.id)) continue;
      const sys = pipe.systemId ? state.mepSystems?.[pipe.systemId] : undefined;
      const systemType = sys?.systemType ?? pipe.ports[0]?.systemType;
      const domain = sys?.domain ?? pipe.ports[0]?.domain ?? 'plumbing';
      const color = sys?.color ?? getMepSystemColor(systemType, domain);
      const assembly = createMepAssembly3D(
        { category: 'pipe', params: { ...pipe, systemType, domain, color } },
        { detailLevel },
      );
      scene.updateMepAssembly(assembly);
      syncedCount++;
    }

    for (const duct of Object.values(ducts)) {
      if (effectiveIncremental && !mepDirtyIds.has(duct.id)) continue;
      const sys = duct.systemId ? state.mepSystems?.[duct.systemId] : undefined;
      const systemType = sys?.systemType ?? duct.ports[0]?.systemType;
      const domain = sys?.domain ?? duct.ports[0]?.domain ?? 'hvac';
      const color = sys?.color ?? getMepSystemColor(systemType, domain);
      const assembly = createMepAssembly3D(
        { category: 'duct', params: { ...duct, systemType, domain, color } },
        { detailLevel },
      );
      scene.updateMepAssembly(assembly);
      syncedCount++;
    }

    for (const tray of Object.values(cableTrays)) {
      if (effectiveIncremental && !mepDirtyIds.has(tray.id)) continue;
      const sys = tray.systemId ? state.mepSystems?.[tray.systemId] : undefined;
      const systemType = sys?.systemType ?? tray.ports[0]?.systemType ?? 'power';
      const domain = sys?.domain ?? tray.ports[0]?.domain ?? 'electrical';
      const color = sys?.color ?? getMepSystemColor(systemType, domain);
      const assembly = createMepAssembly3D(
        { category: 'cableTray', params: { ...tray, systemType, color } },
        { detailLevel },
      );
      scene.updateMepAssembly(assembly);
      syncedCount++;
    }

    for (const fitting of Object.values(mepFittings)) {
      if (effectiveIncremental && !mepDirtyIds.has(fitting.id)) continue;
      const sys = fitting.systemId ? state.mepSystems?.[fitting.systemId] : undefined;
      const systemType = sys?.systemType ?? fitting.systemType ?? fitting.ports[0]?.systemType;
      const domain = sys?.domain ?? fitting.domain ?? fitting.ports[0]?.domain ?? 'plumbing';
      const color = sys?.color ?? getMepSystemColor(systemType, domain);
      const params: MepFittingGeometryParams = {
        id: fitting.id,
        fittingType: fitting.fittingType,
        eccentricAlignment: fitting.eccentricAlignment,
        position: fitting.position,
        ports: fitting.ports,
        levelId: fitting.levelId,
        systemId: fitting.systemId,
        systemType,
        domain,
        color,
      };
      const assembly = createMepAssembly3D(
        { category: 'mepFitting', params },
        { detailLevel },
      );
      scene.updateMepAssembly(assembly);
      syncedCount++;
    }

    for (const equipment of Object.values(mepEquipments)) {
      if (effectiveIncremental && !mepDirtyIds.has(equipment.id)) continue;
      const sys = equipment.systemId ? state.mepSystems?.[equipment.systemId] : undefined;
      const primaryPort = equipment.ports[0];
      const systemType = sys?.systemType ?? primaryPort?.systemType;
      const domain = sys?.domain ?? primaryPort?.domain;
      const color =
        sys?.color ??
        (primaryPort ? getMepSystemColor(systemType, domain) : '#64748b');
      const params: MepEquipmentGeometryParams = {
        id: equipment.id,
        family: equipment.family,
        position: equipment.position,
        rotation: equipment.rotation,
        width: equipment.width,
        depth: equipment.depth,
        height: equipment.height,
        ports: equipment.ports,
        levelId: equipment.levelId,
        systemId: equipment.systemId,
        color,
      };
      const assembly = createMepAssembly3D(
        { category: 'mepEquipment', params },
        { detailLevel },
      );
      scene.updateMepAssembly(assembly);
      syncedCount++;
    }
  });

  return { syncedCount, totalMepCount, detailLevel };
}
