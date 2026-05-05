import type {
  AiWorkTask,
  AllowedAction,
  ConversationRef,
  FollowUpPlan,
  IsoDateTime,
  JsonValue,
  ScheduledAiWork,
} from "../../domain/types.js";
import { conversationWorkflowId } from "../../temporal/conversationIds.js";
import type { TemporalControlPort } from "../../tools/ports.js";

interface LocalConversationWorkflowState {
  conversation: ConversationRef;
  workflowId: string;
  events: JsonValue[];
  followUps: Record<string, FollowUpPlan & { status: "scheduled" | "updated" | "cancelled" | "snoozed" }>;
  scheduledAiWork: Record<string, ScheduledAiWork & {
    status: "scheduled" | "updated" | "deduplicated";
    context?: JsonValue;
    allowedActions?: AllowedAction[];
    requireHumanApproval?: boolean;
  }>;
  closed?: { reason: string };
}

export class InMemoryTemporalControlPort implements TemporalControlPort {
  private readonly workflows = new Map<string, LocalConversationWorkflowState>();
  private readonly dedupe = new Map<string, string>();
  private aiWorkSequence = 1;

  async queryConversationWorkflow(input: { conversation: ConversationRef }): Promise<unknown> {
    return this.getOrCreate(input.conversation);
  }

  async signalConversationEvent(input: {
    conversation: ConversationRef;
    event: JsonValue;
  }): Promise<{ workflowId: string; signaled: true }> {
    const state = this.getOrCreate(input.conversation);
    state.events.push(input.event);
    return { workflowId: state.workflowId, signaled: true };
  }

  async startOrSignalConversation(input: {
    conversation: ConversationRef;
    event: JsonValue;
  }): Promise<{ workflowId: string; signalWithStartRequested: true }> {
    const state = this.getOrCreate(input.conversation);
    state.events.push(input.event);
    return { workflowId: state.workflowId, signalWithStartRequested: true };
  }

  async closeConversationWorkflow(input: {
    conversation: ConversationRef;
    reason: string;
  }): Promise<{ workflowId: string; closed: true }> {
    const state = this.getOrCreate(input.conversation);
    state.closed = { reason: input.reason };
    return { workflowId: state.workflowId, closed: true };
  }

  async scheduleFollowUp(input: {
    conversation: ConversationRef;
    followUp: FollowUpPlan;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; status: "scheduled" | "updated" | "deduplicated" }> {
    const dedupeKey = this.scopedDedupeKey(input.conversation, input.idempotencyKey);
    const existingDedupe = this.dedupe.get(dedupeKey);
    if (existingDedupe) {
      return { followUpId: existingDedupe, status: "deduplicated" };
    }

    const state = this.getOrCreate(input.conversation);
    const status = state.followUps[input.followUp.id] ? "updated" : "scheduled";
    state.followUps[input.followUp.id] = { ...input.followUp, status };
    this.dedupe.set(dedupeKey, input.followUp.id);
    return { followUpId: input.followUp.id, status };
  }

  async cancelFollowUp(input: {
    conversation: ConversationRef;
    followUpId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; status: "cancelled" | "deduplicated" }> {
    const dedupeKey = this.scopedDedupeKey(input.conversation, input.idempotencyKey);
    const existingDedupe = this.dedupe.get(dedupeKey);
    if (existingDedupe) {
      return { followUpId: existingDedupe, status: "deduplicated" };
    }

    const state = this.getOrCreate(input.conversation);
    const existing = state.followUps[input.followUpId];
    state.followUps[input.followUpId] = {
      ...(existing ?? {
        id: input.followUpId,
        targetUserIds: [],
        sendAt: new Date().toISOString(),
      }),
      reason: input.reason,
      status: "cancelled",
    };
    this.dedupe.set(dedupeKey, input.followUpId);
    return { followUpId: input.followUpId, status: "cancelled" };
  }

  async snoozeFollowUp(input: {
    conversation: ConversationRef;
    followUpId: string;
    runAt: IsoDateTime;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; runAt: IsoDateTime; status: "snoozed" | "deduplicated" }> {
    const dedupeKey = this.scopedDedupeKey(input.conversation, input.idempotencyKey);
    const existingDedupe = this.dedupe.get(dedupeKey);
    if (existingDedupe) {
      return { followUpId: existingDedupe, runAt: input.runAt, status: "deduplicated" };
    }

    const state = this.getOrCreate(input.conversation);
    const existing = state.followUps[input.followUpId];
    state.followUps[input.followUpId] = {
      ...(existing ?? {
        id: input.followUpId,
        targetUserIds: [],
      }),
      sendAt: input.runAt,
      reason: input.reason,
      status: "snoozed",
    };
    this.dedupe.set(dedupeKey, input.followUpId);
    return { followUpId: input.followUpId, runAt: input.runAt, status: "snoozed" };
  }

  async scheduleAiWork(input: {
    conversation: ConversationRef;
    runAt: IsoDateTime;
    task: AiWorkTask;
    reason: string;
    context?: JsonValue;
    allowedActions?: AllowedAction[];
    requireHumanApproval?: boolean;
    idempotencyKey: string;
  }): Promise<ScheduledAiWork & { status: "scheduled" | "updated" | "deduplicated" }> {
    const dedupeKey = this.scopedDedupeKey(input.conversation, input.idempotencyKey);
    const state = this.getOrCreate(input.conversation);
    const existingDedupe = this.dedupe.get(dedupeKey);
    if (existingDedupe) {
      const existing = state.scheduledAiWork[existingDedupe];
      if (existing) {
        return { ...existing, status: "deduplicated" };
      }
    }

    const scheduledWorkId = `ai-work-${this.aiWorkSequence++}`;
    const scheduled: ScheduledAiWork & {
      status: "scheduled";
      context?: JsonValue;
      allowedActions?: AllowedAction[];
      requireHumanApproval?: boolean;
    } = {
      scheduledWorkId,
      workflowId: state.workflowId,
      runAt: input.runAt,
      task: input.task,
      reason: input.reason,
      status: "scheduled",
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.allowedActions === undefined ? {} : { allowedActions: input.allowedActions }),
      ...(input.requireHumanApproval === undefined
        ? {}
        : { requireHumanApproval: input.requireHumanApproval }),
    };
    state.scheduledAiWork[scheduledWorkId] = scheduled;
    this.dedupe.set(dedupeKey, scheduledWorkId);
    return scheduled;
  }

  private getOrCreate(conversation: ConversationRef): LocalConversationWorkflowState {
    const workflowId = conversationWorkflowId(conversation);
    const existing = this.workflows.get(workflowId);
    if (existing) {
      return existing;
    }

    const state: LocalConversationWorkflowState = {
      conversation,
      workflowId,
      events: [],
      followUps: {},
      scheduledAiWork: {},
    };
    this.workflows.set(workflowId, state);
    return state;
  }

  private scopedDedupeKey(conversation: ConversationRef, idempotencyKey: string): string {
    return `${conversationWorkflowId(conversation)}:${idempotencyKey}`;
  }
}
