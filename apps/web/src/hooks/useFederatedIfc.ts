import { useState, useCallback, useMemo } from 'react';
import {
  generateId,
  type BimDocument,
  type FederatedModel,
  type FederatedEntity,
  type FederatedClashCandidate,
} from '@tabax/core';
import type { FederatedModelOptions } from '../components/FederatedIfcPanel.js';
import type { DockTab } from '../components/RightDockPanel.js';

export interface UseFederatedIfcOptions {
  readonly doc: BimDocument;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setClashFocusPoint: (
    point: { readonly x: number; readonly y: number; readonly z: number } | null,
  ) => void;
  readonly setRightDockTab: (tab: DockTab) => void;
  readonly setInfoMessage: (msg: string | null) => void;
  readonly setErrorMessage: (msg: string | null) => void;
}

/**
 * Hook gérant la fédération de maquettes IFC externes (Sous-phase 9.5) :
 * - Chargement et parsing WebIFC en Worker/WASM
 * - Options visuelles (transparence, wireframe, translation géoréférencée)
 * - Sélection et inspection d'entités IFC (IfcWall, IfcBeam, IfcPipeSegment...)
 * - Détection de clashs inter-maquettes (BVH fédéré vs géométrie native)
 */
export function useFederatedIfc({
  doc,
  setSelectedIds,
  setClashFocusPoint,
  setRightDockTab,
  setInfoMessage,
  setErrorMessage,
}: UseFederatedIfcOptions) {
  const [federatedModels, setFederatedModels] = useState<Map<string, FederatedModel>>(new Map());
  const [federatedOptions, setFederatedOptions] = useState<Map<string, FederatedModelOptions>>(
    new Map(),
  );
  const [isFederatedPanelOpen, setIsFederatedPanelOpen] = useState(false);
  const [selectedFederatedEntity, setSelectedFederatedEntity] = useState<{
    modelId: string;
    entity: FederatedEntity;
  } | null>(null);
  const [federatedClashes, setFederatedClashes] = useState<readonly FederatedClashCandidate[]>([]);

  const handleLoadFederatedIfc = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const Federation = await import('@tabax/core/federation');
        const model = await Federation.loadFederatedIfc(buffer, {
          modelId: `fed_${generateId()}`,
          name: file.name,
          wasmPath: import.meta.env.BASE_URL,
        });

        setFederatedModels((prev) => {
          const next = new Map(prev);
          next.set(model.id, model);
          return next;
        });

        setFederatedOptions((prev) => {
          const next = new Map(prev);
          next.set(model.id, {
            visible: true,
            opacity: 0.35,
            wireframe: false,
            offset: { x: 0, y: 0, z: 0 },
          });
          return next;
        });

        setIsFederatedPanelOpen(true);
        setRightDockTab('ifc');
        setInfoMessage(
          `Maquette IFC "${file.name}" chargée en référence (${model.entityCount} entités).`,
        );
      } catch (err) {
        setErrorMessage(`Échec du chargement du fichier IFC : ${(err as Error).message}`);
      }
    },
    [setRightDockTab, setInfoMessage, setErrorMessage],
  );

  const handleUnloadFederatedModel = useCallback((modelId: string) => {
    setFederatedModels((prev) => {
      const next = new Map(prev);
      next.delete(modelId);
      return next;
    });
    setFederatedOptions((prev) => {
      const next = new Map(prev);
      next.delete(modelId);
      return next;
    });
    setSelectedFederatedEntity((curr) => (curr?.modelId === modelId ? null : curr));
    setFederatedClashes([]);
  }, []);

  const handleUpdateFederatedOptions = useCallback(
    (modelId: string, patch: Partial<FederatedModelOptions>) => {
      setFederatedOptions((prev) => {
        const next = new Map(prev);
        const existing = next.get(modelId) ?? {
          visible: true,
          opacity: 0.35,
          wireframe: false,
          offset: { x: 0, y: 0, z: 0 },
        };
        next.set(modelId, { ...existing, ...patch });
        return next;
      });
    },
    [],
  );

  const handleCheckFederatedClashes = useCallback(
    async (modelId: string) => {
      const model = federatedModels.get(modelId);
      if (!model) return;
      const opts = federatedOptions.get(modelId);
      const Federation = await import('@tabax/core/federation');
      const results = Federation.detectFederatedClashes(doc.getState(), model, {
        offset: opts?.offset,
      });
      setFederatedClashes(results);
    },
    [doc, federatedModels, federatedOptions],
  );

  const handleSelectFederatedEntity = useCallback(
    (modelId: string | null, expressId: number | null) => {
      if (!modelId || expressId === null) {
        setSelectedFederatedEntity(null);
        return;
      }
      const model = federatedModels.get(modelId);
      const entity = model?.entities[expressId];
      if (entity) {
        setSelectedFederatedEntity({ modelId, entity });
        setIsFederatedPanelOpen(true);
      } else {
        setSelectedFederatedEntity(null);
      }
    },
    [federatedModels],
  );

  const handleTargetFederatedClash = useCallback(
    (clash: FederatedClashCandidate) => {
      const model = federatedModels.get(clash.modelId);
      const entity = model?.entities[clash.expressId];
      setSelectedIds([clash.nativeId, `ifc:${clash.modelId}:${clash.expressId}`]);
      setSelectedFederatedEntity(entity ? { modelId: clash.modelId, entity } : null);
      setClashFocusPoint(clash.point);
      setRightDockTab('properties');
    },
    [federatedModels, setSelectedIds, setClashFocusPoint, setRightDockTab],
  );

  const federatedVisuals = useMemo(() => {
    return Array.from(federatedModels.values()).map((m) => {
      const opts = federatedOptions.get(m.id) ?? {
        visible: true,
        opacity: 0.35,
        wireframe: false,
        offset: { x: 0, y: 0, z: 0 },
      };
      return {
        id: m.id,
        name: m.name,
        items: m.meshes,
        ...opts,
      };
    });
  }, [federatedModels, federatedOptions]);

  return {
    federatedModels,
    federatedOptions,
    isFederatedPanelOpen,
    setIsFederatedPanelOpen,
    selectedFederatedEntity,
    setSelectedFederatedEntity,
    federatedClashes,
    setFederatedClashes,
    federatedVisuals,
    handleLoadFederatedIfc,
    handleUnloadFederatedModel,
    handleUpdateFederatedOptions,
    handleCheckFederatedClashes,
    handleSelectFederatedEntity,
    handleTargetFederatedClash,
  };
}
