import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { DEFAULT_AI_MODEL } from "../src/ai/models.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.PARLAR_AI_MODEL || DEFAULT_AI_MODEL;

if (!apiKey) {
  throw new Error("ANTHROPIC_API_KEY is missing. Add it to .env or your shell environment.");
}

const result = await generateText({
  model: anthropic(model),
  prompt: 'Reply with exactly: "ok"',
  maxOutputTokens: 8,
});

if (!result.text.toLowerCase().includes("ok")) {
  throw new Error(`Unexpected AI smoke response: ${result.text}`);
}

console.log(`AI env smoke passed with model ${model}`);
