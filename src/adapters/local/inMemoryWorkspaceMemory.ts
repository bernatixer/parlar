import type { ConversationRef, ConversationSummary, JsonValue } from "../../domain/types.js";
import type { WorkspaceMemoryPort } from "../../tools/ports.js";
import { scopedKey, stableConversationKey } from "./helpers.js";

export interface InMemoryWorkspaceMemoryOptions {
  workspacePreferences?: Record<string, JsonValue>;
  personContext?: Record<string, JsonValue>;
}

export class InMemoryWorkspaceMemoryPort implements WorkspaceMemoryPort {
  private readonly workspacePreferences = new Map<string, JsonValue>();
  private readonly personContext = new Map<string, JsonValue>();
  private readonly decisionsByIdempotencyKey = new Map<string, { decisionId: string; deduplicated: boolean }>();
  private readonly summariesByIdempotencyKey = new Map<string, { summaryId: string; deduplicated: boolean }>();
  private readonly memories: JsonValue[] = [];
  private decisionSequence = 1;
  private summarySequence = 1;

  constructor(options: InMemoryWorkspaceMemoryOptions = {}) {
    for (const [workspaceId, preferences] of Object.entries(options.workspacePreferences ?? {})) {
      this.workspacePreferences.set(workspaceId, preferences);
    }
    for (const [key, context] of Object.entries(options.personContext ?? {})) {
      this.personContext.set(key, context);
    }
  }

  async getWorkspacePreferences(input: { workspaceId: string }): Promise<JsonValue> {
    return this.workspacePreferences.get(input.workspaceId) ?? {
      tone: "concise",
      quietHours: { enabled: true },
      followUpDelayHours: 24,
    };
  }

  async getPersonContext(input: { workspaceId: string; userId: string }): Promise<JsonValue> {
    return this.personContext.get(scopedKey(input.workspaceId, input.userId)) ?? {
      userId: input.userId,
      reminderPreference: "normal",
    };
  }

  async recordConversationDecision(input: {
    conversation: ConversationRef;
    decisionType: string;
    reason: string;
    metadata?: JsonValue;
    idempotencyKey: string;
  }): Promise<{ decisionId: string; deduplicated: boolean }> {
    const existing = this.decisionsByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, deduplicated: true };
    }

    const decisionId = `decision-${this.decisionSequence++}`;
    this.decisionsByIdempotencyKey.set(input.idempotencyKey, { decisionId, deduplicated: false });
    this.memories.push({
      type: "decision",
      decisionId,
      conversationKey: stableConversationKey(input.conversation),
      decisionType: input.decisionType,
      reason: input.reason,
      metadata: input.metadata ?? null,
    });
    return { decisionId, deduplicated: false };
  }

  async getRelatedConversationMemory(input: {
    conversation: ConversationRef;
    query: string;
    limit?: number;
  }): Promise<{ memories: JsonValue[] }> {
    const conversationKey = stableConversationKey(input.conversation);
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = this.memories.filter((memory) => {
      const text = JSON.stringify(memory).toLowerCase();
      return text.includes(conversationKey.toLowerCase()) || terms.some((term) => text.includes(term));
    });
    return { memories: matches.slice(-(input.limit ?? 10)) };
  }

  async recordConversationSummary(input: {
    conversation: ConversationRef;
    summary: ConversationSummary;
    idempotencyKey: string;
  }): Promise<{ summaryId: string; deduplicated: boolean }> {
    const existing = this.summariesByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, deduplicated: true };
    }

    const summaryId = `summary-${this.summarySequence++}`;
    this.summariesByIdempotencyKey.set(input.idempotencyKey, { summaryId, deduplicated: false });
    this.memories.push({
      type: "summary",
      summaryId,
      conversationKey: stableConversationKey(input.conversation),
      summary: input.summary as unknown as JsonValue,
    });
    return { summaryId, deduplicated: false };
  }
}
