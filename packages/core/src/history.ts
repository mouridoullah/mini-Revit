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
}

/**
 * Gestionnaire d'historique Undo / Redo basé sur les patchs différentiels Immer.
 */
export class HistoryStack {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];

  /**
   * Enregistre une nouvelle transaction et vide la pile de Redo.
   */
  public push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack.length = 0; // Invalidation stricte du Redo
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
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
