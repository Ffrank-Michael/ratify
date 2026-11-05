const fs = require("fs");
const seller = require("./seller");
const { checkPayment, recordPaid } = require("./guard");
const { sendPayment } = require("./pay");

const RECORD_FILE = "records.json";

// Add one entry to the payment record file
function saveRecord(entry) {
  let records = [];
  if (fs.existsSync(RECORD_FILE)) {
    records = JSON.parse(fs.readFileSync(RECORD_FILE, "utf8"));
  }
  records.push(entry);
  fs.writeFileSync(RECORD_FILE, JSON.stringify(records, null, 2));
}

async function vetoPay(label, quote) {
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
    console.log(label + " -> BLOCKED: " + decision.reason);
    return;
  }

  try {
    const hash = await sendPayment(quote.seller, quote.amount);
    recordPaid(quote);
    entry.status = "PAID";
    entry.tx = "https://testnet.nearblocks.io/txns/" + hash;
    saveRecord(entry);
    console.log(label + " -> PAID " + quote.amount + " NEAR: " + entry.tx);
  } catch (err) {
    entry.status = "FAILED";
    entry.reason = "Payment failed on NEAR: " + err.message;
    saveRecord(entry);
    console.log(label + " -> FAILED: " + err.message);
  }
}

async function runDemo() {
  const first = seller.honestQuote("wallet-report");
  await vetoPay("1. Honest quote", first);
  await vetoPay("2. Charge again", seller.chargeAgain(first));
  await vetoPay("3. Raised price", seller.raisedPriceQuote("btc-price-data"));
  await vetoPay("4. Expired quote", seller.expiredQuote("defi-yields"));
  await vetoPay("5. Honest quote", seller.honestQuote("defi-yields"));
  await vetoPay("6. Over budget", seller.honestQuote("defi-yields"));
}

runDemo();