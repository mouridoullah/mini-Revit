/**
 * @tabax/core/mep/commands
 *
 * Commandes transactionnelles de mutation pour les entités et réseaux techniques MEP.
 * Conformes à l'architecture transactionnelle réversible BimDocument (Command + Immer).
 */

import type { Command } from '../commands/base.js';
import type { BimState, ElementId } from '../types.js';
import { generateId } from '../ids.js';
import { BimValidationError } from '../rules/types.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
  MepSystem,
  Connector,
  Point3D,
  Vector3D,
  Port,
} from './types.js';
import {
  point3D,
  vector3D,
  distance3D,
  normalize3D,
  directionBetweenPoints,
} from './math3d.js';
import {
  createPipe,
  createDuct,
  createCableTray,
  createMepFitting,
  createPort,
} from './catalog.js';
import type { RoutePlan } from './routing.js';
import { MEP_ROUTING_CONSTANTS } from './routing.js';
import { MepNetworkGraph } from './graph.js';
import {
  checkPipeViolations,
  checkDuctViolations,
  checkCableTrayViolations,
  checkMepFittingViolations,
  checkMepEquipmentViolations,
  checkMepSystemViolations,
} from './rules.js';

// Helper interne pour détacher les connecteurs incidents lors de la suppression d'un élément
function detachIncidentConnectors(draft: BimState, portIds: Set<ElementId>): ElementId[] {
  const detached: ElementId[] = [];
  if (draft.mepConnectors) {
    for (const [connId, conn] of Object.entries(draft.mepConnectors)) {
      if (conn && (portIds.has(conn.portAId) || portIds.has(conn.portBId))) {
        detached.push(connId);
        Reflect.deleteProperty(draft.mepConnectors, connId);
      }
    }
  }
  return detached;
}

// Helper pour retirer un élément des systèmes
function removeElementFromSystems(draft: BimState, elementId: ElementId): void {
  if (draft.mepSystems) {
    for (const sys of Object.values(draft.mepSystems)) {
      if (sys && sys.elementIds.includes(elementId)) {
        const updated = {
          ...sys,
          elementIds: sys.elementIds.filter((id) => id !== elementId),
        };
        draft.mepSystems[sys.id] = updated;
      }
    }
  }
}

// ============================================================================
// 1. Tuyauterie (Pipe)
// ============================================================================

export class AddPipeCommand implements Command {
  public readonly name = 'AddPipe';

  public constructor(public readonly pipe: Pipe) {}

  public apply(draft: BimState): void {
    if (draft.pipes?.[this.pipe.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Pipe with ID "${this.pipe.id}" already exists.`);
    }
    const violations = checkPipeViolations(this.pipe, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_PIPE', violations[0]?.message ?? 'Invalid pipe');
    }
    const pipes = ((draft as { pipes: Record<ElementId, Pipe> }).pipes ??= {});
    pipes[this.pipe.id] = this.pipe;
    if (this.pipe.systemId && draft.mepSystems?.[this.pipe.systemId]) {
      const sys = draft.mepSystems[this.pipe.systemId];
      if (sys && !sys.elementIds.includes(this.pipe.id)) {
        draft.mepSystems[this.pipe.systemId] = {
          ...sys,
          elementIds: [...sys.elementIds, this.pipe.id],
        };
      }
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.pipe.id, ...(this.pipe.systemId ? [this.pipe.systemId] : [])];
  }
}

export class UpdatePipeCommand implements Command {
  public readonly name = 'UpdatePipe';

  public constructor(
    public readonly pipeId: ElementId,
    public readonly patch: Partial<Omit<Pipe, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.pipes?.[this.pipeId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${this.pipeId}" not found.`);
    }
    const updated: Pipe = {
      ...existing,
      ...this.patch,
      id: this.pipeId,
      category: 'pipe',
    };
    const violations = checkPipeViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_PIPE', violations[0]?.message ?? 'Invalid pipe');
    }
    const pipes = ((draft as { pipes: Record<ElementId, Pipe> }).pipes ??= {});
    pipes[this.pipeId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.pipeId];
  }
}

export class DeletePipeCommand implements Command {
  public readonly name = 'DeletePipe';
  private changedIds: ElementId[] = [];

  public constructor(public readonly pipeId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.pipes?.[this.pipeId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${this.pipeId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.pipeId);
    if (draft.pipes) {
      Reflect.deleteProperty(draft.pipes, this.pipeId);
    }
    this.changedIds = [this.pipeId, ...detached, ...(existing.systemId ? [existing.systemId] : [])];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.pipeId];
  }
}

// ============================================================================
// 2. Gaine Aéraulique (Duct)
// ============================================================================

export class AddDuctCommand implements Command {
  public readonly name = 'AddDuct';

  public constructor(public readonly duct: Duct) {}

