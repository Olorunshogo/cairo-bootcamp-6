# SpendingToken - Implementation Spec

## Assessment Objective

Build a controlled-spending ERC-20 token contract in Cairo that:

- Allows transfers only when `amount <= MAX_LIMIT` (hardcoded default: `10_000_u256`)
- Gives an admin the ability to revoke spenders, update limits, freeze/unfreeze transfers, and burn tokens
- Uses OpenZeppelin components (not a manual ERC-20 rewrite)
- Uses the OZ `before_update` hook as the single enforcement point for all transfer restrictions

---

## Environment

| Tool          | Version |
| ------------- | ------- |
| scarb         | 2.17.0  |
| starknet      | 2.17.0  |
| snforge_std   | 0.59.0  |
| cairo edition | 2024_07 |

---

## Scarb.toml - Final State

Replace the existing `Scarb.toml` with this exactly:

```toml
[package]
name = "spending_token"
version = "0.1.0"
edition = "2024_07"

[dependencies]
starknet = "2.17.0"
openzeppelin = "0.21.0"

[dev-dependencies]
snforge_std = "0.59.0"
assert_macros = "2.17.0"

[[target.starknet-contract]]
sierra = true

[scripts]
test = "snforge test"

[tool.scarb]
allow-prebuilt-plugins = ["snforge_std"]
```

> Note: `openzeppelin = "0.21.0"` is the version compatible with starknet `2.17.0`. If scarb resolves a different compatible version, use whatever it resolves - do not force a version that fails to fetch.

---

## Final Folder Structure

The project already has the right folders. The files to write are:

```
spending_token/
├── Scarb.toml                   <- update (add openzeppelin dep)
└── src/
    ├── lib.cairo                <- rewrite (clean module declarations only)
    ├── token.cairo              <- rewrite (main contract - full implementation)
    ├── interfaces.cairo         <- rewrite (ISpendingToken trait)
    ├── events.cairo             <- rewrite (custom events only)
    └── errors.cairo             <- rewrite (error constants only)
```

**Delete or ignore these files - they are not needed:**

- `src/storage.cairo` - storage lives inside `token.cairo`
- `src/hooks.cairo` - hook impl lives inside `token.cairo`

---

## File 1: `src/errors.cairo`

Complete file. No imports needed.

```cairo
// === Error Constants

pub const LIMIT_EXCEEDED: felt252 = 'LIMIT_EXCEEDED';
pub const SPENDER_LIMIT_EXCEEDED: felt252 = 'SPENDER_LIMIT_EXCEEDED';
pub const SPENDER_REVOKED: felt252 = 'SPENDER_REVOKED';
pub const TRANSFERS_FROZEN: felt252 = 'TRANSFERS_FROZEN';
pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
pub const ZERO_ADDRESS: felt252 = 'ZERO_ADDRESS';
pub const INVALID_LIMIT: felt252 = 'INVALID_LIMIT';
pub const ALREADY_FROZEN: felt252 = 'ALREADY_FROZEN';
pub const NOT_FROZEN: felt252 = 'NOT_FROZEN';
pub const ALREADY_REVOKED: felt252 = 'ALREADY_REVOKED';
pub const NOT_REVOKED: felt252 = 'NOT_REVOKED';
```

---

## File 2: `src/events.cairo`

Complete file. These are the custom events emitted by admin functions. OZ ERC20 already emits `Transfer` and `Approval` - do not redefine those here.

```cairo
// === Custom Events

use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct TransferLimitUpdated {
    #[key]
    pub old_limit: u256,
    pub new_limit: u256,
}

#[derive(Drop, starknet::Event)]
pub struct SpenderRevoked {
    #[key]
    pub spender: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct SpenderUnrevoked {
    #[key]
    pub spender: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct SpenderLimitSet {
    #[key]
    pub spender: ContractAddress,
    pub limit: u256,
}

#[derive(Drop, starknet::Event)]
pub struct TokensFrozen {}

#[derive(Drop, starknet::Event)]
pub struct TokensUnfrozen {}

#[derive(Drop, starknet::Event)]
pub struct TokensBurned {
    #[key]
    pub from: ContractAddress,
    pub amount: u256,
}
```

---

## File 3: `src/interfaces.cairo`

