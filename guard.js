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
    return { allowed: false, reason: "Unknown item: " + quote.item + " is not on the seller's price list." };
  }

  // Rule 1: already paid for this quote?
  if (paidQuotes.has(quote.quoteId)) {
    return { allowed: false, reason: "Duplicate: quote " + quote.quoteId + " was already paid." };
  }

  // Rule 2: price higher than listed?
  if (quote.amount > listedPrice) {
    return { allowed: false, reason: "Price raised: seller asked " + quote.amount + " NEAR, but the listed price is " + listedPrice + " NEAR." };
  }

  // Rule 3: quote expired?
  if (Date.now() > quote.expiresAt) {
    return { allowed: false, reason: "Expired quote: quote " + quote.quoteId + " is no longer valid." };
  }

  // Rule 4: over budget?
  if (totalSpent + quote.amount > BUDGET) {
    return { allowed: false, reason: "Over budget: this would bring spending to " + (totalSpent + quote.amount) + " NEAR, but the limit is " + BUDGET + " NEAR." };
  }

  return { allowed: true, reason: "Payment passed all checks." };
}

// Only called after the NEAR payment actually goes through
function recordPaid(quote) {
  totalSpent = totalSpent + quote.amount;
  paidQuotes.add(quote.quoteId);
}

module.exports = { checkPayment, recordPaid };