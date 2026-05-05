import "dotenv/config";
import path from "node:path";
import { NativeConnection } from "@temporalio/worker";
import { createLocalToolDependencies } from "../adapters/local/index.js";
import type { ScheduledAiWorkRunner } from "../activities/conversationActivities.js";
import { createParlarWorker } from "../temporal/worker.js";

const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const workflowsPath = path.resolve("src/workflows/conversationWorkflow.ts");

async function main() {
  const connection = await NativeConnection.connect({ address });

  const toolDependencies = createLocalToolDependencies();

  const scheduledAiWorkRunner: ScheduledAiWorkRunner = {
    async executeScheduledAiWork() {
      return {
        status: "deferred",
        reason: "scheduled AI work runner not yet wired in worker entry",
      };
    },
  };

  const worker = await createParlarWorker({
    connection,
    namespace,
    toolDependencies,
    scheduledAiWorkRunner,
    workflowsPath,
  });

  console.log(
    `parlar worker started (temporal=${address}, namespace=${namespace})`,
  );
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
