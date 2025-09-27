module asset_tokenization::vault {
    use std::vector;

    use sui::object::{Self as object, UID};
    use sui::tx_context::TxContext;
    use sui::transfer;

    use asset_tokenization::tokenized_asset::{
        Self as at, AssetCap, AssetMetadata, TokenizedAsset
    };

    /// Vault that locks the master NFT and holds the AssetCap to manage shares.
    public struct Vault<phantom T> has key, store {
        id: UID,
        /// The locked master NFT (non-empty metadata)
        locked_nft: TokenizedAsset<T>,
        /// Mint/Burn capability for shares
        cap: AssetCap<T>,
        /// Cached parameters for convenience/validation
        total_supply: u64,
        total_price: u64,
    }

    /// Create a vault by moving in the master NFT and the AssetCap.
    /// The metadata is shared separately; we cache total_supply/price for convenience.
    public fun create_vault<T: key>(
        nft: TokenizedAsset<T>,
        cap: AssetCap<T>,
        meta: &AssetMetadata<T>,
        ctx: &mut TxContext
    ): Vault<T> {
        // Master must be NFT
        assert!(!at::is_ft<T>(&nft), 0);

        let total_supply = at::total_supply<T>(&cap);
        let total_price = at::total_price<T>(meta);

        Vault<T> { id: object::new(ctx), locked_nft: nft, cap, total_supply, total_price }
    }

    /// Optionally share the vault so others can interact (e.g., unlock flow coordination).
    public entry fun share<T: key>(vault: Vault<T>) {
        transfer::share_object(vault)
    }

    /// Mint FT shares from the vault-held cap. Returns the FT to the caller.
    /// amount can be any positive value as long as it respects the remaining supply.
    public fun mint_shares<T>(
        vault: &mut Vault<T>,
        amount: u64,
        ctx: &mut TxContext
    ): TokenizedAsset<T> {
        at::mint<T>(&mut vault.cap, vector[], vector[], amount, ctx)
    }

    /// Unlock by presenting ALL outstanding supply in one FT object vector.
    /// This function joins them, burns the full supply via the cap, and returns (master NFT, cap).
    /// Invariants enforced:
    /// - Collected sum must equal vault.total_supply
    /// - Circulating supply must equal vault.total_supply before burn
    /// - Circulating supply must be 0 after burn
    public fun unlock_with_full_supply<T>(
        mut vault: Vault<T>,
        mut collected: vector<TokenizedAsset<T>>,
        ctx: &mut TxContext
    ): (TokenizedAsset<T>, AssetCap<T>) {
        // 1) Ensure all are FTs and sum balances
        let len = vector::length(&collected);
        assert!(len > 0, 10);

        let mut acc = vector::pop_back(&mut collected);
        assert!(at::is_ft<T>(&acc), 11);
        let mut sum = at::value<T>(&acc);

        while (vector::length(&collected) > 0) {
            let next = vector::pop_back(&mut collected);
            assert!(at::is_ft<T>(&next), 12);
            sum = sum + at::value<T>(&next);
            let _burned_id = at::join<T>(&mut acc, next);
        };

        // 2) Require full supply collected and currently circulating
        assert!(sum == vault.total_supply, 13);
        let circ_before = at::supply<T>(&vault.cap);
        assert!(circ_before == vault.total_supply, 14);

        // 3) Burn and verify supply reaches zero
        at::burn<T>(&mut vault.cap, acc);
        let circ_after = at::supply<T>(&vault.cap);
        assert!(circ_after == 0, 15);

        // 4) Fully consume the now-empty vector parameter to satisfy non-drop type
        vector::destroy_empty<TokenizedAsset<T>>(collected);

        // 5) Return the locked NFT and the cap, delete the vault shell
        let Vault { id, locked_nft, cap, total_supply: _, total_price: _ } = vault;
        object::delete(id);

        (locked_nft, cap)
    }

    /// Views
    public fun total_supply<T>(vault: &Vault<T>): u64 { vault.total_supply }
    public fun total_price<T>(vault: &Vault<T>): u64 { vault.total_price }
}


