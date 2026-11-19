import type { BimState } from '../types.js';
import type { EntityCategory } from './types.js';

export interface CategoryDescriptor {
  readonly category: EntityCategory;
  readonly stateField: keyof BimState;
  readonly label: string;
}

export const ENTITY_CATEGORY_DESCRIPTORS: readonly CategoryDescriptor[] = [
  { category: 'wall', stateField: 'walls', label: 'Mur' },
  { category: 'door', stateField: 'doors', label: 'Porte' },
  { category: 'window', stateField: 'windows', label: 'Fenêtre' },
  { category: 'dimension', stateField: 'dimensions', label: 'Cotation' },
  { category: 'room', stateField: 'rooms', label: 'Pièce' },
  { category: 'level', stateField: 'levels', label: 'Niveau' },
  { category: 'wallType', stateField: 'wallTypes', label: 'Type de mur' },
  { category: 'slab', stateField: 'slabs', label: 'Dalle' },
  { category: 'slabType', stateField: 'slabTypes', label: 'Type de dalle' },
  { category: 'doorType', stateField: 'doorTypes', label: 'Type de porte' },
  { category: 'windowType', stateField: 'windowTypes', label: 'Type de fenêtre' },
  { category: 'stair', stateField: 'stairs', label: 'Escalier' },
  { category: 'stairType', stateField: 'stairTypes', label: 'Type d’escalier' },
  { category: 'roof', stateField: 'roofs', label: 'Toiture' },
  { category: 'roofType', stateField: 'roofTypes', label: 'Type de toiture' },
  { category: 'roofOpening', stateField: 'roofOpenings', label: 'Trémie de toiture' },
  { category: 'component', stateField: 'components', label: 'Composant' },
  { category: 'componentType', stateField: 'componentTypes', label: 'Type de composant' },
  { category: 'pipe', stateField: 'pipes', label: 'Tuyauterie' },
  { category: 'duct', stateField: 'ducts', label: 'Gaine aéraulique' },
  { category: 'cableTray', stateField: 'cableTrays', label: 'Chemin de câbles' },
  { category: 'mepFitting', stateField: 'mepFittings', label: 'Raccord MEP' },
  { category: 'mepEquipment', stateField: 'mepEquipments', label: 'Équipement MEP' },
  { category: 'mepSystem', stateField: 'mepSystems', label: 'Système MEP' },
  { category: 'mepConnector', stateField: 'mepConnectors', label: 'Connexion MEP' },
] as const;

const DESCRIPTOR_BY_CATEGORY: ReadonlyMap<EntityCategory, CategoryDescriptor> = new Map(
  ENTITY_CATEGORY_DESCRIPTORS.map((d) => [d.category, d]),
);

export function getCategoryDescriptor(category: EntityCategory): CategoryDescriptor | undefined {
  return DESCRIPTOR_BY_CATEGORY.get(category);
}
