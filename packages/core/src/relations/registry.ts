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
] as const;
