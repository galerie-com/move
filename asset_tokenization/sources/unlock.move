module asset_tokenization::unlock {
    use sui::object::ID;
    use sui::transfer_policy::{Self as tp, TransferRequest};

    use asset_tokenization::tokenized_asset::{Self as at, TokenizedAsset, AssetCap};
    use asset_tokenization::proxy::{Self as proxy, ProtectedTP};

    /// A promise preventing a permanent unlock beyond a single join.
    public struct JoinPromise has drop {
        /// the item where the balance of the burnt tokenized asset will be added.
        item: ID,
        /// burned is the id of the tokenized asset that will be burned
        burned: ID,
        /// the expected final balance of the item after merging
        expected_balance: u64
    }

    /// A promise ensuring the circulating supply is reduced by burn.
    public struct BurnPromise has drop {
        expected_supply: u64
    }

    /// Unlock a kiosk-held TokenizedAsset for JOIN.
    /// Confirms the transfer request via the protected empty policy and
    /// returns a JoinPromise describing what must happen next.
    public fun asset_from_kiosk_to_join<T>(
        self: &TokenizedAsset<T>,                              // receiver A
        to_burn: &TokenizedAsset<T>,                           // donor B (must be burned)
        protected_tp: &ProtectedTP<TokenizedAsset<T>>,         // empty policy holder (shared)
        transfer_request: TransferRequest<TokenizedAsset<T>>   // request for B
    ): JoinPromise {
        // 1) the request must target B
        let req_item = tp::item<TokenizedAsset<T>>(&transfer_request);
        let to_burn_id = at::id_of<T>(to_burn);
        assert!(req_item == to_burn_id, 0);

        // 2) only FTs may be joined
        assert!(at::is_ft<T>(self), 1);
        assert!(at::is_ft<T>(to_burn), 2);

        // 3) confirm via protected empty policy (returns (item_id, paid, from_id))
        let pol = proxy::policy_ref<TokenizedAsset<T>>(protected_tp);
        let (_item_id, _paid, _from_id) = tp::confirm_request<TokenizedAsset<T>>(pol, transfer_request);

        // 4) promise exact post-merge balance on A
        let expected = at::value<T>(self) + at::value<T>(to_burn);

        JoinPromise {
            item: at::id_of<T>(self),
            burned: to_burn_id,
            expected_balance: expected
        }
    }

    /// Prove the join actually happened (pass the burned ID returned by tokenized_asset::join).
    public fun prove_join<T>(
        self: &TokenizedAsset<T>,
        promise: JoinPromise,
        proof: ID
    ) {
        assert!(at::id_of<T>(self) == promise.item, 10);
        assert!(proof == promise.burned, 11);
        assert!(at::value<T>(self) == promise.expected_balance, 12);
    }

    /// Unlock a kiosk-held TokenizedAsset for BURN.
    /// Confirms the request and returns the expected post-burn supply.
    public fun asset_from_kiosk_to_burn<T>(
        to_burn: &TokenizedAsset<T>,
        asset_cap: &AssetCap<T>,
        protected_tp: &ProtectedTP<TokenizedAsset<T>>,
        transfer_request: TransferRequest<TokenizedAsset<T>>,
    ): BurnPromise {
        // 1) request must target `to_burn`
        let req_item = tp::item<TokenizedAsset<T>>(&transfer_request);
        let to_burn_id = at::id_of<T>(to_burn);
        assert!(req_item == to_burn_id, 20);

        // 2) confirm via protected empty policy (returns (item_id, paid, from_id))
        let pol = proxy::policy_ref<TokenizedAsset<T>>(protected_tp);
        let (_item_id, _paid, _from_id) = tp::confirm_request<TokenizedAsset<T>>(pol, transfer_request);

        // 3) promise exact supply after burn
        let circ_before = at::supply<T>(asset_cap);
        let amt = at::value<T>(to_burn);
        assert!(circ_before >= amt, 21);

        BurnPromise { expected_supply: circ_before - amt }
    }

    /// Prove the authorized burn actually happened (supply decreased as promised).
    public fun prove_burn<T>(
        asset_cap: &AssetCap<T>,
        promise: BurnPromise
    ) {
        assert!(at::supply<T>(asset_cap) == promise.expected_supply, 30);
    }
}
