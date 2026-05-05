import type { ToolDependencies } from "./ports.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createFollowUpActionTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "draft_follow_up_message",
        category: "follow_up_action",
        description: "Draft a Slack follow-up message using conversation context and workspace tone.",
        inputSchema: "{ conversation, summary?, targetUserIds, reason, tone? }",
        outputSchema: "{ text, confidence, rationale }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "AI/model calls must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["intelligence"]>["draftFollowUpMessage"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").draftFollowUpMessage(input);
      },
    ),
    defineTool(
      {
        name: "send_slack_message",
        category: "follow_up_action",
        description: "Send an approved, idempotent Slack message to a channel, thread, or target users.",
        inputSchema: "{ workspaceId, channelId, text, threadTs?, targetUserIds?, idempotencyKey? }",
        outputSchema: "{ messageTs, permalink?, deduplicated }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Slack writes must run in Activities and be idempotent.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["slack"]>["sendMessage"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "slack").sendMessage({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "schedule_follow_up",
        category: "follow_up_action",
        description: "Create or update durable follow-up state in the conversation workflow.",
        inputSchema: "{ conversation, followUp, idempotencyKey? }",
        outputSchema: "{ followUpId, status }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Workflow signaling must run through a Client from an Activity or service boundary.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["temporal"]>["scheduleFollowUp"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").scheduleFollowUp({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "cancel_follow_up",
        category: "follow_up_action",
        description: "Cancel a pending follow-up with an explicit reason.",
        inputSchema: "{ conversation, followUpId, reason, idempotencyKey? }",
        outputSchema: "{ followUpId, status }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Workflow signaling must run through a Client from an Activity or service boundary.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["temporal"]>["cancelFollowUp"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").cancelFollowUp({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "snooze_follow_up",
        category: "follow_up_action",
        description: "Move a pending follow-up to a later time with an explicit reason.",
        inputSchema: "{ conversation, followUpId, runAt, reason, idempotencyKey? }",
        outputSchema: "{ followUpId, runAt, status }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Workflow signaling must run through a Client from an Activity or service boundary.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["temporal"]>["snoozeFollowUp"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").snoozeFollowUp({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
  ];
}
