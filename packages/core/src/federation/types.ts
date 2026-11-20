/**
 * Types et interfaces pour la fédération de maquettes IFC externes en lecture seule.
 * Conforme à ADR-001 (Isolation stricte de BimState), ADR-003 (Repère millimètres Z-up),
 * ADR-056 et ADR-059 (Coordination spatiale BVH).
 */

import { type AABB3D } from '../clash/types.js';

/**
 * Jeu de propriétés IFC (IfcPropertySet / IfcElementQuantity).
 */
export interface FederatedPropertySet {
  name: string;
  properties: Record<string, string | number | boolean | null>;
}

/**
 * Entité fédérée individuelle représentant un élément du modèle IFC externe.
 * Préserve l'identité IFC d'origine sans polluer le BimState natif.
 */
export interface FederatedEntity {
  expressId: number;
  globalId?: string | undefined;
  ifcType: string;
  name?: string | undefined;
  description?: string | undefined;
  modelId: string;
  aabb: AABB3D;
  propertySets?: FederatedPropertySet[] | undefined;
}

/**
 * Données brutes du maillage 3D d'une entité fédérée, normalisées en millimètres Z-up.
 */
export interface FederatedMeshBuffer {
  expressId: number;
  positions: Float32Array; // Stride 3: [x, y, z, ...]
  normals: Float32Array;   // Stride 3: [nx, ny, nz, ...]
  indices: Uint32Array;
  color: { r: number; g: number; b: number; a: number };
}

/**
 * Spécification d'unités détectées dans le fichier IFC source.
 */
export interface FederatedUnits {
  length: string; // 'MILLIMETRE' | 'METRE' | 'FOOT' | 'INCH' | string
  scaleToMm: number;
}

/**
 * Maquette fédérée complète en mémoire, prête pour consultation, rendu 3D et clash BVH.
 */
export interface FederatedModel {
  id: string;
  name: string;
  schema: string; // 'IFC4' | 'IFC2X3' | string
  units: FederatedUnits;
  globalAABB: AABB3D;
  entities: Record<number, FederatedEntity>;
  meshes: FederatedMeshBuffer[];
  entityCount: number;
}

/**
 * Options de chargement d'un modèle fédéré.
 */
export interface FederatedModelOptions {
  modelId?: string | undefined;
  name?: string | undefined;
  wasmPath?: string | undefined;
  extractProperties?: boolean | undefined;
}

/**
 * Clé d'identité composée d'une entité fédérée.
 * Garantit l'unicité stricte multi-modèles (deux modèles distincts pouvant partager le même expressId).
 */
export interface FederatedEntityKey {
  modelId: string;
  expressId: number;
}

/**
 * Statut de qualification géométrique et sémantique d'un conflit fédéré.
 */
export type FederatedClashStatus =
  | 'CANDIDATE'             // Chevauchement spatial AABB brut
  | 'QUALIFIED_CLASH'       // Conflit physique vérifié par Narrow-Phase (SAT 3D ou Cylindre)
  | 'UNSUPPORTED_GEOMETRY'  // Géométrie maillée complexe non analytique
  | 'IGNORED';              // Interaction sémantiquement légitime (réservations, volumes spatiaux)

/**
 * Résultat de détection d'interférence spatiale entre une entité native et une entité fédérée
 * ou entre deux entités fédérées.
 */
export interface FederatedClashCandidate {
  modelId: string;
  expressId: number;
  ifcType: string;
  nativeId: string;
  nativeCategory: string;
  intersectionBox: AABB3D;
  point: { x: number; y: number; z: number };
  penetrationEstimateMm: number;
  status: FederatedClashStatus;
  qualifier?: string | undefined;
}
