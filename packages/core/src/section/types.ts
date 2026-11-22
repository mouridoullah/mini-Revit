import type { Vec2 } from '@tabax/geometry';
import type { ElementId } from '../types.js';

export type SectionHatchType = 'concrete' | 'masonry' | 'insulation' | 'solid' | 'metal';

export interface SectionLevelDatum {
  readonly id: ElementId;
  readonly name: string;
  readonly elevation: number; // en mm (altimétrie Z)
}

export interface SectionCutItem {
  readonly id: ElementId;
  readonly category: 'wall' | 'slab' | 'roof' | 'stair' | 'pipe' | 'duct' | 'cableTray';
  readonly polygon: readonly Vec2[]; // Sommets fermés dans le repère (s, z) en mm
  readonly materialId?: string | undefined;
  readonly style?: {
    readonly fill?: string | undefined;
    readonly stroke?: string | undefined;
    readonly strokeWidth?: number | undefined;
    readonly hatch?: SectionHatchType | undefined;
  } | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface SectionProjectedItem {
  readonly id: ElementId;
  readonly category:
    | 'wall'
    | 'door'
    | 'window'
    | 'slab'
    | 'roof'
    | 'stair'
    | 'component'
    | 'pipe'
    | 'duct'
    | 'cableTray';
  readonly depth: number; // Distance orthogonale d >= 0 (tri décroissant)
  readonly polygon: readonly Vec2[]; // Sommets fermés dans le repère (s, z) en mm
  readonly lines?: readonly (readonly [Vec2, Vec2])[] | undefined; // Lignes de détail internes
  readonly style?: {
    readonly stroke?: string | undefined;
    readonly strokeWidth?: number | undefined;
    readonly fill?: string | undefined;
    readonly opacity?: number | undefined;
  } | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export type SectionDimensionKind =
  | 'floor_height'
  | 'ceiling_height'
  | 'total_height'
  | 'opening_height'
  | 'level_marker';

export interface SectionDimension {
  readonly id: string;
  readonly kind: SectionDimensionKind;
  readonly s: number; // Abscisse sur l'axe de coupe (mm)
  readonly z1: number; // Point bas (ou altimétrie de référence)
  readonly z2: number; // Point haut (pour les cotes de hauteur)
  readonly offset: number; // Déport le long de s (mm)
  readonly valueMm: number; // Valeur nette mesurée (mm)
  readonly formattedValue: string; // Libellé formaté (ex. "3.00 m", "+3.00", "2.50 m")
  readonly label?: string | undefined; // Libellé architectural optionnel (ex. "H.S.P.", "R+1", "Faîtage")
  readonly isExterior?: boolean | undefined;
}

export interface SectionScene {
  readonly cutId: ElementId;
  readonly cutName: string;
  readonly cutLabel: string;
  readonly kind: 'section' | 'elevation';
  readonly cutLength: number; // Longueur du segment de coupe L en mm
  readonly depth: number; // Far plane en mm
  readonly bounds: {
    readonly sMin: number;
    readonly sMax: number;
    readonly zMin: number;
    readonly zMax: number;
  };
  readonly levels: readonly SectionLevelDatum[];
  readonly cutItems: readonly SectionCutItem[];
  readonly projectedItems: readonly SectionProjectedItem[];
  readonly dimensions: readonly SectionDimension[];
}
