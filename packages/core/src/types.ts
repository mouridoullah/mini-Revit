import { type Vec2 } from '@mini-bim/geometry';
import { type Patch } from 'immer';

/**
 * Identifiant unique universel pour tout élément architectural ou de métadonnée.
 * Encodé en ULID (Crockford base32, 26 caractères, triable chronologiquement).
 */
export type ElementId = string;

/**
 * Niveau architectural de référence (élévation altimétrique).
 */
export interface Level {
  readonly id: ElementId;
  readonly name: string;
  readonly elevation: number; // en mm (altimétrie Z)
  readonly height?: number; // hauteur nominale sous plafond en mm (> 0)
}

/**
 * Couche élémentaire constitutive d'une paroi multicouche.
 */
export interface Layer {
  readonly materialId?: string;
  readonly thickness: number; // en mm (> 0)
}

/**
 * Type paramétrique partagé définissant la famille d'un mur (épaisseur, composition, hauteur type).
 */
export interface WallType {
  readonly id: ElementId;
  readonly name: string;
  readonly thickness: number; // en mm (> 0)
  readonly height: number; // hauteur nominale en mm (> 0)
  readonly layers?: readonly Layer[];
  readonly isExternal?: boolean; // Sémantique métier BIM : mur extérieur / de façade (défaut: true si thickness >= 200)
  readonly loadBearing?: boolean; // Portance structurelle (défaut: true)
}

/**
 * Contrainte d'élévation supérieure d'un mur (ADR-040 / ADR-045 / ADR-053).
 * Discriminated union liant un mur soit à un niveau d'étage, soit à une toiture.
 */
export type TopConstraint =
  | {
      readonly kind?: 'level';
      readonly levelId: ElementId;
      readonly offset?: number; // décalage en mm (défaut: 0)
      readonly topOffset?: number; // alias pour compatibilité
    }
  | {
      readonly kind: 'roof';
      readonly roofId?: ElementId;
      readonly levelId?: undefined;
      readonly offset?: number; // décalage en mm (défaut: 0)
      readonly topOffset?: number; // alias pour compatibilité
    };

export type WallTopConstraint = TopConstraint;

/**
 * Instance d'un mur linéaire placé dans le projet.
 */
export interface Wall {
  readonly id: ElementId;
  readonly category: 'wall';
  readonly typeId: ElementId;
  readonly levelId: ElementId;
  readonly start: Vec2; // Coordonnées 2D en mm
  readonly end: Vec2; // Coordonnées 2D en mm
  readonly baseOffset?: number | undefined; // Décalage vertical par rapport au niveau en mm
  readonly heightOverride?: number | undefined; // Surcharge optionnelle de la hauteur du type en mm
  readonly topConstraint?: TopConstraint | undefined; // Contrainte altimétrique supérieure
  readonly isExternal?: boolean | undefined; // Surcharge d'instance optionnelle
  readonly loadBearing?: boolean | undefined; // Surcharge d'instance optionnelle
}

/**
 * Famille paramétrique d'une dalle horizontale (ADR-042).
 */
export interface SlabType {
  readonly id: ElementId;
  readonly name: string;
  readonly thickness: number; // en mm (> 0, >= 50 mm)
  readonly materialId?: string;
}

/**
 * Instance d'une dalle horizontale (ADR-035 / ADR-042).
 */
export interface Slab {
  readonly id: ElementId;
  readonly category: 'slab';
  readonly slabTypeId: ElementId;
  readonly levelId: ElementId;
  readonly boundary: readonly Vec2[]; // CCW
  readonly holes?: readonly (readonly Vec2[])[] | undefined; // CW (réservations manuelles uniquement)
  readonly openings?: readonly (readonly Vec2[])[] | undefined; // Trémies géométriques traversantes
  readonly baseOffset?: number | undefined; // décalage vertical par rapport au niveau (<= 0 standard)
  readonly name?: string | undefined;
}

/**
 * Famille paramétrique d'une porte (ADR-042).
 */
export interface DoorType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // en mm (> 0)
  readonly height: number; // en mm (> 0)
}

/**
 * Famille paramétrique d'une fenêtre (ADR-042).
 */
export interface WindowType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // en mm (> 0)
  readonly height: number; // en mm (> 0)
  readonly defaultSillHeight: number; // en mm (>= 0)
}