  public apply(draft: BimState): void {
    if (draft.ducts?.[this.duct.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Duct with ID "${this.duct.id}" already exists.`);
    }
    const violations = checkDuctViolations(this.duct, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_DUCT', violations[0]?.message ?? 'Invalid duct');
    }
    const ducts = ((draft as { ducts: Record<ElementId, Duct> }).ducts ??= {});
    ducts[this.duct.id] = this.duct;
    if (this.duct.systemId && draft.mepSystems?.[this.duct.systemId]) {
      const sys = draft.mepSystems[this.duct.systemId];
      if (sys && !sys.elementIds.includes(this.duct.id)) {
        draft.mepSystems[this.duct.systemId] = {
          ...sys,
          elementIds: [...sys.elementIds, this.duct.id],
        };
      }
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.duct.id, ...(this.duct.systemId ? [this.duct.systemId] : [])];
  }
}

export class UpdateDuctCommand implements Command {
  public readonly name = 'UpdateDuct';

  public constructor(
    public readonly ductId: ElementId,
    public readonly patch: Partial<Omit<Duct, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.ducts?.[this.ductId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${this.ductId}" not found.`);
    }
    const updated: Duct = {
      ...existing,
      ...this.patch,
      id: this.ductId,
      category: 'duct',
    };
    const violations = checkDuctViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_DUCT', violations[0]?.message ?? 'Invalid duct');
    }
    const ducts = ((draft as { ducts: Record<ElementId, Duct> }).ducts ??= {});
    ducts[this.ductId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.ductId];
  }
}

export class DeleteDuctCommand implements Command {
  public readonly name = 'DeleteDuct';
  private changedIds: ElementId[] = [];

  public constructor(public readonly ductId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.ducts?.[this.ductId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${this.ductId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.ductId);
    if (draft.ducts) {
      Reflect.deleteProperty(draft.ducts, this.ductId);
    }
    this.changedIds = [this.ductId, ...detached, ...(existing.systemId ? [existing.systemId] : [])];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.ductId];
  }
}

// ============================================================================
// 3. Chemin de Câbles (CableTray)
// ============================================================================

export class AddCableTrayCommand implements Command {
  public readonly name = 'AddCableTray';

  public constructor(public readonly cableTray: CableTray) {}

  public apply(draft: BimState): void {
    if (draft.cableTrays?.[this.cableTray.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Cable tray "${this.cableTray.id}" already exists.`);
    }
    const violations = checkCableTrayViolations(this.cableTray, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_TRAY', violations[0]?.message ?? 'Invalid tray');
    }
    const cableTrays = ((draft as { cableTrays: Record<ElementId, CableTray> }).cableTrays ??= {});
    cableTrays[this.cableTray.id] = this.cableTray;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.cableTray.id];
  }
}

export class UpdateCableTrayCommand implements Command {
  public readonly name = 'UpdateCableTray';

  public constructor(
    public readonly cableTrayId: ElementId,
    public readonly patch: Partial<Omit<CableTray, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.cableTrays?.[this.cableTrayId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Cable tray "${this.cableTrayId}" not found.`);
    }
    const updated: CableTray = {
      ...existing,
      ...this.patch,
      id: this.cableTrayId,
      category: 'cableTray',
    };
    const violations = checkCableTrayViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_TRAY', violations[0]?.message ?? 'Invalid tray');
    }
    const cableTrays = ((draft as { cableTrays: Record<ElementId, CableTray> }).cableTrays ??= {});
    cableTrays[this.cableTrayId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.cableTrayId];
  }
}

export class DeleteCableTrayCommand implements Command {
  public readonly name = 'DeleteCableTray';
  private changedIds: ElementId[] = [];

  public constructor(public readonly cableTrayId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.cableTrays?.[this.cableTrayId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Cable tray "${this.cableTrayId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.cableTrayId);
    if (draft.cableTrays) {
      Reflect.deleteProperty(draft.cableTrays, this.cableTrayId);
    }
    this.changedIds = [this.cableTrayId, ...detached];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.cableTrayId];
  }
}

// ============================================================================
// 4. Raccords (MepFitting)
// ============================================================================

export class AddMepFittingCommand implements Command {
  public readonly name = 'AddMepFitting';

  public constructor(public readonly fitting: MepFitting) {}

  public apply(draft: BimState): void {
    if (draft.mepFittings?.[this.fitting.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Fitting "${this.fitting.id}" already exists.`);
    }
    const violations = checkMepFittingViolations(this.fitting, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_FITTING', violations[0]?.message ?? 'Invalid fitting');
    }
    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[this.fitting.id] = this.fitting;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.fitting.id];
  }
}

export class UpdateMepFittingCommand implements Command {
  public readonly name = 'UpdateMepFitting';

  public constructor(
    public readonly fittingId: ElementId,
    public readonly patch: Partial<Omit<MepFitting, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.mepFittings?.[this.fittingId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Fitting "${this.fittingId}" not found.`);
    }
    const updated: MepFitting = {
      ...existing,
      ...this.patch,
      id: this.fittingId,
      category: 'mepFitting',
    };
    const violations = checkMepFittingViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_FITTING', violations[0]?.message ?? 'Invalid fitting');
    }
    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[this.fittingId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.fittingId];
  }
}

export class DeleteMepFittingCommand implements Command {
  public readonly name = 'DeleteMepFitting';
  private changedIds: ElementId[] = [];

  public constructor(public readonly fittingId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.mepFittings?.[this.fittingId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Fitting "${this.fittingId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.fittingId);
    if (draft.mepFittings) {
      Reflect.deleteProperty(draft.mepFittings, this.fittingId);
    }
    this.changedIds = [this.fittingId, ...detached];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.fittingId];
  }
}

// ============================================================================
// 5. Équipements Techniques (MepEquipment)
// ============================================================================

export class AddMepEquipmentCommand implements Command {
  public readonly name = 'AddMepEquipment';

