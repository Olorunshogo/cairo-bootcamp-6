# Spending Token: What Is Happening

## Overview

This contract is a standard ERC-20 with added spending controls.

It uses OpenZeppelin components and adds admin policy rules:

- global transfer cap (`max_limit`)
- per-spender revoke/unrevoke
- optional per-spender limit
- global freeze/unfreeze
- owner burn

The constructor receives `admin`, and that address becomes contract owner.

---

## Core Components

Inside `src/token.cairo`, the contract wires:

- `ERC20Component` (token behavior)
- `OwnableComponent` (owner-only authorization)
- `SRC5Component` (introspection)

So ERC-20 methods like `approve`, `allowance`, `transfer`, `transfer_from` are provided by OZ mixins, while your custom admin methods are implemented in `SpendingTokenImpl`.

---

## Storage Meaning

Custom storage fields:

- `max_limit: u256` -> max allowed amount per transfer
- `frozen: bool` -> global transfer stop flag
- `revoked_spenders: Map<ContractAddress, bool>` -> blocked delegated spenders
- `spender_limits: Map<ContractAddress, u256>` -> custom cap for specific spenders

Default in constructor:

- `max_limit = 10_000_u256`
- initial supply minted to `admin`

---

## Where Hooks Are Used

Hooks are used in `token.cairo` here:

- `impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState>`
- specifically in `before_update(...)`

This hook runs before ERC-20 balance state changes for transfer-like updates.

### `before_update` flow

1. If mint (`from == 0`) or burn (`recipient == 0`), return early.
2. Reject when frozen (`TRANSFERS_FROZEN`).
3. Reject zero amount (`ZERO_AMOUNT`).
4. Enforce global cap (`LIMIT_EXCEEDED`).
5. If delegated spend (`caller != from`):
   - enforce revoke block (`SPENDER_REVOKED`)
   - enforce optional spender cap (`SPENDER_LIMIT_EXCEEDED`)

This is the main policy engine for spending control.

`after_update(...)` exists but is empty right now.

---

## Approve vs Revoke vs Freeze

- `approve(spender, amount)` (ERC-20): user grants allowance.
- `revoke_spender(spender)` (admin): blocks that spender from delegated spending (`transfer_from` path).
- `freeze()` (admin): blocks transfers globally.

So they are complementary controls, not duplicates.

---

## Admin Functions (Owner Only)

All these call `assert_only_owner()`:

- `set_transfer_limit(new_limit)`
- `set_spender_limit(spender, limit)`
- `revoke_spender(spender)` / `unrevoke_spender(spender)`
- `freeze()` / `unfreeze()`
- `burn(from, amount)`

Each has validation checks (zero address, zero amount, state checks, etc.) and emits custom events.

---

## Why This Design Works

- Reuses OZ ERC-20 safely.
- Centralizes policy checks in one hook.
- Supports both broad emergency control (freeze) and targeted control (revoke per spender).
- Keeps ownership/admin responsibility explicit via constructor `admin`.
