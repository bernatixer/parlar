import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import path from "node:path";

import type {
  AgentConversationRef,
  AgentTurnResult,
  MessageSignal,
} from "../src/domain/agent.js";
import type {
  AgentActivities,
  DecideNextActionInput,
} from "../src/activities/agentActivities.js";
import {
  PARLAR_AGENT_CONVERSATION_TASK_QUEUE,
  agentConversationWorkflowId,
} from "../src/temporal/agentConversationIds.js";
import { createAgentConversationClient } from "../src/temporal/agentConversationClient.js";

const ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";

interface ScriptedDecisionQueue {
  push(result: AgentTurnResult): void;
  pushDefault(result: AgentTurnResult): void;
}

interface RecordedActivityCalls {
  decideCalls: number;
  lastInput?: DecideNextActionInput;
}

interface TestRig {
  client: Client;
  conversationClient: ReturnType<typeof createAgentConversationClient>;
  conversation: AgentConversationRef;
  worker: Worker;
  workerRun: Promise<void>;
  decisions: ScriptedDecisionQueue;
  calls: RecordedActivityCalls;
  start: () => Promise<void>;
  shutdown: () => Promise<void>;
}

let rigCounter = 0;
const activeShutdowns: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (activeShutdowns.length > 0) {
    const shutdown = activeShutdowns.pop();
    if (shutdown) {
      await shutdown().catch(() => undefined);
    }
  }
});

async function buildRig(debounceMs: number): Promise<TestRig> {
  rigCounter += 1;
  const tag = `${process.pid}-${Date.now()}-${rigCounter}`;
  const taskQueue = `${PARLAR_AGENT_CONVERSATION_TASK_QUEUE}-test-${tag}`;

  const conversation: AgentConversationRef = {
    workspaceId: `T-test-${tag}`,
    platform: "slack",
    conversationId: `C-test-${tag}`,
    conversationKind: "channel",
  };

  const decisionQueue: AgentTurnResult[] = [];
  let defaultDecision: AgentTurnResult | undefined;

  const calls: RecordedActivityCalls = {
    decideCalls: 0,
  };

  const activities: AgentActivities = {
    async decideNextAction(input) {
      calls.decideCalls += 1;
      calls.lastInput = input;
      const decision = decisionQueue.shift() ?? defaultDecision;
      if (!decision) {
        return { stop: false, setReminders: [], cancelReminderIds: [] };
      }
      return decision;
    },
  };

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

  const workflowId = agentConversationWorkflowId(conversation);
  const start = async () => {
    await client.workflow
      .signalWithStart("agentConversationWorkflow", {
        workflowId,
        taskQueue,
        args: [
          {
            conversation,
            debounceMsByPlatform: { slack: debounceMs },
          },
        ],
        signal: "parlar.agent.messageSignal",
        signalArgs: [bootSignal()],
      })
      .catch((err) => {
        if (err instanceof WorkflowExecutionAlreadyStartedError) return;
        throw err;
      });
  };

  const shutdown = async () => {
    try {
      await conversationClient.closeConversation({ conversation });
    } catch {
      /* ignore */
    }
    worker.shutdown();
    await workerRun.catch(() => undefined);
    await clientConnection.close();
    await workerConnection.close();
  };
  activeShutdowns.push(shutdown);

  return {
    client,
    conversationClient,
    conversation,
    worker,
    workerRun,
    decisions: {
      push(d) {
        decisionQueue.push(d);
      },
      pushDefault(d) {
        defaultDecision = d;
      },
    },
    calls,
    start,
    shutdown,
  };
}

function bootSignal(): MessageSignal {
  return {
    platform: "slack",
    kind: "message",
    signalId: "boot",
    threadKey: "root",
    at: new Date().toISOString(),
    authorId: "participant:U-default",
    authorPlatformUserId: "U-default",
    isFromAgent: false,
  };
}

function makeMessage(overrides: Partial<MessageSignal> & { signalId: string }): MessageSignal {
  return {
    platform: "slack",
    kind: "message",
    threadKey: "root",
    at: new Date().toISOString(),
    authorId: "participant:U-default",
    authorPlatformUserId: "U-default",
    isFromAgent: false,
    ...overrides,
  };
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) return value;
    await delay(intervalMs);
  }
  throw new Error("waitFor: timeout");
}

