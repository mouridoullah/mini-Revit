import { useState, type ReactElement } from 'react';
import { BookOpen, Download, X } from 'lucide-react';
import type { PaperSize, ScaleOption, PdfBookOptions } from '@tabax/view-2d';
import styles from './ExportPdfModal.module.css';

export interface ExportPdfModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onExport: (options: PdfBookOptions) => void;
  readonly defaultProjectTitle?: string;
}

export function ExportPdfModal({
  isOpen,
  onClose,
  onExport,
  defaultProjectTitle = 'Immeuble R+4 Graphite Engineering',
}: ExportPdfModalProps): ReactElement | null {
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');
  const [scale, setScale] = useState<ScaleOption>('auto');
  const [projectTitle, setProjectTitle] = useState(defaultProjectTitle);
  const [author, setAuthor] = useState('Graphite Engineering Team');
  const [revision, setRevision] = useState('INDICE 0');

  const [includeCover, setIncludeCover] = useState(true);
  const [includePlans, setIncludePlans] = useState(true);
  const [includeSections, setIncludeSections] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(true);

  if (!isOpen) return null;

  const handleConfirm = (): void => {
    onExport({
      paperSize,
      scale,
      projectTitle,
      author,
      revision,
      includeCover,
      includePlans,
      includeSections,
      includeMetrics,
    });
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      data-testid="export-pdf-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <div className={styles.title} id="pdf-modal-title">
              <BookOpen size={16} />
              Carnet de Plans Vectoriel (PDF Multi-Pages)
            </div>
            <div className={styles.subtitle}>
              Norme ISO 32000-1 / DXF R12 — Zéro filigrane, cartouche normalisé
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fermer la modale"
            data-testid="pdf-close-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="pdf-paper-size">
                Format de Planche
              </label>
              <select
                id="pdf-paper-size"
                className={styles.select}
                data-testid="pdf-paper-size-select"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              >
                <option value="A4">A4 Paysage (297 × 210 mm)</option>
                <option value="A3">A3 Paysage (420 × 297 mm)</option>
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="pdf-scale">
                Échelle Architecturale
              </label>
              <select
                id="pdf-scale"
                className={styles.select}
                data-testid="pdf-scale-select"
                value={scale}
                onChange={(e) => {
                  const val = e.target.value;
                  setScale(val === 'auto' ? 'auto' : (Number(val) as ScaleOption));
                }}
              >
                <option value="auto">Auto (Ajusté à la planche)</option>
                <option value="50">1:50 (Détail)</option>
                <option value="100">1:100 (Exécution standard)</option>
                <option value="200">1:200 (Ensemble)</option>
              </select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Contenu du Carnet</span>
            <div className={styles.checkboxContainer}>
              <label className={styles.checkboxItem}>
                <input
                  type="checkbox"
                  data-testid="pdf-include-cover-checkbox"
                  checked={includeCover}
                  onChange={(e) => setIncludeCover(e.target.checked)}
                />
                Page de garde & Sommaire général des planches
              </label>
              <label className={styles.checkboxItem}>
                <input
                  type="checkbox"
                  data-testid="pdf-include-plans-checkbox"
                  checked={includePlans}
                  onChange={(e) => setIncludePlans(e.target.checked)}
                />
                Planches Plans d'étages (1 page par niveau)
              </label>
              <label className={styles.checkboxItem}>
                <input
                  type="checkbox"
                  data-testid="pdf-include-sections-checkbox"
                  checked={includeSections}
                  onChange={(e) => setIncludeSections(e.target.checked)}
                />
                Planches Coupes transversales & Élévations
              </label>
              <label className={styles.checkboxItem}>
                <input
                  type="checkbox"
                  data-testid="pdf-include-metrics-checkbox"
                  checked={includeMetrics}
                  onChange={(e) => setIncludeMetrics(e.target.checked)}
                />
                Planche Synthèse Métrés, Surfaces & Quantitatifs
              </label>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="pdf-project-title">
              Titre du Projet
            </label>
            <input
              id="pdf-project-title"
              type="text"
              className={styles.input}
              data-testid="pdf-project-title-input"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="pdf-author">
                Auteur / Bureau d'études
              </label>
              <input
                id="pdf-author"
                type="text"
                className={styles.input}
                data-testid="pdf-author-input"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="pdf-revision">
                Indice / Révision
              </label>
              <input
                id="pdf-revision"
                type="text"
                className={styles.input}
                data-testid="pdf-revision-input"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            data-testid="pdf-cancel-export-btn"
          >
            Annuler
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            data-testid="pdf-confirm-export-btn"
          >
            <Download size={14} />
            Télécharger le Carnet PDF
          </button>
        </div>
      </div>
    </div>
  );
}
