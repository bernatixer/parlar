import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Cable, Slack, TrendingUp } from "lucide-react";
import { statsQueryOptions } from "../../lib/queries";

export const Route = createFileRoute("/app/")({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(statsQueryOptions);
  },
  component: Dashboard,
});

function Dashboard() {
  const stats = useQuery(statsQueryOptions);
  const connected = stats.data?.slackConnected ?? false;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-ink-300">
            What Parlar has captured for your workspace.
          </p>
        </div>
        <Link to="/app/connect" className="btn-secondary">
          <Cable className="h-4 w-4" />
          Connect Slack
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          accentIndex={0}
          label="Channels watched"
          value={stats.data?.channelsWatched ?? 0}
          isLoading={stats.isLoading}
        />
        <StatCard
          accentIndex={1}
          label="Memories captured"
          value={stats.data?.memoriesCaptured ?? 0}
          isLoading={stats.isLoading}
        />
        <StatCard
          accentIndex={2}
          label="Reminders sent"
          value={stats.data?.remindersSent ?? 0}
          isLoading={stats.isLoading}
        />
        <StatCard
          accentIndex={3}
          label="Resolved by humans"
          value={stats.data?.humanResolves ?? 0}
          isLoading={stats.isLoading}
        />
      </div>

      <SlackConnectionCard connected={connected} />

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Memories</h2>
          <Link to="/app/memories" className="btn-ghost">
            Open library <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-2 text-sm text-ink-300">
          Compact records Parlar has decided are worth remembering — follow-ups,
          decisions, action items, and summaries.
        </p>
      </div>
    </div>
  );
}

function SlackConnectionCard({ connected }: { connected: boolean }) {
  return (
    <div className="card relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-beam-400/40 to-transparent" />
      <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
          <Slack className="h-6 w-6 text-beam-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Slack workspace
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tracking-wider uppercase ${
                connected
                  ? "border-beam-400/30 bg-beam-400/5 text-beam-300"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-300"
              }`}
            >
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-300">
            {connected
              ? "Parlar is listening on your workspace. Add or remove channels any time."
              : "Install the Parlar Slack app on your workspace so memories can start getting captured."}
          </p>
        </div>
        <Link to="/app/connect" className="btn-primary">
          {connected ? "Manage" : "Set up Slack"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  accentIndex,
  label,
  value,
  isLoading,
}: {
  accentIndex: number;
  label: string;
  value: number;
  isLoading: boolean;
}) {
  const accents = [
    "from-beam-400/20 to-beam-400/0",
    "from-amethyst-400/20 to-amethyst-400/0",
    "from-coral-400/20 to-coral-400/0",
    "from-amber-400/20 to-amber-400/0",
  ];
  return (
    <div className="card">
      <div
        className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accents[accentIndex % accents.length]}`}
      />
      <div className="text-xs tracking-wider text-ink-300 uppercase">
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-semibold">
          {isLoading ? "—" : value}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-beam-300">
          <TrendingUp className="h-3 w-3" />
          live
        </span>
      </div>
    </div>
  );
}
