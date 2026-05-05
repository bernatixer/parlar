import type { AgentConversationRef } from "../domain/agent.js";

export function agentConversationWorkflowId(conversation: AgentConversationRef): string {
  return `parlar:${conversation.workspaceId}:${conversation.platform}:${conversation.conversationId}`;
}

export const PARLAR_TASK_QUEUE = "main";
