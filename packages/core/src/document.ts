import { produceWithPatches } from 'immer';
import {
  type BimState,
  type ElementId,
  type CommandResult,
  type DocumentListener,
  type Level,
  type WallType,
} from './types.js';
import { type Command } from './commands.js';
import { HistoryStack } from './history.js';
import { toJSON, fromJSON } from './serialization.js';
import { generateId } from './ids.js';
import { DependencyGraph } from './dag/DependencyGraph.js';
import { validateDirty } from './rules.js';

/**
 * Gestionnaire documentaire central du projet Mini-BIM.
 *
 * RÈGLES ARCHITECTURALES :
 * 1. Zéro mutation directe : toute modification passe obligatoirement par execute(command).
 * 2. Undo/Redo transactionnel : basé sur les patchs différentiels Immer.
 * 3. Indépendance totale : aucun import UI, React, Three.js ou DOM.
 */
export class BimDocument {
  private state: BimState;
  private readonly history: HistoryStack;
  private readonly subscribers: Set<DocumentListener> = new Set();

  public constructor(initialState?: BimState) {
    this.state = initialState ?? BimDocument.createEmptyState();
    this.history = new HistoryStack();
  }

  /**
   * Crée un état vierge sans aucun élément.
   */
  public static createEmptyState(): BimState {
    return {
      schemaVersion: 1,
      units: 'mm',
      levels: {},
      wallTypes: {},
      walls: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    };
  }

  /**
   * Crée un document pré-configuré avec un niveau standard (RDC z=0)
   * et un type de mur standard (Mur générique 200 mm, hauteur 2800 mm).
   */
  public static createDefaultProject(): BimDocument {
    const levelId = generateId();
    const typeId = generateId();

    const defaultLevel: Level = {
      id: levelId,
      name: 'Niveau 0 (RDC)',
      elevation: 0,
    };

    const defaultWallType: WallType = {
      id: typeId,
      name: 'Générique - 200mm',
      thickness: 200,
      height: 2800,
    };

    const state: BimState = {
      schemaVersion: 1,
      units: 'mm',
      levels: { [levelId]: defaultLevel },
      wallTypes: { [typeId]: defaultWallType },
      walls: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    };

    return new BimDocument(state);
  }

  /**
   * Désérialise une chaîne JSON et retourne une instance validée de BimDocument.
   */
  public static fromJSON(jsonString: string): BimDocument {
    const state = fromJSON(jsonString);
    return new BimDocument(state);
  }

  /**
   * Retourne l'état documentaire immuable actuel.
   */
  public getState(): Readonly<BimState> {
    return this.state;
  }

  /**
   * Exécute une commande transactionnelle, applique les patchs et notifie les écouteurs.
   */
  public execute(cmd: Command): CommandResult {
    const [nextState, patches, inversePatches] = produceWithPatches(this.state, (draft) => {
      cmd.apply(draft as BimState);
    });

    // Capture des dépendants transitifs via DAG minimal (ADR-041 / Option B)
    const dagBefore = DependencyGraph.build(this.state);
    const dagAfter = DependencyGraph.build(nextState as BimState);
    const directChanged = cmd.getChangedIds();

    const allChanged: ElementId[] = [...directChanged];
    const seen = new Set<ElementId>(directChanged);
    for (const id of directChanged) {
      for (const dep of dagBefore.getDependents(id)) {
        if (!seen.has(dep)) {
          seen.add(dep);
          allChanged.push(dep);
        }
      }
      for (const dep of dagAfter.getDependents(id)) {
        if (!seen.has(dep)) {
          seen.add(dep);
          allChanged.push(dep);
        }
      }
    }
    const changed = allChanged;

    // Post-Condition Universelle Différentielle (ADR-041 §6 / Phase 6.0b)
    validateDirty(nextState as BimState, changed, this.state);

    this.state = nextState as BimState;

    // Enregistrer la transaction dans l'historique
    this.history.push({
      patches,
      inversePatches,
      changed,
    });

    // Notifier les écouteurs
    this.notifySubscribers(changed);

    return {
      changed,
      patches,
      inversePatches,
    };
  }

  /**
   * Annule la dernière commande exécutée.
   */
  public undo(): boolean {
    const result = this.history.undo(this.state);
    if (!result) return false;

    this.state = result.nextState;
    this.notifySubscribers(result.changed);
    return true;
  }

  /**
   * Rétablit la dernière commande annulée.
   */
  public redo(): boolean {
    const result = this.history.redo(this.state);
    if (!result) return false;

    this.state = result.nextState;
    this.notifySubscribers(result.changed);
    return true;
  }

  public canUndo(): boolean {
    return this.history.canUndo();
  }

  public canRedo(): boolean {
    return this.history.canRedo();
  }

  /**
   * Souscrit aux notifications de modification du document.
   * Retourne une fonction de désinscription.
   */
  public subscribe(listener: DocumentListener): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /**
   * Sérialise l'état actuel en JSON.
   */
  public toJSON(pretty = false): string {
    return toJSON(this.state, pretty);
  }

  private notifySubscribers(changed: readonly ElementId[]): void {
    for (const listener of this.subscribers) {
      try {
        listener(changed);
      } catch (err) {
        // Prévenir qu'un écouteur défaillant n'interrompe le pipeline
        console.error('[BimDocument] Error in subscriber callback:', err);
      }
    }
  }
}
