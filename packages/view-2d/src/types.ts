import { type Vec2 } from '@mini-bim/geometry';
import type { ComponentRenderConfig } from './components-2d.js';

export type { Vec2 };

/**
 * Paramètres neutres d'un mur pour le moteur de vue en plan 2D.
 */
export interface WallFor2D {
  readonly id: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly typeId?: string;
  readonly levelId?: string;
}

/**
 * Paramètres neutres d'un type de mur pour le moteur de vue en plan 2D.
 */
export interface WallTypeFor2D {
  readonly thickness: number;
}

/**
 * Battement d'une porte en vue 2D.
 */
export interface DoorSwingFor2D {
  readonly side: 'left' | 'right';
  readonly direction: 'in' | 'out';
}

/**
 * Paramètres neutres d'une porte pour le tracé en plan 2D.
 */
export interface DoorFor2D {
  readonly id: string;
  readonly kind?: 'door';
  readonly hostWallId: string;
  readonly offsetAlong: number;
  readonly doorTypeId?: string;
  readonly width?: number;
  readonly swing: DoorSwingFor2D;
}

/**
 * Paramètres neutres d'une fenêtre pour le tracé en plan 2D.
 */
export interface WindowFor2D {
  readonly id: string;
  readonly kind?: 'window';
  readonly hostWallId: string;
  readonly offsetAlong: number;
  readonly windowTypeId?: string;
  readonly width?: number;
  readonly sillHeight?: number;
}

/**
 * Union neutre des ouvertures pour le visualiseur 2D.
 */
export type OpeningFor2D =
  ({ readonly kind: 'door' } & DoorFor2D) | ({ readonly kind: 'window' } & WindowFor2D);

/**
 * Paramètres neutres d'un type de dalle pour le tracé 2D.
 */
export interface SlabTypeFor2D {
  readonly id: string;
  readonly name: string;
  readonly thickness: number;
  readonly materialId?: string | undefined;
}

/**
 * Paramètres neutres d'une dalle pour le tracé en plan 2D.
 */
export interface SlabFor2D {
  readonly id: string;
  readonly category?: 'slab' | undefined;
  readonly slabTypeId: string;
  readonly levelId: string;
  readonly boundary: readonly Vec2[];
  readonly holes?: readonly (readonly Vec2[])[] | undefined;
  readonly openings?: readonly (readonly Vec2[])[] | undefined;
  readonly baseOffset?: number | undefined;
  readonly name?: string | undefined;
}

/**
 * Paramètres neutres d'une cotation pour le tracé en plan 2D.
 */
export interface DimensionFor2D {
  readonly id: string;
  readonly category?: 'dimension' | undefined;
  readonly levelId?: string | undefined;
  readonly type: 'linear' | 'aligned';
  readonly references: readonly string[];
  readonly offset: number;
  readonly value: number;
  readonly customLabel?: string | undefined;
}

/**
 * Paramètres neutres d'un type d'escalier pour le tracé 2D (ADR-048).
 */
export interface StairTypeFor2D {
  readonly id: string;
  readonly name?: string;
  readonly width: number;
}

/**
 * Paramètres neutres d'un escalier pour le tracé en plan 2D (ADR-048).
 */
export interface StairFor2D {
  readonly id: string;
  readonly category?: 'stair';
  readonly stairTypeId: string;
  readonly bottomLevelId: string;
  readonly topLevelId: string;
  readonly start: Vec2;
  readonly end: Vec2;
  readonly widthOverride?: number;
  readonly name?: string;
}

/**
 * Familles de toitures supportées en vue 2D (ADR-053).
 */
export type RoofFamilyFor2D = 'flat' | 'gable';

export interface FlatRoofTypeFor2D {
  readonly id: string;
  readonly name: string;
  readonly family: 'flat';
  readonly thickness: number;
}

export interface GableRoofTypeFor2D {
  readonly id: string;
  readonly name: string;
  readonly family: 'gable';
  readonly thickness: number;
  readonly slopeDeg: number;
  readonly overhangMm?: number;
}

export type RoofTypeFor2D = FlatRoofTypeFor2D | GableRoofTypeFor2D;

