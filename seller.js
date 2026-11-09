const fs = require("fs");
const path = require("path");
const os = require("os");
const { KeyPair, baseEncode } = require("near-api-js");
const { quoteMessage, registerDemoKey } = require("./verify");

// The seller's public price list (in NEAR)
const priceList = {
  "btc-price-data": 0.2,
  "wallet-report": 0.3,
  "defi-yields": 0.4
};

const SELLER = "cheating-vendor-frank.testnet";
const FIVE_MINUTES = 5 * 60 * 1000;

let sellerKey;
if (process.env.RATIFY_DEMO === "1") {
  // Demo mode: a made-up seller key, recorded in the pretend chain record
  sellerKey = KeyPair.fromRandom("ed25519");
  registerDemoKey(SELLER, sellerKey.getPublicKey().toString());
} else {
  // The seller's real key (the one NEAR has on record for this account)
  const keyFile = path.join(os.homedir(), ".near-credentials", "testnet", SELLER,
    "ed25519_46e5u9M4pr4dugw2eTgH48TUsCyACEMf8G4oMmtzXYxa.json");
  sellerKey = KeyPair.fromString(JSON.parse(fs.readFileSync(keyFile, "utf8")).private_key);
}

let quoteCounter = 0;

// Build a quote and sign it with a key
function makeQuote(item, amount, expiresAt, key) {
  quoteCounter = quoteCounter + 1;
  const quote = {
    quoteId: "q" + quoteCounter + "-" + Date.now(),
    seller: SELLER,
    item: item,
    amount: amount,
    currency: "NEAR",
    expiresAt: expiresAt
  };
  const signed = key.sign(quoteMessage(quote));
  quote.publicKey = key.getPublicKey().toString();
  quote.signature = baseEncode(signed.signature);
  return quote;
}

// Honest: the real price, valid for 5 minutes, signed by the seller
function honestQuote(item) {
  return makeQuote(item, priceList[item], Date.now() + FIVE_MINUTES, sellerKey);
}

// Cheat 1: the seller signs a price higher than its own price list
function raisedPriceQuote(item) {
  return makeQuote(item, priceList[item] * 1.25, Date.now() + FIVE_MINUTES, sellerKey);
}

// Cheat 2: a quote that has already expired
function expiredQuote(item) {
  return makeQuote(item, priceList[item], Date.now() - 60 * 1000, sellerKey);
}

// Cheat 3: asks to be paid again for a quote already paid
function chargeAgain(oldQuote) {
  return oldQuote;
}

// Attack 4: someone changes the amount after the seller signed it
function tamperedQuote(item) {
  const quote = honestQuote(item);
  quote.amount = 0.5;
  return quote;
}

// Attack 5: someone swaps the seller for their own account
function redirectedQuote(item) {
  const quote = honestQuote(item);
  quote.seller = "attacker-frank.testnet";
  return quote;
}

// Attack 6: a fake quote signed with a key that does not belong to the seller
function forgedQuote(item) {
  const fakeKey = KeyPair.fromRandom("ed25519");
  return makeQuote(item, priceList[item], Date.now() + FIVE_MINUTES, fakeKey);
}

module.exports = {
  priceList, honestQuote, raisedPriceQuote, expiredQuote, chargeAgain,
  tamperedQuote, redirectedQuote, forgedQuote
};
// Attack 7: a seller name that looks almost the same as the trusted one ("0" instead of "o")
function lookalikeQuote(item) {
  const quote = makeQuote(item, priceList[item], Date.now() + FIVE_MINUTES, sellerKey);
  quote.seller = SELLER.replace("vendor", "vend0r");
  return quote;
}
module.exports.lookalikeQuote = lookalikeQuote;
