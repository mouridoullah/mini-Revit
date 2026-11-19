import type { BimState, ElementId } from '../types.js';

/**
 * Interface fondamentale d'une commande transactionnelle de mutation d'état BIM.
 */
export interface Command {
  readonly name: string;
  apply(draft: BimState): void;
  getChangedIds(): readonly ElementId[];
}
