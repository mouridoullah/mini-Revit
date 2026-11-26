/**
 * mesh-generator/mep/dispatcher — Point d'entrée unifié de génération LOD 350 / LOD 200
 *
 * Orchestre la conversion d'entités MEP (ou d'un lot complet MepStateForMesh) vers
 * des assemblages multi-matériaux + instances GPU `MepAssembly3D`.
 */

import type {
  CableTrayGeometryParams,
  DuctGeometryParams,
  MepEquipmentGeometryParams,
  MepFittingGeometryParams,
  PipeGeometryParams,
} from '../types.js';
import type { MepAssembly3D } from './assembly-types.js';
import type { MepAssemblyOptions } from './assembly-builder-helpers.js';
import type { MepStateForMesh } from './batch.js';
import { createPipeAssembly3D } from './pipes.js';
import { createDuctAssembly3D } from './ducts.js';
import { createCableTrayAssembly3D } from './cable-trays.js';
import { createMepFittingAssembly3D } from './fittings-assembly.js';
import { createMepEquipmentAssembly3D } from './equipment-assembly.js';

export type MepElementGeometryInput =
  | { readonly category: 'pipe'; readonly params: PipeGeometryParams }
  | { readonly category: 'duct'; readonly params: DuctGeometryParams }
  | { readonly category: 'cableTray'; readonly params: CableTrayGeometryParams }
  | { readonly category: 'mepFitting'; readonly params: MepFittingGeometryParams }
  | { readonly category: 'mepEquipment'; readonly params: MepEquipmentGeometryParams };

export function createMepAssembly3D(
  input: MepElementGeometryInput,
  options?: MepAssemblyOptions,
): MepAssembly3D {
  switch (input.category) {
    case 'pipe':
      return createPipeAssembly3D(input.params, options);
    case 'duct':
      return createDuctAssembly3D(input.params, options);
    case 'cableTray':
      return createCableTrayAssembly3D(input.params, options);
    case 'mepFitting':
      return createMepFittingAssembly3D(input.params, options);
    case 'mepEquipment':
      return createMepEquipmentAssembly3D(input.params, options);
  }
}

export function generateMepAssemblies(
  state: MepStateForMesh,
  options?: MepAssemblyOptions,
): MepAssembly3D[] {
  const result: MepAssembly3D[] = [];

  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      result.push(createPipeAssembly3D(pipe, options));
    }
  }
  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      result.push(createDuctAssembly3D(duct, options));
    }
  }
  if (state.cableTrays) {
    for (const tray of Object.values(state.cableTrays)) {
      result.push(createCableTrayAssembly3D(tray, options));
    }
  }
  if (state.mepFittings) {
    for (const fitting of Object.values(state.mepFittings)) {
      result.push(createMepFittingAssembly3D(fitting, options));
    }
  }
  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      result.push(createMepEquipmentAssembly3D(eq, options));
    }
  }

  return result;
}