/**
 * Côté d'ouverture d'une porte (battement).
 */
export type DoorSwingSide = 'left' | 'right';

/**
 * Direction d'ouverture d'une porte (intérieur / extérieur).
 */
export type DoorSwingDirection = 'in' | 'out';

/**
 * Spécification du sens de battement d'une porte.
 */
export interface DoorSwing {
  readonly side: DoorSwingSide;
  readonly direction: DoorSwingDirection;
}

/**
 * Base abstraite d'une ouverture paramétrique hébergée par un mur linéaire.
 * L'axe longitudinal du mur hôte définit le repère 1D paramétrique.
 */
export interface OpeningBase {
  readonly id: ElementId;
  readonly hostWallId: ElementId;
  /**
   * Distance en millimètres le long de la ligne de référence du mur hôte,
   * mesurée depuis wall.start vers wall.end jusqu'au début de l'ouverture.
   */
  readonly offsetAlong: number;
}

/**
 * Entité porte architecturale hébergée par un mur (Schéma v2 / ADR-042).
 * Les dimensions (width, height) sont portées par son DoorType.
 */
export interface Door extends OpeningBase {
  readonly category: 'door';
  readonly doorTypeId: ElementId;
  readonly swing: DoorSwing;
}

/**
 * Entité fenêtre architecturale hébergée par un mur (Schéma v2 / ADR-042).
 * Les dimensions (width, height) sont portées par son WindowType.
 */
export interface Window extends OpeningBase {
  readonly category: 'window';
  readonly windowTypeId: ElementId;
  readonly sillHeight: number; // Hauteur d'allège propre à l'instance en mm (>= 0)
}

/**
 * Modèle V1 transitoire d'une porte pour la migration.
 */
export interface V1Door {
  readonly id: ElementId;
  readonly category: 'door';
  readonly kind?: 'door';
  readonly hostWallId: ElementId;
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly swing: DoorSwing;
}

/**
 * Modèle V1 transitoire d'une fenêtre pour la migration.
 */
export interface V1Window {
  readonly id: ElementId;
  readonly category: 'window';
  readonly kind?: 'window';
  readonly hostWallId: ElementId;
  readonly offsetAlong: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
}

/**
 * Type union pour toute ouverture architecturale hébergée.
 */
export type Opening = Door | Window;

/**
 * Entité pièce architecturale (Room) - Élément sémantique dérivé.
 * La géométrie (contour, surface, périmètre) est recalculée à la demande
 * à partir de l'union des murs du niveau et du point de repère (seed).
 */
export interface Room {
  readonly id: ElementId;
  readonly category: 'room';
  readonly levelId: ElementId;
  readonly seed: Vec2; // point de repère pour associer le trou au Room
  readonly name: string; // "Séjour", "Chambre 1", etc.
  readonly status?: 'enclosed' | 'unenclosed';
  readonly area?: number;
}

/**
 * Type de cotation architecturale 2D.
 */
export type DimensionType = 'linear' | 'aligned';

/**
 * Entité de cotation associative 2D (Dimension).
 * Rattachée à un niveau, elle référence un ou deux éléments architecturaux (murs)
 * et recalcule automatiquement sa valeur lors de tout déplacement paramétrique.
 */
export interface Dimension {
  readonly id: ElementId;
  readonly category: 'dimension';
  readonly levelId: ElementId;
  readonly type: DimensionType;
  readonly references: readonly ElementId[]; // [wallId] (longueur) ou [wallId1, wallId2] (distance)
  readonly offset: number; // distance de décalage perpendiculaire de la ligne de cote en mm
  readonly value: number; // valeur calculée/recalculée en mm
  readonly customLabel?: string;
}

/**
 * Type constructif d'escalier paramétrique (Famille BIM, ADR-048).
 */
export interface StairType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // Largeur nominale de volée en mm (> 0, défaut: 900)
  readonly materialId?: string;
}

/**
 * Entité escalier droit paramétrique unissant deux niveaux consécutifs (ADR-048).
 */
