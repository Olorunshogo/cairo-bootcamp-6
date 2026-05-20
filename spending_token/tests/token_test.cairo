use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use spending_token::interfaces::{
    ISpendingTokenDispatcher, ISpendingTokenDispatcherTrait, ISpendingTokenSafeDispatcher,
    ISpendingTokenSafeDispatcherTrait,
};
use starknet::{ContractAddress, SyscallResultTrait};

#[starknet::interface]
trait IERC20Like<TContractState> {
    fn name(self: @TContractState) -> ByteArray;
    fn symbol(self: @TContractState) -> ByteArray;
    fn total_supply(self: @TContractState) -> u256;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
}

fn admin() -> ContractAddress {
    111_felt252.try_into().unwrap()
}

fn alice() -> ContractAddress {
    222_felt252.try_into().unwrap()
}

fn bob() -> ContractAddress {
    333_felt252.try_into().unwrap()
}

fn spender() -> ContractAddress {
    444_felt252.try_into().unwrap()
}

fn non_admin() -> ContractAddress {
    555_felt252.try_into().unwrap()
}

fn deploy_token(
    initial_supply: u256,
) -> (
    ISpendingTokenDispatcher,
    ISpendingTokenSafeDispatcher,
    IERC20LikeDispatcher,
    IERC20LikeSafeDispatcher,
    ContractAddress,
) {
    let contract = declare("SpendingToken").unwrap_syscall().contract_class();
    let mut calldata = array![admin().into(), initial_supply.low.into(), initial_supply.high.into()];
    let (contract_address, _) = contract.deploy(@calldata).unwrap_syscall();
    (
        ISpendingTokenDispatcher { contract_address },
        ISpendingTokenSafeDispatcher { contract_address },
        IERC20LikeDispatcher { contract_address },
        IERC20LikeSafeDispatcher { contract_address },
        contract_address,
    )
}

#[test]
fn test_constructor_sets_owner_balance_and_default_limit() {
    let initial_supply = 50_000_u256;
    let (token, _, erc20, _, _) = deploy_token(initial_supply);

    assert(erc20.balance_of(admin()) == initial_supply, 'admin balance mismatch');
    assert(token.get_transfer_limit() == 10_000_u256, 'default limit mismatch');
    assert(token.is_frozen() == false, 'should not be frozen');
}

#[test]
fn test_fixed_metadata() {
    let (_, _, erc20, _, _) = deploy_token(1_000_u256);
    assert(erc20.name() == "MosesToken", 'name mismatch');
    assert(erc20.symbol() == "MTK", 'symbol mismatch');
}

#[test]
fn test_owner_can_set_transfer_limit() {
    let (token, _, _, _, contract_address) = deploy_token(1_000_u256);

    start_cheat_caller_address(contract_address, admin());
    token.set_transfer_limit(777_u256);
    stop_cheat_caller_address(contract_address);

    assert(token.get_transfer_limit() == 777_u256, 'limit not updated');
}

