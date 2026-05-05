export class ToolConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolConfigurationError";
  }
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolValidationError";
  }
}
