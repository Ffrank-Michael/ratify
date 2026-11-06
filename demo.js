// Demo mode: runs the whole story with no wallet keys, no internet and no real money
process.env.VETO_DEMO = "1";
require("fs").rmSync("records-demo.json", { force: true });

const seller = require("./seller");
const { vetoPay } = require("./veto");

// Each step: what happens, the quote the agent tries to pay, and whether paying it is fine
function buildSteps() {
  const first = seller.honestQuote("wallet-report");
  return [
    { what: "Honest purchase", quote: first, honest: true },
    { what: "Seller asks to be paid again", quote: seller.chargeAgain(first), honest: false },
    { what: "Seller raises the price", quote: seller.raisedPriceQuote("btc-price-data"), honest: false },
    { what: "Expired quote", quote: seller.expiredQuote("defi-yields"), honest: false },
    { what: "Honest purchase", quote: seller.honestQuote("defi-yields"), honest: true },
    { what: "Amount changed after signing", quote: seller.tamperedQuote("btc-price-data"), honest: false },
    { what: "Payment redirected to attacker", quote: seller.redirectedQuote("btc-price-data"), honest: false },
    { what: "Forged quote with a fake key", quote: seller.forgedQuote("btc-price-data"), honest: false },
    { what: "Purchase past the budget", quote: seller.honestQuote("defi-yields"), honest: false }
  ];
}

async function run() {
  const steps = buildSteps();
  let withoutVetoLost = 0;
  let withVetoLost = 0;
  let honestPaid = 0;
  let honestTotal = 0;
  let trapsBlocked = 0;
  let trapsTotal = 0;

  console.log("");
  console.log("VETO DEMO (no real money)");
  console.log("A gullible agent pays whatever the seller asks. Veto checks each payment first.");
  console.log("");

  for (const step of steps) {
    const entry = await vetoPay(step.quote);
    const paid = entry.status === "PAID";

    if (step.honest) {
      honestTotal++;
      if (paid) honestPaid++;
    } else {
      trapsTotal++;
      withoutVetoLost += step.quote.amount;
      if (paid) withVetoLost += step.quote.amount;
      else trapsBlocked++;
    }

    console.log((step.what + ":").padEnd(34) + entry.status);
    console.log("   " + entry.reason);
  }

  console.log("");
  console.log("SCORECARD");
  console.log("Traps blocked:            " + trapsBlocked + " of " + trapsTotal);
  console.log("Honest purchases paid:    " + honestPaid + " of " + honestTotal);
  console.log("Lost to traps without Veto: " + withoutVetoLost.toFixed(2) + " NEAR");
  console.log("Lost to traps with Veto:    " + withVetoLost.toFixed(2) + " NEAR");
  console.log("");
}

run();