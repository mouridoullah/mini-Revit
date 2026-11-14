import { createContext, useState, useEffect, type ReactNode } from 'react';
import { type BimDocument, type BimState, type Command, type CommandResult } from '@mini-bim/core';
import { createDemoDocument } from '../demo/demoDocument.js';

/**
 * Valeurs exposées par le contexte React du document BIM.
 * Règle d'or 4 : Le state React ne stocke QUE le BimState immuable.
 */
export interface BimDocumentContextValue {
  readonly doc: BimDocument;
  readonly state: BimState;
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

  useEffect(() => {
    setState(doc.getState());
    // Abonnement aux modifications transactionnelles du document
    const unsubscribe = doc.subscribe(() => {
      setState(doc.getState());
    });
    return unsubscribe;
  }, [doc]);

  const execute = (cmd: Command): CommandResult => doc.execute(cmd);
  const undo = (): boolean => doc.undo();
  const redo = (): boolean => doc.redo();
  const canUndo = (): boolean => doc.canUndo();
  const canRedo = (): boolean => doc.canRedo();
  const setDocument = (newDoc: BimDocument): void => {
    setDoc(newDoc);
    setState(newDoc.getState());
  };

  const value: BimDocumentContextValue = {
    doc,
    state,
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
    setDocument,
  };

  return <BimDocumentContext.Provider value={value}>{children}</BimDocumentContext.Provider>;
}
