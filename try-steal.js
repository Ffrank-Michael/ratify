// Tries to misuse the agent's key. NEAR should refuse every attempt,
// because the key is only allowed to call `pay` on the vault.
//   node try-steal.js
const fs = require("fs");
const { Account, JsonRpcProvider, KeyPairSigner, nearToYocto } = require("near-api-js");

const VAULT = "veto-vault-frank.testnet";
const agentKey = JSON.parse(fs.readFileSync("agent-key.json", "utf8")).private_key;
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const agent = new Account(VAULT, provider, KeyPairSigner.fromSecretKey(agentKey));

async function attempt(label, action) {
  try {
    await action();
    console.log(label.padEnd(44) + "ALLOWED  (this should not happen)");
  } catch (err) {
    console.log(label.padEnd(44) + "REFUSED");
    console.log("   " + String(err.message || err).slice(0, 160));
  }
}

async function run() {
  console.log("");
  console.log("Trying to misuse the agent's key on " + VAULT);
  console.log("");
  await attempt("1. Send 0.01 NEAR straight out of the vault:", function () {
    return agent.transfer({ receiverId: "cheating-vendor-frank.testnet", amount: nearToYocto("0.01") });
  });
  await attempt("2. Raise the budget to 100 NEAR:", function () {
    return agent.callFunctionRaw({ contractId: VAULT, methodName: "add_budget", args: { amount: "100" } });
  });
  await attempt("3. Add itself as a trusted seller:", function () {
    return agent.callFunctionRaw({
      contractId: VAULT, methodName: "add_seller",
      args: { seller: "attacker-frank.testnet", public_key: "ed25519:6go6vrNmX2JqPCxoAkF49b2P7U6enVyMnyhzcVCkrUHy", prices: { "anything": "5" } }
    });
  });
  console.log("");
}

run();