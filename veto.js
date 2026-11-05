const fs = require("fs");
const seller = require("./seller");
const { checkPayment, recordPaid } = require("./guard");
const { sendPayment } = require("./pay");

const RECORD_FILE = "records.json";

function loadRecords() {
  if (!fs.existsSync(RECORD_FILE)) return [];
  return JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
}

function saveRecord(entry) {
  const records = loadRecords();
  records.push(entry);
  fs.writeFileSync(RECORD_FILE, JSON.stringify(records, null, 2));
}

async function vetoPay(quote) {
  const decision = checkPayment(quote);
  const entry = {
    time: new Date().toISOString(),
    quoteId: quote.quoteId,
    seller: quote.seller,
    item: quote.item,
    amount: quote.amount,
    status: "",
    reason: decision.reason,
    tx: null
  };

  if (!decision.allowed) {
    entry.status = "BLOCKED";
    saveRecord(entry);
    return entry;
  }

  try {
    const hash = await sendPayment(quote.seller, quote.amount);
    recordPaid(quote);
    entry.status = "PAID";
    entry.tx = "https://testnet.nearblocks.io/txns/" + hash;
  } catch (err) {
    entry.status = "FAILED";
    entry.reason = "Payment failed on NEAR: " + err.message;
  }
  saveRecord(entry);
  return entry;
}

module.exports = { vetoPay, loadRecords };

// Quick test: only runs when you run this file directly
if (require.main === module) {
  async function runDemo() {
    const first = seller.honestQuote("wallet-report");
    const tests = [
      ["1. Honest quote", first],
      ["2. Charge again", seller.chargeAgain(first)],
      ["3. Raised price", seller.raisedPriceQuote("btc-price-data")],
      ["4. Expired quote", seller.expiredQuote("defi-yields")],
      ["5. Honest quote", seller.honestQuote("defi-yields")],
      ["6. Over budget", seller.honestQuote("defi-yields")]
    ];
    for (const [label, quote] of tests) {
      const entry = await vetoPay(quote);
      console.log(label + " -> " + entry.status + ": " + (entry.tx || entry.reason));
    }
  }
  runDemo();
}