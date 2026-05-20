import type { AgentContext, McpClient, TransferValidation } from "../types.js";
import {
  compareDecimalStrings,
  isZeroAddress,
  subtractDecimalStrings,
} from "../decimal.js";
import { fetchOnChainTransferLimit, resolveTokenProfile } from "../tokens.js";

export async function runValidateTransfer(
  mcp: McpClient,
  ctx: AgentContext,
): Promise<AgentContext> {
  const { config, balance } = ctx;

  if (!balance) {
    return {
      ...ctx,
      validation: { shouldTransfer: false, reason: "balance_not_fetched" },
    };
  }

  if (!config.transfer.enabled) {
    return {
      ...ctx,
      validation: { shouldTransfer: false, reason: "transfer_disabled" },
    };
  }

  if (isZeroAddress(config.transfer.recipient)) {
    return {
      ...ctx,
      validation: { shouldTransfer: false, reason: "invalid_recipient" },
    };
  }

  const min = config.minBalanceForTransfer;
  if (compareDecimalStrings(balance.balance, min) <= 0) {
    return {
      ...ctx,
      validation: {
        shouldTransfer: false,
        reason: `balance ${balance.balance} not greater than min ${min}`,
      },
    };
  }

  const available = subtractDecimalStrings(
    balance.balance,
    config.reserveBalance,
  );
  const amount = config.transfer.amount;

  if (compareDecimalStrings(amount, "0") <= 0) {
    return {
      ...ctx,
      validation: {
        shouldTransfer: false,
        reason: "transfer_amount_must_be_positive",
      },
    };
  }

  if (compareDecimalStrings(amount, available) > 0) {
    return {
      ...ctx,
      validation: {
        shouldTransfer: false,
        reason: `amount ${amount} exceeds available ${available} after reserve ${config.reserveBalance}`,
      },
    };
  }

  let onChainTransferLimit: string | undefined;
  if (config.token === "MTK") {
    const profile = resolveTokenProfile(config);
    try {
      onChainTransferLimit = await fetchOnChainTransferLimit(
        mcp,
        profile.mcpToken,
      );
      if (
        onChainTransferLimit &&
        compareDecimalStrings(amount, onChainTransferLimit) > 0
      ) {
        return {
          ...ctx,
          validation: {
            shouldTransfer: false,
            reason: `amount ${amount} exceeds on-chain max_limit ${onChainTransferLimit}`,
            onChainTransferLimit,
          },
        };
      }
    } catch {
      // limit read optional if contract not deployed
    }
  }

  const validation: TransferValidation = {
    shouldTransfer: true,
    reason: "ok",
    onChainTransferLimit,
  };

  return { ...ctx, validation };
}
