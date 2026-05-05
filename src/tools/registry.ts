import { ToolNotFoundError } from "./errors.js";
import type { Tool, ToolSpec } from "./tool.js";
import type { ToolExecutionContext } from "../domain/types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool<unknown, unknown>>();

  constructor(tools: readonly Tool<unknown, unknown>[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: Tool<unknown, unknown>): void {
    this.tools.set(tool.spec.name, tool);
  }

  list(): ToolSpec[] {
    return [...this.tools.values()].map((tool) => tool.spec);
  }

  get(name: string): Tool<unknown, unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }
    return tool;
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    return this.get(name).execute(input, context);
  }
}
