import { type Vec2 } from '@mini-bim/geometry';
import { type Command } from '@mini-bim/core';

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
}

/**
 * Callback invoqué lors de l'émission d'une intention de commande de mutation.
 */
export type CommandCallback = (command: Command) => void;

/**
 * Callback invoqué lors d'un changement de sélection d'éléments.
 */
export type SelectionCallback = (selectedIds: readonly string[]) => void;
