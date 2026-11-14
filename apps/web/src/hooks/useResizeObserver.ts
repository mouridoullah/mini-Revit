import { useEffect, useRef, type RefObject } from 'react';

/**
 * Hook utilitaire surveillant les dimensions d'un élément conteneur HTML
 * pour propager les changements de résolution aux moteurs de rendu 2D/3D.
 *
 * Utilise useRef pour stabiliser la référence au callback onResize
 * et éviter les reconnexions inutiles du ResizeObserver lors des re-renders.
 */
export function useResizeObserver(
  targetRef: RefObject<HTMLElement | null>,
  onResize: (width: number, height: number) => void,
): void {
  const callbackRef = useRef(onResize);
  callbackRef.current = onResize;

  useEffect(() => {
    const element = targetRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === element) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            callbackRef.current(width, height);
          }
        }
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [targetRef]);
}
