// Makes a new key for the agent and saves it to agent-key.json (kept off GitHub).
// The owner then gives this key permission to call only `pay` on the vault.
const fs = require("fs");
const { KeyPair } = require("near-api-js");

if (fs.existsSync("agent-key.json")) {
  const saved = JSON.parse(fs.readFileSync("agent-key.json", "utf8"));
  console.log("An agent key already exists. Its public key is:");
  console.log(saved.public_key);
  process.exit(0);
}

const key = KeyPair.fromRandom("ed25519");
fs.writeFileSync("agent-key.json", JSON.stringify({
  public_key: key.getPublicKey().toString(),
  private_key: key.toString()
}, null, 2));

console.log("New agent key saved to agent-key.json. Its public key is:");
console.log(key.getPublicKey().toString());