  public constructor(public readonly equipment: MepEquipment) {}

  public apply(draft: BimState): void {
    if (draft.mepEquipments?.[this.equipment.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `Equipment "${this.equipment.id}" already exists.`);
    }
    const violations = checkMepEquipmentViolations(this.equipment, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_EQUIPMENT', violations[0]?.message ?? 'Invalid equipment');
    }
    const mepEquipments = ((draft as { mepEquipments: Record<ElementId, MepEquipment> }).mepEquipments ??= {});
    mepEquipments[this.equipment.id] = this.equipment;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.equipment.id];
  }
}

export class UpdateMepEquipmentCommand implements Command {
  public readonly name = 'UpdateMepEquipment';

  public constructor(
    public readonly equipmentId: ElementId,
    public readonly patch: Partial<Omit<MepEquipment, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.mepEquipments?.[this.equipmentId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Equipment "${this.equipmentId}" not found.`);
    }
    const updated: MepEquipment = {
      ...existing,
      ...this.patch,
      id: this.equipmentId,
      category: 'mepEquipment',
    };
    const violations = checkMepEquipmentViolations(updated, draft);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_EQUIPMENT', violations[0]?.message ?? 'Invalid equipment');
    }
    const mepEquipments = ((draft as { mepEquipments: Record<ElementId, MepEquipment> }).mepEquipments ??= {});
    mepEquipments[this.equipmentId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.equipmentId];
  }
}

export class DeleteMepEquipmentCommand implements Command {
  public readonly name = 'DeleteMepEquipment';
  private changedIds: ElementId[] = [];

  public constructor(public readonly equipmentId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.mepEquipments?.[this.equipmentId];
    if (!existing) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Equipment "${this.equipmentId}" not found.`);
    }
    const portIds = new Set(existing.ports.map((p) => p.id));
    const detached = detachIncidentConnectors(draft, portIds);
    removeElementFromSystems(draft, this.equipmentId);
    if (draft.mepEquipments) {
      Reflect.deleteProperty(draft.mepEquipments, this.equipmentId);
    }
    this.changedIds = [this.equipmentId, ...detached];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.equipmentId];
  }
}

// ============================================================================
// 6. Systèmes MEP (MepSystem)
// ============================================================================

export class CreateMepSystemCommand implements Command {
  public readonly name = 'CreateMepSystem';

  public constructor(public readonly system: MepSystem) {}

  public apply(draft: BimState): void {
    if (draft.mepSystems?.[this.system.id]) {
      throw new BimValidationError('ELEMENT_ALREADY_EXISTS', `MepSystem "${this.system.id}" already exists.`);
    }
    const violations = checkMepSystemViolations(this.system);
    if (violations.length > 0) {
      throw new BimValidationError(violations[0]?.code ?? 'INVALID_SYSTEM', violations[0]?.message ?? 'Invalid system');
    }
    const mepSystems = ((draft as { mepSystems: Record<ElementId, MepSystem> }).mepSystems ??= {});
    mepSystems[this.system.id] = this.system;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.system.id];
  }
}

export class AssignToMepSystemCommand implements Command {
  public readonly name = 'AssignToMepSystem';

  public constructor(
    public readonly systemId: ElementId,
    public readonly elementIds: readonly ElementId[],
  ) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    const updatedIds = new Set(sys.elementIds);
    for (const id of this.elementIds) {
      updatedIds.add(id);
      // Affectation bidirectionnelle sur les entités
      if (draft.pipes?.[id]) draft.pipes[id] = { ...draft.pipes[id], systemId: this.systemId };
      if (draft.ducts?.[id]) draft.ducts[id] = { ...draft.ducts[id], systemId: this.systemId };
      if (draft.cableTrays?.[id]) draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: this.systemId };
      if (draft.mepFittings?.[id]) draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: this.systemId };
      if (draft.mepEquipments?.[id]) draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: this.systemId };
    }
    draft.mepSystems[this.systemId] = {
      ...sys,
      elementIds: Array.from(updatedIds),
    };
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.systemId, ...this.elementIds];
  }
}

export class RemoveFromMepSystemCommand implements Command {
  public readonly name = 'RemoveFromMepSystem';

  public constructor(
    public readonly systemId: ElementId,
    public readonly elementIds: readonly ElementId[],
  ) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    const toRemove = new Set(this.elementIds);
    draft.mepSystems[this.systemId] = {
      ...sys,
      elementIds: sys.elementIds.filter((id) => !toRemove.has(id)),
    };
    for (const id of this.elementIds) {
      if (draft.pipes?.[id]?.systemId === this.systemId) {
        draft.pipes[id] = { ...draft.pipes[id], systemId: undefined };
      }
      if (draft.ducts?.[id]?.systemId === this.systemId) {
        draft.ducts[id] = { ...draft.ducts[id], systemId: undefined };
      }
      if (draft.cableTrays?.[id]?.systemId === this.systemId) {
        draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: undefined };
      }
      if (draft.mepFittings?.[id]?.systemId === this.systemId) {
        draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: undefined };
      }
      if (draft.mepEquipments?.[id]?.systemId === this.systemId) {
        draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: undefined };
      }
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.systemId, ...this.elementIds];
  }
}

export class DeleteMepSystemCommand implements Command {
  public readonly name = 'DeleteMepSystem';
  private changedIds: ElementId[] = [];

