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
- specifically in `before_update(...)` and `after_update(...)`

The hook pair wraps every ERC-20 balance/supply update.

### Hook lifecycle (exact order)

For ERC-20 state-changing actions (`transfer`, `transfer_from`, `mint`, `burn`), the execution order is:

1. External/internal ERC-20 function is called.
2. `before_update(ref self, from, recipient, amount)` runs first.
3. If any assertion fails in `before_update`, the whole transaction reverts and no state is changed.
4. If checks pass, ERC-20 mutates balances/supply.
5. `after_update(ref self, from, recipient, amount)` runs last.

So yes: policy checks happen before token amount mutation.

### `before_update` breakdown in this contract

1. Build helper values:
- fetch contract state (`self.get_contract()`)
- define zero address (`Zero::zero()`)

2. Mint/burn bypass:
- if `from == zero` (mint) OR `recipient == zero` (burn), return immediately
- this intentionally skips transfer policy checks for mint and burn flows

3. Global checks for real transfers:
- reject if token is frozen (`TRANSFERS_FROZEN`)
- reject `amount == 0` (`ZERO_AMOUNT`)
- enforce `amount <= max_limit` (`LIMIT_EXCEEDED`)

4. Delegated-spender checks (`transfer_from` path):
- if `caller != from`, caller is acting as spender
- reject if spender is revoked (`SPENDER_REVOKED`)
- if spender has custom limit (`spender_limit > 0`), enforce `amount <= spender_limit` (`SPENDER_LIMIT_EXCEEDED`)

### What `after_update` does now

`after_update(...)` is currently empty, so it performs no extra post-transfer action.

We can later use it for post-state side effects (for example accounting counters, telemetry events, or external policy integrations).

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

SRC5 (Introspection)
- Purpose: exposes a standard introspection API so other contracts/tools can discover supported token interfaces and metadata.
- Effect: makes the token self-describing and interoperable with tooling that queries SRC5 capabilities.

Before-update hook (line-by-line, concise):
- Signature: called before any ERC20 update; params: `self`, `from`, `recipient`, `amount`.
- `let contract_state = self.get_contract();`: access top-level storage.
- `let zero: ContractAddress = Zero::zero();`: canonical zero address (mint/burn detection).
- `if from == zero || recipient == zero { return; }`: skip checks for mint/burn.
- `assert(!contract_state.frozen.read(), TRANSFERS_FROZEN);`: block when frozen.
- `assert(amount > 0, ZERO_AMOUNT);`: disallow zero transfers.
- `let caller = get_caller_address();`: caller may be spender in `transfer_from`.
- `assert(amount <= contract_state.max_limit.read(), LIMIT_EXCEEDED);`: enforce global per-transfer cap.
- `if caller != from { ... }`: delegated-spend checks:
  - `assert(!revoked_spenders.read(caller), SPENDER_REVOKED);`
  - `let spender_limit = spender_limits.read(caller); if spender_limit > 0 { assert(amount <= spender_limit, SPENDER_LIMIT_EXCEEDED); }`

Why use components
- Reuse: audited implementations (ERC20, Ownable, SRC5).
- Isolation: each component owns its storage (avoid collisions).
- Composition: embed/override behavior via mixins/hooks (e.g., `before_update`).
- ABI/events: components embed ABIs and forward events into contract `Event`.

What `component!(...)` does
- `path`: component type (e.g., `ERC20Component`).
- `storage`: storage field in `#[storage]` (e.g., `erc20`).
- `event`: event variant to flatten component events into contract `Event`.
- Result: wires storage, methods, and event routing so you can call `self.erc20.*`.

`#[abi(embed_v0)] impl ...MixinImpl = ...`
- Embeds the component’s external ABI (mixin functions) into the contract ABI.
- Makes component-provided external functions callable and visible in the contract ABI.

`impl ...InternalImpl = ...Component::InternalImpl<ContractState>`
- Instantiates the component’s internal trait implementation for this contract’s `ContractState`.
- Binds generic component internals to our concrete storage so hooks and helpers access `self.get_contract()`.

One-line justification (pasteable):
This contract uses OpenZeppelin Cairo components (ERC20, Ownable, SRC5) to reuse audited logic, isolate storage, and expose standard ABIs; `component!` wires storage/events, `#[abi(embed_v0)]` embeds ABIs, and `impl ...InternalImpl = ...<ContractState>` binds internals to our storage so hooks (like `before_update`) work.

