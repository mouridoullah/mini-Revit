/**
 * @mini-bim/core - Clash Detection & Spatial Index Engine
 *
 * Moteur analytique pur de détection de conflits géométriques 3D (Broad-phase BVH + Narrow-phase SAT)
 * avec qualification sémantique BIM (élimination des faux positifs sur connecteurs MEP,
 * ouvertures hébergées et jonctions de murs).
 */

export * from './types.js';
export * from './spatial/aabb.js';
export * from './spatial/bvh.js';
export * from './narrow-phase/sat.js';
export * from './narrow-phase/cylinder.js';
export * from './narrow-phase/geometry-adapters.js';
export * from './classification/rules.js';
export * from './engine.js';
