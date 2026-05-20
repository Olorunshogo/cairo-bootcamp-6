# Autonomous Transfer Agent (Cursor + starknet-agentic MCP)

Use this skill when operating the composable transfer agent from **Cursor** with the **`user-starknet`** MCP server.

## Objectives checklist

Run these steps in order on MCP server `user-starknet`:

1. **Fetch wallet balance** — `starknet_get_balance` (STRK) or `starknet_call_contract` `balance_of` (MTK)
2. **Validate transfer condition** — ensure `balance > minBalanceForTransfer`, amount ≤ available after reserve; MTK: `get_transfer_limit`
3. **Transfer if balance > X** — only when validation passes; always `dryRun: true` first, then live
4. **Call another function or agent** — `postTransferHook` via invoke/call or Cursor `Task` subagent
5. **Log execution result** — write summary to `receipts/execution-receipt.json` (CLI) or report in chat
6. **Alert when balance below threshold** — emit prominent `ALERT` when `balance < lowBalanceAlertThreshold`

## Before you run

1. Read `agent.config.json` (or copy from `agent.config.example.json`)
2. Confirm `.env` has `STARKNET_ACCOUNT_ADDRESS` and signer credentials
3. Set `transfer.enabled: false` for read-only balance/alert checks

## Pipeline (MCP tool sequence)

### Step 1 — Fetch balance

**STRK profile:**

```json
{ "tool": "starknet_get_balance", "args": { "token": "STRK" } }
```

**MTK profile:**

```json
{
  "tool": "starknet_call_contract",
  "args": {
    "contractAddress": "<SPENDING_TOKEN_ADDRESS>",
    "entrypoint": "balance_of",
    "calldata": ["<STARKNET_ACCOUNT_ADDRESS>"]
  }
}
```

Fallback: `starknet_get_balance` with `token: "<contract address>"`.

### Step 2 — Low-balance alert (before transfer decision)

If `balance < lowBalanceAlertThreshold`, output:

```json
{
  "level": "ALERT",
  "event": "low_balance",
  "token": "STRK",
  "balance": "<current>",
  "threshold": "<lowBalanceAlertThreshold>"
}
```

Continue the pipeline even when alerting.

### Step 3 — Validate transfer

Do **not** call `starknet_transfer` unless all are true:

- `transfer.enabled === true`
- `balance > minBalanceForTransfer` (strictly greater than X)
- `transfer.amount > 0` and `amount <= balance - reserveBalance`
- Recipient is non-zero
- MTK: `amount <= get_transfer_limit` (optional `starknet_call_contract`)

### Step 4 — Execute transfer

```json
{
  "tool": "starknet_transfer",
  "args": {
    "recipient": "<from config>",
    "token": "STRK",
    "amount": "<from config>",
    "dryRun": true
  }
}
```

If dry-run succeeds and user approved live execution:

```json
{ "dryRun": false }
```

MTK: use `token: "<SPENDING_TOKEN_ADDRESS>"` instead of `"STRK"`.

### Step 5 — Post-transfer hook

| `postTransferHook.type` | Action                                                    |
| ----------------------- | --------------------------------------------------------- |
| `none`                  | Skip                                                      |
| `mcp_call`              | `starknet_call_contract` with configured entrypoint       |
| `mcp_invoke`            | `starknet_invoke_contract`                                |
| `subagent`              | Cursor `Task` with receipt summary + `prompt` from config |

Example MTK audit call:

```json
{
  "tool": "starknet_call_contract",
  "args": {
    "contractAddress": "<SPENDING_TOKEN_ADDRESS>",
    "entrypoint": "get_transfer_limit",
    "calldata": []
  }
}
```

### Step 6 — Log execution

Report: run id, balance, validation reason, transfer status/tx hash, alerts, post-hook status.

CLI users: run `pnpm run` in `examples/autonomous-transfer-agent/` to auto-write `receipts/execution-receipt.json`.

## Safety rules

- Never skip dry-run before a live transfer
- Never transfer when `balance <= minBalanceForTransfer`
- Respect `STARKNET_MCP_POLICY` if set (`maxAmountPerCall`, `allowedRecipients`)
- Do not log private keys in receipts or chat

## Example Cursor prompts

**Read-only tick (STRK):**

> Run the autonomous transfer agent STRK profile: fetch balance, check low-balance alert, skip transfer (`transfer.enabled` is false), write receipt summary.

**Conditional transfer:**

> Run autonomous transfer agent: fetch STRK balance, validate balance > 10, dry-run transfer 0.1 STRK to configured recipient, then execute live if dry-run succeeds.

**MTK + post-hook:**

> Run MTK profile: fetch balance, validate against on-chain transfer limit, dry-run transfer, then call `get_transfer_limit` as post-hook.

## Config reference

| Field                      | Purpose                                     |
| -------------------------- | ------------------------------------------- |
| `minBalanceForTransfer`    | Transfer only if balance **>** this value   |
| `lowBalanceAlertThreshold` | Emit alert if balance **<** this value      |
| `reserveBalance`           | Subtracted from balance before max transfer |
| `transfer.enabled`         | Kill-switch                                 |
| `postTransferHook`         | Downstream function or subagent             |
