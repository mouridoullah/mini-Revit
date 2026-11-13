import { ulid } from 'ulid';
import { type ElementId } from './types.js';

/**
 * Génère un identifiant unique universel pour les éléments BIM.
 *
 * Utilise la norme ULID (Universally Unique Lexicographically Sortable Identifier) :
 * - 26 caractères en base32 Crockford (insensible à la casse, sans ambiguïté visuelle).
 * - Triable chronologiquement à la milliseconde près.
 * - Générable hors-ligne sans risque de collision (80 bits d'aléa cryptographique).
 */
export function generateId(): ElementId {
  return ulid();
}
