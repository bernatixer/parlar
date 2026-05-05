import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { DEFAULT_AI_MODEL } from "../../src/ai/models.js";
import { createLocalToolDependencies } from "../../src/adapters/local/index.js";
import { SlackWebApiContextPort } from "../../src/adapters/slack/slackWebApi.js";
import type { ToolDependencies } from "../../src/tools/index.js";
import {
  getTemporalAddress,
  getTemporalConnectOptions,
  getTemporalNamespace,
} from "../../src/temporal/connect.js";
import { createAgentActivities } from "../../src/activities/agentActivities.js";
import { createDecideNextAction } from "../../src/activities/decideNextAction.js";
import { createParlarToolRegistry } from "../../src/tools/index.js";
import {
  PARLAR_TASK_QUEUE,
  agentConversationWorkflowId,
} from "../../src/temporal/agentConversationIds.js";
import { createAgentConversationClient } from "../../src/temporal/agentConversationClient.js";
import { SCENARIOS, listScenarios, type HarnessScenario } from "./scenarios.js";
import { instrumentRegistry, type ToolCallLogEntry } from "./instrumentedRegistry.js";

const ADDRESS = getTemporalAddress();
const NAMESPACE = getTemporalNamespace();
// Harness defaults to Haiku for fast iteration; override with PARLAR_HARNESS_MODEL
// or fall back to PARLAR_AI_MODEL.
const MODEL_NAME =
  process.env.PARLAR_HARNESS_MODEL ??
  process.env.PARLAR_AI_MODEL ??
  "claude-haiku-4-5";
void DEFAULT_AI_MODEL;
const DEBOUNCE_MS = Number.parseInt(process.env.PARLAR_HARNESS_DEBOUNCE_MS ?? "500", 10);
const MAX_AGENT_STEPS = Number.parseInt(process.env.PARLAR_HARNESS_MAX_STEPS ?? "5", 10);

