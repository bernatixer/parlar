import type {
  ActionItem,
  AllowedAction,
  ConversationRef,
  ConversationStatus,
  ConversationSummary,
  FollowUpPlan,
  JsonValue,
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

export type MemoryOwnerInput =
  | { kind: "workspace" }
  | { kind: "human"; slackUserId: SlackUserId };

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
    owners?: MemoryOwnerInput[];
    tags?: string[];
  }): Promise<{ decisionId: string; deduplicated: boolean }>;
  getRelatedConversationMemory(input: {
    conversation: ConversationRef;
    query: string;
    limit?: number;
    viewerSlackUserIds?: SlackUserId[];
    tags?: string[];
  }): Promise<{ memories: JsonValue[] }>;
  recordConversationSummary(input: {
    conversation: ConversationRef;
    summary: ConversationSummary;
    idempotencyKey: string;
    owners?: MemoryOwnerInput[];
    tags?: string[];
    contentOverride?: string;
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

export interface ToolDependencies {
  slack?: SlackContextPort;
  intelligence?: ConversationIntelligencePort;
  memory?: WorkspaceMemoryPort;
  safety?: SafetyReviewPort;
}
