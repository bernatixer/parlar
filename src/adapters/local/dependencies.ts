import type { SlackMessage } from "../../domain/types.js";
import type { ToolDependencies } from "../../tools/index.js";
import { DefaultSafetyReviewPort, type DefaultSafetyReviewOptions } from "./defaultSafetyReview.js";
import { HeuristicConversationIntelligencePort } from "./heuristicIntelligence.js";
import {
  InMemorySlackContextPort,
  type InMemorySlackChannel,
  type InMemorySlackOptions,
  type InMemorySlackUser,
} from "./inMemorySlack.js";
import { InMemoryTemporalControlPort } from "./inMemoryTemporalControl.js";
import {
  InMemoryWorkspaceMemoryPort,
  type InMemoryWorkspaceMemoryOptions,
} from "./inMemoryWorkspaceMemory.js";

export interface LocalToolDependenciesOptions {
  slack?: InMemorySlackOptions;
  memory?: InMemoryWorkspaceMemoryOptions;
  safety?: DefaultSafetyReviewOptions;
}

export interface LocalToolDependencies extends ToolDependencies {
  slack: InMemorySlackContextPort;
  intelligence: HeuristicConversationIntelligencePort;
  memory: InMemoryWorkspaceMemoryPort;
  safety: DefaultSafetyReviewPort;
  temporal: InMemoryTemporalControlPort;
}

export function createLocalToolDependencies(
  options: LocalToolDependenciesOptions = {},
): LocalToolDependencies {
  return {
    slack: new InMemorySlackContextPort(options.slack),
    intelligence: new HeuristicConversationIntelligencePort(),
    memory: new InMemoryWorkspaceMemoryPort(options.memory),
    safety: new DefaultSafetyReviewPort(options.safety),
    temporal: new InMemoryTemporalControlPort(),
  };
}

export function createLocalToolDependenciesFromSlackSeed(seed: {
  channels?: readonly InMemorySlackChannel[];
  users?: readonly InMemorySlackUser[];
  messages?: readonly SlackMessage[];
}): LocalToolDependencies {
  return createLocalToolDependencies({ slack: seed });
}
