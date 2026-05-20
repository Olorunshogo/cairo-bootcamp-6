import { randomUUID } from "node:crypto";

import type {
  AgentConfig,
  AgentContext,
  McpClient,
  RunReceipt,
  StepResult,
} from "../types.js";
import { log, writeReceipt } from "../logger.js";
import { runFetchBalance } from "./fetchBalance.js";
import { runAlertCheck } from "./alert.js";
import { runValidateTransfer } from "./validateTransfer.js";
import { runExecuteTransfer } from "./executeTransfer.js";
import { runPostHook } from "./postHook.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function runStep(
  id: string,
  title: string,
  fn: () => Promise<Record<string, unknown> | undefined>,
): Promise<StepResult> {
  const startedAt = nowIso();
  try {
    const details = await fn();
    return {
      id,
      title,
      status: "ok",
      startedAt,
      endedAt: nowIso(),
      details,
    };
  } catch (error) {
    return {
      id,
      title,
      status: "failed",
      startedAt,
      endedAt: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface PipelineOptions {
  dryRunOnly?: boolean;
}

export async function runPipeline(
  mcp: McpClient,
  config: AgentConfig,
  accountAddress: string,
  options: PipelineOptions = {},
): Promise<RunReceipt> {
  const runId = randomUUID();
  const startedAt = nowIso();

  let ctx: AgentContext = {
    runId,
    startedAt,
    config,
    accountAddress,
    alerts: [],
    steps: [],
  };

  log("INFO", "Pipeline started", { runId, token: config.token });

  const fetchStep = await runStep(
    "fetchBalance",
    "Fetch wallet balance",
    async () => {
      ctx = await runFetchBalance(mcp, ctx);
      return {
        balance: ctx.balance?.balance,
        token: ctx.balance?.token,
        tokenAddress: ctx.balance?.tokenAddress,
      };
    },
  );
  ctx.steps.push(fetchStep);

  const alertStep = await runStep(
    "alert",
    "Low-balance alert check",
    async () => {
      const before = ctx.alerts.length;
      ctx = runAlertCheck(ctx);
      return {
        alertsEmitted: ctx.alerts.length - before,
        alerts: ctx.alerts,
      };
    },
  );
  ctx.steps.push(alertStep);

  const validateStep = await runStep(
    "validateTransfer",
    "Validate transfer conditions",
    async () => {
      ctx = await runValidateTransfer(mcp, ctx);
      return {
        shouldTransfer: ctx.validation?.shouldTransfer,
        reason: ctx.validation?.reason,
        onChainTransferLimit: ctx.validation?.onChainTransferLimit,
      };
    },
  );
  ctx.steps.push(validateStep);

  const transferStep = await runStep(
    "executeTransfer",
    "Execute transfer (dry-run then live)",
    async () => {
      ctx = await runExecuteTransfer(mcp, ctx, {
        forceDryRun: options.dryRunOnly,
      });
      return {
        status: ctx.transfer?.status,
        transactionHash: ctx.transfer?.transactionHash,
        error: ctx.transfer?.error,
      };
    },
  );
  ctx.steps.push(transferStep);

  const hookStep = await runStep("postHook", "Post-transfer hook", async () => {
    ctx = await runPostHook(mcp, ctx);
    return {
      status: ctx.postHook?.status,
      details: ctx.postHook?.details,
      error: ctx.postHook?.error,
    };
  });
  ctx.steps.push(hookStep);

  const endedAt = nowIso();
  const receipt: RunReceipt = {
    runId,
    startedAt,
    endedAt,
    config,
    accountAddress,
    balance: ctx.balance,
    validation: ctx.validation,
    transfer: ctx.transfer,
    postHook: ctx.postHook,
    alerts: ctx.alerts,
    steps: ctx.steps,
  };

  const receiptPath = writeReceipt(receipt);
  log("INFO", "Pipeline completed", {
    runId,
    receiptPath,
    transferStatus: ctx.transfer?.status,
    alertCount: ctx.alerts.length,
  });

  return receipt;
}
