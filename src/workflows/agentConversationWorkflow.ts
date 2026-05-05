import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type {
  AgentConversationRef,
  AgentTurnResult,
  MessageSignal,
  ParticipantId,
  ParticipantSummary,
  Platform,
  Reminder,
  ReminderId,
  SignalId,
  ThreadKey,
} from "../domain/agent.js";
import { CONTINUE_AS_NEW_LIMITS, DEBOUNCE_MS_BY_PLATFORM } from "../domain/agent.js";
import type { IsoDateTime } from "../domain/types.js";
import type { AgentActivities } from "../activities/agentActivities.js";

export interface PendingSignal {
  signalId: SignalId;
  kind: MessageSignal["kind"];
  at: IsoDateTime;
  authorId: ParticipantId;
  text?: string;
  mentionedParticipantIds?: ParticipantId[];
  permalink?: string;
}

interface ThreadInbox {
  threadKey: ThreadKey;
  pendingSignals: PendingSignal[];
  lastSignalAt: IsoDateTime;
  debounceUntilMs: number;
}

export interface AgentConversationStateView {
  conversation: AgentConversationRef;
  workflowId: string;
  participants: ParticipantSummary[];
  threads: Array<{
    threadKey: ThreadKey;
    pendingSignals: PendingSignal[];
    lastSignalAt: IsoDateTime;
    debounceUntil: IsoDateTime;
  }>;
  reminders: Reminder[];
  inFlightAgentTurn: boolean;
  lastDecisionAt?: IsoDateTime;
  signalsSeen: number;
  turnsRun: number;
  startedAt: IsoDateTime;
  stopRequested: boolean;
}

export interface AgentConversationPendingView {
  reminders: Reminder[];
  readyThreads: ThreadKey[];
}

export interface PackedAgentConversationState {
  conversation: AgentConversationRef;
  participants: ParticipantSummary[];
  threads: Array<{
    threadKey: ThreadKey;
    pendingSignals: PendingSignal[];
    lastSignalAt: IsoDateTime;
    debounceUntilMs: number;
  }>;
  reminders: Reminder[];
  signalsSeen: number;
  turnsRun: number;
  startedAt: IsoDateTime;
  lastDecisionAt?: IsoDateTime;
}

export interface AgentConversationWorkflowInput {
  conversation: AgentConversationRef;
  rehydrate?: PackedAgentConversationState;
  debounceMsByPlatform?: Partial<Record<Platform, number>>;
  continueAsNewAfterSignals?: number;
  continueAsNewAfterMs?: number;
}

interface State {
  conversation: AgentConversationRef;
  participants: Map<ParticipantId, ParticipantSummary>;
  threads: Map<ThreadKey, ThreadInbox>;
  reminders: Reminder[];
  inFlightAgentTurn: boolean;
  lastDecisionAt?: IsoDateTime;
  signalsSeen: number;
  turnsRun: number;
  startedAt: IsoDateTime;
  stopRequested: boolean;
  /**
   * Set to true whenever a signal/command/update mutates state in a way that
   * could change the next deadline. The main loop checks this in its
   * condition() predicate so it can bail out of a long sleep, recompute the
   * deadline, and start a fresh shorter timer for the freshly-arrived debounce.
   */
  wakeRequested: boolean;
  debounceMs: number;
  continueAsNewAfterSignals: number;
  continueAsNewAfterMs: number;
}

export const messageSignal = defineSignal<[MessageSignal]>("parlar.agent.messageSignal");
export const closeAgentConversationSignal = defineSignal<[]>("parlar.agent.closeConversation");

export const getAgentStateQuery = defineQuery<AgentConversationStateView>(
  "parlar.agent.getState",
);
export const getAgentPendingQuery = defineQuery<AgentConversationPendingView>(
  "parlar.agent.getPending",
);

export const snoozeAgentRemindersUpdate = defineUpdate<
  { affected: number },
  [{ until: IsoDateTime }]
>("parlar.agent.snoozeReminders");
export const resolveAgentConversationUpdate = defineUpdate<void, []>(
  "parlar.agent.resolveConversation",
);
export const forceAgentFollowUpUpdate = defineUpdate<void, [{ threadKey: ThreadKey }]>(
  "parlar.agent.forceFollowUp",
);
export const cancelAgentReminderUpdate = defineUpdate<void, [{ reminderId: ReminderId }]>(
  "parlar.agent.cancelReminder",
);

