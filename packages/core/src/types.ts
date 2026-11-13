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
 * État documentaire immuable complet du projet Mini-BIM.
 * Normalisé sous forme de dictionnaires indexés par ElementId.
 */
export interface BimState {
  readonly schemaVersion: 1;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly walls: Record<ElementId, Wall>;
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
