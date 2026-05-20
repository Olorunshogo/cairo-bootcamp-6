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
