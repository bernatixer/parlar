import {
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import type {
  AiWorkTask,
  AllowedAction,
  ConversationRef,
  FollowUpPlan,
  IsoDateTime,
  JsonValue,
  ScheduledAiWork,
} from "../domain/types.js";
import type {
  ExecuteScheduledAiWorkInput,
  ExecuteScheduledAiWorkOutput,
  ScheduledAiWorkRunner,
} from "../activities/conversationActivities.js";

export interface ConversationWorkflowInput {
  conversation: ConversationRef;
}

export interface ScheduleAiWorkCommand {
  runAt: IsoDateTime;
  task: AiWorkTask;
  reason: string;
  context?: JsonValue;
  allowedActions?: AllowedAction[];
  requireHumanApproval?: boolean;
  idempotencyKey: string;
}

export interface FollowUpCommand {
  followUp: FollowUpPlan;
  idempotencyKey: string;
}

export interface CancelFollowUpCommand {
  followUpId: string;
  reason: string;
  idempotencyKey: string;
}

export interface SnoozeFollowUpCommand extends CancelFollowUpCommand {
  runAt: IsoDateTime;
}

export interface CloseConversationCommand {
  reason: string;
}

export interface ConversationWorkflowState {
  conversation: ConversationRef;
  workflowId: string;
  events: JsonValue[];
  followUps: Record<
    string,
    FollowUpPlan & {
      status: "scheduled" | "updated" | "cancelled" | "snoozed";
      updatedAt: IsoDateTime;
    }
  >;
  scheduledAiWork: Record<
    string,
    ScheduledAiWork & {
      status: "scheduled" | "running" | "completed" | "failed" | "deferred";
      context?: JsonValue;
      allowedActions?: AllowedAction[];
      requireHumanApproval?: boolean;
      completedAt?: IsoDateTime;
      result?: JsonValue;
    }
  >;
  dedupe: Record<string, string>;
  closed?: { reason: string; closedAt: IsoDateTime };
}

export const conversationEventSignal = defineSignal<[JsonValue]>("conversation_event");
export const closeConversationSignal =
  defineSignal<[CloseConversationCommand]>("close_conversation");

export const getConversationStateQuery = defineQuery<ConversationWorkflowState>(
  "get_conversation_state",
);

export const scheduleAiWorkUpdate = defineUpdate<
  ScheduledAiWork & { status: "scheduled" | "updated" | "deduplicated" },
  [ScheduleAiWorkCommand]
>("schedule_ai_work");

export const scheduleFollowUpUpdate = defineUpdate<
  { followUpId: string; status: "scheduled" | "updated" | "deduplicated" },
  [FollowUpCommand]
>("schedule_follow_up");

export const cancelFollowUpUpdate = defineUpdate<
  { followUpId: string; status: "cancelled" | "deduplicated" },
  [CancelFollowUpCommand]
>("cancel_follow_up");

export const snoozeFollowUpUpdate = defineUpdate<
  { followUpId: string; runAt: IsoDateTime; status: "snoozed" | "deduplicated" },
  [SnoozeFollowUpCommand]
>("snooze_follow_up");

const { executeScheduledAiWork } = proxyActivities<ScheduledAiWorkRunner>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "5 minutes",
    maximumAttempts: 3,
  },
});

