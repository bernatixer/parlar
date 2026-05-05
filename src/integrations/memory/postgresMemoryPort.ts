import type { PrismaClient } from "@prisma/client";
import type {
  ConversationRef,
  JsonValue,
  SlackChannelId,
  SlackUserId,
} from "../../domain/types.js";
import type {
  MemoryOwnerInput,
  WorkspaceMemoryPort,
} from "../../tools/ports.js";
import type { MemoryEmbedder } from "./embedder.js";
import {
  createMemoryRepository,
  type MemoryRepository,
} from "./memoryRepository.js";

export interface PostgresMemoryPortOptions {
  prisma: PrismaClient;
  embedder: MemoryEmbedder;
  defaultRecallLimit?: number;
}

export interface PostgresMemoryPort extends WorkspaceMemoryPort {
  readonly repository: MemoryRepository;
}

const DEFAULT_RECALL_LIMIT = 8;

export function createPostgresMemoryPort(
  options: PostgresMemoryPortOptions,
): PostgresMemoryPort {
  const repository = createMemoryRepository(options.prisma);
  const embedder = options.embedder;
  const defaultRecallLimit = options.defaultRecallLimit ?? DEFAULT_RECALL_LIMIT;

  return {
    repository,

    async getWorkspacePreferences() {
      return {} satisfies JsonValue;
    },

    async getPersonContext() {
      return {} satisfies JsonValue;
    },

    async recordConversationDecision(input) {
      const owners =
        input.owners && input.owners.length > 0
          ? input.owners
          : ([{ kind: "workspace" }] as MemoryOwnerInput[]);

      const tags = Array.from(
        new Set(["decision", input.decisionType, ...(input.tags ?? [])]),
      );

      const content = formatDecisionContent(input);
      const embedding = await embedder.embed(content);

      const sourceRef = buildSourceRef(input.conversation, {
        decisionType: input.decisionType,
        metadata: input.metadata ?? null,
      });

      const result = await repository.insertMemory({
        workspaceId: input.conversation.workspaceId,
        content,
        tags,
        sourceRef,
        embedding,
        dedupeKey: input.idempotencyKey,
        owners,
      });

      return { decisionId: result.id, deduplicated: !result.created };
    },

    async getRelatedConversationMemory(input) {
      const embedding = await embedder.embed(input.query);
      const limit = input.limit ?? defaultRecallLimit;
      const tags = input.tags ?? [];
      const viewerSlackUserIds = input.viewerSlackUserIds ?? [];

      const rows = await repository.findRelated({
        workspaceId: input.conversation.workspaceId,
        viewerSlackUserIds,
        embedding,
        tags,
        limit,
      });

      const memories: JsonValue[] = rows.map((row) => ({
        id: row.id,
        content: row.content,
        tags: row.tags,
        sourceRef: row.sourceRef ?? null,
        createdAt: row.createdAt.toISOString(),
        distance: row.distance,
      }));

      return { memories };
    },

    async recordConversationSummary(input) {
      const owners =
        input.owners && input.owners.length > 0
          ? input.owners
          : inferDefaultOwners(input.conversation, input.summary.participants);

      const tags = Array.from(
        new Set(["summary", ...(input.tags ?? [])]),
      );

      const content = input.contentOverride ?? input.summary.summary;
      const embedding = await embedder.embed(content);

      const sourceRef = buildSourceRef(input.conversation, {
        kind: "summary",
        participants: input.summary.participants,
        openQuestions: input.summary.openQuestions,
        actionItems: input.summary.actionItems as unknown as JsonValue,
        lastUpdatedAt: input.summary.lastUpdatedAt,
      });

      const result = await repository.insertMemory({
        workspaceId: input.conversation.workspaceId,
        content,
        tags,
        sourceRef,
        embedding,
        dedupeKey: input.idempotencyKey,
        owners,
      });

      return { summaryId: result.id, deduplicated: !result.created };
    },
  };
}

function inferDefaultOwners(
  conversation: ConversationRef,
  participants: SlackUserId[],
): MemoryOwnerInput[] {
  const kind = classifyChannel(conversation.channelId);

  // Broadcast/channel surfaces and missing channel context default to
  // workspace-global. DM and group-thread surfaces default to per-human
  // owners drawn from the conversation participants.
  if (
    kind === "channel" ||
    kind === "workspace" ||
    participants.length === 0
  ) {
    return [{ kind: "workspace" }];
  }

  return participants.map((slackUserId) => ({
    kind: "human" as const,
    slackUserId,
  }));
}

type ChannelKind = "dm" | "group" | "channel" | "workspace";

function classifyChannel(channelId: SlackChannelId | undefined): ChannelKind {
  if (channelId === undefined || channelId.length === 0) return "workspace";
  const prefix = channelId[0];
  if (prefix === "D") return "dm";
  if (prefix === "G") return "group";
  if (prefix === "C") return "channel";
  return "workspace";
}

function buildSourceRef(
  conversation: ConversationRef,
  extras: Record<string, JsonValue>,
): JsonValue {
  const ref: Record<string, JsonValue> = {
    conversationId: conversation.conversationId,
    workspaceId: conversation.workspaceId,
    ...extras,
  };
  if (conversation.channelId !== undefined) {
    ref.channelId = conversation.channelId;
  }
  if (conversation.threadTs !== undefined) {
    ref.threadTs = conversation.threadTs;
  }
  return ref;
}

function formatDecisionContent(input: {
  decisionType: string;
  reason: string;
}): string {
  return `Decision: ${input.decisionType}\nReason: ${input.reason}`;
}
