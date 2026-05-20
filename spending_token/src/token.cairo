// === Imports
use core::num::traits::Zero;
use openzeppelin::access::ownable::OwnableComponent;
use openzeppelin::introspection::src5::SRC5Component;
use openzeppelin::token::erc20::{DefaultConfig, ERC20Component};
use starknet::storage::{
    Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
    StoragePointerWriteAccess,
};
use starknet::{ContractAddress, get_caller_address};

use crate::errors;
use crate::events;
use crate::interfaces;

#[starknet::contract]
mod SpendingToken {
    use super::*;

    // === Component Wiring
    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // === Storage
    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,

        max_limit: u256,
        frozen: bool,
        revoked_spenders: Map<ContractAddress, bool>,
        spender_limits: Map<ContractAddress, u256>,
    }

    // === Events
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,

        TransferLimitUpdated: events::TransferLimitUpdated,
        SpenderRevoked: events::SpenderRevoked,
        SpenderUnrevoked: events::SpenderUnrevoked,
        SpenderLimitSet: events::SpenderLimitSet,
        TokensFrozen: events::TokensFrozen,
        TokensUnfrozen: events::TokensUnfrozen,
        TokensBurned: events::TokensBurned,
    }

    // === Embedded ABIs
    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;

    // === Internal Component Traits
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    // === Transfer Policy Hooks
    // Enforces all runtime transfer restrictions in one centralized place.
    impl ERC20HooksImpl of ERC20Component::ERC20HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC20Component::ComponentState<ContractState>,
            from: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            let contract_state = self.get_contract();
            let zero: ContractAddress = Zero::zero();

            // Skip policy checks for mint and burn flows.
            if from == zero || recipient == zero {
                return;
            }

            // Global transfer controls.
            assert(!contract_state.frozen.read(), errors::TRANSFERS_FROZEN);
            assert(amount > 0, errors::ZERO_AMOUNT);
            let caller = get_caller_address();
            assert(amount <= contract_state.max_limit.read(), errors::LIMIT_EXCEEDED);

            // Revoke/per-spender limits target delegated spending (transfer_from),
            // where caller acts as spender for `from`.
            if caller != from {
                assert(!contract_state.revoked_spenders.read(caller), errors::SPENDER_REVOKED);

                let spender_limit = contract_state.spender_limits.read(caller);
                if spender_limit > 0 {
                    assert(amount <= spender_limit, errors::SPENDER_LIMIT_EXCEEDED);
                }
            }
        }

        fn after_update(
            ref self: ERC20Component::ComponentState<ContractState>,
            from: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
        }
    }

    // === Constructor
    // Sets admin ownership, initializes token metadata, default limit, and initial mint.
    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        initial_supply: u256,
    ) {
        self.erc20.initializer("MosesToken", "MTK");
        self.ownable.initializer(admin);

        self.max_limit.write(10_000_u256);

        self.erc20.mint(admin, initial_supply);
    }

    // === Admin and View Interface
    #[abi(embed_v0)]
    impl SpendingTokenImpl of interfaces::ISpendingToken<ContractState> {
        // === Admin: Limit Controls
        fn set_transfer_limit(ref self: ContractState, new_limit: u256) {
            self.ownable.assert_only_owner();
            assert(new_limit > 0, errors::INVALID_LIMIT);
            let old_limit = self.max_limit.read();
            self.max_limit.write(new_limit);
            self.emit(events::TransferLimitUpdated { old_limit, new_limit });
        }

        fn set_spender_limit(ref self: ContractState, spender: ContractAddress, limit: u256) {
            self.ownable.assert_only_owner();
            assert(spender != Zero::zero(), errors::ZERO_ADDRESS);
            assert(limit > 0, errors::INVALID_LIMIT);
            self.spender_limits.write(spender, limit);
            self.emit(events::SpenderLimitSet { spender, limit });
        }

        // === Admin: Revoke Controls
        fn revoke_spender(ref self: ContractState, spender: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(spender != Zero::zero(), errors::ZERO_ADDRESS);
            assert(!self.revoked_spenders.read(spender), errors::ALREADY_REVOKED);
            self.revoked_spenders.write(spender, true);
            self.emit(events::SpenderRevoked { spender });
        }

        fn unrevoke_spender(ref self: ContractState, spender: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(spender != Zero::zero(), errors::ZERO_ADDRESS);
            assert(self.revoked_spenders.read(spender), errors::NOT_REVOKED);
            self.revoked_spenders.write(spender, false);
            self.emit(events::SpenderUnrevoked { spender });
        }

        // === Admin: Freeze Controls
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

        // === Admin: Burn
        fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
            self.ownable.assert_only_owner();
            assert(from != Zero::zero(), errors::ZERO_ADDRESS);
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
}
