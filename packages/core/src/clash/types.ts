import type { ElementId } from '../types.js';
import type { Vec3, BoundingBox3D } from '@tabax/geometry';

export type { Vec3 };
export type AABB3D = BoundingBox3D;

/**
 * Boîte englobante orientée 3D (Oriented Bounding Box).
 */
export interface OBB3D {
  /**
   * Centre géométrique de l'OBB en coordonnées monde (mm).
   */
  readonly center: Vec3;
  /**
   * Demi-dimensions (half-extents) le long des axes locaux (hx, hy, hz) en mm.
   */
  readonly halfExtents: Vec3;
  /**
   * Axes locaux orthonormés (u: axe X local, v: axe Y local, w: axe Z local).
   * Chaque axe est un vecteur unitaire (|u| = |v| = |w| = 1).
   */
  readonly axes: readonly [Vec3, Vec3, Vec3];
}

/**
 * Cylindre 3D défini par un segment médian et un rayon (pour tuyaux et gaines circulaires).
 */
export interface Cylinder3D {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly radius: number;
}

/**
 * Primitives géométriques 3D englobantes pour les calculs de narrow-phase.
 */
export type Primitive3D =
  | { readonly kind: 'obb'; readonly obb: OBB3D; readonly aabb: AABB3D }
  | { readonly kind: 'cylinder'; readonly cylinder: Cylinder3D; readonly aabb: AABB3D };

/**
 * Sévérité du conflit géométrique détecté.
 * - hard : interpénétration de volumes solides supérieure au seuil de tolérance (ex. > 2 mm).
 * - clearance : violation de l'enveloppe de garde ou de dégagement technique (ex. 25 mm).
 */
export type ClashSeverity = 'hard' | 'clearance';

/**
 * Discipline métier de l'élément BIM.
 */
export type ClashDiscipline = 'architecture' | 'structure' | 'mep';

/**
 * Catégorie d'élément BIM participant à la détection de conflits.
 */
export type ClashCategory =
  | 'wall'
  | 'slab'
  | 'door'
  | 'window'
  | 'stair'
  | 'roof'
  | 'component'
  | 'pipe'
  | 'duct'
  | 'cableTray'
  | 'mepFitting'
  | 'mepEquipment';

/**
 * Statut sémantique de qualification de l'interférence.
 */
export type ClashClassification =
  | 'HARD_CLASH'
  | 'SOFT_CLASH'
  | 'CLEARANCE'
  | 'LEGITIMATE_CONTACT'
  | 'IGNORED';

/**
 * Contrat de données d'un conflit géométrique qualifié (ClashResult).
 */
export interface ClashResult {
  /**
   * Identifiant déterministe unique : `min(idA, idB)_max(idA, idB)_severity`.
   */
  readonly id: string;
  readonly elementA: ElementId;
  readonly elementB: ElementId;
  readonly categoryA: ClashCategory;
  readonly categoryB: ClashCategory;
  readonly disciplineA: ClashDiscipline;
  readonly disciplineB: ClashDiscipline;
  readonly severity: ClashSeverity;
  /**
   * Profondeur maximale de pénétration estimée (en mm).
   */
  readonly penetrationDepthMm: number;
  /**
   * Boîte englobante 3D (AABB) de la zone d'interpénétration.
   */
  readonly intersectionBox: AABB3D;
  /**
   * Point central estimé du conflit géométrique (coordonnées monde en mm).
   */
  readonly point: Vec3;
  /**
   * Description explicite du conflit pour l'opérateur BIM.
   */
  readonly description: string;
}

/**
 * Options de configuration pour le moteur de détection de clashs.
 */
export interface ClashDetectionOptions {
  /**
   * Tolérance physique minimale en mm sous laquelle un contact n'est pas un clash solide.
   * Par défaut : 2.0 mm.
   */
  readonly hardToleranceMm?: number | undefined;
  /**
   * Distance de garde / dégagement en mm pour la détection de type 'clearance'.
   * Par défaut : 25.0 mm.
   */
  readonly clearanceDistanceMm?: number | undefined;
  /**
   * Activer la recherche des violations d'enveloppe de dégagement ('clearance').
   * Par défaut : false.
   */
  readonly checkClearance?: boolean | undefined;
  /**
   * Paires de disciplines à vérifier. Si omis, toutes les interactions sont vérifiées.
   * Ex. [['mep', 'structure'], ['mep', 'architecture']].
   */
  readonly disciplinePairs?: readonly (readonly [ClashDiscipline, ClashDiscipline])[] | undefined;
  /**
   * Filtre optionnel pour restreindre la détection à un sous-ensemble d'identifiants.
   */
  readonly filterElementIds?: readonly ElementId[] | undefined;
}

/**
 * Élément indexé dans l'index spatial 3D.
 */
export interface SpatialItem<T = ElementId> {
  readonly id: string;
  readonly aabb: AABB3D;
  readonly data: T;
}

/**
 * Métriques de performance de l'arbre BVH.
 */
export interface BVHStats {
  readonly totalNodes: number;
  readonly leafNodes: number;
  readonly maxDepth: number;
  readonly itemCount: number;
}
