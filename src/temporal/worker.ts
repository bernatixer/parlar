import { anthropic } from "@ai-sdk/anthropic";
import type { ProviderV3 } from "@ai-sdk/provider";
import { AiSdkPlugin } from "@temporalio/ai-sdk";
import { Worker, type WorkerOptions } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import type { ToolDependencies } from "../tools/index.js";
import {
  createConversationActivities,
  type ScheduledAiWorkRunner,
} from "../activities/conversationActivities.js";
import { createToolActivities } from "../activities/toolActivities.js";
import { PARLAR_CONVERSATION_TASK_QUEUE } from "./taskQueues.js";

export interface CreateParlarWorkerOptions
  extends Pick<WorkerOptions, "connection" | "namespace"> {
  taskQueue?: string;
  toolDependencies: ToolDependencies;
  scheduledAiWorkRunner: ScheduledAiWorkRunner;
  workflowsPath?: string;
  aiModelProvider?: ProviderV3;
}

export async function createParlarWorker({
  connection,
  namespace,
  taskQueue = PARLAR_CONVERSATION_TASK_QUEUE,
  toolDependencies,
  scheduledAiWorkRunner,
  workflowsPath = defaultWorkflowsPath(),
  aiModelProvider = anthropic,
}: CreateParlarWorkerOptions): Promise<Worker> {
  return Worker.create({
    ...(connection === undefined ? {} : { connection }),
    ...(namespace === undefined ? {} : { namespace }),
    taskQueue,
    workflowsPath,
    plugins: [
      new AiSdkPlugin({
        modelProvider: aiModelProvider,
      }),
    ],
    activities: {
      ...createToolActivities(toolDependencies),
      ...createConversationActivities(scheduledAiWorkRunner),
    },
  });
}

function defaultWorkflowsPath(): string {
  return fileURLToPath(new URL("../workflows/conversationWorkflow.js", import.meta.url));
}
