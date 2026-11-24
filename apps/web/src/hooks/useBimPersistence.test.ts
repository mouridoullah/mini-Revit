import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BimDocument } from '@tabax/core';
import { useBimPersistence } from './useBimPersistence.js';

describe('useBimPersistence Hook (ADR-051, ADR-070)', () => {
  it('initialise la persistance sans verrou secondaire en contexte isolé', () => {
    const doc = new BimDocument();
    const setDocument = vi.fn();
    const setActiveLevelId = vi.fn();
    const setInfoMessage = vi.fn();

    const { result } = renderHook(() =>
      useBimPersistence({
        doc,
        hasInitialDoc: true,
        setDocument,
        setActiveLevelId,
        setInfoMessage,
      }),
    );

    expect(result.current.isSecondaryTab).toBe(false);
    expect(result.current.hasNewerVersion).toBe(false);
    expect(typeof result.current.claimLock).toBe('function');
    expect(typeof result.current.reloadLatestVersion).toBe('function');
  });

  it('tente de réclamer le verrou sans lever d’exception', async () => {
    const doc = new BimDocument();
    const { result } = renderHook(() =>
      useBimPersistence({
        doc,
        hasInitialDoc: true,
        setDocument: vi.fn(),
        setActiveLevelId: vi.fn(),
        setInfoMessage: vi.fn(),
      }),
    );

    let claimed = false;
    await act(async () => {
      claimed = await result.current.claimLock();
    });

    expect(typeof claimed).toBe('boolean');
  });
});
