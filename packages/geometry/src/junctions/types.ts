import { type Vec2 } from '../vec2.js';
import { type LocationLine } from '../wall-geometry.js';

/**
 * Extrémité d'un mur paramétrique.
 */
export type WallEnd = 'start' | 'end';

/**
 * Référence à une extrémité spécifique d'un mur donné.
 */
export interface WallEndRef {
  readonly wallId: string;
  readonly end: WallEnd;
}

/**
 * Description d'un mur en entrée du moteur de jonctions.
 */
export interface WallInput {
  /**
   * Identifiant stable unique du mur.
   */
  readonly id: string;

  /**
   * Point de départ de l'axe de référence (mm).
   */
  readonly start: Vec2;

  /**
   * Point d'arrivée de l'axe de référence (mm).
   */
  readonly end: Vec2;

  /**
   * Épaisseur nominale du mur (mm > 0).
   */
  readonly thickness: number;

  /**
   * Justification de l'axe par rapport à l'épaisseur ('center' | 'exterior' | 'interior').
   */
  readonly locationLine: LocationLine;

  /**
   * Priorité constructive (entier, par défaut 0).
   * Un mur de priorité plus élevée traverse ou impose sa découpe aux murs de priorité inférieure
   * (ex: mur porteur priorité 100 > cloison priorité 10).
   */
  readonly priority?: number;
}

/**
 * Types de jonctions reconnus et résolus par le moteur.
 */
export type JunctionType =
  | 'none' // Bout libre (cap droit orthogonal)
  | 'L' // Angle à 2 murs se rejoignant par leurs extrémités
  | 'T' // Mur secondaire aboutant sur la face d'un mur traversant
  | 'X' // Croisement de deux murs sécants
  | 'collinear' // Deux murs alignés (aboutés ou superposés)
  | 'multi'; // Étoile à 3 murs ou plus au même nœud

/**
 * Informations sur une jonction détectée entre murs.
 */
export interface DetectedJunction {
  readonly id: string;
  readonly type: JunctionType;
  /**
   * Point central nominal de la jonction (point de convergence des axes).
   */
  readonly point: Vec2;
  /**
   * Identifiants des murs participant à la jonction.
   */
  readonly wallIds: readonly string[];
  /**
   * Détails additionnels spécifiques au type de jonction.
   */
  readonly details?: Record<string, unknown>;
}

/**
 * Mur résolu géométriquement avec son emprise finale après résolution des jonctions.
 */
export interface ResolvedWall {
  /**
   * Identifiant du mur source (ou dérivé en cas de scission X).
   */
  readonly id: string;

  /**
   * Identifiant du mur d'origine (utile si un mur a été scindé en 2 branches lors d'un X).
   */
  readonly originalWallId: string;

  /**
   * Polygone d'emprise final résolu, ordonné en sens anti-horaire (CCW).
   * Sans aucun trou ni superposition géométrique.
   */
  readonly polygon: readonly Vec2[];

  /**
   * Aire 2D exacte de l'emprise résolue (mm²).
   */
  readonly area: number;

  /**
   * Axe de référence (start -> end).
   */
  readonly start: Vec2;
  readonly end: Vec2;

  /**
   * Épaisseur nominale (mm).
   */
  readonly thickness: number;

  /**
   * Ligne de référence utilisée.
   */
  readonly locationLine: LocationLine;
}

/**
 * Résultat complet retourné par le moteur de jonctions.
 */
export interface JunctionSolution {
  /**
   * Liste des murs résolus avec leurs polygones finaux.
   */
  readonly walls: readonly ResolvedWall[];

  /**
   * Liste des jonctions identifiées et traitées.
   */
  readonly junctions: readonly DetectedJunction[];

  /**
   * Aire totale cumulée de tous les murs résolus (mm²).
   */
  readonly totalArea: number;
}
