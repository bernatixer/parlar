import { temporalProvider } from "@temporalio/ai-sdk";
import { generateText } from "ai";

export interface AiSdkSmokeWorkflowInput {
  model?: string;
  prompt: string;
}

export async function aiSdkSmokeWorkflow({
  model = "gpt-4o-mini",
  prompt,
}: AiSdkSmokeWorkflowInput): Promise<string> {
  const result = await generateText({
    model: temporalProvider.languageModel(model),
    system: "Answer concisely.",
    prompt,
  });

  return result.text;
}
