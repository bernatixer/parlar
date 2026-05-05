import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SlackWebApiContextPort } from "../src/adapters/slack/index.js";
import { buildFollowUpSlackMessage } from "../src/slack/messages.js";

describe("SlackWebApiContextPort", () => {
  it("sends Block Kit messages through Slack chat.postMessage with idempotent local dedupe", async () => {
    const postMessageCalls: unknown[] = [];
    const client = {
      conversations: {
        replies: async () => ({ messages: [] }),
        info: async () => ({ channel: { name: "product" } }),
        members: async () => ({ members: [] }),
        history: async () => ({ messages: [] }),
      },
      users: {
        info: async () => ({ user: { id: "U123", is_bot: false } }),
      },
      search: {
        messages: async () => ({ messages: { matches: [] } }),
      },
      chat: {
        postMessage: async (payload: unknown) => {
          postMessageCalls.push(payload);
          return { ok: true, ts: "1700000100.000100", message: { permalink: "https://slack.test/msg" } };
        },
      },
    };

    const port = new SlackWebApiContextPort({ client });
    const payload = buildFollowUpSlackMessage({
      targetUserIds: ["U456"],
      reason: "Review request is still pending.",
      summary: "Alice asked Bob for a review.",
      tone: "warm",
    });

    const first = await port.sendMessage({
      workspaceId: "T123",
      channelId: "C123",
      threadTs: "1700000000.000100",
      text: payload.text,
      blocks: payload.blocks,
      idempotencyKey: "send-1",
    });
    const second = await port.sendMessage({
      workspaceId: "T123",
      channelId: "C123",
      threadTs: "1700000000.000100",
      text: payload.text,
      blocks: payload.blocks,
      idempotencyKey: "send-1",
    });

    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal(postMessageCalls.length, 1);
    assert.deepEqual(postMessageCalls[0], {
      channel: "C123",
      text: payload.text,
      blocks: payload.blocks,
      thread_ts: "1700000000.000100",
      metadata: {
        event_type: "parlar_message",
        event_payload: {
          idempotency_key: "send-1",
          workspace_id: "T123",
        },
      },
    });
  });
});