interface ParsedArgs {
  scenarioName: string;
  list: boolean;
  timeoutMs: number;
  maxTurns: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    scenarioName: "review-request",
    list: false,
    timeoutMs: 120_000,
    maxTurns: Number.parseInt(process.env.PARLAR_HARNESS_MAX_TURNS ?? "3", 10),
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list" || arg === "-l") args.list = true;
    else if (arg === "--timeout") {
      const next = argv[i + 1];
      if (next) {
        args.timeoutMs = Number.parseInt(next, 10);
        i++;
      }
    } else if (arg === "--max-turns") {
      const next = argv[i + 1];
      if (next) {
        args.maxTurns = Number.parseInt(next, 10);
        i++;
      }
    } else if (arg && !arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  if (positional[0]) args.scenarioName = positional[0];
  return args;
}

function logSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function harnessSystemPrompt(_input: unknown): string {
  return [
    "You are Parlar, an agent that keeps Slack-style conversations from being dropped.",
    "Your job each turn:",
    "- Use the read tools to gather only the context you need.",
    "- Take small, reversible, explainable actions via the action tools.",
    "- When done, call submit_turn_result EXACTLY once with the workflow-side outcome.",
    "Rules:",
    "- Reminders persist in workflow state. Use setReminders for new or replaced reminders, cancelReminderIds to drop ones you no longer want.",
    "- Set stop=true only when the conversation is resolved or no longer needs management. Otherwise stop=false.",
    "- Never invent workspace facts or participants; ask via tools.",
    "- Prefer asking a human via request_human_approval when uncertain.",
    "Slack identifier mapping:",
    "- conversation.conversationId IS the Slack channel id (use it as channelId in slack tools).",
    "- threadKey is the Slack thread_ts; use 'root' to mean a top-level channel message (no thread).",
    "- Pass thread keys and message timestamps verbatim as STRINGS, never as numbers (they have trailing zeros and decimals).",
    "DEMO MODE OVERRIDES (this is a short test run, not production):",
    "- Reminder fireAt MUST be within the next 60 seconds (use now + 25s by default).",
    "- When a reminder fires for an unanswered ask, ALWAYS post a friendly, brief nudge to the thread via send_slack_message (mention the assignee), then set stop=true on that same turn.",
    "- When a participant has clearly acknowledged the ask, cancel any related reminders and set stop=true.",
    "- Be willing to send messages for visible progress: if the user explicitly addresses you (e.g., '@parlar ...'), respond with send_slack_message.",
  ].join("\n");
}

function shortJson(value: unknown, max = 280): string {
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function describeToolCall(entry: ToolCallLogEntry): string {
  const status = entry.succeeded ? "ok" : "ERR";
  const out = entry.succeeded
    ? shortJson(entry.output, 220)
    : `error=${entry.error ?? "?"}`;
  return `  [${status} ${entry.durationMs}ms] ${entry.toolName} in=${shortJson(entry.input, 220)} out=${out}`;
}

async function runScenario(scenario: HarnessScenario, args: ParsedArgs): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is missing. Set it in .env or your shell so the harness can call Claude.",
    );
  }

  logSection(`Scenario: ${scenario.name}`);
  console.log(scenario.description);
  console.log(`Workflow ID: ${agentConversationWorkflowId(scenario.conversation)}`);
  console.log(
    `Model: ${MODEL_NAME}    Debounce: ${DEBOUNCE_MS}ms    Max steps: ${MAX_AGENT_STEPS}    Max turns: ${args.maxTurns}`,
  );

  const taskQueue = `${PARLAR_TASK_QUEUE}-harness-${process.pid}-${Date.now()}`;

  const localDeps = createLocalToolDependencies({
    slack: {
      permalinkBaseUrl: "https://slack.example.test",
      channels: scenario.channels,
      users: scenario.users,
      messages: scenario.seedMessages,
    },
  });
  let deps: ToolDependencies = localDeps;
  if (scenario.useRealSlack) {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      throw new Error(
        "Scenario useRealSlack=true but SLACK_BOT_TOKEN is missing from .env",
      );
    }
    console.log("Using REAL Slack Web API for slack reads/sends.");
    deps = {
      ...localDeps,
      slack: new SlackWebApiContextPort({ token: botToken }),
    };
  }
  const baseRegistry = createParlarToolRegistry(deps);
  let turnIdx = 0;
  const { registry } = instrumentRegistry(baseRegistry, (entry) => {
    console.log(describeToolCall(entry));
  });

  const decideNext = createDecideNextAction({
    model: anthropic(MODEL_NAME),
    registry,
    maxSteps: MAX_AGENT_STEPS,
    systemPrompt: harnessSystemPrompt,
  });

  const activities = createAgentActivities({
    decideNextAction: async (input) => {
      turnIdx += 1;
      logSection(`Turn ${turnIdx} (turnId=${input.turnId})`);
      console.log(
        `  work: ${input.work
          .map(
            (w) =>
              `${w.threadKey}:${w.signals.length}sigs/${w.dueReminderIds.length}reminders`,
          )
          .join(", ") || "(none)"}`,
      );
      console.log(`  pending reminders: ${input.pendingReminders.length}`);

      if (turnIdx >= args.maxTurns) {
        console.log(
          `  ! reached --max-turns (${args.maxTurns}); forcing stop=true to cap model spend`,
        );
        return {
          stop: true,
          setReminders: [],
          cancelReminderIds: [],
          summary: "harness max-turns cap",
        };
      }

      const result = await decideNext(input);
      console.log(
        `  -> stop=${result.stop} setReminders=${result.setReminders.length} cancel=${result.cancelReminderIds.length}` +
          (result.summary ? `\n  summary: ${result.summary}` : ""),
      );
      return result;
    },
  });

  const connectOpts = getTemporalConnectOptions();
  const clientConnection = await Connection.connect(connectOpts);
  const client = new Client({ connection: clientConnection, namespace: NAMESPACE });
  const workerConnection = await NativeConnection.connect(connectOpts);

  const worker = await Worker.create({
    connection: workerConnection,
    namespace: NAMESPACE,
    taskQueue,
    workflowsPath: path.resolve("src/workflows/agentConversationWorkflow.ts"),
    activities: activities as unknown as Record<string, (...args: unknown[]) => unknown>,
  });

  const workerRun = worker.run();
  const conversationClient = createAgentConversationClient({ client, taskQueue });

  const cleanup = async () => {
    const workflowId = agentConversationWorkflowId(scenario.conversation);
    try {
      await client.workflow.getHandle(workflowId).terminate("harness exit");
      console.log(`(terminated ${workflowId} on exit so it cannot resume later)`);
    } catch {
      /* workflow may already be closed/completed */
    }
    worker.shutdown();
    await workerRun.catch(() => undefined);
    await clientConnection.close();
    await workerConnection.close();
  };

  try {
    const workflowId = agentConversationWorkflowId(scenario.conversation);
    const firstSignal = scenario.signals[0];
    if (!firstSignal) {
      throw new Error(`Scenario ${scenario.name} has no signals.`);
    }

    logSection("Bootstrap");
    console.log(`-> signalWithStart with ${firstSignal.signalId}`);
    await client.workflow
      .signalWithStart("agentConversationWorkflow", {
        workflowId,
        taskQueue,
        args: [
          {
            conversation: scenario.conversation,
            debounceMsByPlatform: { slack: DEBOUNCE_MS },
          },
        ],
        signal: "parlar.agent.messageSignal",
        signalArgs: [firstSignal],
      })
      .catch((err) => {
        if (err instanceof WorkflowExecutionAlreadyStartedError) return;
        throw err;
      });

    for (const sig of scenario.signals.slice(1)) {
      console.log(`-> signal ${sig.signalId}`);
      await conversationClient.signalMessage({
        conversation: scenario.conversation,
        signal: sig,
      });
    }

    for (const followUp of scenario.followUpSignals ?? []) {
      await delay(followUp.delayMs);
      console.log(`-> follow-up signal ${followUp.signal.signalId}`);
      await conversationClient.signalMessage({
        conversation: scenario.conversation,
        signal: followUp.signal,
      });
    }

    logSection("Waiting for workflow to stop or timeout");
    const handle = client.workflow.getHandle(workflowId);
    const expectStopBy = scenario.expectStopWithinMs ?? args.timeoutMs;

    let stopped = false;
    await Promise.race([
      handle.result().then(() => {
        stopped = true;
      }),
      delay(expectStopBy),
    ]);

    logSection("Final state");
    if (stopped) {
      console.log("Workflow returned (stop=true reached).");
    } else {
      console.log(`Workflow still running after ${expectStopBy}ms.`);
    }
    const view = await conversationClient
      .getState(scenario.conversation)
      .catch(() => undefined);
    if (view) {
      console.log(`turnsRun=${view.turnsRun} signalsSeen=${view.signalsSeen}`);
      console.log(`reminders=${view.reminders.length}`);
      for (const reminder of view.reminders) {
        console.log(`  - ${reminder.id} fires ${reminder.fireAt} on ${reminder.threadKey}`);
      }
      console.log(`participants=${view.participants.length}`);
    } else {
      console.log("(getState unavailable; workflow may already be closed)");
    }

    if (!scenario.useRealSlack) {
      logSection("Slack messages observed (in-memory adapter)");
      for (const m of localDeps.slack.snapshotMessages()) {
        const author = m.senderUserId === "BPARLAR" ? "AGENT" : m.senderUserId;
        console.log(`  ${m.occurredAt} [${m.channelId}] ${author}: ${m.text}`);
      }
    } else {
      logSection("Real Slack: any messages should be visible in your workspace.");
    }
  } finally {
    await cleanup();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    console.log("Available scenarios:");
    console.log(listScenarios());
    return;
  }
  const scenario = SCENARIOS[args.scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${args.scenarioName}`);
    console.error("Available:");
    console.error(listScenarios());
    process.exitCode = 1;
    return;
  }
  await runScenario(scenario, args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
