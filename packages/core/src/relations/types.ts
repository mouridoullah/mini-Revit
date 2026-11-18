export type CascadeAction = 'cascade' | 'restrict' | 'detach';

export type EntityCategory =
  | 'wall'
  | 'door'
  | 'window'
  | 'dimension'
  | 'slab'
  | 'stair'
  | 'roof'
  | 'roofOpening'
  | 'wallType'
  | 'level'
  | 'doorType'
  | 'windowType'
  | 'slabType'
  | 'stairType'
  | 'roofType'
  | 'component'
  | 'componentType'
  | 'room';

export interface RelationDef {
  readonly sourceCategory: EntityCategory;
  readonly field: string;
  readonly targetCategory: EntityCategory;
  readonly onDelete: CascadeAction;
  readonly isArray?: boolean;
}
