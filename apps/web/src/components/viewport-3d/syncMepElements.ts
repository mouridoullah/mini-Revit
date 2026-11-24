import type { BimState } from '@tabax/core';
import {
  type Scene3D,
  generatePipeMesh,
  generateDuctMesh,
  generateCableTrayMesh,
  generateFittingMesh,
  generateEquipmentMesh,
  getMepSystemColor,
} from '@tabax/view-3d';

/**
 * Synchronise l'ensemble des réseaux techniques MEP (tuyaux, gaines, chemins de câbles,
 * raccords et équipements) depuis le BimState vers la Scene3D impérative.
 */
export function syncMepElements(
  scene: Scene3D,
  state: BimState,
  dirtyElementIds: ReadonlySet<string>,
  isIncremental: boolean,
): void {
  const pipes = state.pipes ?? {};
  const ducts = state.ducts ?? {};
  const cableTrays = state.cableTrays ?? {};
  const mepFittings = state.mepFittings ?? {};
  const mepEquipments = state.mepEquipments ?? {};

  for (const pipe of Object.values(pipes)) {
    if (isIncremental && !dirtyElementIds.has(pipe.id)) continue;
    const meshData = generatePipeMesh(pipe);
    const sys = pipe.systemId ? state.mepSystems?.[pipe.systemId] : undefined;
    const systemType = sys?.systemType ?? pipe.ports[0]?.systemType;
    const domain = sys?.domain ?? pipe.ports[0]?.domain ?? 'plumbing';
    const color = getMepSystemColor(systemType, domain);
    scene.updateMepMesh(pipe.id, meshData, color);
  }

  for (const duct of Object.values(ducts)) {
    if (isIncremental && !dirtyElementIds.has(duct.id)) continue;
    const meshData = generateDuctMesh(duct);
    const sys = duct.systemId ? state.mepSystems?.[duct.systemId] : undefined;
    const systemType = sys?.systemType ?? duct.ports[0]?.systemType;
    const domain = sys?.domain ?? duct.ports[0]?.domain ?? 'hvac';
    const color = getMepSystemColor(systemType, domain);
    scene.updateMepMesh(duct.id, meshData, color);
  }

  for (const tray of Object.values(cableTrays)) {
    if (isIncremental && !dirtyElementIds.has(tray.id)) continue;
    const meshData = generateCableTrayMesh(tray);
    const sys = tray.systemId ? state.mepSystems?.[tray.systemId] : undefined;
    const systemType = sys?.systemType ?? tray.ports[0]?.systemType;
    const domain = sys?.domain ?? tray.ports[0]?.domain ?? 'electrical';
    const color = getMepSystemColor(systemType, domain);
    scene.updateMepMesh(tray.id, meshData, color);
  }

  for (const fitting of Object.values(mepFittings)) {
    if (isIncremental && !dirtyElementIds.has(fitting.id)) continue;
    const meshData = generateFittingMesh(fitting);
    const sys = fitting.systemId ? state.mepSystems?.[fitting.systemId] : undefined;
    const systemType = sys?.systemType ?? fitting.ports[0]?.systemType;
    const domain = sys?.domain ?? fitting.ports[0]?.domain ?? 'plumbing';
    const color = getMepSystemColor(systemType, domain);
    scene.updateMepMesh(fitting.id, meshData, color);
  }

  for (const equipment of Object.values(mepEquipments)) {
    if (isIncremental && !dirtyElementIds.has(equipment.id)) continue;
    const meshData = generateEquipmentMesh(equipment);
    const primaryPort = equipment.ports[0];
    const color = primaryPort ? getMepSystemColor(primaryPort.systemType, primaryPort.domain) : '#64748b';
    scene.updateMepMesh(equipment.id, meshData, color);
  }
}
