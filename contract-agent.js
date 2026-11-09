// The scripted agent, paying through the Ratify CONTRACT on NEAR testnet, using ratify-client.js.
// The agent's key can only call `pay` on the vault. The contract checks every rule on chain.
//   node contract-agent.js
const fs = require("fs");
const seller = require("./seller");
const { createRatify } = require("./ratify-client");

const ratify = createRatify({
  vault: "ratify-vault-frank.testnet",
  agentKey: JSON.parse(fs.readFileSync("agent-key.json", "utf8")).private_key
});

// Used by ai-agent.js: same answer, as { status, detail }
async function payOnChain(quote) {
  const r = await ratify.pay(quote);
  return { status: r.status, detail: r.tx || r.reason };
}

async function show(label, quote) {
  const r = await ratify.pay(quote);
  console.log(label.padEnd(34) + r.status);
  console.log("   " + (r.tx || r.reason));
}

async function run() {
  console.log("");
  console.log("Paying through the Ratify contract on NEAR testnet (ratify-vault-frank.testnet)");
  const before = await ratify.budget();
  console.log("Budget: " + before.budget + " NEAR, already spent: " + before.spent + " NEAR");
  console.log("");
  const first = seller.honestQuote("wallet-report");
  await show("Honest purchase:", first);
  await show("Seller asks to be paid again:", seller.chargeAgain(first));
  await show("Seller raises the price:", seller.raisedPriceQuote("btc-price-data"));
  await show("Expired quote:", seller.expiredQuote("defi-yields"));
  await show("Honest purchase:", seller.honestQuote("defi-yields"));
  await show("Amount changed after signing:", seller.tamperedQuote("btc-price-data"));
  await show("Payment redirected to attacker:", seller.redirectedQuote("btc-price-data"));
  await show("Forged quote with a fake key:", seller.forgedQuote("btc-price-data"));
  console.log("");
  const after = await ratify.budget();
  console.log("Spent now: " + after.spent + " NEAR of " + after.budget + " NEAR");
  console.log("");
}

module.exports = { payOnChain };
if (require.main === module) run();