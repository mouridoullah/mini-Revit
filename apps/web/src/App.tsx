import { BimDocumentProvider } from './context/BimDocumentContext.js';
import { Toolbar } from './components/Toolbar.js';
import { StatusBar } from './components/StatusBar.js';
import { Viewport2D } from './components/Viewport2D.js';
import { Viewport3D } from './components/Viewport3D.js';
import { type BimDocument } from '@mini-bim/core';

export interface AppProps {
  readonly initialDoc?: BimDocument;
}

/**
 * Composant racine de l'application Mini-BIM.
 * Agence le layout en deux viewports synchronisés côte à côte (2D Plan & 3D Orbital).
 */
export function App({ initialDoc }: AppProps) {
  return (
    <BimDocumentProvider initialDoc={initialDoc}>
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
        <Toolbar />

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
            <Viewport2D />
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

        <StatusBar />
      </div>
    </BimDocumentProvider>
  );
}
