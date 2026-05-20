# Sepolia smoke test checklist

## Prerequisites

1. Build MCP server: `pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build` (from repo root)
2. Copy config: `cp .env.example .env` and `cp agent.config.example.json agent.config.json`
3. Set `STARKNET_ACCOUNT_ADDRESS` and `STARKNET_PRIVATE_KEY` in `.env`

## 1. STRK read-only (objectives 1, 5, 6)

In `agent.config.json`, use profile `strk-sepolia` or set:

- `transfer.enabled: false`
- `lowBalanceAlertThreshold` above your current STRK balance to force an alert, or below to skip alert

```bash
pnpm run:strk-sepolia
```

**Expect:**

- Step `fetchBalance` → `ok` with balance in receipt
- Step `alert` → may emit `ALERT` JSON on stdout
- Step `validateTransfer` → `shouldTransfer: false`, reason `transfer_disabled`
- `receipts/execution-receipt.json` written

## 2. STRK dry-run transfer (objectives 2, 3)

- Fund wallet via [Starknet faucet](https://starknet-faucet.vercel.app/)
- Set `transfer.enabled: true`, `minBalanceForTransfer` below your balance, small `amount`

```bash
pnpm run:strk-sepolia:dry
```

**Expect:** `transfer.status: simulated`, no `transactionHash`

## 3. STRK live transfer (optional)

```bash
pnpm run:strk-sepolia
```

**Expect:** `transfer.status: completed`, `transactionHash` in receipt

## 4. Policy rejection (optional)

Set in `.env`:

```json
STARKNET_MCP_POLICY={"transfer":{"maxAmountPerCall":"0.001"}}
```

Run with transfer amount above limit → `executeTransfer` step `failed`

## 5. MTK profile

Deploy SpendingToken from `cairo-bootcamp-6/spending_token`, then:

```bash
export SPENDING_TOKEN_ADDRESS=0x<deployed>
pnpm run:mtk-spending-token
```

**Expect:** `balance_of` read, `get_transfer_limit` in post-hook when configured
