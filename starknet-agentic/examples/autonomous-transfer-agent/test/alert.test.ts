import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runAlertCheck } from "../src/steps/alert.js";
import type { AgentConfig, AgentContext } from "../src/types.js";

const baseConfig: AgentConfig = {
  network: "sepolia",
  token: "STRK",
  minBalanceForTransfer: "10",
  lowBalanceAlertThreshold: "5",
  reserveBalance: "1",
  transfer: {
    enabled: false,
    recipient:
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    amount: "1",
    gasfree: false,
  },
  spendingToken: { address: "", symbol: "MTK" },
  postTransferHook: { type: "none" },
};

function baseCtx(balance: string): AgentContext {
  return {
    runId: "test-run",
    startedAt: new Date().toISOString(),
    config: baseConfig,
    accountAddress: "0x1",
    balance: {
      address: "0x1",
      token: "STRK",
      balance,
    },
    alerts: [],
    steps: [],
  };
}

describe("runAlertCheck", () => {
  it("emits alert when balance below threshold", () => {
    const ctx = runAlertCheck(baseCtx("3"));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0]?.event, "low_balance");
    assert.equal(ctx.alerts[0]?.balance, "3");
    assert.equal(ctx.alerts[0]?.threshold, "5");
  });

  it("does not alert when balance at or above threshold", () => {
    const ctx = runAlertCheck(baseCtx("5"));
    assert.equal(ctx.alerts.length, 0);
  });

  it("does not alert when balance above threshold", () => {
    const ctx = runAlertCheck(baseCtx("12"));
    assert.equal(ctx.alerts.length, 0);
  });
});
