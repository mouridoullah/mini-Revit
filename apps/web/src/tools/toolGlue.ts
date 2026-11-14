import { type ToolEvent } from './types.js';

/**
 * Convertit un PointerEvent DOM brut en ToolEvent normalisé pour les machines à états.
 * Les coordonnées screen sont strictement relatives au canvas via getBoundingClientRect()
 * et compensent fidèlement le ratio d'affichage CSS (canvas.width / rect.width).
 *
 * @param event Événement PointerEvent issu du navigateur
 * @param canvas Élément HTMLCanvasElement cible
 * @returns Événement ToolEvent découplé du DOM
 */
export function convertPointerEvent(event: PointerEvent, canvas: HTMLCanvasElement): ToolEvent {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  const screen = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
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
