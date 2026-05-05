import type { ToolDependencies } from "./ports.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";
import { buildFollowUpSlackMessage } from "../slack/messages.js";

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
        name: "build_slack_follow_up_message",
        category: "follow_up_action",
        description: "Build a polished Slack Block Kit follow-up message payload.",
        inputSchema: "{ targetUserIds, reason, summary?, actionItems?, tone? }",
        outputSchema: "{ text, blocks }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Message formatting is Activity-backed so Workflow code stays thin and tool behavior can evolve safely.",
        },
      },
      async (
        input: Parameters<typeof buildFollowUpSlackMessage>[0],
      ) => {
        requireObject(input, "input");
        return buildFollowUpSlackMessage(input);
      },
    ),
    defineTool(
      {
        name: "send_slack_message",
        category: "follow_up_action",
        description: "Send an approved, idempotent Slack message to a channel, thread, or target users.",
        inputSchema: "{ workspaceId, channelId, text, blocks?, threadTs?, targetUserIds?, idempotencyKey? }",
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
  ];
}
