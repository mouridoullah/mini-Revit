import { useState, useEffect, useCallback, useRef } from 'react';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { useBimDocument } from './hooks/useBimDocument.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { MetricsPanel } from './components/MetricsPanel.js';
import { PropertyInspector } from './components/PropertyInspector.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { useActiveTool } from './tools/useActiveTool.js';
import { exportToFile, importFromFile } from './persistence/jsonIO.js';
import {
  AutoSaveManager,
  loadFromIndexedDB,
} from './persistence/autoSave.js';
import { BimDocument, exportToIfc, detectRooms, Commands, generateId } from '@mini-bim/core';
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
  const [underlayEnabled, setUnderlayEnabled] = useState(true);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);

  const autoSaveManagerRef = useRef<AutoSaveManager | null>(null);
  if (!autoSaveManagerRef.current) {
    autoSaveManagerRef.current = new AutoSaveManager(500);
  }

  // Restauration automatique au montage depuis IndexedDB (S2-8)
  useEffect(() => {
    let isCancelled = false;
    async function restoreProject() {
      try {
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

    if (!hasInitialDoc) {
      void restoreProject();
    }

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
    const handleBeforeUnload = () => {
      if (autoSaveManagerRef.current?.isDirty()) {
        void autoSaveManagerRef.current.flushSave(doc);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
    underlayEnabled && hasUnderlayLevel ? sortedLevels[activeLevelIndex - 1]?.id ?? null : null;

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
            : Object.keys(docState.levels)[0] ?? '';
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
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Erreur lors du chargement du fichier JSON architectural.',
        );
      }
    },
    [activeTool, setDocument],
  );

  return (
    <div
      data-testid="app-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Toolbar
        activeToolKind={activeToolKind}
        onSelectTool={setActiveToolKind}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onUndo={() => undo()}
        onRedo={() => redo()}
        onSave={handleSave}
        onLoadFile={handleLoadFile}
        onExportIfc={handleExportIfc}
        onExportSvg={handleExportSvg}
        levels={Object.values(doc.getState().levels)}
        activeLevelId={activeLevelId}
        onSelectLevel={setActiveLevelId}
        onAddLevel={handleAddLevel}
        underlayEnabled={underlayEnabled}
        onToggleUnderlay={setUnderlayEnabled}
        hasUnderlayLevel={hasUnderlayLevel}
      />

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
          <span>ℹ️ {infoMessage}</span>
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
            ✕
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
          <span>⚠️ {errorMessage}</span>
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
            ✕
          </button>
        </aside>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        <main
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '100%',
            overflow: 'hidden',
            backgroundColor: '#d1d5db',
            gap: '2px',
          }}
        >
          <section
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <Viewport2D
              tool={activeTool}
              selection={selectedIds}
              onSelectionChanged={setSelectedIds}
              onDrawingLengthChange={setDrawingLength}
              onErrorChange={setErrorMessage}
              activeLevelId={activeLevelId}
              underlayLevelId={underlayLevelId}
              snapToUnderlay={underlayEnabled}
            />
          </section>

          <section
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <Viewport3D selection={selectedIds} onSelectionChanged={setSelectedIds} />
          </section>
        </main>

        <PropertyInspector
          doc={doc}
          selectedIds={selectedIds}
          isCollapsed={isInspectorCollapsed}
          onToggleCollapse={() => setIsInspectorCollapsed((p) => !p)}
        />
      </div>

      {/* Panneau rétractable du tableau de métrés et surfaces */}
      <MetricsPanel doc={doc} activeLevelId={activeLevelId} />

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
