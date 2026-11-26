import type {
  ExposedToolSchema,
  ToolDefinition,
  ToolExecutionContext,
  ToolMode,
  ToolResult,
} from '../types.js';

/**
 * Erreur typée levée par validateArgs() lors de paramètres LLM invalides.
 */
export class ToolArgumentValidationError extends Error {
  public readonly validIds?: readonly string[] | undefined;

  public constructor(message: string, validIds?: readonly string[]) {
    super(message);
    this.name = 'ToolArgumentValidationError';
    this.validIds = validIds;
  }
}

/**
 * Registre central typé des outils exposés au modèle de langage (ADR-073 D3).
 */
export class ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly tools = new Map<string, ToolDefinition<any, any>>();

  public register<TArgs, TResult>(tool: ToolDefinition<TArgs, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered in ToolRegistry.`);
    }
    this.tools.set(tool.name, tool);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(mode?: ToolMode): readonly ExposedToolSchema[] {
    const result: ExposedToolSchema[] = [];
    for (const tool of this.tools.values()) {
      if (mode && tool.mode !== mode) continue;
      result.push({
        name: tool.name,
        mode: tool.mode,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return result;
  }

  public execute(name: string, rawArgs: unknown, ctx: ToolExecutionContext): ToolResult {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        code: 'UNKNOWN_TOOL',
        message: `Outil inconnu "${name}".`,
        validIds: Array.from(this.tools.keys()),
      };
    }

    try {
      const validated = tool.validateArgs(rawArgs);
      return tool.execute(validated, ctx);
    } catch (err) {
      if (err instanceof ToolArgumentValidationError) {
        return {
          ok: false,
          code: 'INVALID_ARGUMENTS',
          message: err.message,
          ...(err.validIds ? { validIds: err.validIds } : {}),
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        code: 'TOOL_EXECUTION_ERROR',
        message,
      };
    }
  }
}
