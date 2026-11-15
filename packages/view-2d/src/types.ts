import { type Vec2 } from '@mini-bim/geometry';

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
  };
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
  /** Configuration de rendu des pièces */
  readonly room?: RoomRenderConfig;
  /** Configuration de rendu des cotations */
  readonly dimension?: DimensionRenderConfig;
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
  | { readonly kind: 'polygon'; readonly points: readonly Vec2[] };

/**
 * Callback invoqué lors de l'émission d'une intention de commande de mutation.
 */
export type CommandCallback = (command: CommandLike) => void;

/**
 * Callback invoqué lors d'un changement de sélection d'éléments.
 */
export type SelectionCallback = (selectedIds: readonly string[]) => void;
