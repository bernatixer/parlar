import type {
  ActionItem,
  ConversationRef,
  ConversationStatus,
  ConversationSummary,
  FollowUpPlan,
  SlackMessage,
  SlackUserId,
} from "../../domain/types.js";
import type { ConversationIntelligencePort } from "../../tools/ports.js";
import { addHours, compactWhitespace, includesAny, stableConversationKey } from "./helpers.js";

const RESOLVED_WORDS = ["done", "resolved", "fixed", "shipped", "approved", "answered", "thanks", "thank you"];
const BLOCKED_WORDS = ["blocked", "stuck", "can't", "cannot", "waiting on", "need access"];
const ASK_WORDS = ["can you", "could you", "please", "review", "approve", "send", "share", "follow up", "need"];

export class HeuristicConversationIntelligencePort implements ConversationIntelligencePort {
  async classifyConversationState(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
  }): Promise<{ status: ConversationStatus; confidence: number; reason: string }> {
    const latest = latestMessage(input.messages);
    if (!latest) {
      return { status: "informational", confidence: 0.55, reason: "No messages are available." };
    }

    const latestText = latest.text.toLowerCase();
    if (includesAny(latestText, RESOLVED_WORDS)) {
      return { status: "resolved", confidence: 0.78, reason: "Latest message looks like a resolution or acknowledgement." };
    }
    if (includesAny(latestText, BLOCKED_WORDS)) {
      return { status: "blocked", confidence: 0.74, reason: "Conversation contains blocker language." };
    }
    if (isStale(latest)) {
      return { status: "stale", confidence: 0.72, reason: "No recent activity was detected." };
    }
    if (input.messages.some((message) => looksActionable(message.text))) {
      return { status: "waiting", confidence: 0.72, reason: "Conversation contains an unresolved ask or action item." };
    }
    if (mentionsUser(latest.text) || includesAny(latestText, ASK_WORDS) || latest.text.includes("?")) {
      return { status: "waiting", confidence: 0.76, reason: "Conversation appears to be waiting on a response or action." };
    }

    return { status: "open", confidence: 0.62, reason: "Conversation is active but not clearly resolved." };
  }

  async extractActionItems(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
  }): Promise<{ actionItems: ActionItem[] }> {
    const actionItems = input.messages.flatMap((message, index) => {
      if (!looksActionable(message.text)) {
        return [];
      }

      const mentioned = extractMentions(message.text);
      const ownerUserId = mentioned[0];
      const dueAt = inferDueAt(message.text, new Date(message.occurredAt));
      const actionItem: ActionItem = {
        id: `${input.conversation.conversationId || message.threadTs || message.messageTs}:action:${index + 1}`,
        description: compactWhitespace(stripSlackMentions(message.text)),
        ...(ownerUserId === undefined ? {} : { ownerUserId }),
        ...(dueAt === undefined ? {} : { dueAt }),
        confidence: ownerUserId ? 0.82 : 0.66,
      };
      return [actionItem];
    });

    return { actionItems };
  }

  async summarizeConversation(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
    maxWords?: number;
  }): Promise<ConversationSummary> {
    const actionItems = (await this.extractActionItems(input)).actionItems;
    const participants = [...new Set(input.messages.map((message) => message.senderUserId))];
    const openQuestions = input.messages
      .filter((message) => message.text.includes("?"))
      .map((message) => compactWhitespace(stripSlackMentions(message.text)))
      .slice(-5);
    const lastUpdatedAt = latestMessage(input.messages)?.occurredAt ?? new Date().toISOString();
    const summary = truncateWords(
      input.messages
        .slice(-6)
        .map((message) => `${message.senderUserId}: ${compactWhitespace(stripSlackMentions(message.text))}`)
        .join(" "),
      input.maxWords ?? 80,
    );

    return {
      summary: summary || "No conversation messages are available.",
      openQuestions,
      actionItems,
      participants,
      lastUpdatedAt,
    };
  }

  async detectFollowUpNeed(input: {
    conversation: ConversationRef;
    summary?: ConversationSummary;
    status?: ConversationStatus;
    actionItems?: ActionItem[];
  }): Promise<{
    needed: boolean;
    confidence: number;
    reason: string;
    plan?: FollowUpPlan;
  }> {
    if (input.status === "resolved" || input.status === "informational") {
      return { needed: false, confidence: 0.82, reason: `Conversation is ${input.status}.` };
    }

    const actionItems = input.actionItems ?? input.summary?.actionItems ?? [];
    const targetUserIds = [
      ...new Set(actionItems.map((item) => item.ownerUserId).filter((id): id is SlackUserId => Boolean(id))),
    ];
    const shouldFollowUp =
      input.status === "waiting" ||
      input.status === "stale" ||
      input.status === "blocked" ||
      actionItems.length > 0 ||
      Boolean(input.summary?.openQuestions.length);

    if (!shouldFollowUp) {
      return { needed: false, confidence: 0.67, reason: "No unresolved ask or stale state was detected." };
    }

    const sendAt = addHours(new Date(), input.status === "blocked" ? 4 : 24);
    const plan: FollowUpPlan = {
      id: `${stableConversationKey(input.conversation)}:follow-up:${sendAt}`,
      targetUserIds,
      sendAt,
      reason: actionItems[0]?.description ?? input.summary?.openQuestions[0] ?? "Conversation needs a follow-up.",
    };

    return {
      needed: true,
      confidence: targetUserIds.length > 0 ? 0.8 : 0.68,
      reason: "Conversation has unresolved work or is waiting on a response.",
      plan,
    };
  }

  async detectResolutionSignal(input: {
    newEvent: SlackMessage;
    pendingFollowUp?: FollowUpPlan;
  }): Promise<{
    resolved: boolean;
    superseded: boolean;
    reason: string;
  }> {
    const text = input.newEvent.text.toLowerCase();
    const resolved = includesAny(text, RESOLVED_WORDS);
    const superseded =
      resolved ||
      includesAny(text, ["never mind", "ignore", "cancel", "moved this", "handled offline"]) ||
      Boolean(input.pendingFollowUp && input.pendingFollowUp.targetUserIds.includes(input.newEvent.senderUserId));

    return {
      resolved,
      superseded,
      reason: resolved
        ? "New message looks like a resolution."
        : superseded
          ? "New message appears to supersede the pending follow-up."
          : "No resolution signal detected.",
    };
  }

  async draftFollowUpMessage(input: {
    targetUserIds: SlackUserId[];
    reason: string;
    tone?: string;
  }): Promise<{ text: string; confidence: number; rationale: string }> {
    const targets = input.targetUserIds.map((id) => `<@${id}>`).join(" ");
    const prefix = targets ? `${targets} ` : "";
    const concise = input.tone === "concise";
    const text = concise
      ? `${prefix}Quick follow-up: ${input.reason}`
      : `${prefix}Quick nudge on this: ${input.reason}`;

    return {
      text: compactWhitespace(text),
      confidence: input.targetUserIds.length > 0 ? 0.84 : 0.7,
      rationale: "Drafted from target users and follow-up reason.",
    };
  }
}

