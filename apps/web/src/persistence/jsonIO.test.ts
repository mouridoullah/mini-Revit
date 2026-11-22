import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BimDocument, BimValidationError } from '@tabax/core';
import { createDemoDocument } from '../demo/demoDocument.js';
import { exportToJSON, exportToFile, importFromFile } from './jsonIO.js';

describe('jsonIO (Persistance JSON export / import)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exportToJSON retourne un JSON valide avec les 4 murs du projet de démo', () => {
    const doc = createDemoDocument();
    const jsonStr = exportToJSON(doc, true);

    expect(typeof jsonStr).toBe('string');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    expect(parsed['schemaVersion']).toBe(2);
    expect(parsed['units']).toBe('mm');
    expect(Object.keys(parsed['walls'] as Record<string, unknown>).length).toBe(4);
  });

  it('exportToFile invoque URL.createObjectURL et déclenche le clic sur le lien temporaire', () => {
    const doc = createDemoDocument();
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    exportToFile(doc, 'mon_projet.json');

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });

  it('importFromFile charge fidèlement un fichier JSON valide', async () => {
    const doc = createDemoDocument();
    const jsonStr = exportToJSON(doc, true);
    const file = new File([jsonStr], 'projet.json', { type: 'application/json' });

    const importedDoc = await importFromFile(file);

    expect(importedDoc).toBeInstanceOf(BimDocument);
    expect(Object.keys(importedDoc.getState().walls).length).toBe(4);
    expect(importedDoc.getState().units).toBe('mm');
  });

  it('importFromFile rejette un fichier JSON syntaxiquement corrompu avec BimValidationError', async () => {
    const file = new File(['{ invalid json content ...'], 'corrupted.json', {
      type: 'application/json',
    });

    await expect(importFromFile(file)).rejects.toThrowError(BimValidationError);
    await expect(importFromFile(file)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('importFromFile rejette un document dont le schemaVersion est incompatible', async () => {
    const doc = createDemoDocument();
    const state = { ...doc.getState(), schemaVersion: 999 };
    const file = new File([JSON.stringify(state)], 'future_schema.json', {
      type: 'application/json',
    });

    await expect(importFromFile(file)).rejects.toThrowError(BimValidationError);
    await expect(importFromFile(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
    });
  });

  it('Round-trip : export(doc) -> import -> export produit une chaîne JSON strictement identique bit-à-bit', async () => {
    const doc = createDemoDocument();
    const initialJSON = exportToJSON(doc, true);

    const file = new File([initialJSON], 'roundtrip.json', { type: 'application/json' });
    const importedDoc = await importFromFile(file);
    const finalJSON = exportToJSON(importedDoc, true);

    // Égalité stricte au caractère près (pas seulement deepEqual)
    expect(finalJSON).toBe(initialJSON);
  });
});
