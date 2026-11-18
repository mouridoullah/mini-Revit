import { findWallAtScreen, findComponentAtScreen } from '@mini-bim/view-2d';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type SelectToolState,
} from './types.js';

/**
 * Outil interactif de sélection d'éléments architecturaux.
 *
 * Machine à états pure :
 * - idle : en attente d'interaction.
 * - selected : un élément (composant, mur) a été sélectionné par clic.
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM.
 */
export class SelectTool implements Tool {
  public readonly kind = 'select' as const;
  private state: SelectToolState = { kind: 'idle' };

  public getState(): SelectToolState {
    return this.state;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    if (event.type === 'pointerdown') {
      // Seul le clic gauche principal (button 0) déclenche la sélection
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      // 1. Priorité aux composants d'aménagement (dessus d'abord)
      const hitComponentId = findComponentAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      if (hitComponentId) {
        this.state = { kind: 'selected', wallId: hitComponentId };
        return { kind: 'selectionChanged', ids: [hitComponentId] };
      }

      // 2. Murs architecturaux
      const hitWallId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      if (hitWallId) {
        this.state = { kind: 'selected', wallId: hitWallId };
        return { kind: 'selectionChanged', ids: [hitWallId] };
      }

      this.state = { kind: 'idle' };
      return { kind: 'selectionChanged', ids: [] };
    }

    if (event.type === 'keydown' && event.key === 'Escape') {
      this.state = { kind: 'idle' };
      return { kind: 'selectionChanged', ids: [] };
    }

    return { kind: 'noop' };
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }
}
