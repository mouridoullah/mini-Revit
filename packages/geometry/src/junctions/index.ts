/**
 * Moteur de jonctions de murs pour Mini-BIM.
 *
 * Résout de façon déterministe les jonctions L, T, X, colinéaires et multiples
 * sans trous ni superpositions.
 */

export * from './types.js';
export * from './topology.js';
export * from './miter.js';
export * from './t-junction.js';
export * from './x-junction.js';
export * from './collinear.js';
export * from './multi.js';
export * from './engine.js';
export * from './stretch.js';
export * from './visualizer.js';
