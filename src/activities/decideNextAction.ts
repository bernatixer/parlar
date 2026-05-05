import {
  dynamicTool,
  generateText,
  hasToolCall,
  stepCountIs,
  tool,
  type LanguageModel,
  type Tool,
  type ToolSet,
} from "ai";
import { z } from "zod";
import type {
  AgentActivities,
  DecideNextActionInput,
  PendingSignalSummary,
} from "./agentActivities.js";
import type {
  AgentTurnResult,
  ParticipantSummary,
  Reminder,
  ReminderId,
  ThreadKey,
} from "../domain/agent.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolExecutionContext } from "../domain/types.js";

export interface DecideNextActionDependencies {
  model: LanguageModel;
  registry: ToolRegistry;
  maxSteps?: number;
  systemPrompt?: (input: DecideNextActionInput) => string;
}

const SUBMIT_TURN_RESULT = "submit_turn_result";

const reminderSchema = z.object({
  id: z.string(),
  threadKey: z.string(),
  fireAt: z.string().describe("ISO 8601 datetime, e.g. 2026-05-06T18:00:00Z"),
  reasonId: z
    .string()
    .describe("Stable id for the audit/decision record explaining why this reminder exists"),
});

const turnResultSchema = z.object({
  stop: z.boolean().describe("True only when this conversation needs no further agent attention."),
  setReminders: z
    .array(reminderSchema)
    .default([])
    .describe("Reminders to add or replace by id."),
  cancelReminderIds: z
    .array(z.string())
    .default([])
    .describe("Reminder ids to remove from workflow state."),
  summary: z.string().optional().describe("One-sentence summary of what this turn did or decided."),
});

export function createDecideNextAction(
  deps: DecideNextActionDependencies,
): AgentActivities["decideNextAction"] {
  const buildSystem = deps.systemPrompt ?? defaultSystemPrompt;
  const maxSteps = deps.maxSteps ?? 8;

  return async function decideNextAction(
    input: DecideNextActionInput,
  ): Promise<AgentTurnResult> {
    const submitted: { value?: AgentTurnResult } = {};

    const submitTool = tool({
      description:
        "Call exactly once when you are done reasoning to submit the final turn outcome. " +
        "Reminders survive in workflow state; tool calls (sends, decisions, etc.) are durable on their own.",
      inputSchema: turnResultSchema,
      execute: async (args) => {
        submitted.value = {
          stop: args.stop,
          setReminders: args.setReminders ?? [],
          cancelReminderIds: args.cancelReminderIds ?? [],
          ...(args.summary === undefined ? {} : { summary: args.summary }),
        };
        return { accepted: true };
      },
    }) as Tool;

    const tools = buildToolSet({
      registry: deps.registry,
      workflowId: input.workflowId,
      turnId: input.turnId,
      submitTool,
    });

    await generateText({
      model: deps.model,
      system: buildSystem(input),
      prompt: buildUserPrompt(input),
      tools,
      stopWhen: [stepCountIs(maxSteps), hasToolCall(SUBMIT_TURN_RESULT)],
    });

    if (submitted.value) return submitted.value;

    return {
      stop: false,
      setReminders: [],
      cancelReminderIds: [],
      summary: "Agent did not submit a turn result; no workflow-side actions applied.",
    };
  };
}

interface BuildToolSetOptions {
  registry: ToolRegistry;
  workflowId: string;
  turnId: string;
  submitTool: Tool;
}

function buildToolSet(options: BuildToolSetOptions): ToolSet {
  const tools: Record<string, Tool> = {
    [SUBMIT_TURN_RESULT]: options.submitTool,
  };

  for (const spec of options.registry.list()) {
    tools[spec.name] = dynamicTool({
      description: `${spec.description} Input shape: ${spec.inputSchema}. Output shape: ${spec.outputSchema}.`,
      inputSchema: z.record(z.string(), z.unknown()),
      execute: async (input, callOpts) => {
        const stepIdx = inferStepIdx(callOpts);
        const context: ToolExecutionContext = {
          requestId: `${options.turnId}:${spec.name}:${stepIdx}`,
          actor: "system",
          workflowId: options.workflowId,
          idempotencyKey: `${options.workflowId}:${options.turnId}:${spec.name}:${stepIdx}`,
        };
        return options.registry.execute(spec.name, input, context);
      },
    }) as Tool;
  }

  return tools as ToolSet;
}

function inferStepIdx(callOpts: { toolCallId?: string }): string {
  return callOpts.toolCallId ?? "0";
}

