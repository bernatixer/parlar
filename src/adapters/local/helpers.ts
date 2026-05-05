import type { ConversationRef, IsoDateTime } from "../../domain/types.js";

export function scopedKey(...parts: readonly string[]): string {
  return parts.join(":");
}

export function stableConversationKey(conversation: ConversationRef): string {
  return scopedKey(
    conversation.workspaceId,
    conversation.conversationId ||
      `${conversation.channelId ?? "unknown-channel"}:${conversation.threadTs ?? "unknown-thread"}`,
  );
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString();
}

export function addHours(date: Date, hours: number): IsoDateTime {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function includesAny(value: string, words: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word));
}

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
