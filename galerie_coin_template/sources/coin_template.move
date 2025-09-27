module galerie_coin_template::coin_template {
    use std::option::{Self as option};
    use std::string::{Self as string, String};
    use std::ascii;
    use sui::url::{Self as url, Url};
    use sui::tx_context::TxContext;
    use sui::coin::{Self as coin, TreasuryCap, CoinMetadata};
    use sui::transfer::{Self as transfer, public_share_object, public_transfer};

    /// One-time witness. Must match the module name uppercased.
    public struct COIN_TEMPLATE has drop {}

    /// Module initializer: creates a coin currency with default decimals & symbol,
    /// shares metadata (mutable), transfers TreasuryCap to publisher.
    fun init(w: COIN_TEMPLATE, ctx: &mut TxContext) {
        let (tcap, meta): (TreasuryCap<COIN_TEMPLATE>, CoinMetadata<COIN_TEMPLATE>) = coin::create_currency(
            w,
            /*decimals*/ 0,
            /*symbol*/ b"ASSET",
            /*name*/ b"Asset Share",
            /*description*/ b"Per-asset share coin",
            /*icon*/ option::none(),
            ctx,
        );
        // Share metadata to allow post-publish updates (name, symbol, description, icon)
        public_share_object(meta);
        // Transfer TreasuryCap to the publisher (ctx.sender)
        public_transfer(tcap, sui::tx_context::sender(ctx));
    }

    /// Convert a String to Option<Url>: empty -> none, otherwise Some(Url)
    fun str_to_option_url(s: String): option::Option<Url> {
        if (string::length(&s) == 0) {
            option::none<Url>()
        } else {
            let bytes = string::into_bytes(s);
            let ascii_str = ascii::string(bytes);
            let u = url::new_unsafe(ascii_str);
            option::some<Url>(u)
        }
    }

    /// Update coin metadata (symbol, name, description, icon) after publish.
    /// Requires both the TreasuryCap (as authority) and the shared CoinMetadata.
    public fun update_all_metadata(
        tcap: &TreasuryCap<COIN_TEMPLATE>,
        meta: &mut CoinMetadata<COIN_TEMPLATE>,
        symbol_bytes: vector<u8>,
        name: String,
        description: String,
        icon_url_str: String,
    ) {
        let symbol_ascii = ascii::string(symbol_bytes);
        let icon_ascii = ascii::string(string::into_bytes(icon_url_str));
        coin::update_symbol<COIN_TEMPLATE>(tcap, meta, symbol_ascii);
        coin::update_name<COIN_TEMPLATE>(tcap, meta, name);
        coin::update_description<COIN_TEMPLATE>(tcap, meta, description);
        coin::update_icon_url<COIN_TEMPLATE>(tcap, meta, icon_ascii);
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


