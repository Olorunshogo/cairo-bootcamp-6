import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runValidateTransfer } from "../src/steps/validateTransfer.js";
import type { AgentConfig, AgentContext, McpClient } from "../src/types.js";

const recipient =
  "0x0000000000000000000000000000000000000000000000000000000000000002";

const baseConfig: AgentConfig = {
  network: "sepolia",
  token: "STRK",
  minBalanceForTransfer: "10",
  lowBalanceAlertThreshold: "5",
  reserveBalance: "1",
  transfer: {
    enabled: true,
    recipient,
    amount: "2",
    gasfree: false,
  },
  spendingToken: { address: "", symbol: "MTK" },
  postTransferHook: { type: "none" },
};

const mockMcp: McpClient = {
  callTool: async () => {
    throw new Error("MCP should not be called for STRK validation tests");
  },
  listTools: async () => [],
  close: async () => {},
};

function ctxWithBalance(
  balance: string,
  overrides?: Partial<AgentConfig>,
): AgentContext {
  return {
    runId: "test-run",
    startedAt: new Date().toISOString(),
    config: { ...baseConfig, ...overrides },
    accountAddress: "0x1",
    balance: { address: "0x1", token: "STRK", balance },
    alerts: [],
    steps: [],
  };
}

describe("runValidateTransfer", () => {
  it("rejects when balance not greater than min", async () => {
    const result = await runValidateTransfer(mockMcp, ctxWithBalance("10"));
    assert.equal(result.validation?.shouldTransfer, false);
    assert.match(result.validation?.reason ?? "", /not greater than min/);
  });

  it("rejects when balance below min", async () => {
    const result = await runValidateTransfer(mockMcp, ctxWithBalance("5"));
    assert.equal(result.validation?.shouldTransfer, false);
  });

  it("approves when balance above min and amount within reserve", async () => {
    const result = await runValidateTransfer(mockMcp, ctxWithBalance("15"));
    assert.equal(result.validation?.shouldTransfer, true);
    assert.equal(result.validation?.reason, "ok");
  });

  it("rejects when transfer disabled", async () => {
    const result = await runValidateTransfer(
      mockMcp,
      ctxWithBalance("20", {
        transfer: { ...baseConfig.transfer, enabled: false },
      }),
    );
    assert.equal(result.validation?.shouldTransfer, false);
    assert.equal(result.validation?.reason, "transfer_disabled");
  });

  it("rejects when amount exceeds available after reserve", async () => {
    const result = await runValidateTransfer(
      mockMcp,
      ctxWithBalance("11", {
        transfer: { ...baseConfig.transfer, amount: "10.5" },
      }),
    );
    assert.equal(result.validation?.shouldTransfer, false);
    assert.match(result.validation?.reason ?? "", /exceeds available/);
  });
});
