/**
 * ClashWorkspace
 *
 * Espace de travail immersif pour la coordination et la résolution des conflits BIM (ADR-071, ADR-072).
 * Intègre un panneau de contrôle gauche basé sur ClashPresentation et un viewport interactif droit (3D / 2D).
 */

import { useState, useMemo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Play,
  Trash2,
} from 'lucide-react';
import {
  type BimDocument,
  type ClashResult,
  detectClashes,
} from '@tabax/core';
import { exportClashesToCsv } from './clash/clashUtils.js';
import { ClashPresentation } from './clash/ClashPresentation.js';

export interface ClashWorkspaceProps {
  readonly doc: BimDocument;
  readonly clashes: readonly ClashResult[];
  readonly onClashesChanged: (clashes: readonly ClashResult[]) => void;
  readonly onSelectClash?: (clash: ClashResult) => void;
  readonly onFocusPoint3D: (point: { readonly x: number; readonly y: number; readonly z: number }) => void;
  readonly onLocate2D: (point: { readonly x: number; readonly y: number }, levelId?: string) => void;
  readonly onClose?: () => void;
  readonly viewport3D: ReactNode;
  readonly viewport2D: ReactNode;
}

export function ClashWorkspace({
  doc,
  clashes,
  onClashesChanged,
  onSelectClash,
  onFocusPoint3D,
  onLocate2D,
  onClose,
  viewport3D,
  viewport2D,
}: ClashWorkspaceProps) {
  const [selectedClashId, setSelectedClashId] = useState<string | null>(null);
  const [rightViewMode, setRightViewMode] = useState<'3d' | '2d'>('3d');
  const [hasAnalyzed, setHasAnalyzed] = useState(() => clashes.length > 0);

  // Décompte par sévérité
  const hardCount = useMemo(() => clashes.filter((c) => c.severity === 'hard').length, [clashes]);
  const clearanceCount = useMemo(
    () => clashes.filter((c) => c.severity === 'clearance').length,
    [clashes],
  );

  // Actions de coordination
  const handleRunDetection = () => {
    const results = detectClashes(doc.getState());
    onClashesChanged(results);
    setHasAnalyzed(true);
    setSelectedClashId(null);
    if (results.length > 0 && results[0]) {
      onFocusPoint3D(results[0].point);
    }
  };

  const handleClear = () => {
    onClashesChanged([]);
    setHasAnalyzed(false);
    setSelectedClashId(null);
  };

  const handleExportCsv = () => {
    exportClashesToCsv(clashes, doc.getState());
  };

  return (
    <div
      data-testid="clash-workspace"
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-canvas-chrome, #0b1120)',
        overflow: 'hidden',
      }}
    >
      {/* 1. Volet Gauche : Centre de Contrôle & Coordination (Largeur 520px) */}
      <div
        data-testid="clash-panel"
        style={{
          width: '520px',
          flex: '0 0 520px',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface, #111827)',
          overflow: 'hidden',
          zIndex: 3,
        }}
      >
        {/* En-tête Spacieux */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated, #1f2937)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--text-primary, #ffffff)',
                  letterSpacing: '-0.01em',
                }}
              >
                Coordination BIM & Conflits
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #9ca3af)', marginTop: '2px' }}>
                Détection géométrique BVH/SAT & Tolérances
              </div>
            </div>
          </div>

          {/* Badges de synthèse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              data-testid="workspace-hard-badge"
              style={{
                padding: '3px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: hardCount > 0 ? '#ef4444' : '#374151',
                color: '#ffffff',
              }}
            >
              {hardCount} Hard
            </span>
            <span
              data-testid="workspace-clearance-badge"
              style={{
                padding: '3px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: clearanceCount > 0 ? '#f59e0b' : '#374151',
                color: clearanceCount > 0 ? '#111827' : '#9ca3af',
              }}
            >
              {clearanceCount} Clearance
            </span>
          </div>
        </div>

        {/* Barre d'Actions Principales */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-canvas, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              data-testid="run-clash-btn"
              onClick={handleRunDetection}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <Play size={14} fill="#ffffff" />
              Lancer la détection
            </button>

            {clashes.length > 0 && (
              <button
                type="button"
                data-testid="clear-clash-btn"
                onClick={handleClear}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  backgroundColor: '#374151',
                  color: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  fontWeight: 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                Effacer
              </button>
            )}

            {clashes.length > 0 && (
              <button
                type="button"
                data-testid="workspace-export-csv-btn"
                onClick={handleExportCsv}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Download size={13} />
                Export CSV
              </button>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              data-testid="workspace-close-btn"
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary, #9ca3af)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontWeight: 500,
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={13} />
              Quitter
            </button>
          )}
        </div>

        {/* Corps délégué à ClashPresentation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 18px' }}>
          <ClashPresentation
            layout="workspace"
            doc={doc}
            clashes={clashes}
            selectedClashId={selectedClashId}
            onSelectClashId={setSelectedClashId}
            onSelectClash={onSelectClash}
            onFocusPoint={(pt) => {
              setRightViewMode('3d');
              onFocusPoint3D(pt);
            }}
            onLocate2D={(pt, lvlId) => {
              setRightViewMode('2d');
              onLocate2D(pt, lvlId);
            }}
            hasAnalyzed={hasAnalyzed || clashes.length > 0}
          />
        </div>
      </div>

      {/* 2. Volet Droit : Viewport Interactif Couplé (Flex 1) */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Barre de contrôle de la vue droite (ancrée à gauche pour éliminer toute superposition avec les contrôles de disposition) */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '16px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px',
            borderRadius: '6px',
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            data-testid="workspace-switch-3d-btn"
            aria-pressed={rightViewMode === '3d'}
            onClick={() => setRightViewMode('3d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: rightViewMode === '3d' ? '#2563eb' : 'transparent',
              color: rightViewMode === '3d' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Vue 3D
          </button>
          <button
            type="button"
            data-testid="workspace-switch-2d-btn"
            aria-pressed={rightViewMode === '2d'}
            onClick={() => setRightViewMode('2d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: rightViewMode === '2d' ? '#2563eb' : 'transparent',
              color: rightViewMode === '2d' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            Plan 2D
          </button>
        </div>

        {/* Viewport Effectif */}
        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
          {rightViewMode === '3d' ? viewport3D : viewport2D}
        </div>
      </div>
    </div>
  );
}
