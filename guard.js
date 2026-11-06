const { signatureIsValid, keyBelongsToSeller } = require("./verify");

// The owner's rules: trusted sellers, their agreed prices, the budget
const policy = require("./policy.json");

// The agent's spending limit (seller payments plus network fees)
const BUDGET = policy.budget;

// Room kept for the network fee, which is only known after paying
const FEE_ALLOWANCE = policy.feeAllowance;

// What has left the wallet, plus payments still waiting for confirmation
let totalSpent = 0;

// Quote IDs that are paid or still pending
const usedQuotes = new Set();

async function checkPayment(quote) {
  // Rule A: is this a seller the owner trusts?
  const sellerRules = policy.sellers[quote.seller];
  if (!sellerRules) {
    return { allowed: false, reason: "Unknown seller: " + quote.seller + " is not on the owner's trusted list." };
  }

  // Rule B: was the quote changed after the seller signed it?
  if (!signatureIsValid(quote)) {
    return { allowed: false, reason: "Changed or unsigned quote: the signature does not match these details." };
  }

  // Rule C: does the signing key really belong to the seller, according to NEAR?
  const keyCheck = await keyBelongsToSeller(quote.seller, quote.publicKey);
  if (!keyCheck.ok) {
    return { allowed: false, reason: "Forged quote: NEAR could not confirm this key belongs to " + quote.seller + "." };
  }

  // Veto looks up the agreed price itself, from the owner's policy
  const listedPrice = sellerRules.prices[quote.item];

  // Rule 0: unknown item?
  if (listedPrice === undefined) {
    return { allowed: false, reason: "Unknown item: " + quote.item + " is not on the price list for " + quote.seller + "." };
  }

  // Rule 1: already paid, or a payment for it still waiting?
  if (usedQuotes.has(quote.quoteId)) {
    return { allowed: false, reason: "Duplicate: quote " + quote.quoteId + " was already paid or is still pending." };
  }

  // Rule 2: price higher than listed?
  if (quote.amount > listedPrice) {
    return { allowed: false, reason: "Price raised: seller asked " + quote.amount + " NEAR, but the listed price is " + listedPrice + " NEAR." };
  }

  // Rule 3: quote expired?
  if (Date.now() > quote.expiresAt) {
    return { allowed: false, reason: "Expired quote: quote " + quote.quoteId + " is no longer valid." };
  }

  // Rule 4: over budget? (including room for the network fee)
  const after = totalSpent + quote.amount + FEE_ALLOWANCE;
  if (after > BUDGET) {
    return { allowed: false, reason: "Over budget: this would bring spending to about " + after.toFixed(3) + " NEAR including fees, but the limit is " + BUDGET + " NEAR." };
  }

  return { allowed: true, reason: "Payment passed all checks." };
}

// Called before sending: hold the money and lock the quote
function reserve(quote) {
  totalSpent = totalSpent + quote.amount;
  usedQuotes.add(quote.quoteId);
}

// Called when we know for sure no money moved
function release(quote) {
  totalSpent = totalSpent - quote.amount;
  usedQuotes.delete(quote.quoteId);
}

// Called when the network fee is known
function addFee(fee) {
  totalSpent = totalSpent + fee;
}

// On startup, rebuild memory from the saved payment record
function loadHistory(records) {
  for (const record of records) {
    if (record.status === "PAID" || record.status === "PENDING") {
      totalSpent = totalSpent + record.amount + (record.fee || 0);
      usedQuotes.add(record.quoteId);
    }
  }
}

// Forget everything (used between test runs)
function resetMemory() {
  totalSpent = 0;
  usedQuotes.clear();
}

module.exports = { checkPayment, reserve, release, addFee, loadHistory, resetMemory };