function latestMessage(messages: readonly SlackMessage[]): SlackMessage | undefined {
  return [...messages].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).at(-1);
}

function isStale(message: SlackMessage): boolean {
  return Date.now() - Date.parse(message.occurredAt) > 24 * 60 * 60 * 1000;
}

function mentionsUser(text: string): boolean {
  return extractMentions(text).length > 0;
}

function extractMentions(text: string): SlackUserId[] {
  return [...text.matchAll(/<@([A-Z0-9]+)>/g)].map((match) => match[1] ?? "").filter(Boolean);
}

function stripSlackMentions(text: string): string {
  return text.replace(/<@([A-Z0-9]+)>/g, "@$1");
}

function looksActionable(text: string): boolean {
  const lower = text.toLowerCase();
  return mentionsUser(text) || includesAny(lower, ASK_WORDS) || lower.includes("todo") || lower.includes("action item");
}

function inferDueAt(text: string, base: Date): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("tomorrow")) {
    return addHours(base, 24);
  }
  if (lower.includes("today")) {
    return addHours(base, 8);
  }
  if (lower.includes("next week")) {
    return addHours(base, 7 * 24);
  }
  return undefined;
}

function truncateWords(value: string, maxWords: number): string {
  const words = compactWhitespace(value).split(" ").filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}
