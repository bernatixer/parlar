import type {
  SlackMessageBlock,
  SlackMessage,
  SlackUserId,
} from "../../domain/types.js";
import type { SlackContextPort } from "../../tools/ports.js";
import { compactWhitespace, scopedKey, tokenize } from "./helpers.js";

export interface InMemorySlackChannel {
  workspaceId: string;
  channelId: string;
  name?: string;
  topic?: string;
  purpose?: string;
  memberIds?: SlackUserId[];
}

export interface InMemorySlackUser {
  workspaceId: string;
  userId: string;
  displayName?: string;
  realName?: string;
  timezone?: string;
  title?: string;
  isBot?: boolean;
}

export interface InMemorySlackOptions {
  channels?: readonly InMemorySlackChannel[];
  users?: readonly InMemorySlackUser[];
  messages?: readonly SlackMessage[];
  permalinkBaseUrl?: string;
}

export class InMemorySlackContextPort implements SlackContextPort {
  private readonly channels = new Map<string, InMemorySlackChannel>();
  private readonly users = new Map<string, InMemorySlackUser>();
  private readonly messages: SlackMessage[] = [];
  private readonly sentByIdempotencyKey = new Map<
    string,
    { messageTs: string; permalink?: string; deduplicated: boolean }
  >();
  private sequence = 1;

  constructor(private readonly options: InMemorySlackOptions = {}) {
    for (const channel of options.channels ?? []) {
      this.upsertChannel(channel);
    }
    for (const user of options.users ?? []) {
      this.upsertUser(user);
    }
    for (const message of options.messages ?? []) {
      this.addMessage(message);
    }
  }

  upsertChannel(channel: InMemorySlackChannel): void {
    this.channels.set(scopedKey(channel.workspaceId, channel.channelId), channel);
  }

  upsertUser(user: InMemorySlackUser): void {
    this.users.set(scopedKey(user.workspaceId, user.userId), user);
  }

  addMessage(message: SlackMessage): void {
    this.messages.push(message);
  }

  async getThread(input: {
    workspaceId: string;
    channelId: string;
    threadTs: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }> {
    const messages = this.messages
      .filter(
        (message) =>
          message.workspaceId === input.workspaceId &&
          message.channelId === input.channelId &&
          (message.threadTs === input.threadTs || message.messageTs === input.threadTs),
      )
      .sort(compareMessages);

    return { messages: applyLimit(messages, input.limit) };
  }

  async getChannelContext(input: {
    workspaceId: string;
    channelId: string;
    includeRecentMessages?: boolean;
  }): Promise<{
    channelId: string;
    name?: string;
    topic?: string;
    purpose?: string;
    memberCount?: number;
    recentMessages?: SlackMessage[];
  }> {
    const channel = this.channels.get(scopedKey(input.workspaceId, input.channelId));
    const recentMessages = this.messages
      .filter(
        (message) =>
          message.workspaceId === input.workspaceId && message.channelId === input.channelId,
      )
      .sort(compareMessages)
      .slice(-20);

    return {
      channelId: input.channelId,
      ...(channel?.name === undefined ? {} : { name: channel.name }),
      ...(channel?.topic === undefined ? {} : { topic: channel.topic }),
      ...(channel?.purpose === undefined ? {} : { purpose: channel.purpose }),
      memberCount: channel?.memberIds?.length ?? countUnique(recentMessages.map((m) => m.senderUserId)),
      ...(input.includeRecentMessages ? { recentMessages } : {}),
    };
  }

  async getUserProfile(input: {
    workspaceId: string;
    userId: string;
  }): Promise<{
    userId: string;
    displayName?: string;
    realName?: string;
    timezone?: string;
    title?: string;
    isBot: boolean;
  }> {
    const user = this.users.get(scopedKey(input.workspaceId, input.userId));
    return {
      userId: input.userId,
      ...(user?.displayName === undefined ? {} : { displayName: user.displayName }),
      ...(user?.realName === undefined ? {} : { realName: user.realName }),
      ...(user?.timezone === undefined ? {} : { timezone: user.timezone }),
      ...(user?.title === undefined ? {} : { title: user.title }),
      isBot: user?.isBot ?? input.userId.startsWith("B"),
    };
  }

  async searchMessages(input: {
    workspaceId: string;
    query: string;
    channelId?: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }> {
    const queryTokens = tokenize(input.query);
    const messages = this.messages
      .filter(
        (message) =>
          message.workspaceId === input.workspaceId &&
          (input.channelId === undefined || message.channelId === input.channelId) &&
          queryTokens.every((token) => message.text.toLowerCase().includes(token)),
      )
      .sort(compareMessages);

    return { messages: applyLimit(messages, input.limit) };
  }

  async sendMessage(input: {
    workspaceId: string;
    channelId: string;
    text: string;
    blocks?: SlackMessageBlock[];
    threadTs?: string;
    targetUserIds?: SlackUserId[];
    idempotencyKey: string;
  }): Promise<{ messageTs: string; permalink?: string; deduplicated: boolean }> {
    const existing = this.sentByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, deduplicated: true };
    }

    const messageTs = nextSlackTimestamp(this.sequence++);
    const text = compactWhitespace(input.text);
    const permalink = this.permalink(input.workspaceId, input.channelId, messageTs);
    const message: SlackMessage = {
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      messageTs,
      ...(input.threadTs === undefined ? {} : { threadTs: input.threadTs }),
      senderUserId: "BPARLAR",
      text,
      occurredAt: new Date().toISOString(),
      ...(permalink === undefined ? {} : { permalink }),
    };
    this.messages.push(message);

    const result = {
      messageTs,
      ...(message.permalink === undefined ? {} : { permalink: message.permalink }),
      deduplicated: false,
    };
    this.sentByIdempotencyKey.set(input.idempotencyKey, result);
    return result;
  }

  snapshotMessages(): SlackMessage[] {
    return [...this.messages].sort(compareMessages);
  }

  private permalink(workspaceId: string, channelId: string, messageTs: string): string | undefined {
    if (!this.options.permalinkBaseUrl) {
      return undefined;
    }
    return `${this.options.permalinkBaseUrl}/${workspaceId}/${channelId}/${messageTs}`;
  }
}

function compareMessages(a: SlackMessage, b: SlackMessage): number {
  return Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.messageTs.localeCompare(b.messageTs);
}

function applyLimit<T>(items: readonly T[], limit: number | undefined): T[] {
  if (limit === undefined) {
    return [...items];
  }
  return items.slice(Math.max(0, items.length - limit));
}

function countUnique(values: readonly string[]): number {
  return new Set(values).size;
}

function nextSlackTimestamp(sequence: number): string {
  const millis = Date.now();
  return `${Math.floor(millis / 1000)}.${String(sequence).padStart(6, "0")}`;
}
