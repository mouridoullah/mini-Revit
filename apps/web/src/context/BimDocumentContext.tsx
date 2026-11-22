import { createContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { type BimDocument, type BimState, type Command, type CommandResult } from '@tabax/core';
import { createDemoDocument } from '../demo/demoDocument.js';

/**
 * Valeurs exposées par le contexte React du document BIM.
 * Règle d'or 4 : Le state React ne stocke QUE le BimState immuable.
 */
export interface BimDocumentContextValue {
  readonly doc: BimDocument;
  readonly state: BimState;
  readonly lastChangedIds?: readonly string[] | undefined;
  readonly execute: (cmd: Command) => CommandResult;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly setDocument: (newDoc: BimDocument) => void;
}

export const BimDocumentContext = createContext<BimDocumentContextValue | null>(null);

export interface BimDocumentProviderProps {
  readonly initialDoc?: BimDocument | undefined;
  readonly children: ReactNode;
}

/**
 * Fournisseur de contexte pour l'état documentaire BIM dans l'arbre React.
 * Maintient le BimDocument et synchronise réactivement le BimState immuable.
 */
export function BimDocumentProvider({ initialDoc, children }: BimDocumentProviderProps) {
  const [doc, setDoc] = useState<BimDocument>(() => initialDoc ?? createDemoDocument());
  const [state, setState] = useState<BimState>(() => doc.getState());
  const [lastChangedIds, setLastChangedIds] = useState<readonly string[] | undefined>(undefined);

  useEffect(() => {
    setState(doc.getState());
    setLastChangedIds(undefined);
    // Abonnement aux modifications transactionnelles du document
    const unsubscribe = doc.subscribe((changed) => {
      setState(doc.getState());
      setLastChangedIds(changed);
    });
    return unsubscribe;
  }, [doc]);

  const execute = useCallback((cmd: Command): CommandResult => doc.execute(cmd), [doc]);
  const undo = useCallback((): boolean => doc.undo(), [doc]);
  const redo = useCallback((): boolean => doc.redo(), [doc]);
  const canUndo = useCallback((): boolean => doc.canUndo(), [doc]);
  const canRedo = useCallback((): boolean => doc.canRedo(), [doc]);
  const setDocument = useCallback((newDoc: BimDocument): void => {
    setDoc(newDoc);
    setState(newDoc.getState());
    setLastChangedIds(undefined);
  }, []);

  const value: BimDocumentContextValue = useMemo(
    () => ({
      doc,
      state,
      lastChangedIds,
      execute,
      undo,
      redo,
      canUndo,
      canRedo,
      setDocument,
    }),
    [doc, state, lastChangedIds, execute, undo, redo, canUndo, canRedo, setDocument],
  );

  return <BimDocumentContext.Provider value={value}>{children}</BimDocumentContext.Provider>;
}
