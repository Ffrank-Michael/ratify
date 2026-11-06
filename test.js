// Automatic checks for every Veto rule. No wallet keys, internet or real money needed.
process.env.VETO_DEMO = "1";
require("fs").rmSync("records-demo.json", { force: true });

const test = require("node:test");
const assert = require("node:assert");
const seller = require("./seller");
const { vetoPay } = require("./veto");

let first;

test("an honest quote is paid", async () => {
  first = seller.honestQuote("wallet-report");
  const entry = await vetoPay(first);
  assert.strictEqual(entry.status, "PAID");
});

test("paying the same quote twice is blocked", async () => {
  const entry = await vetoPay(seller.chargeAgain(first));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Duplicate/);
});

test("a price above the seller's list is blocked", async () => {
  const entry = await vetoPay(seller.raisedPriceQuote("btc-price-data"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Price raised/);
});

test("an expired quote is blocked", async () => {
  const entry = await vetoPay(seller.expiredQuote("defi-yields"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Expired/);
});

test("changing the amount after signing is blocked", async () => {
  const entry = await vetoPay(seller.tamperedQuote("btc-price-data"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /signature/);
});

test("redirecting payment to another account is blocked", async () => {
  const entry = await vetoPay(seller.redirectedQuote("btc-price-data"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Unknown seller/);
});

test("a quote signed with a key that isn't the seller's is blocked", async () => {
  const entry = await vetoPay(seller.forgedQuote("btc-price-data"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Forged/);
});

test("buying the same item again with a new quote is allowed", async () => {
  const entry = await vetoPay(seller.honestQuote("wallet-report"));
  assert.strictEqual(entry.status, "PAID");
});

test("a payment past the budget is blocked", async () => {
  const entry = await vetoPay(seller.honestQuote("defi-yields"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Over budget/);
});

test("two payments sent at the same moment cannot both pass the budget", async () => {
  // About 0.4 NEAR of budget is left, so only one more 0.2 payment fits (room is kept for fees)
  const results = await Promise.all([
    vetoPay(seller.honestQuote("btc-price-data")),
    vetoPay(seller.honestQuote("btc-price-data")),
    vetoPay(seller.honestQuote("btc-price-data"))
  ]);
  const paid = results.filter(function (e) { return e.status === "PAID"; }).length;
  assert.strictEqual(paid, 1);
});
test("a seller name that only looks like the trusted one is blocked", async () => {
  const entry = await vetoPay(seller.lookalikeQuote("btc-price-data"));
  assert.strictEqual(entry.status, "BLOCKED");
  assert.match(entry.reason, /Unknown seller/);
});