Complete file. This is the custom admin interface. OZ handles the standard ERC-20 interface separately via its own mixin.

```cairo
// === ISpendingToken Interface

use starknet::ContractAddress;

#[starknet::interface]
pub trait ISpendingToken<TContractState> {
    // === Admin - Limit Controls
    fn set_transfer_limit(ref self: TContractState, new_limit: u256);
    fn set_spender_limit(ref self: TContractState, spender: ContractAddress, limit: u256);

    // === Admin - Revoke Controls
    fn revoke_spender(ref self: TContractState, spender: ContractAddress);
    fn unrevoke_spender(ref self: TContractState, spender: ContractAddress);

    // === Admin - Freeze Controls
    fn freeze(ref self: TContractState);
    fn unfreeze(ref self: TContractState);

    // === Admin - Burn
    fn burn(ref self: TContractState, from: ContractAddress, amount: u256);

    // === Views
    fn get_transfer_limit(self: @TContractState) -> u256;
    fn get_spender_limit(self: @TContractState, spender: ContractAddress) -> u256;
    fn is_revoked(self: @TContractState, spender: ContractAddress) -> bool;
    fn is_frozen(self: @TContractState) -> bool;
}
```

---

## File 4: `src/lib.cairo`

Complete file. Module declarations only - no logic here.

```cairo
// === Modules

pub mod errors;
pub mod events;
pub mod interfaces;
pub mod token;
```

---

## File 5: `src/token.cairo`

This is the main file. Full implementation below.

### OZ imports to use

```cairo
use openzeppelin::token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
use openzeppelin::access::ownable::OwnableComponent;
use openzeppelin::introspection::src5::SRC5Component;
```

### Component declarations (inside the contract module)

```cairo
component!(path: ERC20Component, storage: erc20, event: ERC20Event);
component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
component!(path: SRC5Component, storage: src5, event: SRC5Event);
```

### Storage struct

```cairo
#[storage]
struct Storage {
    #[substorage(v0)]
    erc20: ERC20Component::Storage,
    #[substorage(v0)]
    ownable: OwnableComponent::Storage,
    #[substorage(v0)]
    src5: SRC5Component::Storage,

    // custom storage
    max_limit: u256,
    frozen: bool,
    revoked_spenders: starknet::storage::Map<starknet::ContractAddress, bool>,
    spender_limits: starknet::storage::Map<starknet::ContractAddress, u256>,
}
```

### Event enum

```cairo
#[event]
#[derive(Drop, starknet::Event)]
enum Event {
    #[flat]
    ERC20Event: ERC20Component::Event,
    #[flat]
    OwnableEvent: OwnableComponent::Event,
    #[flat]
    SRC5Event: SRC5Component::Event,

    // custom events
    TransferLimitUpdated: events::TransferLimitUpdated,
    SpenderRevoked: events::SpenderRevoked,
    SpenderUnrevoked: events::SpenderUnrevoked,
    SpenderLimitSet: events::SpenderLimitSet,
    TokensFrozen: events::TokensFrozen,
    TokensUnfrozen: events::TokensUnfrozen,
    TokensBurned: events::TokensBurned,
}
```

### ABI embeds

Embed the OZ mixins so the standard ERC-20 and Ownable interfaces are exposed:

```cairo
#[abi(embed_v0)]
impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;

#[abi(embed_v0)]
impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;

impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
```

### The hook impl - CRITICAL

This is where ALL transfer restrictions are enforced. It intercepts every mint, burn, and transfer that goes through OZ ERC20.

```cairo
impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
    fn before_update(
        ref self: ContractState,
        from: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) {
        let zero: ContractAddress = core::num::traits::Zero::zero();

        // Skip all checks for mints (from == zero) and burns (recipient == zero).
        // These are admin-controlled operations that must not be blocked.
        if from == zero || recipient == zero {
            return;
        }

        // 1. Freeze check - reject all transfers when frozen
        assert(!self.frozen.read(), errors::TRANSFERS_FROZEN);

        // 2. Zero amount check
        assert(amount > 0, errors::ZERO_AMOUNT);

        // 3. Revoked spender check - uses caller, not `from`
        let caller = starknet::get_caller_address();
        assert(!self.revoked_spenders.read(caller), errors::SPENDER_REVOKED);

        // 4. Global transfer limit check
        assert(amount <= self.max_limit.read(), errors::LIMIT_EXCEEDED);

        // 5. Per-spender limit check (only applies if a limit has been set, i.e. > 0)
        let spender_limit = self.spender_limits.read(caller);
        if spender_limit > 0 {
            assert(amount <= spender_limit, errors::SPENDER_LIMIT_EXCEEDED);
        }
    }

    fn after_update(
        ref self: ContractState,
        from: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) {}
}
```

