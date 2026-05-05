import type { ActionItem, SlackMessageBlock, SlackUserId } from "../domain/types.js";

export interface BuildFollowUpSlackMessageInput {
  targetUserIds?: SlackUserId[];
  reason: string;
  summary?: string;
  actionItems?: ActionItem[];
  tone?: "concise" | "warm" | "formal";
}

export interface SlackMessagePayload {
  text: string;
  blocks: SlackMessageBlock[];
}

export function buildFollowUpSlackMessage(
  input: BuildFollowUpSlackMessageInput,
): SlackMessagePayload {
  const targets = (input.targetUserIds ?? []).map((userId) => `<@${userId}>`).join(" ");
  const opener = buildOpener(input.tone);
  const reason = input.reason.trim();
  const text = [targets, `${opener} ${reason}`].filter(Boolean).join(" ").trim();

  const blocks: SlackMessageBlock[] = [
    sectionBlock([targets, `*${opener}*`, reason].filter(Boolean).join(" ")),
  ];

  if (input.summary?.trim()) {
    blocks.push(contextBlock(`Context: ${input.summary.trim()}`));
  }

  const actionItems = (input.actionItems ?? []).slice(0, 5);
  if (actionItems.length > 0) {
    blocks.push(sectionBlock(actionItems.map(formatActionItem).join("\n")));
  }

  blocks.push(contextBlock("Sent by Parlar to keep the conversation moving."));

  return { text, blocks };
}

function buildOpener(tone: BuildFollowUpSlackMessageInput["tone"]): string {
  if (tone === "formal") {
    return "Following up on this.";
  }
  if (tone === "warm") {
    return "Quick friendly nudge on this.";
  }
  return "Quick follow-up on this.";
}

function formatActionItem(actionItem: ActionItem): string {
  const owner = actionItem.ownerUserId ? `<@${actionItem.ownerUserId}> ` : "";
  const due = actionItem.dueAt ? ` _(due ${actionItem.dueAt})_` : "";
  return `• ${owner}${actionItem.description}${due}`;
}

function sectionBlock(text: string): SlackMessageBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: truncate(text, 3000),
    },
  };
}

function contextBlock(text: string): SlackMessageBlock {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: truncate(text, 2000),
      },
    ],
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}
