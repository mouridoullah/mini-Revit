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
      schemaVersion: 2,
      units: 'mm',
      levels: {},
      wallTypes: {},
      slabTypes: {},
      doorTypes: {},
      windowTypes: {},
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
      stairTypes: {},
      stairs: {},
      roofTypes: {},
      roofs: {},
      roofOpenings: {},
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

    const defaultSlabTypeId = 'default-slab-type';
    const defaultDoorTypeId = 'default-door-type';
    const defaultWindowTypeId = 'default-window-type';
    const defaultStairTypeId = 'default-stair-type';

    const defaultSlabType: import('./types.js').SlabType = {
      id: defaultSlabTypeId,
      name: 'Dalle BA 200mm',
      thickness: 200,
    };

    const defaultDoorType: import('./types.js').DoorType = {
      id: defaultDoorTypeId,
      name: 'Porte 900×2100 mm',
      width: 900,
      height: 2100,
    };

    const defaultWindowType: import('./types.js').WindowType = {
      id: defaultWindowTypeId,
      name: 'Fenêtre 1200×1400 mm',
      width: 1200,
      height: 1400,
      defaultSillHeight: 900,
    };

    const defaultStairType: import('./types.js').StairType = {
      id: defaultStairTypeId,
      name: 'Escalier Droit 900mm',
      width: 900,
    };

    const defaultGableRoofTypeId = 'default-gable-roof-type';
    const defaultFlatRoofTypeId = 'default-flat-roof-type';

    const defaultGableRoofType: import('./types.js').GableRoofType = {
      id: defaultGableRoofTypeId,
      name: 'Toiture 2 pans Tuiles 35°',
      category: 'roofType',
      family: 'gable',
      thickness: 250,
      slopeDeg: 35,
      overhangMm: 400,
    };

    const defaultFlatRoofType: import('./types.js').FlatRoofType = {
      id: defaultFlatRoofTypeId,
      name: 'Toiture terrasse béton 200mm',
      category: 'roofType',
      family: 'flat',
      thickness: 200,
    };

    const state: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: { [levelId]: defaultLevel },
      wallTypes: { [typeId]: defaultWallType },
      slabTypes: { [defaultSlabTypeId]: defaultSlabType },
      doorTypes: { [defaultDoorTypeId]: defaultDoorType },
      windowTypes: { [defaultWindowTypeId]: defaultWindowType },
      stairTypes: { [defaultStairTypeId]: defaultStairType },
      roofTypes: {
        [defaultGableRoofTypeId]: defaultGableRoofType,
        [defaultFlatRoofTypeId]: defaultFlatRoofType,
      },
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
      stairs: {},
      roofs: {},
      roofOpenings: {},
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
