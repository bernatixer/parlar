import type { ToolDependencies } from "./ports.js";
import { resolveIdempotencyKey } from "./idempotency.js";
import { requirePort } from "./requirePort.js";
import { defineTool, requireObject } from "./tool.js";

export function createSafetyReviewTools(dependencies: ToolDependencies) {
  return [
    defineTool(
      {
        name: "validate_action",
        category: "safety_review",
        description: "Check whether a proposed action is allowed for the workspace, target, timing, and confidence.",
        inputSchema: "{ conversation, action, targetUserIds?, text?, requireHumanApproval? }",
        outputSchema: "{ allowed, reasons, requiresHumanApproval }",
        sideEffects: false,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Policy and workspace reads may require side-effecting systems and must run in Activities.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["safety"]>["validateAction"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "safety").validateAction(input);
      },
    ),
    defineTool(
      {
        name: "request_human_approval",
        category: "safety_review",
        description: "Create an approval request before sending a sensitive or low-confidence action.",
        inputSchema: "{ conversation, action, reason, payload, idempotencyKey? }",
        outputSchema: "{ approvalRequestId, status }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Approval creation is a side effect and must be idempotent.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["safety"]>["requestHumanApproval"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "safety").requestHumanApproval({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "create_draft_only",
        category: "safety_review",
        description: "Save a proposed follow-up without sending it.",
        inputSchema: "{ conversation, text, reason, idempotencyKey? }",
        outputSchema: "{ draftId, deduplicated }",
        sideEffects: true,
        idempotent: true,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Draft creation is a persistence side effect and must be idempotent.",
        },
      },
      async (
        input: Omit<
          Parameters<NonNullable<ToolDependencies["safety"]>["createDraftOnly"]>[0],
          "idempotencyKey"
        > & { idempotencyKey?: string },
        context,
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "safety").createDraftOnly({
          ...input,
          idempotencyKey: resolveIdempotencyKey(input.idempotencyKey, context),
        });
      },
    ),
    defineTool(
      {
        name: "audit_tool_call",
        category: "safety_review",
        description: "Record tool input/output metadata for traceability.",
        inputSchema: "{ toolName, conversation?, requestId, input, output?, error? }",
        outputSchema: "{ auditId }",
        sideEffects: true,
        idempotent: false,
        temporal: {
          workflowSafe: false,
          activityBacked: true,
          reason: "Audit persistence must run in Activities, not Workflows.",
        },
      },
      async (
        input: Parameters<NonNullable<ToolDependencies["safety"]>["auditToolCall"]>[0],
      ) => {
        requireObject(input, "input");
        return requirePort(dependencies, "safety").auditToolCall(input);
      },
    ),
  ];
}