const activities = proxyActivities<AgentActivities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "1 minute",
    maximumAttempts: 3,
  },
});

export async function agentConversationWorkflow(
  input: AgentConversationWorkflowInput,
): Promise<void> {
  const state = createState(input);
  const workflowId = workflowInfo().workflowId;

  setHandler(messageSignal, (sig) => {
    onMessageSignal(state, sig);
  });

  setHandler(closeAgentConversationSignal, () => {
    state.stopRequested = true;
  });

  setHandler(getAgentStateQuery, () => projectStateView(state));
  setHandler(getAgentPendingQuery, () => ({
    reminders: [...state.reminders],
    readyThreads: collectReadyThreadKeys(state),
  }));

  setHandler(snoozeAgentRemindersUpdate, ({ until }) => {
    const untilMs = Date.parse(until);
    let affected = 0;
    for (const reminder of state.reminders) {
      if (Date.parse(reminder.fireAt) < untilMs) {
        reminder.fireAt = until;
        affected += 1;
      }
    }
    return { affected };
  });

  setHandler(resolveAgentConversationUpdate, () => {
    state.stopRequested = true;
  });

  setHandler(forceAgentFollowUpUpdate, ({ threadKey }) => {
    const inbox = state.threads.get(threadKey);
    if (inbox) {
      inbox.debounceUntilMs = Date.now() - 1;
    }
  });

  setHandler(cancelAgentReminderUpdate, ({ reminderId }) => {
    state.reminders = state.reminders.filter((r) => r.id !== reminderId);
  });

  while (!state.stopRequested) {
    state.wakeRequested = false;
    const nextDeadlineMs = computeNextDeadlineMs(state);
    const rawWaitMs = nextDeadlineMs - Date.now();
    // Avoid scheduling sub-second timers: each timer is two events in workflow
    // history, so coalescing tiny waits into a 1s minimum keeps history lean
    // without hurting responsiveness (signals interrupt via condition anyway).
    const waitMs = rawWaitMs <= 0 ? 0 : Math.max(rawWaitMs, 1_000);

    if (waitMs > 0) {
      await Promise.race([
        condition(
          () => state.stopRequested || hasImmediateWork(state) || state.wakeRequested,
        ),
        sleep(waitMs),
      ]);
    }

    if (state.stopRequested) break;

    const work = collectReadyWork(state);
    if (work.length === 0) continue;

    state.turnsRun += 1;
    const turnId = `${workflowId}#${state.turnsRun}`;

    state.inFlightAgentTurn = true;
    let result: AgentTurnResult;
    try {
      result = await activities.decideNextAction({
        workflowId,
        turnId,
        conversation: state.conversation,
        participants: [...state.participants.values()],
        work,
        pendingReminders: [...state.reminders],
        ...(state.lastDecisionAt === undefined ? {} : { lastDecisionAt: state.lastDecisionAt }),
      });
    } finally {
      state.inFlightAgentTurn = false;
    }

    applyTurnResult(state, result);
    autoClearProcessedSignals(state, work);
    state.lastDecisionAt = nowIso();

    if (result.stop) {
      state.stopRequested = true;
      break;
    }

    if (shouldContinueAsNew(state)) {
      await continueAsNew<typeof agentConversationWorkflow>({
        conversation: state.conversation,
        rehydrate: packState(state),
        debounceMsByPlatform: { [state.conversation.platform]: state.debounceMs } as Partial<
          Record<Platform, number>
        >,
        continueAsNewAfterSignals: state.continueAsNewAfterSignals,
        continueAsNewAfterMs: state.continueAsNewAfterMs,
      });
    }
  }
}

