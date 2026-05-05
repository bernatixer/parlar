# Parlar

Parlar is a TypeScript orchestration layer for AI-assisted conversation management in Slack.

It listens to workspace conversation signals, keeps durable context about what is happening, and uses Temporal workflows plus AI/tool calls to decide when to remind, follow up, summarize, or step back because a human already handled it.

The goal is simple: help teams keep important Slack conversations from being dropped without turning the product into a noisy chatbot.

## What It Does

Parlar manages ongoing conversations over time. It is designed for cases where a message, thread, or DM should not disappear just because nobody replied immediately.

Typical behaviors include:

- Detecting Slack conversations that need a follow-up.
- Scheduling durable reminders based on conversation context.
- Canceling or superseding reminders when a human replies.
- Summarizing recent context before taking action.
- Using workspace-level context to decide tone, urgency, and ownership.
- Recording why a follow-up happened so humans and agents can inspect the decision later.

## Architecture

Parlar is built around Temporal durable execution.

```txt
Slack events
    -> event normalization
    -> Temporal workflow signal
    -> conversation workflow state
    -> AI/tool activities
    -> Slack follow-up, reminder, or no-op
```

The important boundary is that workflows own time and state, while activities own side effects.

- **Workflows** keep durable conversation state, receive signals, wait on timers, and decide what should happen next.
- **Activities** call Slack, databases, AI models, and internal tools.
- **Signals** represent external events such as Slack messages, replies, reactions, and manual intervention.
- **Queries** expose read-only workflow state for debugging and product surfaces.
- **Updates** handle synchronous commands that need validation or a result.

For Slack ingestion, the expected pattern is `signalWithStart`: a new event starts the conversation workflow if needed, or signals the existing workflow if it already exists.

## Core Concepts

### Workspace

The Slack workspace or organization whose channels, users, preferences, and conversation history provide operating context.

### Conversation

A Slack thread, channel exchange, DM, or work item that may need follow-up, clarification, escalation, or closure.

### Signal

A normalized event that updates workflow state. Signals should be internal domain events, not raw Slack webhook payloads.

### Follow-up

A planned or conditional action intended to move a conversation forward. Follow-ups should be small, reversible, explainable, and idempotent.

### Tool

A typed capability available to AI or orchestration logic, such as fetching Slack context, drafting a reminder, looking up workspace memory, or recording a decision.

## Temporal Development Notes

Temporal code should be treated differently from normal backend code.

Workflow code must be deterministic because Temporal can replay it after crashes, deploys, worker restarts, and long sleeps. Do not call Slack, databases, AI models, network APIs, file systems, process environment, or normal Node.js-only APIs from a workflow. Put that work in activities.

Activities can be retried many times. Any activity that sends a Slack message, records a decision, or performs another external side effect must be idempotent. Use stable idempotency keys such as:

```txt
workflowId + decisionId + actionType
```

Durable reminders should be modeled with Temporal timers, `sleep`, `condition`, and `Promise.race`, not background cron loops or ad hoc queue delays.

Long-lived or very active conversation workflows should use `continueAsNew` so workflow history does not grow without bound.

## Expected Project Shape

The repository is intentionally early. As implementation fills in, the code should trend toward boundaries like:

```txt
src/
  workflows/            Temporal workflow definitions
  activities/           Slack, AI, database, and tool side effects
  integrations/slack/   Slack event parsing and API helpers
  tools/                Typed tool definitions and executors
  prompts/              Prompt builders and output schemas
  state/                Persistence and repositories
  types/                Shared TypeScript domain types
```

These names are guidance. Prefer the actual project structure once one exists.

## Tool Layer

The first implementation includes a modular tool registry with activity-backed tools for:

- Slack context reads and message sends.
- Conversation classification, summarization, action-item extraction, and follow-up decisions.
- Follow-up drafting, scheduling, canceling, and snoozing.
- Workspace preferences, person context, decision records, related memory, and compact summaries.
- Safety validation, approval requests, draft-only actions, and audit records.
- Temporal workflow control, including `start_or_signal_conversation` and `schedule_ai_work`.

`schedule_ai_work` is intentionally separate from `schedule_follow_up`. It schedules future reasoning: at the scheduled time, the conversation workflow can gather fresh context, run AI/tool work, and decide whether to send, draft, reschedule, cancel, record a summary, or do nothing.

All tools are designed to run through Activities or service boundaries. Workflow code should call Activities, not tool implementations directly.

## AI SDK Integration

Parlar installs Vercel's AI SDK and Temporal's AI SDK plugin:

```txt
ai
@ai-sdk/anthropic
@temporalio/ai-sdk
```

The worker factory registers `AiSdkPlugin` with the Anthropic provider by default. Runtime model calls require the worker process to have `ANTHROPIC_API_KEY` available in the environment. Use `.env.example` as the local template. The default model is Claude Sonnet 4.6:

```txt
PARLAR_AI_MODEL=claude-sonnet-4-6
```

Workflow code can use:

```ts
import { temporalProvider } from "@temporalio/ai-sdk";
import { generateText } from "ai";

const result = await generateText({
  model: temporalProvider.languageModel("claude-sonnet-4-6"),
  prompt: "Summarize this conversation.",
});
```

Temporal handles the model call through plugin-backed Activities. Tool functions still need to respect Workflow rules: if they call Slack, databases, HTTP APIs, or any other non-deterministic system, route that work through an Activity.

## Product Principles

- Be useful without being noisy.
- Preserve human agency.
- Prefer explainable, reversible actions.
- Ground AI decisions in real workspace and conversation context.
- Store enough audit data to explain what happened and why.
- Keep workspace data scoped to the correct workspace and conversation.
- Treat AI output as a proposal that must be validated before it drives action.

## Agent Context

See [`AGENTS.md`](./AGENTS.md) for the detailed agent-facing context and Temporal development rules for this repository.
