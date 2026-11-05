const seller = require("./seller");
const { checkPayment } = require("./guard");
const { sendPayment } = require("./pay");

async function vetoPay(label, quote) {
  const decision = checkPayment(quote);

  if (!decision.allowed) {
    console.log(label + " -> BLOCKED: " + decision.reason);
    return;
  }

  const hash = await sendPayment(quote.seller, quote.amount);
  console.log(label + " -> PAID " + quote.amount + " NEAR: https://testnet.nearblocks.io/txns/" + hash);
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