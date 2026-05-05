import type { ToolDependencies } from "./ports.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createConversationUnderstandingTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "classify_conversation_state",
        category: "conversation_understanding",
        description: "Classify whether a conversation is open, waiting, resolved, blocked, stale, informational, or needs attention.",
        inputSchema: "{ conversation, messages, workspacePreferences? }",
        outputSchema: "{ status, confidence, reason }",
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
          NonNullable<ToolDependencies["intelligence"]>["classifyConversationState"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").classifyConversationState(input);
      },
    ),
    defineTool(
      {
        name: "extract_action_items",
        category: "conversation_understanding",
        description: "Extract asks, owners, deadlines, blockers, and unresolved questions.",
        inputSchema: "{ conversation, messages }",
        outputSchema: "{ actionItems }",
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
          NonNullable<ToolDependencies["intelligence"]>["extractActionItems"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").extractActionItems(input);
      },
    ),
    defineTool(
      {
        name: "summarize_conversation",
        category: "conversation_understanding",
        description: "Create a compact summary for workflow state, prompts, and human review.",
        inputSchema: "{ conversation, messages, maxWords? }",
        outputSchema: "{ summary, openQuestions, actionItems, participants, lastUpdatedAt }",
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
          NonNullable<ToolDependencies["intelligence"]>["summarizeConversation"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").summarizeConversation(input);
      },
    ),
    defineTool(
      {
        name: "detect_follow_up_need",
        category: "conversation_understanding",
        description: "Decide whether follow-up is needed, why, who should be contacted, and when.",
        inputSchema: "{ conversation, summary?, status?, actionItems? }",
        outputSchema: "{ needed, confidence, reason, plan? }",
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
          NonNullable<ToolDependencies["intelligence"]>["detectFollowUpNeed"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").detectFollowUpNeed(input);
      },
    ),
    defineTool(
      {
        name: "detect_resolution_signal",
        category: "conversation_understanding",
        description: "Check whether a new Slack event resolves, cancels, or changes a pending follow-up.",
        inputSchema: "{ conversation, newEvent, pendingFollowUp? }",
        outputSchema: "{ resolved, superseded, reason }",
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
          NonNullable<ToolDependencies["intelligence"]>["detectResolutionSignal"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "intelligence").detectResolutionSignal(input);
      },
    ),
  ];
}
