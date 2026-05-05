import type { ToolDependencies } from "./ports.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createWorkspaceMemoryTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "get_workspace_preferences",
        category: "workspace_memory",
        description: "Fetch workspace-level behavior preferences such as tone, quiet hours, and reminder norms.",
        inputSchema: "{ workspaceId }",
        outputSchema: "JsonValue",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Database or memory reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["memory"]>["getWorkspacePreferences"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "memory").getWorkspacePreferences(input);
      },
    ),
    defineTool(
      {
        name: "get_person_context",
        category: "workspace_memory",
        description: "Fetch lightweight context for a person, such as team, timezone, and reminder preferences.",
        inputSchema: "{ workspaceId, userId }",
        outputSchema: "JsonValue",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Database or memory reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["memory"]>["getPersonContext"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "memory").getPersonContext(input);
      },
    ),
    defineTool(
      {
        name: "record_conversation_decision",
        category: "workspace_memory",
        description: "Persist why the agent decided to follow up, wait, cancel, or take no action.",
        inputSchema: "{ conversation, decisionType, reason, metadata?, idempotencyKey? }",
        outputSchema: "{ decisionId, deduplicated }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Persistence writes must run in Activities and be idempotent.",
        },
      },
      async (
        input: Omit<
          Parameters<
            NonNullable<ToolDependencies["memory"]>["recordConversationDecision"]
          >[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "memory").recordConversationDecision({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "get_related_conversation_memory",
        category: "workspace_memory",
        description: "Fetch prior related summaries or decisions for continuity.",
        inputSchema: "{ conversation, query, limit? }",
        outputSchema: "{ memories }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Database or memory reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["memory"]>["getRelatedConversationMemory"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "memory").getRelatedConversationMemory(input);
      },
    ),
    defineTool(
      {
        name: "record_conversation_summary",
        category: "workspace_memory",
        description: "Store a compact conversation summary for future workflow steps.",
        inputSchema: "{ conversation, summary, idempotencyKey? }",
        outputSchema: "{ summaryId, deduplicated }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Persistence writes must run in Activities and be idempotent.",
        },
      },
      async (
        input: Omit<
          Parameters<
            NonNullable<ToolDependencies["memory"]>["recordConversationSummary"]
          >[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "memory").recordConversationSummary({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
  ];
}
