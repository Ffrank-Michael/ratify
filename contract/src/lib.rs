// Ratify contract: the payment rules run on the NEAR chain itself.
// The agent gets a key that can only call `pay`. It can ask, but it cannot spend outside the rules.
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use std::collections::BTreeMap;

const YOCTO_PER_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

// What the owner registers for each trusted seller
#[near(serializers = [borsh])]
pub struct Seller {
    public_key: [u8; 32],
    prices: BTreeMap<String, u128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Ratify {
    owner: AccountId,
    budget: u128,
    spent: u128,
    sellers: LookupMap<AccountId, Seller>,
    used_quotes: LookupSet<String>,
}

// Turn "0.3" into yoctoNEAR exactly, without rounding errors
fn near_to_yocto(text: &str) -> u128 {
    let (whole, frac) = match text.split_once('.') {
        Some((w, f)) => (w, f),
        None => (text, ""),
    };
    require!(frac.len() <= 24, "Too many decimal places");
    let whole: u128 = if whole.is_empty() { 0 } else { whole.parse().unwrap_or_else(|_| env::panic_str("Bad amount")) };
    let frac_padded = format!("{:0<24}", frac);
    let frac: u128 = frac_padded.parse().unwrap_or_else(|_| env::panic_str("Bad amount"));
    whole * YOCTO_PER_NEAR + frac
}

// "ed25519:base58" -> 32 bytes
fn parse_public_key(text: &str) -> [u8; 32] {
    let data = text.strip_prefix("ed25519:").unwrap_or_else(|| env::panic_str("Key must start with ed25519:"));
    let bytes = near_sdk::bs58::decode(data).into_vec().unwrap_or_else(|_| env::panic_str("Bad key"));
    bytes.try_into().unwrap_or_else(|_| env::panic_str("Key must be 32 bytes"))
}

#[near]
impl Ratify {
    // Set up the vault. `budget` is in NEAR, like "1".
    #[init]
    pub fn new(owner: AccountId, budget: String) -> Self {
        Self {
            owner,
            budget: near_to_yocto(&budget),
            spent: 0,
            sellers: LookupMap::new(b"s"),
            used_quotes: LookupSet::new(b"q"),
        }
    }

    // Owner only: trust a seller, with its public key and agreed prices (in NEAR, like "0.3")
    pub fn add_seller(&mut self, seller: AccountId, public_key: String, prices: BTreeMap<String, String>) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can add sellers");
        let prices = prices.iter().map(|(item, price)| (item.clone(), near_to_yocto(price))).collect();
        self.sellers.insert(seller, Seller { public_key: parse_public_key(&public_key), prices });
    }

