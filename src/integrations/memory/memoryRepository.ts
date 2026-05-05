import { Prisma, type PrismaClient } from "@prisma/client";
import type { MemoryOwnerInput } from "../../tools/ports.js";
import type { JsonValue } from "../../domain/types.js";

export interface InsertMemoryInput {
  workspaceId: string;
  content: string;
  tags: string[];
  sourceRef: JsonValue | null;
  embedding: number[];
  dedupeKey: string | null;
  owners: MemoryOwnerInput[];
  grantedByHumanId?: string;
}

export interface InsertMemoryResult {
  id: string;
  created: boolean;
}

export interface FindRelatedInput {
  workspaceId: string;
  viewerSlackUserIds: string[];
  embedding: number[];
  tags: string[];
  limit: number;
}

export interface MemoryRow {
  id: string;
  workspaceId: string;
  content: string;
  tags: string[];
  sourceRef: JsonValue | null;
  createdAt: Date;
  distance: number;
}

export interface AddOwnerInput {
  memoryId: string;
  owner: MemoryOwnerInput;
  grantedByHumanId?: string;
}

export interface MemoryRepository {
  upsertWorkspaceBySlackTeamId(input: {
    slackTeamId: string;
    name?: string;
  }): Promise<{ id: string }>;
  upsertHumans(input: {
    workspaceId: string;
    slackUserIds: string[];
  }): Promise<Map<string, string>>;
  insertMemory(input: InsertMemoryInput): Promise<InsertMemoryResult>;
  findRelated(input: FindRelatedInput): Promise<MemoryRow[]>;
  addOwner(input: AddOwnerInput): Promise<void>;
  archive(memoryId: string): Promise<void>;
}

const toVectorLiteral = (v: number[]): string => `[${v.join(",")}]`;

