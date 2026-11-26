import { enablePatches, applyPatches, type Patch } from 'immer';
import { type BimState, type ElementId } from './types.js';

// Activer explicitement le moteur de patchs d'Immer au chargement du module
enablePatches();

/**
 * Entrée unitaire dans la pile d'historique transactionnel.
 */
export interface HistoryEntry {
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly changed: readonly ElementId[];
  readonly label?: string | undefined;
}

export const DEFAULT_HISTORY_MAX_CAPACITY = 500;

/**
 * Gestionnaire d'historique Undo / Redo basé sur les patchs différentiels Immer.
 * Bounded history stack (éviction FIFO au-delà de maxCapacity pour éviter toute fuite mémoire).
 */
export class HistoryStack {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];

  public constructor(public readonly maxCapacity: number = DEFAULT_HISTORY_MAX_CAPACITY) {}

  /**
   * Enregistre une nouvelle transaction et vide la pile de Redo.
   * Évince l'entrée la plus ancienne si la capacité maximale est atteinte.
   */
  public push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxCapacity) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0; // Invalidation stricte du Redo
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Retourne l'entrée candidate à l'annulation sans altérer la pile (contrat d'atomicité).
   */
  public peekUndo(): HistoryEntry | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  /**
   * Confirme l'annulation et déplace l'entrée vers la pile redo.
   */
  public commitUndo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return entry;
  }

  /**
   * Retourne l'entrée candidate au rétablissement sans altérer la pile (contrat d'atomicité).
   */
  public peekRedo(): HistoryEntry | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  /**
   * Confirme le rétablissement et déplace l'entrée vers la pile undo.
   */
  public commitRedo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return entry;
  }

  /**
   * Annule la dernière transaction en appliquant les patchs inverses.
   */
  public undo(
    currentState: BimState,
  ): { readonly nextState: BimState; readonly changed: readonly ElementId[] } | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;

    const nextState = applyPatches(currentState, entry.inversePatches as Patch[]) as BimState;
    this.redoStack.push(entry);

    return { nextState, changed: entry.changed };
  }

  /**
   * Rétablit la dernière transaction annulée en réappliquant les patchs directs.
   */
  public redo(
    currentState: BimState,
  ): { readonly nextState: BimState; readonly changed: readonly ElementId[] } | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;

    const nextState = applyPatches(currentState, entry.patches as Patch[]) as BimState;
    this.undoStack.push(entry);

    return { nextState, changed: entry.changed };
  }

  /**
   * Vide l'intégralité de l'historique.
   */
  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }
}
