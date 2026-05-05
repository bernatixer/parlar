import "dotenv/config";
import { WebClient } from "@slack/web-api";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  throw new Error("SLACK_BOT_TOKEN missing.");
}

const channelId = process.argv[2] ?? "C0B1X5XUA92";
const userId = process.argv[3] ?? "U0B1CNUTFF1";

const client = new WebClient(token);

async function check<T>(label: string, fn: () => Promise<T>): Promise<void> {
  try {
    await fn();
    console.log(`OK    ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL  ${label} -> ${msg.split("\n")[0]}`);
  }
}

const auth = await client.auth.test();
console.log(`Bot user: ${auth.user_id} (${auth.user})  team: ${auth.team_id}`);

await check("auth.test (any token)", () => client.auth.test());
await check("users.info -> users:read", () => client.users.info({ user: userId }));
await check("conversations.info -> channels:read", () =>
  client.conversations.info({ channel: channelId }),
);
await check("conversations.members -> channels:read", () =>
  client.conversations.members({ channel: channelId, limit: 5 }),
);
await check("conversations.history -> channels:history", () =>
  client.conversations.history({ channel: channelId, limit: 3 }),
);
await check("conversations.replies -> channels:history", () =>
  client.conversations.replies({ channel: channelId, ts: "1700000000.000100", limit: 3 }),
);
await check("chat.postMessage probe -> chat:write", () =>
  client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    text: "scope check (only you can see this)",
  }),
);
