/**
 * @tabax/core/mep/types
 *
 * Définition du modèle de données sémantique et topologique des réseaux techniques MEP
 * (Mechanical, Electrical & Plumbing - Génie climatique, plomberie et courants techniques).
 *
 * Conforme à l'ADR-009 (Extensibilité par registre) et aux normes buildingSMART IFC4.
 */

import type { ElementId } from '../types.js';

/**
 * Coordonnées spatiales 3D absolues en millimètres (système cartésien main droite Z-up).
 */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Vecteur spatial 3D normalisé ou orienté.
 */
export interface Vector3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Grands domaines du génie technique du bâtiment (MEP).
 */
export type MepDomain = 'plumbing' | 'hvac' | 'hydronic' | 'electrical';

/**
 * Sous-systèmes fluides de plomberie sanitaire.
 */
export type PlumbingSystemType =
  | 'domestic_cold_water' // Eau froide sanitaire (EF)
  | 'domestic_hot_water' // Eau chaude sanitaire (ECS)
  | 'drainage_waste' // Eaux usées ménagères (EU)
  | 'drainage_soil'; // Eaux vannes / noires (EV)

/**
 * Sous-systèmes aérauliques de ventilation / climatisation.
 */
export type HvacSystemType =
  | 'supply_air' // Air soufflé / air neuf
  | 'return_air' // Air repris
  | 'exhaust_air'; // Air rejeté / extraction viciée

/**
 * Sous-systèmes hydroniques de génie climatique (eau comme caloporteur).
 */
export type HydronicSystemType =
  | 'hydronic_supply' // Départ eau chaude / eau glacée
  | 'hydronic_return'; // Retour eau mitigée / réchauffée

/**
 * Sous-systèmes électriques et de communication.
 */
export type ElectricalSystemType =
  | 'power' // Courants forts (énergie, distribution)
  | 'telecom'; // Courants faibles (VDI, SSI, GTB)

/**
 * Union discriminée exhaustive de tous les types de fluides et services techniques.
 */
export type MepSystemType =
  | PlumbingSystemType
  | HvacSystemType
  | HydronicSystemType
  | ElectricalSystemType;

/**
 * Forme géométrique de la section transversale d'un port ou d'un conduit.
 */
export type PortShape = 'round' | 'rectangular';

/**
 * Sens d'écoulement théorique du fluide au travers d'un port.
 */
export type FlowDirection = 'in' | 'out' | 'bidirectional';

/**
 * Contrat sémantique et géométrique d'un point de raccordement physique (Port).
 * Appartient exclusivement à un équipement, un accessoire ou un segment de conduit.
 */
export interface Port {
  /** Identifiant unique et stable du port (ULID) */
  readonly id: ElementId;
  /** Identifiant de l'élément porteur propriétaire (tuyau, gaine, raccord, équipement) */
  readonly elementId: ElementId;
  /** Position géométrique 3D du centre du port en coordonnées absolues (mm) */
  readonly position: Point3D;
  /** Vecteur normal unitaire sortant normalisé (direction d'accostage vers l'extérieur) */
  readonly direction: Vector3D;
  /** Domaine technique du port */
  readonly domain: MepDomain;
  /** Nature du fluide ou du service véhiculé */
  readonly systemType: MepSystemType;
  /** Forme de section de raccordement */
  readonly shape: PortShape;
  /** Diamètre nominal extérieur en mm (requis si shape === 'round') */
  readonly diameter?: number | undefined;
  /** Largeur de section en mm (requis si shape === 'rectangular') */
  readonly width?: number | undefined;
  /** Hauteur de section en mm (requis si shape === 'rectangular') */
  readonly height?: number | undefined;
  /** Sens nominal de transit du flux */
  readonly flowDirection?: FlowDirection | undefined;
  /** Désignation ou repère fonctionnel (ex: 'EF-ENTREE', 'AIR-SOUFFLAGE-1') */
  readonly label?: string | undefined;
}

/**
 * Relation topologique effective unissant deux ports physiques distincts et compatibles (Connector).
 * Matérialise le joint étanche ou la continuité physique du réseau.
 */
export interface Connector {
  readonly id: ElementId;
  readonly category: 'mepConnector';
  readonly portAId: ElementId;
  readonly portBId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly name?: string | undefined;
}

/**
 * Système ou réseau technique regroupant un ensemble cohérent d'éléments et de connexions
 * partageant une fonction fluide unifiée (ex: "Réseau Distribution Eau Chaude Sanitaire RDC").
 */
