/**
 * Barre d'outils supérieure de l'application Mini-BIM.
 * En Phase 2.2 : Composant de présentation statique (les Tools interactifs viendront en Phase 2.3).
 */
export function Toolbar() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '48px',
        backgroundColor: '#1f2937',
        color: '#ffffff',
        borderBottom: '1px solid #374151',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.5px' }}>MINI-BIM</span>
        <span
          style={{
            fontSize: '11px',
            backgroundColor: '#374151',
            padding: '2px 8px',
            borderRadius: '4px',
            color: '#9ca3af',
          }}
        >
          Phase 2.2 — Double Viewport
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          disabled
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            color: '#6b7280',
            border: 'none',
            cursor: 'not-allowed',
          }}
        >
          Sélectionner (Phase 2.3)
        </button>
        <button
          type="button"
          disabled
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            color: '#6b7280',
            border: 'none',
            cursor: 'not-allowed',
          }}
        >
          Tracer Mur (Phase 2.3)
        </button>
      </div>
    </header>
  );
}
