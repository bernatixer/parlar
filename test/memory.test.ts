import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  createFakeEmbedder,
  createMemoryRepository,
  createPostgresMemoryPort,
  type MemoryRepository,
  type PostgresMemoryPort,
} from "../src/integrations/memory/index.js";
import type {
  ConversationRef,
  ConversationSummary,
  JsonValue,
} from "../src/domain/types.js";

const ALICE = "U_ALICE";
const BOB = "U_BOB";
const CAROL = "U_CAROL";
const DAN = "U_DAN";

interface Ctx {
  prisma: PrismaClient;
  port: PostgresMemoryPort;
  repository: MemoryRepository;
  w1: string;
  w2: string;
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

function memoryContent(m: JsonValue): string {
  if (
    m === null ||
    typeof m !== "object" ||
    Array.isArray(m) ||
    typeof m.content !== "string"
  ) {
    throw new Error("memory missing string content");
  }
  return m.content;
}

function memoryId(m: JsonValue): string {
  if (
    m === null ||
    typeof m !== "object" ||
    Array.isArray(m) ||
    typeof m.id !== "string"
  ) {
    throw new Error("memory missing id");
  }
  return m.id;
}

async function setupDatabase(): Promise<Ctx> {
  const prisma = new PrismaClient();
  const embedder = createFakeEmbedder();
  const port = createPostgresMemoryPort({ prisma, embedder });
  const repository = createMemoryRepository(prisma);

  // Clean
  await prisma.memoryOwner.deleteMany({});
  await prisma.memory.deleteMany({});
  await prisma.human.deleteMany({});
  await prisma.workspace.deleteMany({});

  const w1 = await prisma.workspace.create({
    data: { slackTeamId: `T_W1_${Date.now()}` },
    select: { id: true },
  });
  const w2 = await prisma.workspace.create({
    data: { slackTeamId: `T_W2_${Date.now()}` },
    select: { id: true },
  });

  // Seed memories
  const seed = async (
    workspaceId: string,
    channelId: string,
    threadTs: string,
    text: string,
    participants: string[],
    owners: { kind: "workspace" } | { kind: "human"; slackUserId: string }[] | undefined,
    tags?: string[],
    idempotencyKey?: string,
  ) => {
    const conversation: ConversationRef = {
      workspaceId,
      conversationId: `conv-${threadTs}`,
      channelId,
      threadTs,
    };
    return port.recordConversationSummary({
      conversation,
      summary: makeSummary(text, participants),
      idempotencyKey:
        idempotencyKey ?? `seed-${workspaceId}-${threadTs}`,
      ...(owners === undefined
        ? {}
        : Array.isArray(owners)
          ? { owners }
          : { owners: [owners] }),
      ...(tags === undefined ? {} : { tags }),
    });
  };

  // W1 workspace-global
  await seed(
    w1.id,
    "C_INFRA",
    "1700000001.000",
    "Postgres connection pool exhausted in api-gateway; mitigation was to bump max_connections from 100 to 200 and restart pgbouncer.",
    [ALICE, BOB],
    { kind: "workspace" },
    ["incident", "postgres"],
  );
  await seed(
    w1.id,
    "C_INFRA",
    "1700000002.000",
    "Kafka consumer lag spike was fixed by enabling batching and raising fetch min bytes.",
    [BOB],
    { kind: "workspace" },
    ["incident", "kafka"],
  );
  await seed(
    w1.id,
    "C_GENERAL",
    "1700000003.000",
    "Workspace policy: quiet hours from 7pm to 9am local time for reminders.",
    [],
    { kind: "workspace" },
    ["preference"],
  );

  // W1 Alice-private DM
  await seed(
    w1.id,
    "D_ALICE_BOT",
    "1700000010.000",
    "Alice prefers reminders before standup and not on Friday afternoon.",
    [ALICE],
    [{ kind: "human", slackUserId: ALICE }],
    ["preference", "personal"],
  );
  await seed(
    w1.id,
    "D_ALICE_BOT",
    "1700000011.000",
    "Alice secret note about an experimental rebase strategy on the migration branch.",
    [ALICE],
    [{ kind: "human", slackUserId: ALICE }],
    ["personal"],
  );

  // W1 Bob-private DM
  await seed(
    w1.id,
    "D_BOB_BOT",
    "1700000020.000",
    "Bob owns the data pipeline on-call rotation and is the escalation contact for ingest issues.",
    [BOB],
    [{ kind: "human", slackUserId: BOB }],
    ["ownership", "personal"],
  );

  // W1 group thread (Alice + Bob)
  await seed(
    w1.id,
    "G_AB_BOT",
    "1700000030.000",
    "Alice and Bob agreed to pair on the migration cutover next Wednesday at 2pm.",
    [ALICE, BOB],
    [
      { kind: "human", slackUserId: ALICE },
      { kind: "human", slackUserId: BOB },
    ],
    ["coordination"],
  );

  // W2 (cross-workspace; should NEVER appear in W1 queries)
  await seed(
    w2.id,
    "C_INFRA",
    "1700000040.000",
    "Postgres connection pool exhausted on the analytics cluster; bumped max_connections.",
    [CAROL],
    { kind: "workspace" },
    ["incident", "postgres"],
  );
  await seed(
    w2.id,
    "D_CAROL_BOT",
    "1700000041.000",
    "Carol prefers async escalation summaries.",
    [CAROL],
    [{ kind: "human", slackUserId: CAROL }],
    ["preference"],
  );
  await seed(
    w2.id,
    "D_DAN_BOT",
    "1700000042.000",
    "Dan is the primary product team liaison for follow-ups.",
    [DAN],
    [{ kind: "human", slackUserId: DAN }],
    ["ownership"],
  );

  return { prisma, port, repository, w1: w1.id, w2: w2.id };
}

let ctx: Ctx;

before(async () => {
  ctx = await setupDatabase();
});

after(async () => {
  await ctx.prisma.$disconnect();
});

describe("memory port", () => {
  it("workspace-global recall in W1 returns only workspace-owned memories", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "C_INFRA",
        threadTs: "1700000001.000",
      },
      query: "incident",
      limit: 50,
    });

