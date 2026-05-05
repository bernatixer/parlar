import type {
  AgentConversationRef,
  MessageSignal,
  ParticipantId,
  ThreadKey,
} from "../../src/domain/agent.js";
import type { SlackMessage } from "../../src/domain/types.js";
import type {
  InMemorySlackChannel,
  InMemorySlackUser,
} from "../../src/adapters/local/inMemorySlack.js";

export interface HarnessScenario {
  name: string;
  description: string;
  conversation: AgentConversationRef;
  channels: readonly InMemorySlackChannel[];
  users: readonly InMemorySlackUser[];
  seedMessages: readonly SlackMessage[];
  signals: readonly MessageSignal[];
  followUpSignals?: ReadonlyArray<{ delayMs: number; signal: MessageSignal }>;
  expectStopWithinMs?: number;
}

const WORKSPACE_ID = "T_HARNESS";
const CHANNEL_ID = "C_HARNESS";
const ALICE = "U_ALICE";
const BOB = "U_BOB";

const channels: InMemorySlackChannel[] = [
  {
    workspaceId: WORKSPACE_ID,
    channelId: CHANNEL_ID,
    name: "harness-channel",
    topic: "Harness scenarios",
    memberIds: [ALICE, BOB],
  },
];

const users: InMemorySlackUser[] = [
  {
    workspaceId: WORKSPACE_ID,
    userId: ALICE,
    displayName: "Alice",
    timezone: "America/Los_Angeles",
  },
  {
    workspaceId: WORKSPACE_ID,
    userId: BOB,
    displayName: "Bob",
    timezone: "America/New_York",
  },
];

function participantId(slackUserId: string): ParticipantId {
  return `participant:${slackUserId}`;
}

function makeMessageSignal(opts: {
  signalId: string;
  threadKey?: ThreadKey;
  authorSlackUserId: string;
  authorDisplayName?: string;
  text: string;
  mentioned?: string[];
  at?: string;
}): MessageSignal {
  const at = opts.at ?? new Date().toISOString();
  return {
    platform: "slack",
    kind: "message",
    signalId: opts.signalId,
    threadKey: opts.threadKey ?? "root",
    at,
    authorId: participantId(opts.authorSlackUserId),
    authorPlatformUserId: opts.authorSlackUserId,
    ...(opts.authorDisplayName === undefined ? {} : { authorDisplayName: opts.authorDisplayName }),
    isFromAgent: false,
    text: opts.text,
    ...(opts.mentioned === undefined
      ? {}
      : { mentionedParticipantIds: opts.mentioned.map(participantId) }),
  };
}

function makeSlackMessage(opts: {
  ts: string;
  threadTs?: string;
  senderUserId: string;
  text: string;
  occurredAt?: string;
}): SlackMessage {
  return {
    workspaceId: WORKSPACE_ID,
    channelId: CHANNEL_ID,
    messageTs: opts.ts,
    ...(opts.threadTs === undefined ? {} : { threadTs: opts.threadTs }),
    senderUserId: opts.senderUserId,
    text: opts.text,
    occurredAt: opts.occurredAt ?? new Date().toISOString(),
  };
}

export const SCENARIOS: Record<string, HarnessScenario> = {
  "review-request": {
    name: "review-request",
    description:
      "Alice asks Bob to review a PR. Bob is silent. Agent should consider following up.",
    conversation: {
      workspaceId: WORKSPACE_ID,
      platform: "slack",
      conversationId: `${CHANNEL_ID}:harness-1`,
      conversationKind: "channel",
    },
    channels,
    users,
    seedMessages: [
      makeSlackMessage({
        ts: "1714000000.000100",
        threadTs: "1714000000.000100",
        senderUserId: ALICE,
        text: `Hey <@${BOB}>, can you review this PR sometime today? https://example/pr/123`,
      }),
    ],
    signals: [
      makeMessageSignal({
        signalId: "sig-review-1",
        threadKey: "1714000000.000100",
        authorSlackUserId: ALICE,
        authorDisplayName: "Alice",
        text: `Hey <@${BOB}>, can you review this PR sometime today? https://example/pr/123`,
        mentioned: [BOB],
      }),
    ],
    expectStopWithinMs: 60_000,
  },

  "quick-resolve": {
    name: "quick-resolve",
    description:
      "Alice asks, Bob immediately resolves. Agent should recognize resolution and not follow up.",
    conversation: {
      workspaceId: WORKSPACE_ID,
      platform: "slack",
      conversationId: `${CHANNEL_ID}:harness-2`,
      conversationKind: "channel",
    },
    channels,
    users,
    seedMessages: [
      makeSlackMessage({
        ts: "1714000100.000100",
        threadTs: "1714000100.000100",
        senderUserId: ALICE,
        text: `<@${BOB}> can you approve the deploy?`,
      }),
      makeSlackMessage({
        ts: "1714000200.000100",
        threadTs: "1714000100.000100",
        senderUserId: BOB,
        text: "Approved, thanks!",
      }),
    ],
    signals: [
      makeMessageSignal({
        signalId: "sig-resolve-1",
        threadKey: "1714000100.000100",
        authorSlackUserId: ALICE,
        authorDisplayName: "Alice",
        text: `<@${BOB}> can you approve the deploy?`,
        mentioned: [BOB],
      }),
      makeMessageSignal({
        signalId: "sig-resolve-2",
        threadKey: "1714000100.000100",
        authorSlackUserId: BOB,
        authorDisplayName: "Bob",
        text: "Approved, thanks!",
      }),
    ],
    expectStopWithinMs: 60_000,
  },

  "silent-channel-noise": {
    name: "silent-channel-noise",
    description: "A non-actionable broadcast. Agent should stop without action.",
    conversation: {
      workspaceId: WORKSPACE_ID,
      platform: "slack",
      conversationId: `${CHANNEL_ID}:harness-3`,
      conversationKind: "channel",
    },
    channels,
    users,
    seedMessages: [
      makeSlackMessage({
        ts: "1714001000.000100",
        senderUserId: ALICE,
        text: "Reminder: lunch is at 1pm.",
      }),
    ],
    signals: [
      makeMessageSignal({
        signalId: "sig-noise-1",
        authorSlackUserId: ALICE,
        authorDisplayName: "Alice",
        text: "Reminder: lunch is at 1pm.",
      }),
    ],
    expectStopWithinMs: 60_000,
  },
};

export function listScenarios(): string {
  return Object.values(SCENARIOS)
    .map((s) => `  ${s.name.padEnd(24)} ${s.description}`)
    .join("\n");
}