function createState(input: AgentConversationWorkflowInput): State {
  const debounceMs =
    input.debounceMsByPlatform?.[input.conversation.platform] ??
    DEBOUNCE_MS_BY_PLATFORM[input.conversation.platform];

  if (input.rehydrate) {
    const r = input.rehydrate;
    return {
      conversation: r.conversation,
      participants: new Map(r.participants.map((p) => [p.id, p])),
      threads: new Map(
        r.threads.map((t) => [
          t.threadKey,
          {
            threadKey: t.threadKey,
            pendingSignals: [...t.pendingSignals],
            lastSignalAt: t.lastSignalAt,
            debounceUntilMs: t.debounceUntilMs,
          },
        ]),
      ),
      reminders: [...r.reminders],
      inFlightAgentTurn: false,
      ...(r.lastDecisionAt === undefined ? {} : { lastDecisionAt: r.lastDecisionAt }),
      signalsSeen: r.signalsSeen,
      turnsRun: r.turnsRun,
      startedAt: r.startedAt,
      stopRequested: false,
      wakeRequested: false,
      debounceMs,
      continueAsNewAfterSignals:
        input.continueAsNewAfterSignals ?? CONTINUE_AS_NEW_LIMITS.signalsSeen,
      continueAsNewAfterMs: input.continueAsNewAfterMs ?? CONTINUE_AS_NEW_LIMITS.ageMs,
    };
  }

  return {
    conversation: input.conversation,
    participants: new Map(),
    threads: new Map(),
    reminders: [],
    inFlightAgentTurn: false,
    signalsSeen: 0,
    turnsRun: 0,
    startedAt: nowIso(),
    stopRequested: false,
    wakeRequested: false,
    debounceMs,
    continueAsNewAfterSignals:
      input.continueAsNewAfterSignals ?? CONTINUE_AS_NEW_LIMITS.signalsSeen,
    continueAsNewAfterMs: input.continueAsNewAfterMs ?? CONTINUE_AS_NEW_LIMITS.ageMs,
  };
}

function onMessageSignal(state: State, sig: MessageSignal): void {
  state.signalsSeen += 1;

  if (!state.participants.has(sig.authorId)) {
    state.participants.set(sig.authorId, {
      id: sig.authorId,
      platformUserId: sig.authorPlatformUserId,
      displayName: sig.authorDisplayName ?? sig.authorPlatformUserId,
      isAgent: sig.isFromAgent,
    });
  }

  if (sig.isFromAgent) {
    return;
  }

  state.wakeRequested = true;

  const inbox = state.threads.get(sig.threadKey) ?? {
    threadKey: sig.threadKey,
    pendingSignals: [],
    lastSignalAt: sig.at,
    debounceUntilMs: 0,
  };

  const pending: PendingSignal = {
    signalId: sig.signalId,
    kind: sig.kind,
    at: sig.at,
    authorId: sig.authorId,
    ...(sig.text === undefined ? {} : { text: sig.text }),
    ...(sig.mentionedParticipantIds === undefined
      ? {}
      : { mentionedParticipantIds: sig.mentionedParticipantIds }),
    ...(sig.permalink === undefined ? {} : { permalink: sig.permalink }),
  };

  inbox.pendingSignals.push(pending);
  inbox.lastSignalAt = sig.at;
  inbox.debounceUntilMs = Date.now() + state.debounceMs;
  state.threads.set(sig.threadKey, inbox);
}

function computeNextDeadlineMs(state: State): number {
  let next = Number.POSITIVE_INFINITY;
  for (const inbox of state.threads.values()) {
    if (inbox.pendingSignals.length === 0) continue;
    if (inbox.debounceUntilMs < next) next = inbox.debounceUntilMs;
  }
  for (const reminder of state.reminders) {
    const ms = Date.parse(reminder.fireAt);
    if (Number.isFinite(ms) && ms < next) next = ms;
  }
  if (!Number.isFinite(next)) {
    return Date.now() + 24 * 60 * 60 * 1_000;
  }
  return next;
}

function hasImmediateWork(state: State): boolean {
  const now = Date.now();
  for (const inbox of state.threads.values()) {
    if (inbox.pendingSignals.length > 0 && inbox.debounceUntilMs <= now) {
      return true;
    }
  }
  for (const reminder of state.reminders) {
    if (Date.parse(reminder.fireAt) <= now) return true;
  }
  return false;
}

function collectReadyThreadKeys(state: State): ThreadKey[] {
  const now = Date.now();
  const ready: ThreadKey[] = [];
  for (const inbox of state.threads.values()) {
    if (inbox.pendingSignals.length > 0 && inbox.debounceUntilMs <= now) {
      ready.push(inbox.threadKey);
    }
  }
  return ready;
}

