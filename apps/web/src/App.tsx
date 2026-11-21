import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { useBimDocument } from './hooks/useBimDocument.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { ClashPanel } from './components/ClashPanel.js';
import { FederatedIfcPanel, type FederatedModelOptions } from './components/FederatedIfcPanel.js';
import { PropertyInspector } from './components/PropertyInspector.js';
import { ComponentRibbon } from './components/ComponentRibbon.js';
import { MepRibbon } from './components/MepRibbon.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { ProjectBrowser } from './components/ProjectBrowser.js';
import { RightDockPanel, type DockTab } from './components/RightDockPanel.js';
import { SplitViewport } from './components/SplitViewport.js';
import styles from './components/Cockpit.module.css';
import { useActiveTool } from './tools/useActiveTool.js';
import { ComponentTool } from './tools/ComponentTool.js';
import { MepTool, DEFAULT_MEP_CONFIG } from './tools/MepTool.js';
import { type MepToolConfig } from './tools/types.js';
import { exportToFile, importFromFile } from './persistence/jsonIO.js';
import { AutoSaveManager, loadFromIndexedDB } from './persistence/autoSave.js';
import {
  BimDocument,
  exportToIfc,
  detectRooms,
  Commands,
  generateId,
  createComplexVillaDocument,
  type ClashResult,
  type FederatedModel,
  type FederatedEntity,
  type FederatedClashCandidate,
} from '@mini-bim/core';
import { generatePlanSvg } from '@mini-bim/view-2d';

export interface AppProps {
  readonly initialDoc?: BimDocument;
}

/**
 * Layout interne de l'application coordonnant la barre d'outils, les viewports synchronisés,
 * la sélection bidirectionnelle partagée, l'historique transactionnel et la persistance.
 */
