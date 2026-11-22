import { type BimDocument, type BimState } from '@tabax/core';

export const AUTOSAVE_DB_NAME = 'tabax_autosave';
export const LEGACY_AUTOSAVE_DB_NAME = 'mini_bim_autosave';
export const AUTOSAVE_STORE_NAME = 'projects';
export const AUTOSAVE_KEY = 'current_project';
export const TABAX_SYNC_CHANNEL = 'tabax-sync';
export const TABAX_PROJECT_LOCK = 'tabax-project-lock';

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
  readonly migratedFromLegacy?: boolean;
}

export type TabaxSyncMessage =
  | {
      readonly type: 'TABAX_AUTOSAVE_SAVED';
      readonly timestamp: number;
    }
  | {
      readonly type: 'TABAX_LOCK_RELEASED';
      readonly timestamp: number;
    }
  | {
      readonly type: 'TABAX_LOCK_CLAIM_REQUEST';
      readonly timestamp: number;
    };

function getIDBFactory(customFactory?: IDBFactory): IDBFactory {
  const factory =
    customFactory ?? (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);
  if (!factory) {
    throw new Error('IndexedDB is not supported in this environment.');
  }
  return factory;
}

function openSpecificDB(dbName: string, customFactory?: IDBFactory): Promise<IDBDatabase> {
  const factory = getIDBFactory(customFactory);
  return new Promise((resolve, reject) => {
    const request = factory.open(dbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
        db.createObjectStore(AUTOSAVE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB "${dbName}"`));
  });
}

function openAutoSaveDB(customFactory?: IDBFactory): Promise<IDBDatabase> {
  return openSpecificDB(AUTOSAVE_DB_NAME, customFactory);
}

/**
 * Diffuse un événement de synchronisation multi-onglets via BroadcastChannel.
 */
export function broadcastSync(message: TabaxSyncMessage): void {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(TABAX_SYNC_CHANNEL);
      channel.postMessage(message);
      channel.close();
    } catch {
      // Ignorer si indisponible dans l'environnement
    }
  }
}

let lockReleasePromise: (() => void) | null = null;
let isHoldingProjectLock = false;

/**
 * Coordinateur de verrou exclusif multi-onglets (Web Locks API / ADR-070).
 */
export const WebLockCoordinator = {
  /**
   * Tente d'acquérir le verrou exclusif non-bloquant sur le projet.
   * Retourne true si le verrou est acquis (ou si Web Locks n'est pas supporté).
   * Retourne false si un autre onglet détient déjà le verrou.
   */
  async requestLock(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      // Repli propre pour Node.js / JSDOM / navigateurs sans Web Locks
      isHoldingProjectLock = true;
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      navigator.locks
        .request(TABAX_PROJECT_LOCK, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            isHoldingProjectLock = false;
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
            return;
          }

          isHoldingProjectLock = true;
          if (!resolved) {
            resolved = true;
            resolve(true);
          }

          // Garde le verrou actif tant que releaseLock() n'est pas appelé
          await new Promise<void>((rel) => {
            lockReleasePromise = rel;
          });
          isHoldingProjectLock = false;
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            // En cas d'erreur de l'API locks, ne pas bloquer l'utilisateur
            isHoldingProjectLock = true;
            resolve(true);
          }
        });
    });
  },

  isHolding(): boolean {
    return isHoldingProjectLock;
  },

  releaseLock(): void {
    if (lockReleasePromise) {
      lockReleasePromise();
      lockReleasePromise = null;
    }
    const hadLock = isHoldingProjectLock;
    isHoldingProjectLock = false;
    if (hadLock) {
      broadcastSync({ type: 'TABAX_LOCK_RELEASED', timestamp: Date.now() });
    }
  },

  /**
   * Demande aux autres onglets de céder le verrou et tente de l'acquérir en priorité.
   */
  async forceAcquireLock(): Promise<boolean> {
    broadcastSync({ type: 'TABAX_LOCK_CLAIM_REQUEST', timestamp: Date.now() });
    // Attendre que l'autre onglet cède le verrou
    await new Promise((resolve) => setTimeout(resolve, 80));
    return this.requestLock();
  },
};

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
        broadcastSync({ type: 'TABAX_AUTOSAVE_SAVED', timestamp: record.timestamp });
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

async function readFromDB(
  dbName: string,
  customFactory?: IDBFactory,
): Promise<AutoSaveRecord | null> {
  let db: IDBDatabase;
  try {
    db = await openSpecificDB(dbName, customFactory);
  } catch {
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
        resolve(record ?? null);
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
 * Charge l'état documentaire précédemment persisté dans IndexedDB.
 * Effectue une migration silencieuse à sens unique depuis `mini_bim_autosave`
 * vers `tabax_autosave` au premier démarrage si nécessaire (ADR-070).
 */
export async function loadFromIndexedDB(
  customFactory?: IDBFactory,
): Promise<AutoSaveLoadResult | null> {
  // 1. Tenter la lecture dans la base cible tabax_autosave
  let record = await readFromDB(AUTOSAVE_DB_NAME, customFactory);
  let migratedFromLegacy = false;

  // 2. Si tabax_autosave est vide, vérifier la base historique mini_bim_autosave
  if (!record || !record.state) {
    const legacyRecord = await readFromDB(LEGACY_AUTOSAVE_DB_NAME, customFactory);
    if (legacyRecord && legacyRecord.state) {
      // Migration silencieuse à sens unique vers tabax_autosave
      await saveToIndexedDB(legacyRecord.state, customFactory);
      record = legacyRecord;
      migratedFromLegacy = true;
    }
  }

  if (!record || !record.state) {
    return null;
  }

  const jsonStr = record.json ?? JSON.stringify(record.state);
  try {
    if (record.json) {
      JSON.parse(record.json);
    }
    return {
      state: record.state,
      json: jsonStr,
      timestamp: record.timestamp,
      migratedFromLegacy,
    };
  } catch {
    console.warn('[AutoSave] Enregistrement JSON corrompu détecté dans IndexedDB.');
    return null;
  }
}

/**
 * Supprime la sauvegarde automatique persistée dans IndexedDB (ex. lors d'un 'Nouveau Projet').
 */
export async function clearIndexedDB(customFactory?: IDBFactory): Promise<void> {
  const clearDB = async (name: string): Promise<void> => {
    try {
      const db = await openSpecificDB(name, customFactory);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(AUTOSAVE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        const req = store.delete(AUTOSAVE_KEY);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    } catch {
      // Ignorer si la base n'existe pas
    }
  };

  await clearDB(AUTOSAVE_DB_NAME);
  await clearDB(LEGACY_AUTOSAVE_DB_NAME);
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
 * Intègre un suivi de version (changeId) pour éviter les conditions de concurrence,
 * un support de suspension (disabled) en mode multi-onglets passif,
 * et maintient l'état `dirty = true` tant que l'écriture n'est pas formellement acquittée.
 */
export class AutoSaveManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving = false;
  private changeId = 0;
  private disabled = false;

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

  public isDisabled(): boolean {
    return this.disabled;
  }

  public setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) {
      this.cancelScheduledSave();
    }
  }

  public markDirty(): void {
    if (this.disabled) return;
    this.dirty = true;
    this.changeId++;
  }

  public scheduleSave(
    doc: BimDocument,
    onSavedOrCallbacks?: ((record: { timestamp: number }) => void) | AutoSaveCallbacks,
  ): void {
    if (this.disabled) {
      return;
    }

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
      if (!this.dirty || this.disabled) return;

      const targetChangeId = this.changeId;
      try {
        this.saving = true;
        const success = await saveToIndexedDB(doc, this.customFactory);
        if (success) {
          if (this.changeId === targetChangeId) {
            this.dirty = false;
          } else {
            this.scheduleSave(doc, callbacks);
          }
          callbacks.onSaved?.({ timestamp: Date.now() });
        } else {
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
    if (this.disabled) return true;

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
      if (this.isDirty() && !this.disabled) {
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
