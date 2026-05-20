import type { AgentContext } from "../types.js";
import { compareDecimalStrings } from "../decimal.js";
import { logAlert, writeLatestAlert } from "../logger.js";

export function runAlertCheck(ctx: AgentContext): AgentContext {
  if (!ctx.balance) {
    return ctx;
  }

  const { balance, config } = ctx;
  const threshold = config.lowBalanceAlertThreshold;

  if (compareDecimalStrings(balance.balance, threshold) >= 0) {
    return ctx;
  }

  const alert = {
    level: "ALERT" as const,
    event: "low_balance" as const,
    token: balance.token,
    balance: balance.balance,
    threshold,
    timestamp: new Date().toISOString(),
  };

  logAlert(alert);
  writeLatestAlert(alert);

  return {
    ...ctx,
    alerts: [...ctx.alerts, alert],
  };
}
