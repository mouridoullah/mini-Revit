/**
 * Mock léger et conforme d'IndexedDB pour l'environnement de test Vitest / Node.js.
 * Implémente le sous-ensemble requis par autoSave : open, upgradeneeded, success, error,
 * transaction, objectStore (put, get, delete, clear).
 */

export class MockIDBRequest<T = unknown> {
  public result!: T;
  public error: DOMException | null = null;
  public onsuccess: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  public triggerSuccess(result: T): void {
    this.result = result;
    if (this.onsuccess) {
      this.onsuccess(new Event('success'));
    }
  }

  public triggerError(error: DOMException): void {
    this.error = error;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

export class MockIDBOpenDBRequest extends MockIDBRequest<IDBDatabase> {
  public onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;

  public triggerUpgrade(db: IDBDatabase, oldVersion: number, newVersion: number): void {
    if (this.onupgradeneeded) {
      const event = new Event('upgradeneeded') as IDBVersionChangeEvent;
      Object.defineProperty(event, 'oldVersion', { value: oldVersion });
      Object.defineProperty(event, 'newVersion', { value: newVersion });
      Object.defineProperty(event, 'target', { value: this });
      this.result = db;
      this.onupgradeneeded(event);
    }
  }
}

export class MockIDBObjectStore {
  public simulateQuotaError = false;

  public constructor(
    public readonly name: string,
    public readonly keyPath: string | null,
    private readonly records: Map<string | number, unknown>,
  ) {}

  public put(value: Record<string, unknown>, key?: IDBValidKey): MockIDBRequest<IDBValidKey> {
    const req = new MockIDBRequest<IDBValidKey>();
    queueMicrotask(() => {
      if (this.simulateQuotaError) {
        req.triggerError(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
        return;
      }
      let actualKey = key;
      if (!actualKey && this.keyPath && typeof value === 'object' && value !== null) {
        actualKey = value[this.keyPath] as IDBValidKey;
      }
      if (actualKey === undefined) {
        req.triggerError(new DOMException('Data provided to an operation does not meet requirements.', 'DataError'));
        return;
      }
      this.records.set(actualKey as string | number, JSON.parse(JSON.stringify(value)));
      req.triggerSuccess(actualKey);
    });
    return req;
  }

  public get(key: IDBValidKey): MockIDBRequest<unknown> {
    const req = new MockIDBRequest<unknown>();
    queueMicrotask(() => {
      const val = this.records.get(key as string | number);
      req.triggerSuccess(val ? JSON.parse(JSON.stringify(val)) : undefined);
    });
    return req;
  }

  public delete(key: IDBValidKey): MockIDBRequest<undefined> {
    const req = new MockIDBRequest<undefined>();
    queueMicrotask(() => {
      this.records.delete(key as string | number);
      req.triggerSuccess(undefined);
    });
    return req;
  }

  public clear(): MockIDBRequest<undefined> {
    const req = new MockIDBRequest<undefined>();
    queueMicrotask(() => {
      this.records.clear();
      req.triggerSuccess(undefined);
    });
    return req;
  }
}

export class MockIDBTransaction {
  public oncomplete: ((event: Event) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public error: DOMException | null = null;

  public constructor(
    public readonly db: MockIDBDatabase,
    public readonly mode: IDBTransactionMode,
    _storeNames: string[],
  ) {
    queueMicrotask(() => {
      queueMicrotask(() => {
        if (!this.error && this.oncomplete) {
          this.oncomplete(new Event('complete'));
        }
      });
    });
  }

  public objectStore(name: string): MockIDBObjectStore {
    const store = this.db._getStore(name);
    if (!store) {
      throw new DOMException(`NotFoundError: The specified object store was not found: ${name}`, 'NotFoundError');
    }
    return store;
  }

  public abort(): void {
    this.error = new DOMException('Transaction aborted', 'AbortError');
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

export class MockIDBDatabase {
  public version: number;
  public readonly objectStoreNames: DOMStringList;
  private readonly stores = new Map<string, { store: MockIDBObjectStore; records: Map<string | number, unknown> }>();

  public constructor(public readonly name: string, version: number) {
    this.version = version;
    const names = [] as string[];
    this.objectStoreNames = {
      contains: (n: string) => names.includes(n),
      item: (i: number) => names[i] ?? null,
      get length() {
        return names.length;
      },
      [Symbol.iterator]: () => names[Symbol.iterator](),
    } as unknown as DOMStringList;
  }

  public createObjectStore(name: string, options?: { keyPath?: string | null }): MockIDBObjectStore {
    const records = new Map<string | number, unknown>();
    const store = new MockIDBObjectStore(name, options?.keyPath ?? null, records);
    this.stores.set(name, { store, records });
    (this.objectStoreNames as unknown as { contains: (n: string) => boolean }).contains = (n: string) =>
      this.stores.has(n);
    return store;
  }

  public transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly'): MockIDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new MockIDBTransaction(this, mode, names);
  }

  public close(): void {
    // No-op for mock
  }

  public _getStore(name: string): MockIDBObjectStore | undefined {
    return this.stores.get(name)?.store;
  }
}

export class MockIDBFactory {
  public simulateOpenError = false;
  private readonly databases = new Map<string, MockIDBDatabase>();

  public open(name: string, version = 1): MockIDBOpenDBRequest {
    const req = new MockIDBOpenDBRequest();
    queueMicrotask(() => {
      if (this.simulateOpenError) {
        req.triggerError(new DOMException('Database cannot be opened.', 'SecurityError'));
        return;
      }
      let db = this.databases.get(name);
      const isNew = !db;
      if (!db) {
        db = new MockIDBDatabase(name, version);
        this.databases.set(name, db);
      }

      if (isNew || db.version < version) {
        const oldVersion = db.version;
        db.version = version;
        req.triggerUpgrade(db as unknown as IDBDatabase, isNew ? 0 : oldVersion, version);
      }

      req.triggerSuccess(db as unknown as IDBDatabase);
    });
    return req;
  }

  public deleteDatabase(name: string): MockIDBRequest<undefined> {
    const req = new MockIDBRequest<undefined>();
    queueMicrotask(() => {
      this.databases.delete(name);
      req.triggerSuccess(undefined);
    });
    return req;
  }
}

export function createMockIndexedDB(): MockIDBFactory {
  return new MockIDBFactory();
}
