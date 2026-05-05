import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { NativeConnection } from "@temporalio/worker";
import { DEFAULT_AI_MODEL } from "../ai/models.js";
import { createLocalToolDependencies } from "../adapters/local/index.js";
import { createAgentWorker } from "../temporal/agentWorker.js";
import {
  getTemporalAddress,
  getTemporalConnectOptions,
  getTemporalNamespace,
} from "../temporal/connect.js";

const namespace = getTemporalNamespace();
const modelName = process.env.PARLAR_AI_MODEL ?? DEFAULT_AI_MODEL;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Set it in .env so the worker can call the model.",
    );
  }

  const connectOpts = getTemporalConnectOptions();
  const connection = await NativeConnection.connect(connectOpts);
  const toolDependencies = createLocalToolDependencies();

  const worker = await createAgentWorker({
    connection,
    namespace,
    toolDependencies,
    model: anthropic(modelName),
  });

  console.log(
    `parlar worker started (temporal=${getTemporalAddress()}, namespace=${namespace}, model=${modelName})`,
  );
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
