import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { DEFAULT_AI_MODEL } from "../../src/ai/models.js";
import { createLocalToolDependencies } from "../../src/adapters/local/index.js";
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

const ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
const MODEL_NAME = process.env.PARLAR_AI_MODEL ?? DEFAULT_AI_MODEL;
const DEBOUNCE_MS = Number.parseInt(process.env.PARLAR_HARNESS_DEBOUNCE_MS ?? "500", 10);
const MAX_AGENT_STEPS = Number.parseInt(process.env.PARLAR_HARNESS_MAX_STEPS ?? "8", 10);

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

  const deps = createLocalToolDependencies({
    slack: {
      permalinkBaseUrl: "https://slack.example.test",
      channels: scenario.channels,
      users: scenario.users,
      messages: scenario.seedMessages,
    },
  });
  const baseRegistry = createParlarToolRegistry(deps);
  let turnIdx = 0;
  const { registry } = instrumentRegistry(baseRegistry, (entry) => {
    console.log(describeToolCall(entry));
  });

  const decideNext = createDecideNextAction({
    model: anthropic(MODEL_NAME),
    registry,
    maxSteps: MAX_AGENT_STEPS,
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

  const clientConnection = await Connection.connect({ address: ADDRESS });
  const client = new Client({ connection: clientConnection, namespace: NAMESPACE });
  const workerConnection = await NativeConnection.connect({ address: ADDRESS });

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

    logSection("Slack messages observed (in-memory adapter)");
    for (const m of deps.slack.snapshotMessages()) {
      const author = m.senderUserId === "BPARLAR" ? "AGENT" : m.senderUserId;
      console.log(`  ${m.occurredAt} [${m.channelId}] ${author}: ${m.text}`);
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
