import type { ConversationRef } from "../domain/types.js";

export function conversationWorkflowId(conversation: ConversationRef): string {
  if (conversation.conversationId.trim().length > 0) {
    return `parlar:${conversation.workspaceId}:${conversation.conversationId}`;
  }

  if (conversation.channelId && conversation.threadTs) {
    return `parlar:${conversation.workspaceId}:${conversation.channelId}:${conversation.threadTs}`;
  }

  throw new Error("conversationId or channelId + threadTs is required");
}