export interface RoofOpeningFor2D {
  readonly id: string;
  readonly category?: 'roofOpening';
  readonly roofId: string;
  readonly offsetU: number;
  readonly offsetV: number;
  readonly width: number;
  readonly height: number;
}

export interface RoofFor2D {
  readonly id: string;
  readonly category?: 'roof';
  readonly roofTypeId: string;
  readonly levelId: string;
  readonly footprint: readonly Vec2[];
  readonly ridgeAxis?:
    | { readonly start: Vec2; readonly end: Vec2 }
    | readonly [Vec2, Vec2]
    | undefined;
  readonly slopeDegOverride?: number | undefined;
  readonly overhangOverride?: number | undefined;
  readonly baseOffset?: number | undefined;
  readonly name?: string | undefined;
}

/**
 * Paramètres neutres d'un composant d'aménagement ou mobilier pour la vue 2D.
 */
export interface ComponentFor2D {
  readonly id: string;
  readonly category?: 'component';
  readonly typeId: string;
  readonly levelId: string;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly rotation?: number | undefined;
    readonly flipped?: boolean | undefined;
    readonly elevationOffset?: number | undefined;
    readonly hostWallId?: string | undefined;
  };
  readonly widthOverride?: number | undefined;
  readonly depthOverride?: number | undefined;
  readonly heightOverride?: number | undefined;
  readonly showClearanceZone?: boolean | undefined;
  readonly openingId?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * Paramètres neutres d'un type de composant pour la vue 2D.
 */
export interface ComponentTypeFor2D {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly subType: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly defaultElevationOffset?: number | undefined;
  readonly minWidth?: number | undefined;
  readonly maxWidth?: number | undefined;
  readonly minDepth?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly maxHeight?: number | undefined;
  readonly allowedWidths?: readonly number[] | undefined;
  readonly clearanceDepth?: number | undefined;
}

/**
 * Interface structurelle neutre d'un document pour la vue en plan 2D.
 * Permet à View2D de consommer BimDocument sans dépendance directe ni import de @mini-bim/core.
 */
export interface DocumentFor2D {
  getState(): {
    readonly walls: Record<string, WallFor2D>;
    readonly wallTypes: Record<string, WallTypeFor2D>;
    readonly doorTypes?:
      | Record<string, { readonly id: string; readonly width: number; readonly height: number }>
      | undefined;
    readonly windowTypes?:
      | Record<
          string,
          {
            readonly id: string;
            readonly width: number;
            readonly height: number;
            readonly defaultSillHeight?: number;
          }
        >
      | undefined;
    readonly slabTypes?: Record<string, SlabTypeFor2D> | undefined;
    readonly slabs?: Record<string, SlabFor2D> | undefined;
    readonly doors?: Record<string, DoorFor2D> | undefined;
    readonly windows?: Record<string, WindowFor2D> | undefined;
    readonly rooms?:
      | Record<
          string,
          {
            readonly id: string;
            readonly name: string;
            readonly levelId: string;
            readonly seed: Vec2;
          }
        >
      | undefined;
    readonly dimensions?: Record<string, DimensionFor2D> | undefined;
    readonly stairTypes?: Record<string, StairTypeFor2D> | undefined;
    readonly stairs?: Record<string, StairFor2D> | undefined;
    readonly roofTypes?: Record<string, RoofTypeFor2D> | undefined;
    readonly roofs?: Record<string, RoofFor2D> | undefined;
    readonly roofOpenings?: Record<string, RoofOpeningFor2D> | undefined;
    readonly components?: Record<string, ComponentFor2D> | undefined;
    readonly componentTypes?: Record<string, ComponentTypeFor2D> | undefined;
    readonly pipes?: Record<string, PipeFor2D> | undefined;
    readonly ducts?: Record<string, DuctFor2D> | undefined;
    readonly cableTrays?: Record<string, CableTrayFor2D> | undefined;
    readonly mepFittings?: Record<string, MepFittingFor2D> | undefined;
    readonly mepEquipments?: Record<string, MepEquipmentFor2D> | undefined;
    readonly mepConnectors?: Record<string, ConnectorFor2D> | undefined;
    readonly mepSystems?: Record<string, MepSystemFor2D> | undefined;
    readonly levels?: Record<string, { readonly id: string; readonly name: string; readonly elevation: number; readonly height?: number | undefined }> | undefined;
  };
}

