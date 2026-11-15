export type CascadeAction = 'cascade' | 'restrict' | 'detach';

export type EntityCategory =
  | 'wall'
  | 'door'
  | 'window'
  | 'dimension'
  | 'slab'
  | 'stair'
  | 'wallType'
  | 'level'
  | 'doorType'
  | 'windowType'
  | 'slabType'
  | 'stairType'
  | 'room';

export interface RelationDef {
  readonly sourceCategory: EntityCategory;
  readonly field: string;
  readonly targetCategory: EntityCategory;
  readonly onDelete: CascadeAction;
  readonly isArray?: boolean;
}
