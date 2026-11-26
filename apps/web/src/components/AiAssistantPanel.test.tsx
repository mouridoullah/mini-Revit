import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddWallCommand, BimDocument } from '@tabax/core';
import { buildActionPlan, type PlannedStep } from '@tabax/ai';
import { AiAssistantPanel } from './AiAssistantPanel.js';
import type { AiCopilotConfig } from '../hooks/useAiCopilot.js';

const BASE_CONFIG: AiCopilotConfig = {
  providerKind: 'ollama',
  endpoint: 'http://localhost:11434/v1',
  model: 'qwen2.5-coder:14b',
  apiKey: '',
  rememberKeyOnDevice: false,
};

function makeSamplePlan() {
  const doc = BimDocument.createDefaultProject();
  const state = doc.getState();
  const levelId = Object.keys(state.levels)[0]!;
  const wallTypeId = Object.keys(state.wallTypes)[0]!;
  doc.execute(
    new AddWallCommand({
      id: 'w_pre',
      category: 'wall',
      typeId: wallTypeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
    }),
  );

  const step: PlannedStep = {
    toolName: 'move_wall',
    operation: 'update',
    summary: 'Déplacer mur w_pre de (0, 200) mm',
    normalizedArgs: { wallId: 'w_pre', deltaXMm: 0, deltaYMm: 200 },
    createdIds: [],
    targetIds: ['w_pre'],
    createCommand: () =>
      new AddWallCommand({
        id: 'w_unused',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
      }),
  };

  return buildActionPlan(doc.getState(), [step], 'IA : Déplacer mur');
}

