import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExportPdfModal } from './ExportPdfModal.js';

describe('Composant ExportPdfModal (Carnet de Plans PDF)', () => {
  it('ne rend rien lorsque isOpen vaut false', () => {
    const { queryByTestId } = render(
      <ExportPdfModal isOpen={false} onClose={vi.fn()} onExport={vi.fn()} />,
    );
    expect(queryByTestId('export-pdf-modal')).toBeNull();
  });

  it('affiche tous les contrôles et valeurs par défaut quand isOpen vaut true', () => {
    const { getByTestId, getByText } = render(
      <ExportPdfModal isOpen={true} onClose={vi.fn()} onExport={vi.fn()} />,
    );

    expect(getByTestId('export-pdf-modal')).toBeDefined();
    expect(getByText(/Carnet de Plans Vectoriel/)).toBeDefined();

    const paperSelect = getByTestId('pdf-paper-size-select') as HTMLSelectElement;
    expect(paperSelect.value).toBe('A4');

    const scaleSelect = getByTestId('pdf-scale-select') as HTMLSelectElement;
    expect(scaleSelect.value).toBe('auto');

    const coverCheck = getByTestId('pdf-include-cover-checkbox') as HTMLInputElement;
    expect(coverCheck.checked).toBe(true);

    const titleInput = getByTestId('pdf-project-title-input') as HTMLInputElement;
    expect(titleInput.value).toBe('Immeuble R+4 Graphite Engineering');
  });

  it('appelle onClose au clic sur Annuler et sur la croix', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <ExportPdfModal isOpen={true} onClose={onClose} onExport={vi.fn()} />,
    );

    fireEvent.click(getByTestId('pdf-cancel-export-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId('pdf-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('transmet les options personnalisées au clic sur Télécharger le Carnet PDF', () => {
    const onExport = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(
      <ExportPdfModal isOpen={true} onClose={onClose} onExport={onExport} />,
    );

    // Modifier le format de planche vers A3
    fireEvent.change(getByTestId('pdf-paper-size-select'), { target: { value: 'A3' } });

    // Modifier l'échelle vers 1:100
    fireEvent.change(getByTestId('pdf-scale-select'), { target: { value: '100' } });

    // Modifier le titre du projet
    fireEvent.change(getByTestId('pdf-project-title-input'), {
      target: { value: 'Tour Horizon R+8' },
    });

    // Désactiver la page de garde
    fireEvent.click(getByTestId('pdf-include-cover-checkbox'));

    // Valider l'exportation
    fireEvent.click(getByTestId('pdf-confirm-export-btn'));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith({
      paperSize: 'A3',
      scale: 100,
      projectTitle: 'Tour Horizon R+8',
      author: 'Graphite Engineering Team',
      revision: 'INDICE 0',
      includeCover: false,
      includePlans: true,
      includeSections: true,
      includeMetrics: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
