import type { ToolDependencies } from "./ports.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createTemporalControlTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "query_conversation_workflow",
        category: "temporal_control",
        description: "Read current conversation workflow state.",
        inputSchema: "{ conversation }",
        outputSchema: "JsonValue",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Temporal Client calls must happen outside Workflow code.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["temporal"]>["queryConversationWorkflow"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").queryConversationWorkflow(input);
      },
    ),
    defineTool(
      {
        name: "signal_conversation_event",
        category: "temporal_control",
        description: "Send a normalized event into an existing conversation workflow.",
        inputSchema: "{ conversation, event }",
        outputSchema: "{ workflowId, signaled }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Temporal Client calls must happen outside Workflow code.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["temporal"]>["signalConversationEvent"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").signalConversationEvent(input);
      },
    ),
    defineTool(
      {
        name: "start_or_signal_conversation",
        category: "temporal_control",
        description: "Use Temporal signalWithStart for Slack ingestion.",
        inputSchema: "{ conversation, event, taskQueue }",
        outputSchema: "{ workflowId, signalWithStartRequested }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Temporal Client calls must happen outside Workflow code.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["temporal"]>["startOrSignalConversation"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").startOrSignalConversation(input);
      },
    ),
    defineTool(
      {
        name: "close_conversation_workflow",
        category: "temporal_control",
        description: "Mark a conversation lifecycle complete when durable management is no longer needed.",
        inputSchema: "{ conversation, reason }",
        outputSchema: "{ workflowId, closed }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Temporal Client calls must happen outside Workflow code.",
        },
      },
      async (
        input: Parameters<
          NonNullable<ToolDependencies["temporal"]>["closeConversationWorkflow"]
        >[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").closeConversationWorkflow(input);
      },
    ),
    defineTool(
      {
        name: "schedule_ai_work",
        category: "temporal_control",
        description: "Schedule a future AI evaluation that can gather fresh context and decide what to do later.",
        inputSchema: "{ conversation, runAt, task, reason, context?, allowedActions?, requireHumanApproval?, idempotencyKey? }",
        outputSchema: "{ scheduledWorkId, workflowId, runAt, task, reason, status }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Scheduling future AI work is durable Workflow state but must be requested through an Activity or service boundary.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["temporal"]>["scheduleAiWork"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "temporal").scheduleAiWork({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
  ];
}
