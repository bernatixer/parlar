import type { ConversationRef, JsonValue, ScheduledAiWork } from "../domain/types.js";

export interface ExecuteScheduledAiWorkInput {
  conversation: ConversationRef;
  work: ScheduledAiWork;
  context?: JsonValue;
  allowedActions?: string[];
  requireHumanApproval?: boolean;
}

export interface ExecuteScheduledAiWorkOutput {
  status: "completed" | "deferred" | "failed";
  reason: string;
  decisions?: JsonValue[];
}

export interface ScheduledAiWorkRunner {
  executeScheduledAiWork(
    input: ExecuteScheduledAiWorkInput,
  ): Promise<ExecuteScheduledAiWorkOutput>;
}

export function createConversationActivities(
  runner: ScheduledAiWorkRunner,
): ScheduledAiWorkRunner {
  return runner;
}
