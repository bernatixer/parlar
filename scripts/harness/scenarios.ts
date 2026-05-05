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
  /** When true, the harness wires the real Slack Web API for slack reads/sends. */
  useRealSlack?: boolean;
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

  "live-ping": {
    name: "live-ping",
    description:
      "Live #random demo: a real human pings @parlar. Real Slack sends; in-memory everything else. " +
      "The bot must already be in the channel and have chat:write.",
    conversation: {
      workspaceId: "T_LIVE",
      platform: "slack",
      // conversationId IS the Slack channel id for channel conversations.
      conversationId: "C0B1X5XUA92",
      conversationKind: "channel",
    },
    channels: [
      {
        workspaceId: "T_LIVE",
        channelId: "C0B1X5XUA92",
        name: "random",
      },
    ],
    users: [
      {
        workspaceId: "T_LIVE",
        userId: "U0B1CNUTFF1",
        displayName: "Bernat",
      },
    ],
    seedMessages: [],
    signals: [
      {
        platform: "slack",
        kind: "mention",
        signalId: "live-ping-1",
        threadKey: "root",
        at: new Date().toISOString(),
        authorId: "participant:U0B1CNUTFF1",
        authorPlatformUserId: "U0B1CNUTFF1",
        authorDisplayName: "Bernat",
        isFromAgent: false,
        text: "Hey @parlar, can you reply here so I can confirm the agent loop reaches Slack? Keep the message under 20 words and tag me back.",
        mentionedParticipantIds: ["participant:PARLAR"],
      },
    ],
    expectStopWithinMs: 60_000,
    useRealSlack: true,
  },

  "bernat-jaume-ask": {
    name: "bernat-jaume-ask",
    description:
      "Bernat asks Jaume to check the deploy in #random. After 12s a mocked Jaume reply arrives. " +
      "Real Slack sends; agent should observe, react, then stop. Bot must be in the channel.",
    conversation: {
      workspaceId: "T_LIVE",
      platform: "slack",
      conversationId: "C0B1X5XUA92",
      conversationKind: "channel",
    },
    channels: [
      { workspaceId: "T_LIVE", channelId: "C0B1X5XUA92", name: "random" },
    ],
    users: [
      {
        workspaceId: "T_LIVE",
        userId: "U0B1CNUTFF1",
        displayName: "Bernat",
      },
      {
        workspaceId: "T_LIVE",
        userId: "U0B1QQNLD4M",
        displayName: "Jaume",
      },
    ],
    seedMessages: [],
    signals: [
      {
        platform: "slack",
        kind: "message",
        signalId: "bj-1",
        threadKey: "root",
        at: new Date().toISOString(),
        authorId: "participant:U0B1CNUTFF1",
        authorPlatformUserId: "U0B1CNUTFF1",
        authorDisplayName: "Bernat",
        isFromAgent: false,
        text: "Hey <@U0B1QQNLD4M>, can you check the deploy status when you're back from lunch? I'm in a meeting.",
        mentionedParticipantIds: ["participant:U0B1QQNLD4M"],
      },
    ],
    followUpSignals: [
      {
        delayMs: 12_000,
        signal: {
          platform: "slack",
          kind: "reply",
          signalId: "bj-2",
          threadKey: "root",
          at: new Date().toISOString(),
          authorId: "participant:U0B1QQNLD4M",
          authorPlatformUserId: "U0B1QQNLD4M",
          authorDisplayName: "Jaume",
          isFromAgent: false,
          text: "On it, taking a look now.",
        },
      },
    ],
    expectStopWithinMs: 120_000,
    useRealSlack: true,
  },

  "live-nudge": {
    name: "live-nudge",
    description:
      "Bernat asks Jaume to check the deploy. No reply arrives. The agent should set a short reminder, " +
      "let it fire, and post a real follow-up nudge in #random. Best demo for end-to-end behaviour.",
    conversation: {
      workspaceId: "T_LIVE",
      platform: "slack",
      conversationId: "C0B1X5XUA92",
      conversationKind: "channel",
    },
    channels: [
      { workspaceId: "T_LIVE", channelId: "C0B1X5XUA92", name: "random" },
    ],
    users: [
      { workspaceId: "T_LIVE", userId: "U0B1CNUTFF1", displayName: "Bernat" },
      { workspaceId: "T_LIVE", userId: "U0B1QQNLD4M", displayName: "Jaume" },
    ],
    seedMessages: [],
    signals: [
      {
        platform: "slack",
        kind: "message",
        signalId: "live-nudge-1",
        threadKey: "root",
        at: new Date().toISOString(),
        authorId: "participant:U0B1CNUTFF1",
        authorPlatformUserId: "U0B1CNUTFF1",
        authorDisplayName: "Bernat",
        isFromAgent: false,
        text: "Hey <@U0B1QQNLD4M>, can you check the deploy status when you're back? I'm heading into a meeting and won't be reachable.",
        mentionedParticipantIds: ["participant:U0B1QQNLD4M"],
      },
    ],
    expectStopWithinMs: 90_000,
    useRealSlack: true,
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
