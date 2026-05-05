import type { Client } from "@temporalio/client";
import type {
  AgentConversationRef,
  MessageSignal,
  ReminderId,
  ThreadKey,
} from "../domain/agent.js";
import type { IsoDateTime } from "../domain/types.js";
import {
  agentConversationWorkflowId,
  PARLAR_TASK_QUEUE,
} from "./agentConversationIds.js";
import {
  agentConversationWorkflow,
  cancelAgentReminderUpdate,
  closeAgentConversationSignal,
  forceAgentFollowUpUpdate,
  getAgentPendingQuery,
  getAgentStateQuery,
  messageSignal,
  resolveAgentConversationUpdate,
  snoozeAgentRemindersUpdate,
  type AgentConversationPendingView,
  type AgentConversationStateView,
} from "../workflows/agentConversationWorkflow.js";

export interface AgentConversationClientOptions {
  client: Client;
  taskQueue?: string;
}

export interface SignalAgentMessageInput {
  conversation: AgentConversationRef;
  signal: MessageSignal;
}

export interface CloseConversationInput {
  conversation: AgentConversationRef;
}

export function createAgentConversationClient({
  client,
  taskQueue = PARLAR_TASK_QUEUE,
}: AgentConversationClientOptions) {
  return {
    async signalMessage({
      conversation,
      signal,
    }: SignalAgentMessageInput): Promise<{ workflowId: string }> {
      const workflowId = agentConversationWorkflowId(conversation);
      await client.workflow.signalWithStart(agentConversationWorkflow, {
        workflowId,
        taskQueue,
        args: [{ conversation }],
        signal: messageSignal,
        signalArgs: [signal],
      });
      return { workflowId };
    },

    async closeConversation({ conversation }: CloseConversationInput): Promise<void> {
      const workflowId = agentConversationWorkflowId(conversation);
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(closeAgentConversationSignal);
    },

    async getState(
      conversation: AgentConversationRef,
    ): Promise<AgentConversationStateView> {
      const workflowId = agentConversationWorkflowId(conversation);
      const handle = client.workflow.getHandle(workflowId);
      return handle.query(getAgentStateQuery);
    },

    async getPending(
      conversation: AgentConversationRef,
    ): Promise<AgentConversationPendingView> {
      const workflowId = agentConversationWorkflowId(conversation);
      const handle = client.workflow.getHandle(workflowId);
      return handle.query(getAgentPendingQuery);
    },

    async cancelReminder(
      conversation: AgentConversationRef,
      reminderId: ReminderId,
    ): Promise<void> {
      const handle = client.workflow.getHandle(agentConversationWorkflowId(conversation));
      await handle.executeUpdate(cancelAgentReminderUpdate, { args: [{ reminderId }] });
    },

    async snoozeReminders(
      conversation: AgentConversationRef,
      until: IsoDateTime,
    ): Promise<{ affected: number }> {
      const handle = client.workflow.getHandle(agentConversationWorkflowId(conversation));
      return handle.executeUpdate(snoozeAgentRemindersUpdate, { args: [{ until }] });
    },

    async forceFollowUp(
      conversation: AgentConversationRef,
      threadKey: ThreadKey,
    ): Promise<void> {
      const handle = client.workflow.getHandle(agentConversationWorkflowId(conversation));
      await handle.executeUpdate(forceAgentFollowUpUpdate, { args: [{ threadKey }] });
    },

    async resolveConversation(conversation: AgentConversationRef): Promise<void> {
      const handle = client.workflow.getHandle(agentConversationWorkflowId(conversation));
      await handle.executeUpdate(resolveAgentConversationUpdate);
    },
  };
}

export type AgentConversationClient = ReturnType<typeof createAgentConversationClient>;
