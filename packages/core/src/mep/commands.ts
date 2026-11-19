/**
 * @mini-bim/core/mep/commands
 *
 * Commandes transactionnelles de mutation pour les entités et réseaux techniques MEP.
 * Conformes à l'architecture transactionnelle réversible BimDocument (Command + Immer).
 */

import type { Command } from '../commands/base.js';
import type { BimState, ElementId } from '../types.js';
import { BimValidationError } from '../rules/types.js';
import type {
  Pipe,
  Duct,
  CableTray,
  MepFitting,
  MepEquipment,
  MepSystem,
  Connector,
} from './types.js';
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
