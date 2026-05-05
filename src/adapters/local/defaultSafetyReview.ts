import type { AllowedAction, ConversationRef, JsonValue, SlackUserId } from "../../domain/types.js";
import type { SafetyReviewPort } from "../../tools/ports.js";

export interface DefaultSafetyReviewOptions {
  maxMessageLength?: number;
  blockedPhrases?: readonly string[];
  sensitiveActionsRequireApproval?: readonly AllowedAction[];
}

export class DefaultSafetyReviewPort implements SafetyReviewPort {
  private readonly approvalsByIdempotencyKey = new Map<
    string,
    { approvalRequestId: string; status: "pending" | "deduplicated" }
  >();
  private readonly draftsByIdempotencyKey = new Map<
    string,
    { draftId: string; deduplicated: boolean }
  >();
  private auditSequence = 1;
  private approvalSequence = 1;
  private draftSequence = 1;

  constructor(private readonly options: DefaultSafetyReviewOptions = {}) {}

  async validateAction(input: {
    conversation: ConversationRef;
    action: AllowedAction;
    targetUserIds?: SlackUserId[];
    text?: string;
    requireHumanApproval?: boolean;
  }): Promise<{
    allowed: boolean;
    reasons: string[];
    requiresHumanApproval: boolean;
  }> {
    const reasons: string[] = [];
    const maxMessageLength = this.options.maxMessageLength ?? 3000;
    const blockedPhrases = this.options.blockedPhrases ?? ["password", "secret key", "api key"];
    const sensitiveActions = this.options.sensitiveActionsRequireApproval ?? ["send_message"];

    if (input.action === "send_message" && !input.text?.trim()) {
      reasons.push("send_message requires non-empty text");
    }
    if (input.text && input.text.length > maxMessageLength) {
      reasons.push(`text exceeds max length ${maxMessageLength}`);
    }
    if (input.text && blockedPhrases.some((phrase) => input.text!.toLowerCase().includes(phrase))) {
      reasons.push("text appears to contain sensitive material");
    }
    if (input.conversation.workspaceId.trim().length === 0) {
      reasons.push("workspaceId is required");
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      requiresHumanApproval:
        input.requireHumanApproval === true || sensitiveActions.includes(input.action),
    };
  }

  async requestHumanApproval(input: {
    conversation: ConversationRef;
    action: AllowedAction;
    reason: string;
    payload: JsonValue;
    idempotencyKey: string;
  }): Promise<{ approvalRequestId: string; status: "pending" | "deduplicated" }> {
    const existing = this.approvalsByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { approvalRequestId: existing.approvalRequestId, status: "deduplicated" };
    }

    const approvalRequestId = `approval-${this.approvalSequence++}`;
    const result = { approvalRequestId, status: "pending" as const };
    this.approvalsByIdempotencyKey.set(input.idempotencyKey, result);
    return result;
  }

  async createDraftOnly(input: {
    conversation: ConversationRef;
    text: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ draftId: string; deduplicated: boolean }> {
    const existing = this.draftsByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { draftId: existing.draftId, deduplicated: true };
    }

    const draftId = `draft-${this.draftSequence++}`;
    const result = { draftId, deduplicated: false };
    this.draftsByIdempotencyKey.set(input.idempotencyKey, result);
    return result;
  }

  async auditToolCall(): Promise<{ auditId: string }> {
    return { auditId: `audit-${this.auditSequence++}` };
  }
}
