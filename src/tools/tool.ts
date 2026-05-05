import type { ToolExecutionContext } from "../domain/types.js";
import { ToolValidationError } from "./errors.js";

export type ToolCategory =
  | "slack_context"
  | "conversation_understanding"
  | "follow_up_action"
  | "workspace_memory"
  | "safety_review"
  | "temporal_control";

export interface ToolSpec<I = unknown, O = unknown> {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: string;
  outputSchema: string;
  sideEffects: boolean;
  idempotent: boolean;
  temporal: {
    workflowSafe: false;
    activityBacked: true;
    reason: string;
  };
  examples?: readonly I[];
  __input?: I;
  __output?: O;
}

export interface Tool<I = unknown, O = unknown> {
  spec: ToolSpec<I, O>;
  execute(input: I, context: ToolExecutionContext): Promise<O>;
}

export function defineTool<I, O>(
  spec: ToolSpec<I, O>,
  execute: (input: I, context: ToolExecutionContext) => Promise<O>,
): Tool<I, O> {
  return { spec, execute };
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

export function requireObject<T extends object>(value: T, field: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolValidationError(`${field} must be an object`);
  }
  return value;
}