// ============================================================================
// Types Neutres MEP 2D (ADR-009 / Phase 9.3.1)
// ============================================================================

export interface Point3DFor2D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PortFor2D {
  readonly id: string;
  readonly elementId: string;
  readonly position: Point3DFor2D;
  readonly direction: Point3DFor2D;
  readonly domain?: string | undefined;
  readonly systemType?: string | undefined;
  readonly shape?: 'round' | 'rectangular' | undefined;
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

export interface ConnectorFor2D {
  readonly id: string;
  readonly portAId: string;
  readonly portBId: string;
  readonly systemId?: string | undefined;
}

export interface MepSystemFor2D {
  readonly id: string;
  readonly name: string;
  readonly domain?: string | undefined;
  readonly systemType?: string | undefined;
  readonly elementIds: readonly string[];
  readonly color?: string | undefined;
}

export interface PipeFor2D {
  readonly id: string;
  readonly category?: 'pipe' | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly start: Point3DFor2D;
  readonly end: Point3DFor2D;
  readonly diameter: number;
  readonly ports?: readonly PortFor2D[] | undefined;
  readonly name?: string | undefined;
}

export interface DuctFor2D {
  readonly id: string;
  readonly category?: 'duct' | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly start: Point3DFor2D;
  readonly end: Point3DFor2D;
  readonly shape: 'round' | 'rectangular';
  readonly diameter?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly ports?: readonly PortFor2D[] | undefined;
  readonly name?: string | undefined;
}

export interface CableTrayFor2D {
  readonly id: string;
  readonly category?: 'cableTray' | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly start: Point3DFor2D;
  readonly end: Point3DFor2D;
  readonly width: number;
  readonly height: number;
  readonly ports?: readonly PortFor2D[] | undefined;
  readonly name?: string | undefined;
}

export interface MepFittingFor2D {
  readonly id: string;
  readonly category?: 'mepFitting' | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly fittingType: 'elbow' | 'tee' | 'cross' | 'transition' | 'cap';
  readonly position: Point3DFor2D;
  readonly ports: readonly PortFor2D[];
  readonly name?: string | undefined;
}

export interface MepEquipmentFor2D {
  readonly id: string;
  readonly category?: 'mepEquipment' | undefined;
  readonly levelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly family?: string | undefined;
  readonly position: Point3DFor2D;
  readonly rotation?: number | undefined;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly ports?: readonly PortFor2D[] | undefined;
  readonly name?: string | undefined;
}

export interface MepRenderConfig {
  readonly mode?: 'single-line' | 'double-line' | undefined;
  readonly defaultColor?: string | undefined;
  readonly systemColors?: Record<string, string> | undefined;
  readonly lineWidth?: number | undefined;
  readonly centerlineDash?: readonly number[] | undefined;
  readonly selectedStrokeColor?: string | undefined;
  readonly selectedStrokeWidth?: number | undefined;
  readonly showOpenPortMarkers?: boolean | undefined;
  readonly openPortMarkerRadius?: number | undefined;
}

/**
 * Pièce architecturale détectée ou déclarée pour l'affichage en plan 2D.
 */
export interface DetectedRoomFor2D {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly polygon: readonly Vec2[];
  readonly holes?: readonly (readonly Vec2[])[] | undefined;
  readonly areaMm2: number;
  readonly perimeterMm?: number | undefined;
  readonly seed: Vec2;
  readonly color?: string | undefined;
  readonly levelId?: string | undefined;
}

/**
 * Diagnostic d'une anomalie de délimitation ou de fermeture d'une pièce.
 */
export interface RoomDiagnosticFor2D {
  readonly roomId: string;
  readonly roomName: string;
  readonly seed: Vec2;
  readonly kind: 'unclosed_boundary' | 'redundant' | 'isolated';
  readonly leakPoint?: Vec2 | undefined;
  readonly leakGap?: {
    readonly start: Vec2;
    readonly end: Vec2;
    readonly distanceMm: number;
  } | undefined;
  readonly message: string;
}

/**
 * Configuration stylistique du rendu des pièces en plan (poché pastel, libellés).
 */
export interface RoomRenderConfig {
  readonly fillColor: string;
  readonly textColor: string;
  readonly subTextColor: string;
  readonly font: string;
  readonly subFont: string;
}

/**
 * Représentation abstraite d'une commande de mutation.
 */
export interface CommandLike {
  readonly name: string;
}

/**
 * Options de configuration pour le système de coordonnées et de transformation 2D.
 */
export interface Transform2DOptions {
  /**
   * Coordonnées du monde (en mm) positionnées au centre logique du viewport.
   * Défaut : { x: 0, y: 0 }.
   */
  readonly origin?: Vec2;

