import { describe, it, expect, vi } from 'vitest';
import { convertPointerEvent, convertKeyEvent } from './toolGlue.js';

describe('toolGlue (Conversion des événements DOM en ToolEvents normalisés)', () => {
  it('convertPointerEvent calcule des coordonnées écran strictement relatives au canvas décalé', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    // Canvas positionné à (left: 100, top: 50) dans la fenêtre
    canvas.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 100,
      top: 50,
      right: 900,
      bottom: 650,
      width: 800,
      height: 600,
    } as DOMRect);

    // Clic en (150, 100) dans la fenêtre -> doit donner (50, 50) dans le canvas
    const event = new PointerEvent('pointerdown', {
      clientX: 150,
      clientY: 100,
      button: 0,
      shiftKey: true,
      altKey: false,
    });

    const toolEvent = convertPointerEvent(event, canvas);

    expect(toolEvent).toEqual({
      type: 'pointerdown',
      screen: { x: 50, y: 50 },
      button: 0,
      shift: true,
      alt: false,
    });
  });

  it('compense fidèlement le ratio de redimensionnement CSS (canvas.width / rect.width)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    // Canvas affiché à moitié de sa résolution intrinsèque (ex: style CSS width: 400px, height: 300px)
    canvas.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
    } as DOMRect);

    // Clic en (200, 200) CSS -> doit donner (400, 400) en pixels internes de canvas buffer
    const event = new PointerEvent('pointerdown', {
      clientX: 200,
      clientY: 200,
      button: 0,
      shiftKey: false,
      altKey: false,
    });

    const toolEvent = convertPointerEvent(event, canvas);

    expect(toolEvent.screen.x).toBe(400);
    expect(toolEvent.screen.y).toBe(400);
  });

  it('gère correctement les types pointermove et pointerup', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    canvas.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    } as DOMRect);

    const moveEvent = new PointerEvent('pointermove', {
      clientX: 200,
      clientY: 300,
      shiftKey: false,
      altKey: true,
    });
    const moveToolEvent = convertPointerEvent(moveEvent, canvas);
    expect(moveToolEvent).toEqual({
      type: 'pointermove',
      screen: { x: 200, y: 300 },
      shift: false,
      alt: true,
    });

    const upEvent = new PointerEvent('pointerup', {
      clientX: 200,
      clientY: 300,
      button: 0,
      shiftKey: false,
      altKey: false,
    });
    const upToolEvent = convertPointerEvent(upEvent, canvas);
    expect(upToolEvent).toEqual({
      type: 'pointerup',
      screen: { x: 200, y: 300 },
      button: 0,
      shift: false,
      alt: false,
    });
  });

  it('convertKeyEvent convertit fidèlement la touche clavier', () => {
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    expect(convertKeyEvent(escEvent)).toEqual({
      type: 'keydown',
      key: 'Escape',
    });

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(convertKeyEvent(enterEvent)).toEqual({
      type: 'keydown',
      key: 'Enter',
    });
  });
});
