/**
 * @tabax/core/mep/commands/segments
 *
 * Commandes transactionnelles pour les éléments linéaires MEP :
 * Tuyauterie (Pipe), Gaines aérauliques (Duct), Chemins de câbles (CableTray).
 */

import type { Command } from '../../commands/base.js';
import type { BimState, ElementId } from '../../types.js';
import { BimValidationError } from '../../rules/types.js';
import type { Pipe, Duct, CableTray } from '../types.js';
import {
  checkPipeViolations,
  checkDuctViolations,
  checkCableTrayViolations,
} from '../rules.js';
import { detachIncidentConnectors, removeElementFromSystems } from './helpers.js';

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
