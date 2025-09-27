module galerie_nft_template::template {
    use std::option::{Self as option, Option};
    use std::string::{Self as string, String};
    use std::ascii;
    use sui::tx_context::TxContext;
    use sui::url::{Self as url, Url};
    use sui::coin::{Self as coin, Coin};
    use sui::sui::SUI;
    use sui::transfer::{Self as transfer, public_share_object, public_transfer};
    use sui::object::{Self as object, UID, ID};

    use asset_tokenization::tokenized_asset::{
        Self as at, AssetCap, AssetMetadata, TokenizedAsset, PlatformCap
    };
    use asset_tokenization::vault::{Self as vlt, Vault};

    /// OTW for this concrete asset type
    public struct GALERIE_NFT has drop {}

    /// Simple sale object that holds the admin cap and pricing info
    public struct Sale<phantom T> has key, store {
        id: UID,
        cap: AssetCap<T>,
        /// Stable link to shared AssetMetadata<T>
        meta_id: ID,
        total_supply: u64,
        total_price: u64,
        beneficiary: address,
    }

    /// Event to discover sales on-chain
    public struct SaleStarted has copy, drop { sale_id: ID, total_supply: u64, total_price: u64 }

    /// Map "" -> None, non-empty -> Some(Url).
    /// url::new_unsafe expects ascii::String, so convert:
    /// String -> bytes -> ascii::String -> Url
    fun str_to_option_url(s: String): Option<Url> {
        if (string::length(&s) == 0) {
            option::none<Url>()
        } else {
            let bytes = string::into_bytes(s);
            let ascii_str = ascii::string(bytes);
            let u = url::new_unsafe(ascii_str);
            option::some<Url>(u)
        }
    }

    /// Create the asset type (returns AssetCap and AssetMetadata).
    /// Public (not entry) because return types don’t have `drop`.
    public fun create_new_asset(
        cap_admin: &PlatformCap,
        total_supply: u64,
        total_price: u64,            // total price in smallest unit (e.g. cents)
        symbol_ascii: vector<u8>,   // ascii::String constructed from bytes
        name: String,
        description: String,
        icon_url_str: String,       // "" means None
        burnable: bool,
        ctx: &mut TxContext
    ): (AssetCap<GALERIE_NFT>, AssetMetadata<GALERIE_NFT>) {
        at::new_asset<GALERIE_NFT>(
            cap_admin,
            GALERIE_NFT {},
            total_supply,
            total_price,
            ascii::string(symbol_ascii),
            name,
            description,
            str_to_option_url(icon_url_str),
            burnable,
            ctx
        )
    }

    /// Mint FT (no per-item metadata)
    public fun mint_ft(
        cap: &mut AssetCap<GALERIE_NFT>,
        amount: u64,
        ctx: &mut TxContext
    ): TokenizedAsset<GALERIE_NFT> {
        at::mint<GALERIE_NFT>(cap, vector[], vector[], amount, ctx)
    }

    /// Mint NFT (per-item KV metadata; balance forced to 1)
    public fun mint_nft(
        cap: &mut AssetCap<GALERIE_NFT>,
        keys: vector<String>,
        values: vector<String>,
        image_url_str: String,
        ctx: &mut TxContext
    ): TokenizedAsset<GALERIE_NFT> {
        let mut t = at::mint<GALERIE_NFT>(cap, keys, values, 1, ctx);
        // If an explicit image URL string is provided, set image_url on the NFT
        if (string::length(&image_url_str) > 0) {
            let bytes = string::into_bytes(image_url_str);
            let ascii_str = ascii::string(bytes);
            let u = url::new_unsafe(ascii_str);
            at::set_image_url<GALERIE_NFT>(&mut t, u);
        };
        t
    }

    /// Buy FT shares from a shared/owned vault by paying SUI at price_per_share.
    /// Proceeds go to `beneficiary`. Returns (minted FT, change).
    public fun buy_shares(
        vault: &mut Vault<GALERIE_NFT>,
        amount: u64,
        beneficiary: address,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext
    ): (TokenizedAsset<GALERIE_NFT>, Coin<SUI>) {
        assert!(amount > 0, 0);

        let total_supply = vlt::total_supply<GALERIE_NFT>(vault);
        let total_price = vlt::total_price<GALERIE_NFT>(vault);
        assert!(total_supply > 0, 1);
        let pps = total_price / total_supply; // integer price per share

        let cost = pps * amount;
        let bal = coin::value<SUI>(&payment);
        assert!(bal >= cost, 2);

        // Take exact payment and forward to beneficiary; return remaining as change
        let to_pay = coin::split<SUI>(&mut payment, cost, ctx);
        transfer::public_transfer(to_pay, beneficiary);

        let minted = vlt::mint_shares<GALERIE_NFT>(vault, amount, ctx);
        (minted, payment)
    }

    /// Create a Sale shared object from an AssetCap and Metadata
    public fun start_sale(
        cap: AssetCap<GALERIE_NFT>,
        meta: &AssetMetadata<GALERIE_NFT>,
        total_supply: u64,
        total_price: u64,
        beneficiary: address,
        ctx: &mut TxContext
    ): Sale<GALERIE_NFT> {
        let meta_id = at::metadata_id<GALERIE_NFT>(meta);
        let sale = Sale<GALERIE_NFT> { id: object::new(ctx), cap, meta_id, total_supply, total_price, beneficiary };
        // Emit event for discovery
        let id = object::uid_to_inner(&sale.id);
        sui::event::emit(SaleStarted { sale_id: id, total_supply, total_price });
        sale
    }

    /// Share the Sale object
    public fun share_sale(sale: Sale<GALERIE_NFT>) { public_share_object(sale) }

    /// Buy FT directly from Sale, paying SUI to beneficiary
    public fun buy(
        sale: &mut Sale<GALERIE_NFT>,
        amount: u64,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext
    ): (TokenizedAsset<GALERIE_NFT>, Coin<SUI>) {
        assert!(amount > 0, 10);
        assert!(sale.total_supply > 0, 11);
        let pps = sale.total_price / sale.total_supply;
        let cost = pps * amount;
        let bal = coin::value<SUI>(&payment);
        assert!(bal >= cost, 12);

        let to_pay = coin::split<SUI>(&mut payment, cost, ctx);
        public_transfer(to_pay, sale.beneficiary);

        let minted = at::mint<GALERIE_NFT>(&mut sale.cap, vector[], vector[], amount, ctx);
        (minted, payment)
    }
}