### Constructor

```cairo
#[constructor]
fn constructor(
    ref self: ContractState,
    admin: ContractAddress,
    name: ByteArray,
    symbol: ByteArray,
    initial_supply: u256,
) {
    // Initialize OZ components
    self.erc20.initializer(name, symbol);
    self.ownable.initializer(admin);

    // Set default global transfer limit
    self.max_limit.write(10_000_u256);

    // Mint initial supply to admin
    self.erc20.mint(admin, initial_supply);
}
```

### ISpendingToken implementation

```cairo
#[abi(embed_v0)]
impl SpendingTokenImpl of interfaces::ISpendingToken<ContractState> {

    // === Admin - Limit Controls

    fn set_transfer_limit(ref self: ContractState, new_limit: u256) {
        self.ownable.assert_only_owner();
        assert(new_limit > 0, errors::INVALID_LIMIT);
        let old_limit = self.max_limit.read();
        self.max_limit.write(new_limit);
        self.emit(events::TransferLimitUpdated { old_limit, new_limit });
    }

    fn set_spender_limit(ref self: ContractState, spender: ContractAddress, limit: u256) {
        self.ownable.assert_only_owner();
        assert(spender != core::num::traits::Zero::zero(), errors::ZERO_ADDRESS);
        assert(limit > 0, errors::INVALID_LIMIT);
        self.spender_limits.write(spender, limit);
        self.emit(events::SpenderLimitSet { spender, limit });
    }

    // === Admin - Revoke Controls

    fn revoke_spender(ref self: ContractState, spender: ContractAddress) {
        self.ownable.assert_only_owner();
        assert(spender != core::num::traits::Zero::zero(), errors::ZERO_ADDRESS);
        assert(!self.revoked_spenders.read(spender), errors::ALREADY_REVOKED);
        self.revoked_spenders.write(spender, true);
        self.emit(events::SpenderRevoked { spender });
    }

    fn unrevoke_spender(ref self: ContractState, spender: ContractAddress) {
        self.ownable.assert_only_owner();
        assert(spender != core::num::traits::Zero::zero(), errors::ZERO_ADDRESS);
        assert(self.revoked_spenders.read(spender), errors::NOT_REVOKED);
        self.revoked_spenders.write(spender, false);
        self.emit(events::SpenderUnrevoked { spender });
    }

    // === Admin - Freeze Controls

    fn freeze(ref self: ContractState) {
        self.ownable.assert_only_owner();
        assert(!self.frozen.read(), errors::ALREADY_FROZEN);
        self.frozen.write(true);
        self.emit(events::TokensFrozen {});
    }

    fn unfreeze(ref self: ContractState) {
        self.ownable.assert_only_owner();
        assert(self.frozen.read(), errors::NOT_FROZEN);
        self.frozen.write(false);
        self.emit(events::TokensUnfrozen {});
    }

    // === Admin - Burn

    fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
        self.ownable.assert_only_owner();
        assert(from != core::num::traits::Zero::zero(), errors::ZERO_ADDRESS);
        assert(amount > 0, errors::ZERO_AMOUNT);
        self.erc20.burn(from, amount);
        self.emit(events::TokensBurned { from, amount });
    }

    // === Views

    fn get_transfer_limit(self: @ContractState) -> u256 {
        self.max_limit.read()
    }

    fn get_spender_limit(self: @ContractState, spender: ContractAddress) -> u256 {
        self.spender_limits.read(spender)
    }

    fn is_revoked(self: @ContractState, spender: ContractAddress) -> bool {
        self.revoked_spenders.read(spender)
    }

    fn is_frozen(self: @ContractState) -> bool {
        self.frozen.read()
    }
}
```

### Full `token.cairo` structure (assembly order)

