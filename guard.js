const seller = require("./seller");

// The agent's spending limit for the demo
const BUDGET = 1;

// Running total of what the agent has spent
let totalSpent = 0;

// Quote IDs the agent has already paid for
const paidQuotes = new Set();

function checkPayment(quote) {
  // Veto looks up the real price itself
  const listedPrice = seller.priceList[quote.item];

  // Rule 0: unknown item?
  if (listedPrice === undefined) {
    return {
      allowed: false,
      reason: "Unknown item: " + quote.item + " is not on the seller's price list."
    };
  }

  // Rule 1: already paid for this quote?
  if (paidQuotes.has(quote.quoteId)) {
    return {
      allowed: false,
      reason: "Duplicate: quote " + quote.quoteId + " was already paid."
    };
  }

  // Rule 2: price higher than listed?
  if (quote.amount > listedPrice) {
    return {
      allowed: false,
      reason: "Price raised: seller asked " + quote.amount + " NEAR, but the listed price is " + listedPrice + " NEAR."
    };
  }

  // Rule 3: quote expired?
  if (Date.now() > quote.expiresAt) {
    return {
      allowed: false,
      reason: "Expired quote: quote " + quote.quoteId + " is no longer valid."
    };
  }

  // Rule 4: over budget?
  if (totalSpent + quote.amount > BUDGET) {
    return {
      allowed: false,
      reason: "Over budget: this would bring spending to " + (totalSpent + quote.amount) + " NEAR, but the limit is " + BUDGET + " NEAR."
    };
  }

  // All checks passed: record the payment
  totalSpent = totalSpent + quote.amount;
  paidQuotes.add(quote.quoteId);
  return { allowed: true, reason: "Payment passed all checks." };
}

module.exports = { checkPayment };

// Quick test: only runs when you run this file directly
if (require.main === module) {
  function test(label, quote) {
    const result = checkPayment(quote);
    const status = result.allowed ? "ALLOWED" : "BLOCKED";
    console.log(label + " -> " + status + ": " + result.reason);
  }

  const first = seller.honestQuote("wallet-report");
  test("1. Honest quote", first);
  test("2. Charge again", seller.chargeAgain(first));
  test("3. Raised price", seller.raisedPriceQuote("btc-price-data"));
  test("4. Expired quote", seller.expiredQuote("defi-yields"));
  test("5. Honest quote", seller.honestQuote("defi-yields"));
  test("6. Over budget", seller.honestQuote("defi-yields"));
}