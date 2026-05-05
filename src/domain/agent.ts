import type {
  ConversationId,
  IsoDateTime,
  WorkspaceId,
} from "./types.js";

export type Platform = "slack" | "gmail" | "whatsapp" | "telegram";

export type ConversationKind =
  | "dm"
  | "group_dm"
  | "channel"
  | "email_thread"
  | "chat";

export type ParticipantId = string;
export type ThreadKey = string;
export type SignalId = string;
export type ReminderId = string;
export type TurnId = string;

export interface AgentConversationRef {
  workspaceId: WorkspaceId;
  platform: Platform;
  conversationId: ConversationId;
  conversationKind: ConversationKind;
}

export interface ParticipantSummary {
  id: ParticipantId;
  platformUserId: string;
  displayName: string;
  isAgent: boolean;
  joinedAt?: IsoDateTime;
}

export type MessageSignalKind =
  | "message"
  | "reply"
  | "mention"
  | "reaction"
  | "edit"
  | "delete"
  | "membership_change"
  | "platform_specific";

export interface MessageSignal {
  platform: Platform;
  kind: MessageSignalKind;
  signalId: SignalId;
  threadKey: ThreadKey;
  at: IsoDateTime;
  authorId: ParticipantId;
  authorPlatformUserId: string;
  authorDisplayName?: string;
  isFromAgent: boolean;
  text?: string;
  mentionedParticipantIds?: ParticipantId[];
  permalink?: string;
}

export interface Reminder {
  id: ReminderId;
  threadKey: ThreadKey;
  fireAt: IsoDateTime;
  reasonId: string;
}

export interface AgentTurnResult {
  stop: boolean;
  setReminders: Reminder[];
  cancelReminderIds: ReminderId[];
  summary?: string;
}

export const DEBOUNCE_MS_BY_PLATFORM: Record<Platform, number> = {
  slack: 8_000,
  gmail: 0,
  whatsapp: 5_000,
  telegram: 5_000,
};

export const CONTINUE_AS_NEW_LIMITS = {
  signalsSeen: 5_000,
  ageMs: 14 * 24 * 60 * 60 * 1_000,
} as const;
