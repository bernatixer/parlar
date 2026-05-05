import "dotenv/config";
import { SlackWebApiContextPort } from "../src/adapters/slack/slackWebApi.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  throw new Error("SLACK_BOT_TOKEN missing. Add it to .env or your shell.");
}

const channelId = process.argv[2] ?? "C0B1X5XUA92";
const userId = process.argv[3] ?? "U0B1CNUTFF1";
const customText = process.argv[4];

const text =
  customText ??
  `Parlar smoke test: hello <@${userId}>! If you can see this, the bot token works and Parlar can reach this channel.`;

const slack = new SlackWebApiContextPort({ token });

const idempotencyKey = `smoke-${Date.now()}`;
console.log(`Sending to channel=${channelId} idempotencyKey=${idempotencyKey}`);

const result = await slack.sendMessage({
  workspaceId: "smoke",
  channelId,
  text,
  idempotencyKey,
});

console.log(`Sent. ts=${result.messageTs} deduplicated=${result.deduplicated}`);
if (result.permalink) {
  console.log(`Permalink: ${result.permalink}`);
}
