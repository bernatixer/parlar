import type { ToolDependencies } from "./ports.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createSlackContextTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "get_slack_thread",
        category: "slack_context",
        description: "Fetch full Slack thread messages for conversation context.",
        inputSchema: "{ workspaceId, channelId, threadTs, limit? }",
        outputSchema: "{ messages }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Slack API reads must run in Activities, not Workflows.",
        },
      },
      async (input: Parameters<NonNullable<ToolDependencies["slack"]>["getThread"]>[0]) => {
        requireObject(input, "input");
        return requirePort(dependencies, "slack").getThread(input);
      },
    ),
    defineTool(
      {
        name: "get_slack_channel_context",
        category: "slack_context",
        description: "Fetch Slack channel metadata and optional recent context.",
        inputSchema: "{ workspaceId, channelId, includeRecentMessages? }",
        outputSchema: "{ channelId, name?, topic?, purpose?, memberCount?, recentMessages? }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Slack API reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["slack"]>["getChannelContext"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "slack").getChannelContext(input);
      },
    ),
    defineTool(
      {
        name: "get_slack_user_profile",
        category: "slack_context",
        description: "Fetch a Slack user's profile, timezone, and bot/human status.",
        inputSchema: "{ workspaceId, userId }",
        outputSchema: "{ userId, displayName?, realName?, timezone?, title?, isBot }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Slack API reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["slack"]>["getUserProfile"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "slack").getUserProfile(input);
      },
    ),
    defineTool(
      {
        name: "search_slack_messages",
        category: "slack_context",
        description: "Search Slack history for related prior context.",
        inputSchema: "{ workspaceId, query, channelId?, limit? }",
        outputSchema: "{ messages }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Slack API reads must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["slack"]>["searchMessages"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "slack").searchMessages(input);
      },
    ),
    defineTool(
      {
        name: "get_conversation_participants",
        category: "slack_context",
        description: "Identify active participants and mentioned users from a Slack thread.",
        inputSchema: "{ workspaceId, channelId, threadTs, limit? }",
        outputSchema: "{ participantUserIds, mentionedUserIds }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Thread reads must run in Activities, not Workflows.",
        },
      },
      async (input: Parameters<NonNullable<ToolDependencies["slack"]>["getThread"]>[0]) => {
        requireObject(input, "input");
        const { messages } = await requirePort(dependencies, "slack").getThread(input);
        const participantUserIds = [...new Set(messages.map((message) => message.senderUserId))];
        const mentionedUserIds = [
          ...new Set(
            messages.flatMap((message) =>
              [...message.text.matchAll(/<@([A-Z0-9]+)>/g)].map((match) => match[1] ?? ""),
            ).filter(Boolean),
          ),
        ];
        return { participantUserIds, mentionedUserIds };
      },
    ),
  ];
}