export function createMemoryRepository(prisma: PrismaClient): MemoryRepository {
  return {
    async upsertWorkspaceBySlackTeamId({ slackTeamId, name }) {
      const row = await prisma.workspace.upsert({
        where: { slackTeamId },
        update: name === undefined ? {} : { name },
        create: { slackTeamId, ...(name === undefined ? {} : { name }) },
        select: { id: true },
      });
      return row;
    },

    async upsertHumans({ workspaceId, slackUserIds }) {
      const unique = Array.from(new Set(slackUserIds));
      if (unique.length === 0) return new Map();

      await prisma.$transaction(
        unique.map((slackUserId) =>
          prisma.human.upsert({
            where: {
              workspaceId_slackUserId: { workspaceId, slackUserId },
            },
            update: {},
            create: { workspaceId, slackUserId },
            select: { id: true },
          }),
        ),
      );

      const rows = await prisma.human.findMany({
        where: { workspaceId, slackUserId: { in: unique } },
        select: { id: true, slackUserId: true },
      });

      return new Map(rows.map((r) => [r.slackUserId, r.id]));
    },

    async insertMemory(input) {
      const {
        workspaceId,
        content,
        tags,
        sourceRef,
        embedding,
        dedupeKey,
        owners,
        grantedByHumanId,
      } = input;

      if (owners.length === 0) {
        throw new Error("insertMemory: owners must be non-empty");
      }

      const slackUserIds = owners.flatMap((o) =>
        o.kind === "human" ? [o.slackUserId] : [],
      );
      const humanIdBySlackUserId =
        slackUserIds.length === 0
          ? new Map<string, string>()
          : await this.upsertHumans({ workspaceId, slackUserIds });

      const ownerRows = owners.map((o) => {
        if (o.kind === "workspace") {
          return { kind: "workspace" as const, ownerId: workspaceId };
        }
        const humanId = humanIdBySlackUserId.get(o.slackUserId);
        if (humanId === undefined) {
          throw new Error(
            `insertMemory: failed to resolve humans.id for slackUserId=${o.slackUserId}`,
          );
        }
        return { kind: "human" as const, ownerId: humanId };
      });

      return prisma.$transaction(async (tx) => {
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO memories (workspace_id, content, tags, source_ref, embedding, dedupe_key)
          VALUES (
            ${workspaceId}::uuid,
            ${content},
            ${tags}::text[],
            ${sourceRef === null ? null : JSON.stringify(sourceRef)}::jsonb,
            ${toVectorLiteral(embedding)}::vector,
            ${dedupeKey}
          )
          ON CONFLICT (workspace_id, dedupe_key)
            WHERE dedupe_key IS NOT NULL
            DO NOTHING
          RETURNING id;
        `;

        if (inserted.length === 0) {
          if (dedupeKey === null) {
            throw new Error(
              "insertMemory: insert returned no row but no dedupeKey was supplied",
            );
          }
          const existing = await tx.memory.findFirst({
            where: { workspaceId, dedupeKey },
            select: { id: true },
          });
          if (existing === null) {
            throw new Error(
              "insertMemory: deduplicated insert but existing row not found",
            );
          }
          return { id: existing.id, created: false };
        }

        const memoryId = inserted[0]!.id;

        await tx.memoryOwner.createMany({
          data: ownerRows.map((row) => ({
            memoryId,
            ownerKind: row.kind,
            ownerId: row.ownerId,
            ...(grantedByHumanId === undefined
              ? {}
              : { grantedBy: grantedByHumanId }),
          })),
          skipDuplicates: true,
        });

        return { id: memoryId, created: true };
      });
    },

    async findRelated({
      workspaceId,
      viewerSlackUserIds,
      embedding,
      tags,
      limit,
    }) {
      const embeddingLiteral = toVectorLiteral(embedding);
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          workspace_id: string;
          content: string;
          tags: string[];
          source_ref: JsonValue | null;
          created_at: Date;
          distance: number;
        }>
      >`
        WITH visible AS (
          SELECT DISTINCT mo.memory_id
          FROM memory_owners mo
          WHERE
            (mo.owner_kind = 'workspace' AND mo.owner_id = ${workspaceId}::uuid)
            OR (
              mo.owner_kind = 'human'
              AND mo.owner_id IN (
                SELECT id FROM humans
                WHERE workspace_id = ${workspaceId}::uuid
                  AND slack_user_id = ANY(${viewerSlackUserIds}::text[])
              )
            )
        )
        SELECT
          m.id,
          m.workspace_id,
          m.content,
          m.tags,
          m.source_ref,
          m.created_at,
          (m.embedding <=> ${embeddingLiteral}::vector)::float8 AS distance
        FROM memories m
        JOIN visible v ON v.memory_id = m.id
        WHERE m.workspace_id = ${workspaceId}::uuid
          AND m.archived_at IS NULL
          AND (cardinality(${tags}::text[]) = 0 OR m.tags && ${tags}::text[])
        ORDER BY m.embedding <=> ${embeddingLiteral}::vector
        LIMIT ${limit};
      `;

      return rows.map((r) => ({
        id: r.id,
        workspaceId: r.workspace_id,
        content: r.content,
        tags: r.tags,
        sourceRef: r.source_ref,
        createdAt: r.created_at,
        distance: r.distance,
      }));
    },

    async addOwner({ memoryId, owner, grantedByHumanId }) {
      let ownerId: string;
      let ownerKind: "workspace" | "human";

      if (owner.kind === "workspace") {
        ownerKind = "workspace";
        const memory = await prisma.memory.findUniqueOrThrow({
          where: { id: memoryId },
          select: { workspaceId: true },
        });
        ownerId = memory.workspaceId;
      } else {
        ownerKind = "human";
        const memory = await prisma.memory.findUniqueOrThrow({
          where: { id: memoryId },
          select: { workspaceId: true },
        });
        const humans = await this.upsertHumans({
          workspaceId: memory.workspaceId,
          slackUserIds: [owner.slackUserId],
        });
        const resolved = humans.get(owner.slackUserId);
        if (resolved === undefined) {
          throw new Error(
            `addOwner: failed to resolve humans.id for slackUserId=${owner.slackUserId}`,
          );
        }
        ownerId = resolved;
      }

      await prisma.memoryOwner.upsert({
        where: {
          memoryId_ownerKind_ownerId: {
            memoryId,
            ownerKind,
            ownerId,
          },
        },
        update: {},
        create: {
          memoryId,
          ownerKind,
          ownerId,
          ...(grantedByHumanId === undefined
            ? {}
            : { grantedBy: grantedByHumanId }),
        },
      });
    },

    async archive(memoryId) {
      await prisma.memory.update({
        where: { id: memoryId },
        data: { archivedAt: new Date() },
      });
    },
  };
}

// Re-export for callers that want the SQL helper for diagnostics.
export const __vectorLiteral = toVectorLiteral;
// `Prisma` is re-exported so callers can use Prisma.JsonNull etc. without
// adding another dependency import.
export { Prisma };
