import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResizeObserver } from './useResizeObserver.js';
import { MockResizeObserver } from '../test-setup.js';

describe('useResizeObserver Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockResizeObserver.instances = [];
  });

  it('appelle observer.observe() sur l’élément cible lors du montage', () => {
    const div = document.createElement('div');
    const ref = { current: div };
    const onResize = vi.fn();

    renderHook(() => useResizeObserver(ref, onResize));

    expect(MockResizeObserver.instances).toHaveLength(1);
    const instance = MockResizeObserver.instances[0]!;
    expect(instance.observedElements.has(div)).toBe(true);
  });

  it('appelle observer.disconnect() lors du démontage (unmount)', () => {
    const div = document.createElement('div');
    const ref = { current: div };
    const onResize = vi.fn();

    const { unmount } = renderHook(() => useResizeObserver(ref, onResize));

    const instance = MockResizeObserver.instances[0]!;
    expect(instance.isDisconnected).toBe(false);

    unmount();

    expect(instance.isDisconnected).toBe(true);
    expect(instance.observedElements.size).toBe(0);
  });

  it('déclenche le callback onResize(width, height) lorsque les dimensions changent', () => {
    const div = document.createElement('div');
    const ref = { current: div };
    const onResize = vi.fn();

    renderHook(() => useResizeObserver(ref, onResize));

    const instance = MockResizeObserver.instances[0]!;
    instance.trigger([
      {
        target: div,
        contentRect: { width: 1024, height: 768 } as DOMRectReadOnly,
      },
    ]);

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(1024, 768);
  });
});
