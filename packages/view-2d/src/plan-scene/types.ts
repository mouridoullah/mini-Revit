import type { Vec2 } from '@tabax/geometry';
import type { DetectedRoomFor2D, DimensionFor2D } from '../types.js';

export interface PlanBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface PlanResolvedOpening {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly wallId: string;
  readonly jamb1: readonly [Vec2, Vec2];
  readonly jamb2: readonly [Vec2, Vec2];
  // Door-specific
  readonly leafLine?: readonly [Vec2, Vec2];
  readonly arc?: {
    readonly center: Vec2;
    readonly radius: number;
    readonly startAngleDeg: number;
    readonly endAngleDeg: number;
  };
  // Window-specific
  readonly frameLines?: readonly (readonly [Vec2, Vec2])[];
  readonly glassLine?: readonly [Vec2, Vec2];
}

export interface PlanResolvedWall {
  readonly id: string;
  readonly levelId: string;
  readonly thickness: number;
  readonly axis: { readonly start: Vec2; readonly end: Vec2 };
  readonly footprint: readonly Vec2[];
  readonly hatchLines: readonly (readonly [Vec2, Vec2])[];
  readonly openings: readonly PlanResolvedOpening[];
}

export interface PlanResolvedSlab {
  readonly id: string;
  readonly levelId: string;
  readonly boundary: readonly Vec2[];
  readonly holes: readonly (readonly Vec2[])[];
}

export interface PlanResolvedRoof {
  readonly id: string;
  readonly levelId: string;
  readonly boundary: readonly Vec2[];
}

export interface PlanResolvedStair {
  readonly id: string;
  readonly bottomLevelId?: string;
  readonly topLevelId?: string;
  readonly boundary: readonly Vec2[];
  readonly treads: readonly (readonly [Vec2, Vec2])[];
  readonly walkLine: readonly [Vec2, Vec2];
  readonly arrowLines: readonly (readonly [Vec2, Vec2])[];
}

export interface PlanResolvedComponent {
  readonly id: string;
  readonly name: string;
  readonly levelId: string;
  readonly corners: readonly Vec2[];
}

export interface PlanResolvedRoom {
  readonly id: string;
  readonly name: string;
  readonly levelId: string;
  readonly areaM2: number;
  readonly areaMm2: number;
  readonly labelPosition: Vec2;
  readonly polygon: readonly Vec2[];
}

export interface PlanResolvedDimension {
  readonly id: string;
  readonly levelId: string;
  readonly value: number;
  readonly text: string;
  readonly line: readonly [Vec2, Vec2];
  readonly witness1: readonly [Vec2, Vec2];
  readonly witness2: readonly [Vec2, Vec2];
  readonly ticks: readonly (readonly [Vec2, Vec2])[];
  readonly textPos: Vec2;
  readonly angleDeg: number;
}

export interface PlanResolvedSectionCut {
  readonly id: string;
  readonly name: string;
  readonly line: readonly [Vec2, Vec2];
  readonly extLine: readonly [Vec2, Vec2];
  readonly arrows: readonly {
    readonly p1: Vec2;
    readonly p2: Vec2;
    readonly textPos: Vec2;
    readonly text: string;
  }[];
}

export interface PlanResolvedPipe {
  readonly id: string;
  readonly system: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly diameter: number;
}

export interface PlanResolvedDuct {
  readonly id: string;
  readonly system: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly width: number;
  readonly height: number;
}

export interface PlanResolvedCableTray {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly width: number;
  readonly height: number;
}

export interface PlanResolvedMep {
  readonly pipes: readonly PlanResolvedPipe[];
  readonly ducts: readonly PlanResolvedDuct[];
  readonly cableTrays: readonly PlanResolvedCableTray[];
}

export interface PlanScene {
  readonly levelId: string;
  readonly levelName: string;
  readonly bounds: PlanBounds;
  readonly walls: readonly PlanResolvedWall[];
  readonly slabs: readonly PlanResolvedSlab[];
  readonly roofs: readonly PlanResolvedRoof[];
  readonly stairs: readonly PlanResolvedStair[];
  readonly components: readonly PlanResolvedComponent[];
  readonly rooms: readonly PlanResolvedRoom[];
  readonly dimensions: readonly PlanResolvedDimension[];
  readonly sectionCuts: readonly PlanResolvedSectionCut[];
  readonly mep: PlanResolvedMep;
}

export interface ComputePlanSceneOptions {
  readonly levelId?: string | null | undefined;
  readonly includeHatches?: boolean | undefined;
  readonly hatchSpacing?: number | undefined;
  readonly rooms?: readonly DetectedRoomFor2D[] | undefined;
  readonly dimensions?: readonly DimensionFor2D[] | undefined;
}
