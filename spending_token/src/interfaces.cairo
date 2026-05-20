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
