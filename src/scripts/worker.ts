import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { NativeConnection } from "@temporalio/worker";
import { DEFAULT_AI_MODEL } from "../ai/models.js";
import { createLocalToolDependencies } from "../adapters/local/index.js";
import { SlackWebApiContextPort } from "../adapters/slack/slackWebApi.js";
import {
  createDecideNextAction,
  demoSystemPrompt,
} from "../activities/decideNextAction.js";
import { createAgentActivities } from "../activities/agentActivities.js";
import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { PARLAR_TASK_QUEUE } from "../temporal/agentConversationIds.js";
import {
  getTemporalAddress,
  getTemporalConnectOptions,
  getTemporalNamespace,
} from "../temporal/connect.js";
import { createParlarToolRegistry, type ToolDependencies } from "../tools/index.js";
import {
  instrumentRegistry,
  type ToolCallLogEntry,
} from "../tools/instrumentedRegistry.js";

const namespace = getTemporalNamespace();
const modelName = process.env.PARLAR_AI_MODEL ?? DEFAULT_AI_MODEL;
const demoMode = /^(1|true|yes)$/i.test(process.env.PARLAR_DEMO_MODE ?? "");

function parseMaxSteps(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(
      `PARLAR_DECIDE_MAX_STEPS must be a positive integer, got "${raw}".`,
    );
  }
  return n;
}

const decideMaxSteps = parseMaxSteps(process.env.PARLAR_DECIDE_MAX_STEPS);

function shortJson(value: unknown, max = 280): string {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function formatToolCall(entry: ToolCallLogEntry): string {
  const tag = entry.succeeded ? "ok " : "ERR";
  const tail = entry.succeeded
    ? `out=${shortJson(entry.output, 220)}`
    : `error=${entry.error ?? "?"}`;
  return `  [tool ${tag} ${entry.durationMs}ms] ${entry.toolName} in=${shortJson(entry.input, 220)} ${tail}`;
}

function defaultWorkflowsPath(): string {
  const compiled = fileURLToPath(
    new URL("../workflows/agentConversationWorkflow.js", import.meta.url),
  );
  if (existsSync(compiled)) return compiled;
  return fileURLToPath(
    new URL("../workflows/agentConversationWorkflow.ts", import.meta.url),
  );
}

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

  const baseRegistry = createParlarToolRegistry(toolDependencies);
  const { registry } = instrumentRegistry(baseRegistry, (entry) => {
    console.log(formatToolCall(entry));
  });

  const decideNext = createDecideNextAction({
    model: anthropic(modelName),
    registry,
    ...(demoMode ? { systemPrompt: demoSystemPrompt } : {}),
    ...(decideMaxSteps === undefined ? {} : { maxSteps: decideMaxSteps }),
  });

  const activities = createAgentActivities({
    decideNextAction: async (input) => {
      const startedAt = Date.now();
      console.log(
        `[turn ${input.turnId}] start: ${input.work.length} ready thread(s), ${input.pendingReminders.length} pending reminder(s)`,
      );
      try {
        const result = await decideNext(input);
        const ms = Date.now() - startedAt;
        console.log(
          `[turn ${input.turnId}] end (${ms}ms): stop=${result.stop} setReminders=${result.setReminders.length} cancel=${result.cancelReminderIds.length}` +
            (result.summary ? ` summary=${shortJson(result.summary, 200)}` : ""),
        );
        return result;
      } catch (err) {
        const ms = Date.now() - startedAt;
        console.log(
          `[turn ${input.turnId}] FAILED (${ms}ms): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    },
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: PARLAR_TASK_QUEUE,
    workflowsPath: defaultWorkflowsPath(),
    activities: activities as unknown as Record<string, (...args: unknown[]) => unknown>,
  });

  console.log(
    `parlar worker started (temporal=${getTemporalAddress()}, namespace=${namespace}, model=${modelName}, slack=${slackMode}, demo=${demoMode}, decideMaxSteps=${decideMaxSteps ?? "default"})`,
  );
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
