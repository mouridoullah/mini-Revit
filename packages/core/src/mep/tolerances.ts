/**
 * @tabax/core/mep/tolerances
 *
 * Tolérances numériques et géométriques centralisées pour les réseaux techniques MEP.
 * Évite toute disparité de seuils et les bruits d'arrondi machine IEEE 754 float64.
 */

export const MEP_TOLERANCES = {
  /**
   * Tolérance maximale de distance spatiale (en mm) pour considérer deux ports comme coïncidents.
   * Conforme à la tolérance topologique applicative VERTEX_MERGE_TOLERANCE (ADR-010).
   */
  POSITION_MM: 1.0,

  /**
   * Tolérance angulaire maximale (en radians) pour valider l'alignement anti-parallèle de deux ports.
   * Deux ports face-à-face ont des vecteurs normaux opposés : u · v ≈ -1.0.
   * 0.05 rad ≈ 2.86 degrés.
   */
  ANGLE_RAD: 0.05,

  /**
   * Tolérance maximale (en mm) sur les diamètres nominaux ou dimensions de section (largeur / hauteur).
   */
  DIMENSION_MM: 0.5,

  /**
   * Tolérance sur le calcul de pente relative hydraulique.
   */
  SLOPE_PERCENT: 0.001,
} as const;