    assert.ok(memories.length > 0, "expected some memories");

    // None of the returned memories should be Alice-only or Bob-only —
    // those were seeded with human-only owners. Inspect by content.
    const contents = memories.map(memoryContent);
    for (const c of contents) {
      assert.ok(
        !c.includes("Alice prefers reminders") &&
          !c.includes("Alice secret note") &&
          !c.includes("Bob owns the data pipeline") &&
          !c.includes("Alice and Bob agreed to pair"),
        `workspace-global recall leaked private memory: ${c}`,
      );
    }
  });

  it("DM recall with Alice viewer returns workspace + Alice memories, never Bob's", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "D_ALICE_BOT",
        threadTs: "1700000010.000",
      },
      query: "preference",
      viewerSlackUserIds: [ALICE],
      limit: 50,
    });

    const contents = memories.map(memoryContent);
    const hasAlicePref = contents.some((c) =>
      c.includes("Alice prefers reminders"),
    );
    const hasBobPrivate = contents.some((c) =>
      c.includes("Bob owns the data pipeline"),
    );

    assert.ok(hasAlicePref, "expected Alice's private memory to be visible");
    assert.equal(
      hasBobPrivate,
      false,
      "Bob's private memory must not be visible to Alice's scope",
    );
  });

  it("DM recall with Alice viewer DOES surface group-thread memory she co-owns", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "D_ALICE_BOT",
        threadTs: "1700000010.000",
      },
      query: "migration cutover pair",
      viewerSlackUserIds: [ALICE],
      limit: 50,
    });
    const contents = memories.map(memoryContent);
    assert.ok(
      contents.some((c) => c.includes("Alice and Bob agreed to pair")),
      "Alice should see group memory she co-owns",
    );
  });

  it("group-thread recall with [Alice, Bob] viewers returns union of both plus workspace-global", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "G_AB_BOT",
        threadTs: "1700000030.000",
      },
      query: "ownership preference incident",
      viewerSlackUserIds: [ALICE, BOB],
      limit: 50,
    });

    const contents = memories.map(memoryContent);
    assert.ok(contents.some((c) => c.includes("Alice prefers reminders")));
    assert.ok(contents.some((c) => c.includes("Bob owns the data pipeline")));
    assert.ok(
      contents.some((c) =>
        c.includes("Postgres connection pool exhausted in api-gateway"),
      ),
    );
  });

  it("cross-workspace isolation: W1 query never returns W2 memories", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "C_INFRA",
        threadTs: "x",
      },
      query: "Postgres connection pool exhausted analytics",
      limit: 50,
    });
    const contents = memories.map(memoryContent);
    for (const c of contents) {
      assert.ok(
        !c.includes("analytics cluster"),
        `W2-only memory leaked into W1 recall: ${c}`,
      );
    }
  });

  it("tag filter narrows to memories whose tags intersect", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "C_INFRA",
        threadTs: "x",
      },
      query: "anything",
      tags: ["kafka"],
      limit: 50,
    });
    const contents = memories.map(memoryContent);
    assert.ok(contents.length > 0);
    for (const c of contents) {
      assert.ok(c.includes("Kafka"), `non-Kafka memory leaked: ${c}`);
    }
  });

  it("semantic recall ranks the matching incident memory in the top results", async () => {
    const { memories } = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "test",
        channelId: "C_INFRA",
        threadTs: "x",
      },
      query: "Postgres connection pool exhausted max_connections",
      limit: 5,
    });
    assert.ok(memories.length > 0);
    const top = memoryContent(memories[0]!);
    assert.ok(
      top.toLowerCase().includes("postgres") ||
        top.toLowerCase().includes("connection"),
      `expected postgres/connection top result, got: ${top}`,
    );
  });

  it("idempotent create: same idempotencyKey returns same id with deduplicated=true", async () => {
    const conversation: ConversationRef = {
      workspaceId: ctx.w1,
      conversationId: "idem-test",
      channelId: "C_INFRA",
      threadTs: "9999999999.000",
    };
    const summary = makeSummary(
      "Idempotent test memory: rolling restart of the worker pool fixed the leak.",
      [ALICE],
    );
    const key = `idem-test-${Date.now()}`;

    const first = await ctx.port.recordConversationSummary({
      conversation,
      summary,
      idempotencyKey: key,
      owners: [{ kind: "workspace" }],
    });
    const second = await ctx.port.recordConversationSummary({
      conversation,
      summary,
      idempotencyKey: key,
      owners: [{ kind: "workspace" }],
    });

    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal(first.summaryId, second.summaryId);

    const count = await ctx.prisma.memory.count({
      where: { workspaceId: ctx.w1, dedupeKey: key },
    });
    assert.equal(count, 1);
  });

  it("addOwner makes a previously private memory visible in a broader scope", async () => {
    // Find Alice's "secret note"
    const initial = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "share-test",
        channelId: "C_GENERAL",
        threadTs: "x",
      },
      query: "Alice secret note experimental rebase migration",
      limit: 50,
    });
    const initialIds = initial.memories.map(memoryId);

    // Sanity: Alice's secret should NOT be visible without Alice as a viewer
    const aliceSecret = await ctx.prisma.memory.findFirst({
      where: { workspaceId: ctx.w1, content: { contains: "Alice secret note" } },
      select: { id: true },
    });
    assert.ok(aliceSecret, "Alice secret memory should exist");
    assert.ok(
      !initialIds.includes(aliceSecret.id),
      "Alice secret should NOT be visible in a workspace-only scope yet",
    );

    // Share to workspace
    await ctx.repository.addOwner({
      memoryId: aliceSecret.id,
      owner: { kind: "workspace" },
    });

    const after = await ctx.port.getRelatedConversationMemory({
      conversation: {
        workspaceId: ctx.w1,
        conversationId: "share-test",
        channelId: "C_GENERAL",
        threadTs: "x",
      },
      query: "Alice secret note experimental rebase migration",
      limit: 50,
    });
    const afterIds = after.memories.map(memoryId);
    assert.ok(
      afterIds.includes(aliceSecret.id),
      "after addOwner workspace, the memory should be visible in workspace-only scope",
    );
  });

  it("default owner inference: D-channel + 1 participant => human; C-channel => workspace", async () => {
    // D-channel
    const dmConv: ConversationRef = {
      workspaceId: ctx.w1,
      conversationId: "dm-default-owner",
      channelId: "D_ALICE_BOT",
      threadTs: "1800000000.000",
    };
    const dmKey = `default-dm-${Date.now()}`;
    const dmRes = await ctx.port.recordConversationSummary({
      conversation: dmConv,
      summary: makeSummary(
        "Alice told the agent she likes async escalations xyzzy.",
        [ALICE],
      ),
      idempotencyKey: dmKey,
    });
    const dmOwners = await ctx.prisma.memoryOwner.findMany({
      where: { memoryId: dmRes.summaryId },
    });
    assert.equal(dmOwners.length, 1);
    assert.equal(dmOwners[0]!.ownerKind, "human");

    // C-channel
    const chConv: ConversationRef = {
      workspaceId: ctx.w1,
      conversationId: "ch-default-owner",
      channelId: "C_RANDOM",
      threadTs: "1800000001.000",
    };
    const chKey = `default-ch-${Date.now()}`;
    const chRes = await ctx.port.recordConversationSummary({
      conversation: chConv,
      summary: makeSummary("A general channel memory plugh.", [ALICE]),
      idempotencyKey: chKey,
    });
    const chOwners = await ctx.prisma.memoryOwner.findMany({
      where: { memoryId: chRes.summaryId },
    });
    assert.equal(chOwners.length, 1);
    assert.equal(chOwners[0]!.ownerKind, "workspace");
  });
});
