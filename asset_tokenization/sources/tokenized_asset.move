module asset_tokenization::tokenized_asset {
    use std::option::{Self as option, Option};
    use std::string::String;
    use std::ascii;
    use std::vector;

    use sui::object::{Self as object, UID, ID};
    use sui::tx_context::{Self as tx_context, TxContext};
    use sui::transfer;
    use sui::url::Url;
    use sui::balance::{Self as balance, Balance, Supply};
    use sui::vec_map::{Self as vmap, VecMap};
    use sui::event;

    
    /// Capability that is issued to the one deploying the contract
    public struct PlatformCap has key, store { id: UID }

    /// Mint/Burn capability for a specific asset type `T`.
    public struct AssetCap<phantom T> has key, store {
        id: UID,
        // the current supply in circulation
        supply: Supply<T>,
        // the total max supply allowed to exist at any time
        total_supply: u64,
        // Determines if the asset can be burned or not
        burnable: bool,
    }

    /// Shared metadata describing an asset `T`
    public struct AssetMetadata<phantom T> has key, store {
        id: UID,
        /// Name of the asset
        name: String,
        /// the total max supply allowed to exist at any time
        total_supply: u64,
        /// Total price of the NFT/collection in smallest currency unit (e.g. cents)
        total_price: u64,
        /// Symbol for the asset
        symbol: ascii::String,
        /// Description of the asset
        description: String,
        /// URL for the asset logo
        icon_url: Option<Url>,
    }

    /// A fractional collectible (FT/NFT semantics decided by `metadata` content)
    public struct TokenizedAsset<phantom T> has key, store {
        id: UID,
        /// The balance of the tokenized asset
        balance: Balance<T>,
        /// If populated => NFT (forces balance == 1), else FT
        metadata: VecMap<String, String>,
        /// URL for the asset image (optional)
        image_url: Option<Url>,
    }

    /// Events
    public struct MintEvent has copy, drop { amount: u64, nft: bool }
    public struct BurnEvent has copy, drop { amount: u64 }
    public struct SplitEvent has copy, drop { amount: u64 }
    public struct JoinEvent has copy, drop { amount: u64 }

    /// ===== Helpers =====
    fun is_nft(meta: &VecMap<String, String>): bool {
        vmap::length(meta) > 0
    }

    /// Internal helper to build a VecMap<String, String> from aligned arrays.
    public fun create_vec_map_from_arrays(
        keys: vector<String>,
        values: vector<String>
    ): VecMap<String, String> {
        assert!(vector::length(&keys) == vector::length(&values), 0);
        let mut m = vmap::empty<String, String>();
        let len = vector::length(&keys);
        let mut i = 0;
        let mut k = keys;
        let mut v = values;
        while (i < len) {
            let key = vector::remove(&mut k, 0);
            let val = vector::remove(&mut v, 0);
            // aborts if key already exists
            vmap::insert(&mut m, key, val);
            i = i + 1;
        };
        m
    }

    /// ===== Module initializer =====
    /// Must be internal (no visibility, no `entry`). Runs on package publish.
    fun init(ctx: &mut TxContext) {
        let cap = PlatformCap { id: object::new(ctx) };
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    /// Create a new asset `T` (OTW pattern). Returns (AssetCap, AssetMetadata).
    /// Requires the platform admin capability so only the package owner can create assets.
    public fun new_asset<T: drop>(
        _cap: &PlatformCap,
        witness: T,
        total_supply: u64,
        total_price: u64,
        symbol: ascii::String,
        name: String,
        description: String,
        icon_url: Option<Url>,
        burnable: bool,
        ctx: &mut TxContext
    ): (AssetCap<T>, AssetMetadata<T>) {
        // Circulating supply starts at 0 and is tracked inside Supply<T>
        let supply = balance::create_supply<T>(witness);

        let cap = AssetCap<T> {
            id: object::new(ctx),
            supply,
            total_supply,
            burnable,
        };

        let meta = AssetMetadata<T> {
            id: object::new(ctx),
            name,
            total_supply,
            total_price,
            symbol,
            description,
            icon_url,
        };

        (cap, meta)
    }

    /// Optional helper to share metadata (kept separate so callers may still hold it).
    public entry fun share_metadata<T: key>(meta: AssetMetadata<T>) {
        transfer::share_object(meta)
    }

    /// Mint a new TokenizedAsset<T>.
    /// - Non-empty keys/values => NFT (forces value == 1)
    /// - Empty => FT (value can be > 1)
    public fun mint<T>(
        cap: &mut AssetCap<T>,
        keys: vector<String>,
        values: vector<String>,
        value: u64,
        ctx: &mut TxContext
    ): TokenizedAsset<T> {
        assert!(value > 0, 0);

        // Enforce cap: circulating + value <= total_supply
        let circ = balance::supply_value<T>(&cap.supply);
        assert!(circ + value <= cap.total_supply, 1);

        let m = create_vec_map_from_arrays(keys, values);
        let nft = is_nft(&m);
        if (nft) { assert!(value == 1, 2); };

        // increase_supply returns a freshly minted Balance<T>
        let minted: Balance<T> = balance::increase_supply<T>(&mut cap.supply, value);

        let obj = TokenizedAsset<T> {
            id: object::new(ctx),
            balance: minted,
            metadata: m,
            image_url: option::none<Url>(),
        };

        event::emit(MintEvent { amount: value, nft });
        obj
    }

    /// Split an FT TokenizedAsset<T>.
    public fun split<T>(
        self: &mut TokenizedAsset<T>,
        split_amount: u64,
        ctx: &mut TxContext
    ): TokenizedAsset<T> {
        assert!(!is_nft(&self.metadata), 10);

        let total = balance::value<T>(&self.balance);
        assert!(split_amount > 0 && split_amount < total, 11);

        let taken = balance::split<T>(&mut self.balance, split_amount);

        let new_obj = TokenizedAsset<T> {
            id: object::new(ctx),
            balance: taken,
            metadata: vmap::empty<String, String>(),
            image_url: option::none<Url>(),
        };

        event::emit(SplitEvent { amount: split_amount });
        new_obj
    }

    /// Join two FT TokenizedAssets<T>. Consumes `other`.
    public fun join<T>(
        self: &mut TokenizedAsset<T>,
        other: TokenizedAsset<T>
    ): ID {
        // Destructure `other`
        let TokenizedAsset { id, balance: other_bal, metadata, image_url: _ } = other;
        assert!(!is_nft(&self.metadata), 20);
        assert!(!is_nft(&metadata), 21);

        let amt = balance::value<T>(&other_bal);
        if (amt > 0) {
            balance::join<T>(&mut self.balance, other_bal);
        } else {
            // Must consume zero balances explicitly since Balance<T> has no drop
            balance::destroy_zero<T>(other_bal);
        };

        // Get the ID from the UID (UID is not key; use uid_to_inner)
        let burned_id = object::uid_to_inner(&id);
        // Remove the other object's shell
        object::delete(id);

        event::emit(JoinEvent { amount: amt });
        burned_id
    }

    /// Burn a TokenizedAsset<T>. Requires admin cap and `burnable == true`.
    public fun burn<T>(
        cap: &mut AssetCap<T>,
        tokenized_asset: TokenizedAsset<T>
    ) {
        assert!(cap.burnable, 30);
        let TokenizedAsset { id, balance, metadata: _, image_url: _ } = tokenized_asset;

        // decrease_supply consumes the Balance<T> and returns the amount burned
        let amt = balance::decrease_supply<T>(&mut cap.supply, balance);

        object::delete(id);
        event::emit(BurnEvent { amount: amt });
        // total_supply remains unchanged by design
    }

    /// ===== Views =====
    public(package) fun id_of<T>(ta: &TokenizedAsset<T>): ID {
    object::uid_to_inner(&ta.id)
    }
    public(package) fun is_ft<T>(ta: &TokenizedAsset<T>): bool {
        vmap::length(&ta.metadata) == 0
    }

    public fun total_supply<T>(cap: &AssetCap<T>): u64 { cap.total_supply }
    public fun supply<T>(cap: &AssetCap<T>): u64 { balance::supply_value<T>(&cap.supply) }
    public fun value<T>(tokenized_asset: &TokenizedAsset<T>): u64 {
        balance::value<T>(&tokenized_asset.balance)
    }

    /// Return the total price recorded on metadata
    public fun total_price<T>(meta: &AssetMetadata<T>): u64 { meta.total_price }

    /// Integer price per share; remainder exposed separately to avoid precision loss
    public fun price_per_share<T>(meta: &AssetMetadata<T>): u64 {
        assert!(meta.total_supply > 0, 40);
        meta.total_price / meta.total_supply
    }

    /// Remainder when dividing total_price by total_supply
    public fun price_remainder<T>(meta: &AssetMetadata<T>): u64 {
        assert!(meta.total_supply > 0, 41);
        meta.total_price % meta.total_supply
    }

    /// Optional: set/update image URL on a collectible
    public fun set_image_url<T>(self: &mut TokenizedAsset<T>, url: Url) {
        self.image_url = option::some(url)
    }

    /// Get the ID of an AssetMetadata object
    public fun metadata_id<T>(meta: &AssetMetadata<T>): ID {
        object::uid_to_inner(&meta.id)
    }
}
