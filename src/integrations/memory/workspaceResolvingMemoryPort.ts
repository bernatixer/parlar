import type { WorkspaceMemoryPort } from "../../tools/ports.js";
import type { MemoryRepository } from "./memoryRepository.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkspaceResolvingMemoryPortOptions {
  inner: WorkspaceMemoryPort;
  repository: MemoryRepository;
}

/**
 * Wraps a WorkspaceMemoryPort so callers can pass either the workspace UUID
 * or the Slack team id (e.g. "T_LIVE") as `workspaceId`. Slack team ids are
 * upserted into `workspaces` on first use and cached in-memory for the
 * lifetime of the wrapper.
 */
export function createWorkspaceResolvingMemoryPort(
  options: WorkspaceResolvingMemoryPortOptions,
): WorkspaceMemoryPort {
  const { inner, repository } = options;
  const cache = new Map<string, string>();

  async function resolveWorkspaceId(raw: string): Promise<string> {
    if (UUID_RE.test(raw)) return raw;
    const cached = cache.get(raw);
    if (cached !== undefined) return cached;
    const row = await repository.upsertWorkspaceBySlackTeamId({
      slackTeamId: raw,
    });
    cache.set(raw, row.id);
    return row.id;
  }

  return {
    async getWorkspacePreferences(input) {
      const workspaceId = await resolveWorkspaceId(input.workspaceId);
      return inner.getWorkspacePreferences({ ...input, workspaceId });
    },
    async getPersonContext(input) {
      const workspaceId = await resolveWorkspaceId(input.workspaceId);
      return inner.getPersonContext({ ...input, workspaceId });
    },
    async recordConversationDecision(input) {
      const workspaceId = await resolveWorkspaceId(input.conversation.workspaceId);
      return inner.recordConversationDecision({
        ...input,
        conversation: { ...input.conversation, workspaceId },
      });
    },
    async getRelatedConversationMemory(input) {
      const workspaceId = await resolveWorkspaceId(input.conversation.workspaceId);
      return inner.getRelatedConversationMemory({
        ...input,
        conversation: { ...input.conversation, workspaceId },
      });
    },
    async recordConversationSummary(input) {
      const workspaceId = await resolveWorkspaceId(input.conversation.workspaceId);
      return inner.recordConversationSummary({
        ...input,
        conversation: { ...input.conversation, workspaceId },
      });
    },
  };
}