    pub fn add_budget(&mut self, amount: String) { require!(env::predecessor_account_id() == self.owner, "Only the owner can add budget"); self.budget += near_to_yocto(&amount); }    // Owner only: remove a seller
    pub fn remove_seller(&mut self, seller: AccountId) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can remove sellers");
        self.sellers.remove(&seller);
    }

    // The agent asks to pay a quote. `message` is exactly what the seller signed,
    // a JSON list: [quoteId, seller, item, amount, currency, expiresAt]
    pub fn pay(&mut self, message: String, signature: String) -> Promise {
        // Only the vault's own agent key can ask for payments
        require!(env::predecessor_account_id() == env::current_account_id(), "Only the agent key can request payments");

        let fields: Vec<String> = near_sdk::serde_json::from_str(&message)
            .unwrap_or_else(|_| env::panic_str("Quote is not in the expected format"));
        require!(fields.len() == 6, "Quote is not in the expected format");
        let quote_id = fields[0].clone();
        let seller_id: AccountId = fields[1].parse().unwrap_or_else(|_| env::panic_str("Bad seller account"));
        let item = &fields[2];
        let amount = near_to_yocto(&fields[3]);
        let currency = &fields[4];
        let expires_at: u64 = fields[5].parse().unwrap_or_else(|_| env::panic_str("Bad expiry time"));

        // Rule A: trusted seller?
        let seller = self.sellers.get(&seller_id).unwrap_or_else(|| env::panic_str("Unknown seller"));

        // Rule B: signed by the seller's registered key, and not changed since?
        let sig_bytes = near_sdk::bs58::decode(&signature).into_vec().unwrap_or_else(|_| env::panic_str("Bad signature"));
        let sig: [u8; 64] = sig_bytes.try_into().unwrap_or_else(|_| env::panic_str("Bad signature"));
        require!(env::ed25519_verify(&sig, message.as_bytes(), &seller.public_key), "Changed or forged quote");

        require!(currency == "NEAR", "Only NEAR quotes are supported");

        // Rule C: item on the agreed price list, and price not raised?
        let price = *seller.prices.get(item).unwrap_or_else(|| env::panic_str("Unknown item"));
        require!(amount <= price, "Price raised above the agreed price");

        // Rule D: quote not already paid?
        require!(!self.used_quotes.contains(&quote_id), "Duplicate: quote already paid");

        // Rule E: not expired, using the chain's own clock?
        require!(env::block_timestamp_ms() <= expires_at, "Expired quote");

        // Rule F: within budget?
        require!(self.spent + amount <= self.budget, "Over budget");

        // All checks passed: lock the quote, count the money, then pay
        self.used_quotes.insert(quote_id.clone());
        self.spent += amount;
        env::log_str(&format!("PAID {} yoctoNEAR to {} for quote {}", amount, seller_id, quote_id));

        Promise::new(seller_id)
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(5))
                .on_paid(quote_id, amount.to_string()))
    }

    // Runs after the transfer. If it failed, unlock the quote and give the budget back.
    #[private]
    pub fn on_paid(&mut self, quote_id: String, amount: String) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        if !ok {
            self.used_quotes.remove(&quote_id);
            self.spent -= amount.parse::<u128>().unwrap();
            env::log_str(&format!("Transfer failed for quote {}, budget returned", quote_id));
        }
        ok
    }

    // Anyone can read the state
    pub fn get_budget(&self) -> String { self.budget.to_string() }
    pub fn get_spent(&self) -> String { self.spent.to_string() }
    pub fn is_quote_used(&self, quote_id: String) -> bool { self.used_quotes.contains(&quote_id) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn vault() -> AccountId { "ratify-vault.testnet".parse().unwrap() }
    fn owner() -> AccountId { "owner.testnet".parse().unwrap() }
    fn shop() -> AccountId { "shop.testnet".parse().unwrap() }

    fn context(caller: AccountId, now_ms: u64) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(vault()).predecessor_account_id(caller).block_timestamp(now_ms * 1_000_000)
            .account_balance(NearToken::from_near(10));
        testing_env!(b.build());
    }

    fn key() -> SigningKey { SigningKey::from_bytes(&[7u8; 32]) }

    fn setup() -> Ratify {
        context(owner(), 1000);
        let mut v = Ratify::new(owner(), "1".to_string());
        let pk = format!("ed25519:{}", near_sdk::bs58::encode(key().verifying_key().to_bytes()).into_string());
        let mut prices = BTreeMap::new();
        prices.insert("wallet-report".to_string(), "0.3".to_string());
        prices.insert("btc-price-data".to_string(), "0.2".to_string());
        prices.insert("defi-yields".to_string(), "0.4".to_string());
        v.add_seller(shop(), pk, prices);
        v
    }

    fn quote(id: &str, seller: &str, item: &str, amount: &str, expires: u64, k: &SigningKey) -> (String, String) {
        let msg = near_sdk::serde_json::to_string(&vec![id, seller, item, amount, "NEAR", &expires.to_string()]).unwrap();
        let sig = near_sdk::bs58::encode(k.sign(msg.as_bytes()).to_bytes()).into_string();
        (msg, sig)
    }

    #[test]
    fn honest_quote_is_paid() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("q1", "shop.testnet", "wallet-report", "0.3", 5000, &key());
        let _ = v.pay(m, s);
        assert_eq!(v.get_spent(), (3 * YOCTO_PER_NEAR / 10).to_string());
    }

    #[test]
    #[should_panic(expected = "Duplicate")]
    fn same_quote_twice_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("q1", "shop.testnet", "wallet-report", "0.3", 5000, &key());
        let _ = v.pay(m.clone(), s.clone());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Price raised")]
    fn raised_price_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("q2", "shop.testnet", "btc-price-data", "0.25", 5000, &key());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Expired")]
    fn expired_quote_is_blocked() {
        let mut v = setup();
        context(vault(), 9000);
        let (m, s) = quote("q3", "shop.testnet", "defi-yields", "0.4", 5000, &key());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Changed or forged")]
    fn changed_amount_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("q4", "shop.testnet", "btc-price-data", "0.2", 5000, &key());
        let _ = v.pay(m.replace("0.2", "0.1"), s);
    }

    #[test]
    #[should_panic(expected = "Changed or forged")]
    fn forged_quote_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let fake = SigningKey::from_bytes(&[9u8; 32]);
        let (m, s) = quote("q5", "shop.testnet", "btc-price-data", "0.2", 5000, &fake);
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Unknown seller")]
    fn redirected_payment_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("q6", "attacker.testnet", "btc-price-data", "0.2", 5000, &key());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Over budget")]
    fn over_budget_is_blocked() {
        let mut v = setup();
        context(vault(), 1000);
        let (m, s) = quote("a", "shop.testnet", "wallet-report", "0.3", 5000, &key());
        let _ = v.pay(m, s);
        let (m, s) = quote("b", "shop.testnet", "defi-yields", "0.4", 5000, &key());
        let _ = v.pay(m, s);
        let (m, s) = quote("c", "shop.testnet", "defi-yields", "0.4", 5000, &key());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Only the agent key")]
    fn outsider_cannot_request_payment() {
        let mut v = setup();
        context("stranger.testnet".parse().unwrap(), 1000);
        let (m, s) = quote("q7", "shop.testnet", "wallet-report", "0.3", 5000, &key());
        let _ = v.pay(m, s);
    }

    #[test]
    #[should_panic(expected = "Only the owner")]
    fn only_owner_adds_sellers() {
        let mut v = setup();
        context(vault(), 1000);
        v.add_seller(shop(), format!("ed25519:{}", near_sdk::bs58::encode([1u8; 32]).into_string()), BTreeMap::new());
    }

    #[test]
    fn amounts_are_exact() {
        assert_eq!(near_to_yocto("0.3"), 300_000_000_000_000_000_000_000);
        assert_eq!(near_to_yocto("1"), YOCTO_PER_NEAR);
        assert_eq!(near_to_yocto("0.25"), 250_000_000_000_000_000_000_000);
    }
}

