import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Brain, Hash, Search, Trash2, Users } from "lucide-react";
import { memoriesQueryOptions } from "../../lib/queries";
import { deleteMemory, type MemoryDTO } from "../../server/queries";

export const Route = createFileRoute("/app/memories")({
  loader: ({ context }) =>
    context.queryClient.prefetchQuery(memoriesQueryOptions),
  component: MemoriesPage,
});

function MemoriesPage() {
  const memories = useQuery(memoriesQueryOptions);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => deleteMemory({ data: { id } }),
    onSuccess: () => {
      setConfirmingDelete(false);
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const filtered = useMemo(() => {
    const all = memories.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        (m.channel ?? "").toLowerCase().includes(q) ||
        (m.thread ?? "").toLowerCase().includes(q),
    );
  }, [memories.data, query]);

  useEffect(() => {
    if (selected && filtered.some((m) => m.id === selected)) return;
    if (filtered.length > 0) setSelected(filtered[0]!.id);
  }, [filtered, selected]);

  const active = filtered.find((m) => m.id === selected) ?? filtered[0];

  useEffect(() => {
    setConfirmingDelete(false);
  }, [active?.id]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Memories</h1>
          <p className="mt-1 text-sm text-ink-300">
            Compact records of what's worth remembering. Live from Postgres.
          </p>
        </div>
        <div className="hidden gap-2 md:flex">
          <span className="chip">
            <Brain className="h-3.5 w-3.5 text-amethyst-400" />
            {memories.data?.length ?? 0} total
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search content, channels, threads…"
            className="h-10 w-full rounded-full border border-white/8 bg-white/[0.03] pr-4 pl-10 text-sm text-ink-50 placeholder:text-ink-400 focus:border-beam-400/50 focus:bg-white/[0.06]"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <ul className="card max-h-[70vh] divide-y divide-white/8 overflow-auto p-0">
          {memories.isLoading && (
            <li className="p-6 text-center text-sm text-ink-300">Loading…</li>
          )}
          {!memories.isLoading && filtered.length === 0 && (
            <li className="p-6 text-center text-sm text-ink-300">
              {memories.data?.length === 0
                ? "No memories yet. Run npm run db:seed."
                : "No memories match."}
            </li>
          )}
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => setSelected(m.id)}
                className={`block w-full px-5 py-4 text-left transition-colors ${
                  active?.id === m.id ? "bg-white/5" : "hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink-50">
                    <Hash className="h-3.5 w-3.5 text-ink-400" />
                    {m.channel ?? "Workspace memory"}
                    {m.thread && (
                      <>
                        <span className="text-ink-400">·</span>
                        <span className="truncate">{m.thread}</span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-ink-400">
                    {formatRelative(m.createdAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-ink-300">
                  {m.content}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <div className="card">
          {active ? (
            <MemoryDetail
              memory={active}
              confirming={confirmingDelete}
              onRequestDelete={() => setConfirmingDelete(true)}
              onCancelDelete={() => setConfirmingDelete(false)}
              onConfirmDelete={() => remove.mutate(active.id)}
              isDeleting={remove.isPending}
              error={remove.isError ? (remove.error as Error).message : null}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemoryDetail({
  memory,
  confirming,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  isDeleting,
  error,
}: {
  memory: MemoryDTO;
  confirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
  error: string | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-400">
          captured {formatRelative(memory.createdAt)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DeleteControl
            confirming={confirming}
            onRequest={onRequestDelete}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
            isDeleting={isDeleting}
          />
        </div>
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">
        {memory.channel || memory.thread
          ? `#${memory.channel ?? "—"} · ${memory.thread ?? ""}`
          : "Workspace memory"}
      </h2>
      <p className="mt-3 text-ink-100">{memory.content}</p>

      <div className="mt-6 grid gap-3 text-sm md:grid-cols-2">
        {memory.why && (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-xs tracking-wider text-ink-400 uppercase">
              Why captured
            </div>
            <div className="mt-2 text-ink-100">{memory.why}</div>
          </div>
        )}
        {memory.participants.length > 0 && (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-1.5 text-xs tracking-wider text-ink-400 uppercase">
              <Users className="h-3.5 w-3.5" />
              Participants
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {memory.participants.map((p) => (
                <span key={p} className="chip font-mono text-xs">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-coral-400/30 bg-coral-400/5 p-3 text-sm text-coral-300">
          Couldn't delete: {error}
        </div>
      )}
    </div>
  );
}

function DeleteControl({
  confirming,
  onRequest,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  confirming: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onRequest}
        title="Delete memory"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ink-300 transition-colors hover:border-coral-400/40 hover:bg-coral-400/10 hover:text-coral-300"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-coral-400/40 bg-coral-400/10 px-2 py-1 text-xs text-coral-200">
      <span>Delete?</span>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isDeleting}
        className="rounded-full bg-coral-400/20 px-2 py-0.5 text-coral-100 hover:bg-coral-400/30 disabled:opacity-50"
      >
        {isDeleting ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={isDeleting}
        className="rounded-full px-2 py-0.5 text-ink-300 hover:text-ink-50 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
