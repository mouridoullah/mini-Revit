import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { useBimDocument } from './hooks/useBimDocument.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { FederatedIfcPanel } from './components/FederatedIfcPanel.js';
import { PropertyInspector } from './components/PropertyInspector.js';
import { ComponentRibbon } from './components/ComponentRibbon.js';
import { MepRibbon } from './components/MepRibbon.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { ProjectBrowser } from './components/ProjectBrowser.js';
import { RightDockPanel, type DockTab } from './components/RightDockPanel.js';
import { SplitViewport, type ViewMode } from './components/SplitViewport.js';
import { SectionViewport } from './components/SectionViewport.js';
import { ClashWorkspace } from './components/ClashWorkspace.js';
import { ExportPdfModal } from './components/ExportPdfModal.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import styles from './components/Cockpit.module.css';
import { useActiveTool } from './tools/useActiveTool.js';
import { ComponentTool } from './tools/ComponentTool.js';
import { MepTool, DEFAULT_MEP_CONFIG } from './tools/MepTool.js';
import { type MepToolConfig } from './tools/types.js';
import {
  BimDocument,
  Commands,
  generateId,
  type ClashResult,
} from '@tabax/core';
import { useBimPersistence } from './hooks/useBimPersistence.js';
import { useBimExport } from './hooks/useBimExport.js';
import { useFederatedIfc } from './hooks/useFederatedIfc.js';
import { useBimShortcuts } from './hooks/useBimShortcuts.js';
import { useSectionCuts } from './hooks/useSectionCuts.js';

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
  const [activeWallTypeId, setActiveWallTypeId] = useState<string>(
    () => Object.keys(doc.getState().wallTypes)[0] ?? '',
  );
  const [activeComponentTypeId, setActiveComponentTypeId] = useState<string>('ct_toilet_wall_hung');
  const [mepConfig, setMepConfig] = useState<MepToolConfig>(DEFAULT_MEP_CONFIG);
  const [mepDisplayMode, setMepDisplayMode] = useState<'single-line' | 'double-line'>(
    'single-line',
  );
  const [isWhiteMode, setIsWhiteMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [underlayEnabled, setUnderlayEnabled] = useState(true);
  const [rightDockTab, setRightDockTab] = useState<DockTab>('properties');
  const [isBrowserCollapsed, setIsBrowserCollapsed] = useState(false);
  const [isExportPdfOpen, setIsExportPdfOpen] = useState(false);
  const [isMetricsCollapsed, setIsMetricsCollapsed] = useState(true);
  const [dismissMultiTab, setDismissMultiTab] = useState(false);
  const ifcFileInputRef = useRef<HTMLInputElement>(null);
  const [activeClashes, setActiveClashes] = useState<readonly ClashResult[]>([]);
  const [clashFocusPoint, setClashFocusPoint] = useState<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly triggerId?: number;
  } | null>(null);
  const [focus2DPoint, setFocus2DPoint] = useState<{
    readonly x: number;
    readonly y: number;
    readonly triggerId?: number;
  } | null>(null);

  // 1b. Hook de Coupes & Élévations 2D / 3D (ADR-063)
  const {
    activeSectionCutId,
    setActiveSectionCutId,
    is3dSynchroEnabled,
    toggle3dSynchro,
    activeSectionCut,
    activeSectionCutFor3D,
  } = useSectionCuts(doc);
  useEffect(() => {
    if (selectedIds.length > 0 && rightDockTab !== 'ifc') {
      setRightDockTab('properties');
    }
  }, [selectedIds, rightDockTab]);

  const handleSelectClash = useCallback(
    (clash: ClashResult) => {
      setSelectedIds([clash.elementA, clash.elementB]);
      const state = doc.getState();
      const levelId =
        state.walls[clash.elementA]?.levelId ??
        state.pipes?.[clash.elementA]?.levelId ??
        state.ducts?.[clash.elementA]?.levelId ??
        state.cableTrays?.[clash.elementA]?.levelId ??
        state.slabs?.[clash.elementA]?.levelId ??
        state.walls[clash.elementB]?.levelId ??
        state.pipes?.[clash.elementB]?.levelId ??
        state.ducts?.[clash.elementB]?.levelId ??
        state.cableTrays?.[clash.elementB]?.levelId ??
        state.slabs?.[clash.elementB]?.levelId;

      if (levelId) {
        setActiveLevelId(levelId);
      }
      setClashFocusPoint({
        x: clash.point.x,
        y: clash.point.y,
        z: clash.point.z,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode('clashes');
    },
    [doc],
  );

  const handleFocusPoint3D = useCallback(
    (point: { readonly x: number; readonly y: number; readonly z: number }) => {
      setClashFocusPoint({
        x: point.x,
        y: point.y,
        z: point.z,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode((current) => (current === '2d' || current === 'section' ? 'split' : current));
    },
    [],
  );

  const handleLocate2D = useCallback(
    (point: { readonly x: number; readonly y: number }, levelId?: string) => {
      if (levelId) {
        setActiveLevelId(levelId);
      }
      setFocus2DPoint({
        x: point.x,
        y: point.y,
        triggerId: Date.now() + Math.random(),
      });
      setViewMode((current) => (current === '3d' || current === 'section' ? 'split' : current));
    },
    [],
  );

  // 1. Hook de Fédération IFC (Sous-phase 9.5)
  const {
    federatedModels,
    federatedOptions,
    isFederatedPanelOpen,
    setIsFederatedPanelOpen,
    selectedFederatedEntity,
    setSelectedFederatedEntity,
    federatedClashes,
    federatedVisuals,
    handleLoadFederatedIfc,
    handleUnloadFederatedModel,
    handleUpdateFederatedOptions,
    handleCheckFederatedClashes,
    handleSelectFederatedEntity,
    handleTargetFederatedClash,
  } = useFederatedIfc({
    doc,
    setSelectedIds,
    setClashFocusPoint,
    setRightDockTab,
    setInfoMessage,
    setErrorMessage,
  });

  const handlePlanSelectionChanged = useCallback(
    (ids: readonly string[]) => {
      setSelectedIds(ids);
      setSelectedFederatedEntity(null);
      const firstId = ids[0];
      if (ids.length === 1 && firstId && doc.getState().sectionCuts?.[firstId]) {
        setActiveSectionCutId(firstId);
      }
    },
    [doc, setSelectedFederatedEntity, setActiveSectionCutId],
  );

  const zoomFitRef = useRef<() => void>(() => undefined);
  const zoomFit3DRef = useRef<() => void>(() => undefined);
  const setZoomFit = useCallback((zoomFit: () => void) => {
    zoomFitRef.current = zoomFit;
  }, []);
  const setZoomFit3D = useCallback((zoomFit: () => void) => {
    zoomFit3DRef.current = zoomFit;
  }, []);

  // 2. Hook de Persistance (IndexedDB, AutoSave réactif, Web Locks & BroadcastChannel)
  const { isSecondaryTab, reloadLatestVersion, claimLock } = useBimPersistence({
    doc,
    hasInitialDoc,
    setDocument,
    setActiveLevelId,
    setInfoMessage,
  });

  // 3. Hook d'Export & Import (JSON, IFC4, SVG, Démo R+4)
  const {
    handleSave,
    handleExportIfc,
    handleExportSvg,
    handleExportPlanDxf,
    handleExportPdfBook,
    handleLoadFile,
    handleLoadR4Demo,
  } = useBimExport({
    doc,
    activeLevelId,
    resetActiveTool: () => activeTool.reset(),
    setSelectedIds,
    setDrawingLength,
    setDocument,
    setActiveLevelId,
    setActiveToolKind,
    setErrorMessage,
    setInfoMessage,
  });

  // 4. Hook de Raccourcis Clavier Globaux (Undo, Redo, Escape)
  useBimShortcuts({
    undo,
    redo,
    canUndo,
    canRedo,
    selectedIds,
    onClearSelection: () => {
      setSelectedIds([]);
      setSelectedFederatedEntity(null);
    },
  });

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
      else if (state.sectionCuts?.[id]) doc.execute(new Commands.DeleteSectionCutCommand(id));
      else return;
      setSelectedIds([]);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Impossible de supprimer cet élément.');
    }
  }, [doc, selectedIds]);

  const handleAutoDimensionFloor = useCallback(() => {
    if (!activeLevelId) return;
    try {
      doc.execute(new Commands.AutoDimensionLevelCommand(activeLevelId));
      setInfoMessage("Cotation automatique de l'étage générée avec succès.");
      setErrorMessage(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de la cotation automatique.');
    }
  }, [doc, activeLevelId]);

  const handleAutoGenerateViews = useCallback(() => {
    try {
      doc.execute(new Commands.AutoGenerateViewsCommand());
      setInfoMessage('4 élévations et 2 coupes générées automatiquement.');
      setErrorMessage(null);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la génération automatique des vues.',
      );
    }
  }, [doc]);

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
        onExportPlanDxf={handleExportPlanDxf}
        onExportPdfBook={() => setIsExportPdfOpen(true)}
        onAutoDimensionFloor={handleAutoDimensionFloor}
        onAutoGenerateViews={handleAutoGenerateViews}
        levels={Object.values(doc.getState().levels)}
        activeLevelId={activeLevelId}
        onSelectLevel={setActiveLevelId}
        onAddLevel={handleAddLevel}
        underlayEnabled={underlayEnabled}
        onToggleUnderlay={setUnderlayEnabled}
        hasUnderlayLevel={hasUnderlayLevel}
        isClashPanelOpen={viewMode === 'clashes'}
        onToggleClashPanel={() => {
          setViewMode((prev) => (prev === 'clashes' ? 'split' : 'clashes'));
        }}
        isFederatedPanelOpen={isFederatedPanelOpen}
        onToggleFederatedPanel={() => {
          setIsFederatedPanelOpen((prev) => !prev);
          setRightDockTab('ifc');
        }}
        federatedModelCount={federatedModels.size}
        onOpenDockTab={setRightDockTab}
        mepControls={mepControls}
        wallTypes={doc.getState().wallTypes}
        activeWallTypeId={activeWallTypeId}
        onSelectWallType={setActiveWallTypeId}
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

      {/* Bannière de conflit multi-onglets (ADR-070) */}
      {isSecondaryTab && !dismissMultiTab && (
        <aside
          data-testid="multi-tab-warning-banner"
          style={{
            backgroundColor: '#d97706',
            color: '#ffffff',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 50,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            gap: '12px',
          }}
        >
          <span>Projet déjà ouvert dans un autre onglet — sauvegarde automatique suspendue</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              data-testid="claim-lock-btn"
              onClick={async () => {
                const acquired = await claimLock();
                if (acquired) {
                  setDismissMultiTab(true);
                }
              }}
              style={{
                backgroundColor: '#ffffff',
                color: '#92400e',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Prendre la main sur la sauvegarde automatique dans cet onglet"
            >
              Prendre la main
            </button>
            <button
              type="button"
              data-testid="reload-latest-btn"
              onClick={() => void reloadLatestVersion()}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Recharger
            </button>
            <button
              type="button"
              data-testid="dismiss-lock-banner-btn"
              onClick={() => setDismissMultiTab(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                opacity: 0.85,
              }}
              title="Fermer cet avertissement"
            >
              <X size={16} />
            </button>
          </div>
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
          sectionCuts={Object.values(doc.getState().sectionCuts ?? {})}
          activeSectionCutId={activeSectionCutId}
          onSelectSectionCut={(cutId) => {
            setActiveSectionCutId(cutId);
            setSelectedIds([cutId]);
            setViewMode('section');
          }}
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
          activeSectionName={activeSectionCut?.name}
          mode={viewMode}
          onModeChange={setViewMode}
          onZoomFit={() => zoomFitRef.current()}
          onZoomFit3D={() => zoomFit3DRef.current()}
          isWhiteMode={isWhiteMode}
          onToggleWhiteMode={() => setIsWhiteMode((current) => !current)}
          section={
            <ErrorBoundary name="Coupe 2D">
              <SectionViewport
                sectionCutId={activeSectionCutId}
                is3dSynchroEnabled={is3dSynchroEnabled}
                onToggle3dSynchro={toggle3dSynchro}
              />
            </ErrorBoundary>
          }
          twoD={
            <ErrorBoundary name="Vue 2D">
              <Viewport2D
                tool={activeTool}
                selection={selectedIds}
                onSelectionChanged={handlePlanSelectionChanged}
                onDrawingLengthChange={setDrawingLength}
                onErrorChange={setErrorMessage}
                activeLevelId={activeLevelId}
                activeWallTypeId={activeWallTypeId}
                underlayLevelId={underlayLevelId}
                snapToUnderlay={underlayEnabled}
                activeComponentTypeId={activeComponentTypeId}
                mepConfig={mepConfig}
                mepDisplayMode={mepDisplayMode}
                onZoomFitReady={setZoomFit}
                focusPoint={focus2DPoint}
              />
            </ErrorBoundary>
          }
          clashes={
            <ErrorBoundary name="Espace Dédié Coordination & Conflits">
              <ClashWorkspace
                doc={doc}
                clashes={activeClashes}
                onClashesChanged={setActiveClashes}
                onSelectClash={handleSelectClash}
                onFocusPoint3D={handleFocusPoint3D}
                onLocate2D={handleLocate2D}
                onClose={() => setViewMode('split')}
                viewport3D={
                  <ErrorBoundary name="Vue 3D Conflits">
                    <Viewport3D
                      isWhiteMode={isWhiteMode}
                      selection={selectedIds}
                      onSelectionChanged={setSelectedIds}
                      clashes={activeClashes}
                      focusPoint={clashFocusPoint}
                      federatedModels={federatedVisuals}
                      activeSectionCut={activeSectionCutFor3D}
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
                  </ErrorBoundary>
                }
                viewport2D={
                  <ErrorBoundary name="Vue 2D Conflits">
                    <Viewport2D
                      tool={activeTool}
                      selection={selectedIds}
                      onSelectionChanged={handlePlanSelectionChanged}
                      onDrawingLengthChange={setDrawingLength}
                      onErrorChange={setErrorMessage}
                      activeLevelId={activeLevelId}
                      activeWallTypeId={activeWallTypeId}
                      underlayLevelId={underlayLevelId}
                      snapToUnderlay={underlayEnabled}
                      activeComponentTypeId={activeComponentTypeId}
                      mepConfig={mepConfig}
                      mepDisplayMode={mepDisplayMode}
                      focusPoint={focus2DPoint}
                    />
                  </ErrorBoundary>
                }
              />
            </ErrorBoundary>
          }
          threeD={
            <ErrorBoundary name="Vue 3D">
              <Viewport3D
                isWhiteMode={isWhiteMode}
                onZoomFitReady={setZoomFit3D}
                selection={selectedIds}
                onSelectionChanged={setSelectedIds}
                clashes={activeClashes}
                focusPoint={clashFocusPoint}
                federatedModels={federatedVisuals}
                activeSectionCut={activeSectionCutFor3D}
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
            </ErrorBoundary>
          }
        />
        <RightDockPanel
          activeTab={rightDockTab}
          onTabChange={setRightDockTab}
          selectedCount={selectedIds.length}
          modelCount={federatedModels.size}
          properties={
            <ErrorBoundary name="Inspecteur de Propriétés">
              <PropertyInspector
                doc={doc}
                selectedIds={selectedIds}
                isCollapsed={false}
                onDeleteSelected={handleDeleteSelected}
                embedded
              />
            </ErrorBoundary>
          }
          ifc={
            <ErrorBoundary name="Panneau IFC Fédéré">
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
            </ErrorBoundary>
          }
        />
      </div>

      {/* Panneau rétractable du tableau de métrés et surfaces */}
      <div className={`${styles.metrics} ${!isMetricsCollapsed ? styles.metricsExpanded : ''}`}>
        <ErrorBoundary name="Tableau de Métrés">
          <MetricsPanel
            doc={doc}
            activeLevelId={activeLevelId}
            isCollapsed={isMetricsCollapsed}
            onToggleCollapse={() => setIsMetricsCollapsed((collapsed) => !collapsed)}
          />
        </ErrorBoundary>
      </div>

      <StatusBar
        activeToolKind={activeToolKind}
        drawingLength={drawingLength}
        activeLevelId={activeLevelId}
      />

      <ExportPdfModal
        isOpen={isExportPdfOpen}
        onClose={() => setIsExportPdfOpen(false)}
        onExport={handleExportPdfBook}
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
