import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BellRing,
  Brain,
  Eye,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "../components/SiteHeader";
import { ExtractionVisual } from "../components/ExtractionVisual";
import { Logo } from "../components/Logo";
import { SignInButton } from "../components/SignInButton";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="extraction-grid min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="chip">
            <Sparkles className="h-3.5 w-3.5 text-beam-300" />
            Slack follow-up, automated
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] font-semibold tracking-tight md:text-6xl">
            Threads slip.{" "}
            <span className="gradient-text font-serif italic">
              Parlar doesn't.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-200">
            Important Slack threads get buried, asks go unanswered, decisions
            evaporate. Parlar quietly watches your workspace and surfaces the
            conversations that need a follow-up — only when it actually
            matters.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SignInButton
              signedInChildren={
                <>
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              }
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </SignInButton>
            <SignInButton
              className="btn-secondary"
              signedInChildren={
                <>
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              }
            >
              Sign in
            </SignInButton>
          </div>
          <div className="mt-8 flex items-center gap-4 text-sm text-ink-300">
            <ShieldCheck className="h-4 w-4 text-beam-300" />
            Workspace-scoped. Audit-logged. Reversible.
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 -z-10 rounded-[2rem] bg-gradient-to-br from-beam-400/10 via-amethyst-500/10 to-coral-500/10 blur-2xl" />
          <div className="card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-white/8 bg-white/[0.02] px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-ink-200">
                <span className="h-2 w-2 rounded-full bg-coral-400" />
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="h-2 w-2 rounded-full bg-beam-400" />
                <span className="ml-3 font-mono text-xs text-ink-300">
                  parlar.app/workspace
                </span>
              </div>
              <span className="chip">live</span>
            </div>
            <ExtractionVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Eye,
      title: "Listen",
      body: "Connect your Slack workspace once. Parlar normalizes events into internal signals — no raw Slack payloads near your business logic.",
    },
    {
      icon: Brain,
      title: "Extract",
      body: "Conversations are scored for follow-up potential, distilled into compact memories, and grounded in workspace context.",
    },
    {
      icon: BellRing,
      title: "Remind, gently",
      body: "Durable Temporal timers schedule reminders. A human reply cancels them automatically — nothing surprises your team.",
    },
  ];
  return (
    <section className="relative py-20">
      <div className="beam-divider" />
      <div className="mx-auto max-w-6xl px-6 pt-20">
        <div className="max-w-2xl">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Three steps. Zero noise.
          </h2>
          <p className="mt-4 text-ink-200">
            Parlar isn't a chatbot. It's an orchestration layer for the
            conversations you can't afford to drop.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="card group">
              <div className="flex items-center justify-between">
                <span className="chip">step {i + 1}</span>
                <s.icon className="h-5 w-5 text-beam-300" />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-ink-200">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/8 bg-ink-950/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <Logo />
        </div>
        <div className="flex items-center gap-5 text-sm text-ink-300">
          <a href="https://github.com/claymav/parlar">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
