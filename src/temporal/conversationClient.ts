import type { Client } from "@temporalio/client";
import type { TemporalControlPort } from "../tools/ports.js";
import { conversationWorkflowId } from "./conversationIds.js";
import { PARLAR_CONVERSATION_TASK_QUEUE } from "./taskQueues.js";
import {
  cancelFollowUpUpdate,
  closeConversationSignal,
  conversationEventSignal,
  conversationWorkflow,
  getConversationStateQuery,
  scheduleAiWorkUpdate,
  scheduleFollowUpUpdate,
  snoozeFollowUpUpdate,
} from "../workflows/conversationWorkflow.js";

export interface ConversationTemporalPortOptions {
  client: Client;
  defaultTaskQueue?: string;
}

export function createConversationTemporalPort({
  client,
  defaultTaskQueue = PARLAR_CONVERSATION_TASK_QUEUE,
}: ConversationTemporalPortOptions): TemporalControlPort {
  return {
    async queryConversationWorkflow({ conversation }) {
      const handle = client.workflow.getHandle(conversationWorkflowId(conversation));
      return handle.query(getConversationStateQuery);
    },

    async signalConversationEvent({ conversation, event }) {
      const workflowId = conversationWorkflowId(conversation);
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(conversationEventSignal, event);
      return { workflowId, signaled: true };
    },

    async startOrSignalConversation({ conversation, event, taskQueue }) {
      const workflowId = conversationWorkflowId(conversation);
      await client.workflow.signalWithStart(conversationWorkflow, {
        workflowId,
        taskQueue: taskQueue || defaultTaskQueue,
        args: [{ conversation }],
        signal: conversationEventSignal,
        signalArgs: [event],
      });
      return { workflowId, signalWithStartRequested: true };
    },

    async closeConversationWorkflow({ conversation, reason }) {
      const workflowId = conversationWorkflowId(conversation);
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(closeConversationSignal, { reason });
      return { workflowId, closed: true };
    },

    async scheduleFollowUp({ conversation, followUp, idempotencyKey }) {
      const handle = client.workflow.getHandle(conversationWorkflowId(conversation));
      return handle.executeUpdate(scheduleFollowUpUpdate, {
        args: [{ followUp, idempotencyKey }],
      });
    },

    async cancelFollowUp({ conversation, followUpId, reason, idempotencyKey }) {
      const handle = client.workflow.getHandle(conversationWorkflowId(conversation));
      return handle.executeUpdate(cancelFollowUpUpdate, {
        args: [{ followUpId, reason, idempotencyKey }],
      });
    },

    async snoozeFollowUp({ conversation, followUpId, runAt, reason, idempotencyKey }) {
      const handle = client.workflow.getHandle(conversationWorkflowId(conversation));
      return handle.executeUpdate(snoozeFollowUpUpdate, {
        args: [{ followUpId, runAt, reason, idempotencyKey }],
      });
    },

    async scheduleAiWork({
      conversation,
      runAt,
      task,
      reason,
      context,
      allowedActions,
      requireHumanApproval,
      idempotencyKey,
    }) {
      const handle = client.workflow.getHandle(conversationWorkflowId(conversation));
      const command = {
        runAt,
        task,
        reason,
        ...(context === undefined ? {} : { context }),
        ...(allowedActions === undefined ? {} : { allowedActions }),
        ...(requireHumanApproval === undefined ? {} : { requireHumanApproval }),
        idempotencyKey,
      };
      return handle.executeUpdate(scheduleAiWorkUpdate, {
        args: [command],
      });
    },
  };
}
