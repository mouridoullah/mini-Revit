import { useEffect, useRef, useState, useCallback } from 'react';
import { BimDocument, createComplexVillaDocument } from '@tabax/core';
import {
  AutoSaveManager,
  loadFromIndexedDB,
  WebLockCoordinator,
  TABAX_SYNC_CHANNEL,
  type TabaxSyncMessage,
} from '../persistence/autoSave.js';

export interface UseBimPersistenceOptions {
  readonly doc: BimDocument;
  readonly hasInitialDoc: boolean;
  readonly setDocument: (newDoc: BimDocument) => void;
  readonly setActiveLevelId: (levelId: string) => void;
  readonly setInfoMessage: (msg: string | null) => void;
  readonly onLockConflictChange?: (isConflict: boolean) => void;
}

export interface UseBimPersistenceResult {
  readonly isSecondaryTab: boolean;
  readonly hasNewerVersion: boolean;
  readonly reloadLatestVersion: () => Promise<void>;
}

/**
 * Hook gérant la persistance globale du document Tabax :
 * - Restauration initiale unique (ADR-051 §D4) : URL demo (?demo=...) ou IndexedDB
 * - Migration silencieuse automatique à sens unique mini_bim_autosave -> tabax_autosave (ADR-070)
 * - Coordination multi-onglets Web Locks API avec suspension de sauvegarde (ADR-070)
 * - Synchronisation BroadcastChannel inter-onglets (ADR-070)
 * - Nettoyage et flush atomique sur événement beforeunload
 */
export function useBimPersistence({
  doc,
  hasInitialDoc,
  setDocument,
  setActiveLevelId,
  setInfoMessage,
  onLockConflictChange,
}: UseBimPersistenceOptions): UseBimPersistenceResult {
  const autoSaveManagerRef = useRef<AutoSaveManager | null>(null);
  if (!autoSaveManagerRef.current) {
    autoSaveManagerRef.current = new AutoSaveManager(500);
  }

  const [isSecondaryTab, setIsSecondaryTab] = useState(false);
  const [hasNewerVersion, setHasNewerVersion] = useState(false);
  const hasRestoredRef = useRef(false);

  // 1. Gestion du verrou exclusif multi-onglets (Web Locks API / ADR-070)
  useEffect(() => {
    let isCancelled = false;

    async function evaluateTabLock() {
      const acquired = await WebLockCoordinator.requestLock();
      if (isCancelled) return;

      if (!acquired) {
        setIsSecondaryTab(true);
        autoSaveManagerRef.current?.setDisabled(true);
        onLockConflictChange?.(true);
      } else {
        setIsSecondaryTab(false);
        autoSaveManagerRef.current?.setDisabled(false);
        onLockConflictChange?.(false);
      }
    }

    void evaluateTabLock();

    // Écoute des synchronisations inter-onglets via BroadcastChannel
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(TABAX_SYNC_CHANNEL);
        channel.onmessage = (event: MessageEvent<TabaxSyncMessage>) => {
          if (event.data?.type === 'TABAX_AUTOSAVE_SAVED') {
            setHasNewerVersion(true);
          }
        };
      } catch {
        // BroadcastChannel non supporté dans cet environnement
      }
    }

    return () => {
      isCancelled = true;
      if (channel) {
        channel.close();
      }
      WebLockCoordinator.releaseLock();
    };
  }, [onLockConflictChange]);

  // 2. Restauration automatique au montage initial depuis IndexedDB (ou URL ?demo=...)
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
            const resp = await fetch(`${import.meta.env.BASE_URL}demo-immeuble-r4.json`);
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
            const resp = await fetch(`${import.meta.env.BASE_URL}demo-roof-plan.json`);
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
          if (result.migratedFromLegacy) {
            setInfoMessage('Projet migré et restauré depuis mini_bim_autosave vers tabax_autosave');
          } else {
            setInfoMessage('Projet restauré depuis la sauvegarde automatique');
          }
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

  // 3. Rechargement manuel de la dernière version enregistrée par un autre onglet
  const reloadLatestVersion = useCallback(async () => {
    try {
      const result = await loadFromIndexedDB();
      if (result) {
        const reloadedDoc = BimDocument.fromJSON(result.json);
        setDocument(reloadedDoc);
        setHasNewerVersion(false);
        setInfoMessage('Projet rechargé avec succès depuis la dernière version enregistrée.');
      }
    } catch (err) {
      console.warn('[AutoSave] Impossible de recharger la dernière version :', err);
    }
  }, [setDocument, setInfoMessage]);

  // 4. Sauvegarde automatique réactive à chaque mutation documentaire
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      autoSaveManagerRef.current?.scheduleSave(doc);
    });
    return () => {
      unsubscribe();
      autoSaveManagerRef.current?.cancelScheduledSave();
    };
  }, [doc]);

  // 5. Flush avant déchargement de page
  useEffect(() => {
    return autoSaveManagerRef.current?.attachBeforeUnload(doc);
  }, [doc]);

  return {
    isSecondaryTab,
    hasNewerVersion,
    reloadLatestVersion,
  };
}
