// The scripted agent, paying through the Veto CONTRACT on NEAR testnet.
// The agent's key can only call `pay` on the vault. The contract checks every rule on chain.
//   node contract-agent.js
const fs = require("fs");
const { Account, JsonRpcProvider, KeyPairSigner, teraToGas } = require("near-api-js");
const seller = require("./seller");
const { quoteMessage } = require("./verify");

const VAULT = "veto-vault-frank.testnet";
const agentKey = JSON.parse(fs.readFileSync("agent-key.json", "utf8")).private_key;
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const agent = new Account(VAULT, provider, KeyPairSigner.fromSecretKey(agentKey));

// Ask the contract to pay one quote. Returns "PAID" with a link, or "BLOCKED" with the contract's reason.
async function payOnChain(quote) {
  const message = new TextDecoder().decode(quoteMessage(quote));
  try {
    const result = await agent.callFunctionRaw({
      contractId: VAULT,
      methodName: "pay",
      args: { message: message, signature: quote.signature },
      gas: teraToGas("50")
    });
    return { status: "PAID", detail: "https://testnet.nearblocks.io/txns/" + result.transaction.hash };
  } catch (err) {
    const text = String(err.message || err);
    const reason = text.match(/panicked: ([^"\n]*)/);
    return { status: "BLOCKED", detail: reason ? reason[1] : text.slice(0, 200) };
  }
}

async function show(label, quote) {
  const r = await payOnChain(quote);
  console.log(label.padEnd(34) + r.status);
  console.log("   " + r.detail);
}

async function run() {
  console.log("");
  console.log("Paying through the Veto contract on NEAR testnet (" + VAULT + ")");
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
  await show("Purchase past the budget:", seller.honestQuote("defi-yields"));
  console.log("");
}

module.exports = { payOnChain }; if (require.main === module) run();