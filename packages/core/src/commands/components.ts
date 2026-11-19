import type { Command } from './base.js';
import type { Component, ComponentType, BimState, ElementId } from '../types.js';
import {
  validateComponent,
  validateComponentType,
  BimValidationError,
} from '../rules/index.js';
import { resolveCascadeDeletions } from '../relations/cascade.js';

export class AddComponentTypeCommand implements Command {
  public readonly name = 'AddComponentType';

  public constructor(public readonly componentType: ComponentType) {}

  public apply(draft: BimState): void {
    if (draft.componentTypes?.[this.componentType.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A component type with ID "${this.componentType.id}" already exists.`,
      );
    }
    validateComponentType(this.componentType);
    const componentTypes = ((draft as { componentTypes: Record<ElementId, ComponentType> }).componentTypes ??= {});
    componentTypes[this.componentType.id] = this.componentType;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.componentType.id];
  }
}

export class UpdateComponentTypeCommand implements Command {
  public readonly name = 'UpdateComponentType';

  public constructor(
    public readonly componentTypeId: ElementId,
    public readonly patch: Partial<Omit<ComponentType, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.componentTypes?.[this.componentTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update component type: ID "${this.componentTypeId}" not found.`,
      );
    }
    const updated: ComponentType = {
      ...existing,
      ...this.patch,
      id: this.componentTypeId,
      category: 'componentType',
    };
    validateComponentType(updated);
    const componentTypes = ((draft as { componentTypes: Record<ElementId, ComponentType> }).componentTypes ??= {});
    componentTypes[this.componentTypeId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.componentTypeId];
  }
}

export class DeleteComponentTypeCommand implements Command {
  public readonly name = 'DeleteComponentType';

  public constructor(public readonly componentTypeId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.componentTypes?.[this.componentTypeId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete component type: ID "${this.componentTypeId}" not found.`,
      );
    }
    const { restrictViolations } = resolveCascadeDeletions(draft, this.componentTypeId, {
      throwOnRestrict: false,
    });
    if (restrictViolations.length > 0) {
      throw new BimValidationError(
        'DELETE_RESTRICTED',
        `Cannot delete component type: ID "${this.componentTypeId}" is referenced by ${restrictViolations.length} active element(s) (DELETE_COMPONENT_TYPE_REJECTED).`,
        { blockingIds: restrictViolations },
      );
    }
    if (draft.componentTypes) {
      Reflect.deleteProperty(draft.componentTypes, this.componentTypeId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.componentTypeId];
  }
}

export class AddComponentCommand implements Command {
  public readonly name = 'AddComponent';

  public constructor(public readonly component: Component) {}

  public apply(draft: BimState): void {
    if (draft.components?.[this.component.id]) {
      throw new BimValidationError(
        'ELEMENT_ALREADY_EXISTS',
        `A component with ID "${this.component.id}" already exists.`,
      );
    }
    validateComponent(this.component, draft);
    const components = ((draft as { components: Record<ElementId, Component> }).components ??= {});
    components[this.component.id] = this.component;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.component.id];
  }
}

export class UpdateComponentCommand implements Command {
  public readonly name = 'UpdateComponent';

  public constructor(
    public readonly componentId: ElementId,
    public readonly patch: Partial<Omit<Component, 'id' | 'category'>>,
  ) {}

  public apply(draft: BimState): void {
    const existing = draft.components?.[this.componentId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot update component: ID "${this.componentId}" not found.`,
      );
    }
    const updated: Component = {
      ...existing,
      ...this.patch,
      id: this.componentId,
      category: 'component',
    };
    validateComponent(updated, draft);
    const components = ((draft as { components: Record<ElementId, Component> }).components ??= {});
    components[this.componentId] = updated;
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.componentId];
  }
}

export class DeleteComponentCommand implements Command {
  public readonly name = 'DeleteComponent';
  private hostWallId: ElementId = '';

  public constructor(public readonly componentId: ElementId) {}

  public apply(draft: BimState): void {
    const existing = draft.components?.[this.componentId];
    if (!existing) {
      throw new BimValidationError(
        'ELEMENT_NOT_FOUND',
        `Cannot delete component: ID "${this.componentId}" not found.`,
      );
    }
    if (existing.placement?.hostWallId) {
      this.hostWallId = existing.placement.hostWallId;
    }
    if (draft.components) {
      Reflect.deleteProperty(draft.components, this.componentId);
    }
  }

  public getChangedIds(): readonly ElementId[] {
    return [this.componentId, ...(this.hostWallId ? [this.hostWallId] : [])];
  }
}
