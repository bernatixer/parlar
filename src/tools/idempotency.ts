import type { ToolExecutionContext } from "../domain/types.js";
import { ToolValidationError } from "./errors.js";

export function resolveIdempotencyKey(
  inputKey: string | undefined,
  context: ToolExecutionContext,
): string {
  const key = inputKey ?? context.idempotencyKey;
  if (!key || key.trim().length === 0) {
    throw new ToolValidationError("idempotencyKey is required for side-effecting tools");
  }
  return key;
}
