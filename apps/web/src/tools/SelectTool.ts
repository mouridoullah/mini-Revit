import { findWallAtScreen } from '@mini-bim/view-2d';
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
 * - selected : un mur a été sélectionné par clic.
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

      const hitId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      if (hitId) {
        this.state = { kind: 'selected', wallId: hitId };
        return { kind: 'selectionChanged', ids: [hitId] };
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
