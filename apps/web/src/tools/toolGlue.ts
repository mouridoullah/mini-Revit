import { type ToolEvent } from './types.js';

/**
 * Convertit un PointerEvent DOM brut en ToolEvent normalisé pour les machines à états.
 * Les coordonnées screen sont strictement relatives au canvas via getBoundingClientRect().
 *
 * @param event Événement PointerEvent issu du navigateur
 * @param canvas Élément HTMLCanvasElement cible
 * @returns Événement ToolEvent découplé du DOM
 */
export function convertPointerEvent(event: PointerEvent, canvas: HTMLCanvasElement): ToolEvent {
  const rect = canvas.getBoundingClientRect();
  const screen = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  if (event.type === 'pointerdown') {
    return {
      type: 'pointerdown',
      screen,
      button: event.button,
      shift: event.shiftKey,
      alt: event.altKey,
    };
  }

  if (event.type === 'pointermove') {
    return {
      type: 'pointermove',
      screen,
      shift: event.shiftKey,
      alt: event.altKey,
    };
  }

  return {
    type: 'pointerup',
    screen,
    button: event.button,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

/**
 * Convertit un KeyboardEvent DOM brut en ToolEvent normalisé.
 *
 * @param event Événement KeyboardEvent issu du navigateur
 * @returns Événement ToolEvent de type keydown
 */
export function convertKeyEvent(event: KeyboardEvent): ToolEvent {
  return {
    type: 'keydown',
    key: event.key,
  };
}
