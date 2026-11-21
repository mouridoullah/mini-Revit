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
import { validateDirty, BimValidationError } from './rules.js';
import { createDefaultComponentTypes } from './components/catalog.js';

/**
 * Détermine si un ensemble d'identifiants modifiés touche à la structure d'étages
 * ou aux relations inter-niveaux grossières (ADR-041 & ADR-048).
 */
function hasStructuralOrCrossLevelChanges(
  changedIds: readonly ElementId[],
  oldState: BimState,
  nextState: BimState,
): boolean {
  for (const id of changedIds) {
    if (
      (oldState.levels && id in oldState.levels) ||
      (nextState.levels && id in nextState.levels) ||
      (oldState.slabs && id in oldState.slabs) ||
      (nextState.slabs && id in nextState.slabs) ||
      (oldState.roofs && id in oldState.roofs) ||
      (nextState.roofs && id in nextState.roofs) ||
      (oldState.stairs && id in oldState.stairs) ||
      (nextState.stairs && id in nextState.stairs) ||
      (oldState.wallTypes && id in oldState.wallTypes) ||
      (nextState.wallTypes && id in nextState.wallTypes)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Détecte si au moins une entité modifiée a subi une modification de ses références relationnelles
 * (ajout/suppression d'élément, changement de typeId, levelId, hostWallId, references, topConstraint).
 * Si faux, la topologie du DAG (nœuds et arêtes) est strictement invariante.
 */
function hasTopologicalChanges(
  changedIds: readonly ElementId[],
  oldState: BimState,
  nextState: BimState,
): boolean {
  for (const id of changedIds) {
    const oldW = oldState.walls?.[id];
    const newW = nextState.walls?.[id];
    if (oldW || newW) {
      if (!oldW || !newW) return true; // Ajout ou suppression
      if (oldW.typeId !== newW.typeId || oldW.levelId !== newW.levelId) return true;
      const topOld = oldW.topConstraint;
      const topNew = newW.topConstraint;
      const roofIdOld = topOld?.kind === 'roof' ? topOld.roofId : undefined;
      const roofIdNew = topNew?.kind === 'roof' ? topNew.roofId : undefined;
      const levelIdOld = topOld?.kind !== 'roof' ? topOld?.levelId : undefined;
      const levelIdNew = topNew?.kind !== 'roof' ? topNew?.levelId : undefined;
      const sameTop =
        (!topOld && !topNew) ||
        (topOld?.kind === topNew?.kind &&
          levelIdOld === levelIdNew &&
          roofIdOld === roofIdNew);
      if (!sameTop) return true;
      continue;
    }

    const oldD = oldState.doors?.[id];
    const newD = nextState.doors?.[id];
    if (oldD || newD) {
      if (!oldD || !newD) return true;
      if (oldD.hostWallId !== newD.hostWallId || oldD.doorTypeId !== newD.doorTypeId) return true;
      continue;
    }

    const oldWin = oldState.windows?.[id];
    const newWin = nextState.windows?.[id];
    if (oldWin || newWin) {
      if (!oldWin || !newWin) return true;
      if (oldWin.hostWallId !== newWin.hostWallId || oldWin.windowTypeId !== newWin.windowTypeId) return true;
      continue;
    }

    const oldDim = oldState.dimensions?.[id];
    const newDim = nextState.dimensions?.[id];
    if (oldDim || newDim) {
      if (!oldDim || !newDim) return true;
      if (oldDim.references.length !== newDim.references.length) return true;
      let refsEqual = true;
      for (let i = 0; i < oldDim.references.length; i++) {
        if (oldDim.references[i] !== newDim.references[i]) {
          refsEqual = false;
          break;
        }
      }
      if (!refsEqual) return true;
      continue;
    }

    const oldR = oldState.rooms?.[id];
    const newR = nextState.rooms?.[id];
    if (oldR || newR) {
      if (!oldR || !newR) return true;
      if (oldR.levelId !== newR.levelId) return true;
      continue;
    }

    const oldC = oldState.components?.[id];
    const newC = nextState.components?.[id];
    if (oldC || newC) {
      if (!oldC || !newC) return true;
      if (oldC.typeId !== newC.typeId || oldC.levelId !== newC.levelId) return true;
      if (oldC.placement?.hostWallId !== newC.placement?.hostWallId) return true;
      continue;
    }

    // Tout autre élément (MEP, niveau, dalle, toiture, escalier, etc.)
    return true;
  }
  return false;
}

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
  private _dag: DependencyGraph;
  private readonly history: HistoryStack;
  private readonly subscribers: Set<DocumentListener> = new Set();

  public constructor(initialState?: BimState) {
    this.state = initialState ?? BimDocument.createEmptyState();
    this.history = new HistoryStack();
    this._dag = DependencyGraph.build(this.state);
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
      componentTypes: {},
      components: {},
      pipes: {},
      ducts: {},
      cableTrays: {},
      mepFittings: {},
      mepEquipments: {},
      mepSystems: {},
      mepConnectors: {},
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
      componentTypes: createDefaultComponentTypes(),
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
      stairs: {},
      roofs: {},
      roofOpenings: {},
      components: {},
      pipes: {},
      ducts: {},
      cableTrays: {},
      mepFittings: {},
      mepEquipments: {},
      mepSystems: {},
      mepConnectors: {},
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
   * Retourne l'instance active du graphe de dépendances (ADR-041).
   */
  public getDependencyGraph(): DependencyGraph {
    return this._dag;
  }

  /**
   * Exécute une commande transactionnelle, applique les patchs et notifie les écouteurs.
   */
  public execute(cmd: Command): CommandResult {
    const [nextState, patches, inversePatches] = produceWithPatches(this.state, (draft) => {
      cmd.apply(draft as BimState);
    });

    const directChanged = cmd.getChangedIds();
    const dagBefore = this._dag;

    // Préparation de dagAfter sans muter this._dag (Garde-fou d'atomicité)
    let nextDag: DependencyGraph;
    const isTopologicalInvariant = !hasTopologicalChanges(directChanged, this.state, nextState as BimState);

    if (isTopologicalInvariant) {
      nextDag = this._dag;
    } else if (hasStructuralOrCrossLevelChanges(directChanged, this.state, nextState as BimState)) {
      nextDag = DependencyGraph.build(nextState as BimState);
    } else {
      nextDag = this._dag.clone();
      nextDag.updateElements(directChanged, this.state, nextState as BimState);
    }

    // Détection de cycle ciblée sur les nœuds modifiés (uniquement si la topologie a changé)
    if (!isTopologicalInvariant) {
      const cycleNodes = nextDag.findCycleNodes(directChanged);
      if (cycleNodes.length > 0) {
        throw new BimValidationError(
          'CYCLE_DETECTED',
          `Cycle detected in dependency graph involving nodes: ${cycleNodes.join(', ')}`,
          { offendingIds: cycleNodes },
        );
      }
    }

    // Capture des dépendants transitifs via union des fermetures avant et après
    const allChanged: ElementId[] = [...directChanged];
    const seen = new Set<ElementId>(directChanged);
    for (const id of directChanged) {
      for (const dep of dagBefore.getDependents(id)) {
        if (!seen.has(dep)) {
          seen.add(dep);
          allChanged.push(dep);
        }
      }
      if (!isTopologicalInvariant) {
        for (const dep of nextDag.getDependents(id)) {
          if (!seen.has(dep)) {
            seen.add(dep);
            allChanged.push(dep);
          }
        }
      }
    }
    const changed = allChanged;

    // Post-Condition Universelle Différentielle (ADR-041 §6 / Phase 6.0b)
    // Si validateDirty lève une exception, this.state et this._dag restent strictement intouchés !
    validateDirty(nextState as BimState, changed, this.state);

    // Commit atomique de l'état et du DAG synchronisé
    this.state = nextState as BimState;
    this._dag = nextDag;

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

    const prevState = this.state;
    this.state = result.nextState;

    // Synchronisation incrémentale du graphe de dépendances sur annulation
    if (hasStructuralOrCrossLevelChanges(result.changed, prevState, this.state)) {
      this._dag = DependencyGraph.build(this.state);
    } else {
      this._dag.updateElements(result.changed, prevState, this.state);
    }

    this.notifySubscribers(result.changed);
    return true;
  }

  /**
   * Rétablit la dernière commande annulée.
   */
  public redo(): boolean {
    const result = this.history.redo(this.state);
    if (!result) return false;

    const prevState = this.state;
    this.state = result.nextState;

    // Synchronisation incrémentale du graphe de dépendances sur rétablissement
    if (hasStructuralOrCrossLevelChanges(result.changed, prevState, this.state)) {
      this._dag = DependencyGraph.build(this.state);
    } else {
      this._dag.updateElements(result.changed, prevState, this.state);
    }

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
