import { anthropic } from "@ai-sdk/anthropic";
import { Worker, type WorkerOptions } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import type { LanguageModel } from "ai";
import { DEFAULT_AI_MODEL } from "../ai/models.js";
import {
  createDecideNextAction,
  type DecideNextActionDependencies,
} from "../activities/decideNextAction.js";
import type { AgentActivities } from "../activities/agentActivities.js";
import { createAgentActivities } from "../activities/agentActivities.js";
import { createParlarToolRegistry, type ToolDependencies } from "../tools/index.js";
import { PARLAR_TASK_QUEUE } from "./agentConversationIds.js";

export interface CreateAgentWorkerOptions
  extends Pick<WorkerOptions, "connection" | "namespace"> {
  taskQueue?: string;
  toolDependencies: ToolDependencies;
  model?: LanguageModel;
  systemPrompt?: DecideNextActionDependencies["systemPrompt"];
  maxSteps?: number;
  workflowsPath?: string;
}

export async function createAgentWorker({
  connection,
  namespace,
  taskQueue = PARLAR_TASK_QUEUE,
  toolDependencies,
  model = anthropic(DEFAULT_AI_MODEL),
  systemPrompt,
  maxSteps,
  workflowsPath = defaultWorkflowsPath(),
}: CreateAgentWorkerOptions): Promise<Worker> {
  const registry = createParlarToolRegistry(toolDependencies);
  const activities: AgentActivities = createAgentActivities({
    decideNextAction: createDecideNextAction({
      model,
      registry,
      ...(maxSteps === undefined ? {} : { maxSteps }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
    }),
  });

  return Worker.create({
    ...(connection === undefined ? {} : { connection }),
    ...(namespace === undefined ? {} : { namespace }),
    taskQueue,
    workflowsPath,
    activities: activities as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >,
  });
}

function defaultWorkflowsPath(): string {
  return fileURLToPath(
    new URL("../workflows/agentConversationWorkflow.js", import.meta.url),
  );
}
