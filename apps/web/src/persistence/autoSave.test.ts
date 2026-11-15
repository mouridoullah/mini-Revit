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
});
