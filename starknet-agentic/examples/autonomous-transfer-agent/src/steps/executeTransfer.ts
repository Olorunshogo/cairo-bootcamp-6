import type { AgentContext, McpClient, TransferResult } from "../types.js";
import { resolveTokenProfile, transferTokenArg } from "../tokens.js";

export async function runExecuteTransfer(
  mcp: McpClient,
  ctx: AgentContext,
  options: { forceDryRun?: boolean } = {},
): Promise<AgentContext> {
  const validation = ctx.validation;

  if (!validation?.shouldTransfer) {
    return {
      ...ctx,
      transfer: {
        status: "skipped",
        details: { reason: validation?.reason ?? "validation_failed" },
      },
    };
  }

  const { config } = ctx;
  const profile = resolveTokenProfile(config);
  const token = transferTokenArg(profile);
  const baseArgs = {
    recipient: config.transfer.recipient,
    token,
    amount: config.transfer.amount,
    gasfree: config.transfer.gasfree ?? false,
  };

  try {
    const dryRunResult = (await mcp.callTool("starknet_transfer", {
      ...baseArgs,
      dryRun: true,
    })) as Record<string, unknown>;

    if (options.forceDryRun) {
      return {
        ...ctx,
        transfer: {
          status: "simulated",
          dryRun: true,
          details: dryRunResult,
        },
      };
    }

    const liveResult = (await mcp.callTool("starknet_transfer", {
      ...baseArgs,
      dryRun: false,
    })) as {
      success?: boolean;
      transactionHash?: string | null;
      dryRun?: boolean;
    };

    return {
      ...ctx,
      transfer: {
        status: "completed",
        transactionHash: liveResult.transactionHash ?? null,
        dryRun: false,
        details: liveResult,
      },
    };
  } catch (error) {
    return {
      ...ctx,
      transfer: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
