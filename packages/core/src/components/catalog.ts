import type { ComponentType } from '../types.js';

/**
 * Catalogue standard des familles de composants architecturaux et mobilier (Phase 8).
 * Fournit un référentiel normalisé pour l'aménagement intérieur des logements et villas.
 */
export const STANDARD_COMPONENT_CATALOG: readonly ComponentType[] = [
  // --- 1. SANITAIRES ---
  {
    id: 'ct_toilet_wall_hung',
    category: 'componentType',
    name: 'WC Suspendu 36x54',
    family: 'sanitary',
    subType: 'toilet',
    width: 360,
    depth: 540,
    height: 400,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcSanitaryTerminal',
  },
  {
    id: 'ct_sink_vanity',
    category: 'componentType',
    name: 'Meuble Vasque 80x50',
    family: 'sanitary',
    subType: 'sink',
    width: 800,
    depth: 500,
    height: 850,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcSanitaryTerminal',
  },
  {
    id: 'ct_shower_tray',
    category: 'componentType',
    name: 'Douche Italienne 90x90',
    family: 'sanitary',
    subType: 'shower',
    width: 900,
    depth: 900,
    height: 60,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcSanitaryTerminal',
  },
  {
    id: 'ct_bath_tub',
    category: 'componentType',
    name: 'Baignoire Droite 170x75',
    family: 'sanitary',
    subType: 'bath',
    width: 1700,
    depth: 750,
    height: 550,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcSanitaryTerminal',
  },

  // --- 2. CUISINE ---
  {
    id: 'ct_kitchen_base_60',
    category: 'componentType',
    name: 'Meuble Bas Cuisine 60cm',
    family: 'kitchen',
    subType: 'kitchen_base',
    width: 600,
    depth: 600,
    height: 850,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_kitchen_sink_unit',
    category: 'componentType',
    name: 'Évier Cuisine 2 Bacs 120cm',
    family: 'kitchen',
    subType: 'sink_unit',
    width: 1200,
    depth: 600,
    height: 850,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcSanitaryTerminal',
  },
  {
    id: 'ct_kitchen_wall_60',
    category: 'componentType',
    name: 'Meuble Haut Cuisine 60cm',
    family: 'kitchen',
    subType: 'kitchen_wall',
    width: 600,
    depth: 350,
    height: 700,
    defaultElevationOffset: 1450,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_kitchen_fridge',
    category: 'componentType',
    name: 'Réfrigérateur 60x65',
    family: 'kitchen',
    subType: 'appliance',
    width: 600,
    depth: 650,
    height: 1850,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },

  // --- 3. MOBILIER ---
  {
    id: 'ct_bed_double',
    category: 'componentType',
    name: 'Lit Double 160x200',
    family: 'furniture',
    subType: 'bed',
    width: 1600,
    depth: 2000,
    height: 500,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_dining_table',
    category: 'componentType',
    name: 'Table à Manger 160x90',
    family: 'furniture',
    subType: 'table',
    width: 1600,
    depth: 900,
    height: 750,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_chair',
    category: 'componentType',
    name: 'Chaise 45x45',
    family: 'furniture',
    subType: 'chair',
    width: 450,
    depth: 450,
    height: 850,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_sofa_3p',
    category: 'componentType',
    name: 'Canapé 3 Places 220x90',
    family: 'furniture',
    subType: 'sofa',
    width: 2200,
    depth: 900,
    height: 800,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },
  {
    id: 'ct_wardrobe',
    category: 'componentType',
    name: 'Armoire Dressing 150x60',
    family: 'furniture',
    subType: 'cabinet',
    width: 1500,
    depth: 600,
    height: 2100,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcFurnishingElement',
  },

  // --- 4. MENUISERIES ENRICHIES ---
  {
    id: 'ct_sliding_door',
    category: 'componentType',
    name: 'Baie Coulissante 2 Vantaux 240x215',
    family: 'glazing',
    subType: 'sliding_door',
    width: 2400,
    depth: 150,
    height: 2150,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcDoor',
  },
  {
    id: 'ct_french_window',
    category: 'componentType',
    name: 'Porte-Fenêtre 2 Vantaux 140x215',
    family: 'glazing',
    subType: 'french_window',
    width: 1400,
    depth: 150,
    height: 2150,
    defaultElevationOffset: 0,
    ifcEntity: 'IfcWindow',
  },
];

/**
 * Retourne un dictionnaire prêt à l'emploi des types standards de composants.
 */
export function createDefaultComponentTypes(): Record<string, ComponentType> {
  const result: Record<string, ComponentType> = {};
  for (const ct of STANDARD_COMPONENT_CATALOG) {
    result[ct.id] = ct;
  }
  return result;
}
