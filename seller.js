// The seller's public price list (in NEAR)
const priceList = {
  "btc-price-data": 0.2,
  "wallet-report": 0.3,
  "defi-yields": 0.4
};

const SELLER = "cheating-vendor-frank.testnet";
const FIVE_MINUTES = 5 * 60 * 1000;
let quoteCounter = 0;

function newQuoteId() {
  quoteCounter = quoteCounter + 1;
  return "q" + quoteCounter + "-" + Date.now();
}

// Honest: the real price, valid for 5 minutes
function honestQuote(item) {
  return {
    quoteId: newQuoteId(),
    seller: SELLER,
    item: item,
    amount: priceList[item],
    expiresAt: Date.now() + FIVE_MINUTES
  };
}

// Cheat 1: asks for more than the listed price
function raisedPriceQuote(item) {
  return {
    quoteId: newQuoteId(),
    seller: SELLER,
    item: item,
    amount: priceList[item] * 1.25,
    expiresAt: Date.now() + FIVE_MINUTES
  };
}

// Cheat 2: a quote that has already expired
function expiredQuote(item) {
  return {
    quoteId: newQuoteId(),
    seller: SELLER,
    item: item,
    amount: priceList[item],
    expiresAt: Date.now() - 60 * 1000
  };
}

// Cheat 3: asks to be paid again for a quote already paid
function chargeAgain(oldQuote) {
  return oldQuote;
}

module.exports = { priceList, honestQuote, raisedPriceQuote, expiredQuote, chargeAgain };

// Quick test: only runs when you run this file directly
if (require.main === module) {
  const first = honestQuote("wallet-report");
  console.log("Honest:", first);
  console.log("Raised price:", raisedPriceQuote("btc-price-data"));
  console.log("Expired:", expiredQuote("defi-yields"));
  console.log("Charge again:", chargeAgain(first));
}