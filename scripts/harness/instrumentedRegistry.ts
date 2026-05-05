import type { ToolExecutionContext } from "../../src/domain/types.js";
import type { ToolRegistry } from "../../src/tools/registry.js";

export interface ToolCallLogEntry {
  toolName: string;
  durationMs: number;
  succeeded: boolean;
  error?: string;
  input: unknown;
  output?: unknown;
  context: ToolExecutionContext;
}

export interface InstrumentedRegistry {
  registry: ToolRegistry;
  log: ToolCallLogEntry[];
}

export function instrumentRegistry(
  registry: ToolRegistry,
  onCall: (entry: ToolCallLogEntry) => void,
): InstrumentedRegistry {
  const log: ToolCallLogEntry[] = [];
  const original = registry.execute.bind(registry);

  registry.execute = async (name: string, input: unknown, context: ToolExecutionContext) => {
    const startedAt = Date.now();
    try {
      const output = await original(name, input, context);
      const entry: ToolCallLogEntry = {
        toolName: name,
        durationMs: Date.now() - startedAt,
        succeeded: true,
        input,
        output,
        context,
      };
      log.push(entry);
      onCall(entry);
      return output;
    } catch (err) {
      const entry: ToolCallLogEntry = {
        toolName: name,
        durationMs: Date.now() - startedAt,
        succeeded: false,
        error: err instanceof Error ? err.message : String(err),
        input,
        context,
      };
      log.push(entry);
      onCall(entry);
      throw err;
    }
  };

  return { registry, log };
}