function AppContent({ hasInitialDoc }: { readonly hasInitialDoc: boolean }) {
  const { doc, undo, redo, canUndo, canRedo, setDocument } = useBimDocument();
  const { activeToolKind, setActiveToolKind, activeTool } = useActiveTool('select');
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [drawingLength, setDrawingLength] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string>(
    () => Object.keys(doc.getState().levels)[0] ?? '',
  );
  const [activeComponentTypeId, setActiveComponentTypeId] = useState<string>('ct_toilet_wall_hung');
  const [mepConfig, setMepConfig] = useState<MepToolConfig>(DEFAULT_MEP_CONFIG);
  const [mepDisplayMode, setMepDisplayMode] = useState<'single-line' | 'double-line'>(
    'single-line',
  );
  const [isWhiteMode, setIsWhiteMode] = useState(false);
  const [underlayEnabled, setUnderlayEnabled] = useState(true);
  const [isClashPanelOpen, setIsClashPanelOpen] = useState(false);
  const [rightDockTab, setRightDockTab] = useState<DockTab>('properties');
  const [isBrowserCollapsed, setIsBrowserCollapsed] = useState(false);
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);
  const ifcFileInputRef = useRef<HTMLInputElement>(null);
  const [activeClashes, setActiveClashes] = useState<readonly ClashResult[]>([]);
  const [clashFocusPoint, setClashFocusPoint] = useState<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null>(null);
  useEffect(() => {
    if (selectedIds.length > 0) setRightDockTab('properties');
  }, [selectedIds]);

  const handleSelectClash = useCallback((clash: ClashResult) => {
    setSelectedIds([clash.elementA, clash.elementB]);
    setClashFocusPoint(clash.point);
    setRightDockTab('properties');
  }, []);

  // Maquettes IFC externes fédérées en lecture seule (Sous-phase 9.5)
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

  const handleLoadFederatedIfc = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const Federation = await import('@mini-bim/core/federation');
      const model = await Federation.loadFederatedIfc(buffer, {
        modelId: `fed_${generateId()}`,
        name: file.name,
        wasmPath: '/',
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
  }, []);

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
      const Federation = await import('@mini-bim/core/federation');
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

  const handlePlanSelectionChanged = useCallback((ids: readonly string[]) => {
    setSelectedIds(ids);
    setSelectedFederatedEntity(null);
  }, []);

  const handleTargetFederatedClash = useCallback(
    (clash: FederatedClashCandidate) => {
      const model = federatedModels.get(clash.modelId);
      const entity = model?.entities[clash.expressId];
      setSelectedIds([clash.nativeId, `ifc:${clash.modelId}:${clash.expressId}`]);
      setSelectedFederatedEntity(entity ? { modelId: clash.modelId, entity } : null);
      setClashFocusPoint(clash.point);
      setRightDockTab('properties');
    },
    [federatedModels],
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

  const autoSaveManagerRef = useRef<AutoSaveManager | null>(null);
  const zoomFitRef = useRef<() => void>(() => undefined);
  const zoomFit3DRef = useRef<() => void>(() => undefined);
  const setZoomFit = useCallback((zoomFit: () => void) => {
    zoomFitRef.current = zoomFit;
  }, []);
  const setZoomFit3D = useCallback((zoomFit: () => void) => {
    zoomFit3DRef.current = zoomFit;
  }, []);
  if (!autoSaveManagerRef.current) {
    autoSaveManagerRef.current = new AutoSaveManager(500);
  }

  const hasRestoredRef = useRef(false);

  // Restauration automatique au montage initial depuis IndexedDB (S2-8 / ADR-051 §D4) ou chargement démo ?demo=roof
  useEffect(() => {
    if (hasInitialDoc || hasRestoredRef.current) {
      return;
    }
    hasRestoredRef.current = true;

    let isCancelled = false;
    async function restoreProject() {
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const demoParam = params.get('demo');
          if (demoParam === 'villa' || demoParam === 'villa-complexe') {
            if (!isCancelled) {
              setDocument(createComplexVillaDocument());
              setInfoMessage('Villa Contemporaine Complexe chargée avec succès.');
              return;
            }
          }
          if (demoParam === 'r4' || demoParam === 'immeuble-r4') {
            const resp = await fetch('/demo-immeuble-r4.json');
            if (resp.ok) {
              const text = await resp.text();
              if (!isCancelled) {
                const r4Doc = BimDocument.fromJSON(text);
                setDocument(r4Doc);
                setActiveLevelId('level_r0');
                setInfoMessage('Immeuble R+4 complet chargé avec succès !');
                return;
              }
            }
          }
          if (params.get('demo') === 'roof') {
            const resp = await fetch('/demo-roof-plan.json');
            if (resp.ok) {
              const text = await resp.text();
              if (!isCancelled) {
                const roofDoc = BimDocument.fromJSON(text);
                setDocument(roofDoc);
                setInfoMessage('Démo Toitures & Biseautage chargée');
                return;
              }
            }
          }
        }

        const result = await loadFromIndexedDB();
        if (result && !isCancelled) {
          const restoredDoc = BimDocument.fromJSON(result.json);
          setDocument(restoredDoc);
          setInfoMessage('Projet restauré depuis la sauvegarde automatique');
        }
      } catch (err) {
        console.warn('[AutoSave] Impossible de charger la sauvegarde automatique :', err);
      }
    }

    void restoreProject();

    return () => {
      isCancelled = true;
    };
  }, [hasInitialDoc, setDocument]);

  // Sauvegarde automatique réactive à chaque mutation documentaire (S2-8)
  useEffect(() => {
    const unsubscribe = doc.subscribe(() => {
      autoSaveManagerRef.current?.scheduleSave(doc);
    });
    return () => {
      unsubscribe();
      autoSaveManagerRef.current?.cancelScheduledSave();
    };
  }, [doc]);

  // Flush avant déchargement de page (S2-8)
  useEffect(() => {
    return autoSaveManagerRef.current?.attachBeforeUnload(doc);
  }, [doc]);

  // Disparition temporisée du bandeau d'information
  useEffect(() => {
    if (infoMessage) {
      const timer = setTimeout(() => setInfoMessage(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [infoMessage]);

  const sortedLevels = Object.values(doc.getState().levels).sort(
    (a, b) => a.elevation - b.elevation,
  );
  const activeLevelIndex = sortedLevels.findIndex((l) => l.id === activeLevelId);
  const hasUnderlayLevel = activeLevelIndex > 0;
  const underlayLevelId =
    underlayEnabled && hasUnderlayLevel ? (sortedLevels[activeLevelIndex - 1]?.id ?? null) : null;

  // Synchroniser activeLevelId si le document change (ex: import JSON)
  useEffect(() => {
    const levels = Object.keys(doc.getState().levels);
    if (!levels.includes(activeLevelId)) {
      setActiveLevelId(levels[0] ?? '');
    }
  }, [doc, activeLevelId]);

  // Raccourcis clavier globaux (Undo, Redo, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      const isMac =
        typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // 1. Annulation (Undo : Ctrl+Z / Cmd+Z sans Shift)
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
        return;
      }

      // 2. Rétablissement (Redo : Ctrl+Shift+Z / Cmd+Shift+Z ou Ctrl+Y sous Windows)
      const isRedoShortcut =
        (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey) ||
        (!isMac && e.ctrlKey && (e.key === 'y' || e.key === 'Y'));

      if (isRedoShortcut) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
        return;
      }

      // 3. Désélection globale (Escape)
      if (e.key === 'Escape' && selectedIds.length > 0) {
        setSelectedIds([]);
        setSelectedFederatedEntity(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, canUndo, canRedo, selectedIds]);

  const handleSave = useCallback(() => {
    exportToFile(doc, 'project.mbim.json');
  }, [doc]);

  const handleExportIfc = useCallback(() => {
    try {
      const ifcContent = exportToIfc(doc.getState(), {
        projectName: 'Projet Mini-BIM',
        filename: 'mini-bim-model.ifc',
        author: 'Mini-BIM Architect',
      });
      const blob = new Blob([ifcContent], { type: 'model/ifc;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mini-bim-model.ifc';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de l’exportation IFC4.');
    }
  }, [doc]);

  const handleExportSvg = useCallback(
    (scale: 50 | 100 | 200) => {
      try {
        const docState = doc.getState();
        const targetLevelId =
          activeLevelId && docState.levels[activeLevelId]
            ? activeLevelId
            : (Object.keys(docState.levels)[0] ?? '');
        const levelName = targetLevelId ? docState.levels[targetLevelId]?.name : 'Étage';
        const detected = targetLevelId ? detectRooms(docState, targetLevelId) : [];
        const roomsForSvg = detected.map((d) => ({
          polygon: d.polygon,
          areaMm2: d.areaMm2,
          seed: d.seed,
          name: (d.existingRoomId && docState.rooms[d.existingRoomId]?.name) || 'Pièce',
        }));

        const svgContent = generatePlanSvg(doc, {
          scale,
          title: `Plan d’Étage - ${levelName}`,
          project: 'Projet Mini-BIM',
          author: 'Mini-BIM Architect',
          levelId: targetLevelId,
          rooms: roomsForSvg,
        });

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plan-etage-1-${scale}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setInfoMessage('Plan SVG exporte.');
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Erreur lors de l’exportation du plan SVG.',
        );
      }
    },
    [doc, activeLevelId],
  );

  const handleAddLevel = useCallback(() => {
    const sorted = Object.values(doc.getState().levels).sort((a, b) => a.elevation - b.elevation);
    const topLevel = sorted[sorted.length - 1];
    const newElevation = topLevel ? topLevel.elevation + (topLevel.height ?? 2800) : 3000;
    const newLevelId = generateId();
    doc.execute(
      new Commands.AddLevelCommand({
        id: newLevelId,
        name: `Étage ${sorted.length} (R+${sorted.length})`,
        elevation: newElevation,
        height: 2800,
      }),
    );
    setActiveLevelId(newLevelId);
  }, [doc]);

  const handleLoadFile = useCallback(
    async (file: File) => {
      try {
        activeTool.reset();
        setSelectedIds([]);
        setDrawingLength(null);
        const newDoc = await importFromFile(file);
        setDocument(newDoc);
        setActiveLevelId(Object.keys(newDoc.getState().levels)[0] ?? '');
        setActiveToolKind('select');
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erreur lors du chargement du fichier JSON architectural.',
        );
      }
    },
    [activeTool, setDocument, setActiveToolKind],
  );

  const handleLoadR4Demo = useCallback(async () => {
    try {
      activeTool.reset();
      setSelectedIds([]);
      setDrawingLength(null);
      const resp = await fetch('/demo-immeuble-r4.json');
      if (!resp.ok) {
        throw new Error(`Échec du téléchargement (/demo-immeuble-r4.json: ${resp.status})`);
      }
      const text = await resp.text();
      const r4Doc = BimDocument.fromJSON(text);
      setDocument(r4Doc);
      setActiveLevelId('level_r0');
      setInfoMessage('Immeuble R+4 complet chargé avec succès !');
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erreur lors du chargement de la démo R+4.',
      );
    }
  }, [activeTool, setDocument]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const id = selectedIds[0];
    if (!id) return;
    const state = doc.getState();
    try {
      if (state.walls[id]) doc.execute(new Commands.DeleteWallCommand(id));
      else if (state.doors?.[id] || state.windows?.[id]) doc.execute(new Commands.DeleteOpeningCommand(id));
      else if (state.slabs?.[id]) doc.execute(new Commands.DeleteSlabCommand(id));
      else if (state.stairs?.[id]) doc.execute(new Commands.DeleteStairCommand(id));
      else if (state.roofs?.[id]) doc.execute(new Commands.DeleteRoofCommand(id));
      else if (state.components?.[id]) doc.execute(new Commands.DeleteComponentCommand(id));
      else if (
        state.pipes?.[id] ||
        state.ducts?.[id] ||
        state.cableTrays?.[id] ||
        state.mepFittings?.[id] ||
        state.mepEquipments?.[id]
      )
        doc.execute(new Commands.DeleteMepElementCommand(id));
      else if (state.rooms?.[id]) doc.execute(new Commands.DeleteRoomCommand(id));
      else if (state.dimensions?.[id]) doc.execute(new Commands.DeleteDimensionCommand(id));
      else return;
      setSelectedIds([]);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Impossible de supprimer cet élément.');
    }
  }, [doc, selectedIds]);

  const mepControls =
    activeToolKind === 'mep' ? (
      <MepRibbon
        config={mepConfig}
        onChangeConfig={(patch) => {
          setMepConfig((prev) => {
            const next = { ...prev, ...patch };
            if (activeTool instanceof MepTool) activeTool.setConfig(next);
            return next;
          });
        }}
        displayMode={mepDisplayMode}
        onToggleDisplayMode={setMepDisplayMode}
      />
    ) : null;

  return (
    <div data-testid="app-root" className={styles.root}>
      <Toolbar
        activeToolKind={activeToolKind}
        onSelectTool={setActiveToolKind}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onSave={handleSave}
        onLoadFile={handleLoadFile}
        onRequestLoadIfc={() => ifcFileInputRef.current?.click()}
        onToggleMetrics={() => setIsMetricsCollapsed((collapsed) => !collapsed)}
        onLoadR4Demo={handleLoadR4Demo}
        onExportIfc={handleExportIfc}
        onExportSvg={handleExportSvg}
        levels={Object.values(doc.getState().levels)}
        activeLevelId={activeLevelId}
        onSelectLevel={setActiveLevelId}
        onAddLevel={handleAddLevel}
        underlayEnabled={underlayEnabled}
        onToggleUnderlay={setUnderlayEnabled}
        hasUnderlayLevel={hasUnderlayLevel}
        isClashPanelOpen={isClashPanelOpen}
        onToggleClashPanel={() => {
          setIsClashPanelOpen((prev) => !prev);
          setRightDockTab('clashes');
        }}
        isFederatedPanelOpen={isFederatedPanelOpen}
        onToggleFederatedPanel={() => {
          setIsFederatedPanelOpen((prev) => !prev);
          setRightDockTab('ifc');
        }}
        federatedModelCount={federatedModels.size}
        onOpenDockTab={setRightDockTab}
        mepControls={mepControls}
      />
      <input
        ref={ifcFileInputRef}
        data-testid="ifc-file-input"
        type="file"
        accept=".ifc"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleLoadFederatedIfc(file);
          event.target.value = '';
        }}
      />

      {/* Galerie / Bandeau d'options pour l'outil Composant (Phase 8) */}
      {activeToolKind === 'component' && (
        <ComponentRibbon
          componentTypes={doc.getState().componentTypes ?? {}}
          activeComponentTypeId={activeComponentTypeId}
          onSelectComponentType={setActiveComponentTypeId}
          onRotate={() => {
            if (activeTool instanceof ComponentTool) {
              activeTool.rotate90();
            }
          }}
        />
      )}

      {/* Bannière de notification d'information (ex. restauration automatique) */}
      {infoMessage && (
        <aside
          data-testid="info-banner"
          style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 50,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span>{infoMessage}</span>
          <button
            type="button"
            data-testid="close-info-banner-btn"
            onClick={() => setInfoMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '2px 8px',
            }}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </aside>
      )}

      {/* Bannière de notification d'erreur (ex. import corrompu) */}
      {errorMessage && (
        <aside
          data-testid="error-banner"
          style={{
            backgroundColor: '#dc2626',
            color: '#ffffff',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 50,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            data-testid="close-error-banner-btn"
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              padding: '2px 8px',
            }}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </aside>
      )}

      <div className={styles.body}>
        <ProjectBrowser
          levels={sortedLevels}
          activeLevelId={activeLevelId}
          onSelectLevel={setActiveLevelId}
          onAddLevel={handleAddLevel}
          underlayEnabled={underlayEnabled}
          onToggleUnderlay={setUnderlayEnabled}
          hasUnderlayLevel={hasUnderlayLevel}
          models={Array.from(federatedModels.values())}
          systems={Object.values(doc.getState().mepSystems ?? {})}
          visibility={
            new Map(Array.from(federatedOptions, ([id, options]) => [id, options.visible]))
          }
          onToggleModel={(id) =>
            handleUpdateFederatedOptions(id, {
              visible: !(federatedOptions.get(id)?.visible ?? true),
            })
          }
          onLoadIfc={() => ifcFileInputRef.current?.click()}
          onMetrics={() => setIsMetricsCollapsed((collapsed) => !collapsed)}
          collapsed={isBrowserCollapsed}
          onToggleCollapsed={() => setIsBrowserCollapsed((collapsed) => !collapsed)}
        />
        <SplitViewport
          levelName={doc.getState().levels[activeLevelId]?.name ?? 'Niveau'}
          onZoomFit={() => zoomFitRef.current()}
          onZoomFit3D={() => zoomFit3DRef.current()}
          isWhiteMode={isWhiteMode}
          onToggleWhiteMode={() => setIsWhiteMode((current) => !current)}
          twoD={
            <Viewport2D
              tool={activeTool}
              selection={selectedIds}
              onSelectionChanged={handlePlanSelectionChanged}
              onDrawingLengthChange={setDrawingLength}
              onErrorChange={setErrorMessage}
              activeLevelId={activeLevelId}
              underlayLevelId={underlayLevelId}
              snapToUnderlay={underlayEnabled}
              activeComponentTypeId={activeComponentTypeId}
              mepConfig={mepConfig}
              mepDisplayMode={mepDisplayMode}
              onZoomFitReady={setZoomFit}
            />
          }
          threeD={
            <Viewport3D
              isWhiteMode={isWhiteMode}
              onZoomFitReady={setZoomFit3D}
              selection={selectedIds}
              onSelectionChanged={setSelectedIds}
              clashes={activeClashes}
              focusPoint={clashFocusPoint}
              federatedModels={federatedVisuals}
              federatedSelection={
                selectedFederatedEntity
                  ? {
                      modelId: selectedFederatedEntity.modelId,
                      expressId: selectedFederatedEntity.entity.expressId,
                    }
                  : null
              }
              onSelectFederatedEntity={handleSelectFederatedEntity}
            />
          }
        />
        <RightDockPanel
          activeTab={rightDockTab}
          onTabChange={setRightDockTab}
          selectedCount={selectedIds.length}
          clashCount={activeClashes.length + federatedClashes.length}
          modelCount={federatedModels.size}
          properties={
            <PropertyInspector
              doc={doc}
              selectedIds={selectedIds}
              isCollapsed={false}
              onDeleteSelected={handleDeleteSelected}
            />
          }
          clashes={
            <ClashPanel
              doc={doc}
              embedded
              isCollapsed={!isClashPanelOpen}
              onToggleCollapse={() => setIsClashPanelOpen((open) => !open)}
              onSelectClash={handleSelectClash}
              onClashesChanged={setActiveClashes}
            />
          }
          ifc={
            <FederatedIfcPanel
              embedded
              models={Array.from(federatedModels.values())}
              options={federatedOptions}
              selectedEntity={selectedFederatedEntity}
              isCollapsed={!isFederatedPanelOpen}
              onToggleCollapse={() => setIsFederatedPanelOpen((open) => !open)}
              onSelectEntity={(modelId, entity) =>
                setSelectedFederatedEntity(entity ? { modelId, entity } : null)
              }
              onUpdateOptions={handleUpdateFederatedOptions}
              onUnloadModel={handleUnloadFederatedModel}
              onFocusPoint={(point) => setClashFocusPoint(point)}
              onTargetClash={handleTargetFederatedClash}
              onCheckClashes={handleCheckFederatedClashes}
              clashCandidates={federatedClashes}
            />
          }
        />
      </div>

      {/* Panneau rétractable du tableau de métrés et surfaces */}
      <div className={`${styles.metrics} ${!isMetricsCollapsed ? styles.metricsExpanded : ''}`}>
        <MetricsPanel
          doc={doc}
          activeLevelId={activeLevelId}
          isCollapsed={isMetricsCollapsed}
          onToggleCollapse={() => setIsMetricsCollapsed((collapsed) => !collapsed)}
        />
      </div>

      <StatusBar
        activeToolKind={activeToolKind}
        drawingLength={drawingLength}
        activeLevelId={activeLevelId}
      />
    </div>
  );
}

/**
 * Composant racine de l'application Mini-BIM.
 * Agence le layout en deux viewports synchronisés côte à côte (2D Plan & 3D Orbital).
 */
export function App({ initialDoc }: AppProps) {
  return (
    <BimDocumentProvider initialDoc={initialDoc}>
      <AppContent hasInitialDoc={initialDoc !== undefined} />
    </BimDocumentProvider>
  );
}
