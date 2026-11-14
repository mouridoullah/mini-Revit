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
  readonly width: number; // en mm (> 0)
  readonly height: number; // en mm (> 0)
}

/**
 * Entité porte architecturale hébergée par un mur.
 */
export interface Door extends OpeningBase {
  readonly category: 'door';
  readonly kind: 'door';
  readonly swing: DoorSwing;
}

/**
 * Entité fenêtre architecturale hébergée par un mur avec hauteur d'allège paramétrique.
 */
export interface Window extends OpeningBase {
  readonly category: 'window';
  readonly kind: 'window';
  readonly sillHeight: number; // Hauteur d'allège en mm (>= 0 depuis la base du mur)
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
}

/**
 * État documentaire immuable complet du projet Mini-BIM.
 * Normalisé sous forme de dictionnaires indexés par ElementId.
 */
export interface BimState {
  readonly schemaVersion: 1;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly walls: Record<ElementId, Wall>;
  readonly doors: Record<ElementId, Door>;
  readonly windows: Record<ElementId, Window>;
  readonly rooms: Record<ElementId, Room>;
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
