import type { Command } from './base.js';
import type { SectionCut, BimState, ElementId } from '../types.js';
import { validateSectionCut, BimValidationError } from '../rules/index.js';

/**
 * Commande transactionnelle d'ajout d'une coupe / élévation (ADR-063).
 */
export class AddSectionCutCommand implements Command {
  public readonly name = 'AddSectionCut';

  public constructor(public readonly sectionCut: SectionCut) {}

  public apply(draft: BimState): void {
    const sectionCuts = ((draft as { sectionCuts: Record<ElementId, SectionCut> }).sectionCuts ??= {});
    if (sectionCuts[this.sectionCut.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `Cannot add SectionCut: ID "${this.sectionCut.id}" already exists.`,
      );
    }
    validateSectionCut(this.sectionCut, draft);
    sectionCuts[this.sectionCut.id] = this.sectionCut;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.sectionCut.id];
  }
}

/**
 * Commande transactionnelle de mise à jour d'une coupe / élévation (ADR-063).
 */
export class UpdateSectionCutCommand implements Command {
  public readonly name = 'UpdateSectionCut';

  public constructor(
    public readonly sectionCutId: ElementId,
    public readonly patch: Partial<Omit<SectionCut, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.sectionCuts?.[this.sectionCutId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update SectionCut: ID "${this.sectionCutId}" not found.`,
      );
    }
    const updated: SectionCut = {
      ...existing,
      ...this.patch,
      id: this.sectionCutId,
      category: 'sectionCut',
    };
    validateSectionCut(updated, draft);
    const sectionCuts = ((draft as { sectionCuts: Record<ElementId, SectionCut> }).sectionCuts ??= {});
    sectionCuts[this.sectionCutId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.sectionCutId];
  }
}

/**
 * Commande transactionnelle de suppression d'une coupe / élévation (ADR-063).
 */
export class DeleteSectionCutCommand implements Command {
  public readonly name = 'DeleteSectionCut';

  public constructor(public readonly sectionCutId: ElementId) {}

  public apply(draft: BimState): void {
    if (!draft.sectionCuts?.[this.sectionCutId]) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete SectionCut: ID "${this.sectionCutId}" not found.`,
      );
    }
    Reflect.deleteProperty(draft.sectionCuts, this.sectionCutId);
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.sectionCutId];
  }
}
