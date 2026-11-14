import { useBimDocument } from '../hooks/useBimDocument.js';

/**
 * Barre d'état inférieure affichant les métriques du projet architectural.
 */
export function StatusBar() {
  const { state } = useBimDocument();

  const wallCount = Object.keys(state.walls).length;
  const levelCount = Object.keys(state.levels).length;
  const activeLevel = Object.values(state.levels)[0]?.name ?? 'Aucun niveau';

  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '28px',
        backgroundColor: '#111827',
        color: '#9ca3af',
        fontSize: '12px',
        borderTop: '1px solid #374151',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: '16px' }}>
        <span>
          Niveau actif : <strong style={{ color: '#e5e7eb' }}>{activeLevel}</strong>
        </span>
        <span>
          Niveaux : <strong style={{ color: '#e5e7eb' }}>{levelCount}</strong>
        </span>
        <span>
          Murs : <strong style={{ color: '#e5e7eb' }}>{wallCount}</strong>
        </span>
      </div>
      <div>
        <span>
          Unités : <strong>mm (Z-up)</strong>
        </span>
      </div>
    </footer>
  );
}
