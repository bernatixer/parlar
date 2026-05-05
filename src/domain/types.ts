export type IsoDateTime = string;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type WorkspaceId = string;
export type ConversationId = string;
export type SlackChannelId = string;
export type SlackThreadTs = string;
export type SlackUserId = string;

export interface SlackMessage {
  workspaceId: WorkspaceId;
  channelId: SlackChannelId;
  messageTs: string;
  threadTs?: SlackThreadTs;
  senderUserId: SlackUserId;
  text: string;
  occurredAt: IsoDateTime;
  permalink?: string;
}

export interface ConversationRef {
  workspaceId: WorkspaceId;
  conversationId: ConversationId;
  channelId?: SlackChannelId;
  threadTs?: SlackThreadTs;
}

export type ConversationStatus =
  | "open"
  | "waiting"
  | "resolved"
  | "blocked"
  | "stale"
  | "informational"
  | "needs_human_attention";

export interface ConversationSummary {
  summary: string;
  openQuestions: string[];
  actionItems: ActionItem[];
  participants: SlackUserId[];
  lastUpdatedAt: IsoDateTime;
}

export interface ActionItem {
  id?: string;
  description: string;
  ownerUserId?: SlackUserId;
  dueAt?: IsoDateTime;
  confidence: number;
}

export interface FollowUpPlan {
  id: string;
  targetUserIds: SlackUserId[];
  sendAt: IsoDateTime;
  reason: string;
  messageDraft?: string;
}

export interface SlackMessageBlock {
  type: string;
  [key: string]: JsonValue;
}

export type AllowedAction =
  | "send_message"
  | "draft_message"
  | "schedule_follow_up"
  | "cancel_follow_up"
  | "record_summary"
  | "no_op";

export type AiWorkTask =
  | "recheck_conversation"
  | "decide_follow_up"
  | "summarize_if_stale"
  | "check_for_reply"
  | "escalation_review"
  | "custom";

export interface ScheduledAiWork {
  scheduledWorkId: string;
  workflowId: string;
  runAt: IsoDateTime;
  task: AiWorkTask;
  reason: string;
}

export interface ToolExecutionContext {
  requestId: string;
  actor: "workflow" | "human" | "system" | "test";
  workflowId?: string;
  idempotencyKey?: string;
  now?: IsoDateTime;
}
