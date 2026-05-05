import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationRef, SlackMessage } from "../src/domain/types.js";
import { buildFollowUpSlackMessage } from "../src/slack/messages.js";
import { createParlarToolRegistry } from "../src/tools/index.js";
import { createLocalToolDependencies } from "../src/adapters/local/index.js";

const conversation: ConversationRef = {
  workspaceId: "T123",
  conversationId: "C123:1700000000.000100",
  channelId: "C123",
  threadTs: "1700000000.000100",
};

const messages: SlackMessage[] = [
  {
    workspaceId: "T123",
    channelId: "C123",
    messageTs: "1700000000.000100",
    threadTs: "1700000000.000100",
    senderUserId: "U123",
    text: "Can <@U456> review this tomorrow?",
    occurredAt: new Date().toISOString(),
  },
  {
    workspaceId: "T123",
    channelId: "C123",
    messageTs: "1700000010.000100",
    threadTs: "1700000000.000100",
    senderUserId: "U456",
    text: "I can take a look later today.",
    occurredAt: new Date().toISOString(),
  },
];

describe("local tool implementations", () => {
  it("executes all registered tools with concrete local dependencies", async () => {
    const dependencies = createLocalToolDependencies({
      slack: {
        permalinkBaseUrl: "https://slack.example.test",
        channels: [
          {
            workspaceId: "T123",
            channelId: "C123",
            name: "product",
            topic: "Product work",
            memberIds: ["U123", "U456"],
          },
        ],
        users: [
          {
            workspaceId: "T123",
            userId: "U123",
            displayName: "Alice",
            timezone: "America/Los_Angeles",
          },
          {
            workspaceId: "T123",
            userId: "U456",
            displayName: "Bob",
            timezone: "America/New_York",
          },
        ],
        messages,
      },
    });
    const registry = createParlarToolRegistry(dependencies);
    const context = { requestId: "local-tools-test", actor: "test" as const };

    const thread = await registry.execute(
      "get_slack_thread",
      { workspaceId: "T123", channelId: "C123", threadTs: "1700000000.000100" },
      context,
    );
    assert.equal((thread as { messages: SlackMessage[] }).messages.length, 2);

    assert.deepEqual(
      await registry.execute(
        "get_slack_channel_context",
        { workspaceId: "T123", channelId: "C123", includeRecentMessages: true },
        context,
      ),
      {
        channelId: "C123",
        name: "product",
        topic: "Product work",
        memberCount: 2,
        recentMessages: messages,
      },
    );

    assert.equal(
      (await registry.execute(
        "get_slack_user_profile",
        { workspaceId: "T123", userId: "U456" },
        context,
      ) as { displayName?: string }).displayName,
      "Bob",
    );

    assert.equal(
      (await registry.execute(
        "search_slack_messages",
        { workspaceId: "T123", query: "review tomorrow", channelId: "C123" },
        context,
      ) as { messages: SlackMessage[] }).messages.length,
      1,
    );

    assert.deepEqual(
      await registry.execute(
        "get_conversation_participants",
        { workspaceId: "T123", channelId: "C123", threadTs: "1700000000.000100" },
        context,
      ),
      { participantUserIds: ["U123", "U456"], mentionedUserIds: ["U456"] },
    );

    const classification = await registry.execute(
      "classify_conversation_state",
      { conversation, messages },
      context,
    ) as { status: string };
    assert.equal(classification.status, "waiting");

    const actionItems = await registry.execute(
      "extract_action_items",
      { conversation, messages },
      context,
    ) as { actionItems: Array<{ ownerUserId?: string }> };
    assert.equal(actionItems.actionItems[0]?.ownerUserId, "U456");

    const summary = await registry.execute(
      "summarize_conversation",
      { conversation, messages },
      context,
    ) as { summary: string; actionItems: unknown[]; openQuestions: string[] };
    assert.ok(summary.summary.includes("review"));

    const followUpNeed = await registry.execute(
      "detect_follow_up_need",
      { conversation, summary, status: "waiting", actionItems: actionItems.actionItems },
      context,
    ) as { needed: boolean; plan?: { targetUserIds: string[] } };
    assert.equal(followUpNeed.needed, true);
    assert.deepEqual(followUpNeed.plan?.targetUserIds, ["U456"]);

    assert.equal(
      (await registry.execute(
        "detect_resolution_signal",
        {
          conversation,
          newEvent: { ...messages[1]!, text: "Done, approved this." },
          pendingFollowUp: followUpNeed.plan,
        },
        context,
      ) as { resolved: boolean }).resolved,
      true,
    );

    const draft = await registry.execute(
      "draft_follow_up_message",
      {
        conversation,
        targetUserIds: ["U456"],
        reason: "Review request is still pending.",
        tone: "concise",
      },
      context,
    ) as { text: string };
    assert.ok(draft.text.includes("<@U456>"));

    const built = await registry.execute(
      "build_slack_follow_up_message",
      {
        targetUserIds: ["U456"],
        reason: "Review request is still pending.",
        summary: summary.summary,
        actionItems: actionItems.actionItems,
        tone: "warm",
      },
      context,
    ) as ReturnType<typeof buildFollowUpSlackMessage>;
    assert.ok(built.blocks.length >= 2);

    const sent = await registry.execute(
      "send_slack_message",
      {
        workspaceId: "T123",
        channelId: "C123",
        threadTs: "1700000000.000100",
        text: built.text,
        blocks: built.blocks,
      },
      { ...context, idempotencyKey: "send-local-1" },
    ) as { deduplicated: boolean };
    assert.equal(sent.deduplicated, false);

    assert.deepEqual(
      await registry.execute("get_workspace_preferences", { workspaceId: "T123" }, context),
      { tone: "concise", quietHours: { enabled: true }, followUpDelayHours: 24 },
    );

    assert.equal(
      (await registry.execute(
        "get_person_context",
        { workspaceId: "T123", userId: "U456" },
        context,
      ) as { userId: string }).userId,
      "U456",
    );

    const decision = await registry.execute(
      "record_conversation_decision",
      { conversation, decisionType: "follow_up", reason: "Waiting on review." },
      { ...context, idempotencyKey: "decision-1" },
    ) as { decisionId: string };
    assert.equal(decision.decisionId, "decision-1");

    const storedSummary = await registry.execute(
      "record_conversation_summary",
      { conversation, summary },
      { ...context, idempotencyKey: "summary-1" },
    ) as { summaryId: string };
    assert.equal(storedSummary.summaryId, "summary-1");

    assert.ok(
      (await registry.execute(
        "get_related_conversation_memory",
        { conversation, query: "review" },
        context,
      ) as { memories: unknown[] }).memories.length >= 1,
    );

    assert.equal(
      (await registry.execute(
        "validate_action",
        { conversation, action: "send_message", text: built.text, targetUserIds: ["U456"] },
        context,
      ) as { allowed: boolean }).allowed,
      true,
    );

    assert.equal(
      (await registry.execute(
        "request_human_approval",
        { conversation, action: "send_message", reason: "Approval requested.", payload: {} },
        { ...context, idempotencyKey: "approval-1" },
      ) as { status: string }).status,
      "pending",
    );

    assert.equal(
      (await registry.execute(
        "create_draft_only",
        { conversation, text: built.text, reason: "Draft before send." },
        { ...context, idempotencyKey: "draft-1" },
      ) as { draftId: string }).draftId,
      "draft-1",
    );

    assert.equal(
      (await registry.execute(
        "audit_tool_call",
        { toolName: "send_slack_message", conversation, requestId: "audit-req", input: {} },
        context,
      ) as { auditId: string }).auditId,
      "audit-1",
    );

  });
});
