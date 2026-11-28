/**
 * components/types — Interfaces partagées pour les composants architecturaux et mobilier (LOD 200 / LOD 350)
 *
 * Contrat neutre LOD 350 multi-matériaux (ADR-072).
 * Zéro dépendance Three.js directe : produit des structures de données pures
 * consommées par @tabax/view-3d/rendering.
 */

import type { RawMeshData } from '@tabax/geometry';

export type ComponentDetailLevel = 'lod200' | 'lod350';

/**
 * Rôles de matériaux PBR photoréalistes pour l'architecture intérieure et les équipements.
 */
export type ComponentMaterialRole =
  | 'porcelain_white' // Céramique sanitaire blanche brillante émaillée
  | 'chrome_hardware' // Chrome miroir (robinetterie, bondes, charnières)
  | 'stainless_brushed' // Inox brossé satiné (éviers, fours, électroménager)
  | 'wood_oak' // Bois chêne clair chaleureux (plateaux, plans de travail, parquet)
  | 'wood_dark' // Bois noyer / teck foncé élégant (meubles, têtes de lit)
  | 'fabric_upholstery' // Tissu chiné d'ameublement (canapés, fauteuils)
  | 'fabric_cushion' // Coussins et literie confort (oreillers, matelas, couettes)
  | 'leather_black' // Cuir noir grainé (chaises de bureau, assises contemporaines)
  | 'glass_clear' // Verre trempé transparent (parois de douche, vitrines, baies)
  | 'glass_tinted' // Verre teinté noir/fumé (portes de four, vitrocéramique)
  | 'quartz_white' // Plan de travail en quartz blanc marbré
  | 'granite_dark' // Plan de travail / receveur pierre ou granit sombre
  | 'alu_anthracite' // Profilés aluminium thermolaqué gris anthracite RAL 7016
  | 'brass_gold' // Laiton doré satiné (robinetterie design, poignées)
  | 'mirror' // Miroir argenté haute réflectivité
  | 'appliance_display' // Afficheurs et façades numériques d'appareils
  | 'plastic_matte' // Plastique technique blanc/gris mat
  | 'concrete_structural' // Béton armé banché architectural structurel
  | 'roof_tile' // Tuiles terre cuite / couverture de toit
  | 'roof_gravel' // Gravillons et étanchéité toiture terrasse
  | 'zinc_metal' // Zinc prépatiné pour rives et gouttières
  | 'plaster_interior' // Plâtre blanc intérieur lisse et contremarches
  | 'skirting_wood'; // Plinthes décoratives en bois ou laqué

export type ComponentInstancePrototypeKey =
  | 'railing_post'
  | 'door_handle'
  | 'door_hinge'
  | 'cabinet_pull'
  | 'furniture_leg';

/**
 * Pièce constitutive d'un assemblage de composant architectural.
 */
export interface ComponentAssemblyPart {
  readonly rawData: RawMeshData;
  readonly materialRole: ComponentMaterialRole;
  readonly color?: string | undefined;
}

/**
 * Instance GPU partagée attachée à un assemblage architectural / mobilier.
 */
export interface ComponentInstanceAnchor {
  readonly prototypeKey: ComponentInstancePrototypeKey;
  /** Matrice 4x4 column-major compatible THREE.Matrix4.fromArray(). */
  readonly matrix: readonly number[];
  readonly materialRole: ComponentMaterialRole;
  readonly color?: string | undefined;
}

/**
 * Assemblage 3D complet représentant un composant architectural ou d'équipement (LOD 350).
 */
export interface ComponentAssembly3D {
  readonly elementId: string;
  readonly category: 'component' | 'stair' | 'roof' | 'slab' | 'wall' | 'door' | 'window' | string;
  readonly family: 'sanitary' | 'kitchen' | 'furniture' | 'glazing' | 'stair' | 'roof' | 'slab' | 'wall' | 'door' | 'window' | string;
  readonly subType: string;
  readonly parts: readonly ComponentAssemblyPart[];
  readonly instances?: readonly ComponentInstanceAnchor[] | undefined;
}

export interface ComponentMeshInput {
  readonly id: string;
  readonly placement: {
    readonly x: number;
    readonly y: number;
    readonly rotation?: number | undefined;
    readonly elevationOffset?: number | undefined;
  };
  readonly widthOverride?: number | undefined;
  readonly depthOverride?: number | undefined;
  readonly heightOverride?: number | undefined;
}

export interface ComponentTypeMeshInput {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly subType: string;
  readonly defaultElevationOffset?: number | undefined;
}

export interface CreateComponentAssemblyOptions {
  readonly detailLevel?: ComponentDetailLevel | undefined;
}
