import type { Vec2 } from '@mini-bim/geometry';

export interface WallGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
}

export interface WallTypeGeometryParams {
  readonly thickness: number;
  readonly height: number;
}

export interface OpeningGeometryParams {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight?: number; // allège (pour fenêtre, 0 par défaut pour porte)
}

export interface WallWithOpeningsParams {
  readonly wall: WallGeometryParams;
  readonly wallType: WallTypeGeometryParams;
  readonly openings: readonly OpeningGeometryParams[];
  readonly elevation?: number;
  readonly polygon?: readonly Vec2[] | undefined;
  /** Hauteur effective du mur en mm (prend le pas sur wallType.height si spécifiée, ADR-049 / S1-1). */
  readonly height?: number;
  /** Profil polygonal d'arase supérieure (offsetAlong, zAbsolu) pour biseautage sous toiture (ADR-053). */
  readonly topProfile?: readonly Vec2[] | undefined;
}

export interface RoomFloorMeshParams {
  readonly id: string;
  readonly polygon: readonly { readonly x: number; readonly y: number }[];
  readonly elevation?: number;
}

export interface SlabGeometryParams {
  readonly id: string;
  readonly boundary: readonly { readonly x: number; readonly y: number }[];
  readonly holes?: readonly (readonly { readonly x: number; readonly y: number }[])[] | undefined;
  readonly openings?:
    readonly (readonly { readonly x: number; readonly y: number }[])[] | undefined;
  readonly baseOffset?: number | undefined;
}

export interface SlabTypeGeometryParams {
  readonly thickness: number;
}

export interface StairGeometryParams {
  readonly id: string;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly widthOverride?: number | undefined;
  readonly bottomElevation?: number | undefined;
  readonly topElevation?: number | undefined;
}

export interface StairTypeGeometryParams {
  readonly width: number;
}

export interface RoofGeometryParams {
  readonly id: string;
  readonly footprint: readonly { readonly x: number; readonly y: number }[];
  readonly ridgeAxis?:
    | {
        readonly start: { readonly x: number; readonly y: number };
        readonly end: { readonly x: number; readonly y: number };
      }
    | undefined;
  readonly slopeOverrideDeg?: number | undefined;
  readonly overhangOverride?: number | undefined;
  readonly baseOffset?: number | undefined;
  readonly elevation?: number | undefined;
  readonly openings?:
    | readonly {
        readonly offsetU: number;
        readonly offsetV: number;
        readonly width: number;
        readonly height: number;
      }[]
    | undefined;
}

export interface FlatRoofTypeGeometryParams {
  readonly family: 'flat';
  readonly thickness: number;
}

export interface GableRoofTypeGeometryParams {
  readonly family: 'gable';
  readonly thickness: number;
  readonly slopeDeg: number;
  readonly overhangMm?: number;
}

export type RoofTypeGeometryParams = FlatRoofTypeGeometryParams | GableRoofTypeGeometryParams;

// ============================================================================
// Types Géométriques MEP 3D (ADR-009 / Phase 9.3.1)
// ============================================================================

export interface Point3DParams {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PipeGeometryParams {
  readonly id: string;
  readonly start: Point3DParams;
  readonly end: Point3DParams;
  readonly diameter: number;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly systemType?: string | undefined;
  readonly domain?: string | undefined;
  readonly color?: string | undefined;
}

export interface DuctGeometryParams {
  readonly id: string;
  readonly start: Point3DParams;
  readonly end: Point3DParams;
  readonly shape: 'round' | 'rectangular';
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly systemType?: string | undefined;
  readonly domain?: string | undefined;
  readonly color?: string | undefined;
}

export interface CableTrayGeometryParams {
  readonly id: string;
  readonly start: Point3DParams;
  readonly end: Point3DParams;
  readonly width: number;
  readonly height: number;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly color?: string | undefined;
}

export interface MepPortGeometryParams {
  readonly id: string;
  readonly position: Point3DParams;
  readonly direction: Point3DParams;
  readonly shape?: 'round' | 'rectangular' | undefined;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly systemType?: string | undefined;
  readonly domain?: string | undefined;
}

export interface MepFittingGeometryParams {
  readonly id: string;
  readonly fittingType: 'elbow' | 'tee' | 'cross' | 'transition' | 'cap';
  readonly position: Point3DParams;
  readonly ports: readonly MepPortGeometryParams[];
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly systemType?: string | undefined;
  readonly domain?: string | undefined;
  readonly color?: string | undefined;
}

export interface MepEquipmentGeometryParams {
  readonly id: string;
  readonly family?: string | undefined;
  readonly position: Point3DParams;
  readonly rotation?: number | undefined;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly ports?: readonly MepPortGeometryParams[] | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly color?: string | undefined;
}

