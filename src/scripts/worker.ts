import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { NativeConnection } from "@temporalio/worker";
import { DEFAULT_AI_MODEL } from "../ai/models.js";
import { createLocalToolDependencies } from "../adapters/local/index.js";
import { SlackWebApiContextPort } from "../adapters/slack/slackWebApi.js";
import { demoSystemPrompt } from "../activities/decideNextAction.js";
import { createAgentWorker } from "../temporal/agentWorker.js";
import {
  getTemporalAddress,
  getTemporalConnectOptions,
  getTemporalNamespace,
} from "../temporal/connect.js";
import type { ToolDependencies } from "../tools/index.js";

const namespace = getTemporalNamespace();
const modelName = process.env.PARLAR_AI_MODEL ?? DEFAULT_AI_MODEL;
const demoMode = /^(1|true|yes)$/i.test(process.env.PARLAR_DEMO_MODE ?? "");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Set it in .env so the worker can call the model.",
    );
  }

  const connectOpts = getTemporalConnectOptions();
  const connection = await NativeConnection.connect(connectOpts);

  const localDeps = createLocalToolDependencies();
  let toolDependencies: ToolDependencies = localDeps;
  let slackMode = "in-memory";

  if (process.env.SLACK_BOT_TOKEN) {
    toolDependencies = {
      ...localDeps,
      slack: new SlackWebApiContextPort({ token: process.env.SLACK_BOT_TOKEN }),
    };
    slackMode = "real (SLACK_BOT_TOKEN set)";
  }

  const worker = await createAgentWorker({
    connection,
    namespace,
    toolDependencies,
    model: anthropic(modelName),
    ...(demoMode ? { systemPrompt: demoSystemPrompt } : {}),
  });

  console.log(
    `parlar worker started (temporal=${getTemporalAddress()}, namespace=${namespace}, model=${modelName}, slack=${slackMode}, demo=${demoMode})`,
  );
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
