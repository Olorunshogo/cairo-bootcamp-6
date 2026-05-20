import type { AgentContext, McpClient, StepResult } from "../types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function runPostHook(
  mcp: McpClient,
  ctx: AgentContext,
): Promise<AgentContext> {
  const hook = ctx.config.postTransferHook;
  const startedAt = nowIso();

  if (hook.type === "none") {
    const step: StepResult = {
      id: "postHook",
      title: "Post-transfer hook",
      status: "skipped",
      startedAt,
      endedAt: nowIso(),
      details: { reason: "none" },
    };
    return { ...ctx, postHook: step };
  }

  if (
    ctx.transfer?.status !== "completed" &&
    ctx.transfer?.status !== "simulated"
  ) {
    const step: StepResult = {
      id: "postHook",
      title: "Post-transfer hook",
      status: "skipped",
      startedAt,
      endedAt: nowIso(),
      details: {
        reason: "transfer_not_completed",
        transferStatus: ctx.transfer?.status,
      },
    };
    return { ...ctx, postHook: step };
  }

  if (hook.type === "subagent") {
    const step: StepResult = {
      id: "postHook",
      title: "Post-transfer hook (subagent)",
      status: "skipped",
      startedAt,
      endedAt: nowIso(),
      details: {
        reason: "subagent_deferred_to_cursor",
        prompt: hook.prompt,
        description: hook.description,
        receiptSummary: {
          runId: ctx.runId,
          transfer: ctx.transfer,
          balance: ctx.balance?.balance,
        },
      },
    };
    return { ...ctx, postHook: step };
  }

  const contractAddress =
    hook.contractAddress ||
    (ctx.config.token === "MTK" ? ctx.config.spendingToken.address : "");

  if (!contractAddress) {
    const step: StepResult = {
      id: "postHook",
      title: "Post-transfer hook",
      status: "failed",
      startedAt,
      endedAt: nowIso(),
      error: "postTransferHook.contractAddress is required",
    };
    return { ...ctx, postHook: step };
  }

  try {
    const toolName =
      hook.type === "mcp_invoke"
        ? "starknet_invoke_contract"
        : "starknet_call_contract";

    const args: Record<string, unknown> = {
      contractAddress,
      entrypoint: hook.entrypoint,
      calldata: hook.calldata ?? [],
    };

    if (hook.type === "mcp_invoke" && hook.gasfree) {
      args.gasfree = true;
    }

    const result = await mcp.callTool(toolName, args);

    const step: StepResult = {
      id: "postHook",
      title: `Post-transfer hook (${hook.type})`,
      status: "ok",
      startedAt,
      endedAt: nowIso(),
      details: { tool: toolName, result },
    };
    return { ...ctx, postHook: step };
  } catch (error) {
    const step: StepResult = {
      id: "postHook",
      title: "Post-transfer hook",
      status: "failed",
      startedAt,
      endedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    };
    return { ...ctx, postHook: step };
  }
}