function collectReadyWork(state: State): Array<{
  threadKey: ThreadKey;
  signals: PendingSignal[];
  dueReminderIds: ReminderId[];
}> {
  const now = Date.now();
  const byThread = new Map<
    ThreadKey,
    { threadKey: ThreadKey; signals: PendingSignal[]; dueReminderIds: ReminderId[] }
  >();

  for (const inbox of state.threads.values()) {
    if (inbox.pendingSignals.length > 0 && inbox.debounceUntilMs <= now) {
      byThread.set(inbox.threadKey, {
        threadKey: inbox.threadKey,
        signals: [...inbox.pendingSignals],
        dueReminderIds: [],
      });
    }
  }

  for (const reminder of state.reminders) {
    if (Date.parse(reminder.fireAt) > now) continue;
    const entry = byThread.get(reminder.threadKey) ?? {
      threadKey: reminder.threadKey,
      signals: [],
      dueReminderIds: [],
    };
    entry.dueReminderIds.push(reminder.id);
    byThread.set(reminder.threadKey, entry);
  }

  return [...byThread.values()];
}

function applyTurnResult(state: State, result: AgentTurnResult): void {
  for (const id of result.cancelReminderIds) {
    state.reminders = state.reminders.filter((r) => r.id !== id);
  }
  for (const reminder of result.setReminders) {
    const existingIdx = state.reminders.findIndex((r) => r.id === reminder.id);
    if (existingIdx >= 0) {
      state.reminders[existingIdx] = reminder;
    } else {
      state.reminders.push(reminder);
    }
  }
}

function autoClearProcessedSignals(
  state: State,
  work: Array<{ threadKey: ThreadKey; signals: PendingSignal[]; dueReminderIds: ReminderId[] }>,
): void {
  for (const item of work) {
    const inbox = state.threads.get(item.threadKey);
    if (!inbox) continue;
    const drop = new Set(item.signals.map((s) => s.signalId));
    inbox.pendingSignals = inbox.pendingSignals.filter((s) => !drop.has(s.signalId));
    if (inbox.pendingSignals.length === 0) {
      inbox.debounceUntilMs = 0;
    }
    for (const reminderId of item.dueReminderIds) {
      state.reminders = state.reminders.filter((r) => r.id !== reminderId);
    }
  }
}

function shouldContinueAsNew(state: State): boolean {
  if (state.signalsSeen >= state.continueAsNewAfterSignals) return true;
  if (Date.now() - Date.parse(state.startedAt) >= state.continueAsNewAfterMs) return true;
  return false;
}

function packState(state: State): PackedAgentConversationState {
  return {
    conversation: state.conversation,
    participants: [...state.participants.values()],
    threads: [...state.threads.values()].map((t) => ({
      threadKey: t.threadKey,
      pendingSignals: [...t.pendingSignals],
      lastSignalAt: t.lastSignalAt,
      debounceUntilMs: t.debounceUntilMs,
    })),
    reminders: [...state.reminders],
    signalsSeen: state.signalsSeen,
    turnsRun: state.turnsRun,
    startedAt: state.startedAt,
    ...(state.lastDecisionAt === undefined ? {} : { lastDecisionAt: state.lastDecisionAt }),
  };
}

function projectStateView(state: State): AgentConversationStateView {
  return {
    conversation: state.conversation,
    workflowId: workflowInfo().workflowId,
    participants: [...state.participants.values()],
    threads: [...state.threads.values()].map((t) => ({
      threadKey: t.threadKey,
      pendingSignals: [...t.pendingSignals],
      lastSignalAt: t.lastSignalAt,
      debounceUntil: new Date(t.debounceUntilMs).toISOString(),
    })),
    reminders: [...state.reminders],
    inFlightAgentTurn: state.inFlightAgentTurn,
    ...(state.lastDecisionAt === undefined ? {} : { lastDecisionAt: state.lastDecisionAt }),
    signalsSeen: state.signalsSeen,
    turnsRun: state.turnsRun,
    startedAt: state.startedAt,
    stopRequested: state.stopRequested,
  };
}

function nowIso(): IsoDateTime {
  return new Date(Date.now()).toISOString();
}
