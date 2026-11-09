const fs = require("fs");
const path = require("path");
const os = require("os");
const { Account, JsonRpcProvider, KeyPairSigner, nearToYocto, actions, baseEncode } = require("near-api-js");

const WALLET = require("./policy.json").wallet;
const DEMO = process.env.RATIFY_DEMO === "1";

let provider, signer, wallet;
if (!DEMO) {
  // Read Ratify's wallet key from the file the NEAR tool saved
  const keyFile = path.join(os.homedir(), ".near-credentials", "testnet", WALLET + ".json");
  const privateKey = JSON.parse(fs.readFileSync(keyFile, "utf8")).private_key;

  // Connect to NEAR testnet
  provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
  signer = KeyPairSigner.fromSecretKey(privateKey);
  wallet = new Account(WALLET, provider, signer);
}

// Add up the network fee burned by a transaction (converted to NEAR)
function networkFee(result) {
  let burnt = BigInt(result.transaction_outcome?.outcome?.tokens_burnt || 0);
  for (const receipt of result.receipts_outcome || []) {
    burnt += BigInt(receipt.outcome?.tokens_burnt || 0);
  }
  return Number(burnt) / 1e24;
}

// Step 1: sign the payment. Nothing is sent yet, but we already know its transaction ID.
async function signPayment(receiverId, amountNear) {
  if (DEMO) {
    // Demo mode: no real money, a made-up transaction ID
    return { hash: "demo-" + Date.now() + "-" + Math.floor(Math.random() * 1000), demo: true };
  }
  const tx = await wallet.createTransaction({
    receiverId: receiverId,
    actions: [actions.transfer(nearToYocto(String(amountNear)))],
    publicKey: await signer.getPublicKey()
  });
  const signed = await signer.signTransaction(tx);
  return { hash: baseEncode(signed.txHash), signedTransaction: signed.signedTransaction };
}

// Turn a NEAR result into PAID or FAILED
function readResult(result) {
  if (result.status && result.status.Failure) {
    return { status: "FAILED", fee: networkFee(result), error: "NEAR rejected the transfer" };
  }
  return { status: "PAID", fee: networkFee(result) };
}

// Step 2: send the signed payment.
// Sending the SAME signed payment again can never pay twice, because NEAR only accepts it once.
async function sendSigned(signed) {
  if (DEMO) return { status: "PAID", fee: 0 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (process.env.SIMULATE_DROP === "1" && attempt === 1) {
        // Test mode: really send it, then pretend the connection dropped
        await provider.sendTransactionUntil(signed.signedTransaction, "FINAL");
        throw new Error("Simulated connection drop after sending");
      }
      const result = await provider.sendTransactionUntil(signed.signedTransaction, "FINAL");
      return readResult(result);
    } catch (err) {
      console.log("Send attempt " + attempt + " had a problem: " + err.message);
    }
  }
  return checkStatus(signed.hash);
}

// Step 3: if sending kept failing, ask NEAR directly what happened to this transaction ID
async function checkStatus(hash) {
  try {
    const result = await provider.viewTransactionStatus({ txHash: hash, accountId: WALLET, waitUntil: "FINAL" });
    return readResult(result);
  } catch (err) {
    return { status: "PENDING", fee: 0, error: "Could not confirm with NEAR yet: " + err.message };
  }
}

module.exports = { signPayment, sendSigned, checkStatus };