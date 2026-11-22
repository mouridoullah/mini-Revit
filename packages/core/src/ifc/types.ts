/**
 * Types et interfaces pour l'exportateur IFC4 ISO 10303-21.
 */

import type { BimState, ElementId } from '../types.js';
import type { StepWriter } from './step-writer.js';

export interface IfcExportOptions {
  readonly projectName?: string;
  readonly author?: string;
  readonly organization?: string;
  readonly filename?: string;
  readonly timestamp?: number;
}

export interface StoreyInfo {
  readonly id: number;
  readonly placementId: number;
}

export interface IfcContext {
  readonly state: BimState;
  readonly writer: StepWriter;
  readonly ownerHistory: number;
  readonly geomContext: number;
  readonly geomSubContext: number;
  readonly placementWorld3D: number;
  readonly dirZ: number;
  readonly dirX: number;
  readonly storeyMap: Map<ElementId, StoreyInfo>;
  readonly storeyElementsMap: Map<ElementId, number[]>;
  readonly defaultStoreyId: ElementId;
}
