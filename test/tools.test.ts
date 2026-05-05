import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRef, SlackMessage } from "../src/domain/types.js";
import { agentConversationWorkflowId } from "../src/temporal/agentConversationIds.js";
import { createParlarToolRegistry, type ToolDependencies } from "../src/tools/index.js";

const conversation: ConversationRef = {
  workspaceId: "T123",
  conversationId: "C123:1700000000.000100",
  channelId: "C123",
  threadTs: "1700000000.000100",
};

const message: SlackMessage = {
  workspaceId: "T123",
  channelId: "C123",
  messageTs: "1700000000.000100",
  threadTs: "1700000000.000100",
  senderUserId: "U123",
  text: "Can <@U456> review this tomorrow?",
  occurredAt: "2026-05-05T18:00:00.000Z",
};

function createDependencies(): ToolDependencies {
  return {
    slack: {
      async getThread() {
        return { messages: [message] };
      },
      async getChannelContext() {
        return { channelId: "C123", name: "product", memberCount: 12 };
      },
      async getUserProfile({ userId }) {
        return { userId, displayName: "Test User", isBot: false };
      },
      async searchMessages() {
        return { messages: [message] };
      },
      async sendMessage({ idempotencyKey }) {
        return {
          messageTs: "1700000001.000100",
          permalink: `https://example.test/${idempotencyKey}`,
          deduplicated: false,
        };
      },
    },
    intelligence: {
      async classifyConversationState() {
        return { status: "waiting", confidence: 0.91, reason: "Waiting on reviewer." };
      },
      async extractActionItems() {
        return {
          actionItems: [
            { description: "Review this", ownerUserId: "U456", confidence: 0.88 },
          ],
        };
      },
      async summarizeConversation() {
        return {
          summary: "A review was requested.",
          openQuestions: ["Can U456 review this?"],
          actionItems: [
            { description: "Review this", ownerUserId: "U456", confidence: 0.88 },
          ],
          participants: ["U123", "U456"],
          lastUpdatedAt: "2026-05-05T18:00:00.000Z",
        };
      },
      async detectFollowUpNeed() {
        return {
          needed: true,
          confidence: 0.87,
          reason: "No reviewer response yet.",
          plan: {
            id: "follow-up-1",
            targetUserIds: ["U456"],
            sendAt: "2026-05-06T18:00:00.000Z",
            reason: "Review request is pending.",
          },
        };
      },
      async detectResolutionSignal() {
        return { resolved: false, superseded: false, reason: "No resolution yet." };
      },
      async draftFollowUpMessage() {
        return {
          text: "Quick nudge: could you review this when you have a chance?",
          confidence: 0.84,
          rationale: "Polite reminder for pending review.",
        };
      },
    },
    memory: {
      async getWorkspacePreferences() {
        return { tone: "concise", quietHours: true };
      },
      async getPersonContext({ userId }) {
        return { userId, timezone: "America/Los_Angeles" };
      },
      async recordConversationDecision({ idempotencyKey }) {
        return { decisionId: idempotencyKey, deduplicated: false };
      },
      async getRelatedConversationMemory() {
        return { memories: [{ summary: "Prior review was delayed." }] };
      },
      async recordConversationSummary({ idempotencyKey }) {
        return { summaryId: idempotencyKey, deduplicated: false };
      },
    },
    safety: {
      async validateAction() {
        return { allowed: true, reasons: [], requiresHumanApproval: false };
      },
      async requestHumanApproval({ idempotencyKey }) {
        return { approvalRequestId: idempotencyKey, status: "pending" };
      },
      async createDraftOnly({ idempotencyKey }) {
        return { draftId: idempotencyKey, deduplicated: false };
      },
      async auditToolCall() {
        return { auditId: "audit-1" };
      },
    },
  };
}

describe("Parlar tools", () => {
  it("registers the read/draft/send tool set with Temporal-safe metadata", () => {
    const registry = createParlarToolRegistry(createDependencies());
    const specs = registry.list();

    assert.equal(specs.length, 22);
    assert.ok(specs.some((spec) => spec.name === "send_slack_message"));
    assert.ok(!specs.some((spec) => spec.name === "schedule_ai_work"));
    assert.ok(!specs.some((spec) => spec.name === "schedule_follow_up"));
    assert.ok(specs.every((spec) => spec.temporal.activityBacked));
    assert.ok(specs.every((spec) => spec.temporal.workflowSafe === false));
  });

  it("derives participants from thread messages", async () => {
    const registry = createParlarToolRegistry(createDependencies());
    const output = await registry.execute(
      "get_conversation_participants",
      {
        workspaceId: conversation.workspaceId,
        channelId: conversation.channelId,
        threadTs: conversation.threadTs,
      },
      { requestId: "req-1", actor: "test" },
    );

    assert.deepEqual(output, {
      participantUserIds: ["U123"],
      mentionedUserIds: ["U456"],
    });
  });

  it("propagates context idempotency keys for Slack sends", async () => {
    const registry = createParlarToolRegistry(createDependencies());
    const output = await registry.execute(
      "send_slack_message",
      {
        workspaceId: "T123",
        channelId: "C123",
        text: "Following up here.",
      },
      { requestId: "req-2", actor: "test", idempotencyKey: "send-1" },
    );

    assert.deepEqual(output, {
      messageTs: "1700000001.000100",
      permalink: "https://example.test/send-1",
      deduplicated: false,
    });
  });
});

describe("Agent conversation IDs", () => {
  it("uses platform-aware workspace and conversation identifiers", () => {
    assert.equal(
      agentConversationWorkflowId({
        workspaceId: "T123",
        platform: "slack",
        conversationId: "C123:1700000000.000100",
        conversationKind: "channel",
      }),
      "parlar:T123:slack:C123:1700000000.000100",
    );
  });
});
