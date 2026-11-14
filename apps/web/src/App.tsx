import { useState } from 'react';
import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { useActiveTool } from './tools/useActiveTool.js';
import { type BimDocument } from '@mini-bim/core';

export interface AppProps {
  readonly initialDoc?: BimDocument;
}

/**
 * Layout interne de l'application connectant la barre d'outils, les viewports et la barre d'état.
 */
function AppContent() {
  const { activeToolKind, setActiveToolKind, activeTool } = useActiveTool('select');
  const [drawingLength, setDrawingLength] = useState<number | null>(null);

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
      <Toolbar activeToolKind={activeToolKind} onSelectTool={setActiveToolKind} />

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
          <Viewport2D tool={activeTool} onDrawingLengthChange={setDrawingLength} />
        </section>

        <section
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <Viewport3D />
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
