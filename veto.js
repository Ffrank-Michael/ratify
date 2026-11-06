const fs = require("fs");
const { checkPayment, reserve, release, addFee, loadHistory } = require("./guard");
const { signPayment, sendSigned } = require("./pay");

const RECORD_FILE = process.env.VETO_DEMO === "1" ? "records-demo.json" : "records.json";

function loadRecords() {
  if (!fs.existsSync(RECORD_FILE)) return [];
  return JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
}

// Add a new entry, or update it if it is already in the record
function saveRecord(entry) {
  const records = loadRecords();
  const index = records.findIndex(function (r) { return r.id === entry.id; });
  if (index === -1) records.push(entry);
  else records[index] = entry;
  fs.writeFileSync(RECORD_FILE, JSON.stringify(records, null, 2));
}

// Rebuild Veto's memory from past payments when it starts
loadHistory(loadRecords());

let entryCounter = 0;

async function handlePayment(quote) {
  const decision = await checkPayment(quote);
  entryCounter = entryCounter + 1;
  const entry = {
    id: Date.now() + "-" + entryCounter,
    time: new Date().toISOString(),
    quoteId: quote.quoteId,
    seller: quote.seller,
    item: quote.item,
    amount: quote.amount,
    fee: 0,
    status: "",
    reason: decision.reason,
    tx: null
  };

  if (!decision.allowed) {
    entry.status = "BLOCKED";
    saveRecord(entry);
    return entry;
  }

  // Sign first, so we know the transaction ID before anything is sent
  let signed;
  try {
    signed = await signPayment(quote.seller, quote.amount);
  } catch (err) {
    // Nothing was signed or sent, so no money could have moved
    entry.status = "FAILED";
    entry.reason = "Could not prepare the payment, nothing was sent: " + err.message;
    saveRecord(entry);
    return entry;
  }

  // Lock the quote and hold the money, then save as PENDING before sending
  reserve(quote);
  entry.status = "PENDING";
  entry.reason = "Payment sent, waiting for NEAR to confirm.";
  entry.tx = signed.demo ? "demo payment, no real money moved" : "https://testnet.nearblocks.io/txns/" + signed.hash;
  saveRecord(entry);

  const outcome = await sendSigned(signed);
  entry.status = outcome.status;
  entry.fee = outcome.fee;
  addFee(outcome.fee);

  if (outcome.status === "PAID") {
    entry.reason = "Payment passed all checks.";
  } else if (outcome.status === "FAILED") {
    release(quote);
    entry.reason = "Payment failed on NEAR: " + outcome.error;
  } else {
    entry.reason = "Payment not confirmed yet. This quote stays locked so it cannot be paid twice. " + outcome.error;
  }
  saveRecord(entry);
  return entry;
}

// Only one payment is handled at a time, so two requests can't both slip under the budget
let queue = Promise.resolve();
function vetoPay(quote) {
  const run = queue.then(function () { return handlePayment(quote); });
  queue = run.catch(function () {});
  return run;
}

module.exports = { vetoPay, loadRecords };