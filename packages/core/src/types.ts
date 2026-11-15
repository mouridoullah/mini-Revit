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
}

/**
 * Contrainte d'élévation supérieure d'un mur (ADR-040 / ADR-045).
 */
export interface TopConstraint {
  readonly levelId: ElementId;
  readonly offset?: number; // décalage en mm (défaut: 0)
}

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
  readonly baseOffset?: number; // Décalage vertical par rapport au niveau en mm
  readonly heightOverride?: number; // Surcharge optionnelle de la hauteur du type en mm
  readonly topConstraint?: TopConstraint; // Contrainte altimétrique supérieure
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
  readonly holes?: readonly (readonly Vec2[])[]; // CW (réservations manuelles uniquement)
  readonly openings?: readonly (readonly Vec2[])[]; // Trémies géométriques traversantes
  readonly baseOffset?: number; // décalage vertical par rapport au niveau (<= 0 standard)
  readonly name?: string;
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
  readonly kind?: 'door';
  readonly doorTypeId: ElementId;
  readonly swing: DoorSwing;
  /** Largeur transitoire optionnelle pour compatibilité ascendante */
  readonly width?: number;
  /** Hauteur transitoire optionnelle pour compatibilité ascendante */
  readonly height?: number;
}

/**
 * Entité fenêtre architecturale hébergée par un mur (Schéma v2 / ADR-042).
 * Les dimensions (width, height) sont portées par son WindowType.
 */
export interface Window extends OpeningBase {
  readonly category: 'window';
  readonly kind?: 'window';
  readonly windowTypeId: ElementId;
  readonly sillHeight: number; // Hauteur d'allège propre à l'instance en mm (>= 0)
  /** Largeur transitoire optionnelle pour compatibilité ascendante */
  readonly width?: number;
  /** Hauteur transitoire optionnelle pour compatibilité ascendante */
  readonly height?: number;
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
  readonly walls: Record<ElementId, Wall>;
  readonly slabs: Record<ElementId, Slab>;
  readonly doors: Record<ElementId, Door>;
  readonly windows: Record<ElementId, Window>;
  readonly rooms: Record<ElementId, Room>;
  readonly dimensions: Record<ElementId, Dimension>;
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