describe("agentConversationWorkflow (integration)", () => {
  it("bootstraps participants and produces an initial decision call", async () => {
    const rig = await buildRig(50);
    rig.decisions.pushDefault({ stop: false, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    await waitFor(
      () => Promise.resolve(rig.calls.decideCalls),
      (n) => n >= 1,
    );

    const view = await rig.conversationClient.getState(rig.conversation);
    assert.equal(view.participants.length, 1);
    assert.equal(view.participants[0]?.platformUserId, "U-default");
    assert.equal(view.threads.length, 1);
    assert.equal(view.turnsRun >= 1, true);
  });

  it("debounces a burst of signals into a single agent turn", async () => {
    const rig = await buildRig(200);
    rig.decisions.pushDefault({ stop: false, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    for (let i = 1; i <= 3; i++) {
      await rig.conversationClient.signalMessage({
        conversation: rig.conversation,
        signal: makeMessage({ signalId: `m-${i}` }),
      });
    }

    await waitFor(
      () => Promise.resolve(rig.calls.decideCalls),
      (n) => n >= 1,
      { timeoutMs: 3_000 },
    );
    assert.ok(
      rig.calls.decideCalls <= 2,
      `expected debounce to keep decideCalls low; got ${rig.calls.decideCalls}`,
    );

    await waitFor(
      () => rig.conversationClient.getState(rig.conversation),
      (v) => v.threads.every((t) => t.pendingSignals.length === 0),
    );
  });

  it("applies setReminders to workflow state and fires them", async () => {
    const rig = await buildRig(50);

    const fireAt = new Date(Date.now() + 60_000).toISOString();
    rig.decisions.push({
      stop: false,
      setReminders: [
        { id: "rem-1", threadKey: "root", fireAt, reasonId: "reason-1" },
      ],
      cancelReminderIds: [],
    });
    rig.decisions.pushDefault({ stop: false, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    await waitFor(
      () => rig.conversationClient.getState(rig.conversation),
      (s) => s.reminders.some((r) => r.id === "rem-1"),
    );

    await rig.conversationClient.forceFollowUp(rig.conversation, "root");

    await waitFor(
      () => Promise.resolve(rig.calls.decideCalls),
      (n) => n >= 1,
    );
  });

  it("cancels reminders via the cancel update", async () => {
    const rig = await buildRig(50);
    const fireAt = new Date(Date.now() + 60_000).toISOString();
    rig.decisions.push({
      stop: false,
      setReminders: [
        { id: "rem-cancel", threadKey: "root", fireAt, reasonId: "r" },
      ],
      cancelReminderIds: [],
    });
    rig.decisions.pushDefault({ stop: false, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    await waitFor(
      () => rig.conversationClient.getState(rig.conversation),
      (s) => s.reminders.length === 1,
    );

    await rig.conversationClient.cancelReminder(rig.conversation, "rem-cancel");

    await waitFor(
      () => rig.conversationClient.getState(rig.conversation),
      (s) => s.reminders.length === 0,
    );
  });

  it("ends the workflow when the agent returns stop=true", async () => {
    const rig = await buildRig(50);
    rig.decisions.pushDefault({ stop: true, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    const handle = rig.client.workflow.getHandle(
      agentConversationWorkflowId(rig.conversation),
    );
    await handle.result();
  });

  it("passes work bundle and pending reminders to decideNextAction", async () => {
    const rig = await buildRig(50);
    rig.decisions.pushDefault({ stop: true, setReminders: [], cancelReminderIds: [] });
    await rig.start();

    await waitFor(
      () => Promise.resolve(rig.calls.lastInput),
      (input): input is DecideNextActionInput => input !== undefined,
    );

    const input = rig.calls.lastInput!;
    assert.equal(input.conversation.platform, "slack");
    assert.equal(input.work.length, 1);
    assert.equal(input.work[0]?.signals.some((s) => s.signalId === "boot"), true);
    assert.equal(input.participants.length, 1);
    assert.equal(input.pendingReminders.length, 0);
    assert.match(input.turnId, /#1$/);
  });
});
