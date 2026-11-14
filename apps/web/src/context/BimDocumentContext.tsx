import { createContext, useRef, useState, useEffect, type ReactNode } from 'react';
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
}

export const BimDocumentContext = createContext<BimDocumentContextValue | null>(null);

export interface BimDocumentProviderProps {
  readonly initialDoc?: BimDocument | undefined;
  readonly children: ReactNode;
}

/**
 * Fournisseur de contexte pour l'état documentaire BIM dans l'arbre React.
 * Instancie et conserve une référence unique et stable de BimDocument dans un useRef.
 */
export function BimDocumentProvider({ initialDoc, children }: BimDocumentProviderProps) {
  const docRef = useRef<BimDocument | null>(null);
  if (!docRef.current) {
    docRef.current = initialDoc ?? createDemoDocument();
  }
  const doc = docRef.current;

  // Seul le BimState immuable est exposé comme état React
  const [state, setState] = useState<BimState>(() => doc.getState());

  useEffect(() => {
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

  const value: BimDocumentContextValue = {
    doc,
    state,
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return <BimDocumentContext.Provider value={value}>{children}</BimDocumentContext.Provider>;
}
