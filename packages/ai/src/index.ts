/**
 * @tabax/ai
 * Couche agentique pure TypeScript pour Tabax (ADR-073) :
 * - Extraction de contexte BIM compacte (buildBimContext)
 * - Registre d'outils typés et outils Phase 1 en lecture seule
 * - Adaptateurs fetch natifs sans backend (OpenAiCompatibleProvider, GeminiProvider)
 *
 * Zéro dépendance React, Three.js, DOM ou @tabax/geometry.
 */

export type {
  FlatJsonSchemaType,
  FlatJsonSchemaProperty,
  FlatJsonSchema,
  ToolMode,
  ToolSuccessResult,
  ToolErrorResult,
  ToolResult,
  ToolExecutionContext,
  ToolDefinition,
  ExposedToolSchema,
} from './types.js';

export {
  buildBimContext,
  formatBimContextPrompt,
  type ContextBuildOptions,
  type SelectedElementSummary,
  type CompactLevelEntry,
  type CompactWallTypeEntry,
  type CompactDoorTypeEntry,
  type CompactWindowTypeEntry,
  type CompactComponentTypeEntry,
  type BimProjectCounts,
  type BimSemanticContext,
} from './context/BimContextBuilder.js';

export { ToolRegistry, ToolArgumentValidationError } from './tools/ToolRegistry.js';
export {
  PHASE1_READ_TOOLS,
  createPhase1ReadRegistry,
  getProjectSummaryTool,
  getLevelDetailsTool,
  getElementByIdTool,
  auditModelTool,
  getClashesSummaryTool,
  type LevelDetailCategory,
  type OccupiedIntervalSummary,
  type GetLevelDetailsArgs,
  type GetElementByIdArgs,
  type AuditModelArgs,
  type GetClashesSummaryArgs,
} from './tools/readTools.js';

export {
  ProviderError,
  type AiAbortSignal,
  type AiFetchRequestInit,
  type AiFetchResponse,
  type AiFetchFn,
  type LlmToolCall,
  type LlmMessage,
  type LlmChatRequest,
  type LlmChatResponse,
  type ConnectionStatus,
  type ConnectionDiagnostic,
  type TestConnectionOptions,
  type LlmProvider,
  type ProviderErrorCode,
} from './providers/types.js';

export {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleProviderOptions,
} from './providers/OpenAiCompatibleProvider.js';

export {
  GeminiProvider,
  DEFAULT_GEMINI_BASE_URL,
  type GeminiProviderOptions,
} from './providers/GeminiProvider.js';
