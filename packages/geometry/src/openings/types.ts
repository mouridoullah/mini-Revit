import { type Vec2 } from '../vec2.js';

export type OpeningKind = 'window' | 'door';

export type DoorSwingSide = 'left' | 'right';
export type DoorSwingDirection = 'in' | 'out';

export interface DoorSwing {
  readonly side: DoorSwingSide;
  readonly direction: DoorSwingDirection;
}

/**
 * Données d'entrée d'une ouverture paramétrique (porte ou fenêtre).
 *
 * Toutes les coordonnées et dimensions sont en millimètres (float64) dans le repère local du mur hôte.
 */
export interface OpeningInput {
  readonly id: string;
  readonly hostWallId: string;
  /**
   * Position du centre de l'ouverture le long de l'axe de référence du mur hôte (mm),
   * mesurée depuis wall.start (u = 0) vers wall.end (u = L).
   */
  readonly u: number;
  /**
   * Largeur nominale de la baie le long du mur (mm). W > 0.
   */
  readonly width: number;
  /**
   * Hauteur nominale de la baie (mm). H > 0.
   */
  readonly height: number;
  /**
   * Hauteur d'allège mesurée depuis la base du mur (mm).
   * sillZ >= 0. Pour une porte standard sans seuil, sillZ = 0.
   */
  readonly sillZ: number;
  /**
   * Nature de l'ouverture : fenêtre ou porte.
   */
  readonly kind: OpeningKind;
  /**
   * Configuration de battement (uniquement pour les portes).
   */
  readonly swing?: DoorSwing;
}

/**
 * Rôle architectural d'une tranche de mur après percement.
 */
export type WallPieceRole = 'full' | 'sill' | 'lintel' | 'void';

/**
 * Morceau élémentaire de mur résultant de la partition 2.5D.
 *
 * Prêt pour l'extrusion 3D ou l'affichage en plan 2D.
 */
export interface WallPiece {
  readonly id: string;
  readonly wallId: string;
  /**
   * Contour 2D en coordonnées absolues mondes (orienté CCW).
   */
  readonly poly2D: readonly Vec2[];
  /**
   * Altitude inférieure de la tranche (mm, Z-up).
   */
  readonly z0: number;
  /**
   * Altitude supérieure de la tranche (mm, Z-up).
   */
  readonly z1: number;
  /**
   * Rôle géométrique et sémantique.
   */
  readonly role: WallPieceRole;
  /**
   * Identifiant de l'ouverture associée si role in ('sill', 'lintel', 'void').
   */
  readonly openingId?: string | undefined;
  /**
   * Aire 2D du contour polygonal (mm²).
   */
  readonly area2D: number;
  /**
   * Intervalle longitudinal paramétrique [uStart, uEnd] le long de l'axe du mur hôte.
   */
  readonly uInterval: readonly [number, number];
}

/**
 * Codes d'erreurs de validation d'ouverture.
 */
export type OpeningErrorCode =
  | 'INVALID_DIMENSIONS'
  | 'SEVERS_WALL'
  | 'OUT_OF_WALL_BOUNDS'
  | 'OPENING_OVERLAP'
  | 'OPENING_CLEARANCE_BETWEEN'
  | 'HEIGHT_EXCEEDS_WALL';

export interface OpeningValidationIssue {
  readonly code: OpeningErrorCode;
  readonly message: string;
  readonly openingId?: string | undefined;
  readonly openingIds?: readonly string[];
}
