import type { RelationDef } from './types.js';

/**
 * Registre centralisé et déclaratif de toutes les relations inter-entités du modèle BIM.
 * Définit les règles de dépendance, d'intégrité référentielle et les politiques de suppression (ADR-038).
 */
export const RELATIONS_REGISTRY: readonly RelationDef[] = [
  // 1. Ouvertures hébergées par un mur hôte (Cascade)
  {
    sourceCategory: 'door',
    field: 'hostWallId',
    targetCategory: 'wall',
    onDelete: 'cascade',
  },
  {
    sourceCategory: 'window',
    field: 'hostWallId',
    targetCategory: 'wall',
    onDelete: 'cascade',
  },
  // 2. Cotations associatives référençant des murs (Cascade)
  {
    sourceCategory: 'dimension',
    field: 'references',
    targetCategory: 'wall',
    onDelete: 'cascade',
    isArray: true,
  },
  // 3. Murs rattachés à leur type et niveau (Restrict)
  {
    sourceCategory: 'wall',
    field: 'typeId',
    targetCategory: 'wallType',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'wall',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  // 4. Ouvertures rattachées à leur famille/type constructif (Restrict)
  {
    sourceCategory: 'door',
    field: 'doorTypeId',
    targetCategory: 'doorType',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'window',
    field: 'windowTypeId',
    targetCategory: 'windowType',
    onDelete: 'restrict',
  },
  // 5. Dalles rattachées à leur niveau altimétrique et type (Restrict)
  {
    sourceCategory: 'slab',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'slab',
    field: 'slabTypeId',
    targetCategory: 'slabType',
    onDelete: 'restrict',
  },
  // 6. Escaliers rattachés à leur type constructif et leurs niveaux (Restrict, ADR-048)
  {
    sourceCategory: 'stair',
    field: 'stairTypeId',
    targetCategory: 'stairType',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'stair',
    field: 'bottomLevelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'stair',
    field: 'topLevelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  // 7. Toitures rattachées à leur type constructif et leur niveau d'assise (Restrict, ADR-053)
  {
    sourceCategory: 'roof',
    field: 'roofTypeId',
    targetCategory: 'roofType',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'roof',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  // 8. Trémies de toitures hébergées par une toiture (Cascade, ADR-053)
  {
    sourceCategory: 'roofOpening',
    field: 'roofId',
    targetCategory: 'roof',
    onDelete: 'cascade',
  },
  // 9. Composants d'aménagement rattachés à leur type et niveau (Restrict, Phase 8)
  {
    sourceCategory: 'component',
    field: 'typeId',
    targetCategory: 'componentType',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'component',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'component',
    field: 'placement.hostWallId',
    targetCategory: 'wall',
    onDelete: 'detach',
  },
  // 10. Entités MEP rattachées à leur niveau altimétrique (Restrict, Phase 9.2)
  {
    sourceCategory: 'pipe',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'duct',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'cableTray',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'mepFitting',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  {
    sourceCategory: 'mepEquipment',
    field: 'levelId',
    targetCategory: 'level',
    onDelete: 'restrict',
  },
  // 11. Entités MEP rattachées à un système technique (Detach, Phase 9.2)
  {
    sourceCategory: 'pipe',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
  {
    sourceCategory: 'duct',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
  {
    sourceCategory: 'cableTray',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
  {
    sourceCategory: 'mepFitting',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
  {
    sourceCategory: 'mepEquipment',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
  {
    sourceCategory: 'mepConnector',
    field: 'systemId',
    targetCategory: 'mepSystem',
    onDelete: 'detach',
  },
] as const;
