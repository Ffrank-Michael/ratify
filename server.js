const express = require("express");
const { vetoPay, loadRecords } = require("./veto");

const app = express();
app.use(express.json());

// The agent sends a quote here and asks Veto to pay it
app.post("/pay", async function (req, res) {
  const entry = await vetoPay(req.body);
  res.json(entry);
});

// Anyone can see the full payment record
app.get("/records", function (req, res) {
  res.json(loadRecords());
});

app.listen(3000, function () {
  console.log("Veto is running at http://localhost:3000");
});