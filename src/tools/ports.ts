import type {
  ActionItem,
  AiWorkTask,
  AllowedAction,
  ConversationRef,
  ConversationStatus,
  ConversationSummary,
  FollowUpPlan,
  IsoDateTime,
  JsonValue,
  ScheduledAiWork,
  SlackMessageBlock,
  SlackMessage,
  SlackUserId,
} from "../domain/types.js";

export interface SlackContextPort {
  getThread(input: {
    workspaceId: string;
    channelId: string;
    threadTs: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }>;
  getChannelContext(input: {
    workspaceId: string;
    channelId: string;
    includeRecentMessages?: boolean;
  }): Promise<{
    channelId: string;
    name?: string;
    topic?: string;
    purpose?: string;
    memberCount?: number;
    recentMessages?: SlackMessage[];
  }>;
  getUserProfile(input: {
    workspaceId: string;
    userId: string;
  }): Promise<{
    userId: string;
    displayName?: string;
    realName?: string;
    timezone?: string;
    title?: string;
    isBot: boolean;
  }>;
  searchMessages(input: {
    workspaceId: string;
    query: string;
    channelId?: string;
    limit?: number;
  }): Promise<{ messages: SlackMessage[] }>;
  sendMessage(input: {
    workspaceId: string;
    channelId: string;
    text: string;
    blocks?: SlackMessageBlock[];
    threadTs?: string;
    targetUserIds?: SlackUserId[];
    idempotencyKey: string;
  }): Promise<{ messageTs: string; permalink?: string; deduplicated: boolean }>;
}

export interface ConversationIntelligencePort {
  classifyConversationState(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
    workspacePreferences?: JsonValue;
  }): Promise<{ status: ConversationStatus; confidence: number; reason: string }>;
  extractActionItems(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
  }): Promise<{ actionItems: ActionItem[] }>;
  summarizeConversation(input: {
    conversation: ConversationRef;
    messages: SlackMessage[];
    maxWords?: number;
  }): Promise<ConversationSummary>;
  detectFollowUpNeed(input: {
    conversation: ConversationRef;
    summary?: ConversationSummary;
    status?: ConversationStatus;
    actionItems?: ActionItem[];
  }): Promise<{
    needed: boolean;
    confidence: number;
    reason: string;
    plan?: FollowUpPlan;
  }>;
  detectResolutionSignal(input: {
    conversation: ConversationRef;
    newEvent: SlackMessage;
    pendingFollowUp?: FollowUpPlan;
  }): Promise<{
    resolved: boolean;
    superseded: boolean;
    reason: string;
  }>;
  draftFollowUpMessage(input: {
    conversation: ConversationRef;
    summary?: ConversationSummary;
    targetUserIds: SlackUserId[];
    reason: string;
    tone?: string;
  }): Promise<{ text: string; confidence: number; rationale: string }>;
}

export interface WorkspaceMemoryPort {
  getWorkspacePreferences(input: { workspaceId: string }): Promise<JsonValue>;
  getPersonContext(input: {
    workspaceId: string;
    userId: string;
  }): Promise<JsonValue>;
  recordConversationDecision(input: {
    conversation: ConversationRef;
    decisionType: string;
    reason: string;
    metadata?: JsonValue;
    idempotencyKey: string;
  }): Promise<{ decisionId: string; deduplicated: boolean }>;
  getRelatedConversationMemory(input: {
    conversation: ConversationRef;
    query: string;
    limit?: number;
  }): Promise<{ memories: JsonValue[] }>;
  recordConversationSummary(input: {
    conversation: ConversationRef;
    summary: ConversationSummary;
    idempotencyKey: string;
  }): Promise<{ summaryId: string; deduplicated: boolean }>;
}

export interface SafetyReviewPort {
  validateAction(input: {
    conversation: ConversationRef;
    action: AllowedAction;
    targetUserIds?: SlackUserId[];
    text?: string;
    requireHumanApproval?: boolean;
  }): Promise<{
    allowed: boolean;
    reasons: string[];
    requiresHumanApproval: boolean;
  }>;
  requestHumanApproval(input: {
    conversation: ConversationRef;
    action: AllowedAction;
    reason: string;
    payload: JsonValue;
    idempotencyKey: string;
  }): Promise<{ approvalRequestId: string; status: "pending" | "deduplicated" }>;
  createDraftOnly(input: {
    conversation: ConversationRef;
    text: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ draftId: string; deduplicated: boolean }>;
  auditToolCall(input: {
    toolName: string;
    conversation?: ConversationRef;
    requestId: string;
    input: JsonValue;
    output?: JsonValue;
    error?: string;
  }): Promise<{ auditId: string }>;
}

export interface TemporalControlPort {
  queryConversationWorkflow(input: {
    conversation: ConversationRef;
  }): Promise<unknown>;
  signalConversationEvent(input: {
    conversation: ConversationRef;
    event: JsonValue;
  }): Promise<{ workflowId: string; signaled: true }>;
  startOrSignalConversation(input: {
    conversation: ConversationRef;
    event: JsonValue;
    taskQueue: string;
  }): Promise<{ workflowId: string; signalWithStartRequested: true }>;
  closeConversationWorkflow(input: {
    conversation: ConversationRef;
    reason: string;
  }): Promise<{ workflowId: string; closed: true }>;
  scheduleFollowUp(input: {
    conversation: ConversationRef;
    followUp: FollowUpPlan;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; status: "scheduled" | "updated" | "deduplicated" }>;
  cancelFollowUp(input: {
    conversation: ConversationRef;
    followUpId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; status: "cancelled" | "deduplicated" }>;
  snoozeFollowUp(input: {
    conversation: ConversationRef;
    followUpId: string;
    runAt: IsoDateTime;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ followUpId: string; runAt: IsoDateTime; status: "snoozed" | "deduplicated" }>;
  scheduleAiWork(input: {
    conversation: ConversationRef;
    runAt: IsoDateTime;
    task: AiWorkTask;
    reason: string;
    context?: JsonValue;
    allowedActions?: AllowedAction[];
    requireHumanApproval?: boolean;
    idempotencyKey: string;
  }): Promise<ScheduledAiWork & { status: "scheduled" | "updated" | "deduplicated" }>;
}

export interface ToolDependencies {
  slack?: SlackContextPort;
  intelligence?: ConversationIntelligencePort;
  memory?: WorkspaceMemoryPort;
  safety?: SafetyReviewPort;
  temporal?: TemporalControlPort;
}
