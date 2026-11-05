// The agent's spending limit for the demo
const BUDGET = 10;

// Running total of what the agent has spent
let totalSpent = 0;

// Quote IDs the agent has already paid for
const paidQuotes = new Set();

function checkPayment(payment) {
  // Rule 1: already paid for this quote?
  if (paidQuotes.has(payment.quoteId)) {
    return {
      allowed: false,
      reason: "Duplicate: quote " + payment.quoteId + " was already paid."
    };
  }

  // Rule 2: price higher than listed?
  if (payment.amount > payment.listedPrice) {
    return {
      allowed: false,
      reason: "Price raised: seller asked " + payment.amount + " NEAR, but the listed price is " + payment.listedPrice + " NEAR."
    };
  }

  // Rule 3: quote expired?
  if (Date.now() > payment.expiresAt) {
    return {
      allowed: false,
      reason: "Expired quote: quote " + payment.quoteId + " is no longer valid."
    };
  }

  // Rule 4: over budget?
  if (totalSpent + payment.amount > BUDGET) {
    return {
      allowed: false,
      reason: "Over budget: this would bring spending to " + (totalSpent + payment.amount) + " NEAR, but the limit is " + BUDGET + " NEAR."
    };
  }

  // All checks passed: record the payment
  totalSpent = totalSpent + payment.amount;
  paidQuotes.add(payment.quoteId);
  return { allowed: true, reason: "Payment passed all checks." };
}

// Helper to make test results easy to read
function test(label, payment) {
  const result = checkPayment(payment);
  const status = result.allowed ? "ALLOWED" : "BLOCKED";
  console.log(label + " -> " + status + ": " + result.reason);
}

// Times for the tests
const inFiveMinutes = Date.now() + 5 * 60 * 1000;
const oneMinuteAgo = Date.now() - 60 * 1000;

// Quick tests
test("1. Normal payment", { seller: "data-shop.testnet", quoteId: "q1", listedPrice: 3, amount: 3, expiresAt: inFiveMinutes });
test("2. Same quote again", { seller: "data-shop.testnet", quoteId: "q1", listedPrice: 3, amount: 3, expiresAt: inFiveMinutes });
test("3. Raised price", { seller: "data-shop.testnet", quoteId: "q2", listedPrice: 2, amount: 2.5, expiresAt: inFiveMinutes });
test("4. Expired quote", { seller: "data-shop.testnet", quoteId: "q3", listedPrice: 2, amount: 2, expiresAt: oneMinuteAgo });
test("5. Over budget", { seller: "data-shop.testnet", quoteId: "q4", listedPrice: 8, amount: 8, expiresAt: inFiveMinutes });
test("6. Normal payment", { seller: "data-shop.testnet", quoteId: "q5", listedPrice: 4, amount: 4, expiresAt: inFiveMinutes });