  public constructor(public readonly systemId: ElementId) {}

  public apply(draft: BimState): void {
    const sys = draft.mepSystems?.[this.systemId];
    if (!sys) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `MepSystem "${this.systemId}" not found.`);
    }
    // Dégagement du systemId sur les éléments rattachés
    for (const id of sys.elementIds) {
      if (draft.pipes?.[id]?.systemId === this.systemId) draft.pipes[id] = { ...draft.pipes[id], systemId: undefined };
      if (draft.ducts?.[id]?.systemId === this.systemId) draft.ducts[id] = { ...draft.ducts[id], systemId: undefined };
      if (draft.cableTrays?.[id]?.systemId === this.systemId) draft.cableTrays[id] = { ...draft.cableTrays[id], systemId: undefined };
      if (draft.mepFittings?.[id]?.systemId === this.systemId) draft.mepFittings[id] = { ...draft.mepFittings[id], systemId: undefined };
      if (draft.mepEquipments?.[id]?.systemId === this.systemId) draft.mepEquipments[id] = { ...draft.mepEquipments[id], systemId: undefined };
    }
    this.changedIds = [this.systemId, ...sys.elementIds];
    if (draft.mepSystems) {
      Reflect.deleteProperty(draft.mepSystems, this.systemId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds.length > 0 ? this.changedIds : [this.systemId];
  }
}

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

export type MepElementKind = 'pipe' | 'duct' | 'cableTray' | 'mepFitting' | 'mepEquipment';

export function getMepElementKind(state: BimState, id: ElementId): MepElementKind | null {
  if (state.pipes?.[id]) return 'pipe';
  if (state.ducts?.[id]) return 'duct';
  if (state.cableTrays?.[id]) return 'cableTray';
  if (state.mepFittings?.[id]) return 'mepFitting';
  if (state.mepEquipments?.[id]) return 'mepEquipment';
  return null;
}

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

// ============================================================================
// 9. Commandes de Routage et Insertion Paramétrique de Raccords (Sous-phase 9.3.3)
// ============================================================================

/**
 * Matérialise un tracé multi-tronçons calculé par le solveur de routage (RoutePlan)
 * en créant de façon transactionnelle tous les segments, raccords (elbow, transition)
 * et connecteurs requis.
 */
export class RouteMepPathCommand implements Command {
  public readonly name = 'RouteMepPath';
  private changedIds: ElementId[] = [];

  public constructor(public readonly plan: RoutePlan) {}

