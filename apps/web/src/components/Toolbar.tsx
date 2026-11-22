import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  Box,
  BrickWall,
  Building2,
  ChevronDown,
  DoorOpen,
  Download,
  FileBox,
  FolderOpen,
  Layers,
  Move,
  PanelRight,
  Redo2,
  Save,
  Scissors,
  Search,
  Sparkles,
  Undo2,
  Upload,
  Waypoints,
  Ruler,
  Square,
  TriangleRight,
  Wind,
} from 'lucide-react';
import type { ToolKind } from '../tools/types.js';
import type { Level } from '@mini-bim/core';
import type { LucideProps } from 'lucide-react';
import type { DockTab } from './RightDockPanel.js';
import styles from './Toolbar.module.css';

type RibbonTab = 'Architecture' | 'Structure' | 'MEP' | 'Coordination';
const toolSets: Record<
  RibbonTab,
  {
    kind: ToolKind;
    label: string;
    shortcut: string;
    testId: string;
    icon: ComponentType<LucideProps>;
  }[]
> = {
  Architecture: [
    {
      kind: 'select',
      label: 'Sélectionner',
      shortcut: 'S',
      testId: 'tool-select-btn',
      icon: Search,
    },
    { kind: 'wall', label: 'Mur', shortcut: 'W', testId: 'tool-wall-btn', icon: BrickWall },
    { kind: 'door', label: 'Porte', shortcut: 'D', testId: 'tool-door-btn', icon: DoorOpen },
    { kind: 'window', label: 'Fenêtre', shortcut: 'F', testId: 'tool-window-btn', icon: Wind },
    {
      kind: 'component',
      label: 'Composant',
      shortcut: 'C',
      testId: 'tool-component-btn',
      icon: Box,
    },
    {
      kind: 'moveWall',
      label: 'Déplacer mur',
      shortcut: 'M',
      testId: 'tool-move-wall-btn',
      icon: Move,
    },
    {
      kind: 'moveOpening',
      label: 'Déplacer ouverture',
      shortcut: 'O',
      testId: 'tool-move-opening-btn',
      icon: Move,
    },
    {
      kind: 'section',
      label: 'Coupe',
      shortcut: 'X',
      testId: 'tool-section-btn',
      icon: Scissors,
    },
  ],
  Structure: [
    { kind: 'slab', label: 'Dalle', shortcut: 'L', testId: 'tool-slab-btn', icon: Square },
    {
      kind: 'stair',
      label: 'Escalier',
      shortcut: 'E',
      testId: 'tool-stair-btn',
      icon: TriangleRight,
    },
    { kind: 'roof', label: 'Toiture', shortcut: 'R', testId: 'tool-roof-btn', icon: Building2 },
  ],
  MEP: [
    { kind: 'mep', label: 'Réseau MEP', shortcut: 'P', testId: 'tool-mep-btn', icon: Waypoints },
  ],
  Coordination: [],
};
const tabForTool = (kind: ToolKind): RibbonTab =>
  kind === 'mep' ? 'MEP' : ['slab', 'stair', 'roof'].includes(kind) ? 'Structure' : 'Architecture';