function defaultSystemPrompt(_input: DecideNextActionInput): string {
  return baseSystemPrompt();
}

function baseSystemPrompt(): string {
  return [
    "You are Parlar, an agent that keeps Slack-style conversations from being dropped.",
    "Your job each turn:",
    "- Use the read tools to gather only the context you need.",
    "- Take small, reversible, explainable actions via the action tools.",
    "- When done, call submit_turn_result EXACTLY once with the workflow-side outcome.",
    "Rules:",
    "- Reminders persist in workflow state. Use setReminders for new or replaced reminders, cancelReminderIds to drop ones you no longer want.",
    "- Set stop=true only when the conversation is resolved or no longer needs management. Otherwise stop=false.",
    "- Never invent workspace facts or participants; ask via tools.",
    "- Prefer asking a human via request_human_approval when uncertain.",
    "Slack identifier mapping:",
    "- conversation.conversationId IS the Slack channel id (use it as channelId in slack tools).",
    "- threadKey is the Slack thread_ts; use 'root' to mean a top-level channel message (no thread).",
    "- Pass thread keys and message timestamps verbatim as STRINGS, never as numbers (they have trailing zeros and decimals).",
  ].join("\n");
}

/**
 * System prompt for short demo runs: caps reminder horizons so the wow-effect
 * fits in seconds instead of hours, and pushes the agent toward visible Slack
 * action when a reminder fires.
 */
export function demoSystemPrompt(_input: DecideNextActionInput): string {
  return [
    baseSystemPrompt(),
    "DEMO MODE OVERRIDES (this is a short test run, not production):",
    "- Reminder fireAt MUST be within the next 60 seconds (use now + 20s by default). Never schedule reminders hours or days out.",
    "- When a reminder fires for an unanswered ask, ALWAYS post a friendly, brief nudge to the thread via send_slack_message (mention the assignee), then set stop=true on that same turn.",
    "- When a participant has clearly acknowledged the ask, cancel any related reminders and set stop=true.",
    "- Be willing to send messages for visible progress: if the user explicitly addresses you (e.g., '@parlar ...'), respond with send_slack_message.",
  ].join("\n");
}

function buildUserPrompt(input: DecideNextActionInput): string {
  const { conversation, participants, work, pendingReminders, lastDecisionAt } = input;
  return [
    `Conversation: workspace=${conversation.workspaceId} platform=${conversation.platform} kind=${conversation.conversationKind} id=${conversation.conversationId}`,
    `Participants:\n${participantsBlock(participants)}`,
    `Work bundle for this turn:\n${workBlock(work)}`,
    `Pending reminders:\n${remindersBlock(pendingReminders)}`,
    lastDecisionAt ? `Last decision at: ${lastDecisionAt}` : "First turn for this conversation.",
    "Decide what to do, then call submit_turn_result.",
  ].join("\n\n");
}

function participantsBlock(participants: ParticipantSummary[]): string {
  if (participants.length === 0) return "(none yet)";
  return participants
    .map(
      (p) =>
        `- ${p.displayName} (id=${p.id}, platformUserId=${p.platformUserId}${p.isAgent ? ", IS_AGENT" : ""})`,
    )
    .join("\n");
}

function workBlock(
  work: Array<{
    threadKey: ThreadKey;
    signals: PendingSignalSummary[];
    dueReminderIds: ReminderId[];
  }>,
): string {
  if (work.length === 0) return "(no ready work)";
  return work
    .map((w) => {
      const lines = [
        `- thread ${w.threadKey}: ${w.signals.length} new signal(s), ${w.dueReminderIds.length} due reminder(s)`,
      ];
      for (const s of w.signals) {
        const text = s.text ? ` "${truncate(s.text, 240)}"` : "";
        const mentions =
          s.mentionedParticipantIds && s.mentionedParticipantIds.length > 0
            ? ` mentions=[${s.mentionedParticipantIds.join(", ")}]`
            : "";
        lines.push(`    [${s.kind}] ${s.signalId} by ${s.authorId} at ${s.at}${text}${mentions}`);
      }
      if (w.dueReminderIds.length > 0) {
        lines.push(`    due reminders: ${w.dueReminderIds.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function remindersBlock(reminders: Reminder[]): string {
  if (reminders.length === 0) return "(no pending reminders)";
  return reminders
    .map((r) => `- ${r.id} fires at ${r.fireAt} on thread ${r.threadKey} (reason ${r.reasonId})`)
    .join("\n");
}
