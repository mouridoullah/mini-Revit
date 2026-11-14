import { useState, useEffect, useCallback } from 'react';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { useBimDocument } from './hooks/useBimDocument.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { useActiveTool } from './tools/useActiveTool.js';
import { exportToFile, importFromFile } from './persistence/jsonIO.js';
import { type BimDocument } from '@mini-bim/core';

export interface AppProps {
  readonly initialDoc?: BimDocument;
}

/**
 * Layout interne de l'application coordonnant la barre d'outils, les viewports synchronisés,
 * la sélection bidirectionnelle partagée, l'historique transactionnel et la persistance.
 */
function AppContent() {
  const { doc, undo, redo, canUndo, canRedo, setDocument } = useBimDocument();
  const { activeToolKind, setActiveToolKind, activeTool } = useActiveTool('select');
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [drawingLength, setDrawingLength] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      />

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

      <StatusBar activeToolKind={activeToolKind} drawingLength={drawingLength} />
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
      <AppContent />
    </BimDocumentProvider>
  );
}
