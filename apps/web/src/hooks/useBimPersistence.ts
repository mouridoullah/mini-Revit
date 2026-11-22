import { useEffect, useRef } from 'react';
import { BimDocument, createComplexVillaDocument } from '@tabax/core';
import { AutoSaveManager, loadFromIndexedDB } from '../persistence/autoSave.js';

export interface UseBimPersistenceOptions {
  readonly doc: BimDocument;
  readonly hasInitialDoc: boolean;
  readonly setDocument: (newDoc: BimDocument) => void;
  readonly setActiveLevelId: (levelId: string) => void;
  readonly setInfoMessage: (msg: string | null) => void;
}

/**
 * Hook gérant la persistance globale du document Mini-BIM :
 * - Restauration initiale unique (ADR-051 §D4) : URL demo (?demo=...) ou IndexedDB
 * - Sauvegarde automatique réactive cadencée par debounce via AutoSaveManager
 * - Nettoyage et flush atomique sur événement beforeunload
 */
export function useBimPersistence({
  doc,
  hasInitialDoc,
  setDocument,
  setActiveLevelId,
  setInfoMessage,
}: UseBimPersistenceOptions): void {
  const autoSaveManagerRef = useRef<AutoSaveManager | null>(null);
  if (!autoSaveManagerRef.current) {
    autoSaveManagerRef.current = new AutoSaveManager(500);
  }

  const hasRestoredRef = useRef(false);

  // Restauration automatique au montage initial depuis IndexedDB (S2-8 / ADR-051 §D4) ou chargement démo ?demo=...
  useEffect(() => {
    if (hasInitialDoc || hasRestoredRef.current) {
      return;
    }
    hasRestoredRef.current = true;

    let isCancelled = false;
    async function restoreProject() {
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const demoParam = params.get('demo');
          if (demoParam === 'villa' || demoParam === 'villa-complexe') {
            if (!isCancelled) {
              setDocument(createComplexVillaDocument());
              setInfoMessage('Villa Contemporaine Complexe chargée avec succès.');
              return;
            }
          }
          if (demoParam === 'r4' || demoParam === 'immeuble-r4') {
            const resp = await fetch('/demo-immeuble-r4.json');
            if (resp.ok) {
              const text = await resp.text();
              if (!isCancelled) {
                const r4Doc = BimDocument.fromJSON(text);
                setDocument(r4Doc);
                setActiveLevelId('level_r0');
                setInfoMessage('Immeuble R+4 complet chargé avec succès !');
                return;
              }
            }
          }
          if (params.get('demo') === 'roof') {
            const resp = await fetch('/demo-roof-plan.json');
            if (resp.ok) {
              const text = await resp.text();
              if (!isCancelled) {
                const roofDoc = BimDocument.fromJSON(text);
                setDocument(roofDoc);
                setInfoMessage('Démo Toitures & Biseautage chargée');
                return;
              }
            }
          }
        }

        const result = await loadFromIndexedDB();
        if (result && !isCancelled) {
          const restoredDoc = BimDocument.fromJSON(result.json);
          setDocument(restoredDoc);
          setInfoMessage('Projet restauré depuis la sauvegarde automatique');
        }
      } catch (err) {
        console.warn('[AutoSave] Impossible de charger la sauvegarde automatique :', err);
      }
    }

    void restoreProject();

    return () => {
      isCancelled = true;
    };
  }, [hasInitialDoc, setDocument, setActiveLevelId, setInfoMessage]);

  // Sauvegarde automatique réactive à chaque mutation documentaire (S2-8)
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      autoSaveManagerRef.current?.scheduleSave(doc);
    });
    return () => {
      unsubscribe();
      autoSaveManagerRef.current?.cancelScheduledSave();
    };
  }, [doc]);

  // Flush avant déchargement de page (S2-8)
  useEffect(() => {
    return autoSaveManagerRef.current?.attachBeforeUnload(doc);
  }, [doc]);
}
