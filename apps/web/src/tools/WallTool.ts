import { Commands, generateId } from '@tabax/core';
import { snapAngle45, snapPoint, collectSnapCandidates } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type WallToolState,
} from './types.js';

/**
 * Seuil ergonomique UX de longueur minimale pour le tracé interactif (100 mm).
 * Note d'architecture : Ne pas confondre avec le seuil métier de @tabax/core
 * (validateWall exige len > 1e-4 mm pour l'intégrité topologique).
 * MIN_WALL_LENGTH sert exclusivement à éliminer les clics parasites sans intention de glisser.
 */
export const MIN_WALL_LENGTH = 100;

/**
 * Outil interactif de tracé de murs par pointerdown -> pointermove -> pointerup (clic-glisser).
 *
 * Machine à états pure :
 * - idle : aucun tracé en cours.
 * - drawing : point d'origine fixé, élastique (rubber-band) actif en cours d'ajustement.
 *
 * Supporte :
 * - L'aimantation angulaire (snap 45°) lorsque Shift est activé.
 * - L'annulation par touche Escape.
 * - La validation par relâchement du clic (pointerup) ou touche Enter.
 * - Le rejet des segments de longueur inférieure à MIN_WALL_LENGTH (100 mm).
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM.
 */
export class WallTool implements Tool {
  public readonly kind = 'wall' as const;
  private state: WallToolState = { kind: 'idle' };

  public getState(): WallToolState {
    return this.state;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Début de tracé sur clic gauche
    if (event.type === 'pointerdown') {
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      const rawStart = ctx.transform.screenToWorld(event.screen);
      const candidates = collectSnapCandidates(ctx);
      const snapTol = 12 / ctx.transform.scale;
      const startWorld = snapPoint(rawStart, candidates, snapTol).point;
      this.state = {
        kind: 'drawing',
        startWorld,
        currentWorld: startWorld,
      };

      return { kind: 'preview', preview: null };
    }

    // 2. Déplacement du curseur pendant le tracé (mise à jour du rubber-band)
    if (event.type === 'pointermove') {
      if (this.state.kind !== 'drawing') {
        return { kind: 'noop' };
      }

      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const candidates = collectSnapCandidates(ctx);
      const snapTol = 12 / ctx.transform.scale;
      const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;
      const currentWorld = event.shift ? snapAngle45(this.state.startWorld, rawWorld) : snappedWorld;

      this.state = {
        kind: 'drawing',
        startWorld: this.state.startWorld,
        currentWorld,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'line',
          start: this.state.startWorld,
          end: currentWorld,
        },
      };
    }

    // 3. Validation du tracé sur relâchement du clic ou touche Enter
    if (
      (event.type === 'pointerup' && event.button === 0) ||
      (event.type === 'keydown' && event.key === 'Enter')
    ) {
      if (this.state.kind !== 'drawing') {
        return { kind: 'noop' };
      }

      let endWorld = this.state.currentWorld;
      if (event.type === 'pointerup') {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const candidates = collectSnapCandidates(ctx);
        const snapTol = 12 / ctx.transform.scale;
        const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;
        endWorld = event.shift ? snapAngle45(this.state.startWorld, rawWorld) : snappedWorld;
      }

      const startWorld = this.state.startWorld;
      const length = Math.hypot(endWorld.x - startWorld.x, endWorld.y - startWorld.y);

      // Si le mur est trop court (< 100 mm), annulation silencieuse
      if (length < MIN_WALL_LENGTH) {
        this.state = { kind: 'idle' };
        return { kind: 'preview', preview: null };
      }

      // Émission de la commande de création transactionnelle
      const state = ctx.doc.getState();
      const levelId = ctx.activeLevelId || Object.keys(state.levels)[0] || 'default_level';
      const typeId = ctx.activeWallTypeId || Object.keys(state.wallTypes)[0] || 'default_wall_type';

      const command = new Commands.AddWallCommand({
        id: generateId(),
        category: 'wall',
        typeId,
        levelId,
        start: { x: startWorld.x, y: startWorld.y },
        end: { x: endWorld.x, y: endWorld.y },
      });

      this.state = { kind: 'idle' };
      return { kind: 'command', command };
    }

    // 4. Annulation sur touche Escape
    if (event.type === 'keydown' && event.key === 'Escape') {
      if (this.state.kind === 'drawing') {
        this.state = { kind: 'idle' };
        return { kind: 'preview', preview: null };
      }
      return { kind: 'noop' };
    }

    return { kind: 'noop' };
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }
}
