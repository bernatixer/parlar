import { createConversationUnderstandingTools } from "./conversationUnderstanding.js";
import { createFollowUpActionTools } from "./followUpAction.js";
import type { ToolDependencies } from "./ports.js";
import { ToolRegistry } from "./registry.js";
import { createSafetyReviewTools } from "./safetyReview.js";
import { createSlackContextTools } from "./slackContext.js";
import type { Tool } from "./tool.js";
import { createWorkspaceMemoryTools } from "./workspaceMemory.js";

export type { ToolDependencies } from "./ports.js";
export { ToolConfigurationError, ToolNotFoundError, ToolValidationError } from "./errors.js";
export { ToolRegistry } from "./registry.js";
export type { Tool, ToolSpec } from "./tool.js";

export function createParlarTools(dependencies: ToolDependencies): Tool<unknown, unknown>[] {
  return [
    ...createSlackContextTools(dependencies),
    ...createConversationUnderstandingTools(dependencies),
    ...createFollowUpActionTools(dependencies),
    ...createWorkspaceMemoryTools(dependencies),
    ...createSafetyReviewTools(dependencies),
  ] as Tool<unknown, unknown>[];
}

export function createParlarToolRegistry(dependencies: ToolDependencies): ToolRegistry {
  return new ToolRegistry(createParlarTools(dependencies));
}
