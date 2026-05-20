# Autonomous Transfer Agent

Composable autonomous transfer agent built on **starknet-agentic** MCP tools. Implements six objectives in a deterministic step pipeline.

## Objectives

| #   | Objective                      | Step               | MCP tool                                                                |
| --- | ------------------------------ | ------------------ | ----------------------------------------------------------------------- |
| 1   | Fetch wallet balance           | `fetchBalance`     | `starknet_get_balance` / `starknet_call_contract`                       |
| 2   | Validate transfer condition    | `validateTransfer` | App rules + optional `get_transfer_limit`                               |
| 3   | Transfer if balance > X        | `executeTransfer`  | `starknet_transfer` (dry-run then live)                                 |
| 4   | Call another function or agent | `postHook`         | `starknet_invoke_contract` / `starknet_call_contract` / Cursor subagent |
| 5   | Log execution result           | pipeline           | `receipts/execution-receipt.json`                                       |
| 6   | Alert on low balance           | `alert`            | JSON `ALERT` + `receipts/latest-alert.json`                             |

## Quick start (CLI)

```bash
cd examples/autonomous-transfer-agent
cp .env.example .env
cp agent.config.example.json agent.config.json
# Edit .env: STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY

pnpm install
pnpm run:strk-sepolia              # read-only when transfer.enabled=false
pnpm run:strk-sepolia:dry           # simulate transfer only
```

From the **monorepo root** (`starknet-agentic/`):

```bash
pnpm --filter @starknetfoundation/starknet-agentic-autonomous-transfer-agent run run:strk-sepolia
```

To pass custom flags to the script, use `--` so pnpm does not consume them:

```bash
cd examples/autonomous-transfer-agent
pnpm run -- --profile strk-sepolia --dry-run
```

Build MCP server first (from repo root):

```bash
pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build
```

## Configuration

- **`agent.config.json`** — thresholds (`minBalanceForTransfer`, `lowBalanceAlertThreshold`), transfer target, post-hook
- **Profiles** in `agent.config.example.json`: `strk-sepolia`, `mtk-spending-token`
- **`SPENDING_TOKEN_ADDRESS`** — required for MTK profile (bootcamp SpendingToken contract)

## Cursor (user-starknet MCP)

Use [`SKILL.md`](./SKILL.md) when running from Cursor with the `user-starknet` MCP server connected.

## Outputs

- `receipts/execution-receipt.json` — latest run summary
- `receipts/run-<timestamp>-<id>.json` — archived run
- `receipts/latest-alert.json` — last low-balance alert

## Smoke test (Sepolia STRK)

1. Set `transfer.enabled: false` in config → run should fetch balance and emit alert if below threshold.
2. Fund wallet from [Starknet faucet](https://starknet-faucet.vercel.app/).
3. Set `transfer.enabled: true`, small `amount`, valid `recipient` → `pnpm run:dry` then `pnpm run`.

## Tests

From repo root (with workspace install):

```bash
cd examples/autonomous-transfer-agent
pnpm install && pnpm test && pnpm typecheck
```

Or reuse sibling example deps:

```bash
cd examples/carry-agent
node --test --import tsx ../autonomous-transfer-agent/test/*.test.ts
```

## Related

- [starknet-mcp-server](../../packages/starknet-mcp-server/)
- [Smoke checklist](./docs/SMOKE.md)
- [starkzap-onboard-transfer](../starkzap-onboard-transfer/)
- [secure-defi-demo](../secure-defi-demo/)
