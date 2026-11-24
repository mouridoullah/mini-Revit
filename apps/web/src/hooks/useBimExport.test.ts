import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BimDocument } from '@tabax/core';
import { useBimExport } from './useBimExport.js';
import * as jsonIO from '../persistence/jsonIO.js';

vi.mock('../persistence/jsonIO.js', () => ({
  exportToFile: vi.fn(),
  importFromFile: vi.fn(),
}));

vi.mock('@tabax/view-2d', () => ({
  generatePlanSvg: vi.fn(() => '<svg></svg>'),
  generatePlanDxf: vi.fn(() => '0\nSECTION\n'),
  generatePdfBook: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

describe('useBimExport Hook', () => {
  it('fournit les fonctions d’exportation et appelle exportToFile lors de la sauvegarde', () => {
    const doc = new BimDocument();
    const setDocument = vi.fn();
    const setErrorMessage = vi.fn();
    const setInfoMessage = vi.fn();

    const { result } = renderHook(() =>
      useBimExport({
        doc,
        activeLevelId: 'level_0',
        resetActiveTool: vi.fn(),
        setSelectedIds: vi.fn(),
        setDrawingLength: vi.fn(),
        setDocument,
        setActiveLevelId: vi.fn(),
        setActiveToolKind: vi.fn(),
        setErrorMessage,
        setInfoMessage,
      }),
    );

    act(() => {
      result.current.handleSave();
    });

    expect(jsonIO.exportToFile).toHaveBeenCalledWith(doc, 'project.mbim.json');
  });

  it('gère l’import d’un fichier JSON invalide en positionnant une erreur', async () => {
    const doc = new BimDocument();
    const setDocument = vi.fn();
    const setErrorMessage = vi.fn();
    const setInfoMessage = vi.fn();

    vi.mocked(jsonIO.importFromFile).mockRejectedValueOnce(new Error('Format invalide'));

    const { result } = renderHook(() =>
      useBimExport({
        doc,
        activeLevelId: 'level_0',
        resetActiveTool: vi.fn(),
        setSelectedIds: vi.fn(),
        setDrawingLength: vi.fn(),
        setDocument,
        setActiveLevelId: vi.fn(),
        setActiveToolKind: vi.fn(),
        setErrorMessage,
        setInfoMessage,
      }),
    );

    const dummyFile = new File(['bad content'], 'corrupt.json', { type: 'application/json' });

    await act(async () => {
      await result.current.handleLoadFile(dummyFile);
    });

    expect(setErrorMessage).toHaveBeenCalled();
  });
});
