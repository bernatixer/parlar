import { createServerFn } from "@tanstack/react-start";
import { prisma } from "./db";

export type MemoryDTO = {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  content: string;
  tags: string[];
  channel: string | null;
  thread: string | null;
  why: string | null;
  participants: string[];
  createdAt: string;
  archivedAt: string | null;
};

export type StatsDTO = {
  channelsWatched: number;
  memoriesCaptured: number;
  remindersSent: number;
  humanResolves: number;
  slackConnected: boolean;
};

type RawMemory = {
  id: string;
  workspaceId: string;
  content: string;
  tags: string[];
  sourceRef: unknown;
  createdAt: Date;
  archivedAt: Date | null;
  workspace: { name: string | null };
};

function shapeMemory(m: RawMemory): MemoryDTO {
  const ref = (m.sourceRef ?? {}) as Record<string, unknown>;
  const channel =
    pickString(ref["channelId"]) ?? pickString(ref["channel"]) ?? null;
  const thread =
    pickString(ref["threadTs"]) ?? pickString(ref["thread"]) ?? null;
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    workspaceName: m.workspace.name,
    content: m.content,
    tags: m.tags,
    channel,
    thread,
    why: pickString(ref["why"]) ?? pickString(ref["kind"]) ?? null,
    participants: Array.isArray(ref["participants"])
      ? (ref["participants"] as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    createdAt: m.createdAt.toISOString(),
    archivedAt: m.archivedAt ? m.archivedAt.toISOString() : null,
  };
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export const listMemories = createServerFn({ method: "GET" }).handler(
  async (): Promise<MemoryDTO[]> => {
    const memories = await prisma.memory.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { workspace: { select: { name: true } } },
    });
    return memories.map((m) => shapeMemory(m as unknown as RawMemory));
  },
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const deleteMemory = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => {
    if (!input || typeof input.id !== "string" || !UUID_RE.test(input.id)) {
      throw new Error("invalid memory id");
    }
    return { id: input.id };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    await prisma.memory.update({
      where: { id: data.id },
      data: { archivedAt: new Date() },
    });
    return { id: data.id };
  });

export const getStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<StatsDTO> => {
    const [memories, anyWorkspace] = await Promise.all([
      prisma.memory.findMany({
        where: { archivedAt: null },
        select: { tags: true, sourceRef: true },
      }),
      prisma.workspace.findFirst({ select: { id: true } }),
    ]);

    let remindersSent = 0;
    let humanResolves = 0;
    const channels = new Set<string>();
    for (const m of memories) {
      if (m.tags.includes("follow_up")) remindersSent++;
      const ref = (m.sourceRef ?? {}) as Record<string, unknown>;
      if (ref["status"] === "resolved") humanResolves++;
      const channel = pickString(ref["channelId"]) ?? pickString(ref["channel"]);
      if (channel) channels.add(channel);
    }

    return {
      channelsWatched: channels.size,
      memoriesCaptured: memories.length,
      remindersSent,
      humanResolves,
      slackConnected: anyWorkspace !== null,
    };
  },
);