  /**
   * Échelle d'affichage en pixels par millimètre (px/mm).
   * Ex: 0.05 signifie 50 pixels pour 1 000 mm (1 mètre).
   * Défaut : 0.05.
   */
  readonly scale?: number;

  /**
   * Facteur d'échelle minimal autorisé (dézoom maximal).
   * Défaut : 0.001 (1 px pour 1 m).
   */
  readonly minScale?: number;

  /**
   * Facteur d'échelle maximal autorisé (zoom maximal).
   * Défaut : 5.0 (5 000 px pour 1 m).
   */
  readonly maxScale?: number;

  /**
   * Largeur du viewport en pixels.
   * Défaut : 800.
   */
  readonly viewportWidth?: number;

  /**
   * Hauteur du viewport en pixels.
   * Défaut : 600.
   */
  readonly viewportHeight?: number;
}

/**
 * Boîte englobante 2D en coordonnées cartésiennes.
 */
export interface BoundingBox2D {
  readonly min: Vec2;
  readonly max: Vec2;
}

/**
 * Configuration d'affichage de la grille de repérage et des axes du plan.
 */
export interface GridConfig {
  /** Afficher ou masquer la grille */
  readonly show: boolean;
  /** Espacement du maillage principal en mm (défaut : 1000 mm = 1 m) */
  readonly majorStepMm: number;
  /** Espacement du maillage secondaire en mm (défaut : 100 mm = 10 cm) */
  readonly minorStepMm: number;
  /** Couleur des lignes principales */
  readonly majorColor: string;
  /** Couleur des lignes secondaires */
  readonly minorColor: string;
  /** Couleur de l'axe X (Y = 0) */
  readonly axisColorX: string;
  /** Couleur de l'axe Y (X = 0) */
  readonly axisColorY: string;
  /** Seuil minimal en pixels entre deux lignes pour éviter la saturation visuelle */
  readonly minPixelSpacing: number;
}

/**
 * Configuration stylistique du rendu des murs (poché, contour, axe, sélection).
 */
export interface WallRenderConfig {
  /** Couleur de remplissage architectural (poché) du corps du mur */
  readonly fillColor: string;
  /** Couleur du trait de contour d'arête vue/coupée */
  readonly strokeColor: string;
  /** Épaisseur du trait de contour en pixels */
  readonly strokeWidth: number;
  /** Couleur du trait de l'axe central de référence */
  readonly centerlineColor: string;
  /** Épaisseur du trait d'axe en pixels */
  readonly centerlineWidth: number;
  /** Motif pointillé pour l'axe (ex: [6, 4]) */
  readonly centerlineDash: readonly number[];
  /** Couleur de poché quand le mur est sélectionné */
  readonly selectedFillColor: string;
  /** Couleur de contour accentué quand le mur est sélectionné */
  readonly selectedStrokeColor: string;
  /** Épaisseur de contour quand le mur est sélectionné */
  readonly selectedStrokeWidth: number;
}

export interface DimensionRenderConfig {
  readonly lineColor: string;
  readonly textColor: string;
  readonly tickColor: string;
  readonly font: string;
  readonly lineWidth: number;
  readonly tickSize: number;
}

export interface SlabRenderConfig {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly hatchColor: string;
  readonly hatchSpacing: number;
  readonly holeStrokeColor: string;
  readonly selectedStrokeColor: string;
  readonly selectedStrokeWidth: number;
}

export interface UnderlayRenderConfig {
  readonly strokeColor: string;
  readonly lineDash: readonly number[];
  readonly opacity: number;
}

export interface StairRenderConfig {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly stepLineColor: string;
  readonly walklineColor: string;
  readonly walklineWidth: number;
  readonly selectedStrokeColor: string;
  readonly selectedStrokeWidth: number;
}

export interface RoofRenderConfig {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly ridgeColor: string;
  readonly ridgeWidth: number;
  readonly ridgeDash?: readonly number[];
  readonly overhangStrokeColor: string;
  readonly overhangDash?: readonly number[];
  readonly openingStrokeColor: string;
  readonly selectedStrokeColor: string;
  readonly selectedStrokeWidth: number;
}

/**
 * Configuration globale du moteur de rendu 2D.
 */
export interface View2DRenderConfig {
  /** Couleur d'arrière-plan du canvas */
  readonly backgroundColor: string;
  /** Afficher les axes X et Y du repère monde */
  readonly showAxes: boolean;
  /** Configuration de la grille */
  readonly grid: GridConfig;
  /** Configuration de rendu des murs */
  readonly wall: WallRenderConfig;
  /** Configuration de rendu des dalles */
  readonly slab?: SlabRenderConfig;
  /** Configuration de rendu des escaliers */
  readonly stair?: StairRenderConfig;
  /** Configuration de rendu des toitures */
  readonly roof?: RoofRenderConfig;
  /** Configuration de rendu de la vue fantôme */
  readonly underlay?: UnderlayRenderConfig;
  /** Configuration de rendu des pièces */
  readonly room?: RoomRenderConfig;
  /** Configuration de rendu des cotations */
  readonly dimension?: DimensionRenderConfig;
  /** Configuration de rendu des composants d'aménagement et mobilier */
  readonly component?: ComponentRenderConfig;
  /** Configuration de rendu des réseaux et équipements MEP */
  readonly mep?: MepRenderConfig;
}

/**
 * Options d'initialisation du composant View2D.
 */
export interface View2DOptions {
  /** Paramètres initiaux de la matrice de transformation */
  readonly transform?: Transform2DOptions;
  /** Surcharges stylistiques du moteur de rendu */
  readonly renderConfig?: Partial<View2DRenderConfig>;
  /** Filtre d'affichage restreint à un niveau spécifique (ID de Level) */
  readonly activeLevelId?: string | null;
  /** Niveau affiché en vue fantôme underlay (ex: N-1) */
  readonly underlayLevelId?: string | null;
  /**
   * Active la gestion native interne des clics de sélection sur le canvas.
   * Défaut : true. Passer false lorsque les interactions sont déléguées à un Tool externe.
   */
  readonly enableInternalSelection?: boolean;
}

/**
 * Forme géométrique temporaire de prévisualisation (ex: élastique de tracé de mur, boîte de sélection).
 * Coordonnées exprimées dans le repère monde architectural (mm, Y-up).
 */
export type PreviewShape =
  | { readonly kind: 'line'; readonly start: Vec2; readonly end: Vec2 }
  | { readonly kind: 'rect'; readonly min: Vec2; readonly max: Vec2 }
  | { readonly kind: 'polygon'; readonly points: readonly Vec2[] }
  | { readonly kind: 'stair'; readonly start: Vec2; readonly end: Vec2; readonly width?: number }
  | {
      readonly kind: 'roof';
      readonly footprint: readonly Vec2[];
      readonly ridgeAxis?:
        | { readonly start: Vec2; readonly end: Vec2 }
        | readonly [Vec2, Vec2]
        | undefined;
    };

/**
 * Callback invoqué lors de l'émission d'une intention de commande de mutation.
 */
export type CommandCallback = (command: CommandLike) => void;

/**
 * Callback invoqué lors d'un changement de sélection d'éléments.
 */
export type SelectionCallback = (selectedIds: readonly string[]) => void;
