import { ToolConfigurationError } from "./errors.js";
import type { ToolDependencies } from "./ports.js";

export function requirePort<K extends keyof ToolDependencies>(
  dependencies: ToolDependencies,
  name: K,
): NonNullable<ToolDependencies[K]> {
  const port = dependencies[name];
  if (!port) {
    throw new ToolConfigurationError(`Missing ${String(name)} port for tool execution`);
  }
  return port;
}
