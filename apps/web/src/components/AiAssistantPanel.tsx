import { useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Crosshair,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type { ElementId } from '@tabax/core';
import type { ActionPlan, ConnectionDiagnostic } from '@tabax/ai';
import type {
  AiChatMessage,
  AiCopilotConfig,
  AiProviderKind,
} from '../hooks/useAiCopilot.js';
import styles from './AiAssistantPanel.module.css';

export interface AiAssistantPanelProps {
  readonly activeLevelName: string;
  readonly selectedCount: number;
  readonly config: AiCopilotConfig;
  readonly onUpdateConfig: (patch: Partial<AiCopilotConfig>) => void;
  readonly messages: readonly AiChatMessage[];
  readonly isRunning: boolean;
  readonly isTestingConnection: boolean;
  readonly connectionDiagnostic: ConnectionDiagnostic | null;
  readonly pendingPlan: ActionPlan | null;
  readonly isStale: boolean;
  readonly revalidationError: string | null;
  readonly onTestConnection: () => void;
  readonly onSendPrompt: (prompt: string) => void;
  readonly onStop: () => void;
  readonly onApplyPlan: () => void;
  readonly onRevalidatePlan: () => void;
  readonly onDiscardPlan: () => void;
  readonly onClearConversation: () => void;
  readonly onTargetElements: (ids: readonly ElementId[]) => void;
}

const SAMPLE_PROMPTS = [
  'Résume le projet et liste les anomalies éventuelles.',
  'Analyse les conflits géométriques 3D du modèle.',
  'Crée un mur de 4 m sur le niveau actif et cote l’étage.',
] as const;

function stopShortcutPropagation(event: KeyboardEvent<HTMLElement>): void {
  event.stopPropagation();
}

export function AiAssistantPanel({
  activeLevelName,
  selectedCount,
  config,
  onUpdateConfig,
  messages,
  isRunning,
  isTestingConnection,
  connectionDiagnostic,
  pendingPlan,
  isStale,
  revalidationError,
  onTestConnection,
  onSendPrompt,
  onStop,
  onApplyPlan,
  onRevalidatePlan,
  onDiscardPlan,
  onClearConversation,
  onTargetElements,
}: AiAssistantPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [promptInput, setPromptInput] = useState('');

  const handleSubmit = () => {
    const trimmed = promptInput.trim();
    if (!trimmed || isRunning) return;
    setPromptInput('');
    onSendPrompt(trimmed);
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={styles.panel} data-testid="ai-assistant-panel">
      <div className={styles.header}>
        <div className={styles.contextBadges}>
          <span className={styles.badge} title={`Niveau actif : ${activeLevelName}`}>
            <Sparkles size={12} />
            {activeLevelName || 'Aucun niveau'}
          </span>
          {selectedCount > 0 && (
            <span className={styles.badge} data-testid="ai-selection-badge">
              {selectedCount} sél.
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.iconBtn} ${showSettings ? styles.iconBtnActive : ''}`}
            aria-label="Réglages IA"
            data-testid="ai-settings-toggle"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((prev) => !prev)}
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Effacer la conversation"
            data-testid="ai-clear-chat-btn"
            onClick={onClearConversation}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div
          className={styles.settings}
          data-testid="ai-settings-drawer"
          onKeyDown={stopShortcutPropagation}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Fournisseur LLM</span>
            <select
              className={styles.select}
              data-testid="ai-provider-select"
              value={config.providerKind}
              onChange={(e) =>
                onUpdateConfig({ providerKind: e.target.value as AiProviderKind })
              }
            >
              <option value="ollama">Ollama Local (RTX / hors-ligne)</option>
              <option value="openai">OpenAI / Passerelle compatible (BYOK)</option>
              <option value="gemini">Google Gemini REST (BYOK)</option>
            </select>
          </label>

          {config.providerKind !== 'gemini' && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>URL Endpoint</span>
              <input
                type="text"
                className={styles.input}
                data-testid="ai-endpoint-input"
                value={config.endpoint}
                onChange={(e) => onUpdateConfig({ endpoint: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Modèle</span>
            <input
              type="text"
              className={styles.input}
              data-testid="ai-model-input"
              value={config.model}
              onChange={(e) => onUpdateConfig({ model: e.target.value })}
              placeholder="qwen2.5-coder:14b"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Clé API {config.providerKind === 'ollama' ? '(optionnelle)' : '(requise)'}
            </span>
            <input
              type="password"
              className={styles.input}
              data-testid="ai-apikey-input"
              value={config.apiKey}
              onChange={(e) => onUpdateConfig({ apiKey: e.target.value })}
              placeholder="Saisie confidentielle (sessionStorage par défaut)"
              autoComplete="off"
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              data-testid="ai-remember-key-checkbox"
              checked={config.rememberKeyOnDevice}
              onChange={(e) =>
                onUpdateConfig({ rememberKeyOnDevice: e.target.checked })
              }
            />
            <span>Mémoriser sur cet appareil (localStorage)</span>
          </label>

          <button
            type="button"
            className={styles.secondaryBtn}
            data-testid="ai-test-connection-btn"
            disabled={isTestingConnection}
            onClick={onTestConnection}
          >
            <Wifi size={13} />
            {isTestingConnection ? 'Test en cours...' : 'Tester la connexion'}
          </button>

          {connectionDiagnostic && (
            <div
              className={`${styles.diagnostic} ${
                connectionDiagnostic.status === 'ok' ? styles.diagOk : styles.diagError
              }`}
              data-testid="ai-connection-diagnostic"
            >
              <div>{connectionDiagnostic.message}</div>
              {connectionDiagnostic.hint && (
                <div className={styles.diagHint}>{connectionDiagnostic.hint}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.thread} data-testid="ai-chat-thread">
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div>
              Décrivez une analyse ou une modification BIM en millimètres. Les mutations passent
              d’abord par le bac à sable puis attendent votre validation.
            </div>
            <div className={styles.suggestionList}>
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className={styles.suggestionBtn}
                  onClick={() => setPromptInput(sample)}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              data-testid={`ai-msg-${msg.role}`}
              className={`${styles.msgBubble} ${
                msg.role === 'user'
                  ? styles.msgUser
                  : msg.role === 'error'
                    ? styles.msgError
                    : styles.msgAssistant
              }`}
            >
              {msg.content}
            </div>
          ))
        )}
      </div>

      {pendingPlan && (
        <div
          className={`${styles.planCard} ${isStale ? styles.planCardStale : ''}`}
          data-testid="ai-action-plan-card"
        >
          <div className={styles.planHeader}>
            <span className={styles.planTitle}>
              Plan d’actions ({pendingPlan.summary.totalSteps})
            </span>
            {isStale ? (
              <span className={styles.planStatusStale} data-testid="ai-plan-stale-badge">
                <AlertTriangle size={11} />
                Obsolète
              </span>
            ) : (
              <span className={styles.planStatusOk} data-testid="ai-plan-ready-badge">
                Validé
              </span>
            )}
          </div>

          <ul className={styles.stepList}>
            {pendingPlan.steps.map((step, index) => (
              <li key={`${step.toolName}_${index}`} className={styles.stepItem}>
                <span
                  className={`${styles.opTag} ${
                    step.operation === 'create'
                      ? styles.opCreate
                      : step.operation === 'delete'
                        ? styles.opDelete
                        : styles.opUpdate
                  }`}
                >
                  {step.operation === 'create' ? '+' : step.operation === 'delete' ? '-' : '~'}
                </span>
                <span>{step.summary}</span>
              </li>
            ))}
          </ul>

          {revalidationError && (
            <div className={styles.revalidationError} data-testid="ai-revalidation-error">
              {revalidationError}
            </div>
          )}

          <div className={styles.planActions}>
            {pendingPlan.targetElementIds.length > 0 && (
              <button
                type="button"
                className={styles.secondaryBtn}
                data-testid="ai-target-elements-btn"
                onClick={() => onTargetElements(pendingPlan.targetElementIds)}
              >
                <Crosshair size={12} />
                Cibler les éléments ({pendingPlan.targetElementIds.length})
              </button>
            )}

            {isStale ? (
              <button
                type="button"
                className={styles.warningBtn}
                data-testid="ai-revalidate-plan-btn"
                onClick={onRevalidatePlan}
              >
                <RefreshCw size={12} />
                Revalider
              </button>
            ) : (
              <button
                type="button"
                className={styles.primaryBtn}
                data-testid="ai-apply-plan-btn"
                onClick={onApplyPlan}
              >
                <Check size={12} />
                Appliquer
              </button>
            )}

            <button
              type="button"
              className={styles.secondaryBtn}
              data-testid="ai-discard-plan-btn"
              onClick={onDiscardPlan}
            >
              <X size={12} />
              Ignorer
            </button>
          </div>
        </div>
      )}

      <div className={styles.composer} onKeyDown={stopShortcutPropagation}>
        <textarea
          className={styles.textarea}
          data-testid="ai-prompt-input"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Demandez une analyse ou une commande BIM..."
          disabled={isRunning}
        />
        <div className={styles.composerFooter}>
          <span className={styles.composerHint}>Entrée pour envoyer, Maj+Entrée pour ligne</span>
          {isRunning ? (
            <button
              type="button"
              className={styles.stopBtn}
              data-testid="ai-stop-btn"
              onClick={onStop}
            >
              <Square size={11} />
              Arrêter
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryBtn}
              data-testid="ai-send-btn"
              disabled={promptInput.trim().length === 0}
              onClick={handleSubmit}
            >
              <Send size={12} />
              Envoyer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
