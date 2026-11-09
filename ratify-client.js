// Ratify client: lets any AI agent pay through a Ratify vault on NEAR.
//
//   const { createRatify } = require("./ratify-client");
//   const ratify = createRatify({ vault: "your-vault.testnet", agentKey: "ed25519:..." });
//   const result = await ratify.pay(quote);   // { status: "PAID", tx } or { status: "BLOCKED", reason }
//
// The agent key must be a key on the vault that can only call `pay`.
const { Account, JsonRpcProvider, KeyPairSigner, teraToGas } = require("near-api-js");
const { quoteMessage } = require("./verify");

const YOCTO_PER_NEAR = 1e24;

function createRatify({ vault, agentKey, rpcUrl }) {
  const provider = new JsonRpcProvider({ url: rpcUrl || "https://test.rpc.fastnear.com" });
  const agent = new Account(vault, provider, KeyPairSigner.fromSecretKey(agentKey));

  // Ask the vault to pay a signed quote. The contract decides.
  async function pay(quote) {
    const message = new TextDecoder().decode(quoteMessage(quote));
    try {
      const result = await agent.callFunctionRaw({
        contractId: vault,
        methodName: "pay",
        args: { message: message, signature: quote.signature },
        gas: teraToGas("50")
      });
      return { status: "PAID", tx: "https://testnet.nearblocks.io/txns/" + result.transaction.hash };
    } catch (err) {
      const text = String(err.message || err);
      const found = text.match(/panicked: ([^"\n]*)/);
      return { status: "BLOCKED", reason: found ? found[1] : text.slice(0, 200) };
    }
  }

  // Read the vault's budget and spending, in NEAR (anyone can read these)
  async function budget() {
    const total = await provider.callFunction({ contractId: vault, method: "get_budget", args: {} });
    const spent = await provider.callFunction({ contractId: vault, method: "get_spent", args: {} });
    return { budget: Number((Number(total) / YOCTO_PER_NEAR).toFixed(4)), spent: Number((Number(spent) / YOCTO_PER_NEAR).toFixed(4)) };
  }

  return { pay, budget };
}

module.exports = { createRatify };