export async function conversationWorkflow({
  conversation,
}: ConversationWorkflowInput): Promise<void> {
  const state: ConversationWorkflowState = {
    conversation,
    workflowId: workflowInfo().workflowId,
    events: [],
    followUps: {},
    scheduledAiWork: {},
    dedupe: {},
  };

  setHandler(conversationEventSignal, (event) => {
    state.events.push(event);
  });

  setHandler(closeConversationSignal, ({ reason }) => {
    state.closed = { reason, closedAt: nowIso() };
  });

  setHandler(getConversationStateQuery, () => state);

  setHandler(scheduleAiWorkUpdate, (command) => {
    const existingId = state.dedupe[command.idempotencyKey];
    if (existingId) {
      const existing = state.scheduledAiWork[existingId];
      if (!existing) {
        return {
          scheduledWorkId: existingId,
          workflowId: state.workflowId,
          runAt: command.runAt,
          task: command.task,
          reason: command.reason,
          status: "deduplicated" as const,
        };
      }
      return {
        scheduledWorkId: existing.scheduledWorkId,
        workflowId: existing.workflowId,
        runAt: existing.runAt,
        task: existing.task,
        reason: existing.reason,
        status: "deduplicated" as const,
      };
    }

    const scheduledWorkId = `ai-work-${Object.keys(state.scheduledAiWork).length + 1}`;
    state.dedupe[command.idempotencyKey] = scheduledWorkId;
    state.scheduledAiWork[scheduledWorkId] = {
      scheduledWorkId,
      workflowId: state.workflowId,
      runAt: command.runAt,
      task: command.task,
      reason: command.reason,
      status: "scheduled",
      ...(command.context === undefined ? {} : { context: command.context }),
      ...(command.allowedActions === undefined ? {} : { allowedActions: command.allowedActions }),
      ...(command.requireHumanApproval === undefined
        ? {}
        : { requireHumanApproval: command.requireHumanApproval }),
    };

    return {
      scheduledWorkId,
      workflowId: state.workflowId,
      runAt: command.runAt,
      task: command.task,
      reason: command.reason,
      status: "scheduled" as const,
    };
  });

  setHandler(scheduleFollowUpUpdate, (command) => {
    const existingId = state.dedupe[command.idempotencyKey];
    if (existingId) {
      return { followUpId: existingId, status: "deduplicated" as const };
    }

    const status = state.followUps[command.followUp.id] ? "updated" : "scheduled";
    state.dedupe[command.idempotencyKey] = command.followUp.id;
    state.followUps[command.followUp.id] = {
      ...command.followUp,
      status,
      updatedAt: nowIso(),
    };
    return { followUpId: command.followUp.id, status };
  });

  setHandler(cancelFollowUpUpdate, (command) => {
    const existingId = state.dedupe[command.idempotencyKey];
    if (existingId) {
      return { followUpId: existingId, status: "deduplicated" as const };
    }

    state.dedupe[command.idempotencyKey] = command.followUpId;
    const existing = state.followUps[command.followUpId];
    if (existing) {
      state.followUps[command.followUpId] = {
        ...existing,
        status: "cancelled",
        reason: command.reason,
        updatedAt: nowIso(),
      };
    }
    return { followUpId: command.followUpId, status: "cancelled" as const };
  });

  setHandler(snoozeFollowUpUpdate, (command) => {
    const existingId = state.dedupe[command.idempotencyKey];
    if (existingId) {
      return { followUpId: existingId, runAt: command.runAt, status: "deduplicated" as const };
    }

    state.dedupe[command.idempotencyKey] = command.followUpId;
    const existing = state.followUps[command.followUpId];
    if (existing) {
      state.followUps[command.followUpId] = {
        ...existing,
        sendAt: command.runAt,
        reason: command.reason,
        status: "snoozed",
        updatedAt: nowIso(),
      };
    }
    return { followUpId: command.followUpId, runAt: command.runAt, status: "snoozed" as const };
  });

  while (!state.closed) {
    const nextRunAt = nextScheduledAiWorkTime(state);
    if (nextRunAt === undefined) {
      await condition(() => Boolean(state.closed) || nextScheduledAiWorkTime(state) !== undefined);
      continue;
    }

    await condition(
      () => Boolean(state.closed) || hasDueScheduledAiWork(state),
      Math.max(0, nextRunAt - Date.now()),
    );

    for (const work of dueScheduledAiWork(state)) {
      if (state.closed) {
        break;
      }
      work.status = "running";
      const result = await executeScheduledAiWork(toExecuteScheduledAiWorkInput(state, work));
      work.status = result.status;
      work.completedAt = nowIso();
      work.result = result as unknown as JsonValue;
    }
  }
}

function nextScheduledAiWorkTime(state: ConversationWorkflowState): number | undefined {
  const times = Object.values(state.scheduledAiWork)
    .filter((work) => work.status === "scheduled")
    .map((work) => Date.parse(work.runAt))
    .filter((time) => Number.isFinite(time));
  return times.length === 0 ? undefined : Math.min(...times);
}

function hasDueScheduledAiWork(state: ConversationWorkflowState): boolean {
  return dueScheduledAiWork(state).length > 0;
}

function dueScheduledAiWork(
  state: ConversationWorkflowState,
): ConversationWorkflowState["scheduledAiWork"][string][] {
  const now = Date.now();
  return Object.values(state.scheduledAiWork).filter(
    (work) => work.status === "scheduled" && Date.parse(work.runAt) <= now,
  );
}

function toExecuteScheduledAiWorkInput(
  state: ConversationWorkflowState,
  work: ConversationWorkflowState["scheduledAiWork"][string],
): ExecuteScheduledAiWorkInput {
  return {
    conversation: state.conversation,
    work: {
      scheduledWorkId: work.scheduledWorkId,
      workflowId: work.workflowId,
      runAt: work.runAt,
      task: work.task,
      reason: work.reason,
    },
    ...(work.context === undefined ? {} : { context: work.context }),
    ...(work.allowedActions === undefined ? {} : { allowedActions: work.allowedActions }),
    ...(work.requireHumanApproval === undefined
      ? {}
      : { requireHumanApproval: work.requireHumanApproval }),
  };
}

function nowIso(): IsoDateTime {
  return new Date(Date.now()).toISOString();
}

export type { ExecuteScheduledAiWorkOutput };
