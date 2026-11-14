import { useContext } from 'react';
import { BimDocumentContext, type BimDocumentContextValue } from '../context/BimDocumentContext.js';

/**
 * Hook de commodité pour consommer le document et l'état BIM courant.
 *
 * @throws {Error} Si invoqué hors du scope d'un <BimDocumentProvider>.
 */
export function useBimDocument(): BimDocumentContextValue {
  const context = useContext(BimDocumentContext);
  if (!context) {
    throw new Error('useBimDocument doit être utilisé à l’intérieur d’un <BimDocumentProvider>.');
  }
  return context;
}
