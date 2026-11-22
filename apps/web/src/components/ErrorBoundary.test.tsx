import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';

function CrashingComponent({ shouldCrash }: { shouldCrash: boolean }) {
  if (shouldCrash) {
    throw new Error('Simulation de crash WebGL');
  }
  return <div>Contenu sécurisé</div>;
}

describe('ErrorBoundary (apps/web)', () => {
  it('affiche les enfants quand aucune erreur n’est levée', () => {
    render(
      <ErrorBoundary name="TestNormal">
        <div>Composant OK</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Composant OK')).toBeDefined();
  });

  it('capture une exception enfant et affiche la carte de secours avec le bouton Réessayer', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary name="Visualiseur 3D">
        <CrashingComponent shouldCrash={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Erreur d’affichage \(Visualiseur 3D\)/)).toBeDefined();
    expect(screen.getByText(/Simulation de crash WebGL/)).toBeDefined();

    // Bouton de réinitialisation
    const retryBtn = screen.getByRole('button', { name: 'Réessayer' });
    expect(retryBtn).toBeDefined();

    // Rerender avec le composant réparé et clic sur Réessayer
    rerender(
      <ErrorBoundary name="Visualiseur 3D">
        <CrashingComponent shouldCrash={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(retryBtn);

    expect(screen.getByText('Contenu sécurisé')).toBeDefined();

    consoleErrorSpy.mockRestore();
  });
});
