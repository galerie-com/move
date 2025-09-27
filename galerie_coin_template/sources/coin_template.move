module galerie_coin_template::coin_template {
    use std::option::{Self as option};
    use sui::tx_context::TxContext;
    use sui::coin::{Self as coin, TreasuryCap, CoinMetadata};
    use sui::transfer::{Self as transfer, public_freeze_object, public_transfer};

    /// One-time witness. Must match the module name uppercased.
    public struct COIN_TEMPLATE has drop {}

    /// Module initializer: creates a coin currency with default decimals & symbol,
    /// shares metadata (mutable), transfers TreasuryCap to publisher.
    fun init(w: COIN_TEMPLATE, ctx: &mut TxContext) {
        let (tcap, meta): (TreasuryCap<COIN_TEMPLATE>, CoinMetadata<COIN_TEMPLATE>) = coin::create_currency(
            w,
            /*decimals*/ 6,
            /*symbol*/ b"ASSET",
            /*name*/ b"Asset Share",
            /*description*/ b"Per-asset share coin",
            /*icon*/ option::none(),
            ctx,
        );
        // Freeze metadata for immutable display in wallets/explorers
        public_freeze_object(meta);
        // Transfer TreasuryCap to the publisher (ctx.sender)
        public_transfer(tcap, sui::tx_context::sender(ctx));
    }

    /// Convenience: mint and transfer coins
    public fun mint_to(
        tcap: &mut TreasuryCap<COIN_TEMPLATE>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let c = coin::mint<COIN_TEMPLATE>(tcap, amount, ctx);
        public_transfer(c, recipient);
    }
}


