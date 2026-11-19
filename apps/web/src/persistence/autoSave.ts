import { type BimDocument, type BimState } from '@mini-bim/core';

export const AUTOSAVE_DB_NAME = 'mini_bim_autosave';
export const AUTOSAVE_STORE_NAME = 'projects';
export const AUTOSAVE_KEY = 'current_project';

export interface AutoSaveRecord {
  readonly id: string;
  readonly state: BimState;
  readonly json?: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
}

export interface AutoSaveLoadResult {
  readonly state: BimState;
  readonly json: string;
  readonly timestamp: number;
}

function getIDBFactory(customFactory?: IDBFactory): IDBFactory {
  const factory = customFactory ?? (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);
  if (!factory) {
    throw new Error('IndexedDB is not supported in this environment.');
  }
  return factory;
}

function openAutoSaveDB(customFactory?: IDBFactory): Promise<IDBDatabase> {
  const factory = getIDBFactory(customFactory);
  return new Promise((resolve, reject) => {
    const request = factory.open(AUTOSAVE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
        db.createObjectStore(AUTOSAVE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

/**
 * Persiste l'état documentaire dans IndexedDB sous la clé standard 'current_project'.
 * Retourne true en cas de succès, false en cas d'erreur ou de quota dépassé.
 */
export async function saveToIndexedDB(
  docOrState: BimDocument | BimState,
  customFactory?: IDBFactory,
): Promise<boolean> {
  let db: IDBDatabase;
  try {
    db = await openAutoSaveDB(customFactory);
  } catch (err) {
    console.warn('[AutoSave] IndexedDB non disponible pour la sauvegarde :', err);
    return false;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);

      const state: BimState = 'getState' in docOrState ? docOrState.getState() : docOrState;

      const record: AutoSaveRecord = {
        id: AUTOSAVE_KEY,
        state,
        timestamp: Date.now(),
        schemaVersion: state.schemaVersion ?? 2,
      };

      const putReq = store.put(record as unknown as Record<string, unknown>);
      putReq.onerror = () => {
        db.close();
        resolve(false);
      };

      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch (err) {
      console.warn('[AutoSave] Erreur lors de l’écriture IndexedDB :', err);
      db.close();
      resolve(false);
    }
  });
}

/**
 * Charge l'état documentaire précédemment persisté dans IndexedDB.
 * Retourne null si aucune sauvegarde n'existe, si IndexedDB est inaccessible
 * ou si le contenu est corrompu (sans lever d'exception).
 */
export async function loadFromIndexedDB(
  customFactory?: IDBFactory,
): Promise<AutoSaveLoadResult | null> {
  let db: IDBDatabase;
  try {
    db = await openAutoSaveDB(customFactory);
  } catch (err) {
    console.warn('[AutoSave] IndexedDB non disponible ou inaccessible :', err);
    return null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      const req = store.get(AUTOSAVE_KEY);

      req.onsuccess = () => {
        const record = req.result as AutoSaveRecord | undefined;
        db.close();
        if (!record || !record.state) {
          resolve(null);
          return;
        }

        const jsonStr = record.json ?? JSON.stringify(record.state);
        // Protection contre un enregistrement JSON corrompu
        try {
          if (record.json) {
            JSON.parse(record.json);
          }
          resolve({
            state: record.state,
            json: jsonStr,
            timestamp: record.timestamp,
          });
        } catch {
          console.warn('[AutoSave] Enregistrement JSON corrompu détecté dans IndexedDB.');
          resolve(null);
        }
      };

      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/**
 * Supprime la sauvegarde automatique persistée dans IndexedDB (ex. lors d'un 'Nouveau Projet').
 */
export async function clearIndexedDB(customFactory?: IDBFactory): Promise<void> {
  const db = await openAutoSaveDB(customFactory);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      const req = store.delete(AUTOSAVE_KEY);

      req.onerror = () => reject(req.error ?? new Error('Failed to delete from IndexedDB'));

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Transaction failed'));
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Callbacks optionnels pour le suivi du cycle de vie de la sauvegarde automatique.
 */
export interface AutoSaveCallbacks {
  readonly onSaved?: (record: { timestamp: number }) => void;
  readonly onSaveFailed?: (error?: unknown) => void;
}

/**
 * Gestionnaire debouncé de persistance automatique pour React / UI.
 * Intègre un suivi de version (changeId) pour éviter les conditions de concurrence
 * et maintient l'état `dirty = true` tant que l'écriture n'est pas formellement acquittée.
 */
export class AutoSaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving = false;
  private changeId = 0;

  public constructor(
    private readonly debounceMs = 500,
    private readonly customFactory?: IDBFactory,
  ) {}

  public isDirty(): boolean {
    return this.dirty;
  }

  public isSaving(): boolean {
    return this.saving;
  }

  public markDirty(): void {
    this.dirty = true;
    this.changeId++;
  }

  public scheduleSave(
    doc: BimDocument,
    onSavedOrCallbacks?: ((record: { timestamp: number }) => void) | AutoSaveCallbacks,
  ): void {
    this.dirty = true;
    this.changeId++;

    const callbacks: AutoSaveCallbacks =
      typeof onSavedOrCallbacks === 'function'
        ? { onSaved: onSavedOrCallbacks }
        : (onSavedOrCallbacks ?? {});

    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      if (!this.dirty) return;

      const targetChangeId = this.changeId;
      try {
        this.saving = true;
        const success = await saveToIndexedDB(doc, this.customFactory);
        if (success) {
          // Si aucune nouvelle modification n'est survenue pendant l'écriture
          if (this.changeId === targetChangeId) {
            this.dirty = false;
          } else {
            // Modification concurrente intervenue pendant la sauvegarde : re-planifier
            this.scheduleSave(doc, callbacks);
          }
          callbacks.onSaved?.({ timestamp: Date.now() });
        } else {
          // Échec de la sauvegarde (quota, DB inaccessible) : dirty reste true pour permettre un retry ultérieur
          console.warn('[AutoSaveManager] Échec de la sauvegarde IndexedDB, dirty maintenu à true');
          callbacks.onSaveFailed?.();
        }
      } catch (err) {
        console.error('[AutoSaveManager] Erreur lors de la sauvegarde automatique :', err);
        callbacks.onSaveFailed?.(err);
      } finally {
        this.saving = false;
      }
    }, this.debounceMs);
  }

  public async flushSave(doc: BimDocument): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return true;

    const targetChangeId = this.changeId;
    try {
      this.saving = true;
      const success = await saveToIndexedDB(doc, this.customFactory);
      if (success) {
        if (this.changeId === targetChangeId) {
          this.dirty = false;
        }
        return true;
      }
      return false;
    } finally {
      this.saving = false;
    }
  }

  public attachBeforeUnload(doc: BimDocument): () => void {
    const handler = () => {
      if (this.isDirty()) {
        void this.flushSave(doc);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
    return () => {};
  }

  public cancelScheduledSave(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public destroy(): void {
    this.cancelScheduledSave();
  }
}
