import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BimDocument } from '@tabax/core';
import { useFederatedIfc } from './useFederatedIfc.js';

describe('useFederatedIfc Hook (Sous-phase 9.5)', () => {
  it('initialise l’état de fédération sans modèle chargé', () => {
    const doc = new BimDocument();
    const setSelectedIds = vi.fn();
    const setClashFocusPoint = vi.fn();
    const setRightDockTab = vi.fn();
    const setInfoMessage = vi.fn();
    const setErrorMessage = vi.fn();

    const { result } = renderHook(() =>
      useFederatedIfc({
        doc,
        setSelectedIds,
        setClashFocusPoint,
        setRightDockTab,
        setInfoMessage,
        setErrorMessage,
      }),
    );

    expect(result.current.federatedModels.size).toBe(0);
    expect(result.current.isFederatedPanelOpen).toBe(false);
    expect(result.current.selectedFederatedEntity).toBeNull();
    expect(result.current.federatedClashes.length).toBe(0);
  });

  it('permet de mettre à jour les options d’un modèle et de décharger', () => {
    const doc = new BimDocument();
    const { result } = renderHook(() =>
      useFederatedIfc({
        doc,
        setSelectedIds: vi.fn(),
        setClashFocusPoint: vi.fn(),
        setRightDockTab: vi.fn(),
        setInfoMessage: vi.fn(),
        setErrorMessage: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleUpdateFederatedOptions('model_1', { opacity: 0.5 });
    });

    expect(result.current.federatedOptions.get('model_1')?.opacity).toBe(0.5);

    // Décharger
    act(() => {
      result.current.handleUnloadFederatedModel('model_1');
    });

    expect(result.current.federatedModels.has('model_1')).toBe(false);
    expect(result.current.federatedOptions.has('model_1')).toBe(false);
  });
});
