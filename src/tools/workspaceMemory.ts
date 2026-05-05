import type { ToolDependencies } from "./ports.js";
import type { ConversationSummary, IsoDateTime, SlackUserId } from "../domain/types.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

function normalizeConversationSummary(raw: unknown): ConversationSummary {
  const nowIso = new Date().toISOString() as IsoDateTime;
  if (typeof raw === "string") {
    return {
      summary: raw,
      openQuestions: [],
      actionItems: [],
      participants: [],
      lastUpdatedAt: nowIso,
    };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Partial<ConversationSummary> & { summary?: unknown };
    const summary =
      typeof r.summary === "string" && r.summary.length > 0 ? r.summary : "";
    return {
      summary,
      openQuestions: Array.isArray(r.openQuestions)
        ? r.openQuestions.filter((s): s is string => typeof s === "string")
        : [],
      actionItems: Array.isArray(r.actionItems) ? r.actionItems : [],
      participants: Array.isArray(r.participants)
        ? r.participants.filter((s): s is SlackUserId => typeof s === "string")
        : [],
      lastUpdatedAt:
        typeof r.lastUpdatedAt === "string"
          ? (r.lastUpdatedAt as IsoDateTime)
          : nowIso,
    };
  }
  return {
    summary: "",
    openQuestions: [],
    actionItems: [],
    participants: [],
    lastUpdatedAt: nowIso,
  };
}

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
        inputSchema:
          "{ conversation, decisionType, reason, metadata?, idempotencyKey?, owners?, tags? }",
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
        inputSchema:
          "{ conversation, query, limit?, viewerSlackUserIds?, tags? }",
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
        description:
          "Store a compact conversation summary for future workflow steps. " +
          "`summary` may be a plain string OR a structured object " +
          "{ summary: string, openQuestions?: string[], actionItems?: ActionItem[], participants?: SlackUserId[], lastUpdatedAt?: ISO8601 }. " +
          "Prefer the string form unless you actually need to record open questions or action items.",
        inputSchema:
          "{ conversation, summary: string | { summary: string, openQuestions?, actionItems?, participants?, lastUpdatedAt? }, idempotencyKey?, owners?, tags?, contentOverride? }",
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
          "idempotencyKey" | "summary"
        > & { idempotencyKey?: string; summary: unknown },
        context,
      ) => {
        requireObject(input, "input");
        const summary = normalizeConversationSummary(input.summary);
        return requirePort(dependencies, "memory").recordConversationSummary({
          ...input,
          summary,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
  ];
}