export interface ToolbarProps {
  readonly activeToolKind: ToolKind;
  readonly onSelectTool: (kind: ToolKind) => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly onLoadFile: (file: File) => void;
  readonly onRequestLoadIfc?: () => void;
  readonly onToggleMetrics?: () => void;
  readonly onExportIfc?: () => void;
  readonly onExportSvg?: (scale: 50 | 100 | 200) => void;
  readonly onExportPlanDxf?: () => void;
  readonly levels?: readonly Level[];
  readonly activeLevelId?: string;
  readonly onSelectLevel?: (levelId: string) => void;
  readonly onAddLevel?: () => void;
  readonly underlayEnabled?: boolean;
  readonly onToggleUnderlay?: (enabled: boolean) => void;
  readonly hasUnderlayLevel?: boolean;
  readonly onLoadR4Demo?: () => void;
  readonly isClashPanelOpen?: boolean;
  readonly onToggleClashPanel?: () => void;
  readonly isFederatedPanelOpen?: boolean;
  readonly onToggleFederatedPanel?: () => void;
  readonly federatedModelCount?: number;
  readonly onOpenDockTab?: (tab: DockTab) => void;
  readonly mepControls?: ReactNode;
}
export function Toolbar({
  activeToolKind,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onLoadFile,
  onRequestLoadIfc,
  onToggleMetrics,
  onExportIfc,
  onExportSvg,
  onExportPlanDxf,
  levels = [],
  activeLevelId,
  onSelectLevel,
  onAddLevel,
  underlayEnabled = true,
  onToggleUnderlay,
  hasUnderlayLevel = false,
  onLoadR4Demo,
  isClashPanelOpen = false,
  onToggleClashPanel,
  isFederatedPanelOpen = false,
  onToggleFederatedPanel,
  federatedModelCount = 0,
  onOpenDockTab,
  mepControls,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState<50 | 100 | 200>(100);
  const [tab, setTab] = useState<RibbonTab>(() => tabForTool(activeToolKind));
  useEffect(() => setTab(tabForTool(activeToolKind)), [activeToolKind]);
  useEffect(() => {
    const keyMap: Record<string, ToolKind> = {
      s: 'select',
      w: 'wall',
      d: 'door',
      f: 'window',
      c: 'component',
      m: 'moveWall',
      o: 'moveOpening',
      l: 'slab',
      e: 'stair',
      r: 'roof',
      p: 'mep',
      x: 'section',
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
      )
        return;
      const kind = keyMap[event.key.toLowerCase()];
      if (kind) {
        setTab(tabForTool(kind));
        onSelectTool(kind);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectTool]);
  const fileChange = (event: ChangeEvent<HTMLInputElement>, callback?: (file: File) => void) => {
    const file = event.target.files?.[0];
    if (file) callback?.(file);
    event.target.value = '';
  };
  const toolButton = ({
    kind,
    label,
    shortcut,
    testId,
    icon: Icon,
  }: (typeof toolSets)[RibbonTab][number]) => (
    <button
      key={kind}
      type="button"
      data-testid={testId}
      aria-pressed={activeToolKind === kind}
      className={`${styles.tool} ${activeToolKind === kind ? styles.active : ''}`}
      title={`${label} (${shortcut})`}
      onClick={() => onSelectTool(kind)}
    >
      <Icon size={16} strokeWidth={1.75} />
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
  return (
    <header className={styles.header} data-testid="ribbon-header">
      <div className={styles.topRow}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Building2 size={17} />
          </span>
          <strong>MINI-BIM</strong>
          <span className={styles.version}>0.1</span>
        </div>
        <nav className={styles.tabs} aria-label="Onglets métiers">
          {(['Architecture', 'Structure', 'MEP', 'Coordination'] as RibbonTab[]).map((name) => (
            <button
              key={name}
              data-testid={`ribbon-tab-${name.toLowerCase()}`}
              className={`${styles.tab} ${tab === name ? styles.tabActive : ''}`}
              onClick={() => {
                setTab(name);
                if (name === 'Coordination') onOpenDockTab?.('clashes');
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className={styles.globalActions}>
          <button
            className={styles.iconAction}
            data-testid="undo-btn"
            title="Annuler (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={16} strokeWidth={1.75} />
          </button>
          <button
            className={styles.iconAction}
            data-testid="redo-btn"
            title="Rétablir (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={16} strokeWidth={1.75} />
          </button>
          <span className={styles.divider} />
          <button className={styles.action} data-testid="save-btn" onClick={onSave}>
            <Save size={15} />
            Sauvegarder JSON
          </button>
          <button
            className={styles.action}
            data-testid="load-btn"
            onClick={() => fileRef.current?.click()}
          >
            <FolderOpen size={15} />
            Charger JSON
          </button>
          <button className={styles.action} data-testid="export-ifc-btn" onClick={onExportIfc}>
            <FileBox size={15} />
            Exporter IFC4
          </button>
          <div className={styles.exportGroup}>
            <button
              className={styles.action}
              data-testid="export-svg-btn"
              onClick={() => onExportSvg?.(scale)}
            >
              <Upload size={15} />
              Plan SVG
            </button>
            <select
              aria-label="Échelle du plan SVG"
              data-testid="export-svg-scale-select"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value) as 50 | 100 | 200)}
            >
              <option value={50}>1:50</option>
              <option value={100}>1:100</option>
              <option value={200}>1:200</option>
            </select>
          </div>
          <button
            className={styles.action}
            data-testid="export-plan-dxf-btn"
            onClick={onExportPlanDxf}
            title="Exporter le plan d'étage en DXF R12 1:1"
          >
            <Download size={15} />
            Plan DXF
          </button>
        </div>
      </div>
      <div className={styles.toolRow}>
        <div className={styles.tools}>
          {tab === 'Coordination' ? (
            <>
              <button
                className={styles.tool}
                data-testid="toggle-clash-panel-btn"
                aria-pressed={isClashPanelOpen}
                onClick={() => {
                  onToggleClashPanel?.();
                  onOpenDockTab?.('clashes');
                }}
              >
                <Sparkles size={16} />
                Détecter conflits
              </button>
              <button
                className={styles.tool}
                data-testid="load-ifc-toolbar-btn"
                onClick={() => onRequestLoadIfc?.()}
              >
                <FileBox size={16} />
                Charger IFC réf (+ IFC)
              </button>
              <button
                className={styles.tool}
                data-testid="toggle-federated-panel-btn"
                aria-pressed={isFederatedPanelOpen}
                onClick={() => {
                  onToggleFederatedPanel?.();
                  onOpenDockTab?.('ifc');
                }}
              >
                <PanelRight size={16} />
                Afficher panneau IFC {federatedModelCount > 0 && `(${federatedModelCount})`}
              </button>
              <button
                className={styles.tool}
                data-testid="metrics-ribbon-btn"
                onClick={() => onToggleMetrics?.()}
              >
                <Ruler size={16} />
                Afficher métrés
              </button>
            </>
          ) : (
            Object.values(toolSets)
              .flat()
              .map((tool) => (
                <span
                  key={tool.kind}
                  hidden={tab !== tabForTool(tool.kind) && tool.kind !== 'select'}
                >
                  {toolButton(tool)}
                </span>
              ))
          )}
          {tab === 'Structure' && (
            <div className={styles.quickControls}>
              <button className={styles.tool} data-testid="add-level-btn" onClick={onAddLevel}>
                <Layers size={16} />+ Étage
              </button>
              <button
                data-testid="underlay-toggle-btn"
                className={styles.tool}
                disabled={!hasUnderlayLevel}
                aria-pressed={underlayEnabled && hasUnderlayLevel}
                onClick={() => onToggleUnderlay?.(!underlayEnabled)}
              >
                <ChevronDown size={16} />
                Underlay N-1 <span>{underlayEnabled && hasUnderlayLevel ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          )}
          {tab === 'Coordination' && onLoadR4Demo && (
            <button className={styles.tool} data-testid="load-demo-r4-btn" onClick={onLoadR4Demo}>
              <Building2 size={16} />
              Démo R+4
            </button>
          )}
        </div>
        {tab === 'MEP' && <div className={styles.contextMepControls}>{mepControls}</div>}
        <div className={styles.levelPicker}>
          <span>Niveau</span>
          <select
            data-testid="level-selector"
            aria-label="Niveau actif"
            value={activeLevelId ?? ''}
            onChange={(event) => onSelectLevel?.(event.target.value)}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name} — {level.elevation} mm
              </option>
            ))}
          </select>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.mbim.json"
        data-testid="file-input"
        hidden
        onChange={(event) => fileChange(event, onLoadFile)}
      />
    </header>
  );
}
