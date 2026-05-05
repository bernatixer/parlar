import type { ToolExecutionContext } from "../domain/types.js";
import {
  createParlarToolRegistry,
  type ToolDependencies,
  type ToolSpec,
} from "../tools/index.js";

export interface ExecuteToolInput {
  toolName: string;
  input: unknown;
  context: ToolExecutionContext;
}

export interface ToolActivities {
  executeTool(input: ExecuteToolInput): Promise<unknown>;
  listTools(): Promise<ToolSpec[]>;
}

export function createToolActivities(dependencies: ToolDependencies): ToolActivities {
  const registry = createParlarToolRegistry(dependencies);

  return {
    async executeTool({ toolName, input, context }) {
      return registry.execute(toolName, input, context);
    },
    async listTools() {
      return registry.list();
    },
  };
}
