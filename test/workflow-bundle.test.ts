import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { bundleWorkflowCode } from "@temporalio/worker";

describe("Temporal workflow bundle", () => {
  it("bundles conversation workflows with Temporal's worker bundler", async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: path.resolve("src/workflows/conversationWorkflow.ts"),
    });

    assert.ok(bundle.code.length > 0);
  });

  it("bundles AI SDK workflows with Temporal's AI plugin imports", async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: path.resolve("src/workflows/aiSdkSmokeWorkflow.ts"),
    });

    assert.ok(bundle.code.includes("aiSdkSmokeWorkflow"));
  });
});
