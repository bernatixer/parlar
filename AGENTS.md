# Parlar Agent Context

Parlar is a TypeScript service for orchestrating AI-assisted conversation management. It sits between collaboration signals, primarily Slack, and AI/tooling workflows that decide when and how to remind people, follow up, summarize context, or take other lightweight coordination actions.

The core product idea is not a generic chatbot. It is a Temporal-backed orchestration layer for managing ongoing conversations over time. Agents should think in terms of durable workflows, signals, timers, conversation state, workspace context, and tool-driven actions rather than one-off request/response handlers.

## Domain Model

- `Workspace`: the organization or Slack workspace whose people, channels, norms, and history provide operating context.
- `Conversation`: an ongoing thread, DM, channel exchange, or work item that may need follow-up, reminders, clarification, escalation, or closure.
- `Signal`: an external event that may update state or wake a workflow. Slack messages, reactions, mentions, replies, membership changes, and scheduled ticks are expected signal sources.
- `Workflow`: a durable Temporal process that owns conversation lifecycle decisions across time.
- `Activity`: an external side effect or integration call, such as reading Slack context, sending a Slack message, calling an AI model, retrieving workspace memory, or recording state.
- `Tool`: a capability available to AI or workflow logic. Tools should be explicit, typed, auditable, and scoped to the current workspace/conversation.
- `Follow-up`: a planned or conditional action intended to move a conversation forward without losing human context.

## Architectural Intent

Use Temporal for long-running orchestration. Prefer workflows for stateful coordination, timers, retries, and signal handling. Keep non-deterministic work, network calls, Slack API calls, model calls, database access, and other side effects inside activities or service layers called by activities.

Slack is an input and action surface. Incoming Slack events should be normalized into internal signal shapes before they affect conversation workflows. Outgoing Slack messages should be generated from explicit decisions with enough stored context to explain why they were sent.

AI should be treated as a reasoning component, not the source of truth. Persist the durable facts, decisions, pending reminders, and tool results that future workflow steps need. Make model prompts grounded in workspace and conversation context, and make tool calls traceable.

Conversation management should be context-sensitive. The system should account for the current Slack thread/channel, prior messages, participants, workspace-level preferences, pending tasks, previous reminders, and whether a human has already resolved or superseded the need for follow-up.

## Engineering Principles

- Keep workflows deterministic. Do not call Slack, databases, clocks, random APIs, or AI models directly from workflow code.
- Model signals and state transitions explicitly. Avoid burying lifecycle behavior in ad hoc handlers.
- Make time visible. Follow-ups, reminders, snoozes, deadlines, and stale-conversation checks should be represented as durable state or Temporal timers.
- Prefer typed boundaries for Slack events, AI tool inputs/outputs, workflow signals, and activity results.
- Design actions to be idempotent. Slack sends, reminders, and follow-ups should be safe across retries and worker restarts.
- Preserve auditability. Store enough metadata to answer what signal arrived, what context was used, what decision was made, and what action was taken.
- Keep human agency central. The system should assist with follow-up and coordination, not surprise users with unexplained or irreversible actions.
- Treat workspace data carefully. Scope reads and writes by workspace, avoid cross-workspace leakage, and keep prompts limited to relevant context.

## Temporal Development Rules

Temporal code is durable orchestration code, not normal async backend code. Treat Workflows as deterministic state machines that can be replayed at any time after crashes, deploys, worker restarts, or long sleeps.

Use these boundaries:

- `Workflow`: owns durable conversation state, signal handlers, timers, retries, pending follow-ups, and lifecycle decisions.
- `Activity`: performs side effects, including Slack API calls, database reads/writes, AI/model calls, tool execution, workspace context retrieval, metrics emission, and any normal Node.js work.
- `Worker`: registers Workflows and Activities on a task queue.
- `Client`: starts Workflows, sends Signals or Updates, and runs Queries.

Hard rules for Workflow code:

- Never call Slack, databases, AI models, network APIs, file systems, process environment, or normal Node.js-only APIs from a Workflow.
- Never import Activity implementations into Workflow files. Import Activity types only and call Activities through `proxyActivities`.
- Use Temporal APIs for time, waiting, cancellation, child workflows, and inter-workflow communication.
- Prefer `log` from `@temporalio/workflow` over `console.log` in Workflows so replay does not duplicate logs.
- Do not branch business logic on replay status. Replay awareness is only for advanced observability cases.
- Keep all Workflow arguments, Signal payloads, Query results, Update inputs/results, Activity arguments, and Activity results serializable.
- Prefer a single object parameter for Workflows, Activities, Signals, and Updates so new fields can be added without changing signatures.
- Avoid large payloads. Temporal stores inputs and results in Event History; pass IDs or compact summaries instead of full Slack histories when possible.

