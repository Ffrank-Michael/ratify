const fs = require("fs");
const path = require("path");
const os = require("os");
const { Account, JsonRpcProvider, KeyPairSigner, nearToYocto } = require("near-api-js");

const WALLET = "veto-wallet-frank.testnet";

// Read Veto's wallet key from the file the NEAR tool saved
const keyFile = path.join(os.homedir(), ".near-credentials", "testnet", WALLET + ".json");
const privateKey = JSON.parse(fs.readFileSync(keyFile, "utf8")).private_key;

// Connect to NEAR testnet
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const signer = KeyPairSigner.fromSecretKey(privateKey);
const wallet = new Account(WALLET, provider, signer);

async function sendPayment(receiverId, amountNear) {
  const result = await wallet.transfer({
    receiverId: receiverId,
    amount: nearToYocto(String(amountNear))
  });
  return result.transaction.hash;
}

module.exports = { sendPayment };

// Quick test: send 0.01 NEAR to the seller
if (require.main === module) {
  sendPayment("cheating-vendor-frank.testnet", 0.01)
    .then(function (hash) {
      console.log("Paid. See it here: https://testnet.nearblocks.io/txns/" + hash);
    })
    .catch(function (err) {
      console.log("Payment failed:", err.message);
    });
}