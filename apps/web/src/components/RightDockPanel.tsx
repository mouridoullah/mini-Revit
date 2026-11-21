import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  FileBox,
  PanelRightClose,
  SlidersHorizontal,
} from 'lucide-react';
import styles from './Cockpit.module.css';
export type DockTab = 'properties' | 'clashes' | 'ifc';
export function RightDockPanel({
  properties,
  clashes,
  ifc,
  selectedCount,
  clashCount,
  modelCount,
  activeTab,
  onTabChange,
}: {
  properties: ReactNode;
  clashes: ReactNode;
  ifc: ReactNode;
  selectedCount: number;
  clashCount: number;
  modelCount: number;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const tabs: { id: DockTab; label: string; icon: typeof SlidersHorizontal; badge?: number }[] = [
    { id: 'properties', label: 'Propriétés', icon: SlidersHorizontal },
    { id: 'clashes', label: 'Conflits', icon: AlertTriangle, badge: clashCount },
    { id: 'ifc', label: 'IFC Réf', icon: FileBox, badge: modelCount },
  ];
  return (
    <aside
      className={`${styles.rightDock} ${collapsed ? styles.rightCollapsed : ''}`}
      data-testid="right-dock-panel"
    >
      <div className={styles.dockTabs}>
        {collapsed ? (
          <button
            className={styles.dockTab}
            aria-label="Ouvrir le panneau droit"
            onClick={() => setCollapsed(false)}
          >
            <ChevronLeft size={16} />
          </button>
        ) : (
          <>
            {tabs.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                data-testid={`dock-tab-${id}`}
                aria-pressed={activeTab === id}
                className={`${styles.dockTab} ${activeTab === id ? styles.dockActive : ''}`}
                onClick={() => onTabChange(id)}
              >
                <Icon size={16} strokeWidth={1.75} />
                {label}
                {badge ? (
                  <span
                    style={{
                      color: id === 'clashes' ? 'var(--status-warning)' : 'var(--accent-primary)',
                    }}
                  >
                    {badge}
                  </span>
                ) : null}
                {id === 'properties' && selectedCount > 0 && <span>{selectedCount}</span>}
              </button>
            ))}
            <button
              className={styles.dockTab}
              style={{ flex: '0 0 28px' }}
              aria-label="Réduire le panneau droit"
              onClick={() => setCollapsed(true)}
            >
              <PanelRightClose size={15} />
            </button>
          </>
        )}
      </div>
      {!collapsed && (
        <div className={styles.dockContent}>
          {activeTab === 'properties' ? properties : activeTab === 'clashes' ? clashes : ifc}
        </div>
      )}
    </aside>
  );
}
