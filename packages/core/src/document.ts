import { produceWithPatches, applyPatches, type Patch } from 'immer';
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
import { DependencyGraph, type ReadonlyDependencyGraph } from './dag/DependencyGraph.js';
import { validateDirty, BimValidationError, auditDocumentState, type RuleViolation } from './rules.js';
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

interface ActiveTransactionBuffer {
  readonly label: string;
  readonly steps: {
    readonly patches: readonly Patch[];
    readonly inversePatches: readonly Patch[];
    readonly changed: readonly ElementId[];
  }[];
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
  private activeTransaction: ActiveTransactionBuffer | null = null;

  public constructor(initialState?: BimState, initialDag?: DependencyGraph) {
    this.state = initialState ?? BimDocument.createEmptyState();
    this.history = new HistoryStack();
    this._dag = initialDag ?? DependencyGraph.build(this.state);
  }

  /**
   * Crée un clone léger et isolé en mémoire pour l'exécution en bac à sable (ADR-073).
   * Partage structurellement l'état immuable courant et clone le DAG en Copy-On-Write,
   * avec un historique vierge et sans copier les abonnés (listeners).
   */
  public cloneForSandbox(): BimDocument {
    return new BimDocument(this.state, this._dag.clone());
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
   * Retourne l'instance active du graphe de dépendances en lecture seule (ADR-041 / Audit P1.2).
   */
  public getDependencyGraph(): ReadonlyDependencyGraph {
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

    if (this.activeTransaction !== null) {
      this.activeTransaction.steps.push({
        patches,
        inversePatches,
        changed,
      });
    } else {
      // Enregistrer la transaction dans l'historique
      this.history.push({
        patches,
        inversePatches,
        changed,
      });

      // Notifier les écouteurs
      this.notifySubscribers(changed);
    }

    return {
      changed,
      patches,
      inversePatches,
    };
  }

  /**
   * Exécute un lot séquentiel de commandes au sein d'une transaction atomique unique (ADR-073).
   * Chaque sous-commande s'exécute sur un état Immer commis (compatibilité ADR-062 / LazyWallResolutionIndex).
   * En cas de succès, les patchs sont fusionnés en une seule entrée d'historique (inversePatches en ordre inverse)
   * et les abonnés ne sont notifiés qu'une seule fois avec l'union dédupliquée des identifiants modifiés.
   */
  public runTransaction(label: string, fn: (doc: this) => void): CommandResult {
    if (this.activeTransaction !== null) {
      throw new BimValidationError(
        'NESTED_TRANSACTION',
        `Cannot start nested transaction "${label}" while transaction "${this.activeTransaction.label}" is active.`,
      );
    }

    const stateBefore = this.state;
    const dagBefore = this._dag;
    const txBuffer: ActiveTransactionBuffer = { label, steps: [] };
    this.activeTransaction = txBuffer;

    try {
      fn(this);

      if (txBuffer.steps.length === 0) {
        return {
          changed: [],
          patches: [],
          inversePatches: [],
        };
      }

      const allPatches: Patch[] = [];
      const allInversePatches: Patch[] = [];
      const seenChanged = new Set<ElementId>();
      const unionChanged: ElementId[] = [];

      for (const step of txBuffer.steps) {
        allPatches.push(...step.patches);
        for (const id of step.changed) {
          if (!seenChanged.has(id)) {
            seenChanged.add(id);
            unionChanged.push(id);
          }
        }
      }

      // Concaténation impérative en ordre inverse pour que undo() annule l'étape N avant N-1
      for (let i = txBuffer.steps.length - 1; i >= 0; i--) {
        const step = txBuffer.steps[i];
        if (step) {
          allInversePatches.push(...step.inversePatches);
        }
      }

      this.history.push({
        patches: allPatches,
        inversePatches: allInversePatches,
        changed: unionChanged,
        label,
      });

      this.notifySubscribers(unionChanged);

      return {
        changed: unionChanged,
        patches: allPatches,
        inversePatches: allInversePatches,
      };
    } catch (err) {
      this.state = stateBefore;
      this._dag = dagBefore;
      throw err;
    } finally {
      this.activeTransaction = null;
    }
  }

  /**
   * Annule la dernière commande exécutée (Contrat d'atomicité transactionnelle ADR-070).
   * Valide l'état et le graphe de dépendances avant toute mutation.
   */
  public undo(): boolean {
    if (this.activeTransaction !== null) {
      throw new BimValidationError(
        'NESTED_TRANSACTION',
        `Cannot call undo() while transaction "${this.activeTransaction.label}" is active.`,
      );
    }
    const entry = this.history.peekUndo();
    if (!entry) return false;

    // 1. Calcul du nouvel état sans muter this.state
    const nextState = applyPatches(this.state, entry.inversePatches as Patch[]) as BimState;

    // 2. Synchronisation et validation du graphe de dépendances sur un clone / reconstruction
    let nextDag: DependencyGraph;
    if (hasStructuralOrCrossLevelChanges(entry.changed, this.state, nextState)) {
      nextDag = DependencyGraph.build(nextState);
    } else {
      nextDag = this._dag.clone();
      nextDag.updateElements(entry.changed, this.state, nextState);
    }

    if (nextDag.hasCycle()) {
      const cycle = nextDag.findCycleNodes();
      throw new BimValidationError(
        'DEPENDENCY_CYCLE',
        `Cycle de dépendances détecté lors de l'annulation (undo) : ${cycle.join(' -> ')}`,
      );
    }

    // 3. Bascule atomique : toutes les étapes ayant réussi, on committe
    this.history.commitUndo();
    this.state = nextState;
    this._dag = nextDag;

    this.notifySubscribers(entry.changed);
    return true;
  }

  /**
   * Rétablit la dernière commande annulée (Contrat d'atomicité transactionnelle ADR-070).
   * Valide l'état et le graphe de dépendances avant toute mutation.
   */
  public redo(): boolean {
    if (this.activeTransaction !== null) {
      throw new BimValidationError(
        'NESTED_TRANSACTION',
        `Cannot call redo() while transaction "${this.activeTransaction.label}" is active.`,
      );
    }
    const entry = this.history.peekRedo();
    if (!entry) return false;

    // 1. Calcul du nouvel état sans muter this.state
    const nextState = applyPatches(this.state, entry.patches as Patch[]) as BimState;

    // 2. Synchronisation et validation du graphe de dépendances sur un clone / reconstruction
    let nextDag: DependencyGraph;
    if (hasStructuralOrCrossLevelChanges(entry.changed, this.state, nextState)) {
      nextDag = DependencyGraph.build(nextState);
    } else {
      nextDag = this._dag.clone();
      nextDag.updateElements(entry.changed, this.state, nextState);
    }

    if (nextDag.hasCycle()) {
      const cycle = nextDag.findCycleNodes();
      throw new BimValidationError(
        'DEPENDENCY_CYCLE',
        `Cycle de dépendances détecté lors du rétablissement (redo) : ${cycle.join(' -> ')}`,
      );
    }

    // 3. Bascule atomique : toutes les étapes ayant réussi, on committe
    this.history.commitRedo();
    this.state = nextState;
    this._dag = nextDag;

    this.notifySubscribers(entry.changed);
    return true;
  }

  public canUndo(): boolean {
    return this.history.canUndo();
  }

  public canRedo(): boolean {
    return this.history.canRedo();
  }

  public getUndoCount(): number {
    return this.history.getUndoCount();
  }

  public getRedoCount(): number {
    return this.history.getRedoCount();
  }

  public getUndoLabel(): string | undefined {
    return this.history.peekUndo()?.label;
  }

  public getRedoLabel(): string | undefined {
    return this.history.peekRedo()?.label;
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
   * Exécute un diagnostic passif complet de la maquette (ADR-070).
   * Retourne la liste des anomalies géométriques et métier (avertissements non-bloquants)
   * sans altérer l'état documentaire.
   */
  public getValidationIssues(): readonly RuleViolation[] {
    return auditDocumentState(this.state);
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