  public apply(draft: BimState): void {
    if (this.plan.diagnostics.status === 'rejected') {
      throw new BimValidationError(
        this.plan.diagnostics.code,
        `Cannot execute rejected route plan: ${this.plan.diagnostics.message}`,
      );
    }

    const changed = new Set<ElementId>();

    // 1. Instancier les segments du plan
    for (const seg of this.plan.segments) {
      changed.add(seg.id);
      if (seg.category === 'pipe') {
        const pipe = createPipe({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          diameter: seg.diameter ?? 32,
          domain: seg.domain === 'hydronic' ? 'hydronic' : 'plumbing',
          systemType: seg.systemType as 'domestic_cold_water',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const pipes = ((draft as { pipes: Record<ElementId, Pipe> }).pipes ??= {});
        pipes[pipe.id] = pipe;
      } else if (seg.category === 'duct') {
        const duct = createDuct({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          shape: seg.shape ?? 'rectangular',
          ...(seg.diameter !== undefined ? { diameter: seg.diameter } : {}),
          ...(seg.width !== undefined ? { width: seg.width } : {}),
          ...(seg.height !== undefined ? { height: seg.height } : {}),
          systemType: seg.systemType as 'supply_air',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const ducts = ((draft as { ducts: Record<ElementId, Duct> }).ducts ??= {});
        ducts[duct.id] = duct;
      } else if (seg.category === 'cableTray') {
        const tray = createCableTray({
          id: seg.id,
          levelId: seg.levelId,
          ...(seg.systemId ? { systemId: seg.systemId } : {}),
          start: seg.start,
          end: seg.end,
          width: seg.width ?? 150,
          height: seg.height ?? 50,
          systemType: seg.systemType as 'power',
          port0Id: seg.port0Id,
          port1Id: seg.port1Id,
        });
        const trays = ((draft as { cableTrays: Record<ElementId, CableTray> }).cableTrays ??= {});
        trays[tray.id] = tray;
      }

      // Enregistrement dans le système MEP
      if (seg.systemId && draft.mepSystems?.[seg.systemId]) {
        const sys = draft.mepSystems[seg.systemId];
        if (sys && !sys.elementIds.includes(seg.id)) {
          draft.mepSystems[seg.systemId] = {
            ...sys,
            elementIds: [...sys.elementIds, seg.id],
          };
          changed.add(seg.systemId);
        }
      }
    }

    // 2. Instancier les raccords
    for (const fit of this.plan.fittings) {
      changed.add(fit.id);
      const fitting = createMepFitting({
        id: fit.id,
        levelId: fit.levelId,
        ...(fit.systemId ? { systemId: fit.systemId } : {}),
        fittingType: fit.fittingType,
        domain: fit.domain,
        systemType: fit.systemType,
        position: fit.position,
        ports: fit.ports,
      });
      const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
      mepFittings[fitting.id] = fitting;

      if (fit.systemId && draft.mepSystems?.[fit.systemId]) {
        const sys = draft.mepSystems[fit.systemId];
        if (sys && !sys.elementIds.includes(fit.id)) {
          draft.mepSystems[fit.systemId] = {
            ...sys,
            elementIds: [...sys.elementIds, fit.id],
          };
          changed.add(fit.systemId);
        }
      }
    }

    // 3. Instancier les connecteurs
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});
    for (const conn of this.plan.connectors) {
      changed.add(conn.id);
      changed.add(conn.portAId);
      changed.add(conn.portBId);
      mepConnectors[conn.id] = {
        id: conn.id,
        category: 'mepConnector',
        portAId: conn.portAId,
        portBId: conn.portBId,
        ...(this.plan.request.systemId ? { systemId: this.plan.request.systemId } : {}),
      };
    }

    this.changedIds = Array.from(changed);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

export interface InsertTeeBranchOptions {
  readonly hostSegmentId: ElementId;
  readonly splitPoint: Point3D;
  readonly branchData?: {
    readonly endPoint: Point3D;
    readonly diameter?: number | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  } | undefined;
  readonly branchPortId?: ElementId | undefined;
  readonly teeId?: ElementId | undefined;
}

/**
 * Pique un Té de dérivation dans un segment linéaire existant (tuyau, gaine, chemin de câbles).
 * Découpe atomiquement le segment hôte en 2 sous-segments, insère le té, réassigne les connecteurs
 * incidents et met à jour l'appartenance au système fluide.
 */
export class InsertTeeBranchCommand implements Command {
  public readonly name = 'InsertTeeBranch';
  private changedIds: ElementId[] = [];

  public constructor(public readonly options: InsertTeeBranchOptions) {}

  public apply(draft: BimState): void {
    const { hostSegmentId, splitPoint } = this.options;
    const kind = getMepElementKind(draft, hostSegmentId);
    if (!kind || (kind !== 'pipe' && kind !== 'duct' && kind !== 'cableTray')) {
      throw new BimValidationError('ELEMENT_NOT_FOUND', `Linear MEP host segment "${hostSegmentId}" not found.`);
    }

    let hostStart: Point3D;
    let hostEnd: Point3D;
    let hostPorts: readonly Port[];
    let hostSystemId: ElementId | undefined;
    let hostLevelId: ElementId;

    if (kind === 'pipe') {
      const p = draft.pipes?.[hostSegmentId];
      if (!p) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${hostSegmentId}" not found.`);
      hostStart = p.start;
      hostEnd = p.end;
      hostPorts = p.ports;
      hostSystemId = p.systemId;
      hostLevelId = p.levelId;
    } else if (kind === 'duct') {
      const d = draft.ducts?.[hostSegmentId];
      if (!d) throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${hostSegmentId}" not found.`);
      hostStart = d.start;
      hostEnd = d.end;
      hostPorts = d.ports;
      hostSystemId = d.systemId;
      hostLevelId = d.levelId;
    } else {
      const c = draft.cableTrays?.[hostSegmentId];
      if (!c) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTray "${hostSegmentId}" not found.`);
      hostStart = c.start;
      hostEnd = c.end;
      hostPorts = c.ports;
      hostSystemId = c.systemId;
      hostLevelId = c.levelId;
    }

    // Projection de splitPoint sur l'axe du segment hôte
    const vx = hostEnd.x - hostStart.x;
    const vy = hostEnd.y - hostStart.y;
    const vz = hostEnd.z - hostStart.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    const len = Math.sqrt(lenSq);

    if (len < 1e-4) {
      throw new BimValidationError('SEGMENT_TOO_SHORT', 'Host segment is degenerate.');
    }

    const ux = splitPoint.x - hostStart.x;
    const uy = splitPoint.y - hostStart.y;
    const uz = splitPoint.z - hostStart.z;
    const t = (ux * vx + uy * vy + uz * vz) / lenSq;

    const projPoint = point3D(
      hostStart.x + t * vx,
      hostStart.y + t * vy,
      hostStart.z + t * vz,
    );

    const distStart = distance3D(projPoint, hostStart);
    const distEnd = distance3D(projPoint, hostEnd);
    const minSegLen = MEP_ROUTING_CONSTANTS.MIN_SEGMENT_LENGTH_MM;

    if (distStart < minSegLen || distEnd < minSegLen || t <= 0.001 || t >= 0.999) {
      throw new BimValidationError(
        'TEE_TOO_CLOSE_TO_ENDPOINT',
        `Split point is too close to host segment endpoints (${Math.round(distStart)} mm and ${Math.round(distEnd)} mm, minimum required: ${minSegLen} mm).`,
      );
    }

    const changed = new Set<ElementId>();
    changed.add(hostSegmentId);

    // Propriétés communes
    const domain = hostPorts[0]?.domain ?? 'plumbing';
    const systemType = hostPorts[0]?.systemType ?? 'domestic_cold_water';
    const shape = hostPorts[0]?.shape ?? 'round';
    const diameter = hostPorts[0]?.diameter;
    const width = hostPorts[0]?.width;
    const height = hostPorts[0]?.height;

    // Calcul de la direction de la branche latérale du Té
    let branchDir: Vector3D;
    if (this.options.branchData?.endPoint) {
      branchDir = directionBetweenPoints(projPoint, this.options.branchData.endPoint);
    } else if (this.options.branchPortId) {
      const graph = MepNetworkGraph.build(draft);
      const targetPort = graph.getPort(this.options.branchPortId);
      branchDir = targetPort
        ? directionBetweenPoints(projPoint, targetPort.position)
        : normalize3D(vector3D(-vy, vx, 0));
    } else {
      const horizNorm = Math.hypot(vx, vy);
      branchDir = horizNorm > 1e-4
        ? normalize3D(vector3D(-vy, vx, 0))
        : vector3D(1, 0, 0);
    }

    const dirRunStart = directionBetweenPoints(projPoint, hostStart);
    const dirRunEnd = directionBetweenPoints(projPoint, hostEnd);

    // 1. Création du Raccord Té
    const teeId = this.options.teeId ?? generateId();
    changed.add(teeId);

    const teePort0 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: dirRunStart,
      domain,
      systemType,
      shape,
      ...(diameter !== undefined ? { diameter } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      label: 'TEE_RUN_START',
    });

    const teePort1 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: dirRunEnd,
      domain,
      systemType,
      shape,
      ...(diameter !== undefined ? { diameter } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      label: 'TEE_RUN_END',
    });

    const teePort2 = createPort({
      elementId: teeId,
      position: projPoint,
      direction: branchDir,
      domain,
      systemType,
      shape,
      diameter: this.options.branchData?.diameter ?? diameter,
      width: this.options.branchData?.width ?? width,
      height: this.options.branchData?.height ?? height,
      label: 'TEE_BRANCH',
    });

    const teeFitting = createMepFitting({
      id: teeId,
      levelId: hostLevelId,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
      fittingType: 'tee',
      domain,
      systemType,
      position: projPoint,
      ports: [teePort0, teePort1, teePort2],
    });

    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[teeId] = teeFitting;

    // 2. Création des 2 sous-segments
    const subSeg1Id = generateId();
    const subSeg2Id = generateId();
    changed.add(subSeg1Id);
    changed.add(subSeg2Id);

    let subSeg1Port0Id: ElementId;
    let subSeg1Port1Id: ElementId;
    let subSeg2Port0Id: ElementId;
    let subSeg2Port1Id: ElementId;

    if (kind === 'pipe') {
      const pipes = draft.pipes;
      if (!pipes) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipes collection not found.`);
      const origPipe = pipes[hostSegmentId];
      if (!origPipe) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipe "${hostSegmentId}" not found.`);
      const sub1 = createPipe({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        diameter: origPipe.diameter,
        domain: origPipe.ports[0]?.domain === 'hydronic' ? 'hydronic' : 'plumbing',
        systemType: origPipe.ports[0]?.systemType as 'domestic_cold_water',
        ...(origPipe.thickness !== undefined ? { thickness: origPipe.thickness } : {}),
        ...(origPipe.material ? { material: origPipe.material } : {}),
      });
      const sub2 = createPipe({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        diameter: origPipe.diameter,
        domain: origPipe.ports[1]?.domain === 'hydronic' ? 'hydronic' : 'plumbing',
        systemType: origPipe.ports[1]?.systemType as 'domestic_cold_water',
        ...(origPipe.thickness !== undefined ? { thickness: origPipe.thickness } : {}),
        ...(origPipe.material ? { material: origPipe.material } : {}),
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      pipes[subSeg1Id] = sub1;
      pipes[subSeg2Id] = sub2;
      Reflect.deleteProperty(pipes, hostSegmentId);
    } else if (kind === 'duct') {
      const ducts = draft.ducts;
      if (!ducts) throw new BimValidationError('ELEMENT_NOT_FOUND', `Ducts collection not found.`);
      const origDuct = ducts[hostSegmentId];
      if (!origDuct) throw new BimValidationError('ELEMENT_NOT_FOUND', `Duct "${hostSegmentId}" not found.`);
      const sub1 = createDuct({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        shape: origDuct.shape,
        ...(origDuct.diameter !== undefined ? { diameter: origDuct.diameter } : {}),
        ...(origDuct.width !== undefined ? { width: origDuct.width } : {}),
        ...(origDuct.height !== undefined ? { height: origDuct.height } : {}),
        systemType: origDuct.ports[0]?.systemType as 'supply_air',
      });
      const sub2 = createDuct({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        shape: origDuct.shape,
        ...(origDuct.diameter !== undefined ? { diameter: origDuct.diameter } : {}),
        ...(origDuct.width !== undefined ? { width: origDuct.width } : {}),
        ...(origDuct.height !== undefined ? { height: origDuct.height } : {}),
        systemType: origDuct.ports[1]?.systemType as 'supply_air',
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      ducts[subSeg1Id] = sub1;
      ducts[subSeg2Id] = sub2;
      Reflect.deleteProperty(ducts, hostSegmentId);
    } else {
      const cableTrays = draft.cableTrays;
      if (!cableTrays) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTrays collection not found.`);
      const origTray = cableTrays[hostSegmentId];
      if (!origTray) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTray "${hostSegmentId}" not found.`);
      const sub1 = createCableTray({
        id: subSeg1Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: hostStart,
        end: projPoint,
        width: origTray.width,
        height: origTray.height,
        systemType: origTray.ports[0]?.systemType as 'power',
      });
      const sub2 = createCableTray({
        id: subSeg2Id,
        levelId: hostLevelId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
        start: projPoint,
        end: hostEnd,
        width: origTray.width,
        height: origTray.height,
        systemType: origTray.ports[1]?.systemType as 'power',
      });
      subSeg1Port0Id = sub1.ports[0]?.id ?? '';
      subSeg1Port1Id = sub1.ports[1]?.id ?? '';
      subSeg2Port0Id = sub2.ports[0]?.id ?? '';
      subSeg2Port1Id = sub2.ports[1]?.id ?? '';

      cableTrays[subSeg1Id] = sub1;
      cableTrays[subSeg2Id] = sub2;
      Reflect.deleteProperty(cableTrays, hostSegmentId);
    }

    // 3. Re-câblage des connecteurs incidents de l'ancien segment hôte
    const oldPort0Id = hostPorts[0]?.id;
    const oldPort1Id = hostPorts[1]?.id;

    if (draft.mepConnectors) {
      for (const [connId, conn] of Object.entries(draft.mepConnectors)) {
        if (!conn) continue;
        let touched = false;
        let newPortA = conn.portAId;
        let newPortB = conn.portBId;

        if (conn.portAId === oldPort0Id) {
          newPortA = subSeg1Port0Id;
          touched = true;
        } else if (conn.portAId === oldPort1Id) {
          newPortA = subSeg2Port1Id;
          touched = true;
        }

        if (conn.portBId === oldPort0Id) {
          newPortB = subSeg1Port0Id;
          touched = true;
        } else if (conn.portBId === oldPort1Id) {
          newPortB = subSeg2Port1Id;
          touched = true;
        }

        if (touched) {
          draft.mepConnectors[connId] = {
            ...conn,
            portAId: newPortA,
            portBId: newPortB,
          };
          changed.add(connId);
        }
      }
    }

    // 4. Connecteurs du Té
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});

    const connTee1Id = generateId();
    mepConnectors[connTee1Id] = {
      id: connTee1Id,
      category: 'mepConnector',
      portAId: subSeg1Port1Id,
      portBId: teePort0.id,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
    };
    changed.add(connTee1Id);

    const connTee2Id = generateId();
    mepConnectors[connTee2Id] = {
      id: connTee2Id,
      category: 'mepConnector',
      portAId: teePort1.id,
      portBId: subSeg2Port0Id,
      ...(hostSystemId ? { systemId: hostSystemId } : {}),
    };
    changed.add(connTee2Id);

    // Branche latérale si spécifiée
    if (this.options.branchData) {
      const branchSegId = generateId();
      changed.add(branchSegId);

      let branchPort0Id: ElementId;
      if (kind === 'pipe') {
        const pipes = draft.pipes;
        if (!pipes) throw new BimValidationError('ELEMENT_NOT_FOUND', `Pipes collection not found.`);
        const branchPipe = createPipe({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          diameter: this.options.branchData.diameter ?? diameter ?? 32,
          domain: domain === 'hydronic' ? 'hydronic' : 'plumbing',
          systemType: systemType as 'domestic_cold_water',
        });
        branchPort0Id = branchPipe.ports[0]?.id ?? '';
        pipes[branchSegId] = branchPipe;
      } else if (kind === 'duct') {
        const ducts = draft.ducts;
        if (!ducts) throw new BimValidationError('ELEMENT_NOT_FOUND', `Ducts collection not found.`);
        const branchDuct = createDuct({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          shape,
          ...(this.options.branchData.diameter !== undefined ? { diameter: this.options.branchData.diameter } : {}),
          ...(this.options.branchData.width !== undefined ? { width: this.options.branchData.width } : {}),
          ...(this.options.branchData.height !== undefined ? { height: this.options.branchData.height } : {}),
          systemType: systemType as 'supply_air',
        });
        branchPort0Id = branchDuct.ports[0]?.id ?? '';
        ducts[branchSegId] = branchDuct;
      } else {
        const cableTrays = draft.cableTrays;
        if (!cableTrays) throw new BimValidationError('ELEMENT_NOT_FOUND', `CableTrays collection not found.`);
        const branchTray = createCableTray({
          id: branchSegId,
          levelId: hostLevelId,
          ...(hostSystemId ? { systemId: hostSystemId } : {}),
          start: projPoint,
          end: this.options.branchData.endPoint,
          width: this.options.branchData.width ?? width ?? 150,
          height: this.options.branchData.height ?? height ?? 50,
          systemType: systemType as 'power',
        });
        branchPort0Id = branchTray.ports[0]?.id ?? '';
        cableTrays[branchSegId] = branchTray;
      }

      const connBranchId = generateId();
      mepConnectors[connBranchId] = {
        id: connBranchId,
        category: 'mepConnector',
        portAId: teePort2.id,
        portBId: branchPort0Id,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
      };
      changed.add(connBranchId);

      if (hostSystemId && draft.mepSystems) {
        const sys = draft.mepSystems[hostSystemId];
        if (sys) {
          draft.mepSystems[hostSystemId] = {
            ...sys,
            elementIds: [...sys.elementIds, branchSegId],
          };
        }
      }
    } else if (this.options.branchPortId) {
      const connBranchId = generateId();
      mepConnectors[connBranchId] = {
        id: connBranchId,
        category: 'mepConnector',
        portAId: teePort2.id,
        portBId: this.options.branchPortId,
        ...(hostSystemId ? { systemId: hostSystemId } : {}),
      };
      changed.add(connBranchId);
      changed.add(this.options.branchPortId);
    }

    // 5. Mise à jour de l'appartenance au système
    if (hostSystemId && draft.mepSystems) {
      const sys = draft.mepSystems[hostSystemId];
      if (sys) {
        draft.mepSystems[hostSystemId] = {
          ...sys,
          elementIds: sys.elementIds
            .filter((id) => id !== hostSegmentId)
            .concat([subSeg1Id, subSeg2Id, teeId]),
        };
        changed.add(hostSystemId);
      }
    }

    this.changedIds = Array.from(changed);
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

/**
 * Connecte deux ports de même domaine technique mais de sections ou diamètres différents
 * en insérant automatiquement un raccord paramétrique de type transition (réduction).
 */
export class ConnectWithTransitionCommand implements Command {
  public readonly name = 'ConnectWithTransition';
  private changedIds: ElementId[] = [];

  public constructor(
    public readonly portAId: ElementId,
    public readonly portBId: ElementId,
    public readonly options?: {
      readonly systemId?: ElementId | undefined;
      readonly levelId?: ElementId | undefined;
      readonly transitionId?: ElementId | undefined;
    } | undefined,
  ) {}

  public apply(draft: BimState): void {
    const graph = MepNetworkGraph.build(draft);
    const portA = graph.getPort(this.portAId);
    const portB = graph.getPort(this.portBId);

    if (!portA || !portB) {
      throw new BimValidationError('PORT_NOT_FOUND', 'One or both ports not found.');
    }

    if (portA.domain !== portB.domain) {
      throw new BimValidationError('DOMAIN_MISMATCH', `Incompatible domains: ${portA.domain} vs ${portB.domain}`);
    }

    if (portA.systemType !== portB.systemType) {
      throw new BimValidationError('SYSTEM_TYPE_MISMATCH', `Incompatible system types: ${portA.systemType} vs ${portB.systemType}`);
    }

    const midPoint = point3D(
      (portA.position.x + portB.position.x) / 2,
      (portA.position.y + portB.position.y) / 2,
      (portA.position.z + portB.position.z) / 2,
    );

    const dirAtoB = directionBetweenPoints(portA.position, portB.position);
    const dirBtoA = directionBetweenPoints(portB.position, portA.position);

    const hostA =
      draft.pipes?.[portA.elementId] ??
      draft.ducts?.[portA.elementId] ??
      draft.cableTrays?.[portA.elementId] ??
      draft.mepFittings?.[portA.elementId] ??
      draft.mepEquipments?.[portA.elementId];

    const hostB =
      draft.pipes?.[portB.elementId] ??
      draft.ducts?.[portB.elementId] ??
      draft.cableTrays?.[portB.elementId] ??
      draft.mepFittings?.[portB.elementId] ??
      draft.mepEquipments?.[portB.elementId];

    const levelId =
      this.options?.levelId ??
      hostA?.levelId ??
      hostB?.levelId ??
      Object.keys(draft.levels ?? {})[0] ??
      'level-0';

    const systemId =
      this.options?.systemId ??
      hostA?.systemId ??
      hostB?.systemId;

    const transitionId = this.options?.transitionId ?? generateId();

    const transPort0 = createPort({
      elementId: transitionId,
      position: midPoint,
      direction: dirBtoA,
      domain: portA.domain,
      systemType: portA.systemType,
      shape: portA.shape,
      ...(portA.diameter !== undefined ? { diameter: portA.diameter } : {}),
      ...(portA.width !== undefined ? { width: portA.width } : {}),
      ...(portA.height !== undefined ? { height: portA.height } : {}),
    });

    const transPort1 = createPort({
      elementId: transitionId,
      position: midPoint,
      direction: dirAtoB,
      domain: portB.domain,
      systemType: portB.systemType,
      shape: portB.shape,
      ...(portB.diameter !== undefined ? { diameter: portB.diameter } : {}),
      ...(portB.width !== undefined ? { width: portB.width } : {}),
      ...(portB.height !== undefined ? { height: portB.height } : {}),
    });

    const transitionFitting = createMepFitting({
      id: transitionId,
      levelId,
      ...(systemId ? { systemId } : {}),
      fittingType: 'transition',
      domain: portA.domain,
      systemType: portA.systemType,
      position: midPoint,
      ports: [transPort0, transPort1],
    });

    const mepFittings = ((draft as { mepFittings: Record<ElementId, MepFitting> }).mepFittings ??= {});
    mepFittings[transitionId] = transitionFitting;

    const conn1Id = generateId();
    const conn2Id = generateId();
    const mepConnectors = ((draft as { mepConnectors: Record<ElementId, Connector> }).mepConnectors ??= {});

    mepConnectors[conn1Id] = {
      id: conn1Id,
      category: 'mepConnector',
      portAId: this.portAId,
      portBId: transPort0.id,
      ...(systemId ? { systemId } : {}),
    };

    mepConnectors[conn2Id] = {
      id: conn2Id,
      category: 'mepConnector',
      portAId: transPort1.id,
      portBId: this.portBId,
      ...(systemId ? { systemId } : {}),
    };

    this.changedIds = [transitionId, conn1Id, conn2Id, this.portAId, this.portBId];
  }

  public getChangedIds(): readonly ElementId[] {
    return this.changedIds;
  }
}

