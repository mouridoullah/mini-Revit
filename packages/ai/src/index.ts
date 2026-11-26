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

export type {
  PlanOperationKind,
  PlannedStep,
  ActionPlanSummary,
  ActionPlan,
  ApplyPlanResult,
  RevalidatePlanResult,
} from './planner/types.js';

export {
  PHASE2_MUTATE_TOOLS,
  ALL_COPILOT_TOOLS,
  registerPhase2MutateTools,
  createFullCopilotRegistry,
  collectPreexistingIdsInState,
  addWallTool,
  moveWallTool,
  updateWallTool,
  deleteWallTool,
  addDoorTool,
  addWindowTool,
  moveOpeningTool,
  deleteOpeningTool,
  addComponentTool,
  addRoomTool,
  autoDimensionLevelTool,
  autoGenerateViewsTool,
  type AddWallArgs,
  type MoveWallArgs,
  type UpdateWallArgs,
  type DeleteWallArgs,
  type AddDoorArgs,
  type AddWindowArgs,
  type MoveOpeningArgs,
  type DeleteOpeningArgs,
  type AddComponentArgs,
  type AddRoomArgs,
  type AutoDimensionLevelArgs,
} from './tools/mutateTools.js';

export {
  MAX_TOOL_STEPS,
  MAX_TOTAL_TOOL_CALLS,
  MAX_SELF_CORRECTION_RETRIES,
  buildActionPlan,
  runCopilotTurn,
  applyPlan,
  revalidatePlan,
  type RunCopilotTurnOptions,
  type CopilotTurnStatus,
  type CopilotTurnResult,
} from './planner/DryRunExecutor.js';
