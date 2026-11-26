import { useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  FileBox,
  PanelRightClose,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import styles from './Cockpit.module.css';

export type DockTab = 'properties' | 'ifc' | 'ai';

export function RightDockPanel({
  properties,
  ifc,
  ai,
  selectedCount,
  modelCount,
  hasPendingAiPlan = false,
  activeTab,
  onTabChange,
}: {
  properties: ReactNode;
  ifc: ReactNode;
  ai?: ReactNode;
  selectedCount: number;
  modelCount: number;
  hasPendingAiPlan?: boolean;
  activeTab: DockTab;
  onTabChange: (tab: DockTab) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const tabs: { id: DockTab; label: string; icon: typeof SlidersHorizontal; badge?: number }[] = [
    { id: 'properties', label: 'Propriétés', icon: SlidersHorizontal },
    { id: 'ifc', label: 'IFC Réf', icon: FileBox, badge: modelCount },
    { id: 'ai', label: 'Assistant IA', icon: Sparkles },
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
                  <span>
                    {badge}
                  </span>
                ) : null}
                {id === 'properties' && selectedCount > 0 && <span>{selectedCount}</span>}
                {id === 'ai' && hasPendingAiPlan && <span>1</span>}
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
          {activeTab === 'properties' ? properties : activeTab === 'ifc' ? ifc : ai}
        </div>
      )}
    </aside>
  );
}
