import { type BimDocument, type BimState } from '@mini-bim/core';

export const AUTOSAVE_DB_NAME = 'mini_bim_autosave';
export const AUTOSAVE_STORE_NAME = 'projects';
export const AUTOSAVE_KEY = 'current_project';

export interface AutoSaveRecord {
  readonly id: string;
  readonly state: BimState;
  readonly json: string;
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
 */
export async function saveToIndexedDB(
  docOrState: BimDocument | BimState,
  customFactory?: IDBFactory,
): Promise<void> {
  const db = await openAutoSaveDB(customFactory);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);

      const state: BimState = 'getState' in docOrState ? docOrState.getState() : docOrState;
      const json: string = 'toJSON' in docOrState ? docOrState.toJSON(false) : JSON.stringify(state);

      const record: AutoSaveRecord = {
        id: AUTOSAVE_KEY,
        state,
        json,
        timestamp: Date.now(),
        schemaVersion: state.schemaVersion ?? 2,
      };

      const putReq = store.put(record as unknown as Record<string, unknown>);
      putReq.onerror = () => reject(putReq.error ?? new Error('Failed to put record in IndexedDB'));

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
 * Charge l'état documentaire précédemment persisté dans IndexedDB.
 * Retourne null si aucune sauvegarde automatique n'existe.
 */
export async function loadFromIndexedDB(
  customFactory?: IDBFactory,
): Promise<AutoSaveLoadResult | null> {
  const db = await openAutoSaveDB(customFactory);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUTOSAVE_STORE_NAME);
      const req = store.get(AUTOSAVE_KEY);

      req.onsuccess = () => {
        const record = req.result as AutoSaveRecord | undefined;
        db.close();
        if (!record || !record.state) {
          resolve(null);
        } else {
          resolve({
            state: record.state,
            json: record.json,
            timestamp: record.timestamp,
          });
        }
      };

      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to read from IndexedDB'));
      };
    } catch (err) {
      db.close();
      reject(err);
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
 * Gestionnaire debouncé de persistance automatique pour React / UI.
 */
export class AutoSaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving = false;

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
  }

  public scheduleSave(
    doc: BimDocument,
    onSaved?: (record: { timestamp: number }) => void,
  ): void {
    this.dirty = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      if (!this.dirty) return;
      try {
        this.saving = true;
        await saveToIndexedDB(doc, this.customFactory);
        this.dirty = false;
        onSaved?.({ timestamp: Date.now() });
      } catch (err) {
        console.error('[AutoSaveManager] Erreur lors de la sauvegarde automatique :', err);
      } finally {
        this.saving = false;
      }
    }, this.debounceMs);
  }

  public async flushSave(doc: BimDocument): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    try {
      this.saving = true;
      await saveToIndexedDB(doc, this.customFactory);
      this.dirty = false;
    } finally {
      this.saving = false;
    }
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
