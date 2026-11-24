/**
 * mesh-generator/mep/batch — Génération par lot des maillages MEP
 */

import type { RawMeshData } from '@tabax/geometry';
import type {
  PipeGeometryParams,
  DuctGeometryParams,
  CableTrayGeometryParams,
  MepFittingGeometryParams,
  MepEquipmentGeometryParams,
} from '../types.js';
import { generatePipeMesh } from './pipes.js';
import { generateDuctMesh } from './ducts.js';
import { generateCableTrayMesh } from './cable-trays.js';
import { generateFittingMesh } from './fittings.js';
import { generateEquipmentMesh } from './equipment.js';

export interface MepStateForMesh {
  readonly pipes?: Record<string, PipeGeometryParams> | undefined;
  readonly ducts?: Record<string, DuctGeometryParams> | undefined;
  readonly cableTrays?: Record<string, CableTrayGeometryParams> | undefined;
  readonly mepFittings?: Record<string, MepFittingGeometryParams> | undefined;
  readonly mepEquipments?: Record<string, MepEquipmentGeometryParams> | undefined;
}

export function generateMepMeshes(state: MepStateForMesh): RawMeshData[] {
  const result: RawMeshData[] = [];

  if (state.pipes) {
    for (const pipe of Object.values(state.pipes)) {
      result.push(generatePipeMesh(pipe));
    }
  }

  if (state.ducts) {
    for (const duct of Object.values(state.ducts)) {
      result.push(generateDuctMesh(duct));
    }
  }

  if (state.cableTrays) {
    for (const tray of Object.values(state.cableTrays)) {
      result.push(generateCableTrayMesh(tray));
    }
  }

  if (state.mepFittings) {
    for (const fitting of Object.values(state.mepFittings)) {
      result.push(generateFittingMesh(fitting));
    }
  }

  if (state.mepEquipments) {
    for (const eq of Object.values(state.mepEquipments)) {
      result.push(generateEquipmentMesh(eq));
    }
  }

  return result;
}
