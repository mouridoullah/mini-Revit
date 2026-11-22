import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  readonly name?: string;
  readonly children: ReactNode;
  readonly fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  readonly onReset?: () => void;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

/**
 * Barrière de sécurité contre les exceptions non gérées (React ErrorBoundary).
 * Isole les crashs de rendu (Three.js WebGL context loss, Canvas 2D, parsing corrupt)
 * au niveau d'un panneau ou viewport sans faire tomber l'ensemble du Cockpit.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name ?? 'Root'}] Caught rendering exception:`, error, errorInfo);
  }

  public reset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error ?? new Error('Erreur inconnue'), this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const componentName = this.props.name ?? 'Composant';

      return (
        <div
          role="alert"
          style={{
            padding: '16px',
            margin: '8px',
            borderRadius: '6px',
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            color: '#991b1b',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '13px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⚠️</span>
            <span>Erreur d’affichage ({componentName})</span>
          </div>
          <p style={{ margin: 0, color: '#b91c1c', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message ?? 'Une erreur inattendue est survenue lors du rendu.'}
          </p>
          <div>
            <button
              type="button"
              onClick={this.reset}
              style={{
                padding: '4px 12px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