Hard rules for Activity code:

- Activities are normal Node.js functions and are the correct place for Slack calls, database access, model calls, and dependency injection.
- Activities can be retried many times. Any Activity with external side effects must be idempotent.
- Use stable idempotency keys for Slack sends and persisted decisions, for example `workflowId + decisionId + actionType`.
- Make transient failures retryable and invalid input non-retryable where appropriate.
- Keep Activity responsibilities narrow and named around one external action or one clear unit of work.

Message-passing guidance:

- Use **Signals** for asynchronous events that mutate Workflow state, such as Slack messages, reactions, replies, human intervention, cancellation, or reminder acknowledgements.
- Use **Queries** for read-only inspection of Workflow state. Query handlers must not mutate state and must not be async.
- Use **Updates** for synchronous commands where the caller needs validation, acceptance, a result, or an error.
- For Slack ingestion, prefer `signalWithStart` so an incoming Slack event can create the conversation Workflow if it does not already exist and signal it if it does.
- Define Signal, Query, and Update names as exported constants with `defineSignal`, `defineQuery`, and `defineUpdate`.

Conversation orchestration guidance:

- Prefer one long-lived Workflow per managed Slack conversation/thread when the system needs durable reminders or lifecycle state.
- Use a stable Workflow ID such as `parlar:${workspaceId}:${channelId}:${threadTs}` or another documented equivalent.
- Normalize raw Slack events before signaling Workflows. Workflow logic should receive internal domain events, not raw Slack webhook payloads.
- Use durable timers, `sleep`, `condition`, and `Promise.race` for reminders and "wait for reply or timeout" behavior.
- When a human reply, reaction, or other event supersedes a pending follow-up, update Workflow state so the timer path does not send stale Slack messages.
- Use `continueAsNew` for very active or very long-lived conversation Workflows so Event History does not grow without bound.
- If multiple conversations share a larger lifecycle, use child Workflows rather than overloading a single giant Workflow.

Versioning and deployment guidance:

- Workflow code changes can affect already-running executions. Adding, removing, or reordering awaited Activity, timer, child workflow, Signal, or patch calls may require Temporal versioning.
- For incompatible Workflow changes, use Temporal patching/worker versioning or introduce a new Workflow type such as `conversationWorkflowV2`.
- Replay-test important Workflow changes before deployment.
- Activity-only changes are usually safer because Activity results, not Activity internals, are recorded in Workflow history.

Testing guidance:

- Prefer integration tests that run Workflows with mocked Activities through `@temporalio/testing`.
- Use the time-skipping test environment for reminders, sleeps, retry delays, and stale-conversation checks.
- Test duplicate Slack signals and retry behavior to prove idempotency.
- Test that human responses cancel or supersede pending reminders.
- Test failure modes: Slack API failure, model failure, invalid AI output, missing workspace context, and repeated delivery of the same Slack event.

## Expected Code Shape

As the repository grows, prefer boundaries similar to:

- `workflows/`: Temporal workflow definitions, signal handlers, timers, durable conversation lifecycle logic.
- `activities/`: Slack calls, AI/model calls, database reads/writes, tool execution, and other side effects.
- `integrations/slack/`: Slack event parsing, normalization, API client helpers, and message formatting.
- `tools/`: typed tool definitions and executors available to AI or orchestration logic.
- `prompts/`: prompt builders for conversation analysis, follow-up decisions, summarization, and tool selection.
- `state/` or `repositories/`: persistence for conversations, workspace context, reminders, decisions, and audit records.
- `types/`: shared TypeScript domain types, schemas, and validation helpers.

These names are guidance, not a requirement. Follow the actual project structure once it exists.

## Prompting Guidance

When building AI prompts in this repo, include:

- The workspace and Slack conversation context relevant to the current decision.
- The exact task the AI is performing, such as classify, summarize, decide follow-up, draft message, or choose tools.
- Available tools and their constraints.
- Recent signals and prior decisions.
- Safety boundaries: do not invent workspace facts, do not send messages without an explicit action path, and prefer asking for clarification when context is insufficient.
- A structured output schema when the result will drive workflow behavior.

AI outputs that trigger actions should be validated before use. Prefer schemas over free-form parsing.

## Product Behavior

Parlar should help teams keep conversations from being dropped. Common behaviors include:

- Detecting when a Slack conversation needs a follow-up.
- Scheduling reminders or follow-up messages.
- Noticing when a human response makes a pending reminder obsolete.
- Summarizing conversation context before acting.
- Using workspace context to decide tone, urgency, ownership, and next steps.
- Recording why an action was taken so future agents and humans can inspect it.

Default to small, reversible, explainable actions. When uncertain, gather more context or create a draft/decision record rather than taking a surprising action in Slack.
