import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { createHash } from "node:crypto";

export interface MemoryEmbedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

export interface OpenAIEmbedderOptions {
  model?: string;
  dimensions?: number;
}

export function createOpenAIEmbedder(
  options: OpenAIEmbedderOptions = {},
): MemoryEmbedder {
  const modelName = options.model ?? "text-embedding-3-small";
  const dimensions = options.dimensions ?? 1536;
  const model = openai.embedding(modelName);

  return {
    dimensions,
    async embed(text) {
      const result = await embed({ model, value: text });
      return result.embedding;
    },
  };
}

/**
 * Deterministic local embedder for tests and seed runs that should not
 * depend on the OpenAI API. Maps text to a vector using a token-bag hash;
 * vectors are L2-normalized so cosine distance is meaningful and similar
 * inputs land near each other.
 */
export interface FakeEmbedderOptions {
  dimensions?: number;
}

export function createFakeEmbedder(
  options: FakeEmbedderOptions = {},
): MemoryEmbedder {
  const dimensions = options.dimensions ?? 1536;

  return {
    dimensions,
    async embed(text) {
      const tokens = tokenize(text);
      const vec = new Array<number>(dimensions).fill(0);
      for (const token of tokens) {
        const idx = stableHash(token) % dimensions;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
      // l2 normalize
      let norm = 0;
      for (const v of vec) norm += v * v;
      norm = Math.sqrt(norm);
      if (norm === 0) {
        const seedIdx = stableHash(text) % dimensions;
        vec[seedIdx] = 1;
        return vec;
      }
      return vec.map((v) => v / norm);
    },
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function stableHash(input: string): number {
  // Use the first 4 bytes of a sha256 as a non-negative 32-bit integer.
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0);
}

export function createDefaultEmbedder(): MemoryEmbedder {
  if (process.env.OPENAI_API_KEY) {
    return createOpenAIEmbedder();
  }
  return createFakeEmbedder();
}
