/**
 * Configuration et seuils de tolérance numérique du moteur géométrique Mini-BIM.
 *
 * Tous les calculs s'effectuent en coordonnées continues IEEE 754 float64 (millimètres).
 */
export const GEOM_CONFIG = {
  /**
   * Seuil de zéro machine / calculatoire (adimensionnel).
   * Utilisé pour la détection de déterminants nuls, vecteurs directeurs nuls,
   * divisions par zéro et vérifications de normalisation.
   */
  EPSILON_NUMERICAL: 1e-9,

  /**
   * Seuil de coïncidence géométrique continue (en millimètres).
   * 1e-4 mm = 0.1 micron (100 nm).
   * Situé largement au-dessus du bruit d'arrondi flottant (~1e-10 mm à l'échelle métrique)
   * et 1000 fois plus fin que la tolérance de construction (0.1 mm).
   */
  EPSILON_DISTANCE: 1e-4,

  /**
   * Carré du seuil de distance (pour comparaisons de distances au carré sans racine).
   */
  EPSILON_DISTANCE_SQUARED: 1e-8,

  /**
   * Seuil angulaire pour tester le parallélisme et la colinéarité (en radians).
   * 1e-6 rad ≈ 0.000057°
   */
  EPSILON_COLLINEAR: 1e-6,

  /**
   * Tolérance par défaut de capture et de fusion topologique des extrémités de murs (mm).
   */
  VERTEX_MERGE_TOLERANCE: 1.0,

  /**
   * Ratio de limite d'onglet par défaut (miter limit).
   * Si la distance du coin dépasse miterLimitRatio * épaisseur, le coin est biseauté.
   */
  MITER_LIMIT_RATIO: 4.0,

  /**
   * Longueur minimale autorisée pour un segment ou un mur (en mm).
   */
  MIN_SEGMENT_LENGTH: 50.0,
} as const;
