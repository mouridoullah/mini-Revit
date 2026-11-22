/**
 * @tabax/core/mep/commands/topology
 *
 * Commandes transactionnelles pour la topologie de réseau MEP (ConnectPorts, DisconnectPorts)
 * et les commandes polymorphiques (DeleteMepElement, UpdateMepElement).
 */

import type { Command } from '../../commands/base.js';
import type { BimState, ElementId } from '../../types.js';
import { BimValidationError } from '../../rules/types.js';
import type {
  Connector,
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
} from '../types.js';
import { MepNetworkGraph } from '../graph.js';
import { getMepElementKind } from './helpers.js';
import {
  DeletePipeCommand,
  UpdatePipeCommand,
  DeleteDuctCommand,
  UpdateDuctCommand,
  DeleteCableTrayCommand,
  UpdateCableTrayCommand,
} from './segments.js';
import {
  DeleteMepFittingCommand,
  UpdateMepFittingCommand,
  DeleteMepEquipmentCommand,
  UpdateMepEquipmentCommand,
} from './fittings.js';

// ============================================================================
// 7. Connexions Topologiques (ConnectPorts / DisconnectPorts)
// ============================================================================

export class ConnectPortsCommand implements Command {
  public readonly name = 'ConnectPorts';

  public constructor(public readonly connector: Connector) {}

  public apply(draft: BimState): void {
    if (draft.mepConnectors?.[this.connector.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Connector "${this.connector.id}" already exists.`);
    }

    // Utilise MepNetworkGraph pour valider toutes les règles topologiques
    const graph = MepNetworkGraph.build(draft);
    const portA = graph.getPort(this.connector.portAId);
    const portB = graph.getPort(this.connector.portBId);

    if (!portA || !portB) {
      throw new BimValidationError(
        'MEP_PORT_NOT_FOUND',
        `Cannot connect ports: "${!portA ? this.connector.portAId : this.connector.portBId}" not found.`,
      );
    }

    const val = graph.validateConnection(portA, portB);
    if (!val.valid) {
      throw new BimValidationError(val.code ?? 'INVALID_MEP_CONNECTION', val.reason ?? 'Invalid connection');
    }

    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});
    mepConnectors[this.connector.id] = this.connector;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.connector.id, this.connector.portAId, this.connector.portBId];
  }
}

export class DisconnectPortsCommand implements Command {
  public readonly name = 'DisconnectPorts';
  private changedIds: ElementId[] = [];

  public constructor(public readonly connectorId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.mepConnectors?.[this.connectorId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Connector "${this.connectorId}" not found.`);
    }
    this.changedIds = [this.connectorId, existing.portAId, existing.portBId];
    if (draft.mepConnectors) {
      Reflect.deleteProperty(draft.mepConnectors, this.connectorId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.connectorId];
  }
}

// ============================================================================
// 8. Commandes Polymorphiques d'Élément MEP (UI Inspector & Generic Tools)
// ============================================================================

/**
 * Commande polymorphique permettant la suppression de n'importe quel élément technique MEP
 * (tuyau, gaine, chemin de câbles, raccord, équipement) en purgeant automatiquement
 * les connecteurs incidents et les références de systèmes.
 */
export class DeleteMepElementCommand implements Command {
  public readonly name = 'DeleteMepElement';
  private delegate: Command | null = null;

  public constructor(public readonly elementId: ElementId) {}

  public apply(draft: BimState): void {
    const kind = getMepElementKind(draft, this.elementId);
    if (!kind) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MEP Element "${this.elementId}" not found.`);
    }

    switch (kind) {
      case 'pipe':
        this.delegate = new DeletePipeCommand(this.elementId);
        break;
      case 'duct':
        this.delegate = new DeleteDuctCommand(this.elementId);
        break;
      case 'cableTray':
        this.delegate = new DeleteCableTrayCommand(this.elementId);
        break;
      case 'mepFitting':
        this.delegate = new DeleteMepFittingCommand(this.elementId);
        break;
      case 'mepEquipment':
        this.delegate = new DeleteMepEquipmentCommand(this.elementId);
        break;
    }

    this.delegate.apply(draft);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.delegate ? this.delegate.getChangedIds() : [this.elementId];
  }
}

/**
 * Commande polymorphique permettant la mise à jour partielle des attributs d'un élément MEP.
 */
export class UpdateMepElementCommand implements Command {
  public readonly name = 'UpdateMepElement';
  private delegate: Command | null = null;

  public constructor(
    public readonly elementId: ElementId,
    public readonly patch: Partial<Pipe | Duct | CableTray | MepFitting | MepEquipment>,
  ) {}

  public apply(draft: BimState): void {
    const kind = getMepElementKind(draft, this.elementId);
    if (!kind) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MEP Element "${this.elementId}" not found.`);
    }

    switch (kind) {
      case 'pipe': {
        this.delegate = new UpdatePipeCommand(this.elementId, this.patch as Partial<Pipe>);
        break;
      }
      case 'duct': {
        this.delegate = new UpdateDuctCommand(this.elementId, this.patch as Partial<Duct>);
        break;
      }
      case 'cableTray': {
        this.delegate = new UpdateCableTrayCommand(this.elementId, this.patch as Partial<CableTray>);
        break;
      }
      case 'mepFitting': {
        this.delegate = new UpdateMepFittingCommand(this.elementId, this.patch as Partial<MepFitting>);
        break;
      }
      case 'mepEquipment': {
        this.delegate = new UpdateMepEquipmentCommand(this.elementId, this.patch as Partial<MepEquipment>);
        break;
      }
    }

    this.delegate.apply(draft);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.delegate ? this.delegate.getChangedIds() : [this.elementId];
  }
}
