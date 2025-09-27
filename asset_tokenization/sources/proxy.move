module asset_tokenization::proxy {
    use std::option::Option;
    use std::string::String;
    use sui::object::{Self as object, UID};
    use sui::tx_context::TxContext;
    use sui::transfer::{public_share_object, public_transfer};
    use sui::package::{Self as package, Publisher};
    use sui::display::{Self as display, Display};
    use sui::transfer_policy::{Self as tp, TransferPolicy, TransferPolicyCap};

    use asset_tokenization::tokenized_asset::{Self as at, PlatformCap, TokenizedAsset};

    /// One-time witness used to claim the package Publisher in `init`.
    public struct PROXY has drop {}

    /// Shared registry that holds the package's Publisher.
    public struct Registry has key, store {
        id: UID,
        publisher: Publisher,
    }

    /// Shared container that holds an empty TransferPolicy for a given type `U`.
    public struct ProtectedTP<phantom U> has key, store {
        id: UID,
        policy_cap: TransferPolicyCap<U>,
        transfer_policy: TransferPolicy<U>,
    }

    /// Module initializer:
    /// - Claims this package's `Publisher` using the OTW.
    /// - Stores it in a `Registry` and shares the `Registry`.
    /// NOTE: `init` must be internal (no `public`, no `entry`) in Move 2024.
    fun init(otw: PROXY, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);
        let registry = Registry { id: object::new(ctx), publisher };
        public_share_object(registry);
    }

    /// Transfer wrapper for TokenizedAsset<T>.
    /// Uses `public_transfer` (safe to call outside the object's defining module).
    public fun transfer_tokenized<T: key + store>(
        obj: TokenizedAsset<T>,
        recipient: address,
        _policy_hint: Option<String>,
    ) {
        public_transfer(obj, recipient)
    }

    /// Create a TransferPolicy & TransferPolicyCap for `TokenizedAsset<T>`.
    /// Also creates and shares a separate **empty** policy wrapped in `ProtectedTP<TokenizedAsset<T>>`.
    public fun setup_tp<T: drop>(
        registry: &Registry,
        sender_publisher: &Publisher,
        ctx: &mut TxContext
    ): (TransferPolicy<TokenizedAsset<T>>, TransferPolicyCap<TokenizedAsset<T>>) {
        // Optional safety check: ensure the caller's publisher is from this package/type.
        assert!(package::from_package<TokenizedAsset<T>>(sender_publisher), 0);

        // Policy pair the caller will receive
        let (ret_policy, ret_cap) = tp::new<TokenizedAsset<T>>(sender_publisher, ctx);

        // An additional empty policy stored in a shared ProtectedTP for unlock flows
        let (pt_policy, pt_cap) = tp::new<TokenizedAsset<T>>(&registry.publisher, ctx);
        let protected: ProtectedTP<TokenizedAsset<T>> = ProtectedTP<TokenizedAsset<T>> {
            id: object::new(ctx),
            policy_cap: pt_cap,
            transfer_policy: pt_policy,
        };
        public_share_object(protected);

        (ret_policy, ret_cap)
    }

    /// Create a new (empty) Display for `TokenizedAsset<T>`.
    /// You can later add fields with `display::add_multiple` and bump with `display::update_version`.
    public fun new_display<T: drop>(
        _registry: &Registry,
        sender_publisher: &Publisher,
        ctx: &mut TxContext
    ): Display<TokenizedAsset<T>> {
        assert!(package::from_package<TokenizedAsset<T>>(sender_publisher), 0);
        display::new<TokenizedAsset<T>>(sender_publisher, ctx)
    }

    /// Package-visible accessor so sibling modules (e.g., `unlock`) can read the policy
    /// without peeking into struct fields directly.
    public(package) fun policy_ref<U>(
        protected_tp: &ProtectedTP<U>
    ): &TransferPolicy<U> {
        &protected_tp.transfer_policy
    }

    /// Platform admin helper: get a mutable reference to the stored Publisher.
    public fun publisher_mut(
        _cap: &PlatformCap,
        registry: &mut Registry
    ): &mut Publisher {
        &mut registry.publisher
    }
}
