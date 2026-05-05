import type {
  AgentConversationRef,
  AgentTurnResult,
  ParticipantId,
  ParticipantSummary,
  Reminder,
  ReminderId,
  SignalId,
  ThreadKey,
  TurnId,
} from "../domain/agent.js";
import type { IsoDateTime } from "../domain/types.js";

export interface PendingSignalSummary {
  signalId: SignalId;
  kind: string;
  at: IsoDateTime;
  authorId: ParticipantId;
  text?: string;
  mentionedParticipantIds?: ParticipantId[];
  permalink?: string;
}

export interface DecideNextActionInput {
  workflowId: string;
  turnId: TurnId;
  conversation: AgentConversationRef;
  participants: ParticipantSummary[];
  work: Array<{
    threadKey: ThreadKey;
    signals: PendingSignalSummary[];
    dueReminderIds: ReminderId[];
  }>;
  pendingReminders: Reminder[];
  lastDecisionAt?: IsoDateTime;
}

export interface AgentActivities {
  decideNextAction(input: DecideNextActionInput): Promise<AgentTurnResult>;
}

export function createAgentActivities(impl: AgentActivities): AgentActivities {
  return impl;
}