Write the file in this exact order:

1. `use` imports (OZ components, starknet, local modules)
2. `component!` declarations
3. `#[storage]` struct
4. `#[event]` enum
5. `#[abi(embed_v0)]` mixin impls + internal impls
6. `ERC20HooksImpl` (the hook)
7. `#[constructor]`
8. `#[abi(embed_v0)] impl SpendingTokenImpl`

---

## Naming Decisions

| Old name (do not use)      | Correct name               |
| -------------------------- | -------------------------- |
| `pause()`                  | `freeze()`                 |
| `unpause()`                | `unfreeze()`               |
| `paused` (storage)         | `frozen` (storage)         |
| `Paused` (event)           | `TokensFrozen` (event)     |
| `Unpaused` (event)         | `TokensUnfrozen` (event)   |
| `TRANSFERS_PAUSED` (error) | `TRANSFERS_FROZEN` (error) |

---

## Hook Behavior - Exact Rules

The `before_update` hook fires on every ERC-20 state change (mint, burn, transfer).

| Condition                                                       | Action                              |
| --------------------------------------------------------------- | ----------------------------------- |
| `from == zero` (mint)                                           | skip all checks, return immediately |
| `recipient == zero` (burn)                                      | skip all checks, return immediately |
| `frozen == true`                                                | panic with `TRANSFERS_FROZEN`       |
| `amount == 0`                                                   | panic with `ZERO_AMOUNT`            |
| `revoked_spenders[caller] == true`                              | panic with `SPENDER_REVOKED`        |
| `amount > max_limit`                                            | panic with `LIMIT_EXCEEDED`         |
| `spender_limits[caller] > 0 && amount > spender_limits[caller]` | panic with `SPENDER_LIMIT_EXCEEDED` |

The check for `spender_limits` is conditional: if the limit is `0` (default/unset), the per-spender limit is not enforced. Only enforce it when the admin has explicitly set a limit for that address.

---

## Admin Functions - Complete List

| Function                            | Guard      | Validates                              | Emits                  |
| ----------------------------------- | ---------- | -------------------------------------- | ---------------------- |
| `set_transfer_limit(new_limit)`     | owner only | `new_limit > 0`                        | `TransferLimitUpdated` |
| `set_spender_limit(spender, limit)` | owner only | `spender != zero`, `limit > 0`         | `SpenderLimitSet`      |
| `revoke_spender(spender)`           | owner only | `spender != zero`, not already revoked | `SpenderRevoked`       |
| `unrevoke_spender(spender)`         | owner only | `spender != zero`, currently revoked   | `SpenderUnrevoked`     |
| `freeze()`                          | owner only | not already frozen                     | `TokensFrozen`         |
| `unfreeze()`                        | owner only | currently frozen                       | `TokensUnfrozen`       |
| `burn(from, amount)`                | owner only | `from != zero`, `amount > 0`           | `TokensBurned`         |

---

## What NOT to Do

- Do NOT rewrite ERC-20 from scratch. The existing `token.cairo` is a manual ERC-20 - delete its contents entirely and replace with the OZ-based implementation.
- Do NOT create a separate `storage.cairo` or `hooks.cairo` file. Both live inside `token.cairo`.
- Do NOT define `Transfer` or `Approval` events manually - OZ emits those.
- Do NOT use `felt252` for token amounts - use `u256`.
- Do NOT use `LegacyMap` - use `starknet::storage::Map`.
- Do NOT use `Zeroable::zero()` - use `core::num::traits::Zero::zero()`.
- Do NOT call `pause`/`unpause` anywhere - the correct names are `freeze`/`unfreeze`.
- Do NOT add tests yet - tests are a separate task.

---

## Build Verification

After writing all files, run:

```bash
scarb build
```

Expected: clean compile with no errors or warnings. If OZ import paths fail, check the OZ version resolved in `Scarb.lock` and adjust import paths to match that version's module structure.

Common OZ import paths for `0.21.x`:

```cairo
openzeppelin::token::erc20::ERC20Component
openzeppelin::access::ownable::OwnableComponent
openzeppelin::introspection::src5::SRC5Component
openzeppelin::token::erc20::ERC20HooksEmptyImpl  // not used directly but may be needed
```