export interface Stair {
  readonly id: ElementId;
  readonly category: 'stair';
  readonly stairTypeId: ElementId;
  readonly bottomLevelId: ElementId;
  readonly topLevelId: ElementId;
  readonly start: Vec2; // Pied de l'escalier (coordonnées monde 2D mm)
  readonly end: Vec2; // Tête d'arrivée de l'escalier (coordonnées monde 2D mm)
  readonly widthOverride?: number; // Surcharge locale optionnelle de la largeur
  readonly name?: string;
}

export type RoofFamily = 'flat' | 'gable';

export interface BaseRoofType {
  readonly id: ElementId;
  readonly name: string;
  readonly category: 'roofType';
  readonly thickness: number; // épaisseur de toiture en mm (>= 100)
  readonly materialId?: string;
}

export interface FlatRoofType extends BaseRoofType {
  readonly family: 'flat';
  readonly acrotereHeight?: number; // hauteur d'acrotère en mm
}

export interface GableRoofType extends BaseRoofType {
  readonly family: 'gable';
  readonly slopeDeg: number; // pente en degrés (5° à 60°)
  readonly overhangMm: number; // débord de toit en mm (0 à 1500)
}

/**
 * Famille paramétrique d'une toiture (ADR-053 [D1]).
 * Discriminated union selon la famille constructive (toit plat ou toit à 2 versants).
 */
export type RoofType = FlatRoofType | GableRoofType;

/**
 * Instance d'une toiture posée sur le bâtiment (ADR-053 [D1]).
 */
export interface Roof {
  readonly id: ElementId;
  readonly category: 'roof';
  readonly roofTypeId: ElementId;
  readonly levelId: ElementId; // niveau de référence d'assise
  readonly footprint: readonly Vec2[]; // empreinte fermée des murs d'appui (CCW)
  readonly baseOffset?: number; // décalage altimétrique vs niveau (défaut: 0)
  readonly ridgeAxis?: { readonly start: Vec2; readonly end: Vec2 }; // requis si family === 'gable'
  readonly slopeOverrideDeg?: number; // surcharge optionnelle de pente
  readonly overhangOverrideMm?: number; // surcharge optionnelle de débord
  readonly name?: string;
}

/**
 * Ouverture / trémie de toiture (lucarne, fenêtre de toit, conduit) (ADR-053 [D4]).
 */
export interface RoofOpening {
  readonly id: ElementId;
  readonly category: 'roofOpening';
  readonly roofId: ElementId;
  readonly offsetU: number; // abscisse locale
  readonly offsetV: number; // ordonnée locale
  readonly width: number;
  readonly height: number;
}

/**
 * État documentaire immuable complet du projet Mini-BIM (Schéma v2 / Saison 2).
 * Normalisé sous forme de dictionnaires indexés par ElementId.
 */
export interface BimState {
  readonly schemaVersion: 2;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly slabTypes: Record<ElementId, SlabType>;
  readonly doorTypes: Record<ElementId, DoorType>;
  readonly windowTypes: Record<ElementId, WindowType>;
  readonly stairTypes?: Record<ElementId, StairType>;
  readonly roofTypes?: Record<ElementId, RoofType>;
  readonly walls: Record<ElementId, Wall>;
  readonly slabs: Record<ElementId, Slab>;
  readonly doors: Record<ElementId, Door>;
  readonly windows: Record<ElementId, Window>;
  readonly rooms: Record<ElementId, Room>;
  readonly dimensions: Record<ElementId, Dimension>;
  readonly stairs?: Record<ElementId, Stair>;
  readonly roofs?: Record<ElementId, Roof>;
  readonly roofOpenings?: Record<ElementId, RoofOpening>;
}

/**
 * Modèle V1 de l'état documentaire pour la rétrocompatibilité et la migration.
 */
export interface V1BimState {
  readonly schemaVersion?: 1;
  readonly units?: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly walls: Record<ElementId, Wall>;
  readonly doors: Record<ElementId, V1Door>;
  readonly windows: Record<ElementId, V1Window>;
  readonly rooms: Record<ElementId, Room>;
  readonly dimensions?: Record<ElementId, Dimension>;
}

/**
 * Résultat de l'exécution d'une commande transactionnelle.
 */
export interface CommandResult {
  readonly changed: readonly ElementId[];
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

/**
 * Écouteur d'événements notifié lors des mutations d'état du document.
 */
export type DocumentListener = (changed: readonly ElementId[]) => void;