describe('Composant <AiAssistantPanel /> (ADR-073 Lot 3)', () => {
  it('ouvre les réglages, change de fournisseur, affiche le diagnostic et soumet un prompt', () => {
    const onUpdateConfig = vi.fn();
    const onTestConnection = vi.fn();
    const onSendPrompt = vi.fn();

    render(
      <AiAssistantPanel
        activeLevelName="RDC"
        selectedCount={1}
        config={BASE_CONFIG}
        onUpdateConfig={onUpdateConfig}
        messages={[]}
        isRunning={false}
        isTestingConnection={false}
        connectionDiagnostic={{
          status: 'cors_or_mixed_content',
          message: 'Blocage CORS détecté',
          hint: 'OLLAMA_ORIGINS="*"',
          latencyMs: 12,
        }}
        pendingPlan={null}
        isStale={false}
        revalidationError={null}
        onTestConnection={onTestConnection}
        onSendPrompt={onSendPrompt}
        onStop={vi.fn()}
        onApplyPlan={vi.fn()}
        onRevalidatePlan={vi.fn()}
        onDiscardPlan={vi.fn()}
        onClearConversation={vi.fn()}
        onTargetElements={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-selection-badge').textContent).toContain('1 sél.');

    fireEvent.click(screen.getByTestId('ai-settings-toggle'));
    fireEvent.change(screen.getByTestId('ai-provider-select'), { target: { value: 'gemini' } });
    expect(onUpdateConfig).toHaveBeenCalledWith({ providerKind: 'gemini' });

    fireEvent.click(screen.getByTestId('ai-remember-key-checkbox'));
    expect(onUpdateConfig).toHaveBeenCalledWith({ rememberKeyOnDevice: true });

    fireEvent.click(screen.getByTestId('ai-test-connection-btn'));
    expect(onTestConnection).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ai-connection-diagnostic').textContent).toContain('OLLAMA_ORIGINS');

    const promptInput = screen.getByTestId('ai-prompt-input');
    fireEvent.change(promptInput, { target: { value: 'Liste les conflits' } });
    fireEvent.click(screen.getByTestId('ai-send-btn'));
    expect(onSendPrompt).toHaveBeenCalledWith('Liste les conflits');
  });

  it('affiche la carte d’actions (prête puis obsolète -> Revalider) et câble Cibler les éléments', () => {
    const plan = makeSamplePlan();
    const onApplyPlan = vi.fn();
    const onRevalidatePlan = vi.fn();
    const onTargetElements = vi.fn();

    const { rerender } = render(
      <AiAssistantPanel
        activeLevelName="RDC"
        selectedCount={0}
        config={BASE_CONFIG}
        onUpdateConfig={vi.fn()}
        messages={[{ id: '1', role: 'assistant', content: 'Plan prêt.' }]}
        isRunning={false}
        isTestingConnection={false}
        connectionDiagnostic={null}
        pendingPlan={plan}
        isStale={false}
        revalidationError={null}
        onTestConnection={vi.fn()}
        onSendPrompt={vi.fn()}
        onStop={vi.fn()}
        onApplyPlan={onApplyPlan}
        onRevalidatePlan={onRevalidatePlan}
        onDiscardPlan={vi.fn()}
        onClearConversation={vi.fn()}
        onTargetElements={onTargetElements}
      />,
    );

    expect(screen.getByTestId('ai-plan-ready-badge')).toBeDefined();
    fireEvent.click(screen.getByTestId('ai-target-elements-btn'));
    expect(onTargetElements).toHaveBeenCalledWith(['w_pre']);

    fireEvent.click(screen.getByTestId('ai-apply-plan-btn'));
    expect(onApplyPlan).toHaveBeenCalledTimes(1);

    rerender(
      <AiAssistantPanel
        activeLevelName="RDC"
        selectedCount={0}
        config={BASE_CONFIG}
        onUpdateConfig={vi.fn()}
        messages={[{ id: '1', role: 'assistant', content: 'Plan prêt.' }]}
        isRunning={false}
        isTestingConnection={false}
        connectionDiagnostic={null}
        pendingPlan={plan}
        isStale={true}
        revalidationError="Mur supprimé"
        onTestConnection={vi.fn()}
        onSendPrompt={vi.fn()}
        onStop={vi.fn()}
        onApplyPlan={onApplyPlan}
        onRevalidatePlan={onRevalidatePlan}
        onDiscardPlan={vi.fn()}
        onClearConversation={vi.fn()}
        onTargetElements={onTargetElements}
      />,
    );

    expect(screen.getByTestId('ai-plan-stale-badge')).toBeDefined();
    expect(screen.queryByTestId('ai-apply-plan-btn')).toBeNull();
    expect(screen.getByTestId('ai-revalidation-error').textContent).toContain('Mur supprimé');

    fireEvent.click(screen.getByTestId('ai-revalidate-plan-btn'));
    expect(onRevalidatePlan).toHaveBeenCalledTimes(1);
  });

  it('isole la saisie clavier du prompt et des réglages des raccourcis globaux window et expose le bouton Arrêter', () => {
    const windowKeySpy = vi.fn();
    window.addEventListener('keydown', windowKeySpy);
    const onStop = vi.fn();

    try {
      const { rerender } = render(
        <AiAssistantPanel
          activeLevelName="RDC"
          selectedCount={0}
          config={BASE_CONFIG}
          onUpdateConfig={vi.fn()}
          messages={[]}
          isRunning={false}
          isTestingConnection={false}
          connectionDiagnostic={null}
          pendingPlan={null}
          isStale={false}
          revalidationError={null}
          onTestConnection={vi.fn()}
          onSendPrompt={vi.fn()}
          onStop={onStop}
          onApplyPlan={vi.fn()}
          onRevalidatePlan={vi.fn()}
          onDiscardPlan={vi.fn()}
          onClearConversation={vi.fn()}
          onTargetElements={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('ai-settings-toggle'));
      const apiKeyInput = screen.getByTestId('ai-apikey-input');
      const promptInput = screen.getByTestId('ai-prompt-input');

      for (const key of ['w', 't', 'd', 'x', ' ', 'Delete', 'Escape']) {
        fireEvent.keyDown(promptInput, { key });
        fireEvent.keyDown(apiKeyInput, { key });
      }
      expect(windowKeySpy).not.toHaveBeenCalled();

      rerender(
        <AiAssistantPanel
          activeLevelName="RDC"
          selectedCount={0}
          config={BASE_CONFIG}
          onUpdateConfig={vi.fn()}
          messages={[]}
          isRunning={true}
          isTestingConnection={false}
          connectionDiagnostic={null}
          pendingPlan={null}
          isStale={false}
          revalidationError={null}
          onTestConnection={vi.fn()}
          onSendPrompt={vi.fn()}
          onStop={onStop}
          onApplyPlan={vi.fn()}
          onRevalidatePlan={vi.fn()}
          onDiscardPlan={vi.fn()}
          onClearConversation={vi.fn()}
          onTargetElements={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId('ai-stop-btn'));
      expect(onStop).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', windowKeySpy);
    }
  });

  it('permet de sélectionner un modèle détecté en un clic depuis le diagnostic connexion (v1.2.1)', () => {
    const onUpdateConfig = vi.fn();
    render(
      <AiAssistantPanel
        activeLevelName="RDC"
        selectedCount={0}
        config={BASE_CONFIG}
        onUpdateConfig={onUpdateConfig}
        messages={[]}
        isRunning={false}
        isTestingConnection={false}
        connectionDiagnostic={{
          status: 'model_not_found',
          message: 'Modèle absent.',
          hint: 'Modèles disponibles : qwen2.5-coder:7b',
          latencyMs: 12,
          availableModels: ['qwen2.5-coder:7b', 'llama3.1:latest'],
        }}
        pendingPlan={null}
        isStale={false}
        revalidationError={null}
        onTestConnection={vi.fn()}
        onSendPrompt={vi.fn()}
        onStop={vi.fn()}
        onApplyPlan={vi.fn()}
        onRevalidatePlan={vi.fn()}
        onDiscardPlan={vi.fn()}
        onClearConversation={vi.fn()}
        onTargetElements={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('ai-settings-toggle'));
    const modelButtons = screen.getAllByTestId('ai-available-model-btn');
    expect(modelButtons).toHaveLength(2);
    const firstModelBtn = modelButtons.at(0);
    if (!firstModelBtn) throw new Error('Bouton modèle attendu');
    fireEvent.click(firstModelBtn);
    expect(onUpdateConfig).toHaveBeenCalledWith({ model: 'qwen2.5-coder:7b' });
  });
});
