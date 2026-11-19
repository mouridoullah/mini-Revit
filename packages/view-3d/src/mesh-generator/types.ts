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
