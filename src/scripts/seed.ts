import { prisma } from "../state/db.js";
import {
  createDefaultEmbedder,
  createPostgresMemoryPort,
} from "../integrations/memory/index.js";
import type { ConversationRef, ConversationSummary } from "../domain/types.js";

const SLACK_TEAM_ID = process.env.DEMO_SLACK_TEAM_ID ?? "T_DEMO";
const WORKSPACE_NAME = process.env.DEMO_WORKSPACE_NAME ?? "Parlar Demo";
const USER_CLAY = process.env.DEMO_USER_CLAY ?? "U_CLAY";
const USER_MORGAN = process.env.DEMO_USER_MORGAN ?? "U_MORGAN";
const CHANNEL_ID = process.env.DEMO_CHANNEL_ID ?? "C_PARLAR_DEMO";
const PRIOR_THREAD_TS =
  process.env.DEMO_PRIOR_THREAD_TS ?? "1700000001.000";

async function clearMemoryTables() {
  await prisma.memoryOwner.deleteMany({});
  await prisma.memory.deleteMany({});
  await prisma.human.deleteMany({});
  await prisma.workspace.deleteMany({});
}

async function main() {
  await clearMemoryTables();

  const workspace = await prisma.workspace.create({
    data: { slackTeamId: SLACK_TEAM_ID, name: WORKSPACE_NAME },
    select: { id: true, slackTeamId: true },
  });

  const port = createPostgresMemoryPort({
    prisma,
    embedder: createDefaultEmbedder(),
  });

  const conversation: ConversationRef = {
    workspaceId: workspace.id,
    conversationId: "demo-prior-week-sso",
    channelId: CHANNEL_ID,
    threadTs: PRIOR_THREAD_TS,
  };

  const summary: ConversationSummary = {
    summary:
      "Decision: for the new SSO rollout, do SAML first; OIDC is a fast follow. Reason: Acme and the other early customers need SAML to integrate, and OIDC can ship after without blocking them.",
    openQuestions: [],
    actionItems: [],
    participants: [USER_CLAY, USER_MORGAN],
    lastUpdatedAt: new Date().toISOString(),
  };

  const result = await port.recordConversationSummary({
    conversation,
    summary,
    idempotencyKey: "demo-prior-week-sso",
    owners: [{ kind: "workspace" }],
    tags: ["decision", "sso"],
  });

  // Backdate the memory so the webapp renders it as "from last week" — this is
  // the prior-conversation context the bot will recall during the live demo.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.$executeRaw`
    UPDATE memories
    SET created_at = ${sevenDaysAgo}
    WHERE id = ${result.summaryId}::uuid
  `;

  console.log(
    `Seeded demo memory ${result.summaryId} in workspace ${workspace.id} ` +
      `(slackTeamId=${SLACK_TEAM_ID}, channel=${CHANNEL_ID}). ` +
      `Backdated to ${sevenDaysAgo.toISOString()}.`,
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
