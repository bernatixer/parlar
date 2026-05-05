import { temporalProvider } from "@temporalio/ai-sdk";
import { generateText } from "ai";
import { DEFAULT_AI_MODEL } from "../ai/models.js";

export interface AiSdkSmokeWorkflowInput {
  model?: string;
  prompt: string;
}

export async function aiSdkSmokeWorkflow({
  model = DEFAULT_AI_MODEL,
  prompt,
}: AiSdkSmokeWorkflowInput): Promise<string> {
  const result = await generateText({
    model: temporalProvider.languageModel(model),
    system: "Answer concisely.",
    prompt,
  });

  return result.text;
}
