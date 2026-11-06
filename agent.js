const seller = require("./seller");

const VETO_URL = "http://localhost:3000/pay";

// The agent asks Veto to pay a quote
async function askVetoToPay(quote) {
  const res = await fetch(VETO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quote)
  });
  return res.json();
}

function show(entry) {
  console.log("   Veto: " + entry.status + " - " + (entry.tx || entry.reason));
  console.log("");
}

async function shop() {
  console.log("Agent: I'll buy a wallet report.");
  const first = seller.honestQuote("wallet-report");
  show(await askVetoToPay(first));

  console.log("Seller: Payment not received, please pay again.");
  console.log("Agent: Okay, paying again.");
  show(await askVetoToPay(seller.chargeAgain(first)));

  console.log("Agent: Now I'll buy BTC price data.");
  console.log("Seller: Price went up, it's 0.25 NEAR now.");
  show(await askVetoToPay(seller.raisedPriceQuote("btc-price-data")));

  console.log("Agent: I'll buy DeFi yield data.");
  console.log("Seller: Here's your quote. (It already expired.)");
  show(await askVetoToPay(seller.expiredQuote("defi-yields")));

  console.log("Agent: Let me ask for a fresh DeFi yield quote.");
  show(await askVetoToPay(seller.honestQuote("defi-yields")));

  console.log("Agent: Buying BTC price data.");
  console.log("(Someone changes the amount to 0.5 after the seller signed it.)");
  show(await askVetoToPay(seller.tamperedQuote("btc-price-data")));

  console.log("Agent: Buying BTC price data again.");
  console.log("(Someone swaps the seller for their own account.)");
  show(await askVetoToPay(seller.redirectedQuote("btc-price-data")));

  console.log("Agent: Buying BTC price data once more.");
  console.log("(A fake quote, signed with a key that isn't the seller's.)");
  show(await askVetoToPay(seller.forgedQuote("btc-price-data")));

  console.log("Agent: One more DeFi yield report, please.");
  show(await askVetoToPay(seller.honestQuote("defi-yields")));
}

shop();
