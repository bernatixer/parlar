import { prisma } from "../state/db.js";
import {
  createDefaultEmbedder,
  createPostgresMemoryPort,
} from "../integrations/memory/index.js";
import type { ConversationRef, ConversationSummary } from "../domain/types.js";
import type { MemoryOwnerInput } from "../tools/ports.js";

interface SeededWorkspace {
  workspaceId: string;
  slackTeamId: string;
}

async function clearMemoryTables() {
  await prisma.memoryOwner.deleteMany({});
  await prisma.memory.deleteMany({});
  await prisma.human.deleteMany({});
  await prisma.workspace.deleteMany({});
}

function makeSummary(
  text: string,
  participants: string[],
): ConversationSummary {
  return {
    summary: text,
    openQuestions: [],
    actionItems: [],
    participants,
    lastUpdatedAt: new Date().toISOString(),
  };
}

async function main() {
  await clearMemoryTables();

  const w1 = await prisma.workspace.create({
    data: { slackTeamId: "T_W1", name: "Workspace One" },
    select: { id: true, slackTeamId: true },
  });
  const w2 = await prisma.workspace.create({
    data: { slackTeamId: "T_W2", name: "Workspace Two" },
    select: { id: true, slackTeamId: true },
  });

  const seeded: { w1: SeededWorkspace; w2: SeededWorkspace } = {
    w1: { workspaceId: w1.id, slackTeamId: w1.slackTeamId },
    w2: { workspaceId: w2.id, slackTeamId: w2.slackTeamId },
  };

  const port = createPostgresMemoryPort({
    prisma,
    embedder: createDefaultEmbedder(),
  });

  // Slack-style user IDs
  const ALICE = "U_ALICE";
  const BOB = "U_BOB";
  const CAROL = "U_CAROL";
  const DAN = "U_DAN";

  type Seed = {
    workspaceId: string;
    channelId: string;
    threadTs: string;
    text: string;
    participants: string[];
    owners?: MemoryOwnerInput[];
    tags?: string[];
  };

  const seeds: Seed[] = [
    // ---- W1 workspace-global memories (channel-style) ----
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "C_INFRA",
      threadTs: "1700000001.000",
      text: "Postgres connection pool exhausted in api-gateway; mitigation was to bump max_connections from 100 to 200 and restart the pgbouncer pool.",
      participants: [ALICE, BOB],
      owners: [{ kind: "workspace" }],
      tags: ["incident", "postgres"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "C_INFRA",
      threadTs: "1700000002.000",
      text: "Kafka consumer lag spiked because of a noisy producer; the fix was to enable batching and raise fetch.min.bytes.",
      participants: [BOB],
      owners: [{ kind: "workspace" }],
      tags: ["incident", "kafka"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "C_INFRA",
      threadTs: "1700000003.000",
      text: "Decision: we standardize on pnpm for new TypeScript services going forward. Reason: faster installs and stricter peer-dep handling.",
      participants: [ALICE, BOB],
      owners: [{ kind: "workspace" }],
      tags: ["decision", "tooling"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "C_GENERAL",
      threadTs: "1700000004.000",
      text: "Quiet hours for reminders are 7pm-9am local time per workspace policy.",
      participants: [],
      owners: [{ kind: "workspace" }],
      tags: ["preference", "norms"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "C_INFRA",
      threadTs: "1700000005.000",
      text: "Database ran out of connections during the Tuesday incident; bumped pool size and added connection-time alerting.",
      participants: [ALICE],
      owners: [{ kind: "workspace" }],
      tags: ["incident", "postgres"],
    },

    // ---- W1 DM memories (Alice) ----
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "D_ALICE_BOT",
      threadTs: "1700000010.000",
      text: "Alice prefers reminders in the morning, before standup, and not on Friday afternoons.",
      participants: [ALICE],
      owners: [{ kind: "human", slackUserId: ALICE }],
      tags: ["preference"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "D_ALICE_BOT",
      threadTs: "1700000011.000",
      text: "Alice is OOO Sept 4-9 for vacation; route urgent issues to Bob.",
      participants: [ALICE],
      owners: [{ kind: "human", slackUserId: ALICE }],
      tags: ["personal", "ooo"],
    },

    // ---- W1 DM memories (Bob) ----
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "D_BOB_BOT",
      threadTs: "1700000020.000",
      text: "Bob owns the data pipeline on-call rotation and is the escalation contact for ingest issues.",
      participants: [BOB],
      owners: [{ kind: "human", slackUserId: BOB }],
      tags: ["ownership"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "D_BOB_BOT",
      threadTs: "1700000021.000",
      text: "Bob is experimenting with raising the JVM heap on the loader service to handle backlog spikes.",
      participants: [BOB],
      owners: [{ kind: "human", slackUserId: BOB }],
      tags: ["personal", "experiment"],
    },

    // ---- W1 group-thread memories (Alice + Bob) ----
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "G_ALICE_BOB_BOT",
      threadTs: "1700000030.000",
      text: "Alice and Bob agreed to pair on the migration cutover next Wednesday at 2pm.",
      participants: [ALICE, BOB],
      owners: [
        { kind: "human", slackUserId: ALICE },
        { kind: "human", slackUserId: BOB },
      ],
      tags: ["coordination"],
    },
    {
      workspaceId: seeded.w1.workspaceId,
      channelId: "G_ALICE_BOB_BOT",
      threadTs: "1700000031.000",
      text: "Alice and Bob discussed splitting the on-call rota: Alice odd weeks, Bob even weeks.",
      participants: [ALICE, BOB],
      owners: [
        { kind: "human", slackUserId: ALICE },
        { kind: "human", slackUserId: BOB },
      ],
      tags: ["ownership", "rotation"],
    },

    // ---- W2 workspace-global (used to test cross-workspace isolation) ----
    {
      workspaceId: seeded.w2.workspaceId,
      channelId: "C_INFRA",
      threadTs: "1700000040.000",
      text: "Postgres connection pool exhausted on the analytics cluster; bumped max_connections and added pgbouncer.",
      participants: [CAROL],
      owners: [{ kind: "workspace" }],
      tags: ["incident", "postgres"],
    },
    {
      workspaceId: seeded.w2.workspaceId,
      channelId: "D_CAROL_BOT",
      threadTs: "1700000041.000",
      text: "Carol prefers asynchronous escalation summaries over Slack DMs.",
      participants: [CAROL],
      owners: [{ kind: "human", slackUserId: CAROL }],
      tags: ["preference"],
    },
    {
      workspaceId: seeded.w2.workspaceId,
      channelId: "D_DAN_BOT",
      threadTs: "1700000042.000",
      text: "Dan is the primary liaison with the product team for new feature follow-ups.",
      participants: [DAN],
      owners: [{ kind: "human", slackUserId: DAN }],
      tags: ["ownership"],
    },
  ];

  let idx = 0;
  for (const seed of seeds) {
    const conversation: ConversationRef = {
      workspaceId: seed.workspaceId,
      conversationId: `seed-${idx}`,
      channelId: seed.channelId,
      threadTs: seed.threadTs,
    };
    const summary = makeSummary(seed.text, seed.participants);

    await port.recordConversationSummary({
      conversation,
      summary,
      idempotencyKey: `seed-${seed.workspaceId}-${idx}`,
      ...(seed.owners === undefined ? {} : { owners: seed.owners }),
      ...(seed.tags === undefined ? {} : { tags: seed.tags }),
    });
    idx += 1;
  }

  console.log(
    `Seeded ${idx} memories across workspaces W1=${seeded.w1.workspaceId} and W2=${seeded.w2.workspaceId}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