export interface MepSystem {
  readonly id: ElementId;
  readonly category: 'mepSystem';
  readonly name: string;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly elementIds: readonly ElementId[];
  readonly color?: string | undefined; // Code couleur hexadécimal indicatif pour l'affichage (ex: '#0055ff')
}

/**
 * Segment rectiligne de tuyauterie hydraulique (plomberie, chauffage, fluide caloporteur).
 */
export interface Pipe {
  readonly id: ElementId;
  readonly category: 'pipe';
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly diameter: number; // Diamètre nominal en mm (> 0)
  readonly thickness?: number | undefined; // Épaisseur de paroi en mm
  readonly material?: string | undefined; // Cuivre, Acier, PER, Multicouche, PVC
  readonly slope?: number | undefined; // Pente hydraulique en m/m ou %
  readonly ports: readonly Port[]; // Exactement 2 ports : index 0 (début), index 1 (fin)
  readonly name?: string | undefined;
}

/**
 * Segment rectiligne de gaine aéraulique (ventilation, traitement d'air, désenfumage).
 */
export interface Duct {
  readonly id: ElementId;
  readonly category: 'duct';
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly shape: PortShape;
  readonly diameter?: number | undefined; // Si shape === 'round'
  readonly width?: number | undefined; // Si shape === 'rectangular'
  readonly height?: number | undefined; // Si shape === 'rectangular'
  readonly insulationThickness?: number | undefined; // Épaisseur d'isolation acoustique/thermique en mm
  readonly ports: readonly Port[]; // Exactement 2 ports : index 0 (début), index 1 (fin)
  readonly name?: string | undefined;
}

/**
 * Segment de chemin de câbles pour la distribution électrique et courants faibles.
 */
export interface CableTray {
  readonly id: ElementId;
  readonly category: 'cableTray';
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly start: Point3D;
  readonly end: Point3D;
  readonly width: number; // Largeur utile en mm
  readonly height: number; // Hauteur de rive / rebord en mm
  readonly ports: readonly Port[]; // 2 ports d'extrémité
  readonly name?: string | undefined;
}

/**
 * Types géométriques et fonctionnels de raccords de tuyauterie et gaines (Fittings).
 */
export type MepFittingType =
  | 'elbow' // Coude (changement de direction, 2 ports)
  | 'tee' // Té de dérivation (3 ports)
  | 'cross' // Croix de distribution (4 ports)
  | 'transition' // Réduction ou changement de section (2 ports)
  | 'cap'; // Bouchon d'extrémité (1 port)

/**
 * Raccord de réseau (coude, té, réduction, bouchon).
 */
export interface MepFitting {
  readonly id: ElementId;
  readonly category: 'mepFitting';
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly fittingType: MepFittingType;
  readonly domain: MepDomain;
  readonly systemType: MepSystemType;
  readonly position: Point3D;
  readonly ports: readonly Port[];
  readonly name?: string | undefined;
}

/**
 * Familles d'équipements techniques actifs ou terminaux raccordés aux réseaux.
 */
export type MepEquipmentFamily =
  | 'boiler' // Chaudière gaz / fioul / bois
  | 'heat_pump' // Pompe à chaleur (PAC)
  | 'water_heater' // Ballon d'eau chaude sanitaire (cumulus)
  | 'pump' // Circulateur / pompe hydraulique
  | 'ahu' // Centrale de Traitement d'Air (CTA)
  | 'fan' // Extracteur / ventilateur
  | 'radiator' // Radiateur à eau ou émetteur
  | 'valve' // Vanne de régulation, vanne d'arrêt
  | 'meter' // Compteur d'eau ou d'énergie
  | 'electrical_panel'; // Tableau électrique général ou divisionnaire

/**
 * Équipement technique installé dans le bâtiment doté de ports de raccordement.
 */
export interface MepEquipment {
  readonly id: ElementId;
  readonly category: 'mepEquipment';
  readonly levelId: ElementId;
  readonly systemId?: ElementId | undefined;
  readonly family: MepEquipmentFamily;
  readonly position: Point3D;
  readonly rotation?: number | undefined; // Rotation en radians autour de l'axe vertical Z (défaut: 0)
  readonly width: number; // Encombrement X en mm
  readonly depth: number; // Encombrement Y en mm
  readonly height: number; // Encombrement Z en mm
  readonly ports: readonly Port[];
  readonly name?: string | undefined;
}

/**
 * Type union de tout élément physique participant à la topologie des réseaux MEP.
 */
export type MepElement = Pipe | Duct | CableTray | MepFitting | MepEquipment;