#[test]
#[feature("safe_dispatcher")]
fn test_non_owner_cannot_set_transfer_limit() {
    let (_, safe_token, _, _, contract_address) = deploy_token(1_000_u256);

    start_cheat_caller_address(contract_address, non_admin());
    match safe_token.set_transfer_limit(777_u256) {
        Result::Ok(_) => core::panic_with_felt252('should fail'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_owner_can_revoke_and_unrevoke_spender() {
    let (token, _, _, _, contract_address) = deploy_token(5_000_u256);

    start_cheat_caller_address(contract_address, admin());
    token.revoke_spender(spender());
    stop_cheat_caller_address(contract_address);
    assert(token.is_revoked(spender()) == true, 'spender should be revoked');

    start_cheat_caller_address(contract_address, admin());
    token.unrevoke_spender(spender());
    stop_cheat_caller_address(contract_address);
    assert(token.is_revoked(spender()) == false, 'spender should be unrevoked');
}

#[test]
#[feature("safe_dispatcher")]
fn test_non_owner_cannot_revoke() {
    let (_, safe_token, _, _, contract_address) = deploy_token(5_000_u256);

    start_cheat_caller_address(contract_address, non_admin());
    match safe_token.revoke_spender(spender()) {
        Result::Ok(_) => core::panic_with_felt252('should fail'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);
}

#[test]
fn test_freeze_and_unfreeze() {
    let (token, _, _, _, contract_address) = deploy_token(10_000_u256);

    start_cheat_caller_address(contract_address, admin());
    token.freeze();
    stop_cheat_caller_address(contract_address);
    assert(token.is_frozen() == true, 'should be frozen');

    start_cheat_caller_address(contract_address, admin());
    token.unfreeze();
    stop_cheat_caller_address(contract_address);
    assert(token.is_frozen() == false, 'should be unfrozen');
}

#[test]
#[feature("safe_dispatcher")]
fn test_freeze_blocks_transfer_and_unfreeze_restores() {
    let (token, _, erc20, erc20_safe, contract_address) = deploy_token(20_000_u256);

    start_cheat_caller_address(contract_address, admin());
    token.freeze();
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, admin());
    match erc20_safe.transfer(alice(), 100_u256) {
        Result::Ok(_) => core::panic_with_felt252('should fail when frozen'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, admin());
    token.unfreeze();
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, admin());
    let ok = erc20.transfer(alice(), 100_u256);
    stop_cheat_caller_address(contract_address);

    assert(ok == true, 'unfreeze_ok');
    assert(erc20.balance_of(alice()) == 100_u256, 'alice balance mismatch');
}

#[test]
#[feature("safe_dispatcher")]
fn test_global_limit_blocks_large_transfer() {
    let (_, _, _, erc20_safe, contract_address) = deploy_token(20_000_u256);

    start_cheat_caller_address(contract_address, admin());
    match erc20_safe.transfer(alice(), 10_001_u256) {
        Result::Ok(_) => core::panic_with_felt252('should fail above max limit'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);
}

#[test]
#[feature("safe_dispatcher")]
fn test_delegated_spender_revoke_blocks_transfer_from_only() {
    let (token, _, erc20, erc20_safe, contract_address) = deploy_token(20_000_u256);

    // fund Alice then approve spender
    start_cheat_caller_address(contract_address, admin());
    erc20.transfer(alice(), 1_000_u256);
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, alice());
    erc20.approve(spender(), 500_u256);
    stop_cheat_caller_address(contract_address);

    // revoke spender
    start_cheat_caller_address(contract_address, admin());
    token.revoke_spender(spender());
    stop_cheat_caller_address(contract_address);

    // delegated spend should fail
    start_cheat_caller_address(contract_address, spender());
    match erc20_safe.transfer_from(alice(), bob(), 100_u256) {
        Result::Ok(_) => core::panic_with_felt252('revoked spender should fail'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);

    // Alice direct transfer should still work
    start_cheat_caller_address(contract_address, alice());
    let ok = erc20.transfer(bob(), 100_u256);
    stop_cheat_caller_address(contract_address);

    assert(ok == true, 'direct_ok');
}

#[test]
#[feature("safe_dispatcher")]
fn test_spender_limit_applies_to_delegated_transfers() {
    let (token, _, erc20, erc20_safe, contract_address) = deploy_token(20_000_u256);

    start_cheat_caller_address(contract_address, admin());
    erc20.transfer(alice(), 2_000_u256);
    token.set_spender_limit(spender(), 250_u256);
    stop_cheat_caller_address(contract_address);

    start_cheat_caller_address(contract_address, alice());
    erc20.approve(spender(), 1_000_u256);
    stop_cheat_caller_address(contract_address);

    // over per-spender limit fails
    start_cheat_caller_address(contract_address, spender());
    match erc20_safe.transfer_from(alice(), bob(), 300_u256) {
        Result::Ok(_) => core::panic_with_felt252('over spender limit should fail'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);

    // within limit succeeds
    start_cheat_caller_address(contract_address, spender());
    let ok = erc20.transfer_from(alice(), bob(), 200_u256);
    stop_cheat_caller_address(contract_address);

    assert(ok == true, 'delegated_ok');
    assert(erc20.balance_of(bob()) == 200_u256, 'bob balance mismatch');
}

#[test]
fn test_burn_reduces_balance_and_total_supply() {
    let (token, _, erc20, _, contract_address) = deploy_token(20_000_u256);
    let total_before = erc20.total_supply();
    let admin_before = erc20.balance_of(admin());

    start_cheat_caller_address(contract_address, admin());
    token.burn(admin(), 500_u256);
    stop_cheat_caller_address(contract_address);

    assert(erc20.balance_of(admin()) == admin_before - 500_u256, 'admin burn mismatch');
    assert(erc20.total_supply() == total_before - 500_u256, 'supply burn mismatch');
}

#[test]
#[feature("safe_dispatcher")]
fn test_non_owner_cannot_burn() {
    let (_, safe_token, _, _, contract_address) = deploy_token(20_000_u256);

    start_cheat_caller_address(contract_address, non_admin());
    match safe_token.burn(admin(), 100_u256) {
        Result::Ok(_) => core::panic_with_felt252('non-owner burn should fail'),
        Result::Err(_) => {},
    };
    stop_cheat_caller_address(contract_address);
}
