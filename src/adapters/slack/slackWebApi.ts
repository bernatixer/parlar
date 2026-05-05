import { WebClient } from "@slack/web-api";
import type { Block, KnownBlock } from "@slack/types";
import type { SlackMessage, SlackMessageBlock } from "../../domain/types.js";
import type { SlackContextPort } from "../../tools/ports.js";

type SlackBlock = KnownBlock | Block;

interface SlackWebApiClient {
  conversations: {
    replies(input: Record<string, unknown>): Promise<{ messages?: SlackApiMessage[] }>;
    info(input: Record<string, unknown>): Promise<{ channel?: unknown }>;
    members(input: Record<string, unknown>): Promise<{ members?: string[] }>;
    history(input: Record<string, unknown>): Promise<{ messages?: SlackApiMessage[] }>;
  };
  users: {
    info(input: Record<string, unknown>): Promise<{ user?: unknown }>;
  };
  search: {
    messages(input: Record<string, unknown>): Promise<{
      messages?: { matches?: Array<SlackApiMessage & { channel?: { id?: string } }> };
    }>;
  };
  chat: {
    postMessage(input: Record<string, unknown>): Promise<{
      ts?: string;
      message?: { permalink?: string };
    }>;
  };
}

interface SlackApiMessage {
  ts?: string;
  thread_ts?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  permalink?: string;
}

export interface SlackWebApiContextPortOptions {
  token?: string;
  client?: SlackWebApiClient;
  permalinkBaseUrl?: string;
}

export class SlackWebApiContextPort implements SlackContextPort {
  private readonly client: SlackWebApiClient;
  private readonly sentByIdempotencyKey = new Map<
    string,
    { messageTs: string; permalink?: string; deduplicated: boolean }
  >();

  constructor(private readonly options: SlackWebApiContextPortOptions = {}) {
    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new WebClient(options.token ?? process.env.SLACK_BOT_TOKEN) as unknown as SlackWebApiClient;
    }
  }

  async getThread(input: {
    workspaceId: string;
    channelId: string;
    threadTs: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }> {
    const response = await this.client.conversations.replies({
      channel: input.channelId,
      ts: input.threadTs,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });

    return {
      messages: (response.messages ?? []).map((message) =>
        toSlackMessage(input.workspaceId, input.channelId, message, input.threadTs),
      ),
    };
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
    const [info, members, history] = await Promise.all([
      this.client.conversations.info({ channel: input.channelId }),
      this.client.conversations.members({ channel: input.channelId, limit: 1000 }),
      input.includeRecentMessages
        ? this.client.conversations.history({ channel: input.channelId, limit: 20 })
        : Promise.resolve(undefined),
    ]);

    const channel = info.channel as
      | {
          name?: string;
          topic?: { value?: string };
          purpose?: { value?: string };
          num_members?: number;
        }
      | undefined;

    return {
      channelId: input.channelId,
      ...(channel?.name === undefined ? {} : { name: channel.name }),
      ...(channel?.topic?.value === undefined ? {} : { topic: channel.topic.value }),
      ...(channel?.purpose?.value === undefined ? {} : { purpose: channel.purpose.value }),
      memberCount: channel?.num_members ?? members.members?.length ?? 0,
      ...(history
        ? {
            recentMessages: (history.messages ?? []).map((message) =>
              toSlackMessage(input.workspaceId, input.channelId, message),
            ),
          }
        : {}),
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
    const response = await this.client.users.info({ user: input.userId });
    const user = response.user as
      | {
          id?: string;
          is_bot?: boolean;
          tz?: string;
          real_name?: string;
          profile?: {
            display_name?: string;
            real_name?: string;
            title?: string;
          };
        }
      | undefined;

    return {
      userId: user?.id ?? input.userId,
      ...(user?.profile?.display_name === undefined ? {} : { displayName: user.profile.display_name }),
      ...(user?.profile?.real_name ?? user?.real_name
        ? { realName: user?.profile?.real_name ?? user?.real_name }
        : {}),
      ...(user?.tz === undefined ? {} : { timezone: user.tz }),
      ...(user?.profile?.title === undefined ? {} : { title: user.profile.title }),
      isBot: user?.is_bot ?? false,
    };
  }

  async searchMessages(input: {
    workspaceId: string;
    query: string;
    channelId?: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }> {
    const query = input.channelId ? `${input.query} in:<#${input.channelId}>` : input.query;
    const response = await this.client.search.messages({
      query,
      count: input.limit ?? 20,
    });

    const matches = response.messages?.matches ?? [];
    return {
      messages: matches.map((match) => {
        const message: SlackApiMessage = {
          ...(match.ts === undefined ? {} : { ts: match.ts }),
          ...(match.text === undefined ? {} : { text: match.text }),
          ...(match.user === undefined ? {} : { user: match.user }),
          ...(match.permalink === undefined ? {} : { permalink: match.permalink }),
        };
        return toSlackMessage(input.workspaceId, match.channel?.id ?? input.channelId ?? "", message);
      }),
    };
  }

  async sendMessage(input: {
    workspaceId: string;
    channelId: string;
    text: string;
    blocks?: SlackMessageBlock[];
    threadTs?: string;
    idempotencyKey: string;
  }): Promise<{ messageTs: string; permalink?: string; deduplicated: boolean }> {
    const existing = this.sentByIdempotencyKey.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, deduplicated: true };
    }

    const response = await this.client.chat.postMessage({
      channel: input.channelId,
      text: input.text,
      ...(input.blocks === undefined ? {} : { blocks: input.blocks as SlackBlock[] }),
      ...(input.threadTs === undefined ? {} : { thread_ts: input.threadTs }),
      metadata: {
        event_type: "parlar_message",
        event_payload: {
          idempotency_key: input.idempotencyKey,
          workspace_id: input.workspaceId,
        },
      },
    });

    const messageTs = response.ts ?? "";
    const responsePermalink = response.message?.permalink;
    const fallbackPermalink = this.permalink(input.workspaceId, input.channelId, messageTs);
    const permalink = responsePermalink ?? fallbackPermalink;
    const result: { messageTs: string; permalink?: string; deduplicated: boolean } = {
      messageTs,
      deduplicated: false,
    };
    if (permalink) {
      result.permalink = permalink;
    }
    this.sentByIdempotencyKey.set(input.idempotencyKey, result);
    return result;
  }

  private permalink(workspaceId: string, channelId: string, messageTs: string): string | undefined {
    if (!this.options.permalinkBaseUrl || !messageTs) {
      return undefined;
    }
    return `${this.options.permalinkBaseUrl}/${workspaceId}/${channelId}/${messageTs}`;
  }
}

function toSlackMessage(
  workspaceId: string,
  channelId: string,
  message: SlackApiMessage,
  fallbackThreadTs?: string,
): SlackMessage {
  const messageTs = message.ts ?? "0.000000";
  return {
    workspaceId,
    channelId,
    messageTs,
    threadTs: message.thread_ts ?? fallbackThreadTs ?? messageTs,
    senderUserId: message.user ?? message.bot_id ?? "unknown",
    text: message.text ?? "",
    occurredAt: slackTimestampToIso(messageTs),
    ...(message.permalink === undefined ? {} : { permalink: message.permalink }),
  };
}

function slackTimestampToIso(ts: string): string {
  const seconds = Number(ts.split(".")[0] ?? "0");
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date(0).toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}
