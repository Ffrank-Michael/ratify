const { JsonRpcProvider, PublicKey, baseDecode } = require("near-api-js");

// Read-only connection to NEAR testnet (no keys needed)
const provider = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });

// The exact text a seller signs: every field that matters, always in the same order
function quoteMessage(quote) {
  const fields = [quote.quoteId, quote.seller, quote.item, String(quote.amount), quote.currency, String(quote.expiresAt)];
  return new TextEncoder().encode(JSON.stringify(fields));
}

// Does the signature match this exact quote and public key?
function signatureIsValid(quote) {
  try {
    const key = PublicKey.fromString(quote.publicKey);
    return key.verify(quoteMessage(quote), baseDecode(quote.signature));
  } catch (err) {
    return false;
  }
}

// Demo mode: a pretend chain record, so judges can run Ratify without internet or keys
const DEMO = process.env.RATIFY_DEMO === "1";
const demoKeys = new Set();
function registerDemoKey(accountId, publicKey) {
  demoKeys.add(accountId + " " + publicKey);
}

// Keys already confirmed on chain, so we don't ask NEAR every time
const confirmedKeys = new Set();

// Ask the NEAR chain: does this public key really belong to this seller's account?
async function keyBelongsToSeller(sellerId, publicKey) {
  const id = sellerId + " " + publicKey;
  if (DEMO) return demoKeys.has(id) ? { ok: true } : { ok: false, error: "not in demo record" };
  if (confirmedKeys.has(id)) return { ok: true };
  try {
    await provider.viewAccessKey({ accountId: sellerId, publicKey: publicKey });
    confirmedKeys.add(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { quoteMessage, signatureIsValid, keyBelongsToSeller, registerDemoKey };