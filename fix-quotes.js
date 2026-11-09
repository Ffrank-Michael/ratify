// One-time script: remember paid quotes per seller ("seller:quoteId"), in the contract and the JS checker.
//   node fix-quotes.js
const fs = require("fs");

const changes = {
  "contract/src/lib.rs": [
    ["        // Rule D: quote not already paid?\n        require!(!self.used_quotes.contains(&quote_id), \"Duplicate: quote already paid\");",
     "        // Rule D: quote not already paid? (remembered per seller, so two sellers can both use \"q1\")\n        let quote_key = format!(\"{}:{}\", seller_id, quote_id);\n        require!(!self.used_quotes.contains(&quote_key), \"Duplicate: quote already paid\");"],
    ["        self.used_quotes.insert(quote_id.clone());", "        self.used_quotes.insert(quote_key.clone());"],
    ["                .on_paid(quote_id, amount.to_string()))", "                .on_paid(quote_key, amount.to_string()))"],
    ["    pub fn on_paid(&mut self, quote_id: String, amount: String) -> bool {", "    pub fn on_paid(&mut self, quote_key: String, amount: String) -> bool {"],
    ["            self.used_quotes.remove(&quote_id);", "            self.used_quotes.remove(&quote_key);"],
    ["            env::log_str(&format!(\"Transfer failed for quote {}, budget returned\", quote_id));", "            env::log_str(&format!(\"Transfer failed for quote {}, budget returned\", quote_key));"],
    ["    pub fn is_quote_used(&self, quote_id: String) -> bool { self.used_quotes.contains(&quote_id) }",
     "    pub fn is_quote_used(&self, seller: AccountId, quote_id: String) -> bool { self.used_quotes.contains(&format!(\"{}:{}\", seller, quote_id)) }"],
    ["    #[test]\n    fn amounts_are_exact() {",
     "    #[test]\n    fn two_sellers_can_use_the_same_quote_id() {\n        let mut v = setup();\n        let other_key = SigningKey::from_bytes(&[8u8; 32]);\n        let pk = format!(\"ed25519:{}\", near_sdk::bs58::encode(other_key.verifying_key().to_bytes()).into_string());\n        let mut prices = BTreeMap::new();\n        prices.insert(\"wallet-report\".to_string(), \"0.3\".to_string());\n        v.add_seller(\"other-shop.testnet\".parse().unwrap(), pk, prices);\n        context(vault(), 1000);\n        let (m, s) = quote(\"q1\", \"shop.testnet\", \"wallet-report\", \"0.3\", 5000, &key());\n        let _ = v.pay(m, s);\n        let (m, s) = quote(\"q1\", \"other-shop.testnet\", \"wallet-report\", \"0.3\", 5000, &other_key);\n        let _ = v.pay(m, s);\n        assert_eq!(v.get_spent(), (6 * YOCTO_PER_NEAR / 10).to_string());\n    }\n\n    #[test]\n    fn amounts_are_exact() {"]
  ],
  "guard.js": [
    ["if (usedQuotes.has(quote.quoteId)) {", "if (usedQuotes.has(quote.seller + \":\" + quote.quoteId)) {"],
    ["usedQuotes.add(quote.quoteId);", "usedQuotes.add(quote.seller + \":\" + quote.quoteId);"],
    ["usedQuotes.delete(quote.quoteId);", "usedQuotes.delete(quote.seller + \":\" + quote.quoteId);"],
    ["usedQuotes.add(record.quoteId);", "usedQuotes.add(record.seller + \":\" + record.quoteId);"]
  ]
};

let ok = true;
const results = {};
for (const file of Object.keys(changes)) {
  const raw = fs.readFileSync(file, "utf8");
  const windows = raw.includes("\r\n");
  let text = raw.replace(/\r\n/g, "\n");
  for (const [from, to] of changes[file]) {
    const count = text.split(from).length - 1;
    if (count !== 1) {
      ok = false;
      console.log("NOT FOUND exactly once in " + file + ": " + from.split("\n")[0].trim());
      continue;
    }
    text = text.replace(from, () => to);
  }
  results[file] = windows ? text.replace(/\n/g, "\r\n") : text;
}

if (!ok) {
  console.log("Nothing was changed. Paste this message to Claude.");
} else {
  for (const file of Object.keys(results)) fs.writeFileSync(file, results[file]);
  console.log("Done: contract/src/lib.rs and guard.js updated.");
}