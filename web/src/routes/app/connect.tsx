import { createFileRoute } from "@tanstack/react-router";
import { Hash, Lock, Slack, Users } from "lucide-react";

export const Route = createFileRoute("/app/connect")({
  component: ConnectPage,
});

function ConnectPage() {
  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Connect your Slack workspace
        </h1>
        <p className="mt-1 text-sm text-ink-300">
          Install the Parlar bot on your workspace so it can listen to the
          channels you choose and post follow-up nudges in-thread.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card">
          <h2 className="text-lg font-semibold tracking-tight">
            What gets installed
          </h2>
          <p className="mt-2 text-sm text-ink-300">
            Parlar needs read access to channels you choose, and the ability to
            post in-thread when a follow-up is warranted. We never read DMs you
            haven't explicitly added.
          </p>
          <ul className="mt-5 space-y-3 text-sm">
            {[
              { icon: Hash, text: "Read messages in selected channels" },
              { icon: Users, text: "Read channel metadata and membership" },
              { icon: Slack, text: "Post in-thread replies for follow-ups" },
              { icon: Lock, text: "Workspace-scoped, revocable any time" },
            ].map((p) => (
              <li key={p.text} className="flex items-center gap-3">
                <p.icon className="h-4 w-4 text-beam-300" />
                <span className="text-ink-100">{p.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="OAuth handoff isn't wired yet"
              className="btn-primary cursor-not-allowed opacity-50"
            >
              <Slack className="h-4 w-4" />
              Slack OAuth — wiring next
            </button>
          </div>

          <p className="mt-4 text-xs text-ink-400">
            OAuth handoff isn't wired yet. The button will become functional
            once the install flow lands; track progress in the repo.
          </p>
        </div>

        <SlackInstallIllustration />
      </div>
    </div>
  );
}

function SlackInstallIllustration() {
  return (
    <div className="card flex aspect-[5/4] items-center justify-center overflow-hidden p-0">
      <svg viewBox="0 0 360 280" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="install-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="install-prism" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#F97366" />
          </linearGradient>
        </defs>
        <rect width="360" height="280" fill="url(#install-bg)" />
        <g transform="translate(60 90)">
          <rect width="100" height="100" rx="20" fill="#1A1F36" />
          <g transform="translate(20 20)" fill="#fff" opacity="0.95">
            <rect x="0" y="20" width="20" height="40" rx="10" fill="#36C5F0" />
            <rect x="20" y="0" width="40" height="20" rx="10" fill="#2EB67D" />
            <rect x="40" y="20" width="20" height="40" rx="10" fill="#ECB22E" />
            <rect x="0" y="40" width="40" height="20" rx="10" fill="#E01E5A" />
          </g>
        </g>
        <line
          x1="170"
          y1="140"
          x2="200"
          y2="140"
          stroke="#22D3EE"
          strokeWidth="3"
          strokeDasharray="4 5"
          opacity={0.4}
        />
        <g transform="translate(210 90)">
          <rect
            width="100"
            height="100"
            rx="20"
            fill="#0B0F1A"
            stroke="rgba(255,255,255,0.08)"
          />
          <g transform="translate(20 18)">
            <path d="M30 0 L60 60 L0 60 Z" fill="url(#install-prism)" />
            <circle cx="30" cy="46" r="6" fill="#0B0F1A" />
          </g>
        </g>
        <text
          x="180"
          y="240"
          textAnchor="middle"
          fontSize="13"
          fill="#94A3B8"
          fontFamily="Inter, sans-serif"
        >
          Slack ↔ Parlar
        </text>
      </svg>
    </div>
  );
}