#[cfg(test)]
mod lookalike {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    // A seller name that looks almost the same as the trusted one ("0" instead of "o")
    #[test]
    #[should_panic(expected = "Unknown seller")]
    fn lookalike_seller_is_blocked() {
        let vault: AccountId = "ratify-vault.testnet".parse().unwrap();
        let mut b = VMContextBuilder::new();
        b.current_account_id(vault.clone()).predecessor_account_id(vault.clone()).block_timestamp(1000 * 1_000_000);
        testing_env!(b.build());

        let key = SigningKey::from_bytes(&[7u8; 32]);
        let mut v = Ratify::new(vault, "1".to_string());
        let mut prices = BTreeMap::new();
        prices.insert("btc-price-data".to_string(), "0.2".to_string());
        let pk = format!("ed25519:{}", near_sdk::bs58::encode(key.verifying_key().to_bytes()).into_string());
        v.add_seller("cheating-vendor.testnet".parse().unwrap(), pk, prices);

        let msg = near_sdk::serde_json::to_string(&vec!["q9", "cheating-vend0r.testnet", "btc-price-data", "0.2", "NEAR", "5000"]).unwrap();
        let sig = near_sdk::bs58::encode(key.sign(msg.as_bytes()).to_bytes()).into_string();
        let _ = v.pay(msg, sig);
    }
}
