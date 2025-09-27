module galerie_nft_template::template {
    use std::option::{Self as option, Option};
    use std::string::{Self as string, String};
    use std::ascii;
    use std::vector;
    use sui::tx_context::TxContext;
    use sui::url::{Self as url, Url};
    use sui::coin::{Self as coin, Coin, TreasuryCap};
    use sui::transfer::{Self as transfer, public_share_object, public_transfer};
    use sui::object::{Self as object, UID, ID};
    use sui::vec_map::{Self as vmap, VecMap};
    use sui::event;
    use std::type_name;
    use sui::balance::{Self as balance};

    /// Capability issued to the deployer for admin operations
    public struct PlatformCap has key, store { id: UID }

    /// Minimal NFT object locked in a vault
    public struct Nft has key, store {
        id: UID,
        name: String,
        description: String,
        image_url: Option<Url>,
    }

    /// Vault that holds the NFT and the coin's treasury for shares
    public struct Vault<phantom T> has key, store {
        id: UID,
        nft: Nft,
        treasury: TreasuryCap<T>,
        total_supply: u64,
        total_price: u64,
    }

    /// Sale object that owns the vault and routes payments
    public struct Sale<phantom T> has key, store {
        id: UID,
        vault: Vault<T>,
        beneficiary: address,
    }

    /// On-chain registry to discover NFTs and their linked coin types (optional)
    public struct Registry has key, store {
        id: UID,
        /// Map nft_id -> coin type name (ascii::String)
        items: VecMap<ID, ascii::String>,
    }

    /// Events for discovery and indexing
    public struct SaleStarted has copy, drop { sale_id: ID, nft_id: ID, total_supply: u64, total_price: u64 }
    public struct ShareBought has copy, drop { sale_id: ID, buyer: address, amount: u64 }
    public struct Redeemed has copy, drop { sale_id: ID, redeemer: address }

    /// Module initializer: mint PlatformCap and share the global registry
    fun init(ctx: &mut TxContext) {
        let cap = PlatformCap { id: object::new(ctx) };
        public_transfer(cap, sui::tx_context::sender(ctx));
        let reg = Registry { id: object::new(ctx), items: vmap::empty<ID, ascii::String>() };
        public_share_object(reg)
    }

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

    /// Helper: get full type name of Coin<T> for indexing
    fun coin_type_string<T>(): ascii::String {
        type_name::with_original_ids<Coin<T>>().into_string()
    }

    /// Create an NFT and pair it with a coin treasury in a vault.
    /// Keeps a similar signature; extra `treasury` parameter is appended.
    public fun create_new_asset<T>(
        _cap_admin: &PlatformCap,
        total_supply: u64,
        total_price: u64,            // total price in smallest unit (e.g. cents)
        _symbol_ascii: vector<u8>,   // kept for compatibility; coin metadata defines symbol
        name: String,
        description: String,
        icon_url_str: String,       // "" means None
        _burnable: bool,            // kept for compatibility
        mut treasury: TreasuryCap<T>,
        ctx: &mut TxContext
    ): Vault<T> {
        let nft = Nft {
            id: object::new(ctx),
            name,
            description,
            image_url: str_to_option_url(icon_url_str),
        };

        let vault: Vault<T> = Vault<T> {
            id: object::new(ctx),
            nft,
            treasury,
            total_supply,
            total_price,
        };
        vault
    }

    /// Start a sale by moving the vault into a Sale object and emitting an event
    public fun start_sale<T>(
        vault: Vault<T>,
        total_supply: u64,
        total_price: u64,
        beneficiary: address,
        ctx: &mut TxContext
    ): Sale<T> {
        assert!(vault.total_supply == total_supply, 0);
        assert!(vault.total_price == total_price, 1);

        let nft_id = object::uid_to_inner(&vault.nft.id);

        let sale = Sale<T> { id: object::new(ctx), vault, beneficiary };
        let sale_id = object::uid_to_inner(&sale.id);
        event::emit(SaleStarted { sale_id, nft_id, total_supply, total_price });
        sale
    }

    /// Share the Sale object (same external behavior)
    public fun share_sale<T>(sale: Sale<T>) { public_share_object(sale) }

    /// Buy shares (Coin<T>) directly from Sale, paying coin<C> to the sale beneficiary.
    /// Returns the minted shares and change.
    public fun buy<C, T>(
        sale: &mut Sale<T>,
        amount: u64,
        mut payment: Coin<C>,
        ctx: &mut TxContext
    ): (Coin<T>, Coin<C>) {
        assert!(amount > 0, 10);
        assert!(sale.vault.total_supply > 0, 11);
        // Enforce cap: current circulating + amount <= total_supply
        let circ_supply = coin::supply<T>(&mut sale.vault.treasury);
        let circ = balance::supply_value<T>(circ_supply);
        assert!(circ + amount <= sale.vault.total_supply, 12);

        let pps = sale.vault.total_price / sale.vault.total_supply;
        let cost = pps * amount;
        let bal = coin::value<C>(&payment);
        assert!(bal >= cost, 13);

        let to_pay = coin::split<C>(&mut payment, cost, ctx);
        public_transfer(to_pay, sale.beneficiary);

        let minted = coin::mint<T>(&mut sale.vault.treasury, amount, ctx);
        let buyer = sui::tx_context::sender(ctx);
        event::emit(ShareBought { sale_id: object::uid_to_inner(&sale.id), buyer, amount });
        (minted, payment)
    }

    /// Redeem the NFT by burning the entire supply of its coin.
    /// Requires providing a single Coin<T> with value == total_supply and the total circulating supply to equal total_supply.
    public fun redeem<T>(
        sale: Sale<T>,
        full_supply_coin: Coin<T>,
        ctx: &mut TxContext
    ): (Nft, TreasuryCap<T>) {
        let Sale { id: sale_uid, vault, beneficiary: _ } = sale;
        let Vault { id: vault_uid, nft, mut treasury, total_supply, total_price: _ } = vault;
        assert!(coin::value<T>(&full_supply_coin) == total_supply, 20);
        let circ_supply = coin::supply<T>(&mut treasury);
        assert!(balance::supply_value<T>(circ_supply) == total_supply, 21);

        let _burned = coin::burn<T>(&mut treasury, full_supply_coin);
        let redeemer = sui::tx_context::sender(ctx);
        let sale_id = object::uid_to_inner(&sale_uid);
        event::emit(Redeemed { sale_id, redeemer });
        // Consume UIDs for Sale and Vault shells
        object::delete(sale_uid);
        object::delete(vault_uid);
        (nft, treasury)
    }

    /// ===== Views =====
    public fun registry_items(reg: &Registry): &VecMap<ID, ascii::String> { &reg.items }
    public fun nft_id_of<T>(sale: &Sale<T>): ID { object::uid_to_inner(&sale.vault.nft.id) }
    public fun totals_of<T>(sale: &Sale<T>): (u64, u64) { (sale.vault.total_supply, sale.vault.total_price) }
}