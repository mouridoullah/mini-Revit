import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BimDocument, Commands } from '@mini-bim/core';
import {
  saveToIndexedDB,
  loadFromIndexedDB,
  clearIndexedDB,
  AutoSaveManager,
} from './autoSave.js';
import { createMockIndexedDB } from './indexedDBMock.js';

describe('S2-8 : Persistance & Sauvegarde Automatique IndexedDB (apps/web/src/persistence/autoSave.test.ts)', () => {
  let mockIDB: ReturnType<typeof createMockIndexedDB>;

  beforeEach(async () => {
    mockIDB = createMockIndexedDB();
    await clearIndexedDB(mockIDB as unknown as IDBFactory);
  });

  it('T-AUTOSAVE-01 : saveToIndexedDB enregistre l’état et loadFromIndexedDB restitue l’état exact', async () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_autosave_1',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      }),
    );

    await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);

    const loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded).not.toBeNull();
    expect(loaded?.state.walls['w_autosave_1']).toBeDefined();
    expect(loaded?.state.walls['w_autosave_1']?.end).toEqual({ x: 5000, y: 0 });
    expect(loaded?.timestamp).toBeGreaterThan(0);
  });

  it('T-AUTOSAVE-02 : clearIndexedDB purge le projet et loadFromIndexedDB retourne null', async () => {
    const doc = BimDocument.createDefaultProject();
    await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);

    let loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded).not.toBeNull();

    await clearIndexedDB(mockIDB as unknown as IDBFactory);

    loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded).toBeNull();
  });

  it('T-AUTOSAVE-03 : AutoSaveManager regroupe (debounce 500ms) les modifications rapprochées', async () => {
    vi.useFakeTimers();
    const manager = new AutoSaveManager(500, mockIDB as unknown as IDBFactory);
    const doc = BimDocument.createDefaultProject();
    const onSavedSpy = vi.fn();

    // 3 modifications rapides successives
    manager.scheduleSave(doc, onSavedSpy);
    manager.scheduleSave(doc, onSavedSpy);
    manager.scheduleSave(doc, onSavedSpy);

    // À t=200ms : rien n'est encore sauvegardé
    vi.advanceTimersByTime(200);
    expect(onSavedSpy).not.toHaveBeenCalled();

    // À t=500ms : le debounce expire et déclenche la sauvegarde
    await vi.advanceTimersByTimeAsync(350);
    expect(onSavedSpy).toHaveBeenCalledTimes(1);

    manager.destroy();
    vi.useRealTimers();
  });

  it('T-AUTOSAVE-04 : AutoSaveManager.flushSave sauvegarde immédiatement sans attendre le timer', async () => {
    vi.useFakeTimers();
    const manager = new AutoSaveManager(500, mockIDB as unknown as IDBFactory);
    const doc = BimDocument.createDefaultProject();

    manager.scheduleSave(doc);
    expect(manager.isDirty()).toBe(true);

    // Déclenchement forcé (ex: avant déchargement de page ou changement de projet)
    await manager.flushSave(doc);
    expect(manager.isDirty()).toBe(false);

    const loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded).not.toBeNull();

    manager.destroy();
    vi.useRealTimers();
  });

  it('T-AUTOSAVE-05 : Restauration d’un document complet via BimDocument.fromJSON avec intégrité des relations', async () => {
    const doc = BimDocument.createDefaultProject();
    const typeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w_persisted_host',
        category: 'wall',
        typeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 6000, y: 0 },
      }),
    );

    await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);

    const record = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(record).not.toBeNull();

    // Reconstitution d'une nouvelle instance BimDocument complète
    const restoredDoc = BimDocument.fromJSON(record!.json);
    expect(restoredDoc.getState().walls['w_persisted_host']).toBeDefined();

    // Vérification que le document restauré accepte de nouvelles commandes
    expect(() => {
      restoredDoc.execute(
        new Commands.UpdateWallCommand('w_persisted_host', {
          start: { x: 100, y: 100 },
        }),
      );
    }).not.toThrow();

    expect(restoredDoc.getState().walls['w_persisted_host']?.start).toEqual({ x: 100, y: 100 });
  });

  it('T-AUTOSAVE-06 : Enregistrement corrompu ou IndexedDB indisponible -> loadFromIndexedDB retourne null sans lever d’exception', async () => {
    // 1. Injection directe d'un JSON corrompu dans le mock
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = mockIDB.open('mini_bim_autosave', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put({
      id: 'current_project',
      state: { schemaVersion: 2 },
      json: '{"invalidJson": unclosed',
      timestamp: 123456,
    } as any);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });

    // Lecture protégée : ne lève aucune exception et retourne null
    const result = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(result).toBeNull();

    // 2. Simulation d'un IndexedDB totalement indisponible ou bloqué
    mockIDB.simulateOpenError = true;
    const resBlocked = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(resBlocked).toBeNull();
  });

  it('T-AUTOSAVE-07 : Quota dépassé ou indisponibilité -> saveToIndexedDB intercepte l’erreur et retourne false', async () => {
    const doc = BimDocument.createDefaultProject();

    // 1. Échec à l'ouverture de la base
    mockIDB.simulateOpenError = true;
    const failedOpen = await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);
    expect(failedOpen).toBe(false);

    // 2. Échec lors de l'écriture (quota de stockage dépassé)
    mockIDB.simulateOpenError = false;
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = mockIDB.open('mini_bim_autosave', 1);
      req.onsuccess = () => resolve(req.result);
    });
    const store = (db as any)._getStore('projects');
    expect(store).toBeDefined();
    store.simulateQuotaError = true;

    const failedQuota = await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);
    expect(failedQuota).toBe(false);
  });

  it('T-AUTOSAVE-08 : AutoSaveManager.attachBeforeUnload déclenche flushSave lors de l’événement beforeunload si dirty', async () => {
    const doc = BimDocument.createDefaultProject();
    const manager = new AutoSaveManager(500, mockIDB as unknown as IDBFactory);
    const flushSpy = vi.spyOn(manager, 'flushSave');

    const detach = manager.attachBeforeUnload(doc);

    // 1. Non sale (propre) : beforeunload ne déclenche pas flushSave
    window.dispatchEvent(new Event('beforeunload'));
    expect(flushSpy).not.toHaveBeenCalled();

    // 2. Modifié (sale) : beforeunload déclenche immédiatement flushSave
    manager.markDirty();
    expect(manager.isDirty()).toBe(true);

    window.dispatchEvent(new Event('beforeunload'));
    expect(flushSpy).toHaveBeenCalledWith(doc);

    detach();
    manager.destroy();
  });

  it('T-AUTOSAVE-09 : AutoSaveManager maintient dirty = true et notifie onSaveFailed si saveToIndexedDB échoue', async () => {
    vi.useFakeTimers();
    mockIDB.simulateOpenError = true; // Simuler une panne IndexedDB
    const manager = new AutoSaveManager(500, mockIDB as unknown as IDBFactory);
    const doc = BimDocument.createDefaultProject();
    const onSavedSpy = vi.fn();
    const onFailedSpy = vi.fn();

    manager.scheduleSave(doc, { onSaved: onSavedSpy, onSaveFailed: onFailedSpy });
    expect(manager.isDirty()).toBe(true);

    // Exécuter le timer
    await vi.advanceTimersByTimeAsync(500);

    // Constat : onSaved n'a pas été appelé, onSaveFailed a été notifié, et dirty reste TRUE !
    expect(onSavedSpy).not.toHaveBeenCalled();
    expect(onFailedSpy).toHaveBeenCalled();
    expect(manager.isDirty()).toBe(true);

    // flushSave échoue aussi et retourne false tout en conservant dirty = true
    const flushSuccess = await manager.flushSave(doc);
    expect(flushSuccess).toBe(false);
    expect(manager.isDirty()).toBe(true);

    manager.destroy();
    vi.useRealTimers();
  });

  it('T-AUTOSAVE-10 : Modification concurrente pendant l’écriture asynchrone -> dirty reste true grâce à changeId', async () => {
    const manager = new AutoSaveManager(500, mockIDB as unknown as IDBFactory);
    const doc = BimDocument.createDefaultProject();

    // Marquer comme modifié et démarrer une sauvegarde
    manager.markDirty();
    const savePromise = manager.flushSave(doc);
    expect(manager.isSaving()).toBe(true);

    // Mutation concurrente intervenant immédiatement pendant l’écriture
    manager.markDirty();

    // Attendre la résolution de la première écriture
    const firstSuccess = await savePromise;
    expect(firstSuccess).toBe(true);

    // Constat : dirty reste true car changeId a été incrémenté pendant la sauvegarde
    expect(manager.isDirty()).toBe(true);

    // Le flush suivant sauve la mutation concurrente et repasse dirty à false
    const secondSuccess = await manager.flushSave(doc);
    expect(secondSuccess).toBe(true);
    expect(manager.isDirty()).toBe(false);

    manager.destroy();
  });

  it('T-AUTOSAVE-11 : Rétro-compatibilité avec un ancien enregistrement IndexedDB contenant { state, json }', async () => {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();

    // Insertion directe d'un enregistrement legacy (avec state ET json)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = (mockIDB as unknown as IDBFactory).open('mini_bim_autosave', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('projects', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const legacyRecord = {
      id: 'current_project',
      state,
      json: JSON.stringify(state),
      timestamp: 1700000000000,
      schemaVersion: 2,
    };
    store.put(legacyRecord);

    await new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });

    // Chargement par loadFromIndexedDB
    const loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded).not.toBeNull();
    expect(loaded?.state.schemaVersion).toBe(2);
    expect(loaded?.json).toBe(legacyRecord.json);
    expect(loaded?.timestamp).toBe(1700000000000);
  });

  it('T-AUTOSAVE-12 : Optimisation Lot 4 — saveToIndexedDB ne duplique plus le champ json dans le record', async () => {
    const doc = BimDocument.createDefaultProject();
    await saveToIndexedDB(doc, mockIDB as unknown as IDBFactory);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = (mockIDB as unknown as IDBFactory).open('mini_bim_autosave', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const rawRecord = await new Promise<Record<string, unknown>>((resolve) => {
      const req = store.get('current_project');
      req.onsuccess = () => {
        db.close();
        resolve(req.result as Record<string, unknown>);
      };
    });

    expect(rawRecord.id).toBe('current_project');
    expect(rawRecord.state).toBeDefined();
    // Le champ json est omis du record IndexedDB pour éliminer la duplication
    expect(rawRecord.json).toBeUndefined();

    // Et loadFromIndexedDB le reconstruit dynamiquement
    const loaded = await loadFromIndexedDB(mockIDB as unknown as IDBFactory);
    expect(loaded?.json).toBeDefined();
    expect(JSON.parse(loaded?.json ?? '{}').schemaVersion).toBe(2);
  });
});
